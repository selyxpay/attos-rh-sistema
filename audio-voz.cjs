// ==========================================================================
// ÁUDIO GRAVADO NA HORA -> MENSAGEM DE VOZ (OGG/Opus)
// --------------------------------------------------------------------------
// O problema que este arquivo resolve: o navegador grava em WEBM/Opus (é o
// único formato que o Chrome e o Edge gravam), e a Meta só mostra o áudio como
// MENSAGEM DE VOZ se ele chegar em OGG/Opus. Sem conversão, a gravação feita
// na tela seria recusada no envio — exatamente o que a rota de upload avisa
// hoje ("a Meta exige OGG/Opus").
//
// Então aqui o áudio passa pelo ffmpeg e sai em OGG/Opus mono, 48 kHz.
//
// TRÊS CUIDADOS, todos por causa da VPS pequena:
//   1. NO MÁXIMO 2 CONVERSÕES AO MESMO TEMPO. ffmpeg come CPU; cinco pessoas
//      gravando junto derrubariam o resto do sistema. As outras esperam na
//      fila, e se a fila encher o pedido é recusado com aviso (melhor recusar
//      rápido que travar).
//   2. TETO DE TAMANHO E DE DURAÇÃO. O corte de 3 minutos também é feito aqui
//      (-t), não só na tela: o que chega pela rede nunca é de confiança.
//   3. TEMPO LIMITE. Processo que travou é morto, e a fila anda.
//
// SE O FFMPEG NÃO ESTIVER INSTALADO, nada quebra: `disponivel()` responde
// false, a rota avisa na tela e o envio por ARQUIVO continua funcionando
// igual. É a mesma regra dos outros módulos opcionais do sistema.
// ==========================================================================
'use strict';

const { spawn, spawnSync } = require('child_process');

// Dá para apontar outro binário (uma máquina de desenvolvimento sem ffmpeg no
// PATH, ou o dublê que a suíte de teste usa para provar a fila sem depender de
// ffmpeg instalado).
const BIN = process.env.FFMPEG_BIN || 'ffmpeg';

// COSTURA PARA O TESTE (e para máquina de desenvolvimento sem ffmpeg): quando
// FFMPEG_BIN aponta para um .js/.cjs, ele é rodado pelo próprio node. É assim
// que a suíte prova a fila de 2 processos, o tempo limite e o tratamento de
// falha sem depender de ter ffmpeg instalado na máquina de quem programa.
function _comando(args) {
  if (/\.c?js$/i.test(BIN)) return { cmd: process.execPath, args: [BIN].concat(args) };
  return { cmd: BIN, args: args };
}

const MAX_SIMULTANEOS = 2;
const MAX_NA_FILA     = 8;
const SEGUNDOS_MAX    = 190;                  // 3 min + folga para o corte
const LIMITE_ENTRADA  = 12 * 1024 * 1024;     // 12 MB de webm já é muito
const LIMITE_SAIDA    = 16 * 1024 * 1024;     // o mesmo teto do upload de áudio
const TEMPO_LIMITE_MS = 60000;

let _tem = null;          // lembrado depois da primeira conferência
let _rodando = 0;
const _fila = [];

// ffmpeg está instalado? Conferido UMA vez (spawnSync aqui é de propósito:
// roda na subida, antes de existir requisição, e custa poucos milissegundos).
function disponivel() {
  if (_tem !== null) return _tem;
  try {
    const c = _comando(['-version']);
    const r = spawnSync(c.cmd, c.args, { timeout: 8000, windowsHide: true });
    _tem = !r.error && r.status === 0;
  } catch (e) {
    _tem = false;
  }
  if (!_tem) {
    console.warn('[Áudio] ffmpeg não encontrado (' + BIN + '). A gravação pela tela fica indisponível; ' +
                 'o envio de arquivo OGG continua funcionando.');
  }
  return _tem;
}

// Para o /api/saude e para a tela saberem o que dizer à pessoa.
function situacao() {
  return { ffmpeg: disponivel(), bin: BIN, rodando: _rodando, na_fila: _fila.length };
}

function _rodarFila() {
  if (!_fila.length || _rodando >= MAX_SIMULTANEOS) return;
  const tarefa = _fila.shift();
  _rodando++;
  _converterAgora(tarefa.buf).then(tarefa.ok, tarefa.erro).then(function () {
    _rodando--;
    _rodarFila();
  });
}

