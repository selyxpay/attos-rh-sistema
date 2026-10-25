// Roda pelo executor da suite:  node testes/rodar.cjs
// O executor sobe um servidor isolado numa porta livre e passa o endereco
// em BASE (e a porta do navegador em CDP, quando a suite precisa de tela).
// TESTES DA ETAPA 2 — dado que nao grava ou volta
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = process.env.BASE || BASE;
const APP = require('path').resolve(__dirname, '..');

let falhas = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALHOU: ') + m); if (!c) falhas++; };

let cookie = '';
function novaAba() {
  const win = {};
  const origFetch = global.fetch;
  const sandbox = {
    window: win, console: console,
    fetch: (url, opt) => origFetch(url.startsWith('http') ? url : BASE + url,
      Object.assign({}, opt, { headers: Object.assign({}, (opt && opt.headers) || {}, { Cookie: cookie }) })),
    setTimeout, clearTimeout, setInterval, clearInterval, JSON, Object, Array, String, Number,
    Boolean, Date, Math, Promise, Error, RegExp, isNaN, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'js/vps-sync.js'), 'utf8'), sandbox);
  return win.RTCloud;
}
const ver = async () => (await fetch(BASE + '/api/state', { headers: { Cookie: cookie } }).then(r => r.json()));
const gravarDireto = async (dados) => fetch(BASE + '/api/state', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ dados: dados })
});

