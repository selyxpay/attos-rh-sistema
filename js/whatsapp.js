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
// ── CLIENTE HTTP QUE NÃO DERRUBA A TELA ─────────────────────────────────────
// A tela sumia com 'Unexpected token "B", "Bad Gateway" is not valid JSON':
// quando o servidor engasgava, o proxy devolvia uma PÁGINA HTML de erro e o
// `r.json()` estourava. O erro subia e cada chamador trocava a lista pela
// mensagem de erro.
// Agora: confere o tipo do conteúdo ANTES de interpretar, nunca estoura, e
// marca `_rede: true` no que é problema de conexão/servidor — é esse sinal que
// diz "mantenha o que está na tela e tente de novo", em vez de apagar tudo.
async function _waBuscar(caminho, opcoes) {
  let r;
  try {
    r = await fetch('/api/whatsapp' + caminho, Object.assign({ credentials: 'same-origin' }, opcoes || {}));
  } catch (e) {
    return { ok: false, _rede: true, error: 'sem conexão com o servidor' };
  }
  // 502/503/504 são o proxy dizendo que o servidor não respondeu.
  if (r.status === 502 || r.status === 503 || r.status === 504) {
    return { ok: false, _rede: true, _status: r.status, error: 'o servidor está ocupado (' + r.status + ')' };
  }
  if (r.status === 401) {
    return { ok: false, _sessao: true, _status: 401, error: 'sessão expirada' };
  }
  const tipo = String(r.headers.get('content-type') || '').toLowerCase();
  if (tipo.indexOf('application/json') < 0) {
    // Resposta que NÃO é JSON (página de erro do proxy, HTML de login).
    let amostra = '';
    try { amostra = (await r.text()).slice(0, 80); } catch (e) {}
    return {
      ok: false, _rede: true, _status: r.status,
      error: 'resposta inesperada do servidor' + (amostra ? ' (' + amostra.replace(/<[^>]*>/g, ' ').trim().slice(0, 40) + ')' : '')
    };
  }
  try {
    const j = await r.json();
    if (j && typeof j === 'object') return j;
    return { ok: false, _rede: true, error: 'resposta vazia do servidor' };
  } catch (e) {
    return { ok: false, _rede: true, _status: r.status, error: 'resposta ilegível do servidor' };
  }
}
async function waGet(path) {
  return _waBuscar(path);
}
async function waSend(path, method, body) {
  return _waBuscar(path, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
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
  // "Bot" — tem permissão de TELA própria ("bot"), conferida no servidor em
  // toda rota /api/whatsapp/bot/. Aqui é só para não mostrar a aba a quem vai
  // levar 403 de qualquer forma.
  if (_botPodeVer()) abas.push({ id: 'bot', ic: 'fa-robot', label: 'Bot' });
  // Cadastro das mensagens prontas. Segue a permissao da tela 'whatsapp':
  // quem atende precisa ver as mensagens para usar, e quem edita conversa
  // tambem pode cuidar do catalogo -- ele nao guarda nada sensivel.
  if (_waPode('editar')) abas.push({ id: 'prontas', ic: 'fa-comment-dots', label: 'Mensagens prontas' });
  // Lembretes agendados: quem atende precisa ver o que vai sair sozinho.
  if (_waPode('criar')) abas.push({ id: 'lembretes', ic: 'fa-bell', label: 'Lembretes agendados' });
  // Janela aberta: quem ainda pode receber mensagem escrita a mao, e o envio
  // em grupo para esses.
  if (_waPode('criar')) abas.push({ id: 'janela', ic: 'fa-clock', label: 'Janela aberta' });
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
  else if (_waSubAba === 'bot')       _botRender(cont);
  else if (_waSubAba === 'prontas')   _respostasRender(cont);
  else if (_waSubAba === 'lembretes') _lembretesRender(cont);
  else if (_waSubAba === 'janela')    _janelaRender(cont);
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
// ── INICIAIS DO AVATAR, SEM QUEBRAR EMOJI ──────────────────────────────────
// charAt(0) corta pela METADE do caractere: emoji e acentuado composto ocupam
// mais de uma unidade em JavaScript, e a metade solta vira "?" na tela. Era
// por isso que o avatar e o nome apareciam com "?" para quem usa emoji no
// nome do WhatsApp.
// Agora separa por caractere de verdade (grapheme), com Intl.Segmenter quando
// o navegador tem, e Array.from como alternativa — Array.from já respeita o
// par de unidades do emoji, que resolve a maioria dos casos.
function _waLetras(texto) {
  const t = String(texto == null ? '' : texto);
  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const seg = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' });
      return Array.from(seg.segment(t), function (s) { return s.segment; });
    }
  } catch (e) { /* cai no Array.from */ }
  return Array.from(t);
}
// Duas iniciais quando dá (primeiro e último nome), como no WhatsApp Web.
function _waInicial(nome) {
  const limpo = String(nome || '').trim();
  if (!limpo) return '?';
  const partes = limpo.split(/\s+/).filter(Boolean);
  const primeira = _waLetras(partes[0])[0] || '';
  // Se a primeira "letra" é emoji ou símbolo, ela sozinha já é o avatar.
  if (primeira && !/[\p{L}\p{N}]/u.test(primeira)) return primeira;
  if (partes.length > 1) {
    const ultima = _waLetras(partes[partes.length - 1])[0] || '';
    if (/[\p{L}\p{N}]/u.test(ultima)) return (primeira + ultima).toUpperCase();
  }
  return primeira.toUpperCase() || '?';
}

