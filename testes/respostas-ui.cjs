// Roda pelo executor da suite:  node testes/rodar.cjs respostas-ui
// Precisa de servidor E de navegador.
//
// A TELA das mensagens prontas:
//   - a fileira acima da caixa de escrever, com a janela de 24h FECHADA:
//     botoes desligados e aviso explicando por que;
//   - a lista que a barra "/" abre: busca, setas, Esc;
//   - o cadastro: titulo com HTML dentro nao vira codigo (regra 15) e o
//     texto preserva as quebras de linha;
//   - no celular, a fileira rola DENTRO dela mesma e nao alarga a pagina.
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
if (!BASE) { console.error('Roda pelo executor: node testes/rodar.cjs'); process.exit(2); }
const CDP_PORT = Number(process.env.CDP || 0);
if (!CDP_PORT) { console.error('Sem CDP: esta suite precisa do navegador.'); process.exit(2); }

// Espera por CONDICAO, nao por tempo fixo (regra 18).
async function esperarPor(cdp, expressao, limiteMs, oQue) {
  const fim = Date.now() + (limiteMs || 30000);
  while (Date.now() < fim) {
    try { if (await cdp.eval(expressao) === true) return true; } catch (e) { /* ainda carregando */ }
    await new Promise(function (r) { setTimeout(r, 250); });
  }
  console.log('  (limite) esperei ' + ((limiteMs || 30000) / 1000) + 's por: ' + (oQue || expressao));
  return false;
}
const APP_PRONTO = "typeof state !== 'undefined' && !!state";
const LOGIN_PRONTO = "document.readyState === 'complete' && (!!document.getElementById('login-form') || (typeof state !== 'undefined' && !!state))";

let falhas = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALHOU: ') + m); if (!c) falhas++; };

