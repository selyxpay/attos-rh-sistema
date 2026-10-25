// Roda pelo executor da suite:  node testes/rodar.cjs
// O executor sobe um servidor isolado numa porta livre e passa o endereco
// em BASE (e a porta do navegador em CDP, quando a suite precisa de tela).
// Varredura de todas as abas do menu capturando ERRO DE VERDADE:
//  - excecao de JS (Runtime.exceptionThrown)
//  - console.error / console.warn (Runtime.consoleAPICalled)
//  - chamada de rede que falhou ou voltou 4xx/5xx (Network.*)
// Nao altera nada no projeto. So observa.
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
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception && r.exceptionDetails.exception.description);
    return r.result.value;
  }
}

const BASE = process.env.BASE || BASE;
const CDP_PORT = Number(process.env.CDP || 9222);

(async () => {
  const alvos = await jsonGet(`http://127.0.0.1:${CDP_PORT}/json`);
  const pagina = alvos.find(t => t.type === 'page');
  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Log.enable');

  let abaAtual = 'CARREGAMENTO';
  const achados = [];   // {aba, tipo, detalhe}
  const pedidos = new Map();

  const anota = (tipo, detalhe) => {
    if (!detalhe) return;
    achados.push({ aba: abaAtual, tipo, detalhe: String(detalhe).slice(0, 400) });
  };

  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    const p = m.params || {};
    if (m.method === 'Runtime.exceptionThrown') {
      const d = p.exceptionDetails || {};
      const desc = (d.exception && d.exception.description) || d.text || 'excecao';
      anota('EXCECAO', desc.split('\n').slice(0, 3).join(' | '));
    }
    if (m.method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'warning')) {
      const txt = (p.args || []).map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' ');
      // ruido conhecido de ambiente headless, nao e bug do sistema
      if (/Document is not focused|clipboard|Autofocus|preload|DevTools|favicon/i.test(txt)) return;
      anota(p.type === 'error' ? 'CONSOLE.ERROR' : 'CONSOLE.WARN', txt);
    }
    if (m.method === 'Log.entryAdded') {
      const en = p.entry || {};
      if (en.level !== 'error' && en.level !== 'warning') return;
      if (/favicon|DevTools|preload/i.test(en.text || '')) return;
      anota('LOG.' + en.level.toUpperCase(), (en.url ? en.url + ' :: ' : '') + en.text);
    }
    if (m.method === 'Network.requestWillBeSent') {
      pedidos.set(p.requestId, { url: p.request.url, metodo: p.request.method, aba: abaAtual });
    }
    if (m.method === 'Network.responseReceived') {
      const req = pedidos.get(p.requestId);
      const st = p.response.status;
      if (st >= 400 && req) {
        anota('HTTP_' + st, req.metodo + ' ' + req.url.replace(BASE, ''));
      }
    }
    if (m.method === 'Network.loadingFailed') {
      const req = pedidos.get(p.requestId);
      if (!req) return;
      if (/favicon/i.test(req.url)) return;
      anota('REDE_FALHOU', req.metodo + ' ' + req.url.replace(BASE, '') + ' :: ' + (p.errorText || ''));
    }
  });

  const espera = ms => new Promise(r => setTimeout(r, ms));
  // Espera por CONDICAO, nao por tempo fixo: na execucao completa a maquina
  // esta ocupada e um espera(4000) nao basta.
  const esperarPor = async function (expr, limiteMs, oQue) {
    const fim = Date.now() + (limiteMs || 30000);
    while (Date.now() < fim) {
      try { if (await cdp.eval(expr) === true) return true; } catch (e) {}
      await espera(250);
    }
    console.log('  (limite) esperei por: ' + (oQue || expr));
    return false;
  };

  // ---------- login ----------
  await cdp.send('Page.navigate', { url: BASE + '/' });
  await esperarPor("!!document.getElementById('login-form') || (typeof state !== 'undefined' && !!state)", 30000, 'a pagina abrir');
  await cdp.eval(`(function(){
    document.getElementById('login-username').value = 'admin';
    document.getElementById('login-password').value = 'TesteLocal#123';
    document.getElementById('login-form').requestSubmit();
  })()`);
  await esperarPor("typeof state !== 'undefined' && !!state", 45000, 'o sistema carregar depois do login');
  const logado = await cdp.eval(`!!document.querySelector('.sidebar, #sidebar, nav')`);
  console.log('login ok?', logado);

  // ---------- descobre as abas pelo proprio menu ----------
  const abas = await cdp.eval(`(function(){
    const out = [];
    document.querySelectorAll('[data-tab],[data-aba],[onclick*="abrirAba"],[onclick*="mostrarAba"],[onclick*="trocarAba"]').forEach(function(el){
      const t = el.getAttribute('data-tab') || el.getAttribute('data-aba');
      if (t) { if (out.indexOf(t) < 0) out.push(t); return; }
      const oc = el.getAttribute('onclick') || '';
      const m = /(?:abrirAba|mostrarAba|trocarAba)\\(\\s*['"]([^'"]+)['"]/.exec(oc);
      if (m && out.indexOf(m[1]) < 0) out.push(m[1]);
    });
    return out;
  })()`);
  console.log('abas encontradas no menu:', abas.length);
  console.log(abas.join(', '));

  // ---------- percorre cada aba ----------
  for (const aba of abas) {
    abaAtual = aba;
    try {
      await cdp.eval(`(function(){
        const sel = document.querySelector('[data-tab="${aba}"],[data-aba="${aba}"]');
        if (sel) { sel.click(); return 'click'; }
        if (typeof abrirAba === 'function') { abrirAba('${aba}'); return 'abrirAba'; }
        if (typeof mostrarAba === 'function') { mostrarAba('${aba}'); return 'mostrarAba'; }
        if (typeof trocarAba === 'function') { trocarAba('${aba}'); return 'trocarAba'; }
        return 'nao-abriu';
      })()`);
    } catch (e) {
      anota('EXCECAO_AO_ABRIR', e.message);
    }
    await espera(1400);
  }

  abaAtual = 'FINAL';
  await espera(1500);

  // ---------- relatorio ----------
  console.log('\n================ ACHADOS ================');
  if (!achados.length) {
    console.log('nenhum erro de console nem chamada falha em nenhuma aba');
  } else {
    const porAba = {};
    achados.forEach(a => { (porAba[a.aba] = porAba[a.aba] || []).push(a); });
    Object.keys(porAba).forEach(aba => {
      console.log('\n--- aba: ' + aba + ' ---');
      const vistos = new Set();
      porAba[aba].forEach(a => {
        const chave = a.tipo + '|' + a.detalhe;
        if (vistos.has(chave)) return;
        vistos.add(chave);
        console.log('  [' + a.tipo + '] ' + a.detalhe);
      });
    });
  }
  console.log('\ntotal de achados (com repetidos): ' + achados.length);
  process.exit(0);
})().catch(e => { console.error('ERRO NA VARREDURA:', e.stack || e.message); process.exit(1); });
