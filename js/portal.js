/* ==========================================================================
   VEM SER R&T - PORTAL PUBLICO JS
   ========================================================================== */

'use strict';

const STATE_KEY = 'rt_empregos_data';
let state = null;
let _rtUpsertIds = [];

// Estado local da candidatura no drawer
let currentStep = 1;
const totalSteps = 5;
const uploadedDocs = {};
let selectedVaga = null; // Vaga ativa para candidatura
let recrutadorLinkId = null; // Recrutador detectado na URL (?rec=...)

// Carrega o estado localmente ou através da nuvem se configurado
function loadState() {
  try {
    state = JSON.parse(localStorage.getItem(STATE_KEY));
  } catch (e) {
    state = null;
  }
}

function saveState() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Erro ao salvar estado local:', e);
  }
  
  if (window.RTCloud && window.RTCloud.configured) {
    window.RTCloud.saveState(state, { merge: true, upsertIds: _rtUpsertIds });
    window.RTCloud.flush();
  }
}

// Slug Generator
function generateSlug(cargo, local) {
  const clean = str => String(str ?? '').toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9]+/g, '-')     // substitui não alfa-num por hífen
    .replace(/(^-|-$)/g, '');        // apara hífens nas pontas
  return `${clean(cargo)}-${clean(local)}`;
}

