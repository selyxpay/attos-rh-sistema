// Roda pelo executor da suite:  node testes/rodar.cjs estavel
// Precisa de servidor E de navegador.
//
// A TELA NAO PODE PISCAR NEM SUMIR. Tres coisas que o atendente sentia na pele:
//   1) o servidor engasga, o proxy devolve uma pagina de "Bad Gateway" e a
//      lista de conversas era substituida por
//      'Unexpected token "B", "Bad Gateway" is not valid JSON';
//   2) qualquer atualizacao redesenhava a conversa e apagava o texto que
//      estava sendo digitado, com cursor e foco;
//   3) mensagem nova puxava a tela para baixo mesmo quem tinha subido para
//      ler o historico.
//
// O teste finge as falhas trocando o `fetch` da pagina. E de proposito: da
// para reproduzir 502, HTML no lugar de JSON e queda de rede sem precisar
// derrubar o servidor de verdade.
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

// Monta o Inbox com conversas e uma conversa aberta, com o MESMO html da tela.
const MONTAR_JS = `(function(){
  const alvo = document.getElementById('wa-content');
  if (!alvo) return { erro: 'sem wa-content' };
  _waSubAba = 'inbox';
  // ALTURA EXPLICITA: o encaixe por flex da tela real mede o espaco que sobrou,
  // e numa maquina ocupada ele pode nao ter assentado na hora da medida. Sem
  // altura, a caixa de mensagens nao rola e nem da foco — e o teste mediria o
  // nada. Fixar aqui deixa a prova de rolagem e de digitacao deterministica.
  alvo.innerHTML = '<div class="wa-inbox" id="wa-inbox" style="height:620px;">' +
      '<div class="wa-col-list"><div class="wa-conv-list" id="wa-conv-list"></div></div>' +
      '<div class="wa-col-chat" id="wa-col-chat"></div>' +
      '<div class="wa-col-info" id="wa-col-info"></div>' +
    '</div>';
  _waConversas = [
    { id: 1, contact_name: 'Maria Silva', contact_phone: '5511900000001', status: 'open', unread_count: 0, last_message_text: 'bom dia', last_message_type: 'text', last_message_at: '2026-10-21T10:00:00Z' },
    { id: 2, contact_name: 'Joao Souza',  contact_phone: '5511900000002', status: 'open', unread_count: 2, last_message_text: 'tudo bem?', last_message_type: 'text', last_message_at: '2026-10-21T09:00:00Z' },
    { id: 3, contact_name: 'Ana Lima',    contact_phone: '5511900000003', status: 'open', unread_count: 0, last_message_text: 'obrigada', last_message_type: 'text', last_message_at: '2026-10-21T08:00:00Z' }
  ];
  _waPintarLista(document.getElementById('wa-conv-list'), _waConversas);
  return { itens: document.querySelectorAll('.wa-conv-item').length };
})()`;

