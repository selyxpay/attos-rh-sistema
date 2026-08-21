// ==========================================================================
// MÓDULO WHATSAPP — FRONTEND
// ==========================================================================
// Camada de tela do módulo WhatsApp. Conversa SÓ com o backend do R&T
// (/api/whatsapp/*). O backend é quem fala com a Meta Cloud API — nenhum token
// da Meta chega ao navegador. Reutiliza o login/permissões do sistema (não cria
// login novo). Renderiza dentro da seção #aba-whatsapp do index.html.
//
// Construído em etapas:
//   Etapa 1 (esta): fundação — sub-abas + Dashboard.
//   Etapas 2-4: Contatos, Inbox e Templates (preenchem as sub-abas).
// ==========================================================================
'use strict';

// ── Permissão (espelha o que o backend valida em waUsuarioTemPermissao) ──────
//   visualizar = ver o módulo | criar = atender/enviar | editar = gerenciar
//   conversas/contatos | aprovar = administrar (contas, templates, auditoria)
function _waPode(acao) {
  if (typeof loggedUser === 'undefined' || !loggedUser) return false;
  if (typeof ehMestre === 'function' && ehMestre(loggedUser.login)) return true;
  if (loggedUser.departamento === 'administracao') return true;
  return !!(loggedUser.permissoes && loggedUser.permissoes.whatsapp && loggedUser.permissoes.whatsapp[acao] === true);
}

