// Roda pelo executor da suite:  node testes/rodar.cjs janela
// Precisa de servidor (nao precisa de navegador).
//
// LISTA "JANELA ABERTA" e ENVIO EM GRUPO. Meta simulada, relogio simulado.
// O que o teste prova:
//   - a lista traz SO quem esta dentro das 24 horas da ultima mensagem
//     RECEBIDA, ordenado por quem fecha primeiro;
//   - quem sai da janela sai da lista;
//   - os filtros (fechando em 2h, bot, fora do expediente, aguardando
//     atendente, sem resposta minha) e a busca;
//   - o envio em grupo: fila em segundo plano, ritmo, retomada depois de
//     reinicio, SEM duplicar;
//   - na hora de cada envio, a janela e conferida de novo: quem fechou no meio
//     da fila e PULADO e marcado;
//   - quem pediu para sair nao recebe;
//   - pausar e cancelar no meio;
//   - a mensagem entra na conversa com o rotulo "Envio em grupo" e PAUSA o bot
//     naquele contato;
//   - QUEM JA RECEBEU DISPARO: o selo com a data e o nome do ultimo envio, a
//     dica do mouse, os filtros "nunca recebeu" / "ja recebeu" / "nao recebeu
//     o envio X", quem chama depois do disparo, a combinacao com os filtros
//     antigos, o nome do envio e o aviso de repeticao nas 24 horas;
//   - nenhum contador ou limite de mensagens no sistema.
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

// A fila espaca os envios de proposito: o teste chama por CONDICAO.
async function filaAte(mod, enviados, quantos, limiteMs) {
  const fim = Date.now() + (limiteMs || 20000);
  while (Date.now() < fim && enviados.length < quantos) {
    await mod.processarFila();
    if (enviados.length >= quantos) break;
    await new Promise(function (r) { setTimeout(r, 150); });
  }
  return enviados.length;
}

// ── A) A LISTA ─────────────────────────────────────────────────────────────
async function testarLista() {
  console.log('=== A) QUEM ESTA DENTRO DAS 24 HORAS ===');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-jan-'));
  const db = require(path.join(RAIZ, 'whatsapp-db.cjs'));
  await db.init(tmp);

  const acc = db.accounts.create({ phone_number_id: 'pn-jan', display_phone: '+55 11 90000-0000', status: 'connected', access_token_enc: 'TOKEN' });
  const criar = function (tel, nome) {
    const c = db.contacts.create({ phone: tel, name: nome });
    const cid = (c && c.id) ? c.id : c;
    return { cid: cid, cv: db.conversations.create({ account_id: acc, contact_id: cid }) };
  };
  const dentro = criar('5511900000011', 'Dentro Agora');
  const fechando = criar('5511900000012', 'Fechando Logo');
  const fora = criar('5511900000013', 'Fora Da Janela');
  const comBot = criar('5511900000014', 'Atendida Pelo Bot');
  const respondida = criar('5511900000015', 'Ja Respondi');

  db.messages.create({ conversation_id: dentro.cv, account_id: acc, direction: 'incoming', type: 'text', content: 'tenho interesse na vaga', wamid: 'j1' });
  db.messages.create({ conversation_id: fechando.cv, account_id: acc, direction: 'incoming', type: 'text', content: 'ainda da tempo?', wamid: 'j2' });
  db.messages.create({ conversation_id: fora.cv, account_id: acc, direction: 'incoming', type: 'text', content: 'mensagem antiga', wamid: 'j3' });
  db.messages.create({ conversation_id: comBot.cv, account_id: acc, direction: 'incoming', type: 'text', content: 'oi', wamid: 'j4' });
  db.messages.create({ conversation_id: comBot.cv, account_id: acc, direction: 'outgoing', type: 'text', content: 'resposta do bot', wamid: 'j4b', sent_by_bot: 1, origem: 'bot' });
  db.messages.create({ conversation_id: respondida.cv, account_id: acc, direction: 'incoming', type: 'text', content: 'bom dia', wamid: 'j5' });
  db.messages.create({ conversation_id: respondida.cv, account_id: acc, direction: 'outgoing', type: 'text', content: 'bom dia! ja te respondo', wamid: 'j5b', origem: 'atendente' });

  db.getDb().run("UPDATE whatsapp_messages SET created_at = datetime('now','-30 hours') WHERE wamid = 'j3'");
  db.getDb().run("UPDATE whatsapp_messages SET created_at = datetime('now','-23 hours') WHERE wamid = 'j2'");
  db.bot.gravarContato(comBot.cid, { aguardando_atendente: 1, aguardando_desde: new Date().toISOString() });
  db.bot.gravarContato(dentro.cid, { fora_exp_periodo: 'per-1' });

  const lista = db.janela.lista({});
  const nomes = lista.map(function (x) { return x.contact_name; });
  ok(lista.length === 4, 'a lista traz 4 (quem tem mais de 24h fica de fora): ' + nomes.join(', '));
  ok(nomes.indexOf('Fora Da Janela') < 0, 'quem passou das 24 horas NAO aparece');
  ok(nomes[0] === 'Fechando Logo', 'ordenado por quem fecha primeiro (' + nomes[0] + ')');
  const f = lista.find(function (x) { return x.contact_name === 'Fechando Logo'; });
  ok(f && Number(f.horas_restantes) < 1.2, 'com o tempo que falta certo (' + (f && Number(f.horas_restantes).toFixed(1)) + 'h)');
  ok(f && /ainda da tempo/.test(f.ultima_recebida_texto || ''), 'e a ultima mensagem DELA: "' + (f || {}).ultima_recebida_texto + '"');

  console.log('\n=== B) OS FILTROS E A BUSCA ===');
  const fechandoF = db.janela.lista({ fechando_em_horas: 2 }).map(function (x) { return x.contact_name; });
  ok(fechandoF.length === 1 && fechandoF[0] === 'Fechando Logo', 'filtro "fecha em menos de 2h": ' + fechandoF.join(','));
  const botF = db.janela.lista({ so_bot: true }).map(function (x) { return x.contact_name; });
  ok(botF.length === 1 && botF[0] === 'Atendida Pelo Bot', 'filtro "atendidos pelo bot": ' + botF.join(','));
  const foraF = db.janela.lista({ so_fora_exp: true }).map(function (x) { return x.contact_name; });
  ok(foraF.length === 1 && foraF[0] === 'Dentro Agora', 'filtro "fora do expediente": ' + foraF.join(','));
  const agF = db.janela.lista({ so_aguardando: true }).map(function (x) { return x.contact_name; });
  ok(agF.length === 1 && agF[0] === 'Atendida Pelo Bot', 'filtro "aguardando atendente": ' + agF.join(','));
  const semRespF = db.janela.lista({ sem_resposta_minha: true }).map(function (x) { return x.contact_name; });
  ok(semRespF.indexOf('Ja Respondi') < 0, 'filtro "sem resposta minha" tira quem eu respondi: ' + semRespF.join(','));
  ok(semRespF.indexOf('Atendida Pelo Bot') < 0, 'e tambem quem o bot respondeu (saiu mensagem minha na conversa)');
  const buscaNome = db.janela.lista({ busca: 'Fechando' }).map(function (x) { return x.contact_name; });
  ok(buscaNome.length === 1, 'busca por nome (' + buscaNome.join(',') + ')');
  const buscaTel = db.janela.lista({ busca: '0000014' }).map(function (x) { return x.contact_name; });
  ok(buscaTel.length === 1 && buscaTel[0] === 'Atendida Pelo Bot', 'busca por numero (' + buscaTel.join(',') + ')');

  console.log('\n=== C) QUEM SAI DA JANELA SAI DA LISTA ===');
  db.getDb().run("UPDATE whatsapp_messages SET created_at = datetime('now','-25 hours') WHERE wamid = 'j2'");
  const depois = db.janela.lista({}).map(function (x) { return x.contact_name; });
  ok(depois.indexOf('Fechando Logo') < 0, 'passando das 24h, sai da lista (' + depois.join(', ') + ')');
  ok(depois.length === 3, 'e a contagem cai para 3 (' + depois.length + ')');
  ok(db.janela.aberta(fechando.cv) === false, 'e a conferencia individual tambem diz que fechou');
  ok(db.janela.aberta(dentro.cv) === true, 'quem esta dentro continua aberto');

  db.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}

