// ==========================================================================
// REPARAR LISTAS INFLADAS — remove repetições que dobraram sozinhas
// --------------------------------------------------------------------------
// O QUE ACONTECEU
// A mesclagem do servidor anexava de volta, a cada gravação, os itens que não
// têm "id" (listas de textos, como tiposPagamentoFluxo). A lista DOBRAVA a
// cada save: 9 -> 18 -> 36 -> ... chegando a 6,5 milhões de itens e 78 MB.
// Com o state.json gigante, TODO save passou a falhar.
//
// O QUE ESTE SCRIPT FAZ
// Só nas listas SEM id, remove os valores repetidos e mantém um de cada, na
// ordem original. Nada mais é tocado: equipamentos, candidatos, funcionários,
// fluxos e qualquer lista com id ficam exatamente como estão.
//
// SEGURANÇA
// - Backup do state.json antes de gravar.
// - Confere as contagens das áreas importantes ANTES x DEPOIS e ABORTA se
//   qualquer uma mudar.
// - Sem --aplicar, apenas SIMULA.
//
// USO (no Terminal do Coolify):
//     node reparar-listas-infladas.cjs              -> simula
//     node reparar-listas-infladas.cjs --aplicar    -> executa
// ==========================================================================
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || '/data';
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const APLICAR = process.argv.indexOf('--aplicar') >= 0;
const mb = n => (n / 1048576).toFixed(1) + ' MB';

console.log('=== REPARAR LISTAS INFLADAS ===');
console.log('modo: ' + (APLICAR ? 'APLICAR (vai alterar)' : 'SIMULACAO (nao altera nada)') + '\n');

let bruto;
try { bruto = fs.readFileSync(STATE_FILE, 'utf8'); }
catch (e) { console.error('PAREI: nao consegui ler ' + STATE_FILE + ' (' + e.message + ')'); process.exit(1); }
const antesBytes = Buffer.byteLength(bruto);
console.log('state.json agora: ' + mb(antesBytes));

let estado;
try { estado = JSON.parse(bruto); }
catch (e) { console.error('PAREI: state.json invalido (' + e.message + ')'); process.exit(1); }
const d = estado.dados || {};

// Contagens que NÃO podem mudar (áreas com id — os dados de verdade)
function contar(x) {
  const n = k => Array.isArray(x[k]) ? x[k].length : 0;
  const eq = Array.isArray(x.equipamentos) ? x.equipamentos : [];
  let fotos = 0; eq.forEach(r => { if (Array.isArray(r && r.fotos)) fotos += r.fotos.length; });
  return { equipamentos: eq.length, fotosEquip: fotos, candidatos: n('candidatos'),
           funcionarios: n('funcionarios'), contratacoes: n('contratacoes'),
           fluxosFinanceiros: n('fluxosFinanceiros'), examesMedicos: n('examesMedicos'),
           bancoTalentos: n('bancoTalentos'), vagas: n('vagas') };
}
const antes = contar(d);

// Só mexe em listas cujos itens NÃO têm id
const relatorio = [];
Object.keys(d).forEach(function (k) {
  const arr = d[k];
  if (!Array.isArray(arr) || arr.length < 2) return;
  const temId = arr.some(function (it) { return it && typeof it === 'object' && it.id != null; });
  if (temId) return;                       // lista de registros: não mexe

  const vistos = Object.create(null);
  const limpo = [];
  for (let i = 0; i < arr.length; i++) {
    const chave = JSON.stringify(arr[i]);
    if (!vistos[chave]) { vistos[chave] = true; limpo.push(arr[i]); }
  }
  if (limpo.length !== arr.length) {
    relatorio.push({ chave: k, antes: arr.length, depois: limpo.length });
    d[k] = limpo;
  }
});

if (!relatorio.length) {
  console.log('\nNenhuma lista inflada encontrada. Nada a fazer.');
  process.exit(0);
}

console.log('\n--- LISTAS COM REPETICAO ---');
relatorio.forEach(function (r) {
  console.log('  ' + r.chave.padEnd(24) + r.antes.toLocaleString('pt-BR') + ' -> ' + r.depois + ' itens');
});

estado.dados = d;
const novoBruto = JSON.stringify(estado);
const depoisBytes = Buffer.byteLength(novoBruto);
console.log('\nstate.json ficaria: ' + mb(depoisBytes) +
            '  (reducao de ' + Math.round((1 - depoisBytes / antesBytes) * 100) + '%)');

const depois = contar(d);
console.log('\n--- CONFERENCIA (nada disso pode mudar) ---');
let divergiu = false;
Object.keys(antes).forEach(function (k) {
  const igual = antes[k] === depois[k];
  if (!igual) divergiu = true;
  console.log('  ' + (igual ? 'OK  ' : '*** DIFERENTE *** ') + k.padEnd(18) + antes[k] + ' -> ' + depois[k]);
});
if (divergiu) { console.error('\nPAREI: alguma contagem mudou. NADA foi alterado.'); process.exit(1); }

if (!APLICAR) {
  console.log('\n>> SIMULACAO: nada foi alterado.');
  console.log('>> Para executar: node reparar-listas-infladas.cjs --aplicar');
  process.exit(0);
}

try {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const destino = path.join(BACKUP_DIR, 'state-antes-de-reparar-' + carimbo + '.json');
  fs.copyFileSync(STATE_FILE, destino);
  console.log('\nbackup criado: ' + path.basename(destino));
} catch (e) {
  console.error('PAREI: falha no backup (' + e.message + '). Nada foi alterado.'); process.exit(1);
}

try {
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, novoBruto);
  fs.renameSync(tmp, STATE_FILE);
} catch (e) {
  console.error('PAREI ao gravar (' + e.message + '). Restaure o backup se precisar.'); process.exit(1);
}

console.log('\n=== PRONTO ===');
console.log('  antes: ' + mb(antesBytes) + '   agora: ' + mb(depoisBytes));
console.log('  equipamentos: ' + depois.equipamentos + ' registros, ' + depois.fotosEquip + ' fotos (inalterado)');
console.log('\nClique em Restart no Coolify para o sistema recarregar.');
