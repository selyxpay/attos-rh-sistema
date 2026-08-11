// ==========================================================================
// OPENWA — segundo WhatsApp, por leitura de QR Code (NÃO oficial)
// --------------------------------------------------------------------------
// O que é: o OpenWA (github.com/rmyndharis/OpenWA) é um SERVIDOR À PARTE, em
// Docker, que fala com o WhatsApp Web. Ele não vive dentro deste sistema — o
// que existe aqui é uma PONTE para ele.
//
// Por que ponte, e não o navegador chamando direto:
//   • a chave de acesso (X-API-Key) NUNCA pode ir para o navegador;
//   • a política de segurança da página só permite chamadas ao próprio domínio.
// Então o navegador fala com /api/openwa/* e quem conversa com o OpenWA é o
// servidor daqui, guardando a chave.
//
// ISOLAMENTO: se o OpenWA estiver fora do ar, lento ou nem configurado, todas
// as respostas saem com um aviso claro e NADA no resto do sistema é afetado —
// folha, EPI, exames e o Fluxo Financeiro seguem normais.
//
// ATENÇÃO (está na documentação do próprio OpenWA): isto é automação NÃO
// oficial do WhatsApp. Existe risco de bloqueio do número. Use um número
// dedicado, nunca o mesmo do WhatsApp Oficial da Meta.
//
// Configuração (variáveis de ambiente, no Coolify):
//   OPENWA_URL      ex.: http://openwa:2785   (ou https://wa.seudominio.com.br)
//   OPENWA_API_KEY  a MESMA chave posta em API_MASTER_KEY lá no OpenWA
//                   (atenção: lá a variável chama API_MASTER_KEY, não API_KEY —
//                    e se ela ficar vazia, o OpenWA aceita qualquer um)
// ==========================================================================
'use strict';

// Aceita o endereço escrito de qualquer jeito razoável. Quem configura no
// Coolify não tem obrigação de lembrar o formato exato — então "openwa",
// "openwa:2785", "http://openwa:2785/" e "openwa:2785/api" viram a mesma coisa.
function normalizarUrl(valor) {
  let u = String(valor || '').trim();
  if (!u) return '';
  u = u.replace(/\/+$/, '');
  u = u.replace(/\/api(\/sessions)?$/, '');          // colou o endereço de uma rota
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  try {
    const p = new URL(u);
    // Nome interno do Docker (sem ponto no host) e sem porta: a padrão é 2785.
    if (!p.port && p.protocol === 'http:' && p.hostname.indexOf('.') < 0) p.port = '2785';
    return p.origin;
  } catch (e) {
    return u.replace(/\/+$/, '');
  }
}

const URL_BASE = normalizarUrl(process.env.OPENWA_URL);
const API_KEY = String(process.env.OPENWA_API_KEY || '').trim();
const TEMPO_LIMITE = 15000;   // 15s: se o OpenWA travar, não trava esta página

function configurado() { return !!(URL_BASE && API_KEY); }

function _motivoFaltando() {
  if (!URL_BASE && !API_KEY) return 'O segundo WhatsApp ainda não foi configurado (faltam OPENWA_URL e OPENWA_API_KEY).';
  if (!URL_BASE) return 'Falta configurar o endereço do OpenWA (OPENWA_URL).';
  return 'Falta configurar a chave de acesso do OpenWA (OPENWA_API_KEY).';
}

// Uma chamada ao OpenWA. Nunca lança: devolve sempre { ok, status, dados, erro }
async function chamar(caminho, opcoes) {
  if (!configurado()) {
    return { ok: false, status: 503, erro: _motivoFaltando(), naoConfigurado: true };
  }
  const o = opcoes || {};
  const ctrl = new AbortController();
  const relogio = setTimeout(function () { ctrl.abort(); }, o.tempoLimite || TEMPO_LIMITE);
  try {
    const r = await fetch(URL_BASE + caminho, {
      method: o.metodo || 'GET',
      headers: Object.assign({ 'X-API-Key': API_KEY, 'Accept': 'application/json' },
        o.corpo ? { 'Content-Type': 'application/json' } : {}),
      body: o.corpo ? JSON.stringify(o.corpo) : undefined,
      signal: ctrl.signal
    });
    const bruto = await r.text();
    let dados = null;
    try { dados = bruto ? JSON.parse(bruto) : null; } catch (e) { dados = { texto: bruto }; }
    if (!r.ok) {
      return {
        ok: false, status: r.status, dados: dados,
        erro: r.status === 401 || r.status === 403
          ? 'O OpenWA recusou a chave de acesso. Confira o OPENWA_API_KEY.'
          : 'O OpenWA respondeu com erro ' + r.status + '.'
      };
    }
    return { ok: true, status: r.status, dados: dados };
  } catch (e) {
    const abortou = e && (e.name === 'AbortError' || /abort/i.test(String(e.message || '')));
    return {
      ok: false, status: 504, foraDoAr: true,
      erro: abortou
        ? 'O OpenWA não respondeu a tempo. Ele pode estar iniciando ou fora do ar.'
        : 'Não consegui falar com o OpenWA (' + (e.message || e) + '). Confira se o serviço está de pé.'
    };
  }
}

// Situação geral: serve para a tela dizer "configurado / no ar / fora do ar"
async function situacao() {
  if (!configurado()) {
    return { configurado: false, noAr: false, motivo: _motivoFaltando(), url: URL_BASE || null };
  }
  const r = await chamar('/api/sessions', { tempoLimite: 8000 });
  return {
    configurado: true,
    noAr: r.ok,
    url: URL_BASE,
    motivo: r.ok ? null : r.erro,
    sessoes: r.ok && Array.isArray(r.dados) ? r.dados : []
  };
}

// Testa um endereço SEM precisar gravar variável nem redeployar.
// Serve para achar o nome interno do serviço no Coolify: cada tentativa custa
// 2 segundos em vez de um Redeploy inteiro.
async function testar(url, chave) {
  const alvo = normalizarUrl(url);
  if (!alvo) return { ok: false, erro: 'Escreva o endereço do OpenWA.' };
  if (!/^https?:\/\//i.test(alvo)) return { ok: false, erro: 'Endereço inválido.' };
  const usar = String(chave || '').trim() || API_KEY;
  if (!usar) return { ok: false, url: alvo, erro: 'Escreva também a chave (API_MASTER_KEY do OpenWA).' };

  const ctrl = new AbortController();
  const relogio = setTimeout(function () { ctrl.abort(); }, 8000);
  try {
    const r = await fetch(alvo + '/api/sessions', {
      headers: { 'X-API-Key': usar, 'Accept': 'application/json' },
      signal: ctrl.signal
    });
    if (r.status === 401 || r.status === 403) {
      return { ok: false, url: alvo, achou: true, erro: 'O endereço está certo, mas a CHAVE está errada. Confira o API_MASTER_KEY do OpenWA.' };
    }
    if (!r.ok) return { ok: false, url: alvo, achou: true, erro: 'Respondeu, mas com erro ' + r.status + '.' };
    return { ok: true, url: alvo, erro: null };
  } catch (e) {
    const abortou = e && (e.name === 'AbortError' || /abort/i.test(String(e.message || '')));
    return {
      ok: false, url: alvo,
      erro: abortou
        ? 'Ninguém respondeu neste endereço em 8 segundos. Confira o nome do serviço.'
        : 'Não achei nada neste endereço. Confira o nome do serviço no Coolify.'
    };
  } finally { clearTimeout(relogio); }
}

module.exports = {
  configurado, chamar, situacao, testar, normalizarUrl,
  URL_BASE: URL_BASE || null
};
