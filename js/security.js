// ==========================================================================
// MÓDULO DE SEGURANÇA — R&T EMPREGOS
// Versão 1.0 — Implementado em 2026
// ==========================================================================
// Este módulo adiciona camadas de proteção ao sistema sem alterar
// nenhuma funcionalidade ou lógica de negócio existente.
// ==========================================================================

'use strict';

// --------------------------------------------------------------------------
// 1. SANITIZAÇÃO XSS — escapeHTML
// --------------------------------------------------------------------------
// Escapa caracteres HTML especiais antes de inserir dados no DOM.
// USAR em qualquer campo de dados de usuário/candidato antes de innerHTML.
// --------------------------------------------------------------------------

/**
 * Escapa caracteres HTML especiais para prevenir XSS.
 * @param {any} value - Valor a ser escapado
 * @returns {string} String segura para inserção no DOM
 */
function escapeHTML(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Escapa apenas os caracteres que criam tags ou atributos HTML maliciosos.
  // Não escapa '/' pois não é necessário e quebra datas (21/05/2026) e IDs.
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/`/g, '&#x60;');
}

// --------------------------------------------------------------------------
// 2. HASH DE SENHA — SHA-256 via SubtleCrypto (API nativa do browser)
// --------------------------------------------------------------------------
// Sem dependências externas. Usa a API WebCrypto nativa.
// --------------------------------------------------------------------------

/**
 * Gera hash SHA-256 de uma senha em texto puro.
 * @param {string} senha - Senha em texto puro
 * @returns {Promise<string>} Hash hexadecimal (64 chars)
 */
async function hashSenha(senha) {
  const encoder = new TextEncoder();
  const data = encoder.encode(String(senha));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifica se uma senha corresponde a um hash armazenado.
 * @param {string} senhaDigitada - Senha digitada pelo usuário
 * @param {string} hashArmazenado - Hash SHA-256 armazenado
 * @returns {Promise<boolean>}
 */
async function verificarSenha(senhaDigitada, hashArmazenado) {
  // Compatibilidade: se o hash armazenado não tem 64 chars é texto puro (legado)
  if (!hashArmazenado || hashArmazenado.length !== 64) {
    return String(senhaDigitada) === String(hashArmazenado);
  }
  const hashDigitado = await hashSenha(senhaDigitada);
  return hashDigitado === hashArmazenado;
}

/**
 * Verifica se uma string já é um hash SHA-256 (64 chars hexadecimais).
 * @param {string} str
 * @returns {boolean}
 */
function ehHash(str) {
  return typeof str === 'string' && str.length === 64 && /^[0-9a-f]+$/.test(str);
}

// --------------------------------------------------------------------------
// 3. PROTEÇÃO CONTRA BRUTE FORCE — Bloqueio de login
// --------------------------------------------------------------------------
// Armazena contagem de tentativas no sessionStorage (não persiste entre abas).
// Bloqueia por 30s após 5 tentativas falhas.
// --------------------------------------------------------------------------

// Bloqueio por LOGIN (não global): 3 tentativas -> 30s -> +3 -> 30s -> +3 -> bloqueio administrativo
const _BRUTE_KEY = 'rt_login_attempts';
const _MAX_TENTATIVAS_CICLO = 3;   // tentativas por ciclo
const _MAX_CICLOS = 3;             // após o 3º ciclo, bloqueio permanente
const _BLOQUEIO_MS = 30 * 1000;    // 30 segundos entre ciclos

function _bruteAll() {
  try { return JSON.parse(localStorage.getItem(_BRUTE_KEY)) || {}; } catch { return {}; }
}
function _bruteSave(all) {
  try { localStorage.setItem(_BRUTE_KEY, JSON.stringify(all)); } catch (e) {}
}
function _bruteKey(login) {
  return String(login || '').trim().toLowerCase() || '_anon';
}
function _bruteGet(login) {
  const all = _bruteAll();
  return all[_bruteKey(login)] || { ciclo: 1, tentativas: 0, bloqueadoAte: 0, permanente: false };
}
function _brutePut(login, st) {
  const all = _bruteAll();
  all[_bruteKey(login)] = st;
  _bruteSave(all);
}

/**
 * Verifica o bloqueio do login informado. Recalcula o tempo a partir do
 * timestamp salvo (sobrevive a refresh, nunca negativo). Ao expirar o
 * bloqueio de 30s, libera automaticamente o próximo ciclo.
 * @param {string} login
 * @returns {{ bloqueado:boolean, permanente:boolean, segundosRestantes:number, ciclo:number, tentativasRestantes:number }}
 */
function verificarBloqueio(login) {
  const st = _bruteGet(login);
  if (st.permanente) {
    return { bloqueado: true, permanente: true, segundosRestantes: 0, ciclo: st.ciclo, tentativasRestantes: 0 };
  }
  const agora = Date.now();
  if (st.bloqueadoAte && agora < st.bloqueadoAte) {
    return { bloqueado: true, permanente: false, segundosRestantes: Math.ceil((st.bloqueadoAte - agora) / 1000), ciclo: st.ciclo, tentativasRestantes: 0 };
  }
  if (st.bloqueadoAte && agora >= st.bloqueadoAte) {
    // Bloqueio de 30s terminou -> libera o próximo ciclo
    st.bloqueadoAte = 0;
    st.ciclo = Math.min((st.ciclo || 1) + 1, _MAX_CICLOS);
    st.tentativas = 0;
    _brutePut(login, st);
  }
  return { bloqueado: false, permanente: false, segundosRestantes: 0, ciclo: st.ciclo, tentativasRestantes: Math.max(0, _MAX_TENTATIVAS_CICLO - st.tentativas) };
}

/**
 * Registra uma tentativa falha para o login e devolve o novo estado.
 * @param {string} login
 */
function registrarTentativaFalha(login) {
  const st = _bruteGet(login);
  if (st.permanente) return { bloqueado: true, permanente: true, segundosRestantes: 0, ciclo: st.ciclo, tentativasRestantes: 0 };
  st.tentativas = (st.tentativas || 0) + 1;
  if (st.tentativas >= _MAX_TENTATIVAS_CICLO) {
    if ((st.ciclo || 1) >= _MAX_CICLOS) { st.permanente = true; st.bloqueadoAte = 0; }
    else { st.bloqueadoAte = Date.now() + _BLOQUEIO_MS; }
  }
  _brutePut(login, st);
  const agora = Date.now();
  return {
    bloqueado: st.permanente || st.bloqueadoAte > agora,
    permanente: !!st.permanente,
    segundosRestantes: st.bloqueadoAte > agora ? Math.ceil((st.bloqueadoAte - agora) / 1000) : 0,
    ciclo: st.ciclo,
    tentativasRestantes: Math.max(0, _MAX_TENTATIVAS_CICLO - st.tentativas)
  };
}

/**
 * Limpa o estado de tentativas. Sem login: limpa tudo (compat).
 * @param {string} [login]
 */
function resetarTentativasLogin(login) {
  if (login === undefined) { try { localStorage.removeItem(_BRUTE_KEY); } catch (e) {} return; }
  const all = _bruteAll();
  delete all[_bruteKey(login)];
  _bruteSave(all);
}

// --------------------------------------------------------------------------
// 4. EXPIRAÇÃO DE SESSÃO — Timeout automático após 8h de inatividade
// --------------------------------------------------------------------------

const _SESSAO_KEY = 'rt_logged_user';
const _SESSAO_EXPIRACAO_MS = 8 * 60 * 60 * 1000; // 8 horas

/**
 * Salva a sessão do usuário com timestamp de expiração.
 * @param {object} user - Objeto do usuário autenticado
 */
function criarSessaoComExpiracao(user) {
  const sessao = {
    ...user,
    _loginTimestamp: Date.now(),
    _expiraEm: Date.now() + _SESSAO_EXPIRACAO_MS
  };
  localStorage.setItem(_SESSAO_KEY, JSON.stringify(sessao));
}

/**
 * Verifica se a sessão ainda é válida. Remove automaticamente se expirada.
 * @returns {object|null} Objeto do usuário ou null se sessão inválida/expirada
 */
function verificarSessaoValida() {
  try {
    const raw = localStorage.getItem(_SESSAO_KEY);
    if (!raw) return null;
    const sessao = JSON.parse(raw);

    // Sessão sem timestamp é legada — considera válida mas atualiza o timestamp
    if (!sessao._expiraEm) {
      criarSessaoComExpiracao(sessao);
      return sessao;
    }

    // Sessão expirada
    if (Date.now() > sessao._expiraEm) {
      localStorage.removeItem(_SESSAO_KEY);
      return null;
    }

    return sessao;
  } catch {
    localStorage.removeItem(_SESSAO_KEY);
    return null;
  }
}

// --------------------------------------------------------------------------
// 5. VALIDAÇÃO DE FORÇA DE SENHA
// --------------------------------------------------------------------------

/**
 * Valida se uma senha atende os requisitos mínimos de segurança.
 * Mínimo: 6 caracteres, pelo menos 1 letra e 1 número.
 * @param {string} senha
 * @returns {{ valida: boolean, mensagem: string }}
 */
function validarSenhaForca(senha) {
  if (!senha || senha.length < 6) {
    return { valida: false, mensagem: 'A senha deve ter pelo menos 6 caracteres.' };
  }
  if (!/[a-zA-Z]/.test(senha)) {
    return { valida: false, mensagem: 'A senha deve conter pelo menos uma letra.' };
  }
  if (!/[0-9]/.test(senha)) {
    return { valida: false, mensagem: 'A senha deve conter pelo menos um número.' };
  }
  return { valida: true, mensagem: '' };
}

// --------------------------------------------------------------------------
// 6. VALIDAÇÃO DE CPF
// --------------------------------------------------------------------------

/**
 * Valida um CPF usando o algoritmo de módulo 11.
 * @param {string} cpf - CPF em qualquer formato (com ou sem pontos/traço)
 * @returns {boolean}
 */
function validarCPF(cpf) {
  if (!cpf) return false;
  const nums = cpf.replace(/\D/g, '');
  if (nums.length !== 11) return false;
  // Rejeita CPFs com todos os dígitos iguais (ex: 111.111.111-11)
  if (/^(\d)\1{10}$/.test(nums)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(nums[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(nums[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(nums[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === parseInt(nums[10]);
}

// --------------------------------------------------------------------------
// 7. MIGRAÇÃO DE SENHAS — Converte texto puro para SHA-256
// --------------------------------------------------------------------------

/**
 * Verifica e migra senhas em texto puro para SHA-256 no objeto state.
 * Chamado na inicialização do sistema.
 * @param {object} state - Estado atual do sistema
 * @returns {Promise<boolean>} true se alguma senha foi migrada
 */
async function migrarSenhasParaHash(state) {
  if (!state || !state.funcionarios) return false;
  let alterado = false;
  for (const func of state.funcionarios) {
    if (func.senha && !ehHash(func.senha)) {
      func.senha = await hashSenha(func.senha);
      alterado = true;
    }
  }
  return alterado;
}

// --------------------------------------------------------------------------
// 8. LIMITE DE AUTO-REGISTROS PENDENTES
// --------------------------------------------------------------------------

const _MAX_PENDENTES = 10;

/**
 * Verifica se o limite de usuários aguardando aprovação foi atingido.
 * Previne flood de registros maliciosos.
 * @param {object[]} funcionarios - Lista de funcionários do state
 * @returns {boolean} true se o limite foi atingido
 */
function limitePendentesAtingido(funcionarios) {
  if (!funcionarios) return false;
  const pendentes = funcionarios.filter(f => f.status === 'aguardando_aprovacao');
  return pendentes.length >= _MAX_PENDENTES;
}

// --------------------------------------------------------------------------
// 9. VALIDAÇÃO SEGURA DE UPLOAD DE ARQUIVO — Magic Bytes
// --------------------------------------------------------------------------
// Valida se o arquivo enviado é realmente do tipo declarado.
// Um arquivo .exe renomeado para .jpg não terá o cabeçalho correto.
// Esta verificação roda no browser ANTES de ler o conteúdo completo.
// --------------------------------------------------------------------------

/**
 * Magic bytes (assinaturas binárias) dos tipos permitidos.
 * Formato: { tipo, bytes (hex), offset (posição no arquivo) }
 */
const _MAGIC_BYTES = [
  // JPEG — FFD8FF
  { tipo: 'image/jpeg', hex: 'ffd8ff',   offset: 0 },
  // PNG — 89504E47 0D0A1A0A
  { tipo: 'image/png',  hex: '89504e47', offset: 0 },
  // WebP — RIFF????WEBP (bytes 0-3 = 52494646, bytes 8-11 = 57454250)
  { tipo: 'image/webp', hex: '52494646', offset: 0 },
  // PDF — 25504446 (%PDF)
  { tipo: 'application/pdf', hex: '25504446', offset: 0 },
];

/**
 * Lê os primeiros bytes de um arquivo como hexadecimal.
 * @param {File} file - Arquivo a ser verificado
 * @param {number} count - Quantidade de bytes a ler (padrão: 12)
 * @returns {Promise<string>} String hexadecimal em minúsculas
 */
function _lerMagicBytes(file, count = 12) {
  return new Promise((resolve, reject) => {
    const slice = file.slice(0, count);
    const reader = new FileReader();
    reader.onload = (e) => {
      const arr = new Uint8Array(e.target.result);
      const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
      resolve(hex);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(slice);
  });
}

/**
 * Valida se um arquivo é realmente do tipo que declara, usando magic bytes.
 * Protege contra arquivos maliciosos (.exe, .js, etc.) renomeados para .jpg ou .pdf.
 *
 * @param {File} file - Arquivo selecionado pelo usuário
 * @returns {Promise<{ valido: boolean, mensagem: string, tipoDetectado: string|null }>}
 */
async function validarArquivoSeguro(file) {
  // 1. Verifica extensão
  const extensoesPermitidas = ['jpg', 'jpeg', 'png', 'pdf', 'webp'];
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!extensoesPermitidas.includes(ext)) {
    return {
      valido: false,
      mensagem: `Tipo de arquivo não permitido. Aceitos: JPG, PNG, PDF, WEBP. Arquivo enviado: .${ext}`,
      tipoDetectado: null
    };
  }

  // 2. Verifica tamanho máximo (5MB para documentos, 2MB para selfies)
  const maxBytes = 10 * 1024 * 1024; // 10MB
  if (file.size > maxBytes) {
    return {
      valido: false,
      mensagem: `O arquivo é muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo: 10MB.`,
      tipoDetectado: null
    };
  }

  // 3. Verifica tamanho mínimo (arquivos suspeitosamente pequenos)
  if (file.size < 100) {
    return {
      valido: false,
      mensagem: 'O arquivo parece estar vazio ou corrompido.',
      tipoDetectado: null
    };
  }

  // 4. Lê magic bytes e verifica assinatura binária real do arquivo
  try {
    const hex = await _lerMagicBytes(file, 12);

    // Verifica se o cabeçalho corresponde a algum tipo permitido
    let tipoDetectado = null;
    for (const assinatura of _MAGIC_BYTES) {
      if (hex.startsWith(assinatura.hex)) {
        tipoDetectado = assinatura.tipo;
        break;
      }
    }

    // Verificação especial para WebP (tem estrutura RIFF????WEBP)
    if (!tipoDetectado && hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') {
      tipoDetectado = 'image/webp';
    }

    if (!tipoDetectado) {
      return {
        valido: false,
        mensagem: 'O arquivo não é uma imagem ou PDF válido. Por favor, envie um arquivo real (JPG, PNG, PDF ou WEBP).',
        tipoDetectado: null
      };
    }

    // 5. Consistência entre extensão declarada e tipo real detectado
    const extParaTipo = {
      'jpg':  'image/jpeg',
      'jpeg': 'image/jpeg',
      'png':  'image/png',
      'webp': 'image/webp',
      'pdf':  'application/pdf'
    };
    const tipoEsperado = extParaTipo[ext];
    if (tipoEsperado && tipoDetectado !== tipoEsperado) {
      return {
        valido: false,
        mensagem: `O conteúdo do arquivo não corresponde à extensão .${ext}. O arquivo pode estar corrompido ou ser malicioso.`,
        tipoDetectado
      };
    }

    return { valido: true, mensagem: '', tipoDetectado };

  } catch (err) {
    // Se não conseguir ler os bytes, rejeita por segurança
    return {
      valido: false,
      mensagem: 'Não foi possível verificar o arquivo. Tente novamente.',
      tipoDetectado: null
    };
  }
}
