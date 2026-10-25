// Roda pelo executor da suite:  node testes/rodar.cjs
// O executor sobe um servidor isolado numa porta livre e passa o endereco
// em BASE (e a porta do navegador em CDP, quando a suite precisa de tela).
// TESTES DA ETAPA 1 — seguranca e estabilidade
const crypto = require('crypto');
const BASE = process.env.BASE || BASE;
const sha = s => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');

let falhas = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALHOU: ') + m); if (!c) falhas++; };

const vivo = async () => {
  try {
    const r = await fetch(BASE + '/api/time', { signal: AbortSignal.timeout(4000) });
    return r.status;
  } catch (e) { return 0; }
};
async function login(l, s) {
  const r = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: l, senha: s })
  });
  return { status: r.status, cookie: r.headers.get('set-cookie') };
}
const pegarEstado = async ck => (await fetch(BASE + '/api/state', { headers: ck ? { Cookie: ck } : {} }).then(r => r.json()));
const salvar = async (ck, corpo) => {
  const r = await fetch(BASE + '/api/state', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck },
    body: JSON.stringify(corpo)
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};

(async () => {
  console.log('=== 1) URL MAL FORMADA NAO DERRUBA O SERVIDOR ===');
  console.log('servidor antes:', await vivo());
  for (const alvo of ['/%', '/%E0%A4%A', '/api/status-senha?token=%', '/api/whatsapp/conversations/%', '/uploads/%']) {
    let st = 0;
    try { st = (await fetch(BASE + alvo, { signal: AbortSignal.timeout(4000) })).status; } catch (e) { st = 0; }
    const depois = await vivo();
    ok(depois === 200, alvo + ' -> respondeu ' + st + ' e o servidor CONTINUA de pe (' + depois + ')');
  }

  console.log('\n=== 2) O HASH DA SENHA NAO SAI MAIS NO GET /api/state ===');
  const la = await login('admin', 'TesteLocal#123');
  ok(la.status === 200, 'login do admin (' + la.status + ')');
  const est = await pegarEstado(la.cookie);
  const fs_ = (est.dados || {}).funcionarios || [];
  const comSenha = fs_.filter(f => f && f.senha !== undefined);
  ok(comSenha.length === 0, 'nenhum funcionario traz o campo "senha" (traziam: ' + comSenha.map(f => f.login).join(',') + ')');
  const temInd = fs_.some(f => f && (f.temSenha !== undefined || f.senhaConhecida !== undefined));
  ok(temInd, 'a tela ainda recebe o indicador (temSenha / senhaConhecida)');

  console.log('\n=== 3) FUNCIONARIO COMUM NAO MUDA O PROPRIO ACESSO ===');
  const lc = await login('zecomum', 'Comum#123');
  ok(lc.status === 200, 'login do funcionario comum (' + lc.status + ')');
  const e2 = await pegarEstado(lc.cookie);
  const d2 = e2.dados;
  const eu = d2.funcionarios.find(f => f.login === 'zecomum');
  ok(!!eu, 'achei o proprio registro');
  eu.departamento = 'administracao';
  eu.permissoes = { sistema: { visualizar: true, perms: true } };
  eu.podeVerSenhas = true;
  eu.status = 'ativo';
  const r3 = await salvar(lc.cookie, { dados: d2, merge: true, upsertIds: [eu.id], baseVersion: e2.version });
  ok(r3.status === 200, 'o save foi aceito (nao precisa dar erro, o servidor so ignora o que nao pode)');
  const depois3 = await pegarEstado(la.cookie);
  const euDepois = depois3.dados.funcionarios.find(f => f.login === 'zecomum');
  ok(euDepois.departamento === 'selecao', 'departamento CONTINUA "selecao" (ficou: ' + euDepois.departamento + ')');
  ok(!euDepois.podeVerSenhas, 'podeVerSenhas continua desligado');
  const permSis = (euDepois.permissoes || {}).sistema || {};
  ok(!permSis.perms, 'nao ganhou permissao de "sistema/perms"');

  console.log('\n=== 4) FUNCIONARIO COMUM NAO TROCA A SENHA DA CONTA MESTRE ===');
  const e4 = await pegarEstado(lc.cookie);
  const d4 = e4.dados;
  const mestre = d4.funcionarios.find(f => f.login === 'joaobalaf');
  ok(!!mestre, 'achei a conta mestre na lista');
  mestre.senha = sha('invadido123');
  const r4 = await salvar(lc.cookie, { dados: d4, merge: true, upsertIds: [mestre.id], baseVersion: e4.version });
  ok(r4.status === 200, 'save aceito');
  const tent = await login('joaobalaf', 'invadido123');
  ok(tent.status !== 200, 'NAO consegue entrar como mestre com a senha trocada (status ' + tent.status + ')');
  const originalAindaVale = await login('joaobalaf', 'Mestre#123');
  ok(originalAindaVale.status === 200, 'e a senha original do mestre continua valendo (' + originalAindaVale.status + ')');

  console.log('\n=== 5) ADMIN AINDA CONSEGUE MUDAR ACESSO (nao quebrei a tela) ===');
  const e5 = await pegarEstado(la.cookie);
  const d5 = e5.dados;
  const alvo5 = d5.funcionarios.find(f => f.login === 'zecomum');
  alvo5.permissoes = Object.assign({}, alvo5.permissoes, { vagas: { visualizar: true, criar: true } });
  await salvar(la.cookie, { dados: d5, merge: true, upsertIds: [alvo5.id], baseVersion: e5.version });
  const d5b = (await pegarEstado(la.cookie)).dados;
  const alvo5b = d5b.funcionarios.find(f => f.login === 'zecomum');
  ok(!!((alvo5b.permissoes || {}).vagas || {}).criar, 'admin conseguiu conceder permissao de vagas');

  console.log('\n=== 6) UPLOAD ===');
  const imgPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
  const htmlMau = 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==';
  const subir = async (ck, dataUrl) => {
    const r = await fetch(BASE + '/api/upload', {
      method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, ck ? { Cookie: ck } : {}),
      body: JSON.stringify({ dataUrl: dataUrl, hint: 'teste' })
    });
    return { status: r.status, corpo: await r.json().catch(() => ({})) };
  };
  const anonHtml = await subir(null, htmlMau);
  ok(anonHtml.status === 400, 'SEM login, HTML e RECUSADO (' + anonHtml.status + ')');
  const anonImg = await subir(null, imgPng);
  ok(anonImg.status === 200, 'SEM login, imagem passa — a ficha publica de candidato depende disso (' + anonImg.status + ')');
  // HTML passou a ser recusado TAMBEM para quem esta logado: nenhum fluxo do
  // sistema sobe HTML, e e exatamente o arquivo que viraria pagina no proprio
  // dominio. A conferencia detalhada do upload (tipo pelo conteudo, SVG,
  // nosniff) vive na suite "upload".
  const logHtml = await subir(la.cookie, htmlMau);
  ok(logHtml.status === 400, 'COM login, HTML tambem e RECUSADO (' + logHtml.status + ')');

  console.log('\n=== 7) /uploads/ ENTREGA FOTO INLINE E O RESTO COMO ANEXO ===');
  if (anonImg.corpo && anonImg.corpo.url) {
    const r7b = await fetch(BASE + anonImg.corpo.url);
    const ct2 = r7b.headers.get('content-type') || '';
    const cd2 = r7b.headers.get('content-disposition') || '';
    ok(/image\//i.test(ct2), 'imagem continua saindo como ' + ct2 + ' (a tela mostra foto no <img>)');
    ok(!/attachment/i.test(cd2), 'imagem NAO vem como anexo, senao a foto nao aparece na tela');
  }

  console.log('\n=== 8) ADMIN AINDA CRIA COLABORADOR COM SENHA (tela de Funcionarios) ===');
  const e8 = await pegarEstado(la.cookie);
  const d8 = e8.dados;
  d8.funcionarios.push({
    id: 'func-novo-1', nome: 'Nova Pessoa', login: 'novapessoa',
    senha: sha('Nova#123'), departamento: 'dp', status: 'ativo', permissoes: {}
  });
  const r8 = await salvar(la.cookie, { dados: d8, merge: true, upsertIds: ['func-novo-1'], baseVersion: e8.version });
  ok(r8.status === 200, 'admin salvou o colaborador novo');
  const l8 = await login('novapessoa', 'Nova#123');
  ok(l8.status === 200, 'o colaborador novo CONSEGUE entrar com a senha definida pelo admin (' + l8.status + ')');

  console.log('\n=== 9) FUNCIONARIO COMUM NAO CRIA CONTA JA LIBERADA ===');
  const e9 = await pegarEstado(lc.cookie);
  const d9 = e9.dados;
  d9.funcionarios.push({
    id: 'func-novo-2', nome: 'Conta Fantasma', login: 'fantasma',
    senha: sha('Fantasma#123'), departamento: 'administracao', status: 'ativo',
    permissoes: { sistema: { visualizar: true, perms: true } }, podeVerSenhas: true
  });
  await salvar(lc.cookie, { dados: d9, merge: true, upsertIds: ['func-novo-2'], baseVersion: e9.version });
  const l9 = await login('fantasma', 'Fantasma#123');
  ok(l9.status !== 200, 'a conta criada por funcionario comum NAO entra (' + l9.status + ')');
  const d9b = (await pegarEstado(la.cookie)).dados;
  const fant = d9b.funcionarios.find(f => f.login === 'fantasma');
  if (fant) {
    ok(fant.status === 'aguardando_aprovacao', 'ela nasceu "aguardando_aprovacao" (ficou: ' + fant.status + ')');
    ok(!fant.podeVerSenhas, 'e sem podeVerSenhas');
    ok(!((fant.permissoes || {}).sistema || {}).perms, 'e sem permissao de sistema');
  }

  console.log('\n=== 10) SERVIDOR CONTINUA DE PE NO FIM DE TUDO ===');
  ok((await vivo()) === 200, 'servidor respondendo');

  console.log('\n' + (falhas === 0 ? 'ETAPA 1: TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
