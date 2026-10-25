// Dados iniciais e mockups para o sistema ATTOS RH
// Estes dados são carregados no localStorage no primeiro acesso.

// ── NUNCA ESCREVA SENHA NESTE ARQUIVO ──────────────────────────────────────
// Ele vai para o GitHub. As senhas que estavam aqui — inclusive a real do
// administrador — ficaram publicas, e continuam no historico do
// git mesmo depois de removidas. O servidor agora EXIGE a troca no proximo
// login de quem ainda usa alguma delas (SENHAS_PUBLICAS no server.cjs).
// Conta sem senha nao entra — quem administra define a senha em Funcionarios.
// ───────────────────────────────────────────────────────────────────────────
const INITIAL_DATA = {
  // Funcionários internos para controle de acesso/login e permissões
  funcionarios: [
    {
      id: 'func-1',
      nome: 'Administrador',
      email: 'admin@attosrh.com.br',
      login: 'admin',
      senha: '',   // o servidor define pela variavel ADMIN_SENHA (nunca aqui)
      departamento: 'administracao',
      cargo: 'Administrador Geral',
      status: 'ativo',
      representanteDepto: false,
      podeEditarPortalPublico: true,
      permissoes: {
        dashboard: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        vagas: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        banco_talentos: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        selecao: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        dp: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        comissao: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        relatorios: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        graficos: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        candidatos: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        funcionarios: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        sistema: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        exportacoes: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true }
      }
    },
    {
      id: 'func-2',
      nome: 'Maria da Seleção',
      email: 'maria@attosrh.com.br',
      login: 'maria',
      senha: '',   // sem senha de fabrica: quem cria a conta define
      departamento: 'selecao',
      cargo: 'Representante da Seleção',
      status: 'ativo',
      representanteDepto: true,
      permissoes: {
        dashboard: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: false, perms: false },
        vagas: { visualizar: true, criar: true, editar: true, excluir: false, aprovar: true, exportar: false, relatorios: false, perms: false },
        banco_talentos: { visualizar: true, criar: true, editar: true, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        selecao: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: false },
        dp: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        comissao: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        relatorios: { visualizar: true, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: true, perms: false },
        graficos: { visualizar: true, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: true, perms: false },
        candidatos: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: false, perms: false },
        funcionarios: { visualizar: true, criar: true, editar: true, excluir: false, aprovar: true, exportar: false, relatorios: false, perms: true },
        sistema: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        exportacoes: { visualizar: true, criar: false, editar: false, excluir: false, aprovar: false, exportar: true, relatorios: false, perms: false }
      }
    },
    {
      id: 'func-3',
      nome: 'Carlos do DP',
      email: 'carlos@attosrh.com.br',
      login: 'carlos',
      senha: '',   // sem senha de fabrica: quem cria a conta define
      departamento: 'dp',
      cargo: 'Representante do DP',
      status: 'ativo',
      representanteDepto: true,
      permissoes: {
        dashboard: { visualizar: true, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        vagas: { visualizar: true, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        banco_talentos: { visualizar: true, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        selecao: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        dp: { visualizar: true, criar: true, editar: true, excluir: false, aprovar: true, exportar: true, relatorios: true, perms: false },
        comissao: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        relatorios: { visualizar: true, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: true, perms: false },
        graficos: { visualizar: true, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: true, perms: false },
        candidatos: { visualizar: true, criar: false, editar: false, excluir: false, aprovar: true, exportar: true, relatorios: false, perms: false },
        funcionarios: { visualizar: true, criar: true, editar: true, excluir: false, aprovar: true, exportar: false, relatorios: false, perms: true },
        sistema: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        exportacoes: { visualizar: true, criar: false, editar: false, excluir: false, aprovar: false, exportar: true, relatorios: false, perms: false }
      }
    },
    {
      id: 'func-4',
      nome: 'Pedro da Comissão',
      email: 'pedro@attosrh.com.br',
      login: 'pedro',
      senha: '',   // sem senha de fabrica: quem cria a conta define
      departamento: 'comissao',
      cargo: 'Analista Financeiro',
      status: 'ativo',
      representanteDepto: false,
      permissoes: {
        dashboard: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        vagas: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        banco_talentos: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        selecao: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        dp: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        comissao: { visualizar: true, criar: true, editar: true, excluir: false, aprovar: false, exportar: true, relatorios: true, perms: false },
        relatorios: { visualizar: true, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: true, perms: false },
        graficos: { visualizar: true, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: true, perms: false },
        candidatos: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        funcionarios: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        sistema: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        exportacoes: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false }
      }
    },
    {
      id: 'func-5',
      nome: 'João Balaf (Admin)',
      email: 'joaobalaf@attosrh.com.br',
      login: 'joaobalaf',
      senha: '',   // sem senha de fabrica: quem cria a conta define
      departamento: 'administracao',
      cargo: 'Administrador Geral',
      status: 'ativo',
      representanteDepto: false,
      podeEditarPortalPublico: true,
      permissoes: {
        dashboard: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        vagas: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        banco_talentos: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        selecao: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        dp: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        comissao: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        relatorios: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        graficos: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        candidatos: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        funcionarios: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        sistema: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true },
        exportacoes: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true, exportar: true, relatorios: true, perms: true }
      }
    },
    {
      // DESATIVADA. Esta conta existia para a clinica parceira usar a tela de
      // Exame Medico, que saiu do sistema -- sem ela a conta nao enxerga nada
      // util. Fica como 'inativo' em vez de ser apagada: o historico de quem
      // fez o que continua resolvendo o nome nos registros antigos.
      // Para reativar: Funcionarios > a conta > Ativar.
      id: 'func-6',
      nome: 'Clínica Médica parceira',
      email: '',
      login: 'clinica',
      senha: '',   // sem senha de fabrica: quem cria a conta define
      departamento: 'clinica',
      cargo: 'Clínica Parceira',
      status: 'inativo',
      representanteDepto: false,
      podeEditarPortalPublico: false,
      permissoes: {
        dashboard: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        vagas: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        banco_talentos: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        selecao: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        dp: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        comissao: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        relatorios: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        graficos: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        candidatos: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        funcionarios: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        sistema: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false },
        exportacoes: { visualizar: false, criar: false, editar: false, excluir: false, aprovar: false, exportar: false, relatorios: false, perms: false }
      }
    }
  ],

  // Recrutadores do sistema com suas respectivas cores de identificação visual
  recrutadores: [
    { id: 'maiara', nome: 'Maiara', cor: 'purple', corHex: '#a855f7', whatsapp: '' },
    { id: 'joao', nome: 'João', cor: 'green', corHex: '#22c55e', whatsapp: '' },
    { id: 'sara', nome: 'Sara', cor: 'blue', corHex: '#3b82f6', whatsapp: '' },
    { id: 'carla', nome: 'Carla', cor: 'orange', corHex: '#f97316', whatsapp: '' }
  ],

  // Empresas parceiras atendidas
  // Sem clientes de exemplo: bloqueavam o cadastro dos clientes reais de mesmo nome.
  empresas: [],

  // Vagas com modelagem de demanda por empresa
  // Sem vagas de exemplo: as vagas reais sao criadas pela tela.
  vagas: [],

  // Candidatos cadastrados no sistema e suas respectivas etapas
  // status: 'pendente' | 'em_analise' | 'entrevista' | 'aprovado' (etapa DP) | 'reprovado' | 'contratado'
  // Sem candidatos de exemplo (apontavam para as vagas de exemplo).
  candidatos: [],

  // Registro histórico de comissões (Contratações concluídas)
  // Corresponde a 10 contratações totais na imagem 3/4
  contratacoes: [
    { id: 'c-1', recrutadorId: 'maiara', candidatoNome: 'João Silva', empresaNome: 'Mercado Livre', data: '04/02/2026' },
    { id: 'c-2', recrutadorId: 'joao', candidatoNome: 'Lucas Barbosa', empresaNome: 'Amazon', data: '10/02/2026' },
    { id: 'c-3', recrutadorId: 'sara', candidatoNome: 'Ana Costa', empresaNome: 'Shopee', data: '15/02/2026' },
    { id: 'c-4', recrutadorId: 'maiara', candidatoNome: 'Pedro Souza', empresaNome: 'Mercado Livre', data: '20/02/2026' },
    { id: 'c-5', recrutadorId: 'joao', candidatoNome: 'Fernanda Alves', empresaNome: 'DHL Express', data: '25/02/2026' },
    { id: 'c-6', recrutadorId: 'sara', candidatoNome: 'Camila Rocha', empresaNome: 'Magazine Luiza', data: '01/03/2026' },
    { id: 'c-7', recrutadorId: 'maiara', candidatoNome: 'Carlos Oliveira', empresaNome: 'Amazon', data: '05/03/2026' },
    { id: 'c-8', recrutadorId: 'maiara', candidatoNome: 'Ricardo Pereira', empresaNome: 'Shopee', data: '10/03/2026' },
    { id: 'c-9', recrutadorId: 'joao', candidatoNome: 'Maria Santos', empresaNome: 'Amazon', data: '18/03/2026' },
    { id: 'c-10', recrutadorId: 'sara', candidatoNome: 'Rafael Dias', empresaNome: 'Mercado Livre', data: '24/03/2026' }
  ],

  // Log de atividades recentes para o painel principal (adicional premium)
  atividades: [
    { id: 'act-1', descricao: 'João Silva cadastrou-se pelo portal de vagas', data: 'Há 5 min' },
    { id: 'act-2', descricao: 'Recrutador João moveu Ricardo Pereira para Departamento Pessoal', data: 'Há 2 horas' },
    { id: 'act-3', descricao: 'Recrutadora Sara finalizou a contratação de Rafael Dias', data: 'Ontem' },
    { id: 'act-4', descricao: 'Recrutadora Carla reprovou Fernanda Alves (RG ilegível)', data: 'Há 2 dias' }
  ],

  // Motivos de inaptidão cadastrados pelo admin
  motivosInaptidao: [
    { id: 'mot-1', descricao: 'Antecedente criminal', criadoPor: 'Administrador', dataCriacao: '2026-01-01' },
    { id: 'mot-2', descricao: 'Restrição em empresa parceira', criadoPor: 'Administrador', dataCriacao: '2026-01-01' },
    { id: 'mot-3', descricao: 'CPF irregular / bloqueado', criadoPor: 'Administrador', dataCriacao: '2026-01-01' },
    { id: 'mot-4', descricao: 'Comportamento inadequado em processo anterior', criadoPor: 'Administrador', dataCriacao: '2026-01-01' }
  ],

  // Banco de candidatos inaptos (CPFs bloqueados)
  inaptos: [],

  // Sistema de senhas / fila de atendimento
  fila: {
    contadores: { selecao: 0, dp: 0, geral: 0 },
    senhas: [],
    ultimaChamada: null
  },

  // Histórico Geral de Auditoria Administrativa do Sistema (Logs Globais)
  logs: [
    {
      id: 'log-1',
      data: '21/05/2026 09:30:15',
      usuario: 'Administrador',
      acao: 'Acessou o sistema ATTOS RH',
      categoria: 'sistema'
    },
    {
      id: 'log-2',
      data: '21/05/2026 10:15:22',
      usuario: 'Maria da Seleção',
      acao: 'Criou nova demanda de 50 vagas para Mercado Livre (Operador de Logística - CGH7)',
      categoria: 'vagas'
    },
    {
      id: 'log-3',
      data: '21/05/2026 11:05:40',
      usuario: 'Maria da Seleção',
      acao: 'Aprovou a ficha de João Silva e subiu para validação do Departamento Pessoal (DP)',
      categoria: 'selecao'
    },
    {
      id: 'log-4',
      data: '21/05/2026 11:20:10',
      usuario: 'Carlos do DP',
      acao: 'Exportou dossiê digital completo (Ficha e Documentos) de João Silva',
      categoria: 'exportacoes'
    }
  ],
  portalSettings: {
    tituloPrincipal: "Sua próxima oportunidade começa aqui.",
    subtituloPrincipal: "Encontre vagas de logística, operação e serviços em diferentes regiões.",
    banners: [
      {
        id: "banner-1",
        titulo: "Sua próxima oportunidade começa aqui.",
        subtitulo: "Encontre vagas de logística, operação e serviços em diferentes regiões.",
        botaoTexto: "Ver vagas abertas"
      },
      {
        id: "banner-2",
        titulo: "Mais de 300 oportunidades disponíveis",
        subtitulo: "Contratação rápida, diferentes turnos e possibilidade de início imediato.",
        botaoTexto: "Quero me cadastrar"
      },
      {
        id: "banner-3",
        titulo: "Vem trabalhar nas grandes operações do Brasil",
        subtitulo: "Processos simples, atendimento humanizado e oportunidades reais.",
        botaoTexto: "Encontrar oportunidade"
      }
    ],
    quemSomos: {
      titulo: "Mais do que empregos, conectamos pessoas a novas oportunidades.",
      texto: "A ATTOS RH faz parte do ATTOS RH e atua conectando profissionais às oportunidades de grandes operações em diferentes regiões do Brasil.\n\nSomos especializados em processos de recrutamento ágeis, organizados e humanizados, com forte atuação nos setores de logística, e-commerce, armazenagem, transporte, indústria, varejo e serviços.\n\nNossa estrutura conta com equipes treinadas, processos próprios e tecnologia para atender desde contratações individuais até grandes demandas em curto espaço de tempo, sempre com responsabilidade, qualidade e atenção às pessoas.\n\nPara nós, cada candidato representa uma história, uma família e uma nova possibilidade de crescimento. Por isso, buscamos tornar o processo de contratação mais simples, rápido, transparente e acessível.\n\nNa ATTOS RH, a qualidade encontra a agilidade.",
      fraseFinal: "Vem ser ATTOS RH. Sua próxima oportunidade pode começar aqui."
    },
    missao: {
      titulo: "Nossa missão",
      texto: "Conectar profissionais às oportunidades adequadas, oferecendo processos de contratação ágeis, organizados e humanizados, ao mesmo tempo em que atendemos as necessidades de grandes operações com qualidade, responsabilidade e precisão."
    },
    compromisso: {
      titulo: "Compromisso com pessoas e oportunidades",
      texto: "Na ATTOS RH, entendemos que por trás de cada cadastro existe uma pessoa buscando uma nova oportunidade. Nosso compromisso é oferecer processos mais simples, comunicação clara e atendimento próximo, ajudando candidatos a encontrarem vagas compatíveis com seu perfil, sua região e sua disponibilidade.",
      frase: "Onde a qualidade encontra a agilidade."
    },
    diferenciais: [
      "Contratações ágeis",
      "Atendimento humanizado",
      "Processos simplificados",
      "Vagas em grandes operações",
      "Diferentes turnos",
      "Oportunidades em diversas regiões",
      "Comunicação clara",
      "Tecnologia no recrutamento",
      "Acompanhamento do candidato",
      "Possibilidade de início rápido",
      "Pagamentos organizados e pontuais (Com possibilidade de antecipar processos ou pagamentos em certas operações conforme as condições permitirem)"
    ],
    // NUMEROS E CONTATOS EM BRANCO, DE PROPOSITO.
    // Os valores que estavam aqui (telefone, endereco da Lapa, Instagram e os
    // contadores "+300 / 15+ / 50+ / 1000+") eram da empresa do sistema
    // original. Publicar aquilo sob a marca ATTOS RH seria afirmar coisa que
    // nao e verdade e divulgar o contato de outra empresa.
    // Preencha pela aba SITE -- o que for escrito la fica no state.json e NAO
    // depende deste arquivo. Secao do portal com campo vazio nao aparece.
    contadores: [],
    contatos: {
      whatsapp: "",
      telefone: "",
      email: "",
      instagram: "",
      endereco: "",
      horarios: ""
    },
    perguntasFrequentes: [
      { id: "faq-1", pergunta: "Como faço para me candidatar?", resposta: "Você pode se candidatar diretamente pelo nosso portal selecionando a vaga desejada e preenchendo o formulário de inscrição." },
      { id: "faq-2", pergunta: "Preciso pagar alguma taxa?", resposta: "A ATTOS RH não cobra do candidato para participar dos processos seletivos. O processo é 100% gratuito." },
      { id: "faq-3", pergunta: "A ATTOS RH cobra para participar?", resposta: "Não, a participação em qualquer processo seletivo da ATTOS RH é totalmente gratuita." },
      { id: "faq-4", pergunta: "Preciso ter experiência?", resposta: "Temos oportunidades tanto para profissionais experientes quanto vagas que não exigem experiência anterior." },
      { id: "faq-5", pergunta: "Como saberei se fui chamado?", resposta: "Nossa equipe entrará em contato diretamente por WhatsApp, telefone ou e-mail cadastrado." },
      { id: "faq-6", pergunta: "Posso me candidatar a mais de uma vaga?", resposta: "Sim, porém recomendamos focar nas oportunidades compatíveis com seu perfil e localidade." },
      { id: "faq-7", pergunta: "A entrevista é online ou presencial?", resposta: "Dependendo da vaga, a entrevista pode ser online ou presencial em uma de nossas unidades." },
      { id: "faq-8", pergunta: "Quais documentos são necessários?", resposta: "Geralmente são solicitados RG, CPF, PIS/NIS, comprovante de residência e dados bancários." },
      { id: "faq-9", pergunta: "Como funciona o fretado?", resposta: "Para vagas em logística com fretado disponível, o transporte é oferecido a partir de pontos predeterminados na região." },
      { id: "faq-10", pergunta: "Como atualizo meus dados?", resposta: "Você pode entrar em contato com nossa equipe de suporte pelo WhatsApp do portal." },
      { id: "faq-11", pergunta: "Como falo com a equipe?", resposta: "Utilize nossos canais oficiais de contato (telefone, e-mail ou botão de WhatsApp do site)." }
    ],
    secoesVisiveis: {
      banner: true,
      busca: true,
      vagasQuentes: true,
      vagasAbertas: true,
      comoFunciona: true,
      diferenciais: true,
      numeros: true,
      quemSomos: true,
      areasAtuacao: true,
      perguntasFrequentes: true,
      contato: true
    },
    secoesOrdem: [
      "banner",
      "busca",
      "vagasQuentes",
      "vagasAbertas",
      "comoFunciona",
      "diferenciais",
      "numeros",
      "quemSomos",
      "areasAtuacao",
      "perguntasFrequentes",
      "contato"
    ]
  },

  // Exames médicos admissionais
  examesMedicos: []
};
