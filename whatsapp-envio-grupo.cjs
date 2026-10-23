// ==========================================================================
// ENVIO EM GRUPO — só para quem está com a JANELA ABERTA
// --------------------------------------------------------------------------
// Para que serve: o atendente escolhe, na lista "Janela aberta", as pessoas
// que ainda estão dentro das 24 horas e manda a mesma mensagem para todas.
//
// POR QUE ISSO É UMA FILA, E NÃO UM LAÇO NA REQUISIÇÃO:
//   - cada envio é uma chamada de rede para a Meta: trinta pessoas numa
//     requisição seriam trinta segundos de espera e um 502 do proxy;
//   - a fila dá CONTROLE DE RITMO (mandar trinta mensagens no mesmo segundo
//     é o caminho mais curto para o número ser limitado);
//   - a fila vive no SQLite, então o envio RETOMA depois de reinício;
//   - a chave única (envio_id, contact_id) garante que ninguém receba duas
//     vezes, mesmo se o pedido chegar repetido.
//
// O QUE É CONFERIDO NA HORA DE CADA ENVIO (e não só ao montar a lista):
//   - a janela de 24 horas daquela pessoa ainda está aberta? Se fechou entre
//     montar a lista e chegar a vez dela, o item é PULADO e marcado;
//   - a pessoa pediu para sair? Então não recebe.
//
// O envio conta como mensagem do ATENDENTE: pausa o bot naquele contato (é
// atendimento humano) e aparece na conversa com o rótulo "Envio em grupo".
//
// Módulo EXTRA: se ele falhar, o resto do WhatsApp continua funcionando.
// ==========================================================================
'use strict';

const fs = require('fs');
const path = require('path');

let _db = null, _api = null, _notificar = null, _pastaMidia = '';
let _bot = null, _lembretes = null;
let _timer = null;

// Ritmo: um envio por vez, com intervalo. Mais devagar que o lembrete porque
// aqui é rajada de propósito — várias pessoas de uma vez.
const INTERVALO_MS = 2000;
const POR_RODADA = 5;

// ── TEXTO ──────────────────────────────────────────────────────────────────
// As variáveis são resolvidas POR PESSOA, na hora do envio: {nome} tem que ser
// o nome de quem vai receber, não de quem estava na prévia.
function aplicarVariaveis(texto, dados) {
  let t = String(texto == null ? '' : texto);
  t = t.replace(/\{horario\}/gi, (dados && dados.horario) || '');
  t = t.replace(/\{link\}/gi, (dados && dados.link) || '');
  if (_bot && typeof _bot.aplicarVariaveis === 'function') {
    return _bot.aplicarVariaveis(t, {
      nome: dados && dados.nome, linkVagas: dados && dados.link, horario: dados && dados.horario
    });
  }
  const primeiro = String((dados && dados.nome) || '').trim().split(/\s+/)[0] || '';
  const nome = /^\d+$/.test(primeiro) ? '' : primeiro;
  const h = new Date(Date.now() - 180 * 60000).getUTCHours();
  const saud = (h >= 5 && h < 12) ? 'bom dia' : (h >= 12 && h < 18 ? 'boa tarde' : 'boa noite');
  return t.replace(/\{nome\}/gi, nome).replace(/\{saudacao\}/gi, saud)
    .replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;!?])/g, '$1')
    .replace(/(^|\n)[ \t]*,[ \t]*/g, '$1')
    .replace(/(^|\n)\s*([a-zà-ú])/g, function (_m, a, c) { return a + c.toUpperCase(); });
}

