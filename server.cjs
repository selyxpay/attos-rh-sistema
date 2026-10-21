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
// Documentos da Diária (RG, comprovante) ficam FORA de UPLOADS_DIR de propósito:
// tudo dentro de UPLOADS_DIR é servido sem login nenhum (rota /uploads/..).
// Documento pessoal só pode sair por rota autenticada — ver /api/diaria/admin/arquivo.
const DIARIA_DOCS_DIR = path.join(DATA_DIR, 'diaria-docs');
// Midia do bot: FORA de /uploads/ (que e publico, regra 7). So sai pela
// rota autenticada /api/whatsapp/bot/midia/<arquivo>.
const BOT_MIDIA_DIR = path.join(DATA_DIR, 'bot-midia');
const LIMITE_CORPO = 160 * 1024 * 1024; // 160 MB. O corpo inteiro e montado na MEMORIA (data += chunk);
// ATENCAO: ja aconteceu de o state.json passar de 48 MB (fotos gravadas DENTRO
// do JSON) e TODO save comecar a ser recusado silenciosamente. O limite subiu
// para dar folga, mas a solucao certa e manter o arquivo pequeno:
//   node limpar-fotos-embutidas.cjs --aplicar
// 500 MB viravam ~1 GB de RAM e derrubariam a VPS. 48 MB comporta 1 arquivo de 20 MB em base64 (~27 MB) com folga.

// ── ÚLTIMA REDE: ERRO NÃO TRATADO ──────────────────────────────────────────
// De propósito, isto NÃO mantém o processo vivo. Um processo que seguiu depois
// de um erro desconhecido pode estar com o estado pela metade, e gravar em
// cima disso é pior que cair. O que ele faz é deixar o motivo REGISTRADO no
// log (antes ficava só o stack cru) e encerrar com código de erro, para o
// Coolify subir um processo novo e limpo.
// A proteção de verdade é não deixar a exceção chegar aqui: ver decodeSeguro
// (endereço mal formado) e o try/catch do comTrava (falha ao gravar estado).
function _encerrarPorErroFatal(origem, erro) {
  try {
    console.error('');
    console.error('*** ERRO FATAL (' + origem + ') — o processo vai encerrar e subir de novo.');
    console.error('*** ' + ((erro && erro.stack) || erro));
    console.error('*** Hora: ' + new Date().toISOString());
    console.error('');
  } catch (e) { /* nem o log pode impedir o encerramento */ }
  process.exit(1);
}
process.on('uncaughtException', function (e) { _encerrarPorErroFatal('uncaughtException', e); });
process.on('unhandledRejection', function (e) { _encerrarPorErroFatal('unhandledRejection', e); });

// Garante as pastas de dados
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (e) {}
try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch (e) {}
try { fs.mkdirSync(DIARIA_DOCS_DIR, { recursive: true }); } catch (e) {}
try { fs.mkdirSync(BOT_MIDIA_DIR, { recursive: true }); } catch (e) {}

// ── BACKUP DA INICIALIZAÇÃO ────────────────────────────────────────────────
// Guarda uma cópia do state.json ANTES de o sistema ler ou gravar qualquer
// coisa. Roda a cada subida do processo, e deploy é justamente quando o
// processo sobe — então todo deploy deixa para trás a foto de como o sistema
// estava um instante antes dele.
//
// Isto é diferente do backup por hora que já existia mais abaixo
// (fazerBackupSePreciso): aquele gira em 24 slots de hora + 7 de dia, com
// nomes fixos, então a cópia das 14h de hoje sobrescreve a das 14h de ontem.
// Aqui cada subida gera um arquivo NOVO, com data e hora no nome, e ficam as
// 20 mais recentes.
//
// Três coisas que esta função NUNCA faz:
//   - não altera, não move e não renomeia o state.json (só LÊ e escreve outro
//     arquivo);
//   - não apaga nada que não seja uma cópia dela mesma (os arquivos
//     state-hora-* e state-dia-* do outro backup ficam intactos);
//   - não impede o sistema de subir: qualquer falha vira log e a vida segue.
//
// A pasta é DATA_DIR/backups, ou seja, dentro do volume persistente do
// Coolify (DATA_DIR=/data no container). Se ficasse dentro do container,
// sumiria no deploy seguinte — que é exatamente quando o backup mais importa.
const PREFIXO_BACKUP_SUBIDA = 'state_';
const MAX_BACKUPS_SUBIDA = 20;

// ── O QUE É DADO E NUNCA PODE SER SERVIDO ──────────────────────────────────
// Usado pelo servidor de arquivos estáticos. Vale para o DATA_DIR configurado
// E para os nomes de pasta/arquivo de dados, porque a pasta padrão fica
// dentro da própria aplicação e a conferência de "está dentro de BASE"
// deixava passar.
const PASTAS_DE_DADOS = ['server-data', 'server-data-test', 'server-data-local',
                         'server-data-preview', '.data', 'backups', 'backups-manuais',
                         'diaria-docs', 'equipamentos', 'sessions'];
const ARQUIVOS_DE_DADOS = ['state.json', 'sessions.json', '.env'];

// Arquivos que são do SERVIDOR e nunca foram para o navegador. O handler de
// estáticos só perguntava "está dentro da pasta da aplicação?", então
// /server.cjs entregava os 196 KB do backend inteiro para qualquer um, sem
// login — com a lógica de login mestre, a estrutura das rotas e a criação da
// conta de administração. O navegador nunca pediu nada disto: ele pede
// .html na raiz, js/, css/, img/ e precificacao-base.json.
function _arquivoDoServidor(caminhoAbsoluto) {
  const nome = path.basename(caminhoAbsoluto).toLowerCase();
  if (/\.(cjs|mjs|md|log|bak|tmp|sh|yml|yaml|lock)$/.test(nome)) return true;
  if (nome === 'dockerfile' || nome === '.dockerignore' || nome === '.gitignore') return true;
  if (nome === 'package.json' || nome === 'package-lock.json') return true;
  if (nome.charAt(0) === '.') return true;                 // .env, .git*, qualquer oculto
  // a pasta docs/ é documentação interna (inclui o passo a passo do deploy)
  const partes = path.resolve(caminhoAbsoluto).split(path.sep);
  if (partes.indexOf('docs') >= 0 || partes.indexOf('node_modules') >= 0 || partes.indexOf('.git') >= 0) return true;
  if (partes.indexOf('testes') >= 0) return true;
  return false;
}

function _caminhoDeDados(caminhoAbsoluto) {
  const alvo = path.resolve(caminhoAbsoluto);
  // 1) dentro da pasta de dados configurada (em produção, /data)
  const dataDir = path.resolve(DATA_DIR);
  if (alvo === dataDir || alvo.startsWith(dataDir + path.sep)) return true;
  // 2) qualquer pasta de dados conhecida, em qualquer nível
  const partes = alvo.split(path.sep);
  for (let i = 0; i < partes.length; i++) {
    if (PASTAS_DE_DADOS.indexOf(partes[i]) >= 0) return true;
  }
  // 3) arquivo de dado pelo nome, e banco SQLite
  const nome = path.basename(alvo);
  if (ARQUIVOS_DE_DADOS.indexOf(nome) >= 0) return true;
  if (/\.(db|db-wal|db-shm|sqlite|sqlite3)$/i.test(nome)) return true;
  return false;
}

function backupDaInicializacao() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      console.log('[Backup] primeira subida: ainda não existe state.json para copiar.');
      return null;
    }
    const conteudo = fs.readFileSync(STATE_FILE);          // só LEITURA do original
    if (!conteudo || conteudo.length < 2) {
      console.warn('[Backup] state.json está vazio — nada copiado (não sobrescreve cópia boa com arquivo vazio).');
      return null;
    }
    const a = new Date();
    const p2 = n => String(n).padStart(2, '0');
    const carimbo = a.getFullYear() + '-' + p2(a.getMonth() + 1) + '-' + p2(a.getDate()) +
                    '_' + p2(a.getHours()) + 'h' + p2(a.getMinutes());
    let nome = PREFIXO_BACKUP_SUBIDA + carimbo + '.json';
    // Duas subidas no mesmo minuto (reinício em sequência) não podem se
    // sobrescrever: a segunda ganha um sufixo.
    if (fs.existsSync(path.join(BACKUP_DIR, nome))) {
      nome = PREFIXO_BACKUP_SUBIDA + carimbo + '_' + p2(a.getSeconds()) + 's.json';
      let n = 2;
      while (fs.existsSync(path.join(BACKUP_DIR, nome)) && n < 100) {
        nome = PREFIXO_BACKUP_SUBIDA + carimbo + '_' + p2(a.getSeconds()) + 's-' + n + '.json';
        n++;
      }
    }
    const destino = path.join(BACKUP_DIR, nome);
    fs.writeFileSync(destino, conteudo);                   // arquivo NOVO

    // Confere que a cópia saiu idêntica. Se não saiu, avisa alto: um backup
    // que não confere é pior que nenhum, porque dá falsa segurança.
    const gravado = fs.readFileSync(destino);
    if (!gravado.equals(conteudo)) {
      console.error('[Backup] *** a cópia ' + nome + ' saiu DIFERENTE do original. NÃO confie nela.');
    } else {
      console.log('[Backup] cópia da inicialização: ' + nome +
                  ' (' + (conteudo.length / 1024).toFixed(1) + ' KB) em ' + BACKUP_DIR);
    }

    // Mantém as 20 mais recentes DESTAS cópias. A ordem vem do nome, que
    // começa com a data no formato ano-mês-dia — ordenar por texto já ordena
    // por tempo.
    const minhas = fs.readdirSync(BACKUP_DIR)
      .filter(function (f) { return f.indexOf(PREFIXO_BACKUP_SUBIDA) === 0 && /\.json$/.test(f); })
      .sort();
    if (minhas.length > MAX_BACKUPS_SUBIDA) {
      const sobrando = minhas.slice(0, minhas.length - MAX_BACKUPS_SUBIDA);
      sobrando.forEach(function (f) {
        try {
          fs.unlinkSync(path.join(BACKUP_DIR, f));
          console.log('[Backup] cópia antiga removida: ' + f);
        } catch (e) {
          console.error('[Backup] não consegui remover a cópia antiga ' + f + ':', e.message);
        }
      });
    }
    return nome;
  } catch (e) {
    // Backup é rede de segurança, não pode virar o motivo de o sistema não subir.
    console.error('[Backup] FALHOU a cópia da inicialização (o sistema segue subindo):', e.message);
    return null;
  }
}
backupDaInicializacao();

// ── LIMPEZA PONTUAL (outubro de 2026) ──────────────────────────────────────
// Arquivo de 70 bytes que ficou órfão na pasta pública: foi um pixel subido
// para CONFERIR, num deploy, que a validação de upload por conteúdo estava
// valendo em produção. Nenhum cadastro aponta para ele.
// Está aqui porque a pasta de uploads fica na VPS e não há rota para apagar
// arquivo — então a remoção acontece na subida, uma vez, e depois esta função
// não encontra mais nada e não faz nada.
// PODE SER REMOVIDA desta vez em diante: ver o SISTEMA-VISAO-GERAL.md.
function limparArquivosOrfaos() {
  const orfaos = ['1792590980313_oa0fhz_verificacao_deploy.png'];
  orfaos.forEach(function (nome) {
    try {
      // path.basename e conferência de pasta, como em qualquer caminho (regra 4)
      const alvo = path.join(UPLOADS_DIR, path.basename(nome));
      if (!path.resolve(alvo).startsWith(path.resolve(UPLOADS_DIR) + path.sep)) return;
      if (!fs.existsSync(alvo)) return;
      const tam = fs.statSync(alvo).size;
      // Só apaga se for mesmo o arquivinho de teste. Um arquivo grande com
      // esse nome seria outra coisa, e aí é melhor não encostar.
      if (tam > 4096) {
        console.warn('[Limpeza] ' + nome + ' tem ' + tam + ' bytes, maior que o esperado. NÃO apaguei.');
        return;
      }
      fs.unlinkSync(alvo);
      console.log('[Limpeza] arquivo órfão de teste removido: ' + nome + ' (' + tam + ' bytes)');
    } catch (e) {
      console.error('[Limpeza] não consegui remover ' + nome + ':', e.message);
    }
  });
}
limparArquivosOrfaos();

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
  // Audio do WhatsApp: a Meta busca o arquivo pelo link e confere o tipo.
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.aac': 'audio/aac',
  '.amr': 'audio/amr',
  '.mp4': 'video/mp4',
  '.3gp': 'video/3gpp',
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
  // microphone=(self): o proprio site pode pedir o microfone (audio do
  // WhatsApp); site de fora embutido, nao. Era microphone=() — proibido para
  // todos — e o getUserMedia morria com "Permission denied" MESMO com a pessoa
  // clicando em Permitir. O teste com microfone falso pegou isso antes do ar.
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(self), payment=()',
  // Dados e fotos agora são do PRÓPRIO servidor ('self'); mantém só os CDNs usados
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
    "img-src 'self' data: blob: https://images.unsplash.com https://ui-avatars.com https://api.qrserver.com",
    // O OCR (Tesseract) baixa TRÊS coisas de fora, e todas precisam estar aqui:
    //   • o motor e o núcleo (wasm) .......... cdn.jsdelivr.net
    //   • o DICIONÁRIO de português .......... tessdata.projectnaptha.com
    // Faltava o terceiro. Sem ele o navegador bloqueava calado e a leitura de
    // PDF digitalizado simplesmente não acontecia — parecia que o OCR estava
    // desligado, quando na verdade ele nunca conseguia carregar o idioma.
    "connect-src 'self' https://viacep.com.br https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://tessdata.projectnaptha.com https://unpkg.com",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '),
};