function _converterAgora(buf) {
  return new Promise(function (resolve) {
    let proc;
    try {
      const cmd = _comando([
        '-hide_banner', '-loglevel', 'error',
        '-i', 'pipe:0',
        '-vn',                       // se vier vídeo embutido, ignora
        '-t', String(SEGUNDOS_MAX),  // o corte de duração também aqui
        '-ac', '1',                  // mono: é o que a Meta espera na voz
        '-ar', '48000',              // 48 kHz: idem
        '-c:a', 'libopus', '-b:a', '32k',
        '-f', 'ogg', 'pipe:1'
      ]);
      proc = spawn(cmd.cmd, cmd.args, { windowsHide: true });
    } catch (e) {
      resolve({ ok: false, erro: 'não consegui iniciar o ffmpeg: ' + e.message });
      return;
    }

    const pedacos = [];
    let tamanho = 0;
    let erroTxt = '';
    let terminou = false;
    const acabar = function (r) {
      if (terminou) return;
      terminou = true;
      clearTimeout(relogio);
      try { proc.kill('SIGKILL'); } catch (e) {}
      resolve(r);
    };

    const relogio = setTimeout(function () {
      acabar({ ok: false, erro: 'a conversão passou do tempo limite' });
    }, TEMPO_LIMITE_MS);

    proc.stdout.on('data', function (d) {
      tamanho += d.length;
      if (tamanho > LIMITE_SAIDA) { acabar({ ok: false, erro: 'áudio convertido ficou acima do limite' }); return; }
      pedacos.push(d);
    });
    proc.stderr.on('data', function (d) { erroTxt += String(d).slice(0, 400); });
    proc.on('error', function (e) { acabar({ ok: false, erro: 'ffmpeg falhou: ' + e.message }); });
    proc.on('close', function (codigo) {
      if (terminou) return;
      const saida = Buffer.concat(pedacos);
      if (codigo !== 0 || !saida.length) {
        acabar({ ok: false, erro: 'não consegui converter o áudio' + (erroTxt ? ' (' + erroTxt.trim().split('\n')[0] + ')' : '') });
        return;
      }
      acabar({ ok: true, buffer: saida });
    });

    // EPIPE acontece de verdade: entrada inválida faz o ffmpeg sair antes de
    // ler tudo. Sem este catch, o processo do servidor cairia.
    proc.stdin.on('error', function () { /* o 'close' decide o resultado */ });
    try { proc.stdin.end(buf); } catch (e) { /* idem */ }
  });
}

// Converte um áudio gravado no navegador para OGG/Opus.
// Devolve { ok:true, buffer } ou { ok:false, erro, motivo? }.
function converter(buf) {
  if (!Buffer.isBuffer(buf) || !buf.length) {
    return Promise.resolve({ ok: false, erro: 'áudio vazio' });
  }
  if (buf.length > LIMITE_ENTRADA) {
    return Promise.resolve({
      ok: false, motivo: 'grande',
      erro: 'A gravação passou de ' + Math.round(LIMITE_ENTRADA / 1048576) + ' MB.'
    });
  }
  if (!disponivel()) {
    return Promise.resolve({
      ok: false, motivo: 'sem_ffmpeg',
      erro: 'A gravação não pôde ser convertida: o conversor de áudio (ffmpeg) não está instalado no servidor. ' +
            'Envie o áudio como arquivo OGG/Opus, que continua funcionando.'
    });
  }
  if (_fila.length >= MAX_NA_FILA) {
    return Promise.resolve({
      ok: false, motivo: 'ocupado',
      erro: 'Muita gente convertendo áudio agora. Tente de novo em alguns segundos.'
    });
  }
  return new Promise(function (resolve) {
    _fila.push({ buf: buf, ok: resolve, erro: function (e) { resolve({ ok: false, erro: String((e && e.message) || e) }); } });
    _rodarFila();
  });
}

module.exports = {
  converter: converter,
  disponivel: disponivel,
  situacao: situacao,
  MAX_SIMULTANEOS: MAX_SIMULTANEOS,
  LIMITE_ENTRADA: LIMITE_ENTRADA,
  SEGUNDOS_MAX: SEGUNDOS_MAX
};
