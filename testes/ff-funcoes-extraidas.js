// Cópias EXATAS de duas funções puras do js/app.js, para poder testá-las
// fora do navegador. Se mudar o original, mude aqui também — o teste
// ff-leitura.cjs compara as duas e avisa se saírem de sincronia.

// ── _ffParseValor ─────────────────────────────────────────────────────────
function _ffParseValor(s) {
  const t = String(s == null ? '' : s).replace(/[^\d,.-]/g, '').trim();
  if (!t) return 0;
  let normalizado;
  if (t.includes(',')) {
    // Padrão brasileiro: vírgula é decimal, ponto (se tiver) é milhar.
    normalizado = t.replace(/\./g, '').replace(',', '.');
  } else {
    const ultimoPonto = t.lastIndexOf('.');
    if (ultimoPonto >= 0 && t.length - ultimoPonto - 1 === 2) {
      // Sem vírgula nenhuma, mas o ÚLTIMO ponto tem exatamente 2 casas
      // depois — é alguém editando no padrão americano ("1500.00" ou
      // "1.500.00"). Sem isso, "1.500.00" virava 150000 (100x maior) em
      // vez de 1500 — os pontos antes do último são milhar, viram nada.
      normalizado = t.slice(0, ultimoPonto).replace(/\./g, '') + '.' + t.slice(ultimoPonto + 1);
    } else {
      // Só ponto(s) fora desse padrão — trata como separador de milhar
      // (ex.: "1.500" sozinho quer dizer 1500, não 1,5).
      normalizado = t.replace(/\./g, '');
    }
  }
  const n = parseFloat(normalizado);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

// ── _ffLerPorColuna (versão reduzida: só o que o teste exercita) ──────────
// Leitura por posição horizontal. O que importa aqui é a detecção da linha de
// cabeçalho, que se REPETE em toda página do relatório e já entrou como se
// fosse gente ("pessoa fantasma").
function _ffLerPorColuna(linhas) {
  if (!Array.isArray(linhas) || !linhas.length) return null;
  const out = [];
  const ehPensao = linhas.some(function (l) {
    return /nome\s+do?\s+pensionista/i.test(l.pedacos.map(p => p.str).join(' '));
  });

  linhas.forEach(function (linha) {
    // A própria linha do cabeçalho não é gente — e ela se REPETE em toda
    // página do relatório, não só na primeira.
    const juntouLinha = linha.pedacos.map(p => p.str).join(' ');
    if (/nome\s+do?\s+funcion/i.test(juntouLinha) && /c\.?\s*p\.?\s*f\.?/i.test(juntouLinha)) return;

    const pedacos = linha.pedacos.slice().sort(function (a, b) { return a.x - b.x; });
    if (ehPensao) {
      // Colunas: funcionário | pensionista | cpf | valor
      const funcionario = pedacos.filter(p => p.x < 70).map(p => p.str).join(' ').trim();
      const pensionista = pedacos.filter(p => p.x >= 70 && p.x < 175).map(p => p.str).join(' ').trim();
      const valorBruto = pedacos.filter(p => p.x >= 200).map(p => p.str).join(' ').trim();
      if (!pensionista) return;
      const valor = _ffParseValor(valorBruto);
      out.push({
        id: 'ffl-' + Date.now() + '-' + out.length + '-' + Math.random().toString(36).slice(2, 5),
        nome: pensionista + ' (pensão — func. ' + funcionario + ')',
        cpf: '',
        valor: valor,
        arquivo: '(coluna)',
        // Neste modelo quem valida a linha é o NOME, porque o relatório
        // muitas vezes não traz CPF.
        status: (pensionista.length >= 5 && valor > 0) ? 'ok' : 'conferir'
      });
      return;
    }

    const nome = pedacos.filter(p => p.x < 175).map(p => p.str).join(' ').trim();
    const valorBruto = pedacos.filter(p => p.x >= 200).map(p => p.str).join(' ').trim();
    if (!nome) return;
    const valor = _ffParseValor(valorBruto);
    const semValor = valorBruto === '';
    out.push({
      id: 'ffl-' + Date.now() + '-' + out.length + '-' + Math.random().toString(36).slice(2, 5),
      nome: nome, cpf: '', valor: valor, arquivo: '(coluna)',
      // Nome truncado não pode entrar como conferido.
      status: (nome.length >= 5 && (valor > 0 || semValor)) ? 'ok' : 'conferir'
    });
  });

  return out.length ? out : null;
}

module.exports = { _ffParseValor, _ffLerPorColuna };
