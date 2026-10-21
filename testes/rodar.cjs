#!/usr/bin/env node
// ==========================================================================
// EXECUTOR DA SUITE DE TESTES
// ==========================================================================
//
//   node testes/rodar.cjs            roda tudo
//   node testes/rodar.cjs sync       roda so a suite "sync"
//   node testes/rodar.cjs --lista    mostra as suites disponiveis
//
// Cada suite roda num SERVIDOR PROPRIO, numa porta livre e com uma pasta de
// dados nova e descartavel. Nenhum teste encosta no server-data/ real nem na
// VPS. As suites de tela sobem um Chrome sem janela, sozinho.
//
// Isto e Node puro, sem framework e sem dependencia nova -- mesma regra do
// resto do sistema.

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.resolve(__dirname, '..');
const SENHA_ADMIN = 'TesteLocal#123';
const sha = s => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');

// ── SEMENTES ───────────────────────────────────────────────────────────────
// Algumas suites precisam de contas especificas para testar nivel de acesso.
// A senha aqui e descartavel e vive so na pasta temporaria do teste.
function sementeAcesso() {
  return {
    funcionarios: [
      { id: 'f-admin', login: 'admin', nome: 'Administrador', departamento: 'administracao', status: 'ativo', senha: sha(SENHA_ADMIN) },
      { id: 'f-mestre', login: 'joaobalaf', nome: 'Joao', departamento: 'administracao', status: 'ativo', senha: sha('Mestre#123') },
      { id: 'f-comum', login: 'zecomum', nome: 'Ze Comum', departamento: 'selecao', status: 'ativo', senha: sha('Comum#123'), permissoes: { selecao: { visualizar: true } } }
    ],
    candidatos: [], vagas: [], fluxosFinanceiros: [], equipamentos: [], logs: [],
    fila: { contadores: {}, senhas: [], ultimaChamada: null }
  };
}
function sementeTelas() {
  return {
    funcionarios: [
      { id: 'f-admin', login: 'admin', nome: 'Administrador', departamento: 'administracao', status: 'ativo', senha: sha(SENHA_ADMIN) },
      { id: 'f-sem', login: 'zesem', nome: 'Ze Sem', departamento: 'selecao', status: 'ativo', senha: sha('Sem#123'), permissoes: {} },
      { id: 'f-ver', login: 'zever', nome: 'Ze Ver', departamento: 'selecao', status: 'ativo', senha: sha('Ver#123'), permissoes: {} },
      { id: 'f-edit', login: 'zeedit', nome: 'Ze Edit', departamento: 'selecao', status: 'ativo', senha: sha('Edit#123'), permissoes: {} },
      { id: 'f-antigo', login: 'zeantigo', nome: 'Ze Antigo', departamento: 'dp', status: 'ativo', senha: sha('Antigo#123') }
    ],
    candidatos: [], vagas: [], fluxosFinanceiros: [], equipamentos: [], precificacao: [],
    logs: [{ id: 'log-0', data: 'ontem', usuario: 'Sistema', acao: 'inicio', categoria: 'sistema' }],
    fila: { contadores: {}, senhas: [], ultimaChamada: null }
  };
}

