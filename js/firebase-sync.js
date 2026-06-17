// ==========================================================================
// R&T VAGAS IA — SINCRONIZAÇÃO NA NUVEM (Firebase: Firestore + Storage)
// ==========================================================================
// Mesma interface (window.RTCloud) usada pelo restante do sistema — por isso
// NENHUMA função do app precisa mudar. Só esta camada conversa com a nuvem.
//
// COMO FUNCIONA, DE FORMA SEGURA:
//  - Enquanto a config abaixo NÃO for preenchida, o sistema continua
//    funcionando só com localStorage (cache). Zero risco.
//  - Com a config do Firebase preenchida, a nuvem liga sozinha:
//    Firestore guarda os registros e Storage guarda os arquivos (RG/CPF/etc).
//  - No banco fica só o LINK do arquivo (os documentos vão para o Storage).
//  - A nuvem é a fonte principal; o localStorage é apenas cache temporário.
// ==========================================================================

// >>>>>>>>>>>>>>>>>>>>  COLE A CONFIG DO FIREBASE AQUI  <<<<<<<<<<<<<<<<<<<<<<
// (Firebase Console -> engrenagem -> Configurações do projeto -> Seus apps -> Web)
const firebaseConfig = {
  apiKey: "COLE_AQUI",
  authDomain: "COLE_AQUI.firebaseapp.com",
  projectId: "COLE_AQUI",
  storageBucket: "COLE_AQUI.appspot.com",
  messagingSenderId: "COLE_AQUI",
  appId: "COLE_AQUI"
};
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

