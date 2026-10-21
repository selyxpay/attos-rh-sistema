// Roda pelo executor da suite:  node testes/rodar.cjs lembretes
// Precisa de servidor (nao precisa de navegador).
//
// LEMBRETES AUTOMATICOS DAS MENSAGENS PRONTAS.
// Nada de numero real: a "Meta" aqui e um simulador — a conta do teste nasce
// sem token, e o que o teste prova e tudo ate a borda da API: a conta das
// horas, o agendamento, a regra de nao duplicar, o cancelamento, a mudanca de
// horario, a janela de 24h, o atraso tolerado e a retomada depois de reinicio.
//
// Os horarios sao SIMULADOS passando `agora` para as funcoes puras e mexendo
// no `enviar_em` das linhas do banco. E assim que da para testar "chegou a
// hora" sem esperar o meio-dia.
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

async function esperarPor(fn, limiteMs, oQue) {
  const fim = Date.now() + (limiteMs || 15000);
  while (Date.now() < fim) {
    try { const v = await fn(); if (v) return v; } catch (e) { /* tenta de novo */ }
    await new Promise(function (r) { setTimeout(r, 200); });
  }
  console.log('  (limite) esperei ' + ((limiteMs || 15000) / 1000) + 's por: ' + oQue);
  return null;
}

// Mensagem pronta de exemplo, com dois lembretes — o caso real do usuario.
const PRONTA = {
  id: 'r-entrevista', titulo: 'Entrevista do meio-dia',
  texto: 'Olá {nome}! Sua entrevista é hoje ao meio-dia. Link: https://meet.exemplo/rt-123',
  ordem: 1,
  lembrete: {
    ligado: true, horario: '12:00', data: '',
    lembretes: [
      { id: 'l-15', tipo: 'minutos', valor: 15, texto: '{saudacao} {nome}! Sua entrevista é às {horario}. Link: {link}' },
      { id: 'l-hora', tipo: 'na_hora', valor: 0, texto: '{nome}, a entrevista já começou. Estou te esperando: {link}' }
    ]
  }
};

