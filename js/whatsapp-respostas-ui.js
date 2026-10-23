// ==========================================================================
// MENSAGENS PRONTAS DO WHATSAPP — a fileira da conversa e a tela de cadastro
// --------------------------------------------------------------------------
// O catálogo vive em state.respostasRapidas: uma LISTA de registros com id,
// gravada com upsertIds (e deleteIds ao apagar). Esse é o contrato do sistema
// (regra 3) e é o que faz apagar e reordenar funcionarem de verdade com duas
// pessoas logadas — um save sem isso só acrescenta, e o item apagado voltava
// no carregamento seguinte.
//
// O TEXTO FINAL vem do servidor (/api/whatsapp/respostas/previa). Parece volta
// desnecessária, mas é o que garante que o texto que cai na caixa de escrever
// seja exatamente o que o botão de envio direto mandaria: a troca de {nome},
// {saudacao} e {link_vagas} tem um dono só, e ele é o servidor.
//
// Arquivo separado do js/whatsapp.js de propósito: aquele já passa de 1.200
// linhas.
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
  function pode(acao) {
    return (typeof _waPode === 'function') ? _waPode(acao) : false;
  }

  // ── O CATÁLOGO ───────────────────────────────────────────────────────────
  // ATENÇÃO: o estado global é declarado com `let state` no js/app.js, e
  // `let` NÃO cria propriedade no window — `window.state` é sempre undefined.
  // Testar por `window.state` fazia o catálogo parecer vazio para sempre.
  function estado() {
    return (typeof state !== 'undefined' && state) ? state : null;
  }
  function catalogo() {
    const st = estado();
    if (!st) return [];
    if (!Array.isArray(st.respostasRapidas)) st.respostasRapidas = [];
    return st.respostasRapidas;
  }
  // Na ordem que a pessoa definiu; empate resolve pelo título, para a fileira
  // não trocar de lugar sozinha a cada desenho.
  function emOrdem() {
    return catalogo().filter(function (r) { return r && r.id; }).slice().sort(function (a, b) {
      const d = (Number(a.ordem) || 0) - (Number(b.ordem) || 0);
      return d !== 0 ? d : String(a.titulo || '').localeCompare(String(b.titulo || ''), 'pt-BR');
    });
  }
  function porId(id) {
    return catalogo().find(function (r) { return r && String(r.id) === String(id); }) || null;
  }
  function novoId() {
    if (typeof _novoId === 'function') return _novoId('resp');
    return 'resp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  let _salvando = false;
  async function gravar(upsertIds, deleteIds, oQueMudou) {
    if (_salvando) return false;
    _salvando = true;
    try {
      await RTCloud.salvarAgora(state, {
        merge: true,
        upsertIds: upsertIds || [],
        deleteIds: deleteIds || []
      });
      // Auditoria: toda mudança de catálogo fica registrada, com quem mexeu.
      if (typeof registrarLogGlobal === 'function') {
        registrarLogGlobal('Mensagens prontas: ' + (oQueMudou || 'catálogo alterado') + '.', 'whatsapp');
      }
      return true;
    } catch (e) {
      aviso('Não consegui salvar: ' + (e.message || e), true);
      return false;
    } finally {
      _salvando = false;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // A FILEIRA ACIMA DA CAIXA DE ESCREVER
  // ══════════════════════════════════════════════════════════════════════════

  let _janela = { aberta: false, restam: 0 };
  let _convDaFileira = null;      // id da conversa aberta
  let _convObj = null;            // a conversa inteira (precisa do contact_id)

  async function lerJanela(convId) {
    try {
      const r = await fetch('/api/whatsapp/respostas/conversa/' + encodeURIComponent(convId), { credentials: 'same-origin' });
      const j = await r.json().catch(function () { return {}; });
      return (j && j.ok && j.janela) ? j.janela : { aberta: false, restam: 0 };
    } catch (e) {
      return { aberta: false, restam: 0 };
    }
  }

  window.respostasDesenharFileira = async function (conv) {
    const alvo = document.getElementById('wa-prontas');
    if (!alvo) return;
    _convDaFileira = conv && conv.id ? conv.id : null;
    _convObj = conv || null;
    if (!_convDaFileira || !pode('criar')) { alvo.innerHTML = ''; return; }
    // Em modo "nota interna" a fileira sai de cena: mensagem pronta é fala com
    // o cliente, e nota interna nunca chega nele. Trocar de modo redesenha a
    // conversa, então a fileira volta sozinha.
    if (typeof _waModoNota !== 'undefined' && _waModoNota) { alvo.innerHTML = ''; return; }

    const itens = emOrdem();
    if (!itens.length) {
      // Vazio não mostra fileira vazia: só o atalho para quem pode cadastrar.
      alvo.innerHTML = pode('editar')
        ? '<button class="wa-pronta-vazio" onclick="waTrocarSubAba(\'prontas\')">' +
          '<i class="fa-solid fa-comment-dots"></i> Cadastrar mensagens prontas</button>'
        : '';
      return;
    }

    _janela = await lerJanela(_convDaFileira);
    // A conversa pode ter mudado enquanto o servidor respondia.
    if (!conv || conv.id !== _convDaFileira) return;

    const fechada = !_janela.aberta;
    const botoes = itens.map(function (r) {
      const t = esc(r.titulo || 'sem título');
      const anexo = r.arquivo
        ? '<i class="fa-solid ' + (r.tipoAnexo === 'documento' ? 'fa-file-pdf' : (r.tipoAnexo === 'audio' ? 'fa-microphone' : 'fa-image')) + ' wa-pronta-anexo"></i>'
        : '';
      const dica = fechada
        ? 'A janela de 24 horas fechou'
        : (r.arquivo ? 'Põe o texto na caixa (o anexo vai só pelo botão de enviar)' : 'Põe o texto na caixa para você ajustar');
      return '<span class="wa-pronta' + (fechada ? ' off' : '') + '">' +
        '<button class="wa-pronta-usar" title="' + esc(dica) + '" ' + (fechada ? 'disabled' : '') +
          ' onclick="respostasUsar(\'' + esc(r.id) + '\')">' + anexo + t + '</button>' +
        '<button class="wa-pronta-ja" title="' + (fechada ? 'A janela de 24 horas fechou' : 'Enviar agora, sem passar pela caixa') + '" ' +
          (fechada ? 'disabled' : '') + ' onclick="respostasEnviarDireto(\'' + esc(r.id) + '\')">' +
          '<i class="fa-solid fa-paper-plane"></i></button>' +
        '</span>';
    }).join('');

    alvo.innerHTML =
      (fechada
        ? '<div class="wa-pronta-fechada"><i class="fa-solid fa-clock"></i> ' +
          'A janela de 24 horas desta conversa fechou: só dá para escrever de novo depois que a pessoa mandar ' +
          'uma mensagem, ou usando um modelo aprovado.</div>'
        : '') +
      '<div class="wa-prontas-fila">' + botoes +
        (pode('editar')
          ? '<button class="wa-pronta-mais" title="Cadastrar mensagens prontas" onclick="waTrocarSubAba(\'prontas\')">' +
            '<i class="fa-solid fa-gear"></i></button>'
          : '') +
      '</div>';
  };

  // ══════════════════════════════════════════════════════════════════════════
  // LEMBRETE NA HORA DO ENVIO
  // Quando a mensagem pronta tem lembrete, a conversa mostra uma linha
  // pequena acima da caixa: "Entrevista às 12:00, lembretes às 11:45 e às
  // 12:00", com a opção de mudar o horário SÓ deste envio.
  // ══════════════════════════════════════════════════════════════════════════
  let _prontaNaCaixa = null;     // { id, horario, data } da pronta que caiu na caixa

  function listaDeHorarios(prev) {
    const hs = (prev.lembretes || []).map(function (x) { return x.horario_envio; });
    if (hs.length <= 1) return hs.join('');
    return hs.slice(0, -1).join(', ') + ' e às ' + hs[hs.length - 1];
  }

  async function mostrarLinhaDoLembrete(resposta_id, horario, data) {
    const alvo = document.getElementById('wa-prontas');
    if (!alvo) return null;
    let prev = null;
    try {
      const r = await fetch('/api/whatsapp/lembretes/previsao', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resposta_id: resposta_id, horario: horario || '', data: data })
      });
      const j = await r.json().catch(function () { return {}; });
      prev = (j && j.ok) ? j.previsao : null;
    } catch (e) { prev = null; }
    const velha = document.getElementById('wa-lembrete-linha');
    if (velha) velha.remove();
    if (!prev) { _prontaNaCaixa = null; return null; }
    _prontaNaCaixa = { id: resposta_id, horario: horario || prev.evento_horario, data: data };
    const linha = document.createElement('div');
    linha.id = 'wa-lembrete-linha';
    linha.className = 'wa-lembrete-linha';
    linha.innerHTML =
      '<i class="fa-solid fa-clock"></i> <b>' + esc(prev.evento_horario) + '</b>' +
      ', lembretes às ' + esc(listaDeHorarios(prev)) +
      ' <button class="wa-lembrete-trocar" title="Mudar o horário só deste envio" ' +
      'onclick="respostasTrocarHorarioDoEnvio()"><i class="fa-solid fa-pen"></i> mudar</button>' +
      '<button class="wa-lembrete-trocar" title="Não agendar lembrete neste envio" ' +
      'onclick="respostasSemLembrete()"><i class="fa-solid fa-xmark"></i> sem lembrete</button>';
    alvo.insertAdjacentElement('beforebegin', linha);
    return prev;
  }

  window.respostasTrocarHorarioDoEnvio = async function () {
    if (!_prontaNaCaixa) return;
    const novo = prompt('Horário do evento para ESTE envio (ex.: 14:30):', _prontaNaCaixa.horario || '');
    if (novo === null) return;
    if (!/^\d{1,2}:\d{2}$/.test(String(novo).trim())) { aviso('Horário no formato 14:30.', true); return; }
    await mostrarLinhaDoLembrete(_prontaNaCaixa.id, String(novo).trim(), _prontaNaCaixa.data);
  };
  window.respostasSemLembrete = function () {
    _prontaNaCaixa = null;
    const l = document.getElementById('wa-lembrete-linha');
    if (l) l.remove();
  };
  // O js/whatsapp.js pergunta isto ao mandar pelo avião: é assim que o envio
  // normal também agenda o lembrete.
  window.respostasProntaDaCaixa = function () { return _prontaNaCaixa; };

  // ── AVISO DO QUE ESTÁ AGENDADO NESTA CONVERSA ───────────────────────────
  window.respostasAvisoAgendado = async function (convId) {
    const alvo = document.getElementById('wa-prontas');
    if (!alvo || !convId) return;
    let lista = [];
    try {
      const r = await fetch('/api/whatsapp/lembretes/conversa/' + encodeURIComponent(convId), { credentials: 'same-origin' });
      const j = await r.json().catch(function () { return {}; });
      lista = (j && j.ok && j.lembretes) || [];
    } catch (e) { lista = []; }
    const velho = document.getElementById('wa-lembrete-agendado');
    if (velho) velho.remove();
    if (!lista.length) return;
    const caixa = document.createElement('div');
    caixa.id = 'wa-lembrete-agendado';
    caixa.className = 'wa-lembrete-agendado';
    caixa.innerHTML = lista.map(function (l) {
      return '<span class="wa-lembrete-ag-item">' +
        '<i class="fa-solid fa-bell"></i> Lembrete agendado para <b>' + esc(_hhmmDeSql(l.enviar_em)) + '</b>' +
        ' <button class="wa-lembrete-trocar" title="Cancelar este lembrete" ' +
        'onclick="respostasCancelarAgendado(' + Number(l.id) + ',' + Number(convId) + ')">' +
        '<i class="fa-solid fa-xmark"></i> cancelar</button></span>';
    }).join('');
    alvo.insertAdjacentElement('beforebegin', caixa);
  };

  window.respostasCancelarAgendado = async function (id, convId) {
    try {
      const r = await fetch('/api/whatsapp/lembretes/' + encodeURIComponent(id) + '/cancelar',
                            { method: 'POST', credentials: 'same-origin' });
      const j = await r.json().catch(function () { return {}; });
      if (!j.ok) { aviso(j.error || 'Não consegui cancelar.', true); return; }
      aviso('Lembrete cancelado.');
      respostasAvisoAgendado(convId);
    } catch (e) { aviso('Falha: ' + (e.message || e), true); }
  };

  // Hora (em Brasília) de uma data guardada no formato do SQLite (UTC).
  function _hhmmDeSql(txt) {
    const s = String(txt || '').trim().replace(' ', 'T');
    const d = new Date(s.length <= 19 ? s + 'Z' : s);
    if (isNaN(d)) return String(txt || '');
    const sp = new Date(d.getTime() - 180 * 60000);
    const dois = function (n) { return String(n).padStart(2, '0'); };
    return dois(sp.getUTCHours()) + ':' + dois(sp.getUTCMinutes());
  }

  // Texto na caixa, para o atendente ajustar antes de mandar.
  window.respostasUsar = async function (id) {
    const r = porId(id);
    const caixa = document.getElementById('wa-msg-input');
    if (!r || !caixa) return;
    respostasFecharLista();
    let texto = String(r.texto || '');
    try {
      const resp = await fetch('/api/whatsapp/respostas/previa', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: _convDaFileira, resposta_id: id })
      });
      const j = await resp.json().catch(function () { return {}; });
      if (j && j.ok && typeof j.texto === 'string') texto = j.texto;
    } catch (e) { /* sem o servidor, vai o texto cru com as chaves */ }
    caixa.value = texto;
    caixa.focus();
    // Cursor no fim, e a caixa cresce junto com o texto (igual ao digitar).
    try { caixa.setSelectionRange(texto.length, texto.length); } catch (e) {}
    if (typeof waComposerDigitou === 'function') waComposerDigitou(caixa);
    if (r.arquivo) {
      aviso('Texto na caixa. O anexo desta mensagem vai só pelo botão de enviar da fileira.');
    }
  };

  // Envio direto: texto + anexo, e o bot pausa neste contato (o servidor faz).
  window.respostasEnviarDireto = async function (id) {
    const r = porId(id);
    if (!r || !_convDaFileira) return;
    respostasFecharLista();
    const botoes = document.querySelectorAll('#wa-prontas button');
    botoes.forEach(function (b) { b.disabled = true; });
    // Id temporário: o servidor devolve junto e a tela troca a bolha otimista
    // pela real, em vez de desenhar a mesma mensagem duas vezes.
    const cid = (typeof _waNovoClienteId === 'function')
      ? _waNovoClienteId()
      : ('tmp-' + Date.now().toString(36));
    try {
      const resp = await fetch('/api/whatsapp/respostas/enviar', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: _convDaFileira, resposta_id: id, cliente_id: cid,
          // Horário escolhido SÓ para este envio (quando o atendente mexeu na
          // linha acima da caixa). Sem isto, o envio direto ignorava a troca.
          lembrete_horario: (_prontaNaCaixa && _prontaNaCaixa.id === id && _prontaNaCaixa.horario) || '',
          lembrete_data: (_prontaNaCaixa && _prontaNaCaixa.id === id) ? _prontaNaCaixa.data : undefined
        })
      });
      const j = await resp.json().catch(function () { return {}; });
      if (j && j.ok) {
        const tipo = r.arquivo ? (r.tipoAnexo === 'documento' ? 'document' : (r.tipoAnexo === 'audio' ? 'audio' : 'image')) : 'text';
        const nova = {
          direction: 'outgoing', type: tipo, content: j.texto || r.texto || '',
          media_url: r.arquivo ? '/api/whatsapp/respostas/midia/' + encodeURIComponent(r.arquivo) : '',
          status: 'sent', created_at: new Date().toISOString()
        };
        // O servidor avisa todo mundo pelo tempo real, inclusive esta aba, e
        // devolve o cliente_id — então a bolha que entra por ali já é a real.
        // Aqui só se desenha quando o tempo real está fora do ar, e com a mesma
        // tranca contra repetido.
        nova.cliente_id = cid;
        if (j.message_id) nova.id = j.message_id;
        if (j.wamid) nova.wamid = j.wamid;
        const semTempoReal = (typeof _waSSE === 'undefined') || !_waSSE || _waSSE.readyState === 2;
        const repetida = (typeof _waJaNaTela === 'function') && _waJaNaTela(nova);
        if (semTempoReal && !repetida) {
          if (typeof _waMsgsCache !== 'undefined' && _waMsgsCache) _waMsgsCache.push(nova);
          if (typeof _waAppendBolha === 'function') _waAppendBolha(nova);
        }
        if (typeof _waCarregarConversas === 'function') _waCarregarConversas();
        // O bot acabou de ser pausado neste contato: o cabeçalho mostra isso.
        if (typeof botCarregarControle === 'function' && _convObj && _convObj.contact_id) {
          botCarregarControle(_convObj.contact_id);
        }
        // Lembretes agendados neste envio: a conversa avisa, com cancelar.
        if (j.lembretes && j.lembretes.agendados) {
          aviso(j.lembretes.agendados === 1
            ? 'Enviada. 1 lembrete agendado.'
            : 'Enviada. ' + j.lembretes.agendados + ' lembretes agendados.');
          respostasAvisoAgendado(_convDaFileira);
        }
      } else if (j && j.janela_fechada) {
        aviso(j.error || 'A janela de 24 horas fechou.', true);
      } else {
        aviso((j && j.error) || 'Não consegui enviar.', true);
      }
    } catch (e) {
      aviso('Falha no envio: ' + (e.message || e), true);
    } finally {
      // Redesenha com a situação atual da janela (pode ter fechado agora).
      respostasDesenharFileira(_convObj || { id: _convDaFileira });
    }
  };

  // ── A LISTA QUE A BARRA "/" ABRE ─────────────────────────────────────────
  // Tem busca própria em vez de filtrar pelo que é digitado na caixa: assim a
  // caixa de escrever continua intacta, e fechar a lista não apaga nada do
  // que o atendente já tinha escrito.
  let _listaAberta = false;

  window.respostasAbrirLista = function () {
    if (!pode('criar')) return;
    const itens = emOrdem();
    if (!itens.length) { aviso('Nenhuma mensagem pronta cadastrada ainda.'); return; }
    let painel = document.getElementById('wa-prontas-lista');
    if (!painel) {
      painel = document.createElement('div');
      painel.id = 'wa-prontas-lista';
      painel.className = 'wa-prontas-lista';
      const ancora = document.getElementById('wa-prontas');
      if (ancora && ancora.parentNode) ancora.parentNode.insertBefore(painel, ancora);
      else document.body.appendChild(painel);
    }
    painel.innerHTML =
      '<div class="wa-prontas-lista-topo">' +
        '<i class="fa-solid fa-magnifying-glass"></i>' +
        '<input id="wa-prontas-busca" type="text" placeholder="Procurar mensagem pronta…" ' +
          'oninput="respostasFiltrarLista(this.value)" onkeydown="respostasTeclaLista(event)">' +
        '<button class="wa-pronta-fechar" title="Fechar (Esc)" onclick="respostasFecharLista()">' +
          '<i class="fa-solid fa-xmark"></i></button>' +
      '</div>' +
      '<div class="wa-prontas-lista-itens" id="wa-prontas-itens">' + itensDaLista(itens) + '</div>';
    painel.style.display = '';
    _listaAberta = true;
    const busca = document.getElementById('wa-prontas-busca');
    if (busca) busca.focus();
  };

  function itensDaLista(itens) {
    if (!itens.length) return '<div class="wa-prontas-lista-vazio">Nada com esse nome.</div>';
    const fechada = !_janela.aberta;
    return itens.map(function (r, i) {
      const previa = String(r.texto || '').replace(/\s+/g, ' ').slice(0, 90);
      return '<button class="wa-prontas-item' + (i === 0 ? ' alvo' : '') + '" data-id="' + esc(r.id) + '" ' +
        (fechada ? 'disabled' : '') + ' onclick="respostasUsar(\'' + esc(r.id) + '\')">' +
        '<span class="wa-prontas-item-tit">' +
          (r.arquivo ? '<i class="fa-solid ' + (r.tipoAnexo === 'documento' ? 'fa-file-pdf' : (r.tipoAnexo === 'audio' ? 'fa-microphone' : 'fa-image')) + '"></i> ' : '') +
          esc(r.titulo || 'sem título') + '</span>' +
        '<span class="wa-prontas-item-txt">' + esc(previa) + '</span>' +
        '</button>';
    }).join('');
  }

  window.respostasFiltrarLista = function (termo) {
    const t = String(termo || '').trim().toLowerCase();
    const alvo = document.getElementById('wa-prontas-itens');
    if (!alvo) return;
    const itens = emOrdem().filter(function (r) {
      if (!t) return true;
      return (String(r.titulo || '') + ' ' + String(r.texto || '')).toLowerCase().indexOf(t) >= 0;
    });
    alvo.innerHTML = itensDaLista(itens);
  };

  window.respostasTeclaLista = function (e) {
    const itens = Array.from(document.querySelectorAll('#wa-prontas-itens .wa-prontas-item'));
    const atual = itens.findIndex(function (b) { return b.classList.contains('alvo'); });
    if (e.key === 'Escape') { e.preventDefault(); respostasFecharLista(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const alvo = itens[atual >= 0 ? atual : 0];
      if (alvo && !alvo.disabled) alvo.click();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!itens.length) return;
      const novo = e.key === 'ArrowDown'
        ? Math.min(itens.length - 1, (atual < 0 ? -1 : atual) + 1)
        : Math.max(0, (atual < 0 ? 0 : atual) - 1);
      itens.forEach(function (b) { b.classList.remove('alvo'); });
      itens[novo].classList.add('alvo');
      itens[novo].scrollIntoView({ block: 'nearest' });
    }
  };

  window.respostasFecharLista = function () {
    const painel = document.getElementById('wa-prontas-lista');
    if (painel) painel.remove();
    if (_listaAberta) {
      _listaAberta = false;
      const caixa = document.getElementById('wa-msg-input');
      if (caixa) caixa.focus();
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // A TELA DE CADASTRO (sub-aba "Mensagens prontas")
  // ══════════════════════════════════════════════════════════════════════════

  let _form = null;          // registro em edição (cópia), ou null

  const VARIAVEIS = [
    { v: '{nome}', d: 'primeiro nome do contato' },
    { v: '{saudacao}', d: 'bom dia / boa tarde / boa noite' },
    { v: '{link_vagas}', d: 'link das vagas (configurado na aba Bot)' }
  ];

  window._respostasRender = function (cont) {
    if (!cont) return;
    if (!pode('visualizar')) {
      cont.innerHTML = '<div class="wa-empty">Você não tem permissão para ver esta aba.</div>';
      return;
    }
    const itens = emOrdem();
    const podeEditar = pode('editar');

    cont.innerHTML = `
      <div class="wa-prontas-tela">
        <div class="wa-prontas-cab">
          <div>
            <h3><i class="fa-solid fa-comment-dots"></i> Mensagens prontas</h3>
            <p class="wa-prontas-sub">Ficam numa fileira acima da caixa de escrever, em toda conversa.
            Na caixa, a barra <b>/</b> abre a lista.</p>
          </div>
          ${podeEditar ? `<button class="mod-btn-primary" onclick="respostasNova()"><i class="fa-solid fa-plus"></i> Nova mensagem</button>` : ''}
        </div>

        ${_form && podeEditar ? formHTML(_form) : ''}

        ${itens.length === 0
          ? `<div class="wa-empty"><i class="fa-solid fa-comment-dots"></i>
               <p>Nenhuma mensagem pronta ainda.${podeEditar ? ' Clique em <b>Nova mensagem</b>.' : ''}</p></div>`
          : `<div class="wa-prontas-cards">` + itens.map(function (r, i) {
              return cardHTML(r, i, itens.length, podeEditar);
            }).join('') + `</div>`}
      </div>`;
  };

  function cardHTML(r, i, total, podeEditar) {
    const anexo = r.arquivo
      ? `<a class="wa-prontas-chip" href="/api/whatsapp/respostas/midia/${encodeURIComponent(r.arquivo)}" target="_blank" rel="noopener">
           <i class="fa-solid ${r.tipoAnexo === 'documento' ? 'fa-file-pdf' : (r.tipoAnexo === 'audio' ? 'fa-microphone' : 'fa-image')}"></i>
           ${esc(r.nomeArquivo || r.arquivo)}</a>`
      : '';
    return `
      <div class="wa-prontas-card">
        <div class="wa-prontas-card-cab">
          <span class="wa-prontas-ordem">${i + 1}</span>
          <strong>${esc(r.titulo || 'sem título')}</strong>
          ${podeEditar ? `
            <span class="wa-prontas-acoes">
              <button class="wa-btn-mini" title="Subir" ${i === 0 ? 'disabled' : ''} onclick="respostasMover('${esc(r.id)}',-1)"><i class="fa-solid fa-arrow-up"></i></button>
              <button class="wa-btn-mini" title="Descer" ${i === total - 1 ? 'disabled' : ''} onclick="respostasMover('${esc(r.id)}',1)"><i class="fa-solid fa-arrow-down"></i></button>
              <button class="wa-btn-mini" title="Editar" onclick="respostasEditar('${esc(r.id)}')"><i class="fa-solid fa-pen"></i></button>
              <button class="wa-btn-mini perigo" title="Apagar" onclick="respostasApagar('${esc(r.id)}')"><i class="fa-solid fa-trash"></i></button>
            </span>` : ''}
        </div>
        <div class="wa-prontas-card-txt texto-longo">${esc(r.texto || '')}</div>
        ${(r.lembrete && r.lembrete.ligado)
          ? `<span class="wa-prontas-chip wa-chip-lembrete" title="Lembretes automáticos">
               <i class="fa-solid fa-clock"></i> ${esc(r.lembrete.horario || '')} ·
               ${(r.lembrete.lembretes || []).length} lembrete${(r.lembrete.lembretes || []).length === 1 ? '' : 's'}</span>`
          : ''}
        ${anexo}
      </div>`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LEMBRETE AUTOMÁTICO (dentro da mensagem pronta)
  // A configuração vive DENTRO do registro da mensagem pronta, então ela é
  // gravada pelo mesmo caminho (upsertIds) e aparece na Auditoria junto.
  // ══════════════════════════════════════════════════════════════════════════
  const VARIAVEIS_LEMBRETE = [
    { v: '{nome}', d: 'primeiro nome do contato' },
    { v: '{saudacao}', d: 'bom dia / boa tarde / boa noite' },
    { v: '{horario}', d: 'horário do evento (ex.: 12:00)' },
    { v: '{link}', d: 'o link que está no texto da mensagem pronta' }
  ];

  function lembreteDoForm(f) {
    if (!f.lembrete || typeof f.lembrete !== 'object') {
      f.lembrete = { ligado: false, horario: '12:00', data: '', lembretes: [] };
    }
    if (!Array.isArray(f.lembrete.lembretes)) f.lembrete.lembretes = [];
    return f.lembrete;
  }

  function lembreteHTML(f) {
    const L = lembreteDoForm(f);
    const vars = VARIAVEIS_LEMBRETE.map(function (x) {
      return '<span class="wa-prontas-var" title="' + esc(x.d) + '">' + esc(x.v) + '</span>';
    }).join('');
    return `
      <div class="wa-lembrete-bloco">
        <label class="wa-lembrete-chave">
          <input type="checkbox" id="resp-lembrete-ligado" ${L.ligado ? 'checked' : ''} onchange="respostasLembreteLigar(this.checked)">
          <span><i class="fa-solid fa-clock"></i> Adicionar lembrete</span>
          <small>manda sozinho, perto da hora, só para quem recebeu esta mensagem</small>
        </label>

        ${!L.ligado ? '' : `
        <div class="wa-lembrete-corpo">
          <div class="wa-lembrete-quando">
            <div class="wa-prontas-form-linha curta">
              <label>Horário do evento</label>
              <input type="time" id="resp-lembrete-horario" value="${esc(L.horario || '12:00')}" onchange="respostasLembreteCampo('horario', this.value)">
            </div>
            <div class="wa-prontas-form-linha curta">
              <label>Data <span class="wa-prontas-hint">(opcional)</span></label>
              <input type="date" id="resp-lembrete-data" value="${esc(L.data || '')}" onchange="respostasLembreteCampo('data', this.value)">
            </div>
            <p class="wa-lembrete-dica">${L.data
              ? 'Vale só nessa data.'
              : 'Sem data, vale o próximo ' + esc(L.horario || '12:00') + ': hoje, se ainda não passou; amanhã, se já passou.'}</p>
          </div>

          <div class="wa-lembrete-lista">
            ${L.lembretes.length === 0
              ? '<div class="wa-lembrete-vazio">Nenhum lembrete ainda. Clique em <b>+ adicionar lembrete</b>.</div>'
              : L.lembretes.map(function (l, i) { return lembreteItemHTML(l, i); }).join('')}
          </div>
          <button class="wa-lembrete-add" onclick="respostasLembreteNovo()">
            <i class="fa-solid fa-plus"></i> adicionar lembrete</button>
          <div class="wa-prontas-vars">Variáveis: ${vars}</div>

          ${lembretePreviaHTML(f, L)}
        </div>`}
      </div>`;
  }

  function lembreteItemHTML(l, i) {
    const tipo = l.tipo || 'minutos';
    const anexo = l.arquivo
      ? `<span class="wa-prontas-chip"><i class="fa-solid ${l.tipoAnexo === 'documento' ? 'fa-file-pdf' : 'fa-image'}"></i>
           ${esc(l.nomeArquivo || l.arquivo)}
           <button class="wa-btn-mini perigo" title="Tirar o anexo" onclick="respostasLembreteTirarAnexo(${i})"><i class="fa-solid fa-xmark"></i></button></span>`
      : `<label class="wa-btn-arq-mini"><i class="fa-solid fa-paperclip"></i> anexo
           <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" style="display:none" onchange="respostasLembreteAnexar(${i}, this)"></label>`;
    return `
      <div class="wa-lembrete-item">
        <div class="wa-lembrete-item-topo">
          <select onchange="respostasLembreteItem(${i}, 'tipo', this.value)">
            <option value="minutos" ${tipo === 'minutos' ? 'selected' : ''}>minutos antes</option>
            <option value="horas" ${tipo === 'horas' ? 'selected' : ''}>horas antes</option>
            <option value="na_hora" ${tipo === 'na_hora' ? 'selected' : ''}>na hora do evento</option>
          </select>
          ${tipo === 'na_hora' ? '' : `<input type="number" min="1" max="999" class="wa-lembrete-num"
             value="${Number(l.valor) || 15}" onchange="respostasLembreteItem(${i}, 'valor', this.value)">`}
          ${anexo}
          <button class="wa-btn-mini perigo" title="Remover este lembrete" onclick="respostasLembreteRemover(${i})"><i class="fa-solid fa-trash"></i></button>
        </div>
        <textarea rows="2" placeholder="Ex.: {saudacao} {nome}! Sua entrevista é às {horario}. Link: {link}"
          oninput="respostasLembreteItem(${i}, 'texto', this.value)">${esc(l.texto || '')}</textarea>
      </div>`;
  }

  // PRÉVIA: como cada lembrete vai chegar, com um nome de exemplo. É o que
  // evita descobrir o erro de texto depois de mandar para 30 pessoas.
  function lembretePreviaHTML(f, L) {
    const validos = L.lembretes.filter(function (l) { return String(l.texto || '').trim(); });
    if (!validos.length) return '';
    const horario = L.horario || '12:00';
    const link = (String(f.texto || '').match(/https?:\/\/[^\s<>"]+/) || [''])[0];
    const itens = validos.map(function (l) {
      const quanto = l.tipo === 'na_hora' ? 0
        : (l.tipo === 'horas' ? (Number(l.valor) || 0) * 60 : (Number(l.valor) || 0));
      return {
        rotulo: quanto === 0 ? 'na hora do evento'
          : (quanto % 60 === 0 ? (quanto / 60) + (quanto === 60 ? ' hora antes' : ' horas antes')
                               : quanto + (quanto === 1 ? ' minuto antes' : ' minutos antes')),
        sai: horarioMenos(horario, quanto),
        texto: previaTexto(l.texto, horario, link)
      };
    }).sort(function (a, b) { return a.sai < b.sai ? -1 : 1; });
    return `
      <div class="wa-lembrete-previa">
        <div class="wa-lembrete-previa-tit"><i class="fa-regular fa-eye"></i> Como vai chegar</div>
        ${itens.map(function (x) {
          return `<div class="wa-lembrete-previa-item">
            <span class="wa-lembrete-previa-hora">${esc(x.sai)}</span>
            <span class="wa-lembrete-previa-rot">${esc(x.rotulo)}</span>
            <div class="bot-previa-bolha texto-longo">${esc(x.texto)}</div>
          </div>`;
        }).join('')}
      </div>`;
  }

  function horarioMenos(hhmm, minutos) {
    const p = String(hhmm || '12:00').split(':');
    let total = (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0) - (Number(minutos) || 0);
    while (total < 0) total += 1440;
    const dois = function (n) { return String(n).padStart(2, '0'); };
    return dois(Math.floor(total / 60) % 24) + ':' + dois(total % 60);
  }
  // Troca das variáveis só para a PRÉVIA. O texto que sai de verdade é
  // resolvido no servidor, na hora do envio.
  function previaTexto(texto, horario, link) {
    const h = new Date().getHours();
    const saud = (h >= 5 && h < 12) ? 'bom dia' : (h >= 12 && h < 18 ? 'boa tarde' : 'boa noite');
    return String(texto || '')
      .replace(/\{nome\}/gi, 'Maria')
      .replace(/\{saudacao\}/gi, saud)
      .replace(/\{horario\}/gi, horario)
      .replace(/\{link\}/gi, link || '(o link da mensagem)')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/(^|\n)\s*([a-zà-ú])/g, function (_m, a, c) { return a + c.toUpperCase(); });
  }

  // ── handlers do cadastro do lembrete ─────────────────────────────────────
  window.respostasLembreteLigar = function (ligado) {
    if (!_form) return;
    lerForm();
    const L = lembreteDoForm(_form);
    L.ligado = !!ligado;
    if (L.ligado && !L.lembretes.length) {
      // Começa com o par que o atendimento usa todo dia.
      L.lembretes = [
        { id: novoIdLembrete(), tipo: 'minutos', valor: 15, texto: '{saudacao} {nome}! Sua entrevista é às {horario}. O link é este: {link}' },
        { id: novoIdLembrete(), tipo: 'na_hora', valor: 0, texto: '{nome}, a entrevista já começou. Estou te esperando: {link}' }
      ];
    }
    redesenhar();
  };
  window.respostasLembreteCampo = function (campo, valor) {
    if (!_form) return;
    lerForm();
    lembreteDoForm(_form)[campo] = String(valor || '');
    redesenhar();
  };
  window.respostasLembreteNovo = function () {
    if (!_form) return;
    lerForm();
    lembreteDoForm(_form).lembretes.push({ id: novoIdLembrete(), tipo: 'minutos', valor: 30, texto: '' });
    redesenhar();
  };
  window.respostasLembreteRemover = function (i) {
    if (!_form) return;
    lerForm();
    lembreteDoForm(_form).lembretes.splice(i, 1);
    redesenhar();
  };
  window.respostasLembreteItem = function (i, campo, valor) {
    if (!_form) return;
    const L = lembreteDoForm(_form);
    if (!L.lembretes[i]) return;
    L.lembretes[i][campo] = campo === 'valor' ? Math.max(0, Number(valor) || 0) : String(valor || '');
    // Texto não redesenha a cada tecla (perderia o cursor); os outros sim,
    // porque mudam o que a tela mostra.
    if (campo !== 'texto') redesenhar();
  };
  window.respostasLembreteAnexar = function (i, input) {
    if (!_form) return;
    const arq = input && input.files && input.files[0];
    if (!arq) return;
    if (arq.size > 20 * 1024 * 1024) { aviso('Arquivo muito grande (máximo 20 MB).', true); input.value = ''; return; }
    lerForm();
    const leitor = new FileReader();
    leitor.onload = async function () {
      try {
        const r = await fetch('/api/whatsapp/respostas/midia', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: leitor.result })
        });
        const j = await r.json().catch(function () { return {}; });
        if (!j.ok) { aviso(j.error || 'Não consegui enviar o arquivo.', true); return; }
        const L = lembreteDoForm(_form);
        if (!L.lembretes[i]) return;
        L.lembretes[i].arquivo = j.arquivo;
        L.lembretes[i].nomeArquivo = arq.name;
        L.lembretes[i].mime = j.mime;
        L.lembretes[i].tipoAnexo = j.tipoAnexo;
        aviso('Anexo do lembrete pronto. Clique em Salvar.');
        redesenhar();
      } catch (e) { aviso('Falha no envio: ' + (e.message || e), true); }
    };
    leitor.readAsDataURL(arq);
  };
  window.respostasLembreteTirarAnexo = function (i) {
    if (!_form) return;
    lerForm();
    const L = lembreteDoForm(_form);
    if (!L.lembretes[i]) return;
    L.lembretes[i].arquivo = ''; L.lembretes[i].nomeArquivo = '';
    L.lembretes[i].mime = ''; L.lembretes[i].tipoAnexo = '';
    redesenhar();
  };
  function novoIdLembrete() {
    return 'lem-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function formHTML(f) {
    const vars = VARIAVEIS.map(function (x) {
      return `<button class="wa-prontas-var" title="${esc(x.d)}" onclick="respostasInserirVar('${esc(x.v)}')">${esc(x.v)}</button>`;
    }).join('');
    const iconeAnexo = f.tipoAnexo === 'documento' ? 'fa-file-pdf'
                     : (f.tipoAnexo === 'audio' ? 'fa-microphone' : 'fa-image');
    const anexo = f.arquivo
      ? `<div class="wa-prontas-anexo-atual">
           <i class="fa-solid ${iconeAnexo}"></i>
           ${esc(f.nomeArquivo || f.arquivo)}
           <button class="wa-btn-mini perigo" title="Tirar o anexo" onclick="respostasTirarAnexo()"><i class="fa-solid fa-xmark"></i></button>
         </div>
         ${f.tipoAnexo === 'audio'
           ? `<audio class="wa-prontas-audio" controls preload="none"
                src="/api/whatsapp/respostas/midia/${encodeURIComponent(f.arquivo)}"></audio>`
           : ''}`
      : `<div class="wa-prontas-anexo-vazio">Sem anexo</div>`;
    return `
      <div class="wa-prontas-form">
        <div class="wa-prontas-form-linha">
          <label>Título <span class="wa-prontas-hint">(é o que aparece no botão)</span></label>
          <input type="text" id="resp-titulo" maxlength="40" value="${esc(f.titulo || '')}" placeholder="Ex.: Pedir documentos">
        </div>
        <div class="wa-prontas-form-linha">
          <label>Mensagem</label>
          <textarea id="resp-texto" rows="5" placeholder="Olá {nome}, {saudacao}! …">${esc(f.texto || '')}</textarea>
          <div class="wa-prontas-vars">Variáveis: ${vars}</div>
        </div>
        <div class="wa-prontas-form-cols">
          <div class="wa-prontas-form-linha">
            <label>Anexo <span class="wa-prontas-hint">(imagem, PDF ou áudio — opcional, um por mensagem)</span></label>
            ${anexo}
            <input type="file" id="resp-arquivo" accept="image/png,image/jpeg,image/webp,application/pdf,audio/ogg,.ogg,.opus" onchange="respostasAnexar(this)">
            <button type="button" class="mod-btn-secondary wa-prontas-gravar" onclick="respostasGravarAudio()">
              <i class="fa-solid fa-microphone"></i> Gravar áudio
            </button>
            <small class="wa-prontas-hint">O áudio gravado vira <b>mensagem de voz</b> no WhatsApp. Ele ocupa o lugar do anexo desta mensagem.</small>
          </div>
          <div class="wa-prontas-form-linha curta">
            <label>Ordem</label>
            <input type="number" id="resp-ordem" min="1" max="99" value="${Number(f.ordem) || 1}">
          </div>
        </div>
        ${lembreteHTML(f)}
        <div class="wa-prontas-form-botoes">
          <button class="mod-btn-secondary" onclick="respostasCancelarForm()">Cancelar</button>
          <button class="mod-btn-primary" onclick="respostasSalvarForm()"><i class="fa-solid fa-check"></i> Salvar</button>
        </div>
      </div>`;
  }

  function redesenhar() {
    if (typeof renderWhatsApp === 'function') { renderWhatsApp(); return; }
    const cont = document.getElementById('wa-content');
    if (cont) _respostasRender(cont);
  }

  // Guarda o que já foi digitado antes de redesenhar a tela, senão um upload
  // de anexo apaga o título e o texto que a pessoa acabou de escrever.
  function lerForm() {
    if (!_form) return;
    const t = document.getElementById('resp-titulo');
    const x = document.getElementById('resp-texto');
    const o = document.getElementById('resp-ordem');
    if (t) _form.titulo = t.value;
    if (x) _form.texto = x.value;
    if (o) _form.ordem = Number(o.value) || 1;
  }

  window.respostasNova = function () {
    if (!pode('editar')) return;
    _form = { id: novoId(), titulo: '', texto: '', ordem: emOrdem().length + 1, novo: true };
    redesenhar();
  };
  window.respostasEditar = function (id) {
    if (!pode('editar')) return;
    const r = porId(id);
    if (!r) return;
    _form = JSON.parse(JSON.stringify(r));
    redesenhar();
  };
  window.respostasCancelarForm = function () { _form = null; redesenhar(); };

  window.respostasInserirVar = function (v) {
    const campo = document.getElementById('resp-texto');
    if (!campo) return;
    const ini = campo.selectionStart || 0, fim = campo.selectionEnd || 0;
    campo.value = campo.value.slice(0, ini) + v + campo.value.slice(fim);
    campo.focus();
    try { campo.setSelectionRange(ini + v.length, ini + v.length); } catch (e) {}
    if (_form) _form.texto = campo.value;
  };

  window.respostasSalvarForm = async function () {
    if (!_form || !pode('editar')) return;
    lerForm();
    const titulo = String(_form.titulo || '').trim();
    const texto = String(_form.texto || '').trim();
    if (!titulo) { aviso('Dê um título: é o que aparece no botão.', true); return; }
    if (!texto && !_form.arquivo) { aviso('Escreva a mensagem (ou anexe um arquivo).', true); return; }

    const reg = {
      id: _form.id, titulo: titulo, texto: texto,
      ordem: Number(_form.ordem) || 1,
      arquivo: _form.arquivo || '', nomeArquivo: _form.nomeArquivo || '',
      mime: _form.mime || '', tipoAnexo: _form.tipoAnexo || '',
      criadoEm: _form.criadoEm || new Date().toISOString(),
      atualizadoEm: new Date().toISOString()
    };
    // O lembrete vai DENTRO do registro: mesma gravacao, mesma Auditoria,
    // mesma permissao. So entra se estiver ligado e tiver texto, para nao
    // guardar lixo no state.json.
    const Lcfg = _form.lembrete;
    if (Lcfg && Lcfg.ligado) {
      const limpos = (Array.isArray(Lcfg.lembretes) ? Lcfg.lembretes : [])
        .filter(function (l) { return l && String(l.texto || '').trim(); })
        .map(function (l) {
          return {
            id: l.id || novoIdLembrete(), tipo: l.tipo || 'minutos',
            valor: l.tipo === 'na_hora' ? 0 : Math.max(0, Number(l.valor) || 0),
            texto: String(l.texto || '').trim(),
            arquivo: l.arquivo || '', nomeArquivo: l.nomeArquivo || '',
            mime: l.mime || '', tipoAnexo: l.tipoAnexo || ''
          };
        });
      if (!limpos.length) {
        aviso('O lembrete esta ligado mas nenhum tem texto. Escreva o texto ou desligue o lembrete.', true);
        return;
      }
      reg.lembrete = {
        ligado: true, horario: String(Lcfg.horario || '12:00'),
        data: String(Lcfg.data || ''), lembretes: limpos
      };
    }
    const lista = catalogo();
    const i = lista.findIndex(function (r) { return r && String(r.id) === String(reg.id); });
    const novo = i < 0;
    if (novo) lista.push(reg); else lista[i] = reg;

    const ok = await gravar([reg.id], [], (novo ? 'criou' : 'alterou') + ' "' + titulo + '"');
    if (!ok) { if (novo) lista.pop(); return; }
    _form = null;
    aviso('Mensagem pronta salva.');
    redesenhar();
  };

  window.respostasApagar = async function (id) {
    if (!pode('editar')) return;
    const r = porId(id);
    if (!r) return;
    if (!confirm('Apagar a mensagem pronta "' + (r.titulo || '') + '"?\n\nAs conversas já enviadas não mudam.')) return;
    const lista = catalogo();
    const i = lista.findIndex(function (x) { return x && String(x.id) === String(id); });
    if (i < 0) return;
    const copia = lista[i];
    lista.splice(i, 1);
    const ok = await gravar([], [id], 'apagou "' + (r.titulo || '') + '"');
    if (!ok) { lista.splice(i, 0, copia); return; }
    if (_form && String(_form.id) === String(id)) _form = null;
    redesenhar();
  };

  // Reordenar troca a ORDEM dos dois vizinhos e salva os dois com upsertIds.
  window.respostasMover = async function (id, dir) {
    if (!pode('editar')) return;
    const itens = emOrdem();
    const i = itens.findIndex(function (r) { return String(r.id) === String(id); });
    const j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= itens.length) return;
    // Renumera tudo de 1 a N antes de trocar: catálogo antigo pode ter ordem
    // repetida ou vazia, e aí a troca não sairia do lugar.
    itens.forEach(function (r, k) { r.ordem = k + 1; });
    const a = itens[i], b = itens[j];
    const tmp = a.ordem; a.ordem = b.ordem; b.ordem = tmp;
    await gravar(itens.map(function (r) { return r.id; }), [], 'mudou a ordem');
    redesenhar();
  };

  // GRAVAR NA HORA para a mensagem pronta. A mensagem tem UM anexo, então o
  // áudio gravado ocupa o lugar dele (a tela avisa isso ao lado do botão).
  window.respostasGravarAudio = function () {
    if (!pode('editar') || !_form || !window.RTAudio) return;
    lerForm();                      // não perde o que já foi digitado
    RTAudio.gravar({
      destino: 'pronta', titulo: 'Gravar áudio da mensagem',
      aoUsar: function (res) {
        _form.arquivo = res.arquivo;
        _form.nomeArquivo = res.nomeArquivo;
        _form.mime = res.mime;
        _form.tipoAnexo = 'audio';
        aviso('Áudio pronto. Clique em Salvar para guardar a mensagem.');
        redesenhar();
      }
    });
  };

  window.respostasAnexar = function (input) {
    if (!pode('editar') || !_form) return;
    const arq = input && input.files && input.files[0];
    if (!arq) return;
    if (arq.size > 20 * 1024 * 1024) { aviso('Arquivo muito grande (máximo 20 MB).', true); input.value = ''; return; }
    lerForm();                      // não perde o que já foi digitado
    const leitor = new FileReader();
    leitor.onload = async function () {
      try {
        // Áudio vai pela rota do BOT (que aceita OGG); imagem e PDF seguem
        // pela rota das prontas, como sempre.
        const ehAudio = /audio|ogg|opus/i.test(arq.type || '') || /\.(ogg|opus)$/i.test(arq.name || '');
        const r = await fetch(ehAudio ? '/api/whatsapp/bot/midia' : '/api/whatsapp/respostas/midia', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ehAudio ? { dataUrl: leitor.result, destino: 'audio' } : { dataUrl: leitor.result })
        });
        const j = await r.json().catch(function () { return {}; });
        if (!j.ok) { aviso(j.error || 'Não consegui enviar o arquivo.', true); return; }
        _form.arquivo = j.arquivo;
        _form.nomeArquivo = arq.name;
        _form.mime = j.mime;
        _form.tipoAnexo = ehAudio ? 'audio' : j.tipoAnexo;
        aviso('Anexo pronto. Clique em Salvar para guardar a mensagem.');
        redesenhar();
      } catch (e) { aviso('Falha no envio: ' + (e.message || e), true); }
    };
    leitor.readAsDataURL(arq);
  };

  window.respostasTirarAnexo = function () {
    if (!_form) return;
    lerForm();
    _form.arquivo = ''; _form.nomeArquivo = ''; _form.mime = ''; _form.tipoAnexo = '';
    redesenhar();
  };
})();
