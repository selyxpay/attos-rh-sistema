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
  async function _botRender(cont) {
    if (!_botPodeVer()) {
      cont.innerHTML = '<div class="wa-vazio">Você não tem acesso à aba Bot.</div>';
      return;
    }
    if (_painel === null) { cont.innerHTML = '<div class="wa-vazio">Carregando...</div>'; await carregarPainel(); }
    const c = cfg();
    const podeEditar = _botPodeEditar();
    const trava = podeEditar ? '' : 'disabled';
    const p = (_painel && _painel.painel) || {};

    cont.innerHTML = `
      <div class="bot-topo">
        <div class="bot-liga">
          <label class="bot-switch">
            <input type="checkbox" id="bot-ligado" ${c.ligado ? 'checked' : ''} ${trava}
                   onchange="botAlternarLigado(this.checked)">
            <span class="bot-switch-pista"><span class="bot-switch-bola"></span></span>
          </label>
          <div>
            <b id="bot-estado-txt">${c.ligado ? 'Bot ligado' : 'Bot desligado'}</b>
            <div class="bot-sub">${c.ligado
              ? 'Respondendo automaticamente quem chama.'
              : 'Ninguém recebe mensagem automática enquanto estiver assim.'}</div>
          </div>
        </div>
        <button class="mod-btn-secondary" onclick="botAtualizarPainel()">
          <i class="fa-solid fa-rotate"></i> Atualizar
        </button>
      </div>

      ${!c.ligado ? `<div class="bot-aviso-off">
        <i class="fa-solid fa-circle-info"></i>
        O bot está desligado. Configure os passos abaixo, use <b>Enviar teste</b> para
        conferir no seu número, e só então ligue.
      </div>` : ''}

      <div class="bot-cartoes">
        ${[['Atendidos hoje', p.contatos_hoje], ['Na semana', p.contatos_semana],
           ['No mês', p.contatos_mes], ['Sequências completas', p.sequencias_completas],
           ['Com falha', p.com_falha], ['Pediram atendente (hoje)', p.pedidos_atendente_hoje],
           ['Na fila agora', p.na_fila], ['Pediram para sair', p.saidas]]
          .map(function (x) {
            return '<div class="bot-cartao"><b>' + (x[1] == null ? '—' : x[1]) + '</b><span>' + esc(x[0]) + '</span></div>';
          }).join('')}
      </div>

      <div class="bot-colunas">
        <div class="bot-coluna">
          <h3 class="bot-titulo">Quando o bot responde</h3>
          <label class="bot-opcao">
            <input type="radio" name="bot-modo" value="primeira_vez" ${c.modo === 'primeira_vez' ? 'checked' : ''} ${trava}
                   onchange="botMudarCampo('modo','primeira_vez')">
            <div><b>Só na primeira vez</b>
              <small>Responde no primeiro contato da pessoa. Se ela voltar depois de
              <input type="number" min="0" max="365" class="bot-mini" id="bot-dias" value="${Number(c.diasParaNovoContato) || 0}" ${trava}
                     onchange="botMudarNumero('diasParaNovoContato', this.value)"> dia(s) sem conversa, responde de novo.
              Com 0, responde uma única vez para sempre.</small>
            </div>
          </label>
          <label class="bot-opcao">
            <input type="radio" name="bot-modo" value="sempre" ${c.modo === 'sempre' ? 'checked' : ''} ${trava}
                   onchange="botMudarCampo('modo','sempre')">
            <div><b>Sempre que a pessoa mandar mensagem</b>
              <small>Com limite por contato:
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

          <h3 class="bot-titulo">Link das vagas</h3>
          <p class="bot-ajuda">Use <code>{link_vagas}</code> no texto dos passos e o endereço entra aqui.</p>
          <input type="url" class="form-control" id="bot-link" placeholder="https://..." value="${esc(c.linkVagas)}" ${trava}
                 onchange="botMudarCampo('linkVagas', this.value)">

          <h3 class="bot-titulo">Passar para atendente</h3>
          <p class="bot-ajuda">Quando a pessoa escrever uma destas palavras, o bot avisa e para naquele contato.</p>
          <input type="text" class="form-control" placeholder="atendente, falar com alguem, humano"
                 value="${esc((c.atendente.palavras || []).join(', '))}" ${trava}
                 onchange="botMudarLista('atendente','palavras', this.value)">
          <textarea class="form-control bot-textarea" rows="3" placeholder="Mensagem que o bot manda ao chamar o atendente" ${trava}
                    onchange="botMudarTexto('atendente','mensagem', this.value)">${esc(c.atendente.mensagem)}</textarea>
          <label class="bot-linha-num">O bot volta a atender depois de
            <input type="number" min="0" max="720" class="bot-mini" value="${Number(c.atendente.voltarAposHoras) || 0}" ${trava}
                   onchange="botMudarNumeroEm('atendente','voltarAposHoras', this.value)"> hora(s) sem conversa.
          </label>

          <h3 class="bot-titulo">Pedido de saída</h3>
          <p class="bot-ajuda">Depois disto o bot nunca mais manda nada automático para aquela pessoa.</p>
          <input type="text" class="form-control" placeholder="sair, parar, nao quero"
                 value="${esc((c.saida.palavras || []).join(', '))}" ${trava}
                 onchange="botMudarLista('saida','palavras', this.value)">
          <textarea class="form-control bot-textarea" rows="2" placeholder="Mensagem curta de confirmação" ${trava}
                    onchange="botMudarTexto('saida','mensagem', this.value)">${esc(c.saida.mensagem)}</textarea>
        </div>

        <div class="bot-coluna">
          <h3 class="bot-titulo">Sequência de mensagens
            <span class="bot-contador">${c.passos.length} passo(s)</span>
          </h3>
          <p class="bot-ajuda">
            Variáveis: <code>{nome}</code> (se a pessoa não tiver nome salvo, a frase
            continua natural), <code>{saudacao}</code> (bom dia/boa tarde/boa noite,
            horário de Brasília) e <code>{link_vagas}</code>.
          </p>
          <div id="bot-passos">${_passosHtml(c, podeEditar)}</div>
          ${podeEditar ? `<div class="bot-add">
            <button class="mod-btn-secondary" onclick="botAddPasso('texto')"><i class="fa-solid fa-font"></i> Texto</button>
            <button class="mod-btn-secondary" onclick="botAddPasso('imagem')"><i class="fa-solid fa-image"></i> Imagem</button>
            <button class="mod-btn-secondary" onclick="botAddPasso('audio')"><i class="fa-solid fa-microphone"></i> Áudio</button>
            <button class="mod-btn-secondary" onclick="botAddPasso('documento')"><i class="fa-solid fa-file-pdf"></i> PDF</button>
            <button class="mod-btn-secondary" onclick="botAddPasso('link')"><i class="fa-solid fa-link"></i> Link</button>
          </div>` : ''}

          <h3 class="bot-titulo">Pré-visualização</h3>
          <div class="bot-previa" id="bot-previa">${_previaHtml(c)}</div>

          ${podeEditar ? `<h3 class="bot-titulo">Enviar teste</h3>
          <p class="bot-ajuda">Manda a sequência para um número, sem mexer na contagem de ninguém.</p>
          <div class="bot-teste">
            <input type="tel" class="form-control" id="bot-teste-tel" placeholder="5511999998888">
            <button class="mod-btn-primary" onclick="botEnviarTeste()"><i class="fa-solid fa-paper-plane"></i> Enviar teste</button>
          </div>
          <div id="bot-teste-res" class="bot-ajuda"></div>` : ''}
        </div>
      </div>

      ${(_painel && _painel.ultimos && _painel.ultimos.length) ? `
      <h3 class="bot-titulo">Últimas ações do bot</h3>
      <div class="bot-diario">
        ${_painel.ultimos.slice(0, 25).map(function (l) {
          return '<div class="bot-diario-linha"><span class="bot-tag bot-tag-' + esc(l.tipo) + '">' + esc(l.tipo) +
                 '</span><span>' + esc(l.telefone || '—') + '</span><span class="bot-diario-det">' +
                 esc(l.detalhe || '') + '</span><span class="bot-diario-hora">' + esc(l.criado_em || '') + '</span></div>';
        }).join('')}
      </div>` : ''}
    `;
  }
  window._botRender = _botRender;

  const ROTULO_PASSO = { texto: 'Texto', imagem: 'Imagem', audio: 'Áudio', documento: 'PDF', link: 'Link' };
  const ICONE_PASSO = { texto: 'fa-font', imagem: 'fa-image', audio: 'fa-microphone', documento: 'fa-file-pdf', link: 'fa-link' };

  function _passosHtml(c, podeEditar) {
    if (!c.passos.length) {
      return '<div class="bot-vazio">Nenhum passo ainda. Comece por um texto com o link das vagas.</div>';
    }
    return c.passos.map(function (p, i) {
      const trava = podeEditar ? '' : 'disabled';
      let corpo = '';
      if (p.tipo === 'texto') {
        corpo = `<textarea class="form-control bot-textarea" rows="4" placeholder="Mensagem..." ${trava}
                   onchange="botMudarPasso(${i},'texto', this.value)">${esc(p.texto)}</textarea>`;
      } else if (p.tipo === 'link') {
        corpo = `<textarea class="form-control bot-textarea" rows="2" placeholder="Texto antes do link (opcional)" ${trava}
                   onchange="botMudarPasso(${i},'texto', this.value)">${esc(p.texto)}</textarea>
                 <input type="url" class="form-control" placeholder="https://... (ou deixe vazio e use {link_vagas} no texto)"
                   value="${esc(p.url)}" ${trava} onchange="botMudarPasso(${i},'url', this.value)">`;
      } else {
        const temArquivo = !!p.arquivo;
        corpo = `
          <div class="bot-arquivo">
            ${temArquivo
              ? `<span class="bot-arquivo-ok"><i class="fa-solid fa-check"></i> ${esc(p.nomeArquivo || p.arquivo)}</span>`
              : '<span class="bot-arquivo-nao">Nenhum arquivo enviado</span>'}
            ${podeEditar ? `<label class="bot-btn-arq">
              <i class="fa-solid fa-upload"></i> ${temArquivo ? 'Trocar' : 'Enviar'}
              <input type="file" hidden accept="${p.tipo === 'imagem' ? 'image/*' : (p.tipo === 'audio' ? 'audio/ogg,.ogg,.opus' : 'application/pdf,.pdf')}"
                     onchange="botSubirMidia(${i}, this)">
            </label>` : ''}
          </div>
          ${p.tipo === 'audio'
            ? '<small class="bot-ajuda">A Meta só mostra como <b>mensagem de voz</b> se o arquivo for OGG/Opus. Exporte nesse formato.</small>'
            : `<textarea class="form-control bot-textarea" rows="2" placeholder="Legenda (opcional)" ${trava}
                 onchange="botMudarPasso(${i},'legenda', this.value)">${esc(p.legenda)}</textarea>`}`;
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
                onchange="botMudarPasso(${i},'intervaloSeg', this.value)">s</label>` : ''}
            ${podeEditar ? `
              <button class="bot-ic" title="Subir"    onclick="botMoverPasso(${i},-1)" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
              <button class="bot-ic" title="Descer"   onclick="botMoverPasso(${i},1)" ${i === c.passos.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
              <button class="bot-ic" title="Duplicar" onclick="botDuplicarPasso(${i})"><i class="fa-solid fa-copy"></i></button>
              <button class="bot-ic bot-ic-mau" title="Remover" onclick="botRemoverPasso(${i})"><i class="fa-solid fa-trash"></i></button>` : ''}
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
  window.botAlternarLigado = async function (ligado) {
    const c = cfg();
    if (ligado && !c.passos.length) {
      alert('Configure pelo menos um passo antes de ligar o bot.');
      redesenhar(); return;
    }
    c.ligado = !!ligado;
    await salvar(ligado ? 'LIGADO' : 'DESLIGADO');
    redesenhar();
  };
  window.botMudarCampo = async function (campo, valor) { cfg()[campo] = valor; await salvar('mudou ' + campo); redesenhar(); };
  window.botMudarNumero = async function (campo, valor) { cfg()[campo] = Math.max(0, Number(valor) || 0); await salvar('mudou ' + campo); };
  window.botMudarNumeroEm = async function (grupo, campo, valor) { cfg()[grupo][campo] = Math.max(0, Number(valor) || 0); await salvar('mudou ' + grupo + '.' + campo); };
  window.botMudarTexto = async function (grupo, campo, valor) { cfg()[grupo][campo] = String(valor || ''); await salvar('mudou a mensagem de ' + grupo); };
  window.botMudarLista = async function (grupo, campo, valor) {
    cfg()[grupo][campo] = String(valor || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    await salvar('mudou as palavras de ' + grupo);
  };
  window.botMudarPasso = async function (i, campo, valor) {
    const c = cfg();
    if (!c.passos[i]) return;
    if (campo === 'intervaloSeg') {
      const n = String(valor).trim();
      c.passos[i].intervaloSeg = n === '' ? null : Math.max(0, Number(n) || 0);
    } else {
      c.passos[i][campo] = String(valor == null ? '' : valor);
    }
    await salvar('editou o passo ' + (i + 1));
    if (campo !== 'intervaloSeg') { const el = document.getElementById('bot-previa'); if (el) el.innerHTML = _previaHtml(c); }
  };
  window.botAddPasso = async function (tipo) {
    const c = cfg();
    c.passos.push({ id: _novoIdPasso(), tipo: tipo, texto: '', legenda: '', url: '', arquivo: '', nomeArquivo: '', mime: '', intervaloSeg: null });
    await salvar('acrescentou um passo de ' + tipo);
    redesenhar();
  };
  window.botRemoverPasso = async function (i) {
    const c = cfg();
    if (!c.passos[i]) return;
    if (!confirm('Remover o passo ' + (i + 1) + '?')) return;
    c.passos.splice(i, 1);
    // setKeys faz a remoção valer de verdade: a lista inteira é substituída no
    // servidor. Sem ele, o merge só acrescenta e o passo voltava.
    await salvar('removeu o passo ' + (i + 1));
    redesenhar();
  };
  window.botDuplicarPasso = async function (i) {
    const c = cfg();
    if (!c.passos[i]) return;
    const copia = JSON.parse(JSON.stringify(c.passos[i]));
    copia.id = _novoIdPasso();
    c.passos.splice(i + 1, 0, copia);
    await salvar('duplicou o passo ' + (i + 1));
    redesenhar();
  };
  window.botMoverPasso = async function (i, dir) {
    const c = cfg();
    const j = i + dir;
    if (j < 0 || j >= c.passos.length) return;
    const t = c.passos[i]; c.passos[i] = c.passos[j]; c.passos[j] = t;
    await salvar('reordenou os passos');
    redesenhar();
  };
  function _novoIdPasso() {
    return (typeof _novoId === 'function') ? _novoId('passo')
      : 'passo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }

  window.botSubirMidia = async function (i, input) {
    const c = cfg();
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
        await salvar('enviou o arquivo do passo ' + (i + 1));
        redesenhar();
      } catch (e) { alert('Falha no envio: ' + (e.message || e)); }
    };
    leitor.readAsDataURL(arq);
  };

  window.botAtualizarPainel = async function () { _painel = null; redesenhar(); };

  // ── CONTROLE DO BOT DENTRO DA CONVERSA ───────────────────────────────────
  // Preenche o espaço que o cabeçalho da conversa reservou, mostrando se o
  // bot está ativo naquele contato e o botão certo. Pausar é por contato, não
  // geral: o interruptor da aba continua ligado para todos os outros.
  window.botCarregarControle = async function (contactId) {
    const alvo = document.getElementById('wa-bot-ctrl');
    if (!alvo || !contactId) return;
    try {
      const r = await fetch('/api/whatsapp/bot/contato/' + encodeURIComponent(contactId), { credentials: 'same-origin' });
      const j = await r.json().catch(function () { return {}; });
      if (!j.ok || !j.disponivel) { alvo.innerHTML = ''; return; }
      const ct = j.contato || {};
      const pausado = !!(ct.pausado || ct.optou_sair);
      const motivo = ct.optou_sair ? 'a pessoa pediu para sair' :
                     (ct.pausado ? 'pausado' + (ct.pausado_por ? ' por ' + esc(ct.pausado_por) : '') : '');
      alvo.innerHTML =
        '<span class="wa-bot-estado ' + (pausado ? 'pausado' : 'ligado') + '" title="' + esc(motivo) + '">' +
          '<i class="fa-solid fa-robot"></i> ' + (pausado ? 'bot pausado' : 'bot ativo') +
        '</span>' +
        (_botPodeEditar()
          ? '<button class="wa-btn-mini" title="' + (pausado ? 'Devolver ao bot' : 'Pausar o bot neste contato') +
            '" onclick="botAlternarContato(' + Number(contactId) + ',' + (pausado ? 'false' : 'true') + ')">' +
            '<i class="fa-solid ' + (pausado ? 'fa-rotate-left' : 'fa-pause') + '"></i></button>'
          : '') +
        (ct.aguardando_atendente
          ? '<span class="wa-bot-estado pausado" title="A pessoa pediu atendente"><i class="fa-solid fa-hand"></i> aguardando atendente</span>'
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