// ── D) O ENVIO EM GRUPO ────────────────────────────────────────────────────
async function testarEnvio() {
  console.log('\n=== D) ENVIO EM GRUPO (fila, ritmo, sem duplicar) ===');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-grupo-'));
  const db = require(path.join(RAIZ, 'whatsapp-db.cjs'));
  const G = require(path.join(RAIZ, 'whatsapp-envio-grupo.cjs'));
  const L = require(path.join(RAIZ, 'whatsapp-lembretes.cjs'));

  const enviados = [];
  const apiFalsa = {
    sendTextMessage: function (pnid, to, texto) {
      enviados.push({ to: to, texto: texto });
      return Promise.resolve({ ok: true, wamid: 'wamid.G' + enviados.length });
    },
    sendMediaMessage: function (pnid, to, tipo, envio, legenda) {
      enviados.push({ to: to, texto: legenda, midia: true });
      return Promise.resolve({ ok: true, wamid: 'wamid.GM' + enviados.length });
    },
    uploadMedia: function () { return Promise.resolve({ ok: true, media_id: 'mid-g' }); }
  };

  await db.init(tmp);
  const PRONTA = {
    id: 'r-grupo', titulo: 'Entrevista de amanha',
    texto: 'Ola {nome}! A entrevista e as {horario}. Link: https://meet.exemplo/g1',
    lembrete: { ligado: true, horario: '10:00', data: '',
      lembretes: [{ id: 'lg-10', tipo: 'minutos', valor: 10, texto: 'Falta pouco, {nome}!' }] }
  };
  L.init({ db: db, api: apiFalsa, notificar: null, pastaMidia: tmp });
  L.parar();
  G.init({
    db: db, api: apiFalsa, notificar: null, pastaMidia: tmp, lembretes: L,
    lerPronta: function (id) { return String(id) === PRONTA.id ? PRONTA : null; }
  });
  G.parar();
  // O bot tambem entra em cena: e ele que o envio em grupo avisa para parar
  // naquele contato (em producao ele esta sempre iniciado).
  const bot = require(path.join(RAIZ, 'whatsapp-bot.cjs'));
  bot.iniciar({
    db: db, api: apiFalsa, notificar: null, pastaMidia: tmp, lembretes: L,
    lerConfig: function () { return { ligado: false, passos: [], atendente: bot.CONFIG_PADRAO.atendente, saida: bot.CONFIG_PADRAO.saida, ritmo: { porMinuto: 60 } }; }
  });
  bot.parar();

  const acc = db.accounts.create({ phone_number_id: 'pn-g', display_phone: '+55 11 90000-0000', status: 'connected', access_token_enc: 'TOKEN' });
  const pessoas = [];
  for (let i = 1; i <= 4; i++) {
    const nomes = ['Ana Ribeiro', 'Bruno Carvalho', 'Carla Dias', 'Diego Esteves'];
    const c = db.contacts.create({ phone: '55119888800' + (10 + i), name: nomes[i - 1] });
    const cid = (c && c.id) ? c.id : c;
    const cv = db.conversations.create({ account_id: acc, contact_id: cid });
    db.messages.create({ conversation_id: cv, account_id: acc, direction: 'incoming', type: 'text', content: 'oi', wamid: 'g-in-' + i });
    pessoas.push({ conversation_id: cv, contact_id: cid, account_id: acc, telefone: '55119888800' + (10 + i), nome_contato: nomes[i - 1] });
  }

  const criado = G.criar({
    contatos: pessoas, texto: PRONTA.texto, resposta_id: PRONTA.id, titulo: PRONTA.titulo,
    usarLembretes: true, usuario: 'admin', usuarioNome: 'Administrador'
  });
  ok(criado && criado.ok === true, 'envio criado (' + JSON.stringify(criado) + ')');
  ok(criado && criado.na_fila === 4, 'com as 4 pessoas na fila (' + (criado || {}).na_fila + ')');

  // Pedir o mesmo envio de novo para as mesmas pessoas NAO duplica o item.
  pessoas.forEach(function (p) { db.envioGrupo.acrescentarItem(criado.envio_id, p); });
  const cont0 = db.envioGrupo.contagem(criado.envio_id);
  ok(Number(cont0.total) === 4, 'pedir de novo nao duplica: continua 4 (' + cont0.total + ')');

  await filaAte(G, enviados, 4, 25000);
  ok(enviados.length === 4, 'as 4 foram enviadas (' + enviados.length + ')');
  // O {nome} usa o PRIMEIRO nome, que e o certo: "Ola Ana", nao "Ola Ana Ribeiro".
  ok(/\bAna\b/.test(enviados[0].texto || ''), 'cada uma com o SEU nome: "' + enviados[0].texto + '"');
  ok(!/Ribeiro/.test(enviados[0].texto || ''), 'e so o primeiro nome (sem sobrenome)');
  const nomesEnviados = enviados.slice(0, 4).map(function (e) { return (e.texto.match(/Ola (\w+)/) || [])[1]; });
  ok(new Set(nomesEnviados).size === 4, 'cada pessoa recebeu COM O SEU nome: ' + nomesEnviados.join(', '));
  ok(enviados[0].texto.indexOf('10:00') >= 0, 'e com o horario da mensagem pronta');
  const cont1 = db.envioGrupo.contagem(criado.envio_id);
  ok(Number(cont1.enviados) === 4 && Number(cont1.na_fila) === 0, 'o painel conta 4 enviados e 0 na fila');
  ok((db.envioGrupo.getEnvio(criado.envio_id) || {}).status === 'concluido', 'e o envio fica "concluido"');

  // Rodar a fila de novo nao reenvia.
  await G.processarFila();
  ok(enviados.length === 4, 'rodar a fila de novo nao reenvia (' + enviados.length + ')');

  console.log('\n=== E) NA CONVERSA: ROTULO E BOT PAUSADO ===');
  const msgs = db.messages.listByConversation(pessoas[0].conversation_id, 50, 0);
  const doGrupo = msgs.filter(function (m) { return m.origem === 'grupo'; });
  ok(doGrupo.length === 1, 'a mensagem entrou na conversa marcada como "grupo" (' + doGrupo.length + ')');
  ok((doGrupo[0] || {}).sender_name === 'Envio em grupo', 'com o nome "Envio em grupo"');
  const bc = db.bot.contato(pessoas[0].contact_id) || {};
  ok(Number(bc.pausado) === 1, 'e o bot foi PAUSADO naquele contato (e atendimento humano)');

  console.log('\n=== F) LEMBRETES DA MENSAGEM PRONTA ===');
  const lembretes = db.lembretes.daConversa(pessoas[0].conversation_id);
  ok(lembretes.length >= 1, 'o lembrete da mensagem pronta foi agendado para quem recebeu (' + lembretes.length + ')');

  console.log('\n=== G) JANELA QUE FECHA NO MEIO DA FILA ===');
  const p5 = (function () {
    const c = db.contacts.create({ phone: '5511988880099', name: 'Fechou No Meio' });
    const cid = (c && c.id) ? c.id : c;
    const cv = db.conversations.create({ account_id: acc, contact_id: cid });
    db.messages.create({ conversation_id: cv, account_id: acc, direction: 'incoming', type: 'text', content: 'oi', wamid: 'g-in-99' });
    return { conversation_id: cv, contact_id: cid, account_id: acc, telefone: '5511988880099', nome_contato: 'Fechou No Meio' };
  })();
  const envio2 = G.criar({ contatos: [p5], texto: 'Ola {nome}', usuario: 'admin' });
  ok(envio2 && envio2.ok, 'segundo envio criado');
  // Entre montar a lista e chegar a vez dela, a janela fechou.
  db.getDb().run("UPDATE whatsapp_messages SET created_at = datetime('now','-26 hours') WHERE wamid = 'g-in-99'");
  const antes = enviados.length;
  await G.processarFila();
  ok(enviados.length === antes, 'quem fechou a janela NAO recebe (' + enviados.length + ')');
  const itens2 = db.envioGrupo.itens(envio2.envio_id, 10);
  ok(itens2[0] && itens2[0].status === 'janela_fechada', 'e fica marcado "janela_fechada" (' + (itens2[0] || {}).status + ')');
  ok(/janela de 24 horas/.test((itens2[0] || {}).erro || ''), 'com o motivo: "' + (itens2[0] || {}).erro + '"');

  console.log('\n=== H) PEDIDO DE SAIDA ===');
  const p6 = (function () {
    const c = db.contacts.create({ phone: '5511988880098', name: 'Pediu Para Sair' });
    const cid = (c && c.id) ? c.id : c;
    const cv = db.conversations.create({ account_id: acc, contact_id: cid });
    db.messages.create({ conversation_id: cv, account_id: acc, direction: 'incoming', type: 'text', content: 'sair', wamid: 'g-in-98' });
    db.bot.gravarContato(cid, { optou_sair: 1, optou_sair_em: new Date().toISOString() });
    return { conversation_id: cv, contact_id: cid, account_id: acc, telefone: '5511988880098', nome_contato: 'Pediu Para Sair' };
  })();
  const envio3 = G.criar({ contatos: [p6], texto: 'Ola {nome}', usuario: 'admin' });
  const antes3 = enviados.length;
  await G.processarFila();
  ok(enviados.length === antes3, 'quem pediu para sair NAO recebe (' + enviados.length + ')');
  const itens3 = db.envioGrupo.itens(envio3.envio_id, 10);
  ok(itens3[0] && itens3[0].status === 'saida', 'e fica marcado "saida" (' + (itens3[0] || {}).status + ')');

  console.log('\n=== I) PAUSAR, RETOMAR E CANCELAR ===');
  const muitos = [];
  for (let i = 1; i <= 6; i++) {
    const c = db.contacts.create({ phone: '5511977770' + (100 + i), name: 'Fila ' + i });
    const cid = (c && c.id) ? c.id : c;
    const cv = db.conversations.create({ account_id: acc, contact_id: cid });
    db.messages.create({ conversation_id: cv, account_id: acc, direction: 'incoming', type: 'text', content: 'oi', wamid: 'g-f-' + i });
    muitos.push({ conversation_id: cv, contact_id: cid, account_id: acc, telefone: '5511977770' + (100 + i), nome_contato: 'Fila ' + i });
  }
  const envio4 = G.criar({ contatos: muitos, texto: 'Mensagem para {nome}', usuario: 'admin' });
  G.pausar(envio4.envio_id);
  const antes4 = enviados.length;
  await G.processarFila();
  ok(enviados.length === antes4, 'PAUSADO: a fila nao manda nada (' + enviados.length + ')');
  ok((db.envioGrupo.getEnvio(envio4.envio_id) || {}).status === 'pausado', 'e o status e "pausado"');

  G.retomar(envio4.envio_id);
  await filaAte(G, enviados, antes4 + 2, 15000);
  ok(enviados.length > antes4, 'RETOMADO: volta a mandar (' + enviados.length + ')');

  G.cancelar(envio4.envio_id);
  const antes5 = enviados.length;
  await G.processarFila();
  ok(enviados.length === antes5, 'CANCELADO: o que faltava nao sai (' + enviados.length + ')');
  const cont4 = db.envioGrupo.contagem(envio4.envio_id);
  ok(Number(cont4.cancelados) > 0, 'e o que faltava fica marcado "cancelado" (' + cont4.cancelados + ')');
  ok(Number(cont4.enviados) === antes5 - antes4, 'quem JA recebeu nao e afetado (' + cont4.enviados + ' enviados)');

  console.log('\n=== J) RETOMADA DEPOIS DE REINICIO, SEM DUPLICAR ===');
  const p7 = (function () {
    const c = db.contacts.create({ phone: '5511966660001', name: 'Depois Do Reinicio' });
    const cid = (c && c.id) ? c.id : c;
    const cv = db.conversations.create({ account_id: acc, contact_id: cid });
    db.messages.create({ conversation_id: cv, account_id: acc, direction: 'incoming', type: 'text', content: 'oi', wamid: 'g-in-97' });
    return { conversation_id: cv, contact_id: cid, account_id: acc, telefone: '5511966660001', nome_contato: 'Depois Do Reinicio' };
  })();
  const envio5 = G.criar({ contatos: [p7], texto: 'Ola {nome}', usuario: 'admin' });
  G.pausar(envio5.envio_id);                      // fica na fila, sem sair
  const antesR = enviados.length;

  // REINICIO: fecha e abre o banco e o motor.
  G.parar(); db.close();
  await db.init(tmp);
  G.init({ db: db, api: apiFalsa, notificar: null, pastaMidia: tmp, lembretes: L, lerPronta: function () { return null; } });
  G.parar();
  G.retomar(envio5.envio_id);
  await filaAte(G, enviados, antesR + 1, 15000);
  ok(enviados.length === antesR + 1, 'depois do REINICIO, o pendente foi enviado (' + enviados.length + ')');
  await G.processarFila();
  ok(enviados.length === antesR + 1, 'e nada foi enviado duas vezes (' + enviados.length + ')');
  const itens5 = db.envioGrupo.itens(envio5.envio_id, 10);
  ok(itens5.length === 1 && itens5[0].status === 'enviado', 'uma linha so, com status "enviado"');

  G.parar(); L.parar(); db.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}

