// Roda pelo executor da suite:  node testes/rodar.cjs senha
// Sobe o servidor POR CONTA PROPRIA, porque parte da prova e o que acontece
// NA SUBIDA (a rotacao de senhas) e o que muda depois de REINICIAR.
//
// O que esta suite prova:
//   SENHA GUARDADA
//   - senha nova e gravada em scrypt com sal (nao em SHA-256 sem sal);
//   - o texto da senha NAO aparece no state.json em lugar nenhum;
//   - senha antiga (SHA-256) continua entrando, e o login REGRAVA em scrypt;
//   - /api/ver-senha nao mostra senha de ninguem.
//   TROCA OBRIGATORIA
//   - na subida, so e marcada a conta com senha guardada do jeito antigo;
//   - instalacao nova nao tranca ninguem sem motivo;
//   - conta marcada recebe 423 em TODO o sistema, mas consegue se ver, trocar
//     a senha e sair;
//   - a regra da senha nova: 8 caracteres, letra, numero, confirmacao e
//     diferente da antiga;
//   - trocar derruba as OUTRAS sessoes da pessoa;
//   - depois da troca o sistema libera, a senha antiga nao entra mais;
//   - o admin consegue exigir a troca de todos de novo (e cai nela tambem);
//   - senha definida pelo admin e provisoria (o dono troca no primeiro acesso).
//   CABECALHOS E LIMITES
//   - HSTS presente;
//   - muitos erros de senha do mesmo IP param o login.
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const SENHA_ADMIN = 'TesteLocal#123';
const sha = s => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');

let falhas = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALHOU: ') + m); if (!c) falhas++; };
const espera = ms => new Promise(r => setTimeout(r, ms));

function portaLivre() {
  return new Promise(function (res, rej) {
    const s = net.createServer(); s.unref(); s.on('error', rej);
    s.listen(0, '127.0.0.1', function () { const p = s.address().port; s.close(function () { res(p); }); });
  });
}
function encerrar(proc) {
  if (!proc || proc.killed) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    else proc.kill('SIGKILL');
  } catch (e) {}
}
async function aguardar(porta, seg) {
  const limite = Date.now() + (seg || 25) * 1000;
  while (Date.now() < limite) {
    try {
      const r = await fetch('http://127.0.0.1:' + porta + '/api/time', { signal: AbortSignal.timeout(1500) });
      if (r.status === 200) return true;
    } catch (e) {}
    await espera(300);
  }
  return false;
}
async function subir(dadosDir, logPath, extra) {
  const porta = await portaLivre();
  const log = fs.openSync(logPath, 'w');
  const proc = spawn(process.execPath, ['server.cjs'], {
    cwd: RAIZ,
    env: Object.assign({}, process.env, {
      PORT: String(porta), DATA_DIR: dadosDir, ADMIN_SENHA: SENHA_ADMIN, NODE_ENV: 'test'
    }, extra || {}),
    stdio: ['ignore', log, log]
  });
  const vivo = await aguardar(porta, 25);
  return { proc, porta, vivo, logPath };
}
// A rotacao roda em setImmediate depois do listen: espera por CONDICAO (o log
// dela), nunca por tempo fixo.
async function esperarSubida(logPath, seg) {
  const limite = Date.now() + (seg || 30) * 1000;
  while (Date.now() < limite) {
    let txt = '';
    try { txt = fs.readFileSync(logPath, 'utf8'); } catch (e) {}
    if (/\[Subida\] pronto/.test(txt)) {
      const m = txt.match(/\[Seguran.a\] troca de senha exigida de (\d+) conta/);
      return m ? Number(m[1]) : 0;
    }
    await espera(200);
  }
  return null;
}

