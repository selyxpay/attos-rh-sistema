// ==========================================================================
// R&T VAGAS IA — SINCRONIZAÇÃO NA NUVEM (Supabase)
// ==========================================================================
// Coloca os dados do sistema na nuvem para que TODOS os dispositivos
// (admin, selecionadoras e candidatos) vejam e gravem os MESMOS dados.
//
// COMO FUNCIONA, DE FORMA SEGURA:
//  - Enquanto as 2 chaves abaixo NÃO forem preenchidas, o sistema continua
//    funcionando EXATAMENTE como hoje (só localStorage). Zero risco.
//  - Quando você colar a URL e a chave do Supabase, a nuvem liga sozinha:
//    carregamento, salvamento e sincronização em tempo real.
//  - Documentos (RG/CPF/comprovantes) vão para o Storage do Supabase e no
//    banco fica só o link. Os documentos ficam guardados permanentemente.
// ==========================================================================

// >>>>>>>>>>>>>>>>>>>>  COLE SUAS 2 CHAVES AQUI  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<
// (Supabase → Project Settings → API)
const SUPABASE_URL      = 'COLE_AQUI_O_PROJECT_URL';   // ex: https://abcd1234.supabase.co
const SUPABASE_ANON_KEY = 'COLE_AQUI_A_CHAVE_ANON';    // ex: eyJhbGciOiJI... (chave "anon public")
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