// Inicializador
document.addEventListener('DOMContentLoaded', async () => {
  // Sincroniza com Firebase se disponível
  if (window.RTCloud && window.RTCloud.configured) {
    try {
      await window.RTCloud.init({
        onRemoteUpdate: (d) => {
          if (d) {
            state = d;
            try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch(e){}
            renderPortal();
          }
        }
      });
      const nuvem = await window.RTCloud.loadState();
      if (nuvem) {
        state = nuvem;
        try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch(e){}
      }
    } catch (e) {
      console.error('[RT Nuvem]', e);
    }
  }

  loadState();

  // Se o estado não existir, inicializar um padrão básico
  if (!state) {
    state = { vagas: [], candidatos: [], recrutadores: [], fila: { contadores: { selecao: 0, dp: 0, geral: 0 }, senhas: [] } };
  }

  let needsSave = false;

  // Se portalSettings não existir no estado, define o padrão da R&T
  if (!state.portalSettings) {
    state.portalSettings = {
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
        texto: "A R&T Empregos faz parte do Grupo R&T e atua conectando profissionais às oportunidades de grandes operações em diferentes regiões do Brasil.\n\nSomos especializados em processos de recrutamento ágeis, organizados e humanizados, com forte atuação nos setores de logística, e-commerce, armazenagem, transporte, indústria, varejo e serviços.\n\nNossa estrutura conta com equipes treinadas, processos próprios e tecnologia para atender desde contratações individuais até grandes demandas em curto espaço de tempo, sempre com responsabilidade, qualidade e atenção às pessoas.\n\nPara nós, cada candidato representa uma história, uma família e uma nova possibilidade de crescimento. Por isso, buscamos tornar o processo de contratação mais simples, rápido, transparente e acessível.\n\nNa R&T, a qualidade encontra a agilidade.",
        fraseFinal: "Vem ser R&T. Sua próxima oportunidade pode começar aqui."
      },
      missao: {
        titulo: "Nossa missão",
        texto: "Conectar profissionais às oportunidades adequadas, oferecendo processos de contratação ágeis, organizados e humanizados, ao mesmo tempo em que atendemos as necessidades de grandes operações com qualidade, responsabilidade e precisão."
      },
      compromisso: {
        titulo: "Compromisso com pessoas e oportunidades",
        texto: "Na R&T, entendemos que por trás de cada cadastro existe uma pessoa buscando uma nova oportunidade. Nosso compromisso é oferecer processos mais simples, comunicação clara e atendimento próximo, ajudando candidatos a encontrarem vagas compatíveis com seu perfil, sua região e sua disponibilidade.",
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
        "Pagamentos organizados e pontuais"
      ],
      contadores: [
        { id: "cnt-1", numero: "+300", texto: "oportunidades disponíveis" },
        { id: "cnt-2", numero: "15+", texto: "regiões atendidas" },
        { id: "cnt-3", numero: "50+", texto: "grandes operações parceiras" },
        { id: "cnt-4", numero: "1000+", texto: "processos seletivos todos os meses" }
      ],
      contatos: {
        whatsapp: "1136434848",
        telefone: "(11) 3643-4848",
        email: "contato@vemserrt.com.br",
        instagram: "rtempregos",
        endereco: "Rua Dronsfield, 255 — Lapa — São Paulo/SP",
        horarios: "Segunda a Sexta, das 08:00 às 17:48"
      },
      perguntasFrequentes: [
        { id: "faq-1", pergunta: "Como faço para me candidatar?", resposta: "Você pode se candidatar diretamente pelo nosso portal selecionando a vaga desejada e preenchendo o formulário de inscrição." },
        { id: "faq-2", pergunta: "Preciso pagar alguma taxa?", resposta: "A R&T não cobra do candidato para participar dos processos seletivos. O processo é 100% gratuito." },
        { id: "faq-3", pergunta: "A R&T cobra para participar?", resposta: "Não, a participação em qualquer processo seletivo da R&T é totalmente gratuita." },
        { id: "faq-4", pergunta: "Preciso ter experiência?", resposta: "Temos oportunidades tanto para profissionais experientes quanto vagas que não exigem experiência anterior." },
        { id: "faq-5", pergunta: "Como saberei se fui chamado?", resposta: "Nossa equipe entrará em contato diretamente por WhatsApp, telefone ou e-mail cadastrado." }
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
    };
    needsSave = true;
  }

  // Se não houver vagas ou estiver vazio (primeiro acesso sem abrir CRM), inicializa mock de vagas públicas
  if (!state.vagas || state.vagas.length === 0) {
    state.vagas = [
      {
        id: "vaga-mock-1",
        cargo: "Auxiliar de Logística",
        salario: "1.850,00",
        local: "Cajamar - SP",
        escala: "5x2",
        turnos: "Turno A, Turno B",
        beneficios: "Refeição no local, Fretado, Vale Alimentação",
        desc: "Auxiliar nas tarefas operacionais de recebimento, triagem, conferencia e expedição de mercadorias no CD logístico.",
        publicarPortal: true,
        vagaQuente: true,
        inicioImediato: true,
        semExperiencia: true,
        muitasOportunidades: true
      },
      {
        id: "vaga-mock-2",
        cargo: "Operador de Empilhadeira",
        salario: "2.400,00",
        local: "Guarulhos - SP",
        escala: "6x1",
        turnos: "Turno C",
        beneficios: "Refeição no local, VT, Convênio Médico",
        desc: "Operar empilhadeira elétrica retrátil ou a gás para movimentação, armazenagem e abastecimento de linhas operacionais.",
        publicarPortal: true,
        vagaQuente: true,
        inicioImediato: true,
        semExperiencia: false,
        muitasOportunidades: false
      },
      {
        id: "vaga-mock-3",
        cargo: "Auxiliar de Operações",
        salario: "1.780,00",
        local: "Lapa - São Paulo/SP",
        escala: "5x2",
        turnos: "Turno Geral",
        beneficios: "VT, Vale Refeição, Seguro de Vida",
        desc: "Auxiliar na organização do estoque, embalagem, etiquetagem e preparação de pedidos para expedição rápida.",
        publicarPortal: true,
        vagaQuente: false,
        inicioImediato: false,
        semExperiencia: true,
        muitasOportunidades: true
      }
    ];
    needsSave = true;
  }

  if (needsSave) {
    saveState();
  }

  detectRecrutador();
  renderPortal();
  setupDocInputs();
  setupFormMasks();

  // Executa roteamento de URL amigável
  routerCleanUrls();

  // Adiciona listener para fechar modais no ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      fecharDetalhesVaga();
      fecharFormCandidatura();
    }
  });

  // Toggler do menu mobile
  const menuBtn = document.getElementById('menu-toggle-btn');
  const navMenu = document.getElementById('portal-navigation');
  if (menuBtn && navMenu) {
    menuBtn.addEventListener('click', () => {
      navMenu.classList.toggle('active');
    });
    // fecha menu ao clicar nos links
    navMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('active');
      });
    });
  }
  
  // Trata logo click para limpar URL
  const btnLogo = document.getElementById('btn-logo-home');
  if (btnLogo) {
    btnLogo.addEventListener('click', (e) => {
      e.preventDefault();
      history.pushState(null, '', window.location.origin + window.location.pathname.split('/vagas')[0] + 'vemserrt.html');
      fecharDetalhesVaga();
      fecharFormCandidatura();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
});

// Detectar recrutador na query URL (?rec=...)
function detectRecrutador() {
  const params = new URLSearchParams(window.location.search);
  const recId = params.get('rec');
  if (recId) {
    recrutadorLinkId = recId;
  }
}

// Router para URLs amigáveis /vagas/cargo-cidade
function routerCleanUrls() {
  const path = window.location.pathname;
  // Expressão regular para achar /vagas/qualquer-coisa
  const match = path.match(/\/vagas\/([a-zA-Z0-9-]+)/);
  if (match && match[1]) {
    const slug = match[1];
    // Acha a vaga correspondente pelo slug gerado
    const vagasPublicas = (state.vagas || []).filter(v => v.publicarPortal === true);
    const vaga = vagasPublicas.find(v => generateSlug(v.cargo, v.local) === slug);
    if (vaga) {
      setTimeout(() => {
        mostrarDetalhesVaga(vaga.id);
      }, 300);
    }
  }
}

// Renderizador principal do portal
function renderPortal() {
  const container = document.getElementById('portal-sections-container');
  if (!container) return;

  const settings = state.portalSettings || { secoesOrdem: [], secoesVisiveis: {} };
  const ordem = settings.secoesOrdem || [];
  const visiveis = settings.secoesVisiveis || {};

  container.innerHTML = '';

  ordem.forEach(key => {
    if (visiveis[key] !== false) {
      const sectionHtml = getSectionHtml(key);
      if (sectionHtml) {
        container.insertAdjacentHTML('beforeend', sectionHtml);
      }
    }
  });

  // Ativa scripts das seções carregadas
  if (visiveis['banner'] !== false) {
    initBannerCarousel();
  }

  // Renderiza as vagas nos containers injetados
  renderVagasGrids();
}

// Dicionário de HTML para cada seção
function getSectionHtml(key) {
  const settings = state.portalSettings || {};
  const _esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  switch (key) {
    case 'banner':
      const banners = settings.banners || [];
      if (!banners.length) return '';
      const slidesHtml = banners.map((b, idx) => `
        <div class="carousel-slide ${idx === 0 ? 'active' : ''}" style="background-image: url('img/rocket.png');">
          <div class="carousel-content">
            <h1 class="carousel-title">${b.titulo}</h1>
            <p class="carousel-subtitle">${b.subtitulo}</p>
            <a href="#vagas-abertas-anchor" class="carousel-btn">${b.botaoTexto} <i class="fa-solid fa-arrow-right"></i></a>
          </div>
        </div>
      `).join('');

      const dotsHtml = banners.map((b, idx) => `
        <button class="carousel-dot ${idx === 0 ? 'active' : ''}" data-slide="${idx}"></button>
      `).join('');

      return `
        <section class="portal-hero">
          <div class="hero-carousel-container" id="hero-carousel">
            ${slidesHtml}
            <div class="carousel-dots">
              ${dotsHtml}
            </div>
          </div>
        </section>
      `;

    case 'busca':
      // Coleta cidades únicas de vagas públicas para popular o filtro
      const publicVagas = (state.vagas || []).filter(v => v.publicarPortal === true);
      const cidades = [...new Set(publicVagas.map(v => v.local).filter(Boolean))];
      const cidadesOpts = cidades.map(c => `<option value="${_esc(c)}">${_esc(c)}</option>`).join('');

      return `
        <section class="portal-search-bar" id="busca-anchor">
          <form class="search-box-container" onsubmit="executarBusca(event)">
            <div class="search-input-group">
              <label for="search-cargo">O que você procura?</label>
              <div class="search-input-wrapper">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" id="search-cargo" placeholder="Ex: Auxiliar de Logística, Operador...">
              </div>
            </div>
            <div class="search-input-group">
              <label for="search-cidade">Cidade / Região</label>
              <select id="search-cidade">
                <option value="">Todas as Cidades</option>
                ${cidadesOpts}
              </select>
            </div>
            <div class="search-input-group">
              <label for="search-escala">Escala de Trabalho</label>
              <select id="search-escala">
                <option value="">Todas as Escalas</option>
                <option value="5x2">5x2</option>
                <option value="6x1">6x1</option>
                <option value="12x36">12x36</option>
              </select>
            </div>
            <button type="submit" class="btn-search-submit"><i class="fa-solid fa-sliders"></i> Buscar</button>
          </form>
        </section>
      `;

    case 'vagasQuentes':
      return `
        <section class="portal-section-vagas" id="vagas-quentes-anchor">
          <div class="section-title-area">
            <h2>Oportunidades Recomendadas 🔥</h2>
            <p>Vagas com início imediato e alta prioridade de contratação</p>
          </div>
          <div class="vagas-hot-grid" id="vagas-quentes-container">
            <!-- Injetado por renderVagasGrids() -->
          </div>
        </section>
      `;

    case 'vagasAbertas':
      return `
        <section class="portal-section-vagas" id="vagas-abertas-anchor">
          <div class="section-title-area">
            <h2>Todas as Oportunidades Abertas</h2>
            <p>Encontre a vaga ideal para seu perfil nas maiores operações logísticas</p>
          </div>
          <div class="vagas-normal-grid" id="vagas-normais-container">
            <!-- Injetado por renderVagasGrids() -->
          </div>
        </section>
      `;

    case 'comoFunciona':
      return `
        <section class="portal-section-timeline" id="como-funciona-anchor">
          <div class="section-title-area">
            <h2>Como Funciona Nosso Processo?</h2>
            <p>Passo a passo simples desde a candidatura até o seu primeiro dia de trabalho</p>
          </div>
          <div class="timeline-flow">
            <div class="timeline-step">
              <div class="timeline-bubble">1</div>
              <div class="timeline-card">
                <h3>Inscrição Online</h3>
                <p>Escolha a vaga desejada aqui no portal e envie suas informações de forma rápida.</p>
              </div>
            </div>
            <div class="timeline-step">
              <div class="timeline-bubble">2</div>
              <div class="timeline-card">
                <h3>Triagem de Currículo</h3>
                <p>Nossa inteligência e equipe de recrutadores analisam seus dados e perfil.</p>
              </div>
            </div>
            <div class="timeline-step">
              <div class="timeline-bubble">3</div>
              <div class="timeline-card">
                <h3>Entrevista Rápida</h3>
                <p>Entramos em contato para agendar uma entrevista simples por telefone ou WhatsApp.</p>
              </div>
            </div>
            <div class="timeline-step">
              <div class="timeline-bubble">4</div>
              <div class="timeline-card">
                <h3>Validação de Documentos</h3>
                <p>O Departamento Pessoal revisa as fotos e informações de contratação enviadas.</p>
              </div>
            </div>
            <div class="timeline-step">
              <div class="timeline-bubble">5</div>
              <div class="timeline-card">
                <h3>Exame Médico e Integração</h3>
                <p>Encaminhamento para exame médico admissional na clínica parceira da região.</p>
              </div>
            </div>
            <div class="timeline-step">
              <div class="timeline-bubble">6</div>
              <div class="timeline-card">
                <h3>🚀 Contratação!</h3>
                <p>Tudo pronto. Ficha de registro assinada e decolagem autorizada na nova jornada!</p>
              </div>
            </div>
          </div>
        </section>
      `;

    case 'diferenciais':
      const difs = settings.diferenciais || [];
      const difCards = difs.map(d => `
        <div class="diferencial-card">
          <div class="diferencial-icon"><i class="fa-solid fa-circle-check"></i></div>
          <div class="diferencial-info">
            <h4>${_esc(d)}</h4>
            <p>Garantia de organização e suporte da maior agência de recursos humanos.</p>
          </div>
        </div>
      `).join('');

      return `
        <section class="portal-section-diferenciais" id="diferenciais-anchor">
          <div class="section-title-area">
            <h2>Por que escolher a R&amp;T?</h2>
            <p>Conectamos você às maiores empresas parceiras com suporte humanizado e processos ágeis</p>
          </div>
          <div class="diferenciais-grid">
            ${difCards}
          </div>
        </section>
      `;

    case 'numeros':
      const cnts = settings.contadores || [];
      const cntCards = cnts.map(c => `
        <div class="numero-card">
          <h3>${c.numero}</h3>
          <p>${c.texto}</p>
        </div>
      `).join('');

      return `
        <section class="portal-section-numeros" id="numeros-anchor">
          <div class="numeros-container">
            ${cntCards}
          </div>
        </section>
      `;

    case 'quemSomos':
      const qs = settings.quemSomos || {};
      const mis = settings.missao || {};
      const comp = settings.compromisso || {};

      return `
        <section class="portal-section-institucional" id="quem-somos-anchor">
          <div class="portal-inst-container">
            <div class="inst-content">
              <span class="inst-tag">Quem Somos</span>
              <h2 class="inst-title">${qs.titulo}</h2>
              <p class="inst-text">${qs.texto}</p>
              <div class="inst-quote">${qs.fraseFinal}</div>
            </div>
            <div class="inst-img-wrapper">
              <img src="img/logo-rt.png" alt="R&T Empregos Branding" style="max-height: 250px; object-fit: contain; background:#fff; padding: 24px; border:1px solid var(--portal-border);">
            </div>
          </div>

          <div class="portal-inst-container" style="margin-top: 60px;">
            <div class="inst-content">
              <span class="inst-tag">Nossa Missão</span>
              <h3 class="inst-title" style="font-size:24px;">${mis.titulo}</h3>
              <p class="inst-text">${mis.texto}</p>
            </div>
            <div class="inst-content">
              <span class="inst-tag">Nosso Compromisso</span>
              <h3 class="inst-title" style="font-size:24px;">${comp.titulo}</h3>
              <p class="inst-text">${comp.texto}</p>
              <div class="inst-quote" style="border-left-color:var(--portal-black); font-size: 14px;">${comp.frase}</div>
            </div>
          </div>
        </section>
      `;

    case 'areasAtuacao':
      return `
        <section class="portal-section-diferenciais" id="areas-anchor">
          <div class="section-title-area">
            <h2>Nossas Áreas de Atuação</h2>
            <p>Oportunidades em diversos setores e especialidades comerciais</p>
          </div>
          <div class="diferenciais-grid">
            <div class="diferencial-card">
              <div class="diferencial-icon"><i class="fa-solid fa-truck-ramp-box"></i></div>
              <div class="diferencial-info">
                <h4>Logística &amp; CDs</h4>
                <p>Carga e descarga, triagem, conferência, movimentação e separação em galpões de e-commerce.</p>
              </div>
            </div>
            <div class="diferencial-card">
              <div class="diferencial-icon"><i class="fa-solid fa-boxes-packing"></i></div>
              <div class="diferencial-info">
                <h4>Armazenagem</h4>
                <p>Organização de estoques, paletização, inventários e embalagem final de produtos industriais.</p>
              </div>
            </div>
            <div class="diferencial-card">
              <div class="diferencial-icon"><i class="fa-solid fa-industry"></i></div>
              <div class="diferencial-info">
                <h4>Auxiliar Operacional</h4>
                <p>Atividades gerais de apoio em indústrias, comércio e varejo regional.</p>
              </div>
            </div>
          </div>
        </section>
      `;

    case 'perguntasFrequentes':
      const faqs = settings.perguntasFrequentes || [];
      const faqCards = faqs.map(f => `
        <div class="faq-item">
          <button class="faq-question" onclick="toggleFaqAccordion(this)">
            ${f.pergunta}
            <i class="fa-solid fa-chevron-down"></i>
          </button>
          <div class="faq-answer">
            <p>${f.resposta}</p>
          </div>
        </div>
      `).join('');

      return `
        <section class="portal-section-faq" id="faq-anchor">
          <div class="section-title-area">
            <h2>Perguntas Frequentes (FAQ)</h2>
            <p>Tire suas dúvidas rápidas sobre as vagas e o processo admissional da R&amp;T</p>
          </div>
          <div class="faq-list">
            ${faqCards}
          </div>
        </section>
      `;

    case 'contato':
      const cntsInfo = settings.contatos || {};
      const formatWaLink = cntsInfo.whatsapp ? 'https://wa.me/55' + cntsInfo.whatsapp.replace(/\D/g,'') : '#';

      return `
        <section class="portal-section-contato" id="contato-anchor">
          <div class="contato-container">
            <div class="contato-info">
              <div class="section-title-area" style="text-align:left; margin-bottom: 24px;">
                <h2 style="font-size:26px;">Fale Conosco</h2>
                <p>Canais oficiais de atendimento da agência</p>
              </div>

              <div class="contato-detail-card">
                <div class="contato-icon"><i class="fa-solid fa-map-location-dot"></i></div>
                <div class="contato-text">
                  <h4>Endereço da Agência</h4>
                  <p id="portal-f-endereco">${cntsInfo.endereco || 'Rua Dronsfield, 255 — Lapa — São Paulo/SP'}</p>
                </div>
              </div>

              <div class="contato-detail-card">
                <div class="contato-icon"><i class="fa-solid fa-phone"></i></div>
                <div class="contato-text">
                  <h4>Telefone Comercial</h4>
                  <p id="portal-f-telefone">${cntsInfo.telefone || '(11) 3643-4848'}</p>
                </div>
              </div>

              <div class="contato-detail-card">
                <div class="contato-icon"><i class="fa-solid fa-envelope"></i></div>
                <div class="contato-text">
                  <h4>E-mail de Suporte</h4>
                  <p id="portal-f-email">${cntsInfo.email || 'contato@vemserrt.com.br'}</p>
                </div>
              </div>

              <div class="contato-detail-card">
                <div class="contato-icon"><i class="fa-solid fa-clock"></i></div>
                <div class="contato-text">
                  <h4>Horário de Funcionamento</h4>
                  <p id="portal-f-horarios">${cntsInfo.horarios || 'Segunda a Sexta, das 08:00 às 17:48'}</p>
                </div>
              </div>

              <div style="margin-top: 10px;">
                <a href="${formatWaLink}" target="_blank" class="btn btn-primary" style="display:inline-flex; align-items:center; gap:8px; background:#25d366; border-color:#25d366; box-shadow:0 4px 10px rgba(37,211,102,0.35);">
                  <i class="fa-brands fa-whatsapp" style="font-size:16px;"></i> Chamar no WhatsApp de Suporte
                </a>
              </div>
            </div>
            <div class="contato-map-placeholder">
              <i class="fa-solid fa-location-dot"></i>
              <h3 style="font-size:16px;">Mapa Integrado R&amp;T</h3>
              <p style="font-size:12.5px; color:#64748b; margin:6px 0 16px; max-width: 300px;">Visite nossa unidade principal na Lapa para entrevistas presenciais e entrega física de fichas.</p>
              <a href="https://maps.google.com/?q=${encodeURIComponent(cntsInfo.endereco || 'Rua Dronsfield, 255 - Lapa - São Paulo/SP')}" target="_blank" class="btn btn-secondary btn-sm" style="font-size:12px;"><i class="fa-solid fa-map-pin"></i> Abrir no Google Maps</a>
            </div>
          </div>
        </section>
      `;

    default:
      return '';
  }
}

// Inicializa o Carrossel do Hero
let bannerTimer = null;
function initBannerCarousel() {
  const container = document.getElementById('hero-carousel');
  if (!container) return;

  const slides = container.querySelectorAll('.carousel-slide');
  const dots = container.querySelectorAll('.carousel-dot');
  if (!slides.length) return;

  let currentIdx = 0;

  function showSlide(idx) {
    slides.forEach(s => s.classList.remove('active'));
    dots.forEach(d => d.classList.remove('active'));
    slides[idx].classList.add('active');
    if (dots[idx]) dots[idx].classList.add('active');
    currentIdx = idx;
  }

  // Evento nos dots
  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const target = parseInt(dot.dataset.slide);
      showSlide(target);
      resetTimer();
    });
  });

  function autoNext() {
    let next = currentIdx + 1;
    if (next >= slides.length) next = 0;
    showSlide(next);
  }

  function resetTimer() {
    if (bannerTimer) clearInterval(bannerTimer);
    bannerTimer = setInterval(autoNext, 5000);
  }

  resetTimer();
}

