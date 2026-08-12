#!/usr/bin/env node
// ==========================================================================
// DEVOLVE REGISTROS QUE SUMIRAM (candidatos, banco de talentos, funcionários…)
// --------------------------------------------------------------------------
// Para que serve: procurar, nos backups que o próprio servidor guarda, todo
// registro que EXISTIA antes e NÃO existe mais no estado atual — e devolver.
//
// De onde ele tira os registros:
//   • DATA_DIR/backups/*.json            (24 por hora + 7 por dia)
//   • DATA_DIR/equipamentos/excluidos.json  (o arquivo de exclusões pequenas
//     que a guarda anti-sumiço arquiva; é aqui que mora o vazamento lento)
//   • DATA_DIR/equipamentos/snapshots/*.json
//
// SEGURANÇA — as mesmas regras do restaurar-empresas.cjs:
//   • Por padrão só SIMULA. Nada é gravado sem --aplicar.
//   • SÓ ACRESCENTA. Nunca apaga, renomeia ou sobrescreve o que está lá.
//   • Registro que já existe (mesmo id) é deixado em paz, do jeito que está.
//   • Faz cópia do state.json antes de aplicar.
//   • Pode rodar quantas vezes quiser: na segunda vez não acha mais nada.
//
// Uso:
//   node restaurar-registros.cjs                 (simula tudo)
//   node restaurar-registros.cjs candidatos      (simula só uma lista)
//   node restaurar-registros.cjs --aplicar       (grava)
// ==========================================================================
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || './server-data';
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const EQUIP_DIR = path.join(DATA_DIR, 'equipamentos');
const STATE = path.join(DATA_DIR, 'state.json');
const APLICAR = process.argv.includes('--aplicar');

// As listas que importam. Mesmo conjunto que a guarda anti-sumiço protege.
const LISTAS = [
  'candidatos', 'bancoTalentos', 'funcionarios', 'contratacoes',
  'examesMedicos', 'equipamentos', 'fluxosFinanceiros', 'vagas'
];
const pedidas = process.argv.slice(2).filter(a => a.indexOf('--') !== 0);
const ALVO = pedidas.length ? LISTAS.filter(l => pedidas.indexOf(l) >= 0) : LISTAS;

