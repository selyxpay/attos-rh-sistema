// Roda pelo executor da suite:  node testes/rodar.cjs fora
// Precisa de servidor (nao precisa de navegador).
//
// MODO FORA DO EXPEDIENTE. Meta e relogio simulados. O que o teste prova:
//   - ligado, quem escrever (contato NOVO ou ANTIGO) recebe o funil;
//   - cada pessoa recebe UMA vez por periodo ligado;
//   - tem PRIORIDADE sobre o modo normal do bot, e funciona com o bot normal
//     desligado;
//   - saida, atendente e contato pausado continuam ganhando dele;
//   - os lembretes sao agendados pelo MESMO motor, identificados como
//     "fora-expediente", com horario vencido nao agendando e lembrete fora da
//     janela de 24h marcado em vez de enviado;
//   - o interruptor pela rota registra na Auditoria e marca o periodo;
//   - desligamento automatico no horario combinado;
//   - a lua e o filtro na lista de conversas.
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

async function filaAte(bot, enviados, quantos, limiteMs) {
  const fim = Date.now() + (limiteMs || 8000);
  while (Date.now() < fim && enviados.length < quantos) {
    await bot.processarFila();
    if (enviados.length >= quantos) break;
    await new Promise(function (r) { setTimeout(r, 200); });
  }
  return enviados.length;
}

