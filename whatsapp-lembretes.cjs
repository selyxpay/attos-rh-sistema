// ==========================================================================
// LEMBRETES AUTOMÁTICOS DAS MENSAGENS PRONTAS
// --------------------------------------------------------------------------
// Para que serve: o atendente manda a mensagem pronta com o link da entrevista
// para várias pessoas. Perto da hora, o sistema manda sozinho — só para quem
// recebeu AQUELA mensagem — o lembrete que o atendente escreveu. E na hora,
// outro ("já começou, estou te esperando").
//
// ONDE CADA COISA MORA, E POR QUÊ:
//   - a CONFIGURAÇÃO (horário do evento, textos, anexos) fica no state.json,
//     dentro da própria mensagem pronta: usa o contrato de gravação do
//     sistema (upsertIds), a permissão por tela e a Auditoria;
//   - o AGENDAMENTO fica no SQLite do WhatsApp (tabela whatsapp_lembretes):
//     muda a toda hora, sobrevive a reinício e tem chave única por
//     contato × mensagem × lembrete × horário, que é o que impede envio
//     duplicado.
//
// O QUE ESTE MÓDULO NÃO FAZ, DE PROPÓSITO:
//   - não pausa o bot (lembrete não é atendimento humano);
//   - não muda o status da conversa;
//   - não manda nada fora da janela de 24 horas (marca e mostra no painel).
//
// Módulo EXTRA: se ele falhar, o WhatsApp e o bot continuam funcionando.
// ==========================================================================
'use strict';

const fs = require('fs');
const path = require('path');

let _db = null, _api = null, _notificar = null, _pastaMidia = '';
let _timer = null;
let _bot = null;             // para reusar a troca de variáveis, se existir

// ── FUSO: AMERICA/SAO_PAULO ────────────────────────────────────────────────
// -3 horas, fixo. O Brasil não tem horário de verão desde 2019, e o container
// roda em UTC. Toda data guardada no banco é UTC no formato do SQLite
// ("AAAA-MM-DD HH:MM:SS"): é isso que faz a comparação `enviar_em <=
// datetime('now')` funcionar. Misturar formato aqui já deu dor de cabeça.
const MIN_SP = 180;

function paraSql(d) {
  return new Date(d).toISOString().slice(0, 19).replace('T', ' ');
}
function deSql(txt) {
  const s = String(txt || '').trim().replace(' ', 'T');
  return new Date(s.length <= 19 ? s + 'Z' : s);
}
// Relógio de parede de Brasília, usando os acessores UTC.
function paredeSP(agora) {
  return new Date((agora ? new Date(agora).getTime() : Date.now()) - MIN_SP * 60000);
}
function horarioSP(d) {
  const p = paredeSP(d);
  const dois = function (n) { return String(n).padStart(2, '0'); };
  return dois(p.getUTCHours()) + ':' + dois(p.getUTCMinutes());
}
function dataSP(d) {
  const p = paredeSP(d);
  const dois = function (n) { return String(n).padStart(2, '0'); };
  return p.getUTCFullYear() + '-' + dois(p.getUTCMonth() + 1) + '-' + dois(p.getUTCDate());
}

// O momento do evento, em UTC. Sem data, vale o PRÓXIMO horário igual: hoje,
// se ainda não passou; amanhã, se já passou.
// `naoVirarODia` muda essa última parte: devolve null em vez de empurrar para
// amanhã. É o que o BOT usa — quem chama o bot às 14h não pode receber
// lembrete da entrevista do meio-dia de amanhã sem ninguém ter combinado isso.
function eventoEmUtc(data, horario, agora, naoVirarODia) {
  const partes = String(horario || '').split(':');
  const h = Number(partes[0]), m = Number(partes[1] || 0);
  if (!isFinite(h) || h < 0 || h > 23 || !isFinite(m) || m < 0 || m > 59) return null;
  const base = agora ? new Date(agora).getTime() : Date.now();
  const sp = paredeSP(base);
  let ano = sp.getUTCFullYear(), mes = sp.getUTCMonth() + 1, dia = sp.getUTCDate();
  if (data) {
    const p = String(data).split('-');
    if (p.length !== 3) return null;
    ano = Number(p[0]); mes = Number(p[1]); dia = Number(p[2]);
    if (!isFinite(ano) || !isFinite(mes) || !isFinite(dia)) return null;
  }
  let alvo = Date.UTC(ano, mes - 1, dia, h, m, 0) + MIN_SP * 60000;   // Brasília -> UTC
  if (alvo <= base) {
    if (naoVirarODia) return null;                                    // já passou: não agenda
    if (!data) alvo += 86400000;                                      // já passou: amanhã
  }
  return new Date(alvo);
}