function ler(arq) {
  try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch (e) { return null; }
}
function lista(dados, chave) {
  const v = dados && dados[chave];
  return Array.isArray(v) ? v : [];
}
// Um rótulo que dá para reconhecer. Sem isso a lista vira "(sem nome)" 30 vezes
// e ninguém consegue decidir o que devolver — que é justamente a decisão que
// este script NÃO toma sozinho.
function data(v) {
  if (!v) return '';
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : s.slice(0, 16).replace('T', ' ');
}
function dinheiro(n) {
  const v = Number(n || 0);
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function rotulo(r, chave) {
  if (!r) return '(vazio)';

  if (chave === 'fluxosFinanceiros') {
    const total = (r.linhas || []).reduce(function (s, l) { return s + Number((l && l.valor) || 0); }, 0);
    const partes = [
      '#' + (r.numero || '?'),
      r.empresaNome || '(sem empresa)',
      'pgto ' + (data(r.dataPagamento) || '?'),
      (r.linhas || []).length + ' pessoa(s)',
      'R$ ' + dinheiro(total),
      String(r.status || '?').toUpperCase()
    ];
    if (r.tipoLancamento === 'estorno') partes.push('ESTORNO');
    return partes.join(' · ') + '\n      criada por ' + (r.criadoPor || '?') + ' em ' + (data(r.criadoEm) || '?');
  }

  if (chave === 'funcionarios') {
    return (r.nome || '(sem nome)') +
      (r.login ? ' (' + r.login + ')' : '') +
      (r.cargo ? ' — ' + r.cargo : '') +
      (r.departamento ? ' / ' + r.departamento : '') +
      (r.status ? ' [' + r.status + ']' : '');
  }

  const n = r.nome || r.nomeCompleto || r.razaoSocial || r.descricao || r.titulo;
  const doc = r.cpf || r.cnpj || r.matricula;
  return (n ? String(n) : '(sem nome)') + (doc ? ' — ' + doc : '');
}

console.log('='.repeat(70));
console.log(APLICAR ? 'DEVOLVER REGISTROS SUMIDOS (aplicando)'
                    : 'DEVOLVER REGISTROS SUMIDOS (simulação — nada será gravado)');
console.log('='.repeat(70));
console.log('DATA_DIR:', path.resolve(DATA_DIR));
console.log('Listas:  ', ALVO.join(', '));

const atual = ler(STATE);
if (!atual || !atual.dados) {
  console.error('\nNão consegui ler o state.json em ' + STATE);
  process.exit(1);
}
const d = atual.dados;

// ---- 1) Junta todas as fontes de recuperação -----------------------------
const fontes = [];
function juntarPasta(dir, tipo) {
  let arquivos = [];
  try { arquivos = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch (e) { return; }
  arquivos.forEach(function (f) {
    const alvo = path.join(dir, f);
    const j = ler(alvo);
    if (!j) return;
    // backups guardam { dados, version } — snapshots podem guardar direto
    const dados = j.dados || j.estado || j;
    if (dados && typeof dados === 'object') {
      let quando = '';
      try { quando = fs.statSync(alvo).mtime.toISOString().slice(0, 16).replace('T', ' '); } catch (e) {}
      fontes.push({ nome: tipo + '/' + f, quando: quando, dados: dados });
    }
  });
}
juntarPasta(BACKUP_DIR, 'backups');
juntarPasta(path.join(EQUIP_DIR, 'snapshots'), 'snapshots');

// O arquivo de excluídos tem outro formato: { chave: [registros...] } ou uma
// lista de eventos. Aceitamos os dois.
const excluidos = ler(path.join(EQUIP_DIR, 'excluidos.json'));
const doArquivo = {};
if (excluidos) {
  const eventos = Array.isArray(excluidos) ? excluidos : [excluidos];
  eventos.forEach(function (ev) {
    if (!ev || typeof ev !== 'object') return;
    Object.keys(ev).forEach(function (k) {
      const v = ev[k];
      if (Array.isArray(v) && LISTAS.indexOf(k) >= 0) {
        if (!doArquivo[k]) doArquivo[k] = [];
        v.forEach(function (r) { if (r && r.id != null) doArquivo[k].push(r); });
      } else if (v && typeof v === 'object' && Array.isArray(v.registros) && LISTAS.indexOf(v.lista) >= 0) {
        if (!doArquivo[v.lista]) doArquivo[v.lista] = [];
        v.registros.forEach(function (r) { if (r && r.id != null) doArquivo[v.lista].push(r); });
      }
    });
  });
}

console.log('\nFontes encontradas: ' + fontes.length + ' arquivo(s) de backup/snapshot' +
  (Object.keys(doArquivo).length ? ' + o arquivo de exclusões' : ''));
if (!fontes.length && !Object.keys(doArquivo).length) {
  console.error('\nNenhum backup encontrado em ' + BACKUP_DIR + '. Sem fonte para recuperar.');
  process.exit(1);
}

// ---- 2) Para cada lista, descobre o que está faltando ---------------------
let totalDevolver = 0;
const plano = {};

ALVO.forEach(function (chave) {
  const agora = lista(d, chave);
  const tem = new Set(agora.map(r => r && r.id != null ? String(r.id) : null).filter(Boolean));

  // candidato a devolver: id -> { registro, de }
  const faltando = new Map();
  const registrar = (r, de) => {
    if (!r || r.id == null) return;
    const id = String(r.id);
    if (tem.has(id) || faltando.has(id)) return;
    faltando.set(id, { registro: r, de: de });
  };

  // do mais recente para o mais antigo, para pegar a versão mais nova de cada um
  fontes.slice().reverse().forEach(function (f) {
    lista(f.dados, chave).forEach(r => registrar(r, f.nome + (f.quando ? ' (' + f.quando + ')' : '')));
  });
  (doArquivo[chave] || []).forEach(r => registrar(r, 'equipamentos/excluidos.json'));

  if (!faltando.size) return;
  plano[chave] = [...faltando.values()];
  totalDevolver += faltando.size;

  console.log('\n' + '-'.repeat(70));
  console.log(chave.toUpperCase() + ': tem ' + agora.length + ' hoje, ' +
    faltando.size + ' sumiram e podem voltar');
  plano[chave].forEach(function (x) {
    console.log('  • ' + rotulo(x.registro, chave));
    console.log('      veio de ' + x.de);
  });
});

if (!totalDevolver) {
  console.log('\n' + '='.repeat(70));
  console.log('Nada faltando. Todos os registros dos backups já estão no sistema.');
  console.log('='.repeat(70));
  process.exit(0);
}

console.log('\n' + '='.repeat(70));
console.log('TOTAL a devolver: ' + totalDevolver + ' registro(s).');

if (!APLICAR) {
  console.log('\nIsto foi só uma SIMULAÇÃO — nada foi gravado.');
  console.log('');
  console.log('ATENÇÃO — LEIA ANTES DE APLICAR:');
  console.log('  Este script NÃO sabe distinguir "sumiu sozinho" de "alguém');
  console.log('  excluiu de propósito". Ele só compara com os backups.');
  console.log('  Confira a lista acima. Se tiver algo que foi excluído de');
  console.log('  propósito, devolva só as listas que você quer:');
  console.log('');
  console.log('   node restaurar-registros.cjs fluxosFinanceiros --aplicar');
  console.log('   node restaurar-registros.cjs funcionarios --aplicar');
  console.log('');
  console.log('  Ou tudo de uma vez:');
  console.log('   node restaurar-registros.cjs --aplicar');
  console.log('='.repeat(70));
  process.exit(0);
}

// ---- 3) Aplica (só acrescentando) ----------------------------------------
const copia = STATE + '.antes-de-restaurar-' + Date.now() + '.json';
try {
  fs.copyFileSync(STATE, copia);
  console.log('\nCópia de segurança: ' + copia);
} catch (e) {
  console.error('\nNão consegui fazer a cópia de segurança. Abortando por segurança.');
  console.error(e.message);
  process.exit(1);
}

Object.keys(plano).forEach(function (chave) {
  if (!Array.isArray(d[chave])) d[chave] = [];
  plano[chave].forEach(function (x) { d[chave].push(x.registro); });
  console.log('  ' + chave + ': ' + plano[chave].length + ' devolvido(s) — a lista foi de ' +
    (d[chave].length - plano[chave].length) + ' para ' + d[chave].length + '.');
});

atual.version = (atual.version || 0) + 1;
atual.atualizadoEm = Date.now();
const tmp = STATE + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(atual));
fs.renameSync(tmp, STATE);

console.log('\nPronto. Reinicie o sistema (no Coolify, Restart) para recarregá-lo.');
console.log('='.repeat(70));
