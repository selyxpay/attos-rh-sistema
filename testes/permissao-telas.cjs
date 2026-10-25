// Roda pelo executor da suite:  node testes/rodar.cjs
// O executor sobe um servidor isolado numa porta livre e passa o endereco
// em BASE (e a porta do navegador em CDP, quando a suite precisa de tela).
// TESTES DA ETAPA 5 — permissao por tela, com bloqueio no SERVIDOR
const BASE = process.env.BASE || BASE;
let falhas = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALHOU: ') + m); if (!c) falhas++; };

async function login(l, s) {
  const r = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: l, senha: s })
  });
  return { status: r.status, cookie: r.headers.get('set-cookie') };
}
const pegar = async ck => (await fetch(BASE + '/api/state', { headers: { Cookie: ck } }).then(r => r.json()));
const salvar = async (ck, corpo) => {
  const r = await fetch(BASE + '/api/state', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck },
    body: JSON.stringify(corpo)
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};

(async () => {
  const adm = await login('admin', 'TesteLocal#123');
  console.log('login admin:', adm.status);

  // ---------- o admin define os niveis ----------
  const e0 = await pegar(adm.cookie);
  const d0 = e0.dados;
  const fSem  = d0.funcionarios.find(f => f.login === 'zesem');
  const fVer  = d0.funcionarios.find(f => f.login === 'zever');
  const fEdit = d0.funcionarios.find(f => f.login === 'zeedit');
  ok(!!(fSem && fVer && fEdit), 'as tres contas de teste existem');

  const todasNao = {};
  ['dashboard','vagas','banco-talentos','selecao','depto-pessoal','fluxo-financeiro',
   'whatsapp','bot','funcionarios','controle-acesso','cadastros-exata','documentos',
   'relatorios','site','meu-painel','fila','auditoria','inaptos','configuracoes',
   'lixeira'].forEach(id => { todasNao[id] = 'nao'; });

  fSem.telas  = Object.assign({}, todasNao, { dashboard: 'ver' });                    // sem acesso ao Fluxo
  fVer.telas  = Object.assign({}, todasNao, { dashboard: 'ver', 'fluxo-financeiro': 'ver' });
  fEdit.telas = Object.assign({}, todasNao, { dashboard: 'ver', 'fluxo-financeiro': 'editar' });
  d0.fluxosFinanceiros = [{ id: 'ff-t1', numero: 1, status: 'rascunho', valorTotal: 1000 }];
  d0.precificacao = [{ id: 'pre-t1', item: 'ASO', custo: 50, repasse: 120 }];
  const r0 = await salvar(adm.cookie, { dados: d0, baseVersion: e0.version });
  ok(r0.status === 200, 'admin gravou os niveis e os dados de teste (' + r0.status + ')');

  // ---------- SEM ACESSO ----------
  console.log('\n=== "SEM ACESSO": nao carrega a tela NEM os dados ===');
  const lSem = await login('zesem', 'Sem#123');
  ok(lSem.status === 200, 'login de quem nao tem a tela (' + lSem.status + ')');
  const eSem = await pegar(lSem.cookie);
  const dSem = eSem.dados;
  ok(Array.isArray(dSem.fluxosFinanceiros) && dSem.fluxosFinanceiros.length === 0,
    'as fichas do Fluxo Financeiro NAO descem (recebeu ' + (dSem.fluxosFinanceiros || []).length + ')');
  // Margem saiu do sistema, mas o DADO continua no state.json. A chave segue
  // mapeada para a tela 'margem', que nao existe mais -- entao ninguem tem, e
  // o dado antigo nao desce para ninguem (so para o mestre).
  ok(Array.isArray(dSem.precificacao) && dSem.precificacao.length === 0,
    'o dado do modulo REMOVIDO (Margem) NAO desce (recebeu ' + (dSem.precificacao || []).length + ')');
  ok(!dSem.logs || dSem.logs.length === 0, 'a Auditoria NAO desce');
  // os funcionarios vem enxutos
  const algum = (dSem.funcionarios || [])[0] || {};
  ok(algum.permissoes === undefined && algum.telas === undefined,
    'a lista de funcionarios vem sem permissoes/telas para quem nao administra pessoas');
  ok(algum.nome !== undefined, 'mas ainda tem o nome, porque outras telas mostram autor');

  console.log('\n=== "SEM ACESSO": nao grava nem chamando a API direto ===');
  const dSem2 = (await pegar(lSem.cookie)).dados;
  dSem2.fluxosFinanceiros = [{ id: 'ff-invadida', numero: 99, status: 'pago', valorTotal: 999999 }];
  await salvar(lSem.cookie, { dados: dSem2, merge: true, upsertIds: ['ff-invadida'], baseVersion: 0 });
  const conf1 = (await pegar(adm.cookie)).dados.fluxosFinanceiros;
  ok(!conf1.some(f => f.id === 'ff-invadida'), 'a ficha inventada NAO entrou (' + conf1.map(f => f.id).join(',') + ')');
  ok(conf1.some(f => f.id === 'ff-t1'), 'e a ficha original continua la');

  console.log('\n=== "SEM ACESSO": rota da tela responde 403 ===');
  const r403 = await fetch(BASE + '/api/whatsapp/accounts', { headers: { Cookie: lSem.cookie } });
  ok(r403.status === 403, 'GET /api/whatsapp/accounts -> ' + r403.status + ' (esperado 403)');

  // ---------- SO VER ----------
  console.log('\n=== "SO VER": abre a tela, mas NAO grava ===');
  const lVer = await login('zever', 'Ver#123');
  const eVer = await pegar(lVer.cookie);
  ok((eVer.dados.fluxosFinanceiros || []).length === 1, 'quem tem "so ver" RECEBE as fichas (' + (eVer.dados.fluxosFinanceiros || []).length + ')');
  const dVer = eVer.dados;
  dVer.fluxosFinanceiros[0].status = 'pago';
  dVer.fluxosFinanceiros[0].valorTotal = 777777;
  const rVer = await salvar(lVer.cookie, { dados: dVer, merge: true, upsertIds: ['ff-t1'], baseVersion: eVer.version });
  console.log('   resposta do save:', rVer.status);
  const conf2 = (await pegar(adm.cookie)).dados.fluxosFinanceiros.find(f => f.id === 'ff-t1');
  ok(conf2.status === 'rascunho', 'o status NAO foi alterado por quem so pode ver (ficou: ' + conf2.status + ')');
  ok(conf2.valorTotal === 1000, 'e o valor tambem nao (ficou: ' + conf2.valorTotal + ')');

  // ---------- VER E EDITAR ----------
  console.log('\n=== "VER E EDITAR": grava normalmente ===');
  const lEd = await login('zeedit', 'Edit#123');
  const eEd = await pegar(lEd.cookie);
  const dEd = eEd.dados;
  dEd.fluxosFinanceiros[0].status = 'aguardando_gestao';
  const rEd = await salvar(lEd.cookie, { dados: dEd, merge: true, upsertIds: ['ff-t1'], baseVersion: eEd.version });
  ok(rEd.status === 200, 'save aceito (' + rEd.status + ')');
  const conf3 = (await pegar(adm.cookie)).dados.fluxosFinanceiros.find(f => f.id === 'ff-t1');
  ok(conf3.status === 'aguardando_gestao', 'a alteracao GRAVOU (ficou: ' + conf3.status + ')');

  // ---------- A AUDITORIA AINDA RECEBE LOG DE QUEM NAO VE A TELA ----------
  console.log('\n=== Auditoria: quem nao abre a tela ainda consegue ACRESCENTAR log ===');
  const logsAntes = (await pegar(adm.cookie)).dados.logs.length;
  const dEd2 = (await pegar(lEd.cookie)).dados;
  dEd2.logs = (dEd2.logs || []).concat([{ id: 'log-novo-1', data: 'agora', usuario: 'Ze Edit', acao: 'fez algo', categoria: 'dp' }]);
  await salvar(lEd.cookie, { dados: dEd2, merge: true, upsertIds: ['log-novo-1'], baseVersion: 0 });
  const logsDepois = (await pegar(adm.cookie)).dados.logs;
  ok(logsDepois.some(l => l.id === 'log-novo-1'), 'o log novo foi ACRESCENTADO (' + logsAntes + ' -> ' + logsDepois.length + ')');
  // e nao consegue APAGAR a auditoria
  const dEd3 = (await pegar(lEd.cookie)).dados;
  dEd3.logs = [];
  await salvar(lEd.cookie, { dados: dEd3, merge: true, setKeys: ['logs'], baseVersion: 0 });
  const logsFinal = (await pegar(adm.cookie)).dados.logs;
  ok(logsFinal.length >= logsDepois.length, 'e NAO conseguiu apagar a auditoria (' + logsFinal.length + ' registros)');

  // ---------- CONTA ANTIGA (sem o campo telas) MANTEM O ACESSO DE HOJE ----------
  console.log('\n=== CONTA ANTIGA (sem "telas"): mantem o acesso de hoje ===');
  const lAnt = await login('zeantigo', 'Antigo#123');
  ok(lAnt.status === 200, 'login da conta antiga (' + lAnt.status + ')');
  const dAnt = (await pegar(lAnt.cookie)).dados;
  // zeantigo e do DP sem mapa de telas: hoje ele ve depto-pessoal,
  // banco-talentos e o Fluxo Financeiro (regra por departamento)
  ok(Array.isArray(dAnt.candidatos), 'recebe a lista de candidatos (tela do DP)');
  ok((dAnt.precificacao || []).length === 0, 'mas NAO recebe o dado do modulo removido (Margem)');
  const dAnt2 = Object.assign({}, dAnt);
  dAnt2.candidatos = (dAnt2.candidatos || []).concat([{ id: 'cand-antigo-1', nome: 'Fulano', status: 'aprovado' }]);
  await salvar(lAnt.cookie, { dados: dAnt2, merge: true, upsertIds: ['cand-antigo-1'], baseVersion: 0 });
  const confCand = (await pegar(adm.cookie)).dados.candidatos;
  ok(confCand.some(c => c.id === 'cand-antigo-1'), 'e CONTINUA conseguindo cadastrar candidato (nao perdeu acesso)');

  // ---------- ADMIN SEGUE COM TUDO ----------
  console.log('\n=== ADMIN continua com acesso total ===');
  const dAdm = (await pegar(adm.cookie)).dados;
  ok((dAdm.fluxosFinanceiros || []).length >= 1, 'admin ve as fichas');
  ok((dAdm.precificacao || []).length >= 1, 'o mestre ainda enxerga o dado antigo da Margem (nada foi apagado)');
  ok((dAdm.logs || []).length >= 1, 'admin ve a Auditoria');
  ok((dAdm.funcionarios || []).some(f => f.permissoes !== undefined || f.telas !== undefined),
    'admin ve as permissoes dos funcionarios');

  console.log('\n' + (falhas === 0 ? 'ETAPA 5: TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
