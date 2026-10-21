// Roda pelo executor da suite:  node testes/rodar.cjs imagem
//
// POR QUE ESTA SUITE EXISTE
// O deploy do bot derrubou o módulo WhatsApp em produção. A tela ficou presa
// em "WhatsApp inicializando" e a aba Conexões apareceu vazia, como se as
// contas e os tokens tivessem sumido.
// Não havia sumido nada. O Dockerfile copia os arquivos UM POR UM, e o
// whatsapp-bot.cjs novo não entrou no COPY. O arquivo não existia na imagem,
// o require falhou, e como ele estava no MESMO try dos outros três módulos,
// o canal inteiro desligou.
//
// Esta suíte guarda as três lições:
//   1. todo arquivo que o server.cjs exige tem que estar na imagem
//   2. uma peça OPCIONAL que falha não pode derrubar o resto
//   3. salvar a configuração do bot não encosta nas contas conectadas
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const BASE = process.env.BASE;
if (!BASE) {
  console.error('Este teste roda pelo executor da suite:  node testes/rodar.cjs');
  process.exit(2);
}
const RAIZ = path.resolve(__dirname, '..');
const SENHA_ADMIN = 'TesteLocal#123';

let falhas = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALHOU: ') + m); if (!c) falhas++; };
const espera = ms => new Promise(r => setTimeout(r, ms));