// ==========================================================================
// MESCLAGEM (páginas públicas): mantém o servidor e só ADICIONA/atualiza
// (portado da antiga camada de nuvem — mesma regra)
// ==========================================================================
function mesclarEstado(servidor, local, upsertIds, deleteIds, setKeys) {
  const ups = {};
  (upsertIds || []).forEach(function (id) { ups[id] = true; });
  const out = JSON.parse(JSON.stringify(servidor || {}));
  Object.keys(local || {}).forEach(function (k) {
    const lv = local[k];
    if (Array.isArray(lv)) {
      if (!Array.isArray(out[k])) { out[k] = lv.filter(function (x) { return x !== null && x !== undefined; }); return; }
      const idx = {};
      out[k].forEach(function (it, i) { if (it && it.id != null) idx[it.id] = i; });
      // Itens SEM id (ex.: tiposPagamentoFluxo, que é uma lista de textos) não
      // podem ser anexados às cegas: o cliente manda a lista inteira de volta e
      // ela DOBRA a cada gravação. Foi assim que tiposPagamentoFluxo chegou a
      // 6,5 milhões de itens (78 MB) e travou todos os saves do sistema.
      // Agora esses itens só entram se ainda não existirem (comparação por valor).
      let jaExiste = null;
      lv.forEach(function (it) {
        // null/undefined no meio de uma lista de registros e veneno: no
        // navegador, um unico null faz o filter estourar e a aba inteira
        // aparece em branco. Nao entra, e nao fica.
        if (it === null || it === undefined) return;
        if (it && it.id != null) {
          if (idx[it.id] === undefined) out[k].push(it);      // novo -> adiciona
          else if (ups[it.id]) out[k][idx[it.id]] = it;       // upsert -> substitui
        } else {
          if (jaExiste === null) {
            jaExiste = {};
            out[k].forEach(function (x) { if (!x || x.id == null) jaExiste[JSON.stringify(x)] = true; });
          }
          const chave = JSON.stringify(it);
          if (!jaExiste[chave]) { out[k].push(it); jaExiste[chave] = true; }
        }
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
  // APAGAR de verdade. O merge sozinho só junta, nunca remove — então quem
  // apagava algo estando com a versão atrasada via o item sumir da tela e
  // voltar no próximo carregamento (o save caía no merge anti-perda, que
  // preserva tudo que o cliente não mandou). Com deleteIds o cliente diz
  // explicitamente o que tirar, e a exclusão vale mesmo no merge.
  if (deleteIds && deleteIds.length) {
    const del = {};
    deleteIds.forEach(function (id) { del[String(id)] = true; });
    Object.keys(out).forEach(function (k) {
      if (!Array.isArray(out[k])) return;
      out[k] = out[k].filter(function (it) { return !(it && it.id != null && del[String(it.id)]); });
    });
  }
  // Chave que NÃO é lista (configuração — ex.: ffWorkflow) só entrava quando
  // o servidor ainda não tinha a chave. Ou seja: mudar a configuração com a
  // versão atrasada não gravava nada e voltava sozinho. setKeys marca as
  // chaves que o cliente está mudando de propósito.
  if (setKeys && setKeys.length) {
    setKeys.forEach(function (k) {
      if (local && Object.prototype.hasOwnProperty.call(local, k)) out[k] = local[k];
    });
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
// Versão atual guardada na memória, para responder /api/state/version sem
// precisar ler e interpretar o state.json inteiro a cada consulta.
let _versaoMemoria = null;
function versaoAtual() {
  if (_versaoMemoria === null) {
    const s = lerEstado();
    _versaoMemoria = { version: s.version || 0, atualizadoEm: s.atualizadoEm || 0 };
  }
  return _versaoMemoria;
}

function gravarEstado(obj) {
  try { fazerBackupSePreciso(); } catch (e) { /* backup nunca pode derrubar o save */ }
  _versaoMemoria = { version: obj.version || 0, atualizadoEm: obj.atualizadoEm || 0 };
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
// Serializa as gravações de estado (mutex). A fila NUNCA trava: mesmo que o
// corpo falhe, o próximo da fila roda.
//
// `res` é opcional e serve para o caso de uso HTTP. Sem ele, uma exceção
// dentro do corpo era ENGOLIDA aqui: o processo não caía (certo), mas o
// handler morria no meio sem responder nada. O fetch do navegador ficava
// pendurado para sempre e, como o `flushing` do vps-sync nunca voltava a
// false, AQUELA ABA parava de receber as alterações das outras pessoas — em
// silêncio, sem erro na tela nem no log. Passando o `res`, a falha sempre
// vira um 500 e o navegador sabe que precisa tentar de novo.
function comTrava(fn, res) {
  const p = _fila.then(fn, fn);
  _fila = p.then(function () {}, function () {});
  p.catch(function (e) {
    console.error('[comTrava] falha na operação serializada:', (e && e.stack) || e);
    if (res && !res.headersSent) {
      try { responderJson(res, 500, { error: 'falha interna ao gravar' }); } catch (e2) {}
    }
  });
  return p;
}

// ==========================================================================
// Utilidades HTTP
// ==========================================================================
function responderJson(res, code, obj) {
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, SECURITY_HEADERS));
  res.end(JSON.stringify(obj));
}

// ── QUE ARQUIVO É ESTE, DE VERDADE? (magic bytes) ──────────────────────────
// NUNCA confie na extensão nem no Content-Type que o cliente mandou: os dois
// são escolhidos por quem envia. Um SVG declarado como "image/png" passava
// pela conferência antiga e ia para a pasta pública com extensão .png — e SVG
// é XML, carrega <script> dentro. HTML renomeado para .jpg, idem.
// Aqui o tipo sai dos PRIMEIROS BYTES do conteúdo.
//
// Devolve uma etiqueta curta: 'png' | 'jpeg' | 'gif' | 'webp' | 'bmp' |
// 'svg' | 'html' | 'pdf' | 'zip' | 'ole' | 'mp4' | 'mp3' | 'ogg' | 'amr' |
// 'aac' | 'wav' | 'texto' | 'desconhecido'.
const TIPOS_IMAGEM_SEGURA = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
const EXT_DO_TIPO = {
  png: 'png', jpeg: 'jpg', gif: 'gif', webp: 'webp', bmp: 'bmp',
  svg: 'svg', pdf: 'pdf', zip: 'zip', ole: 'doc',
  mp4: 'mp4', mp3: 'mp3', ogg: 'ogg', amr: 'amr', aac: 'aac', wav: 'wav',
  texto: 'txt', html: 'html'
};

function detectarTipoReal(buf) {
  if (!buf || buf.length < 2) return 'desconhecido';
  const b = buf;
  const comeca = function (bytes, off) {
    const o = off || 0;
    if (b.length < o + bytes.length) return false;
    for (let i = 0; i < bytes.length; i++) if (b[o + i] !== bytes[i]) return false;
    return true;
  };
  const texto = function (s, off) {
    const o = off || 0;
    if (b.length < o + s.length) return false;
    return b.slice(o, o + s.length).toString('latin1') === s;
  };

  // ---- imagens (as únicas que podem ser servidas inline) ----
  if (comeca([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return 'png';
  if (comeca([0xFF, 0xD8, 0xFF])) return 'jpeg';
  if (texto('GIF87a') || texto('GIF89a')) return 'gif';
  if (texto('RIFF') && texto('WEBP', 8)) return 'webp';
  if (texto('WAVE', 8)) return 'wav';
  if (texto('BM')) return 'bmp';

  // ---- documentos e mídia ----
  if (texto('%PDF')) return 'pdf';
  if (comeca([0x50, 0x4B, 0x03, 0x04]) || comeca([0x50, 0x4B, 0x05, 0x06])) return 'zip';   // docx/xlsx/pptx
  if (comeca([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])) return 'ole';               // doc/xls/ppt antigos
  if (texto('ftyp', 4)) return 'mp4';                                                        // mp4 / 3gp / m4a
  if (texto('ID3') || comeca([0xFF, 0xFB]) || comeca([0xFF, 0xF3]) || comeca([0xFF, 0xF2])) return 'mp3';
  if (texto('OggS')) return 'ogg';
  if (texto('#!AMR')) return 'amr';
  if (comeca([0xFF, 0xF1]) || comeca([0xFF, 0xF9])) return 'aac';

  // ---- texto: SVG e HTML não têm magic byte, são XML/marcação ----
  // Olha só o começo, já sem BOM e sem espaço em branco.
  let inicio = b.slice(0, 1024).toString('utf8');
  inicio = inicio.replace(/^﻿/, '').replace(/^\s+/, '');
  const minusculo = inicio.toLowerCase();
  if (/^<svg[\s>]/.test(minusculo)) return 'svg';
  if (/^<\?xml/.test(minusculo) && /<svg[\s>]/.test(minusculo)) return 'svg';
  if (/^<!doctype\s+html/.test(minusculo) || /^<html[\s>]/.test(minusculo)) return 'html';
  // Marcação solta com script/iframe/onload é tratada como HTML: não interessa
  // o nome, interessa que o navegador executaria.
  if (/^</.test(minusculo) && /<script|<iframe|\son\w+\s*=/.test(minusculo)) return 'html';
  // Texto puro de verdade (sem byte de controle fora de tab/nova linha).
  const amostra = b.slice(0, 512);
  let ehTexto = true;
  for (let i = 0; i < amostra.length; i++) {
    const c = amostra[i];
    if (c === 0) { ehTexto = false; break; }
    if (c < 9 || (c > 13 && c < 32)) { ehTexto = false; break; }
  }
  if (ehTexto && amostra.length) return 'texto';
  return 'desconhecido';
}

// ── DECODIFICAR ENDEREÇO SEM DERRUBAR O SERVIDOR ───────────────────────────
// decodeURIComponent LANÇA (URIError) quando a URL tem um "%" solto ou um
// escape pela metade (ex.: "/%", "?token=%"). Isso ficava fora de qualquer
// try/catch e derrubava o PROCESSO INTEIRO — todo mundo caía junto, e bastava
// um robô varrendo o site ou um link colado com "%" sobrando. Agora toda
// decodificação passa por aqui: devolve null em vez de lançar, e quem chama
// responde 400.
// Regra 6: id de registro nunca pode ser so Date.now() -- duas acoes no
// mesmo milissegundo geravam o mesmo id e uma sobrescrevia a outra.
function _novoIdServidor(prefixo) {
  return String(prefixo || 'id') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}
function decodeSeguro(s) {
  try { return decodeURIComponent(String(s == null ? '' : s)); }
  catch (e) { return null; }
}
// Monta o mapa da query string. Devolve null se qualquer pedaço estiver
// mal formado (mesmo motivo do decodeSeguro).
function queryParaMapa(query) {
  const qp = {};
  const partes = String(query || '').split('&');
  for (let i = 0; i < partes.length; i++) {
    if (!partes[i]) continue;
    const kv = partes[i].split('=');
    const k = decodeSeguro(kv[0]);
    if (k === null) return null;
    if (!k) continue;
    const v = decodeSeguro(kv.slice(1).join('=') || '');
    if (v === null) return null;
    qp[k] = v;
  }
  return qp;
}
function lerCorpo(req, cb) {
  // ACENTO CORROMPIDO: antes isto era `let data = ''` com `data += chunk`.
  // O chunk é Buffer, e `string += Buffer` converte CADA PEDAÇO sozinho para
  // texto. Quando um caractere de 2 bytes (ã, ç, é) cai na fronteira entre
  // dois pedaços, cada metade virava "�" — e o JSON.parse ACEITA isso, então
  // "João" era gravado como "Jo��o" sem erro nenhum. O /api/state manda o
  // estado inteiro, dezenas de pedaços, então a mina estava sempre armada.
  // Em lista sem id o valor corrompido ainda era visto como item novo e
  // DUPLICAVA o conteúdo a cada save (a armadilha de "lista cresce sem
  // parar"). Agora junta os bytes primeiro e converte uma vez só, igual ao
  // lerCorpoBruto já fazia.
  const partes = [];
  let tamanho = 0;
  req.on('data', function (chunk) {
    tamanho += chunk.length;
    if (tamanho > LIMITE_CORPO) { cb(new Error('corpo muito grande')); req.destroy(); return; }
    partes.push(chunk);
  });
  req.on('end', function () {
    try {
      const data = Buffer.concat(partes).toString('utf8');
      const lido = data ? JSON.parse(data) : {};
      // Corpo que NÃO é objeto (o literal `null`, um número, uma string) vira
      // objeto vazio. Várias rotas — principalmente as do WhatsApp — fazem
      // `body.campo` direto, sem o `(body && body.campo)` usado no resto do
      // arquivo. Com `null` isso lançava DENTRO do callback do 'end', fora de
      // qualquer try, e derrubava o processo inteiro. Resolver aqui cobre
      // todas as rotas de uma vez, em vez de remendar dezenas de pontos.
      cb(null, (lido && typeof lido === 'object') ? lido : {});
    } catch (e) { cb(e); }
  });
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
  // Conta SEM senha nao entra, nunca. Antes caia no String(digitada) ===
  // String(undefined) la embaixo: quem digitasse a palavra "undefined" entrava.
  if (armazenada === undefined || armazenada === null || armazenada === '') return false;
  if (String(armazenada).length !== 64) return String(digitada) === String(armazenada);
  return hashSenhaServer(digitada) === String(armazenada);
}

// ── SENHAS QUE ESTAO PUBLICAS ──────────────────────────────────────────────
// Estas senhas ja estiveram escritas em js/data.js, num repositorio no GitHub.
// Tirar do arquivo agora nao resolve: elas continuam no historico do git, e
// quem ja copiou continua com elas. Entao o sistema passa a EXIGIR a troca no
// proximo login de quem ainda usa uma delas.
const HASH_SENHAS_PUBLICAS = [
  'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3', // 3 digitos
  '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', // 4 digitos
  '5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5', // 5 digitos
  '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', // 6 digitos
  'b7e94be513e96e8c45cd23d162275e5a12ebde9100a425c4ebcdd7fa4dcd897c', // a palavra obvia
  '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', // o proprio login
  '6fddde9bdad0d3b51946fdc5b8febda9f6772a518a235b5158a9367a20522bfe', // conta da clinica
  'c41e5bf3be87c0241522a54ae9d0deb82e69ac9793ec47e7d61240bba46b3ab5', // administrador
  '6101ed3e13dcdc5ea80901f4c5e1c9152d55b33b077b9f0b6ec30e72bf082e08'  // admin de fabrica
];
function senhaEhPublica(texto) {
  if (!texto) return false;
  return HASH_SENHAS_PUBLICAS.indexOf(hashSenhaServer(String(texto))) >= 0;
}

// Anti-brute-force por login (memória): 5 falhas -> 60s de espera
const tentativasLogin = {};
function podeTentarLogin(login) { const t = tentativasLogin[login]; return !(t && t.ate && Date.now() < t.ate); }
function registrarFalhaLogin(login) { const t = tentativasLogin[login] || { n: 0, ate: 0 }; t.n++; if (t.n % 5 === 0) t.ate = Date.now() + 60 * 1000; tentativasLogin[login] = t; }

// ── LIMITE DE UPLOAD SEM LOGIN ─────────────────────────────────────────────
// A ficha pública de candidatura precisa subir 3 fotos, e uma pessoa pode
// refazer. 40 por hora por IP dá folga para isso e ainda assim impede que
// alguém encha o volume de dados da empresa.
const subidasAnonimas = {};
const LIMITE_SUBIDA_ANONIMA = 40;
const JANELA_SUBIDA_ANONIMA = 60 * 60 * 1000;
function _podeSubirAnonimo(ip) {
  const r = subidasAnonimas[ip];
  if (!r || (Date.now() - r.desde) > JANELA_SUBIDA_ANONIMA) return true;
  return r.n < LIMITE_SUBIDA_ANONIMA;
}
function _registrarSubidaAnonima(ip) {
  const agora = Date.now();
  const r = subidasAnonimas[ip];
  if (!r || (agora - r.desde) > JANELA_SUBIDA_ANONIMA) { subidasAnonimas[ip] = { n: 1, desde: agora }; return; }
  r.n++;
  // Limpeza simples para a tabela não crescer sem parar.
  if (Object.keys(subidasAnonimas).length > 5000) {
    Object.keys(subidasAnonimas).forEach(function (k) {
      if ((agora - subidasAnonimas[k].desde) > JANELA_SUBIDA_ANONIMA) delete subidasAnonimas[k];
    });
  }
}
function limparFalhasLogin(login) { delete tentativasLogin[login]; }

// ==========================================================================
// EMPRESAS SIGILOSAS — sigilo de verdade, feito no SERVIDOR
// --------------------------------------------------------------------------
// Esconder só na tela não seria sigilo: o navegador receberia os dados e
// bastaria abrir as ferramentas do desenvolvedor para ler. Então quem não
// está autorizado simplesmente NÃO RECEBE essas empresas, seus tomadores e
// clientes, nem as fichas que usam elas.
//
// Autorizado = conta mestre OU login listado em dados.ffSigiloLogins
// (configurado pelo admin em Configurações).
// ==========================================================================
function _sigiloAutorizado(dados, login) {
  if (!login) return false;
  if (ehMestreLogin(login)) return true;
  const lista = (dados && Array.isArray(dados.ffSigiloLogins)) ? dados.ffSigiloLogins : [];
  return lista.indexOf(login) >= 0;
}

// Ids das empresas marcadas como sigilosas
function _idsSigilosos(dados) {
  const ids = {};
  ((dados && dados.ffEmpresas) || []).forEach(function (e) {
    if (e && e.sigilosa === true && e.id) ids[e.id] = true;
  });
  return ids;
}

// Uma ficha é sigilosa se QUALQUER vínculo dela aponta para empresa sigilosa
function _fichaEhSigilosa(f, ids) {
  if (!f) return false;
  if (f.empresaId && ids[f.empresaId]) return true;
  return Array.isArray(f.vinculos) && f.vinculos.some(function (v) { return v && ids[v.empresaId]; });
}

// Devolve uma CÓPIA do estado sem nada sigiloso (para quem não pode ver)
function _semSigilo(dados) {
  const d = Object.assign({}, dados || {});
  const ids = _idsSigilosos(d);
  if (!Object.keys(ids).length) return d;
  d.ffEmpresas  = (d.ffEmpresas  || []).filter(function (e) { return !(e && ids[e.id]); });
  d.ffTomadores = (d.ffTomadores || []).filter(function (t) { return !(t && ids[t.empresaId]); });
  d.ffClientes  = (d.ffClientes  || []).filter(function (c) { return !(c && ids[c.empresaId]); });
  d.fluxosFinanceiros = (d.fluxosFinanceiros || []).filter(function (f) { return !_fichaEhSigilosa(f, ids); });
  return d;
}

// Ao gravar: quem não enxerga o sigiloso não pode apagá-lo sem querer.
// Devolve para o payload tudo que tinha sido escondido dele.
function _devolverSigilo(antes, novo) {
  const ids = _idsSigilosos(antes || {});
  if (!Object.keys(ids).length) return novo;
  const d = novo || {};
  const juntar = function (chave, ehDoSigilo) {
    const guardados = ((antes && antes[chave]) || []).filter(ehDoSigilo);
    if (!guardados.length) return;
    const atual = Array.isArray(d[chave]) ? d[chave] : [];
    const tem = {};
    atual.forEach(function (r) { if (r && r.id != null) tem[r.id] = true; });
    d[chave] = atual.concat(guardados.filter(function (r) { return r && !tem[r.id]; }));
  };
  juntar("ffEmpresas",  function (e) { return e && ids[e.id]; });
  juntar("ffTomadores", function (t) { return t && ids[t.empresaId]; });
  juntar("ffClientes",  function (c) { return c && ids[c.empresaId]; });
  juntar("fluxosFinanceiros", function (f) { return _fichaEhSigilosa(f, ids); });
  // A lista de quem pode ver também é preservada: só o admin autorizado mexe nela
  if (antes && antes.ffSigiloLogins !== undefined) d.ffSigiloLogins = antes.ffSigiloLogins;
  return d;
}

// Subconjunto PÚBLICO do estado (sem login): só o que as páginas públicas usam.
// NUNCA expõe candidatos, banco de talentos, funcionários (senhas!), logs, etc.
// ATENÇÃO — esta função responde a QUEM NÃO ESTÁ LOGADO.
// Antes ela funcionava por lista de EXCLUSÃO: apagava alguns campos e devolvia
// TODO O RESTO. Com isso, equipamentos/EPI (com CPF), contratações, exames
// médicos e fluxos financeiros estavam sendo servidos publicamente — e a
// resposta chegou a 87 MB, o que também derrubava o carregamento da tela.
// Agora é lista de INCLUSÃO: só sai o que as páginas públicas realmente usam
// (candidato.html, talento.html, fila-display.html). Qualquer área nova do
// sistema fica privada por padrão.
const CHAVES_PUBLICAS = ['vagas', 'recrutadores', 'fila', 'proximaFilaNum', 'portalSettings', 'empresas'];

function subsetPublico(dados) {
  const origem = dados || {};
  const d = {};
  CHAVES_PUBLICAS.forEach(function (k) {
    if (origem[k] !== undefined) d[k] = JSON.parse(JSON.stringify(origem[k]));
  });
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

// ==========================================================================
// CADASTROS DO FLUXO FINANCEIRO — EMPRESAS / TOMADORES / CLIENTES
// --------------------------------------------------------------------------
// Carrega a base oficial de ff-cadastros-base.json (a planilha do cliente).
//
// COMO A TROCA FUNCIONA, sem perder nada:
//   - Todo registro vindo do arquivo leva origem "base".
//   - Quando a VERSÃO do arquivo muda, os registros de origem "base" são
//     recriados do zero — é assim que uma lista errada é corrigida por inteiro.
//   - O que o admin cadastrar pela tela (origem "manual") NUNCA é tocado.
//   - Fichas já criadas NÃO são afetadas: cada vínculo guarda, junto do id, o
//     nome da empresa, o código do tomador e o nome do cliente. Ficha antiga
//     continua mostrando exatamente o que mostrava.
//
// Rodar de novo na mesma versão não muda nada (idempotente).
// ==========================================================================
// Diária — Fase 2, sub-fase 1: diárias antigas (de antes da remoção do GPS)
// ganham abertaEm/encerradaEm null, pra ficha nova não quebrar em cima do
// dado velho. Os campos antigos (pontoEncontro/lat/lng/raioMetros) ficam nos
// registros existentes sem problema — nenhuma tela lê mais eles.
// ── DIÁRIA — helpers puros (módulo inteiro: migração no boot e rotas usam
//    as MESMAS funções, por isso ficam aqui fora e não dentro do handler
//    de requisição) ───────────────────────────────────────────────────────
function diariaPodeGerenciar(requester) {
  return !!(requester && (ehMestreLogin(requester.login) || requester.departamento === 'administracao'));
}
function diariaNormalizarNome(nome) {
  return String(nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
// Dígito verificador oficial da Receita (mesmo algoritmo usado em qualquer
// validador de CPF de verdade — dois módulos 11 em sequência).
function diariaCpfValido(cpf) {
  const dCpf = String(cpf || '').replace(/\D/g, '');
  if (dCpf.length !== 11 || /^(\d)\1{10}$/.test(dCpf)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(dCpf[i], 10) * (10 - i);
  let resto = (soma * 10) % 11; if (resto >= 10) resto = 0;
  if (resto !== parseInt(dCpf[9], 10)) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(dCpf[i], 10) * (11 - i);
  resto = (soma * 10) % 11; if (resto >= 10) resto = 0;
  return resto === parseInt(dCpf[10], 10);
}
const DIARIA_PIX_TIPOS = ['celular', 'email', 'cpf'];
function diariaPixValida(tipo, chave) {
  const c = String(chave || '').trim();
  if (tipo === 'celular') return /^\d{10,11}$/.test(c.replace(/\D/g, ''));
  if (tipo === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);
  if (tipo === 'cpf') return diariaCpfValido(c);
  return false;
}
// Nunca devolve telefone completo, CPF, RG, Pix nem token pro lado errado
// ler — a ficha completa só sai pela rota de admin (autenticada).
function diariaTrabalhadorPublico(t) {
  return { id: t.id, nome: t.nome, status: t.status, criadoEm: t.criadoEm };
}
// A ficha do admin precisa dos dados todos (CPF, RG, endereço, Pix,
// documentos...) pra decidir a contratação — mas NUNCA do token de sessão do
// trabalhador nem do hash de senha: isso é credencial de acesso, não dado
// cadastral, e não tem por que aparecer numa resposta que o navegador do
// admin guarda em log/devtools/cache.
function diariaTrabalhadorAdmin(t) {
  const copia = Object.assign({}, t);
  delete copia.tokens;
  delete copia.senhaHash;
  return copia;
}
// Usado tanto por /status (reentrada pelo token salvo) quanto por /login
// (nome+telefone) — os dois devolvem exatamente a mesma forma pro cliente.
function diariaMontarStatusResposta(t, d) {
  const hoje = new Date().toISOString().slice(0, 10);
  const diariaHoje = (d.diarias || []).find(function (x) { return x.data === hoje && x.status === 'aberta'; }) || null;
  let presenca = null;
  if (diariaHoje) {
    presenca = (d.presencasDiaria || []).find(function (p) { return p.diariaId === diariaHoje.id && p.trabalhadorId === t.id; }) || null;
  }
  return {
    trabalhador: diariaTrabalhadorPublico(t),
    diariaHoje: diariaHoje ? { id: diariaHoje.id, titulo: diariaHoje.titulo, status: diariaHoje.status } : null,
    presenca: presenca
  };
}
// Tira o "55" (código do Brasil) de telefones que vieram com DDI colado —
// gente costuma colar o número direto do WhatsApp (que mostra com +55) no
// cadastro, mas depois digita só o número puro no login. Sem isso, os dois
// nunca batem e o login "erra" mesmo sendo a pessoa certa.
function diariaNormalizarTelefone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.slice(0, 2) === '55') {
    const resto = d.slice(2);
    if (resto.length === 10 || resto.length === 11) d = resto;
  }
  return d;
}
// Date.now() sozinho pode colidir quando várias pessoas cadastram/confirmam
// presença no mesmo milissegundo (exatamente o caso de uso real: várias
// pessoas clicando no link ao mesmo tempo) — dois registros com o mesmo id
// fariam o segundo pisar nos documentos do primeiro e as ações do admin
// (que buscam por id) acertarem sempre o registro errado.
function diariaGerarId(prefixo) {
  return prefixo + '-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex');
}
// Login do trabalhador é nome completo + telefone (sem senha de verdade por
// enquanto — ver "senhaHash" no cadastro). Limite por IP, não por nome: o
// risco aqui é alguém tentando adivinhar nome+telefone de várias pessoas do
// mesmo local, não só ficar martelando uma conta.
const diariaTentativasLoginIp = {};
function diariaPodeTentarLogin(ip) {
  const t = diariaTentativasLoginIp[ip];
  if (!t) return true;
  if (Date.now() - t.inicio > 10 * 60 * 1000) { delete diariaTentativasLoginIp[ip]; return true; }
  return t.n < 5;
}
function diariaRegistrarFalhaLogin(ip) {
  const t = diariaTentativasLoginIp[ip];
  if (!t || Date.now() - t.inicio > 10 * 60 * 1000) { diariaTentativasLoginIp[ip] = { n: 1, inicio: Date.now() }; return; }
  t.n++;
}
function diariaLimparFalhasLogin(ip) { delete diariaTentativasLoginIp[ip]; }
// Salva uma imagem base64 em disco, FORA da pasta pública (ver DIARIA_DOCS_DIR
// no topo do arquivo). Devolve só o nome do arquivo, nunca o caminho inteiro
// nem o base64 — isso é o que vai gravado no state.json.
function diariaSalvarDocumento(trabalhadorId, campo, dataUrl) {
  const m = /^data:([^;]+);base64,([\s\S]*)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 8 * 1024 * 1024) throw new Error('Imagem de ' + campo + ' muito grande (máximo 8MB).');
  let ext = (m[1].split('/')[1] || 'jpg').split('+')[0].split(';')[0];
  if (!/^[a-z0-9]{2,5}$/i.test(ext)) ext = 'jpg';
  const pastaPessoa = path.join(DIARIA_DOCS_DIR, trabalhadorId);
  fs.mkdirSync(pastaPessoa, { recursive: true });
  const nome = campo + '.' + ext;
  fs.writeFileSync(path.join(pastaPessoa, nome), buf);
  return nome;
}

function migrarDiariaFase2() {
  comTrava(function () {
    const st = lerEstado();
    const d = st.dados || {};
    let mudou = false;
    if (Array.isArray(d.diarias)) {
      d.diarias.forEach(function (diaria) {
        if (diaria.abertaEm === undefined) { diaria.abertaEm = null; mudou = true; }
        if (diaria.encerradaEm === undefined) { diaria.encerradaEm = null; mudou = true; }
      });
    }
    // Sub-fase 2: trabalhador cadastrado no modelo simples (só nome+telefone,
    // um token só) ganha os campos novos com valor neutro, e o token antigo
    // vira o primeiro item do array — sem isso a pessoa perderia o acesso
    // que já tinha.
    if (Array.isArray(d.trabalhadoresDiaria)) {
      d.trabalhadoresDiaria.forEach(function (t) {
        if (!Array.isArray(t.tokens)) {
          t.tokens = t.token ? [t.token] : [];
          mudou = true;
        }
        if (t.nomeNormalizado === undefined) { t.nomeNormalizado = diariaNormalizarNome(t.nome); mudou = true; }
        if (t.nomePai === undefined) { t.nomePai = null; mudou = true; }
        if (t.nomeMae === undefined) { t.nomeMae = null; mudou = true; }
        if (t.rg === undefined) { t.rg = null; mudou = true; }
        if (t.cpf === undefined) { t.cpf = null; mudou = true; }
        if (t.cep === undefined) {
          t.cep = null; t.logradouro = null; t.numero = null; t.complemento = null;
          t.bairro = null; t.cidade = null; t.uf = null; mudou = true;
        }
        if (t.pixTipo === undefined) { t.pixTipo = null; t.pixChave = null; mudou = true; }
        if (t.documentos === undefined) { t.documentos = {}; mudou = true; }
        if (t.senhaHash === undefined) { t.senhaHash = null; mudou = true; }
        if (t.observacaoAdmin === undefined) { t.observacaoAdmin = null; mudou = true; }
      });
    }
    if (mudou) {
      try { gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() }); }
      catch (e) { console.error('[Diária] migração fase 2:', e); }
    }
  });
}

function garantirCadastrosFinanceiro() {
  comTrava(function () {
    let base;
    try {
      base = JSON.parse(fs.readFileSync(path.join(BASE, 'ff-cadastros-base.json'), 'utf8'));
    } catch (e) {
      return;   // sem arquivo base: nada a fazer (não é erro)
    }

    const st = lerEstado();
    const d = st.dados || {};
    let mudou = false;

    // ── MIGRAÇÃO (roda uma vez) ────────────────────────────────────────────
    // Antes, os cadastros do financeiro dividiam as listas empresas/tomadores/
    // clientes com a parte OPERACIONAL (Vagas, Contratações, gráficos do
    // Dashboard, mapa do Banco de Talentos). Atualizar a lista do financeiro
    // apagava a operacional junto. Aqui os registros de origem "base" são
    // MOVIDOS para chaves próprias e a lista operacional é devolvida intacta.
    if (!Array.isArray(d.ffEmpresas))  d.ffEmpresas  = [];
    if (!Array.isArray(d.ffTomadores)) d.ffTomadores = [];
    if (!Array.isArray(d.ffClientes))  d.ffClientes  = [];
    [['empresas', 'ffEmpresas'], ['tomadores', 'ffTomadores'], ['clientes', 'ffClientes']]
      .forEach(function (par) {
        const velha = par[0], nova = par[1];
        if (!Array.isArray(d[velha]) || !d[velha].length) return;
        const doFF = d[velha].filter(function (r) { return r && (r.origem === 'base' || r.origem === 'manual'); });
        if (!doFF.length) return;
        const jaTem = {};
        d[nova].forEach(function (r) { if (r && r.id != null) jaTem[r.id] = true; });
        doFF.forEach(function (r) { if (!jaTem[r.id]) { d[nova].push(r); jaTem[r.id] = true; } });
        d[velha] = d[velha].filter(function (r) {
          return !(r && (r.origem === 'base' || r.origem === 'manual'));
        });
        mudou = true;
        console.log('[RT] Migrou ' + doFF.length + ' ' + velha + ' do financeiro para ' + nova + '.');
      });

    // ── Carga da base oficial ─────────────────────────────────────────────
    // Registro vindo do arquivo leva origem "base". Quando a VERSÃO do arquivo
    // muda, os "base" são recriados do zero — é assim que uma lista errada é
    // corrigida inteira. O que o admin cadastrar pela tela (origem "manual")
    // NUNCA é tocado. E nada disso encosta na lista operacional.
    const versaoArquivo = Number(base.versao || 1);
    const versaoAtual   = Number(d.ffCadastrosVersao || 0);
    const primeiraVez   = !d.ffEmpresas.length && !d.ffTomadores.length && !d.ffClientes.length;

    if (versaoAtual !== versaoArquivo || primeiraVez) {
      const doAdmin = {
        empresas:  d.ffEmpresas.filter(function (e)  { return e && e.origem === 'manual'; }),
        tomadores: d.ffTomadores.filter(function (t) { return t && t.origem === 'manual'; }),
        clientes:  d.ffClientes.filter(function (c)  { return c && c.origem === 'manual'; })
      };
      const daBase = function (lista) {
        return (lista || []).map(function (r) {
          return Object.assign({}, r, { ativo: r.ativo !== false, origem: 'base' });
        });
      };
      d.ffEmpresas  = daBase(base.empresas).concat(doAdmin.empresas);
      d.ffTomadores = daBase(base.tomadores).concat(doAdmin.tomadores);
      d.ffClientes  = daBase(base.clientes).concat(doAdmin.clientes);
      d.ffCadastrosVersao = versaoArquivo;
      mudou = true;
      console.log('[RT] Cadastros do Fluxo Financeiro na versão ' + versaoArquivo + ': ' +
        d.ffEmpresas.length + ' empresa(s), ' + d.ffTomadores.length + ' tomador(es), ' +
        d.ffClientes.length + ' cliente(s). (preservados do admin: ' + doAdmin.empresas.length +
        '/' + doAdmin.tomadores.length + '/' + doAdmin.clientes.length + ')');
    }

    if (mudou) {
      gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() });
    } else {
      console.log('[RT] Cadastros do Fluxo Financeiro já na versão ' + versaoArquivo + ' (nada a fazer).');
    }
    console.log('[RT] Empresas OPERACIONAIS (vagas/dashboard): ' + ((d.empresas || []).length));
  });
}

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
                const nova = JSON.parse(JSON.stringify(fInit));
                // O data.js nao guarda mais senha (ele vai para o GitHub). A do
                // admin vem de ADMIN_SENHA. Sem a variavel, cai na senha antiga
                // — que e publica, e o sistema exige trocar no primeiro login.
                if ((nova.login || '').toLowerCase() === 'admin' && !nova.senha) {
                  // Sem ADMIN_SENHA a conta nasce SEM SENHA e ninguem entra
                  // nela (senhaConfere recusa senha vazia). Antes caia num
                  // hash fixo escrito aqui, de uma senha publica — e este
                  // arquivo ficou baixavel em producao. Falhar fechado e o
                  // certo: deploy mal configurado nao pode virar porta aberta.
                  if (process.env.ADMIN_SENHA) {
                    nova.senha = hashSenhaServer(String(process.env.ADMIN_SENHA));
                  } else {
                    nova.senha = '';
                    console.warn('[RT] *** ADMIN_SENHA nao esta definida.');
                    console.warn('[RT] *** A conta admin foi criada SEM SENHA e NINGUEM consegue entrar nela.');
                    console.warn('[RT] *** Defina ADMIN_SENHA no Coolify e reinicie para a conta ficar utilizavel.');
                  }
                }
                d.funcionarios.push(nova);
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
      // A senha do admin sai de ADMIN_SENHA. Antes era um hash fixo com a senha
      // em texto no comentario ao lado — publicada no GitHub junto com o codigo.
      // Sem a variavel, cai no padrao antigo, que o sistema trata como publica e
      // exige trocar no primeiro login.
      d.funcionarios.push({
        id: 'func-admin', nome: 'Administrador', login: 'admin',
        senha: process.env.ADMIN_SENHA ? hashSenhaServer(String(process.env.ADMIN_SENHA)) : '',
        departamento: 'administracao', status: 'ativo', permissoes: {}
      });
      if (!process.env.ADMIN_SENHA) {
        console.warn('[RT] *** ADMIN_SENHA nao esta definida: a conta admin nasceu SEM SENHA.');
        console.warn('[RT] *** Ninguem entra nela. Defina ADMIN_SENHA no Coolify e reinicie.');
      }
      mudou = true;
      console.log('[RT] Conta admin criada.');
    }

    // ── SENHA DO ADMIN, DEPOIS DE TODO O SEED ────────────────────────────
    // O data.js nao guarda mais senha nenhuma (ele vai para o GitHub), e ha
    // TRES caminhos que criam a conta admin: a copia em bloco dos mocks, o
    // laco de sincronizacao e o bloco acima. Tratar em cada um deixava buraco
    // — a copia em bloco roda primeiro e passava por cima. Entao a definicao
    // fica aqui, no fim, valendo para todos.
    // So preenche quando esta VAZIA: senha de producao nunca e sobrescrita.
    {
      const adm = d.funcionarios.find(function (f) { return (f.login || '').toLowerCase() === 'admin'; });
      if (adm && !adm.senha) {
        // Só entra aqui quando a senha está VAZIA (ver o if acima): senha de
        // produção nunca é sobrescrita. Sem ADMIN_SENHA, continua vazia.
        if (process.env.ADMIN_SENHA) {
          adm.senha = hashSenhaServer(String(process.env.ADMIN_SENHA));
          mudou = true;
        }
        if (!process.env.ADMIN_SENHA) {
          console.warn('[RT] *** ADMIN_SENHA nao esta definida e a conta admin esta SEM SENHA.');
          console.warn('[RT] *** Ninguem consegue entrar nela. Defina ADMIN_SENHA no Coolify e reinicie.');
        }
      }
    }

    if (mudou) {
      gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() });
    }

    // Lista de contas no console — APENAS em desenvolvimento.
    // Em produção (NODE_ENV=production, como no Coolify) as senhas NUNCA são
    // impressas: o log do painel fica visível para quem tem acesso ao Coolify
    // e ficaria guardado no histórico de logs.
    if (process.env.NODE_ENV === 'production') {
      console.log('[RT] ' + d.funcionarios.length + ' conta(s) de acesso carregada(s). ' +
                  '(As senhas não são exibidas em produção.)');
    } else {
      console.log('\n==================================================');
      console.log('CONTAS E SENHAS (somente ambiente de desenvolvimento):');
      d.funcionarios.forEach(function (f) {
        const senhaExibida = f.senha && f.senha.length === 64 ? '(SHA-256)' : (f.senha || '');
        console.log(` - Login: ${f.login.padEnd(12)} | Senha: ${senhaExibida.padEnd(18)} | Departamento: ${f.departamento}`);
      });
      console.log('==================================================\n');
    }
  });
}

