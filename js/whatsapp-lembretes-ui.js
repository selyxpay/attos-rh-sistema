// ==========================================================================
// ABA "LEMBRETES AGENDADOS" DO WHATSAPP OFICIAL — a tela
// --------------------------------------------------------------------------
// Mostra o que o sistema vai mandar sozinho, agrupado por EVENTO (a mensagem
// pronta mais o horário). De cada evento dá para: cancelar uma pessoa,
// cancelar o evento inteiro, mudar o horário (reagenda todos de uma vez) e
// mandar um agora.
//
// O cadastro dos textos NÃO fica aqui: fica na aba "Mensagens prontas", dentro
// da própria mensagem. Aqui é só acompanhamento e correção de rumo.
//
// Arquivo separado de propósito, como o do bot e o das mensagens prontas.
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

  let _dia = 'hoje';
  let _eventoAberto = '';
  let _dados = { eventos: [], itens: [], disponivel: true };

  // Hora e data (em Brasília) de uma data guardada no formato do SQLite, que é
  // UTC. Sem isto, o painel mostraria 3 horas adiantado.
  function spDeSql(txt) {
    const s = String(txt || '').trim().replace(' ', 'T');
    const d = new Date(s.length <= 19 ? s + 'Z' : s);
    if (isNaN(d)) return { hora: String(txt || ''), data: '', dia: '' };
    const sp = new Date(d.getTime() - 180 * 60000);
    const dois = function (n) { return String(n).padStart(2, '0'); };
    const hoje = new Date(Date.now() - 180 * 60000);
    const amanha = new Date(hoje.getTime() + 86400000);
    const mesmoDia = function (a, b) {
      return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
    };
    return {
      hora: dois(sp.getUTCHours()) + ':' + dois(sp.getUTCMinutes()),
      data: dois(sp.getUTCDate()) + '/' + dois(sp.getUTCMonth() + 1),
      dia: mesmoDia(sp, hoje) ? 'hoje' : (mesmoDia(sp, amanha) ? 'amanhã' : '')
    };
  }

  const ROTULO_STATUS = {
    agendado: { txt: 'agendado', cor: 'ag' },
    enviado: { txt: 'enviado', cor: 'ok' },
    falhou: { txt: 'falhou', cor: 'erro' },
    cancelado: { txt: 'cancelado', cor: 'cinza' },
    perdido: { txt: 'perdido', cor: 'erro' },
    janela_fechada: { txt: 'janela fechada', cor: 'alerta' }
  };

  async function carregar() {
    const qs = '?dia=' + encodeURIComponent(_dia) + (_eventoAberto ? '&evento=' + encodeURIComponent(_eventoAberto) : '');
    let j = null;
    try {
      const r = await fetch('/api/whatsapp/lembretes/painel' + qs, { credentials: 'same-origin' });
      const tipo = String(r.headers.get('content-type') || '');
      if (tipo.indexOf('application/json') < 0) throw new Error('resposta inesperada do servidor');
      j = await r.json();
    } catch (e) {
      // Igual ao resto da tela: falha de rede NÃO apaga o que está mostrando.
      aviso('Não consegui atualizar os lembretes agora.', true);
      return false;
    }
    if (!j || !j.ok) { aviso((j && j.error) || 'Não consegui carregar.', true); return false; }
    _dados = { eventos: j.eventos || [], itens: j.itens || [], disponivel: j.disponivel !== false };
    return true;
  }

  window._lembretesRender = async function (cont) {
    if (!cont) return;
    if (!pode('visualizar')) {
      cont.innerHTML = '<div class="wa-empty">Você não tem permissão para ver esta aba.</div>';
      return;
    }
    if (!cont.dataset.lembretesCarregado) {
      cont.innerHTML = '<div class="wa-loading" style="margin:24px auto;"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    }
    await carregar();
    cont.dataset.lembretesCarregado = '1';
    desenhar(cont);
  };

  function desenhar(cont) {
    const evs = _dados.eventos;
    cont.innerHTML = `
      <div class="wa-lemb-tela">
        <div class="wa-prontas-cab">
          <div>
            <h3><i class="fa-solid fa-bell"></i> Lembretes agendados</h3>
            <p class="wa-prontas-sub">O que o sistema vai mandar sozinho, por evento.
            Os textos ficam na aba <b>Mensagens prontas</b>.</p>
          </div>
          <div class="wa-lemb-filtros">
            ${['hoje', 'amanha', 'todos'].map(function (d) {
              return '<button class="wa-fchip' + (_dia === d ? ' active' : '') + '" onclick="lembretesFiltrar(\'' + d + '\')">' +
                     (d === 'hoje' ? 'Hoje' : d === 'amanha' ? 'Amanhã' : 'Todos') + '</button>';
            }).join('')}
            <button class="mod-btn-secondary" onclick="lembretesAtualizar()"><i class="fa-solid fa-rotate"></i></button>
          </div>
        </div>

        ${!_dados.disponivel
          ? '<div class="wa-empty wa-err"><i class="fa-solid fa-triangle-exclamation"></i><p>O motor de lembretes não está carregado neste servidor. Nada é enviado até ele voltar.</p></div>'
          : ''}

        ${evs.length === 0
          ? `<div class="wa-empty"><i class="fa-solid fa-bell-slash"></i>
               <p>Nenhum lembrete ${_dia === 'hoje' ? 'para hoje' : _dia === 'amanha' ? 'para amanhã' : ''}.
               Eles aparecem aqui quando você manda uma mensagem pronta que tem lembrete.</p></div>`
          : '<div class="wa-lemb-eventos">' + evs.map(eventoHTML).join('') + '</div>'}
      </div>`;
  }

  function eventoHTML(e) {
    const q = spDeSql(e.evento_em);
    const aberto = _eventoAberto === e.evento_chave;
    const chave = esc(e.evento_chave);
    return `
      <div class="wa-lemb-evento ${aberto ? 'aberto' : ''}">
        <div class="wa-lemb-evento-cab" onclick="lembretesAbrir('${chave}')">
          <span class="wa-lemb-hora">${esc(q.hora)}<small>${esc(q.dia || q.data)}</small></span>
          <div class="wa-lemb-evento-info">
            <strong>${esc(e.titulo || e.resposta_id)}</strong>
            ${e.resposta_id === 'bot'
              ? '<span class="wa-lemb-origem" title="Agendado pelo atendimento automatico"><i class="fa-solid fa-robot"></i> Bot</span>'
              : ''}
            ${e.resposta_id === 'fora-expediente'
              ? '<span class="wa-lemb-origem lua" title="Agendado pelo modo fora do expediente"><i class="fa-solid fa-moon"></i> Fora do expediente</span>'
              : ''}
            <div class="wa-lemb-conta">
              <span class="wa-lemb-pill ag">${Number(e.agendados) || 0} agendado(s)</span>
              <span class="wa-lemb-pill ok">${Number(e.enviados) || 0} enviado(s)</span>
              ${Number(e.falhos) ? '<span class="wa-lemb-pill erro">' + Number(e.falhos) + ' falho(s)</span>' : ''}
              ${Number(e.perdidos) ? '<span class="wa-lemb-pill erro">' + Number(e.perdidos) + ' perdido(s)</span>' : ''}
              ${Number(e.cancelados) ? '<span class="wa-lemb-pill cinza">' + Number(e.cancelados) + ' cancelado(s)</span>' : ''}
            </div>
          </div>
          <i class="fa-solid ${aberto ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
        </div>

        ${!aberto ? '' : `
        <div class="wa-lemb-corpo">
          ${pode('criar') ? `
          <div class="wa-lemb-acoes">
            <button class="mod-btn-secondary" onclick="lembretesMudarHorario('${chave}','${esc(q.hora)}')">
              <i class="fa-solid fa-clock"></i> Mudar o horário do evento</button>
            <button class="mod-btn-secondary perigo" onclick="lembretesCancelarEvento('${chave}')">
              <i class="fa-solid fa-ban"></i> Cancelar o evento inteiro</button>
          </div>` : ''}
          ${_dados.itens.length === 0
            ? '<div class="wa-lemb-vazio">Nada neste evento.</div>'
            : '<div class="wa-lemb-itens">' + _dados.itens.map(itemHTML).join('') + '</div>'}
        </div>`}
      </div>`;
  }

  function itemHTML(l) {
    const q = spDeSql(l.enviar_em);
    const st = ROTULO_STATUS[l.status] || { txt: l.status, cor: 'cinza' };
    const nome = l.nome_contato || l.contato_nome || l.telefone || 'sem nome';
    return `
      <div class="wa-lemb-item">
        <span class="wa-lemb-item-hora">${esc(q.hora)}</span>
        <span class="wa-lemb-item-nome" title="${esc(l.telefone || '')}">${esc(nome)}</span>
        <span class="wa-lemb-item-rot">${esc(l.rotulo || '')}</span>
        <span class="wa-lemb-pill ${st.cor}">${esc(st.txt)}</span>
        ${l.erro ? '<span class="wa-lemb-item-erro" title="' + esc(l.erro) + '">' + esc(l.erro) + '</span>' : ''}
        ${pode('criar') && l.status === 'agendado' ? `
          <span class="wa-lemb-item-acoes">
            <button class="wa-btn-mini" title="Enviar agora" onclick="lembretesEnviarAgora(${Number(l.id)})"><i class="fa-solid fa-paper-plane"></i></button>
            <button class="wa-btn-mini perigo" title="Cancelar este" onclick="lembretesCancelarUm(${Number(l.id)})"><i class="fa-solid fa-xmark"></i></button>
          </span>` : ''}
      </div>`;
  }

  function recarregar() {
    const cont = document.getElementById('wa-content');
    if (typeof renderWhatsApp === 'function') renderWhatsApp();
    else if (cont) _lembretesRender(cont);
  }

  window.lembretesFiltrar = function (dia) { _dia = dia; _eventoAberto = ''; recarregar(); };
  window.lembretesAtualizar = function () { recarregar(); };
  window.lembretesAbrir = function (chave) {
    _eventoAberto = (_eventoAberto === chave) ? '' : chave;
    recarregar();
  };

  window.lembretesCancelarUm = async function (id) {
    if (!confirm('Cancelar este lembrete?')) return;
    try {
      const r = await fetch('/api/whatsapp/lembretes/' + encodeURIComponent(id) + '/cancelar',
                            { method: 'POST', credentials: 'same-origin' });
      const j = await r.json().catch(function () { return {}; });
      if (!j.ok) { aviso(j.error || 'Não consegui cancelar.', true); return; }
      aviso('Lembrete cancelado.');
      recarregar();
    } catch (e) { aviso('Falha: ' + (e.message || e), true); }
  };

  window.lembretesEnviarAgora = async function (id) {
    if (!confirm('Mandar este lembrete agora?')) return;
    try {
      const r = await fetch('/api/whatsapp/lembretes/' + encodeURIComponent(id) + '/enviar-agora',
                            { method: 'POST', credentials: 'same-origin' });
      const j = await r.json().catch(function () { return {}; });
      if (!j.ok) { aviso(j.error || 'Não consegui mandar.', true); return; }
      aviso('Mandando. O resultado aparece aqui em instantes.');
      setTimeout(recarregar, 4000);
    } catch (e) { aviso('Falha: ' + (e.message || e), true); }
  };

  window.lembretesCancelarEvento = async function (chave) {
    if (!confirm('Cancelar TODOS os lembretes pendentes deste evento?\n\nQuem já recebeu não é afetado.')) return;
    try {
      const r = await fetch('/api/whatsapp/lembretes/evento/cancelar', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evento_chave: chave })
      });
      const j = await r.json().catch(function () { return {}; });
      if (!j.ok) { aviso(j.error || 'Não consegui cancelar.', true); return; }
      aviso((j.cancelados || 0) + ' lembrete(s) cancelado(s).');
      recarregar();
    } catch (e) { aviso('Falha: ' + (e.message || e), true); }
  };

  window.lembretesMudarHorario = async function (chave, horaAtual) {
    const novo = prompt('Novo horário do evento (ex.: 14:30).\n\nTodos os lembretes deste evento são reagendados juntos, mantendo a antecedência de cada um.', horaAtual || '');
    if (novo === null) return;
    if (!/^\d{1,2}:\d{2}$/.test(String(novo).trim())) { aviso('Horário no formato 14:30.', true); return; }
    try {
      const r = await fetch('/api/whatsapp/lembretes/evento/horario', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evento_chave: chave, horario: String(novo).trim() })
      });
      const j = await r.json().catch(function () { return {}; });
      if (!j.ok) { aviso(j.error || 'Não consegui mudar o horário.', true); return; }
      _eventoAberto = j.evento_chave || '';
      aviso('Horário mudado para ' + (j.horario || novo) + '. ' + (j.reagendados || 0) + ' reagendado(s).');
      recarregar();
    } catch (e) { aviso('Falha: ' + (e.message || e), true); }
  };
})();
