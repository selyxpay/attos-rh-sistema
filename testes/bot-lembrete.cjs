// Roda pelo executor da suite:  node testes/rodar.cjs bot-lembrete
// Precisa de servidor (nao precisa de navegador).
//
// O BOT AGENDANDO LEMBRETE. Sem numero real: a Meta e simulada e o relogio
// tambem. O que o teste prova:
//   - o bot responde E agenda os lembretes daquele contato;
//   - horario VENCIDO nao agenda nada (manda so a sequencia);
//   - chamar o bot de novo nao duplica o agendamento;
//   - o lembrete do bot aparece no painel identificado como "Bot";
//   - a sequencia e o lembrete usam o MESMO horario ({horario});
//   - quem pediu para sair nao recebe;
//   - a lista de conversas traz os sinais do robozinho e do sininho, e o
//     filtro "Bot" funciona.
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.BASE;
if (!BASE) {
  console.error('Este teste roda pelo executor da suite:  node testes/rodar.cjs');
  process.exit(2);
}
const RAIZ = path.resolve(__dirname, '..');

let falhas = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALHOU: ') + m); if (!c) falhas++; };

// A fila do bot espaca os envios de proposito (controle de ritmo). Entao o
// teste chama a fila varias vezes, por CONDICAO, em vez de supor que uma
// passada basta.
async function filaAte(bot, enviados, quantos, limiteMs) {
  const fim = Date.now() + (limiteMs || 8000);
  while (Date.now() < fim && enviados.length < quantos) {
    await bot.processarFila();
    if (enviados.length >= quantos) break;
    await new Promise(function (r) { setTimeout(r, 250); });
  }
  return enviados.length;
}

async function esperarPor(fn, limiteMs, oQue) {
  const fim = Date.now() + (limiteMs || 15000);
  while (Date.now() < fim) {
    try { const v = await fn(); if (v) return v; } catch (e) {}
    await new Promise(function (r) { setTimeout(r, 200); });
  }
  console.log('  (limite) esperei ' + ((limiteMs || 15000) / 1000) + 's por: ' + oQue);
  return null;
}