// ── M) QUEM JA RECEBEU DISPARO ─────────────────────────────────────────────
// O problema real: faço um disparo, depois muita gente nova me chama e quem já
// recebeu volta a escrever. Preciso ver na hora quem falta. A prova usa a FILA
// QUE JA EXISTE (itens com status 'enviado'), nenhum controle novo.
async function testarQuemRecebeu() {
  console.log('\n=== M) QUEM JA RECEBEU DISPARO (selo, filtros, repeticao) ===');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-disp-'));
  const db = require(path.join(RAIZ, 'whatsapp-db.cjs'));
  const G = require(path.join(RAIZ, 'whatsapp-envio-grupo.cjs'));
  const L = require(path.join(RAIZ, 'whatsapp-lembretes.cjs'));

  const enviados = [];
  const apiFalsa = {
    sendTextMessage: function (pnid, to, texto) {
      enviados.push({ to: to, texto: texto });
      return Promise.resolve({ ok: true, wamid: 'wamid.D' + enviados.length });
    },
    sendMediaMessage: function () { return Promise.resolve({ ok: true, wamid: 'wamid.DM' }); },
    uploadMedia: function () { return Promise.resolve({ ok: true, media_id: 'mid-d' }); }
  };

  await db.init(tmp);
  const PRONTA = { id: 'r-disp', titulo: 'Convite de entrevista',
                   texto: 'Ola {nome}, a entrevista e amanha. Confirma?', lembrete: { ligado: false } };
  L.init({ db: db, api: apiFalsa, notificar: null, pastaMidia: tmp }); L.parar();
  G.init({ db: db, api: apiFalsa, notificar: null, pastaMidia: tmp, lembretes: L,
           lerPronta: function (id) { return String(id) === PRONTA.id ? PRONTA : null; } });
  G.parar();

  const acc = db.accounts.create({ phone_number_id: 'pn-d', display_phone: '+55 11 90000-0000', status: 'connected', access_token_enc: 'TOKEN' });
  const gente = {};
  const nomes = { ana: 'Ana Ribeiro', bruno: 'Bruno Carvalho', carla: 'Carla Dias', diego: 'Diego Esteves' };
  let n = 0;
  Object.keys(nomes).forEach(function (k) {
    n++;
    const c = db.contacts.create({ phone: '55119777700' + (10 + n), name: nomes[k] });
    const cid = (c && c.id) ? c.id : c;
    const cv = db.conversations.create({ account_id: acc, contact_id: cid });
    db.messages.create({ conversation_id: cv, account_id: acc, direction: 'incoming', type: 'text', content: 'oi', wamid: 'd-in-' + n });
    gente[k] = { conversation_id: cv, contact_id: cid, account_id: acc,
                 telefone: '55119777700' + (10 + n), nome_contato: nomes[k] };
  });

  // DISPARO 1 para Ana e Bruno, com NOME.
  const e1 = G.criar({ contatos: [gente.ana, gente.bruno], texto: PRONTA.texto,
                       resposta_id: PRONTA.id, titulo: 'Entrevista 10h dia 23',
                       usuario: 'admin', usuarioNome: 'Administrador' });
  ok(e1 && e1.ok === true, 'disparo 1 criado para 2 pessoas (' + (e1 || {}).na_fila + ')');
  await filaAte(G, enviados, 2, 20000);
  ok(enviados.length === 2, 'as 2 receberam o disparo 1 (' + enviados.length + ')');

  // ── O SELO ──
  const lista1 = db.janela.lista({});
  const porNome = function (lista, nome) { return lista.find(function (x) { return x.contact_name === nome; }) || {}; };
  const ana1 = porNome(lista1, 'Ana Ribeiro');
  const carla1 = porNome(lista1, 'Carla Dias');
  ok(Number(ana1.disparos_recebidos) === 1, 'quem recebeu tem o selo: Ana com 1 disparo (' + ana1.disparos_recebidos + ')');
  ok(!!ana1.ultimo_disparo_em, 'com a data e a hora do disparo (' + ana1.ultimo_disparo_em + ')');
  ok(ana1.ultimo_disparo_titulo === 'Entrevista 10h dia 23', 'e o NOME do ultimo envio ("' + ana1.ultimo_disparo_titulo + '")');
  ok(Number(ana1.ultimo_disparo_id) === e1.envio_id, 'e o id do envio, para o filtro (' + ana1.ultimo_disparo_id + ')');
  ok(Number(carla1.disparos_recebidos) === 0, 'quem nunca recebeu fica sem selo (Carla: ' + carla1.disparos_recebidos + ')');

  // ── A DICA DO MOUSE ──
  const dica = db.janela.disparosDosContatos([gente.ana.contact_id]);
  ok(dica.length === 1, 'a dica do mouse traz os envios da pessoa (' + dica.length + ')');
  ok(dica[0] && dica[0].titulo === 'Entrevista 10h dia 23', 'com o nome do envio');
  ok(dica[0] && !!dica[0].enviado_em && /Ola \{nome\}/.test(dica[0].texto_inicio || ''),
    'a data, a hora e o comeco do texto ("' + (dica[0] || {}).texto_inicio + '")');
  ok(db.janela.disparosDosContatos([]).length === 0, 'sem ninguem selecionado, nao consulta nada');

  // ── OS FILTROS ──
  const nunca = db.janela.lista({ nunca_recebeu: true }).map(function (x) { return x.contact_name; });
  ok(nunca.length === 2 && nunca.indexOf('Ana Ribeiro') < 0 && nunca.indexOf('Carla Dias') >= 0,
    'filtro "ainda nao recebeu disparo" EXCLUI quem recebeu: ' + nunca.join(', '));
  const ja = db.janela.lista({ ja_recebeu: true }).map(function (x) { return x.contact_name; });
  ok(ja.length === 2 && ja.indexOf('Ana Ribeiro') >= 0 && ja.indexOf('Bruno Carvalho') >= 0,
    'filtro "ja recebeu disparo": ' + ja.join(', '));

  // DISPARO 2 so para Ana: agora o "ultimo" mudou.
  const e2 = G.criar({ contatos: [gente.ana], texto: 'Confirma a entrevista de amanha?',
                       titulo: 'Confirmacao dia 23', usuario: 'admin', usuarioNome: 'Administrador' });
  await filaAte(G, enviados, 3, 20000);
  ok(enviados.length === 3, 'disparo 2 enviado so para a Ana (' + enviados.length + ')');
  const ana2 = porNome(db.janela.lista({}), 'Ana Ribeiro');
  ok(Number(ana2.disparos_recebidos) === 2, 'a Ana agora tem 2 disparos (' + ana2.disparos_recebidos + ')');
  ok(ana2.ultimo_disparo_titulo === 'Confirmacao dia 23', 'e o selo mostra o MAIS RECENTE ("' + ana2.ultimo_disparo_titulo + '")');
  ok(Number((db.envioGrupo.ultimoEnvio() || {}).id) === e2.envio_id, 'o "ultimo disparo" do sistema e o envio 2');

  const foraDoUltimo = db.janela.lista({ nao_recebeu_envio: e2.envio_id }).map(function (x) { return x.contact_name; });
  ok(foraDoUltimo.length === 3 && foraDoUltimo.indexOf('Ana Ribeiro') < 0,
    'filtro "nao recebeu o ULTIMO disparo" (o que o botao do historico usa): ' + foraDoUltimo.join(', '));
  const foraDoPrimeiro = db.janela.lista({ nao_recebeu_envio: e1.envio_id }).map(function (x) { return x.contact_name; });
  ok(foraDoPrimeiro.length === 2 && foraDoPrimeiro.indexOf('Carla Dias') >= 0 && foraDoPrimeiro.indexOf('Bruno Carvalho') < 0,
    'filtro por UM envio escolhido (o seletor): ' + foraDoPrimeiro.join(', '));

  // ── QUEM CHAMOU DEPOIS DO DISPARO ──
  const ce = db.contacts.create({ phone: '5511977770099', name: 'Elza Nova' });
  const cidE = (ce && ce.id) ? ce.id : ce;
  const cvE = db.conversations.create({ account_id: acc, contact_id: cidE });
  db.messages.create({ conversation_id: cvE, account_id: acc, direction: 'incoming', type: 'text', content: 'vi a vaga agora', wamid: 'd-in-elza' });
  const elza = porNome(db.janela.lista({}), 'Elza Nova');
  ok(Number(elza.disparos_recebidos) === 0, 'quem me chamou DEPOIS do disparo aparece como nao recebido');
  ok(db.janela.lista({ nunca_recebeu: true }).some(function (x) { return x.contact_name === 'Elza Nova'; }),
    'e entra no filtro "ainda nao recebeu disparo"');

  // ── COMBINA COM OS FILTROS QUE JA EXISTEM ──
  db.bot.gravarContato(gente.carla.contact_id, { aguardando_atendente: 1, aguardando_desde: new Date().toISOString() });
  const combinado = db.janela.lista({ nunca_recebeu: true, so_aguardando: true }).map(function (x) { return x.contact_name; });
  ok(combinado.length === 1 && combinado[0] === 'Carla Dias',
    '"ainda nao recebeu" + "aguardando atendente" juntos: ' + combinado.join(', '));
  const comBusca = db.janela.lista({ nunca_recebeu: true, busca: 'Elza' }).map(function (x) { return x.contact_name; });
  ok(comBusca.length === 1 && comBusca[0] === 'Elza Nova', '"ainda nao recebeu" + busca: ' + comBusca.join(', '));
  const combinaEnvio = db.janela.lista({ nao_recebeu_envio: e1.envio_id, busca: 'Carla' }).map(function (x) { return x.contact_name; });
  ok(combinaEnvio.length === 1 && combinaEnvio[0] === 'Carla Dias', 'o seletor de envio tambem combina com a busca');
  const semRepetir = db.janela.lista({ ja_recebeu: true, nunca_recebeu: true }).length;
  ok(semRepetir === 0, 'dois filtros que se contradizem nao quebram a consulta (' + semRepetir + ')');

  // ── PROTECAO CONTRA REPETIR ──
  const repPronta = db.envioGrupo.jaReceberam(
    [gente.ana.conversation_id, gente.bruno.conversation_id, gente.carla.conversation_id],
    { resposta_id: PRONTA.id, horas: 24 });
  const nomesRep = repPronta.map(function (x) { return x.nome_contato; });
  ok(repPronta.length === 2 && nomesRep.indexOf('Carla Dias') < 0,
    'a mesma mensagem PRONTA nas ultimas 24h acusa quem ja recebeu: ' + nomesRep.join(', '));
  const repTexto = db.envioGrupo.jaReceberam(
    [gente.ana.conversation_id, gente.bruno.conversation_id],
    { texto: 'Confirma a entrevista de amanha?', horas: 24 });
  ok(repTexto.length === 1 && repTexto[0].nome_contato === 'Ana Ribeiro',
    'o mesmo TEXTO LIVRE tambem: ' + repTexto.map(function (x) { return x.nome_contato; }).join(', '));
  ok(repTexto[0] && repTexto[0].titulo === 'Confirmacao dia 23', 'dizendo em qual envio foi ("' + repTexto[0].titulo + '")');
  const repOutra = db.envioGrupo.jaReceberam([gente.ana.conversation_id], { texto: 'mensagem diferente', horas: 24 });
  ok(repOutra.length === 0, 'mensagem DIFERENTE nao e repeticao (pode mandar)');
  ok(db.envioGrupo.jaReceberam([gente.ana.conversation_id], { horas: 24 }).length === 0,
    'sem texto nem pronta, nao inventa repeticao');

  // Passadas as 24 horas, mandar de novo e normal.
  db.getDb().run("UPDATE whatsapp_envio_grupo_itens SET enviado_em = datetime('now','-30 hours') WHERE status = 'enviado'");
  const repVelho = db.envioGrupo.jaReceberam([gente.ana.conversation_id], { resposta_id: PRONTA.id, horas: 24 });
  ok(repVelho.length === 0, 'o que foi enviado ha mais de 24 horas nao conta como repeticao');
  // Mas o selo continua: quem recebeu, recebeu.
  const anaVelha = porNome(db.janela.lista({}), 'Ana Ribeiro');
  ok(Number(anaVelha.disparos_recebidos) === 2, 'e o selo do historico continua la (' + anaVelha.disparos_recebidos + ')');

  db.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}

