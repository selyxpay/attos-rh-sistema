// ==========================================================================
// BOT DE ATENDIMENTO DO WHATSAPP OFICIAL
// --------------------------------------------------------------------------
// Para que serve: a pessoa chama no WhatsApp e precisa ser encaminhada para o
// lugar certo (principalmente o link de cadastro nas vagas) sem ninguém
// responder um por um.
//
// ONDE CADA COISA MORA
//   A CONFIGURAÇÃO (ligado, modo, passos, textos) fica no state.json, em
//   `botWhatsapp`. Assim ela usa o contrato de gravação do sistema
//   (setKeys/upsertIds), a permissão por tela e a Auditoria, como todo o resto.
//   O ESTADO DE EXECUÇÃO (quem já recebeu, fila, contagem do dia) fica no
//   SQLite do WhatsApp, porque muda a cada mensagem e inflaria o state.json.
//
// A ORDEM DE DECISÃO É A PARTE MAIS IMPORTANTE DESTE ARQUIVO.
// Ela está em `decidir()` e é, nesta ordem:
//   1. pediu para sair           -> nunca mais nada automático
//   2. pediu atendente           -> avisa, marca a conversa e para
//   3. contato pausado           -> não responde
//   4. já está no meio de uma    -> encerra o que falta, não reinicia
//   5. regra do modo escolhido   -> responde se couber no limite
//   6. nada disso                -> não responde, deixa para o atendente
// Mudar essa ordem muda o comportamento do sistema inteiro. Se precisar
// mexer, mexa aqui e nos testes de uma vez.
//
// Node puro, sem dependência nova.

const fs = require('fs');
const path = require('path');

let _db = null;         // whatsapp-db
let _api = null;        // whatsapp-api
let _lerConfig = null;  // função que devolve o state.botWhatsapp
let _notificar = null;  // SSE
let _pastaMidia = '';
let _timer = null;
let _ocupado = false;

// ── CONFIGURAÇÃO PADRÃO ────────────────────────────────────────────────────
// O bot nasce DESLIGADO de propósito: depois do deploy ninguém é surpreendido
// por mensagem automática saindo sem alguém ter decidido ligar.
const CONFIG_PADRAO = {
  ligado: false,
  modo: 'primeira_vez',            // 'primeira_vez' | 'sempre'
  diasParaNovoContato: 7,          // no modo primeira_vez, volta a responder depois disto
  limiteSempre: '1_dia',           // '1_dia' | '2_dia' | 'horas'
  limiteHoras: 6,                  // quando limiteSempre === 'horas'
  linkVagas: '',
  intervaloPadraoSeg: 3,
  passos: [],
  atendente: {
    palavras: ['atendente', 'falar com alguem', 'falar com alguém', 'humano', 'pessoa'],
    mensagem: 'Já chamei alguém da equipe para falar com você. Em instantes alguém responde por aqui.',
    voltarAposHoras: 12
  },
  saida: {
    palavras: ['sair', 'parar', 'nao quero', 'não quero', 'descadastrar', 'remover'],
    mensagem: 'Tudo bem, não vou mais enviar mensagens automáticas. Se precisar, é só escrever aqui.'
  },
  ritmo: { porMinuto: 20 },
  // LEMBRETE DO BOT. Mesma forma usada pelas mensagens prontas, e quem envia é
  // o mesmo motor (whatsapp-lembretes.cjs). Nasce DESLIGADO e sem texto: tudo
  // que vai para a pessoa é escrito na tela, nada fica fixo aqui.
  lembrete: { ligado: false, titulo: '', horario: '', data: '', lembretes: [] },
  // Momento em que o bot foi ligado, para a faixa "Bot no ar desde HH:MM".
  ligadoEm: ''
};

function configAtual() {
  let c = {};
  try { c = (_lerConfig && _lerConfig()) || {}; } catch (e) { c = {}; }
  const saida = Object.assign({}, CONFIG_PADRAO, c);
  saida.atendente = Object.assign({}, CONFIG_PADRAO.atendente, c.atendente || {});
  saida.saida = Object.assign({}, CONFIG_PADRAO.saida, c.saida || {});
  saida.ritmo = Object.assign({}, CONFIG_PADRAO.ritmo, c.ritmo || {});
  if (!Array.isArray(saida.passos)) saida.passos = [];
  return saida;
}