// ── A) O BOT AGENDANDO, COM A META E O RELOGIO SIMULADOS ───────────────────
async function testarBotAgendando() {
  console.log('=== A) O BOT RESPONDE E AGENDA OS LEMBRETES ===');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-bot-lemb-'));
  const db = require(path.join(RAIZ, 'whatsapp-db.cjs'));
  const bot = require(path.join(RAIZ, 'whatsapp-bot.cjs'));
  const L = require(path.join(RAIZ, 'whatsapp-lembretes.cjs'));

  const enviados = [];
  const apiFalsa = {
    sendTextMessage: function (pnid, to, texto) {
      enviados.push({ to: to, texto: texto });
      return Promise.resolve({ ok: true, wamid: 'wamid.BL' + enviados.length });
    },
    sendMediaMessage: function (pnid, to, tipo, envio, legenda) {
      enviados.push({ to: to, texto: legenda, midia: true });
      return Promise.resolve({ ok: true, wamid: 'wamid.BLM' + enviados.length });
    },
    uploadMedia: function () { return Promise.resolve({ ok: true, media_id: 'mid-x' }); }
  };

  await db.init(tmp);

  // A CONFIGURACAO vem da tela: horario e textos sao do usuario, nada fixo.
  // Horario do evento: duas horas a frente, em Brasilia, para nao estar vencido.
  const agoraSP = new Date(Date.now() - 180 * 60000);
  const hEvento = String((agoraSP.getUTCHours() + 2) % 24).padStart(2, '0') + ':00';
  let config = {
    ligado: true, modo: 'primeira_vez', diasParaNovoContato: 7,
    limiteSempre: '1_dia', limiteHoras: 6,
    linkVagas: 'https://vemserrt.com.br/vagas',
    intervaloPadraoSeg: 0,
    passos: [{ id: 'p1', tipo: 'texto', texto: 'Oi {nome}! A entrevista e as {horario}. Vagas: {link_vagas}' }],
    atendente: bot.CONFIG_PADRAO.atendente,
    saida: bot.CONFIG_PADRAO.saida,
    ritmo: { porMinuto: 60 },
    lembrete: {
      ligado: true, titulo: 'Entrevista', horario: hEvento, data: '',
      lembretes: [
        { id: 'bl-15', tipo: 'minutos', valor: 15, texto: '{saudacao} {nome}! Sua entrevista e as {horario}. Link: {link}' },
        { id: 'bl-hora', tipo: 'na_hora', valor: 0, texto: '{nome}, a entrevista ja comecou: {link}' }
      ]
    }
  };

  L.init({ db: db, api: apiFalsa, notificar: null, pastaMidia: tmp });
  L.parar();
  bot.iniciar({
    db: db, api: apiFalsa, notificar: null, pastaMidia: tmp,
    lembretes: L, lerConfig: function () { return config; }
  });
  bot.parar();

  const acc = db.accounts.create({ phone_number_id: 'pn-bl', display_phone: '+55 11 90000-0000', status: 'connected', access_token_enc: 'TOKEN' });
  const ct = db.contacts.create({ phone: '5511933332222', name: 'Carla Teste' });
  const cid = (ct && ct.id) ? ct.id : ct;
  const cv = db.conversations.create({ account_id: acc, contact_id: cid });
  db.messages.create({ conversation_id: cv, account_id: acc, direction: 'incoming', type: 'text', content: 'quero vaga', wamid: 'w-bl-1' });

  // A pessoa chama o bot.
  const r1 = await bot.aoReceberMensagem({
    wamid: 'w-bl-1', account_id: acc, conversation_id: cv, contact_id: cid,
    telefone: '5511933332222', nome: 'Carla Teste', texto: 'quero vaga', tipo: 'text'
  });
  ok(r1 && r1.acao === 'sequencia', 'o bot decidiu responder (' + (r1 && r1.acao) + ')');
  ok(r1 && r1.lembretes === 2, 'e agendou os 2 lembretes daquele contato (' + (r1 && r1.lembretes) + ')');

  await filaAte(bot, enviados, 1, 8000);
  ok(enviados.length >= 1, 'a sequencia foi enviada (' + enviados.length + ')');
  const primeira = enviados[0] || {};
  ok(/Carla/.test(primeira.texto || ''), 'com o nome da pessoa: "' + (primeira.texto || '') + '"');
  ok(primeira.texto && primeira.texto.indexOf(hEvento) >= 0,
    'E COM O MESMO HORARIO do lembrete ({horario} = ' + hEvento + ')');
  ok(/vemserrt/.test(primeira.texto || ''), 'e com o link das vagas');

  const chave = 'bot|' + L.paraSql(L.eventoEmUtc('', hEvento, Date.now(), true));
  let doEvento = db.lembretes.doEvento(chave);
  ok(doEvento.length === 2, 'o evento do bot tem 2 agendamentos (' + doEvento.length + ')');
  ok(doEvento.every(function (x) { return x.resposta_id === 'bot'; }), 'identificados como do BOT (resposta_id = bot)');
  ok(/Bot/.test(doEvento[0].titulo || ''), 'e com titulo de Bot: "' + (doEvento[0] || {}).titulo + '"');

  console.log('\n=== B) CHAMAR DE NOVO NAO DUPLICA ===');
  db.messages.create({ conversation_id: cv, account_id: acc, direction: 'incoming', type: 'text', content: 'oi de novo', wamid: 'w-bl-2' });
  // Modo primeira_vez responde uma vez por periodo; para exercitar o
  // agendamento de novo, o teste usa o modo "sempre".
  config.modo = 'sempre';
  config.limiteSempre = '2_dia';
  const r2 = await bot.aoReceberMensagem({
    wamid: 'w-bl-2', account_id: acc, conversation_id: cv, contact_id: cid,
    telefone: '5511933332222', nome: 'Carla Teste', texto: 'oi de novo', tipo: 'text'
  });
  ok(r2 && r2.acao === 'sequencia', 'o bot respondeu de novo (' + (r2 && r2.acao) + ')');
  doEvento = db.lembretes.doEvento(chave);
  ok(doEvento.length === 2, 'e CONTINUA com 2 agendamentos, nao 4 (' + doEvento.length + ')');

  console.log('\n=== C) HORARIO VENCIDO NAO AGENDA ===');
  const hVencido = String((agoraSP.getUTCHours() + 23) % 24).padStart(2, '0') + ':00';  // 1h atras
  config.lembrete.horario = hVencido;
  const ct2 = db.contacts.create({ phone: '5511922221111', name: 'Bruno Teste' });
  const cid2 = (ct2 && ct2.id) ? ct2.id : ct2;
  const cv2 = db.conversations.create({ account_id: acc, contact_id: cid2 });
  db.messages.create({ conversation_id: cv2, account_id: acc, direction: 'incoming', type: 'text', content: 'oi', wamid: 'w-bl-3' });
  const antesDoVencido = enviados.length;
  const r3 = await bot.aoReceberMensagem({
    wamid: 'w-bl-3', account_id: acc, conversation_id: cv2, contact_id: cid2,
    telefone: '5511922221111', nome: 'Bruno Teste', texto: 'oi', tipo: 'text'
  });
  ok(r3 && r3.acao === 'sequencia', 'o bot responde normalmente (' + (r3 && r3.acao) + ')');
  ok(r3 && !r3.lembretes, 'mas NAO agenda lembrete de horario vencido (' + (r3 && r3.lembretes) + ')');
  await filaAte(bot, enviados, antesDoVencido + 1, 10000);
  ok(enviados.length > antesDoVencido, 'a sequencia saiu mesmo assim (' + enviados.length + ')');
  const doBruno = db.lembretes.daConversa(cv2);
  ok(doBruno.length === 0, 'e o Bruno nao tem nenhum lembrete agendado (' + doBruno.length + ')');

  console.log('\n=== D) QUEM PEDIU PARA SAIR ===');
  config.lembrete.horario = hEvento;
  const ct3 = db.contacts.create({ phone: '5511911110000', name: 'Dora Teste' });
  const cid3 = (ct3 && ct3.id) ? ct3.id : ct3;
  const cv3 = db.conversations.create({ account_id: acc, contact_id: cid3 });
  db.messages.create({ conversation_id: cv3, account_id: acc, direction: 'incoming', type: 'text', content: 'sair', wamid: 'w-bl-4' });
  const r4 = await bot.aoReceberMensagem({
    wamid: 'w-bl-4', account_id: acc, conversation_id: cv3, contact_id: cid3,
    telefone: '5511911110000', nome: 'Dora Teste', texto: 'sair', tipo: 'text'
  });
  ok(r4 && r4.acao === 'saida', 'pedido de saida e respeitado (' + (r4 && r4.acao) + ')');
  ok(db.lembretes.daConversa(cv3).length === 0, 'e nao fica nenhum lembrete agendado para ela');

  console.log('\n=== E) OS SINAIS QUE A LISTA DE CONVERSAS MOSTRA ===');
  const lista = db.conversations.list({ limit: 50 });
  const daCarla = lista.find(function (c) { return c.id === cv; });
  ok(!!daCarla && !!daCarla.bot_em, 'a conversa atendida pelo bot traz a hora do atendimento (' + (daCarla || {}).bot_em + ')');
  ok(!!daCarla && Number(daCarla.lembretes_agendados) === 2, 'e quantos lembretes estao agendados (' + (daCarla || {}).lembretes_agendados + ')');
  const daDora = lista.find(function (c) { return c.id === cv3; });
  ok(!!daDora && Number(daDora.bot_saiu) === 1, 'quem pediu para sair vem marcado (robozinho apagado)');
  const soBot = db.conversations.list({ limit: 50, bot_only: true });
  ok(soBot.length >= 1 && soBot.every(function (c) { return !!c.bot_em; }),
    'o filtro "Bot" traz so conversas em que o bot falou (' + soBot.length + ')');
  ok(soBot.length < lista.length, 'e e menos que a lista inteira (' + soBot.length + ' de ' + lista.length + ')');

  console.log('\n=== F) A FILA MANDA O LEMBRETE DO BOT NA HORA ===');
  const pend = db.lembretes.doEvento(chave).filter(function (x) { return x.status === 'agendado'; });
  ok(pend.length === 2, '2 lembretes esperando a hora (' + pend.length + ')');
  db.lembretes.adiantarParaAgora(pend[0].id);
  const antes = enviados.length;
  await L.processarFila();
  ok(enviados.length === antes + 1, 'chegou a hora: o lembrete do bot foi enviado (' + enviados.length + ')');
  const ultimo = enviados[enviados.length - 1] || {};
  ok(ultimo.texto && ultimo.texto.indexOf(hEvento) >= 0, 'com o horario do evento: "' + (ultimo.texto || '') + '"');
  ok(/vemserrt/.test(ultimo.texto || ''), 'e o {link} resolvido pelo link das vagas do bot');
  const naConversa = db.messages.listByConversation(cv, 50, 0).filter(function (m) { return m.origem === 'lembrete'; });
  ok(naConversa.length === 1, 'a mensagem entrou na conversa marcada como lembrete (' + naConversa.length + ')');
  const contatoBot = db.bot.contato(cid) || {};
  ok(!contatoBot.pausado, 'e o lembrete NAO pausou o bot naquele contato');

  bot.parar(); L.parar(); db.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}

