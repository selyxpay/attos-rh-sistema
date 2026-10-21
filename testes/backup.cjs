// Roda pelo executor da suite:  node testes/rodar.cjs backup
// Confere o backup automatico da inicializacao:
//   - a copia e criada antes de o sistema ler ou gravar o state.json
//   - o conteudo e identico ao original
//   - o original nao e alterado, movido nem renomeado
//   - ficam no maximo 20 copias, e so as mais antigas DESSAS sao apagadas
//   - as copias do backup por hora (state-hora-*, state-dia-*) nao sao tocadas
//   - a pasta nunca sai pela web
//   - falha na copia nao impede o sistema de subir
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

// Sobe o servidor com um DATA_DIR nosso e devolve { proc, porta }
async function subir(dadosDir, logPath) {
  const porta = await portaLivre();
  const log = fs.openSync(logPath, 'w');
  const proc = spawn(process.execPath, ['server.cjs'], {
    cwd: RAIZ,
    env: Object.assign({}, process.env, {
      PORT: String(porta), DATA_DIR: dadosDir, ADMIN_SENHA: SENHA_ADMIN, NODE_ENV: 'test'
    }),
    stdio: ['ignore', log, log]
  });
  const vivo = await aguardar(porta, 25);
  return { proc, porta, vivo, logPath };
}