// ── TEXTO ──────────────────────────────────────────────────────────────────
// Compara sem depender de maiúscula, acento ou pontuação.
function normalizar(txt) {
  return String(txt == null ? '' : txt)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function contemPalavra(texto, palavras) {
  const t = normalizar(texto);
  if (!t) return false;
  return (palavras || []).some(function (p) {
    const n = normalizar(p);
    if (!n) return false;
    // palavra inteira, não pedaço: "sair" não casa com "saindo"
    return new RegExp('(^|\\s)' + n.replace(/\s+/g, '\\s+') + '($|\\s)').test(t);
  });
}

// Saudação pelo horário de Brasília, independente do fuso do servidor.
function saudacao(agora) {
  const d = agora || new Date();
  let h;
  try {
    h = Number(new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false
    }).format(d));
  } catch (e) {
    h = (d.getUTCHours() - 3 + 24) % 24;   // sem Intl: UTC-3
  }
  if (h >= 5 && h < 12) return 'bom dia';
  if (h >= 12 && h < 18) return 'boa tarde';
  return 'boa noite';
}

// Primeiro nome, para a frase não ficar pomposa.
function primeiroNome(nome) {
  const limpo = String(nome || '').trim();
  if (!limpo) return '';
  const p = limpo.split(/\s+/)[0];
  // Nome que é só número (telefone sem nome) não serve como nome.
  if (/^\d+$/.test(p)) return '';
  return p;
}

// Troca as variáveis. {nome} vazio NÃO deixa a frase estranha: a vírgula e o
// espaço que sobrariam saem junto. "Olá {nome}, tudo bem?" vira "Olá, tudo
// bem?" e não "Olá , tudo bem?".
function aplicarVariaveis(texto, dados) {
  let t = String(texto == null ? '' : texto);
  const nome = primeiroNome(dados && dados.nome);
  const link = (dados && dados.linkVagas) || '';

  if (nome) {
    t = t.replace(/\{nome\}/gi, nome);
  } else {
    // tira o {nome} e a pontuação órfã que vinha antes ou depois dele
    t = t.replace(/\s*,?\s*\{nome\}\s*,?\s*/gi, function (trecho) {
      // mantém um separador quando havia vírgula de um dos lados
      return /,/.test(trecho) ? ', ' : ' ';
    });
  }
  t = t.replace(/\{saudacao\}/gi, saudacao(dados && dados.agora));
  t = t.replace(/\{link_vagas\}/gi, link);
  // {horario}: o horário do evento configurado no LEMBRETE do bot. Assim a
  // mensagem da sequência e o lembrete falam sempre do mesmo horário — antes
  // dava para escrever "meio-dia" na sequência e 13:00 no lembrete.
  t = t.replace(/\{horario\}/gi, (dados && dados.horario) || '');
  // {link} é o mesmo link das vagas, para quem escrever a forma curta.
  t = t.replace(/\{link\}/gi, link);
  // Arruma espaço dobrado e espaço antes de pontuação, que sobram da troca.
  t = t.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;!?])/g, '$1');
  // Vírgula ÓRFÃ NO COMEÇO da linha. "{nome}, a entrevista já começou" com
  // nome vazio virava ", a entrevista já começou" — com a vírgula na frente.
  t = t.replace(/(^|\n)[ \t]*,[ \t]*/g, '$1');
  // Primeira letra maiúscula quando a frase começou com {saudacao}.
  t = t.replace(/(^|\n)\s*([a-zà-ú])/g, function (_m, antes, letra) {
    return antes + letra.toUpperCase();
  });
  return t.replace(/[ \t]+$/gm, '');
}

// ── LEMBRETE DO BOT ────────────────────────────────────────────────────────
// A configuração é a MESMA forma usada pelas mensagens prontas
// (ligado/horario/data/lembretes), e quem envia é o MESMO motor
// (whatsapp-lembretes.cjs), na MESMA fila. Aqui só se decide se agenda.
function horarioDoEvento(cfg) {
  const l = cfg && cfg.lembrete;
  return (l && l.ligado && l.horario) ? String(l.horario) : '';
}

