// Roda pelo executor da suite:  node testes/rodar.cjs respostas
// Precisa de servidor (nao precisa de navegador).
//
// Cobre as MENSAGENS PRONTAS em tres niveis:
//   A) a regra das 24 HORAS direto no banco -- e a parte que mais engana,
//      porque as datas do SQLite sao UTC num formato proprio e ja houve um
//      bug exatamente por comparar isso em JavaScript (o painel do bot
//      mostrava zero contato "hoje");
//   B) o CATALOGO no state.json: gravar, apagar de verdade (deleteIds) e a
//      permissao por tela conferida no SERVIDOR;
//   C) o CAMINHO REAL pelas rotas: anexo validado pelo conteudo, fora da
//      pasta publica, previa com as variaveis trocadas e envio recusado
//      quando a janela esta fechada.
//
// O que NAO da para testar aqui: o envio de verdade para a Meta. Isso exige
// conta e token reais. O teste cobre tudo ate a borda da API -- de proposito
// a conta do teste nasce sem token, e e isso que faz a rota parar antes de
// chamar a internet.
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

// Espera por CONDICAO, nao por tempo fixo (regra 18): o webhook processa em
// segundo plano e, na execucao completa, a maquina esta ocupada.
async function esperarPor(fn, limiteMs, oQue) {
  const fim = Date.now() + (limiteMs || 15000);
  while (Date.now() < fim) {
    try { const v = await fn(); if (v) return v; } catch (e) { /* tenta de novo */ }
    await new Promise(function (r) { setTimeout(r, 200); });
  }
  console.log('  (limite) esperei ' + ((limiteMs || 15000) / 1000) + 's por: ' + oQue);
  return null;
}

// ── A) A REGRA DAS 24 HORAS, NO BANCO ──────────────────────────────────────
async function testarJanelaNoBanco() {
  console.log('=== A) JANELA DE 24 HORAS (banco proprio, descartavel) ===');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-prontas-'));
  const db = require(path.join(RAIZ, 'whatsapp-db.cjs'));
  await db.init(tmp);

  const acc = db.accounts.create({ phone_number_id: 'pn-prontas', display_phone: '+55 11 90000-0000', status: 'connected' });
  const ct = db.contacts.create({ phone: '5511900000001', name: 'Maria Silva', profile_name: 'Maria' });
  const contactId = (ct && ct.id) ? ct.id : ct;
  const conv = db.conversations.create({ account_id: acc, contact_id: contactId });

  // Conversa em que SO nos falamos: a janela nunca abriu.
  db.messages.create({ conversation_id: conv, account_id: acc, direction: 'outgoing', type: 'text', content: 'oi', wamid: 'w-out-1' });
  ok(!db.messages.ultimaRecebida(conv), 'conversa so com mensagem NOSSA: nao ha janela aberta');

  // Ela respondeu agora.
  db.messages.create({ conversation_id: conv, account_id: acc, direction: 'incoming', type: 'text', content: 'ola', wamid: 'w-in-1' });
  const agora = db.messages.ultimaRecebida(conv);
  ok(agora && Number(agora.horas) < 1, 'mensagem recebida agora: ~0 hora (deu ' + (agora && agora.horas) + ')');

  // 30 horas atras: fechou.
  db.getDb().run("UPDATE whatsapp_messages SET created_at = datetime('now','-30 hours') WHERE wamid = 'w-in-1'");
  const velha = db.messages.ultimaRecebida(conv);
  ok(velha && Number(velha.horas) > 24, 'recebida 30h atras: passa de 24 (deu ' + (velha && Math.round(velha.horas)) + ')');

  // 23 horas: ainda aberta. A borda e o que importa no dia a dia.
  db.getDb().run("UPDATE whatsapp_messages SET created_at = datetime('now','-23 hours') WHERE wamid = 'w-in-1'");
  const borda = db.messages.ultimaRecebida(conv);
  ok(borda && Number(borda.horas) < 24, 'recebida 23h atras: ainda dentro das 24 (deu ' + (borda && Math.round(borda.horas)) + ')');

  // Data gravada no formato ISO (com "T"): a conta tem que valer tambem.
  db.getDb().run("UPDATE whatsapp_messages SET created_at = strftime('%Y-%m-%dT%H:%M:%S','now','-2 hours') WHERE wamid = 'w-in-1'");
  const iso = db.messages.ultimaRecebida(conv);
  ok(iso && Number(iso.horas) > 1.5 && Number(iso.horas) < 2.5,
    'data no formato ISO com "T" tambem conta certo (deu ' + (iso && Number(iso.horas).toFixed(1)) + 'h)');

  // A MAIS RECENTE e que manda.
  db.messages.create({ conversation_id: conv, account_id: acc, direction: 'incoming', type: 'text', content: 'oi de novo', wamid: 'w-in-2' });
  const recente = db.messages.ultimaRecebida(conv);
  ok(recente && Number(recente.horas) < 1, 'chegando mensagem nova, a janela reabre (deu ' + (recente && Number(recente.horas).toFixed(1)) + 'h)');

  // Outra conversa nao contamina.
  const conv2 = db.conversations.create({ account_id: acc, contact_id: contactId, status: 'open' });
  ok(!db.messages.ultimaRecebida(conv2), 'a janela de uma conversa nao vale para outra');

  try { db.close(); } catch (e) {}
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}