// ── G) PELO SERVIDOR: configuracao do bot com lembrete, e o filtro na rota ──
async function login(usuario, senha) {
  const r = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: usuario, senha: senha })
  });
  return { status: r.status, cookie: r.headers.get('set-cookie') };
}

async function testarServidor() {
  console.log('\n=== G) PELO SERVIDOR ===');
  const adm = await login('admin', 'TesteLocal#123');
  ok(adm.status === 200, 'login do admin (' + adm.status + ')');

  // A configuracao do bot COM lembrete grava e volta inteira (setKeys).
  const e1 = await fetch(BASE + '/api/state', { headers: { Cookie: adm.cookie } }).then(r => r.json());
  const d1 = e1.dados;
  d1.botWhatsapp = {
    ligado: false, modo: 'primeira_vez', diasParaNovoContato: 7,
    linkVagas: 'https://vemserrt.com.br/vagas', intervaloPadraoSeg: 3,
    passos: [{ id: 'p1', tipo: 'texto', texto: 'Oi {nome}, entrevista as {horario}' }],
    lembrete: {
      ligado: true, titulo: 'Entrevista', horario: '12:00', data: '',
      lembretes: [{ id: 'bl-1', tipo: 'minutos', valor: 15, texto: 'Falta pouco, {nome}: {horario}' }]
    }
  };
  const g1 = await fetch(BASE + '/api/state', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adm.cookie },
    body: JSON.stringify({ dados: d1, merge: true, setKeys: ['botWhatsapp'], baseVersion: e1.version })
  });
  ok(g1.status === 200, 'gravou a configuracao do bot com lembrete (' + g1.status + ')');
  const lido = (await fetch(BASE + '/api/state', { headers: { Cookie: adm.cookie } }).then(r => r.json())).dados.botWhatsapp;
  ok(lido && lido.lembrete && lido.lembrete.ligado === true, 'o lembrete do bot ficou gravado');
  ok(lido && lido.lembrete.lembretes.length === 1, 'com o texto que foi escrito (' + (lido && lido.lembrete.lembretes.length) + ')');
  ok(lido && lido.ligado === false, 'e o bot continua DESLIGADO (so liga com confirmacao na tela)');

  // O filtro "Bot" na rota das conversas.
  const r1 = await fetch(BASE + '/api/whatsapp/conversations?limit=10&bot_only=true', { headers: { Cookie: adm.cookie } });
  const j1 = await r1.json().catch(function () { return {}; });
  ok(r1.status === 200 && j1.ok === true, 'a rota aceita o filtro bot_only (' + r1.status + ')');
  ok(Array.isArray(j1.conversations), 'e devolve lista');

  // A situacao do contato traz o interruptor geral, para o cabecalho dizer
  // "bot desligado" quando for esse o motivo.
  const r2 = await fetch(BASE + '/api/whatsapp/bot/contato/4242', { headers: { Cookie: adm.cookie } });
  const j2 = await r2.json().catch(function () { return {}; });
  ok(r2.status === 200 && j2.config && j2.config.ligado === false,
    'a situacao do contato informa que o interruptor geral esta desligado');

  const saude = await fetch(BASE + '/api/saude').then(r => r.json()).catch(function () { return {}; });
  ok(saude.ok === true && saude.lembretes && saude.lembretes.modulo_carregado === true,
    '/api/saude diz que o motor de lembretes esta de pe');
}

(async () => {
  await testarBotAgendando();
  await testarServidor();
  console.log('\n' + (falhas === 0 ? 'BOT + LEMBRETE: TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
