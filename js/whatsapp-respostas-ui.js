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
        ? '<i class="fa-solid ' + (r.tipoAnexo === 'documento' ? 'fa-file-pdf' : 'fa-image') + ' wa-pronta-anexo"></i>'
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
    try {
      const resp = await fetch('/api/whatsapp/respostas/enviar', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: _convDaFileira, resposta_id: id })
      });
      const j = await resp.json().catch(function () { return {}; });
      if (j && j.ok) {
        const tipo = r.arquivo ? (r.tipoAnexo === 'documento' ? 'document' : 'image') : 'text';
        const nova = {
          direction: 'outgoing', type: tipo, content: j.texto || r.texto || '',
          media_url: r.arquivo ? '/api/whatsapp/respostas/midia/' + encodeURIComponent(r.arquivo) : '',
          status: 'sent', created_at: new Date().toISOString()
        };
        // O servidor avisa todo mundo pelo tempo real, inclusive esta aba — e
        // é por ali que o balão entra. Desenhar aqui TAMBÉM mostraria a mesma
        // mensagem duas vezes. Só quando o tempo real está fora do ar é que
        // esta aba desenha por conta própria.
        const semTempoReal = (typeof _waSSE === 'undefined') || !_waSSE || _waSSE.readyState === 2;
        if (semTempoReal) {
          if (typeof _waMsgsCache !== 'undefined' && _waMsgsCache) _waMsgsCache.push(nova);
          if (typeof _waAppendBolha === 'function') _waAppendBolha(nova);
        }
        if (typeof _waCarregarConversas === 'function') _waCarregarConversas();
        // O bot acabou de ser pausado neste contato: o cabeçalho mostra isso.
        if (typeof botCarregarControle === 'function' && _convObj && _convObj.contact_id) {
          botCarregarControle(_convObj.contact_id);
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
          (r.arquivo ? '<i class="fa-solid ' + (r.tipoAnexo === 'documento' ? 'fa-file-pdf' : 'fa-image') + '"></i> ' : '') +
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
           <i class="fa-solid ${r.tipoAnexo === 'documento' ? 'fa-file-pdf' : 'fa-image'}"></i>
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
        ${anexo}
      </div>`;
  }

  function formHTML(f) {
    const vars = VARIAVEIS.map(function (x) {
      return `<button class="wa-prontas-var" title="${esc(x.d)}" onclick="respostasInserirVar('${esc(x.v)}')">${esc(x.v)}</button>`;
    }).join('');
    const anexo = f.arquivo
      ? `<div class="wa-prontas-anexo-atual">
           <i class="fa-solid ${f.tipoAnexo === 'documento' ? 'fa-file-pdf' : 'fa-image'}"></i>
           ${esc(f.nomeArquivo || f.arquivo)}
           <button class="wa-btn-mini perigo" title="Tirar o anexo" onclick="respostasTirarAnexo()"><i class="fa-solid fa-xmark"></i></button>
         </div>`
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
            <label>Anexo <span class="wa-prontas-hint">(imagem ou PDF, opcional)</span></label>
            ${anexo}
            <input type="file" id="resp-arquivo" accept="image/png,image/jpeg,image/webp,application/pdf" onchange="respostasAnexar(this)">
          </div>
          <div class="wa-prontas-form-linha curta">
            <label>Ordem</label>
            <input type="number" id="resp-ordem" min="1" max="99" value="${Number(f.ordem) || 1}">
          </div>
        </div>
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

  window.respostasAnexar = function (input) {
    if (!pode('editar') || !_form) return;
    const arq = input && input.files && input.files[0];
    if (!arq) return;
    if (arq.size > 20 * 1024 * 1024) { aviso('Arquivo muito grande (máximo 20 MB).', true); input.value = ''; return; }
    lerForm();                      // não perde o que já foi digitado
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
        _form.arquivo = j.arquivo;
        _form.nomeArquivo = arq.name;
        _form.mime = j.mime;
        _form.tipoAnexo = j.tipoAnexo;
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
