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
  const _sem = await cdp.eval(SEMEAR);
  ok(_sem === 4, 'catalogo de teste semeado (' + JSON.stringify(_sem) + ')');
  // ESPERA O SERVIDOR CONFIRMAR antes de seguir. A sincronizacao busca o
  // estado do servidor a cada poucos segundos e substitui o da aba: se ela
  // passar antes do save chegar, a lista semeada desaparece no meio do teste
  // (ja aconteceu, e a suite falhou por carga, nao por defeito).
  const semeadoNoServidor = await esperarPor(cdp,
    `(async function(){
       const j = await fetch('/api/state', { credentials: 'same-origin' }).then(function(r){ return r.json(); });
       return ((((j || {}).dados || {}).respostasRapidas) || []).length >= 4;
     })()`,
    20000, 'o catalogo chegar no servidor');
  ok(semeadoNoServidor === true, 'e o servidor confirmou o catalogo (a sincronizacao nao apaga a lista no meio)');

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
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // ────────────────────────────────────────────────────────────────────────
  // 6) GRAVA DE VERDADE? Este e o teste do defeito do `window.state`.
  // Com ele, a aba Bot lia uma COPIA do padrao: a pessoa mexia na tela, o
  // sistema dizia "salvo" e nada ia para o servidor. O mesmo valeria para as
  // mensagens prontas. Aqui o caminho e o de verdade: a MESMA funcao que o
  // campo da tela chama, e a conferencia e no SERVIDOR.
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n=== 6) O QUE A TELA SALVA CHEGA NO SERVIDOR ===');
  excecoes.length = 0;
  const MARCA = 'http://teste-de-gravacao/vagas';
  const diag = await cdp.eval(`(function(){
    return {
      login: (loggedUser || {}).login || '', depto: (loggedUser || {}).departamento || '',
      nivelBot: (window.RTTelas ? RTTelas.telasDoFuncionario(loggedUser, state || {})['bot'] : '?'),
      podeEditarBot: (typeof _botPodeVer === 'function') ? _botPodeVer() : '?'
    };
  })()`);
  console.log('  (diagnostico) ' + JSON.stringify(diag));
  // A aba Bot agora edita em RASCUNHO: mexer no campo muda a tela, e so o
  // botao "Salvar alteracoes" leva para o servidor. O teste prova os dois.
  const salvouBot = await cdp.eval(`(async function(){
    if (typeof botMudarCampo !== 'function') return { erro: 'botMudarCampo nao existe' };
    switchAba('whatsapp');
    waTrocarSubAba('bot');
    await new Promise(function(r){ setTimeout(r, 400); });
    botMudarCampo('linkVagas', ${JSON.stringify(MARCA)});
    const rascunhoNaTela = /${'teste-de-gravacao'}/.test(document.getElementById('wa-content').innerHTML);
    await botSalvarAlteracoes();
    await new Promise(function(r){ setTimeout(r, 300); });
    return { naTela: (state.botWhatsapp || {}).linkVagas || '', rascunhoNaTela: rascunhoNaTela };
  })()`);
  ok(salvouBot && salvouBot.rascunhoNaTela === true, 'o rascunho aparece na tela na hora');
  ok(salvouBot && salvouBot.naTela === MARCA, 'e depois de salvar, a configuracao do bot vale');
  // Espera por CONDICAO (regra 18): a gravacao passa por uma fila, e ler o
  // servidor na linha seguinte chega antes do POST.
  const chegouNoServidor = await esperarPor(cdp,
    `(async function(){
       const j = await fetch('/api/state', { credentials: 'same-origin' }).then(function(r){ return r.json(); });
       return (((j || {}).dados || {}).botWhatsapp || {}).linkVagas === ${JSON.stringify(MARCA)};
     })()`,
    20000, 'a configuracao do bot chegar no servidor');
  ok(chegouNoServidor === true,
    'E CHEGOU NO SERVIDOR (era aqui que o defeito do window.state mordia)');

  const salvouPronta = await cdp.eval(`(async function(){
    switchAba('whatsapp');
    waTrocarSubAba('prontas');
    respostasNova();
    const t = document.getElementById('resp-titulo');
    const x = document.getElementById('resp-texto');
    if (!t || !x) return { erro: 'o formulario nao abriu' };
    t.value = 'Teste de gravacao';
    x.value = 'Ola {nome}, isto e um teste.';
    await respostasSalvarForm();
    return { naTela: (state.respostasRapidas || []).some(function(r){ return r.titulo === 'Teste de gravacao'; }) };
  })()`);
  ok(salvouPronta && salvouPronta.naTela === true, 'a mensagem pronta entrou na lista da tela');
  const prontaNoServidor = await esperarPor(cdp,
    `(async function(){
       const j = await fetch('/api/state', { credentials: 'same-origin' }).then(function(r){ return r.json(); });
       const lista = (((j || {}).dados || {}).respostasRapidas) || [];
       const achou = lista.find(function(r){ return r.titulo === 'Teste de gravacao'; });
       return !!achou && /isto e um teste/.test(achou.texto || '');
     })()`,
    20000, 'a mensagem pronta chegar no servidor');
  ok(prontaNoServidor === true, 'e chegou no servidor com o texto digitado');
  ok(excecoes.length === 0, 'sem erro de console (' + JSON.stringify(excecoes.slice(0, 2)) + ')');

  console.log('\n=== 7) E CONTINUA LA DEPOIS DE RECARREGAR A PAGINA ===');
  await cdp.send('Page.navigate', { url: BASE + '/' });
  await esperarPor(cdp, LOGIN_PRONTO, 30000, 'a pagina abrir de novo');
  if (await cdp.eval(`!!document.getElementById('login-form')`)) {
    await cdp.eval(`(function(){
      document.getElementById('login-username').value='admin';
      document.getElementById('login-password').value='TesteLocal#123';
      document.getElementById('login-form').requestSubmit();
    })()`);
    await esperarPor(cdp, APP_PRONTO, 45000, 'o sistema carregar depois do login');
  }
  await esperarPor(cdp, "typeof state !== 'undefined' && !!state && !!state.botWhatsapp", 30000, 'o estado chegar');
  const depois = await cdp.eval(`(function(){
    return {
      bot: (state.botWhatsapp || {}).linkVagas || '',
      pronta: ((state.respostasRapidas || []).find(function(r){ return r.titulo === 'Teste de gravacao'; }) || {}).texto || ''
    };
  })()`);
  ok(depois && depois.bot === MARCA, 'a configuracao do bot continua la depois de recarregar ("' + (depois || {}).bot + '")');
  ok(depois && /isto e um teste/.test(depois.pronta || ''), 'e a mensagem pronta tambem');

  // ────────────────────────────────────────────────────────────────────────
  // 8) A ABA BOT: PASSOS, RASCUNHO E CONFIRMACAO
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n=== 8) ABA BOT: PASSO A PASSO E RASCUNHO ===');
  excecoes.length = 0;
  const abriuBot = await cdp.eval(`(async function(){
    switchAba('whatsapp');
    waTrocarSubAba('bot');
    await new Promise(function(r){ setTimeout(r, 400); });
    const cont = document.getElementById('wa-content');
    const txt = cont ? cont.textContent : '';
    return {
      passos: cont ? cont.querySelectorAll('.bot-passo').length : 0,
      temNumeros: cont ? cont.querySelectorAll('.bot-cartao').length > 0 : false,
      temDiario: !!document.querySelector('.bot-diario-bloco'),
      diarioRecolhido: !!document.querySelector('.bot-diario-bloco:not([open])'),
      temBoasVindas: /Mensagem de boas-vindas/i.test(txt),
      temQuandoResponder: /Quando responder/i.test(txt),
      temLink: /Link das vagas/i.test(txt),
      temLembrete: /Lembrete/i.test(txt),
      temAtendente: /Atendente e saida|Atendente e saída/i.test(txt),
      temTestar: /Testar no meu numero|Testar no meu número/i.test(txt),
      temBarraSalvar: !!document.querySelector('.bot-barra-salvar')
    };
  })()`);
  ok(abriuBot && abriuBot.passos >= 6, 'a aba Bot mostra os 6 passos em cartoes (' + (abriuBot || {}).passos + ')');
  ok(abriuBot && abriuBot.temBoasVindas && abriuBot.temQuandoResponder && abriuBot.temLink,
    'com os titulos dos passos 1, 2 e 3');
  ok(abriuBot && abriuBot.temLembrete && abriuBot.temAtendente && abriuBot.temTestar,
    'e dos passos 4, 5 e 6');
  ok(abriuBot && abriuBot.temNumeros, 'os numeros do bot aparecem em cartoes no topo');
  ok(abriuBot && abriuBot.temDiario, 'o diario esta na tela');
  ok(abriuBot && abriuBot.diarioRecolhido, 'e vem RECOLHIDO (nao polui a tela)');
  ok(abriuBot && abriuBot.temBarraSalvar === false, 'sem alteracoes, nao ha barra de salvar');

  const rascunho = await cdp.eval(`(async function(){
    // Mexe num campo: NAO pode ir para o servidor ainda.
    botMudarCampo('linkVagas', 'https://teste-rascunho/vagas');
    await new Promise(function(r){ setTimeout(r, 300); });
    const j = await fetch('/api/state', { credentials: 'same-origin' }).then(function(r){ return r.json(); });
    const noServidor = (((j || {}).dados || {}).botWhatsapp || {}).linkVagas || '';
    return {
      naTela: !!document.querySelector('.bot-barra-salvar'),
      noServidor: noServidor,
      mostraNaTela: /teste-rascunho/.test(document.getElementById('wa-content').innerHTML)
    };
  })()`);
  ok(rascunho && rascunho.naTela === true, 'mexendo num campo, aparece a barra "alteracoes nao salvas"');
  ok(rascunho && rascunho.mostraNaTela === true, 'a tela ja mostra o valor novo');
  ok(rascunho && rascunho.noServidor !== 'https://teste-rascunho/vagas',
    'MAS o servidor ainda NAO tem a mudanca (so vale ao salvar): "' + ((rascunho || {}).noServidor || '') + '"');

  const descartou = await cdp.eval(`(function(){
    // O confirm e aceito automaticamente pelo teste.
    botDescartar();
    return { barra: !!document.querySelector('.bot-barra-salvar'),
             aindaMostra: /teste-rascunho/.test(document.getElementById('wa-content').innerHTML) };
  })()`);
  ok(descartou && descartou.barra === false, 'descartar tira a barra');
  ok(descartou && descartou.aindaMostra === false, 'e o valor volta ao que estava salvo');

  const salvou = await cdp.eval(`(async function(){
    botMudarCampo('linkVagas', 'https://salvo-de-verdade/vagas');
    await botSalvarAlteracoes();
    await new Promise(function(r){ setTimeout(r, 400); });
    return { barra: !!document.querySelector('.bot-barra-salvar') };
  })()`);
  ok(salvou && salvou.barra === false, 'depois de salvar, a barra sai');
  const chegouBot = await esperarPor(cdp,
    `(async function(){
       const j = await fetch('/api/state', { credentials: 'same-origin' }).then(function(r){ return r.json(); });
       return (((j || {}).dados || {}).botWhatsapp || {}).linkVagas === 'https://salvo-de-verdade/vagas';
     })()`,
    20000, 'a alteracao do bot chegar no servidor');
  ok(chegouBot === true, 'e a alteracao chegou no servidor');

  console.log('\n=== 9) LIGAR E DESLIGAR PEDEM CONFIRMACAO ===');
  const ligar = await cdp.eval(`(async function(){
    // Sem passos, o bot nao pode ligar: o sistema avisa o que falta.
    const antes = JSON.parse(JSON.stringify(state.botWhatsapp || {}));
    state.botWhatsapp.passos = [];
    _rascunhoFoiDescartado = true;
    await botPedirLigar(true);
    await new Promise(function(r){ setTimeout(r, 300); });
    const naoLigou = (state.botWhatsapp || {}).ligado !== true;
    // Agora com passo e mensagens, liga (o confirm e aceito pelo teste).
    state.botWhatsapp.passos = [{ id: 'p-teste', tipo: 'texto', texto: 'Oi {nome}, tudo bem?' }];
    state.botWhatsapp.atendente = Object.assign({}, state.botWhatsapp.atendente || {}, { mensagem: 'Ja chamei alguem' });
    state.botWhatsapp.saida = Object.assign({}, state.botWhatsapp.saida || {}, { mensagem: 'Combinado' });
    state.botWhatsapp.lembrete = { ligado: false, lembretes: [] };
    await botPedirLigar(true);
    await new Promise(function(r){ setTimeout(r, 400); });
    return {
      naoLigouSemPassos: naoLigou,
      ligou: (state.botWhatsapp || {}).ligado === true,
      temLigadoEm: !!(state.botWhatsapp || {}).ligadoEm,
      faixa: !!document.querySelector('.bot-faixa-no-ar'),
      antes: antes.ligado
    };
  })()`);
  ok(ligar && ligar.naoLigouSemPassos === true, 'sem a sequencia, o bot NAO liga (avisa o que falta)');
  ok(ligar && ligar.ligou === true, 'com tudo pronto e confirmando, o bot liga');
  ok(ligar && ligar.temLigadoEm === true, 'guardando a hora em que foi ligado');
  ok(ligar && ligar.faixa === true, 'e a faixa verde "Bot no ar" aparece');

  const desligar = await cdp.eval(`(async function(){
    await botPedirLigar(false);
    await new Promise(function(r){ setTimeout(r, 400); });
    return { ligado: (state.botWhatsapp || {}).ligado === true,
             faixa: !!document.querySelector('.bot-faixa-no-ar') };
  })()`);
  ok(desligar && desligar.ligado === false, 'desligar (com confirmacao) desliga');
  ok(desligar && desligar.faixa === false, 'e a faixa verde sai');
  ok(excecoes.length === 0, 'sem erro de console na aba Bot (' + JSON.stringify(excecoes.slice(0, 2)) + ')');

  console.log('\n=== 9b) CARTAO DO MODO FORA DO EXPEDIENTE ===');
  const fora = await cdp.eval(`(async function(){
    switchAba('whatsapp');
    waTrocarSubAba('bot');
    await new Promise(function(r){ setTimeout(r, 400); });
    const antes = document.getElementById('wa-content').textContent;
    // Escreve o funil no rascunho e liga os lembretes dele.
    botForaAddPasso('texto');
    botForaMudarPasso(0, 'texto', 'Estamos fora do horario, {nome}. Amanha as {horario}.');
    botForaLembreteLigar(true);
    await new Promise(function(r){ setTimeout(r, 250); });
    const depois = document.getElementById('wa-content').textContent;
    return {
      temCartao: /Modo fora do expediente/i.test(antes),
      temInterruptor: /Ligar o modo fora do expediente/i.test(antes),
      temDesligarSozinho: /desligar sozinho/i.test(antes),
      temFunil: /Funil de fora do expediente/i.test(depois),
      temLembretes: /Lembretes do fora do expediente/i.test(depois),
      temAtalhoAmanha: /amanh/i.test(depois),
      temPrevia: !!document.querySelector('.bot-passo-fora .bot-previa'),
      barraSalvar: !!document.querySelector('.bot-barra-salvar')
    };
  })()`);
  ok(fora && fora.temCartao, 'a aba Bot tem o cartao "Modo fora do expediente"');
  ok(fora && fora.temInterruptor, 'com o interruptor para ligar');
  ok(fora && fora.temDesligarSozinho, 'e a opcao de desligar sozinho num horario');
  ok(fora && fora.temFunil && fora.temLembretes, 'o funil e os lembretes proprios aparecem');
  ok(fora && fora.temAtalhoAmanha, 'com o atalho de amanha na data');
  ok(fora && fora.temPrevia, 'e a previa do funil');
  ok(fora && fora.barraSalvar, 'mexer no funil pede "Salvar alteracoes" (nao vale sozinho)');

  console.log('\n=== 9c) ABA "JANELA ABERTA" ===');
  excecoes.length = 0;
  const jan = await cdp.eval(`(async function(){
    if (typeof _janelaRender !== 'function') return { erro: 'a aba nao carregou' };
    // Monta a aba com uma lista de teste (sem depender do banco do servidor).
    const cont = document.getElementById('wa-content');
    _waSubAba = 'janela';
    cont.dataset.janelaCarregada = '1';
    await _janelaRender(cont);
    // A lista do servidor de teste vem vazia; o teste injeta a sua pela
    // funcao de pintura, que e a MESMA que a producao usa.
    const box = document.getElementById('wa-jan-lista');
    return {
      temTela: !!document.querySelector('.wa-jan-tela'),
      temFiltros: Array.from(document.querySelectorAll('.wa-jan-barra .wa-fchip')).map(function(b){ return b.textContent.trim(); }),
      temBusca: !!document.getElementById('wa-jan-busca'),
      temAcoes: !!document.getElementById('wa-jan-acoes'),
      temLista: !!box,
      vazioExplicado: /janela aberta/i.test(box ? box.textContent : '')
    };
  })()`);
  ok(jan && jan.temTela === true, 'a aba "Janela aberta" desenha');
  ok(jan && (jan.temFiltros || []).length === 6, 'com os 6 filtros: ' + JSON.stringify((jan || {}).temFiltros));
  ok(jan && (jan.temFiltros || []).indexOf('Fecha em menos de 2h') >= 0, 'incluindo "fecha em menos de 2h"');
  ok(jan && jan.temBusca === true, 'tem busca por nome ou numero');
  ok(jan && jan.temLista === true, 'e a lista');
  ok(jan && jan.vazioExplicado === true, 'com explicacao quando esta vazia');

  const sel = await cdp.eval(`(async function(){
    // Duas pessoas dentro da janela, uma fechando logo.
    const box = document.getElementById('wa-jan-lista');
    const antes = [
      { conversation_id: 301, contact_id: 31, account_id: 1, contact_name: 'Ana Ribeiro', contact_phone: '5511900000301',
        ultima_recebida_texto: 'tenho interesse', ultima_recebida_tipo: 'text', horas_restantes: 1.5,
        respondi_depois: 0, aguardando_atendente: 1, bot_em: '2026-10-22 08:00:00', bot_pausado: 0, bot_saiu: 0,
        fora_exp: 'per-1', lembretes_agendados: 2 },
      { conversation_id: 302, contact_id: 32, account_id: 1, contact_name: 'Bruno Carvalho', contact_phone: '5511900000302',
        ultima_recebida_texto: 'bom dia', ultima_recebida_tipo: 'text', horas_restantes: 20,
        respondi_depois: 1, aguardando_atendente: 0, lembretes_agendados: 0 }
    ];
    // Entra pelo caminho de verdade: a funcao de pintura incremental.
    window.__janTesteLista = antes;
    const pintar = function (lista) {
      // Usa a API publica da aba: filtra/seleciona pelos handlers reais.
      _janelaTestePintar(lista);
    };
    if (typeof _janelaTestePintar !== 'function') return { erro: 'sem gancho de teste' };
    pintar(antes);
    const linhas = function () { return Array.from(document.querySelectorAll('.wa-jan-item')).map(function(e){ return e.getAttribute('data-conv'); }); };
    const depoisDeDesenhar = linhas();
    // Marca uma e confere o botao de enviar.
    janelaMarcar(301, true);
    const botao = (document.querySelector('#wa-jan-acoes .mod-btn-primary') || {}).textContent || '';
    // Selecionar todos (respeita o que esta na tela).
    janelaSelecionarTodos(true);
    const botaoTodos = (document.querySelector('#wa-jan-acoes .mod-btn-primary') || {}).textContent || '';
    // Agora a Ana sai da janela: a lista encolhe sem piscar, e a selecao dela
    // sai junto (nao da para mandar para quem nao pode receber).
    const marcaDaLinha = document.querySelector('.wa-jan-item[data-conv="302"]');
    if (marcaDaLinha) marcaDaLinha._marcaDoTeste = 'mesmo-no';
    pintar([antes[1]]);
    const depoisDeSair = linhas();
    const botaoDepois = (document.querySelector('#wa-jan-acoes .mod-btn-primary') || {}).textContent || '';
    const mesmoNo = !!(document.querySelector('.wa-jan-item[data-conv="302"]') &&
                       document.querySelector('.wa-jan-item[data-conv="302"]')._marcaDoTeste === 'mesmo-no');
    return {
      desenhou: depoisDeDesenhar.join(','),
      tagAguardando: /aguardando atendente/i.test((document.querySelector('.wa-jan-item[data-conv="302"]') || document.body).parentNode.textContent || ''),
      umSelecionado: /\(1\)/.test(botao),
      todosSelecionados: /\(2\)/.test(botaoTodos),
      depoisDeSair: depoisDeSair.join(','),
      selecaoLimpou: /\(1\)/.test(botaoDepois),
      mesmoNo: mesmoNo
    };
  })()`);
  if (sel && sel.erro) {
    ok(false, 'a prova da selecao nao rodou: ' + sel.erro);
  } else {
    ok(sel && sel.desenhou === '301,302', 'a lista desenha na ordem de quem fecha primeiro (' + (sel || {}).desenhou + ')');
    ok(sel && sel.umSelecionado === true, 'marcar uma pessoa atualiza o botao "Enviar para selecionados (1)"');
    ok(sel && sel.todosSelecionados === true, '"selecionar todos" marca o que esta na tela (2)');
    ok(sel && sel.depoisDeSair === '302', 'quem sai da janela DESAPARECE da lista (' + (sel || {}).depoisDeSair + ')');
    ok(sel && sel.mesmoNo === true, 'e quem fica nao foi redesenhado (nada de piscar)');
    ok(sel && sel.selecaoLimpou === true, 'a selecao de quem saiu tambem sai (sobrou 1)');
  }

  const painel = await cdp.eval(`(function(){
    janelaAbrirEnvio();
    const p = document.querySelector('.wa-jan-painel');
    const txt = p ? p.textContent : '';
    return {
      abriu: !!p,
      temPronta: !!document.getElementById('wa-jan-pronta'),
      temTexto: !!document.getElementById('wa-jan-texto'),
      temVariaveis: /\{nome\}/.test(txt) && /\{horario\}/.test(txt),
      temAnexo: /Anexo/i.test(txt),
      temPrevia: !!document.querySelector('.wa-jan-previa-envio'),
      temBotao: /Enviar para/i.test(txt)
    };
  })()`);
  ok(painel && painel.abriu === true, 'o painel de envio abre');
  ok(painel && painel.temPronta && painel.temTexto, 'com escolha de mensagem pronta e texto livre');
  ok(painel && painel.temVariaveis === true, 'as variaveis estao listadas');
  ok(painel && painel.temAnexo === true, 'tem anexo opcional');
  ok(painel && painel.temPrevia === true, 'e a previa de como vai chegar');
  ok(excecoes.length === 0, 'sem erro de console na aba Janela aberta (' + JSON.stringify(excecoes.slice(0, 2)) + ')');

  console.log('\n=== 10) ROBOZINHO E SININHO NA LISTA DE CONVERSAS ===');
  const sinais = await cdp.eval(`(function(){
    const box = document.createElement('div');
    box.id = 'wa-conv-list';
    box.style.cssText = 'position:absolute;left:-9999px;width:330px;';
    document.body.appendChild(box);
    const conversas = [
      { id: 91, contact_name: 'Com bot ativo', contact_phone: '5511900000091', status: 'open', unread_count: 0,
        last_message_text: 'oi', last_message_at: '2026-10-21T10:00:00Z',
        bot_em: '2026-10-21 10:00:00', bot_pausado: 0, bot_saiu: 0, lembretes_agendados: 2 },
      { id: 92, contact_name: 'Bot pausado', contact_phone: '5511900000092', status: 'open', unread_count: 0,
        last_message_text: 'oi', last_message_at: '2026-10-21T09:00:00Z',
        bot_em: '2026-10-21 09:00:00', bot_pausado: 1, bot_saiu: 0, lembretes_agendados: 0,
        fora_exp: 'per-1' },
      { id: 93, contact_name: 'Sem bot', contact_phone: '5511900000093', status: 'open', unread_count: 0,
        last_message_text: 'oi', last_message_at: '2026-10-21T08:00:00Z' }
    ];
    _waPintarLista(box, conversas);
    const it = function (id) { return box.querySelector('.wa-conv-item[data-conv="' + id + '"]'); };
    return {
      ativo: !!it(91).querySelector('.wa-sinal-bot.ativo'),
      sininho: !!it(91).querySelector('.wa-sinal-lembrete'),
      dica: (it(91).querySelector('.wa-sinal-bot') || {}).title || '',
      pausado: !!it(92).querySelector('.wa-sinal-bot.pausado'),
      semSininho: !it(92).querySelector('.wa-sinal-lembrete'),
      semBot: !it(93).querySelector('.wa-sinal-bot'),
      lua: !!it(92).querySelector('.wa-sinal-lua'),
      semLua: !it(93).querySelector('.wa-sinal-lua'),
      limpar: (function(){ box.remove(); return true; })()
    };
  })()`);
  ok(sinais && sinais.ativo === true, 'quem o bot atendeu e esta ativo mostra o robozinho colorido');
  ok(sinais && sinais.pausado === true, 'com o bot pausado, o robozinho fica apagado');
  ok(sinais && sinais.semBot === true, 'quem o bot nunca atendeu nao mostra robozinho');
  ok(sinais && sinais.sininho === true, 'com lembrete agendado, aparece o sininho');
  ok(sinais && sinais.semSininho === true, 'e sem lembrete, nao aparece');
  ok(sinais && /Atendido pelo bot/.test(sinais.dica || ''), 'a dica do mouse diz quando foi: "' + ((sinais || {}).dica || '') + '"');

  const filtro = await cdp.eval(`(function(){
    // A caixa dos filtros so existe quando o Inbox esta desenhado; aqui o
    // teste cria uma, porque o que importa e QUAIS chips a funcao gera.
    if (!document.getElementById('wa-conv-filtros')) {
      const d = document.createElement('div');
      d.id = 'wa-conv-filtros';
      d.style.cssText = 'position:absolute;left:-9999px;';
      document.body.appendChild(d);
    }
    _waRenderFiltrosConv();
    const box = document.getElementById('wa-conv-filtros');
    const nomes = box ? Array.from(box.querySelectorAll('.wa-fchip')).map(function(b){ return b.textContent.trim(); }) : [];
    return { nomes: nomes, temBot: nomes.indexOf('Bot') >= 0 };
  })()`);
  ok(filtro && filtro.temBot === true, 'o filtro "Bot" esta na lista: ' + JSON.stringify((filtro || {}).nomes));
  ok(sinais && sinais.lua === true, 'quem recebeu o funil de fora do expediente mostra a lua');
  ok(sinais && sinais.semLua === true, 'e quem nao recebeu nao mostra');
  ok(filtro && (filtro.nomes || []).indexOf('Fora do expediente') >= 0,
    'e o filtro "Fora do expediente" tambem esta la');

  console.log('\n' + (falhas === 0 ? 'MENSAGENS PRONTAS (tela): TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
