// Roda pelo executor da suite:  node testes/rodar.cjs
// O executor sobe um servidor isolado numa porta livre e passa o endereco
// em BASE (e a porta do navegador em CDP, quando a suite precisa de tela).
// TESTES DE TELA DA ETAPA 2: Fila, cadastro de candidato e log na Auditoria.
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
  const alertas = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails || {};
      excecoes.push(((d.exception && d.exception.description) || d.text || '').split('\n')[0]);
    }
    if (m.method === 'Page.javascriptDialogOpening') {
      alertas.push(m.params.message);
      cdp.send('Page.handleJavaScriptDialog', { accept: true, promptText: 'Maria Teste' });
    }
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
  ok(await cdp.eval(`typeof state !== 'undefined' && !!state`), 'sistema carregado e logado');

  // ---------- 6) FILA PELA TELA ----------
  console.log('\n=== 6) FILA pela TELA: chamar, renomear, cancelar e limpar ===');
  const servidorFila = async () => {
    const r = await fetch(BASE + '/api/state', { headers: { Cookie: await cdp.eval(`document.cookie`) || '' } });
    return r;
  };
  // gera 2 senhas pela propria tela
  await cdp.eval(`(function(){ switchAba('fila'); })()`); await espera(900);
  let r = await cdp.eval(`(async function(){
    // evita a janela de impressao do ticket durante o teste
    window._imprimirTicket = function(){};
    gerarSenhaFila('selecao');
    gerarSenhaFila('selecao');
    await new Promise(r=>setTimeout(r,1500));
    return (state.fila.senhas||[]).map(s=>({id:s.id,numero:s.numero,status:s.status}));
  })()`);
  console.log('   senhas geradas:', JSON.stringify(r));
  ok(Array.isArray(r) && r.length >= 2, 'duas senhas geradas pela tela');
  const idA = r[0].id, idB = r[1].id;

  // CHAMAR -> precisa persistir no servidor
  await cdp.eval(`(async function(){ await chamarSenhaEspecifica('${idA}'); await new Promise(r=>setTimeout(r,1200)); })()`);
  await espera(600);
  let noServidor = await cdp.eval(`(async function(){
    const j = await (await fetch('/api/state')).json();
    const s = ((j.dados.fila||{}).senhas||[]).find(x=>x.id==='${idA}');
    return s ? s.status : 'nao-achei';
  })()`);
  ok(noServidor === 'chamada', 'CHAMAR a senha persistiu no servidor (status no servidor: ' + noServidor + ')');

  // RENOMEAR (o prompt e respondido com "Maria Teste")
  await cdp.eval(`(async function(){ await definirNomeSenha('${idA}'); await new Promise(r=>setTimeout(r,1200)); })()`);
  await espera(600);
  let nomeSrv = await cdp.eval(`(async function(){
    const j = await (await fetch('/api/state')).json();
    const s = ((j.dados.fila||{}).senhas||[]).find(x=>x.id==='${idA}');
    return s ? (s.nome||'') : 'nao-achei';
  })()`);
  ok(nomeSrv === 'Maria Teste', 'RENOMEAR persistiu no servidor ("' + nomeSrv + '")');

  // CANCELAR
  await cdp.eval(`(async function(){ await cancelarSenha('${idB}'); await new Promise(r=>setTimeout(r,1200)); })()`);
  await espera(600);
  let existeB = await cdp.eval(`(async function(){
    const j = await (await fetch('/api/state')).json();
    return ((j.dados.fila||{}).senhas||[]).some(x=>x.id==='${idB}');
  })()`);
  ok(existeB === false, 'CANCELAR apagou no servidor de verdade');

  // LIMPAR TUDO
  await cdp.eval(`(async function(){ await limparFilaCompleta(); await new Promise(r=>setTimeout(r,1200)); })()`);
  await espera(600);
  let qtd = await cdp.eval(`(async function(){
    const j = await (await fetch('/api/state')).json();
    return ((j.dados.fila||{}).senhas||[]).length;
  })()`);
  ok(qtd === 0, 'LIMPAR FILA esvaziou no servidor (sobraram ' + qtd + ')');

  // ---------- 8) CADASTRO DE CANDIDATO COM VAGA QUE SUMIU ----------
  console.log('\n=== 8) CADASTRO DE CANDIDATO: vaga que sumiu avisa, nao quebra ===');
  excecoes.length = 0; alertas.length = 0;
  const antesCand = await cdp.eval(`(state.candidatos||[]).length`);
  await cdp.eval(`(function(){
    state.vagas.push({ id:'vaga-sumiu', cargo:'Ajudante', empresaNome:'Empresa X', codigo:'001', empresaId:'emp-1' });
    abrirModalAddCandidato('pendente');
    document.getElementById('add-nome').value='Teste Vaga Sumiu';
    document.getElementById('add-cpf').value='529.982.247-25';
    document.getElementById('add-rg').value='123456';
    document.getElementById('add-email').value='a@a.com';
    document.getElementById('add-telefone').value='11999990000';
    // a vaga desaparece (outra pessoa apagou / polling trocou o estado)
    state.vagas = state.vagas.filter(v => v.id !== 'vaga-sumiu');
    document.getElementById('form-add-candidato').requestSubmit();
  })()`);
  await espera(1500);
  const depoisCand = await cdp.eval(`(state.candidatos||[]).length`);
  ok(excecoes.length === 0, 'NAO estourou excecao nenhuma (antes dava "Cannot read properties of undefined")');
  ok(alertas.some(a => /vaga escolhida não existe mais|vaga escolhida nao existe mais/i.test(a)),
    'o usuario FOI AVISADO (alerta: "' + (alertas[0] || '').slice(0, 60) + '...")');
  ok(depoisCand === antesCand, 'nao criou candidato pela metade (antes ' + antesCand + ', depois ' + depoisCand + ')');
  const campoMantido = await cdp.eval(`(document.getElementById('add-nome')||{}).value || ''`);
  ok(campoMantido === 'Teste Vaga Sumiu', 'o que foi digitado continua no formulario ("' + campoMantido + '")');

  // ---------- 9) LOG DA ACAO VAI PARA A AUDITORIA ----------
  console.log('\n=== 9) AUDITORIA: o registro e o log sobem juntos ===');
  const antesLogs = await cdp.eval(`(async function(){
    const j = await (await fetch('/api/state')).json();
    return (j.dados.logs||[]).length;
  })()`);
  const res9 = await cdp.eval(`(async function(){
    // registrarLogGlobal NAO registra para conta mestre (admin/joaobalaf), de
    // proposito. Para exercitar o caminho real, finge um usuario comum.
    const _antesUser = loggedUser;
    loggedUser = { login: 'zeteste', nome: 'Ze Teste', departamento: 'dp' };
    try {
      // simula exatamente o que a tela faz: cria o log e salva com os alvos
      const idCand = _novoId('candidato');
      state.candidatos.push({ id: idCand, nome:'Fulano Auditoria', cpf:'', status:'aprovado', documentos:{} });
      const idLog = registrarLogGlobal('Aprovou a ficha de "Fulano Auditoria".', 'dp');
      const alvos = [idCand];
      if (idLog) alvos.push(idLog);
      await RTCloud.salvarAgora(state, { merge: true, upsertIds: alvos, somenteAlvos: true });
      return { idCand: idCand, idLog: idLog };
    } finally { loggedUser = _antesUser; }
  })()`);
  await espera(900);
  const depoisSrv = await cdp.eval(`(async function(){
    const j = await (await fetch('/api/state')).json();
    return {
      logs: (j.dados.logs||[]).length,
      temEsse: (j.dados.logs||[]).some(l => l && l.id === ${JSON.stringify(res9 && res9.idLog)}),
      temCand: (j.dados.candidatos||[]).some(c => c && c.id === ${JSON.stringify(res9 && res9.idCand)})
    };
  })()`);
  ok(depoisSrv.temCand, 'o candidato foi gravado no servidor');
  ok(depoisSrv.temEsse, 'e o LOG da acao tambem subiu (antes ficava so na tela e sumia)');
  console.log('   logs no servidor: ' + antesLogs + ' -> ' + depoisSrv.logs);

  // ---------- 12) IDS UNICOS ----------
  console.log('\n=== 12) IDS: nao colidem no mesmo milissegundo ===');
  const ids = await cdp.eval(`(function(){
    const out = [];
    for (let i=0;i<200;i++) out.push(_novoId('log'));
    return { total: out.length, unicos: new Set(out).size, exemplo: out[0] };
  })()`);
  ok(ids.unicos === ids.total, '200 ids gerados em rajada sao TODOS unicos (' + ids.unicos + '/' + ids.total + ')');
  console.log('   exemplo:', ids.exemplo);

  // ---------- 13) NUMERO DE FILA INVALIDO NAO VIRA "#NaN" ----------
  // O cartao do Departamento Pessoal fazia Number(c.numeroFila) direto na
  // hora de desenhar. Qualquer valor que nao fosse numero -- vindo de
  // importacao de planilha, de edicao manual do estado ou de base antiga --
  // virava NaN e a etiqueta saia literalmente "#NaN" na tela.
  console.log('\n=== 13) FILA INVALIDA: a etiqueta nunca mostra "#NaN" ===');
  const fila = await cdp.eval(`(async function(){
    const ruins = ['A-104', 'abc', '12abc', '#5', '', '   ', null, undefined, NaN];
    const bons  = [7, '42', ' 99 ', 0];
    state.candidatos = ruins.map(function (v, i) {
      return { id: 'fila-ruim-' + i, nome: 'Candidato Ruim ' + i, status: 'aprovado',
               codigoVaga: 'Vaga Teste', documentos: {}, historico: [], numeroFila: v };
    }).concat(bons.map(function (v, i) {
      return { id: 'fila-bom-' + i, nome: 'Candidato Bom ' + i, status: 'aprovado',
               codigoVaga: 'Vaga Teste', documentos: {}, historico: [], numeroFila: v };
    }));
    switchAba('depto-pessoal');
    await new Promise(function (r) { setTimeout(r, 700); });
    const cont = document.getElementById('dp-cards-container');
    const texto = cont ? cont.innerText : '';
    const etiquetas = Array.from(cont ? cont.querySelectorAll('.dp-cand-name span') : [])
      .map(function (e) { return e.textContent.trim(); })
      .filter(function (t) { return t.charAt(0) === '#'; });
    return {
      temNaN: /NaN/.test(texto),
      temUndefined: /undefined/.test(texto),
      etiquetas: etiquetas,
      cartoes: cont ? cont.querySelectorAll('.dp-card').length : 0,
      helper: typeof filaParaExibir === 'function'
    };
  })()`);
  ok(fila.helper, 'o helper filaParaExibir existe (a regra fica num lugar so)');
  ok(fila.cartoes === 13, 'a tela desenhou os 13 cartoes, nenhum derrubou o render (' + fila.cartoes + ')');
  ok(fila.temNaN === false, 'NAO aparece "NaN" em lugar nenhum da tela');
  ok(fila.temUndefined === false, 'nem "undefined"');
  ok(fila.etiquetas.indexOf('#7') >= 0 && fila.etiquetas.indexOf('#42') >= 0 &&
     fila.etiquetas.indexOf('#99') >= 0 && fila.etiquetas.indexOf('#0') >= 0,
     'numero de verdade continua aparecendo, inclusive 0 e com espaco (' + JSON.stringify(fila.etiquetas) + ')');
  // NaN entra aqui, e nao no grupo dos vazios: ele E um valor, so que
  // invalido -- e era exatamente ele que vazava para a tela como "#NaN".
  ok(fila.etiquetas.filter(function (t) { return t === '#-'; }).length === 5,
     'os 5 valores invalidos viram "#-" (A-104, abc, 12abc, #5 e o proprio NaN)');
  ok(fila.etiquetas.length === 9,
     'e os 4 vazios (vazio, espaco, null, undefined) nao desenham etiqueta nenhuma: ' +
     fila.etiquetas.length + ' etiquetas para 13 cartoes');

  console.log('\nexcecoes de JS durante todo o teste: ' + (excecoes.length ? JSON.stringify(excecoes.slice(0, 4)) : 'nenhuma'));
  console.log('\n' + (falhas === 0 ? 'ETAPA 2 (tela): TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