// ── O QUE ESTA MENSAGEM É, EM PORTUGUÊS ────────────────────────────────────
// Mensagem que não é texto chegava SEM conteúdo nenhum: áudio e figurinha não
// têm texto, e foto/vídeo/documento só têm se a pessoa escreveu legenda.
// O resultado era balão vazio, só com a hora, e "—" na lista de conversas.
// Aqui cada tipo ganha um rótulo. Vale para os dois lugares.
const WA_ROTULO_TIPO = {
  image:     { icone: 'fa-image',            texto: 'Foto' },
  video:     { icone: 'fa-video',            texto: 'Vídeo' },
  audio:     { icone: 'fa-microphone',       texto: 'Áudio' },
  voice:     { icone: 'fa-microphone',       texto: 'Áudio' },
  sticker:   { icone: 'fa-note-sticky',      texto: 'Figurinha' },
  document:  { icone: 'fa-file-lines',       texto: 'Documento' },
  location:  { icone: 'fa-location-dot',     texto: 'Localização' },
  contacts:  { icone: 'fa-address-card',     texto: 'Contato' },
  contact:   { icone: 'fa-address-card',     texto: 'Contato' },
  reaction:  { icone: 'fa-face-smile',       texto: 'Reagiu' },
  button:    { icone: 'fa-hand-pointer',     texto: 'Resposta de botão' },
  interactive: { icone: 'fa-hand-pointer',   texto: 'Resposta de botão' },
  template:  { icone: 'fa-file-contract',    texto: 'Modelo enviado' },
  unsupported: { icone: 'fa-circle-question', texto: 'Mensagem não suportada' },
  deleted:   { icone: 'fa-ban',              texto: 'Mensagem apagada' },
  system:    { icone: 'fa-circle-info',      texto: 'Aviso do WhatsApp' }
};
function _waRotuloTipo(tipo) {
  return WA_ROTULO_TIPO[String(tipo || '').toLowerCase()] || null;
}
// Duração em 0:12, quando o servidor souber. Sem isso, só "Áudio".
function _waDuracao(seg) {
  const n = Number(seg);
  if (!n || isNaN(n) || n < 0) return '';
  const m = Math.floor(n / 60), s = Math.floor(n % 60);
  return m + ':' + String(s).padStart(2, '0');
}
// Prévia da conversa na lista: texto quando houver, senão o rótulo do tipo.
function _waPrevia(c) {
  const texto = String(c.last_message_text || '').trim();
  const rot = _waRotuloTipo(c.last_message_type);
  if (texto) {
    // Foto COM legenda mostra o ícone e a legenda, como no WhatsApp.
    if (rot && c.last_message_type !== 'text') {
      return '<i class="fa-solid ' + rot.icone + ' wa-prev-icone"></i> ' + _waEsc(texto.slice(0, 38));
    }
    return _waEsc(texto.slice(0, 42));
  }
  if (rot) return '<i class="fa-solid ' + rot.icone + ' wa-prev-icone"></i> ' + _waEsc(rot.texto);
  // Conversa antiga, de antes de o tipo passar a ser guardado.
  return '<span class="wa-prev-vazia">Sem mensagens</span>';
}
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
  // "Aguardando atendente" usa o status 'pending', que é o que o bot grava
  // na conversa quando a pessoa pede atendente. Fica logo depois de
  // "Não lidas" porque é a fila que alguém precisa olhar primeiro.
  // "Bot" entra ao lado dessas: mostra as conversas em que o bot já falou,
  // que é o que se quer olhar para saber se ele está ajudando ou atrapalhando.
  const fs = [['', 'Todas'], ['unread', 'Não lidas'], ['pending', 'Aguardando atendente'],
              ['bot', 'Bot'], ['fora', 'Fora do expediente'],
              ['open', 'Abertas'], ['closed', 'Fechadas']];
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
  else if (_waFiltroConv === 'pending') qs += '&status=pending';
  else if (_waFiltroConv === 'bot') qs += '&bot_only=true';
  else if (_waFiltroConv === 'fora') qs += '&fora_exp_only=true';
  if (_waFiltroConta) qs += '&account_id=' + encodeURIComponent(_waFiltroConta);
  if (_waBuscaConv) qs += '&search=' + encodeURIComponent(_waBuscaConv);
  const r = await waGet('/conversations' + qs);
  if (_waSubAba !== 'inbox') return;

  // FALHA DE REDE OU DO SERVIDOR: a tela NÃO muda. Fica o que já estava,
  // aparece a faixa de "reconectando" e tenta de novo sozinho, esperando mais
  // a cada tentativa. Era aqui que a lista sumia e dava lugar ao erro.
  if (!r || !r.ok) {
    if (r && (r._rede || r._sessao)) { _waRedeCaiu(r); return; }
    // Erro de verdade do servidor (ex.: 403). Só avisa se não há nada na tela.
    if (!_waConversas.length) box.innerHTML = _waErro((r && r.error) || 'Erro ao carregar conversas.');
    else _waToast((r && r.error) || 'Não consegui atualizar a lista.', true);
    return;
  }
  _waRedeVoltou();

  _waConversas = r.conversations || [];
  _waAtualizarBadge();
  if (!_waConversas.length) {
    box.innerHTML = `<div class="wa-empty" style="padding:32px 16px;"><i class="fa-solid fa-comments"></i><p>${_waBuscaConv || _waFiltroConv ? 'Nenhuma conversa nesse filtro.' : 'Nenhuma conversa ainda. Elas aparecem aqui quando alguém enviar mensagem para o número conectado.'}</p></div>`;
    return;
  }
  _waPintarLista(box, _waConversas);
}

// ── LISTA DE CONVERSAS: ATUALIZA O QUE MUDOU, NÃO A LISTA INTEIRA ───────────
// Trocar o `innerHTML` da lista inteira a cada atualização era o "pisca":
// a rolagem saltava, a conversa selecionada perdia o destaque por um instante
// e o hover sumia debaixo do mouse. Agora cada item é comparado por uma
// ASSINATURA (o que a tela mostra dele) e só é redesenhado se mudou; a ordem é
// ajustada movendo os elementos que já existem.
function _waPintarLista(box, conversas) {
  const existentes = {};
  Array.from(box.querySelectorAll('.wa-conv-item')).forEach(function (el) {
    const id = el.getAttribute('data-conv');
    if (id) existentes[id] = el; else el.remove();      // resto de estado vazio
  });
  // Estado vazio/erro que estava na caixa antes.
  Array.from(box.children).forEach(function (el) {
    if (!el.classList || !el.classList.contains('wa-conv-item')) el.remove();
  });

  let anterior = null;
  conversas.forEach(function (c) {
    const chave = String(c.id);
    const assinatura = _waAssinaturaConversa(c);
    let el = existentes[chave];
    if (el) {
      if (el.getAttribute('data-assin') !== assinatura) {
        el.outerHTML = _waItemConversa(c);
        el = box.querySelector('.wa-conv-item[data-conv="' + chave + '"]');
      }
      delete existentes[chave];
    } else {
      box.insertAdjacentHTML('beforeend', _waItemConversa(c));
      el = box.querySelector('.wa-conv-item[data-conv="' + chave + '"]');
    }
    if (!el) return;
    // Coloca na posição certa SEM redesenhar: mover um nó preserva o
    // destaque, o hover e a rolagem.
    const esperado = anterior ? anterior.nextElementSibling : box.firstElementChild;
    if (esperado !== el) {
      if (anterior) anterior.insertAdjacentElement('afterend', el);
      else box.insertAdjacentElement('afterbegin', el);
    }
    anterior = el;
  });
  // O que saiu do filtro sai da tela.
  Object.keys(existentes).forEach(function (k) { existentes[k].remove(); });
}

// Tudo que aparece do item na tela. Se isto não mudou, não há por que
// redesenhar.
function _waAssinaturaConversa(c) {
  return [c.contact_name || c.contact_profile_name || c.contact_phone || '',
          c.last_message_text || '', c.last_message_type || '', c.last_message_at || '',
          c.unread_count || 0, c.status || '', c.assigned_to_name || '',
          // sinais do bot: sem eles na assinatura, o robozinho nao atualizaria
          c.bot_em || '', c.bot_pausado || 0, c.bot_saiu || 0, c.lembretes_agendados || 0,
          c.fora_exp || '',
          c.id === _waConvAberta ? '1' : '0'].join('|');
}