// ── AS SUITES ──────────────────────────────────────────────────────────────
const SUITES = [
  { nome: 'backup',    arquivo: 'backup.cjs',         servidor: false, navegador: false,
    titulo: 'Backup automatico na inicializacao (sobe o servidor por conta propria)' },
  { nome: 'ff',        arquivo: 'ff-leitura.cjs',     servidor: false, navegador: false,
    titulo: 'Fluxo Financeiro — leitura de PDF e valor em reais' },
  { nome: 'imagem',    arquivo: 'imagem-e-contas.cjs', servidor: true,  navegador: false, semente: sementeAcesso,
    titulo: 'Imagem do Docker completa, peca opcional nao derruba o resto, contas sobrevivem' },
  { nome: 'backend',   arquivo: 'backend-fechado.cjs', servidor: true, navegador: false,
    titulo: 'Backend e pasta de dados fechados para a web (o vazamento do /server.cjs)' },
  { nome: 'seguranca', arquivo: 'seguranca.cjs',      servidor: true,  navegador: false, semente: sementeAcesso,
    titulo: 'Seguranca e estabilidade (queda por URL, escalada de acesso, senha no payload)' },
  { nome: 'upload',    arquivo: 'upload.cjs',         servidor: true,  navegador: false,
    titulo: 'Upload — tipo pelo conteudo, SVG barrado' },
  { nome: 'upload-ui', arquivo: 'upload-ui.cjs',      servidor: true,  navegador: true,
    titulo: 'Upload no navegador — foto renderiza, SVG nao' },
  { nome: 'texto',     arquivo: 'texto-longo.cjs',     servidor: true,  navegador: true,
    titulo: 'Descritivo de vaga: quebras de linha preservadas e HTML escapado' },
  { nome: 'dados',     arquivo: 'dados.cjs',          servidor: true,  navegador: false,
    titulo: 'Dado que nao gravava ou voltava (fila, acento, sigilo, diaria, lista vazia)' },
  { nome: 'dados-ui',  arquivo: 'dados-ui.cjs',       servidor: true,  navegador: true,
    titulo: 'Dados no navegador — fila, cadastro de candidato, log de equipamento' },
  { nome: 'sync',      arquivo: 'sincronizacao.cjs',  servidor: true,  navegador: false,
    titulo: 'Sincronizacao com DUAS pessoas ao mesmo tempo' },
  { nome: 'telas',     arquivo: 'permissao-telas.cjs', servidor: true, navegador: false, semente: sementeTelas,
    titulo: 'Permissao por tela, com bloqueio no servidor' },
  { nome: 'bot',       arquivo: 'bot.cjs',            servidor: true,  navegador: false, semente: sementeAcesso,
    titulo: 'Bot de atendimento: ordem de decisao, fila, permissao e midia' },
  { nome: 'midia',     arquivo: 'midia.cjs',          servidor: true,  navegador: false, semente: sementeAcesso,
    titulo: 'Midia que chega: tipo certo, rota com sessao, persistencia e nova tentativa' },
  { nome: 'respostas', arquivo: 'respostas.cjs',       servidor: true,  navegador: false, semente: sementeAcesso,
    titulo: 'Mensagens prontas: janela de 24h, catalogo, permissao, anexo e previa' },
  { nome: 'respostas-ui', arquivo: 'respostas-ui.cjs',  servidor: true,  navegador: true,
    titulo: 'Mensagens prontas na tela — fileira, lista do "/", cadastro e celular' },
  { nome: 'estavel',   arquivo: 'tela-estavel.cjs',    servidor: true,  navegador: true,
    titulo: 'Tela estavel: 502 nao apaga a tela, digitacao preservada, rolagem mantida' },
  { nome: 'wa-msgs',   arquivo: 'whatsapp-mensagens.cjs', servidor: true, navegador: true,
    titulo: 'WhatsApp: todo tipo de mensagem aparece, emoji certo, lista limpa' },
  { nome: 'whatsapp',  arquivo: 'whatsapp-layout.cjs', servidor: true, navegador: true,
    titulo: 'Layout do WhatsApp no computador, em 4 resolucoes' },
  { nome: 'limpeza',   arquivo: 'limpeza.cjs',        servidor: true,  navegador: false,
    titulo: 'Endurecimento (corpo invalido, rota inexistente)' },
  { nome: 'limpeza-ui', arquivo: 'limpeza-ui.cjs',    servidor: true,  navegador: true,
    titulo: 'Limpeza no navegador — link de ficha, kanban removido, 25 abas' },
  { nome: 'abas',      arquivo: 'varredura-abas.cjs', servidor: true,  navegador: true,
    titulo: 'Varredura das 25 abas: erro de console e chamada que falha' }
];

// ── UTILIDADES ─────────────────────────────────────────────────────────────
function portaLivre() {
  return new Promise(function (res, rej) {
    const s = net.createServer();
    s.unref();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', function () {
      const p = s.address().port;
      s.close(function () { res(p); });
    });
  });
}
const espera = ms => new Promise(r => setTimeout(r, ms));

async function aguardarServidor(porta, segundos) {
  const limite = Date.now() + (segundos || 20) * 1000;
  while (Date.now() < limite) {
    try {
      const r = await fetch('http://127.0.0.1:' + porta + '/api/time', { signal: AbortSignal.timeout(1500) });
      if (r.status === 200) return true;
    } catch (e) { /* ainda subindo */ }
    await espera(300);
  }
  return false;
}
async function aguardarNavegador(porta, segundos) {
  const limite = Date.now() + (segundos || 25) * 1000;
  while (Date.now() < limite) {
    try {
      const r = await fetch('http://127.0.0.1:' + porta + '/json/version', { signal: AbortSignal.timeout(1500) });
      if (r.status === 200) return true;
    } catch (e) { /* ainda subindo */ }
    await espera(400);
  }
  return false;
}

function acharChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const candidatos = process.platform === 'win32' ? [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
  ] : [
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  for (const c of candidatos) { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  return null;
}

function encerrar(proc) {
  if (!proc || proc.killed) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    else proc.kill('SIGKILL');
  } catch (e) { /* ja morreu */ }
}