// Agenda os lembretes deste contato. Chamado quando o bot começa a responder.
// Devolve o resumo, ou null quando não há o que agendar.
function agendarLembretesDoContato(cfg, ctx, contactId) {
  const l = cfg && cfg.lembrete;
  if (!l || !l.ligado) return null;
  if (!_lembretes || typeof _lembretes.agendar !== 'function') return null;
  try {
    const conversa = {
      id: ctx.conversation_id, account_id: ctx.account_id, contact_id: contactId,
      contact_phone: ctx.telefone, contact_name: ctx.nome || ''
    };
    // O "evento" do bot usa o id fixo 'bot': é isso que faz o painel
    // identificar a origem e, junto com a chave única da tabela, impede
    // agendamento duplicado quando a pessoa chama o bot de novo.
    const comoResposta = {
      id: 'bot', titulo: 'Bot — ' + (l.titulo || 'atendimento automático'),
      // O {link} do lembrete sai do link das vagas configurado no bot.
      texto: String(cfg.linkVagas || ''),
      lembrete: l
    };
    // naoVirarODia: horário vencido NÃO vira lembrete de amanhã. Quem chama o
    // bot às 14h não pode receber lembrete da entrevista do meio-dia.
    const r = _lembretes.agendar({
      resposta: comoResposta, conversa: conversa,
      usuario: 'bot', naoVirarODia: true
    });
    if (r && r.agendados) {
      _db.bot.registrar('lembrete', contactId, ctx.telefone,
        r.agendados + ' lembrete(s) agendado(s) para as ' + r.evento_horario);
    }
    return r;
  } catch (e) {
    console.error('[Bot] não agendei o lembrete:', e.message);
    return null;
  }
}

// ── A ORDEM DE DECISÃO ─────────────────────────────────────────────────────
// Devolve o que fazer com esta mensagem recebida. Função PURA: não grava
// nada, não envia nada. Dá para testar sozinha, e é o que os testes fazem.
function decidir(entrada) {
  const cfg = entrada.config;
  const est = entrada.estado || {};
  const texto = entrada.texto || '';
  const agora = entrada.agora ? new Date(entrada.agora) : new Date();

  if (!cfg.ligado) return { acao: 'nada', motivo: 'bot desligado' };

  // 1) PEDIDO DE SAÍDA — vale antes de tudo, inclusive de atendente.
  if (contemPalavra(texto, cfg.saida.palavras)) {
    return { acao: 'saida', motivo: 'pediu para sair' };
  }
  // Já pediu saída antes: silêncio total, até ela voltar a falar por conta
  // própria -- e isso é justamente ESTA mensagem, então o silêncio vale para
  // o automático, não para o atendente humano.
  if (est.optou_sair) return { acao: 'nada', motivo: 'contato pediu saida antes' };

  // 2) PEDIU ATENDENTE
  if (contemPalavra(texto, cfg.atendente.palavras)) {
    return { acao: 'atendente', motivo: 'pediu atendente' };
  }
  // Já está na fila do atendente: o bot não atropela.
  if (est.aguardando_atendente) {
    const desde = est.aguardando_desde ? new Date(est.aguardando_desde) : null;
    const horas = cfg.atendente.voltarAposHoras;
    const voltou = desde && horas > 0 &&
      (agora - desde) / 36e5 >= horas &&
      est.ultima_msg_recebida_em &&
      (agora - new Date(est.ultima_msg_recebida_em)) / 36e5 >= horas;
    if (!voltou) return { acao: 'nada', motivo: 'aguardando atendente' };
    // Passou o tempo sem conversa: o bot pode voltar a atender.
  }

  // 3) CONTATO PAUSADO à mão
  if (est.pausado) return { acao: 'nada', motivo: 'bot pausado neste contato' };

  // 4) JÁ ESTÁ NO MEIO DE UMA SEQUÊNCIA
  // A pessoa respondeu antes de a sequência acabar: termina o que falta e não
  // reinicia nem dispara outra coisa junto.
  if (entrada.temFilaPendente) {
    return { acao: 'encerrar_fila', motivo: 'pessoa respondeu no meio da sequencia' };
  }

  // Sem passo configurado não há o que mandar.
  if (!cfg.passos.length) return { acao: 'nada', motivo: 'nenhum passo configurado' };

  // 5) REGRA DO MODO
  if (cfg.modo === 'primeira_vez') {
    if (!est.ultima_resposta_em) return { acao: 'sequencia', motivo: 'primeiro contato' };
    const dias = (agora - new Date(est.ultima_resposta_em)) / 864e5;
    const limite = Number(cfg.diasParaNovoContato) || 0;
    if (limite > 0 && dias >= limite) {
      return { acao: 'sequencia', motivo: 'voltou depois de ' + Math.floor(dias) + ' dia(s)' };
    }
    return { acao: 'nada', motivo: 'ja foi atendido e nao passou o prazo' };
  }

  if (cfg.modo === 'sempre') {
    if (cfg.limiteSempre === 'horas') {
      const h = Number(cfg.limiteHoras) || 0;
      if (est.ultima_resposta_em && h > 0) {
        const passou = (agora - new Date(est.ultima_resposta_em)) / 36e5;
        if (passou < h) {
          return { acao: 'nada', motivo: 'limite de ' + h + 'h por contato' };
        }
      }
      return { acao: 'sequencia', motivo: 'modo sempre (por hora)' };
    }
    const maximo = cfg.limiteSempre === '2_dia' ? 2 : 1;
    const hoje = (est.dia_da_contagem === new Date(agora).toISOString().slice(0, 10))
      ? (est.respostas_no_dia || 0) : 0;
    if (hoje >= maximo) {
      return { acao: 'nada', motivo: 'limite de ' + maximo + ' por dia atingido' };
    }
    return { acao: 'sequencia', motivo: 'modo sempre (' + maximo + '/dia)' };
  }

  return { acao: 'nada', motivo: 'modo desconhecido: ' + cfg.modo };
}