// Contas MESTRE (veem todas as senhas)
function ehMestreLogin(login) { const l = (login || '').toLowerCase(); return l === 'joaobalaf' || l === 'admin'; }
// Quem pode mexer em acesso de outra pessoa: mestre ou administração.
function ehAdminDeAcesso(requester) {
  return !!(requester && (ehMestreLogin(requester.login) || requester.departamento === 'administracao'));
}

// ── PERMISSÃO POR TELA ─────────────────────────────────────────────────────
// Mesma fonte usada pelo navegador (js/telas.js). Antes o servidor só sabia
// "tem sessão ou não", e esconder a aba do menu não protegia nada.
const RTTelas = require('./js/telas.js');

// Rotas que pertencem a uma tela. GET/HEAD exige 'ver'; o resto exige
// 'editar'. O que não está aqui segue pela cadeia normal (e /api/state tem
// tratamento próprio, por chave, mais abaixo).
const ROTAS_POR_TELA = [
  { re: /^\/api\/diaria\/admin\//,                                      tela: 'diaria' },
  { re: /^\/api\/openwa\//,                                             tela: 'whatsapp-qr' },
  // A DO BOT VEM ANTES da do WhatsApp: permitirRota usa o PRIMEIRO padrão que
  // casa, e /api/whatsapp/bot/... também casa com /api/whatsapp/. Invertendo a
  // ordem, a aba Bot passaria a ser liberada pela permissão do WhatsApp.
  { re: /^\/api\/whatsapp\/bot\//,                                      tela: 'bot' },
  { re: /^\/api\/whatsapp\//,                                           tela: 'whatsapp' },
  { re: /^\/api\/(ver-senha|reset-senha|aprovar-senha|solicitacoes-senha)$/, tela: 'funcionarios' },
  { re: /^\/api\/relatorio-equip-admin\//,                              tela: 'equipamentos' }
];

// Responde 401/403 e devolve false quando a sessão não pode usar a rota.
function permitirRota(req, res, urlPath, metodo, autenticado) {
  let regra = null;
  for (let i = 0; i < ROTAS_POR_TELA.length; i++) {
    if (ROTAS_POR_TELA[i].re.test(urlPath)) { regra = ROTAS_POR_TELA[i]; break; }
  }
  if (!regra) return true;
  if (!autenticado) { responderJson(res, 401, { error: 'não autorizado' }); return false; }
  const u = usuarioDaReq(req);
  if (!u) { responderJson(res, 401, { error: 'não autorizado' }); return false; }
  if (RTTelas.ehMestreLogin(u.login)) return true;
  const dados = (lerEstado().dados) || {};
  const nivelExigido = (metodo === 'GET' || metodo === 'HEAD') ? 'ver' : 'editar';
  const ok = nivelExigido === 'ver'
    ? RTTelas.podeVerTela(u, dados, regra.tela)
    : RTTelas.podeEditarTela(u, dados, regra.tela);
  if (!ok) {
    console.log('[Telas] 403 ' + metodo + ' ' + urlPath + ' — ' + u.login +
                ' não tem "' + regra.tela + '" em nível ' + nivelExigido);
    responderJson(res, 403, { error: 'sem permissão para esta tela' });
    return false;
  }
  return true;
}

// ── CAMPOS DE ACESSO: O CLIENTE NÃO MANDA, O SERVIDOR REPÕE ────────────────
// Mesmo molde do _devolverSigilo: o POST /api/state manda o estado inteiro, e
// em cima dele o servidor REPÕE o que aquela sessão não tinha direito de
// mudar. Não precisa comparar nem adivinhar o que o cliente tentou: o valor
// gravado é simplesmente o do servidor.
//
// O que isso fechava: qualquer funcionário logado podia mandar um POST com o
// próprio registro alterado — departamento 'administracao', permissões todas
// true — e virava administrador. Ou reescrever o HASH da senha de
// 'joaobalaf' e entrar como mestre. Não havia nenhum 403 no caminho.
//
// SENHA é caso à parte: ninguém, nem admin, troca senha por aqui. Isso é das
// rotas dedicadas (/api/login, /api/trocar-senha, /api/reset-senha), que
// conferem permissão e registram. Repor sempre também é o que impede o
// estado novo (sem o campo `senha`, removido do GET) de apagar a senha de
// todo mundo no primeiro save.
const CAMPOS_SENHA = ['senha', 'senhaVisivel'];
const CAMPOS_ACESSO = [
  'permissoes', 'permissoesFluxo', 'permissoesEspeciais', 'telas',
  'departamento', 'perfil', 'status', 'bloqueadoLogin',
  'podeVerSenhas', 'representanteDepto', 'login'
];

function _reporCamposDeAcesso(dados, antes, requester) {
  if (!dados || !Array.isArray(dados.funcionarios)) return dados;
  const podeAcesso = ehAdminDeAcesso(requester);
  const antigos = {};
  ((antes && antes.funcionarios) || []).forEach(function (f) {
    if (f && f.id != null) antigos[String(f.id)] = f;
  });

  dados.funcionarios = dados.funcionarios.map(function (f) {
    if (!f) return f;
    const a = f.id != null ? antigos[String(f.id)] : null;

    if (a) {
      // Registro que JÁ EXISTE: senha sempre do servidor; acesso só muda se
      // quem está salvando for admin.
      CAMPOS_SENHA.forEach(function (k) {
        if (a[k] !== undefined) f[k] = a[k]; else delete f[k];
      });
      if (!podeAcesso) {
        CAMPOS_ACESSO.forEach(function (k) {
          if (a[k] !== undefined) f[k] = a[k]; else delete f[k];
        });
      }
      return f;
    }

    // Registro NOVO. A tela de Funcionários cria colaborador JÁ COM senha, e
    // isso precisa continuar funcionando — então admin pode definir a senha
    // de uma conta nova. O que nunca é permitido é trocar a senha de uma
    // conta que JÁ EXISTE (tratado acima), que era o caminho da tomada da
    // conta mestre. `senhaVisivel` é sempre do servidor (gravada no login).
    delete f.senhaVisivel;
    if (!podeAcesso) delete f.senha;
    if (!podeAcesso) {
      f.permissoes = {};
      delete f.permissoesFluxo;
      delete f.permissoesEspeciais;
      delete f.telas;
      delete f.podeVerSenhas;
      delete f.representanteDepto;
      f.status = 'aguardando_aprovacao';
    }
    return f;
  });
  return dados;
}
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
    // E o HASH também não sai. O comentário acima sempre disse isso, mas o
    // código só removia `senhaVisivel`: o SHA-256 de TODOS os funcionários
    // (inclusive das contas mestre) descia para qualquer pessoa logada, e
    // SHA-256 sem sal se quebra fora do sistema para senha curta ou numérica.
    // A tela não precisa do hash: usa `senhaConhecida` e `temSenha`.
    c.temSenha = !!armazenada;
    delete c.senha;
    return c;
  });
  return dados;
}

// ==========================================================================
// MÓDULO WHATSAPP — INICIALIZAÇÃO
// ==========================================================================
// ISOLAMENTO: o WhatsApp é um módulo à parte e NUNCA pode derrubar o resto do
// sistema. Se o sql.js não estiver instalado ou um arquivo do módulo falhar, o
// servidor sobe do mesmo jeito — Vagas, Seleção, DP, Equipamentos e Financeiro
// continuam funcionando e só o WhatsApp fica indisponível (responde 503).
// Segundo WhatsApp (QR Code, via OpenWA). Módulo isolado: se ele não carregar,
// o sistema sobe igual e só essa aba responde que está indisponível.
let openwa = null;
try {
  openwa = require('./openwa.cjs');
  console.log('[OpenWA] ponte carregada' + (openwa.configurado() ? ' — apontando para ' + openwa.URL_BASE : ' (ainda NÃO configurado)'));
} catch (e) {
  console.error('[OpenWA] não carregou (o sistema segue normal):', e.message);
  openwa = null;
}

// Nome da sessão do OpenWA. Ele exige 3 caracteres ou mais — "rt" era recusado
// com "name must be longer than or equal to 3 characters". Aqui a regra fica
// num lugar só, para não voltar a divergir entre as rotas.
const OPENWA_SESSAO_PADRAO = 'rt-vagas';
function _openwaNome(valor) {
  const limpo = String(valor || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  return limpo.length >= 3 ? limpo : OPENWA_SESSAO_PADRAO;
}

// As rotas por sessão (/start, /qr, /logout, /messages) esperam o **id** da
// sessão, que é um UUID — não o nome. Só a CRIAÇÃO usa o nome. Passar o nome
// nessas rotas dá "Validation failed (uuid is expected)".
// Aqui traduzimos nome -> id, consultando a lista.
function _openwaResolverId(nome) {
  return openwa.chamar('/api/sessions').then(function (r) {
    if (!r.ok) return { ok: false, erro: _openwaDetalhe(r) };
    const lista = Array.isArray(r.dados) ? r.dados : [];
    const s = lista.find(function (x) { return x && (x.name === nome || x.id === nome); });
    if (!s || !s.id) return { ok: false, erro: 'Não achei a conexão "' + nome + '" no OpenWA.' };
    return { ok: true, id: String(s.id), sessao: s };
  });
}

// "erro 400" não ajuda ninguém. O OpenWA manda o motivo no corpo da resposta
// (ex.: "property sessionId should not exist") — isto puxa esse texto para a
// tela, para não ser preciso ir caçar em log de container.
function _openwaDetalhe(r) {
  const d = r && r.dados;
  let msg = '';
  if (d) {
    if (Array.isArray(d.message)) msg = d.message.join('; ');
    else if (typeof d.message === 'string') msg = d.message;
    else if (typeof d.error === 'string') msg = d.error;
    else if (typeof d.texto === 'string') msg = d.texto.slice(0, 300);
  }
  const base = (r && r.erro) || 'O OpenWA recusou a chamada.';
  return msg ? base + ' Motivo: ' + msg : base;
}
let waDb = null, waApi = null, waWebhook = null, waBot = null, _waCarregado = false;
try {
  waDb      = require('./whatsapp-db.cjs');
  waApi     = require('./whatsapp-api.cjs');
  waWebhook = require('./whatsapp-webhook.cjs');
  waBot     = require('./whatsapp-bot.cjs');
  _waCarregado = true;
} catch (e) {
  console.error('[WhatsApp] Módulo NÃO carregou (o resto do sistema segue normal):', e.message);
  console.error('[WhatsApp] Se quiser usar o WhatsApp, rode: npm install');
}

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
  if (!_waCarregado) return;              // módulo não carregou: fica desligado, sistema segue
  try {
    await waDb.init(DATA_DIR);
    _waReady = true;
    console.log('[WhatsApp] Banco de dados inicializado:', waDb.getDbPath());
    // Inicia limpeza periódica de eventos antigos do webhook
    waWebhook.startCleanup(waDb, 6 * 60 * 60 * 1000);

    // ── BOT DE ATENDIMENTO ────────────────────────────────────────────────
    // A configuração vem do state.json (chave `botWhatsapp`), para usar o
    // contrato de gravação e a permissão por tela do sistema. O estado de
    // execução fica no SQLite, que é o que muda a cada mensagem.
    // A mídia do bot vai para DATA_DIR/bot-midia, FORA de /uploads/ (que é
    // público, regra 7): só sai pela rota autenticada, igual aos documentos
    // da Diária.
    if (waBot) {
      try {
        waBot.iniciar({
          db: waDb, api: waApi, notificar: notifySSEClients,
          pastaMidia: BOT_MIDIA_DIR,
          lerConfig: function () {
            try { return (lerEstado().dados || {}).botWhatsapp || {}; }
            catch (e) { return {}; }
          }
        });
      } catch (e) {
        console.error('[Bot] não iniciou (o WhatsApp segue funcionando):', e.message);
        waBot = null;
      }
    }
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
  // PRIMEIRA COISA do handler, e por isso a mais perigosa: aqui um "%" solto
  // no endereço derrubava o processo inteiro (URIError sem try/catch). Agora a
  // requisição mal formada recebe 400 e o servidor segue de pé para todos.
  const urlPath = decodeSeguro(req.url.split('?')[0]);
  if (urlPath === null) { responderJson(res, 400, { error: 'endereço inválido' }); return; }
  const autenticado = reqAutenticada(req);

  // PORTÃO DE PERMISSÃO POR TELA. Um ponto só, antes de qualquer rota. Rota
  // que não pertence a uma tela passa direto; /api/state é filtrado por
  // chave, no próprio handler dele.
  if (!permitirRota(req, res, urlPath, req.method, autenticado)) return;

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
      // Entrou com uma senha que esta publica no GitHub: a sessao vale (senao a
      // pessoa nem conseguiria trocar), mas a tela vai exigir a troca antes de
      // liberar o sistema.
      const trocaObrigatoria = senhaEhPublica(senha);
      if (trocaObrigatoria) console.warn('[RT] ' + u.login + ' entrou com senha publica — troca exigida.');
      res.writeHead(200, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': cookie }, SECURITY_HEADERS));
      res.end(JSON.stringify({ ok: true, user: semSenha, trocaObrigatoria: trocaObrigatoria }));
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
      }, res);
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
      }, res);
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
    const token = decodeSeguro((/(?:^|&)token=([^&]*)/.exec(q) || [])[1] || '');
    if (token === null) { responderJson(res, 400, { error: 'token inválido' }); return; }
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
      }, res);
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
          id: _novoIdServidor('func'), nome: nome, email: '', telefone: telefone, login: login,
          senha: hashSenhaServer(senha), senhaVisivel: senha,
          departamento: depto, departamentoSolicitado: depto, cargo: 'Colaborador em Aprovação',
          instituicao: instituicao,
          status: 'aguardando_aprovacao', dataSolicitacao: new Date().toLocaleString('pt-BR'),
          representanteDepto: false, bloqueadoLogin: false, permissoes: {}
        });
        try { gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() }); responderJson(res, 200, { ok: true }); }
        catch (e) { responderJson(res, 500, { ok: false }); }
      }, res);
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
      }, res);
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
      }, res);
    });
    return;
  }

  // ---- API: hora do servidor ----
  if (urlPath === '/api/time' && req.method === 'GET') {
    responderJson(res, 200, { epoch: Date.now() });
    return;
  }

  // ---- API: só a VERSÃO do estado (resposta minúscula) ----
  // O navegador consulta isto a cada poucos segundos para saber se alguém
  // alterou algo. Antes ele baixava o ESTADO INTEIRO só para comparar um
  // número — com 3,5 MB por consulta a cada 4 s, era o que mais deixava o
  // sistema lento. Aqui a resposta tem algumas dezenas de bytes e sai da
  // memória, sem tocar no disco.
  if (urlPath === '/api/state/version' && req.method === 'GET') {
    const v = versaoAtual();
    // "autenticado" vai junto para o navegador perceber NA HORA quando a sessão
    // cai (expirou, servidor reiniciou). Antes isso só era notado quando alguém
    // gravava algo — e a tela ficava travada até a pessoa sair e entrar de novo.
    responderJson(res, 200, { version: v.version, atualizadoEm: v.atualizadoEm, autenticado: !!autenticado });
    return;
  }

  // ==========================================================================
  // RELATÓRIO DE EQUIPAMENTOS PARA A EMPRESA CLIENTE (link público)
  // --------------------------------------------------------------------------
  // O DP monta um relatório com os colaboradores escolhidos e manda o link
  // para a empresa. Quem abre o link NÃO precisa de login — mas só enxerga
  // AQUELE relatório, e nada mais do sistema.
  //
  // Cuidados: o token é longo e aleatório (não dá para adivinhar); a resposta
  // traz somente os registros daquele relatório; o CPF sai parcialmente
  // mascarado (o nome já identifica a pessoa para o cliente); e um relatório
  // desativado deixa de responder.
  // ==========================================================================
  // ---- Registrar QUEM abriu o link e o ACEITE da conferência (públicos) ----
  // Servem de comprovante: ficam gravados o nome informado, a data/hora e o
  // que a pessoa conferiu (ou não conferiu, com o motivo).
  if (urlPath.indexOf('/api/relatorio-equip/') === 0 && req.method === 'POST') {
    const resto = decodeSeguro(urlPath.slice('/api/relatorio-equip/'.length));
    if (resto === null) { responderJson(res, 400, { error: 'endereço inválido' }); return; }
    const barra = resto.lastIndexOf('/');
    const token = barra > 0 ? resto.slice(0, barra).trim() : '';
    const acao = barra > 0 ? resto.slice(barra + 1).trim() : '';
    if (!token || token.length < 20 || ['acesso', 'conferencia'].indexOf(acao) < 0) {
      responderJson(res, 404, { error: 'Não encontrado.' }); return;
    }
    lerCorpo(req, function (err, body) {
      if (err) { responderJson(res, 400, { error: 'corpo inválido' }); return; }
      const nome = String((body && body.nome) || '').trim().slice(0, 120);
      if (nome.length < 2) { responderJson(res, 400, { error: 'Informe seu nome.' }); return; }

      comTrava(function () {
        const st = lerEstado();
        const d = st.dados || {};
        const lista = Array.isArray(d.relatoriosEquip) ? d.relatoriosEquip : [];
        const rel = lista.find(function (r) { return r && r.token === token; });
        if (!rel) { responderJson(res, 404, { error: 'Relatório não encontrado.' }); return; }
        if (rel.ativo === false) { responderJson(res, 410, { error: 'Este relatório foi desativado.' }); return; }

        const agora = new Date().toISOString();
        if (acao === 'acesso') {
          if (!Array.isArray(rel.acessos)) rel.acessos = [];
          // Guarda no máximo 200 acessos por relatório (não cresce sem fim)
          rel.acessos.push({ nome: nome, em: agora });
          if (rel.acessos.length > 200) rel.acessos = rel.acessos.slice(-200);
        } else {
          const itens = (body && body.itens && typeof body.itens === 'object') ? body.itens : {};
          const idsValidos = {};
          (rel.registrosIds || []).forEach(function (id) { idsValidos[id] = true; });
          const limpos = {};
          Object.keys(itens).forEach(function (id) {
            if (!idsValidos[id]) return;                       // só itens deste relatório
            const it = itens[id] || {};
            limpos[id] = {
              ok: it.ok === true,
              motivo: String(it.motivo || '').trim().slice(0, 400)
            };
          });
          const total = (rel.registrosIds || []).length;
          const conferidos = Object.keys(limpos).filter(function (k) { return limpos[k].ok; }).length;
          if (!Array.isArray(rel.conferencias)) rel.conferencias = [];
          rel.conferencias.push({
            id: _novoIdServidor('conf'),
            nome: nome, em: agora,
            itens: limpos,
            totalItens: total,
            conferidos: conferidos,
            naoConferidos: Object.keys(limpos).filter(function (k) { return !limpos[k].ok; }).length,
            tudoOk: total > 0 && conferidos === total,
            observacao: String((body && body.observacao) || '').trim().slice(0, 1000)
          });
          if (rel.conferencias.length > 50) rel.conferencias = rel.conferencias.slice(-50);
        }

        try {
          gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() });
          responderJson(res, 200, { ok: true, em: agora });
        } catch (e) {
          console.error('[RT] relatorio-equip ' + acao + ':', e);
          responderJson(res, 500, { error: 'falha ao gravar' });
        }
      }, res);
    });
    return;
  }

  if (urlPath.indexOf('/api/relatorio-equip/') === 0 && req.method === 'GET') {
    const _tokenBruto = decodeSeguro(urlPath.slice('/api/relatorio-equip/'.length));
    if (_tokenBruto === null) { responderJson(res, 400, { error: 'endereço inválido' }); return; }
    const token = _tokenBruto.trim();
    if (!token || token.length < 20) { responderJson(res, 404, { error: 'Relatório não encontrado.' }); return; }

    const st = lerEstado();
    const d = st.dados || {};
    const rel = (Array.isArray(d.relatoriosEquip) ? d.relatoriosEquip : [])
      .find(function (r) { return r && r.token === token; });
    if (!rel) { responderJson(res, 404, { error: 'Relatório não encontrado.' }); return; }
    if (rel.ativo === false) { responderJson(res, 410, { error: 'Este relatório foi desativado por quem o gerou.' }); return; }

    const ids = {};
    (rel.registrosIds || []).forEach(function (id) { ids[id] = true; });
    const mascararCpf = function (cpf) {
      const so = String(cpf || '').replace(/\D/g, '');
      if (so.length !== 11) return '';
      return '***.' + so.slice(3, 6) + '.' + so.slice(6, 9) + '-**';
    };
    const registros = (Array.isArray(d.equipamentos) ? d.equipamentos : [])
      .filter(function (r) { return r && ids[r.id]; })
      .map(function (r) {
        return {
          id: r.id,
          nome: r.nome || '',
          cpf: mascararCpf(r.cpf),
          tipo: r.tipo || '',
          equipamentos: Array.isArray(r.equipamentos) ? r.equipamentos : (r.equipamentos ? [r.equipamentos] : []),
          equipamentoOutros: r.equipamentoOutros || '',
          estado: r.estado || '',
          observacoes: r.observacoes || '',
          responsavel: r.responsavel || '',
          dataCadastro: r.dataCadastro || '',
          fotos: (Array.isArray(r.fotos) ? r.fotos : []).map(function (f) {
            return { nome: (f && f.nome) || '', arquivo: (f && f.arquivo) || '' };
          })
        };
      });

    responderJson(res, 200, {
      titulo: rel.titulo || 'Relatório de Equipamentos',
      empresaDestino: rel.empresaDestino || '',
      observacao: rel.observacao || '',
      criadoPor: rel.criadoPor || '',
      criadoEm: rel.criadoEm || '',
      total: registros.length,
      // Resumo do que ja foi conferido, para a pagina mostrar o estado atual
      jaConferido: !!(rel.conferencias && rel.conferencias.length),
      ultimaConferencia: (rel.conferencias && rel.conferencias.length)
        ? (function () {
            const c = rel.conferencias[rel.conferencias.length - 1];
            return { nome: c.nome, em: c.em, tudoOk: c.tudoOk, conferidos: c.conferidos,
                     naoConferidos: c.naoConferidos, itens: c.itens, observacao: c.observacao };
          })()
        : null,
      registros: registros
    });
    return;
  }

  // ==========================================================================
  // DIÁRIA (Presença RT) — Fase 2, sub-fase 2 (cadastro completo)
  // Cadastro público em 3 passos (dados pessoais, endereço, Pix+documentos),
  // enviado de uma vez só ao final — sem registro parcial no meio do caminho.
  // Identidade pública por token aleatório (array — um por aparelho), igual
  // ao token de /api/relatorio-equip: nunca é cookie de sessão de staff.
  // Login por nome+telefone (reentrada num aparelho novo) é a próxima
  // sub-fase; por enquanto, quem já tem token salvo no navegador continua
  // entrando normalmente por ele.
  // ==========================================================================

  // ---- Configuração pública: cadastros novos abertos ou pausados -----------
  // Lido pela tela de entrada ANTES de mostrar "Criar minha conta" — quando
  // pausado, quem nunca se cadastrou nem chega a ver o formulário. Quem já
  // tem conta continua entrando normalmente (login não é afetado por isso).
  if (urlPath === '/api/diaria/config' && req.method === 'GET') {
    const st = lerEstado();
    const d = st.dados || {};
    responderJson(res, 200, { cadastrosAbertos: !(d.diariaConfig && d.diariaConfig.cadastrosAbertos === false) });
    return;
  }

  // ---- Trabalhador: cadastro completo --------------------------------------
  if (urlPath === '/api/diaria/trabalhador/cadastro' && req.method === 'POST') {
    const stPausa = lerEstado();
    if (stPausa.dados && stPausa.dados.diariaConfig && stPausa.dados.diariaConfig.cadastrosAbertos === false) {
      responderJson(res, 423, { error: 'Os cadastros estão pausados no momento — já batemos o limite de vagas para esta diária. Se abrir vaga, avisamos no grupo.' });
      return;
    }
    lerCorpo(req, function (err, body) {
      if (err) { responderJson(res, 400, { error: 'corpo inválido' }); return; }
      const b = body || {};
      const nome = String(b.nome || '').trim().slice(0, 120);
      const telefone = diariaNormalizarTelefone(b.telefone);
      const nomePai = String(b.nomePai || '').trim().slice(0, 120);
      const nomeMae = String(b.nomeMae || '').trim().slice(0, 120);
      const rg = String(b.rg || '').trim().slice(0, 20);
      const cpf = String(b.cpf || '').replace(/\D/g, '');
      const cep = String(b.cep || '').replace(/\D/g, '');
      const logradouro = String(b.logradouro || '').trim().slice(0, 200);
      const numero = String(b.numero || '').trim().slice(0, 20);
      const complemento = String(b.complemento || '').trim().slice(0, 100);
      const bairro = String(b.bairro || '').trim().slice(0, 100);
      const cidade = String(b.cidade || '').trim().slice(0, 100);
      const uf = String(b.uf || '').trim().toUpperCase().slice(0, 2);
      const pixTipo = String(b.pixTipo || '').trim();
      const pixChave = String(b.pixChave || '').trim().slice(0, 140);

      if (nome.split(/\s+/).filter(Boolean).length < 2) { responderJson(res, 400, { error: 'Informe seu nome completo (nome e sobrenome).' }); return; }
      if (telefone.length < 10 || telefone.length > 13) { responderJson(res, 400, { error: 'Telefone inválido.' }); return; }
      if (!nomePai) { responderJson(res, 400, { error: 'Informe o nome do pai.' }); return; }
      if (!nomeMae) { responderJson(res, 400, { error: 'Informe o nome da mãe.' }); return; }
      if (!rg) { responderJson(res, 400, { error: 'Informe o número do RG.' }); return; }
      if (!diariaCpfValido(cpf)) { responderJson(res, 400, { error: 'CPF inválido. Confira os números.' }); return; }
      if (cep.length !== 8) { responderJson(res, 400, { error: 'CEP inválido.' }); return; }
      if (!logradouro || !numero || !bairro || !cidade || !uf) { responderJson(res, 400, { error: 'Complete o endereço.' }); return; }
      if (DIARIA_PIX_TIPOS.indexOf(pixTipo) < 0) { responderJson(res, 400, { error: 'Escolha o tipo da chave Pix.' }); return; }
      if (!diariaPixValida(pixTipo, pixChave)) { responderJson(res, 400, { error: 'Chave Pix inválida pro tipo escolhido.' }); return; }
      if (!b.rgFrente || !b.rgVerso || !b.comprovante) { responderJson(res, 400, { error: 'Envie as três imagens: RG frente, RG verso e comprovante de residência.' }); return; }

      comTrava(function () {
        const st = lerEstado();
        const d = st.dados || {};
        if (!Array.isArray(d.trabalhadoresDiaria)) d.trabalhadoresDiaria = [];
        if (d.trabalhadoresDiaria.some(function (x) { return x && diariaNormalizarTelefone(x.telefone) === telefone; })) {
          responderJson(res, 409, { error: 'Esse telefone já tem cadastro. Continue usando o mesmo aparelho de antes.' });
          return;
        }
        if (d.trabalhadoresDiaria.some(function (x) { return x && x.cpf === cpf; })) {
          responderJson(res, 409, { error: 'Esse CPF já está cadastrado com outro telefone. Procure a coordenação.' });
          return;
        }
        const id = diariaGerarId('trab');
        const token = crypto.randomBytes(24).toString('hex');
        let nomesArquivos;
        try {
          nomesArquivos = {
            rgFrente: diariaSalvarDocumento(id, 'rg-frente', b.rgFrente),
            rgVerso: diariaSalvarDocumento(id, 'rg-verso', b.rgVerso),
            comprovante: diariaSalvarDocumento(id, 'comprovante', b.comprovante)
          };
        } catch (e) {
          responderJson(res, 400, { error: e.message || 'Não foi possível salvar as imagens.' });
          return;
        }
        if (!nomesArquivos.rgFrente || !nomesArquivos.rgVerso || !nomesArquivos.comprovante) {
          responderJson(res, 400, { error: 'Uma das imagens não chegou certo. Tente enviar de novo.' });
          return;
        }
        const t = {
          id: id, nome: nome, nomeNormalizado: diariaNormalizarNome(nome), telefone: telefone,
          nomePai: nomePai, nomeMae: nomeMae, rg: rg, cpf: cpf,
          cep: cep, logradouro: logradouro, numero: numero, complemento: complemento,
          bairro: bairro, cidade: cidade, uf: uf,
          pixTipo: pixTipo, pixChave: pixChave,
          documentos: nomesArquivos,
          senhaHash: null,
          tokens: [token],
          status: 'pendente_aprovacao',
          criadoEm: new Date().toISOString(),
          aprovadoEm: null, aprovadoPor: null, observacaoAdmin: null
        };
        d.trabalhadoresDiaria.push(t);
        try {
          gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() });
          responderJson(res, 200, { ok: true, token: token, trabalhador: diariaTrabalhadorPublico(t) });
        } catch (e) {
          console.error('[Diária] cadastro:', e);
          responderJson(res, 500, { error: 'Não foi possível salvar. Tente de novo.' });
        }
      }, res);
    });
    return;
  }

  // ---- Trabalhador: status + diária de hoje + presença dele nela ----------
  if (urlPath === '/api/diaria/trabalhador/status' && req.method === 'GET') {
    const qIdx = req.url.indexOf('?');
    const qs = new URLSearchParams(qIdx >= 0 ? req.url.slice(qIdx + 1) : '');
    const token = String(qs.get('token') || '').trim();
    if (!token || token.length < 20) { responderJson(res, 404, { error: 'Não encontrado.' }); return; }
    const st = lerEstado();
    const d = st.dados || {};
    const t = (d.trabalhadoresDiaria || []).find(function (x) { return Array.isArray(x.tokens) && x.tokens.indexOf(token) >= 0; });
    if (!t) { responderJson(res, 404, { error: 'Cadastro não encontrado.' }); return; }
    responderJson(res, 200, diariaMontarStatusResposta(t, d));
    return;
  }

  // ---- Trabalhador: login (reentrada em aparelho novo) ---------------------
  // Nome completo = usuário, telefone = senha (sem senhaHash de verdade por
  // enquanto). Funciona pra qualquer status — quem já tinha token continua
  // podendo usá-lo direto; login é só pra quem trocou/perdeu o aparelho.
  if (urlPath === '/api/diaria/trabalhador/login' && req.method === 'POST') {
    const ip = waIpDaReq(req);
    if (!diariaPodeTentarLogin(ip)) { responderJson(res, 429, { error: 'Muitas tentativas. Aguarde uns minutos e tente de novo.' }); return; }
    lerCorpo(req, function (err, body) {
      if (err) { responderJson(res, 400, { error: 'corpo inválido' }); return; }
      const b = body || {};
      const nomeNormalizado = diariaNormalizarNome(b.nome);
      const telefone = diariaNormalizarTelefone(b.telefone);
      if (!nomeNormalizado || !telefone) {
        diariaRegistrarFalhaLogin(ip);
        responderJson(res, 401, { error: 'Nome ou telefone incorretos.' });
        return;
      }
      comTrava(function () {
        const st = lerEstado();
        const d = st.dados || {};
        // Normaliza também o telefone já salvo: cadastros antigos podem ter
        // ficado gravados com +55 na frente (era antes desse ajuste).
        const t = (d.trabalhadoresDiaria || []).find(function (x) {
          return x && x.nomeNormalizado === nomeNormalizado && diariaNormalizarTelefone(x.telefone) === telefone;
        });
        if (!t) {
          diariaRegistrarFalhaLogin(ip);
          responderJson(res, 401, { error: 'Nome ou telefone incorretos.' });
          return;
        }
        diariaLimparFalhasLogin(ip);
        const token = crypto.randomBytes(24).toString('hex');
        if (!Array.isArray(t.tokens)) t.tokens = [];
        t.tokens.push(token);
        try {
          gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() });
        } catch (e) {
          console.error('[Diária] login:', e);
          responderJson(res, 500, { error: 'Não foi possível entrar. Tente de novo.' });
          return;
        }
        const resposta = diariaMontarStatusResposta(t, d);
        resposta.token = token;
        responderJson(res, 200, resposta);
      }, res);
    });
    return;
  }

  // Check-in por GPS foi removido (ponto de encontro muda toda semana — ver
  // comentário no topo do bloco DIÁRIA). O que existe hoje é o botão simples
  // "Confirmar presença" (sem foto/GPS): o trabalhador avisa que chegou, e o
  // admin confirma manualmente olhando quem está realmente no local (ver
  // rotas /admin/presencas/*). Registro de chegada por foto, se um dia for
  // preciso, entra como uma camada em cima disso, não troca o modelo.
  if (urlPath === '/api/diaria/trabalhador/presenca' && req.method === 'POST') {
    lerCorpo(req, function (err, body) {
      if (err) { responderJson(res, 400, { error: 'corpo inválido' }); return; }
      const token = String((body && body.token) || '').trim();
      if (!token || token.length < 20) { responderJson(res, 404, { error: 'Não encontrado.' }); return; }
      comTrava(function () {
        const st = lerEstado();
        const d = st.dados || {};
        const t = (d.trabalhadoresDiaria || []).find(function (x) { return Array.isArray(x.tokens) && x.tokens.indexOf(token) >= 0; });
        if (!t) { responderJson(res, 404, { error: 'Cadastro não encontrado.' }); return; }
        if (t.status !== 'ativo') { responderJson(res, 403, { error: 'Seu cadastro não está ativo.' }); return; }
        const hoje = new Date().toISOString().slice(0, 10);
        const diariaHoje = (d.diarias || []).find(function (x) { return x.data === hoje && x.status === 'aberta'; });
        if (!diariaHoje) { responderJson(res, 400, { error: 'Não há registro de presença aberto agora.' }); return; }
        if (!Array.isArray(d.presencasDiaria)) d.presencasDiaria = [];
        const jaTem = d.presencasDiaria.some(function (p) { return p.diariaId === diariaHoje.id && p.trabalhadorId === t.id; });
        if (jaTem) {
          // já confirmou antes — não cria duplicado, só devolve o estado atual.
          responderJson(res, 200, diariaMontarStatusResposta(t, d));
          return;
        }
        d.presencasDiaria.push({
          id: diariaGerarId('pres'),
          diariaId: diariaHoje.id,
          trabalhadorId: t.id,
          status: 'aguardando',
          checkinEm: new Date().toISOString(),
          confirmadoPor: null,
          confirmadoEm: null
        });
        try {
          gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() });
          responderJson(res, 200, diariaMontarStatusResposta(t, d));
        } catch (e) {
          console.error('[Diária] presenca:', e);
          responderJson(res, 500, { error: 'Não foi possível registrar. Tente de novo.' });
        }
      }, res);
    });
    return;
  }

  // ---- Admin: gerenciar trabalhadores, diárias e presenças -----------------
  // Mesma trava de todo o painel: cookie de sessão de staff + mestre/admin.
  if (urlPath.indexOf('/api/diaria/admin/') === 0) {
    if (!autenticado) { responderJson(res, 401, { error: 'Faça login.' }); return; }
    const requesterDiaria = usuarioDaReq(req);
    if (!requesterDiaria) { responderJson(res, 401, { error: 'Faça login.' }); return; }
    if (!diariaPodeGerenciar(requesterDiaria)) { responderJson(res, 403, { error: 'Sem permissão para gerenciar a Diária.' }); return; }

    // ---- Pausar/retomar cadastros novos (não mexe em quem já tem conta) ----
    if (urlPath === '/api/diaria/admin/cadastros/pausar' && req.method === 'POST') {
      comTrava(function () {
        const st = lerEstado();
        const d = st.dados || {};
        if (!d.diariaConfig) d.diariaConfig = {};
        d.diariaConfig.cadastrosAbertos = false;
        try {
          gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() });
          responderJson(res, 200, { ok: true, cadastrosAbertos: false });
        } catch (e) { responderJson(res, 500, { error: 'Falha ao salvar.' }); }
      }, res);
      return;
    }
    if (urlPath === '/api/diaria/admin/cadastros/retomar' && req.method === 'POST') {
      comTrava(function () {
        const st = lerEstado();
        const d = st.dados || {};
        if (!d.diariaConfig) d.diariaConfig = {};
        d.diariaConfig.cadastrosAbertos = true;
        try {
          gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() });
          responderJson(res, 200, { ok: true, cadastrosAbertos: true });
        } catch (e) { responderJson(res, 500, { error: 'Falha ao salvar.' }); }
      }, res);
      return;
    }

    // Documento pessoal (RG, comprovante) só sai por aqui — nunca pela pasta
    // pública de uploads. Chega aqui já autenticado (checagem acima).
    let mArq = urlPath.match(/^\/api\/diaria\/admin\/arquivo\/([^\/]+)\/([^\/]+)\/([^\/]+)$/);
    if (mArq && req.method === 'GET') {
      const tipoArq = decodeSeguro(mArq[1]);
      const _idArqBruto = decodeSeguro(mArq[2]);
      const _nomeArqBruto = decodeSeguro(mArq[3]);
      if (tipoArq === null || _idArqBruto === null || _nomeArqBruto === null) {
        responderJson(res, 400, { error: 'endereço inválido' }); return;
      }
      // path.basename tira qualquer "/" de um "../" simples, mas um ".."
      // sozinho (sem barra) passa direto por ele — por isso o cinto e a
      // suspensório: monta o caminho e confere que ele continua DENTRO de
      // DIARIA_DOCS_DIR antes de ler qualquer coisa do disco.
      const idArq = path.basename(_idArqBruto);
      const nomeArq = path.basename(_nomeArqBruto);
      let caminhoArq = null;
      if (tipoArq === 'cadastro') caminhoArq = path.join(DIARIA_DOCS_DIR, idArq, nomeArq);
      if (!caminhoArq || !(caminhoArq + path.sep).startsWith(DIARIA_DOCS_DIR + path.sep)) {
        responderJson(res, 404, { error: 'Arquivo não encontrado.' });
        return;
      }
      fs.readFile(caminhoArq, function (e, data) {
        if (e) { responderJson(res, 404, { error: 'Arquivo não encontrado.' }); return; }
        const ct = MIME[path.extname(caminhoArq).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, Object.assign({ 'Content-Type': ct }, SECURITY_HEADERS));
        res.end(data);
      });
      return;
    }

    // ---- Admin: corrige os dados que a pessoa preencheu errado (ela liga
    //     pedindo, ou o admin percebe olhando a ficha) -------------------------
    let m = urlPath.match(/^\/api\/diaria\/admin\/trabalhadores\/([^\/]+)\/dados$/);
    if (m && req.method === 'POST') {
      const alvoId = decodeSeguro(m[1]);
      if (alvoId === null) { responderJson(res, 400, { error: 'identificador inválido' }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { error: 'corpo inválido' }); return; }
        const b = body || {};
        const nome = String(b.nome || '').trim().slice(0, 120);
        const telefone = diariaNormalizarTelefone(b.telefone);
        const nomePai = String(b.nomePai || '').trim().slice(0, 120);
        const nomeMae = String(b.nomeMae || '').trim().slice(0, 120);
        const rg = String(b.rg || '').trim().slice(0, 20);
        const cpf = String(b.cpf || '').replace(/\D/g, '');
        const cep = String(b.cep || '').replace(/\D/g, '');
        const logradouro = String(b.logradouro || '').trim().slice(0, 200);
        const numero = String(b.numero || '').trim().slice(0, 20);
        const complemento = String(b.complemento || '').trim().slice(0, 100);
        const bairro = String(b.bairro || '').trim().slice(0, 100);
        const cidade = String(b.cidade || '').trim().slice(0, 100);
        const uf = String(b.uf || '').trim().toUpperCase().slice(0, 2);
        const pixTipo = String(b.pixTipo || '').trim();
        const pixChave = String(b.pixChave || '').trim().slice(0, 140);

        if (nome.split(/\s+/).filter(Boolean).length < 2) { responderJson(res, 400, { error: 'Informe o nome completo (nome e sobrenome).' }); return; }
        if (telefone.length < 10 || telefone.length > 13) { responderJson(res, 400, { error: 'Telefone inválido.' }); return; }
        if (!nomePai) { responderJson(res, 400, { error: 'Informe o nome do pai.' }); return; }
        if (!nomeMae) { responderJson(res, 400, { error: 'Informe o nome da mãe.' }); return; }
        if (!rg) { responderJson(res, 400, { error: 'Informe o número do RG.' }); return; }
        if (!diariaCpfValido(cpf)) { responderJson(res, 400, { error: 'CPF inválido. Confira os números.' }); return; }
        if (cep.length !== 8) { responderJson(res, 400, { error: 'CEP inválido.' }); return; }
        if (!logradouro || !numero || !bairro || !cidade || !uf) { responderJson(res, 400, { error: 'Complete o endereço.' }); return; }
        if (DIARIA_PIX_TIPOS.indexOf(pixTipo) < 0) { responderJson(res, 400, { error: 'Escolha o tipo da chave Pix.' }); return; }
        if (!diariaPixValida(pixTipo, pixChave)) { responderJson(res, 400, { error: 'Chave Pix inválida pro tipo escolhido.' }); return; }

        comTrava(function () {
          const st = lerEstado();
          const d = st.dados || {};
          const t = (d.trabalhadoresDiaria || []).find(function (x) { return x.id === alvoId; });
          if (!t) { responderJson(res, 404, { error: 'Trabalhador não encontrado.' }); return; }
          const outroTelefone = (d.trabalhadoresDiaria || []).find(function (x) { return x.id !== alvoId && diariaNormalizarTelefone(x.telefone) === telefone; });
          if (outroTelefone) { responderJson(res, 409, { error: 'Já existe outro cadastro com esse telefone.' }); return; }
          const outroCpf = (d.trabalhadoresDiaria || []).find(function (x) { return x.id !== alvoId && x.cpf === cpf; });
          if (outroCpf) { responderJson(res, 409, { error: 'Já existe outro cadastro com esse CPF.' }); return; }

          t.nome = nome; t.nomeNormalizado = diariaNormalizarNome(nome); t.telefone = telefone;
          t.nomePai = nomePai; t.nomeMae = nomeMae; t.rg = rg; t.cpf = cpf;
          t.cep = cep; t.logradouro = logradouro; t.numero = numero; t.complemento = complemento;
          t.bairro = bairro; t.cidade = cidade; t.uf = uf;
          t.pixTipo = pixTipo; t.pixChave = pixChave;
          try {
            gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() });
            responderJson(res, 200, { ok: true, trabalhador: diariaTrabalhadorAdmin(t) });
          } catch (e) { responderJson(res, 500, { error: 'Falha ao salvar.' }); }
        }, res);
      });
      return;
    }

    // ---- Admin: troca um documento (foto ilegível, PDF que a pessoa mandou
    //     depois pelo WhatsApp etc.) — some o arquivo velho, fica só o novo ----
    m = urlPath.match(/^\/api\/diaria\/admin\/trabalhadores\/([^\/]+)\/documento$/);
    if (m && req.method === 'POST') {
      const alvoId = decodeSeguro(m[1]);
      if (alvoId === null) { responderJson(res, 400, { error: 'identificador inválido' }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { error: 'corpo inválido' }); return; }
        const b = body || {};
        const CAMPOS_VALIDOS = { rgFrente: 'rg-frente', rgVerso: 'rg-verso', comprovante: 'comprovante' };
        const campo = String(b.campo || '');
        if (!CAMPOS_VALIDOS[campo]) { responderJson(res, 400, { error: 'Campo de documento inválido.' }); return; }
        if (!b.arquivo) { responderJson(res, 400, { error: 'Envie o novo arquivo.' }); return; }
        comTrava(function () {
          const st = lerEstado();
          const d = st.dados || {};
          const t = (d.trabalhadoresDiaria || []).find(function (x) { return x.id === alvoId; });
          if (!t) { responderJson(res, 404, { error: 'Trabalhador não encontrado.' }); return; }
          const nomeAntigo = t.documentos && t.documentos[campo];
          let novoNome;
          try {
            novoNome = diariaSalvarDocumento(alvoId, CAMPOS_VALIDOS[campo], b.arquivo);
          } catch (e) {
            responderJson(res, 400, { error: e.message || 'Não foi possível salvar o arquivo.' });
            return;
          }
          if (!novoNome) { responderJson(res, 400, { error: 'Arquivo inválido — envie uma imagem ou PDF.' }); return; }
          if (!t.documentos) t.documentos = {};
          t.documentos[campo] = novoNome;
          if (nomeAntigo && nomeAntigo !== novoNome) {
            try { fs.unlinkSync(path.join(DIARIA_DOCS_DIR, alvoId, nomeAntigo)); } catch (e) {}
          }
          try {
            gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() });
            responderJson(res, 200, { ok: true, trabalhador: diariaTrabalhadorAdmin(t) });
          } catch (e) { responderJson(res, 500, { error: 'Falha ao salvar.' }); }
        }, res);
      });
      return;
    }

    if (urlPath === '/api/diaria/admin/trabalhadores' && req.method === 'GET') {
      const qIdx = req.url.indexOf('?');
      const qs = new URLSearchParams(qIdx >= 0 ? req.url.slice(qIdx + 1) : '');
      const filtroStatus = qs.get('status') || '';
      const st = lerEstado();
      const d = st.dados || {};
      let lista = Array.isArray(d.trabalhadoresDiaria) ? d.trabalhadoresDiaria.slice() : [];
      if (filtroStatus) lista = lista.filter(function (t) { return t.status === filtroStatus; });
      lista.sort(function (a, b) { return (b.criadoEm || '').localeCompare(a.criadoEm || ''); });
      responderJson(res, 200, { trabalhadores: lista.map(diariaTrabalhadorAdmin) });
      return;
    }

    m = urlPath.match(/^\/api\/diaria\/admin\/trabalhadores\/([^\/]+)\/(aprovar|recusar|bloquear|reativar)$/);
    if (m && req.method === 'POST') {
      const alvoId = decodeSeguro(m[1]);
      if (alvoId === null) { responderJson(res, 400, { error: 'identificador inválido' }); return; }
      const acao = m[2];
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { error: 'corpo inválido' }); return; }
        const observacao = String((body && body.observacao) || '').trim().slice(0, 500);
        comTrava(function () {
          const st = lerEstado();
          const d = st.dados || {};
          const t = (d.trabalhadoresDiaria || []).find(function (x) { return x.id === alvoId; });
          if (!t) { responderJson(res, 404, { error: 'Trabalhador não encontrado.' }); return; }
          if (acao === 'aprovar') { t.status = 'ativo'; t.aprovadoEm = new Date().toISOString(); t.aprovadoPor = requesterDiaria.login; t.observacaoAdmin = null; }
          else if (acao === 'recusar') { t.status = 'recusado'; t.observacaoAdmin = observacao || null; }
          else if (acao === 'bloquear') { t.status = 'bloqueado'; t.observacaoAdmin = observacao || t.observacaoAdmin || null; }
          else if (acao === 'reativar') { t.status = 'ativo'; }
          try {
            gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() });
            responderJson(res, 200, { ok: true, trabalhador: diariaTrabalhadorAdmin(t) });
          } catch (e) { responderJson(res, 500, { error: 'Falha ao salvar.' }); }
        }, res);
      });
      return;
    }

    // ---- Admin: exclui de vez um cadastro (gente que pediu pra sair antes
    //     de ser aprovada, ou que não quer mais fazer parte). Some o registro
    //     e os documentos do disco — histórico de presença que já exista fica
    //     como está, só sem nome resolvido (GET /presencas já trata isso). ----
    m = urlPath.match(/^\/api\/diaria\/admin\/trabalhadores\/([^\/]+)\/excluir$/);
    if (m && req.method === 'POST') {
      const alvoId = decodeSeguro(m[1]);
      if (alvoId === null) { responderJson(res, 400, { error: 'identificador inválido' }); return; }
      comTrava(function () {
        const st = lerEstado();
        const d = st.dados || {};
        const idx = (d.trabalhadoresDiaria || []).findIndex(function (x) { return x.id === alvoId; });
        if (idx < 0) { responderJson(res, 404, { error: 'Trabalhador não encontrado.' }); return; }
        d.trabalhadoresDiaria.splice(idx, 1);
        try { fs.rmSync(path.join(DIARIA_DOCS_DIR, alvoId), { recursive: true, force: true }); } catch (e) {}
        try {
          gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() });
          responderJson(res, 200, { ok: true });
        } catch (e) { responderJson(res, 500, { error: 'Falha ao salvar.' }); }
      }, res);
      return;
    }

    if (urlPath === '/api/diaria/admin/diarias' && req.method === 'GET') {
      const st = lerEstado();
      const d = st.dados || {};
      const lista = (Array.isArray(d.diarias) ? d.diarias : []).slice()
        .sort(function (a, b) { return (b.criadaEm || '').localeCompare(a.criadaEm || ''); });
      responderJson(res, 200, { diarias: lista });
      return;
    }

    if (urlPath === '/api/diaria/admin/diarias' && req.method === 'POST') {
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { error: 'corpo inválido' }); return; }
        const titulo = String((body && body.titulo) || '').trim().slice(0, 160);
        const data = String((body && body.data) || '').trim();
        if (!titulo) { responderJson(res, 400, { error: 'Dê um título pra diária.' }); return; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { responderJson(res, 400, { error: 'Data inválida.' }); return; }
        comTrava(function () {
          const st = lerEstado();
          const d = st.dados || {};
          if (!Array.isArray(d.diarias)) d.diarias = [];
          const nova = {
            id: diariaGerarId('diaria'),
            titulo: titulo, data: data,
            status: 'planejada',
            criadaPor: requesterDiaria.login, criadaEm: new Date().toISOString(),
            abertaEm: null, encerradaEm: null
          };
          d.diarias.push(nova);
          try {
            gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() });
            responderJson(res, 200, { ok: true, diaria: nova });
          } catch (e) { responderJson(res, 500, { error: 'Falha ao salvar.' }); }
        }, res);
      });
      return;
    }

    m = urlPath.match(/^\/api\/diaria\/admin\/diarias\/([^\/]+)\/(abrir|encerrar|reabrir|confirmar-todos)$/);
    if (m && req.method === 'POST') {
      const diariaId = decodeSeguro(m[1]);
      if (diariaId === null) { responderJson(res, 400, { error: 'identificador inválido' }); return; }
      const acao = m[2];
      comTrava(function () {
        const st = lerEstado();
        const d = st.dados || {};
        const diaria = (d.diarias || []).find(function (x) { return x.id === diariaId; });
        if (!diaria) { responderJson(res, 404, { error: 'Diária não encontrada.' }); return; }
        // O trabalhador só enxerga "a diária aberta hoje" — se tiver duas
        // abertas no mesmo dia, ninguém sabe em qual a presença dele vai
        // cair. Trava aqui pra nunca deixar duas abertas na mesma data.
        if (acao === 'abrir' || acao === 'reabrir') {
          const outraAberta = (d.diarias || []).find(function (x) { return x.id !== diariaId && x.data === diaria.data && x.status === 'aberta'; });
          if (outraAberta) { responderJson(res, 409, { error: 'Já tem outra diária aberta nesta mesma data ("' + outraAberta.titulo + '"). Encerre ela antes de abrir esta.' }); return; }
        }
        if (acao === 'abrir') { diaria.status = 'aberta'; diaria.abertaEm = new Date().toISOString(); }
        else if (acao === 'encerrar') { diaria.status = 'encerrada'; diaria.encerradaEm = new Date().toISOString(); }
        else if (acao === 'reabrir') { diaria.status = 'aberta'; diaria.encerradaEm = null; }
        else if (acao === 'confirmar-todos') {
          (d.presencasDiaria || []).forEach(function (p) {
            if (p.diariaId === diariaId && p.status === 'aguardando') {
              p.status = 'confirmado'; p.confirmadoPor = requesterDiaria.login; p.confirmadoEm = new Date().toISOString();
            }
          });
        }
        try {
          gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() });
          responderJson(res, 200, { ok: true, diaria: diaria });
        } catch (e) { responderJson(res, 500, { error: 'Falha ao salvar.' }); }
      }, res);
      return;
    }

    m = urlPath.match(/^\/api\/diaria\/admin\/diarias\/([^\/]+)\/presencas$/);
    if (m && req.method === 'GET') {
      const diariaId = decodeSeguro(m[1]);
      if (diariaId === null) { responderJson(res, 400, { error: 'identificador inválido' }); return; }
      const st = lerEstado();
      const d = st.dados || {};
      const trabs = {};
      (d.trabalhadoresDiaria || []).forEach(function (t) { trabs[t.id] = t; });
      const lista = (d.presencasDiaria || []).filter(function (p) { return p.diariaId === diariaId; })
        .sort(function (a, b) { return (a.checkinEm || '').localeCompare(b.checkinEm || ''); })
        .map(function (p) {
          const t = trabs[p.trabalhadorId] || {};
          return Object.assign({}, p, {
            trabalhadorNome: t.nome || '(desconhecido)',
            trabalhadorTelefone: t.telefone || '',
            trabalhadorStatus: t.status || ''
          });
        });
      responderJson(res, 200, { presencas: lista });
      return;
    }

    m = urlPath.match(/^\/api\/diaria\/admin\/presencas\/([^\/]+)\/(confirmar|recusar)$/);
    if (m && req.method === 'POST') {
      const presId = decodeSeguro(m[1]);
      if (presId === null) { responderJson(res, 400, { error: 'identificador inválido' }); return; }
      const acao = m[2];
      comTrava(function () {
        const st = lerEstado();
        const d = st.dados || {};
        const p = (d.presencasDiaria || []).find(function (x) { return x.id === presId; });
        if (!p) { responderJson(res, 404, { error: 'Presença não encontrada.' }); return; }
        p.status = acao === 'confirmar' ? 'confirmado' : 'recusado';
        p.confirmadoPor = requesterDiaria.login;
        p.confirmadoEm = new Date().toISOString();
        try {
          gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() });
          responderJson(res, 200, { ok: true, presenca: p });
        } catch (e) { responderJson(res, 500, { error: 'Falha ao salvar.' }); }
      }, res);
      return;
    }

    responderJson(res, 404, { error: 'Rota da Diária não encontrada.' });
    return;
  }

  // ---- API: ler estado (com login = tudo; sem login = só o público) ----
  if (urlPath === '/api/state' && req.method === 'GET') {
    const s = lerEstado();
    if (autenticado) {
      // A senha visível é removida daqui — só sai pela rota /api/ver-senha (com registro)
      let dadosFiltrados = filtrarSenhaVisivel(s.dados);
      // PERMISSÃO POR TELA: o que a pessoa não pode ver não desce. Antes o
      // estado INTEIRO ia para qualquer sessão — salário de todas as fichas,
      // exames, inaptos, auditoria, tabela de custo x repasse — bastava estar
      // logado. Esconder a aba do menu não escondia o dado.
      const _usuarioEstado = usuarioDaReq(req);
      if (_usuarioEstado) dadosFiltrados = RTTelas.filtrarEstadoPorTelas(dadosFiltrados, _usuarioEstado);
      // Empresas sigilosas: quem não está autorizado nem recebe os dados.
      const _sessao = sessaoValida(tokenDaReq(req));
      if (!_sigiloAutorizado(s.dados, _sessao && _sessao.login)) {
        dadosFiltrados = _semSigilo(dadosFiltrados);
      }
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
            dados = mesclarEstado(atual.dados || {}, body.dados || {}, body.upsertIds || [], body.deleteIds || [], body.setKeys || []);
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
              dados = mesclarEstado(atual.dados || {}, body.dados || {}, _todosIds(body.dados || {}), body.deleteIds || [], body.setKeys || []);
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
        // Empresas sigilosas: se quem gravou não podia vê-las, elas não vieram
        // no payload dele. Devolvemos antes de gravar — senão um save comum
        // apagaria tudo que é sigiloso sem ninguém perceber.
        if (autenticado) {
          const _s2 = sessaoValida(tokenDaReq(req));
          if (!_sigiloAutorizado(atual.dados, _s2 && _s2.login)) {
            dados = _devolverSigilo(atual.dados || {}, dados);
          }
        }
        // SENHA e CAMPOS DE ACESSO são do servidor, não do cliente. Repõe tudo
        // a partir do estado gravado (ver _reporCamposDeAcesso). Senha nunca
        // muda por aqui; permissão/departamento só se quem salvou é admin.
        if (autenticado) {
          const _quemSalva = usuarioDaReq(req);
          dados = _reporCamposDeAcesso(dados, atual.dados || {}, _quemSalva);
          // PERMISSÃO POR TELA na ESCRITA: as chaves das telas que esta pessoa
          // não pode editar voltam a ser as do servidor. Nível "só ver" passa a
          // valer de verdade — antes era enfeite, porque o POST /api/state
          // aceitava qualquer alteração de qualquer sessão.
          if (_quemSalva) {
            dados = RTTelas.reporChavesNaoEditaveis(dados, atual.dados || {}, _quemSalva);
          }
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
      }, res);
    });
    return;
  }

  // ---- API: upload de documento/foto (base64 -> arquivo) ----
  if (urlPath === '/api/upload' && req.method === 'POST') {
    // Esta rota não pedia NADA: qualquer pessoa na internet gravava arquivo na
    // pasta pública e recebia o link — enchia o volume (onde ficam TODOS os
    // dados da empresa) e hospedava arquivo no domínio.
    //
    // Não dá para simplesmente exigir sessão: a ficha pública de candidatura
    // (candidato.html) e o banco de talentos (talento.html) sobem os
    // documentos por aqui, sem login, pelo vps-sync. Então quem NÃO está
    // logado continua podendo enviar, mas só IMAGEM, com tamanho menor e com
    // limite por IP. Quem está logado segue como antes.
    const _ipUp = waIpDaReq(req);
    if (!autenticado && !_podeSubirAnonimo(_ipUp)) {
      responderJson(res, 429, { error: 'muitos envios; tente de novo em alguns minutos' });
      return;
    }
    lerCorpo(req, function (err, body) {
      if (err) { responderJson(res, 400, { error: 'corpo inválido' }); return; }
      const m = /^data:([^;]+);base64,([\s\S]*)$/.exec((body && body.dataUrl) || '');
      if (!m) { responderJson(res, 400, { error: 'dataUrl inválido' }); return; }
      // base64 ocupa ~4/3 do original. O limite de quem não tem login é menor:
      // foto de celular já vem reduzida pelo navegador.
      if (!autenticado && m[2].length > 11 * 1024 * 1024) {
        responderJson(res, 413, { error: 'imagem muito grande' }); return;
      }
      let dados;
      try { dados = Buffer.from(m[2], 'base64'); }
      catch (e) { responderJson(res, 400, { error: 'base64 inválido' }); return; }
      if (!dados.length) { responderJson(res, 400, { error: 'arquivo vazio' }); return; }

      // O TIPO SAI DOS BYTES, não do que o cliente declarou no data URL nem de
      // extensão nenhuma. Um SVG anunciado como "image/png" passava pela
      // conferência antiga e era gravado como .png na pasta pública — e SVG é
      // XML, leva <script> dentro.
      const tipoReal = detectarTipoReal(dados);

      // HTML nunca entra, de ninguém. Nenhum fluxo do sistema sobe HTML por
      // aqui, e é exatamente o arquivo que viraria página no próprio domínio.
      if (tipoReal === 'html') {
        responderJson(res, 400, { error: 'arquivo não permitido' }); return;
      }
      if (!autenticado) {
        // Sem login só entra IMAGEM de verdade (a ficha pública de candidatura
        // e o banco de talentos dependem disto). SVG fica de fora: é o único
        // formato de "imagem" que executa script.
        if (!TIPOS_IMAGEM_SEGURA[tipoReal]) {
          responderJson(res, 400, { error: 'sem login, só foto é aceita' }); return;
        }
        _registrarSubidaAnonima(_ipUp);
      }

      // A extensão gravada vem do tipo DETECTADO. Conteúdo que não dá para
      // identificar vira .bin, e .bin é sempre entregue como anexo.
      const ext = EXT_DO_TIPO[tipoReal] || 'bin';
      const limpo = String((body && body.hint) || 'doc').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 32);
      const nome = Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '_' + limpo + '.' + ext;
      try {
        fs.writeFileSync(path.join(UPLOADS_DIR, nome), dados);
        responderJson(res, 200, { url: '/uploads/' + nome, tipo: tipoReal });
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
      // Esta pasta é PÚBLICA (regra 7), e quem decide como o arquivo é
      // entregue é o CONTEÚDO dele, não a extensão. Um .html (ou um .svg
      // renomeado para .png) era servido como PÁGINA no próprio domínio, e a
      // política de segurança libera script inline — então rodava JavaScript
      // na origem do sistema, com a sessão de quem abrisse o link.
      // Reconferir aqui também cobre o que já está na pasta de antes.
      const tipoReal = detectarTipoReal(data);
      const ext = path.extname(arq).toLowerCase();
      const nomeLimpo = nome.replace(/[^\w.\- ]/g, '_');

      let contentType = 'application/octet-stream';
      let anexo = true;

      if (TIPOS_IMAGEM_SEGURA[tipoReal]) {
        // Foto de verdade: vai inline, porque a tela mostra foto de candidato
        // e de equipamento direto no <img>. SVG NÃO entra aqui de propósito.
        contentType = TIPOS_IMAGEM_SEGURA[tipoReal];
        anexo = false;
      } else if (/^wa_/.test(nome) && tipoReal !== 'svg' && tipoReal !== 'html' && tipoReal !== 'desconhecido') {
        // Mídia do WhatsApp. A API da Meta BUSCA o arquivo por esta URL e
        // recusa quando o Content-Type não casa com o tipo da mensagem, então
        // áudio, vídeo e documento precisam sair com o tipo certo e inline.
        // A tabela de extensão foi montada justamente para isso (ver a rota
        // de upload de mídia). SVG e HTML seguem barrados, e a Meta não aceita
        // esses formatos de qualquer forma.
        contentType = MIME[ext] || 'application/octet-stream';
        anexo = false;
      }

      const cab = {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000',
        // nosniff explícito: sem ele o navegador podia "adivinhar" o tipo pelo
        // conteúdo e tratar como HTML algo que mandamos como octet-stream.
        'X-Content-Type-Options': 'nosniff'
      };
      if (anexo) cab['Content-Disposition'] = 'attachment; filename="' + nomeLimpo + '"';
      res.writeHead(200, Object.assign({}, SECURITY_HEADERS, cab));
      res.end(data);
    });
    return;
  }

  // ==========================================================================
  // ROTAS DO MÓDULO WHATSAPP
  // ==========================================================================

  // ---- WEBHOOK: Verificação (GET) — pública, sem login ----
  // ==========================================================================
  // PONTE PARA O OPENWA (segundo WhatsApp, por QR Code)
  // --------------------------------------------------------------------------
  // A chave de acesso do OpenWA fica SÓ aqui no servidor. O navegador nunca a
  // recebe. Toda rota exige login e a permissão de WhatsApp — e qualquer falha
  // do OpenWA vira uma resposta explicada, sem derrubar nada.
  // ==========================================================================
  if (urlPath.indexOf('/api/openwa/') === 0) {
    if (!autenticado) { responderJson(res, 401, { error: 'Faça login.' }); return; }
    const _u = usuarioDaReq(req);
    if (!waEhAdminWhatsapp(_u)) {
      responderJson(res, 403, { error: 'Só quem administra o WhatsApp pode usar esta área.' }); return;
    }
    if (!openwa) {
      responderJson(res, 503, { error: 'A ponte do segundo WhatsApp não carregou no servidor.' }); return;
    }

    // Situação: configurado? no ar? quais sessões existem?
    if (urlPath === '/api/openwa/situacao' && req.method === 'GET') {
      openwa.situacao().then(function (st) { responderJson(res, 200, st); })
        .catch(function (e) { responderJson(res, 200, { configurado: false, noAr: false, motivo: String(e.message || e) }); });
      return;
    }

    // Testar um endereço na hora, sem gravar variável nem redeployar.
    // É como se acha o nome interno do serviço no Coolify sem ficar chutando.
    if (urlPath === '/api/openwa/testar' && req.method === 'POST') {
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { error: 'corpo inválido' }); return; }
        openwa.testar((body && body.url) || '', (body && body.chave) || '')
          .then(function (r) { responderJson(res, 200, r); })
          .catch(function (e) { responderJson(res, 200, { ok: false, erro: String(e.message || e) }); });
      });
      return;
    }

    // Criar a sessão (uma vez) e começar, para o QR Code aparecer
    if (urlPath === '/api/openwa/iniciar' && req.method === 'POST') {
      lerCorpo(req, function (err, body) {
        const nome = _openwaNome(body && body.sessao);
        // O corpo leva SÓ "name". Mandar campo a mais (ex.: sessionId) faz a
        // validação do OpenWA responder 400 e a sessão nunca nasce — foi
        // exatamente isso que aconteceu na primeira tentativa em produção.
        let erroCriar = null;
        openwa.chamar('/api/sessions', { metodo: 'POST', corpo: { name: nome } })
          .then(function (c) {
            // Já existir não é problema: seguimos assim mesmo. Qualquer outro
            // erro fica guardado, para explicar caso o start também falhe.
            if (!c.ok && c.status !== 409) erroCriar = _openwaDetalhe(c);
            // A criação já devolve o id; se não devolveu, procuramos na lista.
            const idNovo = c.ok && c.dados && c.dados.id;
            return idNovo ? { ok: true, id: String(idNovo) } : _openwaResolverId(nome);
          })
          .then(function (achou) {
            if (!achou.ok) { responderJson(res, 200, { ok: false, sessao: nome, erro: erroCriar || achou.erro }); return null; }
            return openwa.chamar('/api/sessions/' + encodeURIComponent(achou.id) + '/start', { metodo: 'POST' });
          })
          .then(function (r) {
            if (!r) return;
            if (r.naoConfigurado) { responderJson(res, 200, { ok: false, erro: r.erro, naoConfigurado: true }); return; }
            if (!r.ok) {
              responderJson(res, 200, { ok: false, sessao: nome, erro: erroCriar || _openwaDetalhe(r) });
              return;
            }
            responderJson(res, 200, { ok: true, sessao: nome, dados: r.dados });
          })
          .catch(function (e) { responderJson(res, 200, { ok: false, erro: String(e.message || e) }); });
      });
      return;
    }

    // QR Code da sessão (o servidor busca e devolve; a imagem vem do OpenWA)
    if (urlPath.indexOf('/api/openwa/qr/') === 0 && req.method === 'GET') {
      const _nomeBruto = decodeSeguro(urlPath.slice('/api/openwa/qr/'.length));
      if (_nomeBruto === null) { responderJson(res, 400, { error: 'sessão inválida' }); return; }
      const nome = _openwaNome(_nomeBruto);
      if (!nome) { responderJson(res, 400, { error: 'sessão inválida' }); return; }
      _openwaResolverId(nome)
        .then(function (achou) {
          if (!achou.ok) { responderJson(res, 200, { ok: false, erro: achou.erro }); return null; }
          return openwa.chamar('/api/sessions/' + encodeURIComponent(achou.id) + '/qr');
        })
        .then(function (r) {
          if (!r) return;
          responderJson(res, 200, { ok: r.ok, erro: r.ok ? null : _openwaDetalhe(r), dados: r.dados || null });
        })
        .catch(function (e) { responderJson(res, 200, { ok: false, erro: String(e.message || e) }); });
      return;
    }

    // Desconectar o número (para trocar de chip). Não apaga a sessão: só sai
    // do WhatsApp, e o mesmo nome serve para conectar o número novo.
    if (urlPath === '/api/openwa/desconectar' && req.method === 'POST') {
      lerCorpo(req, function (err, body) {
        const nome = _openwaNome(body && body.sessao);
        _openwaResolverId(nome)
          .then(function (achou) {
            if (!achou.ok) { responderJson(res, 200, { ok: false, erro: achou.erro }); return null; }
            return openwa.chamar('/api/sessions/' + encodeURIComponent(achou.id) + '/logout', { metodo: 'POST' });
          })
          .then(function (r) {
            if (!r) return;
            if (r.ok) console.log('[OpenWA] ' + ((_u && _u.login) || '?') + ' desconectou a sessão ' + nome);
            responderJson(res, 200, { ok: r.ok, erro: r.ok ? null : _openwaDetalhe(r) });
          })
          .catch(function (e) { responderJson(res, 200, { ok: false, erro: String(e.message || e) }); });
      });
      return;
    }

    // Enviar uma mensagem (teste ou uso normal)
    if (urlPath === '/api/openwa/enviar' && req.method === 'POST') {
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { error: 'corpo inválido' }); return; }
        const nome = _openwaNome(body && body.sessao);
        const paraDig = String((body && body.para) || '').replace(/\D/g, '');
        const texto = String((body && body.texto) || '').trim();
        if (paraDig.length < 10) { responderJson(res, 200, { ok: false, erro: 'Número inválido. Use DDD + número.' }); return; }
        if (!texto) { responderJson(res, 200, { ok: false, erro: 'Escreva a mensagem.' }); return; }
        // Brasil: se vier sem o 55 na frente, acrescenta
        const destino = paraDig.length <= 11 ? '55' + paraDig : paraDig;
        _openwaResolverId(nome)
          .then(function (achou) {
            if (!achou.ok) { responderJson(res, 200, { ok: false, erro: achou.erro, para: destino }); return null; }
            return openwa.chamar('/api/sessions/' + encodeURIComponent(achou.id) + '/messages/send-text',
              { metodo: 'POST', corpo: { to: destino, text: texto } });
          })
          .then(function (r) {
            if (!r) return;
            if (r.ok) console.log('[OpenWA] ' + ((_u && _u.login) || '?') + ' enviou mensagem para ' + destino);
            responderJson(res, 200, { ok: r.ok, erro: r.ok ? null : _openwaDetalhe(r), dados: r.dados || null, para: destino });
          })
          .catch(function (e) { responderJson(res, 200, { ok: false, erro: String(e.message || e) }); });
      });
      return;
    }

    responderJson(res, 404, { error: 'Rota não encontrada.' });
    return;
  }

  if (urlPath === '/webhooks/whatsapp' && req.method === 'GET') {
    if (!_waCarregado) { responderJson(res, 503, { error: 'Módulo WhatsApp indisponível.' }); return; }
    if (!WA_VERIFY_TOKEN) { responderJson(res, 500, { error: 'WHATSAPP_VERIFY_TOKEN não configurado.' }); return; }
    waWebhook.handleVerification(req, res, WA_VERIFY_TOKEN);
    return;
  }

  // ---- WEBHOOK: Recepção de eventos (POST) — pública, validada por assinatura ----
  if (urlPath === '/webhooks/whatsapp' && req.method === 'POST') {
    if (!_waCarregado) { res.writeHead(503); res.end('WhatsApp indisponivel'); return; }
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
          waWebhook.processEvent(body, waDb, waApi, notifySSEClients, waBot).catch(function (e) {
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
    // As chamadas ao banco do WhatsApp (sql.js) sao SINCRONAS e ficam no
    // caminho da requisicao. Sem este try/catch, banco corrompido ou
    // arquivo truncado lancava e derrubava o PROCESSO INTEIRO: o sistema
    // todo caia por causa de uma tela. Agora a falha fica registrada e so
    // esta requisicao recebe 500.
    try {

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

    // ══════════════════════════════════════════════════════════════════════
    // BOT DE ATENDIMENTO
    // A permissão da TELA ("bot") é conferida no portão geral, em
    // permitirRota/ROTAS_POR_TELA: GET exige "só ver", POST exige "ver e
    // editar". Aqui dentro a conferência é a do módulo WhatsApp.
    // A CONFIGURAÇÃO não é gravada por estas rotas: ela vai pelo
    // POST /api/state com setKeys:['botWhatsapp'], que é o contrato do
    // sistema e o que faz remover e reordenar funcionarem com duas pessoas
    // logadas.
    // ══════════════════════════════════════════════════════════════════════

    // Painel + situação do bot
    if (urlPath === '/api/whatsapp/bot/painel' && req.method === 'GET') {
      var uBp = waUsuarioTemPermissao(req, 'visualizar');
      if (!uBp) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      if (!waBot) { responderJson(res, 200, { ok: true, disponivel: false }); return; }
      responderJson(res, 200, {
        ok: true, disponivel: true,
        painel: waDb.bot.painel(),
        config: waBot.configAtual(),
        ultimos: waDb.bot.ultimosLogs(40)
      });
      return;
    }

    // Enviar a sequência de teste para um número digitado
    if (urlPath === '/api/whatsapp/bot/teste' && req.method === 'POST') {
      var uBt = waUsuarioTemPermissao(req, 'editar');
      if (!uBt) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      if (!waBot) { responderJson(res, 503, { ok: false, error: 'Bot não disponível.' }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false, error: 'corpo inválido' }); return; }
        var contaId = Number(body.account_id || 0);
        if (!contaId) { responderJson(res, 400, { ok: false, error: 'Escolha a conta.' }); return; }
        waBot.enviarTeste(contaId, body.telefone, body.nome || 'Teste')
          .then(function (r) {
            waDb.audit.log({
              user_login: uBt.login, user_name: uBt.nome, action: 'Enviou teste do bot',
              details: 'Para: ' + String(body.telefone || '').slice(0, 20), ip: waIpDaReq(req), account_id: contaId
            });
            responderJson(res, 200, r);
          })
          .catch(function (e) { responderJson(res, 200, { ok: false, error: e.message }); });
      });
      return;
    }

    // Pausar / devolver o bot num contato
    var mBotPausa = urlPath.match(/^\/api\/whatsapp\/bot\/contato\/(\d+)\/(pausar|devolver)$/);
    if (mBotPausa && req.method === 'POST') {
      var uBc = waUsuarioTemPermissao(req, 'editar');
      if (!uBc) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      if (!waBot) { responderJson(res, 503, { ok: false, error: 'Bot não disponível.' }); return; }
      var alvoId = decodeSeguro(mBotPausa[1]);
      if (alvoId === null) { responderJson(res, 400, { ok: false, error: 'identificador inválido' }); return; }
      var pausar = mBotPausa[2] === 'pausar';
      waDb.bot.gravarContato(Number(alvoId), pausar
        ? { pausado: 1, pausado_em: new Date().toISOString(), pausado_por: uBc.login }
        : { pausado: 0, pausado_em: null, pausado_por: '', aguardando_atendente: 0, optou_sair: 0 });
      waDb.bot.registrar(pausar ? 'pausado' : 'devolvido', Number(alvoId), '', 'por ' + uBc.login);
      waDb.audit.log({
        user_login: uBc.login, user_name: uBc.nome,
        action: pausar ? 'Pausou o bot num contato' : 'Devolveu o contato ao bot',
        details: 'contato ' + alvoId, ip: waIpDaReq(req)
      });
      responderJson(res, 200, { ok: true, pausado: pausar });
      return;
    }

    // Situação do bot naquele contato (para a conversa mostrar o botão certo)
    var mBotSit = urlPath.match(/^\/api\/whatsapp\/bot\/contato\/(\d+)$/);
    if (mBotSit && req.method === 'GET') {
      var uBs = waUsuarioTemPermissao(req, 'visualizar');
      if (!uBs) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      if (!waBot) { responderJson(res, 200, { ok: true, disponivel: false }); return; }
      var sitId = decodeSeguro(mBotSit[1]);
      if (sitId === null) { responderJson(res, 400, { ok: false, error: 'identificador inválido' }); return; }
      responderJson(res, 200, { ok: true, disponivel: true, contato: waDb.bot.contato(Number(sitId)) });
      return;
    }

    // Subir mídia para um passo (imagem, áudio OGG/Opus ou PDF)
    if (urlPath === '/api/whatsapp/bot/midia' && req.method === 'POST') {
      var uBm = waUsuarioTemPermissao(req, 'editar');
      if (!uBm) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false, error: 'corpo inválido' }); return; }
        var m = /^data:([^;]+);base64,([\s\S]*)$/.exec((body && body.dataUrl) || '');
        if (!m) { responderJson(res, 400, { ok: false, error: 'arquivo inválido' }); return; }
        var buf;
        try { buf = Buffer.from(m[2], 'base64'); }
        catch (e) { responderJson(res, 400, { ok: false, error: 'base64 inválido' }); return; }
        if (!buf.length) { responderJson(res, 400, { ok: false, error: 'arquivo vazio' }); return; }

        // TIPO PELO CONTEÚDO, nunca pela extensão nem pelo que o cliente diz
        // (regra que já vale para o upload do sistema).
        var tipoReal = detectarTipoReal(buf);
        var destino = String(body.destino || '').toLowerCase();   // imagem | audio | documento
        var PERMITIDO = {
          imagem:     { tipos: ['png', 'jpeg', 'webp'], limite: 5 * 1024 * 1024, mime: { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } },
          audio:      { tipos: ['ogg'],                 limite: 16 * 1024 * 1024, mime: { ogg: 'audio/ogg' } },
          documento:  { tipos: ['pdf'],                 limite: 20 * 1024 * 1024, mime: { pdf: 'application/pdf' } }
        };
        var regra = PERMITIDO[destino];
        if (!regra) { responderJson(res, 400, { ok: false, error: 'destino inválido' }); return; }
        if (regra.tipos.indexOf(tipoReal) < 0) {
          var aviso = destino === 'audio'
            ? 'Para o áudio chegar como mensagem de voz, a Meta exige OGG/Opus. ' +
              'Exporte o arquivo nesse formato e envie de novo. ' +
              '(O arquivo enviado parece ser: ' + tipoReal + '.)'
            : 'Tipo não aceito aqui. Esperado: ' + regra.tipos.join(', ') + '. Enviado: ' + tipoReal + '.';
          responderJson(res, 400, { ok: false, error: aviso });
          return;
        }
        if (buf.length > regra.limite) {
          responderJson(res, 413, { ok: false, error: 'Arquivo acima de ' + Math.round(regra.limite / 1048576) + ' MB.' });
          return;
        }
        var nome = 'bot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + EXT_DO_TIPO[tipoReal];
        try {
          fs.writeFileSync(path.join(BOT_MIDIA_DIR, nome), buf);
          waDb.audit.log({
            user_login: uBm.login, user_name: uBm.nome, action: 'Subiu mídia do bot',
            details: destino + ' · ' + tipoReal + ' · ' + Math.round(buf.length / 1024) + ' KB',
            ip: waIpDaReq(req)
          });
          responderJson(res, 200, {
            ok: true, arquivo: nome, tipo: tipoReal,
            mime: regra.mime[tipoReal], tamanho: buf.length
          });
        } catch (e) {
          console.error('[Bot] falha ao gravar a mídia:', e.message);
          responderJson(res, 500, { ok: false, error: 'Falha ao gravar o arquivo.' });
        }
      });
      return;
    }

    // Servir a mídia do bot — SÓ para quem tem sessão e permissão.
    // A pasta fica fora de /uploads/ justamente para isto (regra 5 e 7).
    var mBotArq = urlPath.match(/^\/api\/whatsapp\/bot\/midia\/([^\/]+)$/);
    if (mBotArq && req.method === 'GET') {
      var uBa = waUsuarioTemPermissao(req, 'visualizar');
      if (!uBa) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      var nomeArq = decodeSeguro(mBotArq[1]);
      if (nomeArq === null) { responderJson(res, 400, { ok: false, error: 'nome inválido' }); return; }
      // path.basename E conferência de que o caminho final continua DENTRO da
      // pasta (regra 4: cinto e suspensório).
      var alvoArq = path.join(BOT_MIDIA_DIR, path.basename(nomeArq));
      if (!path.resolve(alvoArq).startsWith(path.resolve(BOT_MIDIA_DIR) + path.sep)) {
        responderJson(res, 400, { ok: false, error: 'caminho inválido' }); return;
      }
      fs.readFile(alvoArq, function (e, dados) {
        if (e) { responderJson(res, 404, { ok: false, error: 'não encontrado' }); return; }
        var t = detectarTipoReal(dados);
        var ct = TIPOS_IMAGEM_SEGURA[t] || (t === 'pdf' ? 'application/pdf' : (t === 'ogg' ? 'audio/ogg' : 'application/octet-stream'));
        res.writeHead(200, Object.assign({}, SECURITY_HEADERS, {
          'Content-Type': ct,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, max-age=3600'
        }));
        res.end(dados);
      });
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
      var qp = queryParaMapa(query);
      if (qp === null) { responderJson(res, 400, { error: 'parâmetros inválidos' }); return; }
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
      var qp = queryParaMapa(query);
      if (qp === null) { responderJson(res, 400, { error: 'parâmetros inválidos' }); return; }
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
          // A Meta BUSCA a midia pelo link — e busca la do datacenter dela, entao
          // '/uploads/x.ogg' relativo nao serve. Vira endereco completo aqui:
          // APP_URL quando definida; senao, o proprio dominio desta requisicao.
          var linkMidia = body.media_url || '';
          if (linkMidia && linkMidia.charAt(0) === '/') {
            var baseMidia = (process.env.APP_URL || '').replace(/\/+$/, '');
            if (!baseMidia) {
              var protoMidia = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
              var hostMidia = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
              if (hostMidia) baseMidia = protoMidia + '://' + hostMidia;
            }
            if (baseMidia) linkMidia = baseMidia + linkMidia;
          }
          sendPromise = waApi.sendMediaMessage(account.phone_number_id, toPhone, body.type, { link: linkMidia, id: body.media_id, filename: body.filename }, body.caption, account.access_token_enc);
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
            last_message_type: body.type || 'text',
            last_message_at: new Date().toISOString()
          });
          // ATENDENTE RESPONDEU: o bot para naquele contato NA HORA.
          // Nada pior que a pessoa estar falando com alguem de verdade e o
          // bot continuar despejando mensagem automatica em cima.
          // Nota interna nao conta: ela nao vai para o cliente.
          if (waBot && !body.is_internal_note) {
            try {
              var _convBot = waDb.conversations.getById(convId);
              if (_convBot && _convBot.contact_id) waBot.aoAtendenteResponder(_convBot.contact_id, u.login);
            } catch (e) { console.error('[Bot] nao pausei no contato:', e.message); }
          }
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
      var qp = queryParaMapa(query);
      if (qp === null) { responderJson(res, 400, { error: 'parâmetros inválidos' }); return; }
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
      var qp = queryParaMapa(query);
      if (qp === null) { responderJson(res, 400, { error: 'parâmetros inválidos' }); return; }
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
      var qp = queryParaMapa(query);
      if (qp === null) { responderJson(res, 400, { error: 'parâmetros inválidos' }); return; }
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
        // A conferência de MIME acima olha o que o CLIENTE declarou. Esta aqui
        // olha os BYTES: sem isto, um SVG ou um HTML anunciado como
        // "image/png" ia para a pasta pública (que é a mesma do resto) com a
        // extensão errada. A Meta não aceita esses formatos de qualquer forma.
        var tipoRealWa = detectarTipoReal(buf);
        if (tipoRealWa === 'svg' || tipoRealWa === 'html') {
          responderJson(res, 400, { ok: false, error: 'Tipo de arquivo não permitido.' }); return;
        }
        // audio/mp4 NAO pode virar '.mp4': seria servido como video/mp4 e a
        // Meta rejeita audio com Content-Type de video. Cada tipo de audio tem
        // a extensao que devolve o MESMO tipo na hora de servir.
        var EXT_AUDIO = { 'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/aac': 'aac', 'audio/amr': 'amr' };
        var ext = EXT_AUDIO[mimeType] || (mimeType.split('/')[1] || 'bin').split('+')[0].split(';')[0].replace(/[^a-z0-9]/gi, '');
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
    } catch (eWa) {
      console.error('[WhatsApp] falha nao tratada na rota ' + urlPath + ':', (eWa && eWa.stack) || eWa);
      if (!res.headersSent) responderJson(res, 500, { ok: false, error: 'Falha no módulo WhatsApp.' });
      return;
    }
  }

  // ---- Site estático ----
  let rel = urlPath === '/' ? '/index.html' : urlPath;

  // SEGURANÇA: o app (index.html + app.js + data.js) só vai para quem TEM sessão válida.
  // Sem login, o visitante recebe SÓ a página de login — o "esqueleto" do app e as
  // senhas-semente do data.js NEM chegam ao navegador (inspecionar/Ctrl+U não revela nada).
  if (rel === '/index.html' && !autenticado) rel = '/login.html';
  // A tabela de precos (custo pago a clinica x repasse cobrado do cliente) e
  // informacao comercial da empresa: so vai para quem tem sessao valida.
  if ((rel === '/js/app.js' || rel === '/js/data.js' || rel === '/js/whatsapp.js' ||
       rel === '/js/telas.js' || rel === '/js/whatsapp-bot-ui.js' || rel === '/precificacao-base.json') && !autenticado) {
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
  // DADO NUNCA SAI PELA WEB.
  // A conferência de cima só garante "está dentro da pasta da aplicação" — e
  // isso não basta: a pasta de dados padrão (BASE/server-data) fica DENTRO
  // dela. Um pedido por /server-data/state.json entregava o banco INTEIRO,
  // com todos os cadastros, sem login nenhum; /server-data/backups/...
  // entregava as cópias; /server-data/sessions.json, as sessões ativas.
  // No container de produção DATA_DIR é /data (fora de /app), então lá isto
  // não alcançava — mas segurança não pode depender de variável de ambiente
  // nem de onde alguém resolveu apontar a pasta.
  // A rota /uploads/ é tratada ANTES daqui e continua funcionando: é a única
  // parte da pasta de dados que é pública de propósito (regra 7).
  if (_caminhoDeDados(filePath) || _arquivoDoServidor(filePath)) {
    res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain' }, SECURITY_HEADERS));
    res.end('404 Not Found');
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
  console.log('Dados na VPS ativos (state.json + uploads). Login exigido no servidor.');
  try { garantirAdminServidor(); } catch (e) { console.error('garantirAdminServidor:', e); }
  try { garantirCadastrosFinanceiro(); } catch (e) { console.error('garantirCadastrosFinanceiro:', e); }
  try { migrarDiariaFase2(); } catch (e) { console.error('migrarDiariaFase2:', e); }
  // O resumo entra na MESMA fila do garantirAdminServidor (comTrava), então
  // só roda depois que a carga inicial terminou — senão mostraria zero em tudo.
  comTrava(function () {
    try { resumoDosDados(); } catch (e) { console.error('resumoDosDados:', e); }
  });
});

