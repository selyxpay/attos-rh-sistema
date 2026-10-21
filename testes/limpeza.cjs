// Roda pelo executor da suite:  node testes/rodar.cjs
// O executor sobe um servidor isolado numa porta livre e passa o endereco
// em BASE (e a porta do navegador em CDP, quando a suite precisa de tela).
// TESTES DA ETAPA 4 — limpeza e endurecimento
const BASE = process.env.BASE || BASE;
let falhas = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALHOU: ') + m); if (!c) falhas++; };
const vivo = async () => { try { return (await fetch(BASE + '/api/time', { signal: AbortSignal.timeout(4000) })).status; } catch (e) { return 0; } };

(async () => {
  const lg = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'admin', senha: 'TesteLocal#123' })
  });
  const cookie = lg.headers.get('set-cookie');
  console.log('login:', lg.status);

  console.log('\n=== CORPO INVALIDO NAO DERRUBA (literal null, numero, texto) ===');
  const rotas = [
    '/api/whatsapp/accounts',
    '/api/whatsapp/conversations/1/assign',
    '/api/whatsapp/conversations/1/close',
    '/api/state',
    '/api/upload',
  ];
  const corpos = ['null', '123', '"texto"', '[]', 'true'];
  for (const rota of rotas) {
    for (const corpo of corpos) {
      let st = 0;
      try {
        st = (await fetch(BASE + rota, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookie },
          body: corpo, signal: AbortSignal.timeout(5000)
        })).status;
      } catch (e) { st = 0; }
      const depois = await vivo();
      if (depois !== 200) { ok(false, rota + ' com corpo ' + corpo + ' DERRUBOU o servidor'); break; }
    }
    ok((await vivo()) === 200, rota + ': aguentou os 5 corpos invalidos e continua de pe');
  }

  console.log('\n=== ROTA DE WHATSAPP INEXISTENTE RESPONDE 404, NAO CAI ===');
  const r404 = await fetch(BASE + '/api/whatsapp/isso-nao-existe', { headers: { Cookie: cookie } });
  ok(r404.status === 404 || r404.status === 503, 'rota inexistente respondeu ' + r404.status);
  ok((await vivo()) === 200, 'servidor continua de pe');

  console.log('\n=== SERVIDOR DE PE NO FIM ===');
  ok((await vivo()) === 200, 'respondendo');

  console.log('\n' + (falhas === 0 ? 'ETAPA 4 (servidor): TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