// ── Cliente HTTP para o backend (sempre com o cookie de sessão) ──────────────
async function waGet(path) {
  const r = await fetch('/api/whatsapp' + path, { credentials: 'same-origin' });
  return r.json();
}
async function waSend(path, method, body) {
  const r = await fetch('/api/whatsapp' + path, {
    method: method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return r.json();
}

// ── Helpers de UI ────────────────────────────────────────────────────────────
function _waEsc(s) { return (typeof escapeHTML === 'function') ? escapeHTML(String(s == null ? '' : s)) : String(s == null ? '' : s); }
function _waErro(msg) {
  return `<div class="wa-empty wa-err"><i class="fa-solid fa-triangle-exclamation"></i>
    <p>${_waEsc(msg)}</p></div>`;
}

// ── Sub-abas do módulo ───────────────────────────────────────────────────────
let _waSubAba = 'dashboard';

function renderWhatsApp() {
  const subs = document.getElementById('wa-subtabs');
  const cont = document.getElementById('wa-content');
  if (!subs || !cont) return;
  if (!_waPode('visualizar')) { cont.innerHTML = _waErro('Você não tem permissão para acessar o WhatsApp.'); subs.innerHTML = ''; return; }

  const abas = [
    { id: 'dashboard', ic: 'fa-gauge-high',   label: 'Dashboard' },
    { id: 'contatos',  ic: 'fa-address-book', label: 'Contatos' },
    { id: 'inbox',     ic: 'fa-comments',     label: 'Conversas' },
    { id: 'templates', ic: 'fa-file-lines',   label: 'Templates' }
  ];
  // "Conexões" (múltiplos números oficiais) — só para quem administra o WhatsApp.
  if (_waPode('aprovar')) abas.push({ id: 'conexoes', ic: 'fa-plug', label: 'Conexões' });
  subs.innerHTML = abas.map(a =>
    `<button type="button" class="wa-tab ${a.id === _waSubAba ? 'active' : ''}" onclick="waTrocarSubAba('${a.id}')">
       <i class="fa-solid ${a.ic}"></i> <span>${a.label}</span>
     </button>`).join('');

  // Botões do cabeçalho conforme a sub-aba
  const actions = document.getElementById('wa-header-actions');
  if (actions) {
    actions.innerHTML = (_waSubAba === 'dashboard')
      ? `<button class="mod-btn-secondary" onclick="renderWhatsApp()"><i class="fa-solid fa-rotate"></i> Atualizar</button>`
      : '';
  }

  if (_waSubAba === 'dashboard')      _waRenderDashboard(cont);
  else if (_waSubAba === 'contatos')  _waRenderContatos(cont);
  else if (_waSubAba === 'inbox')     _waRenderInbox(cont);
  else if (_waSubAba === 'templates') _waRenderTemplates(cont);
  else if (_waSubAba === 'conexoes')  _waRenderConexoes(cont);
}
window.renderWhatsApp = renderWhatsApp;

window.waTrocarSubAba = function (id) { _waSubAba = id; renderWhatsApp(); };

// ── DASHBOARD ────────────────────────────────────────────────────────────────
async function _waRenderDashboard(cont) {
  cont.innerHTML = '<div class="wa-loading"><i class="fa-solid fa-spinner fa-spin"></i> Carregando…</div>';
  let r;
  try { r = await waGet('/dashboard'); }
  catch (e) { if (_waSubAba === 'dashboard') cont.innerHTML = _waErro('Não foi possível carregar o dashboard: ' + e.message); return; }
  if (_waSubAba !== 'dashboard') return;   // trocou de sub-aba enquanto carregava — não sobrescreve
  if (!r || !r.ok) { cont.innerHTML = _waErro((r && r.error) || 'Erro ao carregar o dashboard.'); return; }
  const s = r.stats || {};
  const card = (icon, color, val, label) =>
    `<div class="wa-stat" style="border-left:4px solid ${color};">
       <div class="wa-stat-ic" style="background:${color}1a;color:${color};"><i class="fa-solid ${icon}"></i></div>
       <div><div class="wa-stat-val">${val || 0}</div><div class="wa-stat-lbl">${label}</div></div>
     </div>`;
  cont.innerHTML =
    `<div class="wa-stats-grid">
       ${card('fa-plug',                 '#059669', s.connected_accounts,   'WhatsApps conectados')}
       ${card('fa-comments',             '#2563eb', s.today_conversations,  'Conversas hoje')}
       ${card('fa-envelope-open-text',   '#d97706', s.unread_conversations, 'Conversas não lidas')}
       ${card('fa-paper-plane',          '#7c3aed', s.today_sent,           'Mensagens enviadas (hoje)')}
       ${card('fa-inbox',                '#0891b2', s.today_received,        'Mensagens recebidas (hoje)')}
       ${card('fa-comment-dots',         '#059669', s.open_conversations,   'Conversas ativas')}
       ${card('fa-triangle-exclamation', '#dc2626', s.failed_messages,      'Mensagens com erro')}
       ${card('fa-clock',                '#d97706', s.pending_conversations,'Conversas pendentes')}
     </div>
     <div class="wa-mini-note">
       <i class="fa-solid fa-circle-info"></i>
       Total de contatos: <b>${s.total_contacts || 0}</b> · Conversas no total: <b>${s.total_conversations || 0}</b>
       ${(s.connected_accounts ? '' : ' · <span style="color:#d97706;">Nenhum número conectado ainda — configure na etapa de contas/produção.</span>')}
     </div>`;
}

// ==========================================================================
// ETAPA 2 — CONTATOS
// ==========================================================================
let _waContatos = [];
let _waBuscaContato = '';
let _waBuscaTimer = null;

function _waFmtData(iso) {
  if (!iso) return '—';
  const norm = String(iso).replace(' ', 'T');
  const d = new Date(norm.indexOf('Z') < 0 && norm.indexOf('+') < 0 ? norm + 'Z' : norm);
  if (isNaN(d)) return '—';
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function _waFmtTelefone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return phone || '—';
}
function _waInicial(nome) { return (String(nome || '?').trim().charAt(0) || '?').toUpperCase(); }
// Cada pessoa com a sua cor, estavel (o hash do nome escolhe na paleta).
// Antes disso a lista tinha um bug literal — style="background:cor;" sem o
// ${} — e TODOS os avatares ficavam transparentes.
const _WA_CORES_AVATAR = ['#00a884','#53bdeb','#e542a3','#fda43c','#7f66ff','#ff5c5c','#26c4dc','#a791f5','#f2b36e','#43c96b'];
function _waCorAvatar(nome) {
  let h = 0; const t = String(nome || '?');
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return _WA_CORES_AVATAR[h % _WA_CORES_AVATAR.length];
}

function _waRenderContatos(cont) {
  const podeCriar = _waPode('criar');
  cont.innerHTML =
    `<div class="wa-toolbar">
       <div class="wa-search">
         <i class="fa-solid fa-magnifying-glass"></i>
         <input type="text" id="wa-contato-busca" placeholder="Buscar por nome ou telefone…" value="${_waEsc(_waBuscaContato)}" oninput="waBuscarContatos(this.value)">
       </div>
       ${podeCriar ? `<button class="mod-btn-primary" onclick="waNovoContato()"><i class="fa-solid fa-plus"></i> Novo contato</button>` : ''}
     </div>
     <div id="wa-contatos-lista"><div class="wa-loading"><i class="fa-solid fa-spinner fa-spin"></i> Carregando…</div></div>`;
  _waCarregarContatos();
}

async function _waCarregarContatos() {
  const box = document.getElementById('wa-contatos-lista');
  if (!box) return;
  let r;
  try { r = await waGet('/contacts?limit=200&search=' + encodeURIComponent(_waBuscaContato)); }
  catch (e) { if (_waSubAba === 'contatos') box.innerHTML = _waErro('Não foi possível carregar os contatos: ' + e.message); return; }
  if (_waSubAba !== 'contatos') return;   // trocou de sub-aba enquanto carregava
  if (!r || !r.ok) { box.innerHTML = _waErro((r && r.error) || 'Erro ao carregar contatos.'); return; }
  _waContatos = r.contacts || [];
  if (!_waContatos.length) {
    box.innerHTML = `<div class="wa-empty"><i class="fa-solid fa-address-book"></i>
      <p>${_waBuscaContato ? 'Nenhum contato encontrado para essa busca.' : 'Nenhum contato ainda. Eles aparecem sozinhos quando alguém manda mensagem, ou você pode criar manualmente.'}</p></div>`;
    return;
  }
  const podeEditar = _waPode('editar');
  box.innerHTML =
    `<div class="wa-count">${r.total || _waContatos.length} contato(s)</div>
     <div class="wa-table-wrap"><table class="wa-table">
       <thead><tr><th>Nome</th><th>Telefone</th><th>E-mail</th><th>Origem</th><th>Última interação</th><th></th></tr></thead>
       <tbody>${_waContatos.map(c => `
         <tr>
           <td><span class="wa-avatar">${_waEsc(_waInicial(c.name || c.profile_name))}</span>
               <b>${_waEsc(c.name || c.profile_name || 'Sem nome')}</b></td>
           <td>${_waEsc(_waFmtTelefone(c.phone))}</td>
           <td>${_waEsc(c.email || '—')}</td>
           <td><span class="wa-chip">${_waEsc(c.origin || 'whatsapp')}</span></td>
           <td>${_waFmtData(c.last_interaction_at || c.created_at)}</td>
           <td class="wa-acoes">
             <button class="wa-btn-mini" title="Ver" onclick="waVerContato(${c.id})"><i class="fa-solid fa-eye"></i></button>
             ${podeEditar ? `<button class="wa-btn-mini" title="Editar" onclick="waEditarContato(${c.id})"><i class="fa-solid fa-pen"></i></button>` : ''}
           </td>
         </tr>`).join('')}</tbody>
     </table></div>`;
}

window.waBuscarContatos = function (valor) {
  _waBuscaContato = valor;
  clearTimeout(_waBuscaTimer);
  _waBuscaTimer = setTimeout(_waCarregarContatos, 300);
};

// ── Modal reutilizável do módulo ─────────────────────────────────────────────
function _waModal(titulo, corpoHtml, rodapeHtml) {
  let ov = document.getElementById('wa-modal-overlay');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'wa-modal-overlay'; ov.className = 'wa-modal-overlay';
    ov.addEventListener('click', e => { if (e.target === ov) waFecharModal(); });
    document.body.appendChild(ov);
  }
  ov.innerHTML =
    `<div class="wa-modal">
       <div class="wa-modal-head"><h3>${_waEsc(titulo)}</h3><button class="wa-modal-x" onclick="waFecharModal()"><i class="fa-solid fa-xmark"></i></button></div>
       <div class="wa-modal-body">${corpoHtml}</div>
       ${rodapeHtml ? `<div class="wa-modal-foot">${rodapeHtml}</div>` : ''}
     </div>`;
  ov.style.display = 'flex';
}
window.waFecharModal = function () { const ov = document.getElementById('wa-modal-overlay'); if (ov) ov.style.display = 'none'; };

// ── Criar / editar ───────────────────────────────────────────────────────────
function _waFormContato(c) {
  c = c || {};
  const editando = !!c.id;
  return `
    <form onsubmit="return false;" class="wa-form">
      <input type="hidden" id="wa-cf-id" value="${c.id || ''}">
      <label>Telefone (com DDD)${editando ? '' : ' *'}</label>
      <input type="text" id="wa-cf-phone" value="${_waEsc(c.phone || '')}" placeholder="Ex: 11999998888" ${editando ? 'readonly' : ''} inputmode="tel">
      <label>Nome</label>
      <input type="text" id="wa-cf-name" value="${_waEsc(c.name || '')}" placeholder="Nome do contato">
      <label>E-mail</label>
      <input type="email" id="wa-cf-email" value="${_waEsc(c.email || '')}" placeholder="email@exemplo.com">
      <label>Observações</label>
      <textarea id="wa-cf-notes" rows="3" placeholder="Notas internas sobre o contato">${_waEsc(c.notes || '')}</textarea>
      <div id="wa-cf-msg" class="wa-form-msg"></div>
    </form>`;
}
window.waNovoContato = function () {
  if (!_waPode('criar')) return;
  _waModal('Novo contato', _waFormContato(null),
    `<button class="mod-btn-secondary" onclick="waFecharModal()">Cancelar</button>
     <button class="mod-btn-primary" onclick="waSalvarContato()"><i class="fa-solid fa-check"></i> Salvar</button>`);
};
window.waEditarContato = function (id) {
  const c = _waContatos.find(x => x.id === id);
  if (!c) return;
  _waModal('Editar contato', _waFormContato(c),
    `<button class="mod-btn-secondary" onclick="waFecharModal()">Cancelar</button>
     <button class="mod-btn-primary" onclick="waSalvarContato()"><i class="fa-solid fa-check"></i> Salvar</button>`);
};
window.waSalvarContato = async function () {
  const g = id => document.getElementById(id);
  const idc = (g('wa-cf-id').value || '').trim();
  const phone = (g('wa-cf-phone').value || '').replace(/\D/g, '');
  const name = (g('wa-cf-name').value || '').trim();
  const email = (g('wa-cf-email').value || '').trim();
  const notes = (g('wa-cf-notes').value || '').trim();
  const msg = g('wa-cf-msg');
  if (!idc && phone.length < 10) { msg.textContent = 'Informe um telefone válido (com DDD).'; msg.className = 'wa-form-msg wa-err'; return; }
  let r;
  try {
    if (idc) r = await waSend('/contacts/' + idc, 'PUT', { name, email, notes });
    else     r = await waSend('/contacts', 'POST', { phone, name, email, notes });
  } catch (e) { msg.textContent = 'Erro: ' + e.message; msg.className = 'wa-form-msg wa-err'; return; }
  if (!r || !r.ok) { msg.textContent = (r && r.error) || 'Não foi possível salvar.'; msg.className = 'wa-form-msg wa-err'; return; }
  waFecharModal();
  _waCarregarContatos();
};

// ── Ver detalhes ─────────────────────────────────────────────────────────────
window.waVerContato = async function (id) {
  let c = _waContatos.find(x => x.id === id);
  try { const r = await waGet('/contacts/' + id); if (r && r.ok) c = r.contact; } catch (e) {}
  if (!c) return;
  const linha = (rot, val) => `<div class="wa-det-row"><span>${_waEsc(rot)}</span><b>${_waEsc(val || '—')}</b></div>`;
  const corpo =
    `<div class="wa-det">
       <div class="wa-det-avatar">${_waEsc(_waInicial(c.name || c.profile_name))}</div>
       <h4>${_waEsc(c.name || c.profile_name || 'Sem nome')}</h4>
       ${linha('Telefone', _waFmtTelefone(c.phone))}
       ${linha('E-mail', c.email)}
       ${linha('Origem', c.origin)}
       ${linha('Criado em', _waFmtData(c.created_at))}
       ${linha('Última interação', _waFmtData(c.last_interaction_at))}
       ${c.notes ? `<div class="wa-det-notes"><span>Observações</span><p>${_waEsc(c.notes)}</p></div>` : ''}
     </div>`;
  _waModal('Contato', corpo,
    _waPode('editar') ? `<button class="mod-btn-primary" onclick="waFecharModal();waEditarContato(${c.id})"><i class="fa-solid fa-pen"></i> Editar</button>` : '');
};

// ==========================================================================
// ETAPA 3 — INBOX / CENTRAL DE ATENDIMENTO
// ==========================================================================
let _waConversas = [];
let _waFiltroConv = '';          // '' todas | 'open' | 'unread' | 'closed'
let _waBuscaConv = '';
let _waBuscaConvTimer = null;
let _waConvAberta = null;        // conversa aberta no chat
let _waConvAbertaObj = null;
let _waModoNota = false;         // composer em modo "nota interna"
let _waSSE = null;
let _waMsgsCache = [];           // mensagens da conversa aberta (p/ append em tempo real)
let _waFiltroConta = '';         // '' = todas as contas | id = uma conta
let _waContasInbox = [];         // contas que o usuário pode ver (multi-conta)

const WA_STATUS_PT = { open: 'Aberta', pending: 'Pendente', waiting: 'Aguardando', closed: 'Fechada', archived: 'Arquivada' };
const WA_STATUS_COR = { open: '#059669', pending: '#d97706', waiting: '#0891b2', closed: '#94a3b8', archived: '#64748b' };

function _waRenderInbox(cont) {
  cont.innerHTML =
    `<div class="wa-inbox" id="wa-inbox">
       <aside class="wa-col-list">
         <div class="wa-conta-sel" id="wa-conta-sel"></div>
         <div class="wa-conv-filtros" id="wa-conv-filtros"></div>
         <div class="wa-search wa-search-conv">
           <i class="fa-solid fa-magnifying-glass"></i>
           <input type="text" id="wa-conv-busca" placeholder="Buscar conversa…" value="${_waEsc(_waBuscaConv)}" oninput="waBuscarConversas(this.value)">
         </div>
         <div class="wa-conv-list" id="wa-conv-list"><div class="wa-loading"><i class="fa-solid fa-spinner fa-spin"></i></div></div>
       </aside>
       <section class="wa-col-chat" id="wa-col-chat">
         <div class="wa-chat-vazio"><i class="fa-brands fa-whatsapp"></i><p>Selecione uma conversa para começar o atendimento.</p></div>
       </section>
       <aside class="wa-col-info" id="wa-col-info"></aside>
     </div>`;
  _waRenderFiltrosConv();
  _waCarregarContasInbox();
  _waCarregarConversas();
  _waConectarSSE();
}

// Seletor de conta (número oficial) no Inbox — multi-conta.
async function _waCarregarContasInbox() {
  try { const r = await waGet('/accounts'); _waContasInbox = (r && r.ok && r.accounts) || []; } catch (e) { _waContasInbox = []; }
  const sel = document.getElementById('wa-conta-sel');
  if (!sel) return;
  // Com 0 ou 1 conta não precisa de seletor (mostra só o nome quando houver 1).
  if (_waContasInbox.length <= 1) {
    sel.innerHTML = _waContasInbox.length === 1
      ? `<div class="wa-conta-unica"><i class="fa-brands fa-whatsapp"></i> ${_waEsc(_waContasInbox[0].business_name || _waContasInbox[0].display_phone || 'Número oficial')}</div>` : '';
    return;
  }
  sel.innerHTML =
    `<select id="wa-conta-filtro" onchange="waFiltroConta(this.value)">
       <option value="">Todas as contas</option>
       ${_waContasInbox.map(a => `<option value="${a.id}" ${String(a.id) === String(_waFiltroConta) ? 'selected' : ''}>${_waEsc(a.business_name || a.display_phone || ('Conta ' + a.id))}${a.ativo === 0 ? ' (inativa)' : ''}</option>`).join('')}
     </select>`;
}
window.waFiltroConta = function (id) { _waFiltroConta = id; _waCarregarConversas(); };

function _waRenderFiltrosConv() {
  const box = document.getElementById('wa-conv-filtros');
  if (!box) return;
  const fs = [['', 'Todas'], ['open', 'Abertas'], ['unread', 'Não lidas'], ['closed', 'Fechadas']];
  box.innerHTML = fs.map(([v, l]) => `<button class="wa-fchip ${v === _waFiltroConv ? 'active' : ''}" onclick="waFiltroConversa('${v}')">${l}</button>`).join('');
}
window.waFiltroConversa = function (v) { _waFiltroConv = v; _waRenderFiltrosConv(); _waCarregarConversas(); };
window.waBuscarConversas = function (v) { _waBuscaConv = v; clearTimeout(_waBuscaConvTimer); _waBuscaConvTimer = setTimeout(_waCarregarConversas, 300); };

async function _waCarregarConversas() {
  const box = document.getElementById('wa-conv-list');
  if (!box) return;
  let qs = '?limit=100';
  if (_waFiltroConv === 'open') qs += '&status=open';
  else if (_waFiltroConv === 'closed') qs += '&status=closed';
  else if (_waFiltroConv === 'unread') qs += '&unread_only=true';
  if (_waFiltroConta) qs += '&account_id=' + encodeURIComponent(_waFiltroConta);
  if (_waBuscaConv) qs += '&search=' + encodeURIComponent(_waBuscaConv);
  let r;
  try { r = await waGet('/conversations' + qs); }
  catch (e) { if (_waSubAba === 'inbox') box.innerHTML = _waErro(e.message); return; }
  if (_waSubAba !== 'inbox') return;
  if (!r || !r.ok) { box.innerHTML = _waErro((r && r.error) || 'Erro ao carregar conversas.'); return; }
  _waConversas = r.conversations || [];
  _waAtualizarBadge();
  if (!_waConversas.length) {
    box.innerHTML = `<div class="wa-empty" style="padding:32px 16px;"><i class="fa-solid fa-comments"></i><p>${_waBuscaConv || _waFiltroConv ? 'Nenhuma conversa nesse filtro.' : 'Nenhuma conversa ainda. Elas aparecem aqui quando alguém enviar mensagem para o número conectado.'}</p></div>`;
    return;
  }
  box.innerHTML = _waConversas.map(_waItemConversa).join('');
}

function _waItemConversa(c) {
  const nome = c.contact_name || c.contact_profile_name || _waFmtTelefone(c.contact_phone) || 'Sem nome';
  const cor = WA_STATUS_COR[c.status] || '#94a3b8';
  const naoLidas = c.unread_count > 0 ? `<span class="wa-unread">${c.unread_count > 9 ? '9+' : c.unread_count}</span>` : '';
  return `<div class="wa-conv-item ${c.id === _waConvAberta ? 'active' : ''}" onclick="waAbrirConversa(${c.id})">
    <span class="wa-avatar" style="background:${_waCorAvatar(nome)};">${_waEsc(_waInicial(nome))}</span>
    <div class="wa-conv-meio">
      <div class="wa-conv-topo"><b>${_waEsc(nome)}</b><span class="wa-conv-hora">${_waHora(c.last_message_at)}</span></div>
      <div class="wa-conv-baixo"><span class="wa-conv-prev">${_waEsc((c.last_message_text || '').slice(0, 42) || '—')}</span>${naoLidas}</div>
      <span class="wa-conv-status" style="color:${cor};">● ${WA_STATUS_PT[c.status] || c.status}${c.assigned_to_name ? ' · ' + _waEsc(c.assigned_to_name) : ''}</span>
    </div>
  </div>`;
}
function _waHora(iso) {
  if (!iso) return '';
  const norm = String(iso).replace(' ', 'T'); const d = new Date(norm.indexOf('Z') < 0 && norm.indexOf('+') < 0 ? norm + 'Z' : norm);
  if (isNaN(d)) return '';
  const hoje = new Date(); const p = n => String(n).padStart(2, '0');
  if (d.toDateString() === hoje.toDateString()) return `${p(d.getHours())}:${p(d.getMinutes())}`;
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}

// ── Abrir uma conversa ───────────────────────────────────────────────────────
window.waAbrirConversa = async function (id) {
  _waConvAberta = id;
  const chat = document.getElementById('wa-col-chat');
  const inbox = document.getElementById('wa-inbox');
  if (inbox) inbox.classList.add('wa-chat-aberto');   // mobile: mostra o chat
  if (chat) chat.innerHTML = '<div class="wa-loading" style="margin:auto;"><i class="fa-solid fa-spinner fa-spin"></i></div>';
  document.querySelectorAll('.wa-conv-item').forEach(el => el.classList.remove('active'));
  let r;
  try { r = await waGet('/conversations/' + id); } catch (e) { if (chat) chat.innerHTML = _waErro(e.message); return; }
  if (_waConvAberta !== id) return;
  if (!r || !r.ok) { if (chat) chat.innerHTML = _waErro((r && r.error) || 'Erro ao abrir a conversa.'); return; }
  _waConvAbertaObj = r.conversation;
  _waRenderChat(r.conversation, r.messages || []);
  _waRenderInfoConv(r.conversation);
  // zera não-lidas no item da lista
  const cItem = _waConversas.find(c => c.id === id); if (cItem) { cItem.unread_count = 0; }
  const li = [...document.querySelectorAll('.wa-conv-item')].find(el => el.getAttribute('onclick') === `waAbrirConversa(${id})`);
  if (li) li.classList.add('active');
  _waAtualizarBadge();
};

function _waRenderChat(conv, msgs) {
  _waMsgsCache = msgs || [];
  const chat = document.getElementById('wa-col-chat');
  if (!chat) return;
  const nome = conv.contact_name || conv.contact_profile_name || _waFmtTelefone(conv.contact_phone) || 'Sem nome';
  const podeCriar = _waPode('criar'), podeEditar = _waPode('editar');
  const fechada = (conv.status === 'closed' || conv.status === 'archived');
  chat.innerHTML =
    `<header class="wa-chat-head">
       <button class="wa-voltar" onclick="waVoltarLista()" title="Voltar"><i class="fa-solid fa-arrow-left"></i></button>
       <span class="wa-avatar" style="background:${_waCorAvatar(nome)};">${_waEsc(_waInicial(nome))}</span>
       <div class="wa-chat-head-info"><b>${_waEsc(nome)}</b><small>${_waEsc(_waFmtTelefone(conv.contact_phone))} · ${WA_STATUS_PT[conv.status] || conv.status}${(conv.account_name || conv.account_phone) ? ' · <span class="wa-via">via ' + _waEsc(conv.account_name || conv.account_phone) + '</span>' : ''}</small></div>
       <div class="wa-chat-head-acoes">
         ${conv.contact_id ? `<button class="wa-btn-mini wa-info-btn" title="Detalhes do contato" onclick="waVerContato(${conv.contact_id})"><i class="fa-solid fa-circle-info"></i></button>` : ''}
         ${podeEditar ? `<button class="wa-btn-mini" title="Atribuir atendente" onclick="waAtribuirConversa()"><i class="fa-solid fa-user-plus"></i></button>` : ''}
         ${podeEditar && !fechada ? `<button class="wa-btn-mini" title="Fechar conversa" onclick="waFecharConversa()"><i class="fa-solid fa-circle-check"></i></button>` : ''}
         ${podeEditar && fechada ? `<button class="wa-btn-mini" title="Reabrir conversa" onclick="waReabrirConversa()"><i class="fa-solid fa-rotate-left"></i></button>` : ''}
       </div>
     </header>
     <div class="wa-msgs" id="wa-msgs">${msgs.map(_waBolha).join('') || '<div class="wa-msgs-vazio">Sem mensagens ainda.</div>'}</div>
     <div class="wa-composer" id="wa-composer">
       ${podeCriar ? `
         <div class="wa-composer-modo">
           <button class="wa-modo-btn ${!_waModoNota ? 'active' : ''}" onclick="waSetModo(false)"><i class="fa-solid fa-paper-plane"></i> Resposta</button>
           <button class="wa-modo-btn wa-modo-nota ${_waModoNota ? 'active' : ''}" onclick="waSetModo(true)"><i class="fa-solid fa-note-sticky"></i> Nota interna</button>
         </div>
         <div class="wa-composer-linha">
           <button class="wa-anexo" title="Anexar mídia" onclick="document.getElementById('wa-file').click()" ${_waModoNota ? 'disabled' : ''}><i class="fa-solid fa-paperclip"></i></button>
           <button class="wa-anexo" title="Enviar template aprovado" onclick="waAbrirTemplatePicker()" ${_waModoNota ? 'disabled' : ''}><i class="fa-regular fa-file-lines"></i></button>
           <input type="file" id="wa-file" style="display:none" accept="image/*,application/pdf,video/*,audio/*" onchange="waAnexarMidia(this)">
           <textarea id="wa-msg-input" rows="1" placeholder="${_waModoNota ? 'Escreva uma nota interna (NÃO vai para o cliente)…' : 'Digite uma mensagem…'}" onkeydown="waComposerKey(event)" oninput="waComposerDigitou(this)"></textarea>
           <button class="wa-mic" id="wa-mic" onclick="waGravarAudio()" title="Gravar áudio (com anti-ruído)" ${_waModoNota ? 'disabled' : ''}><i class="fa-solid fa-microphone"></i></button>
           <button class="wa-enviar ${_waModoNota ? 'wa-enviar-nota' : ''}" id="wa-enviar" onclick="waEnviarMensagem()" style="display:${_waModoNota ? '' : 'none'};"><i class="fa-solid fa-paper-plane"></i></button>
         </div>
         ${_waModoNota ? '<div class="wa-nota-aviso"><i class="fa-solid fa-lock"></i> Nota interna: só a equipe vê, o cliente NUNCA recebe.</div>' : ''}
       ` : '<div class="wa-composer-somente">Você não tem permissão para enviar mensagens.</div>'}
     </div>`;
  _waScrollFim();
}

function _waBolha(m) {
  if (m.is_internal_note || m.status === 'note') {
    return `<div class="wa-msg wa-msg-nota"><div class="wa-bolha"><div class="wa-nota-tag"><i class="fa-solid fa-note-sticky"></i> Nota interna · ${_waEsc(m.sender_name || '')}</div>${_waEsc(m.content)}<span class="wa-msg-hora">${_waHora(m.created_at)}</span></div></div>`;
  }
  const saida = m.direction === 'outgoing';
  let corpo = '';
  if (m.type === 'image' && m.media_url) corpo = `<img class="wa-msg-img" src="${_waEsc(m.media_url)}" alt="imagem">${m.content ? '<div>' + _waEsc(m.content) + '</div>' : ''}`;
  else if (m.type === 'audio' && m.media_url) corpo = _waPlayerAudio(m);
  else if ((m.type === 'document' || m.type === 'video') && m.media_url) corpo = `<a class="wa-msg-doc" href="${_waEsc(m.media_url)}" target="_blank"><i class="fa-solid fa-file-arrow-down"></i> ${_waEsc(m.media_filename || m.type)}</a>${m.content ? '<div>' + _waEsc(m.content) + '</div>' : ''}`;
  else corpo = _waEsc(m.content || '');
  return `<div class="wa-msg ${saida ? 'wa-msg-out' : 'wa-msg-in'}">
    <div class="wa-bolha">${corpo}<span class="wa-msg-hora">${_waHora(m.created_at)} ${saida ? _waTick(m.status) : ''}</span></div>
  </div>`;
}
function _waTick(status) {
  if (status === 'read') return '<i class="fa-solid fa-check-double" style="color:#38bdf8;"></i>';
  if (status === 'delivered') return '<i class="fa-solid fa-check-double"></i>';
  if (status === 'failed') return '<i class="fa-solid fa-triangle-exclamation" style="color:#fca5a5;"></i>';
  if (status === 'sent') return '<i class="fa-solid fa-check"></i>';
  return '<i class="fa-regular fa-clock"></i>';
}
function _waScrollFim() { const m = document.getElementById('wa-msgs'); if (m) m.scrollTop = m.scrollHeight; }

window.waVoltarLista = function () { const i = document.getElementById('wa-inbox'); if (i) i.classList.remove('wa-chat-aberto'); _waConvAberta = null; };
window.waSetModo = function (nota) { _waModoNota = !!nota; if (_waConvAbertaObj) _waRenderChat(_waConvAbertaObj, _waMsgsCache || []); };
window.waComposerKey = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); waEnviarMensagem(); } };
// Como no WhatsApp: campo vazio oferece o microfone; começou a digitar, vira
// o botão de enviar. (No modo nota o áudio fica desligado — nota é texto
// interno, áudio iria para o cliente.)
window.waComposerDigitou = function (inp) {
  const mic = document.getElementById('wa-mic');
  const env = document.getElementById('wa-enviar');
  if (!mic || !env) return;
  const temTexto = !!(inp.value || '').trim();
  if (_waModoNota) { mic.style.display = 'none'; env.style.display = ''; return; }
  mic.style.display = temTexto ? 'none' : '';
  env.style.display = temTexto ? '' : 'none';
};