// ── B e C) PELO SERVIDOR ───────────────────────────────────────────────────
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
const prontas = async ck => ((await pegar(ck)).dados.respostasRapidas) || [];

async function testarCatalogo(adm) {
  console.log('\n=== B1) O CATALOGO GRAVA COM upsertIds ===');
  const e1 = await pegar(adm.cookie);
  const d1 = e1.dados;
  d1.botWhatsapp = Object.assign({}, d1.botWhatsapp || {}, { linkVagas: 'http://exemplo/vagas' });
  d1.respostasRapidas = [
    { id: 'resp-1', titulo: 'Saudacao', texto: 'Ola {nome}, {saudacao}! Veja {link_vagas}', ordem: 1 },
    { id: 'resp-2', titulo: 'Documentos', texto: 'Precisamos de RG e CPF.', ordem: 2 },
    { id: 'resp-3', titulo: 'Endereco', texto: 'Rua Tal, 100.', ordem: 3 }
  ];
  const g1 = await salvar(adm.cookie, {
    dados: d1, merge: true, upsertIds: ['resp-1', 'resp-2', 'resp-3'],
    setKeys: ['botWhatsapp'], baseVersion: e1.version
  });
  ok(g1.status === 200, 'gravou 3 mensagens prontas (' + g1.status + ')');
  let lista = await prontas(adm.cookie);
  ok(lista.length === 3, 'o servidor tem as 3 (tem ' + lista.length + ')');

  console.log('\n=== B2) EDITAR UMA EXIGE upsertIds (senao o merge ignora) ===');
  const e2 = await pegar(adm.cookie);
  const d2 = e2.dados;
  d2.respostasRapidas.find(r => r.id === 'resp-2').texto = 'Precisamos de RG, CPF e comprovante.';
  await salvar(adm.cookie, { dados: d2, merge: true, upsertIds: ['resp-2'], baseVersion: e2.version });
  lista = await prontas(adm.cookie);
  ok(/comprovante/.test((lista.find(r => r.id === 'resp-2') || {}).texto || ''), 'a edicao valeu');

  console.log('\n=== B3) APAGAR DE VERDADE PRECISA DE deleteIds ===');
  // Sem deleteIds o merge SO JUNTA: o item volta. E por isso que a regra existe.
  const e3 = await pegar(adm.cookie);
  const d3 = e3.dados;
  d3.respostasRapidas = d3.respostasRapidas.filter(r => r.id !== 'resp-3');
  await salvar(adm.cookie, { dados: d3, merge: true, baseVersion: e3.version });
  lista = await prontas(adm.cookie);
  ok(lista.some(r => r.id === 'resp-3'), 'sem deleteIds, o apagado VOLTA (comportamento conhecido do merge)');
  // Com deleteIds, sai de verdade.
  const e4 = await pegar(adm.cookie);
  const d4 = e4.dados;
  d4.respostasRapidas = d4.respostasRapidas.filter(r => r.id !== 'resp-3');
  await salvar(adm.cookie, { dados: d4, merge: true, deleteIds: ['resp-3'], baseVersion: e4.version });
  lista = await prontas(adm.cookie);
  ok(!lista.some(r => r.id === 'resp-3'), 'com deleteIds, sai de verdade (sobraram ' + lista.length + ')');

  console.log('\n=== B4) REORDENAR SOBREVIVE AO SAVE DE OUTRA PESSOA ===');
  const sA = await pegar(adm.cookie);
  const dA = sA.dados;
  dA.respostasRapidas.forEach(function (r) { r.ordem = r.id === 'resp-1' ? 2 : 1; });
  await salvar(adm.cookie, {
    dados: dA, merge: true, upsertIds: dA.respostasRapidas.map(r => r.id), baseVersion: sA.version
  });
  // outra pessoa grava algo DIFERENTE no meio
  const sB = await pegar(adm.cookie);
  const dB = sB.dados;
  dB.candidatos = (dB.candidatos || []).concat([{ id: 'c-prontas-1', nome: 'Alguem' }]);
  await salvar(adm.cookie, { dados: dB, merge: true, upsertIds: ['c-prontas-1'], baseVersion: sB.version });
  lista = await prontas(adm.cookie);
  const ordem1 = (lista.find(r => r.id === 'resp-1') || {}).ordem;
  ok(ordem1 === 2, 'a nova ordem ficou (resp-1 com ordem ' + ordem1 + ')');
  const dep = (await pegar(adm.cookie)).dados;
  ok((dep.candidatos || []).some(c => c.id === 'c-prontas-1'), 'e o que a outra pessoa gravou tambem ficou');
}

