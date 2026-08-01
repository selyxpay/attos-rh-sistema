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

// Carrega o arquivo .env (se existir), SEM dependência externa. Só define o que
// ainda não veio do ambiente/PM2 — então variáveis do sistema continuam vencendo.
// Faz o WhatsApp (WHATSAPP_VERIFY_TOKEN/APP_SECRET) funcionar só criando o .env.
(function carregarDotEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(function (linha) {
      const m = linha.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m || linha.trim().charAt(0) === '#') return;
      if (process.env[m[1]] !== undefined) return;
      let v = m[2];
      if (v.length >= 2 && ((v[0] === '"' && v.slice(-1) === '"') || (v[0] === "'" && v.slice(-1) === "'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    });
    console.log('[RT] .env carregado.');
  } catch (e) { console.error('[RT] Falha ao ler .env:', e.message); }
})();

const PORT = Number(process.env.PORT) || 3000;
const BASE = path.resolve(__dirname);
const DATA_DIR = process.env.DATA_DIR || path.join(BASE, 'server-data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const LIMITE_CORPO = 48 * 1024 * 1024;  // 48 MB. O corpo inteiro e montado na MEMORIA (data += chunk);
// 500 MB viravam ~1 GB de RAM e derrubariam a VPS. 48 MB comporta 1 arquivo de 20 MB em base64 (~27 MB) com folga.

// Garante as pastas de dados
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (e) {}
try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch (e) {}

// Rede de proteção dos dados críticos (Entrega/Devolução de Equipamentos).
// Módulo isolado: se ele falhar, o sistema continua salvando normalmente.
let equipProtecao = null;
try {
  equipProtecao = require('./equipamentos-protecao.cjs');
  equipProtecao.iniciar(DATA_DIR);
  console.log('[Equip-Proteção] ativa em:', path.join(DATA_DIR, 'equipamentos'));
} catch (e) {
  console.error('[Equip-Proteção] não carregou (sistema segue normal):', e.message);
  equipProtecao = null;
}

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
  try { fazerBackupSePreciso(); } catch (e) { /* backup nunca pode derrubar o save */ }
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, STATE_FILE); // troca atômica: nunca deixa arquivo pela metade
  // Espelho independente dos equipamentos (cópia própria + snapshot). Fica
  // DEPOIS da gravação e em try/catch: nunca pode atrapalhar o save principal.
  if (equipProtecao) {
    try { equipProtecao.espelhar(obj && obj.dados); } catch (e) {
      console.error('[Equip-Proteção] espelho falhou (dados principais estão salvos):', e.message);
    }
  }
}

// ── BACKUP AUTOMÁTICO (rede de segurança contra perda de dados) ─────────────
// Antes de sobrescrever, guarda uma cópia do state.json ATUAL. Faz no máximo 1
// backup por hora, em 24 slots horários + 7 slots diários (nº fixo de arquivos,
// não cresce sem parar). Assim sempre dá para restaurar até ~1 semana atrás.
let _ultimoBackupHora = '';
function fazerBackupSePreciso() {
  const agora = new Date();
  const carimboHora = agora.toISOString().slice(0, 13);   // "2026-07-25T14"
  if (carimboHora === _ultimoBackupHora) return;          // já fez backup nesta hora
  if (!fs.existsSync(STATE_FILE)) return;                  // nada para copiar ainda
  const conteudo = fs.readFileSync(STATE_FILE);
  if (!conteudo || conteudo.length < 2) return;            // não faz backup de estado vazio
  _ultimoBackupHora = carimboHora;
  const hh = String(agora.getHours()).padStart(2, '0');
  fs.writeFileSync(path.join(BACKUP_DIR, 'state-hora-' + hh + '.json'), conteudo);
  fs.writeFileSync(path.join(BACKUP_DIR, 'state-dia-' + agora.getDay() + '.json'), conteudo);
}

// Junta os IDs de todas as listas do estado (para o "upsert de tudo" do guarda anti-perda)
function _todosIds(dados) {
  const ids = [];
  Object.keys(dados || {}).forEach(function (k) {
    const v = dados[k];
    if (Array.isArray(v)) v.forEach(function (it) { if (it && it.id != null) ids.push(it.id); });
  });
  return ids;
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
    'exataDominios', 'exataTransformacoes', 'tiposContratacao', 'comissao', 'comissoes', 'relatorios', 'notificacoes']
    .forEach(function (k) { delete d[k]; });
  // Candidatos e banco de talentos: some com os dados (privacidade), mas mantém
  // os arrays VAZIOS para as páginas públicas não quebrarem ao adicionar um novo.
  d.candidatos = [];
  d.bancoTalentos = [];
  if (Array.isArray(d.vagas)) {
    d.vagas = d.vagas.filter(function (v) { return !v.excluido; }).map(function (v) {
      const c = Object.assign({}, v);
      ['exataCampos', 'exataExtras', 'exataTransformacoes', 'funcaoCodigo', 'cbo', 'vinculo', 'codigoTipoContrato',
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
    let d = st.dados || {};
    let mudou = false;

    if (!Array.isArray(d.funcionarios)) {
      d.funcionarios = [];
      mudou = true;
    }

    // Carrega contas iniciais e outros dados mock do data.js para o servidor (state.json)
    try {
      const vm = require('vm');
      const dataPath = path.join(BASE, 'js', 'data.js');
      if (fs.existsSync(dataPath)) {
        const content = fs.readFileSync(dataPath, 'utf8');
        const sandbox = {};
        const initial = vm.runInNewContext(content + '\n;INITIAL_DATA;', sandbox);
        if (initial && typeof initial === 'object') {
          // Se o estado estiver vazio ou sem vagas/empresas, inicializa com todos os mocks
          if (!d.vagas || d.vagas.length === 0) {
            Object.keys(initial).forEach(function (k) {
              if (d[k] === undefined || (Array.isArray(d[k]) && d[k].length === 0)) {
                d[k] = JSON.parse(JSON.stringify(initial[k]));
                mudou = true;
              }
            });
            console.log('[RT] Dados mock iniciais importados de data.js.');
          }

          // Sincroniza cada funcionário do data.js para o state.json do servidor
          if (Array.isArray(initial.funcionarios)) {
            initial.funcionarios.forEach(function (fInit) {
              const existe = d.funcionarios.some(function (f) {
                return (f.login || '').toLowerCase() === (fInit.login || '').toLowerCase();
              });
              if (!existe) {
                d.funcionarios.push(JSON.parse(JSON.stringify(fInit)));
                mudou = true;
                console.log('[RT] Conta importada para o servidor:', fInit.login);
              }
            });
          }
        }
      }
    } catch (e) {
      console.error('[RT] Erro ao sincronizar com data.js:', e);
    }

    const existeAdmin = d.funcionarios.some(function (f) { return (f.login || '').toLowerCase() === 'admin'; });
    if (!existeAdmin) {
      d.funcionarios.push({
        id: 'func-admin', nome: 'Administrador', login: 'admin',
        senha: '6101ed3e13dcdc5ea80901f4c5e1c9152d55b33b077b9f0b6ec30e72bf082e08', // gruport07072026
        departamento: 'administracao', status: 'ativo', permissoes: {}
      });
      mudou = true;
      console.log('[RT] Conta admin criada.');
    }

    if (mudou) {
      gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() });
    }

    // Exibe lista amigável de usuários e senhas para o desenvolvedor local no console
    console.log('\n==================================================');
    console.log('CONTAS E SENHAS DISPONÍVEIS NO SERVIDOR:');
    d.funcionarios.forEach(function (f) {
      const senhaExibida = f.login === 'admin' ? 'gruport07072026' : (f.senha.length === 64 ? '(SHA-256)' : f.senha);
      console.log(` - Login: ${f.login.padEnd(12)} | Senha: ${senhaExibida.padEnd(18)} | Departamento: ${f.departamento}`);
    });
    console.log('==================================================\n');
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
// ==========================================================================
// PEDIDOS DE REDEFINIÇÃO DE SENHA (com aprovação do admin)
// Ficam em arquivo PRÓPRIO, fora do state.json. Assim o token secreto nunca
// viaja junto com os dados que todo funcionário logado recebe.
// ==========================================================================
const PEDIDOS_FILE = path.join(DATA_DIR, 'pedidos-senha.json');
const TTL_APROVACAO = 30 * 60 * 1000;        // aprovação vale 30 min
const TTL_PEDIDO    = 24 * 60 * 60 * 1000;   // pedido some depois de 24 h
const MAX_PENDENTES = 20;

let pedidos = [];
try { pedidos = JSON.parse(fs.readFileSync(PEDIDOS_FILE, 'utf8')) || []; } catch (e) { pedidos = []; }
function salvarPedidos() { try { fs.writeFileSync(PEDIDOS_FILE, JSON.stringify(pedidos)); } catch (e) {} }

function limparPedidos() {
  const agora = Date.now();
  pedidos.forEach(function (p) {
    if (p.status === 'aprovada' && (agora - (p.aprovadoEm || 0)) > TTL_APROVACAO) p.status = 'expirada';
  });
  pedidos = pedidos.filter(function (p) { return (agora - (p.criadoEm || 0)) < TTL_PEDIDO; });
}

function filtrarSenhaVisivel(dados) {
  if (!dados || !Array.isArray(dados.funcionarios)) return dados;
  dados.funcionarios = dados.funcionarios.map(function (f) {
    if (!f) return f;
    const c = Object.assign({}, f);
    // A senha em si NUNCA sai junto com o estado — só pelo /api/ver-senha (que audita).
    delete c.senhaVisivel;
    // Vai só um SIM/NÃO, para a tela indicar de quem já dá para consultar a senha.
    const armazenada = String(f.senha || '');
    const ehHash = armazenada.length === 64 && /^[0-9a-f]{64}$/i.test(armazenada);
    c.senhaConhecida = !!f.senhaVisivel || (!!armazenada && !ehHash);
    return c;
  });
  return dados;
}

// ==========================================================================
// MÓDULO WHATSAPP — INICIALIZAÇÃO
// ==========================================================================
const waDb      = require('./whatsapp-db.cjs');
const waApi     = require('./whatsapp-api.cjs');
const waWebhook = require('./whatsapp-webhook.cjs');

// Variáveis de ambiente do WhatsApp
const WA_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';
const WA_APP_SECRET   = process.env.WHATSAPP_APP_SECRET   || '';

// SSE: clientes conectados para atualizações em tempo real
const _sseClients = new Set();
function notifySSEClients(data) {
  const payload = 'data: ' + JSON.stringify(data) + '\n\n';
  _sseClients.forEach(function (client) {
    try { client.res.write(payload); } catch (e) { _sseClients.delete(client); }
  });
}

// Inicializa o banco de dados WhatsApp (assíncrono)
let _waReady = false;
(async function initWhatsApp() {
  try {
    await waDb.init(DATA_DIR);
    _waReady = true;
    console.log('[WhatsApp] Banco de dados inicializado:', waDb.getDbPath());
    // Inicia limpeza periódica de eventos antigos do webhook
    waWebhook.startCleanup(waDb, 6 * 60 * 60 * 1000);
  } catch (e) {
    console.error('[WhatsApp] Erro ao inicializar banco:', e.message);
  }
})();

// Salva o banco WhatsApp ANTES de encerrar (Ctrl+C, restart do PM2, deploy).
// Sem isto, as gravações que ainda estavam no debounce de 500ms se perderiam
// quando o processo é encerrado. salvarImediato() é síncrono (writeFileSync).
let _waEncerrando = false;
['SIGINT', 'SIGTERM'].forEach(function (sig) {
  process.on(sig, function () {
    if (_waEncerrando) return;
    _waEncerrando = true;
    try { if (_waReady) waDb.salvarImediato(); } catch (e) {}
    process.exit(0);
  });
});

// Helpers de permissão WhatsApp (reutilizam o sistema existente)
function waUsuarioTemPermissao(req, acao) {
  var s = sessaoValida(tokenDaReq(req));
  if (!s) return null;
  var st = lerEstado();
  var u = ((st.dados && st.dados.funcionarios) || []).find(function (f) { return (f.login || '').toLowerCase() === s.login; });
  if (!u) return null;
  if (ehMestreLogin(u.login)) return u;
  if (u.departamento === 'administracao') return u;
  if (u.permissoes && u.permissoes.whatsapp && u.permissoes.whatsapp[acao] === true) return u;
  return null;
}

// ── MULTI-CONTA: quem administra as conexões e quais contas cada um pode ver ──
// Admin do WhatsApp = mestre (João Balaf), Administração, ou permissão 'aprovar'.
// Só o admin cria/edita/ativa conexões e enxerga todas as contas.
function waEhAdminWhatsapp(u) {
  return !!(u && (ehMestreLogin(u.login) || u.departamento === 'administracao' || (u.permissoes && u.permissoes.whatsapp && u.permissoes.whatsapp.aprovar === true)));
}
// IDs das contas que o usuário pode acessar. Admin => null (todas). Funcionário
// comum => só as contas em que ele é o responsável. Usado para blindar as
// conversas: ninguém vê/atende/atua numa conta que não é sua.
function waContasPermitidas(u) {
  if (waEhAdminWhatsapp(u)) return null;                 // null = sem restrição (todas)
  try { return waDb.accounts.idsDoResponsavel(u.login); } catch (e) { return []; }
}
function waPodeAcessarConta(u, accountId) {
  var ids = waContasPermitidas(u);
  if (ids === null) return true;
  return ids.indexOf(Number(accountId)) >= 0;
}
// Usuário logado (objeto do funcionário) sem exigir uma ação específica.
function waUsuarioLogado(req) {
  var s = sessaoValida(tokenDaReq(req));
  if (!s) return null;
  var st = lerEstado();
  return ((st.dados && st.dados.funcionarios) || []).find(function (f) { return (f.login || '').toLowerCase() === s.login; }) || null;
}
function waIpDaReq(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}
// Lê corpo como texto puro (para validar assinatura do webhook)
function lerCorpoBruto(req, cb) {
  var data = [];
  var tamanho = 0;
  req.on('data', function (chunk) {
    tamanho += chunk.length;
    if (tamanho > 5 * 1024 * 1024) { cb(new Error('corpo muito grande')); req.destroy(); return; }
    data.push(chunk);
  });
  req.on('end', function () { cb(null, Buffer.concat(data)); });
  req.on('error', function (e) { cb(e); });
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
      // Contas MESTRE (joaobalaf/admin) NUNCA são bloqueadas por status — sempre entram para administrar.
      if (!ehMestreLogin(u.login)) {
        if (u.status === 'aguardando_aprovacao') { responderJson(res, 403, { ok: false, motivo: 'aprovacao' }); return; }
        if (u.status && u.status !== 'ativo') { responderJson(res, 403, { ok: false, motivo: 'inativo' }); return; }
        if (u.bloqueadoLogin) { responderJson(res, 403, { ok: false, motivo: 'bloqueado_admin' }); return; }
      }
      limparFalhasLogin(login);

      // Contas antigas guardam só o hash da senha (que é irreversível). Aqui, no login,
      // é o ÚNICO momento em que o servidor vê a senha em texto — então guardamos, para
      // o admin conseguir consultar depois. A pessoa NÃO precisa trocar de senha.
      if (!u.senhaVisivel) {
        comTrava(function () {
          const st2 = lerEstado();
          const d2 = st2.dados || {};
          const alvo = (d2.funcionarios || []).find(function (f) { return (f.login || '').toLowerCase() === login; });
          if (alvo && !alvo.senhaVisivel) {
            alvo.senhaVisivel = senha;
            try { gravarEstado({ dados: d2, version: (st2.version || 0) + 1, atualizadoEm: Date.now() }); } catch (e) {}
          }
        });
      }

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
  // ---- O próprio usuário troca a SUA senha (precisa saber a senha atual) ----
  if (urlPath === '/api/trocar-senha' && req.method === 'POST') {
    if (!autenticado) { responderJson(res, 401, { ok: false }); return; }
    const requester = usuarioDaReq(req);
    if (!requester) { responderJson(res, 401, { ok: false }); return; }
    lerCorpo(req, function (err, body) {
      if (err) { responderJson(res, 400, { ok: false }); return; }
      const atual = String((body && body.senhaAtual) || '');
      const nova  = String((body && body.senhaNova) || '');
      if (!atual || nova.length < 6) { responderJson(res, 400, { ok: false, motivo: 'dados' }); return; }

      comTrava(function () {
        const st = lerEstado(); const d = st.dados || {};
        const u = (d.funcionarios || []).find(function (f) {
          return (f.login || '').toLowerCase() === (requester.login || '').toLowerCase();
        });
        if (!u) { responderJson(res, 404, { ok: false }); return; }

        // A "senha atual" é a que estiver valendo agora — inclusive se o admin acabou
        // de redefinir. Quem troca é sempre o dono da conta.
        if (!senhaConfere(atual, u.senha)) { responderJson(res, 403, { ok: false, motivo: 'senha_atual' }); return; }
        if (senhaConfere(nova, u.senha))   { responderJson(res, 400, { ok: false, motivo: 'igual' }); return; }

        u.senha = hashSenhaServer(nova);
        u.senhaVisivel = nova;   // o admin continua conseguindo consultar

        if (!Array.isArray(d.logs)) d.logs = [];
        d.logs.unshift({
          id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          data: new Date().toLocaleString('pt-BR'),
          usuario: u.nome || u.login,
          acao: 'Trocou a própria senha.',
          categoria: 'seguranca'
        });
        try { gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() }); } catch (e) {}
        responderJson(res, 200, { ok: true });
      });
    });
    return;
  }

  // ---- O próprio usuário escolhe como o nome dele aparece na tela ----
  if (urlPath === '/api/nome-exibicao' && req.method === 'POST') {
    if (!autenticado) { responderJson(res, 401, { ok: false }); return; }
    const requester = usuarioDaReq(req);
    if (!requester) { responderJson(res, 401, { ok: false }); return; }
    lerCorpo(req, function (err, body) {
      if (err) { responderJson(res, 400, { ok: false }); return; }
      const nomeExibicao = String((body && body.nomeExibicao) || '').trim().slice(0, 60);
      comTrava(function () {
        const st = lerEstado(); const d = st.dados || {};
        const u = (d.funcionarios || []).find(function (f) {
          return (f.login || '').toLowerCase() === (requester.login || '').toLowerCase();
        });
        if (!u) { responderJson(res, 404, { ok: false }); return; }
        // Só mexe na PRÓPRIA conta. O nome real (usado em auditoria) não muda.
        u.nomeExibicao = nomeExibicao;
        try { gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() }); } catch (e) {}
        responderJson(res, 200, { ok: true, nomeExibicao: nomeExibicao });
      });
    });
    return;
  }

  // ---- 1) A pessoa pede para redefinir a senha (tela de login, sem estar logada) ----
  if (urlPath === '/api/solicitar-senha' && req.method === 'POST') {
    lerCorpo(req, function (err, body) {
      if (err) { responderJson(res, 400, { ok: false }); return; }
      const login = String((body && body.login) || '').trim().toLowerCase();
      if (!login) { responderJson(res, 400, { ok: false, motivo: 'dados' }); return; }

      limparPedidos();
      const token = crypto.randomBytes(24).toString('hex');
      const st = lerEstado();
      const u = (((st.dados || {}).funcionarios) || []).find(function (f) { return (f.login || '').toLowerCase() === login; });

      // Contas MESTRE não usam este fluxo (são justamente quem aprova).
      const pendentes = pedidos.filter(function (p) { return p.status === 'pendente'; }).length;
      if (u && !ehMestreLogin(u.login) && pendentes < MAX_PENDENTES) {
        // Um pedido pendente por pessoa: o novo substitui o anterior.
        pedidos = pedidos.filter(function (p) { return !(p.login === login && p.status === 'pendente'); });
        pedidos.unshift({
          id: 'sol-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          token: token, login: login, nome: u.nome || login,
          departamento: u.departamento || '',
          status: 'pendente', criadoEm: Date.now(), aprovadoPor: '', aprovadoEm: 0
        });
        salvarPedidos();
      }
      // Resposta SEMPRE igual: não revelamos se o usuário existe (evita descobrir logins).
      responderJson(res, 200, { ok: true, token: token });
    });
    return;
  }

  // ---- 2) A tela de espera pergunta, de tempos em tempos, se já foi aprovado ----
  if (urlPath === '/api/status-senha' && req.method === 'GET') {
    limparPedidos();
    const q = req.url.indexOf('?') >= 0 ? req.url.slice(req.url.indexOf('?') + 1) : '';
    const token = decodeURIComponent((/(?:^|&)token=([^&]*)/.exec(q) || [])[1] || '');
    const p = pedidos.find(function (x) { return x.token === token; });
    // Token desconhecido responde "pendente" — assim não dá para descobrir nada por aqui.
    responderJson(res, 200, { ok: true, status: p ? p.status : 'pendente' });
    return;
  }

  // ---- 3) O admin aprova ou recusa, pelo painel ----
  if (urlPath === '/api/aprovar-senha' && req.method === 'POST') {
    if (!autenticado) { responderJson(res, 401, { ok: false }); return; }
    const requester = usuarioDaReq(req);
    if (!veTodasAsSenhas(requester)) { responderJson(res, 403, { ok: false, motivo: 'sem_permissao' }); return; }
    lerCorpo(req, function (err, body) {
      if (err) { responderJson(res, 400, { ok: false }); return; }
      const id = String((body && body.id) || '');
      const recusar = String((body && body.acao) || '') === 'recusar';
      limparPedidos();
      const p = pedidos.find(function (x) { return x.id === id; });
      if (!p) { responderJson(res, 404, { ok: false }); return; }
      if (p.status !== 'pendente') { responderJson(res, 409, { ok: false, motivo: 'ja_tratada' }); return; }

      p.status = recusar ? 'recusada' : 'aprovada';
      p.aprovadoPor = requester.nome || requester.login;
      p.aprovadoEm = Date.now();
      salvarPedidos();

      comTrava(function () {
        const st = lerEstado(); const d = st.dados || {};
        if (!Array.isArray(d.logs)) d.logs = [];
        d.logs.unshift({
          id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          data: new Date().toLocaleString('pt-BR'),
          usuario: requester.nome || requester.login,
          acao: (recusar ? 'Recusou' : 'Liberou') + ' a redefinição de senha de "' + p.nome + '" (' + p.login + ').',
          categoria: 'seguranca'
        });
        try { gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() }); } catch (e) {}
      });
      responderJson(res, 200, { ok: true });
    });
    return;
  }

  // ---- Lista os pedidos para o painel do admin (sem os tokens) ----
  if (urlPath === '/api/solicitacoes-senha' && req.method === 'GET') {
    if (!autenticado) { responderJson(res, 401, { ok: false }); return; }
    const requester = usuarioDaReq(req);
    if (!veTodasAsSenhas(requester)) { responderJson(res, 403, { ok: false }); return; }
    limparPedidos();
    responderJson(res, 200, {
      ok: true,
      pedidos: pedidos.map(function (p) {
        return { id: p.id, nome: p.nome, login: p.login, departamento: p.departamento,
                 status: p.status, criadoEm: p.criadoEm, aprovadoPor: p.aprovadoPor, aprovadoEm: p.aprovadoEm };
      })
    });
    return;
  }

  // ---- 4) Aprovado: a pessoa define a nova senha (só com o token do pedido dela) ----
  if (urlPath === '/api/definir-senha' && req.method === 'POST') {
    lerCorpo(req, function (err, body) {
      if (err) { responderJson(res, 400, { ok: false }); return; }
      const token = String((body && body.token) || '');
      const nova = String((body && body.senha) || '');
      if (!token || nova.length < 6) { responderJson(res, 400, { ok: false, motivo: 'dados' }); return; }

      limparPedidos();
      const p = pedidos.find(function (x) { return x.token === token; });
      if (!p) { responderJson(res, 403, { ok: false, motivo: 'nao_aprovada' }); return; }
      if (p.status === 'expirada') { responderJson(res, 403, { ok: false, motivo: 'expirada' }); return; }
      if (p.status !== 'aprovada') { responderJson(res, 403, { ok: false, motivo: 'nao_aprovada' }); return; }

      comTrava(function () {
        const st = lerEstado(); const d = st.dados || {};
        const u = ((d.funcionarios) || []).find(function (f) { return (f.login || '').toLowerCase() === p.login; });
        if (!u) { responderJson(res, 404, { ok: false }); return; }

        u.senha = hashSenhaServer(nova);
        u.senhaVisivel = nova;          // o admin continua conseguindo consultar
        u.bloqueadoLogin = false;

        if (!Array.isArray(d.logs)) d.logs = [];
        d.logs.unshift({
          id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          data: new Date().toLocaleString('pt-BR'),
          usuario: u.nome || u.login,
          acao: 'Redefiniu a própria senha (liberado por ' + (p.aprovadoPor || '—') + ').',
          categoria: 'seguranca'
        });
        try { gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() }); } catch (e) {}

        p.status = 'concluida';
        p.concluidoEm = Date.now();
        salvarPedidos();
        limparFalhasLogin(p.login);     // destrava eventual bloqueio por erro de senha
        responderJson(res, 200, { ok: true, login: p.login });
      });
    });
    return;
  }

  if (urlPath === '/api/register-staff' && req.method === 'POST') {
    lerCorpo(req, function (err, body) {
      if (err) { responderJson(res, 400, { ok: false }); return; }
      const nome = String((body && body.nome) || '').trim();
      const login = String((body && body.login) || '').trim().toLowerCase();
      const senha = String((body && body.senha) || '');
      const telefone = String((body && body.telefone) || '').trim();
      const depto = String((body && body.departamento) || 'selecao').trim();
      // Nome da clínica/instituição — só faz sentido para o departamento "clinica"
      const instituicao = depto === 'clinica' ? String((body && body.instituicao) || '').trim().slice(0, 120) : '';
      if (!nome || !login || senha.length < 6) { responderJson(res, 400, { ok: false, motivo: 'dados' }); return; }
      if (depto === 'clinica' && !instituicao) { responderJson(res, 400, { ok: false, motivo: 'dados' }); return; }
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
          instituicao: instituicao,
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

        let precisaGravar = false;

        // A senha pode vir de três situações diferentes:
        //  1) senhaVisivel guardada (cadastro novo, redefinição, ou login já capturado);
        //  2) conta ANTIGA com a senha em texto puro no campo 'senha' (antes do hash) —
        //     dá para revelar e já aproveitamos para guardar em senhaVisivel;
        //  3) só o hash SHA-256: é via de mão única, NÃO tem como reverter. Nesse caso a
        //     senha aparece sozinha assim que a pessoa fizer o próximo login (o servidor
        //     captura no /api/login). Ela não precisa trocar de senha.
        let senhaRevelada = alvo.senhaVisivel || null;
        let motivo = null;

        if (!senhaRevelada) {
          const armazenada = String(alvo.senha || '');
          const ehHash = armazenada.length === 64 && /^[0-9a-f]{64}$/i.test(armazenada);
          if (armazenada && !ehHash) {
            senhaRevelada = armazenada;
            alvo.senhaVisivel = armazenada;
            precisaGravar = true;
          } else {
            motivo = 'aguardando_login';
          }
        }

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
          precisaGravar = true;
        }

        if (precisaGravar) {
          try { gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() }); } catch (e) {}
        }

        responderJson(res, 200, { ok: true, senha: senhaRevelada, motivo: motivo });
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
          if (body && body.merge) {
            dados = mesclarEstado(atual.dados || {}, body.dados || {}, body.upsertIds || []);
          } else {
            // GUARDA ANTI-PERDA: se o cliente salvou baseado numa versão MAIS
            // ANTIGA que a atual (outra pessoa gravou nesse meio-tempo), NÃO
            // substitui cegamente — senão apagaria o que a outra acabou de
            // cadastrar. Aplica TODAS as alterações deste cliente (upsert de
            // tudo que ele mandou) e PRESERVA os registros que ele ainda não
            // tinha. Assim nenhum cadastro some por concorrência.
            const base = (body && body.baseVersion != null) ? Number(body.baseVersion) : null;
            if (base != null && base < (atual.version || 0)) {
              console.log('[RT] Save desatualizado (base ' + base + ' < atual ' + atual.version + ') — merge anti-perda aplicado.');
              dados = mesclarEstado(atual.dados || {}, body.dados || {}, _todosIds(body.dados || {}));
            } else {
              dados = (body && body.dados) || {};
            }
          }
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
        // GUARDA ANTI-SUMIÇO: última barreira antes de gravar. Se este save
        // faria vários registros críticos (equipamentos, candidatos...) sumirem
        // de uma vez, eles são devolvidos; exclusão pontual segue funcionando,
        // mas com cópia arquivada. Nunca derruba o save.
        if (equipProtecao) {
          try {
            const prot = equipProtecao.protegerSave(atual.dados || {}, dados);
            dados = prot.dados;
            (prot.avisos || []).forEach(function (a) {
              console.log('[Equip-Proteção] ' + a.lista + ': ' + a.acao + ' — ' + a.detalhe);
            });
          } catch (e) {
            console.error('[Equip-Proteção] guarda falhou (save segue normal):', e.message);
          }
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

  // ==========================================================================
  // ROTAS DO MÓDULO WHATSAPP
  // ==========================================================================

  // ---- WEBHOOK: Verificação (GET) — pública, sem login ----
  if (urlPath === '/webhooks/whatsapp' && req.method === 'GET') {
    if (!WA_VERIFY_TOKEN) { responderJson(res, 500, { error: 'WHATSAPP_VERIFY_TOKEN não configurado.' }); return; }
    waWebhook.handleVerification(req, res, WA_VERIFY_TOKEN);
    return;
  }

  // ---- WEBHOOK: Recepção de eventos (POST) — pública, validada por assinatura ----
  if (urlPath === '/webhooks/whatsapp' && req.method === 'POST') {
    lerCorpoBruto(req, function (err, rawBody) {
      if (err) { res.writeHead(400); res.end('Bad Request'); return; }
      // Valida assinatura
      var signature = req.headers['x-hub-signature-256'] || '';
      if (WA_APP_SECRET && !waWebhook.validateSignature(rawBody, signature, WA_APP_SECRET)) {
        console.warn('[WhatsApp Webhook] Assinatura inválida.');
        res.writeHead(403); res.end('Forbidden'); return;
      }
      // Responde 200 imediatamente (Meta exige resposta rápida)
      res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('EVENT_RECEIVED');
      // Processa em background
      if (_waReady) {
        try {
          var body = JSON.parse(rawBody.toString('utf8'));
          waWebhook.processEvent(body, waDb, waApi, notifySSEClients).catch(function (e) {
            console.error('[WhatsApp Webhook] Erro ao processar evento:', e.message);
          });
        } catch (e) { console.error('[WhatsApp Webhook] JSON inválido:', e.message); }
      }
    });
    return;
  }

  // ---- SSE: Atualizações em tempo real ----
  if (urlPath === '/api/whatsapp/events' && req.method === 'GET') {
    if (!reqAutenticada(req)) { responderJson(res, 401, { ok: false }); return; }
    var sseUser = waUsuarioTemPermissao(req, 'visualizar');
    if (!sseUser) { responderJson(res, 403, { ok: false }); return; }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
      'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'
    });
    res.write('data: {"type":"connected"}\n\n');
    var client = { res: res, login: sseUser.login };
    _sseClients.add(client);
    var heartbeat = setInterval(function () { try { res.write(': heartbeat\n\n'); } catch (e) { clearInterval(heartbeat); _sseClients.delete(client); } }, 30000);
    req.on('close', function () { clearInterval(heartbeat); _sseClients.delete(client); });
    return;
  }

  // ---- Todas as rotas /api/whatsapp/* exigem login + módulo pronto ----
  if (urlPath.indexOf('/api/whatsapp/') === 0) {
    if (!_waReady) { responderJson(res, 503, { ok: false, error: 'Módulo WhatsApp inicializando...' }); return; }
    if (!autenticado) { responderJson(res, 401, { ok: false, error: 'Não autenticado.' }); return; }

    // BLINDAGEM MULTI-CONTA: qualquer rota que age sobre UMA conversa específica
    // (/conversations/<id>...) só prossegue se o usuário puder acessar a conta
    // daquela conversa. Ninguém abre/atende conversa de uma conta que não é sua.
    var _mConv = urlPath.match(/^\/api\/whatsapp\/conversations\/(\d+)(?:\/|$)/);
    if (_mConv) {
      var _uGuard = waUsuarioLogado(req);
      if (_uGuard && !waEhAdminWhatsapp(_uGuard)) {
        var _convGuard = waDb.conversations.getById(parseInt(_mConv[1]));
        if (_convGuard && !waPodeAcessarConta(_uGuard, _convGuard.account_id)) {
          responderJson(res, 403, { ok: false, error: 'Você não tem acesso à conta desta conversa.' });
          return;
        }
      }
    }

    // ---- DASHBOARD ----
    if (urlPath === '/api/whatsapp/dashboard' && req.method === 'GET') {
      var u = waUsuarioTemPermissao(req, 'visualizar');
      if (!u) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      responderJson(res, 200, { ok: true, stats: waDb.dashboardStats() });
      return;
    }

    // ---- CONTAS ----
    if (urlPath === '/api/whatsapp/accounts' && req.method === 'GET') {
      var u = waUsuarioTemPermissao(req, 'visualizar');
      if (!u) { responderJson(res, 403, { ok: false }); return; }
      // Admin vê todas; funcionário comum vê só as contas em que é responsável.
      var _todasContas = waDb.accounts.list();   // já vem SEM o access_token (só has_token)
      var _contasResp = waEhAdminWhatsapp(u) ? _todasContas : _todasContas.filter(function (a) { return a.responsavel_login === u.login; });
      responderJson(res, 200, { ok: true, accounts: _contasResp, is_admin: waEhAdminWhatsapp(u) });
      return;
    }
    if (urlPath === '/api/whatsapp/accounts' && req.method === 'POST') {
      var u = waUsuarioTemPermissao(req, 'aprovar');
      if (!u) { responderJson(res, 403, { ok: false, error: 'Apenas administradores podem gerenciar contas.' }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false }); return; }
        try {
          var id = waDb.accounts.create({
            phone_number_id: body.phone_number_id || '',
            waba_id: body.waba_id || '',
            display_phone: body.display_phone || '',
            business_name: body.business_name || '',
            status: 'pendente',
            access_token_enc: body.access_token || '',
            created_by: u.login,
            responsavel_login: body.responsavel_login || '',
            responsavel_nome: body.responsavel_nome || '',
            ativo: (body.ativo === undefined ? 1 : (body.ativo ? 1 : 0))
          });
          waDb.audit.log({ user_login: u.login, user_name: u.nome, action: 'Conectou conta WhatsApp', details: 'Número: ' + (body.display_phone || body.phone_number_id), ip: waIpDaReq(req), account_id: id });
          responderJson(res, 200, { ok: true, id: id });
        } catch (e) { responderJson(res, 500, { ok: false, error: e.message }); }
      });
      return;
    }
    // Atualizar conta
    var matchAccountUpdate = urlPath.match(/^\/api\/whatsapp\/accounts\/(\d+)$/);
    if (matchAccountUpdate && req.method === 'PUT') {
      var u = waUsuarioTemPermissao(req, 'aprovar');
      if (!u) { responderJson(res, 403, { ok: false }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false }); return; }
        var accountId = parseInt(matchAccountUpdate[1]);
        var updateData = {};
        if (body.phone_number_id !== undefined) updateData.phone_number_id = body.phone_number_id;
        if (body.waba_id !== undefined) updateData.waba_id = body.waba_id;
        if (body.display_phone !== undefined) updateData.display_phone = body.display_phone;
        if (body.business_name !== undefined) updateData.business_name = body.business_name;
        if (body.status !== undefined) updateData.status = body.status;
        if (body.access_token !== undefined && body.access_token !== '') updateData.access_token_enc = body.access_token;
        if (body.responsavel_login !== undefined) updateData.responsavel_login = body.responsavel_login;
        if (body.responsavel_nome !== undefined) updateData.responsavel_nome = body.responsavel_nome;
        if (body.ativo !== undefined) updateData.ativo = body.ativo ? 1 : 0;
        waDb.accounts.update(accountId, updateData);
        waDb.audit.log({ user_login: u.login, user_name: u.nome, action: 'Atualizou conta WhatsApp', details: 'Account ID: ' + accountId, ip: waIpDaReq(req), account_id: accountId });
        responderJson(res, 200, { ok: true });
      });
      return;
    }
    // Status da conta (testa conexão com a Meta)
    var matchAccountStatus = urlPath.match(/^\/api\/whatsapp\/accounts\/(\d+)\/status$/);
    if (matchAccountStatus && req.method === 'GET') {
      var u = waUsuarioTemPermissao(req, 'visualizar');
      if (!u) { responderJson(res, 403, { ok: false }); return; }
      var accountId = parseInt(matchAccountStatus[1]);
      var account = waDb.accounts.getById(accountId);
      if (!account) { responderJson(res, 404, { ok: false, error: 'Conta não encontrada.' }); return; }
      if (!account.access_token_enc) {
        responderJson(res, 200, { ok: true, status: 'pendente', message: 'Access Token não configurado.' });
        return;
      }
      waApi.getPhoneInfo(account.phone_number_id, account.access_token_enc).then(function (info) {
        if (info.ok) {
          waDb.accounts.update(accountId, { status: 'connected', last_sync_at: new Date().toISOString() });
          responderJson(res, 200, { ok: true, status: 'connected', info: info.info });
        } else {
          waDb.accounts.update(accountId, { status: 'error' });
          responderJson(res, 200, { ok: true, status: 'error', message: info.error });
        }
      }).catch(function (e) {
        responderJson(res, 200, { ok: true, status: 'error', message: e.message });
      });
      return;
    }

    // ---- CONVERSAS ----
    if (urlPath === '/api/whatsapp/conversations' && req.method === 'GET') {
      var u = waUsuarioTemPermissao(req, 'visualizar');
      if (!u) { responderJson(res, 403, { ok: false }); return; }
      var query = req.url.indexOf('?') >= 0 ? req.url.slice(req.url.indexOf('?') + 1) : '';
      var qp = {}; query.split('&').forEach(function (p) { var kv = p.split('='); if (kv[0]) qp[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ''); });
      var filters = {};
      if (qp.status) filters.status = qp.status;
      if (qp.search) filters.search = qp.search;
      if (qp.assigned_to) filters.assigned_to = qp.assigned_to;
      if (qp.unread_only === 'true') filters.unread_only = true;
      if (qp.limit) filters.limit = parseInt(qp.limit);
      if (qp.offset) filters.offset = parseInt(qp.offset);
      // MULTI-CONTA: o funcionário comum vê só as conversas das contas em que ele
      // é o responsável. O admin vê tudo (ids null = sem restrição).
      var _idsPermitidos = waContasPermitidas(u);
      if (_idsPermitidos !== null) filters.account_ids = _idsPermitidos;
      // Filtro do seletor de conta no Inbox (só aplica se for uma conta permitida).
      if (qp.account_id) {
        var _accSel = parseInt(qp.account_id);
        if (waPodeAcessarConta(u, _accSel)) filters.account_id = _accSel;
      }
      var convs = waDb.conversations.list(filters);
      convs.forEach(function (c) { c.tags = waDb.tags.getForConversation(c.id); });
      responderJson(res, 200, { ok: true, conversations: convs, total: waDb.conversations.count(filters) });
      return;
    }
    // Conversa individual + mensagens
    var matchConv = urlPath.match(/^\/api\/whatsapp\/conversations\/(\d+)$/);
    if (matchConv && req.method === 'GET') {
      var u = waUsuarioTemPermissao(req, 'visualizar');
      if (!u) { responderJson(res, 403, { ok: false }); return; }
      var convId = parseInt(matchConv[1]);
      var conv = waDb.conversations.getById(convId);
      if (!conv) { responderJson(res, 404, { ok: false, error: 'Conversa não encontrada.' }); return; }
      conv.tags = waDb.tags.getForConversation(convId);
      var query = req.url.indexOf('?') >= 0 ? req.url.slice(req.url.indexOf('?') + 1) : '';
      var qp = {}; query.split('&').forEach(function (p) { var kv = p.split('='); if (kv[0]) qp[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ''); });
      var msgs = waDb.messages.listByConversation(convId, parseInt(qp.limit) || 50, parseInt(qp.offset) || 0);
      var totalMsgs = waDb.messages.countByConversation(convId);
      // Marca como lido ao abrir
      waDb.conversations.resetUnread(convId);
      responderJson(res, 200, { ok: true, conversation: conv, messages: msgs, total_messages: totalMsgs });
      return;
    }
    // Atribuir conversa
    var matchAssign = urlPath.match(/^\/api\/whatsapp\/conversations\/(\d+)\/assign$/);
    if (matchAssign && req.method === 'POST') {
      var u = waUsuarioTemPermissao(req, 'editar');
      if (!u) { responderJson(res, 403, { ok: false }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false }); return; }
        var convId = parseInt(matchAssign[1]);
        waDb.conversations.update(convId, { assigned_to: body.assigned_to || '', assigned_to_name: body.assigned_to_name || '' });
        waDb.audit.log({ user_login: u.login, user_name: u.nome, action: 'Atribuiu conversa', details: 'Conversa #' + convId + ' → ' + (body.assigned_to_name || body.assigned_to), ip: waIpDaReq(req), conversation_id: convId });
        notifySSEClients({ type: 'conversation_updated', conversation_id: convId, action: 'assigned' });
        responderJson(res, 200, { ok: true });
      });
      return;
    }
    // Fechar conversa
    var matchClose = urlPath.match(/^\/api\/whatsapp\/conversations\/(\d+)\/close$/);
    if (matchClose && req.method === 'POST') {
      var u = waUsuarioTemPermissao(req, 'editar');
      if (!u) { responderJson(res, 403, { ok: false }); return; }
      var convId = parseInt(matchClose[1]);
      waDb.conversations.update(convId, { status: 'closed', closed_at: new Date().toISOString() });
      waDb.audit.log({ user_login: u.login, user_name: u.nome, action: 'Fechou conversa', details: 'Conversa #' + convId, ip: waIpDaReq(req), conversation_id: convId });
      notifySSEClients({ type: 'conversation_updated', conversation_id: convId, action: 'closed' });
      responderJson(res, 200, { ok: true });
      return;
    }
    // Reabrir conversa
    var matchReopen = urlPath.match(/^\/api\/whatsapp\/conversations\/(\d+)\/reopen$/);
    if (matchReopen && req.method === 'POST') {
      var u = waUsuarioTemPermissao(req, 'editar');
      if (!u) { responderJson(res, 403, { ok: false }); return; }
      var convId = parseInt(matchReopen[1]);
      waDb.conversations.update(convId, { status: 'open', closed_at: null });
      waDb.audit.log({ user_login: u.login, user_name: u.nome, action: 'Reabriu conversa', details: 'Conversa #' + convId, ip: waIpDaReq(req), conversation_id: convId });
      notifySSEClients({ type: 'conversation_updated', conversation_id: convId, action: 'reopened' });
      responderJson(res, 200, { ok: true });
      return;
    }
    // Nota interna
    var matchNotes = urlPath.match(/^\/api\/whatsapp\/conversations\/(\d+)\/notes$/);
    if (matchNotes && req.method === 'POST') {
      var u = waUsuarioTemPermissao(req, 'criar');
      if (!u) { responderJson(res, 403, { ok: false }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false }); return; }
        var convId = parseInt(matchNotes[1]);
        var conv = waDb.conversations.getById(convId);
        if (!conv) { responderJson(res, 404, { ok: false }); return; }
        waDb.messages.create({
          conversation_id: convId, account_id: conv.account_id,
          wamid: 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          direction: 'outgoing', type: 'text', content: body.content || '',
          status: 'note', sender_name: u.nome || u.login, is_internal_note: true
        });
        responderJson(res, 200, { ok: true });
      });
      return;
    }
    // Tags da conversa
    var matchTags = urlPath.match(/^\/api\/whatsapp\/conversations\/(\d+)\/tags$/);
    if (matchTags && req.method === 'POST') {
      var u = waUsuarioTemPermissao(req, 'editar');
      if (!u) { responderJson(res, 403, { ok: false }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false }); return; }
        var convId = parseInt(matchTags[1]);
        if (body.action === 'add' && body.tag_id) { waDb.tags.addToConversation(convId, body.tag_id); }
        else if (body.action === 'remove' && body.tag_id) { waDb.tags.removeFromConversation(convId, body.tag_id); }
        responderJson(res, 200, { ok: true, tags: waDb.tags.getForConversation(convId) });
      });
      return;
    }

    // ---- ENVIAR MENSAGEM ----
    if (urlPath === '/api/whatsapp/messages/send' && req.method === 'POST') {
      var u = waUsuarioTemPermissao(req, 'criar');
      if (!u) { responderJson(res, 403, { ok: false, error: 'Sem permissão para enviar mensagens.' }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false }); return; }
        var convId = body.conversation_id;
        var conv = waDb.conversations.getById(convId);
        if (!conv) { responderJson(res, 404, { ok: false, error: 'Conversa não encontrada.' }); return; }
        // MULTI-CONTA: só envia por uma conta que é sua (garante o número certo).
        if (!waPodeAcessarConta(u, conv.account_id)) { responderJson(res, 403, { ok: false, error: 'Você não pode enviar por esta conta.' }); return; }
        var account = waDb.accounts.getById(conv.account_id);
        if (!account || !account.access_token_enc) {
          responderJson(res, 400, { ok: false, error: 'Conta WhatsApp não configurada ou sem Access Token.' });
          return;
        }
        if (account.ativo === 0) { responderJson(res, 400, { ok: false, error: 'Esta conexão está desativada.' }); return; }
        if (account.status !== 'connected' && account.status !== 'active') {
          responderJson(res, 400, { ok: false, error: 'Conta WhatsApp não está conectada. Status: ' + account.status });
          return;
        }
        var toPhone = conv.contact_phone;
        if (!toPhone) { responderJson(res, 400, { ok: false, error: 'Número de telefone do contato não encontrado.' }); return; }

        // Determina o tipo de mensagem
        var sendPromise;
        if (body.type === 'template') {
          sendPromise = waApi.sendTemplateMessage(account.phone_number_id, toPhone, body.template_name, body.template_language, body.template_components, account.access_token_enc);
        } else if (body.type === 'image' || body.type === 'document' || body.type === 'video' || body.type === 'audio') {
          sendPromise = waApi.sendMediaMessage(account.phone_number_id, toPhone, body.type, { link: body.media_url, id: body.media_id, filename: body.filename }, body.caption, account.access_token_enc);
        } else {
          if (!body.content || !body.content.trim()) { responderJson(res, 400, { ok: false, error: 'Mensagem vazia.' }); return; }
          sendPromise = waApi.sendTextMessage(account.phone_number_id, toPhone, body.content, account.access_token_enc);
        }

        sendPromise.then(function (result) {
          var msgId = waDb.messages.create({
            conversation_id: convId, account_id: account.id,
            wamid: result.wamid || ('local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
            direction: 'outgoing', type: body.type || 'text',
            content: body.content || body.caption || '', template_name: body.template_name || '',
            template_language: body.template_language || '',
            media_url: body.media_url || '', media_mime_type: body.media_mime_type || '',
            media_filename: body.filename || '',
            status: result.ok ? 'sent' : 'failed',
            sender_name: u.nome || u.login,
            error_code: result.error_code || '', error_message: result.error || ''
          });
          waDb.conversations.update(convId, {
            last_message_text: (body.content || body.caption || body.template_name || '').slice(0, 200),
            last_message_at: new Date().toISOString()
          });
          waDb.audit.log({ user_login: u.login, user_name: u.nome, action: 'Enviou mensagem WhatsApp', details: 'Para: ' + toPhone + ' | Tipo: ' + (body.type || 'text'), ip: waIpDaReq(req), conversation_id: convId, message_id: msgId });
          notifySSEClients({ type: 'new_message', conversation_id: convId, message: { id: msgId, direction: 'outgoing', type: body.type || 'text', content: body.content || body.caption || '', status: result.ok ? 'sent' : 'failed', sender_name: u.nome || u.login, created_at: new Date().toISOString() } });
          if (result.ok) { responderJson(res, 200, { ok: true, message_id: msgId, wamid: result.wamid }); }
          else { responderJson(res, 200, { ok: false, error: result.error, error_code: result.error_code, message_id: msgId }); }
        }).catch(function (e) {
          responderJson(res, 500, { ok: false, error: 'Erro ao enviar: ' + e.message });
        });
      });
      return;
    }

    // ---- CONTATOS ----
    if (urlPath === '/api/whatsapp/contacts' && req.method === 'GET') {
      var u = waUsuarioTemPermissao(req, 'visualizar');
      if (!u) { responderJson(res, 403, { ok: false }); return; }
      var query = req.url.indexOf('?') >= 0 ? req.url.slice(req.url.indexOf('?') + 1) : '';
      var qp = {}; query.split('&').forEach(function (p) { var kv = p.split('='); if (kv[0]) qp[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ''); });
      var filters = {};
      if (qp.search) filters.search = qp.search;
      if (qp.limit) filters.limit = parseInt(qp.limit);
      if (qp.offset) filters.offset = parseInt(qp.offset);
      responderJson(res, 200, { ok: true, contacts: waDb.contacts.list(filters), total: waDb.contacts.count(filters) });
      return;
    }
    if (urlPath === '/api/whatsapp/contacts' && req.method === 'POST') {
      var u = waUsuarioTemPermissao(req, 'criar');
      if (!u) { responderJson(res, 403, { ok: false }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false }); return; }
        if (!body.phone) { responderJson(res, 400, { ok: false, error: 'Telefone obrigatório.' }); return; }
        var contact = waDb.contacts.create({ phone: waApi.normalizePhone(body.phone), name: body.name, email: body.email, notes: body.notes, origin: 'manual' });
        responderJson(res, 200, { ok: true, contact: contact });
      });
      return;
    }
    var matchContact = urlPath.match(/^\/api\/whatsapp\/contacts\/(\d+)$/);
    if (matchContact && req.method === 'GET') {
      var u = waUsuarioTemPermissao(req, 'visualizar');
      if (!u) { responderJson(res, 403, { ok: false }); return; }
      var contact = waDb.contacts.getById(parseInt(matchContact[1]));
      if (!contact) { responderJson(res, 404, { ok: false }); return; }
      responderJson(res, 200, { ok: true, contact: contact });
      return;
    }
    if (matchContact && req.method === 'PUT') {
      var u = waUsuarioTemPermissao(req, 'editar');
      if (!u) { responderJson(res, 403, { ok: false }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false }); return; }
        waDb.contacts.update(parseInt(matchContact[1]), body);
        responderJson(res, 200, { ok: true });
      });
      return;
    }

    // ---- TEMPLATES ----
    if (urlPath === '/api/whatsapp/templates' && req.method === 'GET') {
      var u = waUsuarioTemPermissao(req, 'visualizar');
      if (!u) { responderJson(res, 403, { ok: false }); return; }
      var query = req.url.indexOf('?') >= 0 ? req.url.slice(req.url.indexOf('?') + 1) : '';
      var qp = {}; query.split('&').forEach(function (p) { var kv = p.split('='); if (kv[0]) qp[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ''); });
      responderJson(res, 200, { ok: true, templates: waDb.templates.list(qp.account_id ? parseInt(qp.account_id) : null) });
      return;
    }
    if (urlPath === '/api/whatsapp/templates/sync' && req.method === 'POST') {
      var u = waUsuarioTemPermissao(req, 'aprovar');
      if (!u) { responderJson(res, 403, { ok: false }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false }); return; }
        var account = waDb.accounts.getById(body.account_id);
        if (!account || !account.access_token_enc || !account.waba_id) {
          responderJson(res, 400, { ok: false, error: 'Conta não configurada ou sem WABA ID.' }); return;
        }
        waApi.getTemplates(account.waba_id, account.access_token_enc).then(function (result) {
          if (result.ok) {
            waDb.templates.deleteByAccount(account.id);
            (result.templates || []).forEach(function (t) {
              waDb.templates.upsert({ account_id: account.id, meta_template_id: t.id, name: t.name, language: t.language, category: t.category, status: t.status, components: t.components });
            });
            waDb.audit.log({ user_login: u.login, user_name: u.nome, action: 'Sincronizou templates WhatsApp', details: result.templates.length + ' templates', ip: waIpDaReq(req), account_id: account.id });
            responderJson(res, 200, { ok: true, count: result.templates.length });
          } else {
            responderJson(res, 200, { ok: false, error: result.error });
          }
        }).catch(function (e) { responderJson(res, 500, { ok: false, error: e.message }); });
      });
      return;
    }

    // ---- TAGS ----
    if (urlPath === '/api/whatsapp/tags' && req.method === 'GET') {
      var u = waUsuarioTemPermissao(req, 'visualizar');
      if (!u) { responderJson(res, 403, { ok: false }); return; }
      responderJson(res, 200, { ok: true, tags: waDb.tags.list() });
      return;
    }
    if (urlPath === '/api/whatsapp/tags' && req.method === 'POST') {
      var u = waUsuarioTemPermissao(req, 'editar');
      if (!u) { responderJson(res, 403, { ok: false }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false }); return; }
        var tagId = waDb.tags.create(body.name || 'Nova Tag', body.color);
        responderJson(res, 200, { ok: true, tag_id: tagId });
      });
      return;
    }

    // ---- AUDITORIA ----
    if (urlPath === '/api/whatsapp/audit-logs' && req.method === 'GET') {
      var u = waUsuarioTemPermissao(req, 'aprovar');
      if (!u) { responderJson(res, 403, { ok: false, error: 'Apenas administradores podem ver logs de auditoria.' }); return; }
      var query = req.url.indexOf('?') >= 0 ? req.url.slice(req.url.indexOf('?') + 1) : '';
      var qp = {}; query.split('&').forEach(function (p) { var kv = p.split('='); if (kv[0]) qp[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ''); });
      var filters = {};
      if (qp.user_login) filters.user_login = qp.user_login;
      if (qp.action) filters.action = qp.action;
      if (qp.limit) filters.limit = parseInt(qp.limit);
      if (qp.offset) filters.offset = parseInt(qp.offset);
      responderJson(res, 200, { ok: true, logs: waDb.audit.list(filters) });
      return;
    }

    // ---- UPLOAD DE MÍDIA WHATSAPP ----
    if (urlPath === '/api/whatsapp/media/upload' && req.method === 'POST') {
      var u = waUsuarioTemPermissao(req, 'criar');
      if (!u) { responderJson(res, 403, { ok: false }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false }); return; }
        var m = /^data:([^;]+);base64,([\s\S]*)$/.exec(body.dataUrl || '');
        if (!m) { responderJson(res, 400, { ok: false, error: 'dataUrl inválido.' }); return; }
        var mimeType = m[1];
        // Validação SERVER-SIDE (não confia no frontend): só tipos que a Meta aceita.
        var MIME_OK = /^(image\/(jpeg|png|webp)|video\/(mp4|3gpp)|audio\/(aac|mp4|mpeg|amr|ogg|opus)|application\/pdf|text\/plain|application\/(msword|vnd\.(ms-excel|ms-powerpoint|openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document|presentationml\.presentation))))$/;
        if (!MIME_OK.test(mimeType)) { responderJson(res, 400, { ok: false, error: 'Tipo de arquivo não permitido.' }); return; }
        var buf;
        try { buf = Buffer.from(m[2], 'base64'); } catch (e) { responderJson(res, 400, { ok: false, error: 'Base64 inválido.' }); return; }
        if (buf.length > 20 * 1024 * 1024) { responderJson(res, 400, { ok: false, error: 'Arquivo acima de 20 MB.' }); return; }
        var ext = (mimeType.split('/')[1] || 'bin').split('+')[0].split(';')[0].replace(/[^a-z0-9]/gi, '');
        if (!ext || ext.length > 5) ext = 'bin';
        var nome = 'wa_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
        try {
          fs.writeFileSync(path.join(UPLOADS_DIR, nome), buf);
          waDb.audit.log({ user_login: u.login, user_name: u.nome, action: 'Upload de mídia WhatsApp', details: mimeType + ' · ' + Math.round(buf.length / 1024) + ' KB', ip: waIpDaReq(req) });
          responderJson(res, 200, { ok: true, url: '/uploads/' + nome, mime_type: mimeType, filename: nome });
        } catch (e) { responderJson(res, 500, { ok: false, error: 'Falha no upload.' }); }
      });
      return;
    }

    // Rota WhatsApp não encontrada
    responderJson(res, 404, { ok: false, error: 'Rota WhatsApp não encontrada.' });
    return;
  }

  // ---- Site estático ----
  let rel = urlPath === '/' ? '/index.html' : urlPath;

  // SEGURANÇA: o app (index.html + app.js + data.js) só vai para quem TEM sessão válida.
  // Sem login, o visitante recebe SÓ a página de login — o "esqueleto" do app e as
  // senhas-semente do data.js NEM chegam ao navegador (inspecionar/Ctrl+U não revela nada).
  if (rel === '/index.html' && !autenticado) rel = '/login.html';
  if ((rel === '/js/app.js' || rel === '/js/data.js' || rel === '/js/whatsapp.js') && !autenticado) {
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
