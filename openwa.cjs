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
//   OPENWA_API_KEY  a chave definida no OpenWA
// ==========================================================================
'use strict';

const URL_BASE = String(process.env.OPENWA_URL || '').replace(/\/+$/, '');
const API_KEY = String(process.env.OPENWA_API_KEY || '');
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

module.exports = {
  configurado, chamar, situacao,
  URL_BASE: URL_BASE || null
};