// Conversa com mensagens suficientes para haver rolagem.
const ABRIR_CHAT = `(function(){
  const msgs = [];
  for (var i = 1; i <= 40; i++) {
    msgs.push({ id: i, direction: (i % 2 ? 'incoming' : 'outgoing'), type: 'text',
                content: 'mensagem numero ' + i + ' com texto suficiente para ocupar altura na tela',
                status: 'read', created_at: '2026-10-21T10:00:00Z' });
  }
  _waConvAberta = 1;
  _waConvAbertaObj = { id: 1, contact_name: 'Maria Silva', contact_phone: '5511900000001', status: 'open' };
  _waRenderChat(_waConvAbertaObj, msgs);
  const box = document.getElementById('wa-msgs');
  return { bolhas: document.querySelectorAll('.wa-msg').length, rolagem: box ? box.scrollHeight > box.clientHeight : false };
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
  await cdp.eval(`(function(){ switchAba('whatsapp'); return true; })()`);
  // Espera a aba ESTAR ATIVA E VISIVEL: com a aba oculta, toda medida de
  // altura e rolagem sai zero e o teste mediria o nada (regra 18).
  await esperarPor(cdp,
    `(function(){
       var aba = document.getElementById('aba-whatsapp');
       var cont = document.getElementById('wa-content');
       return !!aba && aba.classList.contains('active') && !!cont && cont.offsetParent !== null;
     })()`,
    90000, 'a aba do WhatsApp ficar ativa e visivel');

  console.log('=== 0) PECAS NO LUGAR ===');
  ok(await cdp.eval(`typeof _waPintarLista === 'function'`), 'a lista tem desenho incremental');
  ok(await cdp.eval(`typeof _waBuscarNovasDaConversa === 'function'`), 'a conversa tem busca incremental');
  ok(await cdp.eval(`typeof _waGuardarComposer === 'function'`), 'o composer tem guarda do que foi digitado');
  const mont = await cdp.eval(MONTAR_JS);
  ok(mont && mont.itens === 3, 'inbox de teste montado com 3 conversas (' + JSON.stringify(mont) + ')');

  console.log('\n=== 1) 502 DO SERVIDOR NAO APAGA A TELA ===');
  excecoes.length = 0;
  const r502 = await cdp.eval(`(async function(){
    const original = window.fetch;
    // O proxy do Coolify responde HTML, nao JSON. Era isso que estourava no
    // JSON.parse e virava mensagem de erro no lugar da lista.
    window.fetch = function(){
      return Promise.resolve(new Response('<html><body>Bad Gateway</body></html>',
        { status: 502, headers: { 'Content-Type': 'text/html' } }));
    };
    try {
      await _waCarregarConversas();
    } finally {
      window.fetch = original;
    }
    const box = document.getElementById('wa-conv-list');
    const faixa = document.getElementById('wa-faixa-rede');
    return {
      itens: box ? box.querySelectorAll('.wa-conv-item').length : -1,
      temErroNaTela: /Bad Gateway|not valid JSON|Erro ao carregar/i.test(box ? box.textContent : ''),
      faixa: faixa ? faixa.textContent.trim() : '',
      conversasNaMemoria: (_waConversas || []).length
    };
  })()`);
  ok(r502 && r502.itens === 3, 'as 3 conversas CONTINUAM na tela depois do 502 (' + (r502 || {}).itens + ')');
  ok(r502 && r502.temErroNaTela === false, 'e nenhuma mensagem de erro tomou o lugar da lista');
  ok(r502 && /Reconectando/i.test(r502.faixa || ''), 'aparece a faixa discreta: "' + ((r502 || {}).faixa || '') + '"');
  ok(excecoes.length === 0, 'e nada estourou no console (' + JSON.stringify(excecoes.slice(0, 2)) + ')');

  // Resposta que nem e JSON (HTML de login, pagina do proxy) com status 200.
  const rHtml = await cdp.eval(`(async function(){
    const original = window.fetch;
    window.fetch = function(){
      return Promise.resolve(new Response('<html>pagina de login</html>',
        { status: 200, headers: { 'Content-Type': 'text/html' } }));
    };
    let resp;
    try { resp = await waGet('/conversations'); } finally { window.fetch = original; }
    const box = document.getElementById('wa-conv-list');
    return { ok: resp.ok, rede: !!resp._rede, itens: box ? box.querySelectorAll('.wa-conv-item').length : -1 };
  })()`);
  ok(rHtml && rHtml.ok === false && rHtml.rede === true, 'resposta em HTML e tratada como problema de rede, sem estourar');
  ok(rHtml && rHtml.itens === 3, 'e a lista segue intacta');

  const rQueda = await cdp.eval(`(async function(){
    const original = window.fetch;
    window.fetch = function(){ return Promise.reject(new TypeError('Failed to fetch')); };
    let resp;
    try { resp = await waGet('/conversations'); } finally { window.fetch = original; }
    const box = document.getElementById('wa-conv-list');
    return { rede: !!resp._rede, itens: box ? box.querySelectorAll('.wa-conv-item').length : -1 };
  })()`);
  ok(rQueda && rQueda.rede === true && rQueda.itens === 3, 'queda de rede tambem nao apaga nada');

  // E quando volta, a faixa sai.
  const rVolta = await cdp.eval(`(async function(){
    await _waCarregarConversas();
    return { faixa: !!document.getElementById('wa-faixa-rede'), itens: document.querySelectorAll('.wa-conv-item').length };
  })()`);
  ok(rVolta && rVolta.faixa === false, 'quando o servidor volta, a faixa desaparece sozinha');

  console.log('\n=== 2) ATUALIZAR NAO APAGA O QUE ESTOU DIGITANDO ===');
  excecoes.length = 0;
  const chat = await cdp.eval(ABRIR_CHAT);
  ok(chat && chat.bolhas >= 40, 'conversa de teste aberta com 40 mensagens (' + JSON.stringify(chat) + ')');
  // So mede depois que a conversa REALMENTE tem rolagem e a caixa de escrever
  // existe na tela (regra 18: condicao, nao tempo).
  const prontoParaMedir = await esperarPor(cdp,
    `(function(){
       var box = document.getElementById('wa-msgs');
       var caixa = document.getElementById('wa-msg-input');
       return !!box && !!caixa && box.scrollHeight > box.clientHeight && box.clientHeight > 50;
     })()`,
    20000, 'a conversa ter rolagem e caixa de escrever');
  ok(prontoParaMedir === true, 'a conversa tem rolagem de verdade (e o que o teste precisa medir)');
  const digit = await cdp.eval(`(function(){
    const c = document.getElementById('wa-msg-input');
    if (!c) return { erro: 'sem caixa de escrever' };
    c.value = 'Bom dia! Estou escrevendo uma resposta long';
    c.focus();
    c.setSelectionRange(10, 10);                 // cursor no meio da frase
    return { texto: c.value, cursor: c.selectionStart, focado: document.activeElement === c };
  })()`);
  ok(digit && digit.focado === true, 'texto digitado, cursor no meio e foco na caixa');

  const depoisDeRedesenhar = await cdp.eval(`(function(){
    // Pior caso: o chat e redesenhado inteiro (trocar para nota interna,
    // reabrir a conversa). O texto tem que voltar.
    _waRenderChat(_waConvAbertaObj, _waMsgsCache);
    const c = document.getElementById('wa-msg-input');
    return { texto: c ? c.value : '', cursor: c ? c.selectionStart : -1, focado: document.activeElement === c };
  })()`);
  ok(depoisDeRedesenhar && /long$/.test(depoisDeRedesenhar.texto || ''),
    'o texto sobrevive ao redesenho: "' + String((depoisDeRedesenhar || {}).texto || '').slice(-28) + '"');
  ok(depoisDeRedesenhar && depoisDeRedesenhar.cursor === 10, 'e o cursor volta para onde estava (' + (depoisDeRedesenhar || {}).cursor + ')');
  ok(depoisDeRedesenhar && depoisDeRedesenhar.focado === true, 'com o foco de volta na caixa');

  const depoisDeMsgNova = await cdp.eval(`(function(){
    const c = document.getElementById('wa-msg-input');
    c.value = 'estou no meio de uma frase';
    c.focus();
    // Chega mensagem nova pelo tempo real.
    const m = { id: 999, direction: 'incoming', type: 'text', content: 'mensagem que chegou agora', created_at: new Date().toISOString() };
    _waMsgsCache.push(m);
    _waAppendBolha(m);
    const c2 = document.getElementById('wa-msg-input');
    return { texto: c2 ? c2.value : '', focado: document.activeElement === c2, bolhas: document.querySelectorAll('.wa-msg').length };
  })()`);
  ok(depoisDeMsgNova && depoisDeMsgNova.texto === 'estou no meio de uma frase',
    'mensagem nova NAO mexe no que esta sendo digitado');
  ok(depoisDeMsgNova && depoisDeMsgNova.focado === true, 'nem no foco');
  ok(excecoes.length === 0, 'sem erro de console (' + JSON.stringify(excecoes.slice(0, 2)) + ')');

  console.log('\n=== 3) ROLAGEM: SUBI PARA LER, A TELA NAO ME PUXA ===');
  const rolagem = await cdp.eval(`(async function(){
    const box = document.getElementById('wa-msgs');
    if (!box) return { erro: 'sem a caixa de mensagens' };
    box.scrollTop = 0;                               // subiu para ler o inicio
    box.dispatchEvent(new Event('scroll'));
    await new Promise(function(r){ setTimeout(r, 80); });
    const antes = box.scrollTop;
    const m = { id: 1000, direction: 'incoming', type: 'text', content: 'chegou enquanto eu lia', created_at: new Date().toISOString() };
    _waMsgsCache.push(m);
    _waAppendBolha(m);
    const pino = document.getElementById('wa-pino-novas');
    return {
      antes: antes, depois: box.scrollTop,
      pino: pino ? pino.textContent.trim() : '',
      presoNoFim: _waPresoNoFim
    };
  })()`);
  ok(rolagem && rolagem.depois === rolagem.antes,
    'a rolagem NAO se move quando chega mensagem e eu estou lendo acima (' + (rolagem || {}).antes + ' -> ' + (rolagem || {}).depois + ')');
  ok(rolagem && /nova/i.test(rolagem.pino || ''), 'e aparece o aviso de mensagem nova: "' + ((rolagem || {}).pino || '') + '"');
  ok(rolagem && rolagem.presoNoFim === false, 'o sistema sabe que eu nao estou no fim');

  const clicouPino = await cdp.eval(`(function(){
    const p = document.getElementById('wa-pino-novas');
    if (!p) return { erro: 'sem pino' };
    p.click();
    const box = document.getElementById('wa-msgs');
    return {
      noFim: (box.scrollHeight - box.scrollTop - box.clientHeight) < 80,
      pinoSaiu: !document.getElementById('wa-pino-novas')
    };
  })()`);
  ok(clicouPino && clicouPino.noFim === true, 'clicando no aviso, a conversa vai para o fim');
  ok(clicouPino && clicouPino.pinoSaiu === true, 'e o aviso desaparece');

  const estandoNoFim = await cdp.eval(`(function(){
    const box = document.getElementById('wa-msgs');
    box.scrollTop = box.scrollHeight;
    box.dispatchEvent(new Event('scroll'));
    const m = { id: 1001, direction: 'incoming', type: 'text', content: 'segunda mensagem nova', created_at: new Date().toISOString() };
    _waMsgsCache.push(m);
    _waAppendBolha(m);
    return {
      noFim: (box.scrollHeight - box.scrollTop - box.clientHeight) < 80,
      pino: !!document.getElementById('wa-pino-novas')
    };
  })()`);
  ok(estandoNoFim && estandoNoFim.noFim === true, 'estando no fim, a mensagem nova aparece e a tela acompanha');
  ok(estandoNoFim && estandoNoFim.pino === false, 'e nem mostra aviso (nao precisa)');

  console.log('\n=== 4) LISTA: A CONVERSA COM MENSAGEM NOVA SOBE SEM PISCAR ===');
  // Semeia de novo: a secao 1 chamou a carga de VERDADE, e o servidor de teste
  // nao tem conversa nenhuma — _waConversas voltou vazia.
  await cdp.eval(MONTAR_JS);
  const lista = await cdp.eval(`(function(){
    const box = document.getElementById('wa-conv-list');
    const antes = Array.from(box.querySelectorAll('.wa-conv-item')).map(function(e){ return e.getAttribute('data-conv'); });
    const primeiroEl = box.querySelector('.wa-conv-item[data-conv="3"]');
    // marca o elemento para saber se ele foi REAPROVEITADO ou recriado
    if (primeiroEl) primeiroEl._marcaDoTeste = 'eu-sou-o-mesmo';
    // Ana Lima (3) recebeu mensagem e vai para o topo
    const nova = JSON.parse(JSON.stringify(_waConversas));
    const ana = nova.find(function(c){ return c.id === 3; });
    ana.last_message_text = 'mensagem nova da Ana';
    ana.last_message_at = new Date().toISOString();
    ana.unread_count = 1;
    const reordenada = [ana].concat(nova.filter(function(c){ return c.id !== 3; }));
    _waConversas = reordenada;
    _waPintarLista(box, reordenada);
    const depois = Array.from(box.querySelectorAll('.wa-conv-item')).map(function(e){ return e.getAttribute('data-conv'); });
    const el3 = box.querySelector('.wa-conv-item[data-conv="3"]');
    return {
      antes: antes.join(','), depois: depois.join(','),
      mesmoElemento: !!(el3 && el3._marcaDoTeste === 'eu-sou-o-mesmo'),
      texto: el3 ? el3.textContent.indexOf('mensagem nova da Ana') >= 0 : false,
      total: depois.length
    };
  })()`);
  if (!lista || lista.__erro || lista.depois === undefined) {
    ok(false, 'o teste da lista nao rodou: ' + JSON.stringify(lista));
  }
  ok(lista && String(lista.depois || '').indexOf('3') === 0, 'a conversa com mensagem nova foi para o topo (' + (lista || {}).antes + ' -> ' + (lista || {}).depois + ')');
  ok(lista && lista.total === 3, 'sem duplicar nem perder nenhuma (' + (lista || {}).total + ')');
  ok(lista && lista.texto === true, 'com a previa atualizada');

  const selecao = await cdp.eval(`(function(){
    const box = document.getElementById('wa-conv-list');
    _waConvAberta = 2;
    _waConversas = JSON.parse(JSON.stringify(_waConversas));
    _waPintarLista(box, _waConversas);
    const ativo = box.querySelector('.wa-conv-item.active');
    // uma atualizacao sem mudanca nenhuma nao pode mexer no destaque
    _waPintarLista(box, _waConversas);
    const ativoDepois = box.querySelector('.wa-conv-item.active');
    return {
      ativo: ativo ? ativo.getAttribute('data-conv') : '',
      ativoDepois: ativoDepois ? ativoDepois.getAttribute('data-conv') : '',
      mesmoNo: ativo === ativoDepois
    };
  })()`);
  ok(selecao && selecao.ativoDepois === '2', 'a conversa selecionada continua destacada depois da atualizacao');
  ok(selecao && selecao.mesmoNo === true, 'e o item nem foi redesenhado (nada de piscar)');

  console.log('\n=== 5) SEM TELA DE "CARREGANDO" DEPOIS DA PRIMEIRA CARGA ===');
  // A secao 4 mexeu em qual conversa esta aberta; volta para a 1, que e a que
  // esta desenhada na tela.
  await cdp.eval(`(function(){ _waConvAberta = 1; return true; })()`);
  const semSpinner = await cdp.eval(`(async function(){
    const chat = document.getElementById('wa-col-chat');
    // Reabrir a MESMA conversa (o que acontece a cada atualizacao) nao pode
    // trocar a conversa por um relogio de carregando.
    const original = window.fetch;
    let viuSpinner = false;
    window.fetch = function(){
      viuSpinner = /wa-loading/.test(document.getElementById('wa-col-chat').innerHTML);
      return original.apply(window, arguments);
    };
    try { await waAbrirConversa(1); } finally { window.fetch = original; }
    return { viuSpinner: viuSpinner };
  })()`);
  ok(semSpinner && semSpinner.viuSpinner === false, 'reabrir a mesma conversa NAO mostra "carregando"');

  // ────────────────────────────────────────────────────────────────────────
  // 6) UMA MENSAGEM, UMA BOLHA
  // A tela desenha a mensagem na hora de mandar e o servidor avisa a MESMA
  // mensagem pelo tempo real. Sem a amarra do cliente_id, apareciam duas.
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n=== 6) A MENSAGEM QUE EU MANDO APARECE UMA VEZ SO ===');
  excecoes.length = 0;
  const dup = await cdp.eval(`(async function(){
    // Conversa de teste limpa.
    const msgs = [{ id: 1, direction: 'incoming', type: 'text', content: 'oi, tudo bem?',
                    status: 'read', created_at: '2026-10-21T10:00:00Z' }];
    _waConvAberta = 77;
    _waConvAbertaObj = { id: 77, contact_name: 'Teste Duplicada', contact_phone: '5511900000077', status: 'open' };
    _waRenderChat(_waConvAbertaObj, msgs);

    // O servidor responde ok e devolve o cliente_id, como em producao.
    const original = window.fetch;
    let corpoEnviado = null;
    window.fetch = function (url, opcoes) {
      if (String(url).indexOf('/messages/send') >= 0) {
        corpoEnviado = JSON.parse((opcoes && opcoes.body) || '{}');
        return Promise.resolve(new Response(JSON.stringify({
          ok: true, message_id: 501, wamid: 'wamid.TESTE501',
          cliente_id: corpoEnviado.cliente_id
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return original.apply(window, arguments);
    };
    try {
      const caixa = document.getElementById('wa-msg-input');
      caixa.value = 'mensagem que nao pode duplicar';
      await waEnviarMensagem();
      await new Promise(function (r) { setTimeout(r, 200); });
    } finally {
      window.fetch = original;
    }

    const contar = function () {
      return Array.from(document.querySelectorAll('#wa-msgs .wa-msg'))
        .filter(function (e) { return /nao pode duplicar/.test(e.textContent); }).length;
    };
    const depoisDoEnvio = contar();

    // Agora o TEMPO REAL avisa a mesma mensagem (e o que acontece de verdade).
    const aviso = {
      type: 'new_message', conversation_id: 77,
      message: {
        id: 501, cliente_id: corpoEnviado ? corpoEnviado.cliente_id : '', wamid: 'wamid.TESTE501',
        direction: 'outgoing', type: 'text', content: 'mensagem que nao pode duplicar',
        status: 'sent', sender_name: 'Administrador', origem: 'atendente',
        created_at: new Date().toISOString()
      }
    };
    _waTratarEvento(aviso);
    await new Promise(function (r) { setTimeout(r, 120); });
    const depoisDoTempoReal = contar();

    // E de novo, como se a Meta repetisse o aviso.
    _waTratarEvento(aviso);
    await new Promise(function (r) { setTimeout(r, 120); });
    const depoisDeRepetir = contar();

    // E a busca incremental trazendo a mesma mensagem.
    const naCache = (_waMsgsCache || []).filter(function (m) { return /nao pode duplicar/.test(m.content || ''); }).length;

    return {
      mandouClienteId: !!(corpoEnviado && corpoEnviado.cliente_id),
      depoisDoEnvio: depoisDoEnvio,
      depoisDoTempoReal: depoisDoTempoReal,
      depoisDeRepetir: depoisDeRepetir,
      naCache: naCache,
      temIdReal: (_waMsgsCache || []).some(function (m) { return Number(m.id) === 501; })
    };
  })()`);
  ok(dup && dup.mandouClienteId === true, 'o envio manda um id temporario (cliente_id) para o servidor');
  ok(dup && dup.depoisDoEnvio === 1, 'a bolha aparece na hora, uma vez (' + (dup || {}).depoisDoEnvio + ')');
  ok(dup && dup.depoisDoTempoReal === 1, 'o aviso do tempo real NAO cria uma segunda bolha (' + (dup || {}).depoisDoTempoReal + ')');
  ok(dup && dup.depoisDeRepetir === 1, 'nem o aviso repetido (' + (dup || {}).depoisDeRepetir + ')');
  ok(dup && dup.naCache === 1, 'e na memoria da conversa ela tambem esta uma vez (' + (dup || {}).naCache + ')');
  ok(dup && dup.temIdReal === true, 'a bolha otimista foi SUBSTITUIDA pela real (ficou com o id do banco)');
  ok(excecoes.length === 0, 'sem erro de console (' + JSON.stringify(excecoes.slice(0, 2)) + ')');

  // Mensagem do BOT e de LEMBRETE: chegam so pelo tempo real, e tambem nao
  // podem repetir quando o aviso vem duas vezes.
  const autos = await cdp.eval(`(async function(){
    const mandar = function (m) {
      _waTratarEvento({ type: 'new_message', conversation_id: 77, message: m });
    };
    const doBot = { id: 601, direction: 'outgoing', type: 'text', content: 'mensagem do bot aqui',
                    status: 'sent', sender_name: 'bot', sent_by_bot: 1, origem: 'bot',
                    created_at: new Date().toISOString() };
    const doLembrete = { id: 602, direction: 'outgoing', type: 'text', content: 'lembrete automatico aqui',
                         status: 'sent', sender_name: 'Lembrete automático', origem: 'lembrete',
                         created_at: new Date().toISOString() };
    const comAnexo = { id: 603, direction: 'outgoing', type: 'document', content: 'segue a tabela',
                       media_url: '/api/whatsapp/respostas/midia/pronta_x.pdf', status: 'sent',
                       sender_name: 'Administrador', origem: 'atendente', created_at: new Date().toISOString() };
    mandar(doBot); mandar(doBot);
    mandar(doLembrete); mandar(doLembrete);
    mandar(comAnexo); mandar(comAnexo);
    await new Promise(function (r) { setTimeout(r, 150); });
    const conta = function (txt) {
      return Array.from(document.querySelectorAll('#wa-msgs .wa-msg'))
        .filter(function (e) { return e.textContent.indexOf(txt) >= 0; }).length;
    };
    return {
      bot: conta('mensagem do bot aqui'),
      lembrete: conta('lembrete automatico aqui'),
      anexo: conta('segue a tabela'),
      rotuloBot: /Bot/.test((document.querySelector('[data-msg="601"]') || {}).textContent || ''),
      rotuloLembrete: /Lembrete autom/.test((document.querySelector('[data-msg="602"]') || {}).textContent || '')
    };
  })()`);
  ok(autos && autos.bot === 1, 'mensagem do BOT aparece uma vez, mesmo com aviso repetido (' + (autos || {}).bot + ')');
  ok(autos && autos.lembrete === 1, 'mensagem de LEMBRETE tambem (' + (autos || {}).lembrete + ')');
  ok(autos && autos.anexo === 1, 'e a mensagem pronta COM ANEXO tambem (' + (autos || {}).anexo + ')');
  ok(autos && autos.rotuloBot === true, 'com o rotulo "Bot" no balao');
  ok(autos && autos.rotuloLembrete === true, 'e "Lembrete automatico" no outro');

  console.log('\n' + (falhas === 0 ? 'TELA ESTAVEL: TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
