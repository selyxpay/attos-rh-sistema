// ==========================================================================
// PERMISSÃO POR TELA — fonte única, usada pelo NAVEGADOR e pelo SERVIDOR
// ==========================================================================
//
// O problema que isto resolve: até aqui o controle por tela existia SÓ no
// navegador. O servidor tinha um bit — "tem sessão ou não" — e o
// POST /api/state aceitava qualquer alteração de qualquer sessão. Esconder a
// aba do menu não protegia nada: a rota continuava aberta, e quem soubesse
// chamá-la lia e gravava tudo.
//
// Agora cada funcionário tem um mapa `telas`, de aba para nível:
//
//     'nao'    — sem acesso: a aba não aparece e os dados dela não descem
//     'ver'    — só ver: a tela abre, mas o servidor recusa gravar
//     'editar' — ver e editar
//
// Chave ausente = 'nao'. Aba nova nasce fechada, de propósito.
//
// COMPATIBILIDADE (o ponto mais importante): quem já existe no state.json não
// tem o campo `telas`. Para essas contas, o nível é DERIVADO das regras de
// hoje, aba por aba, reproduzindo exatamente o que o menu já mostrava. Ninguém
// perde nem ganha acesso na virada. Quando o administrador salvar `telas`
// daquela pessoa, o mapa passa a valer e a derivação deixa de ser usada.
//
// Este arquivo é carregado por <script> no index.html e por require() no
// server.cjs. Nada de framework, nada de build.

