// ==========================================================================
// BACKUP DOS DADOS — cópia de segurança completa, sem tocar no original
// --------------------------------------------------------------------------
// Copia TUDO que é dado real (registros, fotos, documentos, banco do WhatsApp)
// para uma pasta de backup. Só LÊ os dados originais — nunca altera, move ou
// apaga nada do que está em uso.
//
// COMO USAR (no servidor, dentro do container ou na VPS):
//
//   node backup-dados.cjs                    -> backup em DATA_DIR/../backups-rt
//   node backup-dados.cjs /caminho/destino   -> backup na pasta escolhida
//
// Recomendado antes de cada deploy. Depois, BAIXE o backup para fora da VPS.
//
// Para automatizar (todo dia às 3h da manhã), na VPS: crontab -e
//   0 3 * * * cd /caminho/do/projeto && node backup-dados.cjs >> /var/log/rt-backup.log 2>&1
// ==========================================================================
const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname);
const DATA_DIR = process.env.DATA_DIR || path.join(BASE, 'server-data');
const MANTER = 14;   // quantos backups guardar (os mais antigos saem)

const destinoRaiz = process.argv[2] || path.join(path.dirname(DATA_DIR), 'backups-rt');
const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const destino = path.join(destinoRaiz, 'backup-' + carimbo);

function copiarPasta(origem, alvo) {
  let arquivos = 0, bytes = 0;
  if (!fs.existsSync(origem)) return { arquivos: 0, bytes: 0, ausente: true };
  fs.mkdirSync(alvo, { recursive: true });
  fs.readdirSync(origem, { withFileTypes: true }).forEach(function (e) {
    const de = path.join(origem, e.name);
    const para = path.join(alvo, e.name);
    if (e.isDirectory()) {
      const r = copiarPasta(de, para);
      arquivos += r.arquivos; bytes += r.bytes;
    } else if (e.isFile()) {
      fs.copyFileSync(de, para);            // copyFile = só leitura da origem
      arquivos++;
      try { bytes += fs.statSync(para).size; } catch (e2) {}
    }
  });
  return { arquivos: arquivos, bytes: bytes, ausente: false };
}

function mb(n) { return (n / 1048576).toFixed(1) + ' MB'; }

console.log('=== BACKUP DOS DADOS ATTOS RH ===');
console.log('origem : ' + DATA_DIR);
console.log('destino: ' + destino);
console.log('');

if (!fs.existsSync(DATA_DIR)) {
  console.error('PAREI: a pasta de dados nao existe: ' + DATA_DIR);
  console.error('Confira a variavel DATA_DIR. Nada foi feito.');
  process.exit(1);
}

// Recusa fazer backup de um estado vazio por cima de backups bons.
let registros = 0;
try {
  const st = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'state.json'), 'utf8'));
  const eq = ((st.dados || {}).equipamentos) || [];
  registros = Array.isArray(eq) ? eq.length : 0;
  console.log('Equipamentos/EPI encontrados: ' + registros + ' registro(s)');
  if ((st.version || 0) > 1 && registros === 0) {
    console.warn('AVISO: o estado ja foi usado (versao ' + st.version + ') mas esta sem registros.');
    console.warn('Isso pode indicar volume persistente ausente. O backup vai ser feito assim mesmo,');
    console.warn('numa pasta nova (nenhum backup anterior e sobrescrito).');
  }
} catch (e) {
  console.warn('AVISO: nao consegui ler o state.json (' + e.message + '). Seguindo com o backup dos arquivos.');
}

fs.mkdirSync(destino, { recursive: true });

const partes = [
  ['state.json (registros do sistema)', 'state.json', 'arquivo'],
  ['uploads (fotos e documentos)', 'uploads', 'pasta'],
  ['equipamentos (espelho + snapshots)', 'equipamentos', 'pasta'],
  ['backups automaticos', 'backups', 'pasta'],
  ['whatsapp.db (banco do WhatsApp)', 'whatsapp.db', 'arquivo'],
  ['sessions.json', 'sessions.json', 'arquivo']
];

let totalArquivos = 0, totalBytes = 0;
partes.forEach(function (p) {
  const origem = path.join(DATA_DIR, p[1]);
  const alvo = path.join(destino, p[1]);
  if (!fs.existsSync(origem)) { console.log('  - ' + p[0] + ': ausente (pulado)'); return; }
  if (p[2] === 'arquivo') {
    fs.copyFileSync(origem, alvo);
    const b = fs.statSync(alvo).size;
    totalArquivos++; totalBytes += b;
    console.log('  OK ' + p[0] + '  (' + mb(b) + ')');
  } else {
    const r = copiarPasta(origem, alvo);
    totalArquivos += r.arquivos; totalBytes += r.bytes;
    console.log('  OK ' + p[0] + '  (' + r.arquivos + ' arquivo(s), ' + mb(r.bytes) + ')');
  }
});

// Ficha do backup, para saber depois o que tem dentro
try {
  fs.writeFileSync(path.join(destino, 'INFORMACOES-DO-BACKUP.txt'),
    'Backup do sistema ATTOS RH\n' +
    'Data...........: ' + new Date().toISOString() + '\n' +
    'Origem.........: ' + DATA_DIR + '\n' +
    'Equipamentos...: ' + registros + ' registro(s)\n' +
    'Arquivos.......: ' + totalArquivos + '\n' +
    'Tamanho........: ' + mb(totalBytes) + '\n\n' +
    'COMO RESTAURAR:\n' +
    '1. Pare a aplicacao.\n' +
    '2. Copie o conteudo desta pasta de volta para ' + DATA_DIR + '\n' +
    '3. Suba a aplicacao.\n' +
    'Para restaurar SO os equipamentos, use: node restaurar-equipamentos.cjs\n');
} catch (e) {}

console.log('');
console.log('=== BACKUP CONCLUIDO ===');
console.log('  arquivos: ' + totalArquivos);
console.log('  tamanho.: ' + mb(totalBytes));
console.log('  pasta...: ' + destino);

// Limpa backups antigos (mexe SO na pasta de backups, nunca nos dados)
try {
  const antigos = fs.readdirSync(destinoRaiz)
    .filter(function (n) { return /^backup-/.test(n); })
    .sort();
  while (antigos.length > MANTER) {
    const velho = antigos.shift();
    fs.rmSync(path.join(destinoRaiz, velho), { recursive: true, force: true });
    console.log('  (removido backup antigo: ' + velho + ')');
  }
} catch (e) {}

console.log('');
console.log('IMPORTANTE: baixe esta pasta para FORA da VPS.');
console.log('Um backup que mora no mesmo servidor nao protege contra perda do servidor.');