// ── A) O MOTOR ─────────────────────────────────────────────────────────────
async function testarMotor() {
  console.log('=== A) FUNIL DE FORA DO EXPEDIENTE ===');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-fora-'));
  const db = require(path.join(RAIZ, 'whatsapp-db.cjs'));
  const bot = require(path.join(RAIZ, 'whatsapp-bot.cjs'));
  const L = require(path.join(RAIZ, 'whatsapp-lembretes.cjs'));

  const enviados = [];
  const apiFalsa = {
    sendTextMessage: function (pnid, to, texto) {
      enviados.push({ to: to, texto: texto });
      return Promise.resolve({ ok: true, wamid: 'wamid.FE' + enviados.length });
    },
    sendMediaMessage: function (pnid, to, tipo, envio, legenda) {
      enviados.push({ to: to, texto: legenda, midia: true });
      return Promise.resolve({ ok: true, wamid: 'wamid.FEM' + enviados.length });
    },
    uploadMedia: function () { return Promise.resolve({ ok: true, media_id: 'mid-fe' }); }
  };

  await db.init(tmp);

  // Entrevista daqui a 2 horas (nao vencida), no fuso de Brasilia.
  const spAgora = new Date(Date.now() - 180 * 60000);
  const hEntrevista = String((spAgora.getUTCHours() + 2) % 24).padStart(2, '0') + ':00';

  let config = {
    // O bot NORMAL fica DESLIGADO de proposito: o fora do expediente tem
    // interruptor proprio e tem que funcionar assim ("sai do trabalho").
    ligado: false, modo: 'primeira_vez', diasParaNovoContato: 7,
    linkVagas: 'https://attosrh.com.br/vagas', intervaloPadraoSeg: 0,
    passos: [{ id: 'pn', tipo: 'texto', texto: 'Atendimento normal' }],
    atendente: bot.CONFIG_PADRAO.atendente,
    saida: bot.CONFIG_PADRAO.saida,
    ritmo: { porMinuto: 60 },
    foraExpediente: {
      ligado: true, ligadoEm: new Date().toISOString(), ligadoPor: 'Joao', periodo: 'per-1',
      desligarEm: '',
      passos: [{ id: 'fe1', tipo: 'texto', texto: 'Boa noite {nome}! Estamos fora do horario. Amanha temos entrevista as {horario}. O link e {link}' }],
      lembrete: {
        ligado: true, titulo: 'Entrevista', horario: hEntrevista, data: '',
        lembretes: [
          { id: 'fe-10', tipo: 'minutos', valor: 10, texto: 'Nao esquece, {nome}: comeca em 10 minutos. {link}' },
          { id: 'fe-hora', tipo: 'na_hora', valor: 0, texto: '{nome}, comecou agora. {link}' }
        ]
      }
    }
  };

  L.init({ db: db, api: apiFalsa, notificar: null, pastaMidia: tmp });
  L.parar();
  bot.iniciar({
    db: db, api: apiFalsa, notificar: null, pastaMidia: tmp, lembretes: L,
    lerConfig: function () { return config; },
    gravarConfig: function (mud) { Object.assign(config, mud); }
  });
  bot.parar();

  const acc = db.accounts.create({ phone_number_id: 'pn-fe', display_phone: '+55 11 90000-0000', status: 'connected', access_token_enc: 'TOKEN' });

  // Contato ANTIGO: ja conversou antes e o bot normal ja respondeu.
  const ctAntigo = db.contacts.create({ phone: '5511988880001', name: 'Antiga Cliente' });
  const cidA = (ctAntigo && ctAntigo.id) ? ctAntigo.id : ctAntigo;
  const cvA = db.conversations.create({ account_id: acc, contact_id: cidA });
  db.messages.create({ conversation_id: cvA, account_id: acc, direction: 'incoming', type: 'text', content: 'oi', wamid: 'w-fe-a0' });
  db.bot.gravarContato(cidA, { total_respostas: 3, ultima_resposta_em: new Date(Date.now() - 86400000).toISOString() });

  // Contato NOVO.
  const ctNovo = db.contacts.create({ phone: '5511988880002', name: 'Novo Contato' });
  const cidN = (ctNovo && ctNovo.id) ? ctNovo.id : ctNovo;
  const cvN = db.conversations.create({ account_id: acc, contact_id: cidN });
  db.messages.create({ conversation_id: cvN, account_id: acc, direction: 'incoming', type: 'text', content: 'ola', wamid: 'w-fe-n0' });

  // 1) CONTATO ANTIGO recebe o funil.
  const rA = await bot.aoReceberMensagem({
    wamid: 'w-fe-a1', account_id: acc, conversation_id: cvA, contact_id: cidA,
    telefone: '5511988880001', nome: 'Antiga Cliente', texto: 'boa noite', tipo: 'text'
  });
  ok(rA && rA.acao === 'fora_expediente', 'contato ANTIGO cai no funil de fora do expediente (' + (rA && rA.acao) + ')');
  ok(rA && rA.lembretes === 2, 'e os 2 lembretes dele ficam agendados (' + (rA && rA.lembretes) + ')');
  await filaAte(bot, enviados, 1, 8000);
  ok(enviados.length >= 1, 'o funil foi enviado (' + enviados.length + ')');
  const txt = (enviados[0] || {}).texto || '';
  ok(/Antiga/.test(txt), 'com o nome da pessoa: "' + txt + '"');
  ok(txt.indexOf(hEntrevista) >= 0, 'e com o horario da entrevista ({horario} = ' + hEntrevista + ')');
  ok(/attosrh/.test(txt), 'e com o link');

  // 2) CONTATO NOVO tambem recebe.
  const rN = await bot.aoReceberMensagem({
    wamid: 'w-fe-n1', account_id: acc, conversation_id: cvN, contact_id: cidN,
    telefone: '5511988880002', nome: 'Novo Contato', texto: 'tem vaga?', tipo: 'text'
  });
  ok(rN && rN.acao === 'fora_expediente', 'contato NOVO tambem cai no funil (' + (rN && rN.acao) + ')');

  // 3) NAO REPETE no mesmo periodo.
  const rA2 = await bot.aoReceberMensagem({
    wamid: 'w-fe-a2', account_id: acc, conversation_id: cvA, contact_id: cidA,
    telefone: '5511988880001', nome: 'Antiga Cliente', texto: 'oi de novo', tipo: 'text'
  });
  ok(rA2 && rA2.acao === 'nada', 'escrevendo de novo no mesmo periodo, NAO repete o funil (' + (rA2 && rA2.acao) + ')');
  ok(/ja recebeu/.test((rA2 && rA2.motivo) || ''), 'com o motivo claro: "' + ((rA2 && rA2.motivo) || '') + '"');

  // 4) PERIODO NOVO (desligou e ligou de novo): recebe outra vez.
  config.foraExpediente.periodo = 'per-2';
  const rA3 = await bot.aoReceberMensagem({
    wamid: 'w-fe-a3', account_id: acc, conversation_id: cvA, contact_id: cidA,
    telefone: '5511988880001', nome: 'Antiga Cliente', texto: 'oi', tipo: 'text'
  });
  ok(rA3 && rA3.acao === 'fora_expediente', 'em um periodo NOVO, a mesma pessoa recebe de novo (' + (rA3 && rA3.acao) + ')');
  config.foraExpediente.periodo = 'per-1';

  console.log('\n=== B) QUEM GANHA DE QUEM ===');
  // Saida ganha do fora do expediente.
  const ctS = db.contacts.create({ phone: '5511988880003', name: 'Quer Sair' });
  const cidS = (ctS && ctS.id) ? ctS.id : ctS;
  const cvS = db.conversations.create({ account_id: acc, contact_id: cidS });
  db.messages.create({ conversation_id: cvS, account_id: acc, direction: 'incoming', type: 'text', content: 'sair', wamid: 'w-fe-s0' });
  const rS = await bot.aoReceberMensagem({
    wamid: 'w-fe-s1', account_id: acc, conversation_id: cvS, contact_id: cidS,
    telefone: '5511988880003', nome: 'Quer Sair', texto: 'quero sair', tipo: 'text'
  });
  ok(rS && rS.acao === 'saida', 'pedido de SAIDA ganha do funil (' + (rS && rS.acao) + ')');
  ok(db.lembretes.daConversa(cvS).length === 0, 'e nao fica lembrete agendado para quem saiu');

  // Atendente ganha.
  const ctAt = db.contacts.create({ phone: '5511988880004', name: 'Quer Atendente' });
  const cidAt = (ctAt && ctAt.id) ? ctAt.id : ctAt;
  const cvAt = db.conversations.create({ account_id: acc, contact_id: cidAt });
  db.messages.create({ conversation_id: cvAt, account_id: acc, direction: 'incoming', type: 'text', content: 'oi', wamid: 'w-fe-at0' });
  const rAt = await bot.aoReceberMensagem({
    wamid: 'w-fe-at1', account_id: acc, conversation_id: cvAt, contact_id: cidAt,
    telefone: '5511988880004', nome: 'Quer Atendente', texto: 'quero falar com atendente', tipo: 'text'
  });
  ok(rAt && rAt.acao === 'atendente', 'pedido de ATENDENTE ganha do funil (' + (rAt && rAt.acao) + ')');

  // Contato pausado ganha.
  const ctP = db.contacts.create({ phone: '5511988880005', name: 'Pausado' });
  const cidP = (ctP && ctP.id) ? ctP.id : ctP;
  const cvP = db.conversations.create({ account_id: acc, contact_id: cidP });
  db.messages.create({ conversation_id: cvP, account_id: acc, direction: 'incoming', type: 'text', content: 'oi', wamid: 'w-fe-p0' });
  db.bot.gravarContato(cidP, { pausado: 1, pausado_por: 'rafaela' });
  const rP = await bot.aoReceberMensagem({
    wamid: 'w-fe-p1', account_id: acc, conversation_id: cvP, contact_id: cidP,
    telefone: '5511988880005', nome: 'Pausado', texto: 'oi', tipo: 'text'
  });
  ok(rP && rP.acao === 'nada', 'contato PAUSADO a mao nao recebe o funil (' + (rP && rP.acao) + ')');

  console.log('\n=== C) OS LEMBRETES DO FUNIL ===');
  const chave = 'fora-expediente|' + L.paraSql(L.eventoEmUtc('', hEntrevista, Date.now(), true));
  const doEvento = db.lembretes.doEvento(chave);
  ok(doEvento.length >= 2, 'o evento do fora do expediente tem os lembretes (' + doEvento.length + ')');
  ok(doEvento.every(function (x) { return x.resposta_id === 'fora-expediente'; }),
    'identificados como "fora-expediente" (e o que o painel usa para o selo)');
  ok(/Fora do expediente/.test(doEvento[0].titulo || ''), 'com titulo proprio: "' + (doEvento[0] || {}).titulo + '"');

  // Manda um na hora.
  const pend = doEvento.filter(function (x) { return x.status === 'agendado'; });
  if (pend.length) {
    db.lembretes.adiantarParaAgora(pend[0].id);
    const antes = enviados.length;
    await L.processarFila();
    ok(enviados.length === antes + 1, 'chegou a hora: o lembrete do funil foi enviado (' + enviados.length + ')');
    const ult = enviados[enviados.length - 1] || {};
    ok(/10 minutos|comecou/.test(ult.texto || ''), 'com o texto que foi escrito: "' + (ult.texto || '') + '"');
  }

  // HORARIO VENCIDO nao agenda.
  const hVencido = String((spAgora.getUTCHours() + 22) % 24).padStart(2, '0') + ':00';
  config.foraExpediente.lembrete.horario = hVencido;
  config.foraExpediente.periodo = 'per-vencido';
  const ctV = db.contacts.create({ phone: '5511988880006', name: 'Vencido' });
  const cidV = (ctV && ctV.id) ? ctV.id : ctV;
  const cvV = db.conversations.create({ account_id: acc, contact_id: cidV });
  db.messages.create({ conversation_id: cvV, account_id: acc, direction: 'incoming', type: 'text', content: 'oi', wamid: 'w-fe-v0' });
  const rV = await bot.aoReceberMensagem({
    wamid: 'w-fe-v1', account_id: acc, conversation_id: cvV, contact_id: cidV,
    telefone: '5511988880006', nome: 'Vencido', texto: 'oi', tipo: 'text'
  });
  ok(rV && rV.acao === 'fora_expediente', 'com horario vencido, o funil ainda vai (' + (rV && rV.acao) + ')');
  ok(rV && !rV.lembretes, 'mas NENHUM lembrete e agendado (' + (rV && rV.lembretes) + ')');
  ok(db.lembretes.daConversa(cvV).length === 0, 'e a conversa fica sem lembrete pendente');

  // LEMBRETE FORA DA JANELA DE 24 HORAS: marca, nao envia.
  config.foraExpediente.lembrete.horario = hEntrevista;
  config.foraExpediente.periodo = 'per-janela';
  const ctJ = db.contacts.create({ phone: '5511988880007', name: 'Janela' });
  const cidJ = (ctJ && ctJ.id) ? ctJ.id : ctJ;
  const cvJ = db.conversations.create({ account_id: acc, contact_id: cidJ });
  db.messages.create({ conversation_id: cvJ, account_id: acc, direction: 'incoming', type: 'text', content: 'oi', wamid: 'w-fe-j0' });
  // A ultima mensagem dela foi ha 23h50: a janela fecha em 10 minutos, e a
  // entrevista e daqui a 2 horas.
  db.getDb().run("UPDATE whatsapp_messages SET created_at = datetime('now','-1430 minutes') WHERE wamid = 'w-fe-j0'");
  const rJ = await bot.aoReceberMensagem({
    wamid: 'w-fe-j1', account_id: acc, conversation_id: cvJ, contact_id: cidJ,
    telefone: '5511988880007', nome: 'Janela', texto: 'oi', tipo: 'text'
  });
  ok(rJ && rJ.acao === 'fora_expediente', 'o funil vai (' + (rJ && rJ.acao) + ')');
  const doJanela = db.lembretes.doEvento(chave).filter(function (x) { return x.contact_id === cidJ; });
  ok(doJanela.length >= 1, 'as linhas do lembrete existem no painel (' + doJanela.length + ')');
  ok(doJanela.every(function (x) { return x.status === 'janela_fechada'; }),
    'TODAS marcadas como "janela_fechada" (nada e enviado fora das 24h)');
  ok(/24 horas/.test((doJanela[0] || {}).erro || ''), 'com o motivo: "' + ((doJanela[0] || {}).erro || '') + '"');
  const antesJ = enviados.length;
  await L.processarFila();
  ok(enviados.length === antesJ, 'e a fila nao manda nada delas (' + enviados.length + ')');

  console.log('\n=== D) DESLIGAMENTO AUTOMATICO ===');
  config.foraExpediente.desligarEm = new Date(Date.now() - 60000).toISOString();   // ja passou
  bot.conferirDesligamentoAutomatico
    ? bot.conferirDesligamentoAutomatico()
    : await bot.processarFila();      // o timer chama junto; aqui forca
  ok(config.foraExpediente.ligado === false,
    'passado o horario combinado, o modo se desliga sozinho (ligado=' + config.foraExpediente.ligado + ')');
  ok(!config.foraExpediente.desligarEm, 'e o horario combinado e limpo');

  console.log('\n=== E) OS SINAIS NA LISTA ===');
  const lista = db.conversations.list({ limit: 50 });
  const daAntiga = lista.find(function (c) { return c.id === cvA; });
  ok(!!daAntiga && !!daAntiga.fora_exp, 'quem recebeu o funil vem marcado para a lua aparecer (' + (daAntiga || {}).fora_exp + ')');
  const semFunil = lista.find(function (c) { return c.id === cvP; });
  ok(!!semFunil && !semFunil.fora_exp, 'quem nao recebeu nao e marcado');
  const soFora = db.conversations.list({ limit: 50, fora_exp_only: true });
  ok(soFora.length >= 1 && soFora.every(function (c) { return !!c.fora_exp; }),
    'o filtro "fora do expediente" traz so quem recebeu (' + soFora.length + ')');
  ok(soFora.length < lista.length, 'e e menos que a lista inteira (' + soFora.length + ' de ' + lista.length + ')');

  bot.parar(); L.parar(); db.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}