// ── RODA UMA SUITE ─────────────────────────────────────────────────────────
async function rodarSuite(s, chrome) {
  console.log('');
  console.log('='.repeat(74));
  console.log('  ' + s.nome.toUpperCase() + ' — ' + s.titulo);
  console.log('='.repeat(74));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-teste-' + s.nome + '-'));
  let servidor = null, navegador = null, portaServidor = 0, portaCdp = 0;
  const env = Object.assign({}, process.env);

  try {
    if (s.servidor) {
      portaServidor = await portaLivre();
      const dadosDir = path.join(tmp, 'dados');
      fs.mkdirSync(dadosDir, { recursive: true });
      if (s.semente) {
        fs.writeFileSync(path.join(dadosDir, 'state.json'),
          JSON.stringify({ dados: s.semente(), version: 5, atualizadoEm: Date.now() }, null, 2));
      }
      const log = fs.openSync(path.join(tmp, 'servidor.log'), 'w');
      servidor = spawn(process.execPath, ['server.cjs'], {
        cwd: RAIZ,
        env: Object.assign({}, process.env, {
          PORT: String(portaServidor), DATA_DIR: dadosDir, ADMIN_SENHA: SENHA_ADMIN, NODE_ENV: 'test'
        }),
        stdio: ['ignore', log, log]
      });
      if (!(await aguardarServidor(portaServidor, 25))) {
        console.log('  FALHOU: o servidor de teste nao subiu. Log em ' + path.join(tmp, 'servidor.log'));
        return false;
      }
      env.BASE = 'http://127.0.0.1:' + portaServidor;
      // A pasta de dados DO SERVIDOR do teste. Algumas suites precisam colocar
      // um arquivo lá para exercitar rota que serve arquivo (mídia recebida,
      // por exemplo) sem depender de internet.
      env.DADOS = dadosDir;
      console.log('  servidor de teste: ' + env.BASE + '  (dados em ' + dadosDir + ')');
    }

    if (s.navegador) {
      if (!chrome) {
        console.log('  PULADA: nao achei o Chrome. Defina CHROME=caminho/do/chrome para rodar as suites de tela.');
        return null;   // pulada, nao e falha
      }
      portaCdp = await portaLivre();
      const perfil = path.join(tmp, 'perfil-navegador');
      navegador = spawn(chrome, [
        '--headless=new',
        '--remote-debugging-port=' + portaCdp,
        '--user-data-dir=' + perfil,
        '--no-first-run', '--no-default-browser-check', '--disable-gpu',
        '--window-size=1500,1000',
        env.BASE || 'about:blank'
      ], { stdio: 'ignore' });
      if (!(await aguardarNavegador(portaCdp, 30))) {
        console.log('  FALHOU: o navegador de teste nao subiu.');
        return false;
      }
      env.CDP = String(portaCdp);
      console.log('  navegador de teste: porta ' + portaCdp);
    }

    const r = spawnSync(process.execPath, [path.join(__dirname, s.arquivo)], {
      cwd: RAIZ, env: env, stdio: 'inherit', timeout: 10 * 60 * 1000
    });
    return r.status === 0;
  } finally {
    encerrar(navegador);
    encerrar(servidor);
    await espera(400);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* o SO limpa depois */ }
  }
}

// ── PRINCIPAL ──────────────────────────────────────────────────────────────
(async () => {
  const arg = (process.argv[2] || '').trim();
  if (arg === '--lista' || arg === '-l') {
    console.log('Suites disponiveis:\n');
    SUITES.forEach(function (s) {
      console.log('  ' + s.nome.padEnd(12) + s.titulo + (s.navegador ? '  [precisa do Chrome]' : ''));
    });
    console.log('\n  node testes/rodar.cjs <nome>    roda uma so');
    console.log('  node testes/rodar.cjs           roda todas');
    process.exit(0);
  }

  let aRodar = SUITES;
  if (arg && !arg.startsWith('-')) {
    aRodar = SUITES.filter(function (s) { return s.nome === arg; });
    if (!aRodar.length) {
      console.error('Suite "' + arg + '" nao existe. Use --lista para ver as disponiveis.');
      process.exit(2);
    }
  }

  const chrome = acharChrome();
  if (aRodar.some(function (s) { return s.navegador; })) {
    console.log(chrome ? 'Chrome: ' + chrome : 'Chrome NAO encontrado — as suites de tela serao PULADAS.');
  }

  const resultados = [];
  for (const s of aRodar) {
    const r = await rodarSuite(s, chrome);
    resultados.push({ nome: s.nome, r: r });
  }

  console.log('');
  console.log('='.repeat(74));
  console.log('  RESUMO');
  console.log('='.repeat(74));
  resultados.forEach(function (x) {
    const etiqueta = x.r === null ? 'PULADA' : (x.r ? 'OK' : 'FALHOU');
    console.log('  ' + etiqueta.padEnd(8) + x.nome);
  });
  const falharam = resultados.filter(function (x) { return x.r === false; });
  const puladas = resultados.filter(function (x) { return x.r === null; });
  console.log('');
  console.log('  ' + (resultados.length - falharam.length - puladas.length) + ' ok, ' +
              falharam.length + ' falhou, ' + puladas.length + ' pulada(s)');
  process.exit(falharam.length ? 1 : 0);
})().catch(function (e) {
  console.error('ERRO NO EXECUTOR:', e.stack || e.message);
  process.exit(1);
});