// ── A) AS CONTAS DE HORARIO (funcoes puras, sem servidor) ──────────────────
function testarContas() {
  console.log('=== A) HORARIO DO EVENTO E DOS LEMBRETES (fuso de Brasilia) ===');
  const L = require(path.join(RAIZ, 'whatsapp-lembretes.cjs'));

  // 13:00 UTC = 10:00 em Brasilia
  const dezDaManha = new Date('2026-10-21T13:00:00Z');
  const ev = L.eventoEmUtc('', '12:00', dezDaManha);
  ok(ev && ev.toISOString() === '2026-10-21T15:00:00.000Z',
    '12:00 de Brasilia e 15:00 UTC (deu ' + (ev && ev.toISOString()) + ')');
  ok(L.horarioSP(ev) === '12:00', 'e volta como 12:00 na tela (deu ' + L.horarioSP(ev) + ')');

  const jaPassou = L.eventoEmUtc('', '09:00', dezDaManha);
  ok(jaPassou && jaPassou.toISOString().slice(0, 10) === '2026-10-22',
    'horario que JA PASSOU hoje vale para amanha (deu ' + (jaPassou && jaPassou.toISOString()) + ')');

  const comData = L.eventoEmUtc('2026-10-25', '12:00', dezDaManha);
  ok(comData && comData.toISOString() === '2026-10-25T15:00:00.000Z', 'com data, vale a data escolhida');
  ok(L.eventoEmUtc('', '99:99') === null, 'horario invalido e recusado');

  const prev = L.previsao(PRONTA, '', '', dezDaManha);
  ok(prev && prev.lembretes.length === 2, 'a previsao traz os 2 lembretes (' + (prev && prev.lembretes.length) + ')');
  ok(prev && prev.evento_horario === '12:00', 'evento as 12:00');
  const horarios = prev.lembretes.map(function (x) { return x.horario_envio; }).join(' e ');
  ok(horarios === '11:45 e 12:00', 'os lembretes saem as 11:45 e as 12:00 (deu ' + horarios + ')');
  ok(prev.lembretes[0].rotulo === '15 minutos antes', 'o primeiro e "15 minutos antes"');
  ok(prev.lembretes[1].rotulo === 'na hora do evento', 'o segundo e "na hora do evento"');

  ok(L.previsao({ id: 'x', lembrete: { ligado: false } }) === null, 'mensagem pronta sem lembrete: nada agendado');
  ok(L.previsao({ id: 'x', lembrete: { ligado: true, horario: '', lembretes: [] } }) === null,
    'lembrete ligado mas vazio tambem nao agenda');

  console.log('\n=== B) O TEXTO DO LEMBRETE ===');
  ok(L.linkDoTexto(PRONTA.texto) === 'https://meet.exemplo/rt-123', 'o link sai do texto da mensagem pronta');
  const t = L.aplicarVariaveis(PRONTA.lembrete.lembretes[0].texto,
    { nome: 'Maria Silva', horario: '12:00', link: 'https://meet.exemplo/rt-123' });
  ok(/Maria/.test(t) && !/\{/.test(t), 'as variaveis somem e o nome entra: "' + t + '"');
  ok(/12:00/.test(t), 'com o horario do evento');
  ok(/meet\.exemplo/.test(t), 'e com o link');
  const semNome = L.aplicarVariaveis('{nome}, a entrevista comecou', { nome: '' });
  ok(!/^,/.test(semNome.trim()), 'sem nome, nao sobra virgula solta: "' + semNome + '"');
}

// ── C) PELO SERVIDOR ───────────────────────────────────────────────────────
async function login(usuario, senha) {
  const r = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: usuario, senha: senha })
  });
  return { status: r.status, cookie: r.headers.get('set-cookie') };
}
const pegar = async ck => (await fetch(BASE + '/api/state', { headers: { Cookie: ck } }).then(r => r.json()));
const salvar = async (ck, corpo) => {
  const r = await fetch(BASE + '/api/state', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck },
    body: JSON.stringify(corpo)
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};
const jsonPost = async (ck, caminho, corpo) => {
  const r = await fetch(BASE + caminho, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};
const jsonGet = async (ck, caminho) => {
  const r = await fetch(BASE + caminho, { headers: { Cookie: ck } });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};

// Cria conversa de verdade pelo webhook (e tambem ABRE a janela de 24h).
async function criarConversa(adm, telefone, nome) {
  const evento = {
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba-lemb', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      metadata: { display_phone_number: '5511900000000', phone_number_id: 'pn-teste-lembretes' },
      contacts: [{ profile: { name: nome }, wa_id: telefone }],
      messages: [{ from: telefone, id: 'wamid.LEMB' + telefone + Date.now(), timestamp: String(Math.floor(Date.now() / 1000)),
                   type: 'text', text: { body: 'quero a entrevista' } }]
    } }] }]
  };
  await fetch(BASE + '/webhooks/whatsapp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(evento)
  });
  return await esperarPor(async function () {
    const j = await jsonGet(adm.cookie, '/api/whatsapp/conversations?limit=50');
    const lista = (j.corpo && j.corpo.conversations) || [];
    return lista.find(function (c) { return String(c.contact_phone) === telefone; }) || null;
  }, 15000, 'a conversa de ' + nome + ' aparecer');
}