function cliente(porta) {
  const base = 'http://127.0.0.1:' + porta;
  return {
    async post(caminho, corpo, cookie) {
      const r = await fetch(base + caminho, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
        body: corpo === undefined ? undefined : JSON.stringify(corpo)
      });
      return { status: r.status, cookie: (r.headers.get('set-cookie') || '').split(';')[0],
               corpo: await r.json().catch(() => ({})) };
    },
    async get(caminho, cookie) {
      const r = await fetch(base + caminho, { headers: cookie ? { Cookie: cookie } : {} });
      return { status: r.status, hsts: r.headers.get('strict-transport-security'),
               corpo: await r.json().catch(() => ({})) };
    }
  };
}
const lerEstado = d => JSON.parse(fs.readFileSync(path.join(d, 'state.json'), 'utf8'));
const textoDoEstado = d => fs.readFileSync(path.join(d, 'state.json'), 'utf8');
const achar = (estado, login) =>
  ((estado.dados && estado.dados.funcionarios) || []).find(f => (f.login || '') === login) || {};

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-senha-'));
  const logA = path.join(tmp, 'servidor-1.log');

  console.log('=== 1) INSTALACAO NOVA NAO TRANCA NINGUEM SEM MOTIVO ===');
  let srv = await subir(tmp, logA);
  ok(srv.vivo, 'servidor subiu');
  if (!srv.vivo) { try { console.log(fs.readFileSync(logA, 'utf8').slice(-2000)); } catch (e) {} encerrar(srv.proc); process.exit(1); }
  let api = cliente(srv.porta);
  const marcadasNaSubida = await esperarSubida(logA, 30);
  ok(marcadasNaSubida === 0, 'a rotacao da subida nao marcou ninguem (' + marcadasNaSubida + ')');

  const log1 = await api.post('/api/login', { login: 'admin', senha: SENHA_ADMIN });
  ok(log1.status === 200, 'o admin entra (' + log1.status + ')');
  ok(log1.corpo.trocaObrigatoria === false, 'e NAO cai na troca obrigatoria');
  let ckAdmin = log1.cookie;
  const est1 = await api.get('/api/state', ckAdmin);
  ok(est1.status === 200, 'e o sistema responde normalmente (' + est1.status + ')');
  ok(/max-age=\d+/.test(est1.hsts || ''), 'o cabecalho HSTS esta presente (' + est1.hsts + ')');

  console.log('\n=== 2) COMO A SENHA FICA GUARDADA ===');
  const estado1 = lerEstado(tmp);
  const adm1 = achar(estado1, 'admin');
  ok(/^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/.test(String(adm1.senha || '')),
    'a senha do admin esta em scrypt com sal (' + String(adm1.senha || '').slice(0, 18) + '...)');
  ok(String(adm1.senha || '') !== sha(SENHA_ADMIN), 'e NAO e o SHA-256 da senha');
  ok(adm1.senhaVisivel === undefined, 'nao existe o campo senhaVisivel');
  ok(textoDoEstado(tmp).indexOf(SENHA_ADMIN) < 0, 'o texto da senha nao aparece no state.json');

  // Duas contas com a MESMA senha tem hash DIFERENTE (e isso que o sal faz).
  const h1 = await api.post('/api/trocar-senha-obrigatoria', { senhaNova: 'x', senhaConfirma: 'x' }, ckAdmin);
  ok(h1.status === 400, 'senha de um caractere e recusada mesmo sem estar trancado (' + h1.status + ')');

  console.log('\n=== 3) VER SENHA NAO MOSTRA SENHA DE NINGUEM ===');
  const ver = await api.post('/api/ver-senha', { funcId: adm1.id }, ckAdmin);
  ok(ver.status === 200 && ver.corpo.ok === false,
    'a rota responde, mas sem senha (' + ver.status + ', ok=' + ver.corpo.ok + ')');
  ok(ver.corpo.motivo === 'hash_forte', 'dizendo o motivo: ' + ver.corpo.motivo);
  ok(!ver.corpo.senha, 'e nenhuma senha vem no corpo');

  console.log('\n=== 4) SENHA ANTIGA (SHA-256) NO ESTADO: A ROTACAO MIRA NELA ===');
  // Monta a situacao da PRODUCAO: uma conta com senha guardada do jeito
  // antigo, do tempo em que o hash era SHA-256 sem sal.
  const estadoP = lerEstado(tmp);
  estadoP.dados.funcionarios.push({
    id: 'func-legado', nome: 'Maria Legado', login: 'legado',
    senha: sha('Antiga123'), senhaVisivel: 'Antiga123',   // o espelho em texto puro que existia antes
    departamento: 'rh', status: 'ativo', permissoes: {}, telas: { dashboard: 'editar' }
  });
  estadoP.version = (estadoP.version || 1) + 1;
  fs.writeFileSync(path.join(tmp, 'state.json'), JSON.stringify(estadoP), 'utf8');
  encerrar(srv.proc);
  await espera(400);

  const logB = path.join(tmp, 'servidor-2.log');
  srv = await subir(tmp, logB);
  ok(srv.vivo, 'servidor subiu de novo com a conta antiga no estado');
  api = cliente(srv.porta);
  const marcadas2 = await esperarSubida(logB, 30);
  ok(marcadas2 === 1, 'a rotacao marcou SO a conta de senha antiga (' + marcadas2 + ')');
  const estado2 = lerEstado(tmp);
  ok(achar(estado2, 'legado').precisaTrocarSenha === true, 'a conta antiga esta marcada para trocar');
  ok(achar(estado2, 'admin').precisaTrocarSenha !== true, 'a conta que ja estava em scrypt NAO foi marcada');
  ok(achar(estado2, 'legado').senhaVisivel === undefined, 'e o espelho em texto puro dela foi apagado');
  ok(textoDoEstado(tmp).indexOf('Antiga123') < 0, 'a senha antiga nao esta mais legivel no state.json');

  console.log('\n=== 5) A CONTA TRANCADA NAO USA O SISTEMA ===');
  const logLeg = await api.post('/api/login', { login: 'legado', senha: 'Antiga123' });
  ok(logLeg.status === 200, 'a senha antiga ainda ENTRA (senao a pessoa nem trocaria) (' + logLeg.status + ')');
  ok(logLeg.corpo.trocaObrigatoria === true, 'mas o login avisa que precisa trocar');
  ok(/vazadas na internet/.test(logLeg.corpo.avisoTroca || ''), 'com a mensagem do vazamento');
  const ckLeg = logLeg.cookie;

  const bloqueadas = [['GET', '/api/state'], ['POST', '/api/state'],
                      ['GET', '/api/whatsapp/contas'], ['POST', '/api/nome-exibicao']];
  for (const [metodo, rota] of bloqueadas) {
    const r = metodo === 'GET' ? await api.get(rota, ckLeg) : await api.post(rota, {}, ckLeg);
    ok(r.status === 423, rota + ' responde 423 (trancado) — deu ' + r.status);
  }
  const meLeg = await api.get('/api/me', ckLeg);
  ok(meLeg.status === 200 && meLeg.corpo.precisaTrocarSenha === true, '/api/me continua respondendo e diz que precisa trocar');
  const tempo = await api.get('/api/time', ckLeg);
  ok(tempo.status === 200, '/api/time (que a tela usa para viver) continua liberado');

  console.log('\n=== 6) A REGRA DA SENHA NOVA ===');
  const casos = [
    [{ senhaNova: 'Abc1', senhaConfirma: 'Abc1' }, 'curta', '8 caracteres'],
    [{ senhaNova: 'somenteletras', senhaConfirma: 'somenteletras' }, 'sem_numero', 'numero'],
    [{ senhaNova: '12345678', senhaConfirma: '12345678' }, 'sem_letra', 'letra'],
    [{ senhaNova: 'Primavera2026', senhaConfirma: 'Outra2026' }, 'confirmacao', 'confirmacao'],
    [{ senhaNova: 'Antiga123', senhaConfirma: 'Antiga123' }, 'igual', 'igual a antiga']
  ];
  for (const [corpo, motivo, oQue] of casos) {
    const r = await api.post('/api/trocar-senha-obrigatoria', corpo, ckLeg);
    ok(r.status === 400 && r.corpo.motivo === motivo,
      'recusa por ' + oQue + ' (' + r.status + '/' + r.corpo.motivo + ')');
    ok(!!r.corpo.aviso, '  e explica em portugues: "' + r.corpo.aviso + '"');
  }
  const aindaTrancado = await api.get('/api/state', ckLeg);
  ok(aindaTrancado.status === 423, 'depois das recusas, continua trancado');

  console.log('\n=== 7) TROCAR LIBERA, DERRUBA AS OUTRAS SESSOES E MATA A SENHA ANTIGA ===');
  const segunda = await api.post('/api/login', { login: 'legado', senha: 'Antiga123' });
  const ckLeg2 = segunda.cookie;
  ok(segunda.status === 200, 'uma segunda sessao da mesma pessoa (celular, por exemplo)');
  const trocou = await api.post('/api/trocar-senha-obrigatoria',
    { senhaNova: 'Primavera2026', senhaConfirma: 'Primavera2026' }, ckLeg);
  ok(trocou.status === 200 && trocou.corpo.ok === true, 'a senha boa e aceita (' + trocou.status + ')');
  ok(Number(trocou.corpo.sessoesDerrubadas) === 1, 'e a outra sessao foi derrubada (' + trocou.corpo.sessoesDerrubadas + ')');
  const outra = await api.get('/api/me', ckLeg2);
  ok(outra.status === 401, 'a outra sessao nao vale mais (' + outra.status + ')');
  const liberado = await api.get('/api/state', ckLeg);
  ok(liberado.status === 200, 'a sessao de quem trocou passa a usar o sistema (' + liberado.status + ')');

  const estado3 = lerEstado(tmp);
  ok(/^scrypt\$/.test(String(achar(estado3, 'legado').senha || '')), 'a senha nova ficou em scrypt');
  ok(achar(estado3, 'legado').precisaTrocarSenha === false, 'e a conta nao esta mais marcada');
  ok(textoDoEstado(tmp).indexOf('Primavera2026') < 0, 'a senha nova tambem nao aparece em texto no state.json');

  const velha = await api.post('/api/login', { login: 'legado', senha: 'Antiga123' });
  ok(velha.status === 401, 'a senha antiga nao entra mais (' + velha.status + ')');
  const nova = await api.post('/api/login', { login: 'legado', senha: 'Primavera2026' });
  ok(nova.status === 200 && nova.corpo.trocaObrigatoria === false, 'a nova entra e nao pede troca');

  const logAud = fs.readFileSync(path.join(tmp, 'state.json'), 'utf8');
  ok(/troca obrigat/i.test(logAud), 'a Auditoria registrou a troca');

  console.log('\n=== 8) LOGIN REGRAVA A SENHA ANTIGA EM SCRYPT ===');
  // Conta com senha antiga que NAO precisa trocar (hash antigo, mas senha que
  // nunca foi publica): o login sozinho ja moderniza o jeito de guardar.
  const estadoM = lerEstado(tmp);
  estadoM.dados.funcionarios.push({
    id: 'func-migra', nome: 'Carlos Migra', login: 'migra',
    senha: sha('Fortaleza2026'), departamento: 'rh', status: 'ativo',
    precisaTrocarSenha: false, permissoes: {}
  });
  estadoM.version = (estadoM.version || 1) + 1;
  fs.writeFileSync(path.join(tmp, 'state.json'), JSON.stringify(estadoM), 'utf8');
  const logMigra = await api.post('/api/login', { login: 'migra', senha: 'Fortaleza2026' });
  ok(logMigra.status === 200, 'a conta com hash antigo entra (' + logMigra.status + ')');
  // A regravacao acontece em segundo plano (comTrava): espera por condicao.
  let migrou = false;
  for (let i = 0; i < 60 && !migrou; i++) {
    migrou = /^scrypt\$/.test(String(achar(lerEstado(tmp), 'migra').senha || ''));
    if (!migrou) await espera(200);
  }
  ok(migrou, 'e o proprio login regravou a senha dela em scrypt');
  ok(textoDoEstado(tmp).indexOf('Fortaleza2026') < 0, 'sem guardar o texto da senha');
  const migraDeNovo = await api.post('/api/login', { login: 'migra', senha: 'Fortaleza2026' });
  ok(migraDeNovo.status === 200, 'e a pessoa continua entrando com a MESMA senha (' + migraDeNovo.status + ')');

  console.log('\n=== 9) O BOTAO DO ADMIN: EXIGIR A TROCA DE TODOS ===');
  const admin2 = await api.post('/api/login', { login: 'admin', senha: SENHA_ADMIN });
  ckAdmin = admin2.cookie;
  const semPermissao = await api.post('/api/exigir-troca-senha', {}, nova.cookie);
  ok(semPermissao.status === 403, 'quem nao e da administracao recebe 403 (' + semPermissao.status + ')');
  const semLogin = await api.post('/api/exigir-troca-senha', {});
  ok(semLogin.status === 401, 'sem login, 401 (' + semLogin.status + ')');
  const exigiu = await api.post('/api/exigir-troca-senha', {}, ckAdmin);
  ok(exigiu.status === 200 && exigiu.corpo.ok === true, 'o admin consegue exigir (' + exigiu.status + ')');
  ok(Number(exigiu.corpo.marcadas) >= 3, 'e marcou todas as contas (' + exigiu.corpo.marcadas + ')');
  const adminTrancado = await api.get('/api/state', ckAdmin);
  ok(adminTrancado.status === 423, 'o proprio admin tambem fica trancado (' + adminTrancado.status + ')');
  const quemTrocou = await api.get('/api/state', nova.cookie);
  ok(quemTrocou.status === 423, 'e quem tinha trocado tambem (' + quemTrocou.status + ')');
  // E o admin sai dessa trocando a senha.
  const adminTrocou = await api.post('/api/trocar-senha-obrigatoria',
    { senhaNova: 'Guarani2026', senhaConfirma: 'Guarani2026' }, ckAdmin);
  ok(adminTrocou.status === 200, 'o admin troca e se libera (' + adminTrocou.status + ')');
  ok((await api.get('/api/state', ckAdmin)).status === 200, 'e volta a usar o sistema');

  console.log('\n=== 10) SENHA QUE O ADMIN DEFINE E PROVISORIA ===');
  const criar = await api.post('/api/state', {
    merge: true, upsertIds: ['func-novo-ui'],
    dados: { funcionarios: [{
      id: 'func-novo-ui', nome: 'Pedro Novo', login: 'pedronovo',
      senha: sha('Combinada2026'), departamento: 'rh', status: 'ativo', permissoes: {}
    }] }
  }, ckAdmin);
  ok(criar.status === 200, 'o admin cadastra um colaborador com senha (' + criar.status + ')');
  const estadoN = lerEstado(tmp);
  ok(achar(estadoN, 'pedronovo').precisaTrocarSenha === true,
    'e essa senha ja nasce PROVISORIA (o dono troca no primeiro acesso)');
  const logNovo = await api.post('/api/login', { login: 'pedronovo', senha: 'Combinada2026' });
  ok(logNovo.status === 200 && logNovo.corpo.trocaObrigatoria === true,
    'no primeiro acesso ele entra e cai na troca');
  const trocaNovo = await api.post('/api/trocar-senha-obrigatoria',
    { senhaNova: 'MinhaSenha2026', senhaConfirma: 'MinhaSenha2026' }, logNovo.cookie);
  ok(trocaNovo.status === 200, 'ele escolhe a dele (' + trocaNovo.status + ')');
  const semAntiga = await api.post('/api/login', { login: 'pedronovo', senha: 'Combinada2026' });
  ok(semAntiga.status === 401, 'e a senha que o admin conhecia nao entra mais (' + semAntiga.status + ')');

  console.log('\n=== 11) MUITO ERRO DE SENHA DO MESMO IP PARA O LOGIN ===');
  let bloqueou = 0;
  for (let i = 0; i < 34; i++) {
    const r = await api.post('/api/login', { login: 'alvo' + i, senha: 'chute-errado' });
    if (r.status === 429) { bloqueou = i + 1; break; }
  }
  ok(bloqueou > 0, 'depois de ' + bloqueou + ' chutes de logins diferentes, o IP e bloqueado');
  const certoBloqueado = await api.post('/api/login', { login: 'admin', senha: 'Guarani2026' });
  ok(certoBloqueado.status === 429, 'e nem a senha certa passa enquanto o bloqueio vale (' + certoBloqueado.status + ')');

  encerrar(srv.proc);
  await espera(300);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}

  console.log('\n' + (falhas === 0 ? 'SENHA FORTE + TROCA OBRIGATORIA: TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
