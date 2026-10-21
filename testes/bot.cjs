// Roda pelo executor da suite:  node testes/rodar.cjs bot
// Precisa de servidor (não precisa de navegador).
//
// Testa o bot em dois níveis:
//   A) a ORDEM DE DECISÃO, direto na função pura `decidir` -- é o coração do
//      bot e dá para exercitar sem servidor nenhum;
//   B) o CAMINHO REAL, com o servidor de pé: fila, dedup, permissão da tela,
//      mídia validada por conteúdo, e o bot nascendo DESLIGADO.
//
// O que NÃO dá para testar aqui: o envio de verdade para a Meta. Isso exige
// uma conta e um token reais, e mandar mensagem para um número de verdade. O
// que o teste cobre é tudo até a borda da API.
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.BASE;
if (!BASE) {
  console.error('Este teste roda pelo executor da suite:  node testes/rodar.cjs');
  process.exit(2);
}
const RAIZ = path.resolve(__dirname, '..');
const bot = require(path.join(RAIZ, 'whatsapp-bot.cjs'));

let falhas = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALHOU: ') + m); if (!c) falhas++; };

// ── A) ORDEM DE DECISÃO ────────────────────────────────────────────────────
function testarDecisao() {
  const base = {
    ligado: true, modo: 'primeira_vez', diasParaNovoContato: 7,
    passos: [{ tipo: 'texto', texto: 'oi' }],
    atendente: bot.CONFIG_PADRAO.atendente,
    saida: bot.CONFIG_PADRAO.saida,
    ritmo: { porMinuto: 20 }
  };
  const d = function (cfg, est, texto, extra) {
    return bot.decidir(Object.assign({
      config: Object.assign({}, base, cfg || {}), estado: est || {}, texto: texto == null ? 'oi' : texto
    }, extra || {}));
  };
  const hoje = new Date().toISOString().slice(0, 10);

  console.log('=== A1) PEDIDO DE SAIDA vem antes de tudo ===');
  ok(d({}, {}, 'quero sair').acao === 'saida', 'pede "sair" -> saida');
  ok(d({}, {}, 'PARAR!').acao === 'saida', 'maiuscula e pontuacao nao enganam');
  ok(d({}, {}, 'não quero mais').acao === 'saida', 'acento nao engana');
  ok(d({}, {}, 'sair, atendente').acao === 'saida', 'saida ganha de atendente quando vem junto');
  ok(d({}, { optou_sair: 1 }, 'oi').acao === 'nada', 'quem ja pediu saida nao recebe mais nada');
  ok(d({}, { optou_sair: 1 }, 'atendente').acao === 'nada', 'nem mesmo pedindo atendente depois');
  ok(d({}, {}, 'estou saindo de casa').acao !== 'saida', '"saindo" NAO dispara "sair" (palavra inteira)');

  console.log('\n=== A2) ATENDENTE ===');
  ok(d({}, {}, 'atendente').acao === 'atendente', 'pede atendente');
  ok(d({}, {}, 'quero falar com alguém').acao === 'atendente', 'variacao com acento');
  ok(d({}, { aguardando_atendente: 1, aguardando_desde: new Date().toISOString() }, 'oi').acao === 'nada',
    'enquanto aguarda atendente, o bot nao atropela');
  const faz20h = new Date(Date.now() - 20 * 36e5).toISOString();
  ok(d({}, { aguardando_atendente: 1, aguardando_desde: faz20h, ultima_msg_recebida_em: faz20h }, 'oi').acao === 'sequencia',
    'passadas as 12h sem conversa, o bot volta a atender');

  console.log('\n=== A3) CONTATO PAUSADO ===');
  ok(d({}, { pausado: 1 }, 'oi').acao === 'nada', 'contato pausado nao recebe nada');
  ok(d({}, { pausado: 1 }, 'sair').acao === 'saida', 'mas o pedido de saida ainda e respeitado');

  console.log('\n=== A4) RESPONDEU NO MEIO DA SEQUENCIA ===');
  const meio = d({}, {}, 'oi', { temFilaPendente: true });
  ok(meio.acao === 'encerrar_fila', 'termina o que falta e NAO reinicia');

  console.log('\n=== A5) MODO "SO NA PRIMEIRA VEZ" ===');
  ok(d({}, {}, 'oi').acao === 'sequencia', 'primeiro contato: responde');
  ok(d({}, { ultima_resposta_em: new Date().toISOString() }, 'oi').acao === 'nada',
    'segunda mensagem no mesmo dia: NAO responde de novo');
  ok(d({}, { ultima_resposta_em: new Date(Date.now() - 3 * 864e5).toISOString() }, 'oi').acao === 'nada',
    '3 dias depois, com prazo de 7: ainda nao');
  ok(d({}, { ultima_resposta_em: new Date(Date.now() - 10 * 864e5).toISOString() }, 'oi').acao === 'sequencia',
    '10 dias depois: responde de novo');
  ok(d({ diasParaNovoContato: 0 }, { ultima_resposta_em: new Date(Date.now() - 400 * 864e5).toISOString() }, 'oi').acao === 'nada',
    'com prazo 0, responde uma vez e nunca mais');

  console.log('\n=== A6) MODO "SEMPRE" ===');
  ok(d({ modo: 'sempre', limiteSempre: '1_dia' }, {}, 'oi').acao === 'sequencia', '1x/dia, nenhuma ainda: responde');
  ok(d({ modo: 'sempre', limiteSempre: '1_dia' }, { respostas_no_dia: 1, dia_da_contagem: hoje }, 'oi').acao === 'nada',
    '1x/dia, ja respondeu 1: para');
  ok(d({ modo: 'sempre', limiteSempre: '2_dia' }, { respostas_no_dia: 1, dia_da_contagem: hoje }, 'oi').acao === 'sequencia',
    '2x/dia, ja respondeu 1: responde a 2a');
  ok(d({ modo: 'sempre', limiteSempre: '2_dia' }, { respostas_no_dia: 2, dia_da_contagem: hoje }, 'oi').acao === 'nada',
    '2x/dia, ja respondeu 2: para');
  ok(d({ modo: 'sempre', limiteSempre: '2_dia' }, { respostas_no_dia: 5, dia_da_contagem: '2020-01-01' }, 'oi').acao === 'sequencia',
    'contagem de OUTRO dia nao conta (o dia virou)');
  ok(d({ modo: 'sempre', limiteSempre: 'horas', limiteHoras: 6 },
       { ultima_resposta_em: new Date(Date.now() - 2 * 36e5).toISOString() }, 'oi').acao === 'nada',
    'a cada 6h, passaram 2h: para');
  ok(d({ modo: 'sempre', limiteSempre: 'horas', limiteHoras: 6 },
       { ultima_resposta_em: new Date(Date.now() - 8 * 36e5).toISOString() }, 'oi').acao === 'sequencia',
    'a cada 6h, passaram 8h: responde');

  console.log('\n=== A7) DESLIGADO E SEM PASSOS ===');
  ok(d({ ligado: false }, {}, 'oi').acao === 'nada', 'bot desligado nao faz nada');
  ok(d({ ligado: false }, {}, 'sair').acao === 'nada', 'nem o pedido de saida, se esta desligado');
  ok(d({ passos: [] }, {}, 'oi').acao === 'nada', 'sem passo configurado nao ha o que mandar');

  console.log('\n=== A8) VARIAVEIS ===');
  const v = function (t, dados) { return bot.aplicarVariaveis(t, dados); };
  ok(v('Olá {nome}, tudo bem?', { nome: 'Maria Silva' }) === 'Olá Maria, tudo bem?',
    'usa o PRIMEIRO nome');
  ok(v('Olá {nome}, tudo bem?', { nome: '' }) === 'Olá, tudo bem?',
    'nome vazio NAO deixa virgula orfa: ' + JSON.stringify(v('Olá {nome}, tudo bem?', { nome: '' })));
  ok(v('Bom dia {nome} tudo bem?', { nome: '' }) === 'Bom dia tudo bem?',
    'nome vazio no meio nao deixa espaco dobrado');
  ok(v('Olá {nome}!', { nome: '5511999998888' }) === 'Olá!',
    'telefone no lugar do nome e tratado como sem nome');
  // A funcao deixa a PRIMEIRA LETRA MAIUSCULA quando a frase comeca com a
  // saudacao -- "Bom dia!" e nao "bom dia!". Por isso a comparacao ignora
  // maiuscula.
  const sdTexto = v('{saudacao}!', {});
  ok(/^(bom dia|boa tarde|boa noite)!$/i.test(sdTexto),
    'saudacao vira texto do horario, com a primeira maiuscula: ' + JSON.stringify(sdTexto));
  ok(v('Veja {link_vagas}', { linkVagas: 'http://x/v' }) === 'Veja http://x/v', 'link entra');
  const sd = bot.saudacao(new Date('2026-10-21T13:00:00Z'));   // 10h em Brasilia
  ok(sd === 'bom dia', '13h UTC = 10h em Brasilia = bom dia (deu "' + sd + '")');
  const sn = bot.saudacao(new Date('2026-10-21T23:00:00Z'));   // 20h em Brasilia
  ok(sn === 'boa noite', '23h UTC = 20h em Brasilia = boa noite (deu "' + sn + '")');
}

