// ==========================================================================
// WHATSAPP MODULE — BANCO DE DADOS (SQLite via sql.js)
// ==========================================================================
// Camada de dados isolada para o módulo WhatsApp. Usa SQLite via sql.js
// (JavaScript puro — funciona em qualquer sistema, sem compilação nativa).
// O banco fica em DATA_DIR/whatsapp.db — completamente separado do state.json.
// Backup: basta copiar o arquivo .db.
// ==========================================================================
'use strict';

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

// ==========================================================================
// ACCESS TOKEN CIFRADO EM REPOUSO
// --------------------------------------------------------------------------
// O Access Token da Meta é a credencial mais sensível do módulo: com ele,
// alguém consegue mandar mensagem em nome da empresa. Ele nunca sai para o
// navegador, mas ficava em texto puro dentro do whatsapp.db — quem copiasse
// um backup do arquivo leria o token.
//
// Agora, se WHATSAPP_CRYPTO_KEY estiver definida no .env, o token é gravado
// cifrado (AES-256-GCM, com IV novo a cada gravação e selo de integridade).
//
// COMPATIBILIDADE: token gravado antes, em texto puro, continua funcionando
// (a leitura reconhece os dois formatos). Sem a chave no .env, o
// comportamento é exatamente o de antes — nada quebra.
//
// Gerar a chave:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// ==========================================================================
const _MARCA_CIFRADO = 'enc:v1:';

function _chaveCripto() {
  const bruta = process.env.WHATSAPP_CRYPTO_KEY || '';
  if (!bruta) return null;
  // Aceita hex de 64 caracteres (32 bytes) ou qualquer texto (vira hash de 32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(bruta)) return Buffer.from(bruta, 'hex');
  return crypto.createHash('sha256').update(bruta, 'utf8').digest();
}

function cifrarToken(texto) {
  if (!texto) return '';
  const chave = _chaveCripto();
  if (!chave) return texto;                       // sem chave: comportamento antigo
  try {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', chave, iv);
    const dados = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
    const selo = c.getAuthTag();
    return _MARCA_CIFRADO + iv.toString('base64') + ':' + selo.toString('base64') + ':' + dados.toString('base64');
  } catch (e) {
    console.error('[WhatsApp] Falha ao cifrar o token (gravando como estava):', e.message);
    return texto;
  }
}

function decifrarToken(valor) {
  if (!valor || typeof valor !== 'string') return valor || '';
  if (valor.indexOf(_MARCA_CIFRADO) !== 0) return valor;   // token antigo, texto puro
  const chave = _chaveCripto();
  if (!chave) {
    console.error('[WhatsApp] Token está cifrado, mas WHATSAPP_CRYPTO_KEY não está no .env. ' +
                  'Reponha a chave para o envio de mensagens voltar a funcionar.');
    return '';
  }
  try {
    const p = valor.slice(_MARCA_CIFRADO.length).split(':');
    const d = crypto.createDecipheriv('aes-256-gcm', chave, Buffer.from(p[0], 'base64'));
    d.setAuthTag(Buffer.from(p[1], 'base64'));
    return Buffer.concat([d.update(Buffer.from(p[2], 'base64')), d.final()]).toString('utf8');
  } catch (e) {
    console.error('[WhatsApp] Não consegui decifrar o token (chave trocada?):', e.message);
    return '';
  }
}

let _db = null;
let _dbPath = '';
let _saveTimer = null;
const SAVE_DEBOUNCE = 500; // ms entre gravações em disco

// ==========================================================================
// INICIALIZAÇÃO (assíncrona — sql.js precisa carregar o WASM)
// ==========================================================================
async function init(dataDir) {
  if (_db) return _db;

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  const dir = dataDir || path.join(__dirname, 'server-data');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}

  _dbPath = path.join(dir, 'whatsapp.db');

  // Carrega banco existente ou cria novo
  if (fs.existsSync(_dbPath)) {
    const buffer = fs.readFileSync(_dbPath);
    _db = new SQL.Database(buffer);
  } else {
    _db = new SQL.Database();
  }

  // Otimizações
  _db.run('PRAGMA journal_mode = WAL');
  _db.run('PRAGMA synchronous = NORMAL');
  _db.run('PRAGMA foreign_keys = ON');

  criarTabelas();
  salvarEmDisco(); // Garante que o arquivo existe
  return _db;
}