async function testarPermissao(adm) {
  console.log('\n=== B5) PERMISSAO CONFERIDA NO SERVIDOR ===');
  const lc = await login('zecomum', 'Comum#123');
  if (lc.status !== 200) { console.log('  (pulado) nao ha conta comum semeada'); return; }

  const rJan = await fetch(BASE + '/api/whatsapp/respostas/conversa/1', { headers: { Cookie: lc.cookie } });
  ok(rJan.status === 403, 'quem nao tem a tela WhatsApp recebe 403 na situacao da conversa (' + rJan.status + ')');
  const rEnv = await fetch(BASE + '/api/whatsapp/respostas/enviar', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: lc.cookie },
    body: JSON.stringify({ conversation_id: 1, resposta_id: 'resp-1' })
  });
  ok(rEnv.status === 403, 'e 403 no envio (' + rEnv.status + ')');
  const rMid = await fetch(BASE + '/api/whatsapp/respostas/midia', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: lc.cookie },
    body: JSON.stringify({ dataUrl: 'data:image/png;base64,AAAA' })
  });
  ok(rMid.status === 403, 'e 403 no envio de anexo (' + rMid.status + ')');

  // E nao consegue mexer no catalogo pelo /api/state (chave da tela WhatsApp).
  const eC = await pegar(lc.cookie);
  const dC = eC.dados;
  dC.respostasRapidas = (dC.respostasRapidas || []).concat([{ id: 'resp-invadida', titulo: 'Invadida', texto: 'nao devia entrar', ordem: 9 }]);
  await salvar(lc.cookie, { dados: dC, merge: true, upsertIds: ['resp-invadida'], baseVersion: eC.version });
  const lista = await prontas(adm.cookie);
  ok(!lista.some(r => r.id === 'resp-invadida'), 'e NAO consegue criar mensagem pronta pelo /api/state');

  // Nem apagar as que existem.
  const eD = await pegar(lc.cookie);
  await salvar(lc.cookie, { dados: eD.dados, merge: true, deleteIds: ['resp-1'], baseVersion: eD.version });
  const lista2 = await prontas(adm.cookie);
  ok(lista2.some(r => r.id === 'resp-1'), 'nem apagar as que existem');
}

