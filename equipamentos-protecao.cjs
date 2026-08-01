// ==========================================================================
// PROTEÇÃO DOS DADOS CRÍTICOS (Entrega/Devolução de Equipamentos e cia.)
// --------------------------------------------------------------------------
// Módulo ISOLADO: não altera onde os dados são gravados (a fonte da verdade
// continua sendo o state.json). Ele acrescenta três redes de segurança:
//
//   1. GUARDA ANTI-SUMIÇO  — um save "completo" que faria vários registros
//      desaparecerem de uma vez é tratado como acidente (aba velha, estado
//      carregado pela metade, falha de rede) e os registros são devolvidos.
//      Exclusão deliberada de 1 ou 2 registros continua funcionando normal.
//
//   2. ESPELHO INDEPENDENTE — cópia dos equipamentos em pasta própria
//      (DATA_DIR/equipamentos/), gravada a cada alteração, com fotos e
//      documentos referenciados. Se o state.json for corrompido ou perdido,
//      os equipamentos continuam recuperáveis daqui, sozinhos.
//
//   3. ARQUIVO DE EXCLUÍDOS — todo registro removido (mesmo de propósito) é
//      guardado antes de sumir. Nada é apagado de forma irreversível.
//
// Nenhuma função daqui pode derrubar o save: quem chama envolve em try/catch
// e, na dúvida, o comportamento é sempre PRESERVAR dados.
// ==========================================================================
const fs = require('fs');
const path = require('path');

// Listas que nunca podem sumir em massa. "equipamentos" é a prioridade máxima
// pedida pela operação, mas o mesmo cuidado vale para os outros cadastros.
const LISTAS_CRITICAS = [
  'equipamentos',
  'candidatos',
  'funcionarios',
  'contratacoes',
  'examesMedicos',
  'bancoTalentos',
  'fluxosFinanceiros'
];

// Até quantos registros podem sumir num único save sem levantar suspeita.
// Excluir 1 registro é rotina; 4 sumindo de uma vez nunca é ação humana.
const SUMICO_TOLERADO = 3;

// Quantos snapshots do espelho guardar (nº fixo: não cresce sem parar).
const MAX_SNAPSHOTS = 30;

let DIR_EQUIP = null;
let DIR_SNAPS = null;

function iniciar(dataDir) {
  DIR_EQUIP = path.join(dataDir, 'equipamentos');
  DIR_SNAPS = path.join(DIR_EQUIP, 'snapshots');
  try {
    fs.mkdirSync(DIR_SNAPS, { recursive: true });
  } catch (e) {
    console.error('[Equip-Proteção] não consegui criar a pasta de proteção:', e.message);
  }
  return DIR_EQUIP;
}

function _lista(dados, chave) {
  const v = dados && dados[chave];
  return Array.isArray(v) ? v : [];
}

function _porId(arr) {
  const m = new Map();
  arr.forEach(function (it) { if (it && it.id != null) m.set(String(it.id), it); });
  return m;
}

// Conta registros, fotos e documentos — usado nos relatórios de antes/depois.
function contar(dados) {
  const eq = _lista(dados, 'equipamentos');
  let fotos = 0;
  eq.forEach(function (r) {
    if (Array.isArray(r && r.fotos)) fotos += r.fotos.length;
  });
  return { registros: eq.length, fotos: fotos };
}

// ── 1. GUARDA ANTI-SUMIÇO ─────────────────────────────────────────────────
// Recebe o que está gravado e o que o cliente quer gravar. Devolve os dados
// já corrigidos + a lista de avisos do que foi impedido/arquivado.
function protegerSave(dadosAtuais, dadosNovos) {
  const avisos = [];
  if (!dadosAtuais || !dadosNovos) return { dados: dadosNovos, avisos: avisos };

  LISTAS_CRITICAS.forEach(function (chave) {
    const antes = _lista(dadosAtuais, chave);
    if (!antes.length) return;                       // nada a proteger ainda

    // Cliente não mandou a lista: não é exclusão, é ausência. Preserva.
    if (!Array.isArray(dadosNovos[chave])) {
      dadosNovos[chave] = antes.slice();
      avisos.push({
        lista: chave, acao: 'preservado',
        detalhe: 'o save não trazia a lista "' + chave + '" — mantidos os ' + antes.length + ' registro(s) já gravados'
      });
      return;
    }

    const depoisIdx = _porId(dadosNovos[chave]);
    const sumidos = antes.filter(function (r) {
      return r && r.id != null && !depoisIdx.has(String(r.id));
    });
    if (!sumidos.length) return;

    const demais = sumidos.length > SUMICO_TOLERADO;
    const metadeOuMais = antes.length > 3 && sumidos.length >= antes.length / 2;

    if (demais || metadeOuMais) {
      // ACIDENTE: devolve todos os registros que iam sumir.
      dadosNovos[chave] = dadosNovos[chave].concat(sumidos);
      avisos.push({
        lista: chave, acao: 'sumico-impedido',
        detalhe: sumidos.length + ' de ' + antes.length + ' registro(s) iam desaparecer num único save — devolvidos'
      });
      console.error('[Equip-Proteção] SUMIÇO IMPEDIDO em "' + chave + '": ' +
        sumidos.length + ' de ' + antes.length + ' registro(s) seriam apagados de uma vez. ' +
        'Os registros foram DEVOLVIDOS. Nada foi perdido.');
    } else {
      // Exclusão pequena = provavelmente deliberada. Deixa passar, mas arquiva.
      arquivarExcluidos(chave, sumidos);
      avisos.push({
        lista: chave, acao: 'excluido-arquivado',
        detalhe: sumidos.length + ' registro(s) excluído(s) — cópia guardada em equipamentos/excluidos.json'
      });
    }
  });

  return { dados: dadosNovos, avisos: avisos };
}

