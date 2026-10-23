// ==========================================================================
// ABA "BOT" DO WHATSAPP OFICIAL — a tela
// --------------------------------------------------------------------------
// A configuração vive em state.botWhatsapp e é gravada com
// setKeys: ['botWhatsapp'] — esse é o contrato do sistema (regra 3) e é o que
// faz REMOVER e REORDENAR passo funcionarem de verdade quando duas pessoas
// estão logadas. Sem o setKeys, a lista de passos é um array e o merge do
// servidor só acrescentaria: a remoção sumia da tela e voltava no próximo
// carregamento.
//
// Arquivo separado do js/whatsapp.js de propósito: aquele já tem 1.200 linhas.

(function () {
  'use strict';

  const esc = function (v) {
    return (typeof escapeHTML === 'function') ? escapeHTML(v) : String(v == null ? '' : v);
  };

  // O estado global e declarado com `let state` no js/app.js, e `let` NAO
  // cria propriedade no window: `window.state` e sempre undefined. Por isso a
  // leitura e pelo nome, nao pelo window.
  function _est() { return (typeof state !== 'undefined' && state) ? state : null; }
  // MESMO problema do state: o usuario logado tambem e `let loggedUser` no
  // js/app.js, e `let` nao vira propriedade do window. Com `window.loggedUser`
  // esta tela se achava SEM PERMISSAO: a aba Bot nao aparecia e, quando
  // aparecia, o salvar recusava com "voce nao tem permissao".
  function _eu() { return (typeof loggedUser !== 'undefined' && loggedUser) ? loggedUser : null; }

  // Mesmo padrão das outras telas: só admin e mestre, e o servidor confirma.
  function _botPodeVer() {
    if (!_eu()) return false;
    if (!window.RTTelas) return false;
    const n = RTTelas.telasDoFuncionario(_eu(), _est() || {})['bot'];
    return n === 'ver' || n === 'editar';
  }
  function _botPodeEditar() {
    if (!_eu() || !window.RTTelas) return false;
    return RTTelas.telasDoFuncionario(_eu(), _est() || {})['bot'] === 'editar';
  }
  window._botPodeVer = _botPodeVer;

  const PADRAO = {
    ligado: false, modo: 'primeira_vez', diasParaNovoContato: 7,
    limiteSempre: '1_dia', limiteHoras: 6, linkVagas: '',
    intervaloPadraoSeg: 3, passos: [],
    atendente: {
      palavras: ['atendente', 'falar com alguem', 'humano'],
      mensagem: 'Já chamei alguém da equipe para falar com você. Em instantes alguém responde por aqui.',
      voltarAposHoras: 12
    },
    saida: {
      palavras: ['sair', 'parar', 'nao quero'],
      mensagem: 'Tudo bem, não vou mais enviar mensagens automáticas. Se precisar, é só escrever aqui.'
    },
    ritmo: { porMinuto: 20 }
  };

  function cfg() {
    // Sem estado carregado, devolve o padrao (copia): a tela ainda desenha.
    if (!_est()) return JSON.parse(JSON.stringify(PADRAO));
    if (!state.botWhatsapp || typeof state.botWhatsapp !== 'object') {
      state.botWhatsapp = JSON.parse(JSON.stringify(PADRAO));
    }
    const c = state.botWhatsapp;
    // Preenche o que faltar, sem apagar o que a pessoa já configurou.
    Object.keys(PADRAO).forEach(function (k) {
      if (c[k] === undefined) c[k] = JSON.parse(JSON.stringify(PADRAO[k]));
    });
    ['atendente', 'saida', 'ritmo'].forEach(function (k) {
      c[k] = Object.assign({}, PADRAO[k], c[k] || {});
    });
    if (!Array.isArray(c.passos)) c.passos = [];
    return c;
  }

  let _painel = null;
  let _salvando = false;

  // ── GRAVAÇÃO ─────────────────────────────────────────────────────────────
  // setKeys: ['botWhatsapp'] é obrigatório aqui. Ver o comentário do topo.
  async function salvar(oQueMudou) {
    if (_salvando) return;
    if (!_botPodeEditar()) { alert('Você não tem permissão para alterar o bot.'); return; }
    _salvando = true;
    try {
      await RTCloud.salvarAgora(state, { merge: true, setKeys: ['botWhatsapp'] });
      if (typeof registrarLogGlobal === 'function') {
        registrarLogGlobal('Bot do WhatsApp: ' + (oQueMudou || 'configuração alterada') + '.', 'whatsapp');
      }
    } catch (e) {
      alert('Não consegui salvar: ' + (e.message || e));
    } finally {
      _salvando = false;
    }
  }

  async function carregarPainel() {
    try {
      const r = await fetch('/api/whatsapp/bot/painel', { credentials: 'same-origin' });
      const j = await r.json().catch(function () { return {}; });
      _painel = j && j.ok ? j : null;
    } catch (e) { _painel = null; }
  }

  // ── A TELA ───────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  // A TELA DO BOT: PASSO A PASSO, DE CIMA PARA BAIXO
  // --------------------------------------------------------------------------
  // Antes era um formulário em duas colunas, e cada campo gravava sozinho no
  // servidor. Duas coisas davam errado nisso: ninguém sabia a ORDEM de
  // configurar, e uma troca de palavra no meio já valia para os clientes sem
  // ninguém confirmar.
  // Agora: seis passos numerados, cada um dizendo se está COMPLETO ou o que
  // falta; as mudanças ficam num RASCUNHO e só valem depois de "Salvar
  // alterações"; e ligar ou desligar o bot pede confirmação com resumo.
  // ══════════════════════════════════════════════════════════════════════════

  // O rascunho: cópia do que está no servidor, editada na tela. Enquanto
  // existir, é ele que a tela mostra.
  let _rascunho = null;
  // O diario fica recolhido; isto lembra se a pessoa abriu.
  let _botDiarioAberto = false;
  function rasc() {
    if (!_rascunho) _rascunho = JSON.parse(JSON.stringify(cfg()));
    return _rascunho;
  }
  function temRascunho() { return !!_rascunho; }
  function marcarMudou() { /* o rascunho em si já é a marca */ }

  // O que falta para o bot poder ir ao ar. Lista vazia = pode ligar.
  function _botPendencias(c) {
    const faltas = [];
    if (!(c.passos || []).length) faltas.push('a sequência de boas-vindas está sem nenhum passo');
    const usaLink = JSON.stringify(c.passos || []).indexOf('{link') >= 0;
    if (usaLink && !String(c.linkVagas || '').trim()) faltas.push('a sequência usa {link_vagas}, mas o link está vazio');
    (c.passos || []).forEach(function (p, i) {
      if ((p.tipo === 'texto' || p.tipo === 'link') && !String(p.texto || '').trim()) {
        faltas.push('o passo ' + (i + 1) + ' está sem texto');
      }
      if ((p.tipo === 'imagem' || p.tipo === 'audio' || p.tipo === 'documento') && !p.arquivo) {
        faltas.push('o passo ' + (i + 1) + ' está sem arquivo');
      }
    });
    if (!String((c.atendente || {}).mensagem || '').trim()) faltas.push('a mensagem de "chamar atendente" está vazia');
    if (!String((c.saida || {}).mensagem || '').trim()) faltas.push('a mensagem de saída está vazia');
    const L = c.lembrete || {};
    if (L.ligado) {
      if (!String(L.horario || '').trim()) faltas.push('o lembrete está ligado mas sem horário do evento');
      const comTexto = (L.lembretes || []).filter(function (x) { return String(x.texto || '').trim(); });
      if (!comTexto.length) faltas.push('o lembrete está ligado mas nenhum tem texto');
    }
    return faltas;
  }

  // Cada passo da tela sabe dizer se está completo.
  function _botSituacaoPasso(c, qual) {
    const L = c.lembrete || {};
    if (qual === 1) {
      if (!(c.passos || []).length) return { ok: false, falta: 'nenhuma mensagem ainda' };
      const vazio = (c.passos || []).findIndex(function (p) {
        if (p.tipo === 'texto' || p.tipo === 'link') return !String(p.texto || '').trim();
        return !p.arquivo;
      });
      if (vazio >= 0) return { ok: false, falta: 'o passo ' + (vazio + 1) + ' está incompleto' };
      return { ok: true, resumo: (c.passos || []).length + ' mensagem(ns)' };
    }
    if (qual === 2) {
      return { ok: true, resumo: c.modo === 'sempre' ? 'sempre que a pessoa escrever' : 'só na primeira vez' };
    }
    if (qual === 3) {
      const usa = JSON.stringify(c.passos || []).indexOf('{link') >= 0;
      if (!String(c.linkVagas || '').trim()) {
        return usa ? { ok: false, falta: 'a sequência usa {link_vagas} e o link está vazio' }
                   : { ok: true, resumo: 'sem link (a sequência não usa)' };
      }
      return { ok: true, resumo: String(c.linkVagas).slice(0, 40) };
    }
    if (qual === 4) {
      if (!L.ligado) return { ok: true, resumo: 'desligado' };
      if (!String(L.horario || '').trim()) return { ok: false, falta: 'falta o horário do evento' };
      const comTexto = (L.lembretes || []).filter(function (x) { return String(x.texto || '').trim(); });
      if (!comTexto.length) return { ok: false, falta: 'nenhum lembrete com texto' };
      return { ok: true, resumo: comTexto.length + ' lembrete(s) · evento às ' + L.horario };
    }
    if (qual === 5) {
      if (!String((c.atendente || {}).mensagem || '').trim()) return { ok: false, falta: 'mensagem de atendente vazia' };
      if (!String((c.saida || {}).mensagem || '').trim()) return { ok: false, falta: 'mensagem de saída vazia' };
      return { ok: true, resumo: 'avisos escritos' };
    }
    return { ok: true, resumo: '' };
  }

  function _botCabecalhoPasso(n, titulo, sit) {
    const marca = sit.ok
      ? '<span class="bot-passo-ok"><i class="fa-solid fa-circle-check"></i> completo' +
        (sit.resumo ? ' · ' + esc(sit.resumo) : '') + '</span>'
      : '<span class="bot-passo-falta"><i class="fa-solid fa-circle-exclamation"></i> ' + esc(sit.falta) + '</span>';
    return '<div class="bot-passo-cab"><span class="bot-passo-num">' + n + '</span>' +
           '<h3>' + esc(titulo) + '</h3>' + marca + '</div>';
  }

  async function _botRender(cont) {
    if (!_botPodeVer()) {
      cont.innerHTML = '<div class="wa-vazio">Você não tem acesso à aba Bot.</div>';
      return;
    }
    if (_painel === null) { cont.innerHTML = '<div class="wa-vazio">Carregando...</div>'; await carregarPainel(); }
    const salvo = cfg();
    const c = temRascunho() ? rasc() : salvo;
    const podeEditar = _botPodeEditar();
    const trava = podeEditar ? '' : 'disabled';
    const p = (_painel && _painel.painel) || {};
    const faltas = _botPendencias(c);
    const L = c.lembrete || { ligado: false, lembretes: [] };
    // FE: o modo fora do expediente. O interruptor vem do que esta SALVO (ele
    // tem rota propria, com Auditoria); o resto vem do rascunho em edicao.
    const FE = Object.assign(
      { ligado: false, passos: [], lembrete: { ligado: false, lembretes: [] } },
      c.foraExpediente || {},
      { ligado: !!((salvo.foraExpediente || {}).ligado),
        ligadoEm: (salvo.foraExpediente || {}).ligadoEm || '',
        desligarEm: (salvo.foraExpediente || {}).desligarEm || '' }
    );

    cont.innerHTML = `
      <div class="bot-tela">

        ${(salvo.foraExpediente && salvo.foraExpediente.ligado) ? `<div class="bot-faixa-fora">
          <i class="fa-solid fa-moon"></i>
          <b>Fora do expediente ligado</b>
          ${salvo.foraExpediente.ligadoEm ? 'desde ' + esc(_botHoraCurta(salvo.foraExpediente.ligadoEm)) : ''}
          ${salvo.foraExpediente.desligarEm ? '· desliga sozinho ' + esc(_botQuandoDesliga(salvo.foraExpediente.desligarEm)) : ''}
          · quem escrever recebe o funil que você escreveu
        </div>` : ''}

        ${salvo.ligado ? `<div class="bot-faixa-no-ar">
          <i class="fa-solid fa-circle-check"></i>
          <b>Bot no ar</b> ${salvo.ligadoEm ? 'desde ' + esc(_botHoraCurta(salvo.ligadoEm)) : ''}
          · respondendo automaticamente quem chama
        </div>` : `<div class="bot-aviso-off">
          <i class="fa-solid fa-circle-info"></i>
          O bot está <b>desligado</b>: ninguém recebe mensagem automática. Siga os
          passos abaixo, teste no seu número e ligue no fim.
        </div>`}

        <div class="bot-cartoes">
          ${[['Atendidos hoje', p.contatos_hoje], ['Na semana', p.contatos_semana],
             ['No mês', p.contatos_mes], ['Sequências completas', p.sequencias_completas],
             ['Com falha', p.com_falha], ['Pediram atendente (hoje)', p.pedidos_atendente_hoje],
             ['Na fila agora', p.na_fila], ['Pediram para sair', p.saidas]]
            .map(function (x) {
              return '<div class="bot-cartao"><b>' + (x[1] == null ? '—' : x[1]) + '</b><span>' + esc(x[0]) + '</span></div>';
            }).join('')}
          <button class="bot-cartao bot-cartao-btn" onclick="botAtualizarPainel()" title="Atualizar os números">
            <i class="fa-solid fa-rotate"></i><span>atualizar</span></button>
        </div>

        <!-- PASSO 1 — a sequência e a prévia, lado a lado -->
        <section class="bot-passo">
          ${_botCabecalhoPasso(1, 'Mensagem de boas-vindas', _botSituacaoPasso(c, 1))}
          <p class="bot-ajuda">O que a pessoa recebe quando escreve para o número.
          Variáveis: <code>{nome}</code>, <code>{saudacao}</code>,
          <code>{link_vagas}</code> e <code>{horario}</code> (o horário do lembrete).</p>
          <div class="bot-passo1">
            <div>
              <div id="bot-passos">${_passosHtml(c, podeEditar)}</div>
              ${podeEditar ? `<div class="bot-add">
                <button class="mod-btn-secondary" onclick="botAddPasso('texto')"><i class="fa-solid fa-font"></i> Texto</button>
                <button class="mod-btn-secondary" onclick="botAddPasso('imagem')"><i class="fa-solid fa-image"></i> Imagem</button>
                <button class="mod-btn-secondary" onclick="botAddPasso('audio')"><i class="fa-solid fa-microphone"></i> Áudio</button>
                <button class="mod-btn-secondary" onclick="botAddPasso('documento')"><i class="fa-solid fa-file-pdf"></i> PDF</button>
                <button class="mod-btn-secondary" onclick="botAddPasso('link')"><i class="fa-solid fa-link"></i> Link</button>
              </div>` : ''}
            </div>
            <div class="bot-passo1-previa">
              <div class="bot-previa-tit"><i class="fa-regular fa-eye"></i> Como vai chegar</div>
              <div class="bot-previa" id="bot-previa">${_previaHtml(c)}</div>
            </div>
          </div>
        </section>

        <!-- PASSO 2 — quando responder -->
        <section class="bot-passo">
          ${_botCabecalhoPasso(2, 'Quando responder', _botSituacaoPasso(c, 2))}
          <label class="bot-opcao">
            <input type="radio" name="bot-modo" value="primeira_vez" ${c.modo === 'primeira_vez' ? 'checked' : ''} ${trava}
                   onchange="botMudarCampo('modo','primeira_vez')">
            <div><b>Só na primeira vez</b>
              <small>Responde no primeiro contato da pessoa. Se ela voltar depois de
              <input type="number" min="0" max="365" class="bot-mini" id="bot-dias" value="${Number(c.diasParaNovoContato) || 0}" ${trava}
                     onchange="botMudarNumero('diasParaNovoContato', this.value)"> dia(s) sem conversa, responde de novo.
              Com 0, responde uma única vez e nunca mais.</small>
            </div>
          </label>
          <label class="bot-opcao">
            <input type="radio" name="bot-modo" value="sempre" ${c.modo === 'sempre' ? 'checked' : ''} ${trava}
                   onchange="botMudarCampo('modo','sempre')">
            <div><b>Sempre que a pessoa escrever</b>
              <small>Responde toda vez, com um limite para não incomodar:
                <select class="bot-mini-sel" ${trava} onchange="botMudarCampo('limiteSempre', this.value)">
                  <option value="1_dia" ${c.limiteSempre === '1_dia' ? 'selected' : ''}>1 por dia</option>
                  <option value="2_dia" ${c.limiteSempre === '2_dia' ? 'selected' : ''}>2 por dia</option>
                  <option value="horas" ${c.limiteSempre === 'horas' ? 'selected' : ''}>a cada X horas</option>
                </select>
                ${c.limiteSempre === 'horas' ? `<input type="number" min="1" max="720" class="bot-mini" value="${Number(c.limiteHoras) || 6}" ${trava}
                     onchange="botMudarNumero('limiteHoras', this.value)"> hora(s)` : ''}
              </small>
            </div>
          </label>
          <label class="bot-linha-num">Intervalo entre as mensagens da sequência:
            <input type="number" min="1" max="120" class="bot-mini" value="${Number(c.intervaloPadraoSeg) || 3}" ${trava}
                   onchange="botMudarNumero('intervaloPadraoSeg', this.value)"> segundo(s).
          </label>
        </section>

        <!-- PASSO 3 — link das vagas -->
        <section class="bot-passo">
          ${_botCabecalhoPasso(3, 'Link das vagas', _botSituacaoPasso(c, 3))}
          <p class="bot-ajuda">Escreva <code>{link_vagas}</code> no texto dos passos e este endereço entra no lugar.</p>
          <input type="url" class="form-control" id="bot-link" placeholder="https://..." value="${esc(c.linkVagas)}" ${trava}
                 onchange="botMudarCampo('linkVagas', this.value)">
        </section>

        <!-- PASSO 4 — lembrete -->
        <section class="bot-passo">
          ${_botCabecalhoPasso(4, 'Lembrete', _botSituacaoPasso(c, 4))}
          <p class="bot-ajuda">Depois de responder, o bot pode agendar lembretes para
          aquela pessoa — para orientar e avisar da entrevista. Os textos e o horário
          são os que você escrever aqui.</p>
          <label class="bot-lembrete-chave">
            <input type="checkbox" ${L.ligado ? 'checked' : ''} ${trava} onchange="botLembreteLigar(this.checked)">
            <span><i class="fa-solid fa-clock"></i> Agendar lembrete para quem o bot atender</span>
          </label>

          ${!L.ligado ? '' : `
          <div class="bot-lembrete-corpo">
            <div class="bot-lembrete-quando">
              <label>Horário do evento
                <input type="time" value="${esc(L.horario || '')}" ${trava} onchange="botLembreteCampo('horario', this.value)">
              </label>
              <label>Data <small>(opcional)</small>
                <input type="date" value="${esc(L.data || '')}" ${trava} onchange="botLembreteCampo('data', this.value)">
              </label>
              <p class="bot-ajuda">${L.data
                ? 'Vale só nessa data.'
                : 'Sem data, vale o próximo ' + esc(L.horario || 'horário') + '. <b>Se já passou, o bot responde mas não agenda lembrete</b> — ninguém recebe lembrete de horário vencido.'}</p>
            </div>

            <div class="bot-lembrete-lista">
              ${(L.lembretes || []).length === 0
                ? '<div class="bot-vazio">Nenhum lembrete ainda. Clique em <b>+ adicionar lembrete</b>.</div>'
                : (L.lembretes || []).map(function (l, i) { return _botLembreteItemHtml(l, i, trava); }).join('')}
            </div>
            ${podeEditar ? '<button class="wa-lembrete-add" onclick="botLembreteNovo()"><i class="fa-solid fa-plus"></i> adicionar lembrete</button>' : ''}
            <div class="bot-ajuda">Variáveis do lembrete:
              <code>{nome}</code> <code>{saudacao}</code> <code>{horario}</code> <code>{link}</code></div>
            ${_botLembretePreviaHtml(c, L)}
          </div>`}
        </section>

        <!-- PASSO 5 — atendente e saída -->
        <section class="bot-passo">
          ${_botCabecalhoPasso(5, 'Atendente e saída', _botSituacaoPasso(c, 5))}
          <div class="bot-duas">
            <div>
              <h4>Passar para atendente</h4>
              <p class="bot-ajuda">Escrevendo uma destas palavras, o bot avisa a equipe e para naquele contato.</p>
              <input type="text" class="form-control" placeholder="atendente, falar com alguem, humano"
                     value="${esc((c.atendente.palavras || []).join(', '))}" ${trava}
                     onchange="botMudarLista('atendente','palavras', this.value)">
              <textarea class="form-control bot-textarea" rows="3" placeholder="Mensagem que o bot manda ao chamar o atendente" ${trava}
                        onchange="botMudarTexto('atendente','mensagem', this.value)">${esc(c.atendente.mensagem)}</textarea>
              <label class="bot-linha-num">O bot volta a atender depois de
                <input type="number" min="0" max="720" class="bot-mini" value="${Number(c.atendente.voltarAposHoras) || 0}" ${trava}
                       onchange="botMudarNumeroEm('atendente','voltarAposHoras', this.value)"> hora(s) sem conversa.
              </label>
            </div>
            <div>
              <h4>Pedido de saída</h4>
              <p class="bot-ajuda">Depois disto o bot nunca mais manda nada automático para aquela pessoa — nem lembrete.</p>
              <input type="text" class="form-control" placeholder="sair, parar, nao quero"
                     value="${esc((c.saida.palavras || []).join(', '))}" ${trava}
                     onchange="botMudarLista('saida','palavras', this.value)">
              <textarea class="form-control bot-textarea" rows="3" placeholder="Mensagem curta de confirmação" ${trava}
                        onchange="botMudarTexto('saida','mensagem', this.value)">${esc(c.saida.mensagem)}</textarea>
            </div>
          </div>
        </section>

        <!-- PASSO 6 — testar -->
        <section class="bot-passo">
          ${_botCabecalhoPasso(6, 'Testar no meu número', { ok: true, resumo: 'não mexe na contagem de ninguém' })}
          ${podeEditar ? `
          <p class="bot-ajuda">Manda a sequência para um número à sua escolha. Use o seu
          antes de ligar o bot.</p>
          <div class="bot-teste">
            <input type="tel" class="form-control" id="bot-teste-tel" placeholder="5511999998888">
            <button class="mod-btn-primary" onclick="botEnviarTeste()"><i class="fa-solid fa-paper-plane"></i> Enviar teste</button>
          </div>
          <div id="bot-teste-res" class="bot-ajuda"></div>` : '<p class="bot-ajuda">Só quem edita o bot pode enviar teste.</p>'}
        </section>

        <!-- MODO FORA DO EXPEDIENTE -->
        <section class="bot-passo bot-passo-fora">
          <div class="bot-passo-cab">
            <span class="bot-passo-num"><i class="fa-solid fa-moon"></i></span>
            <h3>Modo fora do expediente</h3>
            ${_botSituacaoFora(c)}
          </div>
          <p class="bot-ajuda">Saiu do trabalho? Ligue aqui. A partir daí,
          <b>qualquer pessoa</b> que escrever — contato novo ou antigo — recebe o
          funil que você escrever abaixo, e os lembretes ficam agendados. Vale
          uma vez por pessoa em cada período ligado.</p>

          ${podeEditar ? `<div class="bot-fora-liga">
            <button class="${FE.ligado ? 'mod-btn-secondary' : 'mod-btn-primary'}"
                    onclick="botForaExpediente(${FE.ligado ? 'false' : 'true'})">
              <i class="fa-solid fa-moon"></i> ${FE.ligado ? 'Desligar o modo fora do expediente' : 'Ligar o modo fora do expediente'}
            </button>
            ${FE.ligado ? '' : `<label class="bot-fora-auto">
              desligar sozinho:
              <select id="bot-fora-auto">
                <option value="">não desligar</option>
                <option value="amanha-08:00" selected>amanhã às 08:00</option>
                <option value="amanha-07:00">amanhã às 07:00</option>
                <option value="amanha-09:00">amanhã às 09:00</option>
                <option value="amanha-12:00">amanhã ao meio-dia</option>
              </select>
            </label>`}
          </div>` : ''}

          <div class="bot-fora-corpo">
            <h4>Funil de fora do expediente</h4>
            <p class="bot-ajuda">Variáveis: <code>{nome}</code>, <code>{saudacao}</code>,
            <code>{horario}</code> (o horário do lembrete) e <code>{link}</code>.</p>
            <div class="bot-passo1">
              <div>
                <div id="bot-fora-passos">${_passosHtml({ passos: FE.passos || [] }, podeEditar, 'fora')}</div>
                ${podeEditar ? `<div class="bot-add">
                  <button class="mod-btn-secondary" onclick="botForaAddPasso('texto')"><i class="fa-solid fa-font"></i> Texto</button>
                  <button class="mod-btn-secondary" onclick="botForaAddPasso('imagem')"><i class="fa-solid fa-image"></i> Imagem</button>
                  <button class="mod-btn-secondary" onclick="botForaAddPasso('audio')"><i class="fa-solid fa-microphone"></i> Áudio</button>
                  <button class="mod-btn-secondary" onclick="botForaAddPasso('documento')"><i class="fa-solid fa-file-pdf"></i> PDF</button>
                  <button class="mod-btn-secondary" onclick="botForaAddPasso('link')"><i class="fa-solid fa-link"></i> Link</button>
                </div>` : ''}
              </div>
              <div class="bot-passo1-previa">
                <div class="bot-previa-tit"><i class="fa-regular fa-eye"></i> Como vai chegar</div>
                <div class="bot-previa">${_previaHtml({ passos: FE.passos || [], linkVagas: c.linkVagas, lembrete: FE.lembrete })}</div>
              </div>
            </div>

            <h4>Lembretes do fora do expediente</h4>
            <label class="bot-lembrete-chave">
              <input type="checkbox" ${(FE.lembrete || {}).ligado ? 'checked' : ''} ${trava}
                     onchange="botForaLembreteLigar(this.checked)">
              <span><i class="fa-solid fa-clock"></i> Agendar lembretes para quem receber o funil</span>
            </label>
            ${!(FE.lembrete || {}).ligado ? '' : `
            <div class="bot-lembrete-corpo">
              <div class="bot-lembrete-quando">
                <label>Horário da entrevista
                  <input type="time" value="${esc(FE.lembrete.horario || '')}" ${trava}
                         onchange="botForaLembreteCampo('horario', this.value)">
                </label>
                <label>Data
                  <input type="date" id="bot-fora-data" value="${esc(FE.lembrete.data || '')}" ${trava}
                         onchange="botForaLembreteCampo('data', this.value)">
                </label>
                <button class="wa-lembrete-add" onclick="botForaLembreteAmanha()">
                  <i class="fa-solid fa-forward"></i> amanhã</button>
                <p class="bot-ajuda">${FE.lembrete.data
                  ? 'Vale nessa data.'
                  : 'Sem data, vale o próximo ' + esc(FE.lembrete.horario || 'horário') + '. <b>Horário vencido não agenda.</b>'}
                  Lembrete que caísse depois de 24 horas da última mensagem da pessoa
                  não é enviado (a Meta não permite) e aparece no painel como
                  <b>janela fechada</b>.</p>
              </div>
              <div class="bot-lembrete-lista">
                ${((FE.lembrete.lembretes) || []).length === 0
                  ? '<div class="bot-vazio">Nenhum lembrete ainda. Clique em <b>+ adicionar lembrete</b>.</div>'
                  : FE.lembrete.lembretes.map(function (l, i) { return _botLembreteItemHtml(l, i, trava, 'fora'); }).join('')}
              </div>
              ${podeEditar ? '<button class="wa-lembrete-add" onclick="botForaLembreteNovo()"><i class="fa-solid fa-plus"></i> adicionar lembrete</button>' : ''}
              ${_botLembretePreviaHtml({ linkVagas: c.linkVagas, passos: FE.passos }, FE.lembrete)}
            </div>`}
          </div>
        </section>

        <!-- LIGAR / DESLIGAR -->
        <section class="bot-passo bot-passo-ligar">
          <div class="bot-passo-cab"><span class="bot-passo-num"><i class="fa-solid fa-power-off"></i></span>
            <h3>${salvo.ligado ? 'O bot está no ar' : 'Ligar o bot'}</h3>
          </div>
          ${faltas.length ? `<div class="bot-faltas">
            <b><i class="fa-solid fa-circle-exclamation"></i> Antes de ligar, falta:</b>
            <ul>${faltas.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('')}</ul>
          </div>` : `<p class="bot-ajuda">Tudo pronto. ${salvo.ligado
            ? 'Para parar de responder, desligue abaixo.'
            : 'Ao ligar, o bot passa a responder quem escrever para o número.'}</p>`}
          ${podeEditar ? `<button class="${salvo.ligado ? 'mod-btn-secondary' : 'mod-btn-primary'} bot-btn-ligar"
            onclick="botPedirLigar(${salvo.ligado ? 'false' : 'true'})">
            <i class="fa-solid fa-power-off"></i> ${salvo.ligado ? 'Desligar o bot' : 'Ligar o bot'}</button>` : ''}
        </section>

        <!-- DIÁRIO, RECOLHÍVEL -->
        <details class="bot-diario-bloco" ${_botDiarioAberto ? 'open' : ''} ontoggle="botDiarioLembrar(this.open)">
          <summary><i class="fa-solid fa-list-ul"></i> Últimas ações do bot
            ${(_painel && _painel.ultimos) ? '<span class="bot-contador">' + _painel.ultimos.length + '</span>' : ''}</summary>
          ${(_painel && _painel.ultimos && _painel.ultimos.length) ? `
          <div class="bot-diario">
            ${_painel.ultimos.slice(0, 25).map(function (l) {
              // CADA LINHA CONTA A HISTÓRIA: quem, o que o bot fez e por quê.
              const quem = l.contato_nome || l.contato_perfil || l.telefone || '—';
              return '<div class="bot-diario-linha">' +
                     '<span class="bot-tag bot-tag-' + esc(l.tipo) + '">' + esc(_botOQueFez(l.tipo)) + '</span>' +
                     '<span title="' + esc(l.telefone || '') + '">' + esc(quem) + '</span>' +
                     '<span class="bot-diario-det">' + esc(_botPorQue(l)) + '</span>' +
                     '<span class="bot-diario-hora">' + esc(_botHoraCurta(l.criado_em)) + '</span></div>';
            }).join('')}
          </div>` : '<div class="bot-vazio">Nada ainda. As ações aparecem aqui conforme o bot atende.</div>'}
        </details>
      </div>

      ${temRascunho() && podeEditar ? `<div class="bot-barra-salvar">
        <span><i class="fa-solid fa-pen"></i> Você tem alterações <b>não salvas</b>.</span>
        <button class="mod-btn-secondary" onclick="botDescartar()">Descartar</button>
        <button class="mod-btn-primary" onclick="botSalvarAlteracoes()"><i class="fa-solid fa-check"></i> Salvar alterações</button>
      </div>` : ''}
    `;
  }
  window._botRender = _botRender;

  // O que o bot fez, em palavras de gente.
  const O_QUE_FEZ = {
    inicio: 'começou a responder',
    concluida: 'terminou a sequência',
    atendente: 'chamou atendente',
    saida: 'parou por pedido',
    erro: 'deu erro',
    pausado: 'foi pausado',
    devolvido: 'voltou ao bot',
    teste: 'envio de teste',
    encerrada: 'encerrou',
    lembrete: 'lembrete automático'
  };
  function _botOQueFez(tipo) { return O_QUE_FEZ[tipo] || String(tipo || ''); }
  // E por quê. O detalhe do diário já traz o motivo; aqui só completa quando
  // ele veio vazio, para nenhuma linha ficar sem explicação.
  const POR_QUE = {
    inicio: 'a pessoa mandou mensagem e estava liberada para receber',
    concluida: 'todos os passos foram enviados',
    atendente: 'a pessoa pediu para falar com alguém',
    saida: 'a pessoa pediu para não receber mais',
    pausado: 'o atendente respondeu na conversa',
    devolvido: 'o atendente devolveu o contato ao bot',
    encerrada: 'a pessoa respondeu no meio da sequência'
  };
  function _botPorQue(l) {
    const d = String(l.detalhe || '').trim();
    if (d) return d;
    return POR_QUE[l.tipo] || '';
  }
  function _botHoraCurta(iso) {
    if (!iso) return '';
    const t = String(iso).replace(' ', 'T');
    const d = new Date(t.indexOf('Z') < 0 && t.indexOf('+') < 0 ? t + 'Z' : t);
    if (isNaN(d)) return String(iso);
    const p = function (n) { return String(n).padStart(2, '0'); };
    const hoje = new Date();
    const hora = p(d.getHours()) + ':' + p(d.getMinutes());
    return d.toDateString() === hoje.toDateString() ? hora : p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ' + hora;
  }

  const ROTULO_PASSO = { texto: 'Texto', imagem: 'Imagem', audio: 'Áudio', documento: 'PDF', link: 'Link' };
  const ICONE_PASSO = { texto: 'fa-font', imagem: 'fa-image', audio: 'fa-microphone', documento: 'fa-file-pdf', link: 'fa-link' };

  // `onde` diz de QUAL sequência é este passo: a do atendimento normal ou a do
  // fora do expediente. As duas usam o mesmo desenho; muda só qual função os
  // botões chamam — assim não existe uma cópia da tela para cada uma.
  function _passosHtml(c, podeEditar, onde) {
    const pre = onde === 'fora' ? 'botFora' : 'bot';
    if (!c.passos.length) {
      return '<div class="bot-vazio">' + (onde === 'fora'
        ? 'Nenhuma mensagem ainda. Escreva o que a pessoa recebe fora do horário.'
        : 'Nenhum passo ainda. Comece por um texto com o link das vagas.') + '</div>';
    }
    return c.passos.map(function (p, i) {
      const trava = podeEditar ? '' : 'disabled';
      let corpo = '';
      if (p.tipo === 'texto') {
        corpo = `<textarea class="form-control bot-textarea" rows="4" placeholder="Mensagem..." ${trava}
                   onchange="${pre}MudarPasso(${i},'texto', this.value)">${esc(p.texto)}</textarea>`;
      } else if (p.tipo === 'link') {
        corpo = `<textarea class="form-control bot-textarea" rows="2" placeholder="Texto antes do link (opcional)" ${trava}
                   onchange="${pre}MudarPasso(${i},'texto', this.value)">${esc(p.texto)}</textarea>
                 <input type="url" class="form-control" placeholder="https://... (ou deixe vazio e use {link_vagas} no texto)"
                   value="${esc(p.url)}" ${trava} onchange="${pre}MudarPasso(${i},'url', this.value)">`;
      } else {
        const temArquivo = !!p.arquivo;
        const ehAudio = p.tipo === 'audio';
        corpo = `
          <div class="bot-arquivo">
            ${temArquivo
              ? `<span class="bot-arquivo-ok"><i class="fa-solid fa-check"></i> ${esc(p.nomeArquivo || p.arquivo)}</span>`
              : '<span class="bot-arquivo-nao">Nenhum arquivo enviado</span>'}
            ${podeEditar ? `<label class="bot-btn-arq">
              <i class="fa-solid fa-upload"></i> ${temArquivo ? 'Trocar arquivo' : 'Enviar arquivo'}
              <input type="file" hidden accept="${p.tipo === 'imagem' ? 'image/*' : (ehAudio ? 'audio/ogg,.ogg,.opus' : 'application/pdf,.pdf')}"
                     onchange="${pre}SubirMidia(${i}, this)">
            </label>` : ''}
            ${(podeEditar && ehAudio) ? `<button type="button" class="bot-btn-arq bot-btn-gravar" onclick="${pre}GravarAudio(${i})">
              <i class="fa-solid fa-microphone"></i> ${temArquivo ? 'Gravar outro' : 'Gravar áudio'}
            </button>` : ''}
            ${(podeEditar && temArquivo) ? `<button type="button" class="bot-ic bot-ic-mau" title="Remover o áudio"
              onclick="${pre}TirarMidia(${i})"><i class="fa-solid fa-xmark"></i></button>` : ''}
          </div>
          ${(ehAudio && temArquivo)
            ? `<audio class="bot-audio-previa" controls preload="none"
                 src="/api/whatsapp/bot/midia/${encodeURIComponent(p.arquivo)}"></audio>`
            : ''}
          ${ehAudio
            ? '<small class="bot-ajuda">Grave aqui pelo microfone, ou envie um arquivo <b>OGG/Opus</b>. ' +
              'A gravação é convertida no servidor para o formato que o WhatsApp toca como <b>mensagem de voz</b>.</small>'
            : `<textarea class="form-control bot-textarea" rows="2" placeholder="Legenda (opcional)" ${trava}
                 onchange="${pre}MudarPasso(${i},'legenda', this.value)">${esc(p.legenda)}</textarea>`}`;
      }
      return `
        <div class="bot-passo" data-idx="${i}">
          <div class="bot-passo-topo">
            <span class="bot-passo-num">${i + 1}</span>
            <i class="fa-solid ${ICONE_PASSO[p.tipo] || 'fa-font'}"></i>
            <b>${esc(ROTULO_PASSO[p.tipo] || p.tipo)}</b>
            <span class="bot-passo-espaco"></span>
            ${i > 0 ? `<label class="bot-intervalo">espera
              <input type="number" min="0" max="600" class="bot-mini" value="${p.intervaloSeg == null ? '' : p.intervaloSeg}"
                placeholder="${Number(c.intervaloPadraoSeg) || 3}" ${podeEditar ? '' : 'disabled'}
                onchange="${pre}MudarPasso(${i},'intervaloSeg', this.value)">s</label>` : ''}
            ${podeEditar ? `
              <button class="bot-ic" title="Subir"    onclick="${pre}MoverPasso(${i},-1)" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
              <button class="bot-ic" title="Descer"   onclick="${pre}MoverPasso(${i},1)" ${i === c.passos.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
              <button class="bot-ic" title="Duplicar" onclick="${pre}DuplicarPasso(${i})"><i class="fa-solid fa-copy"></i></button>
              <button class="bot-ic bot-ic-mau" title="Remover" onclick="${pre}RemoverPasso(${i})"><i class="fa-solid fa-trash"></i></button>` : ''}
          </div>
          ${corpo}
        </div>`;
    }).join('');
  }

  // Pré-visualização no estilo conversa, já com as variáveis trocadas.
  function _previaHtml(c) {
    if (!c.passos.length) return '<div class="bot-vazio">Os passos aparecem aqui como a pessoa vai ver.</div>';
    const nome = (_eu() && _eu().nome) || 'Maria';
    return c.passos.map(function (p) {
      let txt = '';
      if (p.tipo === 'texto') txt = p.texto || '';
      else if (p.tipo === 'link') txt = (p.texto || '') + (p.url ? '\n\n' + p.url : '');
      else if (p.tipo === 'audio') txt = '[áudio' + (p.arquivo ? '' : ' — sem arquivo') + ']';
      else txt = (p.legenda || '') || ('[' + (ROTULO_PASSO[p.tipo] || p.tipo).toLowerCase() + (p.arquivo ? '' : ' — sem arquivo') + ']');
      const pronto = _trocarVariaveis(txt, nome, c.linkVagas);
      return '<div class="bot-previa-bolha texto-longo">' + esc(pronto) + '</div>';
    }).join('');
  }

  // Mesma regra do servidor (whatsapp-bot.cjs). Aqui é só para a
  // pré-visualização: quem manda de verdade é o servidor.
  function _trocarVariaveis(texto, nome, link) {
    let t = String(texto == null ? '' : texto);
    const primeiro = String(nome || '').trim().split(/\s+/)[0] || '';
    if (primeiro && !/^\d+$/.test(primeiro)) t = t.replace(/\{nome\}/gi, primeiro);
    else t = t.replace(/\s*,?\s*\{nome\}\s*,?\s*/gi, function (m) { return /,/.test(m) ? ', ' : ' '; });
    const h = new Date().getHours();
    t = t.replace(/\{saudacao\}/gi, h >= 5 && h < 12 ? 'bom dia' : (h >= 12 && h < 18 ? 'boa tarde' : 'boa noite'));
    t = t.replace(/\{link_vagas\}/gi, link || '(link não configurado)');
    return t.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;!?])/g, '$1');
  }

  function redesenhar() { const c = document.getElementById('wa-content'); if (c) _botRender(c); }

  // ── AÇÕES ────────────────────────────────────────────────────────────────
  // LIGAR E DESLIGAR PEDEM CONFIRMACAO, com o resumo do que vai valer. Ligar
  // o bot e mandar mensagem para gente de verdade: tem que ser um ato
  // consciente, nao um clique de passagem.
  window.botPedirLigar = async function (ligar) {
    const salvoAgora = cfg();
    if (temRascunho()) {
      alert('Salve ou descarte as alteracoes antes de ' + (ligar ? 'ligar' : 'desligar') + ' o bot.');
      return;
    }
    if (ligar) {
      const faltas = _botPendencias(salvoAgora);
      if (faltas.length) {
        alert('Antes de ligar o bot, falta:\n\n- ' + faltas.join('\n- '));
        return;
      }
      const L = salvoAgora.lembrete || {};
      const resumo = [
        'Resumo do que vai valer:',
        '',
        '- Quando responder: ' + (salvoAgora.modo === 'sempre' ? 'sempre que a pessoa escrever' : 'so na primeira vez'),
        '- Sequencia: ' + (salvoAgora.passos || []).length + ' mensagem(ns)',
        '- Link das vagas: ' + (String(salvoAgora.linkVagas || '').trim() || '(nao configurado)'),
        '- Lembrete: ' + (L.ligado
            ? ((L.lembretes || []).length + ' lembrete(s), evento as ' + (L.horario || '?') + (L.data ? ' de ' + L.data : ''))
            : 'desligado'),
        '',
        'O bot passa a responder quem escrever para o numero.'
      ].join('\n');
      if (!confirm(resumo)) return;
    } else {
      if (!confirm('Desligar o bot?\n\nNinguem recebe mais mensagem automatica, e os lembretes ja agendados continuam valendo (cancele no painel se nao quiser).')) return;
    }
    const c = cfg();
    c.ligado = !!ligar;
    if (ligar) c.ligadoEm = new Date().toISOString();
    await salvar(ligar ? 'LIGADO' : 'DESLIGADO');
    _painel = null;                       // recarrega os numeros
    redesenhar();
  };
  // Mantido para quem ainda chamar pelo nome antigo (interruptor velho).
  window.botAlternarLigado = function (ligado) { return botPedirLigar(!!ligado); };

  // ── SALVAR / DESCARTAR O RASCUNHO ───────────────────────────────────────
  window.botSalvarAlteracoes = async function () {
    if (!temRascunho()) return;
    const r = _rascunho;
    const faltas = _botPendencias(r);
    const aviso = faltas.length
      ? 'Salvar as alteracoes?\n\nAtencao: com isto o bot ainda NAO pode ser ligado, falta:\n- ' + faltas.join('\n- ')
      : 'Salvar as alteracoes do bot?';
    if (!confirm(aviso)) return;
    // Limpa os lembretes sem texto antes de gravar, para nao guardar lixo.
    if (r.lembrete && r.lembrete.ligado) {
      r.lembrete.lembretes = (r.lembrete.lembretes || []).filter(function (l) {
        return l && String(l.texto || '').trim();
      });
    }
    const alvo = cfg();
    Object.keys(r).forEach(function (k) { alvo[k] = r[k]; });
    _rascunho = null;
    await salvar('alterou a configuracao');
    redesenhar();
  };
  window.botDescartar = function () {
    if (!temRascunho()) return;
    if (!confirm('Descartar as alteracoes nao salvas?')) return;
    _rascunho = null;
    redesenhar();
  };

  // Diario recolhivel: lembra se estava aberto.
  window.botDiarioLembrar = function (aberto) { _botDiarioAberto = !!aberto; };

  // ── CADASTRO DO LEMBRETE DO BOT ─────────────────────────────────────────
  // Mesma forma das mensagens prontas (e o MESMO motor envia), mas aqui o
  // evento pertence ao atendimento automatico.
  function _lembreteDoRascunho() {
    const c = rasc();
    if (!c.lembrete || typeof c.lembrete !== 'object') {
      c.lembrete = { ligado: false, titulo: '', horario: '', data: '', lembretes: [] };
    }
    if (!Array.isArray(c.lembrete.lembretes)) c.lembrete.lembretes = [];
    return c.lembrete;
  }
  window.botLembreteLigar = function (ligado) {
    const L = _lembreteDoRascunho();
    L.ligado = !!ligado;
    if (L.ligado && !L.lembretes.length) {
      // Começa com o par que o atendimento usa todo dia. Os textos são
      // editáveis: nada vai para a pessoa sem passar por aqui.
      L.horario = L.horario || '12:00';
      L.lembretes = [
        { id: _novoIdLembrete(), tipo: 'minutos', valor: 15, texto: '{saudacao} {nome}! Sua entrevista e as {horario}. O link e este: {link}' },
        { id: _novoIdLembrete(), tipo: 'na_hora', valor: 0, texto: '{nome}, a entrevista ja comecou. Estou te esperando: {link}' }
      ];
    }
    redesenhar();
  };
  window.botLembreteCampo = function (campo, valor) {
    _lembreteDoRascunho()[campo] = String(valor || '');
    redesenhar();
  };
  window.botLembreteNovo = function () {
    _lembreteDoRascunho().lembretes.push({ id: _novoIdLembrete(), tipo: 'minutos', valor: 30, texto: '' });
    redesenhar();
  };
  window.botLembreteRemover = function (i) {
    _lembreteDoRascunho().lembretes.splice(i, 1);
    redesenhar();
  };
  window.botLembreteItem = function (i, campo, valor) {
    const L = _lembreteDoRascunho();
    if (!L.lembretes[i]) return;
    L.lembretes[i][campo] = campo === 'valor' ? Math.max(0, Number(valor) || 0) : String(valor || '');
    if (campo !== 'texto') redesenhar();     // texto nao redesenha: perderia o cursor
  };
  window.botLembreteAnexar = function (i, input) {
    const L = _lembreteDoRascunho();
    const arq = input && input.files && input.files[0];
    if (!arq || !L.lembretes[i]) return;
    if (arq.size > 20 * 1024 * 1024) { alert('Arquivo muito grande (maximo 20 MB).'); input.value = ''; return; }
    const leitor = new FileReader();
    leitor.onload = async function () {
      try {
        // Mesma pasta segura das mensagens prontas (fora de /uploads/).
        const r = await fetch('/api/whatsapp/respostas/midia', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: leitor.result })
        });
        const j = await r.json().catch(function () { return {}; });
        if (!j.ok) { alert(j.error || 'Nao consegui enviar o arquivo.'); return; }
        L.lembretes[i].arquivo = j.arquivo;
        L.lembretes[i].nomeArquivo = arq.name;
        L.lembretes[i].mime = j.mime;
        L.lembretes[i].tipoAnexo = j.tipoAnexo;
        redesenhar();
      } catch (e) { alert('Falha no envio: ' + (e.message || e)); }
    };
    leitor.readAsDataURL(arq);
  };
  window.botLembreteTirarAnexo = function (i) {
    const L = _lembreteDoRascunho();
    if (!L.lembretes[i]) return;
    L.lembretes[i].arquivo = ''; L.lembretes[i].nomeArquivo = '';
    L.lembretes[i].mime = ''; L.lembretes[i].tipoAnexo = '';
    redesenhar();
  };
  // ══════════════════════════════════════════════════════════════════════════
  // MODO FORA DO EXPEDIENTE — handlers
  // O funil e os lembretes ficam no RASCUNHO (valem ao salvar). O
  // INTERRUPTOR tem rota propria: ele precisa registrar na Auditoria quem
  // ligou e marcar o periodo, e vale na hora.
  // ══════════════════════════════════════════════════════════════════════════
  function _foraDoRascunho() {
    const c = rasc();
    if (!c.foraExpediente || typeof c.foraExpediente !== 'object') {
      c.foraExpediente = { ligado: false, passos: [], lembrete: { ligado: false, titulo: '', horario: '', data: '', lembretes: [] } };
    }
    if (!Array.isArray(c.foraExpediente.passos)) c.foraExpediente.passos = [];
    if (!c.foraExpediente.lembrete || typeof c.foraExpediente.lembrete !== 'object') {
      c.foraExpediente.lembrete = { ligado: false, titulo: '', horario: '', data: '', lembretes: [] };
    }
    if (!Array.isArray(c.foraExpediente.lembrete.lembretes)) c.foraExpediente.lembrete.lembretes = [];
    return c.foraExpediente;
  }

  function _botSituacaoFora(c) {
    const fe = (cfg().foraExpediente) || {};
    const rascFe = (c.foraExpediente) || {};
    if (fe.ligado) {
      return '<span class="bot-passo-ok"><i class="fa-solid fa-circle-check"></i> ligado' +
        (fe.ligadoPor ? ' por ' + esc(fe.ligadoPor) : '') + '</span>';
    }
    if (!(rascFe.passos || []).length) {
      return '<span class="bot-passo-falta"><i class="fa-solid fa-circle-exclamation"></i> sem o funil escrito</span>';
    }
    return '<span class="bot-passo-ok"><i class="fa-regular fa-circle"></i> pronto, desligado</span>';
  }

  function _botQuandoDesliga(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const p = function (n) { return String(n).padStart(2, '0'); };
    const hoje = new Date();
    const hora = p(d.getHours()) + ':' + p(d.getMinutes());
    return d.toDateString() === hoje.toDateString() ? 'hoje às ' + hora
      : p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' às ' + hora;
  }

  // O interruptor: confirmacao com resumo, e a rota propria do servidor.
  window.botForaExpediente = async function (ligar) {
    if (temRascunho()) {
      alert('Salve ou descarte as alteracoes antes de ' + (ligar ? 'ligar' : 'desligar') + ' o modo fora do expediente.');
      return;
    }
    const fe = (cfg().foraExpediente) || {};
    if (ligar) {
      if (!((fe.passos || []).length)) {
        alert('Escreva o funil do fora do expediente antes de ligar.');
        return;
      }
      const L = fe.lembrete || {};
      const sel = document.getElementById('bot-fora-auto');
      const auto = sel ? sel.value : '';
      const resumo = [
        'Ligar o modo FORA DO EXPEDIENTE?',
        '',
        '- Quem escrever (contato novo ou antigo) recebe o funil: ' + (fe.passos || []).length + ' mensagem(ns)',
        '- Cada pessoa recebe uma vez, enquanto o modo estiver ligado',
        '- Lembretes: ' + (L.ligado
            ? ((L.lembretes || []).length + ' lembrete(s), entrevista as ' + (L.horario || '?') + (L.data ? ' de ' + L.data : ''))
            : 'desligados'),
        '- Desligar sozinho: ' + (auto ? auto.replace('amanha-', 'amanha as ') : 'nao'),
        '',
        'Pedido de saida, pedido de atendente e contato pausado continuam sendo respeitados.'
      ].join('\n');
      if (!confirm(resumo)) return;
      let desligarEm = '';
      if (auto && auto.indexOf('amanha-') === 0) {
        const hhmm = auto.split('-')[1].split(':');
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(Number(hhmm[0]) || 8, Number(hhmm[1]) || 0, 0, 0);
        desligarEm = d.toISOString();
      }
      await _botChamarForaExpediente(true, desligarEm);
    } else {
      if (!confirm('Desligar o modo fora do expediente?\n\nQuem escrever volta a cair no atendimento normal. Os lembretes ja agendados continuam valendo (cancele no painel se nao quiser).')) return;
      await _botChamarForaExpediente(false, '');
    }
  };

  async function _botChamarForaExpediente(ligar, desligarEm) {
    try {
      const r = await fetch('/api/whatsapp/bot/fora-expediente', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ligar: !!ligar, desligarEm: desligarEm || '' })
      });
      const j = await r.json().catch(function () { return {}; });
      if (!j.ok) { alert(j.error || 'Nao consegui mudar o modo.'); return; }
      // O servidor e quem manda aqui: a tela adota o que ele devolveu.
      if (window.state) {
        state.botWhatsapp = state.botWhatsapp || {};
        state.botWhatsapp.foraExpediente = j.foraExpediente || {};
      }
      _painel = null;
      redesenhar();
    } catch (e) {
      alert('Falha: ' + (e.message || e));
    }
  }

  // Funil: os mesmos handlers dos passos, mas no fora do expediente.
  window.botForaAddPasso = function (tipo) {
    _foraDoRascunho().passos.push({ id: _novoIdPasso(), tipo: tipo, texto: '', legenda: '', url: '', arquivo: '', nomeArquivo: '', mime: '', intervaloSeg: null });
    redesenhar();
  };
  window.botForaMudarPasso = function (i, campo, valor) {
    const fe = _foraDoRascunho();
    if (!fe.passos[i]) return;
    if (campo === 'intervaloSeg') {
      const n = String(valor).trim();
      fe.passos[i].intervaloSeg = n === '' ? null : Math.max(0, Number(n) || 0);
    } else {
      fe.passos[i][campo] = String(valor == null ? '' : valor);
    }
    if (campo !== 'texto' && campo !== 'legenda') redesenhar();
  };
  window.botForaRemoverPasso = function (i) {
    const fe = _foraDoRascunho();
    if (!fe.passos[i]) return;
    if (!confirm('Remover a mensagem ' + (i + 1) + ' do funil?')) return;
    fe.passos.splice(i, 1);
    redesenhar();
  };
  window.botForaDuplicarPasso = function (i) {
    const fe = _foraDoRascunho();
    if (!fe.passos[i]) return;
    const copia = JSON.parse(JSON.stringify(fe.passos[i]));
    copia.id = _novoIdPasso();
    fe.passos.splice(i + 1, 0, copia);
    redesenhar();
  };
  window.botForaMoverPasso = function (i, dir) {
    const fe = _foraDoRascunho();
    const j = i + dir;
    if (j < 0 || j >= fe.passos.length) return;
    const t = fe.passos[i]; fe.passos[i] = fe.passos[j]; fe.passos[j] = t;
    redesenhar();
  };
  window.botForaSubirMidia = async function (i, input) {
    const fe = _foraDoRascunho();
    const arq = input && input.files && input.files[0];
    if (!arq || !fe.passos[i]) return;
    const destino = fe.passos[i].tipo;
    const leitor = new FileReader();
    leitor.onload = async function () {
      try {
        const r = await fetch('/api/whatsapp/bot/midia', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: leitor.result, destino: destino })
        });
        const j = await r.json().catch(function () { return {}; });
        if (!j.ok) { alert(j.error || 'Nao consegui enviar o arquivo.'); return; }
        fe.passos[i].arquivo = j.arquivo;
        fe.passos[i].nomeArquivo = arq.name;
        fe.passos[i].mime = j.mime;
        redesenhar();
      } catch (e) { alert('Falha no envio: ' + (e.message || e)); }
    };
    leitor.readAsDataURL(arq);
  };

  // Gravar na hora na sequência do FORA DO EXPEDIENTE. Mesmo gravador, mesma
  // regra: entra no passo só depois de "Usar este áudio".
  window.botForaGravarAudio = function (i) {
    const fe = _foraDoRascunho();
    if (!fe.passos[i] || !window.RTAudio) return;
    RTAudio.gravar({
      destino: 'fora', titulo: 'Gravar áudio do passo ' + (i + 1),
      aoUsar: function (res) {
        fe.passos[i].arquivo = res.arquivo;
        fe.passos[i].nomeArquivo = res.nomeArquivo;
        fe.passos[i].mime = res.mime;
        redesenhar();
      }
    });
  };
  window.botForaTirarMidia = function (i) {
    const fe = _foraDoRascunho();
    if (!fe.passos[i]) return;
    fe.passos[i].arquivo = ''; fe.passos[i].nomeArquivo = ''; fe.passos[i].mime = '';
    redesenhar();
  };

  // Lembretes do fora do expediente.
  window.botForaLembreteLigar = function (ligado) {
    const L = _foraDoRascunho().lembrete;
    L.ligado = !!ligado;
    if (L.ligado && !L.lembretes.length) {
      L.horario = L.horario || '10:00';
      L.lembretes = [
        { id: _novoIdLembrete(), tipo: 'minutos', valor: 10, texto: 'Nao esquece, {nome}: a entrevista comeca em 10 minutos. Link: {link}' },
        { id: _novoIdLembrete(), tipo: 'na_hora', valor: 0, texto: '{nome}, a entrevista comecou agora. Estou te esperando: {link}' }
      ];
    }
    redesenhar();
  };
  window.botForaLembreteCampo = function (campo, valor) {
    _foraDoRascunho().lembrete[campo] = String(valor || '');
    redesenhar();
  };
  window.botForaLembreteAmanha = function () {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const p = function (n) { return String(n).padStart(2, '0'); };
    _foraDoRascunho().lembrete.data = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    redesenhar();
  };
  window.botForaLembreteNovo = function () {
    _foraDoRascunho().lembrete.lembretes.push({ id: _novoIdLembrete(), tipo: 'minutos', valor: 30, texto: '' });
    redesenhar();
  };
  window.botForaLembreteRemover = function (i) {
    _foraDoRascunho().lembrete.lembretes.splice(i, 1);
    redesenhar();
  };
  window.botForaLembreteItem = function (i, campo, valor) {
    const L = _foraDoRascunho().lembrete;
    if (!L.lembretes[i]) return;
    L.lembretes[i][campo] = campo === 'valor' ? Math.max(0, Number(valor) || 0) : String(valor || '');
    if (campo !== 'texto') redesenhar();
  };
  window.botForaLembreteAnexar = function (i, input) {
    const L = _foraDoRascunho().lembrete;
    const arq = input && input.files && input.files[0];
    if (!arq || !L.lembretes[i]) return;
    if (arq.size > 20 * 1024 * 1024) { alert('Arquivo muito grande (maximo 20 MB).'); input.value = ''; return; }
    const leitor = new FileReader();
    leitor.onload = async function () {
      try {
        const r = await fetch('/api/whatsapp/respostas/midia', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: leitor.result })
        });
        const j = await r.json().catch(function () { return {}; });
        if (!j.ok) { alert(j.error || 'Nao consegui enviar o arquivo.'); return; }
        L.lembretes[i].arquivo = j.arquivo;
        L.lembretes[i].nomeArquivo = arq.name;
        L.lembretes[i].mime = j.mime;
        L.lembretes[i].tipoAnexo = j.tipoAnexo;
        redesenhar();
      } catch (e) { alert('Falha no envio: ' + (e.message || e)); }
    };
    leitor.readAsDataURL(arq);
  };
  window.botForaLembreteTirarAnexo = function (i) {
    const L = _foraDoRascunho().lembrete;
    if (!L.lembretes[i]) return;
    L.lembretes[i].arquivo = ''; L.lembretes[i].nomeArquivo = '';
    L.lembretes[i].mime = ''; L.lembretes[i].tipoAnexo = '';
    redesenhar();
  };

  function _novoIdLembrete() {
    return 'lem-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // Um item do lembrete na tela.
  function _botLembreteItemHtml(l, i, trava, onde) {
    const pre = onde === 'fora' ? 'botForaLembrete' : 'botLembrete';
    const tipo = l.tipo || 'minutos';
    const anexo = l.arquivo
      ? '<span class="wa-prontas-chip"><i class="fa-solid ' + (l.tipoAnexo === 'documento' ? 'fa-file-pdf' : 'fa-image') + '"></i> ' +
        esc(l.nomeArquivo || l.arquivo) +
        '<button class="wa-btn-mini perigo" title="Tirar o anexo" onclick="' + pre + 'TirarAnexo(' + i + ')"><i class="fa-solid fa-xmark"></i></button></span>'
      : '<label class="wa-btn-arq-mini"><i class="fa-solid fa-paperclip"></i> anexo' +
        '<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" style="display:none" onchange="' + pre + 'Anexar(' + i + ', this)"></label>';
    return '<div class="wa-lembrete-item">' +
      '<div class="wa-lembrete-item-topo">' +
        '<select ' + trava + ' onchange="' + pre + 'Item(' + i + ', \'tipo\', this.value)">' +
          '<option value="minutos"' + (tipo === 'minutos' ? ' selected' : '') + '>minutos antes</option>' +
          '<option value="horas"' + (tipo === 'horas' ? ' selected' : '') + '>horas antes</option>' +
          '<option value="na_hora"' + (tipo === 'na_hora' ? ' selected' : '') + '>na hora do evento</option>' +
        '</select>' +
        (tipo === 'na_hora' ? '' :
          '<input type="number" min="1" max="999" class="wa-lembrete-num" value="' + (Number(l.valor) || 15) + '" ' + trava +
          ' onchange="' + pre + 'Item(' + i + ', \'valor\', this.value)">') +
        anexo +
        '<button class="wa-btn-mini perigo" title="Remover este lembrete" onclick="' + pre + 'Remover(' + i + ')"><i class="fa-solid fa-trash"></i></button>' +
      '</div>' +
      '<textarea rows="2" placeholder="Ex.: {saudacao} {nome}! Sua entrevista e as {horario}. Link: {link}" ' + trava +
        ' oninput="' + pre + 'Item(' + i + ', \'texto\', this.value)">' + esc(l.texto || '') + '</textarea>' +
    '</div>';
  }

  // Previa de como cada lembrete vai chegar.
  function _botLembretePreviaHtml(c, L) {
    const validos = (L.lembretes || []).filter(function (l) { return String(l.texto || '').trim(); });
    if (!validos.length) return '';
    const horario = L.horario || '';
    const link = String(c.linkVagas || '') || '(link nao configurado)';
    const itens = validos.map(function (l) {
      const min = l.tipo === 'na_hora' ? 0 : (l.tipo === 'horas' ? (Number(l.valor) || 0) * 60 : (Number(l.valor) || 0));
      return {
        rotulo: min === 0 ? 'na hora do evento'
          : (min % 60 === 0 ? (min / 60) + (min === 60 ? ' hora antes' : ' horas antes')
                            : min + (min === 1 ? ' minuto antes' : ' minutos antes')),
        sai: _horarioMenos(horario, min),
        texto: _trocarVariaveis(String(l.texto || '').replace(/\{horario\}/gi, horario || '?'), 'Maria Silva', link)
      };
    }).sort(function (a, b) { return a.sai < b.sai ? -1 : 1; });
    return '<div class="wa-lembrete-previa">' +
      '<div class="wa-lembrete-previa-tit"><i class="fa-regular fa-eye"></i> Como vai chegar</div>' +
      itens.map(function (x) {
        return '<div class="wa-lembrete-previa-item">' +
          '<span class="wa-lembrete-previa-hora">' + esc(x.sai) + '</span>' +
          '<span class="wa-lembrete-previa-rot">' + esc(x.rotulo) + '</span>' +
          '<div class="bot-previa-bolha texto-longo">' + esc(x.texto) + '</div>' +
        '</div>';
      }).join('') + '</div>';
  }
  function _horarioMenos(hhmm, minutos) {
    const p = String(hhmm || '').split(':');
    if (p.length < 2) return '--:--';
    let total = (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0) - (Number(minutos) || 0);
    while (total < 0) total += 1440;
    const dois = function (n) { return String(n).padStart(2, '0'); };
    return dois(Math.floor(total / 60) % 24) + ':' + dois(total % 60);
  }
  // ── EDICAO EM RASCUNHO ──────────────────────────────────────────────────
  // Nenhum campo grava sozinho: tudo vai para o rascunho e so vale depois de
  // "Salvar alteracoes". Era desconfortavel demais trocar uma palavra e aquilo
  // ja valer para quem estiver escrevendo para o numero naquele segundo.
  window.botMudarCampo = function (campo, valor) { rasc()[campo] = valor; redesenhar(); };
  window.botMudarNumero = function (campo, valor) { rasc()[campo] = Math.max(0, Number(valor) || 0); redesenhar(); };
  window.botMudarNumeroEm = function (grupo, campo, valor) { rasc()[grupo][campo] = Math.max(0, Number(valor) || 0); redesenhar(); };
  window.botMudarTexto = function (grupo, campo, valor) { rasc()[grupo][campo] = String(valor || ''); marcarMudou(); };
  window.botMudarLista = function (grupo, campo, valor) {
    rasc()[grupo][campo] = String(valor || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    marcarMudou();
  };
  window.botMudarPasso = function (i, campo, valor) {
    const c = rasc();
    if (!c.passos[i]) return;
    if (campo === 'intervaloSeg') {
      const n = String(valor).trim();
      c.passos[i].intervaloSeg = n === '' ? null : Math.max(0, Number(n) || 0);
    } else {
      c.passos[i][campo] = String(valor == null ? '' : valor);
    }
    // A previa atualiza na hora, sem redesenhar a tela (o cursor fica onde
    // esta). O que grava mesmo e o botao "Salvar alteracoes".
    const el = document.getElementById('bot-previa');
    if (el && campo !== 'intervaloSeg') el.innerHTML = _previaHtml(c);
  };
  window.botAddPasso = function (tipo) {
    rasc().passos.push({ id: _novoIdPasso(), tipo: tipo, texto: '', legenda: '', url: '', arquivo: '', nomeArquivo: '', mime: '', intervaloSeg: null });
    redesenhar();
  };
  window.botRemoverPasso = function (i) {
    const c = rasc();
    if (!c.passos[i]) return;
    if (!confirm('Remover o passo ' + (i + 1) + '?')) return;
    c.passos.splice(i, 1);
    // A remocao vale no servidor por causa do setKeys do salvar(): a lista
    // inteira e substituida. Sem ele, o merge so acrescenta e o passo voltava.
    redesenhar();
  };
  window.botDuplicarPasso = function (i) {
    const c = rasc();
    if (!c.passos[i]) return;
    const copia = JSON.parse(JSON.stringify(c.passos[i]));
    copia.id = _novoIdPasso();
    c.passos.splice(i + 1, 0, copia);
    redesenhar();
  };
  window.botMoverPasso = function (i, dir) {
    const c = rasc();
    const j = i + dir;
    if (j < 0 || j >= c.passos.length) return;
    const t = c.passos[i]; c.passos[i] = c.passos[j]; c.passos[j] = t;
    redesenhar();
  };
  function _novoIdPasso() {
    return (typeof _novoId === 'function') ? _novoId('passo')
      : 'passo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }

  window.botSubirMidia = async function (i, input) {
    const c = rasc();
    const arq = input && input.files && input.files[0];
    if (!arq || !c.passos[i]) return;
    const destino = c.passos[i].tipo;
    const leitor = new FileReader();
    leitor.onload = async function () {
      try {
        const r = await fetch('/api/whatsapp/bot/midia', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: leitor.result, destino: destino })
        });
        const j = await r.json().catch(function () { return {}; });
        if (!j.ok) { alert(j.error || 'Não consegui enviar o arquivo.'); return; }
        c.passos[i].arquivo = j.arquivo;
        c.passos[i].nomeArquivo = arq.name;
        c.passos[i].mime = j.mime;
        // O arquivo ja esta no servidor; a configuracao so vale ao salvar.
        redesenhar();
      } catch (e) { alert('Falha no envio: ' + (e.message || e)); }
    };
    leitor.readAsDataURL(arq);
  };

  // GRAVAR NA HORA. O arquivo só entra no passo depois de "Usar este áudio"
  // (o gravador cuida disso) e, como o resto da aba, só vale ao salvar.
  window.botGravarAudio = function (i) {
    const c = rasc();
    if (!c.passos[i] || !window.RTAudio) return;
    RTAudio.gravar({
      destino: 'bot', titulo: 'Gravar áudio do passo ' + (i + 1),
      aoUsar: function (res) {
        c.passos[i].arquivo = res.arquivo;
        c.passos[i].nomeArquivo = res.nomeArquivo;
        c.passos[i].mime = res.mime;
        redesenhar();
      }
    });
  };
  window.botTirarMidia = function (i) {
    const c = rasc();
    if (!c.passos[i]) return;
    c.passos[i].arquivo = ''; c.passos[i].nomeArquivo = ''; c.passos[i].mime = '';
    redesenhar();
  };

  window.botAtualizarPainel = async function () { _painel = null; redesenhar(); };

  // ── CONTROLE DO BOT DENTRO DA CONVERSA ───────────────────────────────────
  // Preenche o espaço que o cabeçalho da conversa reservou, mostrando se o
  // bot está ativo naquele contato e o botão certo. Pausar é por contato, não
  // geral: o interruptor da aba continua ligado para todos os outros.
  // Em que pé está o bot NESTE contato, e por quê. Uma função só, para a
  // conversa e o diário contarem a mesma história.
  function _botEstadoDoContato(ct, resp) {
    if (ct.optou_sair) {
      return { classe: 'saiu', icone: 'fa-ban', rotulo: 'bot encerrado', pausado: true,
               motivo: 'a pessoa pediu para sair' };
    }
    if (ct.aguardando_atendente) {
      return { classe: 'pausado', icone: 'fa-hand', rotulo: 'bot pausado', pausado: true,
               motivo: 'a pessoa pediu atendente' };
    }
    if (ct.pausado) {
      return { classe: 'pausado', icone: 'fa-pause', rotulo: 'bot pausado', pausado: true,
               motivo: ct.pausado_por
                 ? 'o atendente respondeu (' + ct.pausado_por + ')'
                 : 'pausado neste contato' };
    }
    if (resp && resp.config && resp.config.ligado === false) {
      return { classe: 'pausado', icone: 'fa-power-off', rotulo: 'bot desligado', pausado: false,
               motivo: 'o interruptor geral está desligado' };
    }
    if (ct.total_respostas > 0) {
      return { classe: 'ligado', icone: 'fa-robot', rotulo: 'bot ativo', pausado: false,
               motivo: 'já respondeu ' + ct.total_respostas + 'x neste contato' };
    }
    return { classe: 'ligado', icone: 'fa-robot', rotulo: 'bot ativo', pausado: false, motivo: '' };
  }

  window.botCarregarControle = async function (contactId) {
    const alvo = document.getElementById('wa-bot-ctrl');
    if (!alvo || !contactId) return;
    try {
      const r = await fetch('/api/whatsapp/bot/contato/' + encodeURIComponent(contactId), { credentials: 'same-origin' });
      const j = await r.json().catch(function () { return {}; });
      if (!j.ok || !j.disponivel) { alvo.innerHTML = ''; return; }
      const ct = j.contato || {};
      // ESTADO E MOTIVO, ESCRITOS NA TELA. Antes o motivo ficava só no "title"
      // (aparecia ao parar o mouse em cima) e ninguém via: a pessoa não sabia
      // por que o bot tinha parado naquele contato.
      const est = _botEstadoDoContato(ct, j);
      alvo.innerHTML =
        '<span class="wa-bot-estado ' + est.classe + '" title="' + esc(est.motivo || est.rotulo) + '">' +
          '<i class="fa-solid ' + est.icone + '"></i> ' + esc(est.rotulo) +
        '</span>' +
        (est.motivo ? '<span class="wa-bot-motivo">' + esc(est.motivo) + '</span>' : '') +
        (_botPodeEditar()
          ? '<button class="wa-btn-mini" title="' + (est.pausado ? 'Devolver ao bot' : 'Pausar o bot neste contato') +
            '" onclick="botAlternarContato(' + Number(contactId) + ',' + (est.pausado ? 'false' : 'true') + ')">' +
            '<i class="fa-solid ' + (est.pausado ? 'fa-rotate-left' : 'fa-pause') + '"></i></button>'
          : '');
    } catch (e) { alvo.innerHTML = ''; }
  };

  window.botAlternarContato = async function (contactId, pausar) {
    try {
      const r = await fetch('/api/whatsapp/bot/contato/' + encodeURIComponent(contactId) +
                            '/' + (pausar ? 'pausar' : 'devolver'),
                            { method: 'POST', credentials: 'same-origin' });
      const j = await r.json().catch(function () { return {}; });
      if (!j.ok) { alert(j.error || 'Não consegui mudar.'); return; }
      if (typeof registrarLogGlobal === 'function') {
        registrarLogGlobal('Bot do WhatsApp: ' + (pausar ? 'pausado' : 'devolvido') + ' no contato ' + contactId + '.', 'whatsapp');
      }
      botCarregarControle(contactId);
    } catch (e) { alert('Falha: ' + (e.message || e)); }
  };

  window.botEnviarTeste = async function () {
    const campo = document.getElementById('bot-teste-tel');
    const res = document.getElementById('bot-teste-res');
    const tel = (campo && campo.value || '').replace(/\D/g, '');
    if (tel.length < 10) { if (res) res.textContent = 'Digite o número com DDD (e 55 na frente).'; return; }
    const conta = (window._waContaSel || (_painel && _painel.conta_id) || 0);
    if (res) res.textContent = 'Enviando...';
    try {
      const r = await fetch('/api/whatsapp/bot/teste', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone: tel, account_id: conta, nome: (loggedUser && loggedUser.nome) || '' })
      });
      const j = await r.json().catch(function () { return {}; });
      if (!res) return;
      if (j.ok) { res.textContent = 'Enviado. Confira o WhatsApp do número ' + tel + '.'; return; }
      const falhos = (j.resultados || []).filter(function (x) { return !x.ok; });
      res.textContent = falhos.length
        ? 'Alguns passos falharam: ' + falhos.map(function (x) { return 'passo ' + x.passo + ' (' + x.erro + ')'; }).join('; ')
        : (j.error || 'Não consegui enviar.');
    } catch (e) {
      if (res) res.textContent = 'Falha: ' + (e.message || e);
    }
  };
})();
