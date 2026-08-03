// ==========================================================================
// LIMPAR FOTOS EMBUTIDAS — desincha o state.json
// --------------------------------------------------------------------------
// PROBLEMA QUE ISTO RESOLVE
// Algumas fotos/PDFs ficaram gravados DENTRO do state.json (em base64) em vez
// de irem para a pasta uploads/. O arquivo passou de ~4 MB para ~86 MB e
// estourou o limite de envio do servidor — desde então NENHUM save funciona.
//
// O QUE ELE FAZ
// Move cada arquivo embutido para uploads/ e deixa no lugar apenas o link
// (/uploads/...). O conteúdo é o mesmo: nada é perdido, só sai de dentro do
// JSON. O state.json volta a ficar pequeno e os saves voltam a funcionar.
//
// SEGURANÇA
// - Faz backup do state.json ANTES de qualquer alteração.
// - Confere as contagens (registros de equipamentos, fotos, candidatos)
//   ANTES e DEPOIS. Se qualquer número mudar, ele NÃO grava nada.
// - Escrita atômica (grava num temporário e troca no final).
// - Sem --aplicar, ele só SIMULA e mostra o que faria.
//
// COMO USAR (no Terminal do Coolify):
//     node limpar-fotos-embutidas.cjs              -> só simula (não altera)
//     node limpar-fotos-embutidas.cjs --aplicar    -> executa de verdade
// ==========================================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || '/data';
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const APLICAR = process.argv.indexOf('--aplicar') >= 0;

// Só move o que for grande de verdade (o mesmo critério que o sistema usa).
const MIN_CHARS = 4000;

const mb = n => (n / 1048576).toFixed(1) + ' MB';

console.log('=== LIMPAR FOTOS EMBUTIDAS NO state.json ===');
console.log('modo: ' + (APLICAR ? 'APLICAR (vai alterar)' : 'SIMULACAO (nao altera nada)'));
console.log('');

let bruto;
try {
  bruto = fs.readFileSync(STATE_FILE, 'utf8');
} catch (e) {
  console.error('PAREI: nao consegui ler ' + STATE_FILE + ' (' + e.message + ')');
  process.exit(1);
}
const tamanhoAntes = Buffer.byteLength(bruto);
console.log('state.json agora: ' + mb(tamanhoAntes));

let estado;
try {
  estado = JSON.parse(bruto);
} catch (e) {
  console.error('PAREI: o state.json nao e um JSON valido (' + e.message + ')');
  process.exit(1);
}

// ── Contagens ANTES (usadas para provar que nada sumiu) ────────────────────
function contar(d) {
  const n = k => Array.isArray(d[k]) ? d[k].length : 0;
  const eq = Array.isArray(d.equipamentos) ? d.equipamentos : [];
  let fotos = 0;
  eq.forEach(r => { if (Array.isArray(r && r.fotos)) fotos += r.fotos.length; });
  return {
    equipamentos: eq.length, fotosEquip: fotos,
    candidatos: n('candidatos'), funcionarios: n('funcionarios'),
    contratacoes: n('contratacoes'), fluxos: n('fluxosFinanceiros'),
    examesMedicos: n('examesMedicos'), bancoTalentos: n('bancoTalentos')
  };
}
const dados = estado.dados || {};
const antes = contar(dados);

// ── Percorre tudo procurando base64 embutido ──────────────────────────────
const EXT = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf'
};
let achados = 0, bytesMovidos = 0, gravados = 0;
const paraGravar = [];   // só grava no disco depois que tudo for validado