(function (raiz) {
  'use strict';

  // As 20 abas do painel, na ordem do menu. O id é o mesmo `data-aba` que o
  // index.html já usa — não existe mais tabela de "área" no meio do caminho.
  var TELAS = [
    { id: 'dashboard',        nome: 'Dashboard' },
    { id: 'vagas',            nome: 'Vagas' },
    { id: 'banco-talentos',   nome: 'Banco de Talentos' },
    { id: 'selecao',          nome: 'Seleção' },
    { id: 'depto-pessoal',    nome: 'Depto. Pessoal' },
    { id: 'fluxo-financeiro', nome: 'Fluxo Financeiro' },
    { id: 'whatsapp',         nome: 'WhatsApp Oficial' },
    { id: 'bot',              nome: 'Bot do WhatsApp' },
    { id: 'funcionarios',     nome: 'Funcionários' },
    { id: 'controle-acesso',  nome: 'Controle de Acesso (horários)' },
    { id: 'cadastros-exata',  nome: 'Cadastros Exata' },
    { id: 'documentos',       nome: 'Documentos' },
    { id: 'relatorios',       nome: 'Relatórios' },
    { id: 'site',             nome: 'Site' },
    { id: 'meu-painel',       nome: 'Meu Painel' },
    { id: 'fila',             nome: 'Senhas (Fila)' },
    { id: 'auditoria',        nome: 'Auditoria' },
    { id: 'inaptos',          nome: 'Inaptos' },
    { id: 'configuracoes',    nome: 'Configurações' },
    { id: 'lixeira',          nome: 'Lixeira' }
  ];
  var IDS = TELAS.map(function (t) { return t.id; });

  var NIVEIS = ['nao', 'ver', 'editar'];

  function ehMestreLogin(login) {
    var l = String(login || '').toLowerCase();
    return l === 'joaobalaf' || l === 'admin';
  }
  function ehAdmin(f) {
    return !!(f && (ehMestreLogin(f.login) || f.departamento === 'administracao'));
  }

  // ── DE QUAL TELA É CADA CHAVE DO ESTADO ──────────────────────────────────
  // Usado para filtrar a LEITURA e validar a ESCRITA do /api/state. Mesma
  // ideia do filtro de empresas sigilosas, que já existia: o servidor devolve
  // menos para quem não pode ver, e repõe o que a pessoa não podia mudar.
  // Chave que não está aqui não é filtrada (vai para todos) — foi uma escolha
  // conservadora: é melhor deixar passar uma chave esquecida do que quebrar
  // uma tela por falta de dado.
  var CHAVES_POR_TELA = {
    vagas:                ['vagas', 'dashboard', 'site'],
    candidatos:           ['selecao', 'depto-pessoal', 'dashboard', 'lixeira', 'documentos', 'site'],
    bancoTalentos:        ['banco-talentos', 'lixeira'],
    contratacoes:         ['dashboard', 'depto-pessoal'],
    recrutadores:         ['meu-painel', 'selecao', 'dashboard'],
    atividades:           ['dashboard'],
    // ── CHAVES DE MÓDULO REMOVIDO ─────────────────────────────────────────
    // Equipamentos, Exame Médico, Margem e Diária saíram do sistema, mas o
    // DADO deles continua no state.json. Estas linhas APONTAM DE PROPÓSITO
    // para telas que não existem mais: como ninguém tem uma tela que saiu da
    // lista TELAS, o filtro devolve [] para todo mundo na leitura e repõe o
    // valor do servidor na gravação. Ou seja, o histórico fica guardado,
    // invisível e intocável pela interface.
    // APAGAR estas linhas faria o contrário: chave não mapeada passa para
    // TODOS (ver o comentário do CHAVES_POR_TELA acima).
    examesMedicos:        ['exame-medico'],
    equipamentos:         ['equipamentos'],
    relatoriosEquip:      ['equipamentos'],
    fluxosFinanceiros:    ['fluxo-financeiro'],
    proximoFluxoNum:      ['fluxo-financeiro'],
    tiposPagamentoFluxo:  ['fluxo-financeiro', 'configuracoes'],
    ffWorkflow:           ['fluxo-financeiro', 'configuracoes'],
    ffSigiloLogins:       ['configuracoes'],
    botWhatsapp:          ['bot'],
    respostasRapidas:     ['whatsapp'],
    ffEmpresas:           ['cadastros-exata', 'fluxo-financeiro'],
    ffTomadores:          ['cadastros-exata', 'fluxo-financeiro'],
    ffClientes:           ['cadastros-exata', 'fluxo-financeiro'],
    ffCadastrosVersao:    ['cadastros-exata', 'fluxo-financeiro'],
    empresas:             ['vagas', 'cadastros-exata', 'site'],
    tomadores:            ['cadastros-exata'],
    clientes:             ['cadastros-exata'],
    precificacao:         ['margem'],
    inaptos:              ['inaptos'],
    motivosInaptidao:     ['inaptos'],
    trabalhadoresDiaria:  ['diaria'],
    diarias:              ['diaria'],
    presencasDiaria:      ['diaria'],
    diariaConfig:         ['diaria'],
    controleAcesso:       ['controle-acesso'],
    config:               ['configuracoes'],
    tiposContratacao:     ['configuracoes', 'depto-pessoal'],
    vagaFormConfig:       ['configuracoes', 'site'],
    portalSettings:       ['site'],
    _docsMeta:            ['documentos'],
    logs:                 ['auditoria'],
    funcionarios:         ['funcionarios']
  };

  // Campos do funcionário que só vão para quem administra pessoas. Quem não
  // tem a tela Funcionários ainda recebe a lista (outras telas mostram nome
  // de autor e de aprovador), mas numa versão enxuta.
  var CAMPOS_FUNC_PUBLICOS = ['id', 'nome', 'nomeExibicao', 'login', 'departamento', 'cargo', 'status', 'corHex'];

  // ── DERIVAÇÃO: O QUE ESTA PESSOA JÁ ENXERGA HOJE ─────────────────────────
  // Reproduz a regra que o MENU aplica hoje (isAbaAutorizada + os blocos
  // manuais do verificarPermissoesMenu). Onde as duas divergiam, vale a do
  // MENU, que é o que a pessoa consegue clicar de fato — assim ninguém perde
  // o que usava nem ganha o que não conseguia alcançar.
  function _perm(f, area, acao) {
    if (!f) return false;
    if (ehMestreLogin(f.login)) return true;
    var p = f.permissoes;
    return !!(p && p[area] && p[area][acao] === true);
  }
  function _permFluxo(f, chave) {
    return !!(f && f.permissoesFluxo && f.permissoesFluxo[chave] === true);
  }
  function _ehResponsavelFF(f, dados, etapa) {
    if (!f) return false;
    var wf = (dados && dados.ffWorkflow) || {};
    var r = (wf[etapa] && wf[etapa].responsaveis) || [];
    return Array.isArray(r) && r.indexOf(f.login) >= 0;
  }
  function _temVinculoRecrutador(f, dados) {
    var recs = (dados && dados.recrutadores) || [];
    if (!Array.isArray(recs) || !f) return false;
    return recs.some(function (r) {
      return (r && r.usuarioId && r.usuarioId === f.id) ||
             (r && r.loginVinculado && r.loginVinculado === f.login);
    });
  }

  function _vePorRegraAntiga(f, dados, aba) {
    if (!f) return false;
    if (aba === 'meu-painel') return true;
    if (aba === 'fila') return true;
    // Estas quatro, no menu de hoje, são só de quem administra. A regra geral
    // (área 'sistema') deixava entrar por chamada de função, mas o item ficava
    // escondido — ou seja, na prática a pessoa não tinha.
    if (aba === 'lixeira' || aba === 'cadastros-exata' ||
        aba === 'inaptos' || aba === 'configuracoes') return ehAdmin(f);
    if (aba === 'controle-acesso') {
      return ehAdmin(f) || !!(f.permissoesEspeciais && f.permissoesEspeciais.podeGerenciarHorariosAcesso);
    }
    if (aba === 'fluxo-financeiro') {
      return ehMestreLogin(f.login)
        || ['dp', 'administracao', 'financeiro'].indexOf(f.departamento) >= 0
        || _perm(f, 'fluxo_financeiro', 'visualizar')
        || _permFluxo(f, 'lancarEnviar') || _permFluxo(f, 'verTodos')
        || _permFluxo(f, 'aprovarSupervisao') || _permFluxo(f, 'aprovarGestao')
        || _permFluxo(f, 'processarPagamento')
        || _ehResponsavelFF(f, dados, 'criar') || _ehResponsavelFF(f, dados, 'coordenacao')
        || _ehResponsavelFF(f, dados, 'gestao') || _ehResponsavelFF(f, dados, 'financeiro');
    }
    if (aba === 'whatsapp') return ehAdmin(f) || _perm(f, 'whatsapp', 'visualizar');
    // Tela NOVA: nasce fechada. Só admin vê, até alguém liberar na matriz.
    if (aba === 'bot') return ehAdmin(f);
    if (aba === 'funcionarios') return ehAdmin(f) || _perm(f, 'funcionarios', 'visualizar');
    if (aba === 'auditoria') return ehAdmin(f) || _perm(f, 'sistema', 'visualizar');
    if (ehMestreLogin(f.login)) return true;
    if (f.departamento === 'administracao') return true;
    // Regra geral por área (o ABA_PARA_AREA que existia no app.js).
    var AREA = {
      'dashboard': 'dashboard', 'vagas': 'vagas', 'banco-talentos': 'banco_talentos',
      'selecao': 'selecao', 'depto-pessoal': 'dp', 'relatorios': 'relatorios',
      'site': 'candidatos', 'documentos': 'dp'
    };
    var area = AREA[aba];
    if (area && f.permissoes && f.permissoes[area]) {
      return f.permissoes[area].visualizar === true;
    }
    // Contas antigas sem permissões: cai no departamento.
    var depto = f.departamento;
    if (depto === 'selecao') {
      if (_temVinculoRecrutador(f, dados)) return aba === 'meu-painel';
      return ['dashboard', 'vagas', 'banco-talentos', 'selecao', 'site', 'meu-painel'].indexOf(aba) >= 0;
    }
    if (depto === 'dp') return ['depto-pessoal', 'banco-talentos'].indexOf(aba) >= 0;
    return false;
  }

  // Nível derivado: quem já podia MEXER naquela área continua podendo.
  function _nivelPorRegraAntiga(f, dados, aba) {
    if (!_vePorRegraAntiga(f, dados, aba)) return 'nao';
    if (ehAdmin(f)) return 'editar';
    var AREA = {
      'dashboard': 'dashboard', 'vagas': 'vagas', 'banco-talentos': 'banco_talentos',
      'selecao': 'selecao', 'depto-pessoal': 'dp', 'relatorios': 'relatorios',
      'site': 'candidatos', 'documentos': 'dp',
      'funcionarios': 'funcionarios', 'auditoria': 'sistema',
      'fluxo-financeiro': 'fluxo_financeiro', 'whatsapp': 'whatsapp'
    };
    var area = AREA[aba];
    var p = f && f.permissoes && area ? f.permissoes[area] : null;
    if (p && (p.criar === true || p.editar === true || p.excluir === true || p.aprovar === true)) return 'editar';
    // ⚠️ PADRÃO PROVISÓRIO — ver SISTEMA-VISAO-GERAL.md, seção 4.1.
    // Sem matriz preenchida (conta antiga), quem enxergava a tela também
    // trabalhava nela — era assim que o sistema funcionava. O state.json de
    // produção só tem 12 das 16 áreas, e há conta com `permissoes: {}`.
    // Devolver 'nao' aqui tiraria o DP de Equipamentos e o Financeiro do
    // Fluxo Financeiro no dia do deploy.
    // O padrão CERTO é 'nao'. O caminho: completar as 16 áreas em todos os
    // funcionários, conferir que nenhuma ficou em branco, e só então trocar a
    // linha abaixo por `return 'nao'`. O documento tem o passo a passo.
    if (!p) return 'editar';
    return 'ver';
  }

  // ── A FUNÇÃO PRINCIPAL ───────────────────────────────────────────────────
  // Devolve { aba: nivel } para as 20 abas.
  function telasDoFuncionario(f, dados) {
    var saida = {};
    if (!f) { IDS.forEach(function (id) { saida[id] = 'nao'; }); return saida; }
    // Mestre: acesso total, antes de qualquer consulta ao mapa.
    if (ehMestreLogin(f.login)) { IDS.forEach(function (id) { saida[id] = 'editar'; }); return saida; }
    var mapa = f.telas;
    var temMapa = mapa && typeof mapa === 'object' && !Array.isArray(mapa);
    IDS.forEach(function (id) {
      if (temMapa) {
        var n = mapa[id];
        saida[id] = (NIVEIS.indexOf(n) >= 0) ? n : 'nao';
      } else {
        saida[id] = _nivelPorRegraAntiga(f, dados, id);
      }
    });
    return saida;
  }

  function podeVerTela(f, dados, aba) {
    var n = telasDoFuncionario(f, dados)[aba];
    return n === 'ver' || n === 'editar';
  }
  function podeEditarTela(f, dados, aba) {
    return telasDoFuncionario(f, dados)[aba] === 'editar';
  }

  // Telas donas de uma chave do estado, considerando o nível exigido.
  function _temAlgumaTela(telas, donas, nivelMin) {
    for (var i = 0; i < donas.length; i++) {
      var n = telas[donas[i]];
      if (nivelMin === 'ver' && (n === 'ver' || n === 'editar')) return true;
      if (nivelMin === 'editar' && n === 'editar') return true;
    }
    return false;
  }

  // ── LEITURA: tira do payload o que a pessoa não pode ver ─────────────────
  // Lista some como [] (não como ausente) porque é o que as telas esperam —
  // mesma escolha que o subconjunto público já fazia.
  function filtrarEstadoPorTelas(dados, f) {
    if (!dados || !f) return dados;
    if (ehMestreLogin(f.login)) return dados;
    var telas = telasDoFuncionario(f, dados);
    var saida = {};
    Object.keys(dados).forEach(function (k) {
      var donas = CHAVES_POR_TELA[k];
      if (!donas) { saida[k] = dados[k]; return; }          // chave não mapeada: passa
      var pode = _temAlgumaTela(telas, donas, 'ver');
      if (pode) { saida[k] = dados[k]; return; }
      if (k === 'funcionarios') {
        // Nunca vazia: outras telas mostram nome de autor e de aprovador.
        saida[k] = (dados[k] || []).map(function (x) {
          if (!x) return x;
          var enxuto = {};
          CAMPOS_FUNC_PUBLICOS.forEach(function (c) { if (x[c] !== undefined) enxuto[c] = x[c]; });
          return enxuto;
        });
        return;
      }
      saida[k] = Array.isArray(dados[k]) ? [] : undefined;
      if (saida[k] === undefined) delete saida[k];
    });
    return saida;
  }

  // ── ESCRITA: repõe do servidor o que a pessoa não pode editar ────────────
  // Mesmo princípio do filtro de empresas sigilosas: não precisa comparar nem
  // descobrir o que o cliente tentou mudar. O valor gravado é o do servidor.
  function reporChavesNaoEditaveis(novo, antes, f) {
    if (!novo || !f) return novo;
    if (ehMestreLogin(f.login)) return novo;
    var telas = telasDoFuncionario(f, antes || novo);
    Object.keys(CHAVES_POR_TELA).forEach(function (k) {
      var donas = CHAVES_POR_TELA[k];
      if (_temAlgumaTela(telas, donas, 'editar')) return;    // pode editar: deixa
      if (k === 'logs') {
        // Auditoria é só de ACRESCENTAR: toda ação do sistema grava um log,
        // inclusive de quem não pode abrir a tela de Auditoria. Então aqui o
        // servidor mantém os logs dele e aceita apenas entradas NOVAS —
        // nunca alteração nem remoção.
        var antigos = (antes && Array.isArray(antes.logs)) ? antes.logs : [];
        var mandados = Array.isArray(novo.logs) ? novo.logs : [];
        var vistos = {};
        antigos.forEach(function (l) { if (l && l.id != null) vistos[String(l.id)] = true; });
        var novos = mandados.filter(function (l) { return l && l.id != null && !vistos[String(l.id)]; });
        novo.logs = novos.concat(antigos);
        if (novo.logs.length > 2000) novo.logs = novo.logs.slice(0, 2000);
        return;
      }
      if (antes && Object.prototype.hasOwnProperty.call(antes, k)) novo[k] = antes[k];
      else delete novo[k];
    });
    return novo;
  }

  var api = {
    TELAS: TELAS,
    IDS: IDS,
    NIVEIS: NIVEIS,
    CHAVES_POR_TELA: CHAVES_POR_TELA,
    ehMestreLogin: ehMestreLogin,
    ehAdmin: ehAdmin,
    telasDoFuncionario: telasDoFuncionario,
    podeVerTela: podeVerTela,
    podeEditarTela: podeEditarTela,
    filtrarEstadoPorTelas: filtrarEstadoPorTelas,
    reporChavesNaoEditaveis: reporChavesNaoEditaveis
  };

  raiz.RTTelas = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
