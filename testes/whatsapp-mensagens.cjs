// Roda pelo executor da suite:  node testes/rodar.cjs wa-msgs
// Precisa de servidor E de navegador.
//
// Cobre os defeitos relatados na tela do WhatsApp:
//   - mensagem que nao e texto virava BALAO VAZIO so com a hora
//   - a lista mostrava "—" para essas mensagens
//   - emoji no nome virava "?" no avatar
//   - etiqueta "Aberta" repetida em toda conversa
//   - avatar com uma letra so
//   - icone da lupa por cima do texto do campo de busca
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

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 950, deviceScaleFactor: 1, mobile: false });
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
  ok(await cdp.eval(`typeof _waBolha === 'function'`), 'o modulo do WhatsApp carregou');

  // ---------- 1) nenhum balao vazio, para nenhum tipo ----------
  console.log('\n=== 1) TODO TIPO DE MENSAGEM APARECE (nenhum balao vazio) ===');
  const tipos = await cdp.eval(`(function(){
    const casos = [
      { nome: 'texto',                  m: { type:'text', content:'Olá, tudo bem?', created_at:'2026-10-21T10:00:00Z', direction:'incoming' } },
      { nome: 'audio sem midia',        m: { type:'audio', content:'', media_id:'mid1', created_at:'2026-10-21T10:01:00Z', direction:'incoming' } },
      { nome: 'audio com duracao',      m: { type:'audio', content:'', media_duration:12, created_at:'2026-10-21T10:01:00Z', direction:'incoming' } },
      { nome: 'figurinha sem midia',    m: { type:'sticker', content:'', created_at:'2026-10-21T10:02:00Z', direction:'incoming' } },
      { nome: 'figurinha com midia',    m: { type:'sticker', media_url:'/uploads/x.png', created_at:'2026-10-21T10:02:00Z', direction:'incoming' } },
      { nome: 'foto sem legenda',       m: { type:'image', content:'', created_at:'2026-10-21T10:03:00Z', direction:'incoming' } },
      { nome: 'video sem legenda',      m: { type:'video', content:'', created_at:'2026-10-21T10:04:00Z', direction:'incoming' } },
      { nome: 'documento sem nome',     m: { type:'document', content:'', created_at:'2026-10-21T10:05:00Z', direction:'incoming' } },
      { nome: 'localizacao',            m: { type:'location', content:'', created_at:'2026-10-21T10:06:00Z', direction:'incoming' } },
      { nome: 'contato',                m: { type:'contacts', content:'', created_at:'2026-10-21T10:07:00Z', direction:'incoming' } },
      { nome: 'reacao',                 m: { type:'reaction', content:'', created_at:'2026-10-21T10:08:00Z', direction:'incoming' } },
      { nome: 'apagada',                m: { type:'deleted', content:'', created_at:'2026-10-21T10:09:00Z', direction:'incoming' } },
      { nome: 'tipo desconhecido',      m: { type:'alguma_coisa_nova', content:'', created_at:'2026-10-21T10:10:00Z', direction:'incoming' } },
    ];
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;left:-9999px;width:400px;';
    document.body.appendChild(div);
    const saida = casos.map(function(c){
      div.innerHTML = _waBolha(c.m);
      const bolha = div.querySelector('.wa-bolha') || div.querySelector('.wa-msg');
      const hora = div.querySelector('.wa-msg-hora');
      // texto do balao SEM a hora: e isso que precisa nao estar vazio
      let texto = bolha ? bolha.textContent : '';
      if (hora) texto = texto.replace(hora.textContent, '');
      return {
        nome: c.nome,
        texto: texto.trim(),
        temImagem: !!div.querySelector('img'),
        vazio: !texto.trim() && !div.querySelector('img')
      };
    });
    div.remove();
    return saida;
  })()`);
  (tipos || []).forEach(function (t) {
    ok(!t.vazio, t.nome + ' -> ' + (t.temImagem ? '[imagem] ' : '') + JSON.stringify(t.texto));
  });
  const vazios = (tipos || []).filter(t => t.vazio).length;
  ok(vazios === 0, 'nenhum dos ' + (tipos || []).length + ' tipos gerou balao vazio');

  // ---------- 2) previa da lista ----------
  console.log('\n=== 2) A LISTA MOSTRA A PREVIA REAL, NAO "—" ===');
  const previas = await cdp.eval(`(function(){
    const casos = [
      { nome: 'texto',            c: { last_message_text:'Bom dia', last_message_type:'text' } },
      { nome: 'audio',            c: { last_message_text:'', last_message_type:'audio' } },
      { nome: 'figurinha',        c: { last_message_text:'', last_message_type:'sticker' } },
      { nome: 'foto sem legenda', c: { last_message_text:'', last_message_type:'image' } },
      { nome: 'foto com legenda', c: { last_message_text:'Olha isso', last_message_type:'image' } },
      { nome: 'localizacao',      c: { last_message_text:'', last_message_type:'location' } },
      { nome: 'conversa antiga (sem tipo)', c: { last_message_text:'', last_message_type:'' } },
    ];
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;left:-9999px;';
    document.body.appendChild(div);
    const saida = casos.map(function(k){
      div.innerHTML = _waPrevia(k.c);
      return { nome: k.nome, texto: div.textContent.trim(), temIcone: !!div.querySelector('i') };
    });
    div.remove();
    return saida;
  })()`);
  (previas || []).forEach(function (p) {
    const ruim = p.texto === '—' || p.texto === '';
    ok(!ruim, p.nome + ' -> ' + (p.temIcone ? '[icone] ' : '') + JSON.stringify(p.texto));
  });

  // ---------- 3) emoji no nome ----------
  console.log('\n=== 3) EMOJI NO NOME NAO VIRA "?" ===');
  const iniciais = await cdp.eval(`(function(){
    const nomes = ['Maria Silva', 'joão', '😀 Cliente', 'Ana', '🇧🇷 Brasil', '👨‍👩‍👧 Familia', '', 'Zé'];
    return nomes.map(function(n){ return { nome: n, inicial: _waInicial(n) }; });
  })()`);
  (iniciais || []).forEach(function (x) {
    const quebrado = /�/.test(x.inicial) || x.inicial === '?' && x.nome !== '';
    ok(!quebrado, JSON.stringify(x.nome) + ' -> ' + JSON.stringify(x.inicial));
  });
  const comDuas = (iniciais || []).find(x => x.nome === 'Maria Silva');
  ok(comDuas && comDuas.inicial === 'MS', 'nome completo da DUAS iniciais (ficou "' + (comDuas && comDuas.inicial) + '")');
  const comEmoji = (iniciais || []).find(x => x.nome === '😀 Cliente');
  ok(comEmoji && comEmoji.inicial === '😀', 'emoji vira o proprio emoji, inteiro (ficou "' + (comEmoji && comEmoji.inicial) + '")');

  // ---------- 4) etiqueta "Aberta" nao polui mais ----------
  console.log('\n=== 4) ETIQUETA DE ESTADO SO QUANDO DIZ ALGO ===');
  const inds = await cdp.eval(`(function(){
    return {
      aberta:        _waIndicadores({ status:'open' }, '#999'),
      abertaComAtend:_waIndicadores({ status:'open', assigned_to_name:'Ana' }, '#999'),
      fechada:       _waIndicadores({ status:'closed' }, '#999'),
      pendente:      _waIndicadores({ status:'pending' }, '#999')
    };
  })()`);
  ok(inds.aberta === '', 'conversa ABERTA sem atendente nao mostra etiqueta nenhuma');
  ok(/Ana/.test(inds.abertaComAtend), 'com atendente, mostra o nome dele');
  ok(!/Aberta/i.test(inds.abertaComAtend), 'e NAO repete "Aberta" junto');
  ok(inds.fechada !== '' , 'conversa FECHADA mostra o estado (e informacao de verdade)');

  // ---------- 5) icone da lupa no lugar ----------
  console.log('\n=== 5) O ICONE DA LUPA NAO FICA EM CIMA DO TEXTO ===');
  await cdp.eval(`(function(){ switchAba('whatsapp'); })()`);
  await espera(1500);
  const busca = await cdp.eval(`(function(){
    let cx = document.querySelector('.wa-search-conv');
    if (!cx) {
      // modulo sem conta configurada: monta o mesmo html da tela so para medir
      const alvo = document.getElementById('wa-content');
      alvo.innerHTML = '<div class="wa-inbox"><div class="wa-col-list">' +
        '<div class="wa-search wa-search-conv"><i class="fa-solid fa-search"></i>' +
        '<input placeholder="Buscar conversa"></div>' +
        '<div class="wa-conv-list"></div></div>' +
        '<div class="wa-col-chat"></div><div class="wa-col-info"></div></div>';
      cx = document.querySelector('.wa-search-conv');
    }
    if (!cx) return { achou: false };
    const icone = cx.querySelector('i');
    const input = cx.querySelector('input');
    if (!icone || !input) return { achou: false };
    const ri = icone.getBoundingClientRect(), rc = input.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(input).paddingLeft) || 0;
    return {
      achou: true,
      iconeFim: Math.round(ri.right),
      textoComeca: Math.round(rc.left + pad),
      iconeCentro: Math.round(ri.top + ri.height / 2),
      inputCentro: Math.round(rc.top + rc.height / 2),
      alturaCaixa: Math.round(cx.getBoundingClientRect().height),
      alturaInput: Math.round(rc.height)
    };
  })()`);
  ok(busca.achou, 'achei o campo de busca da lista');
  if (busca.achou) {
    ok(busca.textoComeca >= busca.iconeFim,
      'o texto comeca DEPOIS do icone (texto em ' + busca.textoComeca + ', icone acaba em ' + busca.iconeFim + ')');
    ok(Math.abs(busca.iconeCentro - busca.inputCentro) <= 3,
      'o icone esta centralizado no campo (icone ' + busca.iconeCentro + ', campo ' + busca.inputCentro + ')');
    ok(Math.abs(busca.alturaCaixa - busca.alturaInput) <= 10,
      'a caixa tem a altura do campo, nao esticada (caixa ' + busca.alturaCaixa + ', campo ' + busca.alturaInput + ')');
  }

  // ---------- 6) texto da mensagem: quebra de linha e link ----------
  console.log('\n=== 6) MENSAGEM DE TEXTO: QUEBRA DE LINHA E LINK ===');
  const txt = await cdp.eval(`(function(){
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;left:-9999px;width:400px;';
    document.body.appendChild(div);
    div.innerHTML = _waBolha({ type:'text', content:'Linha 1\\nLinha 2\\n\\nVeja https://vemserrt.com.br aqui', created_at:'2026-10-21T10:00:00Z', direction:'incoming' });
    const alvo = div.querySelector('.texto-longo');
    const link = div.querySelector('a');
    const r = {
      temPreWrap: alvo ? getComputedStyle(alvo).whiteSpace === 'pre-wrap' : false,
      temLink: !!link,
      hrefOk: link ? link.getAttribute('href') === 'https://vemserrt.com.br' : false,
      temQuebra: alvo ? alvo.textContent.indexOf('\\n') >= 0 : false
    };
    div.remove();
    return r;
  })()`);
  ok(txt.temPreWrap, 'o texto da mensagem esta com pre-wrap (quebras preservadas)');
  ok(txt.temQuebra, 'e o conteudo ainda tem as quebras');
  ok(txt.temLink && txt.hrefOk, 'o endereco virou link clicavel');

  // ---------- 7) HTML dentro da mensagem nao executa ----------
  console.log('\n=== 7) HTML NA MENSAGEM NAO EXECUTA ===');
  const seg = await cdp.eval(`(function(){
    window.__waInvadiu = 0;
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;left:-9999px;';
    document.body.appendChild(div);
    div.innerHTML = _waBolha({ type:'text', content:'<img src=x onerror="window.__waInvadiu=1"> e <a href="javascript:alert(1)">clica</a>', created_at:'2026-10-21T10:00:00Z', direction:'incoming' });
    const r = {
      invadiu: !!window.__waInvadiu,
      temImg: !!div.querySelector('img'),
      comoTexto: div.textContent.indexOf('<img') >= 0
    };
    div.remove();
    return r;
  })()`);
  ok(seg.invadiu === false, 'o onerror NAO executou');
  ok(seg.temImg === false, 'nao virou tag <img>');
  ok(seg.comoTexto === true, 'aparece como texto');

  console.log('\nexcecoes de JS: ' + (excecoes.length ? JSON.stringify(excecoes.slice(0, 3)) : 'nenhuma'));
  ok(excecoes.length === 0, 'nenhuma excecao de JS');

  console.log('\n' + (falhas === 0 ? 'WHATSAPP MENSAGENS: TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
