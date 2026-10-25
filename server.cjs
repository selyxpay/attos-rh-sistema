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
// Midia do bot: FORA de /uploads/ (que e publico, regra 7). So sai pela
// rota autenticada /api/whatsapp/bot/midia/<arquivo>.
const BOT_MIDIA_DIR = path.join(DATA_DIR, 'bot-midia');
// Midia que CHEGA do contato (foto, audio, video, documento, figurinha).
// Tambem FORA de /uploads/: e dado da pessoa, e por link publico qualquer um
// que adivinhasse o nome do arquivo abriria a foto dela. Sai so pela rota
// autenticada /api/whatsapp/midia/<arquivo>. O caminho e o MESMO que o
// whatsapp-webhook.cjs calcula a partir de DATA_DIR.
const WA_MIDIA_DIR = path.join(DATA_DIR, 'wa-midia');
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
try { fs.mkdirSync(BOT_MIDIA_DIR, { recursive: true }); } catch (e) {}
try { fs.mkdirSync(WA_MIDIA_DIR, { recursive: true }); } catch (e) {}

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
                         // 'diaria-docs' e 'equipamentos' são de módulos que saíram do
                         // sistema, mas as pastas continuam no disco com o histórico.
                         // Ficam nesta lista DE PROPÓSITO: é o que impede que alguém
                         // baixe documento pessoal antigo por um endereço direto.
                         'diaria-docs', 'equipamentos', 'sessions'];
const ARQUIVOS_DE_DADOS = ['state.json', 'sessions.json', '.env'];

// Arquivos que são do SERVIDOR e nunca foram para o navegador. O handler de
// estáticos só perguntava "está dentro da pasta da aplicação?", então
// /server.cjs entregava os 196 KB do backend inteiro para qualquer um, sem
// login — com a lógica de login mestre, a estrutura das rotas e a criação da
// conta de administração. O navegador nunca pediu nada disto: ele pede
// .html na raiz, js/, css/ e img/.
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

// ── BACKUP DO BANCO DO WHATSAPP E DAS SESSÕES ──────────────────────────────
// O state.json já tinha cópia a cada subida. Faltavam estes dois, e eles
// guardam coisa que não dá para recriar: as CONVERSAS e as CONTAS conectadas
// (com o token) ficam no SQLite, e as sessões abertas no sessions.json.
// Roda junto com o backup do state, ANTES de qualquer código novo encostar
// neles — é o que permite voltar atrás se um deploy mexer no formato.
// Mesmas três garantias: só LÊ o original, só apaga cópia sua, e nunca
// impede o sistema de subir.
function backupExtraDaInicializacao() {
  const alvos = [
    { origem: path.join(DATA_DIR, 'whatsapp.db'), prefixo: 'whatsapp_' },
    { origem: path.join(DATA_DIR, 'sessions.json'), prefixo: 'sessions_' }
  ];
  const a = new Date();
  const p2 = n => String(n).padStart(2, '0');
  const carimbo = a.getFullYear() + '-' + p2(a.getMonth() + 1) + '-' + p2(a.getDate()) +
                  '_' + p2(a.getHours()) + 'h' + p2(a.getMinutes());

  alvos.forEach(function (alvo) {
    try {
      if (!fs.existsSync(alvo.origem)) return;              // ainda não existe
      const conteudo = fs.readFileSync(alvo.origem);          // só LEITURA
      if (!conteudo || !conteudo.length) return;              // vazio: não sobrescreve cópia boa
      const ext = path.extname(alvo.origem) || '.bak';
      let nome = alvo.prefixo + carimbo + ext;
      if (fs.existsSync(path.join(BACKUP_DIR, nome))) {
        nome = alvo.prefixo + carimbo + '_' + p2(a.getSeconds()) + 's' + ext;
      }
      const destino = path.join(BACKUP_DIR, nome);
      fs.writeFileSync(destino, conteudo);
      const gravado = fs.readFileSync(destino);
      if (!gravado.equals(conteudo)) {
        console.error('[Backup] *** a cópia ' + nome + ' saiu DIFERENTE do original. NÃO confie nela.');
      } else {
        console.log('[Backup] cópia da inicialização: ' + nome +
                    ' (' + (conteudo.length / 1024).toFixed(1) + ' KB)');
      }
      // Mantém as 20 mais recentes DESTE prefixo. Não encosta nas outras.
      const minhas = fs.readdirSync(BACKUP_DIR)
        .filter(function (f) { return f.indexOf(alvo.prefixo) === 0 && f.endsWith(ext); })
        .sort();
      if (minhas.length > MAX_BACKUPS_SUBIDA) {
        minhas.slice(0, minhas.length - MAX_BACKUPS_SUBIDA).forEach(function (f) {
          try { fs.unlinkSync(path.join(BACKUP_DIR, f)); }
          catch (e) { console.error('[Backup] não removi ' + f + ':', e.message); }
        });
      }
    } catch (e) {
      console.error('[Backup] FALHOU a cópia de ' + path.basename(alvo.origem) +
                    ' (o sistema segue subindo):', e.message);
    }
  });
}
backupExtraDaInicializacao();

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
// FORA DO CAMINHO DA SUBIDA: varrer a pasta de uploads e' trabalho de disco e
// nao tem nada de urgente. Rodando antes do `listen`, atrasava o momento em
// que a porta comeca a responder — e o healthcheck do Coolify derruba o
// container quando o /api/time nao responde em 5 segundos.
setTimeout(function () {
  try { limparArquivosOrfaos(); } catch (e) { console.error('[Limpeza]', e.message); }
}, 2000);

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
  // HSTS: o navegador passa a só aceitar HTTPS neste domínio pelo próximo ano.
  // Fecha a janela em que alguém digita "vemserrt.com.br" sem https e a
  // primeira requisição (com o cookie de sessão) sai em texto puro.
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
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
// ── LEITURA DO ESTADO, COM CÓPIA NA MEMÓRIA ────────────────────────────────
// ISTO ERA A CAUSA DO "Bad Gateway" (502) INTERMITENTE.
// `lerEstado()` lia e interpretava o state.json INTEIRO, de forma SÍNCRONA, a
// cada chamada — e o portão de permissão chama duas vezes por requisição da
// API (uma em permitirRota, outra em waUsuarioTemPermissao). Com o arquivo em
// 16 MB, cada chamada era ~100-300 ms de CPU travada e dezenas de MB de lixo
// para o coletor. Três pessoas atendendo, com a tela consultando a cada poucos
// segundos, bastavam para o Node parar de responder: o proxy devolvia 502 e o
// healthcheck derrubava o container.
//
// Agora o conteúdo fica na memória e só é lido do disco quando o ARQUIVO muda
// (data de modificação + tamanho). Quem grava passa por `gravarEstado`, que
// atualiza a cópia na hora, e qualquer escrita de fora (script de restauração,
// outra ferramenta) também é percebida.
//
// ATENÇÃO, REGRA NOVA: o objeto devolvido é COMPARTILHADO. Quem vai MUDAR o
// estado para gravar deve usar `lerEstadoParaGravar()`, que devolve cópia
// própria. Mudar o que vem de `lerEstado()` sem gravar envenena a memória de
// todas as próximas requisições.
// Quando o processo subiu e quanto o event loop está atrasado. Os dois saem no
// /api/saude: é o que permite ver de fora se o container reiniciou e se o Node
// está travando (o 502 do proxy é o sintoma disso).
const _SUBIU_EM = Date.now();
let _lagEventLoop = 0;
(function medirLag() {
  const alvo = 500;
  const t0 = Date.now();
  const t = setTimeout(function () {
    _lagEventLoop = Math.max(0, Date.now() - t0 - alvo);
    medirLag();
  }, alvo);
  if (t.unref) t.unref();                 // nunca segura o processo de pé
})();