async function testarAnexo(adm) {
  console.log('\n=== C1) ANEXO: TIPO PELO CONTEUDO, E FORA DA PASTA PUBLICA ===');
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000100ffabce36890000000049454e44ae426082', 'hex');
  const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n%fake\n', 'latin1'), Buffer.alloc(200, 0x20)]);
  const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const OGG = Buffer.concat([Buffer.from('OggS', 'latin1'), Buffer.alloc(60)]);
  const subir = async function (mime, buf) {
    const r = await fetch(BASE + '/api/whatsapp/respostas/midia', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adm.cookie },
      body: JSON.stringify({ dataUrl: 'data:' + mime + ';base64,' + buf.toString('base64') })
    });
    return { status: r.status, corpo: await r.json().catch(function () { return {}; }) };
  };

  const img = await subir('image/png', PNG);
  ok(img.status === 200, 'imagem PNG aceita (' + img.status + ')');
  ok(img.corpo && img.corpo.tipoAnexo === 'imagem', 'e volta marcada como imagem (' + (img.corpo || {}).tipoAnexo + ')');
  const pdf = await subir('application/pdf', PDF);
  ok(pdf.status === 200, 'PDF aceito (' + pdf.status + ')');
  ok(pdf.corpo && pdf.corpo.tipoAnexo === 'documento', 'e volta marcado como documento (' + (pdf.corpo || {}).tipoAnexo + ')');
  const svgFalso = await subir('image/png', SVG);
  ok(svgFalso.status === 400, 'SVG disfarcado de PNG e RECUSADO (' + svgFalso.status + ')');
  const audio = await subir('audio/ogg', OGG);
  ok(audio.status === 400, 'audio nao entra aqui: so imagem ou PDF (' + audio.status + ')');
  const vazio = await subir('image/png', Buffer.alloc(0));
  ok(vazio.status === 400, 'arquivo vazio e recusado (' + vazio.status + ')');

  if (img.corpo && img.corpo.arquivo) {
    const arq = img.corpo.arquivo;
    const pub = await fetch(BASE + '/uploads/' + arq);
    ok(pub.status !== 200, 'o anexo NAO sai por /uploads/ (' + pub.status + ')');
    const semLogin = await fetch(BASE + '/api/whatsapp/respostas/midia/' + encodeURIComponent(arq));
    ok(semLogin.status === 401 || semLogin.status === 403, 'nem pela rota propria sem sessao (' + semLogin.status + ')');
    const comLogin = await fetch(BASE + '/api/whatsapp/respostas/midia/' + encodeURIComponent(arq), { headers: { Cookie: adm.cookie } });
    ok(comLogin.status === 200, 'mas o admin consegue ver (' + comLogin.status + ')');
    ok(/nosniff/i.test(comLogin.headers.get('x-content-type-options') || ''), 'e vem com nosniff');
    ok(/image\/png/i.test(comLogin.headers.get('content-type') || ''), 'com o tipo certo (' + comLogin.headers.get('content-type') + ')');
    const fuga = await fetch(BASE + '/api/whatsapp/respostas/midia/' + encodeURIComponent('../state.json'), { headers: { Cookie: adm.cookie } });
    ok(fuga.status !== 200, 'tentar sair da pasta com ".." nao funciona (' + fuga.status + ')');
    // A pasta e a mesma da midia do bot, que tem portao proprio (tela 'bot'):
    // esta rota NAO pode servir de atalho para ler aquela.
    const doBot = await fetch(BASE + '/api/whatsapp/respostas/midia/' + encodeURIComponent('bot_imagem_123.png'), { headers: { Cookie: adm.cookie } });
    ok(doBot.status === 404, 'arquivo que nao e de mensagem pronta nao sai por esta rota (' + doBot.status + ')');
  }

  console.log('\n=== C2) O ANEXO FICA NA AUDITORIA ===');
  const aud = await fetch(BASE + '/api/whatsapp/audit-logs?limit=50', { headers: { Cookie: adm.cookie } })
    .then(r => r.json()).catch(function () { return {}; });
  const logs = (aud && aud.logs) || [];
  ok(logs.some(l => /anexo de mensagem pronta/i.test(l.action || '')), 'o envio do anexo foi registrado');
}

