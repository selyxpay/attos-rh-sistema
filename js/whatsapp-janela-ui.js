// ==========================================================================
// ABA "JANELA ABERTA" DO WHATSAPP OFICIAL — a tela
// --------------------------------------------------------------------------
// Mostra quem ainda está dentro das 24 horas da ÚLTIMA MENSAGEM RECEBIDA (a
// dela, não a minha). É a janela em que a Meta aceita mensagem escrita à mão;
// fora dela, só modelo aprovado. Daí o envio em grupo viver AQUI: a lista já
// é, por definição, quem pode receber.
//
// A lista se atualiza sozinha e DE FORMA INCREMENTAL: quem sai da janela
// desaparece sem a tela piscar e sem perder a seleção de quem continua.
//
// Arquivo separado, como o do bot, o das mensagens prontas e o dos lembretes.
// ==========================================================================

(function () {
  'use strict';

  const esc = function (v) {
    return (typeof escapeHTML === 'function') ? escapeHTML(String(v == null ? '' : v)) : String(v == null ? '' : v);
  };
  const aviso = function (msg, erro) {
    if (typeof _waToast === 'function') _waToast(msg, !!erro);
    else if (erro) alert(msg);
  };
  function pode(acao) { return (typeof _waPode === 'function') ? _waPode(acao) : false; }

  let _filtro = '';            // '', 'fechando', 'bot', 'fora', 'aguardando', 'sem_resposta'
  let _busca = '';
  let _contatos = [];
  let _selecionados = {};      // { conversation_id: true }
  let _timer = null;
  let _envioAberto = null;     // id do envio em acompanhamento
  let _carregando = false;

  const FILTROS = [
    ['', 'Todos'],
    ['fechando', 'Fecha em menos de 2h'],
    ['bot', 'Atendidos pelo bot'],
    ['fora', 'Fora do expediente'],
    ['aguardando', 'Aguardando atendente'],
    ['sem_resposta', 'Sem resposta minha']
  ];

  // ── Tempo que falta, em palavras ─────────────────────────────────────────
  function faltam(horas) {
    const h = Number(horas) || 0;
    if (h <= 0) return 'fechada';
    const total = Math.round(h * 60);
    const hh = Math.floor(total / 60), mm = total % 60;
    if (hh <= 0) return 'fecha em ' + mm + 'min';
    if (mm === 0) return 'fecha em ' + hh + 'h';
    return 'fecha em ' + hh + 'h' + String(mm).padStart(2, '0');
  }
  function urgencia(horas) {
    const h = Number(horas) || 0;
    if (h <= 1) return 'urgente';
    if (h <= 2) return 'atencao';
    return '';
  }

  async function carregar() {
    if (_carregando) return false;
    _carregando = true;
    try {
      let qs = '?limite=300';
      if (_filtro) qs += '&' + encodeURIComponent(_filtro === 'sem_resposta' ? 'sem_resposta' : _filtro) + '=true';
      if (_busca) qs += '&busca=' + encodeURIComponent(_busca);
      const r = await waGet('/janela-aberta' + qs);
      if (!r || !r.ok) {
        // Mesma regra do resto da tela: falha de rede NÃO apaga o que está
        // mostrando.
        if (r && (r._rede || r._sessao)) { if (typeof _waRedeCaiu === 'function') _waRedeCaiu(r); }
        else aviso((r && r.error) || 'Não consegui carregar a lista.', true);
        return false;
      }
      if (typeof _waRedeVoltou === 'function') _waRedeVoltou();
      _contatos = r.contatos || [];
      // Quem saiu da janela também sai da seleção: não dá para mandar para
      // quem já não pode receber.
      const vivos = {};
      _contatos.forEach(function (c) { vivos[c.conversation_id] = true; });
      Object.keys(_selecionados).forEach(function (id) { if (!vivos[id]) delete _selecionados[id]; });
      return true;
    } finally {
      _carregando = false;
    }
  }

  window._janelaRender = async function (cont) {
    if (!cont) return;
    if (!pode('visualizar')) {
      cont.innerHTML = '<div class="wa-empty">Você não tem permissão para ver esta aba.</div>';
      return;
    }
    if (!cont.dataset.janelaCarregada) {
      cont.innerHTML = '<div class="wa-loading" style="margin:24px auto;"><i class="fa-solid fa-spinner fa-spin"></i></div>';
      await carregar();
      cont.dataset.janelaCarregada = '1';
    }
    desenhar(cont);
    ligarAtualizacao();
  };

  // A atualização sozinha: a cada 60 segundos a lista é relida e só o que
  // mudou é redesenhado. 60s basta — a janela é de 24 horas.
  function ligarAtualizacao() {
    if (_timer) return;
    _timer = setInterval(async function () {
      if (typeof _waSubAba === 'undefined' || _waSubAba !== 'janela') return;
      const cont = document.getElementById('wa-content');
      if (!cont) return;
      const ok = await carregar();
      if (ok) pintarLista();
    }, 60000);
  }

  function desenhar(cont) {
    const podeEnviar = pode('criar');
    cont.innerHTML = `
      <div class="wa-jan-tela">
        <div class="wa-prontas-cab">
          <div>
            <h3><i class="fa-regular fa-clock"></i> Janela aberta
              <span class="wa-jan-total" id="wa-jan-total">${_contatos.length}</span></h3>
            <p class="wa-prontas-sub">
              <b id="wa-jan-frase">${frase(_contatos.length)}</b><br>
              A Meta só aceita mensagem escrita à mão nas 24 horas seguintes à última
              mensagem da pessoa. Quem está aqui pode receber agora.</p>
          </div>
          <button class="mod-btn-secondary" onclick="janelaAtualizar()"><i class="fa-solid fa-rotate"></i> Atualizar</button>
        </div>

        <div class="wa-jan-barra">
          <div class="wa-conv-filtros">
            ${FILTROS.map(function (f) {
              return '<button class="wa-fchip' + (_filtro === f[0] ? ' active' : '') + '" onclick="janelaFiltrar(\'' + f[0] + '\')">' +
                     esc(f[1]) + '</button>';
            }).join('')}
          </div>
          <div class="wa-search wa-jan-busca">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="wa-jan-busca" placeholder="Procurar nome ou número…"
                   value="${esc(_busca)}" oninput="janelaBuscar(this.value)">
          </div>
        </div>

        ${podeEnviar ? `<div class="wa-jan-acoes" id="wa-jan-acoes">${acoesHTML()}</div>` : ''}

        <div class="wa-jan-lista" id="wa-jan-lista">${itensHTML()}</div>

        <div id="wa-jan-envio"></div>
      </div>`;
  }

  function frase(n) {
    if (!n) return 'Ninguém com janela aberta agora.';
    return n === 1 ? '1 pessoa com janela aberta' : n + ' pessoas com janela aberta';
  }

  function acoesHTML() {
    const n = Object.keys(_selecionados).length;
    return `
      <label class="wa-jan-todos">
        <input type="checkbox" id="wa-jan-marcar-todos" ${n && n === _contatos.length ? 'checked' : ''}
               onchange="janelaSelecionarTodos(this.checked)">
        <span>selecionar todos${_filtro || _busca ? ' (deste filtro)' : ''}</span>
      </label>
      ${n ? `<button class="wa-jan-limpar" onclick="janelaLimpar()">limpar seleção</button>` : ''}
      <span class="wa-jan-espaco"></span>
      <button class="mod-btn-primary" ${n ? '' : 'disabled'} onclick="janelaAbrirEnvio()">
        <i class="fa-solid fa-paper-plane"></i> Enviar para selecionados (${n})
      </button>`;
  }

  function itensHTML() {
    if (!_contatos.length) {
      return `<div class="wa-empty"><i class="fa-regular fa-clock"></i>
        <p>Ninguém com janela aberta ${_filtro || _busca ? 'neste filtro' : 'agora'}.
        A janela abre quando a pessoa escreve para o número.</p></div>`;
    }
    return _contatos.map(itemHTML).join('');
  }

  function assinatura(c) {
    return [c.contact_name || c.contact_profile_name || '', c.contact_phone || '',
            c.ultima_recebida_texto || '', c.ultima_recebida_tipo || '',
            Math.round(Number(c.horas_restantes) * 60), c.aguardando_atendente || 0,
            c.bot_em || '', c.bot_pausado || 0, c.bot_saiu || 0,
            c.fora_exp || '', c.lembretes_agendados || 0, c.respondi_depois || 0,
            _selecionados[c.conversation_id] ? '1' : '0'].join('|');
  }

  function itemHTML(c) {
    const nome = c.contact_name || c.contact_profile_name ||
      (typeof _waFmtTelefone === 'function' ? _waFmtTelefone(c.contact_phone) : c.contact_phone) || 'Sem nome';
    const marcado = !!_selecionados[c.conversation_id];
    const previa = (typeof _waPrevia === 'function')
      ? _waPrevia({ last_message_text: c.ultima_recebida_texto, last_message_type: c.ultima_recebida_tipo })
      : esc(String(c.ultima_recebida_texto || '').slice(0, 80));
    const sinais =
      (c.bot_em ? '<i class="fa-solid fa-robot wa-sinal-bot ' +
        (Number(c.bot_saiu) === 1 ? 'saiu' : (Number(c.bot_pausado) === 1 ? 'pausado' : 'ativo')) +
        '" title="Atendido pelo bot"></i>' : '') +
      (c.fora_exp ? '<i class="fa-solid fa-moon wa-sinal-lua" title="Recebeu o funil de fora do expediente"></i>' : '') +
      (Number(c.lembretes_agendados) > 0
        ? '<i class="fa-solid fa-bell wa-sinal-lembrete" title="' + Number(c.lembretes_agendados) + ' lembrete(s) agendado(s)"></i>'
        : '');
    return `
      <div class="wa-jan-item ${marcado ? 'marcado' : ''}" data-conv="${c.conversation_id}"
           data-assin="${esc(assinatura(c))}">
        ${pode('criar') ? `<label class="wa-jan-check">
          <input type="checkbox" ${marcado ? 'checked' : ''}
                 onchange="janelaMarcar(${Number(c.conversation_id)}, this.checked)">
        </label>` : ''}
        <div class="wa-jan-meio" onclick="janelaAbrirConversa(${Number(c.conversation_id)})">
          <div class="wa-jan-topo">
            <b>${esc(nome)}</b>${sinais}
            ${Number(c.aguardando_atendente) === 1
              ? '<span class="wa-jan-tag">aguardando atendente</span>' : ''}
            ${Number(c.respondi_depois) === 0
              ? '<span class="wa-jan-tag cinza">sem resposta minha</span>' : ''}
          </div>
          <div class="wa-jan-previa">${previa}</div>
          <div class="wa-jan-tel">${esc(typeof _waFmtTelefone === 'function' ? _waFmtTelefone(c.contact_phone) : c.contact_phone)}</div>
        </div>
        <div class="wa-jan-tempo ${urgencia(c.horas_restantes)}">
          <b>${esc(faltam(c.horas_restantes))}</b>
        </div>
      </div>`;
  }

  // ── ATUALIZAÇÃO INCREMENTAL ──────────────────────────────────────────────
  // Igual à lista de conversas: compara item por item por uma ASSINATURA e só
  // redesenha o que mudou. Quem saiu da janela é removido; a seleção de quem
  // continua não se perde.
  function pintarLista() {
    const box = document.getElementById('wa-jan-lista');
    if (!box) return;
    const total = document.getElementById('wa-jan-total');
    if (total) total.textContent = String(_contatos.length);
    const fr = document.getElementById('wa-jan-frase');
    if (fr) fr.textContent = frase(_contatos.length);
    const acoes = document.getElementById('wa-jan-acoes');
    if (acoes) acoes.innerHTML = acoesHTML();

    if (!_contatos.length) { box.innerHTML = itensHTML(); return; }
    const existentes = {};
    Array.from(box.querySelectorAll('.wa-jan-item')).forEach(function (el) {
      const id = el.getAttribute('data-conv');
      if (id) existentes[id] = el; else el.remove();
    });
    Array.from(box.children).forEach(function (el) {
      if (!el.classList || !el.classList.contains('wa-jan-item')) el.remove();
    });
    let anterior = null;
    _contatos.forEach(function (c) {
      const chave = String(c.conversation_id);
      let el = existentes[chave];
      const assin = assinatura(c);
      if (el) {
        if (el.getAttribute('data-assin') !== assin) {
          el.outerHTML = itemHTML(c);
          el = box.querySelector('.wa-jan-item[data-conv="' + chave + '"]');
        }
        delete existentes[chave];
      } else {
        box.insertAdjacentHTML('beforeend', itemHTML(c));
        el = box.querySelector('.wa-jan-item[data-conv="' + chave + '"]');
      }
      if (!el) return;
      const esperado = anterior ? anterior.nextElementSibling : box.firstElementChild;
      if (esperado !== el) {
        if (anterior) anterior.insertAdjacentElement('afterend', el);
        else box.insertAdjacentElement('afterbegin', el);
      }
      anterior = el;
    });
    // Quem saiu da janela desaparece.
    Object.keys(existentes).forEach(function (k) { existentes[k].remove(); });
  }

  // ── Ações da lista ───────────────────────────────────────────────────────
  // Gancho para a PROVA: deixa o teste entregar uma lista e usar a MESMA
  // funcao de pintura incremental que a producao usa. Sem isso, o teste teria
  // que imitar a pintura — e passaria mesmo se a de verdade estivesse errada.
  window._janelaTestePintar = function (lista) {
    _contatos = Array.isArray(lista) ? lista : [];
    const vivos = {};
    _contatos.forEach(function (c) { vivos[c.conversation_id] = true; });
    Object.keys(_selecionados).forEach(function (id) { if (!vivos[id]) delete _selecionados[id]; });
    pintarLista();
  };

  window.janelaAtualizar = async function () {
    const ok = await carregar();
    if (ok) pintarLista();
  };
  window.janelaFiltrar = async function (f) {
    _filtro = f;
    const ok = await carregar();
    const cont = document.getElementById('wa-content');
    if (cont) desenhar(cont);
    if (!ok) aviso('Mostrando o que já estava na tela.', true);
  };
  let _timerBusca = null;
  window.janelaBuscar = function (texto) {
    _busca = String(texto || '').trim();
    clearTimeout(_timerBusca);
    // Espera a pessoa parar de digitar: uma consulta por tecla seria desperdício.
    _timerBusca = setTimeout(async function () {
      const ok = await carregar();
      if (ok) pintarLista();
    }, 400);
  };
  window.janelaMarcar = function (id, marcado) {
    if (marcado) _selecionados[id] = true; else delete _selecionados[id];
    const el = document.querySelector('.wa-jan-item[data-conv="' + id + '"]');
    if (el) el.classList.toggle('marcado', !!marcado);
    const acoes = document.getElementById('wa-jan-acoes');
    if (acoes) acoes.innerHTML = acoesHTML();
  };
  window.janelaSelecionarTodos = function (marcar) {
    // RESPEITA O FILTRO: só o que está na tela agora.
    _selecionados = {};
    if (marcar) _contatos.forEach(function (c) { _selecionados[c.conversation_id] = true; });
    pintarLista();
  };
  window.janelaLimpar = function () { _selecionados = {}; pintarLista(); };
  window.janelaAbrirConversa = function (id) {
    if (typeof waTrocarSubAba === 'function' && typeof waAbrirConversa === 'function') {
      waTrocarSubAba('inbox');
      setTimeout(function () { waAbrirConversa(id); }, 60);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // O PAINEL DE ENVIO
  // ══════════════════════════════════════════════════════════════════════════
  let _envio = { texto: '', resposta_id: '', arquivo: '', nomeArquivo: '', mime: '', tipoAnexo: '', usarLembretes: false };

  function prontasDisponiveis() {
    const st = (typeof state !== 'undefined' && state) ? state : null;
    const lista = (st && Array.isArray(st.respostasRapidas)) ? st.respostasRapidas : [];
    return lista.filter(function (r) { return r && r.id; });
  }

  window.janelaAbrirEnvio = function () {
    const n = Object.keys(_selecionados).length;
    if (!n) { aviso('Selecione pelo menos uma pessoa.', true); return; }
    const box = document.getElementById('wa-jan-envio');
    if (!box) return;
    const prontas = prontasDisponiveis();
    const sel = Object.keys(_selecionados)[0];
    const exemplo = _contatos.find(function (c) { return String(c.conversation_id) === String(sel); }) || {};
    box.innerHTML = `
      <div class="wa-jan-painel">
        <div class="wa-jan-painel-cab">
          <h4><i class="fa-solid fa-paper-plane"></i> Enviar para ${n} pessoa${n === 1 ? '' : 's'}</h4>
          <button class="wa-pronta-fechar" onclick="janelaFecharEnvio()"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div class="wa-prontas-form-linha">
          <label>Mensagem pronta <span class="wa-prontas-hint">(ou escreva abaixo)</span></label>
          <select id="wa-jan-pronta" onchange="janelaEscolherPronta(this.value)">
            <option value="">— texto livre —</option>
            ${prontas.map(function (r) {
              return '<option value="' + esc(r.id) + '"' + (_envio.resposta_id === r.id ? ' selected' : '') + '>' +
                     esc(r.titulo || 'sem título') +
                     ((r.lembrete && r.lembrete.ligado) ? ' (tem lembrete)' : '') + '</option>';
            }).join('')}
          </select>
        </div>

        <div class="wa-prontas-form-linha">
          <label>Texto</label>
          <textarea id="wa-jan-texto" rows="4" placeholder="Olá {nome}, {saudacao}! …"
                    oninput="janelaTexto(this.value)">${esc(_envio.texto)}</textarea>
          <div class="wa-prontas-vars">Variáveis:
            <span class="wa-prontas-var">{nome}</span>
            <span class="wa-prontas-var">{saudacao}</span>
            <span class="wa-prontas-var">{horario}</span>
            <span class="wa-prontas-var">{link}</span>
          </div>
        </div>

        <div class="wa-prontas-form-cols">
          <div class="wa-prontas-form-linha">
            <label>Anexo <span class="wa-prontas-hint">(imagem ou PDF, opcional)</span></label>
            ${_envio.arquivo
              ? `<div class="wa-prontas-anexo-atual">
                   <i class="fa-solid ${_envio.tipoAnexo === 'documento' ? 'fa-file-pdf' : 'fa-image'}"></i>
                   ${esc(_envio.nomeArquivo || _envio.arquivo)}
                   <button class="wa-btn-mini perigo" onclick="janelaTirarAnexo()"><i class="fa-solid fa-xmark"></i></button>
                 </div>`
              : `<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onchange="janelaAnexar(this)">`}
          </div>
          <div class="wa-prontas-form-linha">
            ${(_envio.resposta_id && temLembrete(_envio.resposta_id)) ? `
            <label class="wa-jan-lembrete-opc">
              <input type="checkbox" ${_envio.usarLembretes ? 'checked' : ''} onchange="janelaUsarLembretes(this.checked)">
              <span>agendar também os lembretes desta mensagem para todos</span>
            </label>` : '<span class="wa-prontas-hint">Esta mensagem não tem lembrete.</span>'}
          </div>
        </div>

        <div class="wa-jan-previa-envio">
          <div class="wa-lembrete-previa-tit"><i class="fa-regular fa-eye"></i>
            Como vai chegar para ${esc((exemplo.contact_name || exemplo.contact_profile_name || 'a pessoa'))}</div>
          <div class="bot-previa-bolha texto-longo">${esc(previaTexto(_envio.texto, exemplo))}</div>
        </div>

        <div class="wa-prontas-form-botoes">
          <button class="mod-btn-secondary" onclick="janelaFecharEnvio()">Cancelar</button>
          <button class="mod-btn-primary" onclick="janelaConfirmarEnvio()">
            <i class="fa-solid fa-paper-plane"></i> Enviar para ${n}</button>
        </div>
      </div>`;
    const t = document.getElementById('wa-jan-texto');
    if (t) t.focus();
  };

  function temLembrete(id) {
    const r = prontasDisponiveis().find(function (x) { return String(x.id) === String(id); });
    return !!(r && r.lembrete && r.lembrete.ligado);
  }

  function previaTexto(texto, exemplo) {
    const nome = String((exemplo.contact_name || exemplo.contact_profile_name || 'Maria')).trim().split(/\s+/)[0];
    const h = new Date().getHours();
    const saud = (h >= 5 && h < 12) ? 'bom dia' : (h >= 12 && h < 18 ? 'boa tarde' : 'boa noite');
    const r = prontasDisponiveis().find(function (x) { return String(x.id) === String(_envio.resposta_id); });
    const link = (String(texto || '').match(/https?:\/\/[^\s<>"]+/) || [''])[0];
    const horario = (r && r.lembrete && r.lembrete.horario) || '';
    const corpo = String(texto || '') || '(escreva a mensagem)';
    return corpo
      .replace(/\{nome\}/gi, nome)
      .replace(/\{saudacao\}/gi, saud)
      .replace(/\{horario\}/gi, horario || '(sem horário)')
      .replace(/\{link\}/gi, link || '(o link da mensagem)')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/(^|\n)\s*([a-zà-ú])/g, function (_m, a, c) { return a + c.toUpperCase(); });
  }

  window.janelaFecharEnvio = function () {
    const box = document.getElementById('wa-jan-envio');
    if (box) box.innerHTML = '';
  };
  window.janelaTexto = function (v) { _envio.texto = String(v || ''); atualizarPrevia(); };
  window.janelaEscolherPronta = function (id) {
    _envio.resposta_id = String(id || '');
    const r = prontasDisponiveis().find(function (x) { return String(x.id) === _envio.resposta_id; });
    if (r) {
      _envio.texto = String(r.texto || '');
      _envio.arquivo = r.arquivo || ''; _envio.nomeArquivo = r.nomeArquivo || '';
      _envio.mime = r.mime || ''; _envio.tipoAnexo = r.tipoAnexo || '';
      _envio.usarLembretes = !!(r.lembrete && r.lembrete.ligado);
    } else {
      _envio.usarLembretes = false;
    }
    janelaAbrirEnvio();
  };
  window.janelaUsarLembretes = function (v) { _envio.usarLembretes = !!v; };
  window.janelaTirarAnexo = function () {
    _envio.arquivo = ''; _envio.nomeArquivo = ''; _envio.mime = ''; _envio.tipoAnexo = '';
    janelaAbrirEnvio();
  };
  window.janelaAnexar = function (input) {
    const arq = input && input.files && input.files[0];
    if (!arq) return;
    if (arq.size > 20 * 1024 * 1024) { aviso('Arquivo muito grande (máximo 20 MB).', true); input.value = ''; return; }
    const leitor = new FileReader();
    leitor.onload = async function () {
      try {
        // Mesmo armazenamento seguro das mensagens prontas (fora de /uploads/).
        const r = await fetch('/api/whatsapp/respostas/midia', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: leitor.result })
        });
        const j = await r.json().catch(function () { return {}; });
        if (!j.ok) { aviso(j.error || 'Não consegui enviar o arquivo.', true); return; }
        _envio.arquivo = j.arquivo; _envio.nomeArquivo = arq.name;
        _envio.mime = j.mime; _envio.tipoAnexo = j.tipoAnexo;
        janelaAbrirEnvio();
      } catch (e) { aviso('Falha no envio: ' + (e.message || e), true); }
    };
    leitor.readAsDataURL(arq);
  };
  function atualizarPrevia() {
    const box = document.querySelector('.wa-jan-previa-envio .bot-previa-bolha');
    if (!box) return;
    const sel = Object.keys(_selecionados)[0];
    const exemplo = _contatos.find(function (c) { return String(c.conversation_id) === String(sel); }) || {};
    box.textContent = previaTexto(_envio.texto, exemplo);
  }

  window.janelaConfirmarEnvio = async function () {
    const ids = Object.keys(_selecionados).map(Number);
    if (!ids.length) { aviso('Selecione pelo menos uma pessoa.', true); return; }
    if (!String(_envio.texto || '').trim() && !_envio.arquivo) {
      aviso('Escreva a mensagem ou escolha um anexo.', true); return;
    }
    if (!confirm('Vai enviar para ' + ids.length + ' pessoa' + (ids.length === 1 ? '' : 's') + '. Confirmar?')) return;
    const r = await waSend('/envio-grupo', 'POST', {
      conversas: ids, texto: _envio.texto, resposta_id: _envio.resposta_id,
      arquivo: _envio.arquivo, nomeArquivo: _envio.nomeArquivo,
      mime: _envio.mime, tipoAnexo: _envio.tipoAnexo,
      usarLembretes: _envio.usarLembretes, filtro: _filtro
    });
    if (!r || !r.ok) { aviso((r && r.error) || 'Não consegui criar o envio.', true); return; }
    aviso('Enviando para ' + r.na_fila + ' pessoa(s)' +
          (r.fora_da_janela ? ' · ' + r.fora_da_janela + ' fora da janela, puladas' : '') + '.');
    _selecionados = {};
    _envioAberto = r.envio_id;
    janelaFecharEnvio();
    pintarLista();
    acompanhar();
  };

  // ── Acompanhamento do envio ──────────────────────────────────────────────
  async function acompanhar() {
    if (!_envioAberto) return;
    const r = await waGet('/envio-grupo/' + _envioAberto);
    if (!r || !r.ok) return;
    const box = document.getElementById('wa-jan-envio');
    if (!box) return;
    const c = r.contagem || {};
    const e = r.envio || {};
    const pulados = (Number(c.janela_fechada) || 0) + (Number(c.saidas) || 0) + (Number(c.cancelados) || 0);
    box.innerHTML = `
      <div class="wa-jan-painel">
        <div class="wa-jan-painel-cab">
          <h4><i class="fa-solid fa-paper-plane"></i> Envio #${Number(e.id)} · ${esc(rotuloStatus(e.status))}</h4>
          <button class="wa-pronta-fechar" onclick="janelaFecharAcompanhamento()"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="wa-lemb-conta">
          <span class="wa-lemb-pill ok">${Number(c.enviados) || 0} enviado(s)</span>
          <span class="wa-lemb-pill ag">${Number(c.na_fila) || 0} na fila</span>
          ${Number(c.falhos) ? '<span class="wa-lemb-pill erro">' + Number(c.falhos) + ' falho(s)</span>' : ''}
          ${pulados ? '<span class="wa-lemb-pill cinza">' + pulados + ' pulado(s)</span>' : ''}
        </div>
        ${pode('criar') ? `<div class="wa-lemb-acoes">
          ${e.status === 'ativo' ? `<button class="mod-btn-secondary" onclick="janelaPausarEnvio('pausar')">
            <i class="fa-solid fa-pause"></i> Pausar</button>` : ''}
          ${e.status === 'pausado' ? `<button class="mod-btn-secondary" onclick="janelaPausarEnvio('retomar')">
            <i class="fa-solid fa-play"></i> Retomar</button>` : ''}
          ${(e.status === 'ativo' || e.status === 'pausado') ? `<button class="mod-btn-secondary perigo" onclick="janelaPausarEnvio('cancelar')">
            <i class="fa-solid fa-ban"></i> Cancelar o que falta</button>` : ''}
          <button class="mod-btn-secondary" onclick="janelaAcompanhar()"><i class="fa-solid fa-rotate"></i></button>
        </div>` : ''}
        <div class="wa-lemb-itens">
          ${(r.itens || []).map(function (i) {
            const st = ROTULO_ITEM[i.status] || { txt: i.status, cor: 'cinza' };
            return `<div class="wa-lemb-item">
              <span class="wa-lemb-item-nome">${esc(i.nome_contato || i.contato_nome || i.telefone)}</span>
              <span class="wa-lemb-pill ${st.cor}">${esc(st.txt)}</span>
              ${i.erro ? '<span class="wa-lemb-item-erro" title="' + esc(i.erro) + '">' + esc(i.erro) + '</span>' : '<span></span>'}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    // Enquanto tem gente na fila, o painel se atualiza sozinho.
    if (Number(c.na_fila) > 0 && e.status === 'ativo') setTimeout(acompanhar, 4000);
  }

  const ROTULO_ITEM = {
    fila: { txt: 'na fila', cor: 'ag' },
    enviado: { txt: 'enviado', cor: 'ok' },
    falhou: { txt: 'falhou', cor: 'erro' },
    janela_fechada: { txt: 'janela fechou', cor: 'alerta' },
    saida: { txt: 'pediu para sair', cor: 'cinza' },
    cancelado: { txt: 'cancelado', cor: 'cinza' }
  };
  function rotuloStatus(s) {
    return s === 'ativo' ? 'enviando' : (s === 'pausado' ? 'pausado'
      : (s === 'cancelado' ? 'cancelado' : 'concluído'));
  }

  window.janelaAcompanhar = function () { acompanhar(); };
  window.janelaFecharAcompanhamento = function () {
    _envioAberto = null;
    janelaFecharEnvio();
  };
  window.janelaPausarEnvio = async function (acao) {
    if (!_envioAberto) return;
    if (acao === 'cancelar' && !confirm('Cancelar o que ainda não foi enviado?\n\nQuem já recebeu não é afetado.')) return;
    const r = await waSend('/envio-grupo/' + _envioAberto + '/' + acao, 'POST');
    if (!r || !r.ok) { aviso((r && r.error) || 'Não consegui.', true); return; }
    aviso(acao === 'pausar' ? 'Envio pausado.' : (acao === 'retomar' ? 'Envio retomado.' : 'Envio cancelado.'));
    acompanhar();
  };
})();