// ── ENTRADA DO WEBHOOK ─────────────────────────────────────────────────────
// Chamada no fim do processamento de cada mensagem recebida.
async function aoReceberMensagem(ctx) {
  if (!_db) return { acao: 'nada', motivo: 'bot nao iniciado' };
  const cfg = configAtual();
  const contactId = ctx.contact_id;
  const agoraISO = new Date().toISOString();

  // Registra que a pessoa falou AGORA (serve para o retorno do atendente).
  try { _db.bot.gravarContato(contactId, { ultima_msg_recebida_em: agoraISO }); } catch (e) {}

  const estado = _db.bot.contato(contactId);
  const temFila = !!_db.bot.filaDoContato(contactId);
  const d = decidir({
    config: cfg, estado: estado, texto: ctx.texto,
    temFilaPendente: temFila, agora: agoraISO
  });

  try {
    if (d.acao === 'saida') {
      _db.bot.gravarContato(contactId, { optou_sair: 1, optou_sair_em: agoraISO, aguardando_atendente: 0 });
      _db.bot.encerrarFilaDoContato(contactId, 'pediu saida');
      _db.bot.registrar('saida', contactId, ctx.telefone, 'pediu para sair');
      if (cfg.saida.mensagem) {
        await enviarAvulsa(ctx, cfg.saida.mensagem, cfg, 'saida');
      }
      return d;
    }

    if (d.acao === 'atendente') {
      _db.bot.gravarContato(contactId, { aguardando_atendente: 1, aguardando_desde: agoraISO });
      _db.bot.encerrarFilaDoContato(contactId, 'pediu atendente');
      _db.bot.registrar('atendente', contactId, ctx.telefone, 'pediu atendente');
      // A conversa ganha destaque na lista.
      try {
        _db.conversations.update(ctx.conversation_id, { status: 'pending' });
      } catch (e) { console.error('[Bot] nao marquei a conversa:', e.message); }
      if (cfg.atendente.mensagem) {
        await enviarAvulsa(ctx, cfg.atendente.mensagem, cfg, 'atendente');
      }
      return d;
    }

    if (d.acao === 'encerrar_fila') {
      _db.bot.encerrarFilaDoContato(contactId, 'pessoa respondeu no meio');
      _db.bot.registrar('encerrada', contactId, ctx.telefone, 'pessoa respondeu no meio da sequencia');
      return d;
    }

    if (d.acao === 'sequencia') {
      // Se o contato estava aguardando atendente e o prazo passou, limpa.
      if (estado.aguardando_atendente) {
        _db.bot.gravarContato(contactId, { aguardando_atendente: 0 });
      }
      const id = _db.bot.enfileirar({
        wamid: ctx.wamid, account_id: ctx.account_id, conversation_id: ctx.conversation_id,
        contact_id: contactId, telefone: ctx.telefone, nome_contato: ctx.nome || '',
        passos: cfg.passos, motivo: d.motivo,
        enviar_em: new Date().toISOString()
      });
      if (id === null) {
        // wamid repetido: webhook duplicado. Não é erro.
        return { acao: 'nada', motivo: 'webhook repetido (mesma mensagem)' };
      }
      _db.bot.contarResposta(contactId);
      _db.bot.registrar('inicio', contactId, ctx.telefone, d.motivo);
      // LEMBRETES: agenda para este contato, se o lembrete do bot estiver
      // ligado. Horário vencido não agenda nada — manda só a sequência.
      const lemb = agendarLembretesDoContato(cfg, ctx, contactId);
      processarFila();   // não espera: a fila cuida do ritmo
      return Object.assign({}, d, { lembretes: lemb ? lemb.agendados : 0 });
    }
  } catch (e) {
    console.error('[Bot] falha ao tratar a mensagem:', e.message);
    _db.bot.registrar('erro', contactId, ctx.telefone, 'ao decidir: ' + e.message);
  }
  return d;
}