// Quantos minutos antes do evento cada lembrete sai.
function minutosAntes(l) {
  const n = Math.max(0, Number(l && l.valor) || 0);
  if (!l || l.tipo === 'na_hora') return 0;
  if (l.tipo === 'horas') return n * 60;
  return n;                                  // minutos
}
function rotuloDoLembrete(l) {
  const min = minutosAntes(l);
  if (!min) return 'na hora do evento';
  if (min % 60 === 0) {
    const h = min / 60;
    return h === 1 ? '1 hora antes' : h + ' horas antes';
  }
  return min + (min === 1 ? ' minuto antes' : ' minutos antes');
}

// ── VARIÁVEIS ──────────────────────────────────────────────────────────────
// {nome} e {saudacao} usam a função do bot, que já arruma vírgula órfã quando
// não há nome. {horario} e {link} são destes lembretes.
function aplicarVariaveis(texto, dados) {
  let t = String(texto == null ? '' : texto);
  t = t.replace(/\{horario\}/gi, (dados && dados.horario) || '');
  t = t.replace(/\{link\}/gi, (dados && dados.link) || '');
  if (_bot && typeof _bot.aplicarVariaveis === 'function') {
    return _bot.aplicarVariaveis(t, { nome: dados && dados.nome, linkVagas: dados && dados.link });
  }
  const primeiro = String((dados && dados.nome) || '').trim().split(/\s+/)[0] || '';
  const nome = /^\d+$/.test(primeiro) ? '' : primeiro;
  const h = Number(horarioSP().split(':')[0]);
  const saud = (h >= 5 && h < 12) ? 'bom dia' : (h >= 12 && h < 18 ? 'boa tarde' : 'boa noite');
  return t.replace(/\{nome\}/gi, nome).replace(/\{saudacao\}/gi, saud)
    .replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;!?])/g, '$1')
    // vírgula órfã no começo da linha, de um {nome} vazio
    .replace(/(^|\n)[ \t]*,[ \t]*/g, '$1')
    .replace(/(^|\n)\s*([a-zà-ú])/g, function (_m, a, c) { return a + c.toUpperCase(); });
}

