// ==========================================================================
// R&T VAGAS IA — Servidor da própria VPS
// Serve o site (estático) E guarda os dados/fotos NO PRÓPRIO SERVIDOR:
//  - Estado (candidatos, funcionários, vagas...) em  DATA_DIR/state.json
//  - Fotos/documentos em  DATA_DIR/uploads/  (no banco fica só o link /uploads/..)
// Sem dependências externas (só Node puro). Sem Firebase.
// ==========================================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const BASE = path.resolve(__dirname);
const DATA_DIR = process.env.DATA_DIR || path.join(BASE, 'server-data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const LIMITE_CORPO = 45 * 1024 * 1024; // 45 MB (fotos base64 grandes)

// Garante as pastas de dados
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (e) {}

console.log('BASE:', BASE);
console.log('DATA_DIR:', DATA_DIR);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

// ==========================================================================
// CABEÇALHOS DE SEGURANÇA HTTP
// ==========================================================================
const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  // Câmera e localização liberadas para o próprio site (candidato tira foto por 'capture')
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(self), payment=()',
  // Dados e fotos agora são do PRÓPRIO servidor ('self'); mantém só os CDNs usados
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
    "img-src 'self' data: blob: https://images.unsplash.com https://ui-avatars.com https://api.qrserver.com",
    "connect-src 'self' https://viacep.com.br",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '),
};

// ==========================================================================
// MESCLAGEM (páginas públicas): mantém o servidor e só ADICIONA/atualiza
// (portado da antiga camada de nuvem — mesma regra)
// ==========================================================================
function mesclarEstado(servidor, local, upsertIds) {
  const ups = {};
  (upsertIds || []).forEach(function (id) { ups[id] = true; });
  const out = JSON.parse(JSON.stringify(servidor || {}));
  Object.keys(local || {}).forEach(function (k) {
    const lv = local[k];
    if (Array.isArray(lv)) {
      if (!Array.isArray(out[k])) { out[k] = lv.slice(); return; }
      const idx = {};
      out[k].forEach(function (it, i) { if (it && it.id != null) idx[it.id] = i; });
      lv.forEach(function (it) {
        if (it && it.id != null) {
          if (idx[it.id] === undefined) out[k].push(it);      // novo -> adiciona
          else if (ups[it.id]) out[k][idx[it.id]] = it;       // upsert -> substitui
        } else out[k].push(it);
      });
    } else if (k === 'fila' && lv && typeof lv === 'object') {
      out[k] = mesclarFila(out[k] || {}, lv);
    } else if (out[k] === undefined) {
      out[k] = lv;
    }
  });
  if (local && local._docsMeta) {
    out._docsMeta = Object.assign({}, out._docsMeta || {}, local._docsMeta);
  }
  return out;
}
function mesclarFila(servidor, local) {
  const out = Object.assign({}, servidor);
  out.contadores = out.contadores || {};
  const lc = local.contadores || {};
  Object.keys(lc).forEach(function (k) { out.contadores[k] = Math.max(out.contadores[k] || 0, lc[k] || 0); });
  const senhas = (servidor.senhas || []).slice();
  const vistos = {};
  senhas.forEach(function (s) { if (s && s.numero != null) vistos[s.numero] = true; });
  (local.senhas || []).forEach(function (s) {
    if (s && s.numero != null) { if (!vistos[s.numero]) senhas.push(s); } else senhas.push(s);
  });
  out.senhas = senhas;
  out.ultimaChamada = local.ultimaChamada || servidor.ultimaChamada || null;
  return out;
}

// ==========================================================================
// ESTADO em arquivo (com trava simples para não corromper em gravações juntas)
// ==========================================================================
function lerEstado() {
  try {
    const j = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { dados: j.dados || null, version: j.version || 0, atualizadoEm: j.atualizadoEm || 0 };
  } catch (e) {
    return { dados: null, version: 0, atualizadoEm: 0 };
  }
}
function gravarEstado(obj) {
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, STATE_FILE); // troca atômica: nunca deixa arquivo pela metade
}
let _fila = Promise.resolve();
function comTrava(fn) {
  const p = _fila.then(fn, fn);
  _fila = p.then(function () {}, function () {});
  return p;
}

