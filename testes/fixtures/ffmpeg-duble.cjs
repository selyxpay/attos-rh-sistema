// DUBLÊ DE FFMPEG — só para os testes.
// Faz o que o ffmpeg faz do ponto de vista do audio-voz.cjs: lê o áudio pela
// entrada, escreve um OGG pela saída. Existe para a suíte provar a fila de 2
// processos, o tempo limite, a falha de conversão e o formato recusado SEM
// depender de ter ffmpeg instalado na máquina de quem programa.
//
// O comportamento é escolhido por variável de ambiente:
//   DUBLE_MODO=ok     (padrão)  devolve um OGG válido
//   DUBLE_MODO=falha            sai com erro, como ffmpeg faz com entrada ruim
//   DUBLE_MODO=lento            espera DUBLE_MS antes de responder
//   DUBLE_MODO=lixo             devolve bytes que NÃO são OGG
//   DUBLE_LOG=<arquivo>         anota início e fim de cada execução (prova a fila)
'use strict';
const fs = require('fs');

const modo = process.env.DUBLE_MODO || 'ok';
const espera = Number(process.env.DUBLE_MS || 400);
const log = process.env.DUBLE_LOG || '';

function anotar(oQue) {
  if (!log) return;
  try { fs.appendFileSync(log, oQue + ' ' + process.pid + ' ' + Date.now() + '\n'); } catch (e) {}
}

// `ffmpeg -version` (a conferência de "está instalado?")
if (process.argv.indexOf('-version') >= 0) {
  process.stdout.write('ffmpeg version 0.0-duble-de-teste\n');
  process.exit(0);
}

const pedacos = [];
process.stdin.on('data', function (d) { pedacos.push(d); });
process.stdin.on('error', function () { /* EPIPE quando saímos antes: normal */ });
process.stdin.on('end', function () {
  const entrada = Buffer.concat(pedacos);
  anotar('inicio');

  const responder = function () {
    if (modo === 'falha') {
      process.stderr.write('Invalid data found when processing input\n');
      anotar('fim');
      process.exit(1);
      return;
    }
    if (modo === 'lixo') {
      process.stdout.write(Buffer.from('ISTO NAO E UM OGG', 'latin1'));
      anotar('fim');
      process.exit(0);
      return;
    }
    // OGG de verdade começa com "OggS" — é por esse conteúdo que o servidor
    // confere o que saiu da conversão.
    const cabecalho = Buffer.from('OggS', 'latin1');
    const corpo = Buffer.alloc(Math.max(64, Math.min(4096, entrada.length)), 0x21);
    process.stdout.write(Buffer.concat([cabecalho, corpo]), function () {
      anotar('fim');
      process.exit(0);
    });
  };

  if (modo === 'lento') setTimeout(responder, espera);
  else responder();
});
