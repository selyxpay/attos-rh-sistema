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
      last_message_type   TEXT DEFAULT '',
      last_message_at     TEXT,
      created_at          TEXT DEFAULT (datetime('now')),
      updated_at          TEXT DEFAULT (datetime('now')),
      closed_at           TEXT,
      FOREIGN KEY (account_id) REFERENCES whatsapp_accounts(id),
      FOREIGN KEY (contact_id) REFERENCES whatsapp_contacts(id)
    )
  `);

  // Migração: a lista de conversas mostrava "—" para toda mensagem que não é
  // texto (áudio, figurinha, foto sem legenda), porque só existia o TEXTO da
  // última mensagem e esses tipos não têm texto. Guardando o TIPO, a lista
  // consegue mostrar "Áudio", "Figurinha", "Foto".
  // ALTER falha em silêncio se a coluna já existe — seguro em qualquer caso.
  // Conversa antiga fica com a coluna vazia e a tela cai no texto, como antes:
  // nenhuma linha existente é reescrita.
  ['last_message_type TEXT DEFAULT \'\''].forEach(function (col) {
    try { db.run('ALTER TABLE whatsapp_conversations ADD COLUMN ' + col); } catch (e) {}
  });

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

  // Marca a mensagem que o BOT mandou, para a conversa mostrar a etiqueta e
  // para a equipe distinguir do atendimento humano. ALTER falha em silencio
  // se a coluna ja existe; mensagem antiga fica com 0, o que esta certo.
  // media_tentativas / media_falhou: controle do download da mídia que CHEGA.
  // Sem isso, mídia que falhou ficava para sempre em "(baixando...)" e o
  // sistema tentava de novo sem limite — ou nunca mais tentava. Mensagem
  // antiga fica com 0, o que está certo: ninguém tentou ainda.
  // origem: QUEM mandou a mensagem — 'bot', 'lembrete' ou 'atendente'. O
  // balão mostra isso em letra pequena. Mensagem antiga fica com vazio e não
  // recebe rótulo, o que está certo: não dá para adivinhar depois.
  ['sent_by_bot INTEGER DEFAULT 0',
   'media_tentativas INTEGER DEFAULT 0',
   'media_falhou INTEGER DEFAULT 0',
   'media_erro TEXT DEFAULT \'\'',
   'origem TEXT DEFAULT \'\''].forEach(function (col) {
    try { db.run('ALTER TABLE whatsapp_messages ADD COLUMN ' + col); } catch (e) {}
  });

  // ─── BOT DE ATENDIMENTO ─────────────────────────────────────────────────────
  // A CONFIGURAÇÃO do bot (modo, passos, textos) NÃO mora aqui: fica no
  // state.json, para usar o contrato de gravação do sistema
  // (setKeys/upsertIds) e a permissão por tela. Aqui fica só o que muda a cada
  // mensagem, que é muito e não pode inflar o state.json.

  // Uma linha por contato: o que o bot já fez e o que ele não pode fazer.
  db.run(`CREATE TABLE IF NOT EXISTS whatsapp_bot_contatos (
    contact_id             INTEGER PRIMARY KEY,
    optou_sair             INTEGER DEFAULT 0,
    optou_sair_em          TEXT,
    aguardando_atendente   INTEGER DEFAULT 0,
    aguardando_desde       TEXT,
    pausado                INTEGER DEFAULT 0,
    pausado_em             TEXT,
    pausado_por            TEXT DEFAULT '',
    ultima_resposta_em     TEXT,
    ultima_msg_recebida_em TEXT,
    respostas_no_dia       INTEGER DEFAULT 0,
    dia_da_contagem        TEXT DEFAULT '',
    total_respostas        INTEGER DEFAULT 0,
    atualizado_em          TEXT DEFAULT (datetime('now'))
  )`);

  // fora_exp_periodo: em qual PERÍODO do "modo fora do expediente" este contato
  // já recebeu o funil. Enquanto o modo estiver ligado o período não muda,
  // então quem escrever de novo NÃO recebe o funil outra vez. Contato antigo
  // fica vazio, o que está certo: nunca recebeu.
  // FICA AQUI, e não junto dos outros ALTER mais acima: a tabela de contatos
  // do bot é criada logo acima desta linha, e um ALTER antes disso falha
  // calado ("no such column" só aparece na primeira mensagem de verdade).
  ['fora_exp_periodo TEXT DEFAULT \'\''].forEach(function (col) {
    try { db.run('ALTER TABLE whatsapp_bot_contatos ADD COLUMN ' + col); } catch (e) {}
  });

  // Fila de envio. É ela que dá: controle de ritmo, retomada depois de
  // reinício (a linha pendente continua aqui) e a garantia de NÃO DUPLICAR --
  // wamid_gatilho é UNIQUE, então a mesma mensagem recebida nunca enfileira
  // duas vezes, mesmo se a Meta repetir o webhook.
  db.run(`CREATE TABLE IF NOT EXISTS whatsapp_bot_fila (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    wamid_gatilho   TEXT UNIQUE,
    account_id      INTEGER NOT NULL,
    conversation_id INTEGER NOT NULL,
    contact_id      INTEGER NOT NULL,
    telefone        TEXT NOT NULL,
    nome_contato    TEXT DEFAULT '',
    passos_json     TEXT NOT NULL,
    passo_atual     INTEGER DEFAULT 0,
    total_passos    INTEGER DEFAULT 0,
    enviar_em       TEXT,
    status          TEXT DEFAULT 'pendente',
    tentativas      INTEGER DEFAULT 0,
    falhas          INTEGER DEFAULT 0,
    ultimo_erro     TEXT DEFAULT '',
    motivo          TEXT DEFAULT '',
    criado_em       TEXT DEFAULT (datetime('now')),
    terminado_em    TEXT
  )`);

  // marcar_apos: O QUE marcar no contato QUANDO o funil sair de verdade.
  // 'bot' = conta a resposta (é o que o modo "só na primeira vez" olha);
  // 'fora:<periodo>' = marca o período do modo fora do expediente.
  // Antes a marcação era feita na hora de ENFILEIRAR: se o envio falhasse
  // (conta sem token, erro da Meta, janela fechada), a pessoa ficava marcada
  // como atendida sem ter recebido nada — e no modo "só na primeira vez"
  // nunca mais receberia o funil.
  // FICA AQUI, depois do CREATE da fila (ALTER antes do CREATE falha calado).
  ['marcar_apos TEXT DEFAULT \'\''].forEach(function (col) {
    try { db.run('ALTER TABLE whatsapp_bot_fila ADD COLUMN ' + col); } catch (e) {}
  });

  // Diário do bot, para o painel da aba e para investigar depois.
  db.run(`CREATE TABLE IF NOT EXISTS whatsapp_bot_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo        TEXT NOT NULL,
    contact_id  INTEGER,
    telefone    TEXT DEFAULT '',
    detalhe     TEXT DEFAULT '',
    criado_em   TEXT DEFAULT (datetime('now'))
  )`);

  // Cache do media id da Meta. O arquivo sobe UMA vez e o id é reaproveitado
  // nos envios seguintes; quando a Meta expira o id (cerca de 30 dias), o
  // envio falha e a linha é descartada para o arquivo subir de novo.
  db.run(`CREATE TABLE IF NOT EXISTS whatsapp_bot_midia (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    arquivo       TEXT NOT NULL,
    account_id    INTEGER NOT NULL,
    media_id      TEXT DEFAULT '',
    mime_type     TEXT DEFAULT '',
    tamanho       INTEGER DEFAULT 0,
    enviado_em    TEXT DEFAULT (datetime('now')),
    UNIQUE (arquivo, account_id)
  )`);

  // ─── ENVIO EM GRUPO (lista "Janela aberta") ───────────────────────────────
  // Uma linha por ENVIO (o que foi mandado, por quem) e uma por CONTATO
  // daquele envio. A chave única (envio_id, contact_id) é o que garante que
  // ninguém receba duas vezes, mesmo se o servidor reiniciar no meio da fila.
  db.run(`CREATE TABLE IF NOT EXISTS whatsapp_envios_grupo (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    criado_por     TEXT DEFAULT '',
    criado_nome    TEXT DEFAULT '',
    account_id     INTEGER,
    texto          TEXT DEFAULT '',
    resposta_id    TEXT DEFAULT '',
    titulo         TEXT DEFAULT '',
    arquivo        TEXT DEFAULT '',
    tipo_anexo     TEXT DEFAULT '',
    mime           TEXT DEFAULT '',
    nome_arquivo   TEXT DEFAULT '',
    usar_lembretes INTEGER DEFAULT 0,
    filtro         TEXT DEFAULT '',
    status         TEXT DEFAULT 'ativo',
    criado_em      TEXT DEFAULT (datetime('now')),
    atualizado_em  TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS whatsapp_envio_grupo_itens (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    envio_id        INTEGER NOT NULL,
    conversation_id INTEGER NOT NULL,
    contact_id      INTEGER NOT NULL,
    account_id      INTEGER NOT NULL,
    telefone        TEXT NOT NULL,
    nome_contato    TEXT DEFAULT '',
    status          TEXT DEFAULT 'fila',
    erro            TEXT DEFAULT '',
    wamid           TEXT DEFAULT '',
    texto_enviado   TEXT DEFAULT '',
    enviado_em      TEXT,
    atualizado_em   TEXT DEFAULT (datetime('now')),
    UNIQUE (envio_id, contact_id)
  )`);

  // ─── LEMBRETES AUTOMÁTICOS DAS MENSAGENS PRONTAS ───────────────────────────
  // A CONFIGURAÇÃO (horário do evento, textos, anexos) mora no state.json,
  // dentro da própria mensagem pronta. Aqui fica só o AGENDAMENTO: uma linha
  // por contato × lembrete, que é o que muda a toda hora.
  //
  // UNIQUE (contact_id, resposta_id, lembrete_id, evento_em) é o que garante
  // "mandei duas vezes para a mesma pessoa no mesmo evento, não duplica":
  // a segunda vez ATUALIZA a linha. Mudança de horário do envio vira outro
  // `evento_em`, e aí o agendamento antigo daquela pessoa é cancelado na hora
  // de agendar o novo (quem faz isso é o whatsapp-lembretes.cjs).
  db.run(`CREATE TABLE IF NOT EXISTS whatsapp_lembretes (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    resposta_id      TEXT NOT NULL,
    titulo           TEXT DEFAULT '',
    evento_em        TEXT NOT NULL,
    evento_chave     TEXT NOT NULL,
    lembrete_id      TEXT NOT NULL,
    rotulo           TEXT DEFAULT '',
    enviar_em        TEXT NOT NULL,
    account_id       INTEGER NOT NULL,
    conversation_id  INTEGER NOT NULL,
    contact_id       INTEGER NOT NULL,
    telefone         TEXT NOT NULL,
    nome_contato     TEXT DEFAULT '',
    texto            TEXT DEFAULT '',
    link             TEXT DEFAULT '',
    arquivo          TEXT DEFAULT '',
    tipo_anexo       TEXT DEFAULT '',
    mime             TEXT DEFAULT '',
    nome_arquivo     TEXT DEFAULT '',
    status           TEXT DEFAULT 'agendado',
    tentativas       INTEGER DEFAULT 0,
    erro             TEXT DEFAULT '',
    wamid            TEXT DEFAULT '',
    criado_por       TEXT DEFAULT '',
    criado_em        TEXT DEFAULT (datetime('now')),
    atualizado_em    TEXT DEFAULT (datetime('now')),
    enviado_em       TEXT,
    UNIQUE (contact_id, resposta_id, lembrete_id, evento_em)
  )`);

  // ─── ÍNDICES ────────────────────────────────────────────────────────────────
  const indices = [
    'CREATE INDEX IF NOT EXISTS idx_bot_fila_status ON whatsapp_bot_fila(status, enviar_em)',
    'CREATE INDEX IF NOT EXISTS idx_bot_fila_contato ON whatsapp_bot_fila(contact_id)',
    'CREATE INDEX IF NOT EXISTS idx_bot_log_criado ON whatsapp_bot_log(criado_em DESC)',
    'CREATE INDEX IF NOT EXISTS idx_bot_log_tipo ON whatsapp_bot_log(tipo)',
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
    // Compostos, para as duas consultas quentes da tela: a janela de 24h
    // (última RECEBIDA de uma conversa) e a busca incremental de "o que há de
    // novo desde a mensagem X". Sem eles, cada abertura de conversa varria a
    // tabela inteira de mensagens.
    'CREATE INDEX IF NOT EXISTS idx_messages_conv_dir ON whatsapp_messages(conversation_id, direction)',
    'CREATE INDEX IF NOT EXISTS idx_messages_conv_id ON whatsapp_messages(conversation_id, id)',
    'CREATE INDEX IF NOT EXISTS idx_media_message ON whatsapp_media(message_id)',
    'CREATE INDEX IF NOT EXISTS idx_lembretes_pendentes ON whatsapp_lembretes(status, enviar_em)',
    'CREATE INDEX IF NOT EXISTS idx_lembretes_evento ON whatsapp_lembretes(evento_chave)',
    'CREATE INDEX IF NOT EXISTS idx_lembretes_contato ON whatsapp_lembretes(contact_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_lembretes_conversa ON whatsapp_lembretes(conversation_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_envio_itens_fila ON whatsapp_envio_grupo_itens(status, envio_id)',
    'CREATE INDEX IF NOT EXISTS idx_envio_itens_envio ON whatsapp_envio_grupo_itens(envio_id)',
    'CREATE INDEX IF NOT EXISTS idx_envio_itens_contato ON whatsapp_envio_grupo_itens(contact_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_envios_grupo_status ON whatsapp_envios_grupo(status, criado_em DESC)',
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
      // Filtro "Bot": conversas em que o bot ja falou.
      if (filters.bot_only) {
        where += " AND EXISTS (SELECT 1 FROM whatsapp_messages m WHERE m.conversation_id = c.id" +
                 " AND (m.origem = 'bot' OR m.sent_by_bot = 1))";
      }
      // Filtro "Fora do expediente": quem recebeu o funil de fora do horario.
      if (filters.fora_exp_only) {
        where += " AND EXISTS (SELECT 1 FROM whatsapp_bot_contatos bc" +
                 " WHERE bc.contact_id = c.contact_id AND bc.fora_exp_periodo <> '')";
      }
      if (filters.search) {
        where += " AND (ct.name LIKE ? OR ct.phone LIKE ? OR ct.profile_name LIKE ? OR c.last_message_text LIKE ?)";
        const s = '%' + filters.search + '%';
        params.push(s, s, s, s);
      }
    }
    const limit = (filters && filters.limit) || 50;
    const offset = (filters && filters.offset) || 0;
    params.push(limit, offset);
    // As tres colunas extras (bot_em, bot_pausado, bot_saiu, tem_lembrete) sao
    // o que a lista precisa para mostrar o robozinho e o sininho SEM abrir a
    // conversa. Subconsulta por linha, apoiada nos indices
    // idx_messages_conversation e idx_lembretes_conversa: o custo fica no
    // tamanho da PAGINA (50 conversas), nao no tamanho do banco.
    return getAll(`
      SELECT c.*, ct.phone as contact_phone, ct.name as contact_name, ct.profile_name as contact_profile_name,
             a.display_phone as account_phone, a.business_name as account_name,
             (SELECT MAX(m.created_at) FROM whatsapp_messages m
               WHERE m.conversation_id = c.id AND (m.origem = 'bot' OR m.sent_by_bot = 1)) AS bot_em,
             (SELECT bc.pausado FROM whatsapp_bot_contatos bc WHERE bc.contact_id = c.contact_id) AS bot_pausado,
             (SELECT bc.optou_sair FROM whatsapp_bot_contatos bc WHERE bc.contact_id = c.contact_id) AS bot_saiu,
             (SELECT bc.fora_exp_periodo FROM whatsapp_bot_contatos bc WHERE bc.contact_id = c.contact_id) AS fora_exp,
             (SELECT COUNT(*) FROM whatsapp_lembretes l
               WHERE l.conversation_id = c.id AND l.status = 'agendado') AS lembretes_agendados
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
    ['status', 'assigned_to', 'assigned_to_name', 'unread_count', 'last_message_text', 'last_message_type', 'last_message_at', 'closed_at'].forEach(f => {
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
         template_name, template_language, status, sender_phone, sender_name, is_internal_note, error_code, error_message, sent_by_bot, origem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.conversation_id, data.account_id, data.wamid || null, data.direction || 'incoming',
       data.type || 'text', data.content || '', data.media_url || '', data.media_mime_type || '',
       data.media_filename || '', data.media_id || '', data.template_name || '', data.template_language || '',
       data.status || 'sent', data.sender_phone || '', data.sender_name || '',
       data.is_internal_note ? 1 : 0, data.error_code || '', data.error_message || '',
       data.sent_by_bot ? 1 : 0,
       // QUEM mandou: 'bot', 'lembrete' ou 'atendente'. Quem nao diz e
       // tratado pelo sent_by_bot, para nao rotular errado o que ja existe.
       data.origem || (data.sent_by_bot ? 'bot' : '')]
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

  // ── ATUALIZAÇÃO INCREMENTAL ─────────────────────────────────────────────
  // Só o que é NOVO desde a última mensagem que a tela já tem. É o que
  // permite atualizar a conversa sem redesenhá-la inteira (e sem apagar o que
  // a pessoa está digitando).
  listNovas(conversationId, desdeId, limite) {
    return getAll(
      `SELECT * FROM whatsapp_messages
        WHERE conversation_id = ? AND id > ?
        ORDER BY id ASC LIMIT ?`,
      [conversationId, Number(desdeId) || 0, limite || 200]
    );
  },

  // As ANTERIORES a uma mensagem, para quando a pessoa sobe a rolagem.
  // Por id, não por deslocamento: com mensagem nova chegando, o deslocamento
  // escorrega e a tela repetiria ou pularia mensagem.
  listAntigas(conversationId, antesId, limite) {
    const linhas = getAll(
      `SELECT * FROM whatsapp_messages
        WHERE conversation_id = ? AND id < ?
        ORDER BY id DESC LIMIT ?`,
      [conversationId, Number(antesId) || 0, limite || 50]
    );
    return linhas.reverse();            // devolve na ordem de leitura
  },

  countByConversation(conversationId) {
    const row = getOne('SELECT COUNT(*) as total FROM whatsapp_messages WHERE conversation_id = ?', [conversationId]);
    return row ? row.total : 0;
  },

  // Última mensagem que a PESSOA mandou. É ela que abre a janela de 24 horas
  // da Meta, dentro da qual se pode escrever à mão; depois, só modelo
  // aprovado. As horas são contadas dentro do SQL de propósito: as datas aqui
  // são UTC no formato do SQLite, e comparar isso em JavaScript já deu
  // problema antes (o painel do bot mostrava zero contato "hoje").
  // A ordenação é por julianday, não pelo texto da data: "2026-10-21T10:00"
  // é MAIOR que "2026-10-21 23:00" na comparação de texto (o "T" vem depois
  // do espaço), e aí a mensagem mais velha passaria na frente da mais nova.
  ultimaRecebida(conversationId) {
    return getOne(
      `SELECT created_at,
              (julianday('now') - julianday(created_at)) * 24.0 AS horas
         FROM whatsapp_messages
        WHERE conversation_id = ? AND direction = 'incoming'
        ORDER BY julianday(created_at) DESC, id DESC
        LIMIT 1`,
      [conversationId]
    );
  },

  // ── MÍDIA QUE CHEGA ─────────────────────────────────────────────────────
  // Grava o arquivo baixado NA MENSAGEM, pelo helper `run` do módulo — que é
  // o que salva o banco em disco. O webhook fazia esta gravação com
  // `getDb().prepare(...).run(...)` direto: mudava só a memória, e no próximo
  // reinício o endereço do arquivo tinha desaparecido. Era por isso que fotos
  // antigas "não apareciam" mesmo com o arquivo salvo no volume.
  gravarMidia(id, dados) {
    run(`UPDATE whatsapp_messages
            SET media_url = ?, media_mime_type = ?, media_filename = ?,
                media_falhou = 0, media_erro = '',
                media_tentativas = media_tentativas + 1
          WHERE id = ?`,
      [dados.media_url || '', dados.media_mime_type || '', dados.media_filename || '', id]);
  },

  // Tentativa que não deu certo. `definitivo` é para quando a Meta já apagou
  // o arquivo: não há o que tentar de novo, e a tela avisa em vez de ficar
  // eternamente em "(baixando...)".
  falhouMidia(id, erro, definitivo) {
    run(`UPDATE whatsapp_messages
            SET media_tentativas = media_tentativas + 1,
                media_falhou = ?, media_erro = ?
          WHERE id = ?`,
      [definitivo ? 1 : 0, String(erro || '').slice(0, 200), id]);
  },

  // Mensagens que têm media id e ainda não têm arquivo bom. É o que a tela
  // pede para tentar de novo ao abrir a conversa.
  // O ".bin" entra na lista de propósito: enquanto o tipo da Meta não era
  // entendido ("audio/ogg; codecs=opus"), o arquivo era salvo com essa
  // extensão e o navegador se recusava a tocar. Baixar de novo resolve, e o
  // arquivo antigo fica onde está — nada é apagado.
  pendentesDeMidia(conversationId, limite) {
    return getAll(
      `SELECT id, media_id, type, media_mime_type, media_tentativas
         FROM whatsapp_messages
        WHERE conversation_id = ?
          AND media_id <> ''
          AND (media_url IS NULL OR media_url = '' OR media_url LIKE '%.bin')
          AND media_falhou = 0
        ORDER BY id DESC
        LIMIT ?`,
      [conversationId, limite || 20]
    );
  },

  getById(id) {
    return getOne('SELECT * FROM whatsapp_messages WHERE id = ?', [id]);
  },

  updateStatus(wamid, status, errorCode, errorMessage) {
    run(
      "UPDATE whatsapp_messages SET status = ?, error_code = ?, error_message = ?, status_updated_at = datetime('now') WHERE wamid = ?",
      [status, errorCode || '', errorMessage || '', wamid]
    );
  }
};

// ==========================================================================
// OPERAÇÕES: MÍDIA RECEBIDA
// Ficha do arquivo que veio do contato. Grava pelo helper `run`, que salva em
// disco — o webhook inseria direto no banco em memória e o registro sumia no
// reinício.
// ==========================================================================
const media = {
  registrar(dados) {
    run(
      `INSERT INTO whatsapp_media
        (message_id, whatsapp_media_id, mime_type, file_size, filename, local_path, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [dados.message_id || null, dados.whatsapp_media_id || '', dados.mime_type || '',
       dados.file_size || 0, dados.filename || '', dados.local_path || '', dados.sha256 || '']
    );
  },

  doMessage(messageId) {
    return getOne('SELECT * FROM whatsapp_media WHERE message_id = ? ORDER BY id DESC LIMIT 1', [messageId]);
  }
};

// ==========================================================================
// OPERAÇÕES: JANELA ABERTA
// Quem ainda está dentro das 24 horas da ÚLTIMA MENSAGEM RECEBIDA (a dela, não
// a minha). É a janela em que a Meta aceita mensagem escrita à mão — fora dela,
// só modelo aprovado.
// ==========================================================================
const janela = {
  // A consulta devolve, de uma vez, tudo que a linha da tela mostra: a última
  // mensagem dela, quanto tempo falta, os sinais do bot/lua/sininho, se está
  // aguardando atendente e se EU já respondi depois dela. Uma consulta só, com
  // subconsultas por linha, apoiadas nos índices que já existem.
  lista(filtros) {
    const f = filtros || {};
    const params = [];
    let onde = "x.horas_restantes > 0";
    if (f.fechando_em_horas) { onde += ' AND x.horas_restantes <= ?'; params.push(Number(f.fechando_em_horas)); }
    if (f.so_bot) onde += " AND x.bot_em IS NOT NULL";
    if (f.so_fora_exp) onde += " AND IFNULL(x.fora_exp,'') <> ''";
    if (f.so_aguardando) onde += " AND x.aguardando_atendente = 1";
    if (f.sem_resposta_minha) onde += " AND x.respondi_depois = 0";
    // DISPAROS (envio em grupo). "Nunca recebeu", "ja recebeu", "ficou de fora
    // do ultimo" e "ficou de fora DAQUELE envio" — e o que permite mandar so
    // para quem falta.
    if (f.nunca_recebeu) onde += ' AND x.disparos_recebidos = 0';
    if (f.ja_recebeu) onde += ' AND x.disparos_recebidos > 0';
    if (f.nao_recebeu_envio) {
      onde += ` AND NOT EXISTS (SELECT 1 FROM whatsapp_envio_grupo_itens i
                                  WHERE i.contact_id = x.contact_id
                                    AND i.envio_id = ?
                                    AND i.status = 'enviado')`;
      params.push(Number(f.nao_recebeu_envio));
    }
    if (Array.isArray(f.account_ids)) {
      if (!f.account_ids.length) onde += ' AND 0=1';
      else {
        onde += ' AND x.account_id IN (' + f.account_ids.map(function () { return '?'; }).join(',') + ')';
        f.account_ids.forEach(function (id) { params.push(id); });
      }
    }
    if (f.busca) {
      onde += ' AND (IFNULL(x.contact_name,\'\') LIKE ? OR IFNULL(x.contact_profile_name,\'\') LIKE ? OR x.contact_phone LIKE ?)';
      const b = '%' + f.busca + '%';
      params.push(b, b, b);
    }
    params.push(Number(f.limite) || 300);
    return getAll(
      `SELECT * FROM (
         SELECT c.id AS conversation_id, c.account_id, c.contact_id, c.status,
                c.assigned_to_name, c.unread_count,
                ct.phone AS contact_phone, ct.name AS contact_name,
                ct.profile_name AS contact_profile_name,
                r.created_at AS ultima_recebida_em,
                r.content AS ultima_recebida_texto,
                r.type AS ultima_recebida_tipo,
                24.0 - (julianday('now') - julianday(r.created_at)) * 24.0 AS horas_restantes,
                -- EU ja respondi DEPOIS da ultima mensagem dela? O desempate
                -- pelo id importa: created_at tem precisao de SEGUNDO, e quem
                -- responde na hora cai no mesmo segundo da mensagem recebida.
                CASE WHEN EXISTS (SELECT 1 FROM whatsapp_messages m2
                                   WHERE m2.conversation_id = c.id AND m2.direction = 'outgoing'
                                     AND (julianday(m2.created_at) > julianday(r.created_at)
                                          OR (julianday(m2.created_at) = julianday(r.created_at) AND m2.id > r.id)))
                     THEN 1 ELSE 0 END AS respondi_depois,
                (SELECT MAX(m3.created_at) FROM whatsapp_messages m3
                  WHERE m3.conversation_id = c.id AND (m3.origem = 'bot' OR m3.sent_by_bot = 1)) AS bot_em,
                bc.pausado AS bot_pausado, bc.optou_sair AS bot_saiu,
                IFNULL(bc.aguardando_atendente, 0) AS aguardando_atendente,
                bc.fora_exp_periodo AS fora_exp,
                (SELECT COUNT(*) FROM whatsapp_lembretes l
                  WHERE l.conversation_id = c.id AND l.status = 'agendado') AS lembretes_agendados,
                -- DISPAROS JA RECEBIDOS por esta pessoa (envio em grupo com
                -- item 'enviado'). Sai da fila que ja existe: nao ha controle
                -- novo nenhum.
                (SELECT COUNT(*) FROM whatsapp_envio_grupo_itens i
                  WHERE i.contact_id = c.contact_id AND i.status = 'enviado') AS disparos_recebidos,
                (SELECT MAX(i.enviado_em) FROM whatsapp_envio_grupo_itens i
                  WHERE i.contact_id = c.contact_id AND i.status = 'enviado') AS ultimo_disparo_em,
                (SELECT e2.titulo FROM whatsapp_envio_grupo_itens i
                   JOIN whatsapp_envios_grupo e2 ON e2.id = i.envio_id
                  WHERE i.contact_id = c.contact_id AND i.status = 'enviado'
                  ORDER BY i.enviado_em DESC, i.id DESC LIMIT 1) AS ultimo_disparo_titulo,
                (SELECT i.envio_id FROM whatsapp_envio_grupo_itens i
                  WHERE i.contact_id = c.contact_id AND i.status = 'enviado'
                  ORDER BY i.enviado_em DESC, i.id DESC LIMIT 1) AS ultimo_disparo_id
           FROM whatsapp_conversations c
           LEFT JOIN whatsapp_contacts ct ON ct.id = c.contact_id
           LEFT JOIN whatsapp_bot_contatos bc ON bc.contact_id = c.contact_id
           JOIN whatsapp_messages r ON r.id = (
                SELECT m.id FROM whatsapp_messages m
                 WHERE m.conversation_id = c.id AND m.direction = 'incoming'
                 ORDER BY julianday(m.created_at) DESC, m.id DESC LIMIT 1)
       ) x
       WHERE ` + onde + `
       ORDER BY x.horas_restantes ASC
       LIMIT ?`,
      params
    );
  },

  // Os disparos que ESTAS pessoas receberam, para a dica do mouse no selo.
  // Uma consulta para a página inteira (e não uma por linha).
  disparosDosContatos(contactIds, limite) {
    const ids = (contactIds || []).map(Number).filter(function (n) { return !!n; });
    if (!ids.length) return [];
    const marcas = ids.map(function () { return '?'; }).join(',');
    return getAll(
      `SELECT i.contact_id, i.envio_id, i.enviado_em,
              e.titulo, substr(IFNULL(e.texto,''), 1, 80) AS texto_inicio
         FROM whatsapp_envio_grupo_itens i
         JOIN whatsapp_envios_grupo e ON e.id = i.envio_id
        WHERE i.status = 'enviado' AND i.contact_id IN (` + marcas + `)
        ORDER BY i.enviado_em DESC, i.id DESC
        LIMIT ?`,
      ids.concat([Number(limite) || 600])
    );
  },

  // Esta conversa ainda está dentro da janela? Conferido na hora de enviar
  // cada um, porque entre montar a lista e chegar a vez dela a janela pode ter
  // fechado.
  aberta(conversationId) {
    const r = getOne(
      `SELECT 24.0 - (julianday('now') - julianday(created_at)) * 24.0 AS horas_restantes
         FROM whatsapp_messages
        WHERE conversation_id = ? AND direction = 'incoming'
        ORDER BY julianday(created_at) DESC, id DESC LIMIT 1`,
      [conversationId]
    );
    if (!r || r.horas_restantes === null || r.horas_restantes === undefined) return false;
    return Number(r.horas_restantes) > 0;
  }
};

// ==========================================================================
// OPERAÇÕES: ENVIO EM GRUPO
// ==========================================================================
const envioGrupo = {
  criar(d) {
    return runInsert(
      `INSERT INTO whatsapp_envios_grupo
         (criado_por, criado_nome, account_id, texto, resposta_id, titulo,
          arquivo, tipo_anexo, mime, nome_arquivo, usar_lembretes, filtro, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ativo')`,
      [d.criado_por || '', d.criado_nome || '', d.account_id || null, d.texto || '',
       d.resposta_id || '', d.titulo || '', d.arquivo || '', d.tipo_anexo || '',
       d.mime || '', d.nome_arquivo || '', d.usar_lembretes ? 1 : 0, d.filtro || '']
    );
  },

  // Uma linha por contato. ON CONFLICT não faz nada: pedir o mesmo envio duas
  // vezes não enfileira a mesma pessoa de novo.
  acrescentarItem(envioId, c) {
    run(
      `INSERT INTO whatsapp_envio_grupo_itens
         (envio_id, conversation_id, contact_id, account_id, telefone, nome_contato, status)
       VALUES (?, ?, ?, ?, ?, ?, 'fila')
       ON CONFLICT(envio_id, contact_id) DO NOTHING`,
      [envioId, c.conversation_id, c.contact_id, c.account_id, c.telefone, c.nome_contato || '']
    );
  },

  getEnvio(id) {
    return getOne('SELECT * FROM whatsapp_envios_grupo WHERE id = ?', [id]);
  },

  // Os próximos da fila, só de envios ATIVOS (pausado e cancelado não saem).
  pendentes(limite) {
    return getAll(
      `SELECT i.*, e.texto, e.resposta_id, e.titulo, e.arquivo, e.tipo_anexo, e.mime,
              e.nome_arquivo, e.usar_lembretes, e.criado_por, e.status AS envio_status
         FROM whatsapp_envio_grupo_itens i
         JOIN whatsapp_envios_grupo e ON e.id = i.envio_id
        WHERE i.status = 'fila' AND e.status = 'ativo'
        ORDER BY i.id ASC LIMIT ?`,
      [limite || 10]
    );
  },

  marcarItem(id, status, extra) {
    const e = extra || {};
    run(
      `UPDATE whatsapp_envio_grupo_itens
          SET status = ?, erro = ?, wamid = ?, texto_enviado = ?,
              enviado_em = CASE WHEN ? = 'enviado' THEN datetime('now') ELSE enviado_em END,
              atualizado_em = datetime('now')
        WHERE id = ?`,
      [status, String(e.erro || '').slice(0, 200), e.wamid || '',
       String(e.texto || '').slice(0, 1000), status, id]
    );
  },

  mudarStatus(envioId, status) {
    run("UPDATE whatsapp_envios_grupo SET status = ?, atualizado_em = datetime('now') WHERE id = ?",
        [status, envioId]);
  },

  // Cancelar: só o que AINDA não saiu. Quem já recebeu não é afetado.
  cancelarPendentes(envioId) {
    run(`UPDATE whatsapp_envio_grupo_itens
            SET status = 'cancelado', erro = 'envio cancelado', atualizado_em = datetime('now')
          WHERE envio_id = ? AND status = 'fila'`, [envioId]);
  },

  contagem(envioId) {
    return getOne(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'fila' THEN 1 ELSE 0 END) AS na_fila,
              SUM(CASE WHEN status = 'enviado' THEN 1 ELSE 0 END) AS enviados,
              SUM(CASE WHEN status = 'falhou' THEN 1 ELSE 0 END) AS falhos,
              SUM(CASE WHEN status = 'janela_fechada' THEN 1 ELSE 0 END) AS janela_fechada,
              SUM(CASE WHEN status = 'saida' THEN 1 ELSE 0 END) AS saidas,
              SUM(CASE WHEN status = 'cancelado' THEN 1 ELSE 0 END) AS cancelados
         FROM whatsapp_envio_grupo_itens WHERE envio_id = ?`,
      [envioId]
    );
  },

  itens(envioId, limite) {
    return getAll(
      `SELECT i.*, c.name AS contato_nome
         FROM whatsapp_envio_grupo_itens i
         LEFT JOIN whatsapp_contacts c ON c.id = i.contact_id
        WHERE i.envio_id = ?
        ORDER BY i.id ASC LIMIT ?`,
      [envioId, limite || 500]
    );
  },

  // O envio mais recente (qualquer status): e o que o filtro "nao recebeu o
  // ultimo disparo" usa.
  ultimoEnvio() {
    return getOne('SELECT * FROM whatsapp_envios_grupo ORDER BY id DESC LIMIT 1');
  },

  // PROTECAO CONTRA REPETIR: quem, entre estas conversas, JA recebeu a mesma
  // mensagem nas ultimas N horas. "Mesma mensagem" e: a mesma mensagem pronta
  // (quando o disparo usa uma) ou o mesmo texto (quando e texto livre).
  jaReceberam(conversationIds, opcoes) {
    const ids = (conversationIds || []).map(Number).filter(function (n) { return !!n; });
    if (!ids.length) return [];
    const o = opcoes || {};
    const horas = Number(o.horas) || 24;
    const marcas = ids.map(function () { return '?'; }).join(',');
    const params = ids.slice();
    let igual = '';
    if (o.resposta_id) { igual = 'e.resposta_id = ?'; params.push(String(o.resposta_id)); }
    else if (o.texto) { igual = 'e.texto = ?'; params.push(String(o.texto)); }
    else return [];
    params.push(horas);
    return getAll(
      `SELECT i.conversation_id, i.contact_id, i.nome_contato, i.enviado_em,
              e.id AS envio_id, e.titulo
         FROM whatsapp_envio_grupo_itens i
         JOIN whatsapp_envios_grupo e ON e.id = i.envio_id
        WHERE i.status = 'enviado'
          AND i.conversation_id IN (` + marcas + `)
          AND ` + igual + `
          AND (julianday('now') - julianday(i.enviado_em)) * 24.0 <= ?
        ORDER BY i.enviado_em DESC`,
      params
    );
  },

  // Os envios recentes, com a contagem de cada um, para o painel.
  recentes(limite) {
    return getAll(
      `SELECT e.*,
              (SELECT COUNT(*) FROM whatsapp_envio_grupo_itens i WHERE i.envio_id = e.id) AS total,
              (SELECT COUNT(*) FROM whatsapp_envio_grupo_itens i WHERE i.envio_id = e.id AND i.status = 'enviado') AS enviados,
              (SELECT COUNT(*) FROM whatsapp_envio_grupo_itens i WHERE i.envio_id = e.id AND i.status = 'fila') AS na_fila,
              (SELECT COUNT(*) FROM whatsapp_envio_grupo_itens i WHERE i.envio_id = e.id AND i.status = 'falhou') AS falhos,
              (SELECT COUNT(*) FROM whatsapp_envio_grupo_itens i WHERE i.envio_id = e.id AND i.status IN ('janela_fechada','saida','cancelado')) AS pulados
         FROM whatsapp_envios_grupo e
        ORDER BY e.id DESC LIMIT ?`,
      [limite || 20]
    );
  }
};

// ==========================================================================
// OPERAÇÕES: LEMBRETES AUTOMÁTICOS
// Tudo pelo helper `run`/`getAll`, que salvam e leem com o banco em disco.
// ==========================================================================
const lembretes = {
  // Agenda (ou ATUALIZA, se já existia para o mesmo contato/mensagem/evento).
  agendar(d) {
    run(
      `INSERT INTO whatsapp_lembretes
         (resposta_id, titulo, evento_em, evento_chave, lembrete_id, rotulo, enviar_em,
          account_id, conversation_id, contact_id, telefone, nome_contato,
          texto, link, arquivo, tipo_anexo, mime, nome_arquivo, criado_por, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'agendado')
       ON CONFLICT(contact_id, resposta_id, lembrete_id, evento_em) DO UPDATE SET
          enviar_em = excluded.enviar_em, rotulo = excluded.rotulo,
          texto = excluded.texto, link = excluded.link,
          arquivo = excluded.arquivo, tipo_anexo = excluded.tipo_anexo,
          mime = excluded.mime, nome_arquivo = excluded.nome_arquivo,
          titulo = excluded.titulo, conversation_id = excluded.conversation_id,
          criado_por = excluded.criado_por,
          -- Reenviar a mesma mensagem pronta REABRE o agendamento: quem já
          -- tinha sido enviado continua enviado, o resto volta para a fila.
          status = CASE WHEN whatsapp_lembretes.status = 'enviado' THEN 'enviado' ELSE 'agendado' END,
          tentativas = 0, erro = '', atualizado_em = datetime('now')`,
      [d.resposta_id, d.titulo || '', d.evento_em, d.evento_chave, d.lembrete_id, d.rotulo || '',
       d.enviar_em, d.account_id, d.conversation_id, d.contact_id, d.telefone, d.nome_contato || '',
       d.texto || '', d.link || '', d.arquivo || '', d.tipo_anexo || '', d.mime || '',
       d.nome_arquivo || '', d.criado_por || '']
    );
  },

  // Cancela o que esta pendente DESTE contato para esta mensagem pronta em
  // OUTRO horário. É o que faz "mudei o horário deste envio" não deixar dois
  // agendamentos de pé para a mesma pessoa.
  cancelarOutrosEventos(contactId, respostaId, eventoEm, porQuem) {
    run(`UPDATE whatsapp_lembretes
            SET status = 'cancelado', erro = 'horário trocado', criado_por = ?,
                atualizado_em = datetime('now')
          WHERE contact_id = ? AND resposta_id = ? AND evento_em <> ? AND status = 'agendado'`,
      [porQuem || '', contactId, respostaId, eventoEm]);
  },

  pendentes(limite) {
    return getAll(
      `SELECT * FROM whatsapp_lembretes
        WHERE status = 'agendado' AND enviar_em <= datetime('now')
        ORDER BY enviar_em ASC LIMIT ?`,
      [limite || 20]
    );
  },

  getById(id) {
    return getOne('SELECT * FROM whatsapp_lembretes WHERE id = ?', [id]);
  },

  marcar(id, status, extra) {
    const e = extra || {};
    run(`UPDATE whatsapp_lembretes
            SET status = ?, erro = ?, wamid = ?, tentativas = tentativas + ?,
                enviado_em = CASE WHEN ? = 'enviado' THEN datetime('now') ELSE enviado_em END,
                atualizado_em = datetime('now')
          WHERE id = ?`,
      [status, String(e.erro || '').slice(0, 200), e.wamid || '', e.tentou ? 1 : 0, status, id]);
  },

  // Painel: um grupo por evento (mensagem pronta + horário).
  eventos(filtro) {
    // "Hoje" é o dia em BRASÍLIA, não no container (que roda em UTC): às 22h
    // de Brasília já é o dia seguinte em UTC, e o painel mostraria o evento de
    // hoje como se fosse de amanhã. -3 horas é fixo: o Brasil não tem mais
    // horário de verão desde 2019.
    let onde = '';
    if (filtro === 'hoje') onde = " WHERE date(evento_em, '-3 hours') = date('now', '-3 hours')";
    else if (filtro === 'amanha') onde = " WHERE date(evento_em, '-3 hours') = date('now', '-3 hours', '+1 day')";
    return getAll(
      `SELECT evento_chave, resposta_id, titulo, evento_em,
              COUNT(*) AS total,
              SUM(CASE WHEN status = 'agendado' THEN 1 ELSE 0 END) AS agendados,
              SUM(CASE WHEN status = 'enviado' THEN 1 ELSE 0 END) AS enviados,
              SUM(CASE WHEN status IN ('falhou','janela_fechada') THEN 1 ELSE 0 END) AS falhos,
              SUM(CASE WHEN status = 'cancelado' THEN 1 ELSE 0 END) AS cancelados,
              SUM(CASE WHEN status = 'perdido' THEN 1 ELSE 0 END) AS perdidos,
              MIN(enviar_em) AS primeiro_envio
         FROM whatsapp_lembretes` + onde + `
        GROUP BY evento_chave
        ORDER BY evento_em DESC
        LIMIT 100`
    );
  },

  doEvento(chave) {
    return getAll(
      `SELECT l.*, c.name AS contato_nome, c.phone AS contato_telefone
         FROM whatsapp_lembretes l
         LEFT JOIN whatsapp_contacts c ON c.id = l.contact_id
        WHERE l.evento_chave = ?
        ORDER BY l.enviar_em ASC, l.nome_contato ASC
        LIMIT 500`,
      [chave]
    );
  },

  // O que está agendado para uma conversa (o aviso discreto no chat).
  daConversa(conversationId) {
    return getAll(
      `SELECT * FROM whatsapp_lembretes
        WHERE conversation_id = ? AND status = 'agendado'
        ORDER BY enviar_em ASC LIMIT 20`,
      [conversationId]
    );
  },

  cancelarUm(id, porQuem) {
    run(`UPDATE whatsapp_lembretes
            SET status = 'cancelado', criado_por = ?, atualizado_em = datetime('now')
          WHERE id = ? AND status = 'agendado'`, [porQuem || '', id]);
  },

  cancelarEvento(chave, porQuem) {
    run(`UPDATE whatsapp_lembretes
            SET status = 'cancelado', criado_por = ?, atualizado_em = datetime('now')
          WHERE evento_chave = ? AND status = 'agendado'`, [porQuem || '', chave]);
  },

  // Muda o horário do evento inteiro: desloca TODOS os pendentes pelo mesmo
  // tanto, preservando a distância de cada lembrete até o evento.
  reagendarEvento(chave, novoEventoEm, novaChave) {
    run(`UPDATE whatsapp_lembretes
            SET enviar_em = datetime(enviar_em, '+' || CAST(ROUND((julianday(?) - julianday(evento_em)) * 86400) AS INTEGER) || ' seconds'),
                evento_em = ?, evento_chave = ?, atualizado_em = datetime('now'),
                status = CASE WHEN status IN ('perdido','janela_fechada','falhou') THEN 'agendado' ELSE status END,
                tentativas = 0, erro = ''
          WHERE evento_chave = ? AND status <> 'enviado' AND status <> 'cancelado'`,
      [novoEventoEm, novoEventoEm, novaChave, chave]);
  },

  // Para o teste e para o "enviar agora": joga o horário para trás.
  adiantarParaAgora(id) {
    run("UPDATE whatsapp_lembretes SET enviar_em = datetime('now'), status = 'agendado', atualizado_em = datetime('now') WHERE id = ?", [id]);
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
// ==========================================================================
// BOT DE ATENDIMENTO — acesso às tabelas
// ==========================================================================
const _hoje = () => new Date().toISOString().slice(0, 10);

const bot = {
  // ── estado por contato ──────────────────────────────────────────────────
  contato: function (contactId) {
    const r = getOne('SELECT * FROM whatsapp_bot_contatos WHERE contact_id = ?', [contactId]);
    if (r) return r;
    // Linha que ainda não existe equivale a "nada aconteceu com este contato".
    return {
      contact_id: contactId, optou_sair: 0, aguardando_atendente: 0, pausado: 0,
      ultima_resposta_em: null, ultima_msg_recebida_em: null,
      respostas_no_dia: 0, dia_da_contagem: '', total_respostas: 0,
      fora_exp_periodo: ''
    };
  },
  gravarContato: function (contactId, campos) {
    const atual = getOne('SELECT contact_id FROM whatsapp_bot_contatos WHERE contact_id = ?', [contactId]);
    const permitidos = ['optou_sair', 'optou_sair_em', 'aguardando_atendente', 'aguardando_desde',
      'pausado', 'pausado_em', 'pausado_por', 'ultima_resposta_em', 'ultima_msg_recebida_em',
      'respostas_no_dia', 'dia_da_contagem', 'total_respostas',
      'fora_exp_periodo'];
    const cols = [], vals = [];
    permitidos.forEach(function (c) {
      if (campos[c] !== undefined) { cols.push(c); vals.push(campos[c]); }
    });
    if (!cols.length) return;
    if (!atual) {
      run('INSERT INTO whatsapp_bot_contatos (contact_id, ' + cols.join(', ') + ') VALUES (?' +
          cols.map(function () { return ', ?'; }).join('') + ')', [contactId].concat(vals));
    } else {
      run('UPDATE whatsapp_bot_contatos SET ' + cols.map(function (c) { return c + ' = ?'; }).join(', ') +
          ", atualizado_em = datetime('now') WHERE contact_id = ?", vals.concat([contactId]));
    }
  },
  // Quantos contatos estão marcados como JÁ ATENDIDOS pelo funil. É o número
  // que a aba Bot mostra ao lado do modo "só na primeira vez" — sem ele, a
  // pessoa não tem como saber quem já recebeu.
  quantosAtendidos: function () {
    const r = getOne("SELECT COUNT(*) AS n FROM whatsapp_bot_contatos WHERE ultima_resposta_em IS NOT NULL AND ultima_resposta_em <> ''");
    return (r && Number(r.n)) || 0;
  },
  quantosForaExp: function () {
    const r = getOne("SELECT COUNT(*) AS n FROM whatsapp_bot_contatos WHERE fora_exp_periodo IS NOT NULL AND fora_exp_periodo <> ''");
    return (r && Number(r.n)) || 0;
  },

  // LIBERAR PARA RECEBER O FUNIL DE NOVO. Apaga SÓ a marcação de "já
  // atendido" (e a contagem do dia, que é da mesma regra). NÃO mexe em quem
  // pediu para sair, em quem está pausado à mão, nem em quem está na fila do
  // atendente: essas são decisões de outra natureza e apagá-las junto faria o
  // bot atropelar gente que pediu silêncio.
  // Com contactId, libera só aquela pessoa. Sem, libera todas.
  // Devolve quantos contatos ESTAVAM marcados (é o número que a tela mostra).
  liberarFunil: function (contactId) {
    const onde = contactId ? ' WHERE contact_id = ?' : '';
    const params = contactId ? [contactId] : [];
    const r = getOne(
      "SELECT COUNT(*) AS n FROM whatsapp_bot_contatos WHERE " +
      "((ultima_resposta_em IS NOT NULL AND ultima_resposta_em <> '') OR " +
      " (fora_exp_periodo IS NOT NULL AND fora_exp_periodo <> ''))" +
      (contactId ? ' AND contact_id = ?' : ''), params);
    const quantos = (r && Number(r.n)) || 0;
    run("UPDATE whatsapp_bot_contatos SET ultima_resposta_em = NULL, respostas_no_dia = 0, " +
        "dia_da_contagem = '', fora_exp_periodo = '', atualizado_em = datetime('now')" + onde, params);
    return quantos;
  },

  // Conta uma resposta do bot no dia (vira 1 quando o dia muda).
  contarResposta: function (contactId) {
    const c = bot.contato(contactId);
    const hoje = _hoje();
    const n = (c.dia_da_contagem === hoje) ? (c.respostas_no_dia || 0) + 1 : 1;
    bot.gravarContato(contactId, {
      respostas_no_dia: n, dia_da_contagem: hoje,
      ultima_resposta_em: new Date().toISOString(),
      total_respostas: (c.total_respostas || 0) + 1
    });
    return n;
  },
  respostasHoje: function (contactId) {
    const c = bot.contato(contactId);
    return (c.dia_da_contagem === _hoje()) ? (c.respostas_no_dia || 0) : 0;
  },

  // ── fila de envio ───────────────────────────────────────────────────────
  // Devolve null quando o wamid já está na fila: é a trava contra duplicidade.
  enfileirar: function (dados) {
    try {
      const id = runInsert(`INSERT INTO whatsapp_bot_fila
        (wamid_gatilho, account_id, conversation_id, contact_id, telefone, nome_contato,
         passos_json, passo_atual, total_passos, enviar_em, status, motivo, marcar_apos)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'pendente', ?, ?)`,
        [dados.wamid || null, dados.account_id, dados.conversation_id, dados.contact_id,
         dados.telefone, dados.nome_contato || '', JSON.stringify(dados.passos || []),
         (dados.passos || []).length, dados.enviar_em || new Date().toISOString(),
         dados.motivo || '', dados.marcar_apos || '']);
      return id;
    } catch (e) {
      // UNIQUE violado = webhook repetido. Não é erro: é a proteção agindo.
      if (/UNIQUE/i.test(e.message || '')) return null;
      throw e;
    }
  },
  // A marca é usada UMA vez: depois de aplicada, sai da linha da fila. Sem
  // isto, um reinício no meio da sequência marcaria o contato duas vezes e a
  // contagem do dia (modo "sempre") sairia errada.
  limparMarcaDaFila: function (id) {
    run("UPDATE whatsapp_bot_fila SET marcar_apos = '' WHERE id = ?", [id]);
  },

  filaPendentes: function (limite) {
    return getAll(`SELECT * FROM whatsapp_bot_fila
      WHERE status = 'pendente' AND (enviar_em IS NULL OR enviar_em <= ?)
      ORDER BY enviar_em ASC LIMIT ?`, [new Date().toISOString(), limite || 5]);
  },
  filaDoContato: function (contactId) {
    return getOne(`SELECT * FROM whatsapp_bot_fila
      WHERE contact_id = ? AND status = 'pendente' ORDER BY id DESC LIMIT 1`, [contactId]);
  },
  atualizarFila: function (id, campos) {
    const permitidos = ['passo_atual', 'enviar_em', 'status', 'tentativas', 'falhas',
                        'ultimo_erro', 'terminado_em'];
    const cols = [], vals = [];
    permitidos.forEach(function (c) {
      if (campos[c] !== undefined) { cols.push(c + ' = ?'); vals.push(campos[c]); }
    });
    if (!cols.length) return;
    run('UPDATE whatsapp_bot_fila SET ' + cols.join(', ') + ' WHERE id = ?', vals.concat([id]));
  },
  // Usado quando a pessoa responde no meio da sequência: termina o que falta
  // sem reiniciar e sem mandar o resto.
  encerrarFilaDoContato: function (contactId, motivo) {
    run(`UPDATE whatsapp_bot_fila SET status = 'encerrada', ultimo_erro = ?,
         terminado_em = datetime('now') WHERE contact_id = ? AND status = 'pendente'`,
        [motivo || '', contactId]);
  },

  // ── diário ──────────────────────────────────────────────────────────────
  registrar: function (tipo, contactId, telefone, detalhe) {
    try {
      run('INSERT INTO whatsapp_bot_log (tipo, contact_id, telefone, detalhe) VALUES (?, ?, ?, ?)',
          [tipo, contactId || null, telefone || '', String(detalhe || '').slice(0, 500)]);
    } catch (e) { console.error('[Bot] não consegui registrar no diário:', e.message); }
  },
  // O diario traz o NOME do contato junto: "5511..." nao diz nada para quem
  // esta lendo o que o bot fez.
  ultimosLogs: function (limite) {
    return getAll(
      `SELECT l.*, c.name AS contato_nome, c.profile_name AS contato_perfil
         FROM whatsapp_bot_log l
         LEFT JOIN whatsapp_contacts c ON c.id = l.contact_id
        ORDER BY l.id DESC LIMIT ?`, [limite || 50]);
  },

  // ── painel ──────────────────────────────────────────────────────────────
  painel: function () {
    // ATENÇÃO AO FORMATO DE DATA: as colunas criado_em usam o datetime('now')
    // do SQLite, que grava "2026-10-21 11:45:00" -- com ESPAÇO, sem o "T" e
    // sem o "Z". Comparar isso com um toISOString() do JavaScript dá errado
    // por comparação de texto ('T' vem depois do espaço na tabela de
    // caracteres), e o número de "hoje" saía ZERO enquanto o da semana vinha
    // certo. Então a conta de data é feita toda DENTRO do SQL, com as funções
    // do próprio SQLite.
    const um = function (sql, params) {
      const r = getOne(sql, params || []);
      return (r && r.n) || 0;
    };
    return {
      contatos_hoje: um(`SELECT COUNT(DISTINCT contact_id) AS n FROM whatsapp_bot_fila
                         WHERE date(criado_em) = date('now')`),
      contatos_semana: um(`SELECT COUNT(DISTINCT contact_id) AS n FROM whatsapp_bot_fila
                           WHERE criado_em >= datetime('now', '-7 days')`),
      contatos_mes: um(`SELECT COUNT(DISTINCT contact_id) AS n FROM whatsapp_bot_fila
                        WHERE criado_em >= datetime('now', '-30 days')`),
      sequencias_completas: um(`SELECT COUNT(*) AS n FROM whatsapp_bot_fila WHERE status = 'concluida'`),
      com_falha: um(`SELECT COUNT(*) AS n FROM whatsapp_bot_fila WHERE falhas > 0`),
      na_fila: um(`SELECT COUNT(*) AS n FROM whatsapp_bot_fila WHERE status = 'pendente'`),
      pedidos_atendente_hoje: um(`SELECT COUNT(*) AS n FROM whatsapp_bot_log
                                  WHERE tipo = 'atendente' AND date(criado_em) = date('now')`),
      pedidos_atendente_semana: um(`SELECT COUNT(*) AS n FROM whatsapp_bot_log
                                    WHERE tipo = 'atendente' AND criado_em >= datetime('now', '-7 days')`),
      saidas: um(`SELECT COUNT(*) AS n FROM whatsapp_bot_log WHERE tipo = 'saida'`)
    };
  },

  // ── cache do media id da Meta ───────────────────────────────────────────
  midiaCache: function (arquivo, accountId) {
    return getOne('SELECT * FROM whatsapp_bot_midia WHERE arquivo = ? AND account_id = ?', [arquivo, accountId]);
  },
  gravarMidiaCache: function (arquivo, accountId, mediaId, mime, tamanho) {
    run(`INSERT INTO whatsapp_bot_midia (arquivo, account_id, media_id, mime_type, tamanho)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(arquivo, account_id) DO UPDATE SET
           media_id = excluded.media_id, mime_type = excluded.mime_type,
           tamanho = excluded.tamanho, enviado_em = datetime('now')`,
        [arquivo, accountId, mediaId, mime || '', tamanho || 0]);
  },
  esquecerMidiaCache: function (arquivo, accountId) {
    run('DELETE FROM whatsapp_bot_midia WHERE arquivo = ? AND account_id = ?', [arquivo, accountId]);
  }
};

module.exports = {
  init, getDb, getDbPath, salvarImediato,
  accounts, contacts, conversations, messages, media, templates, tags, webhookEvents, audit,
  lembretes, janela, envioGrupo,
  bot,
  dashboardStats, backup, close
};