window.waEnviarMensagem = async function () {
  if (!_waConvAberta || !_waPode('criar')) return;
  const inp = document.getElementById('wa-msg-input');
  const texto = (inp && inp.value || '').trim();
  if (!texto) return;
  inp.value = '';
  if (_waModoNota) {
    const r = await waSend('/conversations/' + _waConvAberta + '/notes', 'POST', { content: texto });
    if (r && r.ok) { _waMsgsCache.push({ is_internal_note: true, content: texto, sender_name: (loggedUser && (loggedUser.nomeExibicao || loggedUser.nome)) || '', created_at: new Date().toISOString() }); _waAppendBolha(_waMsgsCache[_waMsgsCache.length - 1]); }
    return;
  }
  const r = await waSend('/messages/send', 'POST', { conversation_id: _waConvAberta, type: 'text', content: texto });
  if (r && r.ok) {
    const nova = { direction: 'outgoing', type: 'text', content: texto, status: 'sent', created_at: new Date().toISOString() };
    _waMsgsCache.push(nova); _waAppendBolha(nova);
    _waCarregarConversas();
  } else {
    _waAppendBolha({ direction: 'outgoing', type: 'text', content: texto, status: 'failed', created_at: new Date().toISOString() });
    _waToast((r && r.error) || 'Falha ao enviar. Verifique se o número está conectado à Meta.', true);
  }
};
function _waAppendBolha(m) { const box = document.getElementById('wa-msgs'); if (!box) return; const vazio = box.querySelector('.wa-msgs-vazio'); if (vazio) vazio.remove(); box.insertAdjacentHTML('beforeend', _waBolha(m)); _waScrollFim(); }