// O link que o lembrete usa: o primeiro endereço que estiver no texto da
// própria mensagem pronta (é onde o atendente põe o link da entrevista).
function linkDoTexto(texto) {
  const m = String(texto || '').match(/https?:\/\/[^\s<>"]+/);
  return m ? m[0] : '';
}

// ── CONFIGURAÇÃO DE UMA MENSAGEM PRONTA ────────────────────────────────────
// Devolve null quando a mensagem pronta não tem lembrete ligado.
function configDoLembrete(resp) {
  const c = resp && resp.lembrete;
  if (!c || !c.ligado) return null;
  const lista = Array.isArray(c.lembretes) ? c.lembretes.filter(function (l) {
    return l && l.id && String(l.texto || '').trim();
  }) : [];
  if (!lista.length || !c.horario) return null;
  return { horario: String(c.horario), data: c.data ? String(c.data) : '', lembretes: lista };
}

// O que vai acontecer se mandar agora: usado pela tela (a linha acima da
// caixa de escrever) e pelo agendamento. Função PURA.
function previsao(resp, horarioEscolhido, dataEscolhida, agora, naoVirarODia) {
  const cfg = configDoLembrete(resp);
  if (!cfg) return null;
  const horario = horarioEscolhido || cfg.horario;
  const data = dataEscolhida !== undefined && dataEscolhida !== null ? dataEscolhida : cfg.data;
  const evento = eventoEmUtc(data, horario, agora, naoVirarODia);
  if (!evento) return null;
  const itens = cfg.lembretes.map(function (l) {
    const min = minutosAntes(l);
    const quando = new Date(evento.getTime() - min * 60000);
    return {
      lembrete_id: String(l.id), rotulo: rotuloDoLembrete(l),
      minutos_antes: min, enviar_em: quando.toISOString(),
      horario_envio: horarioSP(quando), texto: String(l.texto || ''),
      arquivo: l.arquivo || '', tipoAnexo: l.tipoAnexo || '', mime: l.mime || '',
      nomeArquivo: l.nomeArquivo || ''
    };
  }).sort(function (a, b) { return a.enviar_em < b.enviar_em ? -1 : 1; });
  return {
    evento_em: evento.toISOString(),
    evento_horario: horarioSP(evento),
    evento_data: dataSP(evento),
    lembretes: itens
  };
}

function chaveDoEvento(respostaId, eventoUtc) {
  return String(respostaId) + '|' + paraSql(eventoUtc);
}

// ── AGENDAR ────────────────────────────────────────────────────────────────
// Chamado quando a mensagem pronta é enviada para alguém.
function agendar(opcoes) {
  const resp = opcoes.resposta, conv = opcoes.conversa;
  const prev = previsao(resp, opcoes.horario, opcoes.data, opcoes.agora, opcoes.naoVirarODia);
  if (!prev) return null;
  const eventoSql = paraSql(prev.evento_em);
  const chave = chaveDoEvento(resp.id, prev.evento_em);
  const link = linkDoTexto(resp.texto) || opcoes.linkPadrao || '';
  // Mesma pessoa, mesma mensagem pronta, OUTRO horário: o agendamento antigo
  // sai de cena, senão a pessoa receberia lembrete de dois eventos.
  try { _db.lembretes.cancelarOutrosEventos(conv.contact_id, resp.id, eventoSql, opcoes.usuario || ''); } catch (e) {}
  let agendados = 0;
  prev.lembretes.forEach(function (l) {
    // Lembrete cujo horário já passou não entra na fila (o atraso só é
    // tolerado para quem ficou na fila e o servidor estava fora do ar).
    if (new Date(l.enviar_em).getTime() <= Date.now() - 60000) return;
    try {
      _db.lembretes.agendar({
        resposta_id: String(resp.id), titulo: String(resp.titulo || ''),
        evento_em: eventoSql, evento_chave: chave,
        lembrete_id: l.lembrete_id, rotulo: l.rotulo,
        enviar_em: paraSql(l.enviar_em),
        account_id: conv.account_id, conversation_id: conv.id, contact_id: conv.contact_id,
        telefone: conv.contact_phone, nome_contato: conv.contact_name || conv.contact_profile_name || '',
        texto: l.texto, link: link,
        arquivo: l.arquivo, tipo_anexo: l.tipoAnexo, mime: l.mime, nome_arquivo: l.nomeArquivo,
        criado_por: opcoes.usuario || ''
      });
      agendados++;
    } catch (e) {
      console.error('[Lembretes] não agendei (' + l.rotulo + '):', e.message);
    }
  });
  return { evento_chave: chave, evento_em: prev.evento_em, evento_horario: prev.evento_horario,
           agendados: agendados, lembretes: prev.lembretes };
}

// ── ENVIO ──────────────────────────────────────────────────────────────────
// ATRASO TOLERADO: 10 minutos. Se o servidor ficou fora do ar e o horário
// passou há menos que isso, ainda vale mandar — a pessoa está indo para a
// entrevista. Mais que isso, o lembrete perdeu a graça e viraria confusão:
// marca "perdido" e não manda.
const ATRASO_MAXIMO_MS = 10 * 60 * 1000;
const INTERVALO_ENTRE_ENVIOS_MS = 1200;
const MAX_POR_RODADA = 10;

function janelaAberta(conversationId) {
  try {
    const r = _db.messages.ultimaRecebida(conversationId);
    if (!r || r.horas === null || r.horas === undefined) return false;
    return Number(r.horas) < 24;
  } catch (e) { return false; }      // na dúvida, não manda texto livre
}

function pediuParaSair(contactId) {
  try {
    const c = _db.bot && _db.bot.contato ? _db.bot.contato(contactId) : null;
    return !!(c && c.optou_sair);
  } catch (e) { return false; }
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

async function enviarUm(l) {
  const atraso = Date.now() - deSql(l.enviar_em).getTime();
  if (atraso > ATRASO_MAXIMO_MS) {
    _db.lembretes.marcar(l.id, 'perdido', { erro: 'o horário passou há ' + Math.round(atraso / 60000) + ' min' });
    registrar(l, 'perdido', 'o horário passou há ' + Math.round(atraso / 60000) + ' min');
    return;
  }
  if (pediuParaSair(l.contact_id)) {
    _db.lembretes.marcar(l.id, 'cancelado', { erro: 'a pessoa pediu para sair' });
    registrar(l, 'cancelado', 'a pessoa pediu para sair');
    return;
  }
  if (!janelaAberta(l.conversation_id)) {
    // Fora da janela de 24 horas a Meta só aceita MODELO APROVADO. Quando
    // houver modelo aprovado para lembrete, é aqui que ele entra: a linha
    // guarda tudo que o modelo precisa (telefone, horário, link).
    _db.lembretes.marcar(l.id, 'janela_fechada', { erro: 'janela de 24 horas fechada' });
    registrar(l, 'janela_fechada', 'a janela de 24 horas estava fechada');
    return;
  }

  let conta = null, token = '';
  try {
    conta = _db.accounts.getById(l.account_id);
    token = (conta && conta.access_token_enc) || '';
  } catch (e) { conta = null; }
  if (!conta || !token) {
    _db.lembretes.marcar(l.id, 'falhou', { erro: 'a conta está sem token', tentou: true });
    registrar(l, 'falhou', 'a conta está sem token');
    return;
  }

  const texto = aplicarVariaveis(l.texto, {
    nome: l.nome_contato, horario: horarioSP(deSql(l.evento_em)), link: l.link
  });

  let r = null;
  try {
    if (l.arquivo) {
      const ehDoc = l.tipo_anexo === 'documento';
      const mediaId = await mediaIdDoArquivo(l.arquivo, l.account_id, l.mime, conta, token);
      const envio = { id: mediaId };
      if (ehDoc) envio.filename = l.nome_arquivo || path.basename(l.arquivo);
      r = await _api.sendMediaMessage(conta.phone_number_id, l.telefone,
        ehDoc ? 'document' : 'image', envio, texto, token);
    } else {
      r = await _api.sendTextMessage(conta.phone_number_id, l.telefone, texto, token);
    }
  } catch (e) {
    r = { ok: false, error: e.message };
  }

  if (r && r.ok) {
    _db.lembretes.marcar(l.id, 'enviado', { wamid: r.wamid, tentou: true });
    gravarNaConversa(l, texto, r.wamid);
    registrar(l, 'enviado', 'lembrete "' + l.rotulo + '" enviado');
    return;
  }

  // UMA tentativa extra, e só. Insistir com erro da Meta costuma piorar.
  const tentativas = Number(l.tentativas || 0);
  if (tentativas < 1) {
    _db.lembretes.marcar(l.id, 'agendado', { erro: (r && r.error) || 'falhou', tentou: true });
    registrar(l, 'tentando', 'falhou e vai tentar uma vez: ' + ((r && r.error) || 'erro'));
  } else {
    _db.lembretes.marcar(l.id, 'falhou', { erro: (r && r.error) || 'falhou', tentou: true });
    registrar(l, 'falhou', (r && r.error) || 'erro no envio');
  }
}

// A mensagem enviada entra na conversa, marcada como LEMBRETE.
function gravarNaConversa(l, texto, wamid) {
  try {
    const msgId = _db.messages.create({
      conversation_id: l.conversation_id, account_id: l.account_id,
      wamid: wamid || null, direction: 'outgoing',
      type: l.arquivo ? (l.tipo_anexo === 'documento' ? 'document' : 'image') : 'text',
      content: texto, media_url: l.arquivo ? '/api/whatsapp/respostas/midia/' + encodeURIComponent(l.arquivo) : '',
      status: 'sent', sender_name: 'Lembrete automático', origem: 'lembrete'
    });
    _db.conversations.update(l.conversation_id, {
      last_message_text: String(texto || '').slice(0, 200),
      last_message_type: l.arquivo ? 'document' : 'text',
      last_message_at: new Date().toISOString()
    });
    if (_notificar) {
      _notificar({
        type: 'new_message', conversation_id: l.conversation_id,
        message: {
          id: msgId, direction: 'outgoing', type: 'text', content: texto,
          status: 'sent', sender_name: 'Lembrete automático', origem: 'lembrete',
          created_at: new Date().toISOString()
        }
      });
    }
  } catch (e) {
    console.error('[Lembretes] enviei mas não gravei na conversa:', e.message);
  }
}

// Auditoria + diário: cada envio fica registrado, com o motivo.
function registrar(l, resultado, detalhe) {
  try {
    _db.audit.log({
      user_login: 'sistema', user_name: 'Lembrete automático',
      action: 'Lembrete ' + resultado,
      details: '"' + String(l.titulo || '').slice(0, 40) + '" (' + l.rotulo + ') para ' +
               (l.nome_contato || l.telefone) + ' · ' + (detalhe || ''),
      account_id: l.account_id, conversation_id: l.conversation_id
    });
  } catch (e) {}
  try {
    if (_db.bot && _db.bot.registrar) {
      _db.bot.registrar('lembrete', l.contact_id, l.telefone,
        (l.nome_contato || l.telefone) + ' — ' + (detalhe || resultado));
    }
  } catch (e) {}
}

// ── A FILA ─────────────────────────────────────────────────────────────────
// Um envio por vez, com intervalo. É isto que dá o controle de ritmo e a
// retomada depois de reinício (as linhas pendentes ficam no banco).
let _rodando = false;
async function processarFila() {
  if (_rodando || !_db) return;
  _rodando = true;
  try {
    const pendentes = _db.lembretes.pendentes(MAX_POR_RODADA) || [];
    for (let i = 0; i < pendentes.length; i++) {
      try { await enviarUm(pendentes[i]); }
      catch (e) { console.error('[Lembretes] erro no envio:', e.message); }
      if (i < pendentes.length - 1) {
        await new Promise(function (r) { setTimeout(r, INTERVALO_ENTRE_ENVIOS_MS); });
      }
    }
  } finally {
    _rodando = false;
  }
}

function init(opcoes) {
  _db = opcoes.db;
  _api = opcoes.api;
  _notificar = opcoes.notificar || null;
  _pastaMidia = opcoes.pastaMidia || '';
  try { _bot = require('./whatsapp-bot.cjs'); } catch (e) { _bot = null; }
  if (_timer) clearInterval(_timer);
  // A cada 20 segundos. O lembrete é por minuto, não por segundo: não precisa
  // de mais, e assim o servidor não fica acordando sem motivo.
  _timer = setInterval(function () {
    processarFila().catch(function (e) { console.error('[Lembretes] fila:', e.message); });
  }, 20000);
  if (_timer.unref) _timer.unref();
  console.log('[Lembretes] motor ativo (verifica a cada 20s)');
  return true;
}

function parar() { if (_timer) { clearInterval(_timer); _timer = null; } }

module.exports = {
  init, parar, processarFila,
  // puras, testáveis sozinhas
  eventoEmUtc, previsao, configDoLembrete, rotuloDoLembrete, minutosAntes,
  aplicarVariaveis, linkDoTexto, horarioSP, dataSP, paraSql, deSql, chaveDoEvento,
  // usadas pelo servidor
  agendar, enviarUm,
  ATRASO_MAXIMO_MS
};
