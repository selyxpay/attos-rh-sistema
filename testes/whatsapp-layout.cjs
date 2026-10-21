// Roda pelo executor da suite:  node testes/rodar.cjs
// O executor sobe um servidor isolado numa porta livre e passa o endereco
// em BASE (e a porta do navegador em CDP, quando a suite precisa de tela).
// TESTE DA ETAPA 3: mede a tela do WhatsApp no computador, em varias
// resolucoes. Confirma que a lista ocupa a altura toda, que a faixa vazia
// acabou e que a caixa nao passa da borda de baixo.
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

const MEDIR = `(function(){
  const q = s => document.querySelector(s);
  const cx = q('.wa-inbox'), col = q('.wa-col-list'),
        busca = q('.wa-search-conv'), lista = q('.wa-conv-list');
  if (!cx || !col || !busca || !lista) return { semInbox: true };
  const r = e => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: b.height }; };
  const cs = getComputedStyle(busca);
  const item = q('.wa-conv-item');
  const alturaItem = item ? item.getBoundingClientRect().height : 74;
  return {
    janela: window.innerHeight,
    caixa: r(cx),
    coluna: r(col),
    busca: r(busca),
    lista: r(lista),
    buscaFlexGrow: cs.flexGrow,
    buscaFlexBasis: cs.flexBasis,
    listaRola: getComputedStyle(lista).overflowY,
    faixaVazia: Math.round(r(lista).top - r(busca).bottom),
    passouDaJanela: Math.round(r(cx).bottom - window.innerHeight),
    contatosVisiveis: Math.round((r(lista).h / alturaItem) * 10) / 10,
    alturaItem: Math.round(alturaItem)
  };
})()`;

(async () => {
  const alvos = await jsonGet('http://127.0.0.1:' + (process.env.CDP || 9222) + '/json');
  const pagina = alvos.find(t => t.type === 'page');
  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

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

  // abre a aba do WhatsApp e injeta conversas de teste na lista, para medir
  // com conteudo de verdade
  await cdp.eval(`(function(){ switchAba('whatsapp'); })()`); await espera(1800);
  const temInbox = await cdp.eval(`!!document.querySelector('.wa-inbox')`);
  console.log('inbox presente na tela?', temInbox);
  if (!temInbox) {
    // o modulo pode estar sem conta configurada; monta o esqueleto do inbox
    // com o MESMO html da tela, so para medir o layout
    await cdp.eval(`(function(){
      const alvo = document.getElementById('wa-content');
      alvo.innerHTML = '<div class="wa-inbox">' +
        '<div class="wa-col-list">' +
          '<div class="wa-conta-sel">Conta: Principal</div>' +
          '<div class="wa-conv-filtros"><button class="wa-fchip active">Todas</button><button class="wa-fchip">Novas</button></div>' +
          '<div class="wa-search wa-search-conv"><i class="fa-solid fa-search"></i><input placeholder="Buscar conversa"></div>' +
          '<div class="wa-conv-list">' +
            Array.from({length:30}, (_,i) =>
              '<div class="wa-conv-item"><div><b>Contato ' + (i+1) + '</b><div><small>ultima mensagem aqui</small></div></div></div>'
            ).join('') +
          '</div>' +
        '</div>' +
        '<div class="wa-col-chat"></div><div class="wa-col-info"></div>' +
      '</div>';
    })()`);
    await espera(900);
  }

  const resolucoes = [[1366, 768], [1600, 900], [1920, 1080], [2560, 1440]];
  for (const [w, h] of resolucoes) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await espera(700);
    const m = await cdp.eval(MEDIR);
    if (!m || m.semInbox) { ok(false, w + 'x' + h + ': nao achei o inbox para medir'); continue; }
    console.log('\n--- ' + w + 'x' + h + ' (janela util ' + m.janela + 'px) ---');
    console.log('   busca: ' + Math.round(m.busca.h) + 'px (flex-grow ' + m.buscaFlexGrow + ', basis ' + m.buscaFlexBasis + ')');
    console.log('   lista: ' + Math.round(m.lista.h) + 'px  -> ~' + m.contatosVisiveis + ' contatos (item ' + m.alturaItem + 'px)');
    console.log('   faixa vazia entre busca e 1o contato: ' + m.faixaVazia + 'px');
    console.log('   caixa passa da borda de baixo em: ' + m.passouDaJanela + 'px');
    ok(m.busca.h < 70, w + 'x' + h + ': a busca voltou ao tamanho de campo (' + Math.round(m.busca.h) + 'px, era ~' + Math.round(m.janela / 3) + ')');
    ok(m.faixaVazia <= 12, w + 'x' + h + ': sem faixa vazia (' + m.faixaVazia + 'px)');
    ok(m.passouDaJanela <= 2, w + 'x' + h + ': a caixa NAO passa da borda de baixo (' + m.passouDaJanela + 'px)');
    ok(m.listaRola === 'auto' || m.listaRola === 'scroll', w + 'x' + h + ': a lista tem rolagem propria (' + m.listaRola + ')');
    ok(m.lista.h > m.busca.h * 3, w + 'x' + h + ': a lista ficou com a maior parte da altura');
  }

  // celular continua com a regra propria
  console.log('\n--- celular 390x844 (a regra de celular tem que continuar valendo) ---');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await espera(800);
  const mc = await cdp.eval(MEDIR);
  if (mc && !mc.semInbox) {
    console.log('   caixa: ' + Math.round(mc.caixa.h) + 'px | lista: ' + Math.round(mc.lista.h) + 'px | passa da borda: ' + mc.passouDaJanela + 'px');
    // A regra de celular define a propria altura: calc(100dvh - 165px). Ela
    // NAO foi tocada, e o encaixe por flex do desktop esta atras de
    // min-width:861px de proposito. O transbordo que sobra no celular e
    // ANTERIOR a esta correcao (medido no CSS antigo: os mesmos 225px) e a
    // pagina rola para alcanca-lo -- fica fora do escopo desta etapa, que era
    // o computador.
    const esperado = mc.janela - 165;
    ok(Math.abs(mc.caixa.h - esperado) <= 2,
      'no celular a regra propria continua valendo: ' + Math.round(mc.caixa.h) + 'px (100dvh - 165px = ' + esperado + ')');
    ok(mc.busca.h < 70, 'e a busca no celular tambem foi consertada (' + Math.round(mc.busca.h) + 'px, era 290)');
    ok(mc.lista.h > 400, 'a lista no celular ate melhorou (' + Math.round(mc.lista.h) + 'px, era 290)');
  }

  console.log('\n' + (falhas === 0 ? 'ETAPA 3 (WhatsApp): TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
