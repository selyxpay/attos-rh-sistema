// Roda pelo executor da suite:  node testes/rodar.cjs ff
// Esta suite NAO precisa de servidor nem de navegador: as duas funcoes
// testadas aqui sao puras.
const fs = require('fs');
const path = require('path');
const { _ffParseValor, _ffLerPorColuna } = require('./ff-funcoes-extraidas.js');

let falhas = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALHOU: ') + m); if (!c) falhas++; };

console.log('=== 1) VALOR EM REAIS: formato brasileiro ===');
ok(_ffParseValor('1.500,00') === 1500, '"1.500,00" -> 1500 (deu ' + _ffParseValor('1.500,00') + ')');
ok(_ffParseValor('844,00') === 844, '"844,00" -> 844');
ok(_ffParseValor('48.108,00') === 48108, '"48.108,00" -> 48108');
ok(_ffParseValor('0,50') === 0.5, '"0,50" -> 0.5');

console.log('\n=== 2) VALOR EM REAIS: o caso que ficava 100x maior (regra 10) ===');
ok(_ffParseValor('1.500.00') === 1500, '"1.500.00" (padrao americano) -> 1500, nao 150000 (deu ' + _ffParseValor('1.500.00') + ')');
ok(_ffParseValor('1500.00') === 1500, '"1500.00" -> 1500 (deu ' + _ffParseValor('1500.00') + ')');
ok(_ffParseValor('150000.00') === 150000, '"150000.00" -> 150000, nao 15000000 (deu ' + _ffParseValor('150000.00') + ')');

console.log('\n=== 3) VALOR EM REAIS: ponto sozinho continua sendo milhar ===');
ok(_ffParseValor('1.500') === 1500, '"1.500" -> 1500 (milhar, nao 1,5)');
ok(_ffParseValor('1.500.000') === 1500000, '"1.500.000" -> 1500000');
ok(_ffParseValor('') === 0, 'vazio -> 0');
ok(_ffParseValor(null) === 0, 'nulo -> 0');
ok(_ffParseValor('R$ 2.340,55') === 2340.55, '"R$ 2.340,55" -> 2340.55');

console.log('\n=== 4) PESSOA FANTASMA: cabecalho repetido em cada pagina do PDF ===');
function linha(pagina, y, pedacosStrs, xs) {
  return { pagina, y, pedacos: pedacosStrs.map((s, i) => ({ str: s, x: xs[i] })) };
}
const cabecalhoPedacos = ['Nome', 'do', 'funcionário', 'Nome', 'do', 'pensionista', 'C.P.F.', 'Valor'];
const cabecalhoXs      = [0,      20,   35,            80,     110,  125,           180,      220];
const linhasDoc = [
  linha(1, 100, cabecalhoPedacos, cabecalhoXs),                                              // cabecalho pagina 1
  linha(1, 120, ['Joao', 'Silva', 'Maria', 'Pereira', '', '150,00'], [0, 20, 80, 110, 180, 220]),
  linha(2, 100, cabecalhoPedacos, cabecalhoXs),                                              // cabecalho REPETIDO (o bug)
  linha(2, 120, ['Pedro', 'Costa', 'Ana', 'Souza', '', '200,00'], [0, 20, 80, 110, 180, 220]),
];
const resultado = _ffLerPorColuna(linhasDoc);
console.log('   registros encontrados: ' + (resultado ? resultado.length : 0));
if (resultado) resultado.forEach(r => console.log('     - ' + JSON.stringify({ nome: r.nome, valor: r.valor, status: r.status })));
ok(resultado && resultado.length === 2,
  'achou exatamente 2 pessoas reais, nao 3 nem 4 (o cabecalho da pagina 2 nao virou gente) -- achou ' + (resultado ? resultado.length : 0));
if (resultado) {
  ok(!resultado.some(r => /nome\s+do\s+pensionista/i.test(r.nome || '')), 'nenhum registro tem o texto do CABECALHO como nome');
  ok(resultado.every(r => r.status === 'ok'), 'as 2 pessoas reais estao com status "ok"');
  ok(resultado[0].valor === 150 && resultado[1].valor === 200, 'os valores foram lidos certo (150 e 200)');
}

console.log('\n=== 5) NOME TRUNCADO nao entra como conferido ===');
const curto = _ffLerPorColuna([
  linha(1, 100, ['Nome', 'do', 'funcionário', 'C.P.F.', 'Valor'], [0, 20, 35, 180, 220]),
  linha(1, 120, ['Jo', '150,00'], [0, 220]),
]);
ok(curto && curto.length === 1, 'leu a linha');
if (curto) ok(curto[0].status === 'conferir', 'nome de 2 letras fica como "conferir" (ficou: ' + curto[0].status + ')');

console.log('\n=== 6) AS COPIAS CONTINUAM IGUAIS AO js/app.js ===');
// Guarda contra o teste virar enfeite: se alguem mudar a funcao no app.js e
// nao aqui, este aviso aparece.
try {
  const app = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');
  const copia = fs.readFileSync(path.resolve(__dirname, 'ff-funcoes-extraidas.js'), 'utf8');
  const pegarCorpo = (txt, nome) => {
    const i = txt.indexOf('function ' + nome + '(');
    if (i < 0) return null;
    // vai ate a linha que fecha a funcao na coluna 0
    const fim = txt.indexOf('\n}', i);
    return fim < 0 ? null : txt.slice(i, fim).replace(/\r/g, '').replace(/\s+/g, ' ').trim();
  };
  const noApp = pegarCorpo(app, '_ffParseValor');
  const naCopia = pegarCorpo(copia, '_ffParseValor');
  ok(!!noApp, 'achei _ffParseValor no js/app.js');
  ok(noApp === naCopia, '_ffParseValor aqui e IDENTICA a do js/app.js' +
    (noApp === naCopia ? '' : ' — ATUALIZE testes/ff-funcoes-extraidas.js'));
} catch (e) {
  ok(false, 'nao consegui comparar com o js/app.js: ' + e.message);
}

console.log('\n' + (falhas === 0 ? 'FLUXO FINANCEIRO: TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
process.exit(falhas === 0 ? 0 : 1);