// ── INDICADORES DA LISTA: SÓ QUANDO DIZEM ALGO ─────────────────────────────
// Antes, TODA conversa levava "● Aberta" embaixo. Como quase toda conversa
// está aberta, a etiqueta não informava nada e só poluía a lista — virava
// ruído em cima da informação que importa, que é a prévia da mensagem.
// Agora o estado só aparece quando é diferente do normal, e o nome do
// atendente só quando existe um.
function _waIndicadores(c, cor) {
  const partes = [];
  if (c.status && c.status !== 'open') {
    partes.push('<span style="color:' + cor + ';">● ' + _waEsc(WA_STATUS_PT[c.status] || c.status) + '</span>');
  }
  if (c.assigned_to_name) {
    partes.push('<span class="wa-ind-atendente"><i class="fa-solid fa-user-check"></i> ' + _waEsc(c.assigned_to_name) + '</span>');
  }
  if (!partes.length) return '';
  return '<span class="wa-conv-status">' + partes.join(' · ') + '</span>';
}

function _waItemConversa(c) {
  const nome = c.contact_name || c.contact_profile_name || _waFmtTelefone(c.contact_phone) || 'Sem nome';
  const cor = WA_STATUS_COR[c.status] || '#94a3b8';
  const naoLidas = c.unread_count > 0 ? `<span class="wa-unread">${c.unread_count > 9 ? '9+' : c.unread_count}</span>` : '';
  const marcaNaoLida = c.unread_count > 0 ? ' wa-nao-lida' : '';
  return `<div class="wa-conv-item ${c.id === _waConvAberta ? 'active' : ''}${marcaNaoLida}" data-conv="${c.id}" data-assin="${_waEsc(_waAssinaturaConversa(c))}" onclick="waAbrirConversa(${c.id})">
    <span class="wa-avatar" style="background:${_waCorAvatar(nome)};">${_waEsc(_waInicial(nome))}</span>
    <div class="wa-conv-meio">
      <div class="wa-conv-topo"><b>${_waEsc(nome)}</b>${_waSinaisDoBot(c)}<span class="wa-conv-hora">${_waHora(c.last_message_at)}</span></div>
      <div class="wa-conv-baixo"><span class="wa-conv-prev">${_waPrevia(c)}</span>${naoLidas}</div>
      ${_waIndicadores(c, cor)}
    </div>
  </div>`;
}
// ROBOZINHO E SININHO NA LISTA.
// Da para saber, sem abrir a conversa, se o bot atendeu aquela pessoa, se ele
// esta ativo ali e se tem lembrete agendado.
function _waSinaisDoBot(c) {
  let html = '';
  if (c.bot_em) {
    const pausado = Number(c.bot_pausado) === 1;
    const saiu = Number(c.bot_saiu) === 1;
    const classe = saiu ? 'saiu' : (pausado ? 'pausado' : 'ativo');
    const quando = _waHora(c.bot_em);
    const dica = saiu ? 'A pessoa pediu para sair do bot'
      : (pausado ? 'Bot pausado neste contato · atendido pelo bot às ' + quando
                 : 'Atendido pelo bot às ' + quando);
    html += '<i class="fa-solid fa-robot wa-sinal-bot ' + classe + '" title="' + _waEsc(dica) + '"></i>';
  }
  // Lua: recebeu o funil de fora do expediente. Fica junto do robozinho
  // porque e a mesma pergunta — "o automatico falou com essa pessoa?".
  if (c.fora_exp) {
    html += '<i class="fa-solid fa-moon wa-sinal-lua" title="Recebeu o funil de fora do expediente"></i>';
  }
  if (Number(c.lembretes_agendados) > 0) {
    const n = Number(c.lembretes_agendados);
    html += '<i class="fa-solid fa-bell wa-sinal-lembrete" title="' +
      (n === 1 ? '1 lembrete agendado' : n + ' lembretes agendados') + '"></i>';
  }
  return html;
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
  const mesmaConversa = (_waConvAberta === id);
  _waConvAberta = id;
  const chat = document.getElementById('wa-col-chat');
  const inbox = document.getElementById('wa-inbox');
  if (inbox) inbox.classList.add('wa-chat-aberto');   // mobile: mostra o chat
  // "Carregando" SÓ na primeira vez que esta conversa abre. Reabrir a mesma
  // (atualização, volta do tempo real) mantém a conversa na tela: era isso que
  // fazia tudo sumir e voltar, inclusive no meio da digitação.
  if (chat && !mesmaConversa) {
    chat.innerHTML = '<div class="wa-loading" style="margin:auto;"><i class="fa-solid fa-spinner fa-spin"></i></div>';
  }
  document.querySelectorAll('.wa-conv-item').forEach(el => el.classList.remove('active'));
  const r = await waGet('/conversations/' + id);
  if (_waConvAberta !== id) return;
  if (!r || !r.ok) {
    // Problema de rede/servidor: NÃO apaga nada. Mantém o que está na tela,
    // mostra a faixa e tenta de novo sozinho.
    if (r && (r._rede || r._sessao)) {
      if (chat && !mesmaConversa && !_waMsgsCache.length) {
        chat.innerHTML = '<div class="wa-chat-vazio"><i class="fa-solid fa-plug-circle-exclamation"></i><p>Sem conexão com o servidor. Tentando de novo…</p></div>';
      }
      _waRedeCaiu(r);
      return;
    }
    if (chat && !mesmaConversa) chat.innerHTML = _waErro((r && r.error) || 'Erro ao abrir a conversa.');
    else _waToast((r && r.error) || 'Não consegui atualizar a conversa.', true);
    return;
  }
  _waRedeVoltou();
  _waConvAbertaObj = r.conversation;
  _waRenderChat(r.conversation, r.messages || []);
  _waRenderInfoConv(r.conversation);
  // zera não-lidas no item da lista
  const cItem = _waConversas.find(c => c.id === id); if (cItem) { cItem.unread_count = 0; }
  const li = document.querySelector('.wa-conv-item[data-conv="' + id + '"]');
  if (li) li.classList.add('active');
  _waAtualizarBadge();
  // Mídia que ficou sem arquivo (download falhou na hora, servidor reiniciado
  // no meio): tenta de novo ao abrir a conversa, sem ninguém precisar clicar.
  // Não espera pela resposta: cada arquivo que chega avisa pelo tempo real e
  // troca o balão sozinho.
  _waTentarMidiaPendente(id);
};

function _waTentarMidiaPendente(convId) {
  // O servidor responde na hora (202) e baixa em segundo plano; cada arquivo
  // que chega avisa pelo tempo real e troca so aquele balao. Sem tempo real,
  // uma busca incremental alguns segundos depois pega o que baixou.
  waSend('/conversations/' + convId + '/midia-pendente', 'POST')
    .then(function (j) {
      if (!j || !j.ok || !j.pendentes) return;
      if (_waSSE && _waSSE.readyState !== 2) return;      // tempo real cuida
      setTimeout(function () {
        if (_waConvAberta === convId) _waRecarregarMidiaDaConversa(convId);
      }, 6000);
    })
    .catch(function () { /* sem permissão ou sem módulo: a tela segue igual */ });
}

