// Roda pelo executor da suite:  node testes/rodar.cjs midia
// Precisa de servidor (nao precisa de navegador).
//
// A MIDIA QUE CHEGA do contato (foto, audio, video, documento, figurinha).
// Os tres defeitos que esta suite tranca:
//   1) o endereco do arquivo era gravado direto no banco em memoria
//      (getDb().prepare(...).run(...)), sem passar pelo helper que salva em
//      disco: no reinicio seguinte a foto "desaparecia" mesmo com o arquivo
//      salvo no volume;
//   2) o audio de voz chega como "audio/ogg; codecs=opus" e a tabela de
//      extensoes comparava a string inteira: virava ".bin", servido como
//      octet-stream, e o player nao tocava;
//   3) midia que a Meta ja apagou ficava para sempre em "(baixando...)".
//
// O que NAO da para testar aqui: o download de verdade da Graph API. Exige
// conta e token reais. De proposito a conta do teste nasce sem token, e e isso
// que faz a rota parar antes de tentar a internet, com recado claro.
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.BASE;
if (!BASE) {
  console.error('Este teste roda pelo executor da suite:  node testes/rodar.cjs');
  process.exit(2);
}
const DADOS = process.env.DADOS || '';
const RAIZ = path.resolve(__dirname, '..');

let falhas = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALHOU: ') + m); if (!c) falhas++; };

async function esperarPor(fn, limiteMs, oQue) {
  const fim = Date.now() + (limiteMs || 15000);
  while (Date.now() < fim) {
    try { const v = await fn(); if (v) return v; } catch (e) { /* tenta de novo */ }
    await new Promise(function (r) { setTimeout(r, 200); });
  }
  console.log('  (limite) esperei ' + ((limiteMs || 15000) / 1000) + 's por: ' + oQue);
  return null;
}

// Arquivos de verdade, pelos bytes de cabecalho — e assim que o servidor
// decide o tipo (nunca pela extensao).
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000100ffabce36890000000049454e44ae426082', 'hex');
const OGG = Buffer.concat([Buffer.from('OggS', 'latin1'), Buffer.alloc(80)]);
const MP4 = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom', 'latin1'), Buffer.alloc(80)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n', 'latin1'), Buffer.alloc(120, 0x20)]);
const WEBP = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(4), Buffer.from('WEBP', 'latin1'), Buffer.alloc(60)]);

