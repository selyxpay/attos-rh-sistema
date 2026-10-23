// Roda pelo executor da suite:  node testes/rodar.cjs audio
// Sobe o servidor POR CONTA PROPRIA, varias vezes, porque parte da prova e o
// que acontece COM e SEM o conversor de audio disponivel.
//
// O que esta suite prova:
//   CONVERSAO
//   - o audio gravado no navegador (webm) chega, e convertido e e GUARDADO
//     como OGG de verdade (conferido pelo conteudo, nao pela extensao);
//   - o arquivo fica FORA da pasta publica e so sai com login;
//   - conversao que falha nao deixa arquivo pela metade nem derruba o servidor;
//   - saida que nao e OGG e recusada (nao confia na palavra do conversor);
//   - no maximo 2 conversoes ao mesmo tempo;
//   - limite de tamanho da gravacao.
//   SEM FFMPEG
//   - a rota avisa com motivo 'sem_ffmpeg' e NAO quebra;
//   - o envio de audio por ARQUIVO continua funcionando igual;
//   - o /api/saude diz que o conversor nao esta disponivel.
//   CONVIVENCIA E ENVIO
//   - arquivo anexado e audio gravado convivem (as duas rotas existem e cada
//     uma faz a sua parte);
//   - o bot manda o audio como type 'audio' e SEM legenda (e o que a Meta
//     mostra como mensagem de voz);
//   - o "Enviar teste" do bot funciona com o audio gravado.
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const DUBLE = path.join(RAIZ, 'testes', 'fixtures', 'ffmpeg-duble.cjs');
const SENHA_ADMIN = 'TesteLocal#123';
const scrypt = senha => {
  const sal = crypto.randomBytes(16);
  const chave = crypto.scryptSync(String(senha), sal, 32, { N: 16384, r: 8, p: 1 });
  return 'scrypt$16384$8$1$' + sal.toString('hex') + '$' + chave.toString('hex');
};

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
      const tipo = r.headers.get('content-type') || '';
      const ehJson = /json/.test(tipo);
      return { status: r.status, tipo: tipo,
               corpo: ehJson ? await r.json().catch(() => ({})) : null,
               bytes: ehJson ? null : Buffer.from(await r.arrayBuffer()) };
    }
  };
}

// Uma "gravação do navegador": bytes com a cara de WEBM (o que o Chrome manda).
function gravacaoFalsa(tamanho) {
  const cabecalho = Buffer.from([0x1A, 0x45, 0xDF, 0xA3]);        // EBML, assinatura do webm
  const resto = Buffer.alloc(Math.max(16, (tamanho || 2048) - 4), 0x33);
  return Buffer.concat([cabecalho, resto]);
}
const comoDataUrl = (buf, mime) => 'data:' + (mime || 'audio/webm') + ';base64,' + buf.toString('base64');

// Um OGG de verdade, para o caminho de ARQUIVO ANEXADO (que não passa pelo
// conversor e exige OGG desde sempre).
function oggFalso() {
  return Buffer.concat([Buffer.from('OggS', 'latin1'), Buffer.alloc(200, 0x41)]);
}