window.waAnexarMidia = async function (input) {
  const file = input.files && input.files[0]; input.value = '';
  if (!file || !_waConvAberta) return;
  if (file.size > 16 * 1024 * 1024) { _waToast('Arquivo muito grande (máx. 16 MB).', true); return; }
  _waToast('Enviando mídia…');
  const dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
  const up = await waSend('/media/upload', 'POST', { dataUrl });
  if (!up || !up.ok) { _waToast('Falha no upload da mídia.', true); return; }
  const tipo = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'document';
  const r = await waSend('/messages/send', 'POST', { conversation_id: _waConvAberta, type: tipo, media_url: up.url, media_mime_type: up.mime_type, filename: file.name });
  if (r && r.ok) { const nova = { direction: 'outgoing', type: tipo, media_url: up.url, media_filename: file.name, content: '', status: 'sent', created_at: new Date().toISOString() }; _waMsgsCache.push(nova); _waAppendBolha(nova); }
  else _waToast((r && r.error) || 'Falha ao enviar mídia. Número conectado?', true);
};

// ── Ações da conversa ────────────────────────────────────────────────────────
window.waFecharConversa = async function () {
  if (!_waConvAberta) return;
  const r = await waSend('/conversations/' + _waConvAberta + '/close', 'POST', {});
  if (r && r.ok) { _waToast('Conversa fechada.'); waAbrirConversa(_waConvAberta); _waCarregarConversas(); }
};
window.waReabrirConversa = async function () {
  if (!_waConvAberta) return;
  const r = await waSend('/conversations/' + _waConvAberta + '/reopen', 'POST', {});
  if (r && r.ok) { _waToast('Conversa reaberta.'); waAbrirConversa(_waConvAberta); _waCarregarConversas(); }
};
window.waAtribuirConversa = function () {
  if (!_waConvAberta) return;
  const funcs = (typeof state !== 'undefined' && state.funcionarios ? state.funcionarios : []).filter(f => f.status === 'ativo');
  const opts = funcs.map(f => `<option value="${_waEsc(f.login)}" data-nome="${_waEsc(f.nomeExibicao || f.nome)}">${_waEsc(f.nomeExibicao || f.nome)} (${_waEsc(f.login)})</option>`).join('');
  _waModal('Atribuir atendente',
    `<div class="wa-form"><label>Atendente responsável</label>
       <select id="wa-assign-sel"><option value="">— Ninguém (fila) —</option>${opts}</select></div>`,
    `<button class="mod-btn-secondary" onclick="waFecharModal()">Cancelar</button>
     <button class="mod-btn-primary" onclick="waConfirmarAtribuir()">Atribuir</button>`);
};
window.waConfirmarAtribuir = async function () {
  const sel = document.getElementById('wa-assign-sel');
  const login = sel ? sel.value : '';
  const nome = sel && sel.selectedOptions[0] ? (sel.selectedOptions[0].getAttribute('data-nome') || '') : '';
  const r = await waSend('/conversations/' + _waConvAberta + '/assign', 'POST', { assigned_to: login, assigned_to_name: nome });
  waFecharModal();
  if (r && r.ok) { _waToast('Conversa atribuída.'); if (_waConvAbertaObj) { _waConvAbertaObj.assigned_to = login; _waConvAbertaObj.assigned_to_name = nome; } waAbrirConversa(_waConvAberta); _waCarregarConversas(); }
};