// ── A) EXTENSAO A PARTIR DO TIPO QUE A META MANDA ──────────────────────────
function testarTipos() {
  console.log('=== A) O TIPO QUE A META MANDA VIRA A EXTENSAO CERTA ===');
  const api = require(path.join(RAIZ, 'whatsapp-api.cjs'));
  const casos = [
    ['audio/ogg; codecs=opus', 'ogg', 'audio de voz do WhatsApp (era o que falhava)'],
    ['audio/ogg', 'ogg', 'audio ogg simples'],
    ['audio/mpeg', 'mp3', 'mp3'],
    ['audio/mp4', 'm4a', 'audio m4a'],
    ['image/jpeg', 'jpg', 'foto jpeg'],
    ['image/webp', 'webp', 'figurinha webp'],
    ['video/mp4', 'mp4', 'video'],
    ['application/pdf', 'pdf', 'documento pdf'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx', 'documento word'],
    ['IMAGE/PNG', 'png', 'tipo em maiuscula']
  ];
  casos.forEach(function (c) {
    const r = api.mimeToExt(c[0]);
    ok(r === c[1], c[2] + ': "' + c[0] + '" -> ' + r);
  });
  ok(api.mimeToExt('') === null, 'tipo vazio devolve null (vira .bin, e esta certo)');
}

// ── B) GRAVACAO DA MIDIA QUE PERSISTE ──────────────────────────────────────
async function testarPersistencia() {
  console.log('\n=== B) O ENDERECO DO ARQUIVO SOBREVIVE AO REINICIO ===');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-midia-'));
  const db = require(path.join(RAIZ, 'whatsapp-db.cjs'));
  await db.init(tmp);

  const acc = db.accounts.create({ phone_number_id: 'pn-midia', display_phone: '+55 11 90000-0000', status: 'connected' });
  const ct = db.contacts.create({ phone: '5511900000002', name: 'Maria Silva', profile_name: 'Maria' });
  const contactId = (ct && ct.id) ? ct.id : ct;
  const conv = db.conversations.create({ account_id: acc, contact_id: contactId });

  const idFoto = db.messages.create({
    conversation_id: conv, account_id: acc, direction: 'incoming', type: 'image',
    content: '', media_id: 'MID-FOTO-1', wamid: 'w-foto-1'
  });
  const idAudio = db.messages.create({
    conversation_id: conv, account_id: acc, direction: 'incoming', type: 'audio',
    content: '', media_id: 'MID-AUDIO-1', wamid: 'w-audio-1'
  });
  ok(!!idFoto && !!idAudio, 'duas mensagens com midia criadas');

  // Antes de baixar: as duas estao pendentes.
  let pend = db.messages.pendentesDeMidia(conv, 10);
  ok(pend.length === 2, 'as duas aparecem como pendentes de midia (deu ' + pend.length + ')');

  // Baixou a foto.
  db.messages.gravarMidia(idFoto, {
    media_url: '/api/whatsapp/midia/wa_teste_1.jpg',
    media_mime_type: 'image/jpeg', media_filename: 'foto.jpg'
  });
  pend = db.messages.pendentesDeMidia(conv, 10);
  ok(pend.length === 1 && pend[0].id === idAudio, 'a foto sai da fila de pendentes (sobrou ' + pend.length + ')');

  // AUDIO ANTIGO SALVO COMO ".bin": entra na fila de novo, porque nenhum
  // navegador toca aquilo. O arquivo velho fica onde esta (nada e apagado).
  db.messages.gravarMidia(idAudio, {
    media_url: '/uploads/wa_velho_audio.bin', media_mime_type: '', media_filename: ''
  });
  pend = db.messages.pendentesDeMidia(conv, 10);
  ok(pend.length === 1 && pend[0].id === idAudio,
    'audio antigo salvo como ".bin" volta para a fila, para baixar com a extensao certa');

  // O audio: a Meta ja apagou. Falha DEFINITIVA, nao fica tentando para sempre.
  db.messages.falhouMidia(idAudio, 'Não foi possível obter URL da mídia.', true);
  pend = db.messages.pendentesDeMidia(conv, 10);
  ok(pend.length === 0, 'midia que a Meta apagou sai da fila (nao insiste eternamente)');
  const audio = db.messages.getById(idAudio);
  ok(audio.media_falhou === 1, 'e fica marcada como falha definitiva (a tela mostra "midia nao disponivel")');
  ok(audio.media_tentativas >= 1, 'com a contagem de tentativas (deu ' + audio.media_tentativas + ')');

  // A PARTE QUE ESTAVA QUEBRADA: fecha (salva) e abre de novo do disco.
  db.close();
  await db.init(tmp);
  const foto = db.messages.getById(idFoto);
  ok(foto && foto.media_url === '/api/whatsapp/midia/wa_teste_1.jpg',
    'depois de FECHAR e ABRIR o banco, o endereco da foto continua la (deu "' + (foto && foto.media_url) + '")');
  ok(foto && foto.media_mime_type === 'image/jpeg', 'e o tipo tambem');
  const audio2 = db.messages.getById(idAudio);
  ok(audio2 && audio2.media_falhou === 1, 'a marca de falha tambem sobrevive');

  console.log('\n=== C) A ORDENACAO POR DATA CONTINUA CERTA COM MIDIA ===');
  // A janela de 24h olha a ULTIMA mensagem recebida — inclusive foto e audio,
  // que nao tem texto. A correcao da ordenacao (julianday) vale aqui tambem.
  db.getDb().run("UPDATE whatsapp_messages SET created_at = datetime('now','-30 hours') WHERE wamid = 'w-foto-1'");
  db.getDb().run("UPDATE whatsapp_messages SET created_at = strftime('%Y-%m-%dT%H:%M:%S','now','-3 hours') WHERE wamid = 'w-audio-1'");
  let ult = db.messages.ultimaRecebida(conv);
  ok(ult && Number(ult.horas) > 2.5 && Number(ult.horas) < 3.5,
    'com foto de 30h e audio de 3h, vale o AUDIO (deu ' + (ult && Number(ult.horas).toFixed(1)) + 'h)');
  db.messages.create({
    conversation_id: conv, account_id: acc, direction: 'incoming', type: 'video',
    content: '', media_id: 'MID-VIDEO-1', wamid: 'w-video-1'
  });
  ult = db.messages.ultimaRecebida(conv);
  ok(ult && Number(ult.horas) < 1, 'chegando um video agora, a janela reabre (deu ' + (ult && Number(ult.horas).toFixed(2)) + 'h)');

  db.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}

// ── D) PELO SERVIDOR: A ROTA QUE SERVE A MIDIA ─────────────────────────────
async function login(usuario, senha) {
  const r = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: usuario, senha: senha })
  });
  return { status: r.status, cookie: r.headers.get('set-cookie') };
}

