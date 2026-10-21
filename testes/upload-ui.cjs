// Roda pelo executor da suite:  node testes/rodar.cjs
// O executor sobe um servidor isolado numa porta livre e passa o endereco
// em BASE (e a porta do navegador em CDP, quando a suite precisa de tela).
// Prova no NAVEGADOR que a foto de /uploads/ ainda renderiza no <img>
// (o teste por HTTP ve o cabecalho; so o navegador prova que a imagem aparece)
// e que a ficha publica de candidatura sobe foto sem login.
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
const BASE = process.env.BASE || BASE;
const CDP_PORT = Number(process.env.CDP || 9222);
const espera = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALHOU: ') + m); if (!c) falhas++; };

const PNG_B64 = '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000100ffabce36890000000049454e44ae426082';

(async () => {
  const alvos = await jsonGet('http://127.0.0.1:' + CDP_PORT + '/json');
  const pagina = alvos.find(t => t.type === 'page');
  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');

  // ---------- 1) ficha publica: sobe foto SEM login ----------
  console.log('=== FICHA PUBLICA: sobe foto sem login (pelo mesmo caminho do vps-sync) ===');
  await cdp.send('Page.navigate', { url: BASE + '/candidato.html' }); await espera(2500);
  const semSessao = await cdp.eval(`document.cookie.indexOf('rt_session') < 0`);
  console.log('   esta sem sessao?', semSessao);
  const envio = await cdp.eval(`(async function(){
    const hex = '${PNG_B64}';
    const bytes = new Uint8Array(hex.match(/../g).map(h => parseInt(h, 16)));
    let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
    const dataUrl = 'data:image/png;base64,' + btoa(bin);
    const r = await fetch('/api/upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl: dataUrl, hint: 'rg_frente' })
    });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, url: j.url || null, tipo: j.tipo || null };
  })()`);
  ok(envio.status === 200, 'foto de candidato subiu SEM login (' + envio.status + ')');
  ok(/\.png$/.test(envio.url || ''), 'gravada como .png (' + envio.url + ')');

  // e SVG pela mesma pagina publica e recusado
  const envioSvg = await cdp.eval(`(async function(){
    const dataUrl = 'data:image/png;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)<\\/script></svg>');
    const r = await fetch('/api/upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl: dataUrl, hint: 'rg_frente' })
    });
    return r.status;
  })()`);
  ok(envioSvg === 400, 'e SVG disfarcado de png pela pagina publica e RECUSADO (' + envioSvg + ')');

  // ---------- 2) a foto RENDERIZA no <img> ----------
  console.log('\n=== A FOTO APARECE DE VERDADE NO <img> ===');
  const render = await cdp.eval(`(async function(){
    const img = document.createElement('img');
    img.src = '${envio.url}';
    document.body.appendChild(img);
    await new Promise(function(res){
      img.onload = function(){ res(); };
      img.onerror = function(){ res(); };
      setTimeout(res, 4000);
    });
    return { completo: img.complete, largura: img.naturalWidth, altura: img.naturalHeight };
  })()`);
  console.log('   ' + JSON.stringify(render));
  ok(render.largura > 0 && render.altura > 0,
    'a imagem carregou no <img> (naturalWidth ' + render.largura + ') — e isto que as telas de candidato e equipamento fazem');

  // ---------- 3) SVG com login NAO renderiza como imagem nem executa ----------
  console.log('\n=== SVG NAO E SERVIDO COMO IMAGEM ===');
  await cdp.send('Page.navigate', { url: BASE + '/' }); await espera(2500);
  if (await cdp.eval(`!!document.getElementById('login-form')`)) {
    await cdp.eval(`(function(){
      document.getElementById('login-username').value='admin';
      document.getElementById('login-password').value='TesteLocal#123';
      document.getElementById('login-form').requestSubmit();
    })()`);
    await espera(4500);
  }
  const svgRes = await cdp.eval(`(async function(){
    const dataUrl = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');
    const r = await fetch('/api/upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl: dataUrl, hint: 'logo' })
    });
    const j = await r.json().catch(() => ({}));
    if (!j.url) return { subiu: false };
    const img = document.createElement('img');
    img.src = j.url;
    document.body.appendChild(img);
    await new Promise(function(res){ img.onload = res; img.onerror = res; setTimeout(res, 3000); });
    const resp = await fetch(j.url);
    return {
      subiu: true, url: j.url,
      largura: img.naturalWidth,
      ct: resp.headers.get('content-type') || '',
      cd: resp.headers.get('content-disposition') || ''
    };
  })()`);
  ok(svgRes.subiu, 'SVG subiu com login');
  ok(svgRes.largura === 0, 'o navegador NAO renderiza como imagem (naturalWidth ' + svgRes.largura + '), porque vem como anexo');
  ok(/attachment/i.test(svgRes.cd || ''), 'e o cabecalho confirma o anexo ("' + svgRes.cd + '")');

  console.log('\n' + (falhas === 0 ? 'UPLOAD (navegador): TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
