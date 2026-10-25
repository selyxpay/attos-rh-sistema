// Roda pelo executor da suite:  node testes/rodar.cjs backend
// O executor sobe um servidor isolado numa porta livre e passa o endereco
// em BASE.
//
// Guarda contra o vazamento que aconteceu de verdade: o /server.cjs ficou
// PUBLICO em producao, entregando 166 KB do backend para qualquer pessoa na
// internet. A conferencia do handler de estaticos so perguntava "o caminho
// esta dentro da pasta da aplicacao?", e isso nao basta.
// Este teste existe para o buraco nao voltar sem ninguem perceber.
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE;
if (!BASE) {
  console.error('Este teste roda pelo executor da suite:  node testes/rodar.cjs');
  console.error('(ele sobe um servidor isolado e passa o endereco em BASE)');
  process.exit(2);
}
const RAIZ = path.resolve(__dirname, '..');

let falhas = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALHOU: ') + m); if (!c) falhas++; };

async function pegar(caminho, cookie) {
  try {
    const r = await fetch(BASE + caminho, {
      headers: cookie ? { Cookie: cookie } : {},
      signal: AbortSignal.timeout(8000)
    });
    const corpo = await r.text();
    return { status: r.status, tam: corpo.length, corpo: corpo };
  } catch (e) { return { status: -1, tam: 0, corpo: '' }; }
}