// O catalogo de teste: um titulo com HTML dentro (regra 15) e um texto com
// quebra de linha.
// GRAVA NO SERVIDOR de proposito: so mexer no `state` da aba nao basta, porque
// a sincronizacao busca o estado do servidor a cada poucos segundos e
// substituiria a lista semeada no meio do teste. De passagem, isso exercita o
// caminho de gravacao de verdade (merge + upsertIds).
const SEMEAR = `(async function(){
  state.respostasRapidas = [
    { id:'r1', titulo:'Saudacao', texto:'Ola {nome}, {saudacao}!', ordem:1 },
    { id:'r2', titulo:'Documentos', texto:'Precisamos de:\\n- RG\\n- CPF', ordem:2 },
    { id:'r3', titulo:'<img src=x onerror=alert(1)>', texto:'teste <b>bold</b>', ordem:3 },
    { id:'r4', titulo:'Tabela de vagas', texto:'Segue a tabela.', ordem:4, arquivo:'pronta_x.pdf', nomeArquivo:'tabela.pdf', tipoAnexo:'documento' }
  ];
  await RTCloud.salvarAgora(state, { merge: true, upsertIds: ['r1','r2','r3','r4'] });
  return (state.respostasRapidas || []).length;
})()`;

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

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
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

  console.log('=== 1) O ARQUIVO CARREGOU ===');
  ok(await cdp.eval(`typeof respostasDesenharFileira === 'function'`), 'respostasDesenharFileira existe');
  ok(await cdp.eval(`typeof _respostasRender === 'function'`), '_respostasRender existe');
  ok(await cdp.eval(`typeof respostasAbrirLista === 'function'`), 'respostasAbrirLista existe');
  ok(await cdp.eval(`typeof respostasUsar === 'function' && typeof respostasEnviarDireto === 'function'`),
    'as duas acoes (por a caixa / enviar) existem');
  ok(await cdp.eval(SEMEAR) === 4, 'catalogo de teste semeado');

  console.log('\n=== 2) FILEIRA COM A JANELA DE 24H FECHADA ===');
  excecoes.length = 0;
  const fil = await cdp.eval(`(async function(){
    document.querySelectorAll('.wa-composer-teste').forEach(function(n){ n.remove(); });
    const box = document.createElement('div');
    box.className = 'wa-composer wa-composer-teste';
    box.innerHTML = '<div class="wa-prontas" id="wa-prontas"></div>' +
                    '<div class="wa-composer-linha"><textarea id="wa-msg-input" rows="1"></textarea></div>';
    document.body.appendChild(box);
    // 999999 nao existe: o servidor responde "janela fechada", que e o que o
    // atendente ve quando a pessoa nao escreve ha mais de um dia.
    await respostasDesenharFileira({ id: 999999 });
    const fila = document.getElementById('wa-prontas');
    const botoes = Array.from(fila.querySelectorAll('button'));
    return {
      temAviso: !!fila.querySelector('.wa-pronta-fechada'),
      aviso: (fila.querySelector('.wa-pronta-fechada') || {}).textContent || '',
      botoesUsar: fila.querySelectorAll('.wa-pronta-usar').length,
      todosDesligados: botoes.filter(function(b){ return b.classList.contains('wa-pronta-usar') || b.classList.contains('wa-pronta-ja'); })
                              .every(function(b){ return b.disabled; })
    };
  })()`);
  ok(fil && fil.temAviso, 'aparece o aviso da janela fechada');
  ok(fil && /24 horas/.test(fil.aviso || ''), 'e o aviso explica o motivo: "' + String((fil || {}).aviso || '').slice(0, 60) + '..."');
  ok(fil && fil.botoesUsar === 4, 'as 4 mensagens aparecem na fileira (apareceram ' + (fil || {}).botoesUsar + ')');
  ok(fil && fil.todosDesligados === true, 'e TODOS os botoes estao desligados');
  ok(excecoes.length === 0, 'sem erro de console (' + JSON.stringify(excecoes.slice(0, 2)) + ')');

  console.log('\n=== 3) A LISTA DA BARRA "/" ===');
  excecoes.length = 0;
  const lst = await cdp.eval(`(function(){
    respostasAbrirLista();
    const p = document.getElementById('wa-prontas-lista');
    const total = p ? p.querySelectorAll('.wa-prontas-item').length : -1;
    respostasFiltrarLista('docu');
    const filtrados = p ? Array.from(p.querySelectorAll('.wa-prontas-item')).map(function(b){ return b.textContent; }) : [];
    respostasFiltrarLista('');
    const ev = { key: 'ArrowDown', preventDefault: function(){} };
    respostasTeclaLista(ev);
    const alvo = p ? (p.querySelector('.wa-prontas-item.alvo') || {}).dataset : null;
    const temBusca = !!document.getElementById('wa-prontas-busca');
    respostasFecharLista();
    return {
      total: total, filtrados: filtrados, temBusca: temBusca,
      alvoDepoisDaSeta: alvo ? alvo.id : '',
      fechou: !document.getElementById('wa-prontas-lista')
    };
  })()`);
  ok(lst && lst.total === 4, 'a lista abre com as 4 (abriu ' + (lst || {}).total + ')');
  ok(lst && lst.temBusca, 'tem campo de busca proprio (a caixa de escrever fica intacta)');
  ok(lst && lst.filtrados.length === 1 && /Documentos/.test(lst.filtrados[0]), 'a busca filtra: ' + JSON.stringify((lst || {}).filtrados));
  ok(lst && lst.alvoDepoisDaSeta === 'r2', 'a seta para baixo anda na lista (foi para "' + (lst || {}).alvoDepoisDaSeta + '")');
  ok(lst && lst.fechou, 'e fecha sem deixar nada na tela');
  ok(excecoes.length === 0, 'sem erro de console (' + JSON.stringify(excecoes.slice(0, 2)) + ')');

  console.log('\n=== 4) CADASTRO: HTML NO TITULO NAO VIRA CODIGO (regra 15) ===');
  excecoes.length = 0;
  const cad = await cdp.eval(`(function(){
    document.querySelectorAll('.wa-cad-teste').forEach(function(n){ n.remove(); });
    const div = document.createElement('div');
    div.className = 'wa-cad-teste';
    div.style.cssText = 'position:absolute;left:-9999px;width:900px;';
    document.body.appendChild(div);
    _respostasRender(div);
    const cards = div.querySelectorAll('.wa-prontas-card');
    const titulos = Array.from(div.querySelectorAll('.wa-prontas-card-cab strong')).map(function(s){ return s.textContent; });
    const txt = div.querySelector('.wa-prontas-card-txt');
    const quebras = Array.from(div.querySelectorAll('.wa-prontas-card-txt')).find(function(e){ return /RG/.test(e.textContent); });
    return {
      cards: cards.length,
      titulos: titulos,
      injetou: !!div.querySelector('img[onerror]') || !!div.querySelector('script'),
      temClasseTextoLongo: !!txt && txt.classList.contains('texto-longo'),
      espacoPreservado: quebras ? getComputedStyle(quebras).whiteSpace : '',
      temChipDoAnexo: !!div.querySelector('.wa-prontas-chip'),
      temBotaoNova: /Nova mensagem/.test(div.textContent)
    };
  })()`);
  ok(cad && cad.cards === 4, 'desenha os 4 cards (desenhou ' + (cad || {}).cards + ')');
  ok(cad && cad.injetou === false, 'o titulo com <img onerror> NAO virou elemento de verdade');
  ok(cad && (cad.titulos || []).some(t => /onerror/.test(t)), 'ele aparece como TEXTO: ' + JSON.stringify((cad.titulos || []).find(t => /onerror/.test(t)) || ''));
  ok(cad && cad.temClasseTextoLongo, 'o texto usa a classe texto-longo');
  ok(cad && /pre-wrap|pre-line/.test(cad.espacoPreservado || ''), 'e as quebras de linha ficam visiveis (' + (cad || {}).espacoPreservado + ')');
  ok(cad && cad.temChipDoAnexo, 'a mensagem com anexo mostra o arquivo');
  ok(cad && cad.temBotaoNova, 'e o admin ve o botao de criar');
  ok(excecoes.length === 0, 'sem erro de console (' + JSON.stringify(excecoes.slice(0, 2)) + ')');

  console.log('\n=== 5) NO CELULAR: A FILEIRA ROLA DENTRO DELA, SEM ALARGAR A PAGINA ===');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  const cel = await cdp.eval(`(async function(){
    document.querySelectorAll('.wa-cad-teste').forEach(function(n){ n.remove(); });
    const box = document.querySelector('.wa-composer-teste');
    box.style.cssText = 'width:390px;max-width:390px;';
    await respostasDesenharFileira({ id: 999999 });
    const fila = box.querySelector('.wa-prontas-fila');
    return {
      larguraFila: fila ? fila.clientWidth : -1,
      conteudo: fila ? fila.scrollWidth : -1,
      rolaDentro: !!fila && fila.scrollWidth > fila.clientWidth,
      cabeNaTela: !!fila && fila.clientWidth <= window.innerWidth,
      alturaDoAviso: (box.querySelector('.wa-pronta-fechada') || {}).clientHeight || 0
    };
  })()`);
  ok(cel && cel.cabeNaTela, 'a fileira nao passa da largura da tela (' + (cel || {}).larguraFila + 'px numa tela de 390)');
  ok(cel && cel.rolaDentro, 'e o excesso rola dentro dela (conteudo de ' + (cel || {}).conteudo + 'px)');
  ok(cel && cel.alturaDoAviso > 0, 'o aviso da janela fechada continua visivel no celular');

  // Limpa o que o teste colocou na pagina.
  await cdp.eval(`(function(){
    document.querySelectorAll('.wa-composer-teste, .wa-cad-teste').forEach(function(n){ n.remove(); });
    return true;
  })()`);

  console.log('\n' + (falhas === 0 ? 'MENSAGENS PRONTAS (tela): TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