// ==========================================================================
// Utilidades HTTP
// ==========================================================================
function responderJson(res, code, obj) {
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, SECURITY_HEADERS));
  res.end(JSON.stringify(obj));
}
function lerCorpo(req, cb) {
  let data = '';
  let tamanho = 0;
  req.on('data', function (chunk) {
    tamanho += chunk.length;
    if (tamanho > LIMITE_CORPO) { cb(new Error('corpo muito grande')); req.destroy(); return; }
    data += chunk;
  });
  req.on('end', function () { try { cb(null, data ? JSON.parse(data) : {}); } catch (e) { cb(e); } });
  req.on('error', function (e) { cb(e); });
}

// ==========================================================================
// AUTENTICAÇÃO NO SERVIDOR (a segurança de verdade)
// ==========================================================================
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 horas
let sessions = {};
try { sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')) || {}; } catch (e) { sessions = {}; }
function salvarSessions() { try { fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions)); } catch (e) {} }
function novaSessao(login) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions[token] = { login: login, expira: Date.now() + SESSION_TTL };
  salvarSessions();
  return token;
}
function sessaoValida(token) {
  const s = token && sessions[token];
  if (!s) return null;
  if (Date.now() > s.expira) { delete sessions[token]; salvarSessions(); return null; }
  return s;
}
function parseCookies(req) {
  const out = {}; const h = req.headers.cookie || '';
  h.split(';').forEach(function (p) { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
  return out;
}
function tokenDaReq(req) { return parseCookies(req)['rt_session']; }
function reqAutenticada(req) { return !!sessaoValida(tokenDaReq(req)); }

// Senha: SHA-256 padrão (mesmo do cliente); aceita texto puro legado
function hashSenhaServer(senha) { return crypto.createHash('sha256').update(String(senha), 'utf8').digest('hex'); }
function senhaConfere(digitada, armazenada) {
  if (!armazenada || String(armazenada).length !== 64) return String(digitada) === String(armazenada);
  return hashSenhaServer(digitada) === String(armazenada);
}

// Anti-brute-force por login (memória): 5 falhas -> 60s de espera
const tentativasLogin = {};
function podeTentarLogin(login) { const t = tentativasLogin[login]; return !(t && t.ate && Date.now() < t.ate); }
function registrarFalhaLogin(login) { const t = tentativasLogin[login] || { n: 0, ate: 0 }; t.n++; if (t.n % 5 === 0) t.ate = Date.now() + 60 * 1000; tentativasLogin[login] = t; }
function limparFalhasLogin(login) { delete tentativasLogin[login]; }

// Subconjunto PÚBLICO do estado (sem login): só o que as páginas públicas usam.
// NUNCA expõe candidatos, banco de talentos, funcionários (senhas!), logs, etc.
function subsetPublico(dados) {
  const d = JSON.parse(JSON.stringify(dados || {}));
  // Remove tudo que é sensível/interno
  ['funcionarios', 'logs', 'logsGlobais', 'auditoria', 'config', 'controleAcesso',
    'exataDominios', 'tiposContratacao', 'comissao', 'comissoes', 'relatorios', 'notificacoes']
    .forEach(function (k) { delete d[k]; });
  // Candidatos e banco de talentos: some com os dados (privacidade), mas mantém
  // os arrays VAZIOS para as páginas públicas não quebrarem ao adicionar um novo.
  d.candidatos = [];
  d.bancoTalentos = [];
  if (Array.isArray(d.vagas)) {
    d.vagas = d.vagas.filter(function (v) { return !v.excluido; }).map(function (v) {
      const c = Object.assign({}, v);
      ['exataCampos', 'exataExtras', 'funcaoCodigo', 'cbo', 'vinculo', 'codigoTipoContrato',
        'tipoContratacaoId', 'idEmpresaExata', 'exataJobFunctionId', 'diasVencimento', 'diasProrrogacao',
        'finalidade', 'justificativa', 'taxa', 'categoriaCodigo', 'filial', 'branchCode',
        'employmentLabel', 'exataEmploymentCode', 'employmentType', 'exataFuncaoArea', 'funcaoNome'
      ].forEach(function (k) { delete c[k]; });
      return c;
    });
  }
  if (Array.isArray(d.recrutadores)) d.recrutadores = d.recrutadores.map(function (r) {
    return { id: r.id, nome: r.nome, corHex: r.corHex, cor: r.cor, whatsapp: r.whatsapp };
  });
  return d;
}
// Sem login, só pode ADICIONAR nestes campos (candidatos/talentos/fila). Nada de funcionários/vagas.
const CHAVES_ESCRITA_PUBLICA = ['candidatos', 'bancoTalentos', 'fila', '_docsMeta', 'proximaFilaNum'];

// Garante que a conta MESTRE "admin" exista (senão, ninguém consegue logar num 1º uso).
// Nunca sobrescreve um admin já existente (preserva a senha atual).
function garantirAdminServidor() {
  comTrava(function () {
    const st = lerEstado();
    const d = st.dados || {};
    if (!Array.isArray(d.funcionarios)) d.funcionarios = [];
    const existe = d.funcionarios.some(function (f) { return (f.login || '').toLowerCase() === 'admin'; });
    if (!existe) {
      d.funcionarios.push({
        id: 'func-admin', nome: 'Administrador', login: 'admin',
        senha: '6101ed3e13dcdc5ea80901f4c5e1c9152d55b33b077b9f0b6ec30e72bf082e08', // gruport07072026
        departamento: 'administracao', status: 'ativo', permissoes: {}
      });
      gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() });
      console.log('[RT] Conta admin criada (primeiro uso).');
    }
  });
}