// Accordion FAQ toggle
window.toggleFaqAccordion = function(btn) {
  const item = btn.parentElement;
  const isActive = item.classList.contains('active');
  
  // Oculta os outros accordions
  document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));

  if (!isActive) {
    item.classList.add('active');
  }
};

// Renderiza os Grids de Vagas dinamicamente
function renderVagasGrids(filtroText = '', filtroCidade = '', filtroEscala = '') {
  const containerQuentes = document.getElementById('vagas-quentes-container');
  const containerNormais = document.getElementById('vagas-normais-container');

  const sectionQuentes = document.getElementById('vagas-quentes-anchor');
  const sectionNormais = document.getElementById('vagas-abertas-anchor');

  const publicVagas = (state.vagas || []).filter(v => v.publicarPortal === true);

  // Filtragem
  const cargoBusca = filtroText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const filtradas = publicVagas.filter(v => {
    const vCargo = (v.cargo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const matchCargo = !filtroText || vCargo.includes(cargoBusca);
    const matchCidade = !filtroCidade || v.local === filtroCidade;
    const matchEscala = !filtroEscala || v.escala === filtroEscala;
    return matchCargo && matchCidade && matchEscala;
  });

  const quentes = filtradas.filter(v => v.vagaQuente === true);
  const normais = filtradas.filter(v => v.vagaQuente !== true);

  const _esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  // Renderizador de card unitário
  const renderCard = (v) => {
    const slug = generateSlug(v.cargo, v.local);
    const badgQuente = v.vagaQuente ? `<span class="vaga-badge vaga-badge-quente"><i class="fa-solid fa-fire"></i> Vaga Quente</span>` : '';
    const badgImed = v.inicioImediato ? `<span class="vaga-badge vaga-badge-imediato"><i class="fa-solid fa-bolt"></i> Admissão Rápida</span>` : '';
    const badgExp = v.semExperiencia ? `<span class="vaga-badge vaga-badge-experiencia"><i class="fa-solid fa-star-half-stroke"></i> Sem Experiência</span>` : '';
    const badgMuitas = v.muitasOportunidades ? `<span class="vaga-badge vaga-badge-muitas"><i class="fa-solid fa-users"></i> Muitas Vagas</span>` : '';

    return `
      <article class="portal-vaga-card ${v.vagaQuente ? 'vaga-quente-card' : ''}">
        <div class="vaga-card-header">
          <div class="vaga-badges-row">
            ${badgQuente}
            ${badgImed}
            ${badgExp}
            ${badgMuitas}
          </div>
          <h3 class="vaga-card-title">${_esc(v.cargo)}</h3>
        </div>
        <div class="vaga-card-meta">
          <span><i class="fa-solid fa-location-dot"></i> ${_esc(v.local)}</span>
          <span><i class="fa-solid fa-calendar-days"></i> Escala: ${_esc(v.escala || 'A Combinar')}</span>
        </div>
        <p class="vaga-card-desc">${_esc(v.desc)}</p>
        <div class="vaga-card-footer">
          <div class="vaga-card-salary">
            <span>Salário</span>
            <span>R$ ${_esc(v.salario)}</span>
          </div>
          <button class="btn-card-details" onclick="mostrarDetalhesVaga('${v.id}')">Ver Detalhes <i class="fa-solid fa-chevron-right"></i></button>
        </div>
      </article>
    `;
  };

  // Render Quentes
  if (containerQuentes) {
    if (quentes.length > 0 && state.portalSettings.secoesVisiveis.vagasQuentes !== false) {
      if (sectionQuentes) sectionQuentes.style.display = 'block';
      containerQuentes.innerHTML = quentes.map(renderCard).join('');
    } else {
      if (sectionQuentes) sectionQuentes.style.display = 'none';
      containerQuentes.innerHTML = '';
    }
  }

  // Render Normais
  if (containerNormais) {
    if (normais.length > 0 && state.portalSettings.secoesVisiveis.vagasAbertas !== false) {
      if (sectionNormais) sectionNormais.style.display = 'block';
      containerNormais.innerHTML = normais.map(renderCard).join('');
    } else {
      if (normais.length === 0 && quentes.length === 0) {
        if (sectionNormais) sectionNormais.style.display = 'block';
        containerNormais.innerHTML = `
          <div class="vagas-empty-state">
            <i class="fa-solid fa-magnifying-glass"></i>
            <h3>Nenhuma vaga aberta encontrada</h3>
            <p>Tente alterar os termos de pesquisa ou filtros digitados.</p>
          </div>
        `;
      } else {
        if (sectionNormais) sectionNormais.style.display = 'none';
        containerNormais.innerHTML = '';
      }
    }
  }
}

// Filtros submit
window.executarBusca = function(e) {
  e.preventDefault();
  const txt = document.getElementById('search-cargo')?.value.trim() || '';
  const cid = document.getElementById('search-cidade')?.value || '';
  const esc = document.getElementById('search-escala')?.value || '';
  renderVagasGrids(txt, cid, esc);
  
  // Rola suavemente até o grid
  document.getElementById('vagas-abertas-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// Modal de Detalhes da Vaga
window.mostrarDetalhesVaga = function(vagaId) {
  const modal = document.getElementById('modal-vaga-detalhes');
  if (!modal) return;

  const vaga = state.vagas.find(v => v.id === vagaId);
  if (!vaga) return;

  selectedVaga = vaga;

  // Atualizar URL de forma limpa (SPA)
  const slug = generateSlug(vaga.cargo, vaga.local);
  history.pushState({ vagaId }, '', '/vagas/' + slug);

  // Preencher modal
  document.getElementById('modal-vaga-titulo').textContent = vaga.cargo;
  document.getElementById('modal-vaga-cidade').innerHTML = `<i class="fa-solid fa-location-dot"></i> ${vaga.local}`;
  document.getElementById('modal-vaga-escala').innerHTML = `<i class="fa-solid fa-calendar-days"></i> Escala: ${vaga.escala || 'A Combinar'}`;
  document.getElementById('modal-vaga-salario').textContent = `R$ ${vaga.salario}`;
  document.getElementById('modal-vaga-descricao').textContent = vaga.desc;
  document.getElementById('modal-vaga-beneficios').textContent = vaga.beneficios;

  const tRow = document.getElementById('modal-vaga-turnos-row');
  const tVal = document.getElementById('modal-vaga-turnos');
  if (vaga.turnos && tRow && tVal) {
    tRow.style.display = 'grid';
    tVal.textContent = vaga.turnos;
  } else if (tRow) {
    tRow.style.display = 'none';
  }

  const fRow = document.getElementById('modal-vaga-fretado-row');
  const fVal = document.getElementById('modal-vaga-fretado');
  if (vaga.fretado && fRow && fVal) {
    fRow.style.display = 'grid';
    fVal.textContent = vaga.fretado;
  } else if (fRow) {
    fRow.style.display = 'none';
  }

  // Badges
  document.getElementById('modal-badge-quente').style.display = vaga.vagaQuente ? 'inline-flex' : 'none';
  document.getElementById('modal-badge-imediato').style.display = vaga.inicioImediato ? 'inline-flex' : 'none';

  modal.classList.add('active');
};

window.fecharDetalhesVaga = function() {
  const modal = document.getElementById('modal-vaga-detalhes');
  if (modal) modal.classList.remove('active');
  
  // Retornar a URL anterior
  const base = window.location.pathname.split('/vagas')[0];
  history.pushState(null, '', base || '/');
};

// Drawer de candidatura
window.abrirFormCandidatura = function() {
  // Fecha modal de detalhes se estiver aberto
  fecharDetalhesVaga();

  const drawer = document.getElementById('drawer-candidatura');
  if (!drawer) return;

  // Associa a vaga selecionada ao formulário oculto
  const vagaIdInput = document.getElementById('cand-vaga-id');
  if (vagaIdInput && selectedVaga) {
    vagaIdInput.value = selectedVaga.id;
  } else if (vagaIdInput) {
    vagaIdInput.value = 'banco_talentos'; // Cadastro geral sem vaga
  }

  currentStep = 1;
  atualizarEtapaVisual();
  drawer.classList.add('active');
};

window.fecharFormCandidatura = function() {
  const drawer = document.getElementById('drawer-candidatura');
  if (drawer) drawer.classList.remove('active');
  document.getElementById('form-candidatura-etapas').reset();
  limparUploads();
};

// Limpa documentos do cache
function limparUploads() {
  for (const k in uploadedDocs) delete uploadedDocs[k];
  document.querySelectorAll('.portal-doc-box').forEach(b => {
    b.className = 'portal-doc-box';
    const status = b.querySelector('.portal-doc-status');
    if (status) status.textContent = 'Pendente';
  });
}

// Avança e recua etapas no Drawer
window.etapaAvancar = function() {
  if (validarEtapa(currentStep)) {
    if (currentStep < totalSteps) {
      currentStep++;
      atualizarEtapaVisual();
      if (currentStep === totalSteps) {
        prepararRevisaoFicha();
      }
    } else {
      enviarInscricaoFinal();
    }
  }
};

window.etapaVoltar = function() {
  if (currentStep > 1) {
    currentStep--;
    atualizarEtapaVisual();
  }
};

function atualizarEtapaVisual() {
  // Oculta todas as seções
  document.querySelectorAll('.drawer-step-section').forEach(s => s.classList.remove('active'));
  // Mostra a ativa
  const activeSec = document.querySelector(`.drawer-step-section[data-step="${currentStep}"]`);
  if (activeSec) activeSec.classList.add('active');

  // Atualizar bubbles de etapas
  document.querySelectorAll('.step-bubble').forEach(b => {
    const step = parseInt(b.dataset.step);
    b.className = 'step-bubble';
    if (step === currentStep) b.classList.add('active');
    else if (step < currentStep) b.classList.add('completed');
  });

  // Atualizar barra de progresso
  const percent = ((currentStep) / totalSteps) * 100;
  document.getElementById('step-progress-bar').style.width = `${percent}%`;

  // Atualizar label da etapa
  const labelsMap = {
    1: 'Etapa 1: Dados Pessoais',
    2: 'Etapa 2: Localização & Endereço',
    3: 'Etapa 3: Uniforme & Pagamento',
    4: 'Etapa 4: Anexar Documentação',
    5: 'Etapa 5: LGPD & Revisão Geral'
  };
  document.getElementById('step-current-label').textContent = labelsMap[currentStep] || '';

  // Configurações do footer
  const btnVoltar = document.getElementById('btn-etapa-voltar');
  const btnAvancar = document.getElementById('btn-etapa-avancar');

  if (btnVoltar) btnVoltar.style.display = currentStep === 1 ? 'none' : 'block';
  if (btnAvancar) {
    if (currentStep === totalSteps) {
      btnAvancar.innerHTML = 'Finalizar Inscrição <i class="fa-solid fa-circle-check"></i>';
    } else {
      btnAvancar.innerHTML = 'Avançar <i class="fa-solid fa-arrow-right"></i>';
    }
  }

  // Rola drawer para o topo
  document.getElementById('form-candidatura-etapas').scrollTop = 0;
}

// Máscaras de CPF, RG, Telefone, CEP
function setupFormMasks() {
  const cpfInput = document.getElementById('cand-cpf');
  if (cpfInput) {
    cpfInput.addEventListener('input', () => {
      let v = cpfInput.value.replace(/\D/g, '').slice(0, 11);
      v = v.replace(/^(\d{3})(\d)/, '$1.$2');
      v = v.replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3');
      v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
      cpfInput.value = v;
    });
  }

  const telInput = document.getElementById('cand-telefone');
  if (telInput) {
    telInput.addEventListener('input', () => {
      let v = telInput.value.replace(/\D/g, '').slice(0, 11);
      if (v.length > 10) {
        v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
      } else if (v.length > 5) {
        v = v.replace(/^(\d{2})(\d{4})(\d{0,4})$/, '($1) $2-$3');
      } else if (v.length > 2) {
        v = v.replace(/^(\d{2})(\d{0,5})$/, '($1) $2');
      } else if (v.length > 0) {
        v = v.replace(/^(\d*)$/, '($1');
      }
      telInput.value = v;
    });
  }

  const cepInput = document.getElementById('cand-cep');
  if (cepInput) {
    cepInput.addEventListener('input', () => {
      let v = cepInput.value.replace(/\D/g, '').slice(0, 8);
      v = v.replace(/^(\d{5})(\d)/, '$1-$2');
      cepInput.value = v;
      
      // Gatilho de busca automática ao completar os 8 números
      if (v.replace(/\D/g, '').length === 8) {
        buscarCep();
      }
    });
  }
}

// Configura upload de documentos para converter a base64
function setupDocInputs() {
  const configs = [
    { id: 'p-doc-selfie', box: 'p-box-selfie', status: 'p-st-selfie', key: 'selfie' },
    { id: 'p-doc-rg', box: 'p-box-rg', status: 'p-st-rg', key: 'rgFrente' },
    { id: 'p-doc-cpf', box: 'p-box-cpf', status: 'p-st-cpf', key: 'cpfDocumento' },
    { id: 'p-doc-comp', box: 'p-box-comp', status: 'p-st-comp', key: 'comprovanteResidencia' },
    { id: 'p-doc-banco', box: 'p-box-banco', status: 'p-st-banco', key: 'cartaoBancoVerso' }
  ];

  configs.forEach(cfg => {
    const input = document.getElementById(cfg.id);
    const box = document.getElementById(cfg.box);
    const status = document.getElementById(cfg.status);
    if (!input) return;

    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;

      if (file.size > 10 * 1024 * 1024) {
        if (status) status.textContent = 'Muito Grande (max 10MB)';
        if (box) { box.classList.add('error'); box.classList.remove('uploaded'); }
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        uploadedDocs[cfg.key] = e.target.result;
        if (status) status.textContent = 'Enviado ✓';
        if (box) { box.classList.add('uploaded'); box.classList.remove('error'); }
      };
      reader.onerror = () => {
        if (status) status.textContent = 'Erro de leitura';
        if (box) { box.classList.add('error'); box.classList.remove('uploaded'); }
      };
      reader.readAsDataURL(file);
    });
  });
}

// CEP lookup via ViaCEP
window.buscarCep = function() {
  const cepInput = document.getElementById('cand-cep');
  const loading = document.getElementById('cep-loading-msg');
  if (!cepInput) return;

  const cep = cepInput.value.replace(/\D/g, '');
  if (cep.length !== 8) {
    alert('Digite um CEP válido com 8 dígitos.');
    return;
  }

  if (loading) loading.style.display = 'block';

  fetch(`https://viacep.com.br/ws/${cep}/json/`)
    .then(res => res.json())
    .then(d => {
      if (loading) loading.style.display = 'none';
      if (d.erro) {
        alert('CEP não encontrado. Digite o endereço manualmente.');
        return;
      }
      
      const rEl = document.getElementById('cand-rua');
      const bEl = document.getElementById('cand-bairro');
      const cEl = document.getElementById('cand-cidade');
      const eEl = document.getElementById('cand-estado');

      if (rEl) rEl.value = d.logradouro || '';
      if (bEl) bEl.value = d.bairro || '';
      if (cEl) cEl.value = d.localidade || '';
      if (eEl) eEl.value = d.uf || '';
    })
    .catch(err => {
      if (loading) loading.style.display = 'none';
      console.warn('Erro ao consultar CEP:', err);
    });
};

// Validador de CPF completo
function validarCPF(cpf) {
  cpf = cpf.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
  let r = (sum * 10) % 11; if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
  r = (sum * 10) % 11; if (r === 10 || r === 11) r = 0;
  return r === parseInt(cpf[10]);
}

// Valida os campos da etapa atual antes de avançar
function validarEtapa(step) {
  const _error = (id, msg) => {
    const el = document.getElementById(id);
    if (el) {
      alert(msg);
      el.focus();
    }
  };

  if (step === 1) {
    const nome = document.getElementById('cand-nome')?.value.trim();
    const cpf = document.getElementById('cand-cpf')?.value.trim();
    const rg = document.getElementById('cand-rg')?.value.trim();
    const nasc = document.getElementById('cand-data-nasc')?.value;
    const mae = document.getElementById('cand-mae')?.value.trim();
    const tel = document.getElementById('cand-telefone')?.value.trim();
    const email = document.getElementById('cand-email')?.value.trim();

    if (!nome) { _error('cand-nome', 'Informe seu nome completo.'); return false; }
    if (!cpf || !validarCPF(cpf)) { _error('cand-cpf', 'Informe um CPF válido.'); return false; }
    
    // Verificação de segurança: CPF bloqueado (inapto)
    const cpfLimpo = cpf.replace(/\D/g, '');
    const inaptos = state.inaptos || [];
    const isBlocked = inaptos.find(i => i.cpf && i.cpf.replace(/\D/g, '') === cpfLimpo);
    if (isBlocked) {
      alert('Seu CPF possui pendências cadastrais internas e não pôde ser processado. Entre em contato com a agência.');
      return false;
    }

    if (!rg) { _error('cand-rg', 'Informe o seu RG.'); return false; }
    if (!nasc) { _error('cand-data-nasc', 'Informe a sua data de nascimento.'); return false; }
    if (!mae) { _error('cand-mae', 'Informe o nome completo de sua mãe.'); return false; }
    if (!tel || tel.replace(/\D/g, '').length < 10) { _error('cand-telefone', 'Informe um telefone/WhatsApp válido.'); return false; }
    if (!email || !email.includes('@')) { _error('cand-email', 'Informe um e-mail válido.'); return false; }
  }
  else if (step === 2) {
    const cep = document.getElementById('cand-cep')?.value.replace(/\D/g, '');
    const rua = document.getElementById('cand-rua')?.value.trim();
    const num = document.getElementById('cand-num')?.value.trim();
    const bairro = document.getElementById('cand-bairro')?.value.trim();
    const cid = document.getElementById('cand-cidade')?.value.trim();
    const est = document.getElementById('cand-estado')?.value.trim();
    const fret = document.getElementById('cand-fretado')?.value;

    if (!cep || cep.length !== 8) { _error('cand-cep', 'Informe um CEP válido.'); return false; }
    if (!rua) { _error('cand-rua', 'Informe o nome de seu logradouro/rua.'); return false; }
    if (!num) { _error('cand-num', 'Informe o número residencial.'); return false; }
    if (!bairro) { _error('cand-bairro', 'Informe o bairro.'); return false; }
    if (!cid) { _error('cand-cidade', 'Informe a cidade.'); return false; }
    if (!est) { _error('cand-estado', 'Informe a UF.'); return false; }
    if (!fret) { _error('cand-fretado', 'Informe a necessidade de fretado.'); return false; }
  }
  else if (step === 3) {
    const cam = document.getElementById('cand-t-camiseta')?.value;
    const cal = document.getElementById('cand-t-calca')?.value;
    const bot = document.getElementById('cand-t-bota')?.value;
    const bnc = document.getElementById('cand-banco')?.value.trim();
    const pixT = document.getElementById('cand-pix-tipo')?.value;
    const pixK = document.getElementById('cand-pix-chave')?.value.trim();
    const exp = document.getElementById('cand-experiencia')?.value;

    if (!cam) { _error('cand-t-camiseta', 'Selecione o tamanho de camiseta.'); return false; }
    if (!cal) { _error('cand-t-calca', 'Selecione o tamanho de calça.'); return false; }
    if (!bot) { _error('cand-t-bota', 'Selecione o tamanho do calçado.'); return false; }
    if (!bnc) { _error('cand-banco', 'Informe o banco/instituição.'); return false; }
    if (!pixT) { _error('cand-pix-tipo', 'Selecione o tipo de chave Pix.'); return false; }
    if (!pixK) { _error('cand-pix-chave', 'Informe a chave Pix.'); return false; }
    if (!exp) { _error('cand-experiencia', 'Informe se possui experiência anterior.'); return false; }
  }
  else if (step === 4) {
    // Validação de uploads
    if (!uploadedDocs.selfie) { alert('Anexe a Selfie do Rosto.'); return false; }
    if (!uploadedDocs.rgFrente) { alert('Anexe a foto do RG Frente.'); return false; }
    if (!uploadedDocs.cpfDocumento) { alert('Anexe a foto do CPF Documento.'); return false; }
    if (!uploadedDocs.comprovanteResidencia) { alert('Anexe o Comprovante de Residência.'); return false; }
    if (!uploadedDocs.cartaoBancoVerso) { alert('Anexe o Comprovante Bancário / Pix.'); return false; }
  }
  else if (step === 5) {
    const lgpd = document.getElementById('cand-lgpd');
    if (!lgpd || !lgpd.checked) {
      alert('Você precisa aceitar os termos de consentimento da LGPD para finalizar.');
      return false;
    }
  }

  return true;
}

// Prepara resumo geral de revisão antes de finalizar
function prepararRevisaoFicha() {
  const container = document.getElementById('portal-review-summary');
  if (!container) return;

  const nome = document.getElementById('cand-nome')?.value.trim();
  const cpf = document.getElementById('cand-cpf')?.value.trim();
  const tel = document.getElementById('cand-telefone')?.value.trim();
  const cid = document.getElementById('cand-cidade')?.value.trim();
  const vagaText = selectedVaga ? selectedVaga.cargo : 'Banco de Talentos (Geral)';

  container.innerHTML = `
    <div class="review-item"><span class="review-label">Nome:</span><span class="review-value">${nome}</span></div>
    <div class="review-item"><span class="review-label">CPF:</span><span class="review-value">${cpf}</span></div>
    <div class="review-item"><span class="review-label">WhatsApp:</span><span class="review-value">${tel}</span></div>
    <div class="review-item"><span class="review-label">Cidade:</span><span class="review-value">${cid}</span></div>
    <div class="review-item"><span class="review-label">Vaga de Interesse:</span><span class="review-value" style="color:var(--portal-red);">${vagaText}</span></div>
  `;
}

// Envia inscrição para a vaga / Banco de Talentos
function enviarInscricaoFinal() {
  const nome = document.getElementById('cand-nome')?.value.trim();
  const cpf = document.getElementById('cand-cpf')?.value.trim();
  const rg = document.getElementById('cand-rg')?.value.trim();
  const pis = document.getElementById('cand-pis')?.value.trim() || '';
  const nasc = document.getElementById('cand-data-nasc')?.value;
  const mae = document.getElementById('cand-mae')?.value.trim();
  const pai = document.getElementById('cand-pai')?.value.trim() || '';
  const tel = document.getElementById('cand-telefone')?.value.trim();
  const email = document.getElementById('cand-email')?.value.trim();
  
  const cep = document.getElementById('cand-cep')?.value.trim();
  const rua = document.getElementById('cand-rua')?.value.trim();
  const num = document.getElementById('cand-num')?.value.trim();
  const bairro = document.getElementById('cand-bairro')?.value.trim();
  const cid = document.getElementById('cand-cidade')?.value.trim();
  const est = document.getElementById('cand-estado')?.value.trim();
  const fret = document.getElementById('cand-fretado')?.value;

  const cam = document.getElementById('cand-t-camiseta')?.value;
  const cal = document.getElementById('cand-t-calca')?.value;
  const bot = document.getElementById('cand-t-bota')?.value;
  const bnc = document.getElementById('cand-banco')?.value.trim();
  const pixT = document.getElementById('cand-pix-tipo')?.value;
  const pixK = document.getElementById('cand-pix-chave')?.value.trim();
  const exp = document.getElementById('cand-experiencia')?.value;

  const idCand = 'candidato-' + Date.now();
  const dataIso = new Date().toISOString();

  // Constrói objeto candidato completo compatível com o CRM
  const novoCand = {
    id: idCand,
    nome,
    cpf,
    rg,
    pis,
    dataNascimento: nasc ? nasc.split('-').reverse().join('/') : '',
    nomeMae: mae,
    nomePai: pai,
    telefone: tel,
    email,
    cep,
    rua,
    numeroCasa: num,
    bairro,
    cidade: cid,
    estado: est,
    endereco: `${rua}, ${num}, ${bairro} - ${cid}/${est}`,
    fretado: fret,
    
    tamanhoCamiseta: cam,
    tamanhoCalca: cal,
    tamanhoBota: bot,
    banco: bnc,
    tipoPix: pixT,
    chavePix: pixK,
    experiencia: exp,
    
    vagaId: selectedVaga ? selectedVaga.id : 'banco_talentos',
    empresaId: selectedVaga ? selectedVaga.empresaId : '',
    codigoVaga: selectedVaga ? selectedVaga.cargo : 'Banco de Talentos',
    recrutadorId: recrutadorLinkId || '',
    
    status: 'pendente',
    origemCadastro: 'site', // CRITICAL
    origemDetalhada: 'Vem Ser RT', // CRITICAL
    dataCadastro: dataIso,
    diasEtapa: 0,
    
    documentos: {
      selfie: uploadedDocs.selfie || '',
      rgFrente: uploadedDocs.rgFrente || '',
      fotoPis: uploadedDocs.fotoPis || '',
      cpfDocumento: uploadedDocs.cpfDocumento || '',
      comprovanteResidencia: uploadedDocs.comprovanteResidencia || '',
      cartaoBancoVerso: uploadedDocs.cartaoBancoVerso || ''
    },
    historico: [{
      data: new Date().toLocaleString('pt-BR'),
      autor: 'Candidato (Portal)',
      acao: 'Cadastro concluído com sucesso via Portal Público Vem Ser RT com assinatura LGPD.',
      tipo: 'criacao'
    }]
  };

  if (!state.candidatos) state.candidatos = [];
  state.candidatos.push(novoCand);

  // Inserção automática na fila/senha
  if (!state.fila) state.fila = { contadores: { selecao: 0, dp: 0, geral: 0 }, senhas: [], ultimaChamada: null };
  if (!state.fila.contadores) state.fila.contadores = { selecao: 0, dp: 0, geral: 0 };
  state.fila.contadores.selecao = (state.fila.contadores.selecao || 0) + 1;
  const numSenha = 'S-' + String(state.fila.contadores.selecao).padStart(3, '0');
  
  state.fila.senhas.push({
    id: 'senha-' + Date.now(),
    numero: numSenha,
    tipo: 'selecao',
    nome: novoCand.nome,
    candidatoId: novoCand.id,
    geradaEm: Date.now(),
    status: 'aguardando',
    chamadaEm: null
  });
  
  novoCand.numeroFila = state.fila.contadores.selecao;

  // Sincroniza e fecha drawer
  _rtUpsertIds = [novoCand.id];
  saveState();
  fecharFormCandidatura();

  // Abre overlay de sucesso
  abrirSucesso(numSenha, novoCand.recrutadorId);
}

function abrirSucesso(senha, recId) {
  const overlay = document.getElementById('portal-success-screen');
  const protEl = document.getElementById('portal-success-protocol');
  const btnWa = document.getElementById('btn-whatsapp-recrutador');

  if (protEl) protEl.textContent = senha;

  // WhatsApp do recrutador se houver
  const rec = recId && state ? (state.recrutadores || []).find(r => r.id === recId) : null;
  const cInfo = state.portalSettings?.contatos || {};

  if (btnWa) {
    if (rec && rec.whatsapp) {
      const waNum = rec.whatsapp.replace(/\D/g, '');
      const textMsg = encodeURIComponent(`Olá, ${rec.nome}! Concluí minha ficha no portal Vem Ser RT com a senha ${senha}. Gostaria de acompanhar meu processo seletivo.`);
      btnWa.href = `https://wa.me/55${waNum}?text=${textMsg}`;
      btnWa.style.display = 'inline-flex';
    } else if (cInfo.whatsapp) {
      const waNum = cInfo.whatsapp.replace(/\D/g, '');
      const textMsg = encodeURIComponent(`Olá! Concluí minha ficha no portal Vem Ser RT com a senha ${senha}. Gostaria de saber os próximos passos.`);
      btnWa.href = `https://wa.me/55${waNum}?text=${textMsg}`;
      btnWa.style.display = 'inline-flex';
    } else {
      btnWa.style.display = 'none';
    }
  }

  if (overlay) overlay.classList.add('active');
  startConfetti();
}

window.fecharSucessoVoltarHome = function() {
  const overlay = document.getElementById('portal-success-screen');
  if (overlay) overlay.classList.remove('active');
  
  // Limpar history path para a home
  const base = window.location.pathname.split('/vagas')[0];
  history.pushState(null, '', base || '/');
  
  // Rola até o topo
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Canvas Confetes
function startConfetti() {
  const canvas = document.getElementById('portal-confetti');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#be123c', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];
  const pieces = [];
  
  for (let i = 0; i < 100; i++) {
    pieces.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      r: Math.random() * 5 + 4,
      d: Math.random() * 80 + 30,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 5,
      tiltAngle: 0,
      tiltAngleInc: Math.random() * 0.05 + 0.02
    });
  }

  let animationFrameId = null;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let active = false;

    pieces.forEach(p => {
      p.tiltAngle += p.tiltAngleInc;
      p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
      p.x += Math.sin(p.tiltAngle);
      p.tilt = Math.sin(p.tiltAngle - p.r / 2) * 5;

      if (p.y < canvas.height) active = true;

      ctx.beginPath();
      ctx.lineWidth = p.r;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
      ctx.stroke();
    });

    if (active) {
      animationFrameId = requestAnimationFrame(draw);
    } else {
      cancelAnimationFrame(animationFrameId);
    }
  }

  draw();

  // Ajusta tamanho da tela no resize
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
}
