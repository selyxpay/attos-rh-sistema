// ==========================================================================
// GRAVADOR DE ÁUDIO — grava na hora, ouve antes de usar, e só então entra
// --------------------------------------------------------------------------
// Usado em três lugares (passos do bot, modo fora do expediente e mensagens
// prontas) com a MESMA tela, para não existirem três gravadores diferentes:
//
//   RTAudio.gravar({ destino: 'bot', aoUsar: function (res) { ... } })
//
// `res` = { arquivo, mime, tipoAnexo, tamanho, nomeArquivo } — o arquivo JÁ
// convertido em OGG/Opus pelo servidor.
//
// REGRA QUE MANDA NA TELA: nada é salvo enquanto a pessoa não clicar em "Usar
// este áudio". Antes disso a gravação vive só na memória desta aba — gravar,
// ouvir, regravar e desistir não deixa rastro nenhum no servidor.
//
// O botão de ANEXAR ARQUIVO continua existindo em todos os lugares: quem já
// tem um .ogg pronto não precisa gravar nada. As duas opções convivem.
// ==========================================================================
(function () {
  'use strict';

  const LIMITE_SEG = 180;              // 3 minutos, com corte automático
  let _aberta = false;

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function mmss(seg) {
    const m = Math.floor(seg / 60), s = Math.floor(seg % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  // O melhor formato que ESTE navegador grava. O Chrome e o Edge só fazem
  // webm/opus; o Firefox faz ogg/opus. Os dois servem: o servidor converte
  // para OGG/Opus de qualquer forma (é o que a Meta exige na voz).
  function tipoDeGravacao() {
    if (typeof MediaRecorder === 'undefined') return null;
    const tentar = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
    for (let i = 0; i < tentar.length; i++) {
      try { if (MediaRecorder.isTypeSupported(tentar[i])) return tentar[i]; } catch (e) {}
    }
    return '';                          // deixa o navegador escolher
  }

  function estilo() {
    if (document.getElementById('rt-audio-estilo')) return;
    const st = document.createElement('style');
    st.id = 'rt-audio-estilo';
    st.textContent = [
      '#rt-audio-tela{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;',
      'justify-content:center;padding:16px;background:rgba(8,12,20,.82);backdrop-filter:blur(5px);overflow:auto;}',
      '#rt-audio-caixa{width:100%;max-width:400px;background:var(--card-bg,#fff);color:var(--text-main,#0f172a);',
      'border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:20px;box-shadow:0 22px 56px rgba(0,0,0,.45);',
      'text-align:center;}',
      '#rt-audio-caixa h3{margin:0 0 4px;font-size:16px;display:flex;align-items:center;justify-content:center;gap:8px;}',
      '#rt-audio-caixa p.rt-audio-dica{margin:0 0 16px;font-size:12.5px;color:var(--text-secondary,#64748b);line-height:1.55;}',
      '#rt-audio-tempo{font-size:34px;font-weight:700;font-variant-numeric:tabular-nums;margin:8px 0 2px;}',
      '#rt-audio-tempo.gravando{color:#dc2626;}',
      '#rt-audio-limite{font-size:11px;color:var(--text-light,#94a3b8);margin-bottom:14px;}',
      '.rt-audio-bolinha{display:inline-block;width:9px;height:9px;border-radius:50%;background:#dc2626;',
      'margin-right:7px;animation:rt-audio-pisca 1s infinite;}',
      '@keyframes rt-audio-pisca{0%,100%{opacity:1}50%{opacity:.25}}',
      '@media (prefers-reduced-motion: reduce){.rt-audio-bolinha{animation:none}}',
      '#rt-audio-player{width:100%;margin:6px 0 14px;}',
      '.rt-audio-botoes{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;}',
      '.rt-audio-botoes button{flex:1 1 auto;min-width:120px;padding:11px 14px;font-size:13.5px;font-weight:600;',
      'border-radius:9px;border:1px solid var(--border-color,#e2e8f0);background:var(--card-bg,#fff);',
      'color:var(--text-main,#0f172a);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px;}',
      '.rt-audio-botoes button.principal{background:#059669;border-color:#059669;color:#fff;}',
      '.rt-audio-botoes button.perigo{color:#b91c1c;}',
      '.rt-audio-botoes button:disabled{opacity:.55;cursor:default;}',
      '#rt-audio-recado{font-size:12.5px;line-height:1.55;border-radius:9px;padding:10px 12px;margin:0 0 13px;display:none;text-align:left;}',
      '#rt-audio-recado.erro{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.32);color:#b91c1c;}',
      '#rt-audio-recado.aviso{background:rgba(217,119,6,.12);border:1px solid rgba(217,119,6,.32);color:#92400e;}',
      '@media (max-width:480px){.rt-audio-botoes button{flex:1 0 100%;}}'
    ].join('');
    document.head.appendChild(st);
  }

  function fechar() {
    const t = document.getElementById('rt-audio-tela');
    if (t) t.remove();
    _aberta = false;
  }

  function gravar(opcoes) {
    const o = opcoes || {};
    if (_aberta) return;
    _aberta = true;
    estilo();

    const tela = document.createElement('div');
    tela.id = 'rt-audio-tela';
    tela.innerHTML =
      '<div id="rt-audio-caixa" role="dialog" aria-modal="true">' +
        '<h3><i class="fa-solid fa-microphone"></i> ' + esc(o.titulo || 'Gravar áudio') + '</h3>' +
        '<p class="rt-audio-dica">O áudio é gravado aqui e só entra na mensagem depois que você ouvir e clicar em "Usar este áudio".</p>' +
        '<div id="rt-audio-recado"></div>' +
        '<div id="rt-audio-tempo">0:00</div>' +
        '<div id="rt-audio-limite">Limite de ' + mmss(LIMITE_SEG) + ' — ao chegar no limite a gravação para sozinha.</div>' +
        '<audio id="rt-audio-player" controls style="display:none;"></audio>' +
        '<div class="rt-audio-botoes" id="rt-audio-botoes"></div>' +
      '</div>';
    document.body.appendChild(tela);

    const elTempo = document.getElementById('rt-audio-tempo');
    const elLimite = document.getElementById('rt-audio-limite');
    const elRecado = document.getElementById('rt-audio-recado');
    const elPlayer = document.getElementById('rt-audio-player');
    const elBotoes = document.getElementById('rt-audio-botoes');

    let gravador = null, trilha = null, pedacos = [], blob = null, urlPrevia = '';
    let t0 = 0, relogio = null, segundos = 0;

    const recado = function (texto, classe) {
      elRecado.textContent = texto || '';
      elRecado.className = classe || '';
      elRecado.style.display = texto ? 'block' : 'none';
    };
    const botoes = function (lista) {
      elBotoes.innerHTML = '';
      lista.forEach(function (b) {
        const el = document.createElement('button');
        el.className = b.classe || '';
        el.innerHTML = (b.icone ? '<i class="fa-solid ' + b.icone + '"></i> ' : '') + esc(b.texto);
        el.onclick = b.aoClicar;
        if (b.id) el.id = b.id;
        elBotoes.appendChild(el);
      });
    };
    const soltarMicrofone = function () {
      try { if (trilha) trilha.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      trilha = null;
    };
    const pararRelogio = function () { if (relogio) { clearInterval(relogio); relogio = null; } };
    const limpar = function () {
      pararRelogio();
      soltarMicrofone();
      if (urlPrevia) { try { URL.revokeObjectURL(urlPrevia); } catch (e) {} urlPrevia = ''; }
    };

    // ── 1) Pedir o microfone ───────────────────────────────────────────────
    const comecar = async function () {
      recado('');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
        recado('Este navegador não grava áudio. Use o Chrome, o Edge ou o Safari atualizados — ' +
               'ou envie o áudio como arquivo OGG/Opus pelo botão de anexar.', 'erro');
        botoes([{ texto: 'Fechar', aoClicar: function () { limpar(); fechar(); } }]);
        return;
      }
      let fluxo;
      try {
        fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        const nome = String((e && e.name) || '');
        if (nome === 'NotAllowedError' || nome === 'SecurityError') {
          recado('O microfone está bloqueado para este site. Clique no cadeado ao lado do endereço, ' +
                 'em "Permissões", libere o Microfone e tente de novo. ' +
                 'No celular: Configurações do navegador → Site → Microfone → Permitir.', 'erro');
        } else if (nome === 'NotFoundError' || nome === 'DevicesNotFoundError') {
          recado('Não encontrei nenhum microfone neste aparelho.', 'erro');
        } else {
          recado('Não consegui abrir o microfone' + (nome ? ' (' + nome + ')' : '') + '.', 'erro');
        }
        botoes([
          { texto: 'Tentar de novo', icone: 'fa-rotate-right', classe: 'principal', aoClicar: comecar },
          { texto: 'Fechar', aoClicar: function () { limpar(); fechar(); } }
        ]);
        return;
      }

      trilha = fluxo;
      pedacos = [];
      segundos = 0;
      const tipo = tipoDeGravacao();
      try {
        gravador = tipo ? new MediaRecorder(fluxo, { mimeType: tipo }) : new MediaRecorder(fluxo);
      } catch (e) {
        try { gravador = new MediaRecorder(fluxo); }
        catch (e2) {
          recado('Este navegador não consegue gravar áudio aqui. Use o botão de anexar arquivo.', 'erro');
          botoes([{ texto: 'Fechar', aoClicar: function () { limpar(); fechar(); } }]);
          return;
        }
      }

      gravador.ondataavailable = function (ev) { if (ev.data && ev.data.size) pedacos.push(ev.data); };
      gravador.onstop = function () {
        pararRelogio();
        soltarMicrofone();
        blob = new Blob(pedacos, { type: (gravador && gravador.mimeType) || 'audio/webm' });
        if (!blob.size) {
          recado('A gravação saiu vazia. Tente de novo.', 'erro');
          botoes([
            { texto: 'Gravar de novo', icone: 'fa-microphone', classe: 'principal', aoClicar: comecar },
            { texto: 'Fechar', aoClicar: function () { limpar(); fechar(); } }
          ]);
          return;
        }
        previa();
      };

      elTempo.className = 'gravando';
      elTempo.innerHTML = '<span class="rt-audio-bolinha"></span>0:00';
      elPlayer.style.display = 'none';
      t0 = Date.now();
      relogio = setInterval(function () {
        segundos = (Date.now() - t0) / 1000;
        elTempo.innerHTML = '<span class="rt-audio-bolinha"></span>' + mmss(segundos);
        if (segundos >= LIMITE_SEG) {
          recado('A gravação chegou ao limite de ' + mmss(LIMITE_SEG) + ' e parou sozinha.', 'aviso');
          parar();
        }
      }, 200);

      try { gravador.start(); } catch (e) {
        recado('Não consegui começar a gravação: ' + (e.message || e), 'erro');
        botoes([{ texto: 'Fechar', aoClicar: function () { limpar(); fechar(); } }]);
        return;
      }

      botoes([
        { texto: 'Parar', icone: 'fa-stop', classe: 'principal', aoClicar: parar },
        { texto: 'Cancelar', classe: 'perigo', aoClicar: function () {
            try { if (gravador && gravador.state !== 'inactive') { gravador.onstop = null; gravador.stop(); } } catch (e) {}
            limpar(); fechar();
          } }
      ]);
    };

    function parar() {
      try { if (gravador && gravador.state !== 'inactive') gravador.stop(); } catch (e) {}
      pararRelogio();
      elTempo.className = '';
    }

    // ── 2) Ouvir antes de usar ─────────────────────────────────────────────
    function previa() {
      if (urlPrevia) { try { URL.revokeObjectURL(urlPrevia); } catch (e) {} }
      urlPrevia = URL.createObjectURL(blob);
      elPlayer.src = urlPrevia;
      elPlayer.style.display = 'block';
      elTempo.textContent = mmss(segundos);
      elLimite.textContent = 'Ouça antes de usar · ' + Math.max(1, Math.round(blob.size / 1024)) + ' KB';
      botoes([
        { texto: 'Regravar', icone: 'fa-rotate-left', aoClicar: function () { recado(''); comecar(); } },
        { texto: 'Descartar', classe: 'perigo', icone: 'fa-trash', aoClicar: function () { limpar(); fechar(); } },
        { texto: 'Usar este áudio', icone: 'fa-check', classe: 'principal', id: 'rt-audio-usar', aoClicar: usar }
      ]);
    }

    // ── 3) Só agora o servidor vê a gravação ───────────────────────────────
    async function usar() {
      const botao = document.getElementById('rt-audio-usar');
      if (botao) { botao.disabled = true; botao.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Convertendo…'; }
      recado('');
      const leitor = new FileReader();
      leitor.onerror = function () {
        recado('Não consegui ler a gravação. Tente de novo.', 'erro');
        if (botao) { botao.disabled = false; botao.innerHTML = '<i class="fa-solid fa-check"></i> Usar este áudio'; }
      };
      leitor.onload = async function () {
        try {
          const r = await fetch('/api/whatsapp/bot/audio-gravado', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl: leitor.result, destino: o.destino || 'bot', duracao_s: Math.round(segundos) })
          });
          const j = await r.json().catch(function () { return {}; });
          if (r.status === 200 && j.ok) {
            limpar();
            fechar();
            if (typeof o.aoUsar === 'function') {
              o.aoUsar({
                arquivo: j.arquivo, mime: j.mime || 'audio/ogg',
                tipoAnexo: 'audio', tamanho: j.tamanho,
                nomeArquivo: 'gravado-' + mmss(segundos).replace(':', 'm') + 's.ogg'
              });
            }
            return;
          }
          // ffmpeg ausente é o caso que o pedido manda tratar com recado
          // claro, deixando o envio por arquivo funcionando.
          if (j.motivo === 'sem_ffmpeg' || r.status === 503) {
            recado((j.error || 'A gravação não pôde ser convertida no servidor.') +
                   ' A gravação continua aqui: você pode tentar de novo mais tarde, ' +
                   'ou fechar e anexar um arquivo OGG/Opus pelo botão de enviar arquivo.', 'erro');
          } else {
            recado(j.error || 'Não consegui usar esta gravação.', 'erro');
          }
          if (botao) { botao.disabled = false; botao.innerHTML = '<i class="fa-solid fa-check"></i> Tentar de novo'; }
        } catch (e) {
          recado('Erro de conexão: ' + (e.message || e), 'erro');
          if (botao) { botao.disabled = false; botao.innerHTML = '<i class="fa-solid fa-check"></i> Tentar de novo'; }
        }
      };
      leitor.readAsDataURL(blob);
    }

    comecar();
  }

  window.RTAudio = { gravar: gravar, LIMITE_SEG: LIMITE_SEG, fechar: fechar };
})();