// Atendente respondeu à mão: o bot para naquele contato na hora.
function aoAtendenteResponder(contactId, login) {
  if (!_db || !contactId) return;
  try {
    _db.bot.gravarContato(contactId, {
      pausado: 1, pausado_em: new Date().toISOString(),
      pausado_por: String(login || 'atendente'), aguardando_atendente: 0
    });
    _db.bot.encerrarFilaDoContato(contactId, 'atendente respondeu');
    _db.bot.registrar('pausado', contactId, '', 'atendente ' + (login || '') + ' respondeu');
  } catch (e) { console.error('[Bot] nao consegui pausar no contato:', e.message); }
}

// ── ENVIO ──────────────────────────────────────────────────────────────────
function contaDe(accountId) {
  try { return _db.accounts.getByIdWithToken ? _db.accounts.getByIdWithToken(accountId) : _db.accounts.getById(accountId); }
  catch (e) { return null; }
}
function tokenDaConta(accountId) {
  try {
    if (_db.accounts.getToken) return _db.accounts.getToken(accountId);
    const c = _db.accounts.getById(accountId);
    return (c && c.access_token_enc) || '';
  } catch (e) { return ''; }
}

// Grava a mensagem do bot na conversa, com a etiqueta de bot.
function registrarNaConversa(ctx, tipo, conteudo, wamid, mediaUrl) {
  try {
    const msgId = _db.messages.create({
      conversation_id: ctx.conversation_id, account_id: ctx.account_id,
      wamid: wamid || null, direction: 'outgoing', type: tipo,
      content: conteudo || '', media_url: mediaUrl || '',
      status: wamid ? 'sent' : 'failed', sender_name: 'bot', sent_by_bot: 1,
      origem: 'bot'            // o balao mostra "Bot" em letra pequena
    });
    _db.conversations.update(ctx.conversation_id, {
      last_message_text: String(conteudo || '').slice(0, 200),
      last_message_type: tipo,
      last_message_at: new Date().toISOString()
    });
    if (_notificar) {
      _notificar({
        type: 'new_message', conversation_id: ctx.conversation_id,
        message: {
          id: msgId, direction: 'outgoing', type: tipo, content: conteudo || '',
          media_url: mediaUrl || '', status: wamid ? 'sent' : 'failed',
          sender_name: 'bot', sent_by_bot: 1, origem: 'bot', created_at: new Date().toISOString()
        }
      });
    }
    return msgId;
  } catch (e) {
    console.error('[Bot] nao consegui gravar a mensagem na conversa:', e.message);
    return null;
  }
}