// ── Painel de informações do contato ─────────────────────────────────────────
function _waRenderInfoConv(conv) {
  const box = document.getElementById('wa-col-info');
  if (!box) return;
  const nome = conv.contact_name || conv.contact_profile_name || 'Sem nome';
  box.innerHTML =
    `<div class="wa-info-card">
       <div class="wa-det-avatar" style="margin:0 auto 8px;">${_waEsc(_waInicial(nome))}</div>
       <h4 style="text-align:center;margin:0 0 12px;">${_waEsc(nome)}</h4>
       <div class="wa-det-row"><span>Telefone</span><b>${_waEsc(_waFmtTelefone(conv.contact_phone))}</b></div>
       <div class="wa-det-row"><span>Status</span><b style="color:${WA_STATUS_COR[conv.status] || '#64748b'};">${WA_STATUS_PT[conv.status] || conv.status}</b></div>
       <div class="wa-det-row"><span>Atendente</span><b>${_waEsc(conv.assigned_to_name || '—')}</b></div>
       <div class="wa-det-row"><span>Aberta em</span><b>${_waFmtData(conv.created_at)}</b></div>
       ${conv.contact_id ? `<button class="mod-btn-secondary" style="width:100%;margin-top:12px;" onclick="waVerContato(${conv.contact_id})"><i class="fa-solid fa-address-card"></i> Ficha do contato</button>` : ''}
     </div>`;
}

// ── SSE (tempo real) ─────────────────────────────────────────────────────────
function _waConectarSSE() {
  if (_waSSE && _waSSE.readyState !== 2) return;   // já conectado
  try {
    _waSSE = new EventSource('/api/whatsapp/events');
    _waSSE.onmessage = function (ev) {
      let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (d.type === 'new_message') {
        if (d.conversation_id === _waConvAberta && d.message) { _waMsgsCache.push(d.message); _waAppendBolha(d.message); }
        if (_waSubAba === 'inbox') _waCarregarConversas();
      } else if (d.type === 'message_status') {
        if (d.conversation_id === _waConvAberta && _waSubAba === 'inbox') waAbrirConversa(_waConvAberta);
      } else if (d.type === 'conversation_updated') {
        if (_waSubAba === 'inbox') _waCarregarConversas();
      }
    };
    _waSSE.onerror = function () { /* EventSource reconecta sozinho */ };
  } catch (e) { /* navegador sem SSE: cai no polling manual (botão atualizar) */ }
}

// ── Badge de não-lidas no menu lateral ───────────────────────────────────────
function _waAtualizarBadge() {
  const b = document.getElementById('wa-nav-badge');
  if (!b) return;
  const n = _waConversas.reduce((s, c) => s + (c.unread_count > 0 ? 1 : 0), 0);
  if (n > 0) { b.textContent = n > 9 ? '9+' : String(n); b.style.display = ''; }
  else { b.style.display = 'none'; }
}

// ── Toast simples ────────────────────────────────────────────────────────────
function _waToast(msg, erro) {
  let t = document.getElementById('wa-toast');
  if (!t) { t = document.createElement('div'); t.id = 'wa-toast'; t.className = 'wa-toast'; document.body.appendChild(t); }
  t.textContent = msg; t.className = 'wa-toast show' + (erro ? ' wa-toast-err' : '');
  clearTimeout(t._timer); t._timer = setTimeout(() => { t.className = 'wa-toast'; }, 3200);
}

// ==========================================================================
// ETAPA 4 — TEMPLATES + CONEXÃO COM A META
// ==========================================================================
let _waTemplates = [];
let _waContas = [];

function _waTplAprovado(t) { return String(t.status || '').toLowerCase() === 'approved'; }
function _waTplBadge(status) {
  const s = String(status || '').toLowerCase();
  const map = { approved: ['#059669', 'Aprovado'], pending: ['#d97706', 'Pendente'], rejected: ['#dc2626', 'Rejeitado'], paused: ['#64748b', 'Pausado'] };
  const x = map[s] || ['#64748b', status || '—'];
  return `<span class="wa-tpl-badge" style="background:${x[0]}1a;color:${x[0]};">${_waEsc(x[1])}</span>`;
}

async function _waRenderTemplates(cont) {
  const podeAdmin = _waPode('aprovar');
  cont.innerHTML =
    `<div class="wa-toolbar">
       <div style="flex:1;font-size:12.5px;color:var(--text-secondary,#64748b);">Modelos de mensagem aprovados pela Meta. Só é possível <b>enviar</b> os que estão <b>Aprovados</b>.</div>
       ${podeAdmin ? `<button class="mod-btn-secondary" onclick="waAbrirAuditoria()"><i class="fa-solid fa-clipboard-list"></i> Auditoria</button>
                      <button class="mod-btn-secondary" onclick="waTrocarSubAba('conexoes')"><i class="fa-solid fa-plug"></i> Conexões</button>
                      <button class="mod-btn-primary" onclick="waSincronizarTemplates()"><i class="fa-solid fa-rotate"></i> Sincronizar templates</button>` : ''}
     </div>
     <div id="wa-tpl-lista"><div class="wa-loading"><i class="fa-solid fa-spinner fa-spin"></i></div></div>`;
  let r;
  try { r = await waGet('/templates'); } catch (e) { document.getElementById('wa-tpl-lista').innerHTML = _waErro(e.message); return; }
  if (_waSubAba !== 'templates') return;
  _waTemplates = (r && r.ok && r.templates) || [];
  _waRenderListaTemplates();
}
function _waRenderListaTemplates() {
  const box = document.getElementById('wa-tpl-lista'); if (!box) return;
  if (!_waTemplates.length) {
    box.innerHTML = `<div class="wa-empty"><i class="fa-solid fa-file-lines"></i><p>Nenhum template ainda. Clique em <b>Sincronizar templates</b> para trazer os modelos aprovados na sua conta da Meta.</p></div>`;
    return;
  }
  box.innerHTML =
    `<div class="wa-count">${_waTemplates.length} template(s)</div>
     <div class="wa-table-wrap"><table class="wa-table">
       <thead><tr><th>Nome</th><th>Idioma</th><th>Categoria</th><th>Status</th></tr></thead>
       <tbody>${_waTemplates.map(t => `<tr>
         <td><b>${_waEsc(t.name)}</b></td>
         <td>${_waEsc(t.language || '—')}</td>
         <td><span class="wa-chip">${_waEsc(t.category || '—')}</span></td>
         <td>${_waTplBadge(t.status)}</td>
       </tr>`).join('')}</tbody>
     </table></div>`;
}

async function _waCarregarContas() {
  try { const r = await waGet('/accounts'); _waContas = (r && r.ok && r.accounts) || []; } catch (e) { _waContas = []; }
  return _waContas;
}

window.waSincronizarTemplates = async function () {
  if (!_waPode('aprovar')) return;
  await _waCarregarContas();
  const conta = _waContas.find(c => c.waba_id && c.has_token) || _waContas.find(c => c.waba_id);
  if (!conta) { _waToast('Configure a conexão com a Meta (WABA ID + Access Token) antes de sincronizar.', true); waConfigurarConexao(); return; }
  _waToast('Sincronizando com a Meta…');
  const r = await waSend('/templates/sync', 'POST', { account_id: conta.id });
  if (r && r.ok) { _waToast(`${r.count} template(s) sincronizado(s).`); _waRenderTemplates(document.getElementById('wa-content')); }
  else _waToast((r && r.error) || 'Falha ao sincronizar (verifique o Access Token e o WABA ID).', true);
};

