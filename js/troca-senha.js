// ==========================================================================
// TROCA OBRIGATÓRIA DE SENHA — a tela que tranca o sistema
// --------------------------------------------------------------------------
// Por que existe: quando uma senha vaza, não basta pedir "por favor troque".
// O servidor marca a conta (precisaTrocarSenha) e responde 423 em TODAS as
// rotas do sistema até a pessoa escolher uma senha nova. Este arquivo é a
// outra metade: mostra a tela, não deixa fechar, e troca a senha.
//
// Duas portas de entrada, porque a pessoa pode estar nas duas situações:
//   1) ACABOU DE ENTRAR  → o login.html manda ela para cá.
//   2) JÁ ESTAVA DENTRO  → a próxima requisição que a tela fizer volta 423, e
//      o envelope do fetch (mais abaixo) abre esta tela na hora.
//
// Carregado ANTES do app.js de propósito: o envelope do fetch precisa estar
// no lugar antes de qualquer tela começar a conversar com o servidor.
// ==========================================================================
(function () {
  'use strict';

  var MENSAGEM_PADRAO =
    'Olá, tudo bem? Por causa de um problema de segurança mundial, muitas senhas ' +
    'foram vazadas na internet. Para proteger você e a nossa empresa, pedimos que ' +
    'troque sua senha agora.';

  var MINIMO = 8;
  var aberta = false;

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // A mesma regra do servidor, repetida aqui só para avisar antes de enviar.
  // Quem decide é sempre o servidor (politicaSenha, no server.cjs).
  function criticar(nova, confirma) {
    if (String(nova).length < MINIMO) return 'A senha precisa ter pelo menos ' + MINIMO + ' caracteres.';
    if (!/[A-Za-zÀ-ÿ]/.test(nova)) return 'A senha precisa ter pelo menos uma letra.';
    if (!/[0-9]/.test(nova)) return 'A senha precisa ter pelo menos um número.';
    if (nova !== confirma) return 'As duas senhas precisam ser iguais.';
    return '';
  }

  function estilo() {
    if (document.getElementById('rt-troca-estilo')) return;
    var st = document.createElement('style');
    st.id = 'rt-troca-estilo';
    st.textContent = [
      '#rt-troca-tela{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;',
      'justify-content:center;padding:18px;background:rgba(8,12,20,.88);backdrop-filter:blur(6px);',
      'font-family:inherit;overflow:auto;}',
      '#rt-troca-caixa{width:100%;max-width:430px;background:#0f172a;color:#e2e8f0;border:1px solid rgba(255,255,255,.12);',
      'border-radius:16px;padding:24px;box-shadow:0 24px 60px rgba(0,0,0,.5);}',
      '#rt-troca-caixa h2{margin:0 0 10px;font-size:19px;color:#f1f5f9;}',
      '#rt-troca-caixa p.rt-troca-msg{margin:0 0 16px;font-size:13.5px;line-height:1.65;color:#cbd5e1;}',
      '#rt-troca-caixa label{display:block;font-size:12.5px;font-weight:600;color:#cbd5e1;margin:0 0 5px;}',
      '#rt-troca-caixa input{width:100%;box-sizing:border-box;padding:11px 12px;margin:0 0 13px;font-size:14px;',
      'border-radius:9px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#f8fafc;}',
      '#rt-troca-caixa input:focus{outline:none;border-color:#059669;background:rgba(255,255,255,.1);}',
      '#rt-troca-regras{font-size:11.5px;color:#94a3b8;margin:0 0 14px;line-height:1.6;}',
      '#rt-troca-erro{display:none;font-size:12.5px;color:#fecaca;background:rgba(239,68,68,.14);',
      'border:1px solid rgba(239,68,68,.35);border-radius:9px;padding:9px 11px;margin:0 0 12px;line-height:1.5;}',
      '#rt-troca-botao{width:100%;padding:12px;font-size:14px;font-weight:700;border:none;border-radius:9px;',
      'cursor:pointer;background:#059669;color:#fff;}',
      '#rt-troca-botao:disabled{opacity:.6;cursor:default;}',
      '#rt-troca-sair{display:block;width:100%;margin-top:11px;background:none;border:none;color:#94a3b8;',
      'font-size:12px;cursor:pointer;text-decoration:underline;}'
    ].join('');
    document.head.appendChild(st);
  }

  function mostrar(aviso) {
    if (aberta) return;
    aberta = true;
    estilo();
    var tela = document.createElement('div');
    tela.id = 'rt-troca-tela';
    tela.innerHTML =
      '<div id="rt-troca-caixa" role="dialog" aria-modal="true" aria-labelledby="rt-troca-titulo">' +
        '<h2 id="rt-troca-titulo">Troque sua senha para continuar</h2>' +
        '<p class="rt-troca-msg">' + esc(aviso || MENSAGEM_PADRAO) + '</p>' +
        '<form id="rt-troca-form" autocomplete="off">' +
          '<label for="rt-troca-nova">Nova senha</label>' +
          '<input type="password" id="rt-troca-nova" autocomplete="new-password" placeholder="Pelo menos ' + MINIMO + ' caracteres">' +
          '<label for="rt-troca-conf">Confirmar nova senha</label>' +
          '<input type="password" id="rt-troca-conf" autocomplete="new-password" placeholder="Digite de novo">' +
          '<p id="rt-troca-regras">Pelo menos ' + MINIMO + ' caracteres, com letras e números. ' +
            'Não pode ser igual à senha antiga.</p>' +
          '<div id="rt-troca-erro"></div>' +
          '<button type="submit" id="rt-troca-botao">Salvar nova senha</button>' +
        '</form>' +
        '<button type="button" id="rt-troca-sair">Sair do sistema</button>' +
      '</div>';
    document.body.appendChild(tela);
    document.documentElement.style.overflow = 'hidden';

    var campoNova = document.getElementById('rt-troca-nova');
    var campoConf = document.getElementById('rt-troca-conf');
    var caixaErro = document.getElementById('rt-troca-erro');
    var botao = document.getElementById('rt-troca-botao');
    if (campoNova) campoNova.focus();

    var diz = function (t) { caixaErro.textContent = t; caixaErro.style.display = t ? 'block' : 'none'; };

    document.getElementById('rt-troca-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var nova = campoNova.value, conf = campoConf.value;
      var problema = criticar(nova, conf);
      if (problema) { diz(problema); return; }
      diz('');
      botao.disabled = true;
      botao.textContent = 'Salvando…';
      // _rtFetchOriginal: o envelope que trata o 423 não pode se intrometer
      // justamente na requisição que RESOLVE o 423.
      var enviar = window._rtFetchOriginal || window.fetch;
      enviar.call(window, '/api/trocar-senha-obrigatoria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ senhaNova: nova, senhaConfirma: conf })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, d: d }; });
      }).then(function (res) {
        if (res.status === 200 && res.d && res.d.ok) {
          // Recarrega: a tela toda foi carregada com o sistema trancado, e
          // várias partes já receberam 423. Começar de novo é mais honesto
          // (e mais seguro) do que remendar o que ficou pela metade.
          window.location.reload();
          return;
        }
        botao.disabled = false;
        botao.textContent = 'Salvar nova senha';
        diz((res.d && res.d.aviso) || 'Não consegui trocar a senha. Tente de novo.');
      }).catch(function () {
        botao.disabled = false;
        botao.textContent = 'Salvar nova senha';
        diz('Erro de conexão. Tente de novo.');
      });
    });

    document.getElementById('rt-troca-sair').addEventListener('click', function () {
      var enviar = window._rtFetchOriginal || window.fetch;
      enviar.call(window, '/api/logout', { method: 'POST', credentials: 'same-origin' })
        .catch(function () {})
        .then(function () { window.location.href = '/'; });
    });
  }

  // ── O ENVELOPE DO FETCH ──────────────────────────────────────────────────
  // Um lugar só para pegar o 423, em vez de conferir em cada uma das centenas
  // de chamadas espalhadas pelo sistema. Não muda mais nada: a resposta volta
  // intacta para quem pediu.
  if (!window._rtFetchOriginal && typeof window.fetch === 'function') {
    window._rtFetchOriginal = window.fetch.bind(window);
    window.fetch = function () {
      return window._rtFetchOriginal.apply(window, arguments).then(function (r) {
        if (r && r.status === 423) {
          // Pega o recado do servidor sem consumir a resposta de quem pediu.
          try {
            r.clone().json().then(function (d) {
              if (d && d.motivo === 'troca_de_senha') mostrar(d.aviso);
            }).catch(function () { mostrar(''); });
          } catch (e) { mostrar(''); }
        }
        return r;
      });
    };
  }

  window.RTTroca = { mostrar: mostrar, criticar: criticar, MINIMO: MINIMO, mensagem: MENSAGEM_PADRAO };
})();
