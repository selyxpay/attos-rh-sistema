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
  else if (_waSubAba === 'contatos')  cont.innerHTML = _waEmpty('Contatos');
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
  catch (e) { cont.innerHTML = _waErro('Não foi possível carregar o dashboard: ' + e.message); return; }
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