// ── Autopreenchimento do navegador: fora daqui ───────────────────────────────
// Como estes formulários têm um campo de senha (o Access Token), o Chrome os
// confunde com uma tela de login e joga o USUÁRIO salvo dele no campo de texto
// mais próximo e a SENHA salva no token. Já aconteceu: apareceu um login de
// Facebook dentro do "Phone Number ID".
//
// O que resolve:
//   • autocomplete="new-password" no token — o Chrome entende "senha nova" e
//     para de oferecer as guardadas (e, sem senha para preencher, também para
//     de preencher o usuário nos campos de cima);
//   • autocomplete="off" + sem atributo name nos demais, para não virarem
//     candidatos de preenchimento nem serem gravados;
//   • data-lpignore / data-form-type, para LastPass, 1Password e Dashlane.
const _WA_SEM_AUTO = 'autocomplete="off" data-lpignore="true" data-form-type="other" data-1p-ignore';
const _WA_SEM_SENHA = 'autocomplete="new-password" data-lpignore="true" data-form-type="other" data-1p-ignore';

// ── Conexão com a Meta (conta) — admin ───────────────────────────────────────
window.waConfigurarConexao = async function () {
  if (!_waPode('aprovar')) return;
  await _waCarregarContas();
  const c = _waContas[0] || {};
  _waModal('Conexão com a Meta (WhatsApp Business)',
    `<div class="wa-form" autocomplete="off">
       <p style="font-size:12px;color:var(--text-secondary,#64748b);margin:0 0 8px;">Estes dados vêm do painel <b>Meta for Developers</b>. O Access Token fica só no servidor — nunca no navegador de quem atende.</p>
       <input type="hidden" id="wa-ac-id" value="${c.id || ''}">
       <label>Nome do número (referência)</label>
       <input type="text" id="wa-ac-display" ${_WA_SEM_AUTO} value="${_waEsc(c.display_phone || '')}" placeholder="Ex: Atendimento R&T">
       <label>Phone Number ID</label>
       <input type="text" id="wa-ac-pnid" ${_WA_SEM_AUTO} value="${_waEsc(c.phone_number_id || '')}" placeholder="ID do número (Meta)">
       <label>WhatsApp Business Account ID (WABA)</label>
       <input type="text" id="wa-ac-waba" ${_WA_SEM_AUTO} value="${_waEsc(c.waba_id || '')}" placeholder="ID da conta comercial">
       <label>Access Token (permanente)</label>
       <input type="password" id="wa-ac-token" ${_WA_SEM_SENHA} value="" placeholder="${c.has_token ? '•••••• (já configurado — deixe vazio p/ manter)' : 'Cole o token aqui'}">
       ${c.has_token ? '<small style="color:#059669;font-size:11px;"><i class="fa-solid fa-lock"></i> Token já configurado e guardado no servidor. Deixe vazio para manter o atual.</small>' : ''}
       <div id="wa-ac-msg" class="wa-form-msg"></div>
     </div>`,
    `<button class="mod-btn-secondary" onclick="waFecharModal()">Cancelar</button>
     ${c.id ? `<button class="mod-btn-secondary" onclick="waTestarConexao(${c.id})"><i class="fa-solid fa-plug-circle-check"></i> Testar</button>` : ''}
     <button class="mod-btn-primary" onclick="waSalvarConexao()"><i class="fa-solid fa-check"></i> Salvar</button>`);
};
window.waSalvarConexao = async function () {
  const g = id => document.getElementById(id);
  const dados = {
    display_phone: g('wa-ac-display').value.trim(),
    phone_number_id: g('wa-ac-pnid').value.trim(),
    waba_id: g('wa-ac-waba').value.trim(),
  };
  const token = g('wa-ac-token').value.trim();
  if (token) dados.access_token = token;
  const id = g('wa-ac-id').value.trim();
  const msg = g('wa-ac-msg');
  if (!dados.phone_number_id) { msg.textContent = 'Informe o Phone Number ID.'; msg.className = 'wa-form-msg wa-err'; return; }
  const r = id ? await waSend('/accounts/' + id, 'PUT', dados) : await waSend('/accounts', 'POST', dados);
  if (r && r.ok) { waFecharModal(); _waToast('Conexão salva.'); }
  else { msg.textContent = (r && r.error) || 'Não foi possível salvar.'; msg.className = 'wa-form-msg wa-err'; }
};
window.waTestarConexao = async function (id) {
  const msg = document.getElementById('wa-ac-msg');
  if (msg) { msg.textContent = 'Testando conexão com a Meta…'; msg.className = 'wa-form-msg'; }
  const r = await waGet('/accounts/' + id + '/status');
  if (!msg) return;
  if (r && r.ok && r.status === 'connected') { msg.textContent = '✓ Conectado à Meta com sucesso.'; msg.className = 'wa-form-msg'; msg.style.color = '#059669'; }
  else { msg.textContent = '✗ ' + ((r && (r.message || r.error)) || 'Não conectou. Confira o token.'); msg.className = 'wa-form-msg wa-err'; }
};

// ── Enviar template a partir do chat (só aprovados) ──────────────────────────
window.waAbrirTemplatePicker = async function () {
  if (!_waConvAberta || !_waPode('criar')) return;
  let lista = _waTemplates;
  if (!lista.length) { try { const r = await waGet('/templates'); lista = (r && r.ok && r.templates) || []; _waTemplates = lista; } catch (e) {} }
  const aprovados = lista.filter(_waTplAprovado);
  const corpo = aprovados.length
    ? `<div class="wa-tpl-pick">${aprovados.map(t => `
         <button class="wa-tpl-opt" onclick="waEnviarTemplate('${_waEsc(t.name)}','${_waEsc(t.language)}')">
           <b>${_waEsc(t.name)}</b><small>${_waEsc(t.language)} · ${_waEsc(t.category || '')}</small>
         </button>`).join('')}</div>`
    : `<div class="wa-empty" style="padding:24px;"><i class="fa-solid fa-file-circle-xmark"></i><p>Nenhum template <b>aprovado</b> disponível. Sincronize os templates na aba <b>Templates</b>.</p></div>`;
  _waModal('Enviar template aprovado', corpo,
    `<button class="mod-btn-secondary" onclick="waFecharModal()">Fechar</button>`);
};
window.waEnviarTemplate = async function (name, language) {
  const t = _waTemplates.find(x => x.name === name && String(x.language) === String(language));
  if (!t || !_waTplAprovado(t)) { _waToast('Só é possível enviar templates aprovados pela Meta.', true); return; }
  waFecharModal();
  const r = await waSend('/messages/send', 'POST', { conversation_id: _waConvAberta, type: 'template', template_name: name, template_language: language, template_components: [] });
  if (r && r.ok) { const nova = { direction: 'outgoing', type: 'text', content: '📋 Template: ' + name, status: 'sent', created_at: new Date().toISOString() }; _waMsgsCache.push(nova); _waAppendBolha(nova); }
  else _waToast((r && r.error) || 'Falha ao enviar template (número conectado?).', true);
};

// ── Auditoria (admin) — quem fez o quê ───────────────────────────────────────
window.waAbrirAuditoria = async function () {
  if (!_waPode('aprovar')) return;
  _waModal('Auditoria do WhatsApp', '<div class="wa-loading"><i class="fa-solid fa-spinner fa-spin"></i> Carregando…</div>', `<button class="mod-btn-secondary" onclick="waFecharModal()">Fechar</button>`);
  let r; try { r = await waGet('/audit-logs?limit=100'); } catch (e) { r = null; }
  const body = document.querySelector('#wa-modal-overlay .wa-modal-body');
  if (!body) return;
  const logs = (r && r.ok && r.logs) || [];
  body.innerHTML = logs.length
    ? `<div class="wa-table-wrap" style="max-height:60vh;overflow:auto;"><table class="wa-table">
         <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th></tr></thead>
         <tbody>${logs.map(l => `<tr>
           <td style="white-space:nowrap;font-size:11px;">${_waFmtData(l.created_at)}</td>
           <td>${_waEsc(l.user_name || l.user_login || '—')}</td>
           <td>${_waEsc(l.action || '')}</td>
           <td style="font-size:11.5px;color:var(--text-secondary,#64748b);">${_waEsc(l.details || '')}</td>
         </tr>`).join('')}</tbody></table></div>`
    : `<div class="wa-empty" style="padding:24px;"><i class="fa-solid fa-clipboard-list"></i><p>Nenhum registro de auditoria ainda.</p></div>`;
};

// ==========================================================================
// CONEXÕES (múltiplos números oficiais) — admin
// ==========================================================================
let _waConexoes = [];

async function _waRenderConexoes(cont) {
  if (!_waPode('aprovar')) { cont.innerHTML = _waErro('Só o administrador gerencia as conexões.'); return; }
  cont.innerHTML =
    `<div class="wa-toolbar">
       <div style="flex:1;font-size:12.5px;color:var(--text-secondary,#64748b);">Números oficiais conectados via <b>WhatsApp Business Cloud API (Meta)</b>. Cada conexão pode ter um funcionário responsável.</div>
       <button class="mod-btn-primary" onclick="waNovaConexao()"><i class="fa-solid fa-plus"></i> Nova conexão</button>
     </div>
     <div id="wa-conex-lista"><div class="wa-loading"><i class="fa-solid fa-spinner fa-spin"></i></div></div>`;
  await _waCarregarConexoes();
}

