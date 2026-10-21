// Roda pelo executor da suite:  node testes/rodar.cjs texto
// Precisa de servidor E de navegador.
//
// O que isto cobre: o descritivo da vaga perdia as quebras de linha ao ser
// colado. O dado SEMPRE esteve certo no banco (o textarea preserva as
// quebras) -- quem perdia era a EXIBICAO, porque o HTML junta espaco e quebra
// num espaco so. Entao o teste olha as duas pontas: o que vai para o servidor
// e o que aparece na tela.
const http = require('http');
function jsonGet(url) {
  return new Promise((res, rej) => http.get(url, r => {
    let s = ''; r.on('data', d => s += d); r.on('end', () => res(JSON.parse(s)));
  }).on('error', rej));
}
class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pend = new Map();
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      if (m.id && this.pend.has(m.id)) {
        const { res, rej } = this.pend.get(m.id); this.pend.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.pend.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __erro: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text };
    return r.result.value;
  }
}

const BASE = process.env.BASE;
if (!BASE) {
  console.error('Este teste roda pelo executor da suite:  node testes/rodar.cjs');
  process.exit(2);
}
const CDP_PORT = Number(process.env.CDP || 0);
if (!CDP_PORT) { console.error('Sem CDP: esta suite precisa do navegador.'); process.exit(2); }

const espera = ms => new Promise(r => setTimeout(r, ms));
// Espera por CONDICAO, nao por tempo fixo: na execucao completa a maquina
// esta ocupada e um espera(3000) nao basta. Devolve true quando a condicao
// ficou verdadeira, false no limite.
async function esperarPor(cdp, expressao, limiteMs, oQue) {
  const fim = Date.now() + (limiteMs || 30000);
  while (Date.now() < fim) {
    try { if (await cdp.eval(expressao) === true) return true; } catch (e) { /* ainda carregando */ }
    await new Promise(function (r) { setTimeout(r, 250); });
  }
  console.log("  (limite) esperei " + ((limiteMs || 30000) / 1000) + "s por: " + (oQue || expressao));
  return false;
}
// Pagina de login pronta (ou o painel ja carregado, se a sessao existe).
const APP_PRONTO = "typeof state !== 'undefined' && !!state";
const LOGIN_PRONTO = "document.readyState === 'complete' && (!!document.getElementById('login-form') || (typeof state !== 'undefined' && !!state))";

let falhas = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALHOU: ') + m); if (!c) falhas++; };

// Texto como a pessoa cola: paragrafos, linha em branco, lista com marcador,
// lista numerada e acento.
const TEXTO = [
  'Vaga para Auxiliar de Produção',
  '',
  'Atividades:',
  '• Separação de materiais',
  '• Organização do estoque',
  '',
  'Requisitos:',
  '1. Ensino médio completo',
  '2. Disponibilidade de horário',
  '',
  'Observação: início imediato.'
].join('\n');