async function testarServidor() {
  const adm = await login('admin', 'TesteLocal#123');
  ok(adm.status === 200, 'login do admin (' + adm.status + ')');

  console.log('\n=== C) CADASTRO DA MENSAGEM PRONTA COM LEMBRETE ===');
  const e1 = await pegar(adm.cookie);
  const d1 = e1.dados;
  d1.respostasRapidas = [JSON.parse(JSON.stringify(PRONTA))];
  const g1 = await salvar(adm.cookie, { dados: d1, merge: true, upsertIds: [PRONTA.id], baseVersion: e1.version });
  ok(g1.status === 200, 'gravou a mensagem pronta com lembrete (' + g1.status + ')');
  const lido = ((await pegar(adm.cookie)).dados.respostasRapidas || [])[0];
  ok(lido && lido.lembrete && lido.lembrete.ligado === true, 'o lembrete ficou gravado junto da mensagem');
  ok(lido && lido.lembrete.lembretes.length === 2, 'com os 2 textos (' + (lido && lido.lembrete.lembretes.length) + ')');

  const prevSrv = await jsonPost(adm.cookie, '/api/whatsapp/lembretes/previsao', { resposta_id: PRONTA.id });
  ok(prevSrv.status === 200 && prevSrv.corpo.previsao, 'o servidor devolve a previsao para a tela');
  ok(prevSrv.corpo.previsao && prevSrv.corpo.previsao.lembretes.length === 2, 'com os 2 horarios');

  console.log('\n=== D) AGENDAMENTO AO ENVIAR (e nao duplicar) ===');
  const conv = await criarConversa(adm, '5511955554444', 'Maria Teste');
  ok(!!conv, 'conversa criada pelo webhook (janela de 24h aberta)');
  if (!conv) return;

  // A conta do teste nasce sem token: o envio volta ok=false, e o
  // agendamento e DESFEITO — a pessoa nao recebeu o convite.
  const env1 = await jsonPost(adm.cookie, '/api/whatsapp/respostas/enviar',
    { conversation_id: conv.id, resposta_id: PRONTA.id });
  ok(env1.status === 200 && env1.corpo.ok === false, 'sem token, o envio falha com recado claro (' + (env1.corpo.error || '') + ')');
  const pain0 = await jsonGet(adm.cookie, '/api/whatsapp/lembretes/painel?dia=todos');
  const agendadosDepoisDeFalha = (pain0.corpo.eventos || []).reduce(function (s, e) { return s + Number(e.agendados || 0); }, 0);
  ok(agendadosDepoisDeFalha === 0, 'envio que falhou NAO deixa lembrete agendado (' + agendadosDepoisDeFalha + ')');

  // Agora com token de teste na conta, para o caminho de agendamento rodar.
  // O envio para a Meta continua falhando (token falso), mas o AGENDAMENTO
  // acontece antes — e e isso que esta sendo testado aqui.
  const contas = await jsonGet(adm.cookie, '/api/whatsapp/accounts');
  const conta = ((contas.corpo && contas.corpo.accounts) || []).find(function (a) { return a.phone_number_id === 'pn-teste-lembretes'; });
  ok(!!conta, 'a conta do teste existe');
  if (conta) {
    const up = await fetch(BASE + '/api/whatsapp/accounts/' + conta.id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: adm.cookie },
      body: JSON.stringify({ access_token: 'TOKEN-DE-TESTE', status: 'connected' })
    });
    ok(up.status === 200, 'conta com token de teste (' + up.status + ')');
  }

  // Agenda sem depender da Meta: usa o motor direto, como o servidor faz.
  const L = require(path.join(RAIZ, 'whatsapp-lembretes.cjs'));
  const ag = await jsonPost(adm.cookie, '/api/whatsapp/respostas/enviar',
    { conversation_id: conv.id, resposta_id: PRONTA.id });
  ok(ag.status === 200, 'segunda tentativa de envio respondeu (' + ag.status + ')');

  const pain1 = await jsonGet(adm.cookie, '/api/whatsapp/lembretes/painel?dia=todos');
  const eventos1 = pain1.corpo.eventos || [];
  ok(eventos1.length >= 1, 'o painel mostra 1 evento (' + eventos1.length + ')');
  const ev1 = eventos1[0] || {};
  ok(Number(ev1.total) === 2, 'com os 2 lembretes daquela pessoa (' + ev1.total + ')');
  ok(String(ev1.titulo) === PRONTA.titulo, 'e o nome do evento e o titulo da mensagem pronta');

  // MANDAR DE NOVO para a MESMA pessoa no MESMO evento: nao duplica.
  await jsonPost(adm.cookie, '/api/whatsapp/respostas/enviar', { conversation_id: conv.id, resposta_id: PRONTA.id });
  const pain2 = await jsonGet(adm.cookie, '/api/whatsapp/lembretes/painel?dia=todos&evento=' + encodeURIComponent(ev1.evento_chave));
  ok((pain2.corpo.itens || []).length === 2, 'mandando de novo, continua 2 (nao duplicou): ' + (pain2.corpo.itens || []).length);

  // ATENCAO: aqui o envio para a Meta FALHA de proposito (token de teste), e o
  // sistema DESFAZ o agendamento — se a pessoa nao recebeu o convite, nao faz
  // sentido mandar lembrete. Por isso estas rotas sao conferidas pelo
  // CONTRATO (resposta, permissao, erro); a mudanca de estado de verdade
  // (cancelar, reagendar) e provada na secao K, onde o envio e simulado.
  console.log('\n=== E) ENVIO QUE FALHA DESFAZ O AGENDAMENTO ===');
  const itens = pain2.corpo.itens || [];
  ok(itens.length === 2, 'as 2 linhas do evento aparecem no painel (' + itens.length + ')');
  ok(itens.every(function (x) { return x.status === 'cancelado'; }),
    'com o envio falhando, nenhuma fica agendada: ninguem recebe lembrete de convite que nao chegou');
  const can1 = await jsonPost(adm.cookie, '/api/whatsapp/lembretes/' + itens[0].id + '/cancelar');
  ok(can1.status === 200 && can1.corpo.ok === true, 'a rota de cancelar um responde ok (' + can1.status + ')');

  console.log('\n=== F) ROTA DE MUDAR O HORARIO DO EVENTO ===');
  const horaAtual = L.horarioSP(L.deSql(ev1.evento_em));
  const novaHora = String((Number(horaAtual.split(':')[0]) + 2) % 24).padStart(2, '0') + ':30';
  const reag = await jsonPost(adm.cookie, '/api/whatsapp/lembretes/evento/horario',
    { evento_chave: ev1.evento_chave, horario: novaHora });
  ok(reag.status === 200 && reag.corpo.ok === true, 'mudou o horario do evento (' + reag.status + ')');
  ok(reag.corpo.horario === novaHora, 'para ' + novaHora + ' (deu ' + reag.corpo.horario + ')');
  ok(Number(reag.corpo.reagendados) === 2, 'mexendo nas 2 linhas do evento (' + reag.corpo.reagendados + ')');

  console.log('\n=== G) ROTA DE CANCELAR O EVENTO INTEIRO E FILTROS DO PAINEL ===');
  const canEv = await jsonPost(adm.cookie, '/api/whatsapp/lembretes/evento/cancelar', { evento_chave: reag.corpo.evento_chave });
  ok(canEv.status === 200 && canEv.corpo.ok === true, 'cancelou o evento inteiro (' + canEv.status + ')');
  const pain5 = await jsonGet(adm.cookie, '/api/whatsapp/lembretes/painel?dia=todos&evento=' + encodeURIComponent(reag.corpo.evento_chave));
  const pendentes = (pain5.corpo.itens || []).filter(function (x) { return x.status === 'agendado'; });
  ok(pendentes.length === 0, 'nao sobrou nenhum agendado (' + pendentes.length + ')');
  const painHoje = await jsonGet(adm.cookie, '/api/whatsapp/lembretes/painel?dia=hoje');
  ok(painHoje.status === 200 && painHoje.corpo.ok === true, 'o filtro "hoje" do painel responde (' + painHoje.status + ')');
  const painAmanha = await jsonGet(adm.cookie, '/api/whatsapp/lembretes/painel?dia=amanha');
  ok(painAmanha.status === 200 && painAmanha.corpo.ok === true, 'e o filtro "amanha" tambem');

  console.log('\n=== H) PERMISSAO E SEGURANCA ===');
  const lc = await login('zecomum', 'Comum#123');
  if (lc.status === 200) {
    const r1 = await jsonGet(lc.cookie, '/api/whatsapp/lembretes/painel?dia=todos');
    ok(r1.status === 403, 'quem nao tem a tela WhatsApp recebe 403 no painel (' + r1.status + ')');
    const r2 = await jsonPost(lc.cookie, '/api/whatsapp/lembretes/evento/cancelar', { evento_chave: 'x' });
    ok(r2.status === 403, 'e 403 para cancelar evento (' + r2.status + ')');
  } else {
    console.log('  (pulado) nao ha conta comum semeada');
  }
  const semNada = await jsonPost(adm.cookie, '/api/whatsapp/lembretes/evento/horario', { evento_chave: '', horario: '' });
  ok(semNada.status === 400, 'pedido sem evento/horario: 400 (' + semNada.status + ')');
  const inexistente = await jsonPost(adm.cookie, '/api/whatsapp/lembretes/999999/cancelar');
  ok(inexistente.status === 404, 'cancelar agendamento que nao existe: 404 (' + inexistente.status + ')');

  console.log('\n=== I) SERVIDOR DE PE E SAUDE ===');
  const saude = await fetch(BASE + '/api/saude').then(r => r.json()).catch(function () { return {}; });
  ok(saude.ok === true, '/api/saude responde');
  ok(saude.lembretes && saude.lembretes.modulo_carregado === true, 'e diz que o motor de lembretes carregou');
}

