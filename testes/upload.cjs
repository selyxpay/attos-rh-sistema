// Roda pelo executor da suite:  node testes/rodar.cjs
// O executor sobe um servidor isolado numa porta livre e passa o endereco
// em BASE (e a porta do navegador em CDP, quando a suite precisa de tela).
// TESTES DO UPLOAD: tipo conferido pelo CONTEUDO, SVG barrado no anonimo,
// SVG sempre como anexo, nosniff em tudo que sai de /uploads/.
const BASE = process.env.BASE || BASE;
let falhas = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALHOU: ') + m); if (!c) falhas++; };

const b64 = b => Buffer.from(b).toString('base64');
const dataUrl = (mime, buf) => 'data:' + mime + ';base64,' + b64(buf);

// conteudos de verdade
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000100ffabce36890000000049454e44ae426082', 'hex');
const JPEG = Buffer.concat([Buffer.from('ffd8ffe000104a46494600010100000100010000', 'hex'), Buffer.alloc(32), Buffer.from('ffd9', 'hex')]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const SVG_XML = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const HTML = Buffer.from('<!DOCTYPE html><html><script>alert(1)</script></html>');
const PDF = Buffer.from('%PDF-1.4\n% teste\n');

async function login() {
  const r = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'admin', senha: 'TesteLocal#123' })
  });
  return r.headers.get('set-cookie');
}
async function subir(cookie, mime, buf, hint) {
  const r = await fetch(BASE + '/api/upload', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
    body: JSON.stringify({ dataUrl: dataUrl(mime, buf), hint: hint || 'teste' })
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
}
async function servir(url) {
  const r = await fetch(BASE + url);
  return {
    status: r.status,
    ct: r.headers.get('content-type') || '',
    cd: r.headers.get('content-disposition') || '',
    nosniff: r.headers.get('x-content-type-options') || ''
  };
}

(async () => {
  const cookie = await login();
  console.log('login:', cookie ? 'ok' : 'FALHOU');

  console.log('\n=== SEM LOGIN: SVG e RECUSADO ===');
  const a1 = await subir(null, 'image/svg+xml', SVG);
  ok(a1.status === 400, 'SVG declarado como image/svg+xml -> ' + a1.status + ' (esperado 400)');
  const a2 = await subir(null, 'image/png', SVG);
  ok(a2.status === 400, 'SVG DISFARCADO de image/png -> ' + a2.status + ' (o conteudo manda, nao o que o cliente diz)');
  const a3 = await subir(null, 'image/png', SVG_XML);
  ok(a3.status === 400, 'SVG com <?xml ... disfarcado de png -> ' + a3.status);

  console.log('\n=== SEM LOGIN: HTML RENOMEADO/DISFARCADO e RECUSADO ===');
  const a4 = await subir(null, 'image/jpeg', HTML, 'foto.jpg');
  ok(a4.status === 400, 'HTML anunciado como image/jpeg com hint "foto.jpg" -> ' + a4.status);

  console.log('\n=== SEM LOGIN: FOTO DE VERDADE CONTINUA PASSANDO ===');
  console.log('(a ficha publica de candidatura e o banco de talentos dependem disto)');
  const p1 = await subir(null, 'image/png', PNG, 'rg_frente');
  ok(p1.status === 200, 'PNG real sem login -> ' + p1.status);
  ok(p1.corpo.tipo === 'png', 'o servidor identificou como png (' + p1.corpo.tipo + ')');
  const p2 = await subir(null, 'image/jpeg', JPEG, 'selfie');
  ok(p2.status === 200, 'JPEG real sem login -> ' + p2.status);
  // e a extensao gravada vem do CONTEUDO, nao do que foi declarado
  const p3 = await subir(null, 'image/gif', PNG, 'mentindo');
  ok(p3.status === 200, 'PNG declarado como gif ainda e aceito (e imagem de verdade)');
  ok(/\.png$/.test(p3.corpo.url || ''), 'mas gravado com a extensao do CONTEUDO: ' + p3.corpo.url);

  console.log('\n=== COM LOGIN: SVG entra, mas SEMPRE como anexo ===');
  const s1 = await subir(cookie, 'image/svg+xml', SVG, 'logo');
  ok(s1.status === 200, 'SVG com login -> ' + s1.status);
  ok(/\.svg$/.test(s1.corpo.url || ''), 'gravado como .svg (' + s1.corpo.url + ')');
  const e1 = await servir(s1.corpo.url);
  ok(!/image\/svg/i.test(e1.ct), 'NAO sai como image/svg+xml (saiu "' + e1.ct + '")');
  ok(/attachment/i.test(e1.cd), 'vem como ANEXO ("' + e1.cd + '")');
  ok(/nosniff/i.test(e1.nosniff), 'e com nosniff ("' + e1.nosniff + '")');

  console.log('\n=== COM LOGIN: HTML continua barrado ===');
  const h1 = await subir(cookie, 'text/html', HTML);
  ok(h1.status === 400, 'HTML com login -> ' + h1.status + ' (esperado 400)');

  console.log('\n=== FOTO E ENTREGUE INLINE (a tela mostra no <img>) ===');
  const f1 = await servir(p1.corpo.url);
  ok(/image\/png/i.test(f1.ct), 'PNG sai como image/png ("' + f1.ct + '")');
  ok(!/attachment/i.test(f1.cd), 'e NAO como anexo, senao a foto nao aparece');
  ok(/nosniff/i.test(f1.nosniff), 'com nosniff ("' + f1.nosniff + '")');
  const f2 = await servir(p2.corpo.url);
  ok(/image\/jpeg/i.test(f2.ct), 'JPEG sai como image/jpeg ("' + f2.ct + '")');
  ok(!/attachment/i.test(f2.cd), 'e inline');

  console.log('\n=== PDF com login: entra e sai como anexo ===');
  const d1 = await subir(cookie, 'application/pdf', PDF, 'contrato');
  ok(d1.status === 200, 'PDF com login -> ' + d1.status);
  const d2 = await servir(d1.corpo.url);
  ok(/attachment/i.test(d2.cd), 'PDF vem como anexo ("' + d2.cd + '")');
  ok(/nosniff/i.test(d2.nosniff), 'com nosniff');

  console.log('\n=== nosniff em TUDO que sai de /uploads/ ===');
  const todos = [p1.corpo.url, p2.corpo.url, s1.corpo.url, d1.corpo.url].filter(Boolean);
  let semNosniff = [];
  for (const u of todos) {
    const r = await servir(u);
    if (!/nosniff/i.test(r.nosniff)) semNosniff.push(u);
  }
  ok(semNosniff.length === 0, todos.length + ' arquivos conferidos, todos com nosniff' +
    (semNosniff.length ? ' (sem: ' + semNosniff.join(',') + ')' : ''));

  console.log('\n=== ARQUIVO VAZIO e BASE64 QUEBRADO nao passam ===');
  const v1 = await subir(cookie, 'image/png', Buffer.alloc(0));
  ok(v1.status === 400, 'arquivo vazio -> ' + v1.status);

  console.log('\n' + (falhas === 0 ? 'UPLOAD: TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