let _estadoMem = null;        // { chave, valor }
function _chaveDoEstado() {
  try {
    const st = fs.statSync(STATE_FILE);
    return String(st.mtimeMs) + ':' + String(st.size);
  } catch (e) { return ''; }
}
function lerEstado() {
  const chave = _chaveDoEstado();
  if (chave && _estadoMem && _estadoMem.chave === chave) return _estadoMem.valor;
  try {
    const j = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const valor = { dados: j.dados || null, version: j.version || 0, atualizadoEm: j.atualizadoEm || 0 };
    if (chave) _estadoMem = { chave: chave, valor: valor };
    return valor;
  } catch (e) {
    _estadoMem = null;
    return { dados: null, version: 0, atualizadoEm: 0 };
  }
}
// Cópia própria, para quem vai alterar e gravar.
function lerEstadoParaGravar() {
  const s = lerEstado();
  return {
    dados: s.dados ? JSON.parse(JSON.stringify(s.dados)) : null,
    version: s.version, atualizadoEm: s.atualizadoEm
  };
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

// ── COMO A SENHA É GUARDADA ────────────────────────────────────────────────
// SCRYPT com sal por pessoa. Antes era SHA-256 puro: rápido de calcular, sem
// sal nenhum — quem copiasse o state.json quebrava senha curta ou numérica
// numa tarde, e duas pessoas com a mesma senha tinham o mesmo hash. O scrypt
// é LENTO de propósito (gasta memória e tempo em cada tentativa), então
// adivinhar em massa deixa de ser viável.
//
// O formato gravado diz tudo o que a conferência precisa, e por isso dá para
// endurecer os parâmetros amanhã sem invalidar o que já está gravado:
//   scrypt$<N>$<r>$<p>$<sal em hex>$<chave em hex>
const SCRYPT = { N: 16384, r: 8, p: 1, tam: 32 };   // ~16 MB e ~60 ms por conta
function hashSenhaForte(senha) {
  const sal = crypto.randomBytes(16);
  const chave = crypto.scryptSync(String(senha), sal, SCRYPT.tam,
                                  { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return 'scrypt$' + SCRYPT.N + '$' + SCRYPT.r + '$' + SCRYPT.p + '$' +
         sal.toString('hex') + '$' + chave.toString('hex');
}
function _scryptConfere(digitada, armazenada) {
  const p = String(armazenada).split('$');
  if (p.length !== 6) return false;
  const N = parseInt(p[1], 10), r = parseInt(p[2], 10), pp = parseInt(p[3], 10);
  if (!N || !r || !pp) return false;
  let sal, esperado;
  try { sal = Buffer.from(p[4], 'hex'); esperado = Buffer.from(p[5], 'hex'); } catch (e) { return false; }
  if (!sal.length || !esperado.length) return false;
  let calculado;
  try {
    calculado = crypto.scryptSync(String(digitada), sal, esperado.length,
                                  { N: N, r: r, p: pp, maxmem: 256 * 1024 * 1024 });
  } catch (e) { return false; }
  // Comparação em tempo constante: comparar com === devolve a resposta mais
  // rápido quando os primeiros bytes já diferem, e isso é informação de graça
  // para quem está medindo.
  return crypto.timingSafeEqual(calculado, esperado);
}
// SHA-256 continua existindo por DOIS motivos: conferir o hash LEGADO de quem
// ainda não entrou depois da migração, e reconhecer as senhas que vazaram
// (HASH_SENHAS_PUBLICAS, logo abaixo). Nada novo é gravado assim.
function hashSenhaServer(senha) { return crypto.createHash('sha256').update(String(senha), 'utf8').digest('hex'); }
function senhaConfere(digitada, armazenada) {
  // Conta SEM senha nao entra, nunca. Antes caia no String(digitada) ===
  // String(undefined) la embaixo: quem digitasse a palavra "undefined" entrava.
  if (armazenada === undefined || armazenada === null || armazenada === '') return false;
  const g = String(armazenada);
  if (g.indexOf('scrypt$') === 0) return _scryptConfere(digitada, g);
  if (g.length !== 64) return String(digitada) === g;            // texto puro legado
  return hashSenhaServer(digitada) === g;                         // SHA-256 legado
}
// Guardada de um jeito antigo? Então o próximo login regrava em scrypt.
function senhaPrecisaMigrar(armazenada) {
  const g = String(armazenada || '');
  return !!g && g.indexOf('scrypt$') !== 0;
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

// ── A REGRA DA SENHA NOVA ──────────────────────────────────────────────────
// Um lugar só, usado por TODAS as rotas que gravam senha. Antes cada uma tinha
// o seu mínimo (4, 6, 8), e a mais frouxa é que valia na prática.
// Devolve { ok: true } ou { ok: false, motivo: '...' } — o motivo é o que a
// tela mostra para a pessoa.
const SENHA_MINIMA = 8;
function politicaSenha(nova, opcoes) {
  const o = opcoes || {};
  const n = String(nova || '');
  if (n.length < SENHA_MINIMA) return { ok: false, motivo: 'curta' };
  if (!/[A-Za-zÀ-ÿ]/.test(n)) return { ok: false, motivo: 'sem_letra' };
  if (!/[0-9]/.test(n)) return { ok: false, motivo: 'sem_numero' };
  if (senhaEhPublica(n)) return { ok: false, motivo: 'publica' };
  if (o.login && n.toLowerCase() === String(o.login).toLowerCase()) return { ok: false, motivo: 'igual_login' };
  if (o.atual !== undefined && o.atual !== null && o.atual !== '' && senhaConfere(n, o.atual)) {
    return { ok: false, motivo: 'igual' };
  }
  return { ok: true };
}
const MOTIVO_SENHA = {
  curta: 'A senha precisa ter pelo menos ' + SENHA_MINIMA + ' caracteres.',
  sem_letra: 'A senha precisa ter pelo menos uma letra.',
  sem_numero: 'A senha precisa ter pelo menos um número.',
  publica: 'Essa senha está na lista das que vazaram. Escolha outra.',
  igual_login: 'A senha não pode ser igual ao seu login.',
  igual: 'A senha nova não pode ser igual à antiga.'
};

// Anti-brute-force por login (memória): 5 falhas -> 60s de espera
const tentativasLogin = {};
function podeTentarLogin(login) { const t = tentativasLogin[login]; return !(t && t.ate && Date.now() < t.ate); }
function registrarFalhaLogin(login) { const t = tentativasLogin[login] || { n: 0, ate: 0 }; t.n++; if (t.n % 5 === 0) t.ate = Date.now() + 60 * 1000; tentativasLogin[login] = t; }

// E TAMBÉM POR IP. Só por nome de login não resolve: quem quer entrar varre
// uma lista de logins, uma tentativa em cada, e nunca estoura o limite de
// nenhum deles. 30 erros em 10 minutos do mesmo IP param tudo por 10 minutos.
const tentativasLoginIp = {};
const ERROS_IP = 30;
const JANELA_IP = 10 * 60 * 1000;
function ipDaReq(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim() || 'sem-ip';
}
function podeTentarLoginIp(ip) {
  const t = tentativasLoginIp[ip];
  if (!t) return true;
  if (Date.now() - t.inicio > JANELA_IP) { delete tentativasLoginIp[ip]; return true; }
  return t.n < ERROS_IP;
}
function registrarFalhaLoginIp(ip) {
  const t = tentativasLoginIp[ip];
  if (!t || Date.now() - t.inicio > JANELA_IP) { tentativasLoginIp[ip] = { n: 1, inicio: Date.now() }; return; }
  t.n++;
  if (t.n === ERROS_IP) console.warn('[RT] muitas tentativas de login erradas do IP ' + ip + ' — bloqueado por 10 min.');
}
function limparFalhasLoginIp(ip) { delete tentativasLoginIp[ip]; }

// ── TROCA OBRIGATÓRIA DE SENHA ─────────────────────────────────────────────
// Em 21/10/2026 saiu uma falha crítica de execução remota no mundo PHP
// (CVE-2026-109618 / CVE-2026-109619). Este sistema é Node e não usa PHP, mas
// senhas antigas deste sistema já estiveram num repositório público, então
// todas foram rotacionadas: cada pessoa escolhe uma senha nova no próximo
// acesso, e até escolher o sistema fica trancado para ela.
//
// O identificador abaixo é o que faz a rotação acontecer UMA vez. Para exigir
// a troca de todo mundo de novo, o admin usa o botão na tela de Funcionários
// (que grava um identificador novo) — não é preciso mexer no código.
const ROTACAO_SENHAS_ID = '2026-10-23-vazamento-mundial';
const MENSAGEM_TROCA_SENHA =
  'Olá, tudo bem? Por causa de um problema de segurança mundial, muitas senhas ' +
  'foram vazadas na internet. Para proteger você e a nossa empresa, pedimos que ' +
  'troque sua senha agora.';

// O que continua respondendo mesmo com a conta trancada: o necessário para
// fazer login, saber quem sou, trocar a senha e sair — mais as rotas PÚBLICAS
// (ficha do candidato, banco de talentos, webhook da Meta), que não
// são do funcionário e não têm por que parar.
const ROTAS_LIVRES_NA_TROCA = [
  /^\/api\/(login|logout|me|time|saude)$/,
  /^\/api\/(trocar-senha|trocar-senha-obrigatoria)$/,
  /^\/api\/(solicitar-senha|definir-senha|status-senha|register-staff)$/,
  /^\/webhooks\//
];
function _rotaLivreNaTroca(urlPath) {
  for (let i = 0; i < ROTAS_LIVRES_NA_TROCA.length; i++) {
    if (ROTAS_LIVRES_NA_TROCA[i].test(urlPath)) return true;
  }
  return false;
}
// Responde 423 (trancado) e devolve true quando a conta precisa trocar a senha
// antes de usar o sistema. Vale para quem ACABOU de entrar e para quem já
// estava logado — na próxima requisição que ela fizer.
function bloqueioDeTrocaDeSenha(req, res, urlPath, autenticado) {
  if (!autenticado) return false;
  if (urlPath.indexOf('/api/') !== 0) return false;      // arquivos da tela passam
  if (_rotaLivreNaTroca(urlPath)) return false;
  const u = usuarioDaReq(req);
  if (!u || !u.precisaTrocarSenha) return false;
  responderJson(res, 423, { ok: false, motivo: 'troca_de_senha', aviso: MENSAGEM_TROCA_SENHA });
  return true;
}

// Marca TODAS as contas para trocar a senha. Só acrescenta campo — não apaga
// conta, não mexe em senha, não derruba ninguém que já esteja trocando.
function marcarTodosParaTrocarSenha(dados, motivo) {
  let quantas = 0;
  (Array.isArray(dados.funcionarios) ? dados.funcionarios : []).forEach(function (f) {
    if (!f) return;
    f.precisaTrocarSenha = true;
    quantas++;
    // O espelho da senha em texto puro sai junto, onde ainda existir.
    if (f.senhaVisivel !== undefined) delete f.senhaVisivel;
  });
  if (!dados.seguranca || typeof dados.seguranca !== 'object') dados.seguranca = {};
  dados.seguranca.rotacaoId = String(motivo || ROTACAO_SENHAS_ID);
  dados.seguranca.rotacaoEm = Date.now();
  return quantas;
}

// Roda em TODA subida. É idempotente por conta: marca quem tem senha
// guardada do jeito antigo e ainda não está marcado. Conta que já trocou
// (scrypt) não é marcada de novo, e conta que chegar depois — restauração de
// um backup antigo, por exemplo — é pega na subida seguinte.
function rotacaoDeSenhasNoBoot() {
  comTrava(function () {
    const st = lerEstadoParaGravar();
    const d = st.dados || {};
    let marcadas = 0;
    let limpas = 0;
    (Array.isArray(d.funcionarios) ? d.funcionarios : []).forEach(function (f) {
      if (!f) return;
      // O espelho da senha em texto puro sai sempre, de toda conta.
      if (f.senhaVisivel !== undefined) { delete f.senhaVisivel; limpas++; }
      // QUEM ENTRA NA ROTAÇÃO: conta cuja senha está guardada do jeito ANTIGO
      // (SHA-256 sem sal, ou texto puro). É essa que pode ter vazado — e é
      // essa que o sistema não consegue garantir. Conta SEM senha não tem o
      // que rotacionar (quando o admin definir uma, a própria rota de
      // redefinição já marca a troca).
      if (!f.senha || !senhaPrecisaMigrar(f.senha)) return;
      if (f.precisaTrocarSenha === true) return;
      f.precisaTrocarSenha = true;
      marcadas++;
    });
    if (!marcadas && !limpas) return;                 // nada a fazer: nem grava
    if (!d.seguranca || typeof d.seguranca !== 'object') d.seguranca = {};
    d.seguranca.rotacaoId = ROTACAO_SENHAS_ID;
    d.seguranca.rotacaoEm = Date.now();
    if (marcadas) {
      if (!Array.isArray(d.logs)) d.logs = [];
      d.logs.unshift({
        id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        data: new Date().toLocaleString('pt-BR'),
        usuario: 'Sistema',
        acao: 'Troca de senha exigida de ' + marcadas + ' conta(s) com senha guardada do jeito antigo ' +
              '(vazamento mundial de senhas de 21/10/2026).',
        categoria: 'seguranca'
      });
    }
    try { gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() }); } catch (e) {}
    console.log('[Segurança] troca de senha exigida de ' + marcadas + ' conta(s)' +
                (limpas ? ' · ' + limpas + ' senha(s) em texto puro apagadas' : '') +
                ' · rotação ' + ROTACAO_SENHAS_ID);
  });
}

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
// TODO O RESTO. Com isso, contratações e fluxos financeiros (com CPF)
// estavam sendo servidos publicamente — e a
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
function garantirCadastrosFinanceiro() {
  comTrava(function () {
    let base;
    try {
      base = JSON.parse(fs.readFileSync(path.join(BASE, 'ff-cadastros-base.json'), 'utf8'));
    } catch (e) {
      return;   // sem arquivo base: nada a fazer (não é erro)
    }

    const st = lerEstadoParaGravar();
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
    const st = lerEstadoParaGravar();
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
                    nova.senha = hashSenhaForte(String(process.env.ADMIN_SENHA));
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
        senha: process.env.ADMIN_SENHA ? hashSenhaForte(String(process.env.ADMIN_SENHA)) : '',
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
          adm.senha = hashSenhaForte(String(process.env.ADMIN_SENHA));
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
  // A DO BOT VEM ANTES da do WhatsApp: permitirRota usa o PRIMEIRO padrão que
  // casa, e /api/whatsapp/bot/... também casa com /api/whatsapp/. Invertendo a
  // ordem, a aba Bot passaria a ser liberada pela permissão do WhatsApp.
  { re: /^\/api\/whatsapp\/bot\//,                                      tela: 'bot' },
  { re: /^\/api\/whatsapp\//,                                           tela: 'whatsapp' },
  { re: /^\/api\/(ver-senha|reset-senha|aprovar-senha|solicitacoes-senha)$/, tela: 'funcionarios' },
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
// 'precisaTrocarSenha' entra aqui porque e o que TRANCA a conta: se o cliente
// pudesse manda-lo no estado, qualquer pessoa logada se destrancaria sozinha
// mandando 'false' no proprio registro.
const CAMPOS_SENHA = ['senha', 'senhaVisivel', 'precisaTrocarSenha'];
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
    // Senha definida por outra pessoa (o admin, no cadastro) é PROVISÓRIA: o
    // dono escolhe a dele no primeiro acesso, e aí ela passa a ser guardada
    // em scrypt (o login regrava). Sem isto, a senha que o admin digitou
    // valeria para sempre — e ele a conheceria para sempre.
    if (podeAcesso && f.senha) f.precisaTrocarSenha = true;
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
// Devolve uma COPIA RASA do funcionario. O estado agora fica na memoria e e
// compartilhado: entregar o objeto de dentro dele deixaria qualquer rota mudar
// o cadastro sem querer, e a mudanca valeria para todas as requisicoes
// seguintes sem nunca ser gravada.
function usuarioDaReq(req) {
  const s = sessaoValida(tokenDaReq(req));
  if (!s) return null;
  const st = lerEstado();
  const f = ((st.dados && st.dados.funcionarios) || []).find(function (x) { return (x.login || '').toLowerCase() === s.login; });
  return f ? Object.assign({}, f) : null;
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

// NÃO altera o que recebe: devolve uma cópia rasa com a lista de funcionários
// já filtrada. Antes isto fazia `dados.funcionarios = ...` no próprio objeto —
// inofensivo quando cada requisição relia o arquivo, mas veneno agora que o
// estado fica na memória: apagava a senha da cópia compartilhada e o login
// seguinte não encontrava mais o hash.
function filtrarSenhaVisivel(dados) {
  if (!dados || !Array.isArray(dados.funcionarios)) return dados;
  const saida = Object.assign({}, dados);
  saida.funcionarios = dados.funcionarios.map(function (f) {
    if (!f) return f;
    const c = Object.assign({}, f);
    // A senha em si NUNCA sai junto com o estado — só pelo /api/ver-senha (que audita).
    delete c.senhaVisivel;
    // Antes ia um SIM/NÃO dizendo de quem a senha dava para consultar. Hoje
    // não dá para consultar a de ninguém: scrypt não volta atrás.
    const armazenada = String(f.senha || '');
    c.senhaConhecida = false;
    // E o HASH também não sai. O comentário acima sempre disse isso, mas o
    // código só removia `senhaVisivel`: o SHA-256 de TODOS os funcionários
    // (inclusive das contas mestre) descia para qualquer pessoa logada, e
    // SHA-256 sem sal se quebra fora do sistema para senha curta ou numérica.
    // A tela não precisa do hash: usa `senhaConhecida` e `temSenha`.
    c.temSenha = !!armazenada;
    delete c.senha;
    return c;
  });
  return saida;
}

// ==========================================================================
// MÓDULO WHATSAPP — INICIALIZAÇÃO
// ==========================================================================
// ISOLAMENTO: o WhatsApp é um módulo à parte e NUNCA pode derrubar o resto do
// sistema. Se o sql.js não estiver instalado ou um arquivo do módulo falhar, o
// servidor sobe do mesmo jeito — Vagas, Seleção, DP e Financeiro continuam
// funcionando e só o WhatsApp fica indisponível (responde 503).
let waDb = null, waApi = null, waWebhook = null, waBot = null, waLembretes = null, waGrupo = null, _waCarregado = false;
try {
  waDb      = require('./whatsapp-db.cjs');
  waApi     = require('./whatsapp-api.cjs');
  waWebhook = require('./whatsapp-webhook.cjs');
  _waCarregado = true;
} catch (e) {
  console.error('[WhatsApp] Módulo NÃO carregou (o resto do sistema segue normal):', e.message);
  console.error('[WhatsApp] Se quiser usar o WhatsApp, rode: npm install');
}

// ── O BOT CARREGA SEPARADO, E DE PROPÓSITO ─────────────────────────────────
// Ele estava no MESMO try dos três módulos acima, e isso derrubou o WhatsApp
// inteiro em produção: o arquivo whatsapp-bot.cjs não tinha sido incluído no
// COPY do Dockerfile, o require falhou, _waCarregado virou false e o canal
// todo desligou — a tela ficou presa em "WhatsApp inicializando" e a aba
// Conexões apareceu vazia, como se as contas tivessem sumido. Nada havia
// sumido: o módulo nunca carregou.
// O bot é um EXTRA. Se ele falhar, o atendimento manual tem que continuar
// funcionando. Por isso agora é um try só dele.
try {
  waBot = require('./whatsapp-bot.cjs');
} catch (e) {
  console.error('[Bot] módulo NÃO carregou — o WhatsApp segue funcionando SEM o bot:', e.message);
  waBot = null;
}

// Lembretes automáticos das mensagens prontas: também EXTRA, também no try
// dele (regra 17). Se faltar, as mensagens prontas continuam funcionando —
// só não agendam lembrete.
// ATENÇÃO: este arquivo PRECISA estar no COPY do Dockerfile (regra 16).
try {
  waLembretes = require('./whatsapp-lembretes.cjs');
} catch (e) {
  console.error('[Lembretes] módulo NÃO carregou — mensagens prontas seguem sem lembrete:', e.message);
  waLembretes = null;
}

// Envio em grupo da lista "Janela aberta": também EXTRA, também no try dele.
// ATENÇÃO: este arquivo PRECISA estar no COPY do Dockerfile (regra 16).
try {
  waGrupo = require('./whatsapp-envio-grupo.cjs');
} catch (e) {
  console.error('[Envio em grupo] módulo NÃO carregou — o resto do WhatsApp segue:', e.message);
  waGrupo = null;
}

// Conversão do áudio GRAVADO NA TELA para OGG/Opus (mensagem de voz): EXTRA,
// no try dele. Se faltar o arquivo ou o ffmpeg, a gravação pela tela avisa que
// não dá e o envio de áudio por ARQUIVO continua funcionando igual.
// ATENÇÃO: este arquivo PRECISA estar no COPY do Dockerfile (regra 16).
let waAudio = null;
try {
  waAudio = require('./audio-voz.cjs');
} catch (e) {
  console.error('[Áudio] módulo NÃO carregou — gravar pela tela fica indisponível:', e.message);
  waAudio = null;
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
    // público, regra 7): só sai pela rota autenticada.
    if (waBot) {
      try {
        waBot.iniciar({
          db: waDb, api: waApi, notificar: notifySSEClients,
          pastaMidia: BOT_MIDIA_DIR,
          // O bot agenda lembrete reusando o MESMO motor das mensagens
          // prontas. Se o motor nao carregou, o bot segue respondendo.
          lembretes: waLembretes,
          // Para desligar o "fora do expediente" no horario combinado sem
          // ninguem aberto na tela.
          gravarConfig: function (mudancas, porQue) {
            try { _waSalvarConfigBot(mudancas, porQue, null); }
            catch (e) { console.error('[Bot] nao gravei a configuracao:', e.message); }
          },
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
    if (waLembretes) {
      try {
        waLembretes.init({
          db: waDb, api: waApi, notificar: notifySSEClients,
          pastaMidia: BOT_MIDIA_DIR          // mesma pasta segura das mensagens prontas
        });
      } catch (e) {
        console.error('[Lembretes] não iniciou (o resto segue funcionando):', e.message);
        waLembretes = null;
      }
    }
    if (waGrupo) {
      try {
        waGrupo.init({
          db: waDb, api: waApi, notificar: notifySSEClients,
          pastaMidia: BOT_MIDIA_DIR,         // mesma pasta segura das mensagens prontas
          lembretes: waLembretes,            // para agendar os lembretes da pronta
          // Quem sabe ler o catálogo das mensagens prontas é o servidor: ele é
          // o dono do state.json.
          lerPronta: function (id) { return _waProntaPorId(id); }
        });
      } catch (e) {
        console.error('[Envio em grupo] não iniciou (o resto segue funcionando):', e.message);
        waGrupo = null;
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
  var _f = ((st.dados && st.dados.funcionarios) || []).find(function (f) { return (f.login || '').toLowerCase() === s.login; });
  if (!_f) return null;
  var u = Object.assign({}, _f);               // copia: ver usuarioDaReq
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
  var f = ((st.dados && st.dados.funcionarios) || []).find(function (x) { return (x.login || '').toLowerCase() === s.login; });
  return f ? Object.assign({}, f) : null;      // copia: ver usuarioDaReq
}
function waIpDaReq(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

// Conversas com varredura de mídia em andamento. Evita que cada abertura de
// conversa empilhe uma fila nova de downloads para os mesmos arquivos.
var _waVarrendoMidia = {};

// O NOME DO ENVIO em grupo. Serve para a pessoa reconhecer o disparo depois
// ("Entrevista 10h dia 23") no histórico, no selo da lista e no filtro. Em
// branco, vira um nome automático com data e hora — nunca fica sem nome, senão
// o histórico não diz nada.
function _waNomeDoEnvio(escolhido, resposta) {
  var n = String(escolhido || '').trim().slice(0, 60);
  if (n) return n;
  if (resposta && String(resposta.titulo || '').trim()) {
    return String(resposta.titulo).trim().slice(0, 60);
  }
  var d = new Date(Date.now() - 180 * 60000);          // relógio de Brasília
  var p = function (x) { return String(x).padStart(2, '0'); };
  return 'Disparo de ' + p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) +
         ' às ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
}

// ── GRAVAR A CONFIGURAÇÃO DO BOT PELO SERVIDOR ─────────────────────────────
// Quase tudo do bot é gravado pela tela (pelo /api/state, com setKeys). Mas
// duas coisas precisam ser gravadas AQUI: o interruptor do "fora do
// expediente" (que registra na Auditoria quem ligou e quando) e o
// desligamento automático no horário combinado, que acontece sem ninguém
// aberto na tela.
function _waSalvarConfigBot(mudancas, porQue, usuario) {
  const st = lerEstadoParaGravar();
  const d = st.dados || (st.dados = {});
  const atual = d.botWhatsapp && typeof d.botWhatsapp === 'object' ? d.botWhatsapp : {};
  d.botWhatsapp = Object.assign({}, atual, mudancas || {});
  st.version = (st.version || 0) + 1;
  st.atualizadoEm = Date.now();
  gravarEstado(st);
  // Auditoria: quem mexeu no automático, e quando.
  try {
    if (_waReady && waDb) {
      waDb.audit.log({
        user_login: (usuario && usuario.login) || 'sistema',
        user_name: (usuario && usuario.nome) || 'Sistema',
        action: 'Bot: ' + (porQue || 'configuração alterada'),
        details: JSON.stringify(Object.keys(mudancas || {})).slice(0, 180)
      });
    }
  } catch (e) {}
  return d.botWhatsapp;
}

// ── JANELA DE 24 HORAS ─────────────────────────────────────────────────────
// A Meta só aceita mensagem escrita à mão nas 24 horas seguintes à ÚLTIMA
// mensagem que a pessoa mandou. Fora disso, só modelo aprovado.
// Na dúvida fica FECHADA: mandar fora da janela volta como erro da Meta e
// mancha a qualidade do número, então o certo é não tentar.
function _waJanela24h(convId) {
  var fechada = { aberta: false, horas: null, restam: 0, ultima: '' };
  if (!_waReady || !waDb) return fechada;
  try {
    var r = waDb.messages.ultimaRecebida(convId);
    if (!r || r.horas === null || r.horas === undefined) return fechada;   // nunca recebeu nada
    var horas = Number(r.horas);
    if (!isFinite(horas)) return fechada;
    return {
      aberta: horas < 24,
      horas: Math.round(horas * 10) / 10,
      restam: Math.max(0, Math.round((24 - horas) * 10) / 10),
      ultima: r.created_at || ''
    };
  } catch (e) {
    console.error('[Prontas] não consegui ver a janela de 24h:', e.message);
    return fechada;
  }
}

// Troca de variáveis para quando o módulo do bot não está carregado (ele é um
// extra e pode faltar). É a versão simples de propósito: a boa, que arruma a
// vírgula órfã de um {nome} vazio, é a do bot — esta só não deixa a mensagem
// pronta sair com as chaves cruas no lugar do nome.
function _waVariaveisSimples(texto, dados) {
  var h;
  try {
    h = Number(new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false
    }).format(new Date()));
  } catch (e) { h = (new Date().getUTCHours() - 3 + 24) % 24; }
  var saud = (h >= 5 && h < 12) ? 'bom dia' : (h >= 12 && h < 18 ? 'boa tarde' : 'boa noite');
  var nome = String((dados && dados.nome) || '').trim().split(/\s+/)[0] || '';
  if (/^\d+$/.test(nome)) nome = '';                      // telefone não é nome
  return String(texto == null ? '' : texto)
    .replace(/\{nome\}/gi, nome)
    .replace(/\{saudacao\}/gi, saud)
    .replace(/\{link_vagas\}/gi, String((dados && dados.linkVagas) || ''))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/(^|\n)\s*([a-zà-ú])/g, function (_m, antes, letra) { return antes + letra.toUpperCase(); })
    .replace(/[ \t]+$/gm, '');
}

// A mensagem pronta pelo id. O catálogo mora no state.json.
function _waProntaPorId(id) {
  try {
    var lista = ((lerEstado().dados || {}).respostasRapidas) || [];
    if (!Array.isArray(lista)) return null;
    return lista.find(function (r) { return r && String(r.id) === String(id); }) || null;
  } catch (e) { return null; }
}

// O texto final de uma mensagem pronta, com as variáveis já trocadas.
// Um lugar só, usado pela PRÉVIA (o que cai na caixa de escrever) e pelo
// ENVIO: é isso que garante que o atendente mande exatamente o texto que viu.
function _waTextoDaPronta(resp, conv) {
  var cfgBot = {};
  try { cfgBot = (lerEstado().dados || {}).botWhatsapp || {}; } catch (e) { cfgBot = {}; }
  var dados = {
    nome: (conv && (conv.contact_name || conv.contact_profile_name)) || '',
    linkVagas: cfgBot.linkVagas || ''
  };
  return waBot
    ? waBot.aplicarVariaveis(resp.texto || '', dados)
    : _waVariaveisSimples(resp.texto || '', dados);
}

// Envia o anexo de uma mensagem pronta (imagem ou PDF).
// Reaproveita o media id que já está no banco — a Meta guarda o arquivo por
// cerca de 30 dias, e subir o mesmo PDF a cada envio seria desperdício. Se o
// id expirou, sobe de novo UMA vez e repete o envio.
function _waEnviarMidiaPronta(conta, token, telefone, resp, legenda) {
  var nomeArq = path.basename(String(resp.arquivo || ''));
  var caminho = path.join(BOT_MIDIA_DIR, nomeArq);
  var ehDoc   = resp.tipoAnexo === 'documento';
  var ehAudio = resp.tipoAnexo === 'audio';
  var mime    = resp.mime || (ehDoc ? 'application/pdf' : (ehAudio ? 'audio/ogg' : 'image/jpeg'));
  var tipoMeta = waApi.tipoMetaDoAnexo(resp.tipoAnexo);
  if (!nomeArq || !fs.existsSync(caminho)) {
    return Promise.resolve({ ok: false, error: 'O anexo desta mensagem não está mais no servidor.' });
  }
  var subir = function () {
    return waApi.uploadMedia(conta.phone_number_id, caminho, mime, token).then(function (r) {
      if (!r || !r.ok || !r.media_id) throw new Error((r && r.error) || 'falha ao subir o anexo');
      try { waDb.bot.gravarMidiaCache(nomeArq, conta.id, r.media_id, mime, fs.statSync(caminho).size); } catch (e) {}
      return r.media_id;
    });
  };
  var mandar = function (mediaId) {
    var envio = { id: mediaId };
    if (ehDoc) envio.filename = resp.nomeArquivo || nomeArq;
    // Áudio não leva legenda: a Meta recusa caption em mensagem de voz.
    return waApi.sendMediaMessage(conta.phone_number_id, telefone, tipoMeta, envio,
                                  ehAudio ? '' : legenda, token);
  };
  var cache = null;
  try { cache = waDb.bot.midiaCache(nomeArq, conta.id); } catch (e) { cache = null; }
  var primeira = (cache && cache.media_id) ? Promise.resolve(cache.media_id) : subir();
  return primeira.then(mandar).then(function (r) {
    if (r && r.ok) return r;
    if (!cache || !cache.media_id) return r;              // já era upload novo: o erro é outro
    try { waDb.bot.esquecerMidiaCache(nomeArq, conta.id); } catch (e) {}
    return subir().then(mandar);
  }).catch(function (e) { return { ok: false, error: e.message }; });
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
  // CONTA TRANCADA ATÉ TROCAR A SENHA. Vem antes do portão de telas: quem
  // precisa trocar a senha não usa nada do sistema, nem o que ela teria
  // permissão de usar.
  if (bloqueioDeTrocaDeSenha(req, res, urlPath, autenticado)) return;

  if (!permitirRota(req, res, urlPath, req.method, autenticado)) return;

  // ---- API: LOGIN (verificação REAL no servidor) ----
  if (urlPath === '/api/login' && req.method === 'POST') {
    lerCorpo(req, function (err, body) {
      if (err) { responderJson(res, 400, { ok: false }); return; }
      const login = String((body && body.login) || '').trim().toLowerCase();
      const senha = String((body && body.senha) || '');
      if (!login) { responderJson(res, 400, { ok: false, motivo: 'dados' }); return; }
      const ipLogin = ipDaReq(req);
      if (!podeTentarLoginIp(ipLogin)) { responderJson(res, 429, { ok: false, motivo: 'bloqueado_ip' }); return; }
      if (!podeTentarLogin(login)) { responderJson(res, 429, { ok: false, motivo: 'bloqueado' }); return; }
      const st = lerEstadoParaGravar();
      const u = ((st.dados && st.dados.funcionarios) || []).find(function (f) { return (f.login || '').toLowerCase() === login; });
      if (!u || !senhaConfere(senha, u.senha)) {
        registrarFalhaLogin(login); registrarFalhaLoginIp(ipLogin);
        responderJson(res, 401, { ok: false, motivo: 'credenciais' }); return;
      }
      // Contas MESTRE (joaobalaf/admin) NUNCA são bloqueadas por status — sempre entram para administrar.
      if (!ehMestreLogin(u.login)) {
        if (u.status === 'aguardando_aprovacao') { responderJson(res, 403, { ok: false, motivo: 'aprovacao' }); return; }
        if (u.status && u.status !== 'ativo') { responderJson(res, 403, { ok: false, motivo: 'inativo' }); return; }
        if (u.bloqueadoLogin) { responderJson(res, 403, { ok: false, motivo: 'bloqueado_admin' }); return; }
      }
      limparFalhasLogin(login);
      limparFalhasLoginIp(ipLogin);

      // O login é o ÚNICO momento em que o servidor vê a senha em texto. Antes
      // ele aproveitava para GUARDAR esse texto (senhaVisivel), para o admin
      // poder consultar depois — ou seja, o state.json tinha a senha de todo
      // mundo legível. Agora acontece o contrário: aproveita para REGRAVAR a
      // senha em scrypt e apagar qualquer texto puro que tenha sobrado.
      if (senhaPrecisaMigrar(u.senha) || u.senhaVisivel) {
        comTrava(function () {
          const st2 = lerEstadoParaGravar();
          const d2 = st2.dados || {};
          const alvo = (d2.funcionarios || []).find(function (f) { return (f.login || '').toLowerCase() === login; });
          if (alvo) {
            if (senhaPrecisaMigrar(alvo.senha)) alvo.senha = hashSenhaForte(senha);
            delete alvo.senhaVisivel;
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
      // Três motivos para exigir a troca: a senha está na lista das que
      // vazaram, a conta foi marcada na rotação geral, ou alguém redefiniu a
      // senha dela (senha que outra pessoa conhece não serve).
      const trocaObrigatoria = senhaEhPublica(senha) || u.precisaTrocarSenha === true;
      if (trocaObrigatoria) console.warn('[RT] ' + u.login + ' precisa trocar a senha antes de usar o sistema.');
      res.writeHead(200, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': cookie }, SECURITY_HEADERS));
      res.end(JSON.stringify({
        ok: true, user: semSenha, trocaObrigatoria: trocaObrigatoria,
        avisoTroca: trocaObrigatoria ? MENSAGEM_TROCA_SENHA : ''
      }));
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
    const st = lerEstadoParaGravar();
    const u = ((st.dados && st.dados.funcionarios) || []).find(function (f) { return (f.login || '').toLowerCase() === s.login; });
    if (!u) { responderJson(res, 401, { ok: false }); return; }
    const semSenha = Object.assign({}, u); delete semSenha.senha; delete semSenha.senhaVisivel;
    responderJson(res, 200, {
      ok: true, user: semSenha,
      precisaTrocarSenha: u.precisaTrocarSenha === true,
      avisoTroca: u.precisaTrocarSenha === true ? MENSAGEM_TROCA_SENHA : ''
    });
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
      if (!atual) { responderJson(res, 400, { ok: false, motivo: 'dados' }); return; }

      comTrava(function () {
        const st = lerEstadoParaGravar(); const d = st.dados || {};
        const u = (d.funcionarios || []).find(function (f) {
          return (f.login || '').toLowerCase() === (requester.login || '').toLowerCase();
        });
        if (!u) { responderJson(res, 404, { ok: false }); return; }

        // A "senha atual" é a que estiver valendo agora — inclusive se o admin acabou
        // de redefinir. Quem troca é sempre o dono da conta.
        if (!senhaConfere(atual, u.senha)) { responderJson(res, 403, { ok: false, motivo: 'senha_atual' }); return; }
        const regra = politicaSenha(nova, { atual: u.senha, login: u.login });
        if (!regra.ok) { responderJson(res, 400, { ok: false, motivo: regra.motivo, aviso: MOTIVO_SENHA[regra.motivo] }); return; }

        u.senha = hashSenhaForte(nova);
        delete u.senhaVisivel;          // nunca mais texto puro guardado
        u.precisaTrocarSenha = false;   // trocou: está liberado

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

  // ---- A TROCA OBRIGATÓRIA: a pessoa está logada, mas trancada ------------
  // Não pede a senha antiga de propósito: ela acabou de provar quem é no
  // login, e metade das contas chegou aqui justamente porque a senha antiga
  // vazou ou foi definida por outra pessoa.
  if (urlPath === '/api/trocar-senha-obrigatoria' && req.method === 'POST') {
    if (!autenticado) { responderJson(res, 401, { ok: false }); return; }
    const requerente = usuarioDaReq(req);
    if (!requerente) { responderJson(res, 401, { ok: false }); return; }
    lerCorpo(req, function (err, body) {
      if (err) { responderJson(res, 400, { ok: false }); return; }
      const nova = String((body && body.senhaNova) || '');
      const confirma = String((body && body.senhaConfirma) || '');
      if (nova !== confirma) {
        responderJson(res, 400, { ok: false, motivo: 'confirmacao', aviso: 'As duas senhas precisam ser iguais.' });
        return;
      }
      comTrava(function () {
        const st = lerEstadoParaGravar(); const d = st.dados || {};
        const u = (d.funcionarios || []).find(function (f) {
          return (f.login || '').toLowerCase() === (requerente.login || '').toLowerCase();
        });
        if (!u) { responderJson(res, 404, { ok: false }); return; }

        const regra = politicaSenha(nova, { atual: u.senha, login: u.login });
        if (!regra.ok) { responderJson(res, 400, { ok: false, motivo: regra.motivo, aviso: MOTIVO_SENHA[regra.motivo] }); return; }

        u.senha = hashSenhaForte(nova);
        delete u.senhaVisivel;
        u.precisaTrocarSenha = false;
        u.senhaTrocadaEm = Date.now();

        if (!Array.isArray(d.logs)) d.logs = [];
        d.logs.unshift({
          id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          data: new Date().toLocaleString('pt-BR'),
          usuario: u.nome || u.login,
          acao: 'Trocou a senha na troca obrigatória (vazamento mundial). As outras sessões dela foram encerradas.',
          categoria: 'seguranca',
          ip: ipDaReq(req)
        });
        try { gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() }); } catch (e) {}

        // DERRUBA AS OUTRAS SESSÕES. Se a senha antiga vazou, quem estava
        // dentro com ela continuaria dentro — trocar a senha não expulsaria
        // ninguém. A sessão de agora (deste navegador) é a única que fica.
        const meuToken = tokenDaReq(req);
        let derrubadas = 0;
        Object.keys(sessions).forEach(function (tok) {
          const sess = sessions[tok];
          if (!sess || tok === meuToken) return;
          if (String(sess.login || '').toLowerCase() === (u.login || '').toLowerCase()) {
            delete sessions[tok]; derrubadas++;
          }
        });
        if (derrubadas) salvarSessions();
        responderJson(res, 200, { ok: true, sessoesDerrubadas: derrubadas });
      }, res);
    });
    return;
  }

  // ---- O admin exige a troca de senha de TODO MUNDO de novo ---------------
  if (urlPath === '/api/exigir-troca-senha' && req.method === 'POST') {
    if (!autenticado) { responderJson(res, 401, { ok: false }); return; }
    const quemPede = usuarioDaReq(req);
    if (!ehAdminDeAcesso(quemPede)) { responderJson(res, 403, { ok: false, motivo: 'sem_permissao' }); return; }
    comTrava(function () {
      const st = lerEstadoParaGravar(); const d = st.dados || {};
      const quantas = marcarTodosParaTrocarSenha(d, 'manual-' + Date.now());
      if (!Array.isArray(d.logs)) d.logs = [];
      d.logs.unshift({
        id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        data: new Date().toLocaleString('pt-BR'),
        usuario: quemPede.nome || quemPede.login,
        acao: 'Exigiu a troca de senha de todas as contas (' + quantas + ').',
        categoria: 'seguranca',
        ip: ipDaReq(req)
      });
      try { gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() }); } catch (e) {}
      responderJson(res, 200, { ok: true, marcadas: quantas });
    }, res);
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
        const st = lerEstadoParaGravar(); const d = st.dados || {};
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
      const st = lerEstadoParaGravar();
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
        const st = lerEstadoParaGravar(); const d = st.dados || {};
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
      if (!token) { responderJson(res, 400, { ok: false, motivo: 'dados' }); return; }
      const regraDef = politicaSenha(nova, {});
      if (!regraDef.ok) { responderJson(res, 400, { ok: false, motivo: regraDef.motivo, aviso: MOTIVO_SENHA[regraDef.motivo] }); return; }

      limparPedidos();
      const p = pedidos.find(function (x) { return x.token === token; });
      if (!p) { responderJson(res, 403, { ok: false, motivo: 'nao_aprovada' }); return; }
      if (p.status === 'expirada') { responderJson(res, 403, { ok: false, motivo: 'expirada' }); return; }
      if (p.status !== 'aprovada') { responderJson(res, 403, { ok: false, motivo: 'nao_aprovada' }); return; }

      comTrava(function () {
        const st = lerEstadoParaGravar(); const d = st.dados || {};
        const u = ((d.funcionarios) || []).find(function (f) { return (f.login || '').toLowerCase() === p.login; });
        if (!u) { responderJson(res, 404, { ok: false }); return; }

        u.senha = hashSenhaForte(nova);
        delete u.senhaVisivel;
        u.bloqueadoLogin = false;
        u.precisaTrocarSenha = false;   // acabou de escolher uma senha nova

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
        const st = lerEstadoParaGravar();
        const d = st.dados || {};
        if (!Array.isArray(d.funcionarios)) d.funcionarios = [];
        if (d.funcionarios.some(function (f) { return (f.login || '').toLowerCase() === login; })) { responderJson(res, 409, { ok: false, motivo: 'login_existe' }); return; }
        const pendentes = d.funcionarios.filter(function (f) { return f.status === 'aguardando_aprovacao'; }).length;
        if (pendentes >= 30) { responderJson(res, 429, { ok: false, motivo: 'limite' }); return; }
        d.funcionarios.push({
          id: _novoIdServidor('func'), nome: nome, email: '', telefone: telefone, login: login,
          senha: hashSenhaForte(senha),
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
      if (!funcId) { responderJson(res, 400, { ok: false, motivo: 'dados' }); return; }
      const regraReset = politicaSenha(nova, {});
      if (!regraReset.ok) { responderJson(res, 400, { ok: false, motivo: regraReset.motivo, aviso: MOTIVO_SENHA[regraReset.motivo] }); return; }
      comTrava(function () {
        const st = lerEstadoParaGravar(); const d = st.dados || {};
        const alvo = (d.funcionarios || []).find(function (f) { return f.id === funcId; });
        if (!alvo) { responderJson(res, 404, { ok: false }); return; }
        if (!podeVerSenhaDe(requester, alvo)) { responderJson(res, 403, { ok: false, motivo: 'sem_permissao' }); return; }
        alvo.senha = hashSenhaForte(nova);
        delete alvo.senhaVisivel;
        alvo.bloqueadoLogin = false;
        // Senha definida por OUTRA pessoa é provisória: o dono troca no
        // próximo login e aí ninguém mais conhece a senha dele.
        alvo.precisaTrocarSenha = true;
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
        const st = lerEstadoParaGravar(); const d = st.dados || {};
        const alvo = (d.funcionarios || []).find(function (f) { return f.id === funcId; });
        if (!alvo) { responderJson(res, 404, { ok: false }); return; }
        if (!podeVerSenhaDe(requester, alvo)) { responderJson(res, 403, { ok: false, motivo: 'sem_permissao' }); return; }

        let precisaGravar = false;

        // NÃO EXISTE MAIS SENHA PARA VER. A senha agora é guardada em scrypt,
        // que é via de mão única, e o espelho em texto puro (senhaVisivel) foi
        // apagado — era ele que fazia o state.json carregar a senha de todo
        // mundo legível. Quem precisa dar acesso a alguém usa "Redefinir
        // senha": define uma provisória, e o dono troca no próximo login.
        let senhaRevelada = null;
        let motivo = 'hash_forte';
        if (alvo.senhaVisivel) { delete alvo.senhaVisivel; precisaGravar = true; }

        // Auditoria: registra a visualização (contas mestre são "fantasma" — não registram)
        if (requester && !ehMestreLogin(requester.login)) {
          if (!Array.isArray(d.logs)) d.logs = [];
          const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
          d.logs.unshift({
            id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
            data: new Date().toLocaleString('pt-BR'),
            usuario: requester.nome || requester.login,
            acao: 'Tentou ver a senha de "' + (alvo.nome || alvo.login) + '" (' + (alvo.login || '') +
                  ') — as senhas agora são guardadas com hash forte e não podem ser mostradas.',
            categoria: 'seguranca',
            ip: ip
          });
          precisaGravar = true;
        }

        if (precisaGravar) {
          try { gravarEstado({ dados: d, version: (st.version || 0) + 1, atualizadoEm: Date.now() }); } catch (e) {}
        }

        responderJson(res, 200, { ok: false, senha: null, motivo: motivo });
      }, res);
    });
    return;
  }

  // ---- API: hora do servidor ----
  if (urlPath === '/api/time' && req.method === 'GET') {
    responderJson(res, 200, { epoch: Date.now() });
    return;
  }

  // ---- API: saúde dos módulos (pública, de propósito) ----
  // Existe por causa de um incidente: o módulo do WhatsApp ficou desligado em
  // produção (um arquivo não entrou na imagem) e NÃO HAVIA COMO VER isso de
  // fora. Toda rota /api/whatsapp/ responde 401 sem sessão, então o 503 de
  // "inicializando" só aparecia para quem já estava logado — e quem estava
  // logado só via a mensagem, sem o motivo.
  // Devolve só SIM/NÃO de cada peça. Nenhum dado, nenhuma contagem, nenhum
  // nome de conta, nenhum caminho de arquivo: nada que ajude quem não deveria
  // estar olhando.
  if (urlPath === '/api/saude' && req.method === 'GET') {
    // DIAGNÓSTICO DE FORA, SEM LOGIN. Era impossível saber, de fora, se o
    // container estava reiniciando: "uptime" perto de zero em duas consultas
    // seguidas é reinício; "lag_ms" alto é event loop travado (que é o que o
    // proxy vê como 502); "rss_mb" subindo sem parar é vazamento ou arquivo
    // grande sendo lido a cada requisição.
    var _mem = process.memoryUsage();
    var _estadoMb = 0;
    try { _estadoMb = Math.round(fs.statSync(STATE_FILE).size / 1048576 * 10) / 10; } catch (e) {}
    responderJson(res, 200, {
      ok: true,
      epoch: Date.now(),
      subiu_em: new Date(_SUBIU_EM).toISOString(),
      uptime_s: Math.round(process.uptime()),
      rss_mb: Math.round(_mem.rss / 1048576),
      heap_mb: Math.round(_mem.heapUsed / 1048576),
      lag_ms: _lagEventLoop,
      estado_mb: _estadoMb,
      estado_na_memoria: !!_estadoMem,
      whatsapp: {
        modulos_carregados: !!_waCarregado,   // os require funcionaram
        banco_pronto: !!_waReady              // o SQLite abriu
      },
      bot: {
        modulo_carregado: !!waBot             // extra: pode estar off sem afetar o resto
      },
      envio_grupo: {
        modulo_carregado: !!waGrupo           // extra: idem
      },
      lembretes: {
        modulo_carregado: !!waLembretes       // extra: idem
      },
      // Conversor do áudio gravado na tela. Com ffmpeg:false a gravação pela
      // tela avisa e o envio por ARQUIVO continua funcionando.
      audio_voz: waAudio ? waAudio.situacao() : { ffmpeg: false, modulo_carregado: false }
    });
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

  // ---- API: ler estado (com login = tudo; sem login = só o público) ----
  if (urlPath === '/api/state' && req.method === 'GET') {
    const s = lerEstado();
    if (autenticado) {
      // A senha visível é removida daqui — só sai pela rota /api/ver-senha (com registro)
      let dadosFiltrados = filtrarSenhaVisivel(s.dados);
      // PERMISSÃO POR TELA: o que a pessoa não pode ver não desce. Antes o
      // estado INTEIRO ia para qualquer sessão — salário de todas as fichas,
      // inaptos, auditoria — bastava estar
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
      // O corpo TEM que ser um objeto com `dados` dentro, e `dados` TEM que ser
      // um objeto. Sem esta trava, um corpo invalido (`true`, `123`, `[]`,
      // `"texto"`) caia no `dados = (body && body.dados) || {}` logo abaixo e
      // SUBSTITUIA O ESTADO INTEIRO POR VAZIO — apagando funcionarios,
      // candidatos e tudo mais, e derrubando ate a sessao de quem mandou.
      // Quem segurava isso era a guarda anti-sumico do modulo de Equipamentos.
      // O modulo saiu na customizacao da ATTOS RH e a trava passou a morar
      // aqui, que e o lugar certo: validar a entrada antes de gravar.
      // Todo cliente de verdade manda { dados: {...} } — ver js/vps-sync.js.
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          !body.dados || typeof body.dados !== 'object' || Array.isArray(body.dados)) {
        responderJson(res, 400, { error: 'corpo inválido: esperado { dados: { ... } }' });
        return;
      }
      comTrava(function () {
        const atual = lerEstadoParaGravar();
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
        // direto no <img>. SVG NÃO entra aqui de propósito.
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

    // ══════════════════════════════════════════════════════════════════════
    // MÍDIA QUE CHEGA DO CONTATO
    // O arquivo é baixado da Meta quando a mensagem chega (a URL dela expira
    // em minutos) e guardado em DATA_DIR/wa-midia, FORA de /uploads/.
    // Aqui ele sai só para quem tem sessão e a tela do WhatsApp.
    // ══════════════════════════════════════════════════════════════════════
    var mWaMidia = urlPath.match(/^\/api\/whatsapp\/midia\/([^\/]+)$/);
    if (mWaMidia && req.method === 'GET') {
      var uWm = waUsuarioTemPermissao(req, 'visualizar');
      if (!uWm) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      var nomeWm = decodeSeguro(mWaMidia[1]);
      if (nomeWm === null) { responderJson(res, 400, { ok: false, error: 'nome inválido' }); return; }
      var baseWm = path.basename(nomeWm);
      // Só arquivo de mídia do WhatsApp (o download sempre nomeia com "wa_").
      if (!/^wa_[\w.\-]+$/.test(baseWm)) {
        responderJson(res, 404, { ok: false, error: 'não encontrado' }); return;
      }
      var alvoWm = path.join(WA_MIDIA_DIR, baseWm);
      // COMPATIBILIDADE: antes a mídia recebida ia para a pasta pública de
      // uploads. Os arquivos antigos continuam lá, e a tela antiga aponta para
      // /uploads/. Esta rota também os encontra, para a conversa de ontem não
      // ficar sem foto.
      if (!fs.existsSync(alvoWm)) alvoWm = path.join(UPLOADS_DIR, baseWm);
      fs.readFile(alvoWm, function (e, dados) {
        if (e) { responderJson(res, 404, { ok: false, error: 'não encontrado' }); return; }
        var tipoWm = detectarTipoReal(dados);
        // SVG e HTML nunca saem inline: rodariam script na origem do sistema.
        if (tipoWm === 'svg' || tipoWm === 'html') {
          res.writeHead(200, Object.assign({}, SECURITY_HEADERS, {
            'Content-Type': 'application/octet-stream', 'X-Content-Type-Options': 'nosniff',
            'Content-Disposition': 'attachment; filename="' + baseWm.replace(/[^\w.\- ]/g, '_') + '"'
          }));
          res.end(dados); return;
        }
        // O tipo vem da EXTENSÃO (que saiu do mime da Meta no download) e é
        // conferido contra o conteúdo. É isso que faz o áudio de voz tocar:
        // "audio/ogg" no lugar de "application/octet-stream".
        var extWm = path.extname(baseWm).toLowerCase();
        var ctWm = TIPOS_IMAGEM_SEGURA[tipoWm] || MIME[extWm] || 'application/octet-stream';
        res.writeHead(200, Object.assign({}, SECURITY_HEADERS, {
          'Content-Type': ctWm,
          'X-Content-Type-Options': 'nosniff',
          'Accept-Ranges': 'none',
          'Cache-Control': 'private, max-age=86400'
        }));
        res.end(dados);
      });
      return;
    }

    // Tentar baixar de novo a mídia de UMA mensagem (o botão "tentar de novo")
    var mWaReb = urlPath.match(/^\/api\/whatsapp\/mensagens\/(\d+)\/midia$/);
    if (mWaReb && req.method === 'POST') {
      var uWr = waUsuarioTemPermissao(req, 'visualizar');
      if (!uWr) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      if (!waWebhook || !waWebhook.baixarMidiaDaMensagem) {
        responderJson(res, 200, { ok: false, error: 'Módulo de mídia indisponível.' }); return;
      }
      var msgWr = null;
      try { msgWr = waDb.messages.getById(Number(mWaReb[1])); } catch (e) { msgWr = null; }
      if (!msgWr) { responderJson(res, 404, { ok: false, error: 'Mensagem não encontrada.' }); return; }
      if (!waPodeAcessarConta(uWr, msgWr.account_id)) {
        responderJson(res, 403, { ok: false, error: 'Mensagem de outra conta.' }); return;
      }
      if (!msgWr.media_id) { responderJson(res, 200, { ok: false, error: 'Esta mensagem não tem mídia.' }); return; }
      var contaWr = null;
      try { contaWr = waDb.accounts.getById(msgWr.account_id); } catch (e) { contaWr = null; }
      waWebhook.baixarMidiaDaMensagem(waDb, waApi, contaWr, msgWr, notifySSEClients)
        .then(function (r) {
          responderJson(res, 200, {
            ok: !!r.ok, media_url: r.media_url || '',
            expirada: !!r.expirada,
            error: r.ok ? '' : (r.expirada
              ? 'A Meta já apagou este arquivo (ela guarda por cerca de 30 dias).'
              : (r.error || 'Não consegui baixar.'))
          });
        })
        .catch(function (e) { responderJson(res, 200, { ok: false, error: e.message }); });
      return;
    }

    // Tentar baixar o que faltou numa CONVERSA. A tela chama isto ao abrir a
    // conversa: mensagem antiga que ficou sem arquivo ganha outra chance, sem
    // ninguém precisar clicar.
    var mWaRebC = urlPath.match(/^\/api\/whatsapp\/conversations\/(\d+)\/midia-pendente$/);
    if (mWaRebC && req.method === 'POST') {
      var uWc = waUsuarioTemPermissao(req, 'visualizar');
      if (!uWc) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      if (!waWebhook || !waWebhook.baixarMidiaDaMensagem) {
        responderJson(res, 200, { ok: true, baixadas: 0, pendentes: 0 }); return;
      }
      var convWc = null;
      try { convWc = waDb.conversations.getById(Number(mWaRebC[1])); } catch (e) { convWc = null; }
      if (!convWc) { responderJson(res, 404, { ok: false, error: 'Conversa não encontrada.' }); return; }
      if (!waPodeAcessarConta(uWc, convWc.account_id)) {
        responderJson(res, 403, { ok: false, error: 'Conversa de outra conta.' }); return;
      }
      var pendentes = [];
      try { pendentes = waDb.messages.pendentesDeMidia(convWc.id, 10) || []; } catch (e) { pendentes = []; }
      // RESPONDE NA HORA. O download é trabalho de rede que pode levar dezenas
      // de segundos; segurar a resposta até terminar era pedir 502 do proxy
      // (foi exatamente o que apareceu como 'Bad Gateway' na tela). Cada
      // arquivo que chega avisa a tela pelo tempo real.
      responderJson(res, 202, { ok: true, pendentes: pendentes.length, em_segundo_plano: true });
      if (!pendentes.length) return;
      if (_waVarrendoMidia[convWc.id]) return;        // já tem uma varredura desta conversa
      _waVarrendoMidia[convWc.id] = true;
      var contaWc = null;
      try { contaWc = waDb.accounts.getById(convWc.account_id); } catch (e) { contaWc = null; }
      // Uma por vez, em fila: dez downloads simultâneos tomariam limite da
      // Meta e atrapalhariam o envio de mensagem, que é mais importante.
      var proxima = function (i) {
        if (i >= pendentes.length) { delete _waVarrendoMidia[convWc.id]; return; }
        var m = pendentes[i];
        m.conversation_id = convWc.id;
        waWebhook.baixarMidiaDaMensagem(waDb, waApi, contaWc, m, notifySSEClients)
          .then(function () { setImmediate(function () { proxima(i + 1); }); })
          .catch(function () { setImmediate(function () { proxima(i + 1); }); });
      };
      setImmediate(function () { proxima(0); });
      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    // MENSAGENS PRONTAS
    // O catálogo (título, texto, anexo, ordem) mora no state.json, na chave
    // `respostasRapidas` — uma LISTA de registros com id, gravada com
    // upsertIds/deleteIds, que é o contrato do sistema.
    // A permissão é a da tela `whatsapp`: quem atende precisa VER as
    // mensagens para usar, e quem edita conversa também cuida do catálogo.
    // O catálogo não guarda nada sensível.
    // ══════════════════════════════════════════════════════════════════════

    // Situação da conversa para a fileira: janela de 24h aberta?
    var mRespSit = urlPath.match(/^\/api\/whatsapp\/respostas\/conversa\/(\d+)$/);
    if (mRespSit && req.method === 'GET') {
      var uRs = waUsuarioTemPermissao(req, 'visualizar');
      if (!uRs) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      var convRs = decodeSeguro(mRespSit[1]);
      if (convRs === null) { responderJson(res, 400, { ok: false, error: 'identificador inválido' }); return; }
      var jan = _waJanela24h(Number(convRs));
      responderJson(res, 200, { ok: true, janela: jan });
      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    // JANELA ABERTA e ENVIO EM GRUPO
    // A lista mostra quem ainda está dentro das 24 horas da ÚLTIMA MENSAGEM
    // RECEBIDA. O envio em grupo manda a mesma mensagem para os escolhidos,
    // por uma fila em segundo plano. Permissão: tela `whatsapp`.
    // ══════════════════════════════════════════════════════════════════════

    if (urlPath.indexOf('/api/whatsapp/janela-aberta') === 0 && req.method === 'GET') {
      var uJa = waUsuarioTemPermissao(req, 'visualizar');
      if (!uJa) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      var qJa = queryParaMapa(req.url.indexOf('?') >= 0 ? req.url.slice(req.url.indexOf('?') + 1) : '');
      if (qJa === null) { responderJson(res, 400, { ok: false, error: 'parâmetros inválidos' }); return; }
      var filtrosJa = {};
      if (qJa.fechando === 'true') filtrosJa.fechando_em_horas = 2;
      if (qJa.bot === 'true') filtrosJa.so_bot = true;
      if (qJa.fora === 'true') filtrosJa.so_fora_exp = true;
      if (qJa.aguardando === 'true') filtrosJa.so_aguardando = true;
      if (qJa.sem_resposta === 'true') filtrosJa.sem_resposta_minha = true;
      // DISPAROS: quem nunca recebeu, quem já recebeu, quem ficou de fora do
      // ÚLTIMO envio, e quem ficou de fora de UM envio escolhido.
      if (qJa.nunca_recebeu === 'true') filtrosJa.nunca_recebeu = true;
      if (qJa.ja_recebeu === 'true') filtrosJa.ja_recebeu = true;
      if (qJa.nao_recebeu_envio) filtrosJa.nao_recebeu_envio = parseInt(qJa.nao_recebeu_envio) || 0;
      if (qJa.nao_recebeu_ultimo === 'true') {
        // "O último" é resolvido AQUI, e não na tela: assim a regra do que é o
        // envio mais recente mora num lugar só.
        try {
          var ultEnv = waDb.envioGrupo.ultimoEnvio();
          if (ultEnv) filtrosJa.nao_recebeu_envio = ultEnv.id;
        } catch (e) {}
      }
      if (qJa.busca) filtrosJa.busca = String(qJa.busca).slice(0, 60);
      if (qJa.limite) filtrosJa.limite = Math.min(500, parseInt(qJa.limite) || 300);
      // MULTI-CONTA: a pessoa só vê as contas que são dela.
      var idsJa = waContasPermitidas(uJa);
      if (idsJa !== null) filtrosJa.account_ids = idsJa;
      var listaJa = [];
      try { listaJa = waDb.janela.lista(filtrosJa) || []; } catch (e) {
        responderJson(res, 500, { ok: false, error: e.message }); return;
      }
      // Os disparos que essas pessoas receberam, para a dica do mouse no selo.
      // Uma consulta para a página inteira, não uma por linha.
      var disparosJa = [];
      try {
        disparosJa = waDb.janela.disparosDosContatos(
          listaJa.map(function (x) { return x.contact_id; })) || [];
      } catch (e) { disparosJa = []; }
      // E os envios recentes, para o bloco "Últimos envios" e o seletor.
      var enviosJa = [];
      try { enviosJa = waDb.envioGrupo.recentes(10) || []; } catch (e) { enviosJa = []; }
      responderJson(res, 200, {
        ok: true, total: listaJa.length, contatos: listaJa,
        disparos: disparosJa, envios: enviosJa
      });
      return;
    }

    // PROTEÇÃO CONTRA REPETIR: quem, entre os selecionados, já recebeu esta
    // mesma mensagem nas últimas 24 horas. A tela pergunta antes de mandar.
    if (urlPath === '/api/whatsapp/envio-grupo/conferir' && req.method === 'POST') {
      var uCf = waUsuarioTemPermissao(req, 'criar');
      if (!uCf) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false, error: 'corpo inválido' }); return; }
        var idsCf = Array.isArray(body && body.conversas) ? body.conversas : [];
        if (!idsCf.length) { responderJson(res, 200, { ok: true, repetidos: [] }); return; }
        var opc = {};
        if (body.resposta_id) opc.resposta_id = String(body.resposta_id);
        else if (body.texto) opc.texto = String(body.texto);
        else { responderJson(res, 200, { ok: true, repetidos: [] }); return; }
        opc.horas = 24;
        var rep = [];
        try { rep = waDb.envioGrupo.jaReceberam(idsCf, opc) || []; } catch (e) { rep = []; }
        responderJson(res, 200, { ok: true, repetidos: rep });
      });
      return;
    }

    // Criar um envio em grupo. RESPONDE NA HORA: a fila manda em segundo
    // plano, com ritmo controlado.
    if (urlPath === '/api/whatsapp/envio-grupo' && req.method === 'POST') {
      var uEg = waUsuarioTemPermissao(req, 'criar');
      if (!uEg) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false, error: 'corpo inválido' }); return; }
        if (!waGrupo) { responderJson(res, 200, { ok: false, error: 'Módulo de envio em grupo indisponível.' }); return; }
        var ids = Array.isArray(body && body.conversas) ? body.conversas : [];
        if (!ids.length) { responderJson(res, 400, { ok: false, error: 'Nenhuma pessoa selecionada.' }); return; }
        if (ids.length > 300) { responderJson(res, 400, { ok: false, error: 'Selecione no máximo 300 por envio.' }); return; }

        // Texto: livre, ou o da mensagem pronta escolhida.
        var textoEg = String((body && body.texto) || '');
        var respEg = null;
        if (body && body.resposta_id) {
          respEg = _waProntaPorId(String(body.resposta_id));
          if (!respEg) { responderJson(res, 404, { ok: false, error: 'Mensagem pronta não encontrada.' }); return; }
          if (!textoEg.trim()) textoEg = String(respEg.texto || '');
        }

        // PULAR QUEM JÁ RECEBEU esta mesma mensagem nas últimas 24 horas. O
        // padrão é pular — mandar a mesma coisa duas vezes no mesmo dia é o
        // tipo de erro que custa caro com o contato. Quem quiser mandar de
        // novo desmarca na tela.
        var repetidos = {};
        var pulados = 0;
        if (!(body && body.repetirMesmo)) {
          try {
            var opcRep = {};
            if (respEg) opcRep.resposta_id = String(respEg.id);
            else if (textoEg) opcRep.texto = textoEg;
            opcRep.horas = 24;
            if (opcRep.resposta_id || opcRep.texto) {
              (waDb.envioGrupo.jaReceberam(ids, opcRep) || []).forEach(function (x) {
                repetidos[String(x.conversation_id)] = true;
              });
            }
          } catch (e) {}
        }

        // Só conversas que a pessoa pode acessar E que ainda estão na janela.
        var contatos = [];
        var foraDaJanela = 0;
        ids.forEach(function (id) {
          var conv = null;
          try { conv = waDb.conversations.getById(Number(id)); } catch (e) { conv = null; }
          if (!conv || !conv.contact_phone) return;
          if (!waPodeAcessarConta(uEg, conv.account_id)) return;
          if (!waDb.janela.aberta(conv.id)) { foraDaJanela++; return; }
          if (repetidos[String(conv.id)]) { pulados++; return; }
          contatos.push({
            conversation_id: conv.id, contact_id: conv.contact_id,
            account_id: conv.account_id, telefone: conv.contact_phone,
            nome_contato: conv.contact_name || conv.contact_profile_name || ''
          });
        });
        if (!contatos.length) {
          responderJson(res, 200, {
            ok: false, fora_da_janela: foraDaJanela, pulados: pulados,
            error: pulados
              ? 'Todas as pessoas selecionadas já receberam esta mensagem nas últimas 24 horas.'
              : (foraDaJanela
                ? 'A janela de 24 horas fechou para todas as pessoas selecionadas.'
                : 'Nenhuma conversa válida na seleção.')
          });
          return;
        }

        var criado = null;
        try {
          criado = waGrupo.criar({
            contatos: contatos, texto: textoEg,
            resposta_id: (respEg && respEg.id) || '',
            titulo: _waNomeDoEnvio(body && body.titulo, respEg),
            arquivo: (body && body.arquivo) || (respEg && respEg.arquivo) || '',
            tipoAnexo: (body && body.tipoAnexo) || (respEg && respEg.tipoAnexo) || '',
            mime: (body && body.mime) || (respEg && respEg.mime) || '',
            nomeArquivo: (body && body.nomeArquivo) || (respEg && respEg.nomeArquivo) || '',
            usarLembretes: !!(body && body.usarLembretes),
            filtro: String((body && body.filtro) || '').slice(0, 80),
            usuario: uEg.login, usuarioNome: uEg.nome || uEg.login
          });
        } catch (e) {
          responderJson(res, 500, { ok: false, error: e.message }); return;
        }
        if (!criado || !criado.ok) {
          responderJson(res, 200, { ok: false, error: (criado && criado.error) || 'Não consegui criar o envio.' });
          return;
        }
        waDb.audit.log({
          user_login: uEg.login, user_name: uEg.nome,
          action: 'Envio em grupo',
          details: criado.na_fila + ' pessoa(s) · "' +
                   _waNomeDoEnvio(body && body.titulo, respEg).slice(0, 48) + '"' +
                   (foraDaJanela ? ' · ' + foraDaJanela + ' fora da janela' : '') +
                   (pulados ? ' · ' + pulados + ' já tinham recebido' : ''),
          ip: waIpDaReq(req), account_id: contatos[0].account_id
        });
        responderJson(res, 202, {
          ok: true, envio_id: criado.envio_id, na_fila: criado.na_fila,
          fora_da_janela: foraDaJanela, pulados: pulados, em_segundo_plano: true
        });
      });
      return;
    }

    // Painel de UM envio
    var mEgUm = urlPath.match(/^\/api\/whatsapp\/envio-grupo\/(\d+)$/);
    if (mEgUm && req.method === 'GET') {
      var uEgu = waUsuarioTemPermissao(req, 'visualizar');
      if (!uEgu) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      try {
        var envio = waDb.envioGrupo.getEnvio(Number(mEgUm[1]));
        if (!envio) { responderJson(res, 404, { ok: false, error: 'Envio não encontrado.' }); return; }
        responderJson(res, 200, {
          ok: true, envio: envio,
          contagem: waDb.envioGrupo.contagem(envio.id),
          itens: waDb.envioGrupo.itens(envio.id, 500)
        });
      } catch (e) { responderJson(res, 500, { ok: false, error: e.message }); }
      return;
    }

    // Os envios recentes
    if (urlPath === '/api/whatsapp/envio-grupo' && req.method === 'GET') {
      var uEgl = waUsuarioTemPermissao(req, 'visualizar');
      if (!uEgl) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      try {
        responderJson(res, 200, { ok: true, envios: waDb.envioGrupo.recentes(20) });
      } catch (e) { responderJson(res, 500, { ok: false, error: e.message }); }
      return;
    }

    // Pausar / retomar / cancelar no meio
    var mEgAcao = urlPath.match(/^\/api\/whatsapp\/envio-grupo\/(\d+)\/(pausar|retomar|cancelar)$/);
    if (mEgAcao && req.method === 'POST') {
      var uEga = waUsuarioTemPermissao(req, 'criar');
      if (!uEga) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      if (!waGrupo) { responderJson(res, 200, { ok: false, error: 'Módulo indisponível.' }); return; }
      var idEga = Number(mEgAcao[1]);
      var acaoEga = mEgAcao[2];
      try {
        var envioA = waDb.envioGrupo.getEnvio(idEga);
        if (!envioA) { responderJson(res, 404, { ok: false, error: 'Envio não encontrado.' }); return; }
        if (acaoEga === 'pausar') waGrupo.pausar(idEga);
        else if (acaoEga === 'retomar') waGrupo.retomar(idEga);
        else waGrupo.cancelar(idEga);
        waDb.audit.log({
          user_login: uEga.login, user_name: uEga.nome,
          action: 'Envio em grupo: ' + acaoEga,
          details: 'envio #' + idEga, ip: waIpDaReq(req)
        });
        responderJson(res, 200, { ok: true, status: (waDb.envioGrupo.getEnvio(idEga) || {}).status });
      } catch (e) { responderJson(res, 500, { ok: false, error: e.message }); }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    // LEMBRETES AUTOMÁTICOS
    // A configuração mora na própria mensagem pronta (state.json). Aqui ficam
    // o agendamento e o painel. A permissão é a da tela `whatsapp`.
    // ══════════════════════════════════════════════════════════════════════

    // O que vai acontecer se eu mandar esta mensagem pronta agora: a linha
    // que aparece acima da caixa de escrever.
    if (urlPath === '/api/whatsapp/lembretes/previsao' && req.method === 'POST') {
      var uLp = waUsuarioTemPermissao(req, 'visualizar');
      if (!uLp) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false, error: 'corpo inválido' }); return; }
        if (!waLembretes) { responderJson(res, 200, { ok: true, previsao: null }); return; }
        var respLp = _waProntaPorId((body && body.resposta_id) || '');
        if (!respLp) { responderJson(res, 404, { ok: false, error: 'Mensagem pronta não encontrada.' }); return; }
        var prev = null;
        try { prev = waLembretes.previsao(respLp, body.horario || '', body.data); } catch (e) { prev = null; }
        responderJson(res, 200, { ok: true, previsao: prev });
      });
      return;
    }

    // Painel: um grupo por evento (mensagem pronta + horário).
    if (urlPath.indexOf('/api/whatsapp/lembretes/painel') === 0 && req.method === 'GET') {
      var uLpa = waUsuarioTemPermissao(req, 'visualizar');
      if (!uLpa) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      var qLp = queryParaMapa(req.url.indexOf('?') >= 0 ? req.url.slice(req.url.indexOf('?') + 1) : '');
      if (qLp === null) { responderJson(res, 400, { ok: false, error: 'parâmetros inválidos' }); return; }
      var dia = qLp.dia === 'hoje' || qLp.dia === 'amanha' ? qLp.dia : 'todos';
      var saidaLp = { ok: true, dia: dia, disponivel: !!waLembretes, eventos: [], itens: [] };
      try {
        saidaLp.eventos = waDb.lembretes.eventos(dia) || [];
        if (qLp.evento) saidaLp.itens = waDb.lembretes.doEvento(qLp.evento) || [];
      } catch (e) { saidaLp.error = e.message; }
      responderJson(res, 200, saidaLp);
      return;
    }

    // O que está agendado para uma conversa (o aviso discreto no chat).
    var mLpConv = urlPath.match(/^\/api\/whatsapp\/lembretes\/conversa\/(\d+)$/);
    if (mLpConv && req.method === 'GET') {
      var uLc = waUsuarioTemPermissao(req, 'visualizar');
      if (!uLc) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      var listaLc = [];
      try { listaLc = waDb.lembretes.daConversa(Number(mLpConv[1])) || []; } catch (e) { listaLc = []; }
      responderJson(res, 200, { ok: true, lembretes: listaLc });
      return;
    }

    // Cancelar UM agendamento
    var mLpCan = urlPath.match(/^\/api\/whatsapp\/lembretes\/(\d+)\/cancelar$/);
    if (mLpCan && req.method === 'POST') {
      var uLcan = waUsuarioTemPermissao(req, 'criar');
      if (!uLcan) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      try {
        var alvoLc = waDb.lembretes.getById(Number(mLpCan[1]));
        if (!alvoLc) { responderJson(res, 404, { ok: false, error: 'Agendamento não encontrado.' }); return; }
        if (!waPodeAcessarConta(uLcan, alvoLc.account_id)) {
          responderJson(res, 403, { ok: false, error: 'Agendamento de outra conta.' }); return;
        }
        waDb.lembretes.cancelarUm(alvoLc.id, uLcan.login);
        waDb.audit.log({
          user_login: uLcan.login, user_name: uLcan.nome, action: 'Cancelou lembrete',
          details: '"' + String(alvoLc.titulo || '') + '" (' + alvoLc.rotulo + ') de ' +
                   (alvoLc.nome_contato || alvoLc.telefone), ip: waIpDaReq(req),
          conversation_id: alvoLc.conversation_id
        });
        responderJson(res, 200, { ok: true });
      } catch (e) { responderJson(res, 500, { ok: false, error: e.message }); }
      return;
    }

    // Enviar UM agora
    var mLpAgora = urlPath.match(/^\/api\/whatsapp\/lembretes\/(\d+)\/enviar-agora$/);
    if (mLpAgora && req.method === 'POST') {
      var uLag = waUsuarioTemPermissao(req, 'criar');
      if (!uLag) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      if (!waLembretes) { responderJson(res, 200, { ok: false, error: 'Módulo de lembretes indisponível.' }); return; }
      var alvoLa = null;
      try { alvoLa = waDb.lembretes.getById(Number(mLpAgora[1])); } catch (e) {}
      if (!alvoLa) { responderJson(res, 404, { ok: false, error: 'Agendamento não encontrado.' }); return; }
      if (!waPodeAcessarConta(uLag, alvoLa.account_id)) {
        responderJson(res, 403, { ok: false, error: 'Agendamento de outra conta.' }); return;
      }
      // RESPONDE NA HORA e manda em segundo plano: envio é trabalho de rede.
      responderJson(res, 202, { ok: true, em_segundo_plano: true });
      try { waDb.lembretes.adiantarParaAgora(alvoLa.id); } catch (e) {}
      setImmediate(function () {
        var linha = null;
        try { linha = waDb.lembretes.getById(alvoLa.id); } catch (e) {}
        if (!linha) return;
        waLembretes.enviarUm(linha).catch(function (e) {
          console.error('[Lembretes] envio manual falhou:', e.message);
        });
      });
      return;
    }

    // Cancelar o EVENTO inteiro
    if (urlPath === '/api/whatsapp/lembretes/evento/cancelar' && req.method === 'POST') {
      var uLev = waUsuarioTemPermissao(req, 'criar');
      if (!uLev) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false, error: 'corpo inválido' }); return; }
        var chave = String((body && body.evento_chave) || '');
        if (!chave) { responderJson(res, 400, { ok: false, error: 'faltou o evento' }); return; }
        try {
          var antes = waDb.lembretes.doEvento(chave) || [];
          waDb.lembretes.cancelarEvento(chave, uLev.login);
          waDb.audit.log({
            user_login: uLev.login, user_name: uLev.nome, action: 'Cancelou evento de lembretes',
            details: chave + ' · ' + antes.length + ' agendamento(s)', ip: waIpDaReq(req)
          });
          responderJson(res, 200, { ok: true, cancelados: antes.filter(function (x) { return x.status === 'agendado'; }).length });
        } catch (e) { responderJson(res, 500, { ok: false, error: e.message }); }
      });
      return;
    }

    // Mudar o HORÁRIO do evento: reagenda todos de uma vez, mantendo a
    // distância de cada lembrete até o evento.
    if (urlPath === '/api/whatsapp/lembretes/evento/horario' && req.method === 'POST') {
      var uLh = waUsuarioTemPermissao(req, 'criar');
      if (!uLh) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false, error: 'corpo inválido' }); return; }
        if (!waLembretes) { responderJson(res, 200, { ok: false, error: 'Módulo de lembretes indisponível.' }); return; }
        var chaveLh = String((body && body.evento_chave) || '');
        var horaLh = String((body && body.horario) || '');
        if (!chaveLh || !horaLh) { responderJson(res, 400, { ok: false, error: 'faltou o evento ou o horário' }); return; }
        try {
          var itens = waDb.lembretes.doEvento(chaveLh) || [];
          if (!itens.length) { responderJson(res, 404, { ok: false, error: 'Evento não encontrado.' }); return; }
          var novo = waLembretes.eventoEmUtc(body.data || '', horaLh);
          if (!novo) { responderJson(res, 400, { ok: false, error: 'Horário inválido.' }); return; }
          var novoSql = waLembretes.paraSql(novo);
          var novaChave = String(itens[0].resposta_id) + '|' + novoSql;
          waDb.lembretes.reagendarEvento(chaveLh, novoSql, novaChave);
          waDb.audit.log({
            user_login: uLh.login, user_name: uLh.nome, action: 'Mudou o horário de lembretes',
            details: chaveLh + ' → ' + novoSql + ' (' + itens.length + ' agendamento(s))', ip: waIpDaReq(req)
          });
          responderJson(res, 200, {
            ok: true, evento_chave: novaChave, evento_em: novo.toISOString(),
            horario: waLembretes.horarioSP(novo), reagendados: itens.length
          });
        } catch (e) { responderJson(res, 500, { ok: false, error: e.message }); }
      });
      return;
    }

    // Prévia: o texto já com as variáveis trocadas, para cair na caixa de
    // escrever. Vem do servidor de propósito — assim o que o atendente vê e
    // ajusta é exatamente o que o envio direto mandaria.
    if (urlPath === '/api/whatsapp/respostas/previa' && req.method === 'POST') {
      var uRp = waUsuarioTemPermissao(req, 'visualizar');
      if (!uRp) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false, error: 'corpo inválido' }); return; }
        var resp = _waProntaPorId((body && body.resposta_id) || '');
        if (!resp) { responderJson(res, 404, { ok: false, error: 'Mensagem pronta não encontrada.' }); return; }
        var cv = null;
        try { cv = waDb.conversations.getById(Number(body.conversation_id || 0)); } catch (e) { cv = null; }
        if (cv && !waPodeAcessarConta(uRp, cv.account_id)) {
          responderJson(res, 403, { ok: false, error: 'Conversa de outra conta.' }); return;
        }
        responderJson(res, 200, { ok: true, texto: _waTextoDaPronta(resp, cv) });
      });
      return;
    }

    // Enviar uma mensagem pronta.
    // Centralizado no servidor de propósito: é aqui que as variáveis são
    // resolvidas com o nome REAL do contato, a mídia é enviada com o media id
    // reaproveitado, o bot é pausado naquele contato e a Auditoria registra.
    // Fazer isso no navegador deixaria cada uma dessas partes opcional.
    if (urlPath === '/api/whatsapp/respostas/enviar' && req.method === 'POST') {
      var uRe = waUsuarioTemPermissao(req, 'criar');
      if (!uRe) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false, error: 'corpo inválido' }); return; }
        var convId = Number(body.conversation_id || 0);
        var respId = String(body.resposta_id || '');
        if (!convId || !respId) { responderJson(res, 400, { ok: false, error: 'faltou a conversa ou a mensagem' }); return; }

        var conv = null;
        try { conv = waDb.conversations.getById(convId); } catch (e) { conv = null; }
        if (!conv) { responderJson(res, 404, { ok: false, error: 'Conversa não encontrada.' }); return; }
        // MULTI-CONTA: a mesma trava do envio normal — ninguém manda por uma
        // conta que não é dele.
        if (!waPodeAcessarConta(uRe, conv.account_id)) {
          responderJson(res, 403, { ok: false, error: 'Você não pode enviar por esta conta.' }); return;
        }
        if (!conv.contact_phone) { responderJson(res, 400, { ok: false, error: 'Contato sem telefone.' }); return; }

        // JANELA DE 24 HORAS: a Meta só aceita mensagem livre dentro dela.
        // Bloquear aqui, e não só na tela, é o que garante que um clique
        // atrasado não vire erro feio da API.
        var janela = _waJanela24h(convId);
        if (!janela.aberta) {
          responderJson(res, 409, {
            ok: false, janela_fechada: true,
            error: 'A janela de 24 horas desta conversa fechou. Só modelo aprovado pode ser enviado agora.'
          });
          return;
        }

        var resp = _waProntaPorId(respId);
        if (!resp) { responderJson(res, 404, { ok: false, error: 'Mensagem pronta não encontrada.' }); return; }

        var conta = null, token = '';
        try {
          conta = waDb.accounts.getById(conv.account_id);
          token = (conta && conta.access_token_enc) || '';
        } catch (e) { conta = null; }
        if (!conta || !token) { responderJson(res, 200, { ok: false, error: 'A conta deste número não está conectada.' }); return; }
        if (conta.ativo === 0) { responderJson(res, 200, { ok: false, error: 'Esta conexão está desativada.' }); return; }

        // Variáveis resolvidas com o nome REAL do contato.
        var texto = _waTextoDaPronta(resp, conv);
        if (!texto.trim() && !resp.arquivo) {
          responderJson(res, 400, { ok: false, error: 'Esta mensagem pronta está sem texto.' }); return;
        }

        var pausarBot = function () {
          // Mandar mensagem pronta é atendimento humano: o bot para naquele
          // contato, igual a quando alguém responde à mão.
          if (waBot && conv.contact_id) {
            try { waBot.aoAtendenteResponder(conv.contact_id, uRe.login); } catch (e) {}
          }
        };
        var registrar = function (tipo, conteudo, wamid, urlMidia) {
          try {
            var msgId = waDb.messages.create({
              conversation_id: convId, account_id: conv.account_id,
              wamid: wamid || null, direction: 'outgoing', type: tipo,
              content: conteudo || '', media_url: urlMidia || '',
              status: wamid ? 'sent' : 'failed',
              sender_name: uRe.nome || uRe.login,
              origem: 'atendente'
            });
            waDb.conversations.update(convId, {
              last_message_text: String(conteudo || '').slice(0, 200),
              last_message_type: tipo,
              last_message_at: new Date().toISOString()
            });
            notifySSEClients({
              type: 'new_message', conversation_id: convId,
              message: {
                id: msgId, cliente_id: body.cliente_id || '', wamid: wamid || '',
                direction: 'outgoing', type: tipo, content: conteudo || '',
                media_url: urlMidia || '', status: wamid ? 'sent' : 'failed',
                sender_name: uRe.nome || uRe.login, origem: 'atendente',
                created_at: new Date().toISOString()
              }
            });
          } catch (e) { console.error('[Prontas] não gravei na conversa:', e.message); }
        };
        var auditar = function (resultado) {
          waDb.audit.log({
            user_login: uRe.login, user_name: uRe.nome,
            action: 'Enviou mensagem pronta',
            details: '"' + String(resp.titulo || '').slice(0, 40) + '" para ' + (conv.contact_phone || '') + ' · ' + resultado,
            ip: waIpDaReq(req), account_id: conv.account_id, conversation_id: convId
          });
        };

        // LEMBRETES: agenda para este contato o que a mensagem pronta pede.
        // Fica ANTES do envio de propósito: se a Meta recusar, o agendamento
        // é cancelado logo abaixo — o contrário (agendar depois) perderia o
        // lembrete quando o atendente fecha a tela na hora do envio.
        var agendamento = null;
        if (waLembretes) {
          try {
            agendamento = waLembretes.agendar({
              resposta: resp, conversa: conv, usuario: uRe.login,
              horario: body.lembrete_horario || '', data: body.lembrete_data
            });
          } catch (e) { console.error('[Lembretes] não agendei:', e.message); }
        }

        var temAnexo = !!resp.arquivo;
        var enviar = temAnexo
          ? _waEnviarMidiaPronta(conta, token, conv.contact_phone, resp, texto)
          : waApi.sendTextMessage(conta.phone_number_id, conv.contact_phone, texto, token);

        // Se o envio falhar, o lembrete agendado nao faz sentido: a pessoa
        // nunca recebeu o convite.
        var desfazerAgendamento = function () {
          if (!agendamento || !agendamento.evento_chave) return;
          try {
            (waDb.lembretes.doEvento(agendamento.evento_chave) || []).forEach(function (x) {
              if (x.contact_id === conv.contact_id && x.status === 'agendado') {
                waDb.lembretes.cancelarUm(x.id, 'envio falhou');
              }
            });
          } catch (e) {}
        };

        enviar.then(function (r) {
          var tipo = temAnexo ? waApi.tipoMetaDoAnexo(resp.tipoAnexo) : 'text';
          registrar(tipo, texto, r && r.ok ? r.wamid : null,
            temAnexo ? '/api/whatsapp/respostas/midia/' + encodeURIComponent(resp.arquivo) : '');
          pausarBot();
          auditar(r && r.ok ? 'enviada' : 'FALHOU: ' + ((r && r.error) || 'erro'));
          if (r && r.ok) {
            responderJson(res, 200, {
              ok: true, wamid: r.wamid, texto: texto, cliente_id: body.cliente_id || '',
              lembretes: agendamento ? {
                evento_chave: agendamento.evento_chave, evento_horario: agendamento.evento_horario,
                agendados: agendamento.agendados,
                horarios: agendamento.lembretes.map(function (x) { return x.horario_envio; })
              } : null
            });
          } else {
            desfazerAgendamento();
            responderJson(res, 200, { ok: false, error: (r && r.error) || 'Falha no envio.' });
          }
        }).catch(function (e) {
          auditar('FALHOU: ' + e.message);
          desfazerAgendamento();
          responderJson(res, 200, { ok: false, error: e.message });
        });
      });
      return;
    }

    // Subir anexo de uma mensagem pronta (imagem ou PDF)
    if (urlPath === '/api/whatsapp/respostas/midia' && req.method === 'POST') {
      var uRm = waUsuarioTemPermissao(req, 'editar');
      if (!uRm) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false, error: 'corpo inválido' }); return; }
        var m = /^data:([^;]+);base64,([\s\S]*)$/.exec((body && body.dataUrl) || '');
        if (!m) { responderJson(res, 400, { ok: false, error: 'arquivo inválido' }); return; }
        var buf;
        try { buf = Buffer.from(m[2], 'base64'); }
        catch (e) { responderJson(res, 400, { ok: false, error: 'base64 inválido' }); return; }
        if (!buf.length) { responderJson(res, 400, { ok: false, error: 'arquivo vazio' }); return; }
        // Tipo pelo CONTEÚDO, como em todo upload do sistema.
        var t = detectarTipoReal(buf);
        var aceitos = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf' };
        if (!aceitos[t]) {
          responderJson(res, 400, { ok: false, error: 'Aceito aqui: imagem (PNG, JPEG, WEBP) ou PDF. Enviado: ' + t + '.' });
          return;
        }
        var limite = t === 'pdf' ? 20 * 1024 * 1024 : 5 * 1024 * 1024;
        if (buf.length > limite) {
          responderJson(res, 413, { ok: false, error: 'Arquivo acima de ' + Math.round(limite / 1048576) + ' MB.' });
          return;
        }
        var nome = 'pronta_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + EXT_DO_TIPO[t];
        try {
          fs.writeFileSync(path.join(BOT_MIDIA_DIR, nome), buf);
          waDb.audit.log({
            user_login: uRm.login, user_name: uRm.nome, action: 'Subiu anexo de mensagem pronta',
            details: t + ' · ' + Math.round(buf.length / 1024) + ' KB', ip: waIpDaReq(req)
          });
          responderJson(res, 200, {
            ok: true, arquivo: nome, tipo: t, mime: aceitos[t],
            tipoAnexo: t === 'pdf' ? 'documento' : 'imagem', tamanho: buf.length
          });
        } catch (e) {
          console.error('[Prontas] falha ao gravar o anexo:', e.message);
          responderJson(res, 500, { ok: false, error: 'Falha ao gravar o arquivo.' });
        }
      });
      return;
    }

    // Servir o anexo — só com sessão e permissão (a pasta é fora de /uploads/)
    var mRespArq = urlPath.match(/^\/api\/whatsapp\/respostas\/midia\/([^\/]+)$/);
    if (mRespArq && req.method === 'GET') {
      var uRa = waUsuarioTemPermissao(req, 'visualizar');
      if (!uRa) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      var nomeRa = decodeSeguro(mRespArq[1]);
      if (nomeRa === null) { responderJson(res, 400, { ok: false, error: 'nome inválido' }); return; }
      // Só os arquivos DAS MENSAGENS PRONTAS. A pasta é a mesma da mídia do
      // bot (que tem portão próprio, a tela 'bot'), e esta rota não serve de
      // atalho para ler aquela — todo anexo subido aqui nasce com "pronta_".
      if (!/^pronta_/.test(path.basename(nomeRa))) {
        responderJson(res, 404, { ok: false, error: 'não encontrado' }); return;
      }
      var alvoRa = path.join(BOT_MIDIA_DIR, path.basename(nomeRa));
      if (!path.resolve(alvoRa).startsWith(path.resolve(BOT_MIDIA_DIR) + path.sep)) {
        responderJson(res, 400, { ok: false, error: 'caminho inválido' }); return;
      }
      fs.readFile(alvoRa, function (e, dados) {
        if (e) { responderJson(res, 404, { ok: false, error: 'não encontrado' }); return; }
        var t = detectarTipoReal(dados);
        var ct = TIPOS_IMAGEM_SEGURA[t] || (t === 'pdf' ? 'application/pdf' : 'application/octet-stream');
        res.writeHead(200, Object.assign({}, SECURITY_HEADERS, {
          'Content-Type': ct, 'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, max-age=3600'
        }));
        res.end(dados);
      });
      return;
    }

    // Painel + situação do bot
    if (urlPath === '/api/whatsapp/bot/painel' && req.method === 'GET') {
      var uBp = waUsuarioTemPermissao(req, 'visualizar');
      if (!uBp) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      if (!waBot) { responderJson(res, 200, { ok: true, disponivel: false }); return; }
      // atendidos: quantos contatos estão marcados como "já receberam o
      // funil". É o número que a aba Bot mostra ao lado do modo "só na
      // primeira vez" — e o que o botão de liberar zera.
      var _atendidos = 0, _foraExp = 0;
      try { _atendidos = waDb.bot.quantosAtendidos(); } catch (e) {}
      try { _foraExp = waDb.bot.quantosForaExp(); } catch (e) {}
      responderJson(res, 200, {
        ok: true, disponivel: true,
        painel: waDb.bot.painel(),
        config: waBot.configAtual(),
        atendidos: _atendidos,
        fora_exp_marcados: _foraExp,
        ultimos: waDb.bot.ultimosLogs(40)
      });
      return;
    }

    // LIBERAR CONTATOS PARA RECEBER O FUNIL DE NOVO.
    // Apaga só a marcação de "já atendido" (e a contagem do dia, que é da
    // mesma regra). NÃO mexe em quem pediu para sair, em quem está pausado à
    // mão, nem em quem está na fila do atendente.
    //   { contact_id: 123 }  -> libera só aquela pessoa (botão na conversa)
    //   { todos: true }      -> libera todas (botão da aba Bot)
    // O "todos" é EXPLÍCITO de propósito: um pedido mal formado não pode
    // limpar a marcação de toda a base sem querer.
    if (urlPath === '/api/whatsapp/bot/liberar-funil' && req.method === 'POST') {
      var uLf = waUsuarioTemPermissao(req, 'editar');
      if (!uLf) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false, error: 'corpo inválido' }); return; }
        var idLf = Number((body && body.contact_id) || 0);
        var todosLf = !!(body && body.todos);
        if (!idLf && !todosLf) {
          responderJson(res, 400, { ok: false, error: 'Diga contact_id (uma pessoa) ou todos:true.' });
          return;
        }
        var liberados = 0;
        try {
          liberados = waDb.bot.liberarFunil(idLf || null);
        } catch (e) {
          console.error('[Bot] falha ao liberar o funil:', e.message);
          responderJson(res, 500, { ok: false, error: 'Falha ao liberar: ' + e.message });
          return;
        }
        var quemLf = 'todos os contatos';
        if (idLf) {
          var cLf = null;
          try { cLf = waDb.contacts.getById ? waDb.contacts.getById(idLf) : null; } catch (e) {}
          quemLf = 'o contato ' + (cLf ? ((cLf.name || cLf.phone) + ' (' + idLf + ')') : idLf);
        }
        try {
          waDb.audit.log({
            user_login: uLf.login, user_name: uLf.nome,
            action: 'Liberou contato(s) para receber o funil de novo',
            details: quemLf + ' · ' + liberados + ' contato(s) estavam marcados',
            ip: waIpDaReq(req)
          });
        } catch (e) {}
        try { waDb.bot.registrar('liberado', idLf || 0, '', 'liberado por ' + uLf.login + ' (' + liberados + ')'); } catch (e) {}
        responderJson(res, 200, { ok: true, liberados: liberados, todos: todosLf && !idLf });
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

    // ── INTERRUPTOR DO MODO FORA DO EXPEDIENTE ───────────────────────────
    // Rota propria (em vez de gravar pelo /api/state) por tres motivos: a
    // Auditoria registra QUEM ligou e QUANDO, o periodo e marcado aqui (e o
    // que impede repetir o funil para a mesma pessoa) e o horario de
    // desligar automatico fica guardado em formato que o servidor entende.
    if (urlPath === '/api/whatsapp/bot/fora-expediente' && req.method === 'POST') {
      var uFe = waUsuarioTemPermissao(req, 'editar');
      if (!uFe) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false, error: 'corpo inválido' }); return; }
        var ligar = !!(body && body.ligar);
        var cfgAtual = {};
        try { cfgAtual = (lerEstado().dados || {}).botWhatsapp || {}; } catch (e) { cfgAtual = {}; }
        var fe = Object.assign({}, cfgAtual.foraExpediente || {});
        if (ligar && !(Array.isArray(fe.passos) && fe.passos.length)) {
          responderJson(res, 200, {
            ok: false,
            error: 'Escreva a sequência do fora do expediente antes de ligar.'
          });
          return;
        }
        if (ligar) {
          fe.ligado = true;
          fe.ligadoEm = new Date().toISOString();
          fe.ligadoPor = uFe.nome || uFe.login;
          // O PERÍODO é o que faz cada contato receber o funil uma vez só
          // enquanto o modo estiver ligado.
          fe.periodo = String(Date.now());
          fe.desligarEm = body.desligarEm ? String(body.desligarEm) : '';
        } else {
          fe.ligado = false;
          fe.desligarEm = '';
          fe.desligadoEm = new Date().toISOString();
          fe.desligadoPor = uFe.nome || uFe.login;
        }
        try {
          var nova = _waSalvarConfigBot({ foraExpediente: fe },
            ligar ? 'LIGOU o modo fora do expediente' : 'DESLIGOU o modo fora do expediente', uFe);
          if (_waReady && waDb && waDb.bot && waDb.bot.registrar) {
            waDb.bot.registrar('fora_expediente', null, '',
              (ligar ? 'LIGADO' : 'DESLIGADO') + ' por ' + (uFe.nome || uFe.login) +
              (ligar && fe.desligarEm ? ' · desliga sozinho em ' + fe.desligarEm : ''));
          }
          responderJson(res, 200, { ok: true, foraExpediente: (nova && nova.foraExpediente) || fe });
        } catch (e) {
          responderJson(res, 500, { ok: false, error: e.message });
        }
      });
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
      // Vai junto se o INTERRUPTOR GERAL está ligado: o cabeçalho da conversa
      // precisa dizer "bot desligado" quando é esse o motivo, em vez de
      // mostrar "bot ativo" para um bot que não vai responder nada.
      var cfgBs = {};
      try { cfgBs = (lerEstado().dados || {}).botWhatsapp || {}; } catch (e) { cfgBs = {}; }
      responderJson(res, 200, {
        ok: true, disponivel: true,
        contato: waDb.bot.contato(Number(sitId)),
        config: { ligado: cfgBs.ligado === true }
      });
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

    // ÁUDIO GRAVADO NA TELA. Caminho separado do upload de arquivo de
    // propósito: aqui o que chega é WEBM/Opus (o que o navegador grava) e
    // PRECISA passar pelo ffmpeg para virar OGG/Opus, senão a Meta não mostra
    // como mensagem de voz. O upload de arquivo continua existindo,
    // inalterado, na rota acima.
    if (urlPath === '/api/whatsapp/bot/audio-gravado' && req.method === 'POST') {
      var uAg = waUsuarioTemPermissao(req, 'editar');
      if (!uAg) { responderJson(res, 403, { ok: false, error: 'Sem permissão.' }); return; }
      if (!waAudio) {
        responderJson(res, 503, {
          ok: false, motivo: 'sem_ffmpeg',
          error: 'A gravação não pôde ser convertida: o conversor de áudio não está disponível no servidor. ' +
                 'Envie o áudio como arquivo OGG/Opus, que continua funcionando.'
        });
        return;
      }
      lerCorpo(req, function (err, body) {
        if (err) { responderJson(res, 400, { ok: false, error: 'corpo inválido' }); return; }
        var mAg = /^data:([^;,]*)[^,]*,([\s\S]*)$/.exec((body && body.dataUrl) || '');
        if (!mAg) { responderJson(res, 400, { ok: false, error: 'gravação inválida' }); return; }
        var bufAg;
        try { bufAg = Buffer.from(mAg[2], 'base64'); }
        catch (e) { responderJson(res, 400, { ok: false, error: 'base64 inválido' }); return; }
        if (!bufAg.length) { responderJson(res, 400, { ok: false, error: 'gravação vazia' }); return; }
        if (bufAg.length > waAudio.LIMITE_ENTRADA) {
          responderJson(res, 413, {
            ok: false, motivo: 'grande',
            error: 'A gravação passou de ' + Math.round(waAudio.LIMITE_ENTRADA / 1048576) + ' MB.'
          });
          return;
        }
        // A conversão roda FORA do caminho da resposta (o módulo tem fila de
        // no máximo 2 processos): o event loop não fica preso aqui.
        waAudio.converter(bufAg).then(function (r) {
          if (!r || !r.ok) {
            var status = r && r.motivo === 'sem_ffmpeg' ? 503
                       : (r && r.motivo === 'ocupado' ? 429
                       : (r && r.motivo === 'grande' ? 413 : 400));
            responderJson(res, status, {
              ok: false, motivo: (r && r.motivo) || 'falhou',
              error: (r && r.erro) || 'Não consegui converter a gravação.'
            });
            return;
          }
          // Conferência final pelo CONTEÚDO: o que vai para o disco tem que
          // ser OGG de verdade, não a palavra do ffmpeg.
          var tipoSaida = detectarTipoReal(r.buffer);
          if (tipoSaida !== 'ogg') {
            responderJson(res, 500, { ok: false, error: 'A conversão saiu num formato inesperado (' + tipoSaida + ').' });
            return;
          }
          var nomeAg = 'bot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.ogg';
          try {
            fs.writeFileSync(path.join(BOT_MIDIA_DIR, nomeAg), r.buffer);
          } catch (e) {
            console.error('[Áudio] falha ao gravar:', e.message);
            responderJson(res, 500, { ok: false, error: 'Falha ao gravar o arquivo.' });
            return;
          }
          try {
            waDb.audit.log({
              user_login: uAg.login, user_name: uAg.nome, action: 'Gravou áudio pela tela',
              details: String(body.destino || 'bot') + ' · ' + Math.round(bufAg.length / 1024) + ' KB gravados · ' +
                       Math.round(r.buffer.length / 1024) + ' KB em OGG/Opus',
              ip: waIpDaReq(req)
            });
          } catch (e) {}
          responderJson(res, 200, {
            ok: true, arquivo: nomeAg, tipo: 'ogg', mime: 'audio/ogg',
            tipoAnexo: 'audio', tamanho: r.buffer.length, gravado: true
          });
        }).catch(function (e) {
          responderJson(res, 500, { ok: false, error: 'Falha na conversão: ' + e.message });
        });
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
      if (qp.bot_only === 'true') filters.bot_only = true;      // filtro "Bot" da lista
      if (qp.fora_exp_only === 'true') filters.fora_exp_only = true;   // filtro "Fora do expediente"
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
      // ATUALIZAÇÃO INCREMENTAL (tela estável):
      //   ?since=<id>  -> só as mensagens novas depois dessa (a tela não
      //                   redesenha nada do que já está na conversa)
      //   ?antes=<id>  -> as anteriores a essa (rolagem para cima)
      // Sem nenhum dos dois, é a abertura normal da conversa.
      var msgs, totalMsgs = 0, parcial = false;
      if (qp.since !== undefined && qp.since !== '') {
        msgs = waDb.messages.listNovas(convId, parseInt(qp.since) || 0, parseInt(qp.limit) || 200);
        parcial = true;
      } else if (qp.antes !== undefined && qp.antes !== '') {
        msgs = waDb.messages.listAntigas(convId, parseInt(qp.antes) || 0, parseInt(qp.limit) || 50);
        parcial = true;
      } else {
        msgs = waDb.messages.listByConversation(convId, parseInt(qp.limit) || 50, parseInt(qp.offset) || 0);
        totalMsgs = waDb.messages.countByConversation(convId);
      }
      // Marca como lido ao abrir. Numa atualização incremental NÃO: a pessoa
      // pode estar lendo outra conversa, e zerar o contador aqui fazia a
      // marca de não-lida piscar e desaparecer sozinha.
      if (!parcial) waDb.conversations.resetUnread(convId);
      responderJson(res, 200, {
        ok: true, conversation: conv, messages: msgs,
        total_messages: totalMsgs, parcial: parcial
      });
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
            origem: body.is_internal_note ? '' : 'atendente',
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
          // cliente_id VOLTA JUNTO: e a amarra que faz a tela trocar a bolha
          // otimista pela real, em vez de desenhar a mesma mensagem duas vezes.
          notifySSEClients({ type: 'new_message', conversation_id: convId, message: { id: msgId, cliente_id: body.cliente_id || '', wamid: result.wamid || '', direction: 'outgoing', type: body.type || 'text', content: body.content || body.caption || '', status: result.ok ? 'sent' : 'failed', sender_name: u.nome || u.login, origem: body.is_internal_note ? '' : 'atendente', created_at: new Date().toISOString() } });
          // LEMBRETES: a tela diz de qual mensagem pronta veio o texto que
          // esta sendo enviado (o atendente clicou nela, ajustou e mandou pelo
          // aviao). Sem isso, so o envio direto agendaria lembrete.
          var lembretesDoEnvio = null;
          if (result.ok && waLembretes && body.resposta_id) {
            try {
              var respEnv = _waProntaPorId(String(body.resposta_id));
              if (respEnv) {
                var agEnv = waLembretes.agendar({
                  resposta: respEnv, conversa: conv, usuario: u.login,
                  horario: body.lembrete_horario || '', data: body.lembrete_data
                });
                if (agEnv) {
                  lembretesDoEnvio = {
                    evento_chave: agEnv.evento_chave, evento_horario: agEnv.evento_horario,
                    agendados: agEnv.agendados,
                    horarios: agEnv.lembretes.map(function (x) { return x.horario_envio; })
                  };
                }
              }
            } catch (e) { console.error('[Lembretes] nao agendei no envio normal:', e.message); }
          }
          if (result.ok) { responderJson(res, 200, { ok: true, message_id: msgId, wamid: result.wamid, cliente_id: body.cliente_id || '', lembretes: lembretesDoEnvio }); }
          else { responderJson(res, 200, { ok: false, error: result.error, error_code: result.error_code, message_id: msgId, cliente_id: body.cliente_id || '' }); }
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
  if ((rel === '/js/app.js' || rel === '/js/data.js' || rel === '/js/whatsapp.js' ||
       rel === '/js/telas.js' || rel === '/js/whatsapp-bot-ui.js' ||
       rel === '/js/whatsapp-respostas-ui.js' || rel === '/js/whatsapp-lembretes-ui.js' ||
       rel === '/js/whatsapp-janela-ui.js') && !autenticado) {
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
  // AS TAREFAS DE SUBIDA SAO SINCRONAS E PESADAS (carga inicial, migracao,
  // resumo). Rodando aqui, direto, elas travam o event loop logo depois do
  // listen: a porta esta aberta mas nada responde, e o healthcheck do Coolify
  // (5s) falha justamente na subida. Com setImmediate, a primeira resposta
  // sai antes delas. O tempo de cada uma vai para o log, para dar para ver
  // no Coolify qual esta pesada.
  const _fase = function (nome, fn) {
    const t0 = Date.now();
    try { fn(); } catch (e) { console.error('[Subida] ' + nome + ' falhou:', e.message); }
    const ms = Date.now() - t0;
    if (ms > 200) console.log('[Subida] ' + nome + ': ' + ms + ' ms');
  };
  setImmediate(function () {
    _fase('garantirAdminServidor', garantirAdminServidor);
    _fase('garantirCadastrosFinanceiro', garantirCadastrosFinanceiro);
    _fase('rotacaoDeSenhas', rotacaoDeSenhasNoBoot);
    // O resumo entra na MESMA fila do garantirAdminServidor (comTrava), então
    // só roda depois que a carga inicial terminou — senão mostraria zero em tudo.
    comTrava(function () {
      _fase('resumoDosDados', resumoDosDados);
      console.log('[Subida] pronto em ' + Math.round((Date.now() - _SUBIU_EM) / 100) / 10 + 's');
    });
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
  let arquivos = 0;
  try { arquivos = fs.readdirSync(UPLOADS_DIR).length; } catch (e) {}

  console.log('');
  console.log('=== DADOS ENCONTRADOS EM ' + DATA_DIR + ' ===');
  console.log('  versão do estado ..... ' + (st.version || 0));
  console.log('  Candidatos ........... ' + conta('candidatos'));
  console.log('  Vagas ................ ' + conta('vagas'));
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
  if ((st.version || 0) > 1 && conta('candidatos') === 0 && conta('funcionarios') <= 1) {
    console.warn('');
    console.warn('  *** ATENÇÃO: o sistema já foi usado antes (versão ' + st.version + '), mas está SEM registros.');
    console.warn('  *** Isso costuma significar que o volume persistente NÃO está montado em ' + DATA_DIR + '.');
    console.warn('  *** NÃO cadastre nada por cima. Confira o volume no Coolify e restaure o backup');
    console.warn('  *** mais recente de ' + BACKUP_DIR + '.');
  }
  console.log('');
}