async function enviarAvulsa(ctx, texto, cfg, rotulo) {
  const token = tokenDaConta(ctx.account_id);
  const conta = contaDe(ctx.account_id);
  if (!token || !conta) return { ok: false, error: 'conta sem token' };
  const corpo = aplicarVariaveis(texto, { nome: ctx.nome, linkVagas: cfg.linkVagas });
  try {
    const r = await _api.sendTextMessage(conta.phone_number_id, ctx.telefone, corpo, token);
    registrarNaConversa(ctx, 'text', corpo, r && r.ok ? r.wamid : null);
    if (!r || !r.ok) _db.bot.registrar('erro', ctx.contact_id, ctx.telefone, (rotulo || '') + ': ' + ((r && r.error) || 'falhou'));
    return r || { ok: false };
  } catch (e) {
    _db.bot.registrar('erro', ctx.contact_id, ctx.telefone, (rotulo || '') + ': ' + e.message);
    return { ok: false, error: e.message };
  }
}

// Media id da Meta, reaproveitado. Sobe o arquivo só na primeira vez.
async function mediaIdDoArquivo(arquivo, accountId, mime) {
  const cache = _db.bot.midiaCache(arquivo, accountId);
  if (cache && cache.media_id) return cache.media_id;
  const conta = contaDe(accountId);
  const token = tokenDaConta(accountId);
  if (!conta || !token) throw new Error('conta sem token');
  const caminho = path.join(_pastaMidia, path.basename(arquivo));
  if (!fs.existsSync(caminho)) throw new Error('arquivo nao encontrado: ' + path.basename(arquivo));
  const r = await _api.uploadMedia(conta.phone_number_id, caminho, mime, token);
  if (!r || !r.ok || !r.media_id) throw new Error((r && r.error) || 'upload falhou');
  const st = fs.statSync(caminho);
  _db.bot.gravarMidiaCache(arquivo, accountId, r.media_id, mime, st.size);
  return r.media_id;
}

const MIME_POR_TIPO = { imagem: 'image/jpeg', audio: 'audio/ogg', documento: 'application/pdf' };
const TIPO_META = { imagem: 'image', audio: 'audio', documento: 'document' };

async function enviarPasso(linha, passo, cfg) {
  const ctx = {
    account_id: linha.account_id, conversation_id: linha.conversation_id,
    contact_id: linha.contact_id, telefone: linha.telefone, nome: linha.nome_contato
  };
  const conta = contaDe(linha.account_id);
  const token = tokenDaConta(linha.account_id);
  if (!conta || !token) throw new Error('conta sem token');

  // O horário do evento entra junto: é o que faz {horario} na sequência falar
  // do mesmo horário que o lembrete.
  const dados = {
    nome: linha.nome_contato, linkVagas: cfg.linkVagas,
    horario: horarioDoEvento(cfg)
  };

  if (passo.tipo === 'texto' || passo.tipo === 'link') {
    let corpo = aplicarVariaveis(passo.texto || '', dados);
    // O passo "link" é texto com o endereço no fim, se a pessoa não colocou
    // a variável no meio do texto.
    if (passo.tipo === 'link' && passo.url) {
      const url = aplicarVariaveis(passo.url, dados);
      if (corpo.indexOf(url) < 0) corpo = (corpo ? corpo + '\n\n' : '') + url;
    }
    if (!corpo.trim()) throw new Error('passo de texto vazio');
    const r = await _api.sendTextMessage(conta.phone_number_id, linha.telefone, corpo, token);
    if (!r || !r.ok) throw new Error((r && r.error) || 'envio falhou');
    registrarNaConversa(ctx, 'text', corpo, r.wamid);
    return r;
  }

  if (passo.tipo === 'imagem' || passo.tipo === 'audio' || passo.tipo === 'documento') {
    if (!passo.arquivo) throw new Error('passo de ' + passo.tipo + ' sem arquivo');
    const mime = passo.mime || MIME_POR_TIPO[passo.tipo];
    const tipoMeta = TIPO_META[passo.tipo];
    const legenda = passo.tipo === 'audio' ? '' : aplicarVariaveis(passo.legenda || '', dados);
    let mediaId;
    try {
      mediaId = await mediaIdDoArquivo(passo.arquivo, linha.account_id, mime);
    } catch (e) {
      throw new Error('mídia: ' + e.message);
    }
    const envio = { id: mediaId };
    if (passo.tipo === 'documento') envio.filename = passo.nomeArquivo || path.basename(passo.arquivo);
    let r = await _api.sendMediaMessage(conta.phone_number_id, linha.telefone, tipoMeta, envio, legenda, token);
    if (!r || !r.ok) {
      // Media id expirado (a Meta guarda ~30 dias): esquece o cache e sobe de
      // novo, uma vez só.
      _db.bot.esquecerMidiaCache(passo.arquivo, linha.account_id);
      const novo = await mediaIdDoArquivo(passo.arquivo, linha.account_id, mime);
      const envio2 = { id: novo };
      if (passo.tipo === 'documento') envio2.filename = envio.filename;
      r = await _api.sendMediaMessage(conta.phone_number_id, linha.telefone, tipoMeta, envio2, legenda, token);
      if (!r || !r.ok) throw new Error((r && r.error) || 'envio de mídia falhou');
    }
    registrarNaConversa(ctx, tipoMeta, legenda, r.wamid, '/api/whatsapp/bot/midia/' + encodeURIComponent(path.basename(passo.arquivo)));
    return r;
  }

  throw new Error('tipo de passo desconhecido: ' + passo.tipo);
}

