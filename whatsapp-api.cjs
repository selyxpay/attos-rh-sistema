// ==========================================================================
// WHATSAPP MODULE — CLIENTE DA API OFICIAL META (WhatsApp Cloud API)
// ==========================================================================
// Serviço que se comunica com a API oficial do WhatsApp Business Platform.
// Usa SOMENTE a API oficial da Meta (graph.facebook.com).
// NUNCA expõe tokens ou credenciais ao frontend.
//
// Todas as funções recebem o access_token como parâmetro — o token é lido
// do banco de dados (whatsapp-db.cjs) e NUNCA do frontend.
// ==========================================================================
'use strict';

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const META_API_VERSION = 'v21.0';
const META_API_BASE    = 'https://graph.facebook.com/' + META_API_VERSION;

// ==========================================================================
// UTILIDADES HTTP
// ==========================================================================

/**
 * Faz uma requisição HTTP/HTTPS e retorna { status, data }
 */
function metaRequest(method, url, body, accessToken) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: method,
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      }
    };

    const req = (isHttps ? https : http).request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: { raw: data } });
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error('Erro de conexão com a API da Meta: ' + e.message));
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Timeout na requisição à API da Meta.'));
    });

    if (body && method !== 'GET') {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      req.write(bodyStr);
    }

    req.end();
  });
}

/**
 * Baixa um arquivo binário de uma URL (para download de mídia do WhatsApp)
 */
function downloadFile(url, accessToken, destPath) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + accessToken
      }
    };

    const req = (isHttps ? https : http).request(options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Segue redirecionamento
        return downloadFile(res.headers.location, accessToken, destPath).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error('Download falhou: HTTP ' + res.statusCode));
      }
      const ws = fs.createWriteStream(destPath);
      res.pipe(ws);
      ws.on('finish', () => {
        ws.close();
        resolve({
          path: destPath,
          mime_type: res.headers['content-type'] || 'application/octet-stream',
          size: parseInt(res.headers['content-length'] || '0', 10)
        });
      });
      ws.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout no download de mídia.')); });
    req.end();
  });
}

// ==========================================================================
// ENVIO DE MENSAGENS
// ==========================================================================

/**
 * Envia uma mensagem de TEXTO
 * @param {string} phoneNumberId - ID do número de telefone da conta WhatsApp
 * @param {string} to - Número de destino (formato internacional, ex: 5511999999999)
 * @param {string} text - Texto da mensagem
 * @param {string} accessToken - Token de acesso da Meta
 * @returns {Promise<{ok: boolean, wamid?: string, error?: string}>}
 */
async function sendTextMessage(phoneNumberId, to, text, accessToken) {
  try {
    const url = META_API_BASE + '/' + phoneNumberId + '/messages';
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'text',
      text: { preview_url: true, body: text }
    };
    const res = await metaRequest('POST', url, body, accessToken);
    if (res.status === 200 || res.status === 201) {
      const wamid = res.data && res.data.messages && res.data.messages[0] ? res.data.messages[0].id : null;
      return { ok: true, wamid: wamid, data: res.data };
    }
    const errMsg = (res.data && res.data.error && res.data.error.message) || 'Erro desconhecido';
    const errCode = (res.data && res.data.error && res.data.error.code) || res.status;
    return { ok: false, error: errMsg, error_code: String(errCode), status: res.status };
  } catch (e) {
    return { ok: false, error: e.message, error_code: 'NETWORK_ERROR' };
  }
}

/**
 * Envia uma mensagem de TEMPLATE
 * @param {string} phoneNumberId - ID do número
 * @param {string} to - Número de destino
 * @param {string} templateName - Nome do template aprovado
 * @param {string} language - Código do idioma (ex: pt_BR)
 * @param {Array} components - Componentes com variáveis
 * @param {string} accessToken - Token
 */
async function sendTemplateMessage(phoneNumberId, to, templateName, language, components, accessToken) {
  try {
    const url = META_API_BASE + '/' + phoneNumberId + '/messages';
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language || 'pt_BR' }
      }
    };
    if (components && components.length > 0) {
      body.template.components = components;
    }
    const res = await metaRequest('POST', url, body, accessToken);
    if (res.status === 200 || res.status === 201) {
      const wamid = res.data && res.data.messages && res.data.messages[0] ? res.data.messages[0].id : null;
      return { ok: true, wamid: wamid, data: res.data };
    }
    const errMsg = (res.data && res.data.error && res.data.error.message) || 'Erro desconhecido';
    return { ok: false, error: errMsg, error_code: String(res.data && res.data.error && res.data.error.code || res.status) };
  } catch (e) {
    return { ok: false, error: e.message, error_code: 'NETWORK_ERROR' };
  }
}

/**
 * Envia uma mensagem de MÍDIA (imagem, documento, vídeo, áudio)
 * @param {string} phoneNumberId - ID do número
 * @param {string} to - Número de destino
 * @param {string} mediaType - Tipo: image, document, video, audio
 * @param {object} mediaData - { link: url } ou { id: media_id }
 * @param {string} caption - Legenda (opcional, não suportada por áudio)
 * @param {string} accessToken - Token
 */
