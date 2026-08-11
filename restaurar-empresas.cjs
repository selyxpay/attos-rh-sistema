#!/usr/bin/env node
// ==========================================================================
// DEVOLVE AS EMPRESAS OPERACIONAIS QUE FORAM APAGADAS
// --------------------------------------------------------------------------
// Contexto: durante um tempo, a lista de EMPRESAS era compartilhada entre a
// parte operacional (Vagas, Contratações, gráficos do Dashboard e o mapa de
// empresas próximas do Banco de Talentos) e os cadastros do Fluxo Financeiro.
// Ao atualizar a lista do financeiro, as empresas operacionais foram apagadas
// junto — elas tinham cor e coordenadas que o resto do sistema usava.
//
// O código já foi separado (ffEmpresas/ffTomadores/ffClientes), então isso não
// volta a acontecer. Este script recupera o que se perdeu, dos backups que o
// próprio servidor guarda (24 por hora + 7 por dia, em DATA_DIR/backups).
//
// SEGURANÇA:
//   • Por padrão só SIMULA. Nada é gravado sem --aplicar.
//   • SÓ ACRESCENTA. Nunca apaga, renomeia ou sobrescreve o que está lá.
//   • Faz cópia do state.json antes de aplicar.
//
// Uso:
//   node restaurar-empresas.cjs              (simula e mostra o que faria)
//   node restaurar-empresas.cjs --aplicar    (grava)
// ==========================================================================
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || './server-data';
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const STATE = path.join(DATA_DIR, 'state.json');
const APLICAR = process.argv.includes('--aplicar');

function ler(arq) {
  try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch (e) { return null; }
}
// Empresa OPERACIONAL = a que não veio dos cadastros do financeiro.
// As do financeiro têm origem 'base'/'manual' ou nome no padrão "25/Nome".
function ehOperacional(e) {
  if (!e || !e.id) return false;
  if (e.origem === 'base' || e.origem === 'manual') return false;
  if (/^\d+\s*\//.test(String(e.nome || ''))) return false;
  return true;
}

console.log('='.repeat(66));
console.log(APLICAR ? 'RESTAURAR EMPRESAS OPERACIONAIS (aplicando)'
                    : 'RESTAURAR EMPRESAS OPERACIONAIS (simulação — nada será gravado)');
console.log('='.repeat(66));
console.log('DATA_DIR:', path.resolve(DATA_DIR));

const atual = ler(STATE);
if (!atual || !atual.dados) {
  console.error('\nNão consegui ler o state.json em ' + STATE);
  process.exit(1);
}
const d = atual.dados;
if (!Array.isArray(d.empresas)) d.empresas = [];
const jaTem = {};
d.empresas.forEach(function (e) { if (e && e.id) jaTem[e.id] = true; });
const operHoje = d.empresas.filter(ehOperacional);
console.log('\nHoje no sistema:');
console.log('  empresas operacionais: ' + operHoje.length +
  (operHoje.length ? ' (' + operHoje.map(function (e) { return e.nome; }).join(', ') + ')' : ''));
console.log('  cadastros do financeiro: ' + ((d.ffEmpresas || []).length) + ' empresa(s)');

// ── Procura nos backups ───────────────────────────────────────────────────
let arquivos = [];
try {
  arquivos = fs.readdirSync(BACKUP_DIR)
    .filter(function (n) { return /^state-(hora|dia)-\d+\.json$/.test(n); })
    .map(function (n) {
      const p = path.join(BACKUP_DIR, n);
      return { nome: n, caminho: p, mtime: fs.statSync(p).mtimeMs };
    })
    .sort(function (a, b) { return b.mtime - a.mtime; });   // mais novo primeiro
} catch (e) {
  console.error('\nNão achei a pasta de backups em ' + BACKUP_DIR);
  process.exit(1);
}
if (!arquivos.length) { console.error('\nNenhum backup encontrado.'); process.exit(1); }

console.log('\nBackups disponíveis: ' + arquivos.length);
const achadas = {};
let deQual = null;
for (let i = 0; i < arquivos.length; i++) {
  const b = ler(arquivos[i].caminho);
  const lista = (b && b.dados && Array.isArray(b.dados.empresas)) ? b.dados.empresas : [];
  const oper = lista.filter(ehOperacional);
  const quando = new Date(arquivos[i].mtime).toLocaleString('pt-BR');
  console.log('  ' + arquivos[i].nome.padEnd(22) + quando.padEnd(22) +
    oper.length + ' operacional(is)');
  if (oper.length && !deQual) {
    deQual = arquivos[i].nome;
    oper.forEach(function (e) { if (!achadas[e.id]) achadas[e.id] = e; });
  }
}

const faltando = Object.keys(achadas).filter(function (id) { return !jaTem[id]; })
  .map(function (id) { return achadas[id]; });

console.log('\n' + '-'.repeat(66));
if (!deQual) {
  console.log('Nenhum backup tem empresas operacionais. Nada a restaurar.');
  process.exit(0);
}
console.log('Backup usado: ' + deQual);
if (!faltando.length) {
  console.log('Todas as empresas operacionais desse backup JÁ ESTÃO no sistema.');
  console.log('Nada a fazer. 👌');
  process.exit(0);
}
console.log('Empresas que sumiram e seriam DEVOLVIDAS (' + faltando.length + '):');
faltando.forEach(function (e) {
  console.log('  • ' + (e.nome || '(sem nome)') +
    '   id=' + e.id +
    (e.cor ? '  cor=' + e.cor : '') +
    (e.lat ? '  coordenadas=sim' : ''));
});

// Quantas vagas/candidatos voltam a encontrar a empresa deles
const idsVolta = {};
faltando.forEach(function (e) { idsVolta[e.id] = true; });
const vagasOrfas = (d.vagas || []).filter(function (v) { return v && idsVolta[v.empresaId]; }).length;
if (vagasOrfas) console.log('\n  ' + vagasOrfas + ' vaga(s) voltam a encontrar a empresa delas.');

if (!APLICAR) {
  console.log('\n' + '='.repeat(66));
  console.log('Isto foi só uma SIMULAÇÃO — nada foi gravado.');
  console.log('Para aplicar de verdade:');
  console.log('   node restaurar-empresas.cjs --aplicar');
  console.log('='.repeat(66));
  process.exit(0);
}

// ── Aplicando ─────────────────────────────────────────────────────────────
const copia = STATE + '.antes-de-restaurar-' + Date.now() + '.json';
fs.copyFileSync(STATE, copia);
console.log('\nCópia de segurança: ' + copia);

const antesQtd = d.empresas.length;
faltando.forEach(function (e) { d.empresas.push(e); });
atual.version = (atual.version || 0) + 1;
atual.atualizadoEm = Date.now();
fs.writeFileSync(STATE, JSON.stringify(atual));

console.log('Devolvidas ' + faltando.length + ' empresa(s). A lista foi de ' +
  antesQtd + ' para ' + d.empresas.length + '.');
console.log('\nReinicie o sistema (no Coolify, Restart) para ele recarregar.');
console.log('='.repeat(66));