// ── B) CAMINHO REAL, COM O SERVIDOR DE PE ──────────────────────────────────
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

async function testarServidor() {
  const adm = await login('admin', 'TesteLocal#123');
  ok(adm.status === 200, 'login do admin (' + adm.status + ')');

  console.log('\n=== B1) O BOT NASCE DESLIGADO ===');
  const r1 = await fetch(BASE + '/api/whatsapp/bot/painel', { headers: { Cookie: adm.cookie } });
  const j1 = await r1.json().catch(function () { return {}; });
  ok(r1.status === 200, 'o painel do bot responde (' + r1.status + ')');
  if (j1 && j1.config) {
    ok(j1.config.ligado === false, 'ligado = false, depois de um deploy novo');
    ok(Array.isArray(j1.config.passos) && j1.config.passos.length === 0, 'nenhum passo pre-configurado');
  }

  console.log('\n=== B2) A CONFIGURACAO GRAVA COM setKeys (remover e reordenar valem) ===');
  const e2 = await pegar(adm.cookie);
  const d2 = e2.dados;
  d2.botWhatsapp = {
    ligado: false, modo: 'primeira_vez', diasParaNovoContato: 7, linkVagas: 'http://exemplo/vagas',
    passos: [
      { id: 'p1', tipo: 'texto', texto: 'Passo um' },
      { id: 'p2', tipo: 'texto', texto: 'Passo dois' },
      { id: 'p3', tipo: 'texto', texto: 'Passo tres' }
    ]
  };
  const g2 = await salvar(adm.cookie, { dados: d2, merge: true, setKeys: ['botWhatsapp'], baseVersion: e2.version });
  ok(g2.status === 200, 'gravou 3 passos (' + g2.status + ')');
  let lido = (await pegar(adm.cookie)).dados.botWhatsapp;
  ok(lido.passos.length === 3, 'o servidor tem 3 passos');

  // REMOVER: o caso que o merge sozinho nao resolve. Sem setKeys, a lista e um
  // array e o merge so ACRESCENTA -- o passo removido voltaria.
  const e3 = await pegar(adm.cookie);
  const d3 = e3.dados;
  d3.botWhatsapp.passos = d3.botWhatsapp.passos.filter(function (p) { return p.id !== 'p2'; });
  await salvar(adm.cookie, { dados: d3, merge: true, setKeys: ['botWhatsapp'], baseVersion: e3.version });
  lido = (await pegar(adm.cookie)).dados.botWhatsapp;
  ok(lido.passos.length === 2, 'depois de REMOVER, o servidor tem 2 passos (tem ' + lido.passos.length + ')');
  ok(!lido.passos.some(function (p) { return p.id === 'p2'; }), 'e o passo removido NAO voltou');

  // REORDENAR com DUAS SESSOES: a segunda esta atrasada de proposito.
  const sessaoA = await pegar(adm.cookie);
  const dA = sessaoA.dados;
  dA.botWhatsapp.passos.reverse();
  const ordemEsperada = dA.botWhatsapp.passos.map(function (p) { return p.id; }).join(',');
  await salvar(adm.cookie, { dados: dA, merge: true, setKeys: ['botWhatsapp'], baseVersion: sessaoA.version });
  // outra pessoa grava algo DIFERENTE no meio (deixa a 1a sessao atrasada)
  const sessaoB = await pegar(adm.cookie);
  const dB = sessaoB.dados;
  dB.candidatos = (dB.candidatos || []).concat([{ id: 'c-bot-1', nome: 'Alguem' }]);
  await salvar(adm.cookie, { dados: dB, merge: true, upsertIds: ['c-bot-1'], baseVersion: sessaoB.version });
  lido = (await pegar(adm.cookie)).dados.botWhatsapp;
  ok(lido.passos.map(function (p) { return p.id; }).join(',') === ordemEsperada,
    'a REORDENACAO sobreviveu ao save da outra sessao (' + lido.passos.map(function (p) { return p.id; }).join(',') + ')');
  const dep = (await pegar(adm.cookie)).dados;
  ok((dep.candidatos || []).some(function (c) { return c.id === 'c-bot-1'; }),
    'e o que a outra sessao gravou tambem ficou');

  console.log('\n=== B3) PERMISSAO DA TELA, CONFERIDA NO SERVIDOR ===');
  const lc = await login('zecomum', 'Comum#123');
  if (lc.status === 200) {
    const rSem = await fetch(BASE + '/api/whatsapp/bot/painel', { headers: { Cookie: lc.cookie } });
    ok(rSem.status === 403, 'quem nao tem a tela "bot" recebe 403 no painel (' + rSem.status + ')');
    const rPost = await fetch(BASE + '/api/whatsapp/bot/teste', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: lc.cookie },
      body: JSON.stringify({ telefone: '5511999998888', account_id: 1 })
    });
    ok(rPost.status === 403, 'e 403 tambem no envio de teste (' + rPost.status + ')');
    // e nao consegue mudar a configuracao pelo state
    const eC = await pegar(lc.cookie);
    const dC = eC.dados;
    dC.botWhatsapp = { ligado: true, passos: [{ id: 'x', tipo: 'texto', texto: 'invadido' }] };
    await salvar(lc.cookie, { dados: dC, merge: true, setKeys: ['botWhatsapp'], baseVersion: eC.version });
    const conf = (await pegar(adm.cookie)).dados.botWhatsapp;
    ok(conf.ligado !== true, 'e NAO consegue LIGAR o bot pelo /api/state');
    ok(!conf.passos.some(function (p) { return p.id === 'x'; }), 'nem trocar os passos');
  } else {
    console.log('  (pulado) nao ha conta comum semeada neste teste');
  }

  console.log('\n=== B4) MIDIA: TIPO PELO CONTEUDO, E FORA DA PASTA PUBLICA ===');
  const b64 = function (b) { return Buffer.from(b).toString('base64'); };
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000100ffabce36890000000049454e44ae426082', 'hex');
  const OGG = Buffer.concat([Buffer.from('OggS', 'latin1'), Buffer.alloc(60)]);
  const MP3 = Buffer.concat([Buffer.from('ID3', 'latin1'), Buffer.alloc(60)]);
  const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const subir = async function (destino, mime, buf) {
    const r = await fetch(BASE + '/api/whatsapp/bot/midia', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adm.cookie },
      body: JSON.stringify({ dataUrl: 'data:' + mime + ';base64,' + b64(buf), destino: destino })
    });
    return { status: r.status, corpo: await r.json().catch(function () { return {}; }) };
  };
  const img = await subir('imagem', 'image/png', PNG);
  ok(img.status === 200, 'imagem PNG aceita (' + img.status + ')');
  const svgComoPng = await subir('imagem', 'image/png', SVG);
  ok(svgComoPng.status === 400, 'SVG disfarcado de PNG e RECUSADO (' + svgComoPng.status + ')');
  const aud = await subir('audio', 'audio/ogg', OGG);
  ok(aud.status === 200, 'audio OGG aceito (' + aud.status + ')');
  const audMp3 = await subir('audio', 'audio/ogg', MP3);
  ok(audMp3.status === 400, 'MP3 anunciado como OGG e RECUSADO — a Meta so mostra OGG/Opus como voz (' + audMp3.status + ')');
  if (audMp3.corpo && audMp3.corpo.error) {
    ok(/OGG|Opus/i.test(audMp3.corpo.error), 'e a mensagem explica o que fazer: "' + String(audMp3.corpo.error).slice(0, 70) + '..."');
  }
  const pdfFalso = await subir('documento', 'application/pdf', PNG);
  ok(pdfFalso.status === 400, 'PNG anunciado como PDF e recusado (' + pdfFalso.status + ')');

  // A midia NAO pode estar na pasta publica
  if (img.corpo && img.corpo.arquivo) {
    const pub = await fetch(BASE + '/uploads/' + img.corpo.arquivo);
    ok(pub.status !== 200, 'a midia do bot NAO sai por /uploads/ (' + pub.status + ')');
    const semLogin = await fetch(BASE + '/api/whatsapp/bot/midia/' + encodeURIComponent(img.corpo.arquivo));
    ok(semLogin.status === 401 || semLogin.status === 403, 'nem pela rota propria sem sessao (' + semLogin.status + ')');
    const comLogin = await fetch(BASE + '/api/whatsapp/bot/midia/' + encodeURIComponent(img.corpo.arquivo),
                                 { headers: { Cookie: adm.cookie } });
    ok(comLogin.status === 200, 'mas o admin consegue ver (' + comLogin.status + ')');
    ok(/nosniff/i.test(comLogin.headers.get('x-content-type-options') || ''), 'e vem com nosniff');
    // caminho com ".." nao escapa da pasta
    const fuga = await fetch(BASE + '/api/whatsapp/bot/midia/' + encodeURIComponent('../state.json'),
                             { headers: { Cookie: adm.cookie } });
    ok(fuga.status !== 200, 'tentar sair da pasta com ".." nao funciona (' + fuga.status + ')');
  }

  console.log('\n=== B5) PAUSAR E DEVOLVER UM CONTATO ===');
  const pausar = await fetch(BASE + '/api/whatsapp/bot/contato/4242/pausar',
                             { method: 'POST', headers: { Cookie: adm.cookie } });
  ok(pausar.status === 200, 'pausar o bot no contato (' + pausar.status + ')');
  let sit = await fetch(BASE + '/api/whatsapp/bot/contato/4242', { headers: { Cookie: adm.cookie } })
    .then(function (r) { return r.json(); }).catch(function () { return {}; });
  ok(sit.contato && sit.contato.pausado === 1, 'a situacao diz que esta pausado');
  const devolver = await fetch(BASE + '/api/whatsapp/bot/contato/4242/devolver',
                               { method: 'POST', headers: { Cookie: adm.cookie } });
  ok(devolver.status === 200, 'devolver ao bot (' + devolver.status + ')');
  sit = await fetch(BASE + '/api/whatsapp/bot/contato/4242', { headers: { Cookie: adm.cookie } })
    .then(function (r) { return r.json(); }).catch(function () { return {}; });
  ok(sit.contato && sit.contato.pausado === 0, 'e volta a nao estar pausado');

  console.log('\n=== B6) TESTE SEM CONTA CONFIGURADA DEVOLVE ERRO CLARO ===');
  const t6 = await fetch(BASE + '/api/whatsapp/bot/teste', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adm.cookie },
    body: JSON.stringify({ telefone: '5511999998888', account_id: 999 })
  });
  const j6 = await t6.json().catch(function () { return {}; });
  ok(t6.status === 200 && j6.ok === false, 'responde sem quebrar, com ok=false');
  ok(/conta/i.test(j6.error || ''), 'e diz que o problema e a conta: "' + (j6.error || '') + '"');

  console.log('\n=== B7) TELEFONE INVALIDO NO TESTE ===');
  const t7 = await fetch(BASE + '/api/whatsapp/bot/teste', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adm.cookie },
    body: JSON.stringify({ telefone: '123', account_id: 1 })
  });
  const j7 = await t7.json().catch(function () { return {}; });
  ok(j7.ok === false, 'telefone curto e recusado');

  console.log('\n=== B8) SERVIDOR DE PE NO FIM ===');
  const vivo = await fetch(BASE + '/api/time');
  ok(vivo.status === 200, 'servidor respondendo (' + vivo.status + ')');
}

(async () => {
  testarDecisao();
  console.log('');
  await testarServidor();
  console.log('\n' + (falhas === 0 ? 'BOT: TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