function getDb() {
  if (!_db) throw new Error('[WhatsApp DB] Banco não inicializado. Chame init(dataDir) primeiro.');
  return _db;
}

function getDbPath() { return _dbPath; }

// Grava o banco em disco (com debounce para evitar I/O excessivo)
function salvarEmDisco() {
  if (!_db || !_dbPath) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      const data = _db.export();
      const buffer = Buffer.from(data);
      const tmp = _dbPath + '.tmp';
      fs.writeFileSync(tmp, buffer);
      fs.renameSync(tmp, _dbPath); // Troca atômica
    } catch (e) {
      console.error('[WhatsApp DB] Erro ao salvar em disco:', e.message);
    }
  }, SAVE_DEBOUNCE);
}

// Grava imediatamente (para shutdown)
function salvarImediato() {
  if (!_db || !_dbPath) return;
  clearTimeout(_saveTimer);
  try {
    const data = _db.export();
    fs.writeFileSync(_dbPath, Buffer.from(data));
  } catch (e) {
    console.error('[WhatsApp DB] Erro ao salvar imediato:', e.message);
  }
}

// Helper: executa query e retorna resultado + salva
function run(sql, params) {
  const db = getDb();
  db.run(sql, params);
  salvarEmDisco();
}

// Helper: retorna uma linha
function getOne(sql, params) {
  const db = getDb();
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const result = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return result;
}