// ── A FILA ─────────────────────────────────────────────────────────────────
// Um passo por vez, com intervalo. É isto que dá o controle de ritmo, a
// retomada depois de reinício (a linha pendente fica no banco) e o "falha num
// passo não trava os outros".
let _ultimoEnvio = 0;
async function processarFila() {
  if (_ocupado || !_db) return;
  _ocupado = true;
  try {
    const cfg = configAtual();
    const porMinuto = Math.max(1, Number(cfg.ritmo.porMinuto) || 20);
    const intervaloMin = Math.ceil(60000 / porMinuto);

    const linhas = _db.bot.filaPendentes(3);
    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      // Controle de ritmo: respeita o espaçamento mínimo entre envios.
      const desdeUltimo = Date.now() - _ultimoEnvio;
      if (desdeUltimo < intervaloMin) {
        await new Promise(function (r) { setTimeout(r, intervaloMin - desdeUltimo); });
      }

      let passos = [];
      try { passos = JSON.parse(linha.passos_json) || []; } catch (e) { passos = []; }
      const idx = linha.passo_atual || 0;
      if (idx >= passos.length) {
        _db.bot.atualizarFila(linha.id, { status: 'concluida', terminado_em: new Date().toISOString() });
        _db.bot.registrar('concluida', linha.contact_id, linha.telefone, passos.length + ' passo(s)');
        continue;
      }
      const passo = passos[idx] || {};
      _ultimoEnvio = Date.now();

      // AVANÇA O ÍNDICE ANTES DE ENVIAR.
      // Assim, se o processo cair no meio do envio, o passo NÃO é repetido na
      // volta. Repetir mensagem para o cliente é pior que perder uma.
      _db.bot.atualizarFila(linha.id, {
        passo_atual: idx + 1,
        tentativas: (linha.tentativas || 0) + 1
      });

      try {
        await enviarPasso(linha, passo, cfg);
      } catch (e) {
        // FALHA NUM PASSO NÃO TRAVA OS OUTROS: registra e segue.
        console.error('[Bot] passo ' + (idx + 1) + ' falhou:', e.message);
        _db.bot.atualizarFila(linha.id, {
          falhas: (linha.falhas || 0) + 1,
          ultimo_erro: 'passo ' + (idx + 1) + ': ' + e.message
        });
        _db.bot.registrar('erro', linha.contact_id, linha.telefone, 'passo ' + (idx + 1) + ': ' + e.message);
      }

      const proximo = idx + 1;
      if (proximo >= passos.length) {
        _db.bot.atualizarFila(linha.id, { status: 'concluida', terminado_em: new Date().toISOString() });
        _db.bot.registrar('concluida', linha.contact_id, linha.telefone, passos.length + ' passo(s)');
      } else {
        const esperaSeg = Number(passos[proximo] && passos[proximo].intervaloSeg);
        const seg = isNaN(esperaSeg) || esperaSeg < 0 ? (Number(cfg.intervaloPadraoSeg) || 3) : esperaSeg;
        _db.bot.atualizarFila(linha.id, { enviar_em: new Date(Date.now() + seg * 1000).toISOString() });
      }
    }
  } catch (e) {
    console.error('[Bot] erro na fila:', e.message);
  } finally {
    _ocupado = false;
  }
}

