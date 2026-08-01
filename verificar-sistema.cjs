// ==========================================================================
// VERIFICAR SISTEMA — diagnóstico SOMENTE LEITURA
// --------------------------------------------------------------------------
// Roda no servidor (VPS/container) e mostra a situação real da instalação:
// qual versão do código está rodando, se os módulos críticos estão presentes,
// onde os dados estão, quantos registros existem e se o volume persistente
// parece correto.
//
// NÃO grava, NÃO apaga, NÃO migra, NÃO restaura NADA. Pode rodar à vontade.
//
// COMO USAR (dentro do container, no Coolify -> Terminal):
//     node verificar-sistema.cjs
//
// Copie a saída inteira e me mande.
// ==========================================================================
const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname);
const DATA_DIR = process.env.DATA_DIR || path.join(BASE, 'server-data');

const linha = () => console.log('-'.repeat(64));
const item = (rotulo, valor) => console.log('  ' + String(rotulo).padEnd(38, '.') + ' ' + valor);
let alertas = [];

console.log('='.repeat(64));
console.log(' VERIFICACAO DO SISTEMA R&T — ' + new Date().toISOString());
console.log('='.repeat(64));

// ── 1. Versão do código ────────────────────────────────────────────────────
console.log('\n[1] VERSAO DO CODIGO QUE ESTA RODANDO');
linha();
let pkg = {};
try { pkg = JSON.parse(fs.readFileSync(path.join(BASE, 'package.json'), 'utf8')); } catch (e) {}
item('versao do package.json', pkg.version || '?');
item('pasta da aplicacao', BASE);
item('Node.js', process.version);
item('NODE_ENV', process.env.NODE_ENV || '(vazio)');
if (process.env.NODE_ENV !== 'production') {
  alertas.push('NODE_ENV nao esta como "production": as senhas dos usuarios sao impressas no log.');
}

// Marcadores que dizem QUAL versao do codigo esta instalada
console.log('\n  Recursos presentes neste deploy:');
const marcador = function (rotulo, arquivo, trecho) {
  let tem = false;
  try { tem = fs.readFileSync(path.join(BASE, arquivo), 'utf8').indexOf(trecho) >= 0; } catch (e) { tem = false; }
  console.log('    [' + (tem ? 'X' : ' ') + '] ' + rotulo);
  return tem;
};
const temListaBlindada = marcador('Equipamentos: lista a prova de erro', 'js/app.js', 'registro com formato antigo');
const temCardsMobile   = marcador('Equipamentos: cards no celular', 'js/app.js', 'equip-mobile-view');
const temHeic          = marcador('Equipamentos: aceita foto HEIC (iPhone)', 'js/security.js', 'heic');
const temResumoBoot    = marcador('Servidor: resumo de dados no boot', 'server.cjs', 'DADOS ENCONTRADOS');
// Marcador sem acento de proposito: acento aqui ja causou falso "versao antiga".
const temSenhaOculta   = marcador('Servidor: senhas ocultas em producao', 'server.cjs', "NODE_ENV === 'production'");

// ── 2. Arquivos críticos ───────────────────────────────────────────────────
console.log('\n[2] MODULOS CRITICOS PRESENTES?');
linha();
const precisa = [
  ['server.cjs', true],
  ['equipamentos-protecao.cjs', true],
  ['restaurar-equipamentos.cjs', true],
  ['whatsapp-db.cjs', false],
  ['whatsapp-api.cjs', false],
  ['whatsapp-webhook.cjs', false],
  ['js/whatsapp.js', false],
  ['css/whatsapp.css', false],
  ['node_modules/sql.js', false]
];
precisa.forEach(function (p) {
  const existe = fs.existsSync(path.join(BASE, p[0]));
  item(p[0], existe ? 'OK' : (p[1] ? '*** FALTANDO (CRITICO) ***' : 'ausente (WhatsApp ficara off)'));
  if (!existe && p[1]) alertas.push('Arquivo critico ausente: ' + p[0]);
});