// ── 1) TODO require DO SERVIDOR ESTÁ NA IMAGEM ─────────────────────────────
function testarImagem() {
  const srv = fs.readFileSync(path.join(RAIZ, 'server.cjs'), 'utf8');
  const dock = fs.readFileSync(path.join(RAIZ, 'Dockerfile'), 'utf8');

  // Pastas copiadas inteiras: COPY css ./css
  const pastas = [];
  dock.replace(/^COPY\s+([^\s]+)\s+\.\/([^\s]+)\s*$/gm, function (m, origem) {
    if (origem.indexOf('.') < 0) pastas.push(origem.replace(/\/$/, ''));
    return m;
  });
  // Arquivos copiados um por um: COPY a.cjs b.cjs ./
  const arquivos = new Set();
  dock.replace(/^COPY\s+(.+?)\s+\.\/\s*$/gm, function (m, lista) {
    lista.trim().split(/\s+/).forEach(function (f) { arquivos.add(f); });
    return m;
  });

  const exigidos = [...new Set(
    [...srv.matchAll(/require\('\.\/([^']+)'\)/g)].map(function (m) { return m[1]; })
  )];
  ok(exigidos.length > 0, 'achei os require do server.cjs (' + exigidos.length + ')');

  const faltando = [];
  exigidos.forEach(function (f) {
    const base = f.replace(/^\.\//, '');
    const porPasta = pastas.some(function (p) { return base.indexOf(p + '/') === 0; });
    if (!porPasta && !arquivos.has(base)) faltando.push(base);
  });
  ok(faltando.length === 0,
    'todo arquivo exigido pelo server.cjs está no COPY do Dockerfile' +
    (faltando.length ? ' — FALTA: ' + faltando.join(', ') : ''));

  // Os módulos do WhatsApp, um por um, porque é onde já doeu
  ['whatsapp-db.cjs', 'whatsapp-api.cjs', 'whatsapp-webhook.cjs', 'whatsapp-bot.cjs'].forEach(function (f) {
    ok(arquivos.has(f), f + ' está no COPY');
  });

  // E o .dockerignore não pode tirar nenhum deles de volta
  const ignore = fs.readFileSync(path.join(RAIZ, '.dockerignore'), 'utf8')
    .split(/\r?\n/).map(function (l) { return l.trim(); })
    .filter(function (l) { return l && l.charAt(0) !== '#'; });
  const barrados = exigidos.filter(function (f) {
    const base = path.basename(f);
    return ignore.some(function (p) {
      if (p === base) return true;
      if (p.charAt(0) === '*' && base.endsWith(p.slice(1))) return true;
      if (p.endsWith('*') && base.indexOf(p.slice(0, -1)) === 0) return true;
      return false;
    });
  });
  ok(barrados.length === 0,
    'o .dockerignore não exclui nenhum arquivo exigido' +
    (barrados.length ? ' — BARRA: ' + barrados.join(', ') : ''));
}

// ── 2) PEÇA OPCIONAL QUEBRADA NÃO DERRUBA O RESTO ──────────────────────────
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

async function testarSemOBot() {
  console.log('\n=== 2) SEM O MODULO DO BOT, O WHATSAPP AINDA FUNCIONA ===');
  console.log('(reproduz exatamente o que aconteceu em producao)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-sem-bot-'));
  const dados = path.join(tmp, 'dados');
  fs.mkdirSync(dados, { recursive: true });

  // Semeia uma conta conectada, como em produção.
  const db = require(path.join(RAIZ, 'whatsapp-db.cjs'));
  await db.init(dados);
  db.accounts.create({
    phone_number_id: '111222333', waba_id: '444555666', display_phone: '+55 11 90000-0000',
    business_name: 'R&T', status: 'connected', access_token_enc: 'EAAtokenDeTeste123456789',
    created_by: 'admin', ativo: 1
  });
  const antes = db.accounts.list().length;
  db.salvarImediato();
  db.close();
  ok(antes === 1, 'semeei 1 conta conectada no banco');

  // Esconde o módulo do bot, como se ele não estivesse na imagem.
  const real = path.join(RAIZ, 'whatsapp-bot.cjs');
  const guardado = path.join(tmp, 'whatsapp-bot.cjs.guardado');
  let escondeu = false;
  try { fs.copyFileSync(real, guardado); fs.unlinkSync(real); escondeu = true; }
  catch (e) { ok(false, 'não consegui esconder o módulo para o teste: ' + e.message); }

  let proc = null;
  try {
    if (escondeu) {
      const porta = await portaLivre();
      const log = fs.openSync(path.join(tmp, 'servidor.log'), 'w');
      proc = spawn(process.execPath, ['server.cjs'], {
        cwd: RAIZ,
        env: Object.assign({}, process.env, {
          PORT: String(porta), DATA_DIR: dados, ADMIN_SENHA: SENHA_ADMIN, NODE_ENV: 'test'
        }),
        stdio: ['ignore', log, log]
      });
      const subiu = await aguardar(porta, 25);
      ok(subiu, 'o servidor subiu mesmo SEM o whatsapp-bot.cjs');

      if (subiu) {
        const u = 'http://127.0.0.1:' + porta;
        const lg = await fetch(u + '/api/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ login: 'admin', senha: SENHA_ADMIN })
        });
        const ck = lg.headers.get('set-cookie');
        ok(lg.status === 200, 'login funciona (' + lg.status + ')');

        const rc = await fetch(u + '/api/whatsapp/accounts', { headers: { Cookie: ck } });
        const jc = await rc.json().catch(function () { return {}; });
        ok(rc.status === 200, 'a aba Conexões responde 200, NAO 503 "inicializando" (' + rc.status + ')');
        ok(jc.ok === true && (jc.accounts || []).length === 1,
          'e a conta conectada aparece (' + (jc.accounts || []).length + ')');
        if ((jc.accounts || []).length) {
          ok(jc.accounts[0].has_token === 1, 'com o token no lugar');
        }
        // E a rota do bot avisa com clareza que o bot não está disponível.
        const rb = await fetch(u + '/api/whatsapp/bot/painel', { headers: { Cookie: ck } });
        const jb = await rb.json().catch(function () { return {}; });
        ok(rb.status === 200 && jb.disponivel === false,
          'a aba Bot diz que o bot não está disponível, sem quebrar nada (' + rb.status + ')');

        const log4 = fs.readFileSync(path.join(tmp, 'servidor.log'), 'utf8');
        ok(/\[Bot\] módulo NÃO carregou/.test(log4), 'e o log explica o motivo em uma linha');

        // O /api/saude existe justamente por causa deste incidente: era
        // impossivel ver de FORA que o modulo estava desligado, porque toda
        // rota /api/whatsapp/ responde 401 sem sessao.
        const rs = await fetch(u + '/api/saude');
        const js = await rs.json().catch(function () { return {}; });
        ok(rs.status === 200, '/api/saude responde sem login (' + rs.status + ')');
        ok(js.whatsapp && js.whatsapp.modulos_carregados === true,
          'e diz que o WhatsApp esta CARREGADO, mesmo sem o bot');
        ok(js.whatsapp && js.whatsapp.banco_pronto === true, 'e com o banco pronto');
        ok(js.bot && js.bot.modulo_carregado === false,
          'apontando o bot como o unico ausente — e isto que faltava para diagnosticar');
      }
    }
  } finally {
    encerrar(proc);
    await espera(400);
    // Devolve o módulo SEMPRE, mesmo se o teste falhar no meio.
    if (escondeu) {
      try { fs.copyFileSync(guardado, real); } catch (e) {
        console.error('  *** NAO CONSEGUI DEVOLVER o whatsapp-bot.cjs! Copie de: ' + guardado);
      }
    }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
  ok(fs.existsSync(real), 'o módulo do bot foi devolvido ao lugar depois do teste');
}

// ── 3) SALVAR A CONFIG DO BOT NAO ENCOSTA NAS CONTAS ───────────────────────
async function testarContasSobrevivem() {
  console.log('\n=== 3) SALVAR A CONFIG DO BOT NAO APAGA AS CONTAS ===');
  const lg = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'admin', senha: SENHA_ADMIN })
  });
  const ck = lg.headers.get('set-cookie');
  ok(lg.status === 200, 'login do admin (' + lg.status + ')');

  // Cria a conta pela rota, como a tela faz.
  const criar = await fetch(BASE + '/api/whatsapp/accounts', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck },
    body: JSON.stringify({
      phone_number_id: '999888777', waba_id: '666555444', display_phone: '+55 11 91234-5678',
      business_name: 'Teste Contas', access_token: 'EAAtokenParaOTeste1234567890', ativo: true
    })
  });
  ok(criar.status === 200, 'criei uma conta pela rota (' + criar.status + ')');

  const contar = async function () {
    const r = await fetch(BASE + '/api/whatsapp/accounts', { headers: { Cookie: ck } });
    const j = await r.json().catch(function () { return {}; });
    const a = j.accounts || [];
    return { n: a.length, comToken: a.filter(function (x) { return x.has_token === 1; }).length };
  };
  const antes = await contar();
  ok(antes.n >= 1, 'contas antes: ' + antes.n + ' (com token: ' + antes.comToken + ')');

  // Agora mexe na config do bot várias vezes, como a aba faz.
  for (let i = 1; i <= 5; i++) {
    const e = await fetch(BASE + '/api/state', { headers: { Cookie: ck } }).then(function (r) { return r.json(); });
    const d = e.dados;
    d.botWhatsapp = d.botWhatsapp || {};
    d.botWhatsapp.ligado = (i % 2 === 0);
    d.botWhatsapp.linkVagas = 'http://exemplo/' + i;
    d.botWhatsapp.passos = [{ id: 'p' + i, tipo: 'texto', texto: 'passo ' + i }];
    const r = await fetch(BASE + '/api/state', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck },
      body: JSON.stringify({ dados: d, merge: true, setKeys: ['botWhatsapp'], baseVersion: e.version })
    });
    if (r.status !== 200) { ok(false, 'save ' + i + ' devolveu ' + r.status); break; }
  }
  const depois = await contar();
  ok(depois.n === antes.n, 'contas depois de 5 gravações do bot: ' + depois.n + ' (era ' + antes.n + ')');
  ok(depois.comToken === antes.comToken,
    'e os tokens continuam: ' + depois.comToken + ' (era ' + antes.comToken + ')');

  // E a config do bot realmente gravou — ou seja, o teste acima não passou
  // só porque nada foi salvo.
  const conf = (await fetch(BASE + '/api/state', { headers: { Cookie: ck } })
    .then(function (r) { return r.json(); })).dados.botWhatsapp;
  ok(conf && conf.linkVagas === 'http://exemplo/5', 'a configuração do bot gravou de verdade');

  console.log('\n=== 4) O MODULO WHATSAPP ESTA PRONTO (nao "inicializando") ===');
  const rAcc = await fetch(BASE + '/api/whatsapp/accounts', { headers: { Cookie: ck } });
  ok(rAcc.status === 200, '/api/whatsapp/accounts -> ' + rAcc.status + ' (503 seria "inicializando")');
  const rBot = await fetch(BASE + '/api/whatsapp/bot/painel', { headers: { Cookie: ck } });
  const jBot = await rBot.json().catch(function () { return {}; });
  ok(rBot.status === 200 && jBot.disponivel === true, 'e o bot está disponível (' + rBot.status + ')');

  console.log('\n=== 5) SAUDE PUBLICA, PARA DIAGNOSTICAR SEM LOGIN ===');
  const rSaude = await fetch(BASE + '/api/saude');
  const jSaude = await rSaude.json().catch(function () { return {}; });
  ok(rSaude.status === 200, '/api/saude responde sem login (' + rSaude.status + ')');
  ok(jSaude.whatsapp && jSaude.whatsapp.modulos_carregados === true, 'WhatsApp carregado');
  ok(jSaude.whatsapp && jSaude.whatsapp.banco_pronto === true, 'banco pronto');
  ok(jSaude.bot && jSaude.bot.modulo_carregado === true, 'bot carregado');
  // E nao pode vazar NADA alem de sim/nao.
  const texto = JSON.stringify(jSaude);
  ok(!/token|senha|phone|conta|account|path|\/data|\/app/i.test(texto),
    'e nao vaza token, telefone, caminho nem nome de conta: ' + texto.slice(0, 110));
}

(async () => {
  console.log('=== 1) TODO ARQUIVO EXIGIDO PELO SERVIDOR ESTA NA IMAGEM ===');
  testarImagem();
  await testarSemOBot();
  await testarContasSobrevivem();
  console.log('\n' + (falhas === 0 ? 'IMAGEM E CONTAS: TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