async function testarRota(adm) {
  console.log('\n=== D) A ROTA DA MIDIA: COM SESSAO, COM O TIPO CERTO, FORA DO PUBLICO ===');
  if (!DADOS) { console.log('  (pulado) o executor nao passou a pasta de dados'); return; }
  const waDir = path.join(DADOS, 'wa-midia');
  const upDir = path.join(DADOS, 'uploads');
  fs.mkdirSync(waDir, { recursive: true });
  fs.mkdirSync(upDir, { recursive: true });
  // Arquivos como o download os nomearia.
  fs.writeFileSync(path.join(waDir, 'wa_teste_foto.jpg'), PNG);       // bytes de PNG
  fs.writeFileSync(path.join(waDir, 'wa_teste_voz.ogg'), OGG);
  fs.writeFileSync(path.join(waDir, 'wa_teste_video.mp4'), MP4);
  fs.writeFileSync(path.join(waDir, 'wa_teste_doc.pdf'), PDF);
  fs.writeFileSync(path.join(waDir, 'wa_teste_fig.webp'), WEBP);
  fs.writeFileSync(path.join(waDir, 'outro_arquivo.png'), PNG);       // nao e midia do WhatsApp
  // Mídia ANTIGA, que ficou na pasta publica: a rota precisa achar tambem.
  fs.writeFileSync(path.join(upDir, 'wa_antigo_foto.jpg'), PNG);

  const pega = async function (arq, cookie) {
    const r = await fetch(BASE + '/api/whatsapp/midia/' + encodeURIComponent(arq),
      cookie ? { headers: { Cookie: cookie } } : {});
    return { status: r.status, tipo: r.headers.get('content-type') || '', nosniff: r.headers.get('x-content-type-options') || '' };
  };

  const semSessao = await pega('wa_teste_foto.jpg', null);
  ok(semSessao.status === 401 || semSessao.status === 403, 'sem sessao nao sai (' + semSessao.status + ')');

  const foto = await pega('wa_teste_foto.jpg', adm.cookie);
  ok(foto.status === 200, 'foto sai para quem tem sessao (' + foto.status + ')');
  ok(/image\/png/.test(foto.tipo), 'e com o tipo do CONTEUDO, nao da extensao (' + foto.tipo + ')');
  ok(/nosniff/i.test(foto.nosniff), 'com nosniff');

  const voz = await pega('wa_teste_voz.ogg', adm.cookie);
  ok(voz.status === 200, 'audio de voz sai (' + voz.status + ')');
  ok(/audio\/ogg/.test(voz.tipo), 'COMO AUDIO, que e o que faz o player tocar (' + voz.tipo + ')');

  const video = await pega('wa_teste_video.mp4', adm.cookie);
  ok(video.status === 200 && /video\/mp4/.test(video.tipo), 'video sai como video/mp4 (' + video.tipo + ')');

  const doc = await pega('wa_teste_doc.pdf', adm.cookie);
  ok(doc.status === 200 && /application\/pdf/.test(doc.tipo), 'documento sai como pdf (' + doc.tipo + ')');

  const fig = await pega('wa_teste_fig.webp', adm.cookie);
  ok(fig.status === 200 && /image\/webp/.test(fig.tipo), 'figurinha sai como webp (' + fig.tipo + ')');

  const antigo = await pega('wa_antigo_foto.jpg', adm.cookie);
  ok(antigo.status === 200, 'midia ANTIGA, que ficou na pasta de uploads, continua aparecendo (' + antigo.status + ')');

  const outro = await pega('outro_arquivo.png', adm.cookie);
  ok(outro.status === 404, 'arquivo que nao e midia do WhatsApp nao sai por esta rota (' + outro.status + ')');

  const fuga = await pega('../state.json', adm.cookie);
  ok(fuga.status !== 200, 'tentar sair da pasta com ".." nao funciona (' + fuga.status + ')');

  // A pasta nova NAO e publica.
  const pub = await fetch(BASE + '/uploads/wa_teste_foto.jpg');
  ok(pub.status === 404, 'a midia recebida NAO sai por /uploads/ (' + pub.status + ')');

  console.log('\n=== E) PERMISSAO ===');
  const lc = await login('zecomum', 'Comum#123');
  if (lc.status === 200) {
    const r = await pega('wa_teste_foto.jpg', lc.cookie);
    ok(r.status === 403, 'quem nao tem a tela WhatsApp recebe 403 (' + r.status + ')');
  } else {
    console.log('  (pulado) nao ha conta comum semeada');
  }
}