// Contas MESTRE (veem todas as senhas)
function ehMestreLogin(login) { const l = (login || '').toLowerCase(); return l === 'joaobalaf' || l === 'admin'; }
// Funcionário dono da sessão da requisição
function usuarioDaReq(req) {
  const s = sessaoValida(tokenDaReq(req));
  if (!s) return null;
  const st = lerEstado();
  return ((st.dados && st.dados.funcionarios) || []).find(function (f) { return (f.login || '').toLowerCase() === s.login; }) || null;
}
// Visibilidade da SENHA VISÍVEL: mestre vê todas; representante vê só do próprio
// departamento; os demais não veem nenhuma. (Aplicado no servidor, não dá pra burlar.)
function veTodasAsSenhas(requester) { return !!(requester && (ehMestreLogin(requester.login) || requester.departamento === 'administracao')); }
// Só vê senha quem: é mestre/administração, OU foi MARCADO (podeVerSenhas) e é do mesmo departamento.
function podeVerSenhaDe(requester, alvo) {
  if (veTodasAsSenhas(requester)) return true;
  return !!(requester && requester.podeVerSenhas && alvo && alvo.departamento === requester.departamento);
}
// A senha visível NUNCA vai junto com o estado — só via /api/ver-senha (que registra o acesso).
function filtrarSenhaVisivel(dados) {
  if (!dados || !Array.isArray(dados.funcionarios)) return dados;
  dados.funcionarios = dados.funcionarios.map(function (f) {
    if (f && f.senhaVisivel !== undefined) { const c = Object.assign({}, f); delete c.senhaVisivel; return c; }
    return f;
  });
  return dados;
}