// ── 3. ARQUIVO DE EXCLUÍDOS ───────────────────────────────────────────────
function arquivarExcluidos(chave, registros) {
  if (!DIR_EQUIP || !registros || !registros.length) return;
  try {
    const arq = path.join(DIR_EQUIP, 'excluidos.json');
    let atual = [];
    try { atual = JSON.parse(fs.readFileSync(arq, 'utf8')); } catch (e) { atual = []; }
    if (!Array.isArray(atual)) atual = [];
    registros.forEach(function (r) {
      atual.push({ lista: chave, excluidoEm: new Date().toISOString(), registro: r });
    });
    _gravarAtomico(arq, JSON.stringify(atual, null, 2));
    console.log('[Equip-Proteção] ' + registros.length + ' registro(s) de "' + chave +
      '" arquivado(s) em excluidos.json (recuperáveis).');
  } catch (e) {
    console.error('[Equip-Proteção] falha ao arquivar excluídos:', e.message);
  }
}

// ── 2. ESPELHO INDEPENDENTE ───────────────────────────────────────────────
// Cópia própria dos equipamentos, sem depender do state.json. Só regrava
// quando o conteúdo muda de verdade (não fica escrevendo à toa).
let _ultimaAssinatura = '';
function espelhar(dados) {
  if (!DIR_EQUIP) return null;
  try {
    const eq = _lista(dados, 'equipamentos');
    const conteudo = JSON.stringify(eq);
    if (conteudo === _ultimaAssinatura) return null;   // nada mudou
    _ultimaAssinatura = conteudo;

    const cont = contar(dados);
    const pacote = {
      gravadoEm: new Date().toISOString(),
      totalRegistros: cont.registros,
      totalFotos: cont.fotos,
      // Arquivos referenciados: serve para conferir se toda foto/documento
      // citado ainda existe em uploads/ na hora de restaurar.
      arquivosReferenciados: _arquivosReferenciados(eq),
      equipamentos: eq
    };
    const texto = JSON.stringify(pacote, null, 2);

    _gravarAtomico(path.join(DIR_EQUIP, 'equipamentos.json'), texto);
    _gravarSnapshot(texto);
    return cont;
  } catch (e) {
    console.error('[Equip-Proteção] falha ao espelhar equipamentos:', e.message);
    return null;
  }
}

function _arquivosReferenciados(equipamentos) {
  const refs = [];
  equipamentos.forEach(function (r) {
    (Array.isArray(r && r.fotos) ? r.fotos : []).forEach(function (f) {
      const v = f && (typeof f === 'string' ? f : f.arquivo);
      if (typeof v === 'string' && v.indexOf('/uploads/') === 0) refs.push(v);
    });
  });
  return refs;
}

function _gravarSnapshot(texto) {
  try {
    const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.writeFileSync(path.join(DIR_SNAPS, 'equipamentos-' + carimbo + '.json'), texto);
    // Mantém no máximo MAX_SNAPSHOTS (apaga só snapshot antigo, nunca dado vivo)
    const arquivos = fs.readdirSync(DIR_SNAPS)
      .filter(function (n) { return /^equipamentos-.*\.json$/.test(n); })
      .sort();
    while (arquivos.length > MAX_SNAPSHOTS) {
      const velho = arquivos.shift();
      try { fs.unlinkSync(path.join(DIR_SNAPS, velho)); } catch (e) {}
    }
  } catch (e) {
    console.error('[Equip-Proteção] falha ao guardar snapshot:', e.message);
  }
}

function _gravarAtomico(destino, texto) {
  const tmp = destino + '.tmp';
  fs.writeFileSync(tmp, texto);
  fs.renameSync(tmp, destino);   // troca atômica: nunca deixa arquivo pela metade
}

// Lê o espelho (usado pelo script de restauração e pela conferência).
function lerEspelho() {
  if (!DIR_EQUIP) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR_EQUIP, 'equipamentos.json'), 'utf8'));
  } catch (e) {
    return null;
  }
}

module.exports = {
  iniciar: iniciar,
  protegerSave: protegerSave,
  espelhar: espelhar,
  arquivarExcluidos: arquivarExcluidos,
  lerEspelho: lerEspelho,
  contar: contar,
  LISTAS_CRITICAS: LISTAS_CRITICAS
};