function linkDoTexto(texto) {
  const m = String(texto || '').match(/https?:\/\/[^\s<>"]+/);
  return m ? m[0] : '';
}

// ── CRIAR O ENVIO ──────────────────────────────────────────────────────────
// Guarda o envio e a fila de contatos. Não manda nada aqui: quem manda é a
// fila, em segundo plano.
function criar(opcoes) {
  const contatos = Array.isArray(opcoes.contatos) ? opcoes.contatos : [];
  if (!contatos.length) return { ok: false, error: 'nenhum contato selecionado' };
  const temTexto = String(opcoes.texto || '').trim().length > 0;
  if (!temTexto && !opcoes.arquivo) return { ok: false, error: 'escreva a mensagem ou escolha um anexo' };

  const envioId = _db.envioGrupo.criar({
    criado_por: opcoes.usuario || '', criado_nome: opcoes.usuarioNome || '',
    account_id: contatos[0].account_id || null,
    texto: opcoes.texto || '', resposta_id: opcoes.resposta_id || '',
    titulo: opcoes.titulo || '', arquivo: opcoes.arquivo || '',
    tipo_anexo: opcoes.tipoAnexo || '', mime: opcoes.mime || '',
    nome_arquivo: opcoes.nomeArquivo || '',
    usar_lembretes: !!opcoes.usarLembretes, filtro: opcoes.filtro || ''
  });

  let naFila = 0;
  contatos.forEach(function (c) {
    if (!c || !c.conversation_id || !c.contact_id || !c.telefone) return;
    try {
      _db.envioGrupo.acrescentarItem(envioId, c);
      naFila++;
    } catch (e) {
      console.error('[Envio em grupo] não enfileirei ' + c.telefone + ':', e.message);
    }
  });

  // Começa já, mas em segundo plano: a requisição que criou o envio responde
  // na hora.
  setImmediate(function () {
    processarFila().catch(function (e) { console.error('[Envio em grupo] fila:', e.message); });
  });
  return { ok: true, envio_id: envioId, na_fila: naFila };
}

// ── UM ENVIO ───────────────────────────────────────────────────────────────
async function enviarItem(item) {
  // 1) A pessoa pediu para sair? Não recebe, e fica registrado.
  try {
    const bc = _db.bot && _db.bot.contato ? _db.bot.contato(item.contact_id) : null;
    if (bc && bc.optou_sair) {
      _db.envioGrupo.marcarItem(item.id, 'saida', { erro: 'a pessoa pediu para sair' });
      return;
    }
  } catch (e) {}

  // 2) A JANELA AINDA ESTÁ ABERTA? Entre montar a lista e chegar a vez dela
  //    podem ter passado minutos — ou o envio pode ter ficado pausado.
  if (!_db.janela.aberta(item.conversation_id)) {
    _db.envioGrupo.marcarItem(item.id, 'janela_fechada', { erro: 'a janela de 24 horas fechou antes da vez dela' });
    return;
  }

  let conta = null, token = '';
  try {
    conta = _db.accounts.getById(item.account_id);
    token = (conta && conta.access_token_enc) || '';
  } catch (e) { conta = null; }
  if (!conta || !token) {
    _db.envioGrupo.marcarItem(item.id, 'falhou', { erro: 'a conta está sem token' });
    return;
  }

  const conv = (function () {
    try { return _db.conversations.getById(item.conversation_id); } catch (e) { return null; }
  })();
  const nome = item.nome_contato || (conv && (conv.contact_name || conv.contact_profile_name)) || '';
  const link = linkDoTexto(item.texto);
  const texto = aplicarVariaveis(item.texto, {
    nome: nome, link: link, horario: horarioDoLembrete(item)
  });

  let r = null;
  try {
    if (item.arquivo) {
      const tipoMeta = _api.tipoMetaDoAnexo(item.tipo_anexo);
      const mediaId = await mediaIdDoArquivo(item.arquivo, item.account_id, item.mime, conta, token);
      const envio = { id: mediaId };
      if (tipoMeta === 'document') envio.filename = item.nome_arquivo || path.basename(item.arquivo);
      // Mensagem de voz não leva legenda: a Meta recusa caption em áudio.
      r = await _api.sendMediaMessage(conta.phone_number_id, item.telefone,
        tipoMeta, envio, tipoMeta === 'audio' ? '' : texto, token);
    } else {
      r = await _api.sendTextMessage(conta.phone_number_id, item.telefone, texto, token);
    }
  } catch (e) {
    r = { ok: false, error: e.message };
  }

  if (!r || !r.ok) {
    _db.envioGrupo.marcarItem(item.id, 'falhou', { erro: (r && r.error) || 'falha no envio', texto: texto });
    return;
  }

  _db.envioGrupo.marcarItem(item.id, 'enviado', { wamid: r.wamid, texto: texto });
  gravarNaConversa(item, texto, r.wamid);

  // 3) O ENVIO CONTA COMO MENSAGEM DO ATENDENTE: o bot para naquele contato.
  //    É atendimento humano — não pode o bot responder em cima.
  try {
    if (_bot && typeof _bot.aoAtendenteResponder === 'function') {
      _bot.aoAtendenteResponder(item.contact_id, item.criado_por || 'envio em grupo');
    } else {
      // Sem o módulo do bot carregado, grava a pausa direto: é essa linha que
      // o bot lê quando voltar, e ela não pode ficar faltando.
      _db.bot.gravarContato(item.contact_id, {
        pausado: 1, pausado_em: new Date().toISOString(),
        pausado_por: item.criado_por || 'envio em grupo', aguardando_atendente: 0
      });
    }
  } catch (e) {}

  // 4) Lembretes da mensagem pronta, se o atendente pediu.
  if (item.usar_lembretes && item.resposta_id && _lembretes && conv) {
    try {
      const resp = _buscarPronta(item.resposta_id);
      if (resp) {
        const u = _db.messages.ultimaRecebida(item.conversation_id);
        const limite = (u && u.horas !== null && u.horas !== undefined)
          ? new Date(Date.now() + (24 - Number(u.horas)) * 3600000) : null;
        _lembretes.agendar({
          resposta: resp, conversa: conv, usuario: item.criado_por || 'envio em grupo',
          limiteJanela: limite
        });
      }
    } catch (e) {
      console.error('[Envio em grupo] não agendei o lembrete:', e.message);
    }
  }
}

// O horário do evento da mensagem pronta (para {horario} no texto).
function horarioDoLembrete(item) {
  if (!item.resposta_id) return '';
  try {
    const resp = _buscarPronta(item.resposta_id);
    const l = resp && resp.lembrete;
    return (l && l.ligado && l.horario) ? String(l.horario) : '';
  } catch (e) { return ''; }
}

let _lerPronta = null;      // o servidor injeta: ele é quem sabe ler o state
function _buscarPronta(id) {
  return _lerPronta ? _lerPronta(id) : null;
}

async function mediaIdDoArquivo(arquivo, accountId, mime, conta, token) {
  const nome = path.basename(String(arquivo || ''));
  const cache = _db.bot && _db.bot.midiaCache ? _db.bot.midiaCache(nome, accountId) : null;
  if (cache && cache.media_id) return cache.media_id;
  const caminho = path.join(_pastaMidia, nome);
  if (!fs.existsSync(caminho)) throw new Error('anexo não está mais no servidor');
  const r = await _api.uploadMedia(conta.phone_number_id, caminho, mime || 'application/pdf', token);
  if (!r || !r.ok || !r.media_id) throw new Error((r && r.error) || 'falha ao subir o anexo');
  try {
    _db.bot.gravarMidiaCache(nome, accountId, r.media_id, mime || '', fs.statSync(caminho).size);
  } catch (e) {}
  return r.media_id;
}

// A mensagem entra na conversa com o rótulo "Envio em grupo".
function gravarNaConversa(item, texto, wamid) {
  try {
    const msgId = _db.messages.create({
      conversation_id: item.conversation_id, account_id: item.account_id,
      wamid: wamid || null, direction: 'outgoing',
      type: item.arquivo ? (item.tipo_anexo === 'documento' ? 'document' : 'image') : 'text',
      content: texto,
      media_url: item.arquivo ? '/api/whatsapp/respostas/midia/' + encodeURIComponent(item.arquivo) : '',
      status: 'sent', sender_name: 'Envio em grupo', origem: 'grupo'
    });
    _db.conversations.update(item.conversation_id, {
      last_message_text: String(texto || '').slice(0, 200),
      last_message_type: item.arquivo ? 'document' : 'text',
      last_message_at: new Date().toISOString()
    });
    if (_notificar) {
      _notificar({
        type: 'new_message', conversation_id: item.conversation_id,
        message: {
          id: msgId, wamid: wamid || '', direction: 'outgoing', type: 'text', content: texto,
          status: 'sent', sender_name: 'Envio em grupo', origem: 'grupo',
          created_at: new Date().toISOString()
        }
      });
    }
  } catch (e) {
    console.error('[Envio em grupo] enviei mas não gravei na conversa:', e.message);
  }
}

// ── A FILA ─────────────────────────────────────────────────────────────────
let _rodando = false;
async function processarFila() {
  if (_rodando || !_db) return;
  _rodando = true;
  try {
    const itens = _db.envioGrupo.pendentes(POR_RODADA) || [];
    for (let i = 0; i < itens.length; i++) {
      // Confere a cada volta: pausar ou cancelar no meio tem que valer na
      // hora, não no fim da rodada.
      const envio = _db.envioGrupo.getEnvio(itens[i].envio_id);
      if (!envio || envio.status !== 'ativo') continue;
      try { await enviarItem(itens[i]); }
      catch (e) {
        console.error('[Envio em grupo] erro no item:', e.message);
        try { _db.envioGrupo.marcarItem(itens[i].id, 'falhou', { erro: e.message }); } catch (e2) {}
      }
      if (i < itens.length - 1) {
        await new Promise(function (r) { setTimeout(r, INTERVALO_MS); });
      }
    }
    // Envio sem ninguém na fila vira "concluído".
    const idsVistos = {};
    itens.forEach(function (x) { idsVistos[x.envio_id] = true; });
    Object.keys(idsVistos).forEach(function (id) {
      try {
        const c = _db.envioGrupo.contagem(Number(id));
        if (c && Number(c.na_fila) === 0) _db.envioGrupo.mudarStatus(Number(id), 'concluido');
      } catch (e) {}
    });
  } finally {
    _rodando = false;
  }
}

function pausar(envioId) { _db.envioGrupo.mudarStatus(envioId, 'pausado'); }
function retomar(envioId) {
  _db.envioGrupo.mudarStatus(envioId, 'ativo');
  setImmediate(function () {
    processarFila().catch(function (e) { console.error('[Envio em grupo] fila:', e.message); });
  });
}
function cancelar(envioId) {
  _db.envioGrupo.mudarStatus(envioId, 'cancelado');
  _db.envioGrupo.cancelarPendentes(envioId);
}

function init(opcoes) {
  _db = opcoes.db;
  _api = opcoes.api;
  _notificar = opcoes.notificar || null;
  _pastaMidia = opcoes.pastaMidia || '';
  _lerPronta = opcoes.lerPronta || null;
  _lembretes = opcoes.lembretes || null;
  try { _bot = require('./whatsapp-bot.cjs'); } catch (e) { _bot = null; }
  if (_timer) clearInterval(_timer);
  // RETOMADA DEPOIS DE REINÍCIO: nada a restaurar em memória — a fila está no
  // banco. O timer só volta a olhar os itens pendentes.
  _timer = setInterval(function () {
    processarFila().catch(function (e) { console.error('[Envio em grupo] fila:', e.message); });
  }, 5000);
  if (_timer.unref) _timer.unref();
  console.log('[Envio em grupo] motor ativo (verifica a cada 5s)');
  return true;
}

function parar() { if (_timer) { clearInterval(_timer); _timer = null; } }

module.exports = {
  init, parar, criar, processarFila, enviarItem,
  pausar, retomar, cancelar,
  aplicarVariaveis, linkDoTexto
};