// ── TESTE MANUAL ───────────────────────────────────────────────────────────
// Manda a sequência para um número digitado, sem mexer no estado do contato
// nem na contagem. Serve para o botão "Enviar teste".
async function enviarTeste(accountId, telefone, nome) {
  const cfg = configAtual();
  if (!cfg.passos.length) return { ok: false, error: 'Nenhum passo configurado.' };
  const conta = contaDe(accountId);
  if (!conta) return { ok: false, error: 'Conta não encontrada.' };
  const limpo = String(telefone || '').replace(/\D/g, '');
  if (limpo.length < 10) return { ok: false, error: 'Telefone inválido.' };

  const resultados = [];
  for (let i = 0; i < cfg.passos.length; i++) {
    const passo = cfg.passos[i];
    try {
      await enviarPasso({
        account_id: accountId, conversation_id: 0, contact_id: 0,
        telefone: limpo, nome_contato: nome || ''
      }, passo, cfg);
      resultados.push({ passo: i + 1, ok: true });
    } catch (e) {
      resultados.push({ passo: i + 1, ok: false, erro: e.message });
    }
    if (i + 1 < cfg.passos.length) {
      const seg = Number(cfg.passos[i + 1] && cfg.passos[i + 1].intervaloSeg);
      await new Promise(function (r) { setTimeout(r, (isNaN(seg) ? 1 : Math.min(seg, 10)) * 1000); });
    }
  }
  _db.bot.registrar('teste', null, limpo, resultados.filter(function (r) { return r.ok; }).length +
    ' de ' + resultados.length + ' passo(s) enviados');
  return { ok: resultados.every(function (r) { return r.ok; }), resultados: resultados };
}

// ── INÍCIO ─────────────────────────────────────────────────────────────────
// O motor de lembretes e opcional: se ele nao carregou, o bot continua
// respondendo normalmente, so nao agenda lembrete.
let _lembretes = null;

function iniciar(opcoes) {
  _db = opcoes.db;
  _api = opcoes.api;
  _lerConfig = opcoes.lerConfig;
  _notificar = opcoes.notificar || null;
  _pastaMidia = opcoes.pastaMidia;
  try { _lembretes = opcoes.lembretes || require('./whatsapp-lembretes.cjs'); }
  catch (e) { _lembretes = null; }
  try { fs.mkdirSync(_pastaMidia, { recursive: true }); } catch (e) {}

  // RETOMADA DEPOIS DE REINÍCIO: nada a restaurar em memória, porque a fila
  // vive no banco. O timer só volta a olhar as linhas pendentes.
  if (_timer) clearInterval(_timer);
  _timer = setInterval(function () { processarFila(); }, 2000);
  if (_timer.unref) _timer.unref();

  const pendentes = (function () {
    try { return _db.bot.painel().na_fila; } catch (e) { return 0; }
  })();
  console.log('[Bot] iniciado. Mídia em: ' + _pastaMidia +
              (pendentes ? ' | ' + pendentes + ' passo(s) pendente(s) retomados da fila' : ''));
  return true;
}
function parar() { if (_timer) { clearInterval(_timer); _timer = null; } }

module.exports = {
  CONFIG_PADRAO,
  iniciar, parar,
  configAtual,
  decidir, normalizar, contemPalavra, saudacao, aplicarVariaveis, primeiroNome,
  aoReceberMensagem, aoAtendenteResponder,
  processarFila, enviarTeste
};
