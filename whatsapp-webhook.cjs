// ==========================================================================
// WHATSAPP MODULE — WEBHOOK HANDLER
// ==========================================================================
// Processa webhooks da API oficial da Meta (WhatsApp Cloud API).
//
// Endpoints:
//   GET  /webhooks/whatsapp  → Verificação do webhook (Meta envia challenge)
//   POST /webhooks/whatsapp  → Recepção de eventos (mensagens, status, etc.)
//
// Segurança:
//   - Verifica X-Hub-Signature-256 usando o App Secret
//   - Idempotente: verifica wamid/event_id antes de processar
//   - Responde 200 rapidamente, processa de forma assíncrona
// ==========================================================================
'use strict';

const crypto = require('crypto');

// ==========================================================================
// VERIFICAÇÃO DO WEBHOOK (GET)
// ==========================================================================
// Meta envia um GET com hub.mode=subscribe, hub.verify_token e hub.challenge.
// Temos que responder com o challenge se o verify_token bate.

function handleVerification(req, res, verifyToken) {
  const url = req.url || '';
  const qs = url.indexOf('?') >= 0 ? url.slice(url.indexOf('?') + 1) : '';
  const params = {};
  qs.split('&').forEach(p => {
    const [k, v] = p.split('=');
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });

  const mode = params['hub.mode'];
  const token = params['hub.verify_token'];
  const challenge = params['hub.challenge'];

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[WhatsApp Webhook] Verificação bem-sucedida.');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(challenge);
    return true;
  }

  console.warn('[WhatsApp Webhook] Verificação FALHOU. Token recebido:', token);
  res.writeHead(403, { 'Content-Type': 'text/plain' });
  res.end('Forbidden');
  return false;
}

// ==========================================================================
// VALIDAÇÃO DA ASSINATURA (X-Hub-Signature-256)
// ==========================================================================
function validateSignature(rawBody, signature, appSecret) {
  if (!appSecret) {
    console.warn('[WhatsApp Webhook] APP_SECRET não configurado — assinatura não verificada.');
    return true; // Em dev/teste, permite sem assinatura
  }
  if (!signature) return false;

  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch (e) {
    return signature === expected;
  }
}

// ==========================================================================
// PROCESSAMENTO DO EVENTO (POST)
// ==========================================================================
/**
 * Processa um evento do webhook do WhatsApp
 * @param {object} body - Corpo JSON do evento
 * @param {object} db - Instância do whatsapp-db.cjs
 * @param {object} api - Instância do whatsapp-api.cjs
 * @param {function} notifyClients - Callback para notificar clientes SSE
 */
async function processEvent(body, db, api, notifyClients) {
  if (!body || !body.entry) return;

  for (const entry of body.entry) {
    if (!entry.changes) continue;

    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;
      const value = change.value;
      if (!value) continue;

      const phoneNumberId = value.metadata && value.metadata.phone_number_id;
      const displayPhone = value.metadata && value.metadata.display_phone_number;

      // Processa STATUS de mensagens (sent, delivered, read, failed)
      if (value.statuses && Array.isArray(value.statuses)) {
        for (const status of value.statuses) {
          await processStatusUpdate(status, phoneNumberId, db, notifyClients);
        }
      }

      // Processa MENSAGENS recebidas
      if (value.messages && Array.isArray(value.messages)) {
        for (const msg of value.messages) {
          await processIncomingMessage(msg, value.contacts, phoneNumberId, displayPhone, db, api, notifyClients);
        }
      }
    }
  }
}

// ==========================================================================
// PROCESSA ATUALIZAÇÃO DE STATUS DE MENSAGEM
// ==========================================================================
async function processStatusUpdate(status, phoneNumberId, db, notifyClients) {
  try {
    const wamid = status.id;
    if (!wamid) return;

    // Idempotência: verifica se já processou este evento
    const eventId = 'status_' + wamid + '_' + status.status;
    if (db.webhookEvents.exists(eventId)) return;
    db.webhookEvents.create(eventId, 'status_update', JSON.stringify(status));

    // Mapeia status da Meta para o nosso sistema
    const statusMap = {
      'sent': 'sent',
      'delivered': 'delivered',
      'read': 'read',
      'failed': 'failed'
    };
    const newStatus = statusMap[status.status] || status.status;

    // Atualiza o status da mensagem no banco
    const existingMsg = db.messages.getByWamid(wamid);
    if (existingMsg) {
      const errorCode = (status.errors && status.errors[0] && status.errors[0].code) || '';
      const errorMsg = (status.errors && status.errors[0] && status.errors[0].title) || '';
      db.messages.updateStatus(wamid, newStatus, String(errorCode), errorMsg);

      // Notifica clientes SSE
      if (notifyClients) {
        notifyClients({
          type: 'message_status',
          conversation_id: existingMsg.conversation_id,
          message_id: existingMsg.id,
          wamid: wamid,
          status: newStatus,
          error_code: String(errorCode),
          error_message: errorMsg
        });
      }
    }

    db.webhookEvents.markProcessed(eventId);
  } catch (e) {
    console.error('[WhatsApp Webhook] Erro ao processar status:', e.message);
  }
}

