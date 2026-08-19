// ==========================================================================
// R&T VAGAS IA — SINCRONIZAÇÃO NA PRÓPRIA VPS (sem Firebase)
// ==========================================================================
// Mesma interface (window.RTCloud) usada pelo resto do sistema — por isso
// NENHUMA função do app precisa mudar. Esta camada conversa com o backend
// próprio em /api/* (Node, no server.cjs), que guarda tudo NA SUA VPS:
//  - Os registros ficam num arquivo JSON no servidor (volume persistente).
//  - As fotos/documentos vão para /uploads e no banco fica só o LINK.
//  - "Tempo real" é feito por verificação periódica (polling) a cada poucos seg.
// ==========================================================================
window.RTCloud = (function () {
  'use strict';

  const API = '/api';
  const SAVE_DEBOUNCE_MS = 900;
  const POLL_MS = 4000;

  let onRemote = null;
  let onSessaoPerdida = null;
  let pending = null, pendingMerge = false, pendingUpsert = [], pendingSomenteAlvos = false;
  let saveTimer = null, pollTimer = null;
  let lastVersion = 0;
  let flushing = false;

  async function apiGet(path) {
    const r = await fetch(API + path, { headers: { 'Accept': 'application/json' }, cache: 'no-store', credentials: 'same-origin' });
    if (!r.ok) throw new Error('GET ' + path + ' -> ' + r.status);
    return r.json();
  }
  // Rede de celular oscila: um cochilo de 4G derrubava o save inteiro e a
  // pessoa via "Load failed" depois de preencher a ficha toda. Falha de REDE
  // (o fetch nem chegou ao servidor) agora é tentada de novo, com uma pausa
  // maior a cada vez. Erro de verdade do servidor (400, 403, 500) NÃO é
  // repetido — insistir não conserta, e esconderia o problema real.
  async function apiPost(path, body, tentativa) {
    const vez = tentativa || 1;
    let r;
    try {
      r = await fetch(API + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body)
      });
    } catch (e) {
      if (vez >= 3) throw e;
      await new Promise(function (ok) { setTimeout(ok, vez * 1500); });
      return apiPost(path, body, vez + 1);
    }
    if (!r.ok) throw new Error('POST ' + path + ' -> ' + r.status);
    return r.json();
  }

  // -- Inicializa: guarda callback e começa o polling (substitui o tempo real) --
  async function init(opts) {
    onRemote = (opts && opts.onRemoteUpdate) || null;
    onSessaoPerdida = (opts && opts.onSessaoPerdida) || null;
    // NÃO marcamos lastVersion aqui. Quem carrega o estado para valer é o
    // loadState() logo em seguida — e é lá que a versão passa a valer. Enquanto
    // isso não acontece, lastVersion fica em 0 de propósito: se algum save sair
    // antes da carga, o servidor o trata como desatualizado e mescla, em vez de
    // substituir o estado inteiro com o que a tela ainda não tinha.
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(verificarRemoto, POLL_MS);
    return true;
  }

  async function verificarRemoto() {
    if (flushing || pending) return; // não checa enquanto está salvando o nosso
    try {
      // Pergunta SÓ a versão (resposta de algumas dezenas de bytes). Antes esta
      // checagem baixava o estado inteiro a cada 4 segundos — com o sistema
      // cheio isso virava dezenas de MB por minuto EM CADA aba aberta, e era o
      // principal motivo da lentidão. Agora o estado só é baixado quando
      // alguém realmente alterou alguma coisa.
      const v = await apiGet('/state/version');
      // Sessão caiu (expirou / servidor reiniciou): avisa quem estiver ouvindo
      // para a tela reagir na hora, em vez de ficar parada sem salvar nada.
      if (v && v.autenticado === false && onSessaoPerdida) { onSessaoPerdida(); return; }
      if ((v.version || 0) === lastVersion) return;      // nada mudou: acabou aqui
      const s = await apiGet('/state');
      const nova = s.version || 0;
      if (nova === lastVersion) return;

      // ATENÇÃO — aqui morava um sumiço de dados:
      // antes, lastVersion subia SEMPRE, mesmo quando a tela não chegava a
      // absorver o estado novo (ex.: resposta sem dados, ou erro no meio).
      // O cliente passava a se achar atualizado carregando um estado VELHO, e
      // o save seguinte (que substitui o estado inteiro) apagava tudo que as
      // outras pessoas tinham cadastrado nesse intervalo.
      // Agora a versão só avança quando os dados foram REALMENTE aplicados.
      // Se não foram, lastVersion fica para trás de propósito: o servidor
      // enxerga o próximo save como desatualizado e MESCLA em vez de substituir.
      let aplicou = false;
      if (onRemote && s.dados) {
        try { aplicou = onRemote(s.dados) !== false; }
        catch (e) { console.error('[RT VPS] não consegui aplicar o estado novo:', e); aplicou = false; }
      }
      if (aplicou) lastVersion = nova;
    } catch (e) { /* silencioso: instabilidade de rede */ }
  }

  // -- Lê o estado do servidor -----------------------------------------------
  async function loadState() {
    const s = await apiGet('/state');
    lastVersion = s.version || 0;
    return s.dados || null;
  }

  // ── SÓ O QUE MUDOU VAI PELA REDE ──────────────────────────────────────────
  // Antes, TODO save subia o banco inteiro: milhares de candidatos, todos os
  // equipamentos, todas as fichas. No computador isso passava; no celular em
  // 4G a requisição não terminava e o Safari cortava com "Load failed" — a
  // pessoa preenchia a ficha com foto e perdia o registro.
  //
  // Quando o save é de merge com upsertIds, o servidor SÓ acrescenta ou troca
  // os registros daqueles ids. Então mandar o resto é desperdício puro: mandar
  // menos é mais rápido E mais seguro (nada que não foi enviado corre risco).
  function _apenasOsAlvos(state, ids) {
    const querido = {};
    ids.forEach(function (id) { querido[String(id)] = true; });
    const saida = {};
    const urlsUsadas = {};

    Object.keys(state || {}).forEach(function (chave) {
      if (chave === '_docsMeta') return;                 // tratado no fim
      const valor = state[chave];
      if (Array.isArray(valor)) {
        const escolhidos = valor.filter(function (r) {
          return r && r.id != null && querido[String(r.id)];
        });
        if (escolhidos.length) {
          saida[chave] = escolhidos;
          // guarda os links de arquivo destes registros, para levar só o
          // pedaço do _docsMeta que diz respeito a eles
          JSON.stringify(escolhidos).replace(/"(\/uploads\/[^"]+)"/g, function (_, u) {
            urlsUsadas[u] = true; return _;
          });
        }
      } else {
        // chaves que não são lista (contadores, configurações) são pequenas:
        // vão junto para nunca ficarem para trás
        saida[chave] = valor;
      }
    });

    if (state && state._docsMeta) {
      const meta = {};
      Object.keys(urlsUsadas).forEach(function (u) {
        if (state._docsMeta[u]) meta[u] = state._docsMeta[u];
      });
      if (Object.keys(meta).length) saida._docsMeta = meta;
    }
    return saida;
  }

  // Decide o que mandar: o recorte SÓ quando quem chamou pediu.
  //
  // Por que não é automático: o recorte deixa de fora tudo que não está nos
  // upsertIds. Se a tela mexeu em outra coisa do estado e ainda não salvou,
  // essa mudança some sem aviso — o mesmo tipo de perda silenciosa que já nos
  // custou caro. Quem chama é quem sabe se a alteração é de um registro só;
  // por isso pede explicitamente com { somenteAlvos: true }.
  function _corpoDoSave(state, merge, upsertIds, somenteAlvos) {
    if (!somenteAlvos || !merge || !upsertIds || !upsertIds.length) return state;
    const recorte = _apenasOsAlvos(state, upsertIds);
    // só vale a pena se realmente achou os registros pedidos
    const achou = upsertIds.some(function (id) {
      return Object.keys(recorte).some(function (k) {
        return Array.isArray(recorte[k]) && recorte[k].some(function (r) {
          return r && String(r.id) === String(id);
        });
      });
    });
    return achou ? recorte : state;
  }

  // -- Salva (com debounce). merge=true p/ páginas públicas ------------------
  function saveState(state, options) {
    pending = state;
    pendingMerge = !!(options && options.merge);
    pendingUpsert = (options && options.upsertIds) ? options.upsertIds.slice() : [];
    pendingSomenteAlvos = !!(options && options.somenteAlvos);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }

  // -- Salva AGORA e ESPERA o servidor confirmar -------------------------------
  // Diferente do saveState/flush (que engolem o erro e tentam de novo em silêncio),
  // este LANÇA o erro. Serve para telas onde o usuário precisa saber, na hora, se o
  // registro realmente entrou no servidor — em vez de achar que salvou e não ter salvo.
  // options: { merge, upsertIds }. Por padrão substitui o estado inteiro
  // (merge:false) — compatível com quem já chamava salvarAgora(state).
  // Passe { merge:true, upsertIds:[id] } quando VÁRIAS pessoas mexem na mesma
  // lista ao mesmo tempo: aí o servidor só ADICIONA o registro novo (ou troca o
  // que está no upsert) e NUNCA apaga o que outra pessoa acabou de cadastrar.
  async function salvarAgora(state, options) {
    clearTimeout(saveTimer);
    pending = null; pendingMerge = false; pendingUpsert = []; pendingSomenteAlvos = false;
    flushing = true;
    try {
      await processarDocumentos(state);   // sobe as fotos e troca o base64 por link
      const merge = !!(options && options.merge);
      const upsertIds = (options && options.upsertIds) ? options.upsertIds.slice() : [];
      // baseVersion = versão em que este cliente se baseou. O servidor usa isso
      // para NÃO deixar um save desatualizado apagar o que outra pessoa gravou.
      const corpo = _corpoDoSave(state, merge, upsertIds, !!(options && options.somenteAlvos));
      const res = await apiPost('/state', { dados: corpo, merge: merge, upsertIds: upsertIds, baseVersion: lastVersion });
      if (res && res.version) lastVersion = res.version;
      return res;
    } finally {
      flushing = false;
    }
  }

  async function flush() {
    if (!pending) return;
    const state = pending;
    const merge = pendingMerge;
    const upsert = pendingUpsert;
    pending = null; pendingUpsert = [];
    clearTimeout(saveTimer);
    flushing = true;
    try {
      await processarDocumentos(state);   // sobe base64 -> /uploads e troca por link
      const corpo = _corpoDoSave(state, merge, upsert, pendingSomenteAlvos);
      const res = await apiPost('/state', { dados: corpo, merge: merge, upsertIds: upsert, baseVersion: lastVersion });
      if (res && res.version) lastVersion = res.version; // evita "eco" do nosso próprio save
    } catch (e) {
      console.error('[RT VPS] Falha ao salvar (tentaremos de novo):', e);
      if (!pending) { pending = state; pendingMerge = merge; pendingUpsert = upsert; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 3000); }
    } finally {
      flushing = false;
    }
  }

  // -- Documentos: sobe cada base64 grande pro /uploads e troca pelo link -----
  // SUBIR OS ARQUIVOS EM PARALELO.
  // Antes cada foto/PDF subia sozinho, um esperando o outro terminar. Com uma
  // ficha de vários anexos isso somava: 6 arquivos de 3 segundos viravam 18
  // segundos de tela parada. Agora primeiro varremos o estado anotando TUDO que
  // precisa subir, e depois subimos de 4 em 4.
  //
  // Quatro por vez, não todos: o navegador do celular engasga com dezenas de
  // envios grandes ao mesmo tempo, e aí fica mais lento, não mais rápido.
  const ENVIOS_JUNTOS = 4;

  async function processarDocumentos(state) {
    state._docsMeta = state._docsMeta || {};
    const tarefas = [];
    juntarPendentes(state, null, tarefas);
    if (!tarefas.length) return;

    let proxima = 0;
    async function trabalhar() {
      while (proxima < tarefas.length) {
        const t = tarefas[proxima++];
        const url = await subirBase64(t.valor, t.campo);
        if (url) {
          t.dono[t.campo] = url;
          state._docsMeta[url] = {
            campo: t.campo,
            pessoa: t.contexto ? t.contexto.nome : '—',
            pessoaId: t.contexto ? t.contexto.id : null,
            enviadoEm: Date.now()
          };
        }
      }
    }
    const equipe = [];
    for (let i = 0; i < Math.min(ENVIOS_JUNTOS, tarefas.length); i++) equipe.push(trabalhar());
    await Promise.all(equipe);
  }

  // Varre o estado SEM subir nada — só anota o que precisa subir. É rápido
  // porque não espera rede nenhuma.
  function juntarPendentes(obj, contexto, tarefas) {
    if (obj == null || typeof obj !== 'object') return;
    if (!Array.isArray(obj)) {
      if (obj.id != null && (obj.nome || obj.nomeCompleto)) {
        contexto = { id: obj.id, nome: obj.nome || obj.nomeCompleto };
      }
    }
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) juntarPendentes(obj[i], contexto, tarefas);
      return;
    }
    const chaves = Object.keys(obj);
    for (let j = 0; j < chaves.length; j++) {
      const k = chaves[j];
      if (k === '_docsMeta') continue;
      const v = obj[k];
      if (typeof v === 'string' && v.indexOf('data:') === 0 && v.indexOf(';base64,') > 0 && v.length > 4000) {
        tarefas.push({ dono: obj, campo: k, valor: v, contexto: contexto });
      } else if (v && typeof v === 'object') {
        juntarPendentes(v, contexto, tarefas);
      }
    }
  }
  async function subirBase64(dataUri, hint) {
    try {
      const res = await apiPost('/upload', { dataUrl: dataUri, hint: hint });
      return (res && res.url) || null;
    } catch (e) {
      console.error('[RT VPS] Erro no upload de documento:', e);
      return null; // mantém o base64 pra tentar de novo depois (nada se perde)
    }
  }

  // -- Área de documentos: lista todos os arquivos guardados ------------------
  function listarDocumentos(state) {
    const meta = (state && state._docsMeta) || {};
    return Object.keys(meta).map(function (url) {
      const d = meta[url];
      return { url: url, campo: d.campo, pessoa: d.pessoa || '—', pessoaId: d.pessoaId || null, enviadoEm: d.enviadoEm || null };
    }).sort(function (a, b) { return (b.enviadoEm || 0) - (a.enviadoEm || 0); });
  }

  // -- Hora confiável do servidor (resiste a relógio do aparelho adulterado) --
  async function horaServidor() {
    try {
      const r = await apiGet('/time');
      const serverMs = r.epoch || Date.now();
      return { epoch: serverMs, offset: serverMs - Date.now(), fonte: 'vps' };
    } catch (e) {
      return { epoch: Date.now(), offset: 0, fonte: 'local' };
    }
  }

  return {
    configured: true,
    backend: 'vps',
    init: init,
    loadState: loadState,
    saveState: saveState,
    salvarAgora: salvarAgora,
    flush: flush,
    listarDocumentos: listarDocumentos,
    horaServidor: horaServidor,
    // exposta para a bateria conseguir medir o envio em paralelo
    processarDocumentos: processarDocumentos
  };
})();