async function sendMediaMessage(phoneNumberId, to, mediaType, mediaData, caption, accessToken) {
  try {
    const url = META_API_BASE + '/' + phoneNumberId + '/messages';
    const mediaPayload = {};
    if (mediaData.link) mediaPayload.link = mediaData.link;
    if (mediaData.id) mediaPayload.id = mediaData.id;
    if (caption && mediaType !== 'audio') mediaPayload.caption = caption;
    if (mediaData.filename && mediaType === 'document') mediaPayload.filename = mediaData.filename;

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: mediaType
    };
    body[mediaType] = mediaPayload;

    const res = await metaRequest('POST', url, body, accessToken);
    if (res.status === 200 || res.status === 201) {
      const wamid = res.data && res.data.messages && res.data.messages[0] ? res.data.messages[0].id : null;
      return { ok: true, wamid: wamid, data: res.data };
    }
    const errMsg = (res.data && res.data.error && res.data.error.message) || 'Erro desconhecido';
    return { ok: false, error: errMsg, error_code: String(res.data && res.data.error && res.data.error.code || res.status) };
  } catch (e) {
    return { ok: false, error: e.message, error_code: 'NETWORK_ERROR' };
  }
}

/**
 * Marca mensagens como LIDAS (blue check)
 */
async function markAsRead(phoneNumberId, messageId, accessToken) {
  try {
    const url = META_API_BASE + '/' + phoneNumberId + '/messages';
    const body = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId
    };
    const res = await metaRequest('POST', url, body, accessToken);
    return { ok: res.status === 200 || res.status === 201 };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ==========================================================================
// MÍDIA
// ==========================================================================

/**
 * Obtém a URL de download de um arquivo de mídia do WhatsApp
 * @param {string} mediaId - ID da mídia retornado pelo webhook
 * @param {string} accessToken - Token
 */
async function getMediaUrl(mediaId, accessToken) {
  try {
    const url = META_API_BASE + '/' + mediaId;
    const res = await metaRequest('GET', url, null, accessToken);
    if (res.status === 200 && res.data && res.data.url) {
      return { ok: true, url: res.data.url, mime_type: res.data.mime_type, file_size: res.data.file_size, sha256: res.data.sha256 };
    }
    return { ok: false, error: 'Não foi possível obter URL da mídia.' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Faz download de uma mídia do WhatsApp para o servidor local
 * @param {string} mediaId - ID da mídia
 * @param {string} accessToken - Token
 * @param {string} uploadsDir - Diretório de destino
 * @returns {Promise<{ok, local_path, mime_type, file_size}>}
 */
async function downloadMedia(mediaId, accessToken, uploadsDir) {
  try {
    // 1. Obtém a URL de download
    const mediaInfo = await getMediaUrl(mediaId, accessToken);
    if (!mediaInfo.ok) return mediaInfo;

    // 2. Define o nome do arquivo local
    const ext = mimeToExt(mediaInfo.mime_type) || 'bin';
    const filename = 'wa_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const destPath = path.join(uploadsDir, filename);

    // 3. Baixa o arquivo
    const result = await downloadFile(mediaInfo.url, accessToken, destPath);
    return {
      ok: true,
      local_path: '/uploads/' + filename,
      filename: filename,
      mime_type: mediaInfo.mime_type || result.mime_type,
      file_size: mediaInfo.file_size || result.size,
      sha256: mediaInfo.sha256 || ''
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Faz upload de mídia para o WhatsApp (para envio posterior)
 * @param {string} phoneNumberId - ID do número
 * @param {string} filePath - Caminho local do arquivo
 * @param {string} mimeType - MIME type do arquivo
 * @param {string} accessToken - Token
 */
async function uploadMedia(phoneNumberId, filePath, mimeType, accessToken) {
  // Para upload de mídia, a API da Meta requer multipart/form-data.
  // Com Node puro, construímos o body manualmente.
  return new Promise((resolve, reject) => {
    try {
      const fileData = fs.readFileSync(filePath);
      const boundary = '----WAUpload' + Date.now();
      const filename = path.basename(filePath);

      let body = '';
      body += '--' + boundary + '\r\n';
      body += 'Content-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp\r\n';
      body += '--' + boundary + '\r\n';
      body += 'Content-Disposition: form-data; name="file"; filename="' + filename + '"\r\n';
      body += 'Content-Type: ' + mimeType + '\r\n\r\n';

      const preFile = Buffer.from(body, 'utf8');
      const postFile = Buffer.from('\r\n--' + boundary + '--\r\n', 'utf8');
      const fullBody = Buffer.concat([preFile, fileData, postFile]);

      const url = new URL(META_API_BASE + '/' + phoneNumberId + '/media');
      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'multipart/form-data; boundary=' + boundary,
          'Content-Length': fullBody.length
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.id) {
              resolve({ ok: true, media_id: json.id });
            } else {
              resolve({ ok: false, error: (json.error && json.error.message) || 'Upload falhou' });
            }
          } catch (e) {
            resolve({ ok: false, error: 'Resposta inválida do servidor' });
          }
        });
      });

      req.on('error', e => reject(new Error('Erro no upload: ' + e.message)));
      req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout no upload.')); });
      req.write(fullBody);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

// ==========================================================================
// INFORMAÇÕES DA CONTA
// ==========================================================================

/**
 * Obtém o perfil comercial do número
 */
async function getBusinessProfile(phoneNumberId, accessToken) {
  try {
    const url = META_API_BASE + '/' + phoneNumberId + '/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical';
    const res = await metaRequest('GET', url, null, accessToken);
    if (res.status === 200) {
      return { ok: true, profile: res.data.data ? res.data.data[0] : res.data };
    }
    return { ok: false, error: 'Não foi possível obter o perfil.' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Obtém informações do número de telefone
 */
async function getPhoneInfo(phoneNumberId, accessToken) {
  try {
    const url = META_API_BASE + '/' + phoneNumberId + '?fields=verified_name,code_verification_status,display_phone_number,quality_rating,platform_type,throughput,id';
    const res = await metaRequest('GET', url, null, accessToken);
    if (res.status === 200) {
      return { ok: true, info: res.data };
    }
    return { ok: false, error: 'Não foi possível obter informações do número.' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Verifica se o token de acesso é válido e retorna informações básicas
 */
async function verifyToken(accessToken) {
  try {
    const url = 'https://graph.facebook.com/debug_token?input_token=' + accessToken;
    const res = await metaRequest('GET', url, null, accessToken);
    if (res.status === 200 && res.data && res.data.data) {
      return { ok: res.data.data.is_valid, data: res.data.data };
    }
    return { ok: false, error: 'Token inválido ou expirado.' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ==========================================================================
// TEMPLATES
// ==========================================================================

/**
 * Lista os templates aprovados de uma conta
 * @param {string} wabaId - WhatsApp Business Account ID
 * @param {string} accessToken - Token
 */
async function getTemplates(wabaId, accessToken) {
  try {
    const url = META_API_BASE + '/' + wabaId + '/message_templates?limit=100&fields=id,name,language,status,category,components';
    const res = await metaRequest('GET', url, null, accessToken);
    if (res.status === 200 && res.data && res.data.data) {
      return { ok: true, templates: res.data.data };
    }
    return { ok: false, error: 'Não foi possível obter templates.', templates: [] };
  } catch (e) {
    return { ok: false, error: e.message, templates: [] };
  }
}

// ==========================================================================
// UTILIDADES
// ==========================================================================

/**
 * Mapeia MIME type para extensão de arquivo
 */
function mimeToExt(mimeType) {
  const map = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/3gpp': '3gp',
    'audio/aac': 'aac', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/amr': 'amr',
    'audio/ogg': 'ogg', 'audio/opus': 'opus',
    'application/pdf': 'pdf',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt'
  };
  return map[mimeType] || null;
}

/**
 * Valida o formato de um número de telefone (formato internacional)
 */
function isValidPhoneNumber(phone) {
  // Remove tudo que não é dígito
  const digits = String(phone).replace(/\D/g, '');
  // Telefone internacional: entre 10 e 15 dígitos
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Normaliza um número de telefone para formato somente dígitos
 */
// Normaliza o telefone para um formato único, evitando contatos duplicados
// pelo mesmo número escrito de jeitos diferentes:
//   "+55 11 99999-9999", "5511999999999", "(11) 99999-9999"  ->  "5511999999999"
// Regra: tira tudo que não é dígito. Se for um número BR sem código do país
// (DDD + 8/9 dígitos = 10 ou 11 dígitos), adiciona o "55". Números que já vêm
// do WhatsApp chegam completos (12-13 dígitos), então não são alterados.
function normalizePhone(phone) {
  let d = String(phone == null ? '' : phone).replace(/\D/g, '');
  if ((d.length === 10 || d.length === 11) && d[0] !== '0') d = '55' + d;
  return d;
}

// Tamanhos máximos de mídia suportados pela API (em bytes)
const MEDIA_LIMITS = {
  'image':    5 * 1024 * 1024,    // 5 MB
  'video':    16 * 1024 * 1024,   // 16 MB
  'audio':    16 * 1024 * 1024,   // 16 MB
  'document': 100 * 1024 * 1024,  // 100 MB
  'sticker':  500 * 1024          // 500 KB
};

const SUPPORTED_MIME_TYPES = {
  image: ['image/jpeg', 'image/png'],
  video: ['video/mp4', 'video/3gpp'],
  audio: ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg', 'audio/opus'],
  document: ['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
             'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
             'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
             'text/plain', 'image/jpeg', 'image/png', 'image/webp'],
  sticker: ['image/webp']
};

// ==========================================================================
// EXPORTS
// ==========================================================================
module.exports = {
  META_API_VERSION,
  META_API_BASE,
  sendTextMessage,
  sendTemplateMessage,
  sendMediaMessage,
  markAsRead,
  getMediaUrl,
  downloadMedia,
  uploadMedia,
  getBusinessProfile,
  getPhoneInfo,
  verifyToken,
  getTemplates,
  mimeToExt,
  isValidPhoneNumber,
  normalizePhone,
  MEDIA_LIMITS,
  SUPPORTED_MIME_TYPES
};