function semearAdmin(dadosDir) {
  const estado = {
    version: 2, atualizadoEm: Date.now(),
    dados: {
      funcionarios: [
        { id: 'f-admin', login: 'admin', nome: 'Administrador', departamento: 'administracao',
          status: 'ativo', senha: scrypt(SENHA_ADMIN) }
      ],
      candidatos: [], vagas: [], logs: [], respostasRapidas: [],
      fila: { contadores: {}, senhas: [], ultimaChamada: null }
    }
  };
  fs.writeFileSync(path.join(dadosDir, 'state.json'), JSON.stringify(estado), 'utf8');
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-audio-'));
  semearAdmin(tmp);

  // ══════════════════════════════════════════════════════════════════════
  console.log('=== 1) SEM CONVERSOR: AVISA E NAO QUEBRA ===');
  // FFMPEG_BIN aponta para um programa que nao existe: e exatamente o que
  // acontece numa imagem sem ffmpeg.
  let srv = await subir(tmp, path.join(tmp, 's1.log'), { FFMPEG_BIN: path.join(tmp, 'nao-existe-ffmpeg') });
  ok(srv.vivo, 'o servidor sobe mesmo sem conversor de audio');
  if (!srv.vivo) { try { console.log(fs.readFileSync(path.join(tmp, 's1.log'), 'utf8').slice(-2000)); } catch (e) {} encerrar(srv.proc); process.exit(1); }
  let api = cliente(srv.porta);
  let adm = await api.post('/api/login', { login: 'admin', senha: SENHA_ADMIN });
  ok(adm.status === 200, 'login do admin (' + adm.status + ')');
  let ck = adm.cookie;

  const saudeSem = await api.get('/api/saude');
  ok(saudeSem.corpo && saudeSem.corpo.audio_voz && saudeSem.corpo.audio_voz.ffmpeg === false,
    'o /api/saude diz que o conversor NAO esta disponivel');

  const semFf = await api.post('/api/whatsapp/bot/audio-gravado',
    { dataUrl: comoDataUrl(gravacaoFalsa()), destino: 'bot' }, ck);
  ok(semFf.status === 503 && semFf.corpo.motivo === 'sem_ffmpeg',
    'a gravacao responde 503 com motivo sem_ffmpeg (' + semFf.status + '/' + semFf.corpo.motivo + ')');
  ok(/ffmpeg|conversor/i.test(semFf.corpo.error || ''), 'explicando o que aconteceu: "' + semFf.corpo.error + '"');
  ok(/arquivo OGG/i.test(semFf.corpo.error || ''), 'e lembrando que o envio por ARQUIVO continua funcionando');

  // O caminho de ARQUIVO nao depende de conversor nenhum.
  const arqOk = await api.post('/api/whatsapp/bot/midia',
    { dataUrl: 'data:audio/ogg;base64,' + oggFalso().toString('base64'), destino: 'audio' }, ck);
  ok(arqOk.status === 200 && arqOk.corpo.ok === true,
    'SEM conversor, anexar um arquivo OGG continua funcionando (' + arqOk.status + ')');
  ok(arqOk.corpo.mime === 'audio/ogg', 'e volta como audio/ogg');
  const aindaVivo = await api.get('/api/saude');
  ok(aindaVivo.status === 200, 'e o servidor continua de pe depois da recusa');

  encerrar(srv.proc); await espera(300);

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n=== 2) COM CONVERSOR: A GRAVACAO VIRA OGG ===');
  const logFila = path.join(tmp, 'fila.log');
  srv = await subir(tmp, path.join(tmp, 's2.log'), { FFMPEG_BIN: DUBLE, DUBLE_MODO: 'ok', DUBLE_LOG: logFila });
  ok(srv.vivo, 'servidor subiu com o conversor disponivel');
  api = cliente(srv.porta);
  adm = await api.post('/api/login', { login: 'admin', senha: SENHA_ADMIN });
  ck = adm.cookie;

  const saudeCom = await api.get('/api/saude');
  ok(saudeCom.corpo.audio_voz && saudeCom.corpo.audio_voz.ffmpeg === true,
    'o /api/saude diz que o conversor esta disponivel');

  const grav = await api.post('/api/whatsapp/bot/audio-gravado',
    { dataUrl: comoDataUrl(gravacaoFalsa(4096)), destino: 'bot', duracao_s: 12 }, ck);
  ok(grav.status === 200 && grav.corpo.ok === true, 'a gravacao e aceita (' + grav.status + ')');
  ok(/\.ogg$/.test(grav.corpo.arquivo || ''), 'e guardada com extensao .ogg (' + grav.corpo.arquivo + ')');
  ok(grav.corpo.mime === 'audio/ogg' && grav.corpo.tipoAnexo === 'audio',
    'devolvendo mime audio/ogg e tipoAnexo audio');
  ok(grav.corpo.gravado === true, 'marcada como gravada pela tela');

  // O ARQUIVO NO DISCO e OGG de verdade, e esta FORA da pasta publica.
  const caminhoReal = path.join(tmp, 'bot-midia', grav.corpo.arquivo);
  ok(fs.existsSync(caminhoReal), 'o arquivo existe na pasta protegida do sistema');
  if (fs.existsSync(caminhoReal)) {
    const bytes = fs.readFileSync(caminhoReal);
    ok(bytes.slice(0, 4).toString('latin1') === 'OggS', 'e o conteudo comeca com OggS (e OGG de verdade)');
  }
  ok(!fs.existsSync(path.join(tmp, 'uploads', grav.corpo.arquivo)),
    'e NAO esta na pasta publica /uploads');

  // Sai pela rota com login, com o tipo certo.
  const servido = await api.get('/api/whatsapp/bot/midia/' + encodeURIComponent(grav.corpo.arquivo), ck);
  ok(servido.status === 200 && /audio\/ogg/.test(servido.tipo), 'a rota com login entrega como audio/ogg (' + servido.tipo + ')');
  const semLogin = await api.get('/api/whatsapp/bot/midia/' + encodeURIComponent(grav.corpo.arquivo));
  ok(semLogin.status === 403 || semLogin.status === 401, 'e sem login nao sai (' + semLogin.status + ')');

  console.log('\n=== 3) LIMITE DE TAMANHO ===');
  const grande = await api.post('/api/whatsapp/bot/audio-gravado',
    { dataUrl: comoDataUrl(gravacaoFalsa(13 * 1024 * 1024)), destino: 'bot' }, ck);
  ok(grande.status === 413 && grande.corpo.motivo === 'grande',
    'gravacao acima do limite: 413 (' + grande.status + '/' + grande.corpo.motivo + ')');
  ok(/MB/.test(grande.corpo.error || ''), 'dizendo o limite em MB: "' + grande.corpo.error + '"');
  const vazia = await api.post('/api/whatsapp/bot/audio-gravado', { dataUrl: 'data:audio/webm;base64,' }, ck);
  ok(vazia.status === 400, 'gravacao vazia: 400 (' + vazia.status + ')');
  const semNada = await api.post('/api/whatsapp/bot/audio-gravado', {}, ck);
  ok(semNada.status === 400, 'pedido sem gravacao: 400 (' + semNada.status + ')');

  console.log('\n=== 4) NO MAXIMO 2 CONVERSOES AO MESMO TEMPO ===');
  encerrar(srv.proc); await espera(300);
  try { fs.unlinkSync(logFila); } catch (e) {}
  srv = await subir(tmp, path.join(tmp, 's3.log'),
    { FFMPEG_BIN: DUBLE, DUBLE_MODO: 'lento', DUBLE_MS: '500', DUBLE_LOG: logFila });
  api = cliente(srv.porta);
  adm = await api.post('/api/login', { login: 'admin', senha: SENHA_ADMIN });
  ck = adm.cookie;
  const varios = await Promise.all([1, 2, 3, 4, 5].map(function () {
    return api.post('/api/whatsapp/bot/audio-gravado',
      { dataUrl: comoDataUrl(gravacaoFalsa(2048)), destino: 'bot' }, ck);
  }));
  ok(varios.every(function (r) { return r.status === 200 && r.corpo.ok; }),
    'as 5 gravacoes ao mesmo tempo foram todas convertidas (' + varios.filter(r => r.corpo.ok).length + '/5)');
  // Pelo diario do duble: quantas estavam rodando juntas no pico?
  let pico = 0, agora = 0;
  (fs.existsSync(logFila) ? fs.readFileSync(logFila, 'utf8') : '').split('\n').forEach(function (l) {
    if (/^inicio /.test(l)) { agora++; if (agora > pico) pico = agora; }
    else if (/^fim /.test(l)) { agora--; }
  });
  ok(pico > 0 && pico <= 2, 'no pico, no maximo 2 conversores rodando juntos (pico: ' + pico + ')');

  console.log('\n=== 5) CONVERSAO QUE FALHA OU SAI ERRADA ===');
  encerrar(srv.proc); await espera(300);
  srv = await subir(tmp, path.join(tmp, 's4.log'), { FFMPEG_BIN: DUBLE, DUBLE_MODO: 'falha' });
  api = cliente(srv.porta);
  adm = await api.post('/api/login', { login: 'admin', senha: SENHA_ADMIN });
  ck = adm.cookie;
  const falhou = await api.post('/api/whatsapp/bot/audio-gravado',
    { dataUrl: comoDataUrl(gravacaoFalsa()), destino: 'bot' }, ck);
  ok(falhou.status === 400 && falhou.corpo.ok === false, 'conversao que falha: responde erro (' + falhou.status + ')');
  ok(/converter/i.test(falhou.corpo.error || ''), 'com recado em portugues: "' + falhou.corpo.error + '"');
  ok((await api.get('/api/saude')).status === 200, 'e o servidor continua de pe');

  encerrar(srv.proc); await espera(300);
  srv = await subir(tmp, path.join(tmp, 's5.log'), { FFMPEG_BIN: DUBLE, DUBLE_MODO: 'lixo' });
  api = cliente(srv.porta);
  adm = await api.post('/api/login', { login: 'admin', senha: SENHA_ADMIN });
  ck = adm.cookie;
  const lixo = await api.post('/api/whatsapp/bot/audio-gravado',
    { dataUrl: comoDataUrl(gravacaoFalsa()), destino: 'bot' }, ck);
  ok(lixo.status === 500 && lixo.corpo.ok === false,
    'saida que NAO e OGG e recusada, mesmo o conversor dizendo que deu certo (' + lixo.status + ')');
  ok(/formato inesperado/i.test(lixo.corpo.error || ''), 'dizendo o motivo: "' + lixo.corpo.error + '"');

  console.log('\n=== 6) PERMISSAO ===');
  const semSessao = await api.post('/api/whatsapp/bot/audio-gravado',
    { dataUrl: comoDataUrl(gravacaoFalsa()), destino: 'bot' });
  ok(semSessao.status === 403 || semSessao.status === 401, 'sem login nao grava (' + semSessao.status + ')');

  encerrar(srv.proc); await espera(300);

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n=== 7) CONVIVENCIA: ARQUIVO E GRAVACAO, LADO A LADO ===');
  srv = await subir(tmp, path.join(tmp, 's6.log'), { FFMPEG_BIN: DUBLE, DUBLE_MODO: 'ok' });
  api = cliente(srv.porta);
  adm = await api.post('/api/login', { login: 'admin', senha: SENHA_ADMIN });
  ck = adm.cookie;

  const porArquivo = await api.post('/api/whatsapp/bot/midia',
    { dataUrl: 'data:audio/ogg;base64,' + oggFalso().toString('base64'), destino: 'audio' }, ck);
  const porGravacao = await api.post('/api/whatsapp/bot/audio-gravado',
    { dataUrl: comoDataUrl(gravacaoFalsa()), destino: 'bot' }, ck);
  ok(porArquivo.corpo.ok === true && porGravacao.corpo.ok === true,
    'as DUAS maneiras funcionam na mesma instalacao');
  ok(porArquivo.corpo.arquivo !== porGravacao.corpo.arquivo, 'cada uma gera o seu arquivo');
  ok(porArquivo.corpo.mime === 'audio/ogg' && porGravacao.corpo.mime === 'audio/ogg',
    'e as duas saem como audio/ogg, que e o que a Meta toca como voz');
  // E o webm pela rota de ARQUIVO continua recusado, com o recado de sempre.
  const webmNoArquivo = await api.post('/api/whatsapp/bot/midia',
    { dataUrl: comoDataUrl(gravacaoFalsa()), destino: 'audio' }, ck);
  ok(webmNoArquivo.status === 400, 'webm pela rota de ARQUIVO continua recusado (' + webmNoArquivo.status + ')');
  ok(/OGG\/Opus/i.test(webmNoArquivo.corpo.error || ''), 'com o recado que ja existia: "' + webmNoArquivo.corpo.error + '"');

  encerrar(srv.proc); await espera(300);

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n=== 8) O BOT MANDA COMO MENSAGEM DE VOZ ===');
  // Aqui o bot e usado direto (com uma Meta de mentira), que e como as outras
  // suites do bot fazem: o que importa e o QUE foi mandado para a Meta.
  const tmpBot = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-audio-bot-'));
  const db = require(path.join(RAIZ, 'whatsapp-db.cjs'));
  const bot = require(path.join(RAIZ, 'whatsapp-bot.cjs'));
  const enviados = [];
  const apiFalsa = {
    sendTextMessage: function (pn, to, texto) {
      enviados.push({ tipo: 'text', to: to, texto: texto });
      return Promise.resolve({ ok: true, wamid: 'wamid.T' + enviados.length });
    },
    sendMediaMessage: function (pn, to, tipo, envio, legenda) {
      enviados.push({ tipo: tipo, to: to, legenda: legenda, media_id: envio && envio.id, filename: envio && envio.filename });
      return Promise.resolve({ ok: true, wamid: 'wamid.M' + enviados.length });
    },
    uploadMedia: function () { return Promise.resolve({ ok: true, media_id: 'mid-audio-1' }); }
  };
  await db.init(tmpBot);
  // O audio gravado, na pasta de midia do bot deste servidor de teste.
  const pastaMidia = path.join(tmpBot, 'bot-midia');
  try { fs.mkdirSync(pastaMidia, { recursive: true }); } catch (e) {}
  const nomeGravado = 'bot_teste_gravado.ogg';
  fs.writeFileSync(path.join(pastaMidia, nomeGravado), oggFalso());

  const CFG = {
    ligado: true, linkVagas: 'https://exemplo/vagas', intervaloPadraoSeg: 0,
    passos: [
      { tipo: 'texto', texto: 'Ola {nome}!' },
      { tipo: 'audio', arquivo: nomeGravado, mime: 'audio/ogg', nomeArquivo: 'gravado-0m12s.ogg', legenda: 'nao deve ir' }
    ],
    atendente: bot.CONFIG_PADRAO.atendente, saida: bot.CONFIG_PADRAO.saida, ritmo: { porMinuto: 600 }
  };
  bot.iniciar({
    db: db, api: apiFalsa, notificar: null, pastaMidia: pastaMidia,
    lembretes: null, lerConfig: function () { return CFG; }
  });
  bot.parar();

  const acc = db.accounts.create({ phone_number_id: 'pn-audio', display_phone: '+55 11 90000-0000', status: 'connected', access_token_enc: 'TOKEN' });
  const c = db.contacts.create({ phone: '5511933334444', name: 'Ana Teste' });
  const cid = (c && c.id) ? c.id : c;
  const cv = db.conversations.create({ account_id: acc, contact_id: cid });
  db.messages.create({ conversation_id: cv, account_id: acc, direction: 'incoming', type: 'text', content: 'oi', wamid: 'a-in-1' });

  // 8a) A SEQUENCIA DE VERDADE: a pessoa escreve, o bot responde.
  await bot.aoReceberMensagem({
    wamid: 'a-in-1', account_id: acc, conversation_id: cv, contact_id: cid,
    telefone: '5511933334444', nome: 'Ana Teste', texto: 'oi', tipo: 'text'
  });
  const fimFila = Date.now() + 20000;
  while (Date.now() < fimFila && enviados.length < 2) {
    await bot.processarFila();
    if (enviados.length >= 2) break;
    await espera(200);
  }
  const comoAudio = enviados.find(function (e) { return e.tipo === 'audio'; });
  ok(!!comoAudio, 'o bot mandou o passo de audio como type "audio" (' + enviados.map(e => e.tipo).join(', ') + ')');
  ok(!!(comoAudio && comoAudio.media_id), 'com o id da midia subida para a Meta');
  ok(!!(comoAudio && !comoAudio.legenda), 'e SEM legenda — a Meta recusa caption em mensagem de voz');
  ok(!!(comoAudio && !comoAudio.filename), 'e sem filename (isso e coisa de documento)');
  const naConversa = db.messages.listByConversation(cv, 50, 0).filter(function (m) { return m.type === 'audio'; });
  ok(naConversa.length === 1, 'e o audio ficou registrado na conversa como audio (' + naConversa.length + ')');

  // 8b) O BOTAO "ENVIAR TESTE" da aba Bot, com o mesmo audio gravado.
  const antes = enviados.length;
  const teste = await bot.enviarTeste(acc, '5511933334444', 'Ana Teste');
  ok(teste && teste.ok !== false, 'o "Enviar teste" rodou (' + JSON.stringify((teste || {}).resultados || teste) + ')');
  const audioDoTeste = enviados.slice(antes).find(function (e) { return e.tipo === 'audio'; });
  ok(!!audioDoTeste, 'e o teste tambem mandou o audio como mensagem de voz');
  ok(!!(audioDoTeste && !audioDoTeste.legenda), 'tambem sem legenda');

  db.close();
  try { fs.rmSync(tmpBot, { recursive: true, force: true }); } catch (e) {}
  encerrar(srv.proc);
  await espera(300);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}

  console.log('\n' + (falhas === 0 ? 'AUDIO GRAVADO: TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