function extrairDe(obj) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { obj.forEach(extrairDe); return; }
  Object.keys(obj).forEach(function (k) {
    const v = obj[k];
    if (typeof v === 'string') {
      if (v.length >= MIN_CHARS && v.indexOf('data:') === 0 && v.indexOf(';base64,') > 0) {
        achados++;
        bytesMovidos += v.length;
        const mime = v.slice(5, v.indexOf(';base64,')).toLowerCase();
        const ext = EXT[mime] || 'bin';
        const conteudo = Buffer.from(v.slice(v.indexOf(';base64,') + 8), 'base64');
        // Nome único e estável (mesmo conteúdo => mesmo arquivo, não duplica)
        const hash = crypto.createHash('sha1').update(conteudo).digest('hex').slice(0, 16);
        const nome = hash + '.' + ext;
        paraGravar.push({ nome: nome, conteudo: conteudo });
        obj[k] = '/uploads/' + nome;     // deixa só o link no lugar
      }
    } else if (v && typeof v === 'object') {
      extrairDe(v);
    }
  });
}
extrairDe(dados);

console.log('arquivos embutidos encontrados: ' + achados);
console.log('espaco que sai do JSON .......: ' + mb(bytesMovidos));

if (!achados) {
  console.log('\nNada embutido para mover. Se o arquivo continua grande, me avise.');
  process.exit(0);
}

estado.dados = dados;
const novoBruto = JSON.stringify(estado);
const tamanhoDepois = Buffer.byteLength(novoBruto);
const depois = contar(dados);

console.log('state.json ficaria: ' + mb(tamanhoDepois) +
            '  (reducao de ' + Math.round((1 - tamanhoDepois / tamanhoAntes) * 100) + '%)');

// ── Conferencia: NENHUMA contagem pode mudar ──────────────────────────────
console.log('\n--- CONFERENCIA (antes -> depois) ---');
let divergiu = false;
Object.keys(antes).forEach(function (k) {
  const igual = antes[k] === depois[k];
  if (!igual) divergiu = true;
  console.log('  ' + (igual ? 'OK  ' : '*** DIFERENTE *** ') + k.padEnd(16) + antes[k] + ' -> ' + depois[k]);
});
if (divergiu) {
  console.error('\nPAREI: alguma contagem mudou. NADA foi alterado no sistema.');
  process.exit(1);
}

if (!APLICAR) {
  console.log('\n>> SIMULACAO: nada foi alterado.');
  console.log('>> Para executar de verdade: node limpar-fotos-embutidas.cjs --aplicar');
  process.exit(0);
}

// ── Aplicar ───────────────────────────────────────────────────────────────
// 1) backup do state.json atual
try {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const destino = path.join(BACKUP_DIR, 'state-antes-de-limpar-' + carimbo + '.json');
  fs.copyFileSync(STATE_FILE, destino);
  console.log('\nbackup criado: ' + path.basename(destino));
} catch (e) {
  console.error('PAREI: nao consegui fazer o backup (' + e.message + '). Nada foi alterado.');
  process.exit(1);
}

// 2) grava os arquivos em uploads/
try {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  paraGravar.forEach(function (a) {
    const alvo = path.join(UPLOADS_DIR, a.nome);
    if (!fs.existsSync(alvo)) { fs.writeFileSync(alvo, a.conteudo); gravados++; }
  });
  console.log('arquivos gravados em uploads/: ' + gravados +
              (gravados < paraGravar.length ? ('  (' + (paraGravar.length - gravados) + ' ja existiam)') : ''));
} catch (e) {
  console.error('PAREI ao gravar os arquivos (' + e.message + '). O state.json NAO foi alterado.');
  process.exit(1);
}

// 3) troca o state.json (atomico)
try {
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, novoBruto);
  fs.renameSync(tmp, STATE_FILE);
} catch (e) {
  console.error('PAREI ao gravar o state.json (' + e.message + '). Restaure o backup se precisar.');
  process.exit(1);
}

console.log('\n=== PRONTO ===');
console.log('  antes : ' + mb(tamanhoAntes));
console.log('  agora : ' + mb(tamanhoDepois));
console.log('  equipamentos: ' + depois.equipamentos + ' registros, ' + depois.fotosEquip + ' fotos (inalterado)');
console.log('\nReinicie a aplicacao (botao Restart no Coolify) para o sistema recarregar.');
