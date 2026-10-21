// Roda pelo executor da suite:  node testes/rodar.cjs
// O executor sobe um servidor isolado numa porta livre e passa o endereco
// em BASE (e a porta do navegador em CDP, quando a suite precisa de tela).
// Teste de integracao do nucleo de sincronizacao.
// Simula DUAS pessoas usando o sistema ao mesmo tempo, que e o cenario que
// desfazia aprovacao de ficha em producao.
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || BASE;
const APP = require('path').resolve(__dirname, '..');

let falhas = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALHOU: ') + m); if (!c) falhas++; };

// Cria uma "aba do navegador" independente: cada uma tem seu proprio RTCloud,
// sua propria foto do estado e sua propria versao -- igual a duas pessoas.
function novaAba(cookie) {
  const win = {};
  const origFetch = global.fetch;
  const sandbox = {
    window: win,
    console: console,
    fetch: (url, opt) => origFetch(url.startsWith('http') ? url : BASE + url,
      Object.assign({}, opt, { headers: Object.assign({}, (opt && opt.headers) || {}, { Cookie: cookie }) })),
    setTimeout, clearTimeout, setInterval, clearInterval, JSON, Object, Array, String, Number, Boolean, Date, Math, Promise, Error, RegExp, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
  };
  const vm = require('vm');
  const src = fs.readFileSync(path.join(APP, 'js/vps-sync.js'), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return win.RTCloud;
}

(async () => {
  const login = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'admin', senha: 'TesteLocal#123' })
  });
  const cookie = login.headers.get('set-cookie');
  console.log('login:', login.status);

  const ver = async () => (await fetch(BASE + '/api/state', { headers: { Cookie: cookie } }).then(r => r.json())).dados;

  // ---------- semeia ----------
  const semente = await ver();
  semente.fluxosFinanceiros = [
    { id: 'ff-1', numero: 1, status: 'aguardando_gestao' },
    { id: 'ff-2', numero: 2, status: 'rascunho' },
  ];
  semente.candidatos = [{ id: 'c-1', nome: 'Candidato Um' }];
  semente.ffWorkflow = { gestao: { responsaveis: ['ana'] } };
  await fetch(BASE + '/api/state', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ dados: semente })
  });
  console.log('estado semeado\n');

  const ana = novaAba(cookie);
  const bruno = novaAba(cookie);
  const eAna = await ana.loadState();
  const eBruno = await bruno.loadState();
  ok(!!eAna && !!eBruno, 'as duas abas carregaram o estado');

  console.log('\n=== CENARIO DO BUG: Ana aprova a ficha; Bruno mexe em OUTRA aba ===');
  eAna.fluxosFinanceiros.find(f => f.id === 'ff-1').status = 'aguardando_financeiro';
  await ana.salvarAgora(eAna, { merge: true, upsertIds: ['ff-1'] });
  console.log('   Ana aprovou a ficha #1');

  eBruno.candidatos.push({ id: 'c-2', nome: 'Candidato Dois' });
  await bruno.salvarAgora(eBruno);
  console.log('   Bruno cadastrou um candidato (tela diferente, estado atrasado)');

  const d1 = await ver();
  const ficha = d1.fluxosFinanceiros.find(f => f.id === 'ff-1');
  console.log('   status da ficha #1 agora:', ficha.status);
  ok(ficha.status === 'aguardando_financeiro', 'a aprovacao da Ana SOBREVIVEU ao save do Bruno');
  ok(d1.candidatos.some(c => c.id === 'c-2'), 'e o candidato do Bruno tambem foi salvo');

  console.log('\n=== EXCLUSAO pelo save generico, com estado atrasado ===');
  const carla = novaAba(cookie);
  const eCarla = await carla.loadState();
  const dX = await ver(); dX.candidatos.push({ id: 'c-3', nome: 'Candidato Tres' });
  await fetch(BASE + '/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ dados: dX }) });
  eCarla.fluxosFinanceiros = eCarla.fluxosFinanceiros.filter(f => f.id !== 'ff-2');
  await carla.salvarAgora(eCarla);
  const d2 = await ver();
  ok(!d2.fluxosFinanceiros.some(f => f.id === 'ff-2'), 'a ficha #2 foi apagada de verdade');
  ok(d2.candidatos.some(c => c.id === 'c-3'), 'e o candidato que o outro criou NAO foi perdido');

  console.log('\n=== CONFIGURACAO pelo save generico, com estado atrasado ===');
  const diego = novaAba(cookie);
  const eDiego = await diego.loadState();
  const dY = await ver(); dY.candidatos.push({ id: 'c-4', nome: 'Candidato Quatro' });
  await fetch(BASE + '/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ dados: dY }) });
  eDiego.ffWorkflow = { gestao: { responsaveis: ['bruno'] } };
  await diego.salvarAgora(eDiego);
  const d3 = await ver();
  ok(d3.ffWorkflow.gestao.responsaveis[0] === 'bruno', 'troca de responsavel gravou mesmo atrasado');
  ok(d3.candidatos.some(c => c.id === 'c-4'), 'e nada do outro foi perdido');

  console.log('\n=== NADA MUDOU: save nao pode apagar nem baguncar ===');
  const edu = novaAba(cookie);
  const eEdu = await edu.loadState();
  const antes = JSON.stringify((await ver()).fluxosFinanceiros);
  await edu.salvarAgora(eEdu);
  const depois = JSON.stringify((await ver()).fluxosFinanceiros);
  ok(antes === depois, 'save sem alteracao deixou tudo exatamente igual');

  console.log('\n=== A SENHA NAO VOLTA VAZIA DEPOIS DE UM SAVE COMUM ===');
  // Com o campo `senha` fora do GET, um save comum do painel mandaria os
  // funcionarios SEM senha. O servidor tem que repor.
  const fAntes = (await ver()).funcionarios.map(f => f.login).join(',');
  const fred = novaAba(cookie);
  const eFred = await fred.loadState();
  eFred.candidatos.push({ id: 'c-9', nome: 'Candidato Nove' });
  await fred.salvarAgora(eFred);
  const relogin = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'admin', senha: 'TesteLocal#123' })
  });
  ok(relogin.status === 200, 'admin ainda entra depois de um save comum (senha nao foi apagada) — ' + relogin.status);
  ok((await ver()).funcionarios.map(f => f.login).join(',') === fAntes, 'a lista de funcionarios continua igual');

  console.log('\n' + (falhas === 0 ? 'SINCRONIZACAO: TUDO OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO:', e.stack || e.message); process.exit(1); });