// ── F) PELO SERVIDOR: a rota do interruptor ────────────────────────────────
async function login(usuario, senha) {
  const r = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: usuario, senha: senha })
  });
  return { status: r.status, cookie: r.headers.get('set-cookie') };
}
const jsonPost = async (ck, caminho, corpo) => {
  const r = await fetch(BASE + caminho, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};
const estado = async ck => (await fetch(BASE + '/api/state', { headers: { Cookie: ck } }).then(r => r.json()));

async function testarServidor() {
  console.log('\n=== F) O INTERRUPTOR PELA ROTA (com Auditoria) ===');
  const adm = await login('admin', 'TesteLocal#123');
  ok(adm.status === 200, 'login do admin (' + adm.status + ')');

  // Sem funil escrito, nao liga.
  const semFunil = await jsonPost(adm.cookie, '/api/whatsapp/bot/fora-expediente', { ligar: true });
  ok(semFunil.status === 200 && semFunil.corpo.ok === false,
    'sem o funil escrito, a rota recusa ligar (' + (semFunil.corpo.error || '') + ')');

  // Escreve o funil pelo state (como a tela faz ao salvar).
  const e1 = await estado(adm.cookie);
  const d1 = e1.dados;
  d1.botWhatsapp = Object.assign({}, d1.botWhatsapp || {}, {
    foraExpediente: {
      ligado: false, passos: [{ id: 'fe1', tipo: 'texto', texto: 'Estamos fora do horario, {nome}' }],
      lembrete: { ligado: false, lembretes: [] }
    }
  });
  const g1 = await fetch(BASE + '/api/state', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adm.cookie },
    body: JSON.stringify({ dados: d1, merge: true, setKeys: ['botWhatsapp'], baseVersion: e1.version })
  });
  ok(g1.status === 200, 'gravou o funil pela tela (' + g1.status + ')');

  // Agora liga, com desligamento automatico.
  const amanha = new Date(Date.now() + 36000000).toISOString();
  const lig = await jsonPost(adm.cookie, '/api/whatsapp/bot/fora-expediente', { ligar: true, desligarEm: amanha });
  ok(lig.status === 200 && lig.corpo.ok === true, 'liga pela rota (' + lig.status + ')');
  const fe = lig.corpo.foraExpediente || {};
  ok(fe.ligado === true, 'e volta ligado');
  ok(!!fe.periodo, 'com um periodo marcado (e o que impede repetir o funil): ' + fe.periodo);
  ok(!!fe.ligadoEm, 'e a hora em que foi ligado');
  ok(String(fe.ligadoPor || '').length > 0, 'guardando QUEM ligou: "' + fe.ligadoPor + '"');
  ok(fe.desligarEm === amanha, 'e o horario de desligar sozinho');

  const depois = (await estado(adm.cookie)).dados.botWhatsapp.foraExpediente;
  ok(depois && depois.ligado === true, 'o estado gravado diz que esta ligado');

  // A Auditoria registrou.
  const aud = await fetch(BASE + '/api/whatsapp/audit-logs?limit=30', { headers: { Cookie: adm.cookie } })
    .then(r => r.json()).catch(function () { return {}; });
  const linhas = (aud && aud.logs) || [];
  ok(linhas.some(function (l) { return /LIGOU o modo fora do expediente/i.test(l.action || ''); }),
    'a Auditoria registrou quem ligou');

  // Desliga.
  const des = await jsonPost(adm.cookie, '/api/whatsapp/bot/fora-expediente', { ligar: false });
  ok(des.status === 200 && des.corpo.ok === true, 'desliga pela rota (' + des.status + ')');
  ok((des.corpo.foraExpediente || {}).ligado === false, 'e volta desligado');
  const aud2 = await fetch(BASE + '/api/whatsapp/audit-logs?limit=30', { headers: { Cookie: adm.cookie } })
    .then(r => r.json()).catch(function () { return {}; });
  ok(((aud2 && aud2.logs) || []).some(function (l) { return /DESLIGOU o modo fora do expediente/i.test(l.action || ''); }),
    'e a Auditoria registrou quem desligou');

  // Permissao.
  const lc = await login('zecomum', 'Comum#123');
  if (lc.status === 200) {
    const r = await jsonPost(lc.cookie, '/api/whatsapp/bot/fora-expediente', { ligar: true });
    ok(r.status === 403, 'quem nao tem a tela recebe 403 (' + r.status + ')');
  } else {
    console.log('  (pulado) nao ha conta comum semeada');
  }

  // O filtro na rota das conversas.
  const r2 = await fetch(BASE + '/api/whatsapp/conversations?limit=10&fora_exp_only=true', { headers: { Cookie: adm.cookie } });
  const j2 = await r2.json().catch(function () { return {}; });
  ok(r2.status === 200 && j2.ok === true, 'a rota aceita o filtro fora_exp_only (' + r2.status + ')');

  const saude = await fetch(BASE + '/api/saude').then(r => r.json()).catch(function () { return {}; });
  ok(saude.ok === true, '/api/saude responde');
}

(async () => {
  await testarMotor();
  await testarServidor();
  console.log('\n' + (falhas === 0 ? 'FORA DO EXPEDIENTE: TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
