// Roda pelo executor da suite:  node testes/rodar.cjs
// O executor sobe um servidor isolado numa porta livre e passa o endereco
// em BASE (e a porta do navegador em CDP, quando a suite precisa de tela).
// TESTES DE TELA DA ETAPA 4
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

(async () => {
  const alvos = await jsonGet('http://127.0.0.1:' + (process.env.CDP || 9222) + '/json');
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

  console.log('\n=== 16) LINK DE COMPLETAR FICHA: uma versao so, achando nas DUAS listas ===');
  const r16 = await cdp.eval(`(function(){
    state.candidatos = state.candidatos || [];
    state.bancoTalentos = state.bancoTalentos || [];
    state.candidatos.push({ id:'cand-x1', nome:'Candidato Normal', cpf:'111', telefone:'119' });
    state.bancoTalentos.push({ id:'bt-x1', nome:'So No Banco', cpf:'222', telefone:'118' });
    return {
      doCandidato: gerarLinkCompletarFicha('cand-x1'),
      doBanco:     gerarLinkCompletarFicha('bt-x1'),
      inexistente: gerarLinkCompletarFicha('nao-existe')
    };
  })()`);
  ok(/completar=/.test(r16.doCandidato || ''), 'link de quem esta em candidatos funciona');
  ok(/completar=/.test(r16.doBanco || ''), 'link de quem SO esta no banco de talentos funciona (antes saia vazio)');
  ok(r16.inexistente === '', 'id que nao existe devolve vazio');

  console.log('\n=== 17) KANBAN MORTO REMOVIDO, DASHBOARD INTACTO ===');
  ok(await cdp.eval(`typeof renderDashboardKanban === 'undefined'`), 'renderDashboardKanban nao existe mais');
  ok(await cdp.eval(`typeof setupDragAndDrop === 'undefined'`), 'setupDragAndDrop nao existe mais');
  excecoes.length = 0;
  await cdp.eval(`(function(){ switchAba('dashboard'); })()`);
  // Espera a aba ter CONTEUDO, nao o relogio (mesma licao da regra 18).
  await esperarPor(cdp,
    "(function(){ var a=document.getElementById('aba-dashboard'); return !!a && a.classList.contains('active') && a.innerHTML.length > 200; })()",
    30000, 'o Dashboard desenhar');
  ok(excecoes.length === 0, 'Dashboard abre sem erro (excecoes: ' + JSON.stringify(excecoes.slice(0, 2)) + ')');
  const dashOk = await cdp.eval(`(function(){
    const a = document.getElementById('aba-dashboard');
    return !!a && a.classList.contains('active') && a.innerHTML.length > 200;
  })()`);
  ok(dashOk, 'e a aba Dashboard esta ativa e com conteudo');

  console.log('\n=== CHAVE "atividades" PROTEGIDA ===');
  const rAt = await cdp.eval(`(function(){
    delete state.atividades;              // simula estado sem a chave
    const mudou = garantirEstruturasBase();
    return { virouLista: Array.isArray(state.atividades), mudou: mudou };
  })()`);
  ok(rAt.virouLista, 'garantirEstruturasBase cria "atividades" quando falta');
  const rAt2 = await cdp.eval(`(function(){
    try {
      delete state.atividades;
      garantirEstruturasBase();
      state.atividades.unshift({ id: _novoId('act'), descricao:'teste', data:'Agora' });
      return { ok: true, total: state.atividades.length };
    } catch (e) { return { ok: false, erro: String(e && e.message) }; }
  })()`);
  ok(rAt2.ok, 'e o unshift que antes estourava agora funciona (' + JSON.stringify(rAt2) + ')');

  console.log('\n=== TODAS AS ABAS DO MENU AINDA ABREM SEM ERRO ===');
  excecoes.length = 0;
  const abas = await cdp.eval(`(function(){
    return Array.from(document.querySelectorAll('[data-aba]')).map(e => e.getAttribute('data-aba'));
  })()`);
  for (const a of abas) {
    await cdp.eval(`(function(){ try { switchAba('${a}'); } catch(e) { throw e; } })()`);
    await espera(400);
  }
  ok(excecoes.length === 0, abas.length + ' abas abertas, nenhuma excecao (' + JSON.stringify(excecoes.slice(0, 3)) + ')');

  console.log('\n' + (falhas === 0 ? 'ETAPA 4 (tela): TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