// ── F) MENSAGEM SEM ARQUIVO: TENTAR DE NOVO SEM QUEBRAR ────────────────────
async function testarTentarDeNovo(adm) {
  console.log('\n=== F) MENSAGEM ANTIGA SEM ARQUIVO: TENTA DE NOVO E AVISA ===');
  const telefone = '5511966665555';
  const evento = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'waba-midia',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '5511900000000', phone_number_id: 'pn-teste-midia' },
          contacts: [{ profile: { name: 'Joana Teste' }, wa_id: telefone }],
          messages: [{
            from: telefone, id: 'wamid.MIDIA1', timestamp: String(Math.floor(Date.now() / 1000)),
            type: 'image', image: { id: 'MEDIA-ID-FALSO-1', mime_type: 'image/jpeg', caption: 'olha a foto' }
          }]
        }
      }]
    }]
  };
  const wh = await fetch(BASE + '/webhooks/whatsapp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(evento)
  });
  ok(wh.status === 200, 'o webhook aceitou a foto (' + wh.status + ')');

  const conv = await esperarPor(async function () {
    const j = await fetch(BASE + '/api/whatsapp/conversations?limit=50', { headers: { Cookie: adm.cookie } }).then(r => r.json());
    const lista = (j && (j.conversations || j.data || j.lista)) || [];
    return lista.find(function (c) { return String(c.contact_phone || '') === telefone; }) || null;
  }, 15000, 'a conversa da foto aparecer');
  ok(!!conv, 'a conversa foi criada');
  if (!conv) return;

  // A lista de conversas nao mostra "—" para foto: mostra o tipo.
  ok(String(conv.last_message_type || '') === 'image', 'a conversa guarda o TIPO da ultima mensagem (' + conv.last_message_type + ')');

  const det = await fetch(BASE + '/api/whatsapp/conversations/' + conv.id, { headers: { Cookie: adm.cookie } })
    .then(r => r.json()).catch(function () { return {}; });
  const msgs = (det && det.messages) || [];
  const foto = msgs.find(function (m) { return m.type === 'image'; });
  ok(!!foto, 'a mensagem de foto esta na conversa');
  ok(!!foto && String(foto.media_id || '') === 'MEDIA-ID-FALSO-1', 'com o media id guardado, para tentar depois');
  ok(!!foto && !foto.media_url, 'e sem arquivo (a conta do teste nao tem token)');

  // Tentar de novo UMA mensagem: responde sem quebrar, com recado claro.
  const r1 = await fetch(BASE + '/api/whatsapp/mensagens/' + foto.id + '/midia',
    { method: 'POST', headers: { Cookie: adm.cookie } });
  const j1 = await r1.json().catch(function () { return {}; });
  ok(r1.status === 200 && j1.ok === false, 'tentar de novo responde sem quebrar, com ok=false (' + r1.status + ')');
  ok(/token|conta/i.test(j1.error || ''), 'e explica o motivo: "' + (j1.error || '') + '"');

  // Tentar de novo a CONVERSA inteira. O CONTRATO E RESPONDER NA HORA (202) e
  // baixar em segundo plano: segurar a resposta ate o download terminar era o
  // que fazia o proxy devolver 502 ("Bad Gateway") na tela.
  const t0 = Date.now();
  const r2 = await fetch(BASE + '/api/whatsapp/conversations/' + conv.id + '/midia-pendente',
    { method: 'POST', headers: { Cookie: adm.cookie } });
  const j2 = await r2.json().catch(function () { return {}; });
  const demorou = Date.now() - t0;
  ok(r2.status === 202 && j2.ok === true, 'a varredura da conversa aceita o pedido (' + r2.status + ')');
  ok(j2.em_segundo_plano === true, 'e diz que o trabalho vai em segundo plano');
  ok(Number(j2.pendentes) >= 1, 'dizendo quantas estavam pendentes (' + j2.pendentes + ')');
  ok(demorou < 2000, 'E RESPONDE RAPIDO, sem esperar download nenhum (' + demorou + 'ms)');

  // Pedir de novo na sequencia nao empilha fila: a resposta continua rapida.
  const t1 = Date.now();
  const r2b = await fetch(BASE + '/api/whatsapp/conversations/' + conv.id + '/midia-pendente',
    { method: 'POST', headers: { Cookie: adm.cookie } });
  await r2b.json().catch(function () { return {}; });
  ok(r2b.status === 202 && (Date.now() - t1) < 2000, 'pedir de novo tambem responde na hora (' + (Date.now() - t1) + 'ms)');

  // Mensagem que nao existe.
  const r3 = await fetch(BASE + '/api/whatsapp/mensagens/999999/midia',
    { method: 'POST', headers: { Cookie: adm.cookie } });
  ok(r3.status === 404, 'mensagem que nao existe: 404 (' + r3.status + ')');

  console.log('\n=== G) SERVIDOR DE PE NO FIM ===');
  const vivo = await fetch(BASE + '/api/time');
  ok(vivo.status === 200, 'servidor respondendo (' + vivo.status + ')');
  const saude = await fetch(BASE + '/api/saude').then(r => r.json()).catch(function () { return {}; });
  ok(saude.ok === true && saude.whatsapp && saude.whatsapp.modulos_carregados === true,
    '/api/saude diz que o WhatsApp esta de pe');
}

(async () => {
  testarTipos();
  await testarPersistencia();
  const adm = await login('admin', 'TesteLocal#123');
  ok(adm.status === 200, 'login do admin (' + adm.status + ')');
  await testarRota(adm);
  await testarTentarDeNovo(adm);
  console.log('\n' + (falhas === 0 ? 'MIDIA RECEBIDA: TODOS OS TESTES OK' : falhas + ' FALHA(S)'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e.stack || e.message); process.exit(1); });