// Sem tempo real: busca o endereço novo das mídias e troca SÓ os balões que
// ganharam arquivo. Não redesenha a conversa.
async function _waRecarregarMidiaDaConversa(convId) {
  const r = await waGet('/conversations/' + convId + '?limit=50');
  if (!r || !r.ok || _waConvAberta !== convId) return;
  (r.messages || []).forEach(function (m) {
    if (!m.id || !m.media_url) return;
    const atual = (_waMsgsCache || []).find(function (x) { return Number(x.id) === Number(m.id); });
    if (atual && !atual.media_url) _waTrocarMidiaNoBalao(m.id, m.media_url);
  });
}

function _waRenderChat(conv, msgs) {
  _waMsgsCache = msgs || [];
  const chat = document.getElementById('wa-col-chat');
  if (!chat) return;
  // Guarda o que esta sendo digitado ANTES de trocar o HTML. Redesenhar o chat
  // apagava a caixa, o cursor e o foco no meio da frase.
  const _composer = _waGuardarComposer();
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
         ${(podeEditar && conv.contact_id && _botPodeVer && _botPodeVer()) ? `<span id="wa-bot-ctrl" class="wa-bot-controle"></span>` : ''}
       </div>
     </header>
     <div class="wa-msgs" id="wa-msgs">${msgs.map(_waBolha).join('') || '<div class="wa-msgs-vazio">Sem mensagens ainda.</div>'}</div>
     <div class="wa-composer" id="wa-composer">
       ${podeCriar ? `
         <div class="wa-composer-modo">
           <button class="wa-modo-btn ${!_waModoNota ? 'active' : ''}" onclick="waSetModo(false)"><i class="fa-solid fa-paper-plane"></i> Resposta</button>
           <button class="wa-modo-btn wa-modo-nota ${_waModoNota ? 'active' : ''}" onclick="waSetModo(true)"><i class="fa-solid fa-note-sticky"></i> Nota interna</button>
         </div>
         <!-- Mensagens prontas: fica ACIMA da caixa, para o atendente ver as
              opções antes de começar a escrever. O conteúdo é montado por
              js/whatsapp-respostas-ui.js, que também cuida do atalho "/". -->
         <div class="wa-prontas" id="wa-prontas"></div>
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
  _waPresoNoFim = true;
  _waNaoVistas = 0;
  _waPinoNovas();
  _waScrollFim();
  _waLigarRolagem();
  _waRestaurarComposer(_composer);
  // Preenche o controle do bot no cabecalho (se a aba Bot for permitida).
  if (conv && conv.contact_id && typeof botCarregarControle === 'function') {
    botCarregarControle(conv.contact_id);
  }
  // Mensagens prontas: a fileira precisa saber se a janela de 24h está
  // aberta, e isso vem do servidor.
  if (typeof respostasDesenharFileira === 'function') respostasDesenharFileira(conv);
  // E o que já está agendado de lembrete nesta conversa.
  if (conv && conv.id && typeof respostasAvisoAgendado === 'function') respostasAvisoAgendado(conv.id);
}

function _waBolha(m) {
  if (m.is_internal_note || m.status === 'note') {
    return `<div class="wa-msg wa-msg-nota"><div class="wa-bolha"><div class="wa-nota-tag"><i class="fa-solid fa-note-sticky"></i> Nota interna · ${_waEsc(m.sender_name || '')}</div>${_waEsc(m.content)}<span class="wa-msg-hora">${_waHora(m.created_at)}</span></div></div>`;
  }
  const saida = m.direction === 'outgoing';
  const tipo = String(m.type || 'text').toLowerCase();

  // data-msg: o aviso de "mídia baixou" troca SÓ este balão, sem redesenhar a
  // conversa inteira e sem perder o lugar da rolagem.
  // A otimista ainda não tem id do banco: usa o cliente_id, que é o que
  // permite trocá-la pela real quando ela chegar.
  const _marca = m.id || m.cliente_id || '';
  const idAttr = _marca ? ` data-msg="${_waEsc(_marca)}"` : '';

  // FIGURINHA: imagem solta, sem balão — é assim no WhatsApp.
  if (tipo === 'sticker' && m.media_url) {
    return `<div class="wa-msg ${saida ? 'wa-msg-out' : 'wa-msg-in'} wa-msg-figurinha"${idAttr}>
      <img class="wa-figurinha" src="${_waEsc(m.media_url)}" alt="figurinha">
      <span class="wa-msg-hora wa-hora-fora">${_waHora(m.created_at)} ${saida ? _waTick(m.status) : ''}</span>
    </div>`;
  }

  let corpo = '';
  if (tipo === 'image' && m.media_url) {
    corpo = `<img class="wa-msg-img" src="${_waEsc(m.media_url)}" alt="imagem">${m.content ? '<div class="wa-legenda texto-longo">' + _waEsc(m.content) + '</div>' : ''}`;
  } else if ((tipo === 'audio' || tipo === 'voice') && m.media_url) {
    corpo = _waPlayerAudio(m);
  } else if ((tipo === 'document' || tipo === 'video') && m.media_url) {
    corpo = `<a class="wa-msg-doc" href="${_waEsc(m.media_url)}" target="_blank" rel="noopener"><i class="fa-solid fa-file-arrow-down"></i> ${_waEsc(m.media_filename || m.type)}</a>${m.content ? '<div class="wa-legenda texto-longo">' + _waEsc(m.content) + '</div>' : ''}`;
  } else if (m.media_id && !m.media_url) {
    // TEM mídia, mas o arquivo não está aqui. Dois casos bem diferentes, e a
    // tela não pode mostrar o mesmo para os dois:
    //  - ainda baixando (ou vai tentar de novo): "(baixando...)"
    //  - a Meta já apagou o arquivo (ela guarda ~30 dias): não há o que
    //    esperar, então avisa e para — antes isto ficava "(baixando...)"
    //    para sempre.
    corpo = _waMidiaFaltando(m) + (m.content ? '<div class="wa-legenda texto-longo">' + _waEsc(m.content) + '</div>' : '');
  } else if (m.content) {
    // Texto: quebras de linha preservadas (classe texto-longo) e link clicável.
    corpo = `<span class="texto-longo">${_waLinks(m.content)}</span>`;
  } else {
    // NUNCA MAIS BALÃO VAZIO.
    // Mensagem sem conteúdo renderizável: áudio ou figurinha cuja mídia ainda
    // não baixou, foto sem legenda, tipo que a conta não suporta. Antes isto
    // virava um balão só com a hora, e ninguém sabia o que havia chegado.
    const rot = _waRotuloTipo(tipo) || WA_ROTULO_TIPO.unsupported;
    const dur = (tipo === 'audio' || tipo === 'voice') ? _waDuracao(m.media_duration) : '';
    const baixando = (m.media_id && !m.media_url) ? ' <span class="wa-baixando">(baixando...)</span>' : '';
    corpo = `<span class="wa-msg-tipo"><i class="fa-solid ${rot.icone}"></i> ${_waEsc(rot.texto)}${dur ? ' ' + dur : ''}${baixando}</span>`;
  }

  // REAÇÃO: emoji no cantinho, não um balão inteiro.
  const reacao = m.reaction_emoji
    ? `<span class="wa-reacao" title="Reação">${_waEsc(m.reaction_emoji)}</span>` : '';
  // QUEM MANDOU, em letra pequena dentro do balão. Mensagem antiga (antes da
  // coluna `origem`) fica sem rótulo: não dá para adivinhar depois quem foi.
  const etiquetaBot = _waQuemMandou(m);

  return `<div class="wa-msg ${saida ? 'wa-msg-out' : 'wa-msg-in'}"${idAttr}>
    <div class="wa-bolha">${etiquetaBot}${corpo}${reacao}<span class="wa-msg-hora">${_waHora(m.created_at)} ${saida ? _waTick(m.status) : ''}</span></div>
  </div>`;
}

// Rótulo de quem mandou a mensagem: "Bot", "Lembrete automático" ou o nome do
// atendente. Só para mensagem que SAIU, e só quando o sistema sabe de verdade.
function _waQuemMandou(m) {
  if (!m || m.direction !== 'outgoing') return '';
  const origem = String(m.origem || '').toLowerCase();
  if (origem === 'bot' || (!origem && (m.sent_by_bot || m.sender_name === 'bot'))) {
    return '<span class="wa-quem wa-quem-bot"><i class="fa-solid fa-robot"></i> Bot</span>';
  }
  if (origem === 'lembrete') {
    return '<span class="wa-quem wa-quem-lembrete"><i class="fa-solid fa-clock"></i> Lembrete automático</span>';
  }
  if (origem === 'grupo') {
    return '<span class="wa-quem wa-quem-grupo"><i class="fa-solid fa-users"></i> Envio em grupo</span>';
  }
  if (origem === 'atendente' && m.sender_name) {
    return '<span class="wa-quem">' + _waEsc(m.sender_name) + '</span>';
  }
  return '';
}

// Mídia que o contato mandou e que não está no servidor.
function _waMidiaFaltando(m) {
  const rot = _waRotuloTipo(String(m.type || '').toLowerCase()) || WA_ROTULO_TIPO.unsupported;
  const falhou = !!(m.media_falhou || Number(m.media_falhou) === 1);
  if (falhou) {
    return `<span class="wa-midia-nao">
      <i class="fa-solid fa-circle-exclamation"></i> ${_waEsc(rot.texto)}: mídia não disponível
      <button class="wa-midia-tentar" onclick="waTentarMidia(${Number(m.id) || 0})" title="Tentar baixar de novo">
        <i class="fa-solid fa-rotate"></i> tentar de novo</button>
    </span>`;
  }
  return `<span class="wa-msg-tipo"><i class="fa-solid ${rot.icone}"></i> ${_waEsc(rot.texto)}
    <span class="wa-baixando">(baixando...)</span></span>`;
}

// Botão "tentar de novo" de um balão. O servidor usa o media id guardado.
window.waTentarMidia = async function (id) {
  if (!id) return;
  const alvo = document.querySelector('[data-msg="' + id + '"] .wa-midia-tentar');
  if (alvo) { alvo.disabled = true; alvo.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> baixando...'; }
  let r = {};
  try {
    const resp = await fetch('/api/whatsapp/mensagens/' + encodeURIComponent(id) + '/midia',
                             { method: 'POST', credentials: 'same-origin' });
    r = await resp.json().catch(function () { return {}; });
  } catch (e) { r = { ok: false, error: e.message }; }
  if (r && r.ok && r.media_url) {
    _waTrocarMidiaNoBalao(id, r.media_url);
  } else {
    _waToast((r && r.error) || 'Não consegui baixar esta mídia.', true);
    if (alvo) { alvo.disabled = false; alvo.innerHTML = '<i class="fa-solid fa-rotate"></i> tentar de novo'; }
  }
};

// Troca só a marca de entrega (✓, ✓✓) de um balão.
function _waTrocarStatusNoBalao(d) {
  const msgs = _waMsgsCache || [];
  let alvo = null;
  if (d.message_id) alvo = msgs.find(function (m) { return Number(m.id) === Number(d.message_id); });
  if (!alvo && d.wamid) alvo = msgs.find(function (m) { return m.wamid === d.wamid; });
  // Sem identificação, a última que saiu é a que recebeu a confirmação.
  if (!alvo) {
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].direction === 'outgoing') { alvo = msgs[i]; break; }
    }
  }
  if (!alvo || !d.status) return;
  alvo.status = d.status;
  if (!alvo.id) return;
  const el = document.querySelector('[data-msg="' + alvo.id + '"]');
  if (el) el.outerHTML = _waBolha(alvo);
}

// Troca a mídia de um balão no lugar, sem redesenhar a conversa.
function _waTrocarMidiaNoBalao(id, url) {
  const m = (_waMsgsCache || []).find(function (x) { return Number(x.id) === Number(id); });
  if (m) { m.media_url = url; m.media_falhou = 0; }
  const el = document.querySelector('[data-msg="' + id + '"]');
  if (el && m) el.outerHTML = _waBolha(m);
}

// Link clicável, em cima de texto JÁ ESCAPADO — a ordem importa: escapa
// primeiro, só depois troca o endereço por <a>. Ao contrário, viraria injeção.
function _waLinks(texto) {
  const seguro = _waEsc(String(texto == null ? '' : texto));
  return seguro.replace(/(https?:\/\/[^\s<]+)/g, function (url) {
    return '<a href="' + url + '" target="_blank" rel="noopener">' + url + '</a>';
  });
}
function _waTick(status) {
  if (status === 'read') return '<i class="fa-solid fa-check-double" style="color:#38bdf8;"></i>';
  if (status === 'delivered') return '<i class="fa-solid fa-check-double"></i>';
  if (status === 'failed') return '<i class="fa-solid fa-triangle-exclamation" style="color:#fca5a5;"></i>';
  if (status === 'sent') return '<i class="fa-solid fa-check"></i>';
  return '<i class="fa-regular fa-clock"></i>';
}
function _waScrollFim() { const m = document.getElementById('wa-msgs'); if (m) m.scrollTop = m.scrollHeight; }

// ══════════════════════════════════════════════════════════════════════════════
// CONVERSA ABERTA: ATUALIZAÇÃO INCREMENTAL E ROLAGEM COMO NO WHATSAPP
// ══════════════════════════════════════════════════════════════════════════════
let _waPresoNoFim = true;        // a pessoa está no fim da conversa?
let _waNaoVistas = 0;            // mensagens que chegaram enquanto ela lia acima
let _waBuscandoNovas = false;
let _waBuscandoAntigas = false;

// Está a menos de 80px do fim? Então é "está lendo o que chega agora".
function _waNoFim(box) {
  if (!box) return true;
  return (box.scrollHeight - box.scrollTop - box.clientHeight) < 80;
}

// Liga a vigilância da rolagem da conversa. Chamado a cada desenho do chat.
function _waLigarRolagem() {
  const box = document.getElementById('wa-msgs');
  if (!box || box._waLigado) return;
  box._waLigado = true;
  box.addEventListener('scroll', function () {
    _waPresoNoFim = _waNoFim(box);
    if (_waPresoNoFim && _waNaoVistas) { _waNaoVistas = 0; _waPinoNovas(); }
    // Subiu até o topo: carrega as anteriores sem mexer no que está lendo.
    if (box.scrollTop < 60) _waCarregarAntigas();
  }, { passive: true });
}

// Pino "novas mensagens ↓". Só aparece quando a pessoa subiu para ler.
function _waPinoNovas() {
  const chat = document.getElementById('wa-col-chat');
  if (!chat) return;
  let p = document.getElementById('wa-pino-novas');
  if (!_waNaoVistas) { if (p) p.remove(); return; }
  if (!p) {
    p = document.createElement('button');
    p.id = 'wa-pino-novas';
    p.className = 'wa-pino-novas';
    p.onclick = function () { _waNaoVistas = 0; _waPresoNoFim = true; _waScrollFim(); _waPinoNovas(); };
    chat.appendChild(p);
  }
  p.innerHTML = '<i class="fa-solid fa-arrow-down"></i> ' +
    (_waNaoVistas === 1 ? '1 mensagem nova' : _waNaoVistas + ' mensagens novas');
}

// O maior e o menor id que a tela já tem.
function _waUltimoId() {
  let max = 0;
  (_waMsgsCache || []).forEach(function (m) { if (Number(m.id) > max) max = Number(m.id); });
  return max;
}
function _waPrimeiroId() {
  let min = 0;
  (_waMsgsCache || []).forEach(function (m) {
    const n = Number(m.id);
    if (n && (!min || n < min)) min = n;
  });
  return min;
}

// Busca SÓ o que chegou depois da última mensagem que a tela tem e acrescenta.
// Nunca redesenha a conversa: é isto que não deixa o texto digitado se perder.
async function _waBuscarNovasDaConversa() {
  if (!_waConvAberta || _waBuscandoNovas) return;
  const desde = _waUltimoId();
  if (!desde) return;                      // conversa ainda não carregada
  _waBuscandoNovas = true;
  const conv = _waConvAberta;
  try {
    const r = await waGet('/conversations/' + conv + '?since=' + desde + '&limit=200');
    if (conv !== _waConvAberta) return;    // trocou de conversa no meio
    if (!r || !r.ok) { if (r && (r._rede || r._sessao)) _waRedeCaiu(r); return; }
    _waRedeVoltou();
    const novas = r.messages || [];
    if (!novas.length) return;
    novas.forEach(function (m) {
      // A mesma tranca de sempre: cliente_id, id e wamid. É isto que faz a
      // mensagem que acabei de mandar não aparecer duas vezes quando a busca
      // incremental passa por cima dela.
      if (m.cliente_id && _waReconciliar(m.cliente_id, m)) return;
      if (_waJaNaTela(m)) return;
      _waMsgsCache.push(m);
      _waAppendBolha(m);
    });
  } finally {
    _waBuscandoNovas = false;
  }
}

// Rolagem para cima: carrega as ANTERIORES e mantém a posição de leitura.
async function _waCarregarAntigas() {
  if (!_waConvAberta || _waBuscandoAntigas) return;
  const antes = _waPrimeiroId();
  if (!antes || antes <= 1) return;
  const box = document.getElementById('wa-msgs');
  if (!box) return;
  _waBuscandoAntigas = true;
  const conv = _waConvAberta;
  const alturaAntes = box.scrollHeight;
  const posicaoAntes = box.scrollTop;
  try {
    const r = await waGet('/conversations/' + conv + '?antes=' + antes + '&limit=30');
    if (conv !== _waConvAberta) return;
    if (!r || !r.ok) { if (r && r._rede) _waRedeCaiu(r); return; }
    _waRedeVoltou();
    const antigas = r.messages || [];
    if (!antigas.length) { box._waAcabou = true; return; }
    const html = antigas.map(_waBolha).join('');
    box.insertAdjacentHTML('afterbegin', html);
    _waMsgsCache = antigas.concat(_waMsgsCache || []);
    // Mantém EXATAMENTE o que a pessoa estava lendo: o conteúdo cresceu para
    // cima, então a posição desce o mesmo tanto.
    box.scrollTop = posicaoAntes + (box.scrollHeight - alturaAntes);
  } finally {
    _waBuscandoAntigas = false;
  }
}

// ── O QUE ESTÁ SENDO DIGITADO NÃO SE PERDE ──────────────────────────────────
// Toda vez que o chat é redesenhado (abrir conversa, trocar para nota
// interna), o texto, a posição do cursor e o foco voltam para onde estavam.
function _waGuardarComposer() {
  const c = document.getElementById('wa-msg-input');
  if (!c) return null;
  return {
    texto: c.value || '',
    ini: c.selectionStart, fim: c.selectionEnd,
    focado: document.activeElement === c
  };
}
function _waRestaurarComposer(g) {
  if (!g || !g.texto && !g.focado) return;
  const c = document.getElementById('wa-msg-input');
  if (!c) return;
  if (g.texto) {
    c.value = g.texto;
    if (typeof waComposerDigitou === 'function') waComposerDigitou(c);
  }
  if (g.focado) {
    try { c.focus(); c.setSelectionRange(g.ini || 0, g.fim || 0); } catch (e) {}
  }
}

window.waVoltarLista = function () { const i = document.getElementById('wa-inbox'); if (i) i.classList.remove('wa-chat-aberto'); _waConvAberta = null; };
window.waSetModo = function (nota) { _waModoNota = !!nota; if (_waConvAbertaObj) _waRenderChat(_waConvAbertaObj, _waMsgsCache || []); };
window.waComposerKey = function (e) {
  // A barra abre a lista de mensagens prontas, como no atendimento de
  // qualquer ferramenta do tipo. Só quando o campo está VAZIO: no meio de
  // uma frase a barra é só uma barra.
  if (e.key === '/' && !_waModoNota) {
    const campo = e.target;
    if (campo && !String(campo.value || '').trim() && typeof respostasAbrirLista === 'function') {
      e.preventDefault();
      respostasAbrirLista();
      return;
    }
  }
  if (e.key === 'Escape' && typeof respostasFecharLista === 'function') respostasFecharLista();
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); waEnviarMensagem(); }
};
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
  // LEMBRETE: se o texto veio de uma mensagem pronta que tem lembrete, o
  // servidor precisa saber qual — e assim o envio pelo aviao tambem agenda.
  const _pronta = (typeof respostasProntaDaCaixa === 'function') ? respostasProntaDaCaixa() : null;
  // A bolha aparece ANTES da resposta do servidor (a conversa tem que
  // responder na velocidade do dedo), já com o cliente_id que vai amarrar as
  // duas pontas.
  const cid = _waNovoClienteId();
  const conversaDoEnvio = _waConvAberta;
  const otimista = {
    cliente_id: cid, direction: 'outgoing', type: 'text', content: texto,
    status: 'enviando',
    sender_name: (loggedUser && (loggedUser.nomeExibicao || loggedUser.nome)) || '',
    origem: 'atendente', created_at: new Date().toISOString()
  };
  _waMsgsCache.push(otimista);
  _waAppendBolha(otimista);

  const r = await waSend('/messages/send', 'POST', {
    conversation_id: conversaDoEnvio, type: 'text', content: texto,
    cliente_id: cid,
    resposta_id: _pronta ? _pronta.id : undefined,
    lembrete_horario: _pronta ? _pronta.horario : undefined,
    lembrete_data: _pronta ? _pronta.data : undefined
  });
  if (r && r.ok) {
    // A real substitui a otimista. Se o tempo real chegou primeiro, ele já
    // substituiu e aqui é só confirmar o status.
    _waReconciliar(cid, { id: r.message_id, wamid: r.wamid, status: 'sent' });
    _waCarregarConversas();
    // Mandou: a mensagem pronta sai da caixa e o aviso do que foi agendado
    // aparece na conversa.
    if (typeof respostasSemLembrete === 'function') respostasSemLembrete();
    if (r.lembretes && r.lembretes.agendados && typeof respostasAvisoAgendado === 'function') {
      _waToast(r.lembretes.agendados === 1 ? 'Enviada. 1 lembrete agendado.'
                                           : 'Enviada. ' + r.lembretes.agendados + ' lembretes agendados.');
      respostasAvisoAgendado(_waConvAberta);
    }
  } else {
    // Não desenha outra bolha: marca a que já está na tela.
    _waReconciliar(cid, { status: 'failed' });
    _waToast((r && r.error) || 'Falha ao enviar. Verifique se o número está conectado à Meta.', true);
  }
};
// ══════════════════════════════════════════════════════════════════════════════
// UMA MENSAGEM, UMA BOLHA
// ──────────────────────────────────────────────────────────────────────────────
// A tela desenha a mensagem na hora de mandar (a "otimista", para a conversa
// responder na velocidade do dedo) e o servidor avisa a mesma mensagem pelo
// tempo real. Sem amarrar as duas, apareciam DUAS bolhas no painel — para o
// contato sempre chegou uma só.
// A amarra é o `cliente_id`: um id temporário gerado aqui, que o servidor
// devolve na resposta e no aviso. Quem chega com esse id SUBSTITUI a otimista.
// `wamid` e `id` do banco servem de segunda tranca, para qualquer outro
// caminho (busca incremental, status da Meta) não repetir nada.
function _waNovoClienteId() {
  return 'tmp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// Esta mensagem já está na tela? Olha pelos três identificadores.
function _waJaNaTela(m) {
  if (!m) return false;
  const cache = _waMsgsCache || [];
  if (m.cliente_id && cache.some(function (x) { return x.cliente_id && x.cliente_id === m.cliente_id; })) return true;
  if (m.id && cache.some(function (x) { return String(x.id) === String(m.id); })) return true;
  if (m.wamid && cache.some(function (x) { return x.wamid && x.wamid === m.wamid; })) return true;
  return false;
}

// A mensagem real chegou: troca a otimista no lugar, sem mexer na rolagem.
// Devolve true quando encontrou a otimista para substituir.
function _waReconciliar(clienteId, real) {
  if (!clienteId) return false;
  const cache = _waMsgsCache || [];
  const i = cache.findIndex(function (x) { return x.cliente_id === clienteId; });
  if (i < 0) return false;
  const antigo = cache[i];
  const novo = Object.assign({}, antigo, real || {}, { cliente_id: clienteId });
  cache[i] = novo;
  const el = document.querySelector('[data-msg="' + (antigo.id || clienteId) + '"]');
  if (el) el.outerHTML = _waBolha(novo);
  return true;
}

// Acrescenta um balão. A ROLAGEM SEGUE A REGRA DO WHATSAPP: se a pessoa está
// no fim, acompanha a mensagem nova; se subiu para ler, não mexe na rolagem e
// mostra o pino "novas mensagens ↓". Antes, toda mensagem puxava a tela para
// baixo e tirava do lugar quem estava lendo o histórico.
function _waAppendBolha(m) {
  const box = document.getElementById('wa-msgs');
  if (!box) return;
  // Tranca final: se já existe bolha com este id, não desenha outra.
  if (m && m.id && box.querySelector('[data-msg="' + m.id + '"]')) return;
  const vazio = box.querySelector('.wa-msgs-vazio');
  if (vazio) vazio.remove();
  const estavaNoFim = _waNoFim(box);
  box.insertAdjacentHTML('beforeend', _waBolha(m));
  const minha = m && m.direction === 'outgoing';
  if (estavaNoFim || minha) {
    _waPresoNoFim = true;
    _waNaoVistas = 0;
    _waPinoNovas();
    _waScrollFim();
  } else {
    _waNaoVistas++;
    _waPinoNovas();
  }
}

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

// ══════════════════════════════════════════════════════════════════════════════
// RECONEXÃO: FAIXA DISCRETA, NUNCA TELA EM BRANCO
// ──────────────────────────────────────────────────────────────────────────────
// Quando o servidor engasga (502) ou a rede cai, a tela mantém exatamente o
// que está mostrando — lista, conversa aberta e o que está sendo digitado — e
// avisa numa faixa fina. A nova tentativa espera mais a cada vez (1s, 2s, 4s…
// até 30s), para não martelar um servidor que já está sofrendo.
let _waTentativa = 0;
let _waTimerVolta = null;
let _waOffline = false;

function _waEsperaDaTentativa() {
  const escada = [1000, 2000, 4000, 8000, 15000, 30000];
  return escada[Math.min(_waTentativa, escada.length - 1)];
}

function _waRedeCaiu(resp) {
  _waOffline = true;
  const sessao = !!(resp && resp._sessao);
  _waMostrarFaixa(sessao
    ? 'Sessão expirada. Recarregue a página para entrar de novo.'
    : 'Reconectando…', sessao);
  if (sessao) return;                       // não insiste sem sessão
  _waTentativa++;
  clearTimeout(_waTimerVolta);
  const espera = _waEsperaDaTentativa();
  _waTimerVolta = setTimeout(function () {
    _waAtualizarTudoDeLeve();
  }, espera);
}

function _waRedeVoltou() {
  if (!_waOffline && _waTentativa === 0) return;
  _waOffline = false;
  _waTentativa = 0;
  clearTimeout(_waTimerVolta);
  _waEsconderFaixa();
}

function _waMostrarFaixa(texto, grave) {
  let f = document.getElementById('wa-faixa-rede');
  if (!f) {
    const inbox = document.getElementById('wa-inbox') || document.getElementById('wa-content');
    if (!inbox) return;
    f = document.createElement('div');
    f.id = 'wa-faixa-rede';
    f.className = 'wa-faixa-rede';
    inbox.insertAdjacentElement('afterbegin', f);
  }
  f.className = 'wa-faixa-rede' + (grave ? ' grave' : '');
  f.innerHTML = '<i class="fa-solid ' + (grave ? 'fa-triangle-exclamation' : 'fa-rotate fa-spin') + '"></i> ' + _waEsc(texto);
  f.style.display = '';
}
function _waEsconderFaixa() {
  const f = document.getElementById('wa-faixa-rede');
  if (f) f.remove();
}

// Atualização leve: a lista e só o que é NOVO na conversa aberta. Nunca
// redesenha a conversa, nunca mostra "carregando".
async function _waAtualizarTudoDeLeve() {
  if (_waSubAba !== 'inbox') return;
  await _waCarregarConversas();
  if (_waConvAberta) await _waBuscarNovasDaConversa();
}

// ── SSE (tempo real) ─────────────────────────────────────────────────────────
// Polling de RESERVA: só roda quando o tempo real está fora. Busca a lista e
// o que é novo na conversa aberta — nunca redesenha nada inteiro.
let _waTimerReserva = null;
function _waLigarReserva() {
  if (_waTimerReserva) return;
  _waTimerReserva = setInterval(function () {
    if (_waSSE && _waSSE.readyState === 1) { _waDesligarReserva(); return; }
    if (_waSubAba !== 'inbox') return;
    _waAtualizarTudoDeLeve();
  }, 8000);
}
function _waDesligarReserva() {
  if (!_waTimerReserva) return;
  clearInterval(_waTimerReserva);
  _waTimerReserva = null;
}

function _waConectarSSE() {
  if (_waSSE && _waSSE.readyState !== 2) return;   // já conectado
  try {
    _waSSE = new EventSource('/api/whatsapp/events');
    _waSSE.onopen = function () {
      // Voltou o tempo real: tira a faixa, desliga a reserva e busca o que
      // perdeu enquanto estava fora (sem redesenhar a conversa).
      _waRedeVoltou();
      _waDesligarReserva();
      _waAtualizarTudoDeLeve();
    };
    _waSSE.onmessage = function (ev) {
      let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
      _waTratarEvento(d);
    };
    _waSSE.onerror = _waSSEErro;
  } catch (e) {
    // Navegador sem tempo real: a reserva assume.
    _waLigarReserva();
  }
}

// O QUE FAZER COM CADA AVISO DO SERVIDOR. Função com nome (e não um bloco
// anônimo dentro do onmessage) para a prova poder entregar o mesmo aviso que a
// Meta provoca em produção, sem precisar de uma conexão aberta.
window._waTratarEvento = function (d) {
  if (!d) return;
      if (d.type === 'new_message') {
        if (d.conversation_id === _waConvAberta && d.message) {
          // Veio do MEU envio? Então substitui a bolha otimista.
          const trocou = d.message.cliente_id && _waReconciliar(d.message.cliente_id, d.message);
          // Já está na tela por outro caminho (busca incremental, status)?
          // Então não desenha de novo.
          if (!trocou && !_waJaNaTela(d.message)) {
            _waMsgsCache.push(d.message);
            _waAppendBolha(d.message);
          }
        }
        // Mensagem RECEBIDA reabre a janela de 24 horas: a fileira de mensagens
        // prontas precisa voltar a ficar habilitada sem o atendente reabrir a
        // conversa.
        if (d.conversation_id === _waConvAberta && d.message && d.message.direction === 'incoming' &&
            typeof respostasDesenharFileira === 'function') {
          const _c = _waConversas.find(function (c) { return c.id === _waConvAberta; });
          respostasDesenharFileira(_c || { id: _waConvAberta });
        }
        if (_waSubAba === 'inbox') _waCarregarConversas();
      } else if (d.type === 'media_ready') {
        // A mídia acabou de ser baixada: troca só aquele balão.
        if (d.conversation_id === _waConvAberta && d.message_id && d.media_url) {
          _waTrocarMidiaNoBalao(d.message_id, d.media_url);
        }
      } else if (d.type === 'message_status') {
        // Só a MARCA de entrega muda. Antes isto reabria a conversa inteira a
        // cada confirmação da Meta — era a maior fonte do "pisca", e apagava o
        // que estava sendo digitado.
        if (d.conversation_id === _waConvAberta) _waTrocarStatusNoBalao(d);
      } else if (d.type === 'conversation_updated') {
        if (_waSubAba === 'inbox') _waCarregarConversas();
      }
};

// Tempo real caiu: o EventSource reconecta sozinho, mas pode demorar. Enquanto
// isso a reserva mantém a tela viva e a faixa avisa — sem apagar nada.
function _waSSEErro() {
  if (_waSSE && _waSSE.readyState === 2) {
    _waMostrarFaixa('Reconectando…');
    _waLigarReserva();
    clearTimeout(_waTimerVolta);
    _waTimerVolta = setTimeout(function () { _waSSE = null; _waConectarSSE(); }, 5000);
  }
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

// O navegador consegue tocar este arquivo? O áudio de voz do WhatsApp é
// OGG/Opus, que o Safari (iPhone) não toca. Quando não dá, a tela oferece o
// download em vez de um player mudo.
function _waTocaEsseAudio(url) {
  try {
    const ext = String(url || '').split('?')[0].split('.').pop().toLowerCase();
    const tipos = {
      ogg: 'audio/ogg; codecs=opus', opus: 'audio/ogg; codecs=opus',
      mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', amr: 'audio/amr', wav: 'audio/wav'
    };
    // ".bin": áudio salvo antes de o sistema entender "audio/ogg; codecs=opus".
    // Nenhum navegador toca isso, então vai direto para o botão de baixar.
    if (ext === 'bin') return false;
    if (!tipos[ext]) return true;                  // tipo que não conheço: deixa tentar
    const a = document.createElement('audio');
    return !!a.canPlayType(tipos[ext]);
  } catch (e) { return true; }
}

function _waPlayerAudio(m) {
  const id = 'wap-' + (++_waPlayerContador);
  const dur = m._duracao ? _waFmtSeg(m._duracao) : '';
  const baixar = `<a class="wa-audio-baixar" href="${_waEsc(m.media_url)}" download title="Baixar o áudio"><i class="fa-solid fa-download"></i></a>`;
  if (!_waTocaEsseAudio(m.media_url)) {
    // Sem player: este navegador não toca o formato. Pelo menos dá para ouvir
    // fora, e a mensagem não vira um balão morto.
    return `<div class="wa-audio wa-audio-sem">
      <i class="fa-solid fa-microphone-lines"></i>
      <span>Áudio${dur ? ' · ' + dur : ''} — este navegador não toca OGG/Opus</span>
      <a class="wa-audio-baixar" href="${_waEsc(m.media_url)}" download>
        <i class="fa-solid fa-download"></i> baixar</a>
    </div>`;
  }
  return `<div class="wa-audio" id="${id}">
    <audio preload="metadata" src="${_waEsc(m.media_url)}"></audio>
    <button class="wa-audio-play" onclick="waAudioTocar('${id}')" title="Ouvir"><i class="fa-solid fa-play"></i></button>
    <div class="wa-audio-meio">
      <input type="range" class="wa-audio-barra" min="0" max="100" value="0"
             oninput="waAudioPular('${id}', this.value)">
      <span class="wa-audio-tempo" data-dur="${dur}">${dur || '0:00'}</span>
    </div>
    <button class="wa-audio-vel" onclick="waAudioVelocidade('${id}')" title="Velocidade">1x</button>
    ${baixar}
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