window.RTCloud = (function () {
  'use strict';

  const configured =
    typeof firebaseConfig === 'object' && firebaseConfig &&
    typeof firebaseConfig.apiKey === 'string' && firebaseConfig.apiKey.indexOf('COLE_AQUI') === -1 &&
    typeof firebaseConfig.projectId === 'string' && firebaseConfig.projectId.indexOf('COLE_AQUI') === -1;

  const COLLECTION = 'rt_sistema';   // coleção do estado
  const DOC_ID     = 'estado';       // documento único do estado
  const STORAGE_DIR = 'documentos';  // pasta dos arquivos no Storage
  const SAVE_DEBOUNCE_MS = 900;

  let app = null, db = null, storage = null, docRef = null;
  let onRemote = null;
  let pending = null, pendingMerge = false, pendingUpsert = [];
  let saveTimer = null, sdkPromise = null;

  const SDK_VER = '10.12.2';

  // -- Carrega o SDK do Firebase (compat) a partir do CDN ---------------------
  function ensureSdk() {
    if (window.firebase && window.firebase.firestore) return Promise.resolve();
    if (sdkPromise) return sdkPromise;
    const urls = [
      `https://www.gstatic.com/firebasejs/${SDK_VER}/firebase-app-compat.js`,
      `https://www.gstatic.com/firebasejs/${SDK_VER}/firebase-firestore-compat.js`,
      `https://www.gstatic.com/firebasejs/${SDK_VER}/firebase-storage-compat.js`
    ];
    sdkPromise = urls.reduce((pr, url) => pr.then(() => new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Falha ao carregar SDK Firebase: ' + url));
      document.head.appendChild(s);
    })), Promise.resolve());
    return sdkPromise;
  }

  // -- Garante app/db/storage/docRef inicializados (idempotente) -------------
  function ensureClient() {
    if (docRef) return;
    app = (window.firebase.apps && window.firebase.apps.length) ? window.firebase.app() : window.firebase.initializeApp(firebaseConfig);
    db = window.firebase.firestore();
    storage = window.firebase.storage();
    docRef = db.collection(COLLECTION).doc(DOC_ID);
  }

  // -- Inicializa conexão + tempo real ---------------------------------------
  async function init(opts) {
    if (!configured) return false;
    onRemote = (opts && opts.onRemoteUpdate) || null;
    await ensureSdk();
    ensureClient();
    try {
      docRef.onSnapshot(function (snap) {
        // Ignora o "eco" da própria gravação local
        if (snap.metadata && snap.metadata.hasPendingWrites) return;
        if (snap.exists && onRemote) {
          const d = snap.data();
          if (d && d.dados) onRemote(d.dados);
        }
      }, function (err) { console.warn('[RT Nuvem] Tempo real indisponível:', err && err.message); });
    } catch (e) { console.warn('[RT Nuvem] onSnapshot falhou:', e); }
    return true;
  }

  // -- Lê o estado da nuvem (documentos já vêm como links) -------------------
  async function loadState() {
    if (!configured) return null;
    await ensureSdk();
    ensureClient();
    const snap = await docRef.get();
    return snap.exists ? (snap.data().dados || null) : null;
  }

  // -- Salva o estado (com debounce). merge=true p/ páginas públicas ---------
  function saveState(state, options) {
    if (!configured) return;
    pending = state;
    pendingMerge = !!(options && options.merge);
    pendingUpsert = (options && options.upsertIds) ? options.upsertIds.slice() : [];
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }

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
      ensureClient();
      await processarDocumentos(state);     // sobe base64 -> Storage e troca por link
      let dados = state;
      if (merge) {
        const nuvem = await loadState();
        dados = mesclarEstado(nuvem || {}, state, upsert);
      }
      await docRef.set({ dados: dados, atualizadoEm: Date.now() });
    } catch (e) {
      console.error('[RT Nuvem] Falha ao salvar (tentaremos na próxima):', e);
    }
  }

  // -- Mescla para páginas públicas: mantém a nuvem e só ADICIONA/atualiza ----
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
            if (idx[it.id] === undefined) out[k].push(it);     // novo -> adiciona
            else if (ups[it.id]) out[k][idx[it.id]] = it;      // upsert -> substitui pelo local
          } else out[k].push(it);
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
    return out;
  }

  function mesclarFila(nuvem, local) {
    const out = Object.assign({}, nuvem);
    out.contadores = out.contadores || {};
    const lc = local.contadores || {};
    Object.keys(lc).forEach(function (k) { out.contadores[k] = Math.max(out.contadores[k] || 0, lc[k] || 0); });
    const senhas = (nuvem.senhas || []).slice();
    const vistos = {};
    senhas.forEach(function (s) { if (s && s.numero != null) vistos[s.numero] = true; });
    (local.senhas || []).forEach(function (s) {
      if (s && s.numero != null) { if (!vistos[s.numero]) senhas.push(s); } else senhas.push(s);
    });
    out.senhas = senhas;
    out.ultimaChamada = local.ultimaChamada || nuvem.ultimaChamada || null;
    return out;
  }

  // -- Percorre o estado, sobe cada base64 para o Storage e troca por link ----
  async function processarDocumentos(state) {
    if (!storage) return;
    state._docsMeta = state._docsMeta || {};
    await percorrer(state, 'state', state._docsMeta, null);
  }

  async function percorrer(obj, caminho, meta, contexto) {
    if (obj == null || typeof obj !== 'object') return;
    if (!Array.isArray(obj)) {
      if (obj.id != null && (obj.nome || obj.nomeCompleto)) {
        contexto = { id: obj.id, nome: obj.nome || obj.nomeCompleto };
      }
    }
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) await percorrer(obj[i], caminho + '[' + i + ']', meta, contexto);
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
          meta[url] = { campo: k, pessoa: contexto ? contexto.nome : '—', pessoaId: contexto ? contexto.id : null, enviadoEm: Date.now() };
        }
      } else if (v && typeof v === 'object') {
        await percorrer(v, caminho + '.' + k, meta, contexto);
      }
    }
  }

  async function subirBase64(dataUri, hint) {
    try {
      const m = /^data:([^;]+);base64,/.exec(dataUri);
      const mime = m ? m[1] : 'application/octet-stream';
      let ext = (mime.split('/')[1] || 'bin').split('+')[0].split(';')[0];
      if (ext.length > 5) ext = 'bin';
      const limpo = String(hint || 'doc').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 32);
      const nome = STORAGE_DIR + '/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '_' + limpo + '.' + ext;
      const ref = storage.ref().child(nome);
      await ref.putString(dataUri, 'data_url');   // aceita data URL base64 diretamente
      return await ref.getDownloadURL();
    } catch (e) {
      console.error('[RT Nuvem] Erro no upload de documento:', e);
      return null; // mantém o base64 para tentar de novo depois (nada se perde)
    }
  }

  // -- ÁREA DE DOCUMENTOS: lista todos (guardados permanentemente) ------------
  function listarDocumentos(state) {
    const meta = (state && state._docsMeta) || {};
    return Object.keys(meta).map(function (url) {
      const d = meta[url];
      return { url: url, campo: d.campo, pessoa: d.pessoa || '—', pessoaId: d.pessoaId || null, enviadoEm: d.enviadoEm || null };
    }).sort(function (a, b) { return (b.enviadoEm || 0) - (a.enviadoEm || 0); });
  }

  return {
    configured: configured,
    backend: 'firebase',
    init: init,
    loadState: loadState,
    saveState: saveState,
    flush: flush,
    listarDocumentos: listarDocumentos
  };
})();