// ==========================================================================
// PROCESSA MENSAGEM RECEBIDA
// ==========================================================================
async function processIncomingMessage(msg, contacts, phoneNumberId, displayPhone, db, api, notifyClients) {
  try {
    const wamid = msg.id;
    if (!wamid) return;

    // Idempotência: verifica se já processou esta mensagem
    const eventId = 'msg_' + wamid;
    if (db.webhookEvents.exists(eventId)) return;
    db.webhookEvents.create(eventId, 'incoming_message', JSON.stringify(msg));

    // Obtém informações do remetente
    const senderPhone = msg.from;
    const contactInfo = contacts && contacts.find(c => c.wa_id === senderPhone);
    const profileName = contactInfo && contactInfo.profile && contactInfo.profile.name || '';

    // 1. Encontra ou cria a conta WhatsApp
    let account = db.accounts.getByPhoneNumberId(phoneNumberId);
    if (!account) {
      // Cria uma conta básica se não existir (pode acontecer se o webhook chegar antes da config manual)
      const accountId = db.accounts.create({
        phone_number_id: phoneNumberId,
        display_phone: displayPhone || '',
        status: 'connected'
      });
      account = db.accounts.getById(accountId);
    }

    // 2. Encontra ou cria o contato
    const contact = db.contacts.create({
      phone: senderPhone,
      profile_name: profileName,
      name: profileName, // Usa o nome do perfil como nome inicial
      origin: 'whatsapp'
    });

    // 3. Encontra ou cria a conversa
    let conversation = db.conversations.getByContactAndAccount(contact.id, account.id);
    if (!conversation) {
      const convId = db.conversations.create({
        account_id: account.id,
        contact_id: contact.id,
        status: 'open'
      });
      conversation = db.conversations.getById(convId);
    } else if (conversation.status === 'closed' || conversation.status === 'archived') {
      // Reabre a conversa quando chega nova mensagem
      db.conversations.update(conversation.id, {
        status: 'open',
        closed_at: null
      });
    }

    // 4. Extrai o conteúdo da mensagem
    let content = '';
    let msgType = msg.type || 'text';
    let mediaUrl = '';
    let mediaMimeType = '';
    let mediaFilename = '';
    let mediaId = '';

    switch (msgType) {
      case 'text':
        content = msg.text && msg.text.body || '';
        break;
      case 'image':
        content = msg.image && msg.image.caption || '';
        mediaId = msg.image && msg.image.id || '';
        mediaMimeType = msg.image && msg.image.mime_type || 'image/jpeg';
        break;
      case 'document':
        content = msg.document && msg.document.caption || '';
        mediaId = msg.document && msg.document.id || '';
        mediaMimeType = msg.document && msg.document.mime_type || '';
        mediaFilename = msg.document && msg.document.filename || '';
        break;
      case 'video':
        content = msg.video && msg.video.caption || '';
        mediaId = msg.video && msg.video.id || '';
        mediaMimeType = msg.video && msg.video.mime_type || 'video/mp4';
        break;
      case 'audio':
        mediaId = msg.audio && msg.audio.id || '';
        mediaMimeType = msg.audio && msg.audio.mime_type || 'audio/ogg';
        break;
      case 'sticker':
        mediaId = msg.sticker && msg.sticker.id || '';
        mediaMimeType = msg.sticker && msg.sticker.mime_type || 'image/webp';
        break;
      case 'location':
        const loc = msg.location || {};
        content = `📍 Localização: ${loc.latitude}, ${loc.longitude}`;
        if (loc.name) content += ` — ${loc.name}`;
        if (loc.address) content += ` (${loc.address})`;
        break;
      case 'contacts':
        content = '📇 Contato compartilhado';
        if (msg.contacts && msg.contacts[0] && msg.contacts[0].name) {
          content += ': ' + (msg.contacts[0].name.formatted_name || '');
        }
        break;
      case 'reaction':
        content = '😀 Reação: ' + (msg.reaction && msg.reaction.emoji || '');
        break;
      default:
        content = '[Mensagem do tipo: ' + msgType + ']';
    }

    // 5. Salva a mensagem no banco
    const messageId = db.messages.create({
      conversation_id: conversation.id,
      account_id: account.id,
      wamid: wamid,
      direction: 'incoming',
      type: msgType,
      content: content,
      media_url: mediaUrl,
      media_mime_type: mediaMimeType,
      media_filename: mediaFilename,
      media_id: mediaId,
      status: 'received',
      sender_phone: senderPhone,
      sender_name: profileName
    });

    if (messageId === null) {
      // Mensagem duplicada (wamid já existia)
      db.webhookEvents.markProcessed(eventId);
      return;
    }

    // 6. Atualiza a conversa
    db.conversations.update(conversation.id, {
      last_message_text: content.slice(0, 200),
      last_message_at: new Date().toISOString()
    });
    db.conversations.incrementUnread(conversation.id);

    // 7. Atualiza o contato
    db.contacts.updateLastInteraction(contact.id);

    // 8. Download de mídia em background (se houver)
    if (mediaId && account.access_token_enc) {
      // Não bloqueia o webhook — faz o download em background
      setImmediate(async () => {
        try {
          const uploadsDir = require('path').join(process.env.DATA_DIR || './server-data', 'uploads');
          const result = await api.downloadMedia(mediaId, account.access_token_enc, uploadsDir);
          if (result.ok) {
            // Atualiza a mensagem com a URL local
            db.getDb().prepare('UPDATE whatsapp_messages SET media_url = ? WHERE id = ?').run(result.local_path, messageId);
            // Salva registro de mídia
            db.getDb().prepare(`
              INSERT INTO whatsapp_media (message_id, whatsapp_media_id, mime_type, file_size, filename, local_path, sha256)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(messageId, mediaId, result.mime_type || '', result.file_size || 0, result.filename || '', result.local_path || '', result.sha256 || '');

            // Notifica clientes SSE da mídia baixada
            if (notifyClients) {
              notifyClients({
                type: 'media_ready',
                conversation_id: conversation.id,
                message_id: messageId,
                media_url: result.local_path
              });
            }
          }
        } catch (e) {
          console.error('[WhatsApp Webhook] Erro ao baixar mídia:', e.message);
        }
      });
    }

    // 9. Notifica clientes SSE
    if (notifyClients) {
      notifyClients({
        type: 'new_message',
        conversation_id: conversation.id,
        message: {
          id: messageId,
          wamid: wamid,
          direction: 'incoming',
          type: msgType,
          content: content,
          media_url: mediaUrl,
          media_mime_type: mediaMimeType,
          media_filename: mediaFilename,
          sender_phone: senderPhone,
          sender_name: profileName,
          status: 'received',
          created_at: new Date().toISOString()
        },
        contact: {
          id: contact.id,
          phone: contact.phone,
          name: contact.name || contact.profile_name,
          profile_name: contact.profile_name
        }
      });
    }

    db.webhookEvents.markProcessed(eventId);
    console.log('[WhatsApp Webhook] Mensagem processada:', wamid, 'de', senderPhone);

  } catch (e) {
    console.error('[WhatsApp Webhook] Erro ao processar mensagem:', e.message);
  }
}

// ==========================================================================
// LIMPEZA PERIÓDICA
// ==========================================================================
function startCleanup(db, intervalMs) {
  const interval = intervalMs || 6 * 60 * 60 * 1000; // 6 horas
  setInterval(() => {
    try {
      db.webhookEvents.cleanup();
      console.log('[WhatsApp Webhook] Limpeza de eventos antigos concluída.');
    } catch (e) {
      console.error('[WhatsApp Webhook] Erro na limpeza:', e.message);
    }
  }, interval);
}

// ==========================================================================
// EXPORTS
// ==========================================================================
module.exports = {
  handleVerification,
  validateSignature,
  processEvent,
  startCleanup
};