// ── J) A FILA: HORA CERTA, JANELA FECHADA, ATRASO E REINICIO ───────────────
// Direto no banco, com horario simulado. E a parte que nao da para testar
// pelo servidor sem esperar o relogio.
async function testarFila() {
  console.log('\n=== J) A FILA (horario simulado, banco descartavel) ===');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-lemb-fila-'));
  const db = require(path.join(RAIZ, 'whatsapp-db.cjs'));
  const L = require(path.join(RAIZ, 'whatsapp-lembretes.cjs'));

  // Simulador da Meta: conta tudo que "foi enviado", sem internet.
  const enviados = [];
  const apiFalsa = {
    sendTextMessage: function (pnid, to, texto) {
      enviados.push({ to: to, texto: texto });
      return Promise.resolve({ ok: true, wamid: 'wamid.SIM' + enviados.length });
    },
    sendMediaMessage: function (pnid, to, tipo, envio, legenda) {
      enviados.push({ to: to, texto: legenda, midia: true });
      return Promise.resolve({ ok: true, wamid: 'wamid.SIMM' + enviados.length });
    },
    uploadMedia: function () { return Promise.resolve({ ok: true, media_id: 'mid-teste' }); }
  };

  await db.init(tmp);
  L.init({ db: db, api: apiFalsa, notificar: null, pastaMidia: tmp });
  L.parar();                                  // o teste chama a fila na mao

  const acc = db.accounts.create({ phone_number_id: 'pn-fila', display_phone: '+55 11 90000-0000', status: 'connected', access_token_enc: 'TOKEN' });
  const ct = db.contacts.create({ phone: '5511944443333', name: 'Joana Fila' });
  const cid = (ct && ct.id) ? ct.id : ct;
  const cv = db.conversations.create({ account_id: acc, contact_id: cid });
  // Mensagem RECEBIDA agora: abre a janela de 24 horas.
  db.messages.create({ conversation_id: cv, account_id: acc, direction: 'incoming', type: 'text', content: 'oi', wamid: 'w-fila-1' });

  const conversa = { id: cv, account_id: acc, contact_id: cid, contact_phone: '5511944443333', contact_name: 'Joana Fila' };
  const agendar = function (quandoSql, lembreteId) {
    db.lembretes.agendar({
      resposta_id: PRONTA.id, titulo: PRONTA.titulo,
      evento_em: '2026-10-21 15:00:00', evento_chave: PRONTA.id + '|2026-10-21 15:00:00',
      lembrete_id: lembreteId, rotulo: 'teste', enviar_em: quandoSql,
      account_id: acc, conversation_id: cv, contact_id: cid,
      telefone: '5511944443333', nome_contato: 'Joana Fila',
      texto: 'Oi {nome}, sua entrevista é às {horario}. Link: {link}',
      link: 'https://meet.exemplo/rt-123', criado_por: 'teste'
    });
  };

  // 1) CHEGOU A HORA: manda.
  agendar(L.paraSql(new Date(Date.now() - 5000)), 'na-hora');
  await L.processarFila();
  ok(enviados.length === 1, 'chegou a hora: mandou 1 (' + enviados.length + ')');
  ok(enviados[0] && /Joana/.test(enviados[0].texto), 'com o nome da pessoa: "' + (enviados[0] || {}).texto + '"');
  ok(enviados[0] && /meet\.exemplo/.test(enviados[0].texto), 'e com o link do evento');
  const dep1 = db.lembretes.doEvento(PRONTA.id + '|2026-10-21 15:00:00');
  ok(dep1[0] && dep1[0].status === 'enviado', 'a linha virou "enviado"');
  const naConversa = db.messages.listByConversation(cv, 50, 0).filter(function (m) { return m.origem === 'lembrete'; });
  ok(naConversa.length === 1, 'a mensagem entrou na conversa marcada como lembrete (' + naConversa.length + ')');

  // 2) AINDA NAO E HORA: nao manda.
  agendar(L.paraSql(new Date(Date.now() + 3600000)), 'daqui-1h');
  await L.processarFila();
  ok(enviados.length === 1, 'o que ainda nao chegou na hora NAO e enviado (' + enviados.length + ')');

  // 3) SEM DUPLICAR: rodar a fila de novo nao reenvia.
  await L.processarFila();
  await L.processarFila();
  ok(enviados.length === 1, 'rodar a fila de novo nao reenvia (' + enviados.length + ')');

  // 4) REINICIO NO MEIO: fecha e abre o banco, e a fila continua de onde parou.
  agendar(L.paraSql(new Date(Date.now() - 3000)), 'depois-do-reinicio');
  db.close();
  await db.init(tmp);
  L.init({ db: db, api: apiFalsa, notificar: null, pastaMidia: tmp });
  L.parar();
  await L.processarFila();
  ok(enviados.length === 2, 'depois de REINICIAR, o pendente foi enviado (' + enviados.length + ')');
  await L.processarFila();
  ok(enviados.length === 2, 'e nao duplicou o que ja tinha sido enviado antes do reinicio');

  // 5) ATRASO MAIOR QUE 10 MINUTOS: marca "perdido" e nao manda.
  agendar(L.paraSql(new Date(Date.now() - 40 * 60000)), 'atrasado');
  await L.processarFila();
  ok(enviados.length === 2, 'atraso de 40 min NAO e enviado (' + enviados.length + ')');
  const atrasado = db.lembretes.doEvento(PRONTA.id + '|2026-10-21 15:00:00')
    .find(function (x) { return x.lembrete_id === 'atrasado'; });
  ok(atrasado && atrasado.status === 'perdido', 'e fica marcado como "perdido" (' + (atrasado && atrasado.status) + ')');
  ok(atrasado && /passou/.test(atrasado.erro || ''), 'com o motivo escrito: "' + (atrasado && atrasado.erro) + '"');

  // 6) ATRASO DE 5 MINUTOS: ainda vale mandar.
  agendar(L.paraSql(new Date(Date.now() - 5 * 60000)), 'atraso-pequeno');
  await L.processarFila();
  ok(enviados.length === 3, 'atraso de 5 min AINDA e enviado (' + enviados.length + ')');

  // 7) JANELA DE 24 HORAS FECHADA: nao manda texto livre, marca e mostra.
  db.getDb().run("UPDATE whatsapp_messages SET created_at = datetime('now','-30 hours') WHERE wamid = 'w-fila-1'");
  agendar(L.paraSql(new Date(Date.now() - 2000)), 'janela-fechada');
  await L.processarFila();
  ok(enviados.length === 3, 'com a janela fechada, NAO manda (' + enviados.length + ')');
  const jf = db.lembretes.doEvento(PRONTA.id + '|2026-10-21 15:00:00')
    .find(function (x) { return x.lembrete_id === 'janela-fechada'; });
  ok(jf && jf.status === 'janela_fechada', 'e marca "janela_fechada" para aparecer no painel (' + (jf && jf.status) + ')');

  // 8) QUEM PEDIU PARA SAIR nao recebe.
  db.getDb().run("UPDATE whatsapp_messages SET created_at = datetime('now') WHERE wamid = 'w-fila-1'");
  db.bot.marcarSaida ? db.bot.marcarSaida(cid) : db.getDb().run(
    "INSERT INTO whatsapp_bot_contatos (contact_id, optou_sair) VALUES (" + cid + ", 1) " +
    "ON CONFLICT(contact_id) DO UPDATE SET optou_sair = 1");
  agendar(L.paraSql(new Date(Date.now() - 2000)), 'optou-sair');
  await L.processarFila();
  ok(enviados.length === 3, 'quem pediu para sair NAO recebe lembrete (' + enviados.length + ')');
  const os_ = db.lembretes.doEvento(PRONTA.id + '|2026-10-21 15:00:00')
    .find(function (x) { return x.lembrete_id === 'optou-sair'; });
  ok(os_ && os_.status === 'cancelado' && /sair/.test(os_.erro || ''), 'e fica cancelado com o motivo');

  // 9) O LEMBRETE NAO PAUSA O BOT e nao muda o status da conversa.
  const contatoBot = db.bot.contato(cid) || {};
  ok(!contatoBot.pausado, 'o lembrete NAO pausou o bot naquele contato');
  const convDepois = db.conversations.getById(cv);
  ok(convDepois && convDepois.status === 'open', 'e a conversa segue aberta (' + (convDepois && convDepois.status) + ')');

  // 10) O rotulo de quem enviou.
  const todas = db.messages.listByConversation(cv, 50, 0);
  ok(todas.some(function (m) { return m.origem === 'lembrete'; }), 'mensagem de lembrete tem origem "lembrete"');
  db.messages.create({ conversation_id: cv, account_id: acc, direction: 'outgoing', type: 'text', content: 'oi do bot', wamid: 'w-bot-x', sent_by_bot: 1, origem: 'bot' });
  db.messages.create({ conversation_id: cv, account_id: acc, direction: 'outgoing', type: 'text', content: 'oi da atendente', wamid: 'w-at-x', sender_name: 'Rafaela', origem: 'atendente' });
  const todas2 = db.messages.listByConversation(cv, 50, 0);
  ok(todas2.some(function (m) { return m.origem === 'bot'; }), 'mensagem do bot tem origem "bot"');
  const daAtendente = todas2.find(function (m) { return m.origem === 'atendente'; });
  ok(daAtendente && daAtendente.sender_name === 'Rafaela', 'e a do atendente guarda o nome ("' + (daAtendente || {}).sender_name + '")');

  // 11) CANCELAR UM, CANCELAR O EVENTO E MUDAR O HORARIO, com estado real.
  console.log('');
  console.log('=== K) CANCELAR E REAGENDAR (estado de verdade) ===');
  const chave2 = PRONTA.id + '|2026-10-22 15:00:00';
  const agendar2 = function (lembreteId, minutosAFrente) {
    db.lembretes.agendar({
      resposta_id: PRONTA.id, titulo: PRONTA.titulo,
      evento_em: '2026-10-22 15:00:00', evento_chave: chave2,
      lembrete_id: lembreteId, rotulo: 'teste',
      enviar_em: L.paraSql(new Date(Date.now() + minutosAFrente * 60000)),
      account_id: acc, conversation_id: cv, contact_id: cid,
      telefone: '5511944443333', nome_contato: 'Joana Fila',
      texto: 'Oi {nome}', link: '', criado_por: 'teste'
    });
  };
  agendar2('k-15', 45);
  agendar2('k-hora', 60);
  let doEvento = db.lembretes.doEvento(chave2);
  ok(doEvento.length === 2, '2 lembretes agendados no evento de amanha (' + doEvento.length + ')');

  const idCancelado = doEvento[0].id;
  db.lembretes.cancelarUm(idCancelado, 'admin');
  doEvento = db.lembretes.doEvento(chave2);
  const aindaAgendados = doEvento.filter(function (x) { return x.status === 'agendado'; });
  ok(aindaAgendados.length === 1, 'cancelando UM, sobra 1 agendado (' + aindaAgendados.length + ')');
  ok(doEvento.find(function (x) { return x.id === idCancelado; }).status === 'cancelado', 'e o cancelado fica marcado');

  // Reagenda o evento 2 horas para frente: o pendente anda junto, mantendo a
  // antecedencia; o cancelado nao volta.
  const antes = aindaAgendados[0];
  const chave3 = PRONTA.id + '|2026-10-22 17:00:00';
  db.lembretes.reagendarEvento(chave2, '2026-10-22 17:00:00', chave3);
  const depois = db.lembretes.doEvento(chave3).find(function (x) { return x.lembrete_id === antes.lembrete_id; });
  ok(!!depois, 'depois de mudar o horario, o lembrete esta no evento novo');
  if (depois) {
    const dif = Math.round((L.deSql(depois.enviar_em) - L.deSql(antes.enviar_em)) / 60000);
    ok(dif === 120, 'e andou exatamente as 2 horas do evento (deu ' + dif + ' min)');
    ok(depois.status === 'agendado', 'continuando agendado');
  }
  ok(db.lembretes.doEvento(chave2).filter(function (x) { return x.status === 'cancelado'; }).length === 1,
    'o que estava cancelado NAO volta com a mudanca de horario');

  db.lembretes.cancelarEvento(chave3, 'admin');
  ok(db.lembretes.doEvento(chave3).filter(function (x) { return x.status === 'agendado'; }).length === 0,
    'cancelando o EVENTO, nao sobra nenhum agendado');
  const quantosAntes = enviados.length;
  // "Enviar agora" reabre a linha e manda na hora. MAS quem pediu para sair
  // (teste 8, acima) continua protegido: o pedido de saida ganha de tudo.
  db.lembretes.adiantarParaAgora(idCancelado);
  await L.processarFila();
  ok(enviados.length === quantosAntes,
    'nem com "enviar agora" quem pediu para sair recebe (' + enviados.length + ' envios)');
  const reaberto = db.lembretes.getById(idCancelado);
  ok(reaberto && reaberto.status === 'cancelado' && /sair/.test(reaberto.erro || ''),
    'e a linha volta a cancelada, com o motivo: "' + ((reaberto || {}).erro || '') + '"');

  L.parar();
  db.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}

(async () => {
  testarContas();
  await testarFila();
  await testarServidor();
  console.log('\n' + (falhas === 0 ? 'LEMBRETES: TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