// ── 3. Onde os dados estão ────────────────────────────────────────────────
console.log('\n[3] DADOS E PERSISTENCIA');
linha();
item('DATA_DIR', DATA_DIR);
item('DATA_DIR existe?', fs.existsSync(DATA_DIR) ? 'sim' : '*** NAO EXISTE ***');

// Detecta se DATA_DIR esta DENTRO da pasta da aplicacao (sinal de volume ausente)
const dentroDaApp = path.resolve(DATA_DIR).indexOf(path.resolve(BASE)) === 0;
item('DATA_DIR dentro da aplicacao?', dentroDaApp ? '*** SIM — some no proximo deploy ***' : 'nao (bom)');
if (dentroDaApp) {
  alertas.push('DATA_DIR esta dentro da pasta da aplicacao. Sem volume persistente, os dados somem no proximo deploy.');
}

const arq = function (rel) { return path.join(DATA_DIR, rel); };
const tam = function (p) { try { return fs.statSync(p).size; } catch (e) { return -1; } };
const conta = function (p) { try { return fs.readdirSync(p).length; } catch (e) { return -1; } };

const tState = tam(arq('state.json'));
item('state.json', tState >= 0 ? (tState + ' bytes') : 'NAO ENCONTRADO');
item('uploads/ (fotos e documentos)', conta(arq('uploads')) >= 0 ? conta(arq('uploads')) + ' arquivo(s)' : 'NAO ENCONTRADO');
item('backups/', conta(arq('backups')) >= 0 ? conta(arq('backups')) + ' arquivo(s)' : 'NAO ENCONTRADO');
item('equipamentos/ (espelho)', fs.existsSync(arq('equipamentos')) ? 'OK' : 'ausente');
item('equipamentos/snapshots/', conta(arq('equipamentos/snapshots')) >= 0 ? conta(arq('equipamentos/snapshots')) + ' snapshot(s)' : 'ausente');
item('whatsapp.db', tam(arq('whatsapp.db')) >= 0 ? (tam(arq('whatsapp.db')) + ' bytes') : 'ausente');