(async () => {
  const lg = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'admin', senha: 'TesteLocal#123' })
  });
  cookie = lg.headers.get('set-cookie');
  console.log('login:', lg.status);

  // ============ 7) ACENTO EM CORPO GRANDE ============
  console.log('\n=== 7) ACENTO NAO CORROMPE EM CORPO GRANDE (lerCorpo) ===');
  {
    const d = (await ver()).dados;
    // Enche para o corpo passar de muitos chunks, e põe acento no FIM, onde a
    // fronteira entre pedaços cai.
    const nomes = ['João Conceição', 'Ação Içará', 'Müller Ñoño', 'Çedilha Ãã', 'Ângelo Evangelião'];
    d.candidatos = [];
    for (let i = 0; i < 4000; i++) {
      d.candidatos.push({ id: 'c-ac-' + i, nome: nomes[i % nomes.length] + ' ' + i, obs: 'x'.repeat(200) });
    }
    const r = await gravarDireto(d);
    ok(r.status === 200, 'gravou o estado grande (' + r.status + ')');
    const volta = (await ver()).dados.candidatos;
    const corrompidos = volta.filter(c => /\uFFFD/.test(c.nome || ''));
    console.log('   candidatos gravados:', volta.length, '| tamanho aprox do corpo:', Math.round(JSON.stringify(d).length / 1024) + ' KB');
    ok(corrompidos.length === 0, 'NENHUM nome com caractere corrompido (corrompidos: ' + corrompidos.length + ')');
    const exemplo = volta.find(c => c.id === 'c-ac-0');
    ok(exemplo && exemplo.nome.indexOf('João Conceição') === 0, 'acento intacto: "' + (exemplo && exemplo.nome.slice(0, 20)) + '"');
  }

  // ============ 6) FILA: ALTERAR E REMOVER AGORA GRAVAM ============
  console.log('\n=== 6) FILA: alterar e remover senha GRAVAM (setKeys) ===');
  {
    const d = (await ver()).dados;
    d.fila = {
      contadores: { selecao: 2, dp: 0, geral: 0 },
      senhas: [
        { id: 's-1', numero: 'S001', tipo: 'selecao', nome: '', status: 'aguardando', chamadaEm: null },
        { id: 's-2', numero: 'S002', tipo: 'selecao', nome: '', status: 'aguardando', chamadaEm: null }
      ],
      ultimaChamada: null
    };
    await gravarDireto(d);

    // CHAMAR a senha (muda status de senha EXISTENTE)
    const aba = novaAba();
    const e = await aba.loadState();
    e.fila.senhas.find(s => s.id === 's-1').status = 'chamada';
    e.fila.ultimaChamada = { numero: 'S001', tipo: 'selecao', nome: '', baia: 1, chamadaEm: Date.now() };
    await aba.salvarAgora(e, { merge: true, setKeys: ['fila'] });
    let f = (await ver()).dados.fila;
    ok(f.senhas.find(s => s.id === 's-1').status === 'chamada',
      'chamar a senha GRAVOU (status: ' + f.senhas.find(s => s.id === 's-1').status + ')');

    // RENOMEAR
    const aba2 = novaAba();
    const e2 = await aba2.loadState();
    e2.fila.senhas.find(s => s.id === 's-1').nome = 'Maria Aparecida';
    await aba2.salvarAgora(e2, { merge: true, setKeys: ['fila'] });
    f = (await ver()).dados.fila;
    ok(f.senhas.find(s => s.id === 's-1').nome === 'Maria Aparecida',
      'renomear GRAVOU ("' + f.senhas.find(s => s.id === 's-1').nome + '")');

    // CANCELAR (remove senha existente)
    const aba3 = novaAba();
    const e3 = await aba3.loadState();
    e3.fila.senhas = e3.fila.senhas.filter(s => s.id !== 's-2');
    await aba3.salvarAgora(e3, { merge: true, setKeys: ['fila'] });
    f = (await ver()).dados.fila;
    ok(!f.senhas.some(s => s.id === 's-2'), 'cancelar APAGOU de verdade (sobraram ' + f.senhas.length + ')');

    // LIMPAR TODA A FILA
    const aba4 = novaAba();
    const e4 = await aba4.loadState();
    e4.fila.senhas = [];
    e4.fila.contadores = { selecao: 0, dp: 0, geral: 0 };
    e4.fila.ultimaChamada = null;
    await aba4.salvarAgora(e4, { merge: true, setKeys: ['fila'] });
    f = (await ver()).dados.fila;
    ok(f.senhas.length === 0, 'limpar fila ESVAZIOU (senhas: ' + f.senhas.length + ')');
    ok(f.contadores.selecao === 0, 'e reiniciou o contador (selecao: ' + f.contadores.selecao + ')');
  }

  // ============ 10) ffSigiloLogins: REMOCAO GRAVA ============
  console.log('\n=== 10) SIGILO: tirar o acesso de alguem GRAVA ===');
  {
    const d = (await ver()).dados;
    d.ffSigiloLogins = ['ana', 'bruno'];
    await gravarDireto(d);
    const aba = novaAba();
    const e = await aba.loadState();
    e.ffSigiloLogins = e.ffSigiloLogins.filter(l => l !== 'bruno');
    await aba.salvarAgora(e, { merge: true, setKeys: ['ffSigiloLogins'] });
    const lista = (await ver()).dados.ffSigiloLogins;
    ok(lista.indexOf('bruno') < 0, 'bruno foi REMOVIDO de verdade (lista: ' + JSON.stringify(lista) + ')');
    ok(lista.indexOf('ana') >= 0, 'e a ana continua liberada');
  }

  // ============ 13) LISTA VAZIA: PRIMEIRO ITEM DE CADA UM SOBREVIVE ============
  console.log('\n=== 13) LISTA VAZIA: duas pessoas cadastram o 1o item e os DOIS ficam ===');
  {
    const d = (await ver()).dados;
    d.inaptos = [];                 // lista vazia no servidor
    await gravarDireto(d);
    const ana = novaAba(), bruno = novaAba();
    const eA = await ana.loadState();
    const eB = await bruno.loadState();
    eA.inaptos.push({ id: 'in-ana', nome: 'Inapto da Ana' });
    await ana.salvarAgora(eA);                       // save generico (diff automatico)
    eB.inaptos.push({ id: 'in-bruno', nome: 'Inapto do Bruno' });
    await bruno.salvarAgora(eB);                     // Bruno esta atrasado
    const lista = (await ver()).dados.inaptos;
    const ids = lista.map(x => x.id);
    ok(ids.indexOf('in-ana') >= 0, 'o registro da Ana continua lá (ids: ' + JSON.stringify(ids) + ')');
    ok(ids.indexOf('in-bruno') >= 0, 'e o do Bruno também');
  }

  // ============ LISTA DE TEXTO PURO QUE COMECA VAZIA AINDA GRAVA ============
  console.log('\n=== 13b) lista de TEXTO PURO que comeca vazia continua gravando ===');
  {
    const d = (await ver()).dados;
    d.ffSigiloLogins = [];
    await gravarDireto(d);
    const aba = novaAba();
    const e = await aba.loadState();
    e.ffSigiloLogins = ['carla'];
    await aba.salvarAgora(e);        // save generico: tem que virar setKeys sozinho
    const lista = (await ver()).dados.ffSigiloLogins;
    ok(Array.isArray(lista) && lista.indexOf('carla') >= 0,
      'o primeiro login entrou mesmo com a lista comecando vazia (' + JSON.stringify(lista) + ')');
  }

  // ============ 11) EXCLUSAO DIRETA NO SERVIDOR NAO RESSUSCITA ============
  console.log('\n=== 11) registro excluido no servidor NAO volta com save comum ===');
  {
    const d = (await ver()).dados;
    d.bancoTalentos = [
      { id: 'bt-1', nome: 'Talento Um' },
      { id: 'bt-2', nome: 'Talento Dois' }
    ];
    await gravarDireto(d);
    // A aba carrega o estado COM os dois
    const aba = novaAba();
    const e = await aba.loadState();
    ok(e.bancoTalentos.length === 2, 'a aba carregou os 2 registros');
    // Uma rota de admin apaga direto no servidor (simulado aqui pela gravacao
    // direta, que e o efeito que a rota tem no state.json)
    const dSrv = (await ver()).dados;
    dSrv.bancoTalentos = dSrv.bancoTalentos.filter(t => t.id !== 'bt-2');
    await gravarDireto(dSrv);
    // ANTES da correcao, a aba seguia com o registro velho em memoria e o
    // save comum o empurrava de volta. Agora a aba RESINCRONIZA depois da
    // acao -- aqui reproduzimos essa resincronizacao.
    const eNovo = await aba.loadState();
    ok(eNovo.bancoTalentos.length === 1, 'depois de resincronizar, a aba ve 1 (viu ' + eNovo.bancoTalentos.length + ')');
    // e agora um save comum da aba nao ressuscita nada
    eNovo.candidatos = (eNovo.candidatos || []).slice(0, 5);
    eNovo.candidatos.push({ id: 'c-bt-1', nome: 'Qualquer' });
    await aba.salvarAgora(eNovo);
    const depois = (await ver()).dados.bancoTalentos;
    ok(!depois.some(t => t.id === 'bt-2'), 'o registro excluido NAO voltou (ficaram: ' + depois.map(t => t.id).join(',') + ')');
  }

  console.log('\n' + (falhas === 0 ? 'ETAPA 2 (servidor/sync): TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
