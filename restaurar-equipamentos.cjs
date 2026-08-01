// ==========================================================================
// RESTAURAR EQUIPAMENTOS — ferramenta de emergência
// --------------------------------------------------------------------------
// Devolve os registros de Entrega/Devolução de Equipamentos a partir do
// espelho independente (DATA_DIR/equipamentos/equipamentos.json), sem mexer
// em nenhuma outra parte do sistema.
//
// COMO USAR (na VPS, dentro da pasta do projeto):
//
//   node restaurar-equipamentos.cjs                 -> só CONFERE (não altera nada)
//   node restaurar-equipamentos.cjs --aplicar       -> restaura de verdade
//   node restaurar-equipamentos.cjs --de-snapshot equipamentos-2026-08-01T12-00-00.json --aplicar
//
// Sempre rode SEM --aplicar primeiro: ele mostra quantos registros existem
// hoje e quantos voltariam. Só depois rode com --aplicar.
//
// Segurança: antes de alterar, grava uma cópia do state.json atual em
// backups/state-antes-de-restaurar-<data>.json. Nada é perdido.
// ==========================================================================
const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname);
const DATA_DIR = process.env.DATA_DIR || path.join(BASE, 'server-data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const DIR_EQUIP = path.join(DATA_DIR, 'equipamentos');
const DIR_SNAPS = path.join(DIR_EQUIP, 'snapshots');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const args = process.argv.slice(2);
const APLICAR = args.indexOf('--aplicar') >= 0;
const iSnap = args.indexOf('--de-snapshot');
const SNAP = iSnap >= 0 ? args[iSnap + 1] : null;

function sair(msg, codigo) {
  console.log(msg);
  process.exit(codigo || 0);
}

function contarFotos(lista) {
  let n = 0;
  (lista || []).forEach(function (r) { if (Array.isArray(r && r.fotos)) n += r.fotos.length; });
  return n;
}

console.log('=== RESTAURAR EQUIPAMENTOS ===');
console.log('DATA_DIR:', DATA_DIR);
console.log('');

// 1. Lê a origem (espelho atual ou snapshot escolhido)
const origem = SNAP ? path.join(DIR_SNAPS, SNAP) : path.join(DIR_EQUIP, 'equipamentos.json');
let espelho;
try {
  espelho = JSON.parse(fs.readFileSync(origem, 'utf8'));
} catch (e) {
  console.log('Não consegui ler o espelho em: ' + origem);
  console.log('Motivo: ' + e.message);
  if (fs.existsSync(DIR_SNAPS)) {
    const snaps = fs.readdirSync(DIR_SNAPS).sort().reverse().slice(0, 10);
    if (snaps.length) {
      console.log('\nSnapshots disponíveis (mais novo primeiro):');
      snaps.forEach(function (s) { console.log('  ' + s); });
      console.log('\nUse: node restaurar-equipamentos.cjs --de-snapshot <nome> --aplicar');
    }
  }
  process.exit(1);
}

const doEspelho = Array.isArray(espelho.equipamentos) ? espelho.equipamentos : [];
console.log('Espelho lido de : ' + path.basename(origem));
console.log('  gravado em    : ' + (espelho.gravadoEm || '?'));
console.log('  registros     : ' + doEspelho.length);
console.log('  fotos         : ' + contarFotos(doEspelho));

// 2. Lê o estado atual
let estado;
try {
  estado = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
} catch (e) {
  sair('\nNão consegui ler o state.json (' + e.message + ').', 1);
}
const dados = estado.dados || {};
const atuais = Array.isArray(dados.equipamentos) ? dados.equipamentos : [];
console.log('\nEstado atual do sistema:');
console.log('  registros     : ' + atuais.length);
console.log('  fotos         : ' + contarFotos(atuais));

// 3. Compara: quem está no espelho e não está no sistema
const idsAtuais = new Set(atuais.map(function (r) { return r && r.id != null ? String(r.id) : null; }));
const faltando = doEspelho.filter(function (r) { return r && r.id != null && !idsAtuais.has(String(r.id)); });

console.log('\n--- COMPARAÇÃO ---');
console.log('  registros que voltariam: ' + faltando.length);
console.log('  fotos que voltariam    : ' + contarFotos(faltando));
console.log('  total depois           : ' + (atuais.length + faltando.length));

// 4. Confere se os arquivos de foto ainda existem em uploads/
const refs = espelho.arquivosReferenciados || [];
let sumidos = 0;
refs.forEach(function (rel) {
  const arq = path.join(DATA_DIR, rel.replace(/^\//, ''));
  if (!fs.existsSync(arq)) sumidos++;
});
if (refs.length) {
  console.log('\nArquivos de foto/documento referenciados: ' + refs.length +
    (sumidos ? ('  (ATENÇÃO: ' + sumidos + ' não encontrado(s) em uploads/)') : '  (todos presentes)'));
}

if (!faltando.length) {
  sair('\nNada a restaurar — o sistema já tem todos os registros do espelho.');
}

if (!APLICAR) {
  sair('\n>> Isto foi apenas uma CONFERÊNCIA. Nada foi alterado.\n' +
       '>> Para restaurar de verdade, rode de novo com --aplicar');
}

// 5. Backup do estado atual antes de mexer
try {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const destino = path.join(BACKUP_DIR, 'state-antes-de-restaurar-' + carimbo + '.json');
  fs.copyFileSync(STATE_FILE, destino);
  console.log('\nBackup do estado atual: ' + path.basename(destino));
} catch (e) {
  sair('\nPAREI: não consegui fazer o backup de segurança (' + e.message + ').\n' +
       'Nada foi alterado. Resolva o backup antes de restaurar.', 1);
}

// 6. Restaura (só ADICIONA o que falta — nunca sobrescreve o que já está lá)
dados.equipamentos = atuais.concat(faltando);
estado.dados = dados;
estado.version = (estado.version || 0) + 1;
estado.atualizadoEm = Date.now();

const tmp = STATE_FILE + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(estado));
fs.renameSync(tmp, STATE_FILE);

console.log('\n=== RESTAURADO ===');
console.log('  registros antes : ' + atuais.length);
console.log('  registros agora : ' + dados.equipamentos.length);
console.log('  fotos agora     : ' + contarFotos(dados.equipamentos));
console.log('\nReinicie o sistema para carregar:  pm2 restart rt-vagas');