// ── 4. Contagem dos registros ─────────────────────────────────────────────
console.log('\n[4] REGISTROS ENCONTRADOS (somente leitura)');
linha();
let estado = null;
try { estado = JSON.parse(fs.readFileSync(arq('state.json'), 'utf8')); } catch (e) {}
if (!estado) {
  item('state.json', '*** nao consegui ler ***');
  alertas.push('Nao consegui ler o state.json em ' + DATA_DIR);
} else {
  const d = estado.dados || {};
  const n = function (k) { return Array.isArray(d[k]) ? d[k].length : 0; };
  const eq = Array.isArray(d.equipamentos) ? d.equipamentos : [];
  let fotos = 0, comFoto = 0;
  eq.forEach(function (r) {
    const f = Array.isArray(r && r.fotos) ? r.fotos.length : 0;
    fotos += f; if (f) comFoto++;
  });
  item('versao do estado', estado.version || 0);
  item('atualizado em', estado.atualizadoEm ? new Date(estado.atualizadoEm).toISOString() : '?');
  console.log('');
  item('EQUIPAMENTOS/EPI', eq.length + ' registro(s)');
  item('  com foto', comFoto + ' registro(s)');
  item('  total de fotos', fotos);
  item('Candidatos', n('candidatos'));
  item('Funcionarios', n('funcionarios'));
  item('Contratacoes', n('contratacoes'));
  item('Exames medicos', n('examesMedicos'));
  item('Banco de talentos', n('bancoTalentos'));
  item('Fluxos financeiros', n('fluxosFinanceiros'));

  if ((estado.version || 0) > 1 && eq.length === 0 && n('candidatos') === 0) {
    alertas.push('O estado tem versao ' + estado.version + ' (ja foi usado) mas esta SEM registros. ' +
                 'Forte indicio de volume persistente ausente. NAO cadastre nada por cima.');
  }

  // Confere se as fotos citadas existem mesmo em uploads/
  let refs = 0, faltando = 0;
  eq.forEach(function (r) {
    (Array.isArray(r && r.fotos) ? r.fotos : []).forEach(function (f) {
      const v = f && (typeof f === 'string' ? f : f.arquivo);
      if (typeof v === 'string' && v.indexOf('/uploads/') === 0) {
        refs++;
        if (!fs.existsSync(path.join(DATA_DIR, v.replace(/^\//, '')))) faltando++;
      }
    });
  });
  console.log('');
  item('fotos apontando p/ uploads', refs);
  item('  arquivos NAO encontrados', faltando + (faltando ? '  *** conferir backup ***' : ''));
  if (faltando) alertas.push(faltando + ' foto(s) citada(s) nos registros nao existe(m) em uploads/.');

  // Espelho de protecao x estado
  try {
    const esp = JSON.parse(fs.readFileSync(arq('equipamentos/equipamentos.json'), 'utf8'));
    const noEspelho = Array.isArray(esp.equipamentos) ? esp.equipamentos.length : 0;
    console.log('');
    item('espelho de protecao', noEspelho + ' registro(s)');
    item('  bate com o sistema?', noEspelho === eq.length ? 'sim' : '*** diferente (' + eq.length + ' no sistema) ***');
    if (noEspelho > eq.length) {
      alertas.push('O espelho tem MAIS registros que o sistema (' + noEspelho + ' x ' + eq.length +
                   '). Rode: node restaurar-equipamentos.cjs  (so confere, nao altera)');
    }
  } catch (e) {
    console.log('');
    item('espelho de protecao', 'ainda nao existe (normal se o modulo e novo)');
  }
}

// ── 5. Variáveis de ambiente ──────────────────────────────────────────────
console.log('\n[5] VARIAVEIS DE AMBIENTE');
linha();
const vars = [
  ['NODE_ENV', true, false], ['DATA_DIR', true, false], ['PORT', true, false], ['APP_URL', true, false],
  ['WHATSAPP_VERIFY_TOKEN', false, true], ['WHATSAPP_APP_SECRET', false, true], ['WHATSAPP_CRYPTO_KEY', false, true]
];
vars.forEach(function (v) {
  const nome = v[0], obrigatoria = v[1], segredo = v[2];
  const valor = process.env[nome];
  let mostra;
  if (!valor) mostra = obrigatoria ? '*** VAZIA (obrigatoria) ***' : 'vazia (WhatsApp ainda nao configurado)';
  else if (segredo) mostra = 'definida (' + valor.length + ' caracteres)';   // nunca imprime o valor
  else mostra = valor;
  item(nome, mostra);
  if (!valor && obrigatoria) alertas.push('Variavel obrigatoria vazia: ' + nome);
});

// ── 6. Resumo ─────────────────────────────────────────────────────────────
console.log('\n[6] RESUMO');
linha();
const versaoCompleta = temListaBlindada && temCardsMobile && temHeic && temResumoBoot && temSenhaOculta &&
                       fs.existsSync(path.join(BASE, 'equipamentos-protecao.cjs'));
console.log('  Versao do codigo: ' + (versaoCompleta
  ? 'ATUAL (com todas as correcoes de Equipamentos e a blindagem)'
  : '*** ANTIGA — este deploy NAO tem todas as correcoes ***'));
if (!versaoCompleta) alertas.push('O codigo neste servidor e uma versao antiga. Faca git push + novo deploy.');

if (alertas.length) {
  console.log('\n  PONTOS DE ATENCAO (' + alertas.length + '):');
  alertas.forEach(function (a, i) { console.log('   ' + (i + 1) + ') ' + a); });
} else {
  console.log('\n  Nenhum problema encontrado.');
}
console.log('\n' + '='.repeat(64));
console.log(' Fim. Nada foi alterado — esta verificacao e somente leitura.');
console.log('='.repeat(64));