async function testarPreviaEEnvio(adm) {
  console.log('\n=== C3) PREVIA: AS VARIAVEIS JA TROCADAS ===');
  // Sem conversa: {nome} vazio nao pode deixar virgula orfa.
  const p1 = await fetch(BASE + '/api/whatsapp/respostas/previa', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adm.cookie },
    body: JSON.stringify({ resposta_id: 'resp-1', conversation_id: 0 })
  }).then(r => r.json()).catch(function () { return {}; });
  ok(p1.ok === true, 'a previa responde (' + JSON.stringify(p1).slice(0, 80) + ')');
  ok(!/\{/.test(p1.texto || 'x{'), 'nao sobra nenhuma chave no texto: ' + JSON.stringify(p1.texto));
  ok(/exemplo\/vagas/.test(p1.texto || ''), 'o link das vagas entrou');
  ok(/^(Bom dia|Boa tarde|Boa noite)/i.test(String(p1.texto || '').replace(/^Ola,?\s*/i, '')) ||
     /(bom dia|boa tarde|boa noite)/i.test(p1.texto || ''), 'a saudacao virou texto do horario');
  ok(!/\s,/.test(p1.texto || ''), 'sem nome, nao fica virgula solta: ' + JSON.stringify(p1.texto));

  const p2 = await fetch(BASE + '/api/whatsapp/respostas/previa', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adm.cookie },
    body: JSON.stringify({ resposta_id: 'nao-existe', conversation_id: 0 })
  });
  ok(p2.status === 404, 'previa de mensagem que nao existe: 404 (' + p2.status + ')');

  console.log('\n=== C4) JANELA FECHADA: A ROTA RECUSA ANTES DE CHAMAR A META ===');
  const jan = await fetch(BASE + '/api/whatsapp/respostas/conversa/999999', { headers: { Cookie: adm.cookie } })
    .then(r => r.json()).catch(function () { return {}; });
  ok(jan.ok === true && jan.janela && jan.janela.aberta === false,
    'conversa que nao existe: janela FECHADA (na duvida, nao envia)');
  const env404 = await fetch(BASE + '/api/whatsapp/respostas/enviar', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adm.cookie },
    body: JSON.stringify({ conversation_id: 999999, resposta_id: 'resp-1' })
  });
  ok(env404.status === 404, 'enviar numa conversa que nao existe: 404 (' + env404.status + ')');
  const envVazio = await fetch(BASE + '/api/whatsapp/respostas/enviar', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adm.cookie },
    body: JSON.stringify({})
  });
  ok(envVazio.status === 400, 'enviar sem dizer o que: 400 (' + envVazio.status + ')');

  console.log('\n=== C5) MENSAGEM RECEBIDA ABRE A JANELA (caminho real, pelo webhook) ===');
  const telefone = '5511977776666';
  const evento = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'waba-teste',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '5511900000000', phone_number_id: 'pn-teste-prontas' },
          contacts: [{ profile: { name: 'Maria Silva' }, wa_id: telefone }],
          messages: [{ from: telefone, id: 'wamid.PRONTAS1', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'oi, quero saber das vagas' } }]
        }
      }]
    }]
  };
  const wh = await fetch(BASE + '/webhooks/whatsapp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(evento)
  });
  ok(wh.status === 200, 'o webhook aceitou o evento (' + wh.status + ')');

  const conv = await esperarPor(async function () {
    const j = await fetch(BASE + '/api/whatsapp/conversations?limit=50', { headers: { Cookie: adm.cookie } }).then(r => r.json());
    const lista = (j && (j.conversations || j.data || j.lista)) || [];
    return lista.find(function (c) { return String(c.contact_phone || '') === telefone; }) || null;
  }, 15000, 'a conversa aparecer');
  ok(!!conv, 'a conversa foi criada pela mensagem recebida');

  if (conv) {
    const jan2 = await fetch(BASE + '/api/whatsapp/respostas/conversa/' + conv.id, { headers: { Cookie: adm.cookie } })
      .then(r => r.json()).catch(function () { return {}; });
    ok(jan2.janela && jan2.janela.aberta === true, 'a janela de 24h esta ABERTA (horas: ' + (jan2.janela || {}).horas + ')');
    ok(jan2.janela && Number(jan2.janela.restam) > 23, 'e restam quase 24 horas (' + (jan2.janela || {}).restam + ')');

    // A conta criada pelo webhook nasce SEM token: a rota tem que parar aqui,
    // com recado claro, e nao tentar falar com a Meta.
    const env = await fetch(BASE + '/api/whatsapp/respostas/enviar', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adm.cookie },
      body: JSON.stringify({ conversation_id: conv.id, resposta_id: 'resp-1' })
    });
    const je = await env.json().catch(function () { return {}; });
    ok(env.status === 200 && je.ok === false, 'sem token, responde sem quebrar, com ok=false (' + env.status + ')');
    ok(/conectada|conta/i.test(je.error || ''), 'e o recado fala da conta: "' + (je.error || '') + '"');
  }
}

async function testarServidorDePe() {
  console.log('\n=== C6) SERVIDOR DE PE NO FIM ===');
  const vivo = await fetch(BASE + '/api/time');
  ok(vivo.status === 200, 'servidor respondendo (' + vivo.status + ')');
  const saude = await fetch(BASE + '/api/saude').then(r => r.json()).catch(function () { return {}; });
  ok(saude.ok === true, '/api/saude diz que esta tudo de pe');
}

(async () => {
  await testarJanelaNoBanco();
  const adm = await login('admin', 'TesteLocal#123');
  ok(adm.status === 200, 'login do admin (' + adm.status + ')');
  await testarCatalogo(adm);
  await testarPermissao(adm);
  await testarAnexo(adm);
  await testarPreviaEEnvio(adm);
  await testarServidorDePe();
  console.log('\n' + (falhas === 0 ? 'MENSAGENS PRONTAS: TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