// ==========================================================================
// SERVIDOR
// ==========================================================================
http.createServer(function (req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const autenticado = reqAutenticada(req);

  // ---- API: LOGIN (verificação REAL no servidor) ----
  if (urlPath === '/api/login' && req.method === 'POST') {
    lerCorpo(req, function (err, body) {
      if (err) { responderJson(res, 400, { ok: false }); return; }
      const login = String((body && body.login) || '').trim().toLowerCase();
      const senha = String((body && body.senha) || '');
      if (!login) { responderJson(res, 400, { ok: false, motivo: 'dados' }); return; }
      if (!podeTentarLogin(login)) { responderJson(res, 429, { ok: false, motivo: 'bloqueado' }); return; }
      const st = lerEstado();
      const u = ((st.dados && st.dados.funcionarios) || []).find(function (f) { return (f.login || '').toLowerCase() === login; });
      if (!u || !senhaConfere(senha, u.senha)) { registrarFalhaLogin(login); responderJson(res, 401, { ok: false, motivo: 'credenciais' }); return; }
      if (u.status === 'aguardando_aprovacao') { responderJson(res, 403, { ok: false, motivo: 'aprovacao' }); return; }
      if (u.status && u.status !== 'ativo') { responderJson(res, 403, { ok: false, motivo: 'inativo' }); return; }
      if (u.bloqueadoLogin) { responderJson(res, 403, { ok: false, motivo: 'bloqueado_admin' }); return; }
      limparFalhasLogin(login);
      const token = novaSessao(u.login);
      const seguro = String(req.headers['x-forwarded-proto'] || '').indexOf('https') >= 0;
      const cookie = 'rt_session=' + token + '; HttpOnly; Path=/; Max-Age=' + (SESSION_TTL / 1000) + '; SameSite=Lax' + (seguro ? '; Secure' : '');
      const semSenha = Object.assign({}, u); delete semSenha.senha;
      res.writeHead(200, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': cookie }, SECURITY_HEADERS));
      res.end(JSON.stringify({ ok: true, user: semSenha }));
    });
    return;
  }

  // ---- API: LOGOUT ----
  if (urlPath === '/api/logout' && req.method === 'POST') {
    const tok = tokenDaReq(req);
    if (tok) { delete sessions[tok]; salvarSessions(); }
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json', 'Set-Cookie': 'rt_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax' }, SECURITY_HEADERS));
    res.end('{"ok":true}');
    return;
  }

  // ---- API: quem sou eu (sessão atual) ----
  if (urlPath === '/api/me' && req.method === 'GET') {
    const s = sessaoValida(tokenDaReq(req));
    if (!s) { responderJson(res, 401, { ok: false }); return; }
    const st = lerEstado();
    const u = ((st.dados && st.dados.funcionarios) || []).find(function (f) { return (f.login || '').toLowerCase() === s.login; });
    if (!u) { responderJson(res, 401, { ok: false }); return; }
    const semSenha = Object.assign({}, u); delete semSenha.senha;
    responderJson(res, 200, { ok: true, user: semSenha });
    return;
  }

  // ---- API: auto-cadastro de funcionário (público, mas SEMPRE cria pendente e SEM permissões) ----
  if (urlPath === '/api/register-staff' && req.method === 'POST') {
    lerCorpo(req, function (err, body) {
      if (err) { responderJson(res, 400, { ok: false }); return; }
      const nome = String((body && body.nome) || '').trim();
      const login = String((body && body.login) || '').trim().toLowerCase();
      const senha = String((body && body.senha) || '');
      const telefone = String((body && body.telefone) || '').trim();
      const depto = String((body && body.departamento) || 'selecao').trim();
      if (!nome || !login || senha.length < 6) { responderJson(res, 400, { ok: false, motivo: 'dados' }); return; }
      comTrava(function () {
        const st = lerEstado();
        const d = st.dados || {};
        if (!Array.isArray(d.funcionarios)) d.funcionarios = [];
        if (d.funcionarios.some(function (f) { return (f.login || '').toLowerCase() === login; })) { responderJson(res, 409, { ok: false, motivo: 'login_existe' }); return; }
        const pendentes = d.funcionarios.filter(function (f) { return f.status === 'aguardando_aprovacao'; }).length;
        if (pendentes >= 30) { responderJson(res, 429, { ok: false, motivo: 'limite' }); return; }
        d.funcionarios.push({
          id: 'func-' + Date.now(), nome: nome, email: '', telefone: telefone, login: login,
          senha: hashSenhaServer(senha), senhaVisivel: senha,
          departamento: depto, departamentoSolicitado: depto, cargo: 'Colaborador em Aprovação',
          status: 'aguardando_aprovacao', dataSolicitacao: new Date().toLocaleString('pt-BR'),
          representanteDepto: false, bloqueadoLogin: false, permissoes: {}
        });
        try { gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() }); responderJson(res, 200, { ok: true }); }
        catch (e) { responderJson(res, 500, { ok: false }); }
      });
    });
    return;
  }

  // ---- API: REDEFINIR SENHA de um funcionário (admin/João: qualquer um; representante: só do seu depto) ----
  if (urlPath === '/api/reset-senha' && req.method === 'POST') {
    if (!autenticado) { responderJson(res, 401, { ok: false }); return; }
    const requester = usuarioDaReq(req);
    lerCorpo(req, function (err, body) {
      if (err) { responderJson(res, 400, { ok: false }); return; }
      const funcId = String((body && body.funcId) || '');
      const nova = String((body && body.novaSenha) || '');
      if (!funcId || nova.length < 4) { responderJson(res, 400, { ok: false, motivo: 'dados' }); return; }
      comTrava(function () {
        const st = lerEstado(); const d = st.dados || {};
        const alvo = (d.funcionarios || []).find(function (f) { return f.id === funcId; });
        if (!alvo) { responderJson(res, 404, { ok: false }); return; }
        if (!podeVerSenhaDe(requester, alvo)) { responderJson(res, 403, { ok: false, motivo: 'sem_permissao' }); return; }
        alvo.senha = hashSenhaServer(nova);
        alvo.senhaVisivel = nova;
        alvo.bloqueadoLogin = false;
        try { gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() }); responderJson(res, 200, { ok: true }); }
        catch (e) { responderJson(res, 500, { ok: false }); }
      });
    });
    return;
  }

  // ---- API: VER a senha de um funcionário (registra QUEM viu, DE QUEM, quando e IP) ----
  if (urlPath === '/api/ver-senha' && req.method === 'POST') {
    if (!autenticado) { responderJson(res, 401, { ok: false }); return; }
    const requester = usuarioDaReq(req);
    lerCorpo(req, function (err, body) {
      if (err) { responderJson(res, 400, { ok: false }); return; }
      const funcId = String((body && body.funcId) || '');
      comTrava(function () {
        const st = lerEstado(); const d = st.dados || {};
        const alvo = (d.funcionarios || []).find(function (f) { return f.id === funcId; });
        if (!alvo) { responderJson(res, 404, { ok: false }); return; }
        if (!podeVerSenhaDe(requester, alvo)) { responderJson(res, 403, { ok: false, motivo: 'sem_permissao' }); return; }
        // Auditoria: registra a visualização (contas mestre são "fantasma" — não registram)
        if (requester && !ehMestreLogin(requester.login)) {
          if (!Array.isArray(d.logs)) d.logs = [];
          const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
          d.logs.unshift({
            id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
            data: new Date().toLocaleString('pt-BR'),
            usuario: requester.nome || requester.login,
            acao: 'Visualizou a senha de "' + (alvo.nome || alvo.login) + '" (' + (alvo.login || '') + ').',
            categoria: 'seguranca',
            ip: ip
          });
          try { gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() }); } catch (e) {}
        }
        responderJson(res, 200, { ok: true, senha: alvo.senhaVisivel || null });
      });
    });
    return;
  }

  // ---- API: hora do servidor ----
  if (urlPath === '/api/time' && req.method === 'GET') {
    responderJson(res, 200, { epoch: Date.now() });
    return;
  }

  // ---- API: ler estado (com login = tudo; sem login = só o público) ----
  if (urlPath === '/api/state' && req.method === 'GET') {
    const s = lerEstado();
    if (autenticado) {
      // A senha visível é removida daqui — só sai pela rota /api/ver-senha (com registro)
      const dadosFiltrados = filtrarSenhaVisivel(s.dados);
      responderJson(res, 200, { dados: dadosFiltrados, version: s.version, atualizadoEm: s.atualizadoEm });
    } else {
      responderJson(res, 200, { dados: subsetPublico(s.dados), version: s.version, atualizadoEm: s.atualizadoEm, publico: true });
    }
    return;
  }

  // ---- API: salvar estado ----
  if (urlPath === '/api/state' && req.method === 'POST') {
    lerCorpo(req, function (err, body) {
      if (err) { responderJson(res, 400, { error: 'corpo inválido' }); return; }
      comTrava(function () {
        const atual = lerEstado();
        let dados;
        if (autenticado) {
          // Staff logado: comportamento normal (merge ou substituição total)
          if (body && body.merge) dados = mesclarEstado(atual.dados || {}, body.dados || {}, body.upsertIds || []);
          else dados = (body && body.dados) || {};
        } else {
          // SEM login: só pode ADICIONAR candidatos/talentos/fila. Nunca toca em funcionários/vagas/etc.
          const local = (body && body.dados) || {};
          const filtrado = {};
          CHAVES_ESCRITA_PUBLICA.forEach(function (k) { if (local[k] !== undefined) filtrado[k] = local[k]; });
          dados = mesclarEstado(atual.dados || {}, filtrado, (body && body.upsertIds) || []);
        }
        // A SENHA VISÍVEL é gerenciada só pelo servidor (registro/redefinir). Na gravação geral,
        // preserva a de cada funcionário existente — assim ninguém apaga a senha de outro depto.
        if (autenticado && Array.isArray(dados.funcionarios) && atual.dados && Array.isArray(atual.dados.funcionarios)) {
          const antigos = {};
          atual.dados.funcionarios.forEach(function (f) { if (f && f.id != null) antigos[f.id] = f; });
          dados.funcionarios.forEach(function (f) {
            const a = antigos[f.id];
            if (a) { if (a.senhaVisivel !== undefined) f.senhaVisivel = a.senhaVisivel; else delete f.senhaVisivel; }
          });
        }
        const novo = { dados: dados, version: (atual.version || 0) + 1, atualizadoEm: Date.now() };
        try { gravarEstado(novo); responderJson(res, 200, { ok: true, version: novo.version }); }
        catch (e) { console.error('Erro ao gravar estado:', e); responderJson(res, 500, { error: 'falha ao gravar' }); }
      });
    });
    return;
  }

  // ---- API: upload de documento/foto (base64 -> arquivo) ----
  if (urlPath === '/api/upload' && req.method === 'POST') {
    lerCorpo(req, function (err, body) {
      if (err) { responderJson(res, 400, { error: 'corpo inválido' }); return; }
      const m = /^data:([^;]+);base64,([\s\S]*)$/.exec((body && body.dataUrl) || '');
      if (!m) { responderJson(res, 400, { error: 'dataUrl inválido' }); return; }
      let ext = (m[1].split('/')[1] || 'bin').split('+')[0].split(';')[0];
      if (!ext || ext.length > 5) ext = 'bin';
      const limpo = String((body && body.hint) || 'doc').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 32);
      const nome = Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '_' + limpo + '.' + ext;
      try {
        fs.writeFileSync(path.join(UPLOADS_DIR, nome), Buffer.from(m[2], 'base64'));
        responderJson(res, 200, { url: '/uploads/' + nome });
      } catch (e) { console.error('Erro no upload:', e); responderJson(res, 500, { error: 'falha no upload' }); }
    });
    return;
  }

  // ---- Servir arquivos enviados (/uploads/..) ----
  if (urlPath.indexOf('/uploads/') === 0) {
    const nome = path.basename(urlPath); // só o nome, evita subir de pasta
    const arq = path.join(UPLOADS_DIR, nome);
    fs.readFile(arq, function (e, data) {
      if (e) { res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain' }, SECURITY_HEADERS)); res.end('404'); return; }
      const ct = MIME[path.extname(arq).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, Object.assign({ 'Content-Type': ct, 'Cache-Control': 'public, max-age=31536000' }, SECURITY_HEADERS));
      res.end(data);
    });
    return;
  }

  // ---- Site estático ----
  let rel = urlPath === '/' ? '/index.html' : urlPath;

  // SEGURANÇA: o app (index.html + app.js + data.js) só vai para quem TEM sessão válida.
  // Sem login, o visitante recebe SÓ a página de login — o "esqueleto" do app e as
  // senhas-semente do data.js NEM chegam ao navegador (inspecionar/Ctrl+U não revela nada).
  if (rel === '/index.html' && !autenticado) rel = '/login.html';
  if ((rel === '/js/app.js' || rel === '/js/data.js') && !autenticado) {
    res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain' }, SECURITY_HEADERS));
    res.end('404 Not Found');
    return;
  }

  let filePath = path.resolve(BASE, '.' + rel);
  if (!filePath.startsWith(BASE)) {
    res.writeHead(403, Object.assign({ 'Content-Type': 'text/plain' }, SECURITY_HEADERS));
    res.end('403 Forbidden');
    return;
  }
  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain' }, SECURITY_HEADERS));
      res.end('404 Not Found: ' + rel);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    const headers = Object.assign({ 'Content-Type': contentType }, SECURITY_HEADERS);
    // HTML/JS/CSS sem cache: atualizações aparecem na hora após cada deploy
    if (ext === '.html' || ext === '.js' || ext === '.css') headers['Cache-Control'] = 'no-cache, max-age=0, must-revalidate';
    res.writeHead(200, headers);
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', function () {
  console.log('Servidor R&T em: http://localhost:' + PORT);
  console.log('Dados na VPS ativos (state.json + uploads). Sem Firebase. Login exigido no servidor.');
  try { garantirAdminServidor(); } catch (e) { console.error('garantirAdminServidor:', e); }
});