// ==========================================================================
// RESUMO DOS DADOS NO BOOT
// --------------------------------------------------------------------------
// Mostra, já no log de inicialização, QUANTOS registros o servidor encontrou.
// Serve como alarme imediato no deploy: se o volume persistente da VPS não
// estiver montado em DATA_DIR, o container sobe vazio e isto aparece na hora
// ("0 registro(s)" + aviso), em vez de o problema ser descoberto depois.
// ==========================================================================
function resumoDosDados() {
  const st = lerEstado();
  const d = st.dados || {};
  const conta = function (k) { return Array.isArray(d[k]) ? d[k].length : 0; };
  const equipamentos = conta('equipamentos');
  let fotosEquip = 0;
  (Array.isArray(d.equipamentos) ? d.equipamentos : []).forEach(function (r) {
    if (Array.isArray(r && r.fotos)) fotosEquip += r.fotos.length;
  });
  let arquivos = 0;
  try { arquivos = fs.readdirSync(UPLOADS_DIR).length; } catch (e) {}

  console.log('');
  console.log('=== DADOS ENCONTRADOS EM ' + DATA_DIR + ' ===');
  console.log('  versão do estado ..... ' + (st.version || 0));
  console.log('  Equipamentos ......... ' + equipamentos + ' registro(s), ' + fotosEquip + ' foto(s)');
  console.log('  Candidatos ........... ' + conta('candidatos'));
  console.log('  Funcionários ......... ' + conta('funcionarios'));
  console.log('  Contratações ......... ' + conta('contratacoes'));
  console.log('  Fluxos financeiros ... ' + conta('fluxosFinanceiros'));
  console.log('  Arquivos em uploads/ . ' + arquivos);

  // O state.json inteiro trafega em cada gravacao. Se ele crescer demais, os
  // saves passam a ser RECUSADOS pelo limite de corpo e o sistema para de
  // salvar sem avisar. Este alerta existe para isso nunca mais passar batido.
  let tamState = 0;
  try { tamState = fs.statSync(STATE_FILE).size; } catch (e) {}
  console.log('  Tamanho do state.json  ' + (tamState / 1048576).toFixed(1) + ' MB');
  if (tamState > 0.6 * LIMITE_CORPO) {
    console.warn('');
    console.warn('  *** ATENCAO: state.json com ' + (tamState / 1048576).toFixed(1) + ' MB — perto do limite de envio (' +
                 (LIMITE_CORPO / 1048576).toFixed(0) + ' MB).');
    console.warn('  *** Quando passar do limite, NENHUM cadastro consegue ser salvo.');
    console.warn('  *** Rode:  node limpar-fotos-embutidas.cjs --aplicar');
  }

  // Senhas que ja estiveram publicas no repositorio.
  // estão no repositório do GitHub. Se alguém nunca trocou, essas senhas valem
  // no sistema no ar. Avisa quem precisa trocar SEM imprimir a senha.
  try {
    // Mesma fonte do login: uma lista so, para nunca divergirem.
    const hashesFracos = {};
    HASH_SENHAS_PUBLICAS.forEach(function (h) { hashesFracos[h] = true; });
    const emRisco = (Array.isArray(d.funcionarios) ? d.funcionarios : [])
      .filter(function (f) {
        const s = String(f && f.senha || '');
        return hashesFracos[s] === true || senhaEhPublica(s);
      })
      .map(function (f) { return f.login; });
    if (emRisco.length) {
      console.warn('  *** SENHAS FRACAS em: ' + emRisco.join(', '));
      console.warn('  *** Essas senhas de exemplo estão no código no GitHub. Troque em Funcionários.');
    }
  } catch (e) {}

  // Primeiro boot legítimo tem versão 0/1 e nada gravado. Já um estado que
  // "existe" mas veio sem os registros é o sintoma clássico de volume perdido.
  if ((st.version || 0) > 1 && equipamentos === 0 && conta('candidatos') === 0) {
    console.warn('');
    console.warn('  *** ATENÇÃO: o sistema já foi usado antes (versão ' + st.version + '), mas está SEM registros.');
    console.warn('  *** Isso costuma significar que o volume persistente NÃO está montado em ' + DATA_DIR + '.');
    console.warn('  *** NÃO cadastre nada por cima. Confira o volume no Coolify e restaure o backup:');
    console.warn('  ***   node restaurar-equipamentos.cjs');
  }
  console.log('');
}
