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
function _waEmpty(nome) {
  return `<div class="wa-empty"><i class="fa-solid fa-screwdriver-wrench"></i>
    <p><b>${_waEsc(nome)}</b> — em desenvolvimento. Chega na próxima etapa. 🛠️</p></div>`;
}
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
  else if (_waSubAba === 'inbox')     cont.innerHTML = _waEmpty('Conversas / Inbox');
  else if (_waSubAba === 'templates') cont.innerHTML = _waEmpty('Templates');
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