(async () => {
  const alvos = await jsonGet('http://127.0.0.1:' + CDP_PORT + '/json');
  const pagina = alvos.find(t => t.type === 'page');
  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  const excecoes = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails || {};
      excecoes.push(((d.exception && d.exception.description) || d.text || '').split('\n')[0]);
    }
    if (m.method === 'Page.javascriptDialogOpening') cdp.send('Page.handleJavaScriptDialog', { accept: true });
  });

  await cdp.send('Page.navigate', { url: BASE + '/' });
  await esperarPor(cdp, LOGIN_PRONTO, 30000, 'a pagina abrir');
  if (await cdp.eval(`!!document.getElementById('login-form')`)) {
    await cdp.eval(`(function(){
      document.getElementById('login-username').value='admin';
      document.getElementById('login-password').value='TesteLocal#123';
      document.getElementById('login-form').requestSubmit();
    })()`);
    await esperarPor(cdp, APP_PRONTO, 45000, 'o sistema carregar depois do login');
  }
  ok(await cdp.eval(`typeof state !== 'undefined' && !!state`), 'sistema carregado');

  // ---------- 1) o normalizador de colagem ----------
  console.log('\n=== 1) TEXTO COLADO DE FORA VIRA TEXTO LIMPO, MANTENDO AS QUEBRAS ===');
  const casos = await cdp.eval(`(function(){
    const f = window.limparTextoColado;
    if (typeof f !== 'function') return { semFuncao: true };
    return {
      word:      f('Atividades:\\r\\n\\u00b7\\u00a0Atender\\r\\n\\u00b7\\u00a0Organizar'),
      pdf:       f('Req:\\n\\uf0b7  Ensino medio\\n\\uf0b7  Experiencia'),
      zero:      f('Vaga \\u201cAjudante\\u201d\\u200b\\nSalario \\u2013 1500'),
      brancas:   f('Linha 1\\n\\n\\n\\n\\nLinha 2'),
      numeros:   f('1. primeiro\\n2. segundo'),
      paragrafo: f('Paragrafo um\\n\\nParagrafo dois'),
      asterisco: f('* item um\\n* item dois')
    };
  })()`);
  ok(!casos.semFuncao, 'a funcao limparTextoColado existe na tela');
  if (!casos.semFuncao) {
    ok(casos.word === 'Atividades:\n• Atender\n• Organizar', 'Word: CRLF e espaco-que-nao-quebra tratados, marcador vira • (' + JSON.stringify(casos.word) + ')');
    ok(casos.pdf === 'Req:\n• Ensino medio\n• Experiencia', 'PDF: marcador esquisito vira •');
    ok(casos.zero.indexOf('​') < 0 && casos.zero.indexOf('"Ajudante"') >= 0, 'site: largura zero removida e aspas curvas normalizadas');
    ok(casos.brancas === 'Linha 1\n\nLinha 2', 'excesso de linha em branco virou uma so');
    ok(casos.numeros === '1. primeiro\n2. segundo', 'lista NUMERADA fica como estava');
    ok(casos.paragrafo === 'Paragrafo um\n\nParagrafo dois', 'linha em branco ENTRE paragrafos e preservada');
    ok(casos.asterisco === '• item um\n• item dois', 'asterisco como marcador vira •');
  }

  // ---------- 2) colar de verdade no campo, salvar e conferir no servidor ----------
  console.log('\n=== 2) COLAR NO CAMPO, SALVAR E CONFERIR O QUE FOI PARA O SERVIDOR ===');
  const TEXTO_JS = JSON.stringify(TEXTO);
  const salvou = await cdp.eval(`(async function(){
    // cria empresa e vaga direto no estado, com o descritivo multilinha
    state.empresas = state.empresas || [];
    if (!state.empresas.some(e => e.id === 'emp-txt')) {
      state.empresas.push({ id: 'emp-txt', nome: 'Empresa Texto', sigla: 'ET', status: 'ativo' });
    }
    const id = 'vaga-texto-1';
    state.vagas = (state.vagas || []).filter(v => v.id !== id);
    state.vagas.push({
      id: id, empresaId: 'emp-txt', empresaNome: 'Empresa Texto', cargo: 'Auxiliar',
      codigo: '001', descricao: ${TEXTO_JS}, salario: 1500, localTrabalho: 'Centro',
      vagasDisponiveis: 2, beneficios: [], horarios: [], camposExtras: {}
    });
    await RTCloud.salvarAgora(state, { merge: true, upsertIds: ['emp-txt', id] });
    const j = await (await fetch('/api/state')).json();
    const v = (j.dados.vagas || []).find(x => x.id === id);
    return { descricao: v ? v.descricao : null };
  })()`);
  ok(salvou.descricao === TEXTO, 'o servidor guardou o texto com TODAS as quebras, igual ao original');
  if (salvou.descricao) {
    const linhasSalvas = salvou.descricao.split('\n').length;
    ok(linhasSalvas === TEXTO.split('\n').length, 'mesmo numero de linhas (' + linhasSalvas + ')');
    ok(/\n\n/.test(salvou.descricao), 'as linhas em branco entre paragrafos sobreviveram');
    ok(salvou.descricao.indexOf('• Separação') >= 0, 'os marcadores sobreviveram, com acento');
  }

  // ---------- 3) a TELA mostra as quebras ----------
  console.log('\n=== 3) A TELA MOSTRA AS QUEBRAS (era aqui que se perdia) ===');
  await cdp.eval(`(function(){ switchAba('vagas'); })()`);
  // Espera o CARTAO aparecer, nao o relogio: com a maquina ocupada, 1,6s nao
  // bastava e o teste falhava so na execucao completa.
  await esperarPor(cdp,
    "Array.from(document.querySelectorAll('.vaga-desc')).some(function(p){ return (p.textContent||'').indexOf('Auxiliar de Produção') >= 0; })",
    30000, 'o cartao da vaga aparecer na tela');
  const naTela = await cdp.eval(`(function(){
    const ps = Array.from(document.querySelectorAll('.vaga-desc'));
    const alvo = ps.find(p => (p.textContent || '').indexOf('Auxiliar de Produção') >= 0);
    if (!alvo) return { achou: false, quantos: ps.length };
    const estilo = getComputedStyle(alvo);
    // altura de uma linha so, para comparar
    const medidor = document.createElement('p');
    medidor.className = alvo.className;
    medidor.style.position = 'absolute';
    medidor.style.visibility = 'hidden';
    medidor.style.width = alvo.getBoundingClientRect().width + 'px';
    medidor.textContent = 'uma linha';
    alvo.parentNode.appendChild(medidor);
    const alturaUmaLinha = medidor.getBoundingClientRect().height;
    medidor.remove();
    return {
      achou: true,
      whiteSpace: estilo.whiteSpace,
      altura: Math.round(alvo.getBoundingClientRect().height),
      alturaUmaLinha: Math.round(alturaUmaLinha),
      texto: alvo.textContent,
      // o HTML tem que ter o texto ESCAPADO, nao tags
      temTag: /<(script|img|b|i)\\b/i.test(alvo.innerHTML)
    };
  })()`);
  ok(naTela.achou, 'achei o descritivo na tela de Vagas' + (naTela.achou ? '' : ' (cartoes: ' + naTela.quantos + ')'));
  if (naTela.achou) {
    ok(naTela.whiteSpace === 'pre-wrap', 'o elemento esta com white-space: pre-wrap (ficou "' + naTela.whiteSpace + '")');
    ok(naTela.altura > naTela.alturaUmaLinha * 5,
      'e ocupa varias linhas de verdade: ' + naTela.altura + 'px contra ' + naTela.alturaUmaLinha + 'px de uma linha');
    ok(naTela.texto.indexOf('• Separação') >= 0, 'os marcadores aparecem na tela');
    ok(naTela.texto.indexOf('\n') >= 0, 'o texto renderizado ainda contem quebra de linha');
  }

  // ---------- 4) texto com HTML dentro nao vira HTML ----------
  console.log('\n=== 4) DESCRITIVO COM HTML DENTRO NAO EXECUTA (era inserido cru) ===');
  const xss = await cdp.eval(`(async function(){
    const id = 'vaga-texto-2';
    state.vagas = (state.vagas || []).filter(v => v.id !== id);
    state.vagas.push({
      id: id, empresaId: 'emp-txt', empresaNome: '<b>Negrito</b>', cargo: 'Teste',
      codigo: '002', descricao: 'linha 1\\n<img src=x onerror="window.__invadiu=1">\\nlinha 3',
      salario: 1000, localTrabalho: '<i>Local</i>', vagasDisponiveis: 1,
      beneficios: [], horarios: [], camposExtras: {}
    });
    renderCurrentAba();
    await new Promise(r => setTimeout(r, 1200));
    const ps = Array.from(document.querySelectorAll('.vaga-desc'));
    const alvo = ps.find(p => (p.textContent || '').indexOf('linha 1') >= 0);
    return {
      invadiu: !!window.__invadiu,
      temImg: alvo ? /<img/i.test(alvo.innerHTML) : null,
      mostraComoTexto: alvo ? (alvo.textContent.indexOf('<img') >= 0) : null,
      empresaComoTexto: (document.body.textContent || '').indexOf('<b>Negrito</b>') >= 0
    };
  })()`);
  ok(xss.invadiu === false, 'o onerror NAO executou');
  ok(xss.temImg === false, 'nao virou tag <img> dentro do HTML');
  ok(xss.mostraComoTexto === true, 'aparece como TEXTO na tela, que e o certo');
  ok(xss.empresaComoTexto === true, 'o nome da empresa com tag tambem aparece como texto');

  console.log('\nexcecoes de JS durante o teste: ' + (excecoes.length ? JSON.stringify(excecoes.slice(0, 3)) : 'nenhuma'));
  ok(excecoes.length === 0, 'nenhuma excecao de JS');

  console.log('\n' + (falhas === 0 ? 'TEXTO LONGO: TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