async function _waCarregarConexoes() {
  const box = document.getElementById('wa-conex-lista'); if (!box) return;
  let r; try { r = await waGet('/accounts'); } catch (e) { box.innerHTML = _waErro(e.message); return; }
  if (_waSubAba !== 'conexoes') return;
  _waConexoes = (r && r.ok && r.accounts) || [];
  if (!_waConexoes.length) {
    box.innerHTML = `<div class="wa-empty"><i class="fa-solid fa-plug"></i><p>Nenhuma conexão ainda. Clique em <b>Nova conexão</b> para cadastrar o primeiro número oficial.</p></div>`;
    return;
  }
  const statusCor = { connected: '#059669', active: '#059669', pendente: '#d97706', error: '#dc2626' };
  box.innerHTML = `<div class="wa-conex-grid">${_waConexoes.map(c => {
    const cor = statusCor[c.status] || '#64748b';
    return `<div class="wa-conex-card ${c.ativo === 0 ? 'wa-conex-off' : ''}">
      <div class="wa-conex-top">
        <div><b>${_waEsc(c.business_name || 'Sem nome')}</b><div class="wa-conex-num"><i class="fa-brands fa-whatsapp"></i> ${_waEsc(_waFmtTelefone(c.display_phone) || '—')}</div></div>
        <span class="wa-conex-status" style="color:${cor};background:${cor}1a;">${_waEsc(c.status || 'pendente')}</span>
      </div>
      <div class="wa-conex-linha"><span>Tipo</span><b>API Oficial</b></div>
      <div class="wa-conex-linha"><span>Responsável</span><b>${_waEsc(c.responsavel_nome || '— (ninguém)')}</b></div>
      <div class="wa-conex-linha"><span>Access Token</span><b>${c.has_token ? '✓ configurado' : '<span style="color:#d97706;">falta</span>'}</b></div>
      <div class="wa-conex-linha"><span>Última sync</span><b>${c.last_sync_at ? _waFmtData(c.last_sync_at) : '—'}</b></div>
      <div class="wa-conex-linha"><span>Ativa</span><b>${c.ativo === 0 ? '<span style="color:#dc2626;">Não</span>' : 'Sim'}</b></div>
      ${c.last_error ? `<div class="wa-conex-erro"><i class="fa-solid fa-triangle-exclamation"></i> ${_waEsc(c.last_error)}</div>` : ''}
      <div class="wa-conex-acoes">
        <button class="mod-btn-secondary" onclick="waEditarConexao(${c.id})"><i class="fa-solid fa-pen"></i> Editar</button>
        <button class="mod-btn-secondary" onclick="waTestarConexaoCard(${c.id})"><i class="fa-solid fa-plug-circle-check"></i> Testar</button>
        <button class="mod-btn-secondary" onclick="waToggleConexao(${c.id},${c.ativo === 0 ? 1 : 0})">${c.ativo === 0 ? '<i class="fa-solid fa-toggle-on"></i> Ativar' : '<i class="fa-solid fa-toggle-off"></i> Desativar'}</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function _waFuncionariosAtivos() {
  return (typeof state !== 'undefined' && state.funcionarios ? state.funcionarios : []).filter(f => f.status === 'ativo');
}
function _waFormConexao(c) {
  c = c || {};
  const editando = !!c.id;
  const funcs = _waFuncionariosAtivos();
  const opts = funcs.map(f => `<option value="${_waEsc(f.login)}" data-nome="${_waEsc(f.nomeExibicao || f.nome)}" ${c.responsavel_login === f.login ? 'selected' : ''}>${_waEsc(f.nomeExibicao || f.nome)} (${_waEsc(f.login)})</option>`).join('');
  return `
    <form onsubmit="return false;" class="wa-form" autocomplete="off">
      <input type="hidden" id="wa-cx-id" value="${c.id || ''}">
      <label>Nome interno da conexão</label>
      <input type="text" id="wa-cx-nome" ${_WA_SEM_AUTO} value="${_waEsc(c.business_name || '')}" placeholder="Ex: RT Recrutamento 01">
      <label>Número (para exibição)</label>
      <input type="text" id="wa-cx-num" ${_WA_SEM_AUTO} value="${_waEsc(c.display_phone || '')}" placeholder="Ex: 5511999998888">
      <label>Phone Number ID (Meta)</label>
      <input type="text" id="wa-cx-pnid" ${_WA_SEM_AUTO} value="${_waEsc(c.phone_number_id || '')}" placeholder="ID do número">
      <label>WABA ID (WhatsApp Business Account)</label>
      <input type="text" id="wa-cx-waba" ${_WA_SEM_AUTO} value="${_waEsc(c.waba_id || '')}" placeholder="ID da conta comercial">
      <label>Access Token (permanente)</label>
      <input type="password" id="wa-cx-token" ${_WA_SEM_SENHA} value="" placeholder="${c.has_token ? '•••••• (já configurado — vazio mantém)' : 'Cole o token aqui'}">
      <label>Funcionário responsável</label>
      <select id="wa-cx-resp"><option value="">— Ninguém —</option>${opts}</select>
      <label style="display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer;">
        <input type="checkbox" id="wa-cx-ativo" ${c.ativo === 0 ? '' : 'checked'}> Conexão ativa
      </label>
      <div id="wa-cx-msg" class="wa-form-msg"></div>
    </form>`;
}
window.waNovaConexao = function () {
  if (!_waPode('aprovar')) return;
  _waModal('Nova conexão', _waFormConexao(null),
    `<button class="mod-btn-secondary" onclick="waFecharModal()">Cancelar</button>
     <button class="mod-btn-primary" onclick="waSalvarConexaoForm()"><i class="fa-solid fa-check"></i> Salvar</button>`);
};
window.waEditarConexao = function (id) {
  const c = _waConexoes.find(x => x.id === id); if (!c) return;
  _waModal('Editar conexão', _waFormConexao(c),
    `<button class="mod-btn-secondary" onclick="waFecharModal()">Cancelar</button>
     <button class="mod-btn-secondary" onclick="waTestarConexao(${id})"><i class="fa-solid fa-plug-circle-check"></i> Testar</button>
     <button class="mod-btn-primary" onclick="waSalvarConexaoForm()"><i class="fa-solid fa-check"></i> Salvar</button>`);
};
window.waSalvarConexaoForm = async function () {
  const g = id => document.getElementById(id);
  const id = g('wa-cx-id').value.trim();
  const resp = g('wa-cx-resp');
  const dados = {
    business_name: g('wa-cx-nome').value.trim(),
    display_phone: g('wa-cx-num').value.replace(/\D/g, ''),
    phone_number_id: g('wa-cx-pnid').value.trim(),
    waba_id: g('wa-cx-waba').value.trim(),
    responsavel_login: resp.value,
    responsavel_nome: resp.selectedOptions[0] ? (resp.selectedOptions[0].getAttribute('data-nome') || '') : '',
    ativo: g('wa-cx-ativo').checked
  };
  const token = g('wa-cx-token').value.trim();
  if (token) dados.access_token = token;
  const msg = g('wa-cx-msg');
  if (!dados.phone_number_id) { msg.textContent = 'Informe o Phone Number ID.'; msg.className = 'wa-form-msg wa-err'; return; }
  const r = id ? await waSend('/accounts/' + id, 'PUT', dados) : await waSend('/accounts', 'POST', dados);
  if (r && r.ok) { waFecharModal(); _waToast('Conexão salva.'); _waCarregarConexoes(); }
  else { msg.textContent = (r && r.error) || 'Não foi possível salvar.'; msg.className = 'wa-form-msg wa-err'; }
};
window.waToggleConexao = async function (id, ativo) {
  const r = await waSend('/accounts/' + id, 'PUT', { ativo: !!ativo });
  if (r && r.ok) { _waToast(ativo ? 'Conexão ativada.' : 'Conexão desativada.'); _waCarregarConexoes(); }
  else _waToast('Não foi possível alterar.', true);
};
window.waTestarConexaoCard = async function (id) {
  _waToast('Testando conexão com a Meta…');
  const r = await waGet('/accounts/' + id + '/status');
  if (r && r.ok && r.status === 'connected') _waToast('✓ Conectado à Meta.');
  else _waToast('✗ ' + ((r && (r.message || r.error)) || 'Não conectou. Confira o token.'), true);
  _waCarregarConexoes();
};
// Atalho usado pela sincronização de templates quando não há conta configurada.
window.waConfigurarConexao = function () { waTrocarSubAba('conexoes'); setTimeout(waNovaConexao, 150); };


// ══════════════════════════════════════════════════════════════════════════
// ÁUDIO — gravar e ouvir mensagens de voz, como no WhatsApp Web
// --------------------------------------------------------------------------
// GRAVAÇÃO: microfone com o anti-ruído do próprio Chrome ligado
// (noiseSuppression + echoCancellation + autoGainControl). É o mesmo filtro
// que o Meet usa: segura ventilador, teclado e eco, e deixa a voz passar.
//
// FORMATO: a Meta só aceita alguns tipos de áudio. O navegador grava no
// melhor que ele tiver, nesta ordem:
//   1. audio/ogg (opus)  — o formato nativo de voz do WhatsApp (Firefox)
//   2. audio/mp4 (AAC)   — Chrome e Safari
// Se o navegador não tiver nenhum dos dois, o botão explica em vez de gravar
// um formato que a Meta recusaria depois.
// ══════════════════════════════════════════════════════════════════════════

let _waGravador = null;        // MediaRecorder ativo
let _waGravStream = null;      // stream do microfone (para desligar a luzinha)
let _waGravPedacos = [];
let _waGravTimer = null;
let _waGravInicio = 0;
let _waGravCancelado = false;

function _waMimeGravacao() {
  if (typeof MediaRecorder === 'undefined') return null;
  const tipos = ['audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm;codecs=opus'];
  for (const t of tipos) { if (MediaRecorder.isTypeSupported(t)) return t; }
  return null;
}

// webm gravaria, mas a Meta recusa. Só aceitamos o que chega do outro lado.
function _waMimeAceitoPelaMeta(mime) {
  return /^audio\/(ogg|mp4)/.test(String(mime || ''));
}

window.waGravarAudio = async function () {
  if (!_waConvAberta || !_waPode('criar') || _waModoNota) return;
  const mime = _waMimeGravacao();
  if (!mime || !_waMimeAceitoPelaMeta(mime)) {
    _waToast('Este navegador não grava num formato que o WhatsApp aceite. Use o Chrome atualizado.', true);
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // O anti-ruído: foca na voz e corta o resto. É filtro do navegador,
        // roda na hora, sem mandar o áudio para lugar nenhum.
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
        channelCount: 1          // voz é mono; a Meta prefere assim
      }
    });
  } catch (e) {
    _waToast(e && e.name === 'NotAllowedError'
      ? 'Libere o microfone para este site (cadeado na barra de endereço).'
      : 'Não achei microfone: ' + (e.message || e.name), true);
    return;
  }

  _waGravStream = stream;
  _waGravPedacos = [];
  _waGravCancelado = false;
  try {
    _waGravador = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 });
  } catch (e) {
    _waGravador = new MediaRecorder(stream);   // deixa o navegador escolher o bitrate
  }
  _waGravador.ondataavailable = ev => { if (ev.data && ev.data.size) _waGravPedacos.push(ev.data); };
  _waGravador.onstop = _waGravouTerminou;
  _waGravador.start(250);
  _waGravInicio = Date.now();

  // A linha do composer vira o painel de gravação
  const linha = document.querySelector('.wa-composer-linha');
  if (linha) linha.style.display = 'none';
  const composer = document.getElementById('wa-composer');
  if (composer) composer.insertAdjacentHTML('beforeend',
    `<div class="wa-gravando" id="wa-gravando">
       <button class="wa-grav-cancelar" onclick="waCancelarAudio()" title="Descartar"><i class="fa-solid fa-trash"></i></button>
       <span class="wa-grav-ponto"></span>
       <span class="wa-grav-tempo" id="wa-grav-tempo">0:00</span>
       <span class="wa-grav-dica">Gravando… o anti-ruído está ligado</span>
       <button class="wa-grav-enviar" onclick="waPararAudio()" title="Parar e enviar"><i class="fa-solid fa-paper-plane"></i></button>
     </div>`);
  _waGravTimer = setInterval(() => {
    const el = document.getElementById('wa-grav-tempo');
    if (!el) return;
    const s = Math.floor((Date.now() - _waGravInicio) / 1000);
    el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    // Trava de segurança: a Meta recusa áudio acima de 16 MB. 5 minutos de voz
    // em opus ficam muito abaixo disso; paramos bem antes do risco.
    if (s >= 300) waPararAudio();
  }, 250);
};