// Helper: retorna todas as linhas
function getAll(sql, params) {
  const db = getDb();
  const results = [];
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper: retorna lastInsertRowid
function runInsert(sql, params) {
  const db = getDb();
  db.run(sql, params);
  const row = getOne('SELECT last_insert_rowid() as id');
  salvarEmDisco();
  return row ? row.id : null;
}

// Helper: retorna changes
function runUpdate(sql, params) {
  const db = getDb();
  db.run(sql, params);
  const row = getOne('SELECT changes() as n');
  salvarEmDisco();
  return row ? row.n : 0;
}

// ==========================================================================
// CRIAÇÃO DAS TABELAS (idempotente — roda a cada inicialização)
// ==========================================================================
function criarTabelas() {
  const db = getDb();

  db.run(`
    CREATE TABLE IF NOT EXISTS whatsapp_accounts (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_number_id     TEXT UNIQUE,
      waba_id             TEXT,
      display_phone       TEXT,
      business_name       TEXT DEFAULT '',
      status              TEXT DEFAULT 'pendente',
      access_token_enc    TEXT DEFAULT '',
      webhook_secret      TEXT DEFAULT '',
      created_at          TEXT DEFAULT (datetime('now')),
      updated_at          TEXT DEFAULT (datetime('now')),
      last_sync_at        TEXT,
      created_by          TEXT DEFAULT '',
      responsavel_login   TEXT DEFAULT '',
      responsavel_nome    TEXT DEFAULT '',
      ativo               INTEGER DEFAULT 1,
      last_error          TEXT DEFAULT ''
    )
  `);

  // Migração: bancos antigos (criados antes do multi-conta) ganham as colunas
  // novas. ALTER falha silenciosamente se a coluna já existe — seguro em qualquer caso.
  ['responsavel_login TEXT DEFAULT \'\'', 'responsavel_nome TEXT DEFAULT \'\'', 'ativo INTEGER DEFAULT 1', 'last_error TEXT DEFAULT \'\''].forEach(function (col) {
    try { db.run('ALTER TABLE whatsapp_accounts ADD COLUMN ' + col); } catch (e) {}
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS whatsapp_contacts (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      phone               TEXT NOT NULL UNIQUE,
      name                TEXT DEFAULT '',
      profile_name        TEXT DEFAULT '',
      email               TEXT DEFAULT '',
      tags                TEXT DEFAULT '[]',
      notes               TEXT DEFAULT '',
      origin              TEXT DEFAULT 'whatsapp',
      rt_candidato_id     TEXT DEFAULT '',
      rt_funcionario_id   TEXT DEFAULT '',
      rt_cliente_id       TEXT DEFAULT '',
      created_at          TEXT DEFAULT (datetime('now')),
      updated_at          TEXT DEFAULT (datetime('now')),
      last_interaction_at TEXT,
      assigned_to         TEXT DEFAULT ''
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS whatsapp_conversations (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id          INTEGER NOT NULL,
      contact_id          INTEGER NOT NULL,
      status              TEXT DEFAULT 'open',
      assigned_to         TEXT DEFAULT '',
      assigned_to_name    TEXT DEFAULT '',
      unread_count        INTEGER DEFAULT 0,
      last_message_text   TEXT DEFAULT '',
      last_message_at     TEXT,
      created_at          TEXT DEFAULT (datetime('now')),
      updated_at          TEXT DEFAULT (datetime('now')),
      closed_at           TEXT,
      FOREIGN KEY (account_id) REFERENCES whatsapp_accounts(id),
      FOREIGN KEY (contact_id) REFERENCES whatsapp_contacts(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id     INTEGER NOT NULL,
      account_id          INTEGER NOT NULL,
      wamid               TEXT UNIQUE,
      direction           TEXT NOT NULL DEFAULT 'incoming',
      type                TEXT DEFAULT 'text',
      content             TEXT DEFAULT '',
      media_url           TEXT DEFAULT '',
      media_mime_type     TEXT DEFAULT '',
      media_filename      TEXT DEFAULT '',
      media_id            TEXT DEFAULT '',
      template_name       TEXT DEFAULT '',
      template_language   TEXT DEFAULT '',
      status              TEXT DEFAULT 'sent',
      status_updated_at   TEXT,
      error_code          TEXT DEFAULT '',
      error_message       TEXT DEFAULT '',
      sender_phone        TEXT DEFAULT '',
      sender_name         TEXT DEFAULT '',
      is_internal_note    INTEGER DEFAULT 0,
      created_at          TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES whatsapp_conversations(id),
      FOREIGN KEY (account_id) REFERENCES whatsapp_accounts(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS whatsapp_templates (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id          INTEGER,
      meta_template_id    TEXT DEFAULT '',
      name                TEXT NOT NULL,
      language            TEXT DEFAULT 'pt_BR',
      category            TEXT DEFAULT 'UTILITY',
      status              TEXT DEFAULT 'APPROVED',
      components          TEXT DEFAULT '[]',
      created_at          TEXT DEFAULT (datetime('now')),
      updated_at          TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES whatsapp_accounts(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS whatsapp_media (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id          INTEGER,
      whatsapp_media_id   TEXT DEFAULT '',
      mime_type           TEXT DEFAULT '',
      file_size           INTEGER DEFAULT 0,
      filename            TEXT DEFAULT '',
      local_path          TEXT DEFAULT '',
      sha256              TEXT DEFAULT '',
      created_at          TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (message_id) REFERENCES whatsapp_messages(id)
    )
  `);

  db.run(`CREATE TABLE IF NOT EXISTS whatsapp_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, color TEXT DEFAULT '#6366f1', created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS whatsapp_conversation_tags (
    conversation_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY (conversation_id, tag_id),
    FOREIGN KEY (conversation_id) REFERENCES whatsapp_conversations(id), FOREIGN KEY (tag_id) REFERENCES whatsapp_tags(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE, event_type TEXT DEFAULT '', payload TEXT DEFAULT '',
    processed INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS whatsapp_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_login TEXT DEFAULT '', user_name TEXT DEFAULT '', action TEXT NOT NULL,
    details TEXT DEFAULT '', ip TEXT DEFAULT '', account_id INTEGER, conversation_id INTEGER, message_id INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ─── ÍNDICES ────────────────────────────────────────────────────────────────
  const indices = [
    'CREATE INDEX IF NOT EXISTS idx_contacts_phone ON whatsapp_contacts(phone)',
    'CREATE INDEX IF NOT EXISTS idx_conversations_account ON whatsapp_conversations(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_conversations_contact ON whatsapp_conversations(contact_id)',
    'CREATE INDEX IF NOT EXISTS idx_conversations_status ON whatsapp_conversations(status)',
    'CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON whatsapp_conversations(assigned_to)',
    'CREATE INDEX IF NOT EXISTS idx_conversations_updated ON whatsapp_conversations(updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_messages_conversation ON whatsapp_messages(conversation_id)',
    'CREATE INDEX IF NOT EXISTS idx_messages_wamid ON whatsapp_messages(wamid)',
    'CREATE INDEX IF NOT EXISTS idx_messages_created ON whatsapp_messages(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_messages_status ON whatsapp_messages(status)',
    'CREATE INDEX IF NOT EXISTS idx_webhook_events_eid ON whatsapp_webhook_events(event_id)',
    'CREATE INDEX IF NOT EXISTS idx_audit_created ON whatsapp_audit_logs(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_audit_user ON whatsapp_audit_logs(user_login)'
  ];
  indices.forEach(idx => { try { db.run(idx); } catch (e) {} });
}

// ==========================================================================
// OPERAÇÕES: CONTAS
// ==========================================================================
const accounts = {
  create(data) {
    return runInsert(
      `INSERT INTO whatsapp_accounts (phone_number_id, waba_id, display_phone, business_name, status, access_token_enc, webhook_secret, created_by, responsavel_login, responsavel_nome, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.phone_number_id || '', data.waba_id || '', data.display_phone || '', data.business_name || '',
       data.status || 'pendente', cifrarToken(data.access_token_enc || ''), data.webhook_secret || '', data.created_by || '',
       data.responsavel_login || '', data.responsavel_nome || '', (data.ativo === undefined ? 1 : (data.ativo ? 1 : 0))]
    );
  },

  getById(id) {
    return _comTokenAberto(getOne('SELECT * FROM whatsapp_accounts WHERE id = ?', [id]));
  },

  getByPhoneNumberId(phoneNumberId) {
    return _comTokenAberto(getOne('SELECT * FROM whatsapp_accounts WHERE phone_number_id = ?', [phoneNumberId]));
  },

  list() {
    // has_token: informa se o Access Token está configurado, SEM devolver o token.
    return getAll("SELECT id, phone_number_id, waba_id, display_phone, business_name, status, created_at, updated_at, last_sync_at, created_by, responsavel_login, responsavel_nome, ativo, last_error, CASE WHEN access_token_enc IS NOT NULL AND access_token_enc != '' THEN 1 ELSE 0 END AS has_token FROM whatsapp_accounts ORDER BY created_at DESC");
  },
  // IDs das contas de um funcionário (as que ele é responsável). Usado para
  // limitar a visibilidade das conversas no backend.
  idsDoResponsavel(login) {
    return getAll('SELECT id FROM whatsapp_accounts WHERE responsavel_login = ?', [login]).map(function (r) { return r.id; });
  },

  update(id, data) {
    const fields = [];
    const values = [];
    ['phone_number_id', 'waba_id', 'display_phone', 'business_name', 'status', 'access_token_enc', 'webhook_secret', 'last_sync_at', 'responsavel_login', 'responsavel_nome', 'last_error'].forEach(f => {
      if (data[f] !== undefined) {
        fields.push(f + ' = ?');
        // O token vai cifrado para o banco; os demais campos, como estão.
        values.push(f === 'access_token_enc' ? cifrarToken(data[f]) : data[f]);
      }
    });
    if (data.ativo !== undefined) { fields.push('ativo = ?'); values.push(data.ativo ? 1 : 0); }
    if (fields.length === 0) return;
    fields.push("updated_at = datetime('now')");
    values.push(id);
    run('UPDATE whatsapp_accounts SET ' + fields.join(', ') + ' WHERE id = ?', values);
  },

  getAccessToken(id) {
    const row = getOne('SELECT access_token_enc FROM whatsapp_accounts WHERE id = ?', [id]);
    return row ? decifrarToken(row.access_token_enc) : null;
  },

  getFirstActive() {
    return _comTokenAberto(getOne("SELECT * FROM whatsapp_accounts WHERE status IN ('connected', 'active') ORDER BY id LIMIT 1"));
  }
};

// Devolve a conta com o token já decifrado em access_token_enc, do jeito que o
// resto do servidor espera. Uso INTERNO (envio de mensagem, teste de conexão) —
// esta linha nunca é enviada ao navegador; para o navegador existe o list(),
// que só informa has_token.
function _comTokenAberto(conta) {
  if (!conta) return conta;
  if (conta.access_token_enc) conta.access_token_enc = decifrarToken(conta.access_token_enc);
  return conta;
}

// ==========================================================================
// OPERAÇÕES: CONTATOS
// ==========================================================================
const contacts = {
  create(data) {
    // Tenta criar; se já existe, atualiza nome/profile_name
    const existing = getOne('SELECT * FROM whatsapp_contacts WHERE phone = ?', [data.phone]);
    if (existing) {
      const updates = [];
      const vals = [];
      if (data.name && data.name !== existing.name) { updates.push('name = ?'); vals.push(data.name); }
      if (data.profile_name && data.profile_name !== existing.profile_name) { updates.push('profile_name = ?'); vals.push(data.profile_name); }
      if (updates.length > 0) {
        updates.push("updated_at = datetime('now')");
        updates.push("last_interaction_at = datetime('now')");
        vals.push(existing.id);
        run('UPDATE whatsapp_contacts SET ' + updates.join(', ') + ' WHERE id = ?', vals);
      }
      return getOne('SELECT * FROM whatsapp_contacts WHERE id = ?', [existing.id]);
    }
    const id = runInsert(
      `INSERT INTO whatsapp_contacts (phone, name, profile_name, email, tags, notes, origin, assigned_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.phone, data.name || '', data.profile_name || '', data.email || '',
       JSON.stringify(data.tags || []), data.notes || '', data.origin || 'whatsapp', data.assigned_to || '']
    );
    return getOne('SELECT * FROM whatsapp_contacts WHERE id = ?', [id]);
  },

  getById(id) {
    return getOne('SELECT * FROM whatsapp_contacts WHERE id = ?', [id]);
  },

  getByPhone(phone) {
    return getOne('SELECT * FROM whatsapp_contacts WHERE phone = ?', [phone]);
  },

  list(filters) {
    let where = '1=1';
    const params = [];
    if (filters) {
      if (filters.search) {
        where += " AND (name LIKE ? OR phone LIKE ? OR profile_name LIKE ?)";
        const s = '%' + filters.search + '%';
        params.push(s, s, s);
      }
      if (filters.assigned_to) {
        where += ' AND assigned_to = ?';
        params.push(filters.assigned_to);
      }
    }
    const limit = (filters && filters.limit) || 100;
    const offset = (filters && filters.offset) || 0;
    params.push(limit, offset);
    return getAll('SELECT * FROM whatsapp_contacts WHERE ' + where + ' ORDER BY last_interaction_at DESC, created_at DESC LIMIT ? OFFSET ?', params);
  },

  count(filters) {
    let where = '1=1';
    const params = [];
    if (filters && filters.search) {
      where += " AND (name LIKE ? OR phone LIKE ? OR profile_name LIKE ?)";
      const s = '%' + filters.search + '%';
      params.push(s, s, s);
    }
    const row = getOne('SELECT COUNT(*) as total FROM whatsapp_contacts WHERE ' + where, params);
    return row ? row.total : 0;
  },

  update(id, data) {
    const fields = [];
    const values = [];
    ['name', 'profile_name', 'email', 'notes', 'origin', 'assigned_to', 'rt_candidato_id', 'rt_funcionario_id', 'rt_cliente_id'].forEach(f => {
      if (data[f] !== undefined) { fields.push(f + ' = ?'); values.push(data[f]); }
    });
    if (data.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(data.tags)); }
    if (fields.length === 0) return;
    fields.push("updated_at = datetime('now')");
    values.push(id);
    run('UPDATE whatsapp_contacts SET ' + fields.join(', ') + ' WHERE id = ?', values);
  },

  updateLastInteraction(id) {
    run("UPDATE whatsapp_contacts SET last_interaction_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [id]);
  }
};

// ==========================================================================
// OPERAÇÕES: CONVERSAS
// ==========================================================================
const conversations = {
  create(data) {
    return runInsert(
      `INSERT INTO whatsapp_conversations (account_id, contact_id, status, assigned_to, assigned_to_name)
       VALUES (?, ?, ?, ?, ?)`,
      [data.account_id, data.contact_id, data.status || 'open', data.assigned_to || '', data.assigned_to_name || '']
    );
  },

  getById(id) {
    return getOne(`
      SELECT c.*, ct.phone as contact_phone, ct.name as contact_name, ct.profile_name as contact_profile_name,
             a.display_phone as account_phone, a.business_name as account_name
      FROM whatsapp_conversations c
      LEFT JOIN whatsapp_contacts ct ON c.contact_id = ct.id
      LEFT JOIN whatsapp_accounts a ON c.account_id = a.id
      WHERE c.id = ?
    `, [id]);
  },

  getByContactAndAccount(contactId, accountId) {
    return getOne(`
      SELECT * FROM whatsapp_conversations
      WHERE contact_id = ? AND account_id = ? AND status != 'archived'
      ORDER BY updated_at DESC LIMIT 1
    `, [contactId, accountId]);
  },

  list(filters) {
    let where = '1=1';
    const params = [];
    if (filters) {
      if (filters.account_id) { where += ' AND c.account_id = ?'; params.push(filters.account_id); }
      // account_ids: restringe às contas que o usuário pode ver (multi-conta).
      // [] (vazio) = não vê nenhuma; undefined = sem restrição (admin).
      if (Array.isArray(filters.account_ids)) {
        if (!filters.account_ids.length) { where += ' AND 0=1'; }
        else { where += ' AND c.account_id IN (' + filters.account_ids.map(function () { return '?'; }).join(',') + ')'; filters.account_ids.forEach(function (id) { params.push(id); }); }
      }
      if (filters.status) { where += ' AND c.status = ?'; params.push(filters.status); }
      if (filters.assigned_to) { where += ' AND c.assigned_to = ?'; params.push(filters.assigned_to); }
      if (filters.unread_only) { where += ' AND c.unread_count > 0'; }
      if (filters.search) {
        where += " AND (ct.name LIKE ? OR ct.phone LIKE ? OR ct.profile_name LIKE ? OR c.last_message_text LIKE ?)";
        const s = '%' + filters.search + '%';
        params.push(s, s, s, s);
      }
    }
    const limit = (filters && filters.limit) || 50;
    const offset = (filters && filters.offset) || 0;
    params.push(limit, offset);
    return getAll(`
      SELECT c.*, ct.phone as contact_phone, ct.name as contact_name, ct.profile_name as contact_profile_name,
             a.display_phone as account_phone, a.business_name as account_name
      FROM whatsapp_conversations c
      LEFT JOIN whatsapp_contacts ct ON c.contact_id = ct.id
      LEFT JOIN whatsapp_accounts a ON c.account_id = a.id
      WHERE ${where}
      ORDER BY c.updated_at DESC
      LIMIT ? OFFSET ?
    `, params);
  },

  count(filters) {
    let where = '1=1';
    const params = [];
    if (filters) {
      if (filters.account_id) { where += ' AND account_id = ?'; params.push(filters.account_id); }
      if (Array.isArray(filters.account_ids)) {
        if (!filters.account_ids.length) { where += ' AND 0=1'; }
        else { where += ' AND account_id IN (' + filters.account_ids.map(function () { return '?'; }).join(',') + ')'; filters.account_ids.forEach(function (id) { params.push(id); }); }
      }
      if (filters.status) { where += ' AND status = ?'; params.push(filters.status); }
      if (filters.assigned_to) { where += ' AND assigned_to = ?'; params.push(filters.assigned_to); }
      if (filters.unread_only) { where += ' AND unread_count > 0'; }
    }
    const row = getOne('SELECT COUNT(*) as total FROM whatsapp_conversations WHERE ' + where, params);
    return row ? row.total : 0;
  },

  update(id, data) {
    const fields = [];
    const values = [];
    ['status', 'assigned_to', 'assigned_to_name', 'unread_count', 'last_message_text', 'last_message_at', 'closed_at'].forEach(f => {
      if (data[f] !== undefined) { fields.push(f + ' = ?'); values.push(data[f]); }
    });
    if (fields.length === 0) return;
    fields.push("updated_at = datetime('now')");
    values.push(id);
    run('UPDATE whatsapp_conversations SET ' + fields.join(', ') + ' WHERE id = ?', values);
  },

  incrementUnread(id) {
    run("UPDATE whatsapp_conversations SET unread_count = unread_count + 1, updated_at = datetime('now') WHERE id = ?", [id]);
  },

  resetUnread(id) {
    run("UPDATE whatsapp_conversations SET unread_count = 0, updated_at = datetime('now') WHERE id = ?", [id]);
  }
};

// ==========================================================================
// OPERAÇÕES: MENSAGENS
// ==========================================================================
const messages = {
  create(data) {
    // Verifica duplicata por wamid
    if (data.wamid) {
      const existing = getOne('SELECT id FROM whatsapp_messages WHERE wamid = ?', [data.wamid]);
      if (existing) return null; // Duplicata
    }
    return runInsert(
      `INSERT INTO whatsapp_messages
        (conversation_id, account_id, wamid, direction, type, content, media_url, media_mime_type, media_filename, media_id,
         template_name, template_language, status, sender_phone, sender_name, is_internal_note, error_code, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.conversation_id, data.account_id, data.wamid || null, data.direction || 'incoming',
       data.type || 'text', data.content || '', data.media_url || '', data.media_mime_type || '',
       data.media_filename || '', data.media_id || '', data.template_name || '', data.template_language || '',
       data.status || 'sent', data.sender_phone || '', data.sender_name || '',
       data.is_internal_note ? 1 : 0, data.error_code || '', data.error_message || '']
    );
  },

  getByWamid(wamid) {
    return getOne('SELECT * FROM whatsapp_messages WHERE wamid = ?', [wamid]);
  },

  listByConversation(conversationId, limit, offset) {
    return getAll(
      'SELECT * FROM whatsapp_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?',
      [conversationId, limit || 50, offset || 0]
    );
  },

  countByConversation(conversationId) {
    const row = getOne('SELECT COUNT(*) as total FROM whatsapp_messages WHERE conversation_id = ?', [conversationId]);
    return row ? row.total : 0;
  },

  updateStatus(wamid, status, errorCode, errorMessage) {
    run(
      "UPDATE whatsapp_messages SET status = ?, error_code = ?, error_message = ?, status_updated_at = datetime('now') WHERE wamid = ?",
      [status, errorCode || '', errorMessage || '', wamid]
    );
  }
};

// ==========================================================================
// OPERAÇÕES: TEMPLATES
// ==========================================================================
const templates = {
  upsert(data) {
    const existing = getOne('SELECT id FROM whatsapp_templates WHERE name = ? AND language = ? AND account_id = ?',
      [data.name, data.language || 'pt_BR', data.account_id || null]);
    if (existing) {
      run('UPDATE whatsapp_templates SET category = ?, status = ?, components = ?, meta_template_id = ?, updated_at = datetime(\'now\') WHERE id = ?',
        [data.category || 'UTILITY', data.status || 'APPROVED', JSON.stringify(data.components || []), data.meta_template_id || '', existing.id]);
    } else {
      runInsert(
        `INSERT INTO whatsapp_templates (account_id, meta_template_id, name, language, category, status, components)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [data.account_id || null, data.meta_template_id || '', data.name, data.language || 'pt_BR',
         data.category || 'UTILITY', data.status || 'APPROVED', JSON.stringify(data.components || [])]
      );
    }
  },

  list(accountId) {
    if (accountId) {
      return getAll('SELECT * FROM whatsapp_templates WHERE account_id = ? ORDER BY name', [accountId]);
    }
    return getAll('SELECT * FROM whatsapp_templates ORDER BY name');
  },

  deleteByAccount(accountId) {
    run('DELETE FROM whatsapp_templates WHERE account_id = ?', [accountId]);
  }
};

// ==========================================================================
// OPERAÇÕES: TAGS
// ==========================================================================
const tags = {
  create(name, color) {
    const existing = getOne('SELECT id FROM whatsapp_tags WHERE name = ?', [name]);
    if (existing) return existing.id;
    return runInsert('INSERT INTO whatsapp_tags (name, color) VALUES (?, ?)', [name, color || '#6366f1']);
  },

  list() {
    return getAll('SELECT * FROM whatsapp_tags ORDER BY name');
  },

  addToConversation(conversationId, tagId) {
    const existing = getOne('SELECT 1 FROM whatsapp_conversation_tags WHERE conversation_id = ? AND tag_id = ?', [conversationId, tagId]);
    if (!existing) {
      run('INSERT INTO whatsapp_conversation_tags (conversation_id, tag_id) VALUES (?, ?)', [conversationId, tagId]);
    }
  },

  removeFromConversation(conversationId, tagId) {
    run('DELETE FROM whatsapp_conversation_tags WHERE conversation_id = ? AND tag_id = ?', [conversationId, tagId]);
  },

  getForConversation(conversationId) {
    return getAll(`
      SELECT t.* FROM whatsapp_tags t
      INNER JOIN whatsapp_conversation_tags ct ON t.id = ct.tag_id
      WHERE ct.conversation_id = ?
      ORDER BY t.name
    `, [conversationId]);
  }
};

// ==========================================================================
// OPERAÇÕES: WEBHOOK EVENTS (idempotência)
// ==========================================================================
const webhookEvents = {
  exists(eventId) {
    return !!getOne('SELECT 1 FROM whatsapp_webhook_events WHERE event_id = ?', [eventId]);
  },

  create(eventId, eventType, payload) {
    if (this.exists(eventId)) return false;
    runInsert('INSERT INTO whatsapp_webhook_events (event_id, event_type, payload) VALUES (?, ?, ?)',
      [eventId, eventType || '', typeof payload === 'string' ? payload : JSON.stringify(payload)]);
    return true;
  },

  markProcessed(eventId) {
    run('UPDATE whatsapp_webhook_events SET processed = 1 WHERE event_id = ?', [eventId]);
  },

  cleanup() {
    run("DELETE FROM whatsapp_webhook_events WHERE created_at < datetime('now', '-7 days')");
  }
};

// ==========================================================================
// OPERAÇÕES: AUDITORIA
// ==========================================================================
const audit = {
  log(data) {
    runInsert(
      `INSERT INTO whatsapp_audit_logs (user_login, user_name, action, details, ip, account_id, conversation_id, message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.user_login || '', data.user_name || '', data.action || '', data.details || '',
       data.ip || '', data.account_id || null, data.conversation_id || null, data.message_id || null]
    );
  },

  list(filters) {
    let where = '1=1';
    const params = [];
    if (filters) {
      if (filters.user_login) { where += ' AND user_login = ?'; params.push(filters.user_login); }
      if (filters.action) { where += ' AND action LIKE ?'; params.push('%' + filters.action + '%'); }
      if (filters.from_date) { where += ' AND created_at >= ?'; params.push(filters.from_date); }
      if (filters.to_date) { where += ' AND created_at <= ?'; params.push(filters.to_date); }
    }
    const limit = (filters && filters.limit) || 100;
    const offset = (filters && filters.offset) || 0;
    params.push(limit, offset);
    return getAll('SELECT * FROM whatsapp_audit_logs WHERE ' + where + ' ORDER BY created_at DESC LIMIT ? OFFSET ?', params);
  }
};

// ==========================================================================
// DASHBOARD (estatísticas agregadas)
// ==========================================================================
function dashboardStats() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    connected_accounts: (getOne("SELECT COUNT(*) as n FROM whatsapp_accounts WHERE status IN ('connected','active')") || {}).n || 0,
    total_conversations: (getOne("SELECT COUNT(*) as n FROM whatsapp_conversations") || {}).n || 0,
    open_conversations: (getOne("SELECT COUNT(*) as n FROM whatsapp_conversations WHERE status = 'open'") || {}).n || 0,
    unread_conversations: (getOne("SELECT COUNT(*) as n FROM whatsapp_conversations WHERE unread_count > 0") || {}).n || 0,
    today_conversations: (getOne("SELECT COUNT(*) as n FROM whatsapp_conversations WHERE date(created_at) = ?", [today]) || {}).n || 0,
    today_sent: (getOne("SELECT COUNT(*) as n FROM whatsapp_messages WHERE direction = 'outgoing' AND date(created_at) = ?", [today]) || {}).n || 0,
    today_received: (getOne("SELECT COUNT(*) as n FROM whatsapp_messages WHERE direction = 'incoming' AND date(created_at) = ?", [today]) || {}).n || 0,
    failed_messages: (getOne("SELECT COUNT(*) as n FROM whatsapp_messages WHERE status = 'failed' AND date(created_at) = ?", [today]) || {}).n || 0,
    pending_conversations: (getOne("SELECT COUNT(*) as n FROM whatsapp_conversations WHERE status = 'pending'") || {}).n || 0,
    total_contacts: (getOne("SELECT COUNT(*) as n FROM whatsapp_contacts") || {}).n || 0
  };
}

// ==========================================================================
// BACKUP
// ==========================================================================
function backup(backupDir) {
  if (!_db) return null;
  salvarImediato(); // Garante que está atualizado em disco
  try { fs.mkdirSync(backupDir, { recursive: true }); } catch (e) {}
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, 'whatsapp-' + timestamp + '.db');
  fs.copyFileSync(_dbPath, backupPath);
  return backupPath;
}

// ==========================================================================
// FECHAR BANCO
// ==========================================================================
function close() {
  if (_db) {
    salvarImediato();
    _db.close();
    _db = null;
  }
}

// ==========================================================================
// EXPORTS
// ==========================================================================
module.exports = {
  init, getDb, getDbPath, salvarImediato,
  accounts, contacts, conversations, messages, templates, tags, webhookEvents, audit,
  dashboardStats, backup, close
};