// ── K) PELO SERVIDOR ───────────────────────────────────────────────────────
async function login(usuario, senha) {
  const r = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: usuario, senha: senha })
  });
  return { status: r.status, cookie: r.headers.get('set-cookie') };
}
const jsonGet = async (ck, caminho) => {
  const r = await fetch(BASE + caminho, { headers: { Cookie: ck } });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};
const jsonPost = async (ck, caminho, corpo) => {
  const r = await fetch(BASE + caminho, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};

async function esperarPor(fn, limiteMs, oQue) {
  const fim = Date.now() + (limiteMs || 15000);
  while (Date.now() < fim) {
    try { const v = await fn(); if (v) return v; } catch (e) {}
    await new Promise(function (r) { setTimeout(r, 200); });
  }
  console.log('  (limite) esperei por: ' + oQue);
  return null;
}

async function testarServidor() {
  console.log('\n=== K) PELO SERVIDOR ===');
  const adm = await login('admin', 'TesteLocal#123');
  ok(adm.status === 200, 'login do admin (' + adm.status + ')');

  // Conversa de verdade pelo webhook (abre a janela).
  const telefone = '5511955551111';
  const evento = {
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba-jan', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      metadata: { display_phone_number: '5511900000000', phone_number_id: 'pn-teste-janela' },
      contacts: [{ profile: { name: 'Janela Teste' }, wa_id: telefone }],
      messages: [{ from: telefone, id: 'wamid.JAN1', timestamp: String(Math.floor(Date.now() / 1000)),
                   type: 'text', text: { body: 'tenho interesse' } }]
    } }] }]
  };
  await fetch(BASE + '/webhooks/whatsapp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(evento)
  });
  const naLista = await esperarPor(async function () {
    const j = await jsonGet(adm.cookie, '/api/whatsapp/janela-aberta');
    const c = ((j.corpo && j.corpo.contatos) || []).find(function (x) { return String(x.contact_phone) === telefone; });
    return c || null;
  }, 15000, 'a pessoa aparecer na janela aberta');
  ok(!!naLista, 'quem acabou de escrever aparece na lista');
  ok(naLista && Number(naLista.horas_restantes) > 23, 'com quase 24 horas de janela (' + (naLista && Number(naLista.horas_restantes).toFixed(1)) + 'h)');
  ok(naLista && Number(naLista.respondi_depois) === 0, 'e marcada como "sem resposta minha"');

  const comFiltro = await jsonGet(adm.cookie, '/api/whatsapp/janela-aberta?fechando=true');
  ok(comFiltro.status === 200 && comFiltro.corpo.ok === true, 'o filtro "fechando" responde (' + comFiltro.status + ')');
  const comBusca = await jsonGet(adm.cookie, '/api/whatsapp/janela-aberta?busca=' + encodeURIComponent('Janela Teste'));
  ok(((comBusca.corpo && comBusca.corpo.contatos) || []).length === 1, 'a busca pelo nome acha (' + ((comBusca.corpo && comBusca.corpo.contatos) || []).length + ')');

  // Envio em grupo: a conta do teste nao tem token, entao o envio FALHA na
  // borda da Meta — o que o teste prova aqui e o contrato da rota.
  const env = await jsonPost(adm.cookie, '/api/whatsapp/envio-grupo', {
    conversas: [naLista.conversation_id], texto: 'Ola {nome}, tudo bem?'
  });
  ok(env.status === 202 && env.corpo.ok === true, 'a rota aceita o envio e responde na hora (' + env.status + ')');
  ok(env.corpo.em_segundo_plano === true, 'dizendo que o trabalho vai em segundo plano');
  ok(Number(env.corpo.na_fila) === 1, 'com 1 na fila (' + env.corpo.na_fila + ')');
  const envioId = env.corpo.envio_id;

  const painel = await jsonGet(adm.cookie, '/api/whatsapp/envio-grupo/' + envioId);
  ok(painel.status === 200 && painel.corpo.ok === true, 'o painel do envio responde (' + painel.status + ')');
  ok(painel.corpo.contagem && Number(painel.corpo.contagem.total) === 1, 'com 1 item (' + (painel.corpo.contagem || {}).total + ')');

  const pausa = await jsonPost(adm.cookie, '/api/whatsapp/envio-grupo/' + envioId + '/pausar');
  ok(pausa.status === 200 && pausa.corpo.status === 'pausado', 'pausar funciona (' + pausa.corpo.status + ')');
  const retoma = await jsonPost(adm.cookie, '/api/whatsapp/envio-grupo/' + envioId + '/retomar');
  ok(retoma.status === 200 && retoma.corpo.status === 'ativo', 'retomar funciona (' + retoma.corpo.status + ')');
  const cancela = await jsonPost(adm.cookie, '/api/whatsapp/envio-grupo/' + envioId + '/cancelar');
  ok(cancela.status === 200 && cancela.corpo.status === 'cancelado', 'cancelar funciona (' + cancela.corpo.status + ')');

  const recentes = await jsonGet(adm.cookie, '/api/whatsapp/envio-grupo');
  ok(recentes.status === 200 && Array.isArray(recentes.corpo.envios), 'a lista de envios recentes responde');

  // Seleção vazia e conversa inexistente.
  const vazio = await jsonPost(adm.cookie, '/api/whatsapp/envio-grupo', { conversas: [] });
  ok(vazio.status === 400, 'envio sem ninguem selecionado: 400 (' + vazio.status + ')');
  const inexistente = await jsonPost(adm.cookie, '/api/whatsapp/envio-grupo', { conversas: [999999], texto: 'oi' });
  ok(inexistente.status === 200 && inexistente.corpo.ok === false, 'conversa que nao existe: ok=false, sem quebrar');

  // A Auditoria registrou.
  const aud = await jsonGet(adm.cookie, '/api/whatsapp/audit-logs?limit=30');
  ok(((aud.corpo && aud.corpo.logs) || []).some(function (l) { return /Envio em grupo/i.test(l.action || ''); }),
    'a Auditoria registrou o envio em grupo');

  // Permissao.
  const lc = await login('zecomum', 'Comum#123');
  if (lc.status === 200) {
    const r1 = await jsonGet(lc.cookie, '/api/whatsapp/janela-aberta');
    ok(r1.status === 403, 'quem nao tem a tela recebe 403 na lista (' + r1.status + ')');
    const r2 = await jsonPost(lc.cookie, '/api/whatsapp/envio-grupo', { conversas: [1], texto: 'oi' });
    ok(r2.status === 403, 'e 403 no envio (' + r2.status + ')');
  } else {
    console.log('  (pulado) nao ha conta comum semeada');
  }

  // ── As rotas do selo e dos filtros novos ──
  const comDisparos = await jsonGet(adm.cookie, '/api/whatsapp/janela-aberta');
  ok(Array.isArray(comDisparos.corpo.disparos), 'a lista devolve os disparos para a dica do mouse');
  ok(Array.isArray(comDisparos.corpo.envios), 'e os envios recentes para o bloco "Ultimos envios"');
  const umContato = (comDisparos.corpo.contatos || [])[0] || {};
  ok('disparos_recebidos' in umContato, 'cada linha vem com o contador de disparos recebidos');
  for (const f of ['nunca_recebeu', 'ja_recebeu', 'nao_recebeu_ultimo']) {
    const r = await jsonGet(adm.cookie, '/api/whatsapp/janela-aberta?' + f + '=true');
    ok(r.status === 200 && r.corpo.ok === true, 'o filtro "' + f + '" responde (' + r.status + ')');
  }
  const porEnvio = await jsonGet(adm.cookie, '/api/whatsapp/janela-aberta?nao_recebeu_envio=' + envioId);
  ok(porEnvio.status === 200 && porEnvio.corpo.ok === true, 'o filtro por UM envio responde (' + porEnvio.status + ')');
  const combinado2 = await jsonGet(adm.cookie, '/api/whatsapp/janela-aberta?nunca_recebeu=true&busca=Janela');
  ok(combinado2.status === 200 && (combinado2.corpo.contatos || []).length === 1,
    'combinado com a busca, acha quem nunca recebeu (' + ((combinado2.corpo.contatos || []).length) + ')');

  // ── A conferencia de repeticao ──
  const cf = await jsonPost(adm.cookie, '/api/whatsapp/envio-grupo/conferir', {
    conversas: [naLista.conversation_id], texto: 'Ola {nome}, tudo bem?'
  });
  ok(cf.status === 200 && cf.corpo.ok === true && Array.isArray(cf.corpo.repetidos),
    'a rota que confere repeticao responde (' + cf.status + ')');
  ok(cf.corpo.repetidos.length === 0, 'quem nao recebeu nada nao e acusado de repeticao');
  const cfVazio = await jsonPost(adm.cookie, '/api/whatsapp/envio-grupo/conferir', { conversas: [] });
  ok(cfVazio.status === 200 && cfVazio.corpo.repetidos.length === 0, 'selecao vazia nao quebra a conferencia');
  const cfComum = await login('zecomum', 'Comum#123');
  if (cfComum.status === 200) {
    const r3 = await jsonPost(cfComum.cookie, '/api/whatsapp/envio-grupo/conferir', { conversas: [1], texto: 'oi' });
    ok(r3.status === 403, 'e 403 para quem nao tem a tela (' + r3.status + ')');
  }

  // ── O NOME do envio ──
  const comNome = await jsonPost(adm.cookie, '/api/whatsapp/envio-grupo', {
    conversas: [naLista.conversation_id], texto: 'Com nome escolhido', titulo: 'Entrevista 10h dia 23'
  });
  ok(comNome.status === 202, 'envio com nome escolhido aceito (' + comNome.status + ')');
  const semNome = await jsonPost(adm.cookie, '/api/whatsapp/envio-grupo', {
    conversas: [naLista.conversation_id], texto: 'Sem nome nenhum'
  });
  ok(semNome.status === 202, 'envio sem nome tambem (' + semNome.status + ')');
  const listaEnvios = await jsonGet(adm.cookie, '/api/whatsapp/envio-grupo');
  const titulos = ((listaEnvios.corpo && listaEnvios.corpo.envios) || []).map(function (e) { return e.titulo || ''; });
  ok(titulos.indexOf('Entrevista 10h dia 23') >= 0, 'o nome escolhido fica no historico: ' + JSON.stringify(titulos.slice(0, 3)));
  ok(titulos.some(function (t) { return /^Disparo de \d\d\/\d\d .{1,3} \d\d:\d\d$/.test(t); }),
    'e em branco vira nome automatico com data e hora: ' + JSON.stringify(titulos.slice(0, 3)));

  const saude = await fetch(BASE + '/api/saude').then(r => r.json()).catch(function () { return {}; });
  ok(saude.ok === true, '/api/saude responde');
  ok(saude.envio_grupo && saude.envio_grupo.modulo_carregado === true, 'e diz que o motor de envio em grupo carregou');
}