function _waFecharPainelGravacao() {
  clearInterval(_waGravTimer); _waGravTimer = null;
  const g = document.getElementById('wa-gravando');
  if (g) g.remove();
  const linha = document.querySelector('.wa-composer-linha');
  if (linha) linha.style.display = '';
  if (_waGravStream) { _waGravStream.getTracks().forEach(t => t.stop()); _waGravStream = null; }
}

window.waCancelarAudio = function () {
  _waGravCancelado = true;
  if (_waGravador && _waGravador.state !== 'inactive') _waGravador.stop();
  else _waFecharPainelGravacao();
};

window.waPararAudio = function () {
  if (!_waGravador || _waGravador.state === 'inactive') return;
  // Menos de meio segundo é clique acidental, não mensagem.
  if (Date.now() - _waGravInicio < 500) { waCancelarAudio(); return; }
  _waGravador.stop();
};

async function _waGravouTerminou() {
  const mime = (_waGravador && _waGravador.mimeType) || 'audio/ogg';
  const duracaoSeg = Math.max(1, Math.round((Date.now() - _waGravInicio) / 1000));
  _waFecharPainelGravacao();
  if (_waGravCancelado) { _waGravPedacos = []; return; }

  const blob = new Blob(_waGravPedacos, { type: mime.split(';')[0] });
  _waGravPedacos = [];
  if (!blob.size) { _waToast('A gravação saiu vazia. Tente de novo.', true); return; }

  _waToast('Enviando áudio…');
  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob);
  });
  const up = await waSend('/media/upload', 'POST', { dataUrl });
  if (!up || !up.ok) { _waToast((up && up.error) || 'Falha no upload do áudio.', true); return; }

  const r = await waSend('/messages/send', 'POST', {
    conversation_id: _waConvAberta, type: 'audio',
    media_url: up.url, media_mime_type: up.mime_type, filename: up.filename
  });
  if (r && r.ok) {
    const nova = { direction: 'outgoing', type: 'audio', media_url: up.url,
      media_filename: up.filename, content: '', status: 'sent',
      created_at: new Date().toISOString(), _duracao: duracaoSeg };
    _waMsgsCache.push(nova); _waAppendBolha(nova); _waCarregarConversas();
  } else {
    _waToast((r && r.error) || 'Falha ao enviar o áudio. Número conectado?', true);
  }
}

// ── O player das mensagens de voz ─────────────────────────────────────────
// Cada bolha de áudio ganha play/pausa, barra de progresso, tempo e o botão
// de velocidade (1x → 1,5x → 2x) — quem ouve áudio o dia inteiro usa muito.
let _waPlayerContador = 0;
let _waPlayerTocando = null;   // pausa o anterior quando outro começa

function _waPlayerAudio(m) {
  const id = 'wap-' + (++_waPlayerContador);
  const dur = m._duracao ? _waFmtSeg(m._duracao) : '';
  return `<div class="wa-audio" id="${id}">
    <audio preload="metadata" src="${_waEsc(m.media_url)}"></audio>
    <button class="wa-audio-play" onclick="waAudioTocar('${id}')" title="Ouvir"><i class="fa-solid fa-play"></i></button>
    <div class="wa-audio-meio">
      <input type="range" class="wa-audio-barra" min="0" max="100" value="0"
             oninput="waAudioPular('${id}', this.value)">
      <span class="wa-audio-tempo" data-dur="${dur}">${dur || '0:00'}</span>
    </div>
    <button class="wa-audio-vel" onclick="waAudioVelocidade('${id}')" title="Velocidade">1x</button>
  </div>`;
}
function _waFmtSeg(s) { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

window.waAudioTocar = function (id) {
  const box = document.getElementById(id);
  if (!box) return;
  const audio = box.querySelector('audio');
  const btn = box.querySelector('.wa-audio-play i');
  if (audio.paused) {
    // um áudio por vez, como no WhatsApp
    if (_waPlayerTocando && _waPlayerTocando !== audio) {
      _waPlayerTocando.pause();
    }
    _waPlayerTocando = audio;
    audio.play().catch(() => _waToast('Não consegui tocar este áudio.', true));
    btn.className = 'fa-solid fa-pause';
    if (!audio._waLigado) {
      audio._waLigado = true;
      audio.addEventListener('timeupdate', () => {
        const barra = box.querySelector('.wa-audio-barra');
        const tempo = box.querySelector('.wa-audio-tempo');
        // duration de gravação webm/ogg pode vir Infinity até o fim carregar
        const d = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
        if (barra && d) barra.value = Math.round(audio.currentTime / d * 100);
        if (tempo) tempo.textContent = _waFmtSeg(audio.currentTime) + (d ? ' / ' + _waFmtSeg(d) : '');
      });
      audio.addEventListener('ended', () => {
        btn.className = 'fa-solid fa-play';
        const barra = box.querySelector('.wa-audio-barra'); if (barra) barra.value = 0;
        const tempo = box.querySelector('.wa-audio-tempo');
        if (tempo) tempo.textContent = tempo.getAttribute('data-dur') || _waFmtSeg(audio.duration || 0);
      });
      audio.addEventListener('pause', () => { btn.className = 'fa-solid fa-play'; });
    }
  } else {
    audio.pause();
    btn.className = 'fa-solid fa-play';
  }
};
window.waAudioPular = function (id, pct) {
  const box = document.getElementById(id); if (!box) return;
  const audio = box.querySelector('audio');
  if (isFinite(audio.duration) && audio.duration > 0) audio.currentTime = audio.duration * (pct / 100);
};
window.waAudioVelocidade = function (id) {
  const box = document.getElementById(id); if (!box) return;
  const audio = box.querySelector('audio');
  const btn = box.querySelector('.wa-audio-vel');
  const prox = { 1: 1.5, 1.5: 2, 2: 1 }[audio.playbackRate] || 1;
  audio.playbackRate = prox;
  btn.textContent = String(prox).replace('.', ',') + 'x';
};