window.RTCloud = (function () {
  'use strict';

  // -- Configuração ---------------------------------------------------------
  const configured =
    typeof SUPABASE_URL === 'string' && SUPABASE_URL.indexOf('COLE_AQUI') === -1 &&
    SUPABASE_URL.indexOf('http') === 0 &&
    typeof SUPABASE_ANON_KEY === 'string' && SUPABASE_ANON_KEY.indexOf('COLE_AQUI') === -1 &&
    SUPABASE_ANON_KEY.length > 20;

  const BUCKET    = 'documentos';        // pasta de arquivos no Storage
  const ROW_KEY   = 'estado';            // identificador da linha de estado
  const SAVE_DEBOUNCE_MS = 900;          // agrupa gravações próximas

  let client = null;
  let onRemote = null;
  let pending = null;
  let pendingMerge = false;
  let pendingUpsert = [];
  let saveTimer = null;
  let sdkPromise = null;

  // -- Carrega o SDK do Supabase a partir do CDN (uma única vez) -------------
  function ensureSdk() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.crossOrigin = 'anonymous';
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Falha ao carregar o SDK do Supabase (verifique a internet).')); };
      document.head.appendChild(s);
    });
    return sdkPromise;
  }

  // -- Inicializa conexão + tempo real --------------------------------------
  async function init(opts) {
    if (!configured) return false;
    onRemote = (opts && opts.onRemoteUpdate) || null;
    await ensureSdk();
    if (!client) {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        realtime: { params: { eventsPerSecond: 5 } }
      });
      // Sincronização em tempo real: quando outro dispositivo grava, atualiza aqui
      try {
        client
          .channel('rt_estado_canal')
          .on('postgres_changes',
              { event: '*', schema: 'public', table: 'rt_estado', filter: 'chave=eq.' + ROW_KEY },
              function (payload) {
                if (onRemote && payload && payload.new && payload.new.dados) {
                  onRemote(payload.new.dados);
                }
              })
          .subscribe();
      } catch (e) { console.warn('[RT Nuvem] Tempo real indisponível:', e); }
    }
    return true;
  }

  // -- Lê o estado da nuvem (documentos já vêm como links) ------------------
  async function loadState() {
    if (!configured) return null;
    await ensureSdk();
    if (!client) client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const res = await client.from('rt_estado').select('dados').eq('chave', ROW_KEY).maybeSingle();
    if (res.error) { console.error('[RT Nuvem] Erro ao carregar:', res.error.message); return null; }
    return res.data ? res.data.dados : null;
  }

  // -- Salva o estado na nuvem (com debounce). merge=true para páginas ------
  //    públicas (candidato/talento): nunca apaga dados de outros, só adiciona.
  function saveState(state, options) {
    if (!configured) return;
    pending = state;
    pendingMerge = !!(options && options.merge);
    pendingUpsert = (options && options.upsertIds) ? options.upsertIds.slice() : [];
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }

  // -- Força gravação imediata (ex.: antes de fechar a ficha) ---------------
  async function flush() {
    if (!configured || !pending) return;
    const state = pending;
    const merge = pendingMerge;
    const upsert = pendingUpsert;
    pending = null;
    pendingUpsert = [];
    clearTimeout(saveTimer);
    try {
      await ensureSdk();
      if (!client) client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

      // 1) Sobe os documentos (base64) para o Storage e troca por links
      await processarDocumentos(state);

      // 2) Monta o objeto a gravar (merge para páginas públicas)
      let dados = state;
      if (merge) {
        const nuvem = await loadState();
        dados = mesclarEstado(nuvem || {}, state, upsert);
      }

      // 3) Grava a linha única de estado
      const up = await client.from('rt_estado')
        .upsert({ chave: ROW_KEY, dados: dados, atualizado_em: new Date().toISOString() });
      if (up.error) console.error('[RT Nuvem] Erro ao salvar:', up.error.message);
    } catch (e) {
      console.error('[RT Nuvem] Falha ao salvar (tentaremos na próxima):', e);
    }
  }

  // -- Mescla para páginas públicas: mantém a nuvem e só ADICIONA o novo ----
  function mesclarEstado(nuvem, local, upsertIds) {
    const ups = {};
    (upsertIds || []).forEach(function (id) { ups[id] = true; });
    const out = JSON.parse(JSON.stringify(nuvem || {}));
    Object.keys(local || {}).forEach(function (k) {
      const lv = local[k];
      if (Array.isArray(lv)) {
        if (!Array.isArray(out[k])) { out[k] = lv.slice(); return; }
        const idx = {};
        out[k].forEach(function (it, i) { if (it && it.id != null) idx[it.id] = i; });
        lv.forEach(function (it) {
          if (it && it.id != null) {
            if (idx[it.id] === undefined) out[k].push(it);        // novo registro -> adiciona
            else if (ups[it.id]) out[k][idx[it.id]] = it;         // upsert -> substitui pelo local
          } else out[k].push(it);
        });
      } else if (k === 'fila' && lv && typeof lv === 'object') {
        out[k] = mesclarFila(out[k] || {}, lv);
      } else if (out[k] === undefined) {
        out[k] = lv;
      }
      // Demais campos: mantém o valor da nuvem (não sobrescreve dados alheios)
    });
    if (local && local._docsMeta) {
      out._docsMeta = Object.assign({}, out._docsMeta || {}, local._docsMeta);
    }
    return out;
  }

  function mesclarFila(nuvem, local) {
    const out = Object.assign({}, nuvem);
    out.contadores = out.contadores || {};
    const lc = local.contadores || {};
    Object.keys(lc).forEach(function (k) {
      out.contadores[k] = Math.max(out.contadores[k] || 0, lc[k] || 0);
    });
    const senhas = (nuvem.senhas || []).slice();
    const vistos = {};
    senhas.forEach(function (s) { if (s && s.numero != null) vistos[s.numero] = true; });
    (local.senhas || []).forEach(function (s) {
      if (s && s.numero != null) { if (!vistos[s.numero]) senhas.push(s); }
      else senhas.push(s);
    });
    out.senhas = senhas;
    out.ultimaChamada = local.ultimaChamada || nuvem.ultimaChamada || null;
    return out;
  }

  // -- Percorre o estado, sobe cada base64 para o Storage e troca por link --
  async function processarDocumentos(state) {
    if (!client) return;
    state._docsMeta = state._docsMeta || {};
    await percorrer(state, 'state', state._docsMeta, null);
  }

  async function percorrer(obj, caminho, meta, contexto) {
    if (obj == null || typeof obj !== 'object') return;

    // Captura nome/identificação da pessoa para a área de Documentos
    if (!Array.isArray(obj)) {
      if (obj.id != null && (obj.nome || obj.nomeCompleto)) {
        contexto = { id: obj.id, nome: obj.nome || obj.nomeCompleto };
      }
    }

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        await percorrer(obj[i], caminho + '[' + i + ']', meta, contexto);
      }
      return;
    }

    const chaves = Object.keys(obj);
    for (let j = 0; j < chaves.length; j++) {
      const k = chaves[j];
      if (k === '_docsMeta') continue;
      const v = obj[k];
      if (typeof v === 'string' && v.indexOf('data:') === 0 && v.indexOf(';base64,') > 0 && v.length > 4000) {
        const url = await subirBase64(v, k);
        if (url) {
          obj[k] = url;
          meta[url] = {
            campo: k,
            pessoa: contexto ? contexto.nome : '—',
            pessoaId: contexto ? contexto.id : null,
            enviadoEm: Date.now()
          };
        }
      } else if (v && typeof v === 'object') {
        await percorrer(v, caminho + '.' + k, meta, contexto);
      }
    }
  }

  async function subirBase64(dataUri, hint) {
    try {
      const m = /^data:([^;]+);base64,(.*)$/.exec(dataUri);
      if (!m) return null;
      const mime = m[1];
      const bin = atob(m[2]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      let ext = (mime.split('/')[1] || 'bin').split('+')[0].split(';')[0];
      if (ext.length > 5) ext = 'bin';
      const limpo = String(hint || 'doc').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 32);
      const nome = Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '_' + limpo + '.' + ext;
      const up = await client.storage.from(BUCKET).upload(nome, bytes, { contentType: mime, upsert: false });
      if (up.error) { console.error('[RT Nuvem] Upload falhou:', up.error.message); return null; }
      const pub = client.storage.from(BUCKET).getPublicUrl(nome);
      return pub.data.publicUrl;
    } catch (e) {
      console.error('[RT Nuvem] Erro no upload de documento:', e);
      return null; // mantém o base64 para tentar de novo depois (nada se perde)
    }
  }

  // -- ÁREA DE DOCUMENTOS: lista todos (guardados permanentemente) -----------
  function listarDocumentos(state) {
    const meta = (state && state._docsMeta) || {};
    return Object.keys(meta).map(function (url) {
      const d = meta[url];
      return {
        url: url,
        campo: d.campo,
        pessoa: d.pessoa || '—',
        pessoaId: d.pessoaId || null,
        enviadoEm: d.enviadoEm || null
      };
    }).sort(function (a, b) { return (b.enviadoEm || 0) - (a.enviadoEm || 0); });
  }

  return {
    configured: configured,
    init: init,
    loadState: loadState,
    saveState: saveState,
    flush: flush,
    listarDocumentos: listarDocumentos
  };
})();