(async () => {
  // ---------- 1) o arquivo que vazou ----------
  console.log('=== 1) /server.cjs E OS ARQUIVOS DO BACKEND ===');
  const doBackend = [
    '/server.cjs',
    '/whatsapp-api.cjs',
    '/whatsapp-db.cjs',
    '/whatsapp-webhook.cjs',
    '/whatsapp-bot.cjs',
    '/whatsapp-lembretes.cjs',
    '/backup-dados.cjs',
    '/verificar-sistema.cjs',
    '/restaurar-registros.cjs',
    '/limpar-fotos-embutidas.cjs'
  ];
  for (const c of doBackend) {
    const r = await pegar(c);
    ok(r.status === 404, c + ' -> ' + r.status + ' (esperado 404)');
  }

  // ---------- 2) pasta de dados ----------
  console.log('\n=== 2) A PASTA DE DADOS NAO SAI ===');
  const deDados = [
    '/server-data/state.json',
    '/server-data/',
    '/server-data/sessions.json',
    '/server-data/backups/state_2026-01-01_00h00.json',
    '/server-data/whatsapp.db',
    '/server-data/diaria-docs/trab-1/rg-frente.jpeg',
    '/server-data/equipamentos/excluidos.json',
    '/.data/state.json',
    '/backups/',
    '/sessions.json',
    '/state.json'
  ];
  for (const c of deDados) {
    const r = await pegar(c);
    const vazou = r.status === 200 && /"dados"|"funcionarios"|"version"|BEGIN|SQLite/.test(r.corpo);
    ok(!vazou && r.status !== 200, c + ' -> ' + r.status + (vazou ? '  *** VAZOU ***' : ''));
  }

  // ---------- 3) configuracao e documentacao ----------
  console.log('\n=== 3) CONFIGURACAO E DOCUMENTACAO INTERNA ===');
  const internos = [
    '/package.json', '/package-lock.json', '/Dockerfile', '/.dockerignore',
    '/.gitignore', '/.env', '/README.md', '/SISTEMA-VISAO-GERAL.md',
    '/docs/DEPLOY-COOLIFY.md', '/docs/WHATSAPP-DEPLOY.md',
    '/testes/rodar.cjs', '/testes/seguranca.cjs',
    '/node_modules/sql.js/package.json'
  ];
  for (const c of internos) {
    const r = await pegar(c);
    ok(r.status !== 200, c + ' -> ' + r.status + ' (nao pode ser 200)');
  }

  // ---------- 4) nenhum segredo no que AINDA e publico ----------
  console.log('\n=== 4) O QUE AINDA E PUBLICO NAO LEVA SEGREDO ===');
  // js/security.js, js/vps-sync.js, js/exata-catalogo.js e os html publicos
  // continuam sendo servidos sem login, de proposito. Nenhum deles pode ter
  // senha, token ou chave escrita dentro.
  const publicos = [
    '/js/security.js', '/js/vps-sync.js', '/js/exata-catalogo.js',
    '/login.html', '/candidato.html', '/talento.html',
    '/css/style.css'
  ];
  const padroesDeSegredo = [
    { nome: 'hash de 64 hex', re: /['"][0-9a-f]{64}['"]/ },
    { nome: 'token da Meta (EAA...)', re: /EAA[A-Za-z0-9]{30,}/ },
    { nome: 'chave sk-', re: /sk-[A-Za-z0-9]{20,}/ },
    {
      // Atribuicao de valor literal a um nome de campo sensivel.
      // O valor tem que PARECER segredo: so caracteres de token, 16+, e a
      // aspas de fechamento NAO pode ser seguida de '+'. Sem isso, pegava
      // montagem de query string -- "token=' + encodeURIComponent(x)" --, que
      // e o contrario de um segredo: e justamente o codigo que NAO tem valor
      // escrito dentro.
      nome: 'senha/token atribuido a literal',
      re: /(senha|password|secret|token|api_?key)\s*[:=]\s*['"][A-Za-z0-9_\-.+/=]{16,}['"](?!\s*\+)/i
    }
  ];
  for (const c of publicos) {
    const r = await pegar(c);
    if (r.status !== 200) { console.log('  (pulado) ' + c + ' -> ' + r.status); continue; }
    const achados = padroesDeSegredo.filter(p => p.re.test(r.corpo)).map(p => p.nome);
    ok(achados.length === 0, c + ' (' + r.tam + ' bytes) sem segredo' +
      (achados.length ? ' — ACHOU: ' + achados.join(', ') : ''));
  }

  // ---------- 5) o que PRECISA continuar funcionando ----------
  console.log('\n=== 5) NAO BLOQUEEI DEMAIS ===');
  const precisam = [
    '/', '/login.html', '/candidato.html', '/talento.html', '/privacidade.html',
    '/fila-display.html', '/css/style.css', '/css/whatsapp.css',
    '/js/security.js', '/js/vps-sync.js', '/api/time'
  ];
  for (const c of precisam) {
    const r = await pegar(c);
    ok(r.status === 200, c + ' -> ' + r.status + ' (precisa ser 200)');
  }

  // e, com sessao, o painel
  const lg = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'admin', senha: 'TesteLocal#123' })
  });
  const cookie = lg.headers.get('set-cookie');
  ok(lg.status === 200, 'login do admin (' + lg.status + ')');
  for (const c of ['/index.html', '/js/app.js', '/js/data.js', '/js/telas.js', '/js/whatsapp.js']) {
    const r = await pegar(c, cookie);
    ok(r.status === 200, 'com sessao, ' + c + ' -> ' + r.status);
  }
  // e o backend segue barrado mesmo logado
  const rLogado = await pegar('/server.cjs', cookie);
  ok(rLogado.status === 404, 'com sessao, /server.cjs CONTINUA 404 (' + rLogado.status + ')');

  // ---------- 6) senha de admin nao tem mais fallback publico no codigo ----------
  console.log('\n=== 6) SEM ADMIN_SENHA, A CONTA NAO NASCE COM SENHA PUBLICA ===');
  const fonte = fs.readFileSync(path.join(RAIZ, 'server.cjs'), 'utf8');
  const fallback = /\?\s*hashSenhaServer\(String\(process\.env\.ADMIN_SENHA\)\)\s*(?:\r?\n)?\s*:\s*'[0-9a-f]{64}'/.test(fonte);
  ok(!fallback, 'nao existe mais hash fixo como alternativa ao ADMIN_SENHA');
  // a lista de senhas publicas (que FORCA a troca) tem que continuar existindo
  ok(/const HASH_SENHAS_PUBLICAS\s*=\s*\[/.test(fonte),
    'a lista de senhas publicas continua no lugar (e ela que exige a troca no login)');
  // e o front nao guarda mais hash de senha
  const front = fs.readFileSync(path.join(RAIZ, 'js', 'app.js'), 'utf8');
  ok(!/['"][0-9a-f]{64}['"]/.test(front.slice(0, 4000)),
    'o inicio do js/app.js nao tem mais hash de senha escrito');

  console.log('\n' + (falhas === 0 ? 'BACKEND FECHADO: TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