// ── L) NENHUM CONTADOR OU LIMITE DE MENSAGENS ──────────────────────────────
function testarSemContador() {
  console.log('\n=== L) NENHUM CONTADOR OU LIMITE DE MENSAGENS ===');
  const alvos = ['server.cjs', 'whatsapp-db.cjs', 'whatsapp-api.cjs', 'whatsapp-bot.cjs',
                 'whatsapp-lembretes.cjs', 'whatsapp-envio-grupo.cjs', 'whatsapp-webhook.cjs',
                 'js/whatsapp.js', 'js/whatsapp-bot-ui.js', 'js/whatsapp-respostas-ui.js',
                 'js/whatsapp-lembretes-ui.js', 'js/whatsapp-janela-ui.js'];
  // Padroes de COTA/LIMITE POR QUANTIDADE e de custo. O controle de RITMO
  // (intervalo entre envios, quantos por rodada) nao entra aqui: ele protege o
  // numero e tem que continuar existindo.
  const proibidos = [
    /1\.?000\s*mensagens/i, /mensagens\s+gr[aá]tis/i, /limite\s+de\s+mensagens/i,
    /mensagens\s+(no|do)\s+m[eê]s\b/i, /quota/i, /cobran[cç]a/i, /custo\s+por\s+mensagem/i
  ];
  let achados = 0;
  alvos.forEach(function (arq) {
    let txt = '';
    try { txt = fs.readFileSync(path.join(RAIZ, arq), 'utf8'); } catch (e) { return; }
    proibidos.forEach(function (re) {
      const m = txt.match(re);
      if (m) { achados++; console.log('  (achado) ' + arq + ': ' + m[0]); }
    });
  });
  ok(achados === 0, 'nenhum contador mensal, limite de quantidade ou aviso de custo no sistema');

  // E o controle de ritmo continua lá.
  const g = fs.readFileSync(path.join(RAIZ, 'whatsapp-envio-grupo.cjs'), 'utf8');
  ok(/INTERVALO_MS/.test(g) && /POR_RODADA/.test(g), 'e o controle de ritmo do envio em grupo continua');
  const l = fs.readFileSync(path.join(RAIZ, 'whatsapp-lembretes.cjs'), 'utf8');
  ok(/INTERVALO_ENTRE_ENVIOS_MS/.test(l), 'o dos lembretes tambem');
}

(async () => {
  await testarLista();
  await testarEnvio();
  await testarQuemRecebeu();
  testarSemContador();
  await testarServidor();
  console.log('\n' + (falhas === 0 ? 'JANELA ABERTA + ENVIO EM GRUPO: TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