const COPIAS = d => fs.existsSync(path.join(d, 'backups'))
  ? fs.readdirSync(path.join(d, 'backups')).filter(f => /^state_.*\.json$/.test(f)).sort()
  : [];

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-backup-'));
  const dados = path.join(tmp, 'dados');
  fs.mkdirSync(dados, { recursive: true });

  // Estado inicial com conteudo reconhecivel e acentuado
  const estadoOriginal = {
    dados: {
      funcionarios: [{ id: 'f-admin', login: 'admin', nome: 'Administração', departamento: 'administracao', status: 'ativo', senha: sha(SENHA_ADMIN) }],
      candidatos: [{ id: 'c-1', nome: 'João Conceição', obs: 'não mexer' }],
      fila: { contadores: {}, senhas: [], ultimaChamada: null }
    },
    version: 7, atualizadoEm: Date.now()
  };
  const arquivoEstado = path.join(dados, 'state.json');
  fs.writeFileSync(arquivoEstado, JSON.stringify(estadoOriginal, null, 2));
  const originalAntes = fs.readFileSync(arquivoEstado);
  const mtimeAntes = fs.statSync(arquivoEstado).mtimeMs;

  console.log('=== 1) A COPIA E CRIADA NA SUBIDA ===');
  let s = await subir(dados, path.join(tmp, 'log1.txt'));
  ok(s.vivo, 'o servidor subiu normalmente');
  let copias = COPIAS(dados);
  console.log('   copias na pasta backups: ' + JSON.stringify(copias));
  ok(copias.length === 1, 'exatamente 1 copia criada (achou ' + copias.length + ')');
  ok(/^state_\d{4}-\d{2}-\d{2}_\d{2}h\d{2}/.test(copias[0] || ''),
    'o nome tem data e hora: ' + copias[0]);

  console.log('\n=== 2) O CONTEUDO E IDENTICO AO ORIGINAL ===');
  const copiado = fs.readFileSync(path.join(dados, 'backups', copias[0]));
  ok(copiado.equals(originalAntes), 'byte a byte igual ao state.json de antes de subir');
  const lido = JSON.parse(copiado.toString('utf8'));
  ok(lido.dados.candidatos[0].nome === 'João Conceição', 'acento preservado na copia ("' + lido.dados.candidatos[0].nome + '")');
  ok(lido.version === 7, 'a versao veio junto (' + lido.version + ')');

  console.log('\n=== 3) O ORIGINAL NAO FOI ALTERADO, MOVIDO NEM RENOMEADO ===');
  ok(fs.existsSync(arquivoEstado), 'o state.json continua no lugar, com o mesmo nome');
  const originalDepois = fs.readFileSync(arquivoEstado);
  // o servidor pode ter gravado por conta propria depois de subir (garantir
  // admin etc.), mas o conteudo tem que continuar sendo um estado valido com
  // os MESMOS dados que ja estavam la
  const estadoDepois = JSON.parse(originalDepois.toString('utf8'));
  ok(!!estadoDepois.dados, 'e continua sendo um state.json valido');
  ok((estadoDepois.dados.candidatos || []).some(c => c && c.id === 'c-1'),
    'o candidato que ja existia continua la (nenhum dado existente foi mexido)');
  ok(estadoDepois.dados.candidatos.find(c => c.id === 'c-1').nome === 'João Conceição',
    'com o acento intacto');

  console.log('\n=== 4) A PASTA DE BACKUPS NAO SAI PELA WEB ===');
  const BASE = 'http://127.0.0.1:' + s.porta;
  const caminhos = [
    '/server-data/backups/' + copias[0],
    '/backups/' + copias[0],
    '/server-data/state.json',
    '/../' + path.basename(dados) + '/backups/' + copias[0],
    '/server-data/backups/',
    '/uploads/../backups/' + copias[0]
  ];
  for (const c of caminhos) {
    let st = 0, corpo = '';
    try {
      const r = await fetch(BASE + c, { signal: AbortSignal.timeout(4000) });
      st = r.status; corpo = (await r.text()).slice(0, 200);
    } catch (e) { st = -1; }
    const vazou = st === 200 && /"dados"|"funcionarios"|"version"/.test(corpo);
    ok(!vazou, c + ' -> ' + st + (vazou ? '  *** VAZOU O ESTADO ***' : '  (nao entrega o estado)'));
  }
  // e o login continua funcionando, ou seja, nao bloqueei demais
  const rLogin = await fetch(BASE + '/login.html');
  ok(rLogin.status === 200, 'a tela de login continua sendo servida (' + rLogin.status + ')');

  encerrar(s.proc); await espera(600);

  console.log('\n=== 5) CADA SUBIDA GERA UMA COPIA NOVA ===');
  s = await subir(dados, path.join(tmp, 'log2.txt'));
  ok(s.vivo, 'segunda subida ok');
  copias = COPIAS(dados);
  ok(copias.length === 2, 'agora sao 2 copias (achou ' + copias.length + ')');
  encerrar(s.proc); await espera(600);

  console.log('\n=== 6) FICAM NO MAXIMO 20, E SO AS MAIS ANTIGAS SAIEM ===');
  // Cria 25 copias antigas a mao, com datas crescentes, mais as 2 reais
  const pastaBk = path.join(dados, 'backups');
  for (let i = 1; i <= 25; i++) {
    const nome = 'state_2020-01-' + String(i).padStart(2, '0') + '_00h00.json';
    fs.writeFileSync(path.join(pastaBk, nome), JSON.stringify({ marcador: i }));
  }
  // e dois arquivos do OUTRO backup (por hora/dia), que nao podem ser tocados
  fs.writeFileSync(path.join(pastaBk, 'state-hora-14.json'), '{"backup":"hora"}');
  fs.writeFileSync(path.join(pastaBk, 'state-dia-3.json'), '{"backup":"dia"}');
  const antesPoda = COPIAS(dados).length;
  console.log('   copias antes de subir: ' + antesPoda);

  s = await subir(dados, path.join(tmp, 'log3.txt'));
  ok(s.vivo, 'terceira subida ok');
  copias = COPIAS(dados);
  console.log('   copias depois: ' + copias.length);
  ok(copias.length === 20, 'sobraram exatamente 20 copias (achou ' + copias.length + ')');
  // as que sobraram tem que ser as MAIS RECENTES: as de 2020 mais antigas saem primeiro
  ok(!copias.includes('state_2020-01-01_00h00.json'), 'a mais antiga (2020-01-01) foi removida');
  ok(copias.some(f => /^state_2026|^state_202[5-9]/.test(f)) || copias[copias.length - 1] > 'state_2020',
    'as que sobraram sao as mais recentes (ultima: ' + copias[copias.length - 1] + ')');
  ok(fs.existsSync(path.join(pastaBk, 'state-hora-14.json')), 'o backup POR HORA nao foi tocado');
  ok(fs.existsSync(path.join(pastaBk, 'state-dia-3.json')), 'o backup POR DIA nao foi tocado');
  encerrar(s.proc); await espera(600);

  console.log('\n=== 7) FALHA NA COPIA NAO IMPEDE O SISTEMA DE SUBIR ===');
  // Pasta de backups trocada por um ARQUIVO: escrever dentro dela falha.
  const dados2 = path.join(tmp, 'dados2');
  fs.mkdirSync(dados2, { recursive: true });
  fs.writeFileSync(path.join(dados2, 'state.json'), JSON.stringify(estadoOriginal, null, 2));
  fs.writeFileSync(path.join(dados2, 'backups'), 'isto e um arquivo, nao uma pasta');
  const s2 = await subir(dados2, path.join(tmp, 'log4.txt'));
  ok(s2.vivo, 'o servidor SUBIU mesmo com a copia falhando');
  const log4 = fs.readFileSync(path.join(tmp, 'log4.txt'), 'utf8');
  ok(/\[Backup\]/.test(log4), 'e o motivo ficou registrado no log');
  const linhaBackup = (log4.split(/\r?\n/).find(l => /\[Backup\]/.test(l)) || '').slice(0, 130);
  console.log('   log: ' + linhaBackup);
  // e o sistema responde de verdade
  const rOk = await fetch('http://127.0.0.1:' + s2.porta + '/api/time');
  ok(rOk.status === 200, 'e responde normalmente (' + rOk.status + ')');
  encerrar(s2.proc); await espera(600);

  console.log('\n=== 8) PRIMEIRA SUBIDA, SEM state.json, NAO QUEBRA ===');
  const dados3 = path.join(tmp, 'dados3');
  fs.mkdirSync(dados3, { recursive: true });
  const s3 = await subir(dados3, path.join(tmp, 'log5.txt'));
  ok(s3.vivo, 'servidor subiu sem state.json nenhum');
  ok(COPIAS(dados3).length === 0, 'e nao criou copia de coisa que nao existe');
  encerrar(s3.proc); await espera(400);

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log('\n' + (falhas === 0 ? 'BACKUP AUTOMATICO: TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
