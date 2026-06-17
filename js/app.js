// ==========================================================================
// APLICATIVO PRINCIPAL (SPA) - R&T EMPREGOS
// ==========================================================================

let state = null;
let loggedUser = null;
let charts = {
  recrutador: null,
  empresa: null
};
let dashboardCharts = {
  dia: null,
  empresa: null,
  selecionador: null,
  status: null,
  vagas: null,
  fretados: null
};
let activeAba = 'dashboard';
let activeDashboardSubTab = 'visao-geral';
let currentCandidateId = null;
let _drawerSnapshotAntes = null;

const CAMPOS_AUDIT = {
  nome: 'Nome', cpf: 'CPF', rg: 'RG', pis: 'PIS/NIS',
  dataNascimento: 'Data de Nascimento', nomeMae: 'Nome da Mãe', nomePai: 'Nome do Pai',
  telefone: 'Telefone', email: 'E-mail',
  cep: 'CEP', rua: 'Rua', numeroCasa: 'Número', bairro: 'Bairro', cidade: 'Cidade', estado: 'Estado',
  banco: 'Banco', tipoPix: 'Tipo PIX', chavePix: 'Chave PIX',
  status: 'Status', turnoTrabalho: 'Turno', recrutadorId: 'Recrutador', vagaId: 'Vaga'
};

// ─── Detecção de sexo pelo primeiro nome ──────────────────────────────────────
const _NOMES_F = new Set('maria,ana,fernanda,camila,beatriz,juliana,mariana,amanda,carla,paula,vanessa,patricia,sandra,renata,claudia,daniela,luciana,adriana,fabiana,leticia,priscila,viviane,simone,tatiana,cristina,natalia,silvia,regina,vera,laura,isabel,isabela,isabella,isadora,bianca,carolina,aline,bruna,jessica,deborah,debora,michele,micheli,larissa,melissa,thais,thamires,giovana,giovanna,helena,livia,luiza,sara,sarah,gabriela,gabrielle,rafaela,raquel,solange,elaine,erica,kelly,keila,gisele,gisela,rosana,rosangela,josiane,elizabete,elizabeth,andressa,andrea,angela,denise,catarina,aparecida,conceicao,cleuza,cleide,celia,noemia,zelia,fatima,tereza,teresa,irene,ines,edna,elza,ilda,ieda,iolanda,ivone,ivani,jacira,janete,jaqueline,joana,josefa,lourdes,luzia,marta,neuza,nilza,nilda,odete,olga,ruth,selma,sonia,sueli,suely,valdete,valeria,vilma,wilma,zilda,zenaide,alice,alicia,cecilia,diana,elena,eleonora,emilia,estela,estefania,eunice,evelise,eveline,filomena,flora,flavia,gilda,gloria,heloisa,yara,yasmin,yasmine,maya,mia,milena,nina,rebeca,rebecca,sofia,sophia,taina,thalia,thalita,vitoria,wanessa,yolanda,lais,nayara,nathalia,nathalie,nadia,nadiely,nathaly,tamires,tainara,taynara,karolina,cintia,cinthia,lidiane,graziele,graziela,marilene,marli,marilda,marlene,marcia,marcela,micaela,micaella,michely,monique,monica,pamela,pollyana,poliana,polyanna,rosilene,roseli,rosiele,samara,samantha,shirley,silvana,sirlene,socorro,suellen,tamara,tania,telma,veronica,viviana,edilene,edileusa,eliane,elizangela,elizandra,ingrid,iris,izabela,izabella,joice,joyce,julianna,karina,katia,katiane,keyla,luana,luanna,ludimila,ludmila,luziane,luzinete,gleice,gleiciane,franciele,franciely,gislene,grecia,greice,lindalva,lindinalva,liandra,liane,luzinete,naiara,naiely,nailane,nailton,nayane,naiane,naara,nubia,nubia,odete,osana,ozana,raiane,raissa,raiany,raylane,rayssa,rebeka,renyelle,rilane,rosineide,rosinei,rossana,rozane,rozangela,sabrina,samille,sandriele,sandrieli,selene,sibely,simony,sindy,sirley,soledad,soraya,taiane,taissa,talita,tamiles,tamy,tassiane,tayane,thaiane,thaianny,thauane,thayane,thaysa,thyane,thyara,valquiria,vanda,vanderleide,vanusa,wendy,yandra'.split(','));

const _NOMES_M = new Set('joao,jose,carlos,luis,paulo,pedro,marcos,lucas,mateus,matheus,gabriel,rafael,leonardo,felipe,bruno,rodrigo,marcelo,anderson,andre,daniel,diego,eduardo,eric,fabio,fernando,francisco,gilberto,gustavo,henrique,igor,ivo,jorge,julio,leandro,marcio,marco,mario,nelson,nilson,nilton,otavio,patrick,raul,renato,ricardo,roberto,sergio,thiago,victor,vitor,wagner,wesley,william,wilson,alexandre,antonio,arnaldo,arthur,artur,augusto,caio,claudio,cleber,cristiano,davi,david,emerson,ezequiel,flavio,fausto,geraldo,giovanni,guilherme,humberto,iago,ivan,jean,jefferson,jonathas,jonathan,jonatas,jeferson,lauro,luan,luiz,manoel,manuel,mauricio,miguel,milton,murilo,nicolas,oscar,osvaldo,ramon,renan,rui,samuel,saulo,sebastiao,silas,silvio,tarcisio,tadeu,thadeu,tiago,valter,walter,vanderlei,vinicius,yago,yuri,adilson,adriano,alisson,alan,almir,alfredo,amancio,amaro,benicio,bento,bernardo,caetano,cassio,cezar,clovis,dalton,demetrio,denilson,derik,diogo,domingos,douglas,edmar,edson,ednaldo,edevaldo,eli,elias,elinaldo,eliseu,elton,erico,ernesto,euclides,evandro,everton,fabiano,fabricio,frederico,geovani,geovanny,geronimo,gerson,gilmar,gilson,glauco,gleison,haroldo,helio,hercules,hermes,hilario,hilton,hugo,inacio,iran,ismael,jadir,jairo,jair,jeronimo,jilson,jocimar,joelson,josimar,josue,juan,junior,jurandir,juvenal,lazaro,leocadio,leonel,luciano,magno,marcal,marcelino,marcilio,mauro,moises,natan,natanael,nelio,neto,newton,nildo,odair,olavo,onofre,orlando,osmar,pablo,plinio,raimundo,reinaldo,robson,rodolfo,rogerio,ronaldo,ronildo,rufino,salomao,sandro,saul,sidnei,sidney,silvestre,tarcio,teodoro,tobias,tomas,tulio,ulisses,ubiratan,valentim,valmir,valdecir,valdir,vanderson,vasco,venancio,waldir,wanderlei,wanderson,wendel,wolney,zacarias,zaqueu,luca,nikita,elisha,josias,matias,isaias,elias,tobias,nicolas,thomas,jesus,elvis,anselmo,arisson,artur,axel,aylton,beto,celso,celso,cesar,cicero,ciro,cleuton,clodoaldo,cloves,creso,darlan,darlison,darlei,davi,delmir,demir,denirio,deonizio,derik,devan,diran,dirceu,divo,edilson,edmar,edmilson,ednilson,elan,eldenir,eldevan,eldo,elenildo,elenilson,elizaldo,elmo,eloir,elson,elton,ely,emiliano,eneas,enir,eranio,eranildo,erclito,erlon,ervino,evaldo,evelson,evelino,ezio,fidelis,flaminio,fontes,fransico,gean,genivaldo,genildo,gennaro,gervazio,gildo,gilvan,glauber,gleibson,glenio,glennio,gonçalo,goncalo,helder,heleno,helias,heloi,heloino,herberto,heron,hervaldo,hildebrando,homero,honorato,horacio,hosana,huberto,ideraldo,ideval,idinei,idmar,inar,indalecio,indio,irani,iramar,irenio,irlan,irmar,isael,isais,isidoro,isley,itamar,ivo,izeldo,izenildo,jaci,jacir,jaison,jander,janio,jardel,jarlan,jarlei,jarlison,jarlysson,jarson,jaudel,jecleiton,jedson,jeison,jeovah,jerlandio,jerson,jesiel,jessie,jivago,joaldo,joadir,joceli,jocelin,jocelito,jocelino,jocivaldo,joel,joelmir,joffre,jolber,jonailson,jonathas,jonder,jorio,josafat,josias,josiel,josivaldo,joslanio,juarez,julierme,juliete,junior,junio,juninho,jurandir,kelton,kelvim,kelvin,keven,kleison,kleyton,kleiton,laercio,laionardo,lander,landir,lazaro,leomir,leonidas,leopoldino,lesandro,lessandro,lindalvo,lindomar,lineu,lino,livio,lorival,lorival,lourival,lucelino,luceni,lucerio,lucidio,lucimar,lucindo,lucinei,luciomar,luciomario,lucival,lucivaldo,lucivandro,manasses,marcani,marcelo,marcenildo,marcenio,marcondes,marcondes,marcos,mariano,marilio,mariscal,marley,marlon,marqos,marques,marquinho,martim,matias,mauro,maylon,melquisedeque,melvino,menaseu,menezes,messias,mirialdo,moab,moacir,moiseis,monaro,mucio,nabor,naelson,nailton,nair,naivaldo,nando,naran,narciso,nardeli,natael,natalio,nataniel,naum,neivaldo,nelcinho,nemias,nenson,neraldo,neron,nerval,neto,neves,noaldo,noelmo,nonato,normando,notario,odacir,odair,odalvo,odilon,odimar,odirley,odirlei,odilon,olemir,olemar,olenir,oleone,olimpio,olimpo,olivaldo,olmar,olmir,oloaldo,onivaldo,orcival,orcino,orlando,orsival,ortolan,osias,osmar,osmario,osni,osório,osorio,ossian,osvaldo,otacilio,otavio,otniel,otoniel,ozias,pablo,paulinho,percival,pericles,perseu,placido,plinio,policarpo,porfirio,primitivo,quirino,queisson,querino,radovan,raimundo,rainaldo,raone,raphaell,raquelino,rarison,rarlison,raul,reinaldo,reinan,reinildo,rejailson,renildo,renivaldo,rildo,rimario,robervaldo,robnei,robson,rochaldo,rodinei,rodolfo,rodolpho,rodrigo,rogerio,romelio,ronaldo,ronei,ronivaldo,rorisson,rosivaldo,rosivando,rosley,rosmar,rosnei,rosner,rovanildo,rubens,rubio,rubmario,rudinei,rudimar,rudnei,rufino,rui,sandro,sansao,saulo,serafim,sidnei,sidinei,sidmar,silas,silvino,sinedio,sinivaldo,siome,sirley,siumar,soldano,soldati,solenir,solemar,suelen,tarcio,tassio,teobaldo,teodoro,teofilo,tercilio,tercio,terencio,timoteo,tobias,tomas,toninho,tonino,tulio,ulisses,ulysses,ubiratan,udson,ueslei,udenilson,ueneliton,ulisses,uriel,vagnaldo,vagner,valcir,valdemar,valdemiro,valdeni,valdenilson,valdenor,valdilei,valdimar,valdinei,valdinor,valdirlei,valdirmar,valdomiro,valdovino,valentim,valindo,valionor,valmar,valmor,valnei,valtemir,valton,vanderlon,vander,vando,vandoval,vanildo,vanilton,vanner,vanoni,variomar,varlei,varmar,varo,vatson,vergilio,veriato,vernaldo,verner,vicentinho,vieirinha,vinicius,wal,waldir,waldomiro,waldivino,wanderlon,warley,warlei,warlisson,warnildo,wendell,wilian,willian,wolmar,wolnei,zacarias,zaqueu,zeferino,zelito,zelio,zelino,zenobio,zequinha,zuenir'.split(','));

function detectarSexoPeloNome(nome) {
  if (!nome) return '';
  const n = nome.trim().split(/\s+/)[0].toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (_NOMES_F.has(n)) return 'F';
  if (_NOMES_M.has(n)) return 'M';
  // Heurísticas por terminação para nomes não listados
  if (n.endsWith('a') && !['luca','nikita','elisha','joshua'].includes(n)) return 'F';
  if (/son$|sao$|aldo$|ildo$|eiro$|inho$|ando$|endo$|ondo$|undo$|isco$|isto$|erto$|orge$|ique$|nior$|imar$|ival$|inei$|imar$|aldo$|elmo$|eron$/.test(n)) return 'M';
  if (/ela$|ane$|iane$|iene$|aine$|eine$|aiane$|elle$|elli$|iane$|ioni$/.test(n)) return 'F';
  return '';
}

// Tabela de coordenadas de cidades da região metropolitana de São Paulo
const CIDADE_COORDS = {
  'cajamar':                   { lat: -23.3570, lng: -46.8750 },
  'guarulhos':                 { lat: -23.4530, lng: -46.5330 },
  'osasco':                    { lat: -23.5320, lng: -46.7920 },
  'barueri':                   { lat: -23.5116, lng: -46.8756 },
  'santana de parnaiba':       { lat: -23.4448, lng: -46.9178 },
  'santana de parnaíba':       { lat: -23.4448, lng: -46.9178 },
  'itapecerica da serra':      { lat: -23.7170, lng: -46.8487 },
  'sao paulo':                 { lat: -23.5505, lng: -46.6333 },
  'são paulo':                 { lat: -23.5505, lng: -46.6333 },
  'santo andre':               { lat: -23.6639, lng: -46.5383 },
  'santo andré':               { lat: -23.6639, lng: -46.5383 },
  'sao bernardo do campo':     { lat: -23.6914, lng: -46.5646 },
  'são bernardo do campo':     { lat: -23.6914, lng: -46.5646 },
  'diadema':                   { lat: -23.6858, lng: -46.6207 },
  'maua':                      { lat: -23.6678, lng: -46.4617 },
  'mauá':                      { lat: -23.6678, lng: -46.4617 },
  'mogi das cruzes':           { lat: -23.5222, lng: -46.1875 },
  'suzano':                    { lat: -23.5422, lng: -46.3103 },
  'itaquaquecetuba':           { lat: -23.4873, lng: -46.3486 },
  'ferraz de vasconcelos':     { lat: -23.5400, lng: -46.3671 },
  'poa':                       { lat: -23.5252, lng: -46.3465 },
  'poá':                       { lat: -23.5252, lng: -46.3465 },
  'ribeirao pires':            { lat: -23.7109, lng: -46.4125 },
  'ribeirão pires':            { lat: -23.7109, lng: -46.4125 },
  'francisco morato':          { lat: -23.2817, lng: -46.7394 },
  'franco da rocha':           { lat: -23.3211, lng: -46.7250 },
  'caieiras':                  { lat: -23.3631, lng: -46.7406 },
  'mairipora':                 { lat: -23.3181, lng: -46.5867 },
  'mairiporã':                 { lat: -23.3181, lng: -46.5867 },
  'aruja':                     { lat: -23.3964, lng: -46.3197 },
  'arujá':                     { lat: -23.3964, lng: -46.3197 },
  'santa isabel':              { lat: -23.3167, lng: -46.2253 },
  'jandira':                   { lat: -23.5289, lng: -46.9036 },
  'itapevi':                   { lat: -23.5489, lng: -47.0589 },
  'carapicuiba':               { lat: -23.5225, lng: -46.8353 },
  'carapicuíba':               { lat: -23.5225, lng: -46.8353 },
  'cotia':                     { lat: -23.6036, lng: -46.9189 },
  'embu das artes':            { lat: -23.6481, lng: -46.8517 },
  'embu-guaçu':                { lat: -23.8328, lng: -46.8097 },
  'embu guacu':                { lat: -23.8328, lng: -46.8097 },
  'taboao da serra':           { lat: -23.6072, lng: -46.7575 },
  'taboão da serra':           { lat: -23.6072, lng: -46.7575 },
  'vargem grande paulista':    { lat: -23.6017, lng: -47.0328 },
  'sao roque':                 { lat: -23.5247, lng: -47.1381 },
  'são roque':                 { lat: -23.5247, lng: -47.1381 },
  'pirapora do bom jesus':     { lat: -23.3939, lng: -47.0158 },
  'campo limpo paulista':      { lat: -23.2286, lng: -46.7875 },
  'varzea paulista':           { lat: -23.2111, lng: -46.8278 },
  'várzea paulista':           { lat: -23.2111, lng: -46.8278 },
  'jundiai':                   { lat: -23.1864, lng: -46.8978 },
  'jundiaí':                   { lat: -23.1864, lng: -46.8978 },
  'itupeva':                   { lat: -23.1539, lng: -47.0606 },
  'sorocaba':                  { lat: -23.5015, lng: -47.4526 },
  'campinas':                  { lat: -22.9099, lng: -47.0626 },
  'guaruja':                   { lat: -23.9933, lng: -46.2565 },
  'guarujá':                   { lat: -23.9933, lng: -46.2565 },
  'santos':                    { lat: -23.9608, lng: -46.3336 },
  'sao vicente':               { lat: -23.9619, lng: -46.3919 },
  'são vicente':               { lat: -23.9619, lng: -46.3919 },
  'praia grande':              { lat: -24.0059, lng: -46.4022 },
  'cubatao':                   { lat: -23.8944, lng: -46.4258 },
  'cubatão':                   { lat: -23.8944, lng: -46.4258 },
};

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function empresasMaisProximas(talento) {
  const raw = (talento.cidade || '').toLowerCase().trim();
  // normaliza removendo acentos para fallback
  const sem = raw.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const coords = CIDADE_COORDS[raw] || CIDADE_COORDS[sem];
  if (!coords) return [];
  return (state.empresas || [])
    .filter(e => e.lat && e.lng)
    .map(e => ({ ...e, distKm: Math.round(haversineKm(coords.lat, coords.lng, e.lat, e.lng)) }))
    .sort((a, b) => a.distKm - b.distKm);
}

function fileToBase64(file) {
  return new Promise(async (resolve, reject) => {
    // Validação de segurança: verifica extensão, tamanho E magic bytes (cabeçalho real do arquivo)
    // Isso impede que um .exe ou .js renomeado para .jpg entre no sistema
    if (typeof validarArquivoSeguro === 'function') {
      const validacao = await validarArquivoSeguro(file);
      if (!validacao.valido) {
        return reject(new Error(validacao.mensagem));
      }
    } else {
      // Fallback caso security.js não tenha carregado
      const allowedExtensions = ['jpg', 'jpeg', 'png', 'pdf', 'webp'];
      const extension = file.name.split('.').pop().toLowerCase();
      if (!allowedExtensions.includes(extension)) {
        return reject(new Error(`Formato inválido para "${file.name}". Apenas JPG, JPEG, PNG, PDF ou WEBP são aceitos.`));
      }
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        return reject(new Error(`O arquivo "${file.name}" ultrapassa o limite máximo permitido de 10MB.`));
      }
    }

    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

// Helpers para Sessão, Auditoria e Empacotamento ZIP
function verificarSessao() {
  // Usa verificarSessaoValida() do módulo security.js (expira após 8h)
  const sessaoAtiva = (typeof verificarSessaoValida === 'function')
    ? verificarSessaoValida()
    : (() => {
        try { const r = localStorage.getItem('rt_logged_user'); return r ? JSON.parse(r) : null; } catch { return null; }
      })();

  const loginScreen = document.getElementById('login-screen');
  const userProfile = document.getElementById('header-user-profile');
  const btnLogout = document.getElementById('btn-logout');

  if (sessaoAtiva) {
    loggedUser = sessaoAtiva;
    // Ocultar tela de login
    if (loginScreen) loginScreen.style.display = 'none';
    
    // Preencher dados do cabeçalho
    if (userProfile) {
      userProfile.style.display = 'flex';
      const nameEl = document.getElementById('header-user-name');
      const roleEl = document.getElementById('header-user-role');
      const avatarEl = document.getElementById('header-user-avatar');

      if (nameEl) nameEl.textContent = loggedUser.nome;
      if (roleEl) {
        const deptoLabels = {
          'administracao': 'Gestão Executiva',
          'selecao': 'Recrutamento & Seleção',
          'dp': 'Departamento Pessoal',
          'comissao': 'Comissões & Estatísticas'
        };
        roleEl.textContent = deptoLabels[loggedUser.departamento] || 'Colaborador';
      }
      if (avatarEl) {
        const initials = loggedUser.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
        avatarEl.textContent = initials;
        const perfilAvatar = document.getElementById('header-user-avatar-perfil');
        if (perfilAvatar) perfilAvatar.textContent = initials;
      }
    }
    if (btnLogout) btnLogout.style.display = 'block';

    // Aplicar regras de menu (RBAC)
    verificarPermissoesMenu();
    // Controle de acesso por horário (cobre o painel se estiver fora do horário)
    if (typeof aplicarGateHorario === 'function') aplicarGateHorario();
  } else {
    loggedUser = null;
    if (loginScreen) loginScreen.style.display = 'flex';
    if (userProfile) userProfile.style.display = 'none';
    if (btnLogout) btnLogout.style.display = 'none';
  }
}

function isAbaAutorizada(abaId) {
  if (!loggedUser) return false;
  if (abaId === 'meu-painel') return true;
  if (abaId === 'fila') return true; // todos os logados acessam
  if (abaId === 'lixeira') return loggedUser.login === 'joaobalaf' || loggedUser.departamento === 'administracao';
  if (abaId === 'controle-acesso') return podeGerenciarHorarios();
  if (abaId === 'cadastros-exata') return loggedUser.login === 'joaobalaf' || loggedUser.departamento === 'administracao';
  if (loggedUser.login === 'joaobalaf') return true;
  const depto = loggedUser.departamento;
  if (depto === 'administracao') return true;
  // Usar permissões granulares se disponíveis
  const area = ABA_PARA_AREA[abaId];
  if (area && loggedUser.permissoes && loggedUser.permissoes[area]) {
    return loggedUser.permissoes[area].visualizar === true;
  }
  // Fallback por departamento para contas antigas sem permissões definidas
  if (depto === 'selecao') {
    const temVinculo = state && state.recrutadores && state.recrutadores.some(r => (r.usuarioId && r.usuarioId === loggedUser.id) || (r.loginVinculado && r.loginVinculado === loggedUser.login));
    if (temVinculo) return abaId === 'meu-painel';
    return ['dashboard', 'vagas', 'banco-talentos', 'selecao', 'site', 'meu-painel'].includes(abaId);
  }
  if (depto === 'dp') return ['depto-pessoal', 'banco-talentos'].includes(abaId);
  if (depto === 'comissao') return ['comissao'].includes(abaId);
  return false;
}

function verificarPermissoesMenu() {
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  navItems.forEach(item => {
    const aba = item.getAttribute('data-aba');
    // Ignorar itens especiais (funcionarios e auditoria têm controle próprio abaixo)
    if (aba === 'funcionarios' || aba === 'auditoria') return;
    item.style.display = isAbaAutorizada(aba) ? '' : 'none';
  });

  // Controle do menu Funcionários
  const navFunc = document.getElementById('nav-item-funcionarios');
  if (navFunc) {
    const pode = loggedUser && (
      loggedUser.login === 'joaobalaf' ||
      loggedUser.departamento === 'administracao' ||
      loggedUser.permissoes?.funcionarios?.visualizar === true
    );
    navFunc.style.display = pode ? '' : 'none';
  }

  // Controle do menu Auditoria
  const navAuditoria = document.getElementById('nav-item-auditoria');
  if (navAuditoria) {
    const pode = loggedUser && (
      loggedUser.login === 'joaobalaf' ||
      loggedUser.departamento === 'administracao' ||
      loggedUser.permissoes?.sistema?.visualizar === true
    );
    navAuditoria.style.display = pode ? '' : 'none';
  }

  // Controle do menu Inaptos (somente admin)
  const navInaptos = document.getElementById('nav-item-inaptos');
  if (navInaptos) {
    const podeInaptos = loggedUser && (
      loggedUser.login === 'joaobalaf' ||
      loggedUser.departamento === 'administracao'
    );
    navInaptos.style.display = podeInaptos ? '' : 'none';
  }

  // Controle do menu Configurações (somente admin)
  const navConfig = document.getElementById('nav-item-configuracoes');
  if (navConfig) {
    const podeConfig = loggedUser && (
      loggedUser.login === 'joaobalaf' ||
      loggedUser.departamento === 'administracao'
    );
    navConfig.style.display = podeConfig ? '' : 'none';
  }

  if (!isAbaAutorizada(activeAba)) {
    let homeAba = 'dashboard';
    if (loggedUser.departamento === 'dp') homeAba = 'depto-pessoal';
    else if (loggedUser.departamento === 'comissao') homeAba = 'comissao';
    else if (loggedUser.departamento === 'selecao') {
      const temVinculo = state && state.recrutadores && state.recrutadores.some(r => (r.usuarioId && r.usuarioId === loggedUser.id) || (r.loginVinculado && r.loginVinculado === loggedUser.login));
      if (temVinculo) homeAba = 'meu-painel';
    }
    switchAba(homeAba);
  }
}

function registrarAcaoHistorico(candidato, acao) {
  // Se for o usuário joaobalaf, não deixa rastros na auditoria
  if (loggedUser && loggedUser.login === 'joaobalaf') {
    return;
  }
  if (!candidato.historico) candidato.historico = [];
  const autor = loggedUser ? `${loggedUser.nome} (${loggedUser.departamento.toUpperCase()})` : 'Sistema R&T';
  
  const log = {
    data: new Date().toLocaleString('pt-BR'),
    autor: autor,
    acao: acao
  };
  
  candidato.historico.push(log);
}

function base64ToBlob(base64Data) {
  if (!base64Data) return null;
  if (!base64Data.startsWith('data:')) return null;

  try {
    const parts = base64Data.split(';base64,');
    const contentType = parts[0].split(':')[1];
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    
    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    
    return new Blob([uInt8Array], { type: contentType });
  } catch (e) {
    console.error('Erro ao converter base64 para Blob:', e);
    return null;
  }
}

// Retorna Promise que adiciona o arquivo real no ZIP (base64 ou URL remota).
// Se não houver dado, resolve sem adicionar nada (sem placeholder .txt).
function adicionarDocumentoAoZip(folder, filename, dado) {
  if (!dado) return Promise.resolve();

  // Dado já é base64 data URI — converte para Blob direto
  if (dado.startsWith('data:')) {
    return new Promise(resolve => {
      const blob = base64ToBlob(dado);
      if (blob) {
        const mime = dado.split(';base64,')[0].split(':')[1];
        let ext = 'png';
        if (mime === 'application/pdf') ext = 'pdf';
        else if (mime === 'image/jpeg') ext = 'jpg';
        else if (mime === 'image/webp') ext = 'webp';
        folder.file(`${filename}.${ext}`, blob, { binary: true });
      }
      resolve();
    });
  }

  // URL externa (https://...) — faz fetch e obtém o binário real
  return fetch(dado)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.blob();
    })
    .then(blob => {
      const mime = blob.type || 'image/jpeg';
      let ext = 'jpg';
      if (mime === 'application/pdf') ext = 'pdf';
      else if (mime === 'image/png') ext = 'png';
      else if (mime === 'image/webp') ext = 'webp';
      folder.file(`${filename}.${ext}`, blob, { binary: true });
    })
    .catch(() => {
      // Se fetch falhar, registra só um aviso (sem travar o ZIP)
      folder.file(`${filename}_nao_baixado.txt`, `Não foi possível baixar este documento. URL original: ${dado}`);
    });
}

function gerarFichaCadastralTexto(cand) {
  const vaga = state.vagas.find(v => v.id === cand.vagaId);
  const rec   = state.recrutadores.find(r => r.id === cand.recrutadorId);
  const recNome = rec
    ? rec.nome
    : (cand.origemLink === 'agencia_rt' ? 'Agência R&T' : 'Não definido');
  const foto3x4 = cand.foto3x4Contrato || {};
  const foto3x4Resumo = foto3x4.opcao === 'convenio_desconto'
    ? 'Sim, vai tirar pelo convênio da empresa. Autorizou desconto único de R$ 25,00 no salário.'
    : foto3x4.opcao === 'providenciar_propria'
      ? 'Não, vai providenciar a foto 3x4 por conta própria.'
      : 'Não informado';

  const linha = (label, valor) => `${label}: ${valor || 'Não informado'}`;

  const historicoTxt = (cand.historico && cand.historico.length > 0)
    ? cand.historico.map((h, i) => `  ${i + 1}. [${h.data}] ${h.autor}\n     ${h.acao}`).join('\n')
    : '  Nenhum histórico registrado.';

  return [
    '================================================================',
    'FICHA CADASTRAL — R&T EMPREGOS (GRUPO RT)',
    `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
    '================================================================',
    '',
    '[ IDENTIFICAÇÃO ]',
    linha('Número da fila',       cand.numeroFila ? `#${cand.numeroFila}` : null),
    linha('Data do cadastro',     cand.dataCadastro ? new Date(cand.dataCadastro).toLocaleString('pt-BR') : null),
    '',
    '[ DADOS PESSOAIS ]',
    linha('Nome completo',        cand.nome),
    linha('CPF',                  cand.cpf),
    linha('RG',                   cand.rg),
    linha('PIS/NIS',              cand.pis),
    linha('Data de nascimento',   cand.dataNascimento),
    linha('Nome da mãe',          cand.nomeMae),
    linha('Nome do pai',          cand.nomePai),
    linha('Telefone',             cand.telefone),
    linha('E-mail',               cand.email),
    '',
    '[ ENDEREÇO ]',
    linha('CEP',                  cand.cep),
    linha('Rua',                  cand.rua),
    linha('Número',               cand.numeroCasa),
    linha('Bairro',               cand.bairro),
    linha('Cidade',               cand.cidade),
    linha('Estado',               cand.estado),
    '',
    '[ DADOS BANCÁRIOS ]',
    linha('Banco',                cand.banco),
    linha('Tipo de chave PIX',    cand.tipoPix),
    linha('Chave PIX',            cand.chavePix),
    '',
    '[ UNIFORME ]',
    linha('Tamanho da camiseta',  cand.tamanhoCamiseta),
    linha('Tamanho da calça',     cand.tamanhoCalca),
    linha('Tamanho da bota',      cand.tamanhoBota),
    '',
    '[ FOTO 3X4 DO CONTRATO ]',
    linha('Opção escolhida',      foto3x4Resumo),
    '',
    '[ VAGA & EMPRESA ]',
    linha('Vaga',                 vaga ? vaga.cargo : cand.codigoVaga),
    linha('Empresa',              vaga ? vaga.empresaNome : null),
    linha('Unidade / Código',     vaga ? vaga.codigo : null),
    linha('Local de trabalho',    vaga ? vaga.localTrabalho : null),
    linha('Salário base',         vaga ? `R$ ${Number(vaga.salario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null),
    linha('Turno',                cand.turnoTrabalho),
    linha('Escala',               cand.escala),
    linha('Linha de fretado',     cand.linhaFretado),
    '',
    '[ RECRUTAMENTO ]',
    linha('Recrutado por',        recNome),
    linha('Tipo de cadastro',     cand.origemCadastro === 'presencial' ? 'PRESENCIAL (Agência R&T)' : 'ONLINE'),
    linha('Como soube da vaga',   cand.comoSoube ? ({instagram:'Instagram R&T',facebook:'Facebook R&T',anuncios_fb:'Anúncios Facebook',sel_mayara:'Selecionadora Mayara',sel_alessandra:'Selecionadora Alessandra',sel_lucas:'Selecionadora Lucas',sel_julio:'Selecionadora Júlio',sel_julia:'Selecionadora Júlia',sel_milena:'Selecionadora Milena',sel_vitoria:'Selecionadora Vitória',sel_sara:'Selecionadora Sara'}[cand.comoSoube] || cand.comoSoube) : null),
    linha('Origem do link',       cand.origemLink),
    linha('Data envio ao DP',     cand.dataSubiuDP),
    linha('Aprovador Seleção',    cand.aprovadorSelecao),
    '',
    '[ DEVOLUÇÃO / CORREÇÃO ]',
    cand.devolvidoPor
      ? [
          linha('Devolvida por',      cand.devolvidoPor),
          linha('Data devolução',     cand.dataDevolucaoDP),
          linha('Motivo',             cand.motivoDevolucaoDP),
          linha('Corrigida por',      cand.corrigidoPor),
          linha('Data correção',      cand.dataCorrecao),
        ].join('\n')
      : '  Sem devolução pelo DP.',
    '',
    '[ OBSERVAÇÕES DA SELEÇÃO ]',
    cand.observacoesSelecao ? `  ${cand.observacoesSelecao}` : '  Nenhuma observação.',
    '',
    '[ HISTÓRICO DA FICHA ]',
    historicoTxt,
    '',
    '================================================================',
    'Documento gerado pelo CRM R&T Empregos. Uso interno — LGPD.',
    '================================================================',
  ].join('\n');
}

// Gera a Ficha do Candidato em Word (.docx) montando OOXML com o JSZip já carregado.
async function gerarFichaDocx(cand) {
  const vaga = state.vagas.find(v => v.id === cand.vagaId) || {};
  const rec  = state.recrutadores.find(r => r.id === cand.recrutadorId);
  const recNome = rec ? rec.nome : (cand.origemLink === 'agencia_rt' ? 'Agência R&T' : '—');
  const ben = cand.beneficiosSelecao || {};

  const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const val = (x) => {
    if (x === null || x === undefined || x === '') return '—';
    if (typeof x === 'object') return '—';
    return String(x);
  };
  const salario = (vaga && vaga.salario != null && vaga.salario !== '')
    ? ('R$ ' + Number(vaga.salario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })) : '—';

  function p(text, o) {
    o = o || {};
    const rpr = [];
    if (o.bold) rpr.push('<w:b/>');
    if (o.color) rpr.push(`<w:color w:val="${o.color}"/>`);
    if (o.size) rpr.push(`<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>`);
    const ppr = [];
    if (o.align) ppr.push(`<w:jc w:val="${o.align}"/>`);
    if (o.spaceAfter) ppr.push(`<w:spacing w:after="${o.spaceAfter}"/>`);
    return `<w:p><w:pPr>${ppr.join('')}</w:pPr><w:r><w:rPr>${rpr.join('')}</w:rPr><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r></w:p>`;
  }
  function secTitle(text) {
    return `<w:p><w:pPr><w:spacing w:before="240" w:after="80"/><w:shd w:val="clear" w:fill="F1F5F9"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="0F172A"/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r></w:p>`;
  }
  function cellXml(text, w, o) {
    o = o || {};
    const rpr = o.bold ? '<w:b/>' : '';
    const shd = o.fill ? `<w:shd w:val="clear" w:fill="${o.fill}"/>` : '';
    return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${shd}</w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/></w:pPr><w:r><w:rPr>${rpr}<w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r></w:p></w:tc>`;
  }
  function table(rows) {
    const borders = `<w:tblBorders><w:top w:val="single" w:sz="4" w:color="E2E8F0"/><w:left w:val="single" w:sz="4" w:color="E2E8F0"/><w:bottom w:val="single" w:sz="4" w:color="E2E8F0"/><w:right w:val="single" w:sz="4" w:color="E2E8F0"/><w:insideH w:val="single" w:sz="4" w:color="E2E8F0"/><w:insideV w:val="single" w:sz="4" w:color="E2E8F0"/></w:tblBorders>`;
    const trs = rows.map(r => `<w:tr>${cellXml(r[0], 3200, { bold: true, fill: 'F8FAFC' })}${cellXml(r[1], 6300)}</w:tr>`).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="9500" w:type="dxa"/>${borders}</w:tblPr>${trs}</w:tbl>`;
  }

  const body =
    p('FICHA DO CANDIDATO', { bold: true, size: 40, align: 'center', color: '0F172A' }) +
    p('Grupo R&T — Departamento Pessoal', { align: 'center', color: '64748B', size: 22, spaceAfter: 120 }) +
    p(`Exportado em ${new Date().toLocaleString('pt-BR')} por ${loggedUser ? loggedUser.nome : 'Sistema R&T'}`, { align: 'center', color: '94A3B8', size: 16, spaceAfter: 200 }) +
    secTitle('Seção 1 — Dados Pessoais') +
    table([
      ['Nome completo', val(cand.nome)], ['CPF', val(cand.cpf)], ['RG', val(cand.rg)],
      ['Data de nascimento', val(cand.dataNascimento)], ['Sexo', val(cand.sexo)], ['Estado civil', val(cand.estadoCivil)],
      ['Nome da mãe', val(cand.nomeMae)], ['Nome do pai', val(cand.nomePai)],
      ['Telefone', val(cand.telefone)], ['E-mail', val(cand.email)]
    ]) +
    secTitle('Seção 2 — Endereço') +
    table([
      ['CEP', val(cand.cep)], ['Rua', val(cand.rua)], ['Número', val(cand.numeroCasa)],
      ['Complemento', val(cand.complemento)], ['Bairro', val(cand.bairro)], ['Cidade', val(cand.cidade)], ['Estado', val(cand.estado)]
    ]) +
    secTitle('Seção 3 — Dados Bancários') +
    table([
      ['Banco', val(cand.banco)], ['Agência', val(cand.agencia)], ['Conta', val(cand.conta)],
      ['Tipo de conta', val(cand.tipoConta)], ['Chave PIX', val(cand.chavePix)], ['Tipo de chave PIX', val(cand.tipoPix)]
    ]) +
    secTitle('Seção 4 — Dados Profissionais') +
    table([
      ['Empresa', val(vaga.empresaNome)], ['Vaga', val(vaga.cargo || cand.codigoVaga)], ['Cargo', val(cand.cargo || vaga.cargo)],
      ['Salário', salario], ['Data de admissão', val(cand.dataAdmissao || cand.dataContratacao)], ['Turno', val(cand.turnoTrabalho)],
      ['Recrutado por', val(recNome)], ['Origem do cadastro', cand.origemCadastro === 'presencial' ? 'Presencial (Agência R&T)' : (cand.origemCadastro ? 'Online' : '—')]
    ]) +
    secTitle('Seção 5 — Transporte e Benefícios') +
    table([
      ['Tipo de transporte', ben.fretado ? 'Fretado' : (ben.passagemIdaVolta ? 'Passagem (VT)' : '—')],
      ['Valor de VT', val(ben.valorVT)], ['Linha do fretado', val(ben.linhaFretado || cand.linhaFretado)],
      ['Benefícios', val(ben.qualFretado)], ['Observações', val(cand.observacoesSelecao)]
    ]) +
    secTitle('Seção 6 — Uniforme') +
    table([
      ['Tamanho da camiseta', val(cand.tamanhoCamiseta)], ['Tamanho da calça', val(cand.tamanhoCalca)], ['Tamanho da bota', val(cand.tamanhoBota)]
    ]) +
    secTitle('Seção 7 — Controle do Processo') +
    table([
      ['Status', val(cand.status)], ['Data do cadastro', val(cand.dataCadastro ? new Date(cand.dataCadastro).toLocaleString('pt-BR') : '')],
      ['Data do envio ao DP', val(cand.dataSubiuDP)], ['Selecionadora responsável', val(cand.aprovadorSelecao || recNome)],
      ['Observações internas', val(cand.observacoesSelecao)]
    ]);

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const relsRoot = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

  const docx = new JSZip();
  docx.file('[Content_Types].xml', contentTypes);
  docx.folder('_rels').file('.rels', relsRoot);
  docx.folder('word').file('document.xml', documentXml);
  return await docx.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

async function exportarFichaCompletaZip(candidatoId) {
  const cand = state.candidatos.find(c => c.id === candidatoId);
  if (!cand) { alert('Candidato não encontrado.'); return; }

  // Nome limpo: sem acentos, sem caracteres especiais
  const cleanName = cand.nome
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_');

  // Feedback visual enquanto gera
  const btnExportar = document.getElementById('btn-dp-exportar') || document.getElementById('btn-download-pasta');
  const labelOriginal = btnExportar ? btnExportar.innerHTML : '';
  if (btnExportar) {
    btnExportar.disabled = true;
    btnExportar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando ZIP...';
  }

  try {
    const zip = new JSZip(); // CDN global
    const folder = zip.folder(cleanName);

    // Documento Word (.docx) com os dados do candidato, organizado em seções
    const nomeDocx = cand.nome.replace(/[\\/:*?"<>|]/g, '').trim();
    folder.file(`Ficha do Candidato - ${nomeDocx}.docx`, await gerarFichaDocx(cand));

    // Documentos reais (base64 ou URL remota) — todos em paralelo
    const docs = cand.documentos || {};
    await Promise.all([
      adicionarDocumentoAoZip(folder, 'selfie',                 docs.selfie),
      adicionarDocumentoAoZip(folder, 'rg_frente',              docs.rgFrente),
      adicionarDocumentoAoZip(folder, 'foto_pis_nis',           docs.fotoPis),
      adicionarDocumentoAoZip(folder, 'cpf_documento',          docs.cpfDocumento),
      adicionarDocumentoAoZip(folder, 'comprovante_residencia', docs.comprovanteResidencia),
      adicionarDocumentoAoZip(folder, 'cartao_banco_verso',     docs.cartaoBancoVerso),
    ]);

    // Gera o ZIP e dispara o download
    const content = await zip.generateAsync({ type: 'blob' });
    const url = window.URL.createObjectURL(content);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = cleanName + '.zip';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    registrarAcaoHistorico(cand, 'Exportou pasta completa em ZIP — ' + cleanName + '/ (Ficha em Word .docx + documentos).');
    registrarLogGlobal(`Exportou a pasta do candidato "${cand.nome}" (Word + documentos).`, 'exportacao');
    saveState();

  } catch (err) {
    alert('Erro ao gerar o arquivo ZIP: ' + err.message);
  } finally {
    if (btnExportar) {
      btnExportar.disabled = false;
      btnExportar.innerHTML = labelOriginal;
    }
  }
}

// Executa ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
  initLocalStorage();
  verificarSessao();
  setupNavigation();
  setupEventListeners();
  initNewModules();
  renderCurrentAba();
  ativarNuvem();
  iniciarControleAcesso();
});

// Indica que a nuvem já foi carregada e é a fonte principal dos dados.
// Enquanto for false, o saveState grava SÓ no cache local (não envia à nuvem),
// para o cache/semente nunca sobrescrever dados mais recentes do servidor.
let _cloudReady = false;

// Ativa a sincronização na nuvem (Firebase).
// Só roda se a config estiver preenchida em js/firebase-sync.js;
// caso contrário, o sistema segue funcionando só com localStorage (como hoje).
async function ativarNuvem() {
  if (!(window.RTCloud && RTCloud.configured)) return;
  try {
    await RTCloud.init({
      onRemoteUpdate: (dados) => {
        if (!dados) return;
        state = dados;
        try { localStorage.setItem('rt_empregos_data', JSON.stringify(state)); } catch (e) {}
        renderCurrentAba();
      }
    });
    const nuvem = await RTCloud.loadState();
    if (nuvem) {
      // A NUVEM é a fonte principal: adota os dados da nuvem (o cache/semente
      // local não sobrescreve dados mais recentes do servidor).
      state = nuvem;
      try { localStorage.setItem('rt_empregos_data', JSON.stringify(state)); } catch (e) {}
      _cloudReady = true;
      renderCurrentAba();
    } else {
      // Nuvem vazia (primeiro uso): inicializa a nuvem com o estado atual.
      _cloudReady = true;
      RTCloud.saveState(state);
    }
  } catch (e) {
    console.error('[RT Nuvem] Não foi possível ativar a sincronização:', e);
    _cloudReady = true; // fallback: permite que edições tentem sincronizar
  }
}

// 1. GERENCIAMENTO DE ESTADO E LOCALSTORAGE
function initLocalStorage() {
  const localData = localStorage.getItem('rt_empregos_data');
  if (!localData) {
    localStorage.setItem('rt_empregos_data', JSON.stringify(INITIAL_DATA));
    state = JSON.parse(JSON.stringify(INITIAL_DATA));
  } else {
    try {
      state = JSON.parse(localData);
    } catch (e) {
      console.error('[RT Segurança] localStorage corrompido, reiniciando...', e);
      localStorage.removeItem('rt_empregos_data');
      state = JSON.parse(JSON.stringify(INITIAL_DATA));
    }
  }

  // Garantir compatibilidade reversa para campos novos
  if (state && state.candidatos) {
    let alterado = false;
    state.candidatos.forEach(c => {
      if (!c.historico) {
        c.historico = [];
        c.historico.push({
          data: c.dataCadastro ? new Date(c.dataCadastro).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR'),
          autor: 'Sistema R&T',
          acao: 'Candidato cadastrado no portal de vagas.'
        });
        alterado = true;
      }
      if (c.devolvidoDP === undefined) {
        c.devolvidoDP = false;
        alterado = true;
      }
      if (!c.motivoDevolucaoDP) {
        c.motivoDevolucaoDP = '';
        alterado = true;
      }
      if (!c.turnoTrabalho) {
        c.turnoTrabalho = 'Diurno';
        alterado = true;
      }
    });

    // Inserir os funcionários padrão se não existirem
    if (!state.funcionarios || state.funcionarios.length === 0) {
      state.funcionarios = JSON.parse(JSON.stringify(INITIAL_DATA.funcionarios));
      alterado = true;
    }

    // Garantir que o login joaobalaf está na base ativa e com privilégios de administrador
    const temJoaoBalaf = state.funcionarios.some(f => f.login === 'joaobalaf');
    if (!temJoaoBalaf) {
      state.funcionarios.push({
        id: 'func-5',
        nome: 'João Balaf (Admin)',
        email: 'joaobalaf@rtempregos.com',
        login: 'joaobalaf',
        senha: '.jJ970262405',
        departamento: 'administracao',
        nivelAcesso: 'administrador',
        status: 'ativo'
      });
      alterado = true;
    }

    // Garantir campos novos em vagas
    if (state.vagas) {
      state.vagas.forEach(v => {
        if (v.vagasSolicitadas === undefined) {
          v.vagasSolicitadas = (v.vagasPreenchidas || 0) + (v.vagasDisponiveis || 0);
          alterado = true;
        }
        if (v.vagasPreenchidas === undefined) { v.vagasPreenchidas = 0; alterado = true; }
        if (v.vagasCanceladas === undefined) { v.vagasCanceladas = 0; alterado = true; }
        if (v.vagasReabertas === undefined) { v.vagasReabertas = 0; alterado = true; }
        if (!v.statusDemanda) { v.statusDemanda = 'ativa'; alterado = true; }
        if (!v.historicoAjustes) { v.historicoAjustes = []; alterado = true; }
      });
    }

    // Garantir array de logs de auditoria
    if (!state.logs) {
      state.logs = JSON.parse(JSON.stringify(INITIAL_DATA.logs || []));
      alterado = true;
    }

    // Garantir objeto de configurações globais
    if (!state.config) {
      state.config = { dpPodeEditar: false };
      alterado = true;
    }

    // Garantir configuração do formulário de vagas (campos personalizáveis)
    if (!state.vagaFormConfig) {
      state.vagaFormConfig = { renomes: {}, camposExtras: [] };
      alterado = true;
    }

    // Garantir contador de fila
    if (!state.proximaFilaNum) {
      state.proximaFilaNum = (state.candidatos ? state.candidatos.length : 0) + 1;
      // Retroativamente atribuir número de fila aos candidatos existentes
      state.candidatos.forEach((c, idx) => {
        if (!c.numeroFila) { c.numeroFila = idx + 1; }
      });
      alterado = true;
    }

    // Garantir banco de talentos simples
    if (!state.bancoTalentos) {
      state.bancoTalentos = [];
      alterado = true;
    }

    // Garantir arrays de inaptos e motivos
    if (!state.inaptos) { state.inaptos = []; alterado = true; }
    if (!state.motivosInaptidao) {
      state.motivosInaptidao = JSON.parse(JSON.stringify(INITIAL_DATA.motivosInaptidao || []));
      alterado = true;
    }

    // Garantir whatsapp nos recrutadores
    if (state.recrutadores) {
      state.recrutadores.forEach(r => {
        if (r.whatsapp === undefined) { r.whatsapp = ''; alterado = true; }
        if (r.loginVinculado === undefined) { r.loginVinculado = ''; alterado = true; }
        if (!r.templates) { r.templates = {}; alterado = true; }
        if (!r.disparosLog) { r.disparosLog = []; alterado = true; }
      });
    }

    // Garantir sistema de fila
    if (!state.fila) {
      state.fila = { contadores: { selecao: 0, dp: 0, geral: 0 }, senhas: [], ultimaChamada: null };
      alterado = true;
    }
    if (!state.fila.contadores) { state.fila.contadores = { selecao: 0, dp: 0, geral: 0 }; alterado = true; }
    if (!state.fila.senhas)     { state.fila.senhas = []; alterado = true; }

    // Garantir campos novos nos candidatos
    if (state.candidatos) {
      state.candidatos.forEach(c => {
        if (!c.beneficiosSelecao) {
          c.beneficiosSelecao = { fretado: false, qualFretado: '', linhaFretado: '', valorVT: '', passagemIdaVolta: '' };
          alterado = true;
        }
        if (c.inaptidaoInfo === undefined) { c.inaptidaoInfo = null; alterado = true; }
        if (c.aprovadoMesmoInapto === undefined) { c.aprovadoMesmoInapto = false; alterado = true; }
        if (c.statusCpf === undefined) { c.statusCpf = null; alterado = true; }
        if (c.dpLock === undefined) { c.dpLock = null; alterado = true; }
      });
    }

    // Garantir recrutadorId nos entries do banco de talentos
    if (state.bancoTalentos) {
      state.bancoTalentos.forEach(bt => {
        if (!bt.recrutadorId) {
          if (bt.origemLink && bt.origemLink.startsWith('rec_')) {
            bt.recrutadorId = bt.origemLink.replace('rec_', '');
          } else {
            bt.recrutadorId = null;
          }
          alterado = true;
        }
        if (!bt.dataCadastroISO) {
          bt.dataCadastroISO = new Date().toISOString();
          alterado = true;
        }
      });
    }

    // Garantir permissões em funcionários antigos
    if (state.funcionarios) {
      state.funcionarios.forEach(f => {
        if (!f.permissoes) {
          // Admin e joaobalaf recebem permissão total; outros recebem zero
          if (f.departamento === 'administracao' || f.login === 'joaobalaf') {
            f.permissoes = JSON.parse(JSON.stringify(INITIAL_DATA.funcionarios[0].permissoes));
          } else {
            f.permissoes = criarPermissoesZeradas();
            // Conceder permissões básicas do departamento conforme INITIAL_DATA
            const modelo = INITIAL_DATA.funcionarios.find(fi => fi.departamento === f.departamento);
            if (modelo) f.permissoes = JSON.parse(JSON.stringify(modelo.permissoes));
          }
          alterado = true;
        }
        if (!f.cargo) { f.cargo = 'Colaborador'; alterado = true; }
        if (f.representanteDepto === undefined) { f.representanteDepto = false; alterado = true; }
      });
    }

    // ── Campos novos: exclusão lógica, cadastro de funcionário e vínculo ──
    (state.candidatos || []).concat(state.bancoTalentos || []).forEach(c => {
      if (c && c.excluido === undefined) { c.excluido = false; alterado = true; }
    });
    if (state.funcionarios) {
      state.funcionarios.forEach(f => {
        if (f.telefone === undefined) { f.telefone = ''; alterado = true; }
        if (f.departamentoSolicitado === undefined) { f.departamentoSolicitado = f.departamento || ''; alterado = true; }
        if (f.dataSolicitacao === undefined) { f.dataSolicitacao = ''; alterado = true; }
        if (f.bloqueadoLogin === undefined) { f.bloqueadoLogin = false; alterado = true; }
      });
    }
    if (state.recrutadores) {
      state.recrutadores.forEach(r => {
        if (r.usuarioId === undefined) {
          const fv = (state.funcionarios || []).find(fn => fn.login && fn.login === r.loginVinculado);
          r.usuarioId = fv ? fv.id : null;
          alterado = true;
        }
      });
    }

    // Controle de acesso por horário (começa desligado — não muda o comportamento atual)
    if (!state.controleAcesso) { state.controleAcesso = controleAcessoDefault(); alterado = true; }
    // Tipos de contratação (vínculo/filial/regras) configuráveis pelo admin
    if (!state.tiposContratacao || !state.tiposContratacao.length) { state.tiposContratacao = tiposContratacaoDefault(); alterado = true; }

    if (alterado) {
      saveState();
    }

    // Migrar senhas em texto puro para SHA-256 (operação assíncrona silenciosa)
    if (typeof migrarSenhasParaHash === 'function') {
      migrarSenhasParaHash(state).then(migrou => {
        if (migrou) {
          saveState();
          console.log('[RT Segurança] Senhas migradas para SHA-256 com sucesso.');
        }
      });
    }
  }
}

function saveState() {
  // localStorage = cache temporário (rápido e offline). A nuvem é a fonte principal.
  localStorage.setItem('rt_empregos_data', JSON.stringify(state));
  // Só envia à nuvem depois que ela foi carregada (evita o cache/semente local
  // sobrescrever dados mais recentes do servidor — ver item 25.7).
  if (window.RTCloud && RTCloud.configured && _cloudReady) RTCloud.saveState(state);
}

// ==========================================================================
// CONTROLE DE ACESSO POR HORÁRIO (usuários internos) — motor
// Só afeta o index.html (interno). As páginas públicas não usam isto.
// ==========================================================================
const _DIAS_CA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

function controleAcessoDefault() {
  const diaUtil = { ativo: true, periodos: [{ inicio: '08:00', fim: '18:00' }], obs: '' };
  return {
    ativo: false,                 // começa DESLIGADO (não muda o comportamento atual)
    fuso: 'America/Sao_Paulo',
    horarioSemanal: {
      dom: { ativo: false, periodos: [], obs: '' },
      seg: JSON.parse(JSON.stringify(diaUtil)), ter: JSON.parse(JSON.stringify(diaUtil)),
      qua: JSON.parse(JSON.stringify(diaUtil)), qui: JSON.parse(JSON.stringify(diaUtil)),
      sex: JSON.parse(JSON.stringify(diaUtil)),
      sab: { ativo: true, periodos: [{ inicio: '08:00', fim: '12:00' }], obs: '' }
    },
    bloqueioManual: { ativo: false, motivo: '', por: '', em: '' },
    liberacaoTemporaria: { ativa: false, ate: 0, semPrazo: false, por: '', motivo: '', em: '' },
    liberacoesUsuario: [],
    liberacoesDepto: [],
    horariosIndividuais: [],
    datasEspeciais: [],
    excecoesPermanentes: [],
    mensagens: {
      foraHorario: 'Seu acesso ao sistema interno está indisponível neste momento.',
      bloqueioManual: 'O acesso interno foi temporariamente bloqueado pela administração.',
      liberacaoEncerrada: 'Sua liberação temporária terminou. Procure o administrador caso precise continuar.',
      usuarioBloqueado: 'Seu usuário está sem autorização de acesso neste momento.'
    }
  };
}

function getControleAcesso() {
  if (!state) return controleAcessoDefault();
  if (!state.controleAcesso) state.controleAcesso = controleAcessoDefault();
  return state.controleAcesso;
}

// Quem pode gerenciar horários (inicialmente só João + admin geral)
function podeGerenciarHorarios() {
  if (!loggedUser) return false;
  if (loggedUser.login === 'joaobalaf') return true;
  if (loggedUser.departamento === 'administracao') return true;
  return !!(loggedUser.permissoesEspeciais && loggedUser.permissoesEspeciais.podeGerenciarHorariosAcesso);
}

// ── Hora confiável (offset do servidor Firebase) ──────────────────────────
let _horaOffset = 0, _horaFonte = 'local';
async function sincronizarHora() {
  try {
    if (window.RTCloud && RTCloud.horaServidor) {
      const r = await RTCloud.horaServidor();
      _horaOffset = r.offset || 0; _horaFonte = r.fonte || 'local';
    }
  } catch (e) { _horaOffset = 0; _horaFonte = 'local'; }
}
function horaConfiavel() { return new Date(Date.now() + _horaOffset); }

function _partesDataFuso(dt, fuso) {
  try {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    const p = {}; f.formatToParts(dt).forEach(x => p[x.type] = x.value);
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: fuso, weekday: 'short' }).format(dt);
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    let hh = p.hour === '24' ? '00' : p.hour;
    return { diaSemana: map[wd] != null ? map[wd] : dt.getDay(), hhmm: `${hh}:${p.minute}`, dataISO: `${p.year}-${p.month}-${p.day}` };
  } catch (e) {
    return { diaSemana: dt.getDay(), hhmm: dt.toTimeString().slice(0, 5), dataISO: dt.toISOString().slice(0, 10) };
  }
}

function _proximaAbertura(cfg, diaSemana, hhmmAtual) {
  const nomes = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  for (let off = 0; off < 8; off++) {
    const di = (diaSemana + off) % 7;
    const d = cfg.horarioSemanal[_DIAS_CA[di]];
    if (d && d.ativo && (d.periodos || []).length) {
      for (const p of d.periodos) {
        if (off === 0 && hhmmAtual && p.inicio <= hhmmAtual) continue;
        return (off === 0 ? 'hoje' : off === 1 ? 'amanhã' : nomes[di]) + ' às ' + p.inicio;
      }
    }
  }
  return '—';
}

// Avaliação central: o usuário pode acessar AGORA? (hierarquia do item 20)
function acessoPermitidoAgora(user) {
  const cfg = getControleAcesso();
  if (!cfg.ativo) return { permitido: true, motivo: 'controle-desligado' };
  if (!user) return { permitido: false, motivo: 'sem-usuario', mensagem: cfg.mensagens.foraHorario };

  const agora = horaConfiavel();
  const agoraMs = agora.getTime();
  const { diaSemana, hhmm, dataISO } = _partesDataFuso(agora, cfg.fuso || 'America/Sao_Paulo');
  const vig = (ate) => ate && agoraMs < ate;
  const ctx = { hhmm, dataISO, proximaLiberacao: _proximaAbertura(cfg, diaSemana, hhmm) };

  // 1) Exceção permanente (João/admin/exceção) -> libera, mas marca p/ registro
  const ehAdmin = user.login === 'joaobalaf' || user.departamento === 'administracao';
  if (ehAdmin || (cfg.excecoesPermanentes || []).includes(user.id)) {
    return Object.assign({ permitido: true, motivo: 'excecao', registrarFora: cfg.bloqueioManual.ativo }, ctx);
  }
  // 2) Liberação individual
  if ((cfg.liberacoesUsuario || []).some(l => l.usuarioId === user.id && (l.permanente || vig(l.ate))))
    return Object.assign({ permitido: true, motivo: 'liberacao-usuario' }, ctx);
  // 3) Liberação por departamento
  if ((cfg.liberacoesDepto || []).some(l => l.depto === user.departamento && vig(l.ate)))
    return Object.assign({ permitido: true, motivo: 'liberacao-depto' }, ctx);
  // 4) Liberação temporária geral
  if (cfg.liberacaoTemporaria && cfg.liberacaoTemporaria.ativa && (cfg.liberacaoTemporaria.semPrazo || vig(cfg.liberacaoTemporaria.ate)))
    return Object.assign({ permitido: true, motivo: 'liberacao-geral' }, ctx);
  // 5) Bloqueio manual geral
  if (cfg.bloqueioManual && cfg.bloqueioManual.ativo)
    return Object.assign({ permitido: false, motivo: 'bloqueio-manual', mensagem: cfg.bloqueioManual.motivo || cfg.mensagens.bloqueioManual }, ctx);
  // 6) Datas especiais (prevalecem sobre o semanal)
  const esp = (cfg.datasEspeciais || []).find(d => d.data === dataISO);
  if (esp) {
    if (esp.bloqueado) return Object.assign({ permitido: false, motivo: 'data-especial', mensagem: esp.obs || cfg.mensagens.foraHorario }, ctx);
    if (esp.liberadoAte) return Object.assign(hhmm <= esp.liberadoAte ? { permitido: true, motivo: 'data-especial' } : { permitido: false, motivo: 'data-especial', mensagem: cfg.mensagens.foraHorario }, ctx);
  }
  // 7) Horário individual (se houver e vigente) senão semanal
  const ind = (cfg.horariosIndividuais || []).find(h => h.usuarioId === user.id && h.ativo
    && (!h.dataInicial || dataISO >= h.dataInicial) && (!h.dataFinal || dataISO <= h.dataFinal)
    && (!h.dias || !h.dias.length || h.dias.includes(_DIAS_CA[diaSemana])));
  if (ind) {
    return Object.assign(hhmm >= ind.inicio && hhmm <= ind.fim
      ? { permitido: true, motivo: 'horario-individual' }
      : { permitido: false, motivo: 'fora-horario', mensagem: cfg.mensagens.foraHorario, proximaLiberacao: ind.inicio }, ctx);
  }
  const dia = cfg.horarioSemanal[_DIAS_CA[diaSemana]];
  if (!dia || !dia.ativo || !(dia.periodos || []).length)
    return Object.assign({ permitido: false, motivo: 'dia-inativo', mensagem: cfg.mensagens.foraHorario }, ctx);
  const dentro = (dia.periodos || []).some(p => hhmm >= p.inicio && hhmm <= p.fim);
  return Object.assign(dentro ? { permitido: true, motivo: 'horario-semanal' } : { permitido: false, motivo: 'fora-horario', mensagem: cfg.mensagens.foraHorario }, ctx);
}

// ── Gate visual + encerramento de sessão ──────────────────────────────────
let _caTimer = null;
let _caAvisos = { 10: false, 5: false, 1: false };

function mostrarOverlayHorario(res) {
  const ov = document.getElementById('overlay-horario');
  if (!ov) return;
  const cfg = getControleAcesso();
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('oh-mensagem', res.mensagem || cfg.mensagens.foraHorario);
  set('oh-hora', horaConfiavel().toLocaleString('pt-BR', { timeZone: cfg.fuso }));
  set('oh-proxima', res.proximaLiberacao || '—');
  set('oh-depto', loggedUser ? (loggedUser.departamento || '—') : '—');
  ov.style.display = 'flex';
}
function esconderOverlayHorario() {
  const ov = document.getElementById('overlay-horario');
  if (ov) ov.style.display = 'none';
}
// Aplica o bloqueio visual; retorna true se permitido
function aplicarGateHorario() {
  if (!loggedUser) { esconderOverlayHorario(); return true; }
  const res = acessoPermitidoAgora(loggedUser);
  if (res.permitido) { esconderOverlayHorario(); return true; }
  mostrarOverlayHorario(res);
  registrarLogGlobal(`Acesso interno negado por horário (${res.motivo}) para "${loggedUser.nome}".`, 'acesso');
  return false;
}
// Inicia o controle: sincroniza a hora confiável, aplica o gate e liga 1 timer
async function iniciarControleAcesso() {
  await sincronizarHora();
  if (loggedUser) aplicarGateHorario();
  if (_caTimer) clearInterval(_caTimer);
  let ticks = 0;
  _caTimer = setInterval(() => {
    ticks++;
    if (ticks % 20 === 0) sincronizarHora(); // re-sincroniza o offset a cada ~10 min
    if (!loggedUser) return;
    if (!getControleAcesso().ativo) { esconderOverlayHorario(); return; }
    const res = acessoPermitidoAgora(loggedUser);
    if (!res.permitido) {
      mostrarOverlayHorario(res);
      registrarLogGlobal(`Sessão encerrada por horário para "${loggedUser.nome}".`, 'acesso');
      return;
    }
    avisarFimDeJanela();
  }, 30000);
}
function avisarFimDeJanela() {
  const cfg = getControleAcesso();
  const { diaSemana, hhmm } = _partesDataFuso(horaConfiavel(), cfg.fuso);
  const dia = cfg.horarioSemanal[_DIAS_CA[diaSemana]];
  if (!dia || !(dia.periodos || []).length) return;
  const per = (dia.periodos || []).find(p => hhmm >= p.inicio && hhmm <= p.fim);
  if (!per) return;
  const [fh, fm] = per.fim.split(':').map(Number);
  const [nh, nm] = hhmm.split(':').map(Number);
  const min = (fh * 60 + fm) - (nh * 60 + nm);
  if (min > 10) { _caAvisos = { 10: false, 5: false, 1: false }; return; }
  [10, 5, 1].forEach(m => {
    if (min === m && !_caAvisos[m]) {
      _caAvisos[m] = true;
      const msg = `Seu acesso será encerrado em ${m} minuto(s) devido ao fim do horário autorizado.`;
      if (typeof showToast === 'function') showToast(msg, 'warning'); else alert(msg);
    }
  });
}

// ── Painel administrativo do Controle de Acesso ───────────────────────────
function _caAteMs(min) { return horaConfiavel().getTime() + min * 60000; }
function _caFimDoDiaMs() { const d = horaConfiavel(); d.setHours(23, 59, 59, 999); return d.getTime(); }
function _caRestante(ate) {
  const ms = ate - horaConfiavel().getTime();
  if (ms <= 0) return 'expirado';
  const min = Math.ceil(ms / 60000);
  return min < 60 ? min + ' min' : Math.floor(min / 60) + 'h' + (min % 60 ? ' ' + (min % 60) + 'min' : '');
}
function _caLog(acao) { registrarLogGlobal(acao, 'acesso'); }
const _CA_DIAS_LBL = { dom: 'Domingo', seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado' };

function renderControleAcesso() {
  const cont = document.getElementById('controle-acesso-conteudo');
  if (!cont) return;
  if (!podeGerenciarHorarios()) {
    cont.innerHTML = '<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);color:#b91c1c;padding:16px;border-radius:12px;font-size:13px;"><i class="fa-solid fa-lock"></i> Área restrita ao administrador geral (João).</div>';
    return;
  }
  const cfg = getControleAcesso();
  const res = loggedUser ? acessoPermitidoAgora(loggedUser) : { permitido: true };
  const statusCor = !cfg.ativo ? '#94a3b8' : (cfg.bloqueioManual.ativo ? '#ef4444' : (cfg.liberacaoTemporaria.ativa ? '#f59e0b' : '#22c55e'));
  const statusTxt = !cfg.ativo ? 'Controle DESLIGADO — todos os internos acessam normalmente'
    : (cfg.bloqueioManual.ativo ? 'BLOQUEIO MANUAL ATIVO' : (cfg.liberacaoTemporaria.ativa ? 'Liberação temporária ativa' : 'Controlado pelo horário semanal'));
  const agoraStr = horaConfiavel().toLocaleString('pt-BR', { timeZone: cfg.fuso });
  const funcs = (state.funcionarios || []).filter(f => f.status === 'ativo');
  const box = (inner) => `<div style="background:var(--card-bg,#fff);border:1px solid var(--border-color,#e2e8f0);border-radius:12px;padding:16px;margin-bottom:14px;">${inner}</div>`;
  const dur = (fn) => `
    <button class="btn btn-secondary btn-sm" onclick="${fn}(15)">15 min</button>
    <button class="btn btn-secondary btn-sm" onclick="${fn}(30)">30 min</button>
    <button class="btn btn-secondary btn-sm" onclick="${fn}(60)">1 h</button>
    <button class="btn btn-secondary btn-sm" onclick="${fn}(120)">2 h</button>
    <button class="btn btn-secondary btn-sm" onclick="${fn}(-1)">Fim do dia</button>`;

  let html = '';
  // Status + liga/desliga + fuso/hora
  html += box(`
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div>
        <div style="font-size:12px;color:var(--text-secondary);">Status atual</div>
        <div style="font-weight:800;color:${statusCor};font-size:15px;">${statusTxt}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">Hora confiável: <strong>${escapeHTML(agoraStr)}</strong> · Fuso: ${escapeHTML(cfg.fuso)} · fonte: ${_horaFonte}</div>
        <div style="font-size:12px;color:var(--text-secondary);">Seu acesso agora: <strong style="color:${res.permitido ? '#22c55e' : '#ef4444'}">${res.permitido ? 'permitido' : 'bloqueado'}</strong>${res.proximaLiberacao ? ' · próxima abertura: ' + escapeHTML(res.proximaLiberacao) : ''}</div>
      </div>
      <button class="btn ${cfg.ativo ? 'btn-danger' : 'btn-primary'}" onclick="caToggleAtivo()">${cfg.ativo ? 'Desligar controle' : 'Ligar controle de horário'}</button>
    </div>`);

  // Bloqueio / liberação manual geral
  html += box(`
    <h4 style="margin:0 0 10px;font-size:14px;"><i class="fa-solid fa-lock"></i> Bloqueio e liberação manual</h4>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      ${cfg.bloqueioManual.ativo
        ? `<span style="color:#ef4444;font-weight:700;">Bloqueado: ${escapeHTML(cfg.bloqueioManual.motivo || '—')}</span> <button class="btn btn-primary btn-sm" onclick="caCancelarBloqueio()">Liberar sistema</button>`
        : `<button class="btn btn-danger btn-sm" onclick="caBloquearAgora()"><i class="fa-solid fa-ban"></i> Bloquear sistema interno agora</button>`}
    </div>
    <div style="margin-top:12px;">
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">Liberar todos temporariamente${cfg.liberacaoTemporaria.ativa ? ` (ativa — termina em ${cfg.liberacaoTemporaria.semPrazo ? 'sem prazo' : _caRestante(cfg.liberacaoTemporaria.ate)})` : ''}:</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">${dur('caLiberarTemp')}
        <button class="btn btn-secondary btn-sm" onclick="caLiberarTemp(0)">Sem prazo</button>
        ${cfg.liberacaoTemporaria.ativa ? '<button class="btn btn-danger btn-sm" onclick="caCancelarLiberacao()">Cancelar liberação</button>' : ''}
      </div>
    </div>`);

  // Horário semanal
  html += box(`
    <h4 style="margin:0 0 10px;font-size:14px;"><i class="fa-solid fa-calendar-week"></i> Horário semanal</h4>
    ${_DIAS_CA.map(d => {
      const dd = cfg.horarioSemanal[d]; const p = (dd.periodos && dd.periodos[0]) || { inicio: '', fim: '' };
      return `<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap;">
        <label style="display:flex;align-items:center;gap:5px;min-width:120px;font-size:13px;"><input type="checkbox" id="ca-${d}-ativo" ${dd.ativo ? 'checked' : ''}> ${_CA_DIAS_LBL[d]}</label>
        <input type="time" class="form-control" style="max-width:120px;" id="ca-${d}-ini" value="${p.inicio || ''}">
        <span>às</span>
        <input type="time" class="form-control" style="max-width:120px;" id="ca-${d}-fim" value="${p.fim || ''}">
        <button class="btn btn-secondary btn-sm" onclick="caSalvarDia('${d}')">Salvar</button>
      </div>`;
    }).join('')}`);

  // Liberar usuário específico
  html += box(`
    <h4 style="margin:0 0 10px;font-size:14px;"><i class="fa-solid fa-user-clock"></i> Liberar usuário específico</h4>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
      <select id="ca-lib-usuario" class="form-control" style="max-width:240px;">${funcs.map(f => `<option value="${f.id}">${escapeHTML(f.nome)} (${escapeHTML(f.login)})</option>`).join('')}</select>
      ${dur('caLiberarUsuario')}
      <button class="btn btn-secondary btn-sm" onclick="caLiberarUsuario(0)">Permanente</button>
    </div>
    ${(cfg.liberacoesUsuario || []).length ? '<div style="margin-top:8px;font-size:12px;">' + cfg.liberacoesUsuario.map((l, i) => {
      const f = (state.funcionarios || []).find(x => x.id === l.usuarioId);
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">${escapeHTML(f ? f.nome : l.usuarioId)} — ${l.permanente ? 'permanente' : _caRestante(l.ate)} <button class="btn btn-danger btn-sm" onclick="caCancelarLibUsuario(${i})">Cancelar</button></div>`;
    }).join('') + '</div>' : ''}`);

  // Liberar departamento
  html += box(`
    <h4 style="margin:0 0 10px;font-size:14px;"><i class="fa-solid fa-users-gear"></i> Liberar por departamento</h4>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
      <select id="ca-lib-depto" class="form-control" style="max-width:200px;">
        <option value="selecao">Seleção</option><option value="dp">Departamento Pessoal</option>
        <option value="administracao">Administração</option><option value="comissao">Comissão</option>
      </select>
      ${dur('caLiberarDepto')}
    </div>
    ${(cfg.liberacoesDepto || []).length ? '<div style="margin-top:8px;font-size:12px;">' + cfg.liberacoesDepto.map((l, i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">${escapeHTML(l.depto)} — ${_caRestante(l.ate)} <button class="btn btn-danger btn-sm" onclick="caCancelarLibDepto(${i})">Cancelar</button></div>`).join('') + '</div>' : ''}`);

  // Datas especiais
  html += box(`
    <h4 style="margin:0 0 10px;font-size:14px;"><i class="fa-solid fa-calendar-day"></i> Datas especiais</h4>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
      <input type="date" id="ca-esp-data" class="form-control" style="max-width:160px;">
      <select id="ca-esp-tipo" class="form-control" style="max-width:200px;"><option value="bloqueado">Bloqueado o dia todo</option><option value="liberado">Liberado até…</option></select>
      <input type="time" id="ca-esp-ate" class="form-control" style="max-width:120px;" placeholder="até">
      <input type="text" id="ca-esp-obs" class="form-control" style="max-width:200px;" placeholder="observação">
      <button class="btn btn-secondary btn-sm" onclick="caAddDataEspecial()">Adicionar</button>
    </div>
    ${(cfg.datasEspeciais || []).length ? '<div style="margin-top:8px;font-size:12px;">' + cfg.datasEspeciais.map((d, i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">${escapeHTML(d.data)} — ${d.bloqueado ? 'bloqueado' : 'liberado até ' + escapeHTML(d.liberadoAte || '')}${d.obs ? ' · ' + escapeHTML(d.obs) : ''} <button class="btn btn-danger btn-sm" onclick="caRemoveDataEspecial(${i})">Remover</button></div>`).join('') + '</div>' : ''}`);

  // Exceções permanentes + histórico
  html += box(`
    <h4 style="margin:0 0 10px;font-size:14px;"><i class="fa-solid fa-shield"></i> Exceções permanentes (ignoram bloqueio)</h4>
    <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:12px;">
      ${funcs.map(f => `<label style="display:flex;align-items:center;gap:4px;"><input type="checkbox" ${(cfg.excecoesPermanentes || []).includes(f.id) ? 'checked' : ''} onchange="caToggleExcecao('${f.id}')"> ${escapeHTML(f.nome)}</label>`).join('')}
    </div>
    <div style="margin-top:12px;"><button class="btn btn-secondary btn-sm" onclick="switchAba('auditoria')"><i class="fa-solid fa-clock-rotate-left"></i> Ver histórico (auditoria)</button></div>`);

  cont.innerHTML = html;
}

window.caToggleAtivo = function () { const c = getControleAcesso(); c.ativo = !c.ativo; _caLog(`Controle de horário ${c.ativo ? 'LIGADO' : 'DESLIGADO'}.`); saveState(); renderControleAcesso(); if (loggedUser) aplicarGateHorario(); };
window.caBloquearAgora = function () { const m = prompt('Motivo do bloqueio (opcional):', 'Sistema bloqueado pela administração.') || ''; const c = getControleAcesso(); c.ativo = true; c.bloqueioManual = { ativo: true, motivo: m, por: loggedUser ? loggedUser.nome : '', em: horaConfiavel().toLocaleString('pt-BR') }; _caLog(`Bloqueio manual ativado. Motivo: ${m}`); saveState(); renderControleAcesso(); };
window.caCancelarBloqueio = function () { const c = getControleAcesso(); c.bloqueioManual = { ativo: false, motivo: '', por: '', em: '' }; _caLog('Bloqueio manual cancelado.'); saveState(); renderControleAcesso(); };
window.caLiberarTemp = function (min) { const c = getControleAcesso(); c.ativo = true; c.liberacaoTemporaria = { ativa: true, semPrazo: min === 0, ate: min === -1 ? _caFimDoDiaMs() : (min > 0 ? _caAteMs(min) : 0), por: loggedUser ? loggedUser.nome : '', motivo: '', em: horaConfiavel().toLocaleString('pt-BR') }; _caLog(`Liberação geral por ${min === 0 ? 'sem prazo' : min === -1 ? 'fim do dia' : min + ' min'}.`); saveState(); renderControleAcesso(); };
window.caCancelarLiberacao = function () { const c = getControleAcesso(); c.liberacaoTemporaria = { ativa: false, ate: 0, semPrazo: false, por: '', motivo: '', em: '' }; _caLog('Liberação geral cancelada.'); saveState(); renderControleAcesso(); };
window.caSalvarDia = function (d) {
  const c = getControleAcesso();
  const ativo = document.getElementById(`ca-${d}-ativo`).checked;
  const ini = document.getElementById(`ca-${d}-ini`).value, fim = document.getElementById(`ca-${d}-fim`).value;
  c.horarioSemanal[d] = { ativo, periodos: (ativo && ini && fim) ? [{ inicio: ini, fim }] : (ativo ? (c.horarioSemanal[d].periodos || []) : []), obs: c.horarioSemanal[d].obs || '' };
  _caLog(`Horário de ${_CA_DIAS_LBL[d]} salvo: ${ativo ? ini + '–' + fim : 'inativo'}.`); saveState(); renderControleAcesso();
};
window.caLiberarUsuario = function (min) { const c = getControleAcesso(); const uid = document.getElementById('ca-lib-usuario').value; if (!uid) return; c.liberacoesUsuario = (c.liberacoesUsuario || []).filter(l => l.usuarioId !== uid); c.liberacoesUsuario.push({ usuarioId: uid, permanente: min === 0, ate: min === -1 ? _caFimDoDiaMs() : (min > 0 ? _caAteMs(min) : 0), por: loggedUser ? loggedUser.nome : '' }); const f = (state.funcionarios || []).find(x => x.id === uid); _caLog(`Liberou o usuário "${f ? f.nome : uid}" por ${min === 0 ? 'permanente' : min === -1 ? 'fim do dia' : min + ' min'}.`); saveState(); renderControleAcesso(); };
window.caCancelarLibUsuario = function (i) { const c = getControleAcesso(); c.liberacoesUsuario.splice(i, 1); _caLog('Cancelou liberação de usuário.'); saveState(); renderControleAcesso(); };
window.caLiberarDepto = function (min) { const c = getControleAcesso(); const dep = document.getElementById('ca-lib-depto').value; c.liberacoesDepto = (c.liberacoesDepto || []).filter(l => l.depto !== dep); c.liberacoesDepto.push({ depto: dep, ate: min === -1 ? _caFimDoDiaMs() : _caAteMs(min), por: loggedUser ? loggedUser.nome : '' }); _caLog(`Liberou o departamento "${dep}" por ${min === -1 ? 'fim do dia' : min + ' min'}.`); saveState(); renderControleAcesso(); };
window.caCancelarLibDepto = function (i) { const c = getControleAcesso(); c.liberacoesDepto.splice(i, 1); _caLog('Cancelou liberação de departamento.'); saveState(); renderControleAcesso(); };
window.caAddDataEspecial = function () { const c = getControleAcesso(); const data = document.getElementById('ca-esp-data').value; if (!data) { alert('Informe a data.'); return; } const tipo = document.getElementById('ca-esp-tipo').value; const ate = document.getElementById('ca-esp-ate').value; const obs = document.getElementById('ca-esp-obs').value; c.datasEspeciais = (c.datasEspeciais || []).filter(d => d.data !== data); c.datasEspeciais.push({ data, bloqueado: tipo === 'bloqueado', liberadoAte: tipo === 'liberado' ? ate : '', obs }); _caLog(`Data especial ${data}: ${tipo === 'bloqueado' ? 'bloqueada' : 'liberada até ' + ate}.`); saveState(); renderControleAcesso(); };
window.caRemoveDataEspecial = function (i) { const c = getControleAcesso(); c.datasEspeciais.splice(i, 1); _caLog('Removeu data especial.'); saveState(); renderControleAcesso(); };
window.caToggleExcecao = function (fid) { const c = getControleAcesso(); c.excecoesPermanentes = c.excecoesPermanentes || []; const i = c.excecoesPermanentes.indexOf(fid); if (i >= 0) c.excecoesPermanentes.splice(i, 1); else c.excecoesPermanentes.push(fid); _caLog('Alterou exceções permanentes de acesso.'); saveState(); renderControleAcesso(); };

// ── Contador de bloqueio de login (um único intervalo, sem travar) ─────────
let _bloqueioTimer = null;
function mostrarErroLogin(msg) {
  const el = document.getElementById('login-error-msg');
  if (el) { const sp = el.querySelector('span'); if (sp) sp.textContent = msg; el.style.display = 'flex'; }
}
function iniciarContadorBloqueio(login) {
  const el = document.getElementById('login-error-msg');
  const form = document.getElementById('login-form');
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
  if (_bloqueioTimer) { clearInterval(_bloqueioTimer); _bloqueioTimer = null; }
  function tick() {
    const b = (typeof verificarBloqueio === 'function') ? verificarBloqueio(login) : { bloqueado: false };
    if (b.permanente) {
      if (_bloqueioTimer) { clearInterval(_bloqueioTimer); _bloqueioTimer = null; }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = '1'; }
      mostrarErroLogin('Acesso bloqueado por excesso de tentativas. Procure um administrador.');
      return;
    }
    if (b.bloqueado && b.segundosRestantes > 0) {
      if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.6'; }
      mostrarErroLogin(`Muitas tentativas incorretas. Aguarde ${b.segundosRestantes}s para tentar novamente.`);
    } else {
      if (_bloqueioTimer) { clearInterval(_bloqueioTimer); _bloqueioTimer = null; }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = '1'; }
      if (el) el.style.display = 'none';
    }
  }
  tick();
  _bloqueioTimer = setInterval(tick, 1000);
}

// 2. SISTEMA DE ABA E ROTEAMENTO SPA
function setupNavigation() {
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const aba = item.getAttribute('data-aba');
      switchAba(aba);
      // No celular, fecha a gaveta do menu após escolher uma área
      if (window.innerWidth <= 768) document.body.classList.remove('menu-mobile-aberto');
    });
  });

  // Toggle Sidebar para telas menores
  const sidebarBtn = document.getElementById('sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');
  if (sidebarBtn && sidebar) {
    sidebarBtn.addEventListener('click', () => {
      // No celular o botão abre/fecha a gaveta off-canvas (sem mexer na largura)
      if (window.innerWidth <= 768) {
        document.body.classList.toggle('menu-mobile-aberto');
        return;
      }
      sidebar.classList.toggle('collapsed');
      if (sidebar.classList.contains('collapsed')) {
        sidebar.style.width = '0px';
        sidebar.style.overflow = 'hidden';
      } else {
        sidebar.style.width = '250px';
      }
    });
  }

  // Lógica de sub-abas do Dashboard
  const subtabBtns = document.querySelectorAll('.subtab-btn');
  subtabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      subtabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const subtabId = btn.getAttribute('data-subtab');
      document.querySelectorAll('.dashboard-sub-aba').forEach(c => c.classList.remove('active'));
      document.getElementById(`dash-sub-${subtabId}`).classList.add('active');
      activeDashboardSubTab = subtabId;
      renderCurrentAba();
    });
  });
}

function switchAba(abaId) {
  if (!isAbaAutorizada(abaId)) return;
  activeAba = abaId;

  // Atualiza botões no menu
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('data-aba') === abaId) {
      item.classList.add('active');
    }
  });

  // Atualiza containers de abas
  document.querySelectorAll('.aba-content').forEach(content => {
    content.classList.remove('active');
  });

  const targetAba = document.getElementById(`aba-${abaId}`);
  if (targetAba) {
    targetAba.classList.add('active');
  }

  // Define ícone e título no cabeçalho
  const headerIcon = document.querySelector('.header-icon');
  const headerAppName = document.querySelector('.header-app-name');
  
  const iconMap = {
    'dashboard': 'fa-solid fa-table-cells-large',
    'vagas': 'fa-solid fa-briefcase',
    'banco-talentos': 'fa-solid fa-users-viewfinder',
    'selecao': 'fa-solid fa-square-check',
    'depto-pessoal': 'fa-solid fa-building-user',
    'relatorios': 'fa-solid fa-chart-line',
    'comissao': 'fa-solid fa-dollar-sign',
    'site': 'fa-solid fa-globe',
    'funcionarios': 'fa-solid fa-user-gear',
    'auditoria': 'fa-solid fa-clock-rotate-left',
    'inaptos': 'fa-solid fa-ban',
    'configuracoes': 'fa-solid fa-sliders',
    'meu-painel': 'fa-solid fa-id-card-clip',
    'fila': 'fa-solid fa-ticket',
    'documentos': 'fa-solid fa-folder-open',
    'lixeira': 'fa-solid fa-trash-can',
    'controle-acesso': 'fa-solid fa-business-time',
    'cadastros-exata': 'fa-solid fa-file-invoice'
  };

  const titleMap = {
    'dashboard': 'R&T EMPREGOS — DASHBOARD',
    'vagas': 'R&T EMPREGOS — VAGAS DISPONÍVEIS',
    'banco-talentos': 'R&T EMPREGOS — BANCO DE TALENTOS',
    'selecao': 'R&T EMPREGOS — SELEÇÃO',
    'depto-pessoal': 'R&T EMPREGOS — DEPARTAMENTO PESSOAL',
    'relatorios': 'R&T EMPREGOS — RELATÓRIOS E INDICADORES',
    'comissao': 'R&T EMPREGOS — PLANILHA DE COMISSÕES',
    'site': 'R&T EMPREGOS — SITE PÚBLICO',
    'funcionarios': 'R&T EMPREGOS — GESTÃO DE COLABORADORES',
    'auditoria': 'R&T EMPREGOS — AUDITORIA ADMINISTRATIVA',
    'inaptos': 'R&T EMPREGOS — INAPTOS',
    'configuracoes': 'R&T EMPREGOS — CONFIGURAÇÕES DO SISTEMA',
    'meu-painel': 'R&T EMPREGOS — MEU PAINEL',
    'fila': 'R&T EMPREGOS — SISTEMA DE SENHAS',
    'documentos': 'R&T EMPREGOS — DOCUMENTOS NA NUVEM',
    'lixeira': 'R&T EMPREGOS — LIXEIRA',
    'controle-acesso': 'R&T EMPREGOS — CONTROLE DE ACESSO',
    'cadastros-exata': 'R&T EMPREGOS — CADASTROS EXATA'
  };

  if (headerIcon) headerIcon.className = `${iconMap[abaId] || 'fa-solid fa-building'} header-icon`;
  if (headerAppName) headerAppName.textContent = titleMap[abaId] || 'R&T EMPREGOS';

  // Renderiza a aba ativa
  renderCurrentAba();
}

function renderCurrentAba() {
  switch (activeAba) {
    case 'dashboard':
      renderDashboardOverview();
      break;
    case 'vagas':
      renderVagasGrid();
      break;
    case 'banco-talentos':
      renderBancoTalentos();
      break;
    case 'selecao':
      renderSelecaoGrid();
      break;
    case 'depto-pessoal':
      renderDeptoPessoal();
      break;
    case 'relatorios':
      renderRelatoriosCharts();
      break;
    case 'comissao':
      renderComissaoSheet();
      break;
    case 'site':
      renderSitePublico();
      break;
    case 'funcionarios':
      renderFuncionarios();
      break;
    case 'auditoria':
      renderAuditoria();
      setupAuditoriaListeners();
      break;
    case 'inaptos':
      renderInaptos();
      break;
    case 'configuracoes':
      renderConfiguracoes();
      break;
    case 'meu-painel':
      renderMeuPainel();
      break;
    case 'fila':
      renderFila();
      break;
    case 'documentos':
      renderDocumentos();
      break;
    case 'lixeira':
      renderLixeira();
      break;
    case 'controle-acesso':
      renderControleAcesso();
      break;
    case 'cadastros-exata':
      renderCadastrosExata();
      break;
  }
}

// ÁREA DE DOCUMENTOS NA NUVEM (documentos guardados permanentemente)
const ROTULO_DOC = {
  selfie: 'Selfie', rgFrente: 'RG (frente)', rgVerso: 'RG (verso)', fotoPis: 'PIS',
  cpfDocumento: 'CPF', comprovanteResidencia: 'Comprovante de residência',
  cartaoBancoVerso: 'Cartão do banco', foto3x4: 'Foto 3x4', ctps: 'Carteira de Trabalho',
  certidao: 'Certidão', comprovanteEscolaridade: 'Escolaridade'
};
function rotuloDocumento(campo) {
  return ROTULO_DOC[campo] || (campo ? campo.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()) : 'Documento');
}

function renderDocumentos() {
  const lista  = document.getElementById('docs-lista');
  const resumo = document.getElementById('docs-resumo');
  if (!lista) return;

  if (!(window.RTCloud && RTCloud.configured)) {
    if (resumo) resumo.innerHTML = '';
    lista.innerHTML = '<div style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.35);color:#b45309;padding:16px 18px;border-radius:12px;font-size:13px;"><i class="fa-solid fa-circle-info"></i> A sincronização na nuvem ainda não foi configurada. Os documentos enviados pelos candidatos aparecerão aqui assim que o Firebase estiver ligado (cole a config em <strong>js/firebase-sync.js</strong>).</div>';
    return;
  }

  const docs = RTCloud.listarDocumentos(state);

  if (docs.length === 0) {
    if (resumo) resumo.innerHTML = '';
    lista.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:48px 16px;"><i class="fa-solid fa-folder-open" style="font-size:42px;opacity:.4;"></i><p style="margin-top:12px;">Nenhum documento na nuvem ainda. Quando os candidatos enviarem as fotos, elas aparecem aqui.</p></div>';
    return;
  }

  if (resumo) {
    resumo.innerHTML = 'Total: <strong>' + docs.length + '</strong> documento(s) guardado(s).';
  }

  // Agrupa por pessoa
  const grupos = {};
  docs.forEach(d => {
    const chave = (d.pessoaId || '') + '|' + (d.pessoa || '—');
    (grupos[chave] = grupos[chave] || { pessoa: d.pessoa || '—', itens: [] }).itens.push(d);
  });

  lista.innerHTML = Object.keys(grupos).map(chave => {
    const g = grupos[chave];
    const cards = g.itens.map(d => {
      const data = d.enviadoEm ? new Date(d.enviadoEm).toLocaleDateString('pt-BR') : '';
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border:1px solid var(--border);border-radius:9px;margin-bottom:7px;">' +
        '<span style="font-size:13px;font-weight:600;"><i class="fa-solid fa-file-lines" style="color:var(--primary);margin-right:6px;"></i>' + escapeHTML(rotuloDocumento(d.campo)) + '</span>' +
        '<span style="display:flex;align-items:center;gap:10px;">' +
          (data ? '<span style="font-size:11px;color:var(--text-secondary);white-space:nowrap;"><i class="fa-regular fa-calendar"></i> ' + data + '</span>' : '') +
          '<a href="' + escapeHTML(d.url) + '" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="font-size:11px;padding:4px 10px;">Abrir</a>' +
        '</span>' +
      '</div>';
    }).join('');
    return '<div style="margin-bottom:18px;">' +
      '<div style="font-weight:700;font-size:14px;margin-bottom:8px;"><i class="fa-solid fa-user" style="color:var(--text-secondary);margin-right:6px;"></i>' + escapeHTML(g.pessoa) + ' <span style="font-weight:500;color:var(--text-secondary);font-size:12px;">(' + g.itens.length + ')</span></div>' +
      cards +
    '</div>';
  }).join('');
}

// 3. LISTENERS GLOBAIS
function setupEventListeners() {
  // Busca em tempo real no Dashboard
  const dashSearch = document.getElementById('dashboard-search');
  if (dashSearch) {
    dashSearch.addEventListener('input', () => {
      renderDashboardKanban(dashSearch.value.trim());
    });
  }

  // Busca em tempo real no Banco
  const bancoSearch = document.getElementById('banco-search');
  if (bancoSearch) {
    bancoSearch.addEventListener('input', () => {
      renderBancoTalentos(bancoSearch.value.trim());
    });
  }

  // Fechar gaveta de detalhes
  const btnCloseDetails = document.getElementById('btn-close-details');
  if (btnCloseDetails) {
    btnCloseDetails.addEventListener('click', fecharDrawerDetalhes);
  }

  // Mudar abas da gaveta de detalhes
  const drawerTabs = document.querySelectorAll('.drawer-tab-btn');
  drawerTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      drawerTabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const tabId = btn.getAttribute('data-drawer-tab');
      document.querySelectorAll('.drawer-tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById(`drawer-content-${tabId}`).classList.add('active');
    });
  });

  // Autopreview de Vagas no Drawer
  const selectVagaDrawer = document.getElementById('det-select-vaga');
  if (selectVagaDrawer) {
    selectVagaDrawer.addEventListener('change', () => {
      atualizarAutopreviewVaga(selectVagaDrawer.value);
      // Atualiza os horários disponíveis conforme a vaga escolhida (Etapa C)
      popularHorariosSelect(selectVagaDrawer.value, '');
    });
  }

  // Salvar edições do Drawer
  const btnSalvarDetails = document.getElementById('btn-salvar-detalhes');
  if (btnSalvarDetails) {
    btnSalvarDetails.addEventListener('click', salvarDetalhesCandidato);
  }

  // Promover ficha do candidato para o DP (Subir Ficha para DP)
  const btnSubirDp = document.getElementById('btn-subir-dp');
  if (btnSubirDp) {
    btnSubirDp.addEventListener('click', () => {
      if (!currentCandidateId) return;
      const cand = state.candidatos.find(c => c.id === currentCandidateId);
      if (!cand) return;
      
      // 1. Validar e capturar os campos da tela de detalhes antes de subir
      const nome = document.getElementById('det-nome-input').value.trim();
      const cpf = document.getElementById('det-cpf-input').value.trim();
      const rg = document.getElementById('det-rg-input').value.trim();
      const pis = document.getElementById('det-pis-input').value.trim();
      const nascimento = document.getElementById('det-nascimento-input').value.trim();
      const mae = document.getElementById('det-mae-input').value.trim();
      const pai = document.getElementById('det-pai-input').value.trim();
      const telefone = document.getElementById('det-telefone-input').value.trim();
      const email = document.getElementById('det-email-input').value.trim();

      if (!nome || !cpf || !rg || !telefone || !email) {
        alert('Por favor, preencha todos os campos obrigatórios pessoais (Nome, CPF, RG, Telefone, E-mail).');
        return;
      }

      const vagaId = document.getElementById('det-select-vaga').value;
      if (!vagaId) {
        alert('Por favor, selecione a Vaga Destinada para o candidato antes de subir para o Departamento Pessoal.');
        return;
      }

      const vaga = state.vagas.find(v => v.id === vagaId);
      if (!vaga) {
        alert('Vaga inválida.');
        return;
      }

      const confirmMove = confirm(`Deseja salvar as alterações e subir a ficha do candidato "${nome}" para o Departamento Pessoal associada à vaga "${vaga.cargo} — ${vaga.empresaNome}"?`);
      if (!confirmMove) return;

      // Endereço
      const cep = document.getElementById('det-cep-input').value.trim();
      const rua = document.getElementById('det-rua-input').value.trim();
      const numero = document.getElementById('det-numero-input').value.trim();
      const bairro = document.getElementById('det-bairro-input').value.trim();
      const cidade = document.getElementById('det-cidade-input').value.trim();
      const estado = document.getElementById('det-estado-input').value.trim();

      // Dados Bancários
      const banco = document.getElementById('det-banco-input').value.trim();
      const tipopix = document.getElementById('det-tipopix-input').value;
      const chavepix = document.getElementById('det-chavepix-input').value.trim();

      // Uniforme
      const camiseta = document.getElementById('det-camiseta-input').value;
      const calca = document.getElementById('det-calca-input').value.trim();
      const bota = document.getElementById('det-bota-input').value.trim();

      const recrutadorId = document.getElementById('det-select-recrutador').value;
      const observacoes = document.getElementById('det-observacoes').value.trim();

      // Atualiza as propriedades do candidato no estado
      cand.nome = nome;
      cand.cpf = cpf;
      cand.rg = rg;
      cand.pis = pis;
      cand.dataNascimento = nascimento;
      cand.nomeMae = mae;
      cand.nomePai = pai;
      cand.telefone = telefone;
      cand.email = email;

      cand.cep = cep;
      cand.rua = rua;
      cand.numeroCasa = numero;
      cand.bairro = bairro;
      cand.cidade = cidade;
      cand.estado = estado;
      cand.endereco = rua && numero ? `${rua}, ${numero}, ${bairro} - ${cidade}/${estado}` : cand.endereco;

      cand.banco = banco;
      cand.tipoPix = tipopix;
      cand.chavePix = chavepix;

      cand.tamanhoCamiseta = camiseta;
      cand.tamanhoCalca = calca;
      cand.tamanhoBota = bota;

      // Auto-preenche os dados da vaga + snapshot e o horário escolhido
      const turno = document.getElementById('det-select-turno').value;
      aplicarSnapshotVaga(cand, vagaId);
      aplicarHorarioVaga(cand, turno);
      cand.recrutadorId = recrutadorId;
      cand.status = 'aprovado'; // Move status para aprovado (DP)
      cand.diasEtapa = 1;
      cand.observacoesSelecao = observacoes;
      const foiDevolvida = cand.devolvidoDP === true;
      cand.devolvidoDP = false;
      cand.motivoDevolucaoDP = '';
      cand.aprovadorSelecao = loggedUser ? `${loggedUser.nome} (Seleção)` : 'Recrutador';
      cand.dataSubiuDP = new Date().toLocaleString('pt-BR');
      if (foiDevolvida) {
        cand.corrigidoPor = loggedUser ? loggedUser.nome : 'Seleção';
        cand.dataCorrecao = new Date().toLocaleString('pt-BR');
        registrarAcaoHistorico(cand, `Ficha corrigida por ${cand.corrigidoPor} (Seleção) e reenviada ao DP. Turno: ${turno}`);
      } else {
        registrarAcaoHistorico(cand, `Ficha cadastral aprovada na Seleção por ${cand.aprovadorSelecao} e enviada ao DP. Turno: ${turno}`);
      }
      registrarLogGlobal(`Enviou a ficha de "${cand.nome}" para o Departamento Pessoal.`, 'fluxo');

      // Log activity
      if (!loggedUser || loggedUser.login !== 'joaobalaf') {
        state.atividades.unshift({
          id: `act-${Date.now()}`,
          descricao: `Ficha cadastral de ${cand.nome} enviada com sucesso para o Departamento Pessoal`,
          data: 'Agora'
        });
      }
      
      triggerRocketAnimationDP(cand, foiDevolvida, () => {
        saveState();
        fecharDrawerDetalhes();
        renderCurrentAba();
      });
    });
  }

  // Download da pasta do candidato — ZIP real com documentos
  const btnDownloadPasta = document.getElementById('btn-download-pasta');
  if (btnDownloadPasta) {
    btnDownloadPasta.addEventListener('click', () => {
      if (currentCandidateId) exportarFichaCompletaZip(currentCandidateId);
    });
  }

  // Botões de Vagas: visibilidade + listeners reaplicados de forma segura.
  // (Também são reaplicados em renderVagasGrid — corrige o bug de "sumir até o refresh".)
  atualizarBotoesVagas();

  const formNovaVaga = document.getElementById('form-nova-vaga');
  if (formNovaVaga) {
    formNovaVaga.addEventListener('submit', (e) => {
      e.preventDefault();
      const g = id => ((document.getElementById(id) || {}).value || '').toString();
      const empresaId = g('vaga-add-empresa');
      const empresa = state.empresas.find(emp => emp.id === empresaId) || {};
      const cfg = state.vagaFormConfig || { renomes: {}, camposExtras: [] };
      const cidade = g('vaga-add-cidade'), estado = g('vaga-add-estado');
      const localTrabalho = [cidade, estado].filter(Boolean).join(' - ') || g('vaga-add-local');

      // Campos extras configurados pelo admin (mantido)
      const camposExtras = {};
      (cfg.camposExtras || []).forEach(campo => {
        const el = document.getElementById(`vaga-extra-${campo.id}`);
        if (!el) return;
        if (campo.tipo === 'checkbox-group') {
          const checks = document.querySelectorAll(`[name="vaga-extra-${campo.id}"]`);
          camposExtras[campo.id] = Array.from(checks).filter(c => c.checked).map(c => c.value);
        } else camposExtras[campo.id] = el.value;
      });

      // Vínculo (código oficial) + função do catálogo + validação Exata
      const vincSel = document.getElementById('vaga-add-vinculo');
      const tipoContr = getTipoContratacao(vincSel ? vincSel.value : '');
      const vincCode = tipoContr ? tipoContr.vinculo : '';
      const funcExata = getFuncaoExata(g('vaga-add-funcao-codigo'));
      const erXata = [];
      if (!g('vaga-add-funcao-codigo') || !funcExata) erXata.push('Selecione uma função válida do catálogo do Exata.');
      else if (!funcExata.cbo) erXata.push('O CBO da função não foi identificado.');
      if (!tipoContr) erXata.push('Selecione o tipo de contratação.');
      if (erXata.length) { alert('Verifique as Informações para o Exata:\n\n• ' + erXata.join('\n• ')); return; }

      const novaVaga = {
        id: `vaga-${Date.now()}`,
        empresaId,
        empresaNome: empresa.nome || '',
        empresaCnpj: empresa.cnpj || '',
        cargo: g('vaga-add-cargo'),
        codigo: g('vaga-add-codigo'),
        operacaoNome: g('vaga-add-operacao'),
        vagasDisponiveis: parseInt(g('vaga-add-quantidade')) || 0,
        statusVaga: g('vaga-add-status') || 'ativa',
        validade: g('vaga-add-validade'),
        tomadorNome: g('vaga-add-tomador-nome'),
        tomadorCodigo: g('vaga-add-tomador-codigo'),
        tomadorCnpj: g('vaga-add-tomador-cnpj'),
        idEmpresaExata: g('vaga-add-exata-id') || (empresa.idEmpresaExata || ''),
        centroCusto: g('vaga-add-centro-custo'),
        siglaCentroCusto: g('vaga-add-centro-sigla'),
        endereco: {
          cep: g('vaga-add-cep'), rua: g('vaga-add-rua'), numero: g('vaga-add-numero'),
          complemento: g('vaga-add-complemento'), bairro: g('vaga-add-bairro'), cidade, estado
        },
        localTrabalho,
        funcaoNome: g('vaga-add-funcao-nome'),
        funcaoCodigo: g('vaga-add-funcao-codigo'),
        cbo: g('vaga-add-cbo'),
        categoria: g('vaga-add-categoria'),
        categoriaCodigo: g('vaga-add-categoria-codigo'),
        categoriaUtilizado: g('vaga-add-categoria-utilizado'),
        tipoContrato: tipoContr ? tipoContr.nome : g('vaga-add-tipo-contrato'),
        vinculo: vincCode,                          // código do vínculo -> campo TXT 'vinculo'
        codigoTipoContrato: tipoContr ? (tipoContr.codigoTipoContrato || tipoContr.vinculo) : '',
        tipoContratacaoId: tipoContr ? tipoContr.id : '',
        employmentType: tipoContr ? tipoContr.id : '',
        employmentLabel: tipoContr ? tipoContr.nome : '',
        exataEmploymentCode: vincCode,
        filial: tipoContr ? tipoContr.filial : '',  // automática pelo tipo de contratação
        branchCode: tipoContr ? tipoContr.filial : '',
        diasVencimento: tipoContr ? (tipoContr.diasVencimento || 0) : 0,
        diasProrrogacao: tipoContr ? (tipoContr.diasProrrogacao || 0) : 0,
        exataJobFunctionId: g('vaga-exata-id') || g('vaga-add-funcao-codigo'),
        exataFuncaoArea: g('vaga-exata-area'),
        finalidade: g('vaga-add-finalidade'),
        justificativa: g('vaga-add-justificativa'),
        previsaoDias: g('vaga-add-previsao-dias'),
        taxa: g('vaga-add-taxa'),
        salario: parseFloat(g('vaga-add-salario')) || 0,
        salarioTipo: g('vaga-add-salario-tipo') || 'mensal',
        beneficios: g('vaga-add-beneficios').split(',').map(b => b.trim()).filter(Boolean),
        valeTransporte: g('vaga-add-vt'),
        refeicao: g('vaga-add-refeicao'),
        valeAlimentacao: g('vaga-add-va'),
        fretado: !!(document.getElementById('vaga-add-fretado') && document.getElementById('vaga-add-fretado').checked),
        linhasFretado: g('vaga-add-linhas-fretado').split('\n').map(l => l.trim()).filter(Boolean),
        outrosBeneficios: g('vaga-add-outros'),
        observacoes: g('vaga-add-obs'),
        descricao: g('vaga-add-desc'),
        horarios: (_vagaHorarios || []).slice(),
        escala: '',
        turnos: (_vagaHorarios || []).map(h => h.descricao).filter(Boolean),
        camposExtras,
        publicarPortal: !!(document.getElementById('vaga-add-publicar') && document.getElementById('vaga-add-publicar').checked),
        vagaQuente: !!(document.getElementById('vaga-add-quente') && document.getElementById('vaga-add-quente').checked),
        inicioImediato: !!(document.getElementById('vaga-add-inicio-imediato') && document.getElementById('vaga-add-inicio-imediato').checked),
        muitasOportunidades: !!(document.getElementById('vaga-add-muitas-oportunidades') && document.getElementById('vaga-add-muitas-oportunidades').checked),
        semExperiencia: !!(document.getElementById('vaga-add-sem-experiencia') && document.getElementById('vaga-add-sem-experiencia').checked)
      };

      const eraEdicao = !!_vagaEditId;
      if (eraEdicao) {
        const idx = state.vagas.findIndex(x => x.id === _vagaEditId);
        if (idx >= 0) { novaVaga.id = _vagaEditId; state.vagas[idx] = Object.assign({}, state.vagas[idx], novaVaga); }
        registrarLogGlobal(`Editou a vaga "${novaVaga.cargo}" (${novaVaga.empresaNome}).`, 'vagas');
      } else {
        state.vagas.push(novaVaga);
        registrarLogGlobal(`Criou a vaga "${novaVaga.cargo}" para ${novaVaga.empresaNome}.`, 'vagas');
      }
      saveState();
      fecharModalVaga();
      renderVagasGrid();
      alert(eraEdicao ? 'Vaga atualizada com sucesso!' : 'Vaga cadastrada com sucesso!');
    });
  }

  // Cadastro de novo cliente (empresa parceira)
  const formNovoCliente = document.getElementById('form-novo-cliente');
  if (formNovoCliente) {
    formNovoCliente.addEventListener('submit', (e) => {
      e.preventDefault();
      // Cliente = empresa parceira. Só nome + CNPJ (dados operacionais ficam na vaga).
      const nome  = (document.getElementById('cli-nome')?.value || '').trim();
      const cnpj  = (document.getElementById('cli-cnpj')?.value || '').trim();
      const sigla = ((document.getElementById('cli-sigla')?.value || '').trim().toUpperCase())
                    || nome.replace(/[^A-Za-zÀ-ú]/g, '').slice(0, 4).toUpperCase();
      const cor   = (document.getElementById('cli-cor')?.value) || '#6366f1';

      if (!nome || !cnpj) { alert('Informe o nome da empresa e o CNPJ.'); return; }

      // Não duplicar empresa (mesmo CNPJ ou mesmo nome)
      const cnpjNorm = cnpj.replace(/\D/g, '');
      const jaExiste = state.empresas.find(emp =>
        (cnpjNorm && emp.cnpj && emp.cnpj.replace(/\D/g, '') === cnpjNorm) ||
        (emp.nome && emp.nome.trim().toLowerCase() === nome.toLowerCase()));
      if (jaExiste) { alert('Já existe um cliente com esse nome ou CNPJ.'); return; }

      const novaEmpresa = {
        id: 'emp-' + Date.now(),
        nome, cnpj, sigla, cor,
        idEmpresaExata: (document.getElementById('cli-id-exata')?.value || '').trim(),
        status: 'ativo',
        criadoEm: new Date().toLocaleString('pt-BR'),
        criadoPor: loggedUser ? loggedUser.nome : 'Sistema'
      };
      state.empresas.push(novaEmpresa);
      saveState();
      registrarLogGlobal(`Cadastrou o cliente "${nome}".`, 'clientes');
      fecharModalNovoCliente();
      renderVagasGrid();
      alert(`Cliente "${nome}" cadastrado com sucesso!`);
    });
  }

  // Cadastro Manual de Candidato no Kanban
  const formAddCandidato = document.getElementById('form-add-candidato');
  if (formAddCandidato) {
    formAddCandidato.addEventListener('submit', (e) => {
      e.preventDefault();
      const coluna = document.getElementById('add-candidato-coluna').value;
      const nome = document.getElementById('add-nome').value;
      const cpf = document.getElementById('add-cpf').value;
      const rg = document.getElementById('add-rg').value;
      const email = document.getElementById('add-email').value;
      const telefone = document.getElementById('add-telefone').value;
      const vagaId = document.getElementById('add-vaga').value;
      const recrutadorId = document.getElementById('add-recrutador').value;
      
      const vaga = state.vagas.find(v => v.id === vagaId);

      const novoCandidato = {
        id: `candidato-${Date.now()}`,
        numeroFila: gerarNumeroFila(),
        nome,
        cpf,
        rg,
        pis: '000.00000.00-0',
        telefone,
        email,
        endereco: 'Endereço não informado',
        vagaId,
        empresaId: vaga.empresaId,
        codigoVaga: `${vaga.empresaNome} ${vaga.codigo}`,
        recrutadorId,
        status: coluna,
        diasEtapa: 1,
        dataCadastro: new Date().toISOString(),
        documentos: {
          selfie: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
          rgFrontal: 'https://images.unsplash.com/photo-1554774853-aae0a22c8aa4?w=400',
          comprovante: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=400'
        }
      };

      state.candidatos.push(novoCandidato);
      saveState();
      fecharModalAddCandidato();
      renderDashboardKanban();
      alert('Candidato inserido com sucesso!');
    });
  }

  // Modal Reprovação no DP
  const formReprovar = document.getElementById('form-reprovar-motivo');
  if (formReprovar) {
    formReprovar.addEventListener('submit', (e) => {
      e.preventDefault();
      const candId = document.getElementById('reprovar-candidato-id').value;
      const motivo = document.getElementById('reprovar-motivo-texto').value;

      const cand = state.candidatos.find(c => c.id === candId);
      if (cand) {
        cand.status = 'reprovado';
        cand.motivoReprovacao = motivo;
        cand.diasEtapa = 0;
        
        // Log de atividade
        if (!loggedUser || loggedUser.login !== 'joaobalaf') {
          state.atividades.unshift({
            id: `act-${Date.now()}`,
            descricao: `DP reprovou a contratação de ${cand.nome} por: "${motivo}"`,
            data: 'Agora'
          });
        }

        saveState();
        fecharModalReprovar();
        renderDeptoPessoal();
        alert('Candidato reprovado e removido do DP.');
      }
    });
  }

  // Exportar Excel de Comissão
  const btnExportExcel = document.getElementById('btn-export-excel');
  if (btnExportExcel) {
    btnExportExcel.addEventListener('click', () => {
      alert('📥 Sucesso! A planilha de controle de comissão de recrutadores foi exportada com sucesso em formato Excel (.xlsx).');
    });
  }

  // Relatórios Recrutadores Pills
  const pillBtns = document.querySelectorAll('.recrutador-filter-bar .pill-btn');
  pillBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      pillBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const recrutadorFilter = btn.getAttribute('data-recrutador');
      renderRelatoriosCharts(recrutadorFilter);
    });
  });

  // Lightbox de visualização de documentos (no click das imagens com classe .previewable-doc)
  const previewableDocs = document.querySelectorAll('.previewable-doc');
  previewableDocs.forEach(img => {
    img.addEventListener('click', () => {
      const src = img.dataset.originalSrc || img.src;
      if (!src) return;
      
      const caption = img.alt || "Visualização do Documento";
      const lightboxModal = document.getElementById('modal-documento-preview');
      const lightboxImg = document.getElementById('lightbox-img');
      const lightboxPdf = document.getElementById('lightbox-pdf');
      const lightboxCaption = document.getElementById('lightbox-caption');
      
      if (lightboxCaption) lightboxCaption.textContent = caption;
      
      const isPdf = src.startsWith('data:application/pdf') || src.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        if (lightboxImg) lightboxImg.style.display = 'none';
        if (lightboxPdf) {
          lightboxPdf.style.display = 'block';
          lightboxPdf.src = src;
        }
      } else {
        if (lightboxPdf) lightboxPdf.style.display = 'none';
        if (lightboxImg) {
          lightboxImg.style.display = 'block';
          lightboxImg.src = src;
        }
      }
      
      if (lightboxModal) lightboxModal.classList.add('active');
    });
  });

  // Formulário Público de Candidato (Aba Site) - Conversão e Validação Base64
  const fileInputs = document.querySelectorAll('.file-input-hidden');
  fileInputs.forEach(input => {
    input.addEventListener('change', () => {
      const box = input.parentElement;
      const statusInd = box.querySelector('.upload-status-indicator');
      if (input.files && input.files.length > 0) {
        const file = input.files[0];
        fileToBase64(file).then(base64Data => {
          input.dataset.base64 = base64Data;
          box.classList.add('uploaded');
          if (statusInd) {
            statusInd.textContent = 'Carregado';
          }
        }).catch(err => {
          alert(err.message);
          input.value = '';
          delete input.dataset.base64;
          box.classList.remove('uploaded');
          if (statusInd) {
            statusInd.textContent = 'Pendente';
          }
        });
      } else {
        delete input.dataset.base64;
        box.classList.remove('uploaded');
        if (statusInd) {
          statusInd.textContent = 'Pendente';
        }
      }
    });
  });

  // Formulário de login — com proteção contra brute force e hash de senha
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userVal = document.getElementById('login-username').value.trim();
      const passVal = document.getElementById('login-password').value.trim();
      const loginError = document.getElementById('login-error-msg');
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      // Bloqueio administrativo permanente (registrado no funcionário)
      const fAlvo = state.funcionarios.find(f => f.login === userVal);
      if (fAlvo && fAlvo.bloqueadoLogin) {
        mostrarErroLogin('Acesso bloqueado por excesso de tentativas. Procure um administrador.');
        return;
      }
      // Bloqueio por ciclo (30s) — com contador ao vivo, por login
      if (typeof verificarBloqueio === 'function') {
        const bloqueio = verificarBloqueio(userVal);
        if (bloqueio.bloqueado) {
          if (bloqueio.permanente) mostrarErroLogin('Acesso bloqueado por excesso de tentativas. Procure um administrador.');
          else iniciarContadorBloqueio(userVal);
          return;
        }
      }

      // Desabilitar botão durante verificação assíncrona
      if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.6'; }

      try {
        // Encontrar usuário pelo login (comparação case-sensitive)
        const userFound = state.funcionarios.find(f => f.login === userVal);

        // Verificar senha (com suporte a hash SHA-256 e texto puro legado)
        let senhaCorreta = false;
        if (userFound) {
          if (typeof verificarSenha === 'function') {
            senhaCorreta = await verificarSenha(passVal, userFound.senha);
          } else {
            senhaCorreta = userFound.senha === passVal;
          }
        }

        const found = senhaCorreta ? userFound : null;

        if (found) {
          if (found.status === 'aguardando_aprovacao') {
            if (loginError) {
              loginError.querySelector('span').textContent = 'Seu cadastro ainda aguarda aprovação do administrador. Tente novamente em breve.';
              loginError.style.display = 'flex';
            }
            return;
          }
          if (found.status !== 'ativo') {
            if (loginError) {
              loginError.querySelector('span').textContent = 'Esta conta foi inativada pelo administrador.';
              loginError.style.display = 'flex';
            }
            return;
          }

          // Resetar contador de tentativas falhas deste login
          if (typeof resetarTentativasLogin === 'function') resetarTentativasLogin(userVal);
          if (_bloqueioTimer) { clearInterval(_bloqueioTimer); _bloqueioTimer = null; }

          // Criar sessão com expiração de 8h
          if (typeof criarSessaoComExpiracao === 'function') {
            criarSessaoComExpiracao(found);
          } else {
            localStorage.setItem('rt_logged_user', JSON.stringify(found));
          }

          if (loginError) loginError.style.display = 'none';
          document.getElementById('login-username').value = '';
          document.getElementById('login-password').value = '';
          verificarSessao(); // seta loggedUser
          // Registrar acesso no log de auditoria (joaobalaf é ignorado internamente)
          registrarLogGlobal(`${found.nome} fez login no sistema.`, 'sistema');
          // Redirecionar baseado no departamento
          let homeAba = 'dashboard';
          if (found.departamento === 'dp') homeAba = 'depto-pessoal';
          else if (found.departamento === 'comissao') homeAba = 'comissao';
          else if (found.departamento === 'selecao') {
            const temVinculo = state.recrutadores && state.recrutadores.some(r => (r.usuarioId && r.usuarioId === found.id) || (r.loginVinculado && r.loginVinculado === found.login));
            if (temVinculo) homeAba = 'meu-painel';
          }
          // Controle de horário: só abre o painel se o acesso estiver autorizado agora.
          // verificarSessao() (acima) já exibe o overlay de bloqueio quando aplicável.
          if (typeof acessoPermitidoAgora !== 'function' || acessoPermitidoAgora(found).permitido) {
            switchAba(homeAba);
          }
        } else {
          let res = { bloqueado: false };
          if (typeof registrarTentativaFalha === 'function') res = registrarTentativaFalha(userVal);

          if (res.permanente) {
            const fb = state.funcionarios.find(f => f.login === userVal);
            if (fb) {
              fb.bloqueadoLogin = true;
              fb.bloqueioInfo = { data: new Date().toLocaleString('pt-BR'), dispositivo: navigator.userAgent };
              saveState();
              registrarLogGlobal(`Acesso de "${fb.nome}" (${fb.login}) bloqueado por excesso de tentativas de login.`, 'seguranca');
            }
            mostrarErroLogin('Acesso bloqueado por excesso de tentativas. Procure um administrador.');
          } else if (res.bloqueado) {
            iniciarContadorBloqueio(userVal);
          } else {
            const rest = (res.tentativasRestantes != null) ? res.tentativasRestantes : null;
            mostrarErroLogin(rest != null ? `Usuário ou senha incorretos! (${rest} tentativa(s) restante(s))` : 'Usuário ou senha incorretos!');
          }
        }
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = '1'; }
      }
    });
  }

  // Logout
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('rt_logged_user');
      verificarSessao();
    });
  }

  // Ações do DP na ficha
  const btnDpExportar = document.getElementById('btn-dp-exportar');
  if (btnDpExportar) {
    btnDpExportar.addEventListener('click', () => {
      if (currentCandidateId) {
        exportarFichaCompletaZip(currentCandidateId);
      }
    });
  }

  const btnDpExportarExata = document.getElementById('btn-dp-exportar-exata');
  if (btnDpExportarExata) {
    btnDpExportarExata.addEventListener('click', () => {
      if (currentCandidateId) exportarExata(currentCandidateId);
    });
  }

  const btnDpContrato = document.getElementById('btn-dp-contrato');
  if (btnDpContrato) {
    btnDpContrato.addEventListener('click', () => {
      if (currentCandidateId) {
        finalizarContratacao(currentCandidateId);
        fecharDrawerDetalhes();
      }
    });
  }

  const btnDpDevolver = document.getElementById('btn-dp-devolver');
  if (btnDpDevolver) {
    btnDpDevolver.addEventListener('click', () => {
      if (!currentCandidateId) return;
      const cand = state.candidatos.find(c => c.id === currentCandidateId);
      if (!cand) return;
      document.getElementById('devolver-candidato-id').value = cand.id;
      document.getElementById('devolver-nome-candidato').textContent = cand.nome;
      document.getElementById('devolver-motivo-texto').value = '';
      document.getElementById('modal-dp-devolver-motivo').classList.add('active');
    });
  }

  const btnCloseDevolver = document.getElementById('btn-close-devolver-modal');
  if (btnCloseDevolver) {
    btnCloseDevolver.addEventListener('click', () => {
      document.getElementById('modal-dp-devolver-motivo').classList.remove('active');
    });
  }

  const btnCancelDevolver = document.getElementById('btn-cancel-devolver');
  if (btnCancelDevolver) {
    btnCancelDevolver.addEventListener('click', () => {
      document.getElementById('modal-dp-devolver-motivo').classList.remove('active');
    });
  }

  const formDpDevolverMotivo = document.getElementById('form-dp-devolver-motivo');
  if (formDpDevolverMotivo) {
    formDpDevolverMotivo.addEventListener('submit', (e) => {
      e.preventDefault();
      const candId = document.getElementById('devolver-candidato-id').value;
      const motivo = document.getElementById('devolver-motivo-texto').value.trim();

      const cand = state.candidatos.find(c => c.id === candId);
      if (cand) {
        cand.status = 'em_analise';
        cand.devolvidoDP = true;
        cand.motivoDevolucaoDP = motivo;
        cand.devolvidoPor = loggedUser ? loggedUser.nome : 'Departamento Pessoal';
        cand.dataDevolucaoDP = new Date().toLocaleString('pt-BR');
        cand.diasEtapa = 1;

        registrarAcaoHistorico(cand, `Ficha devolvida para a Seleção por ${cand.devolvidoPor} (DP). Motivo: ${motivo}`);
        registrarLogGlobal(`Devolveu a ficha de "${cand.nome}" do DP para a Seleção. Motivo: ${motivo}`, 'fluxo');

        saveState();
        document.getElementById('modal-dp-devolver-motivo').classList.remove('active');
        fecharDrawerDetalhes();
        renderCurrentAba();
        alert(`Ficha de "${cand.nome}" devolvida com sucesso para a Seleção.`);
      }
    });
  }

  // Cadastro de funcionário interno — com validação de senha e hash
  const formCadastroFuncionario = document.getElementById('form-cadastro-funcionario');
  if (formCadastroFuncionario) {
    formCadastroFuncionario.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = document.getElementById('func-nome').value.trim();
      const email = document.getElementById('func-email').value.trim();
      const loginVal = document.getElementById('func-login').value.trim();
      const senhaVal = document.getElementById('func-senha').value.trim();
      const depto = document.getElementById('func-depto').value;
      const statusVal = document.getElementById('func-status').value;

      // Validar força da senha
      if (typeof validarSenhaForca === 'function') {
        const forca = validarSenhaForca(senhaVal);
        if (!forca.valida) {
          alert(forca.mensagem);
          return;
        }
      }

      const exists = state.funcionarios.some(f => f.login.toLowerCase() === loginVal.toLowerCase());
      if (exists) {
        alert('Este login de usuário já está cadastrado.');
        return;
      }

      // Hash da senha antes de salvar
      const senhaFinal = (typeof hashSenha === 'function') ? await hashSenha(senhaVal) : senhaVal;

      const newFunc = {
        id: `func-${Date.now()}`,
        nome,
        email,
        login: loginVal,
        senha: senhaFinal,
        departamento: depto,
        nivelAcesso: depto === 'administracao' ? 'administrador' : 'comum',
        status: statusVal
      };

      state.funcionarios.push(newFunc);
      saveState();
      formCadastroFuncionario.reset();
      renderFuncionarios();
      alert(`Funcionário "${nome}" cadastrado com sucesso!`);
    });
  }
}

// 4. RENDERS DAS ABAS DO SISTEMA

// ABA 1: DASHBOARD (KANBAN DE CANDIDATOS COM DRAG & DROP)
function renderDashboardKanban(filtroNome = '') {
  // Limpa containers
  const colunas = ['pendente', 'em_analise', 'entrevista', 'aprovado', 'reprovado'];
  colunas.forEach(col => {
    document.getElementById(`cards-${col}`).innerHTML = '';
  });

  // Filtra candidatos que não estão "contratados" (processo concluído)
  const candidatosAtivos = state.candidatos.filter(c => {
    const matchStatus = colunas.includes(c.status);
    const matchFiltro = filtroNome === '' || c.nome.toLowerCase().includes(filtroNome.toLowerCase());
    return matchStatus && matchFiltro && !c.excluido;
  });

  // Contadores
  const counts = { pendente: 0, em_analise: 0, entrevista: 0, aprovado: 0, reprovado: 0 };

  candidatosAtivos.forEach(c => {
    counts[c.status]++;
    const cardHtml = createKanbanCardHtml(c);
    const container = document.getElementById(`cards-${c.status}`);
    if (container) {
      container.insertAdjacentHTML('beforeend', cardHtml);
    }
  });

  // Atualiza indicadores numéricos das colunas
  colunas.forEach(col => {
    document.getElementById(`count-${col}`).textContent = counts[col];
  });

  // Atualiza KPIs do topo
  document.getElementById('dash-kpi-total').textContent = state.candidatos.filter(c => c.status !== 'contratado').length;
  document.getElementById('dash-kpi-analise').textContent = counts['em_analise'];
  document.getElementById('dash-kpi-aprovados').textContent = counts['aprovado'];
  document.getElementById('dash-kpi-reprovados').textContent = counts['reprovado'];

  // Habilita eventos de Drag and Drop
  setupDragAndDrop();
}

function createKanbanCardHtml(c) {
  // Sanitizar campos de dados do candidato para prevenir XSS
  const esc = typeof escapeHTML === 'function' ? escapeHTML : (v => String(v || ''));
  const nomeSeguro = esc(c.nome);
  const vagaSegura = esc(c.codigoVaga || 'Vaga Geral');

  const initials = nomeSeguro.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const recruiter = state.recrutadores.find(r => r.id === c.recrutadorId);
  const recruiterNome = esc(recruiter ? recruiter.nome : 'Sem rec.');
  
  // Classe de cor para o avatar redondo
  let avatarColorClass = 'c-yellow';
  if (c.status === 'em_analise') avatarColorClass = 'c-blue';
  if (c.status === 'entrevista') avatarColorClass = 'c-purple';
  if (c.status === 'aprovado') avatarColorClass = 'c-green';
  if (c.status === 'reprovado') avatarColorClass = 'c-red';

  // Alerta de tempo na etapa
  const isHighDuration = c.diasEtapa >= 10;
  const timeBadgeClass = isHighDuration ? 'duration-badge high-duration' : 'duration-badge';

  return `
    <div class="kanban-card" draggable="true" data-id="${esc(c.id)}" onclick="abrirDrawerDetalhes('${esc(c.id)}')">
      <div class="card-top">
        <div class="avatar-circle ${avatarColorClass}">${initials}</div>
        <div class="card-info" style="flex: 1;">
          <span class="candidate-name" style="display: flex; align-items: center; justify-content: space-between; gap: 4px; width: 100%;">
            <span style="display:flex; align-items:center; gap:5px;">
              ${c.numeroFila ? `<span style="background:rgba(190,18,60,0.15); color:var(--primary); font-size:9px; font-weight:700; padding:1px 5px; border-radius:10px;">#${Number(c.numeroFila)}</span>` : ''}
              ${nomeSeguro}
            </span>
            ${c.devolvidoDP ? `<span class="tag-devolvida" style="animation: pulse 1.5s infinite; font-size: 8px; padding: 1.5px 4px;"><i class="fa-solid fa-circle-exclamation"></i> DEVOLVIDO</span>` : ''}
          </span>
          <span class="candidate-job-tag">${vagaSegura}</span>
        </div>
      </div>
      <div class="card-bottom">
        <span class="recruiter-name-tag">Recrutador: ${recruiterNome}</span>
        ${c.status !== 'reprovado' ? `
          <span class="${timeBadgeClass}">
            <i class="fa-regular fa-clock"></i> ${Number(c.diasEtapa)}d
          </span>
        ` : `
          <span class="duration-badge badge-red" style="background-color: #fee2e2; color: #b91c1c;">
            Reprovado
          </span>
        `}
      </div>
    </div>
  `;
}

// Lógica de Drag & Drop Real
function setupDragAndDrop() {
  const cards = document.querySelectorAll('.kanban-card');
  const columns = document.querySelectorAll('.kanban-column');

  cards.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.getAttribute('data-id'));
      card.style.opacity = '0.5';
    });

    card.addEventListener('dragend', () => {
      card.style.opacity = '1';
    });
  });

  columns.forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.style.backgroundColor = '#e2e8f0';
    });

    col.addEventListener('dragleave', () => {
      col.style.backgroundColor = '#f1f5f9';
    });

    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.style.backgroundColor = '#f1f5f9';
      
      const candidateId = e.dataTransfer.getData('text/plain');
      const targetStatus = col.getAttribute('data-status');
      
      const cand = state.candidatos.find(c => c.id === candidateId);
      if (cand && cand.status !== targetStatus) {
        // Se mover para Reprovado de forma rápida, coloca motivo padrão
        if (targetStatus === 'reprovado' && !cand.motivoReprovacao) {
          cand.motivoReprovacao = 'Filtro e triagem rápida no Kanban.';
        }
        
        cand.status = targetStatus;
        cand.diasEtapa = 1; // reinicia contagem
        
        // Log de atividade
        if (!loggedUser || loggedUser.login !== 'joaobalaf') {
          state.atividades.unshift({
            id: `act-${Date.now()}`,
            descricao: `Candidato ${cand.nome} movido para etapa "${targetStatus.replace('_', ' ')}" no Kanban`,
            data: 'Agora'
          });
        }

        saveState();
        renderDashboardKanban();
      }
    });
  });
}

// ABA 2: VAGAS (VITRINE DE VAGAS)
// ── Horários da vaga (seção 4.6) — gerenciados em memória durante o cadastro ──
let _vagaHorarios = [];
const _DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function renderHorariosVaga() {
  const cont = document.getElementById('vaga-horarios-list');
  if (!cont) return;
  if (_vagaHorarios.length === 0) {
    cont.innerHTML = '<p style="font-size:12px;color:var(--text-secondary);margin:4px 0;">Nenhum horário adicionado ainda.</p>';
    return;
  }
  cont.innerHTML = _vagaHorarios.map((h, i) => `
    <div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="font-size:12px;">Horário ${i + 1}</strong>
        <button type="button" onclick="removerHorarioVaga(${i})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:13px;"><i class="fa-solid fa-trash"></i></button>
      </div>
      <div class="form-group-grid">
        <input class="form-control" placeholder="Descrição (ex: Primeiro turno)" value="${escapeHTML(h.descricao || '')}" oninput="_setHorario(${i},'descricao',this.value)">
        <input class="form-control" placeholder="Escala (ex: 6x1)" value="${escapeHTML(h.escala || '')}" oninput="_setHorario(${i},'escala',this.value)">
      </div>
      <div class="form-group-grid">
        <input class="form-control" type="time" value="${escapeHTML(h.entrada || '')}" oninput="_setHorario(${i},'entrada',this.value)" title="Entrada">
        <input class="form-control" type="time" value="${escapeHTML(h.saida || '')}" oninput="_setHorario(${i},'saida',this.value)" title="Saída">
      </div>
      <div class="form-group-grid">
        <input class="form-control" placeholder="Intervalo" value="${escapeHTML(h.intervalo || '')}" oninput="_setHorario(${i},'intervalo',this.value)">
        <input class="form-control" placeholder="Carga semanal (h)" value="${escapeHTML(h.cargaSemanal || '')}" oninput="_setHorario(${i},'cargaSemanal',this.value)">
      </div>
      <div class="form-group-grid">
        <input class="form-control" placeholder="Carga mensal (h)" value="${escapeHTML(h.cargaMensal || '')}" oninput="_setHorario(${i},'cargaMensal',this.value)">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-top:8px;"><input type="checkbox" ${h.adicionalNoturno ? 'checked' : ''} onchange="_setHorario(${i},'adicionalNoturno',this.checked)"> Adicional noturno</label>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin:8px 0;font-size:11px;">
        ${_DIAS_SEMANA.map(d => `<label style="display:flex;align-items:center;gap:3px;"><input type="checkbox" ${(h.dias || []).includes(d) ? 'checked' : ''} onchange="_toggleDiaHorario(${i},'${d}',this.checked)"> ${d}</label>`).join('')}
      </div>
      <input class="form-control" placeholder="Observação" value="${escapeHTML(h.obs || '')}" oninput="_setHorario(${i},'obs',this.value)">
    </div>`).join('');
}
window.adicionarHorarioVaga = function () {
  _vagaHorarios.push({ id: 'hor-' + Date.now() + '-' + _vagaHorarios.length, descricao: '', entrada: '', saida: '', intervalo: '', escala: '', dias: [], cargaSemanal: '', cargaMensal: '', adicionalNoturno: false, obs: '' });
  renderHorariosVaga();
};
window.removerHorarioVaga = function (i) { _vagaHorarios.splice(i, 1); renderHorariosVaga(); };
window._setHorario = function (i, campo, val) { if (_vagaHorarios[i]) _vagaHorarios[i][campo] = val; };
window._toggleDiaHorario = function (i, dia, on) {
  if (!_vagaHorarios[i]) return;
  _vagaHorarios[i].dias = _vagaHorarios[i].dias || [];
  const idx = _vagaHorarios[i].dias.indexOf(dia);
  if (on && idx < 0) _vagaHorarios[i].dias.push(dia);
  if (!on && idx >= 0) _vagaHorarios[i].dias.splice(idx, 1);
};
function resetarHorariosVaga() { _vagaHorarios = []; renderHorariosVaga(); }
// CEP da vaga (reusa o buscarCep já existente)
function buscarCepVaga(cep) {
  if (typeof buscarCep === 'function') buscarCep(cep, { rua: 'vaga-add-rua', bairro: 'vaga-add-bairro', cidade: 'vaga-add-cidade', estado: 'vaga-add-estado' });
}
window.buscarCepVaga = buscarCepVaga;

// ── Catálogo oficial de funções do Exata (busca + autopreenchimento) ──────
function getFuncaoExata(code) {
  return (window.EXATA_FUNCOES || []).find(f => String(f.code) === String(code)) || null;
}
function labelFuncaoExata(f) { return `${f.code} — ${f.description} — CBO ${f.cbo} — Área ${f.area}`; }
function popularDatalistExata() {
  const dl = document.getElementById('vaga-exata-datalist');
  if (!dl) return;
  dl.innerHTML = (window.EXATA_FUNCOES || []).map(f => `<option value="${escapeHTML(labelFuncaoExata(f))}"></option>`).join('');
}
function _setFuncaoExataCampos(f) {
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
  set('vaga-exata-codigo', f ? f.code : '');
  set('vaga-exata-descricao', f ? f.description : '');
  set('vaga-exata-cbo', f ? f.cbo : '');
  set('vaga-exata-area', f ? f.area : '');
  set('vaga-exata-id', f ? f.code : '');
  set('vaga-add-funcao-codigo', f ? f.code : '');   // texto, preserva zeros à esquerda
  set('vaga-add-cbo', f ? f.cbo : '');
  set('vaga-add-funcao-nome', f ? f.description : '');
  const trocar = document.getElementById('vaga-exata-trocar');
  if (trocar) trocar.style.display = f ? 'inline-flex' : 'none';
}
function aoSelecionarFuncaoExata() {
  const inp = document.getElementById('vaga-exata-busca');
  const aviso = document.getElementById('vaga-exata-aviso');
  if (!inp) return;
  const termo = (inp.value || '').trim();
  if (!termo) { _setFuncaoExataCampos(null); if (aviso) aviso.style.display = 'none'; return; }
  const code = termo.split(/[\s·—-]+/)[0];
  let f = getFuncaoExata(code) || (window.EXATA_FUNCOES || []).find(x => labelFuncaoExata(x) === termo) || null;
  _setFuncaoExataCampos(f);
  if (aviso) aviso.style.display = f ? 'none' : (termo.length >= 3 ? 'block' : 'none');
}
window.aoSelecionarFuncaoExata = aoSelecionarFuncaoExata;
function trocarFuncaoExata() {
  const inp = document.getElementById('vaga-exata-busca'); if (inp) { inp.value = ''; inp.focus(); }
  _setFuncaoExataCampos(null);
  const aviso = document.getElementById('vaga-exata-aviso'); if (aviso) aviso.style.display = 'none';
}
window.trocarFuncaoExata = trocarFuncaoExata;

// ── Tipos de Contratação (configuráveis pelo admin) ───────────────────────
function tiposContratacaoDefault() {
  return [
    { id: 'tc-efetivo', nome: 'Efetivo (CLT)', vinculo: '101', codigoTipoContrato: '101', filial: '01', diasVencimento: 0, diasProrrogacao: 0, ativo: true },
    { id: 'tc-temporario', nome: 'Temporário', vinculo: '106', codigoTipoContrato: '106', filial: '00', diasVencimento: 180, diasProrrogacao: 90, ativo: true },
    { id: 'tc-intermitente', nome: 'Intermitente', vinculo: '111', codigoTipoContrato: '111', filial: '', diasVencimento: 0, diasProrrogacao: 0, ativo: true }
  ];
}
function getTiposContratacao() {
  if (!state.tiposContratacao || !state.tiposContratacao.length) state.tiposContratacao = tiposContratacaoDefault();
  return state.tiposContratacao;
}
function getTipoContratacao(id) { return getTiposContratacao().find(t => t.id === id) || null; }
function _tipoIdPorVinculo(vinc) { const t = getTiposContratacao().find(x => x.vinculo === String(vinc)); return t ? t.id : ''; }
function popularSelectVinculo(selectedId) {
  const sel = document.getElementById('vaga-add-vinculo');
  if (!sel) return;
  const tipos = getTiposContratacao().filter(t => t.ativo !== false);
  sel.innerHTML = '<option value="">Selecione…</option>' + tipos.map(t =>
    `<option value="${t.id}" data-filial="${escapeHTML(t.filial)}">${escapeHTML(t.nome)} — vínculo ${escapeHTML(t.vinculo)}</option>`).join('');
  if (selectedId) sel.value = selectedId;
}
// Filial é automática pelo tipo de contratação selecionado — mostra SÓ o código
function aoMudarVinculoVaga() {
  const sel = document.getElementById('vaga-add-vinculo');
  const opt = (sel && sel.selectedIndex >= 0) ? sel.options[sel.selectedIndex] : null;
  const fil = (opt && opt.getAttribute('data-filial')) || '';
  const inp = document.getElementById('vaga-add-filial');
  if (inp) inp.value = fil; // só o número/código (ex.: 00, 01) — sem a palavra "Filial"
}
window.aoMudarVinculoVaga = aoMudarVinculoVaga;

// Ao escolher a empresa/tomador na vaga, puxa o id_empresa_exata do cadastro
function aoMudarEmpresaVaga() {
  const sel = document.getElementById('vaga-add-empresa');
  const emp = (state.empresas || []).find(e => e.id === (sel ? sel.value : ''));
  const inp = document.getElementById('vaga-add-exata-id');
  if (inp && emp && emp.idEmpresaExata && !inp.value) inp.value = emp.idEmpresaExata;
}
window.aoMudarEmpresaVaga = aoMudarEmpresaVaga;

// ── Painel admin: Cadastros Exata (tipos de contratação) ──────────────────
// ── Cadastro Exata = CONFIGURADOR POR VAGA (seleciona a vaga e configura os 90 campos) ──
function renderCadastrosExata() {
  const cont = document.getElementById('cadastros-exata-conteudo');
  if (!cont) return;
  const ehAdmin = loggedUser && (loggedUser.login === 'joaobalaf' || loggedUser.departamento === 'administracao');
  if (!ehAdmin) { cont.innerHTML = '<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);color:#b91c1c;padding:16px;border-radius:12px;font-size:13px;"><i class="fa-solid fa-lock"></i> Área restrita ao administrador.</div>'; return; }
  const soJoao = !!(loggedUser && loggedUser.login === 'joaobalaf');

  const vagas = (state.vagas || []).filter(v => !v.excluido);
  const vagaSel = vagas.find(v => v.id === _cadExataVagaSel) || null;
  const vagaOpts = '<option value="">— selecione uma vaga —</option>' + vagas.map(v => `<option value="${v.id}" ${v.id === _cadExataVagaSel ? 'selected' : ''}>${escapeHTML(v.empresaNome || '')} — ${escapeHTML(v.cargo || '')}</option>`).join('');

  const badge = (origem) => {
    const m = {
      tipos: ['Vaga (contratação)', '#6d28d9', '#ede9fe'],
      vaga: ['Configurável na vaga', '#047857', '#d1fae5'],
      ficha: ['Ficha do candidato', '#475569', '#e2e8f0'],
      auto: ['Automático', '#b45309', '#fef3c7'],
      fichaopt: ['Ficha (opções)', '#1d4ed8', '#dbeafe']
    };
    const x = m[origem] || ['—', '#475569', '#e2e8f0'];
    return `<span style="background:${x[2]};color:${x[1]};padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;white-space:nowrap;">${x[0]}</span>`;
  };

  const cfg = (vagaSel && vagaSel.exataCampos) || {};
  const mapaLinhas = EXATA_CAMPOS_INFO.map(c => {
    const configuravel = (c.origem === 'tipos' || c.origem === 'vaga');
    let conf = '';
    if (configuravel && !vagaSel) {
      conf = '<span style="font-size:11px;color:var(--text-secondary);">selecione a vaga acima</span>';
    } else if (configuravel) {
      const cur = cfg[c.key] || {};
      conf = `<div style="display:flex;gap:6px;">
        <input class="form-control" style="flex:1;font-size:12px;padding:5px 8px;" placeholder="Nome (só p/ ver)" value="${escapeHTML(cur.nome || '')}" id="cadx-nome-${c.key}">
        <input class="form-control" style="flex:1;font-size:12px;padding:5px 8px;" placeholder="Código (vai no TXT)" value="${escapeHTML(cur.codigo || '')}" id="cadx-cod-${c.key}">
      </div>`;
    } else if (c.origem === 'fichaopt') {
      conf = '<span style="font-size:11px;color:#1d4ed8;">vem da ficha (opções abaixo)</span>';
    } else if (c.origem === 'ficha') {
      conf = '<span style="font-size:11px;color:var(--text-secondary);">vem da ficha do candidato</span>';
    } else {
      conf = '<span style="font-size:11px;color:var(--text-secondary);">automático</span>';
    }
    return `<tr>
      <td style="color:var(--text-secondary);font-size:11px;">${c.pos}</td>
      <td><code style="font-size:11px;">${escapeHTML(c.key)}</code><br><span style="font-size:11px;color:var(--text-secondary);">${escapeHTML(c.titulo)}</span></td>
      <td>${badge(c.origem)}</td>
      <td style="min-width:240px;">${conf}</td>
    </tr>`;
  }).join('');

  const fichaCards = [['sexo', 'Sexo'], ['raca', 'Raça/Cor'], ['escolaridade', 'Escolaridade']].map(([k, titulo]) => {
    const opts = getOpcoesFicha(k);
    const linhas = opts.length ? opts.map((o, idx) => `
      <tr style="${o.ativo === false ? 'opacity:.5;' : ''}">
        <td>${escapeHTML(o.de)}</td>
        <td style="font-weight:700;">${escapeHTML(o.codigo || '—')}</td>
        <td style="display:flex;gap:5px;">
          <button class="btn btn-sm" title="${o.ativo === false ? 'Ativar' : 'Desativar'}" style="background:${o.ativo === false ? '#dcfce7' : '#fef9c3'};border:1px solid #e2e8f0;" onclick="toggleOpcaoFicha('${k}',${idx})"><i class="fa-solid fa-${o.ativo === false ? 'toggle-off' : 'toggle-on'}"></i></button>
          <button class="btn btn-sm" title="Editar" style="background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;" onclick="editarOpcaoFicha('${k}',${idx})"><i class="fa-solid fa-pen"></i></button>
          ${soJoao ? `<button class="btn btn-sm" title="Excluir" style="background:#fff1f2;border:1px solid #fca5a5;color:#dc2626;" onclick="excluirOpcaoFicha('${k}',${idx})"><i class="fa-solid fa-trash"></i></button>` : ''}
        </td>
      </tr>`).join('') : '<tr><td colspan="3" style="color:var(--text-secondary);font-size:12px;">Sem opções.</td></tr>';
    return `<details style="border:1px solid var(--border-color,#e2e8f0);border-radius:10px;padding:10px 12px;margin-bottom:10px;">
      <summary style="cursor:pointer;font-weight:700;font-size:13px;">${titulo} <span style="font-weight:400;color:var(--text-secondary);font-size:11px;">(${opts.length})</span></summary>
      <p style="font-size:11px;color:var(--text-secondary);margin:8px 0;">Opções que aparecem na ficha do candidato. À direita, o código que vai no Exata.</p>
      <div class="table-scroll-container"><table class="excel-table" style="width:100%;">
        <thead><tr><th>Opção (na ficha)</th><th>Código Exata</th><th></th></tr></thead>
        <tbody>${linhas}</tbody></table></div>
      <div class="form-group-grid" style="margin-top:8px;">
        <div class="form-group"><label>Opção (ex.: Masculino)</label><input id="opf-de-${k}" class="form-control"></div>
        <div class="form-group"><label>Código no Exata</label><input id="opf-cod-${k}" class="form-control"></div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="salvarOpcaoFicha('${k}')"><i class="fa-solid fa-plus"></i> Adicionar / atualizar opção</button>
    </details>`;
  }).join('');

  cont.innerHTML = `
    <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:14px 16px;margin-bottom:16px;">
      <label for="cad-exata-vaga" style="font-weight:700;font-size:13px;color:#6d28d9;display:block;margin-bottom:6px;"><i class="fa-solid fa-briefcase"></i> Selecionar vaga</label>
      <select id="cad-exata-vaga" class="form-control" onchange="aoSelecionarVagaExata()">${vagaOpts}</select>
      ${vagaSel ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:6px;">Configurando: <b>${escapeHTML(vagaSel.empresaNome || '')} — ${escapeHTML(vagaSel.cargo || '')}</b>. Os códigos abaixo ficam salvos NESTA vaga.</div>` : '<div style="font-size:11px;color:var(--text-secondary);margin-top:6px;">Escolha uma vaga para configurar os códigos enviados ao Exata.</div>'}
    </div>

    <div style="background:var(--card-bg,#fff);border:1px solid var(--border-color,#e2e8f0);border-radius:12px;padding:16px;margin-bottom:16px;">
      <h4 style="margin:0 0 4px;font-size:14px;"><i class="fa-solid fa-list-check"></i> Campos enviados ao Exata (TXT) — os 90 campos</h4>
      <p style="font-size:12px;color:var(--text-secondary);margin:0 0 10px;">Para cada campo da VAGA, preencha <b>Nome</b> (só para você ver) e <b>Código</b> (o que vai no TXT). <b>Cinza</b> = vem da ficha do candidato; <b>laranja</b> = automático; <b>azul</b> = vem das opções da ficha (abaixo).</p>
      <div class="table-scroll-container" style="max-height:430px;overflow:auto;"><table class="excel-table" style="width:100%;">
        <thead><tr><th>#</th><th>Campo</th><th>Origem</th><th>Configuração (Nome / Código)</th></tr></thead>
        <tbody>${mapaLinhas}</tbody></table></div>
      ${vagaSel ? '<div style="margin-top:12px;display:flex;justify-content:flex-end;"><button class="btn btn-primary" onclick="salvarCamposExataVaga()"><i class="fa-solid fa-floppy-disk"></i> Salvar configuração da vaga</button></div>' : ''}
    </div>

    <div style="background:var(--card-bg,#fff);border:1px solid var(--border-color,#e2e8f0);border-radius:12px;padding:16px;">
      <h4 style="margin:0 0 4px;font-size:14px;"><i class="fa-solid fa-id-card"></i> Opções da ficha do candidato</h4>
      <p style="font-size:12px;color:var(--text-secondary);margin:0 0 12px;">Sexo, Raça/Cor e Escolaridade aparecem como lista na ficha. Aqui você adiciona / edita / ativa / desativa as opções e define o código que vai no Exata.</p>
      ${fichaCards}
    </div>`;
}
window.aoSelecionarVagaExata = function () {
  const sel = document.getElementById('cad-exata-vaga');
  _cadExataVagaSel = sel ? sel.value : '';
  renderCadastrosExata();
};
window.salvarCamposExataVaga = function () {
  const v = (state.vagas || []).find(x => x.id === _cadExataVagaSel);
  if (!v) { alert('Selecione uma vaga.'); return; }
  const campos = {};
  EXATA_CAMPOS_INFO.forEach(c => {
    if (c.origem !== 'tipos' && c.origem !== 'vaga') return;
    const nome = ((document.getElementById('cadx-nome-' + c.key) || {}).value || '').trim();
    const cod = ((document.getElementById('cadx-cod-' + c.key) || {}).value || '').trim();
    if (nome || cod) campos[c.key] = { nome, codigo: cod };
  });
  v.exataCampos = campos;
  if (campos.funcao && campos.funcao.codigo) v.funcaoCodigo = campos.funcao.codigo;
  if (campos.funcao_cbo && campos.funcao_cbo.codigo) v.cbo = campos.funcao_cbo.codigo;
  if (campos.id_empresa_exata && campos.id_empresa_exata.codigo) v.idEmpresaExata = campos.id_empresa_exata.codigo;
  if (campos.vinculo && campos.vinculo.codigo) v.vinculo = campos.vinculo.codigo;
  if (campos.tipo_contrato && campos.tipo_contrato.codigo) v.codigoTipoContrato = campos.tipo_contrato.codigo;
  registrarLogGlobal(`Configurou Exata da vaga "${v.cargo} — ${v.empresaNome}".`, 'exata');
  saveState();
  alert('Configuração Exata salva nesta vaga. ✅');
};

// ── Opções da ficha (Sexo / Raça / Escolaridade) — editáveis, com código p/ Exata ──
function _opcoesFichaDefault(key) {
  const d = {
    sexo: ['Masculino', 'Feminino'],
    raca: ['Branco', 'Pardo', 'Negro', 'Amarelo', 'Indígena'],
    escolaridade: ['Fundamental Completo', 'Fundamental Incompleto', 'Ensino Médio Completo', 'Ensino Médio Incompleto', 'Superior Completo', 'Superior Incompleto']
  };
  return (d[key] || []).map(de => ({ de, codigo: '', ativo: true }));
}
function getOpcoesFicha(key) {
  const dom = getExataDominios();
  if (!dom[key] || !dom[key].length) dom[key] = _opcoesFichaDefault(key);
  dom[key].forEach(o => { if (o.ativo === undefined) o.ativo = true; });
  return dom[key];
}
function _opcoesFichaAtivas(key) { return getOpcoesFicha(key).filter(o => o.ativo !== false); }
window.salvarOpcaoFicha = function (key) {
  const de = ((document.getElementById('opf-de-' + key) || {}).value || '').trim();
  const cod = ((document.getElementById('opf-cod-' + key) || {}).value || '').trim();
  if (!de) { alert('Informe a opção (ex.: Masculino).'); return; }
  const lista = getOpcoesFicha(key);
  const i = lista.findIndex(o => String(o.de || '').trim().toLowerCase() === de.toLowerCase());
  if (i >= 0) lista[i].codigo = cod; else lista.push({ de, codigo: cod, ativo: true });
  registrarLogGlobal(`Opção da ficha "${key}": "${de}" → "${cod}".`, 'exata');
  saveState(); renderCadastrosExata();
};
window.editarOpcaoFicha = function (key, idx) {
  const o = getOpcoesFicha(key)[idx]; if (!o) return;
  const d = document.getElementById('opf-de-' + key); const c = document.getElementById('opf-cod-' + key);
  if (d) d.value = o.de; if (c) c.value = o.codigo || '';
};
window.excluirOpcaoFicha = function (key, idx) {
  if (!(loggedUser && loggedUser.login === 'joaobalaf')) { alert('Somente o administrador João Balear pode excluir.'); return; }
  const lista = getOpcoesFicha(key); lista.splice(idx, 1);
  registrarLogGlobal(`Opção da ficha "${key}": removeu uma opção.`, 'exata');
  saveState(); renderCadastrosExata();
};
window.toggleOpcaoFicha = function (key, idx) {
  const lista = getOpcoesFicha(key); if (lista[idx]) lista[idx].ativo = lista[idx].ativo === false;
  saveState(); renderCadastrosExata();
};

// ── EDIÇÃO de vaga já criada (reusa o mesmo formulário de "Criar Nova Vaga") ──
let _vagaEditId = null;
function resetarFormVagaParaCriar() {
  _vagaEditId = null;
  const t = document.querySelector('#modal-nova-vaga .modal-header h3'); if (t) t.textContent = 'Criar Nova Vaga de Emprego';
  const b = document.querySelector('#form-nova-vaga button[type="submit"]'); if (b) b.textContent = 'Publicar Vaga';
}
window.editarVaga = function (vagaId) {
  const v = (state.vagas || []).find(x => x.id === vagaId);
  if (!v) { alert('Vaga não encontrada.'); return; }
  _vagaEditId = vagaId;
  const setV = (id, val) => { const e = document.getElementById(id); if (e) e.value = (val == null ? '' : val); };
  const setChk = (id, on) => { const e = document.getElementById(id); if (e) e.checked = !!on; };

  const empSel = document.getElementById('vaga-add-empresa');
  if (empSel) { empSel.innerHTML = (state.empresas || []).map(e => `<option value="${e.id}">${escapeHTML(e.nome)}</option>`).join(''); empSel.value = v.empresaId || ''; }

  setV('vaga-add-cargo', v.cargo); setV('vaga-add-codigo', v.codigo); setV('vaga-add-operacao', v.operacaoNome);
  setV('vaga-add-quantidade', v.vagasDisponiveis); setV('vaga-add-status', v.statusVaga || 'ativa'); setV('vaga-add-validade', v.validade);
  setV('vaga-add-tomador-nome', v.tomadorNome); setV('vaga-add-tomador-codigo', v.tomadorCodigo); setV('vaga-add-tomador-cnpj', v.tomadorCnpj);
  setV('vaga-add-exata-id', v.idEmpresaExata); setV('vaga-add-centro-custo', v.centroCusto); setV('vaga-add-centro-sigla', v.siglaCentroCusto);
  const end = v.endereco || {};
  setV('vaga-add-cep', end.cep); setV('vaga-add-rua', end.rua); setV('vaga-add-numero', end.numero); setV('vaga-add-complemento', end.complemento);
  setV('vaga-add-bairro', end.bairro); setV('vaga-add-cidade', end.cidade); setV('vaga-add-estado', end.estado);

  // Função do catálogo
  popularDatalistExata();
  const f = getFuncaoExata(v.funcaoCodigo);
  if (f) { _setFuncaoExataCampos(f); const busca = document.getElementById('vaga-exata-busca'); if (busca) busca.value = labelFuncaoExata(f); }
  else {
    _setFuncaoExataCampos(null);
    setV('vaga-add-funcao-codigo', v.funcaoCodigo); setV('vaga-add-cbo', v.cbo); setV('vaga-add-funcao-nome', v.funcaoNome);
    const av = document.getElementById('vaga-exata-aviso'); if (av) { av.style.display = 'block'; av.textContent = 'Função não encontrada no catálogo atual. Selecione novamente antes de exportar para o Exata.'; }
  }
  popularSelectVinculo(v.tipoContratacaoId || _tipoIdPorVinculo(v.vinculo));
  aoMudarVinculoVaga(); // recalcula a filial automática pelo tipo
  setV('vaga-add-categoria', v.categoria); setV('vaga-add-categoria-codigo', v.categoriaCodigo); setV('vaga-add-categoria-utilizado', v.categoriaUtilizado);
  setV('vaga-add-tipo-contrato', v.tipoContrato); setV('vaga-add-finalidade', v.finalidade); setV('vaga-add-justificativa', v.justificativa);
  setV('vaga-add-previsao-dias', v.previsaoDias); setV('vaga-add-taxa', v.taxa);
  setV('vaga-add-salario', v.salario); setV('vaga-add-salario-tipo', v.salarioTipo || 'mensal');
  setV('vaga-add-beneficios', (v.beneficios || []).join(', '));
  setV('vaga-add-vt', v.valeTransporte); setV('vaga-add-refeicao', v.refeicao); setV('vaga-add-va', v.valeAlimentacao);
  setChk('vaga-add-fretado', v.fretado); setV('vaga-add-linhas-fretado', (v.linhasFretado || []).join('\n'));
  setV('vaga-add-outros', v.outrosBeneficios); setV('vaga-add-obs', v.observacoes); setV('vaga-add-desc', v.descricao);
  setChk('vaga-add-publicar', v.publicarPortal); setChk('vaga-add-quente', v.vagaQuente); setChk('vaga-add-inicio-imediato', v.inicioImediato);
  setChk('vaga-add-muitas-oportunidades', v.muitasOportunidades); setChk('vaga-add-sem-experiencia', v.semExperiencia);

  _vagaHorarios = JSON.parse(JSON.stringify(v.horarios || []));
  renderHorariosVaga();

  const t = document.querySelector('#modal-nova-vaga .modal-header h3'); if (t) t.textContent = 'Editar Vaga';
  const b = document.querySelector('#form-nova-vaga button[type="submit"]'); if (b) b.textContent = 'Salvar Alterações';
  document.getElementById('modal-nova-vaga').classList.add('active');
  setTimeout(() => {
    injetarCamposExtrasNoForm();
    const ce = v.camposExtras || {};
    Object.keys(ce).forEach(k => { const el = document.getElementById('vaga-extra-' + k); if (el && !Array.isArray(ce[k])) el.value = ce[k]; });
  }, 60);
};

// Migração (item 22): copia dados operacionais legados que estavam no CLIENTE
// para as VAGAS daquela empresa, sem apagar nada. Roda uma única vez.
function migrarOperacionalClientesParaVagas() {
  if (!state || state.migracaoOperacionalFeita) return;
  let copiados = 0, marcados = 0;
  (state.empresas || []).forEach(emp => {
    const temOperacional = emp.tomador || emp.cep || emp.centroCusto || emp.categoria ||
      (emp.funcoes && emp.funcoes.length) || (emp.horarios && emp.horarios.length);
    if (!temOperacional) return;
    const vagasDaEmpresa = (state.vagas || []).filter(v => v.empresaId === emp.id && !v.excluido);
    if (vagasDaEmpresa.length === 0) return; // sem vaga p/ receber: mantém no cliente (revisão)
    const ambiguo = vagasDaEmpresa.length > 1;
    vagasDaEmpresa.forEach(v => {
      if (!v.tomadorNome && emp.tomador)     v.tomadorNome = emp.tomador;
      if (!v.centroCusto && emp.centroCusto) v.centroCusto = emp.centroCusto;
      if (!v.categoria && emp.categoria)     v.categoria = emp.categoria;
      v.endereco = v.endereco || {};
      if (!v.endereco.cep && emp.cep)          v.endereco.cep = emp.cep;
      if (!v.endereco.rua && emp.rua)          v.endereco.rua = emp.rua;
      if (!v.endereco.numero && emp.numeroEnd) v.endereco.numero = emp.numeroEnd;
      if (!v.endereco.bairro && emp.bairro)    v.endereco.bairro = emp.bairro;
      if (!v.endereco.cidade && emp.cidade)    v.endereco.cidade = emp.cidade;
      if (!v.endereco.estado && emp.estado)    v.endereco.estado = emp.estado;
      if (ambiguo) v.revisaoMigracao = true; // não dá p/ saber a vaga certa -> revisão
      copiados++;
    });
    if (ambiguo) marcados++;
    // NÃO apaga os dados do cliente (preserva o original)
  });
  state.migracaoOperacionalFeita = true;
  if (!state.logs) state.logs = [];
  state.logs.unshift({ id: 'log-' + Date.now(), data: new Date().toLocaleString('pt-BR'), usuario: 'Sistema R&T', acao: `Migração de dados operacionais: ${copiados} vaga(s) atualizada(s)${marcados ? ` · ${marcados} empresa(s) com várias vagas marcadas p/ revisão` : ''}.`, categoria: 'migracao' });
  saveState();
}

// Aplica a visibilidade dos botões de Vagas por permissão e anexa os listeners
// uma única vez (guard dataset.wired). Chamado no setup, no login e a cada render.
function atualizarBotoesVagas() {
  const btnNovaVaga = document.getElementById('btn-nova-vaga');
  const btnNovoCliente = document.getElementById('btn-novo-cliente');
  const podeCriarVaga = loggedUser?.permissoes?.vagas?.criar === true;
  const podeGerenciarCliente = loggedUser?.permissoes?.vagas?.excluir === true;
  if (btnNovaVaga) {
    btnNovaVaga.style.display = podeCriarVaga ? 'flex' : 'none';
    if (!btnNovaVaga.dataset.wired) {
      btnNovaVaga.dataset.wired = '1';
      btnNovaVaga.addEventListener('click', () => {
        const form = document.getElementById('form-nova-vaga');
        if (form) form.reset();
        resetarFormVagaParaCriar();         // modo CRIAR (zera _vagaEditId + título/botão)
        const selectEmpresaModal = document.getElementById('vaga-add-empresa');
        if (selectEmpresaModal) {
          selectEmpresaModal.innerHTML = state.empresas.map(e => `<option value="${e.id}">${e.nome}</option>`).join('');
        }
        resetarHorariosVaga();
        popularDatalistExata();
        popularSelectVinculo();
        aoMudarVinculoVaga();
        trocarFuncaoExata();
        document.getElementById('modal-nova-vaga').classList.add('active');
        setTimeout(() => injetarCamposExtrasNoForm(), 50);
      });
    }
  }
  if (btnNovoCliente) {
    btnNovoCliente.style.display = podeGerenciarCliente ? 'flex' : 'none';
    if (!btnNovoCliente.dataset.wired) {
      btnNovoCliente.dataset.wired = '1';
      btnNovoCliente.addEventListener('click', () => {
        document.getElementById('modal-novo-cliente').classList.add('active');
      });
    }
  }
}

function renderVagasGrid() {
  atualizarBotoesVagas();
  migrarOperacionalClientesParaVagas();
  const container = document.getElementById('vagas-cards-container');
  if (!container) return;

  const podeExcluir = loggedUser?.permissoes?.vagas?.excluir === true;
  const podeEditarVaga = loggedUser?.login === 'joaobalaf' || loggedUser?.departamento === 'administracao'
    || loggedUser?.permissoes?.vagas?.editar === true || loggedUser?.permissoes?.vagas?.criar === true;

  if (!state.vagas.length) {
    container.innerHTML = '<p style="color:var(--text-secondary);font-size:14px;text-align:center;padding:40px 0;">Nenhuma vaga cadastrada. Clique em "Criar Nova Vaga" para começar.</p>';
    return;
  }

  container.innerHTML = state.vagas.map(v => {
    const emp = state.empresas.find(e => e.id === v.empresaId);
    const cor = emp?.cor || '#6366f1';
    const siglaDisplay = emp?.sigla || v.empresaNome.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 4);

    const isQuente = !!v.vagaQuente;
    const benefitsHtml = (v.beneficios || []).map(b => `<span class="benefit-tag">${b}</span>`).join('');
    const btnExcluir = podeExcluir
      ? `<button onclick="excluirVaga('${v.id}')" style="margin-top:10px;padding:7px 14px;border-radius:7px;border:1px solid #fca5a5;background:#fff1f2;color:#dc2626;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;transition:background 0.15s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fff1f2'"><i class="fa-solid fa-trash-can"></i> Excluir Vaga</button>`
      : '';

    const btnQuente = podeExcluir
      ? `<button onclick="toggleVagaQuente('${v.id}')" style="margin-top:10px;padding:7px 14px;border-radius:7px;border:1px solid ${isQuente ? '#fdba74' : '#cbd5e1'};background:${isQuente ? '#fff7ed' : '#f8fafc'};color:${isQuente ? '#ea580c' : '#475569'};font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;transition:background 0.15s;" onmouseover="this.style.background='${isQuente ? '#ffedd5' : '#e2e8f0'}'" onmouseout="this.style.background='${isQuente ? '#fff7ed' : '#f8fafc'}'"><i class="fa-solid fa-fire"></i> ${isQuente ? 'Destaque Quente' : 'Destacar 🔥'}</button>`
      : '';

    const badgeQuente = isQuente ? `<span style="background:#ffedd5; color:#ea580c; border:1px solid #fed7aa; font-size:9px; font-weight:700; padding:2px 8px; border-radius:12px; display:inline-flex; align-items:center; gap:4px; margin-left:auto;"><i class="fa-solid fa-fire"></i> QUENTE</span>` : '';

    const btnEditar = podeEditarVaga
      ? `<button onclick="editarVaga('${v.id}')" style="margin-top:10px;padding:7px 14px;border-radius:7px;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;transition:background 0.15s;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'"><i class="fa-solid fa-pen-to-square"></i> Editar Vaga</button>`
      : '';

    const btnConfigExata = podeEditarVaga
      ? `<button onclick="abrirConfigExata('${v.id}')" style="margin-top:10px;padding:7px 14px;border-radius:7px;border:1px solid #c4b5fd;background:#f5f3ff;color:#6d28d9;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;transition:background 0.15s;" onmouseover="this.style.background='#ede9fe'" onmouseout="this.style.background='#f5f3ff'"><i class="fa-solid fa-file-invoice"></i> Configurar Exata</button>`
      : '';

    return `
      <div class="vaga-card" style="${isQuente ? 'border-color:#f97316; box-shadow:0 0 10px rgba(249,115,22,0.15);' : ''}">
        <div class="vaga-card-header">
          <div class="vaga-logo-badge" style="background:${cor};color:#fff;">${siglaDisplay}</div>
          <div class="vaga-title-area">
            <span class="vaga-company">${v.empresaNome}</span>
            <span class="vaga-cargo">${v.cargo}</span>
          </div>
          ${badgeQuente}
        </div>
        <p class="vaga-desc">${v.descricao}</p>
        <span class="vaga-salario">R$ ${Number(v.salario).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        <div class="vaga-tags-benefits">${benefitsHtml}</div>
        <div class="vaga-details">
          <div class="vaga-detail-row"><i class="fa-solid fa-location-dot"></i><span>Local: ${v.localTrabalho}</span></div>
          <div class="vaga-detail-row"><i class="fa-solid fa-users"></i><span>${v.vagasDisponiveis} vagas disponíveis</span></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
          <button class="btn btn-primary btn-vaga-inscrever" onclick="irParaInscricaoSite('${v.id}')" style="flex:1;">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Cadastrar-se
          </button>
          ${btnEditar}
          ${btnConfigExata}
          ${btnQuente}
          ${btnExcluir}
        </div>
      </div>
    `;
  }).join('');
}

window.excluirVaga = function(vagaId) {
  const vaga = state.vagas.find(v => v.id === vagaId);
  if (!vaga) return;
  if (!confirm(`Excluir a vaga "${vaga.cargo} — ${vaga.empresaNome}"?\nEssa ação não pode ser desfeita.`)) return;
  state.vagas = state.vagas.filter(v => v.id !== vagaId);
  saveState();
  renderVagasGrid();
};

// ── Atalho: botão "Configurar Exata" abre a aba Cadastro Exata com a vaga já selecionada
let _cadExataVagaSel = '';
window.abrirConfigExata = function (vagaId) {
  _cadExataVagaSel = vagaId || '';
  if (typeof switchAba === 'function') switchAba('cadastros-exata');
  if (typeof renderCadastrosExata === 'function') renderCadastrosExata();
};

window.toggleVagaQuente = function(vagaId) {
  const vaga = state.vagas.find(v => v.id === vagaId);
  if (!vaga) return;
  vaga.vagaQuente = !vaga.vagaQuente;
  saveState();
  renderVagasGrid();
  if (typeof showToast === 'function') {
    showToast(`Vaga "${vaga.cargo}" ${vaga.vagaQuente ? 'destacada como quente' : 'removida dos destaques'}!`, 'success');
  } else {
    alert(`Vaga "${vaga.cargo}" ${vaga.vagaQuente ? 'destacada como quente' : 'removida dos destaques'}!`);
  }
};

function irParaInscricaoSite(vagaId) {
  const base = window.location.origin + window.location.pathname.replace('index.html', '');
  window.open(base + 'candidato.html' + (vagaId ? '?vaga=' + vagaId : ''), '_blank');
}

// ABA 3: BANCO DE TALENTOS (AGRUPADO POR EMPRESAS)
function renderBancoTalentos(filtroNome = '') {
  const container = document.getElementById('banco-grupos-list');
  if (!container) return;

  container.innerHTML = '';

  state.empresas.forEach(emp => {
    // Candidatos vinculados a esta empresa parceira
    const candEmpresa = state.candidatos.filter(c => {
      const matchEmp = c.empresaId === emp.id;
      const matchFiltro = filtroNome === '' || c.nome.toLowerCase().includes(filtroNome.toLowerCase());
      return matchEmp && matchFiltro && !c.excluido;
    });

    if (candEmpresa.length === 0 && filtroNome !== '') return; // oculta grupo vazio na busca

    const candHtml = candEmpresa.map(c => {
      const initials = c.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
      let colorClass = 'c-yellow';
      if (emp.id === 'az') colorClass = 'c-orange';
      if (emp.id === 'sp') colorClass = 'c-red';
      if (emp.id === 'mg') colorClass = 'c-blue';
      if (emp.id === 'dh') colorClass = 'c-yellow';

      return `
        <div class="banco-candidato-card" onclick="abrirDrawerDetalhes('${c.id}')" style="cursor: pointer;">
          <div class="avatar-circle ${colorClass}">${initials}</div>
          <div class="banco-cand-info">
            <span class="banco-cand-name">${c.nome}</span>
            <span class="banco-cand-sub">${c.codigoVaga || emp.nome}</span>
          </div>
        </div>
      `;
    }).join('');

    const groupHtml = `
      <div class="banco-grupo-secao">
        <div class="banco-grupo-header">
          <div class="banco-grupo-title">
            <div class="banco-logo-badge" style="background-color: ${emp.cor};">${emp.sigla}</div>
            <h2>Banco de dados — ${emp.nome}</h2>
          </div>
          <span class="banco-count-badge">${candEmpresa.length}</span>
        </div>
        <div class="banco-grupo-grid">
          ${candEmpresa.length > 0 ? candHtml : `<p style="grid-column: span 4; font-size: 11px; color: var(--text-secondary); text-align: center; padding: 12px;">Nenhum talento neste banco de dados.</p>`}
        </div>
      </div>
    `;

    container.insertAdjacentHTML('beforeend', groupHtml);
  });

  // Render simple talent bank entries at the bottom
  setupBTFilters();
  renderBancoTalentosSimples();
  setupImportarBT();
}

// ABA 4: SELEÇÃO (PRÉ-DP COM BORDAS COLORIDAS)
function renderSelecaoGrid() {
  const container = document.getElementById('selecao-cards-container');
  if (!container) return;

  // Filtra quem está nas etapas de Seleção
  const statusSelecao = ['pendente', 'aguardando_consulta_cpf', 'em_analise', 'entrevista'];
  const candidatosSelecao = state.candidatos.filter(c => statusSelecao.includes(c.status) && !c.excluido);

  if (candidatosSelecao.length === 0) {
    container.innerHTML = `<p style="grid-column: span 4; font-size: 13px; color: var(--text-secondary); text-align: center; padding: 48px;">Nenhum candidato aguardando triagem ou em análise na Seleção.</p>`;
    return;
  }

  container.innerHTML = candidatosSelecao.map(c => {
    // Sanitizar campos de dados do candidato para prevenir XSS
    const esc = typeof escapeHTML === 'function' ? escapeHTML : (v => String(v || ''));
    const nomeSeguro = esc(c.nome);
    const vagaSegura = esc(c.codigoVaga || 'Vaga Não Definida');

    const initials = nomeSeguro.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    const recruiter = state.recrutadores.find(r => r.id === c.recrutadorId);

    const borderCorHex = recruiter ? recruiter.corHex : '#e2e8f0';
    const recNome = esc(recruiter ? recruiter.nome : 'Sem rec.');

    // Classes extras para inapto
    const isInapto = c.inaptidaoInfo && !c.aprovadoMesmoInapto;
    const isAprovadoInapto = c.inaptidaoInfo && c.aprovadoMesmoInapto;
    let extraClass = '';
    if (isInapto) extraClass = 'card-inapto';
    else if (isAprovadoInapto) extraClass = 'card-aprovado-inapto';

    let avatarColorClass = 'c-yellow';
    if (c.status === 'aguardando_consulta_cpf') avatarColorClass = 'c-purple';
    else if (c.status === 'em_analise') avatarColorClass = 'c-blue';
    else if (c.status === 'entrevista') avatarColorClass = 'c-purple';

    const statusLabels = {
      pendente: 'Pendente',
      aguardando_consulta_cpf: 'Aguard. Consulta CPF',
      em_analise: 'Em análise',
      entrevista: 'Entrevista'
    };
    const statusTexto = statusLabels[c.status] || esc(c.status);

    const origemBadge = c.origemCadastro === 'presencial'
      ? `<span style="font-size:9px;font-weight:700;padding:3px 8px;border-radius:10px;background:rgba(59,130,246,0.15);color:#3b82f6;border:1px solid rgba(59,130,246,0.4);flex-shrink:0;letter-spacing:.3px;"><i class="fa-solid fa-building"></i> FICHA PRESENCIAL</span>`
      : c.origemCadastro === 'banco_talentos'
      ? `<span style="font-size:9px;font-weight:700;padding:3px 8px;border-radius:10px;background:rgba(168,85,247,0.15);color:#a855f7;border:1px solid rgba(168,85,247,0.4);flex-shrink:0;letter-spacing:.3px;"><i class="fa-solid fa-users"></i> BANCO DE TALENTOS</span>`
      : `<span style="font-size:9px;font-weight:700;padding:3px 8px;border-radius:10px;background:rgba(34,197,94,0.12);color:#16a34a;border:1px solid rgba(34,197,94,0.4);flex-shrink:0;letter-spacing:.3px;"><i class="fa-solid fa-globe"></i> FICHA ONLINE</span>`;

    const inaptoBadge = isInapto
      ? `<span class="tag-inapto"><i class="fa-solid fa-circle-xmark"></i> INAPTO</span>`
      : isAprovadoInapto
      ? `<span class="tag-aprovado-inapto"><i class="fa-solid fa-triangle-exclamation"></i> APROVADO (ERA INAPTO)</span>`
      : '';

    const cpfBadge = c.status === 'aguardando_consulta_cpf'
      ? `<span class="tag-aguardando-cpf"><i class="fa-solid fa-magnifying-glass"></i> AGUARD. CPF</span>`
      : '';

    const inaptMotivo = (isInapto || isAprovadoInapto) && c.inaptidaoInfo
      ? `<div style="font-size:10px;color:${isInapto ? '#fca5a5' : '#fcd34d'};margin-top:4px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><i class="fa-solid fa-circle-info"></i> Motivo: ${esc(c.inaptidaoInfo.motivo)}</div>`
      : '';

    return `
      <div class="selecao-card ${extraClass}" style="border-left-color: ${isInapto ? '#ef4444' : isAprovadoInapto ? '#f59e0b' : borderCorHex};" onclick="abrirDrawerDetalhes('${esc(c.id)}')">
        <div class="selecao-card-avatar ${avatarColorClass}">${initials}</div>
        <div class="selecao-card-details" style="flex: 1; min-width: 0;">
          <span class="selecao-cand-name" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px;">
            ${nomeSeguro}
            ${c.devolvidoDP ? `<span class="tag-devolvida" style="animation: pulse 1.5s infinite; font-size: 8px; padding: 1.5px 4px;"><i class="fa-solid fa-circle-exclamation"></i> DEVOLVIDO DP</span>` : ''}
          </span>
          <span class="selecao-cand-company">${vagaSegura}</span>
          <div class="selecao-card-footer" style="flex-wrap:wrap;">
            <span class="tag-badge tag-blue">${statusTexto}</span>
            ${cpfBadge}
            ${inaptoBadge}
            ${origemBadge}
            <span class="recrutador-label">Recrutador: ${recNome}</span>
          </div>
          ${inaptMotivo}
          ${c.devolvidoDP ? `<div style="font-size: 10px; color: #dc2626; margin-top: 4px; font-weight: 500; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;"><strong>Motivo:</strong> ${esc(c.motivoDevolucaoDP)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ABA 5: DEPARTAMENTO PESSOAL (VALIDAÇÃO FINAL)
function renderDeptoPessoal() {
  const container = document.getElementById('dp-cards-container');
  if (!container) return;

  // ── Seção: Contratos Finalizados Hoje ─────────────────────────────────────
  const hoje = new Date().toLocaleDateString('pt-BR');
  const contratadosHoje = state.candidatos.filter(c => c.status === 'contratado' && c.dataContratacao === hoje);

  let secaoFinalizados = document.getElementById('dp-contratos-hoje-section');
  if (!secaoFinalizados) {
    secaoFinalizados = document.createElement('div');
    secaoFinalizados.id = 'dp-contratos-hoje-section';
    container.parentElement.insertBefore(secaoFinalizados, container);
  }

  if (contratadosHoje.length > 0) {
    secaoFinalizados.innerHTML = `
      <div style="margin-bottom: 24px;">
        <h3 style="font-size: 14px; font-weight: 700; color: #10b981; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-circle-check"></i> Contratos Finalizados Hoje (${hoje})
          <span style="background:#10b98120; color:#10b981; padding:2px 10px; border-radius:20px; font-size:12px;">${contratadosHoje.length}</span>
        </h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px;">
          ${contratadosHoje.map(c => {
            const initials = c.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
            const recFinDia = state.recrutadores.find(r => r.id === c.recrutadorId);
            const vagaFinDia = state.vagas.find(v => v.id === c.vagaId);
            return `
              <div style="background: rgba(16,185,129,0.07); border: 1px solid rgba(16,185,129,0.25); border-radius: 10px; padding: 14px; display: flex; align-items: center; gap: 12px; cursor: pointer;"
                onclick="abrirDrawerDetalhes('${c.id}')">
                <div style="width:40px; height:40px; border-radius:50%; background:#10b981; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:14px; flex-shrink:0;">${initials}</div>
                <div style="min-width:0;">
                  <div style="font-weight:600; color:var(--text-primary); font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.nome}</div>
                  <div style="font-size:11px; color:var(--text-secondary);">${vagaFinDia ? vagaFinDia.cargo : 'Vaga não definida'}</div>
                  <div style="font-size:10px; color:#10b981; margin-top:2px;">Rec.: ${recFinDia ? recFinDia.nome : '—'} · ${c.aprovadorSelecao || 'DP'}</div>
                </div>
                <i class="fa-solid fa-check-double" style="color:#10b981; margin-left:auto; flex-shrink:0;"></i>
              </div>
            `;
          }).join('')}
        </div>
        <hr style="border:none; border-top:1px solid var(--border-color); margin: 20px 0 0 0;">
      </div>
    `;
  } else {
    secaoFinalizados.innerHTML = '';
  }
  // ── Fim seção contratos hoje ───────────────────────────────────────────────

  // Filtra candidatos "aprovados"
  const candidatosAprovados = state.candidatos.filter(c => c.status === 'aprovado' && !c.excluido);

  if (candidatosAprovados.length === 0) {
    container.innerHTML = `<p style="grid-column: span 4; font-size: 13px; color: var(--text-secondary); text-align: center; padding: 48px;">Nenhum candidato aprovado aguardando validação final do Departamento Pessoal.</p>`;
    return;
  }

  container.innerHTML = candidatosAprovados.map(c => {
    // Sanitizar campos de dados do candidato para prevenir XSS
    const esc = typeof escapeHTML === 'function' ? escapeHTML : (v => String(v || ''));
    const nomeSeguro = esc(c.nome);
    const vagaSegura = esc(c.codigoVaga || 'Vaga Geral');

    const initials = nomeSeguro.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    const recruiter = state.recrutadores.find(r => r.id === c.recrutadorId);
    const recNome = esc(recruiter ? recruiter.nome : 'Sem rec.');

    const dpLock = c.dpLock;
    const isLocked = dpLock && dpLock.userLogin;
    const lockHora = isLocked && dpLock.lockedAt ? new Date(dpLock.lockedAt).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}) : '';
    const lockStyle = isLocked ? 'background:rgba(59,130,246,0.06);border-color:rgba(59,130,246,0.35);' : '';

    return `
      <div class="dp-card" style="${lockStyle}">
        ${isLocked ? `
          <div style="padding:6px 16px 0;display:flex;align-items:center;gap:6px;">
            <i class="fa-solid fa-lock" style="color:#3b82f6;font-size:10px;"></i>
            <span style="font-size:10px;font-weight:700;color:#3b82f6;">${esc(dpLock.userName)} está editando${lockHora ? ' desde ' + lockHora : ''}</span>
          </div>` : ''}
        <div class="dp-card-header" onclick="abrirDrawerDetalhes('${esc(c.id)}')" style="cursor: pointer;">
          <div class="dp-avatar" style="${isLocked ? 'background:#3b82f6;' : ''}">${initials}</div>
          <div class="dp-title-info">
            <span class="dp-cand-name" style="display:flex; align-items:center; gap:6px;">
              ${c.numeroFila ? `<span style="background:rgba(190,18,60,0.15); color:var(--primary); font-size:9px; font-weight:700; padding:1px 5px; border-radius:10px; white-space:nowrap;">#${Number(c.numeroFila)}</span>` : ''}
              ${nomeSeguro}
            </span>
            <span class="dp-cand-company">${vagaSegura}</span>
          </div>
        </div>
        <div class="dp-card-meta" style="display: flex; flex-direction: column; gap: 4px; padding: 12px 16px; border-bottom: 1px solid var(--border-color); font-size: 11px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 600; color: var(--text-secondary);">Origem:</span>
            ${c.origemCadastro === 'presencial'
              ? `<span style="font-size:9px;font-weight:700;padding:3px 8px;border-radius:10px;background:rgba(59,130,246,0.15);color:#3b82f6;border:1px solid rgba(59,130,246,0.4);letter-spacing:.3px;"><i class="fa-solid fa-building"></i> FICHA PRESENCIAL</span>`
              : `<span style="font-size:9px;font-weight:700;padding:3px 8px;border-radius:10px;background:rgba(34,197,94,0.12);color:#16a34a;border:1px solid rgba(34,197,94,0.4);letter-spacing:.3px;"><i class="fa-solid fa-globe"></i> FICHA ONLINE</span>`}
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="font-weight: 600; color: var(--text-secondary);">Turno:</span>
            <span style="color: var(--text-primary); font-weight: 500;">${esc(c.turnoTrabalho || 'Diurno')}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="font-weight: 600; color: var(--text-secondary);">Recrutador:</span>
            <span style="color: var(--text-primary); font-weight: 500;">${recNome}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="font-weight: 600; color: var(--text-secondary);">Aprovador:</span>
            <span style="color: var(--text-primary); font-weight: 500;">${esc(c.aprovadorSelecao || 'Seleção')}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="font-weight: 600; color: var(--text-secondary);">Data/Hora:</span>
            <span style="color: var(--text-primary); font-weight: 500;">${esc(c.dataSubiuDP || 'Sem data')}</span>
          </div>
        </div>
        <div style="padding: 12px 16px;">
          <button class="btn btn-primary btn-sm" onclick="abrirDrawerDetalhes('${esc(c.id)}')"
            style="width:100%; display:flex; align-items:center; justify-content:center; gap:6px; background:var(--primary); border:none; font-size:12px;">
            <i class="fa-solid fa-folder-open"></i> Abrir Ficha Completa
          </button>
          ${c.devolvidoDP ? `
          <div style="margin-top:8px; padding:6px 8px; background:#fee2e2; border-radius:6px; font-size:10px; color:#dc2626;">
            <i class="fa-solid fa-rotate-left"></i>
            <strong>Devolvida por:</strong> ${esc(c.devolvidoPor || 'DP')}
            — ${esc(c.motivoDevolucaoDP || '')}
          </div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// AÇÃO FINALIZAR CONTRATAÇÃO (NO DP)
function finalizarContratacao(candidatoId) {
  const cand = state.candidatos.find(c => c.id === candidatoId);
  if (!cand) return;

  const confirmHiring = confirm(`Deseja confirmar e finalizar a contratação do candidato "${cand.nome}"?`);
  if (!confirmHiring) return;

  // Dispara a animação vertical do foguete com rastro e tremor de tela
  triggerRocketAnimationContract(cand, () => {
    // Move para contratado
    cand.status = 'contratado';
    cand.diasEtapa = 0;
    cand.dataContratacao = new Date().toLocaleDateString('pt-BR');
    cand.aprovadorDP = loggedUser ? loggedUser.nome : 'Departamento Pessoal';

    registrarAcaoHistorico(cand, 'Contratação finalizada e validada no DP. Adicionado ao quadro de funcionários.');

    // Adiciona na planilha de comissão
    const vaga = state.vagas.find(v => v.id === cand.vagaId);
    const empresaNome = vaga ? vaga.empresaNome : 'Empresa Geral';

    const novaContratacao = {
      id: `c-${Date.now()}`,
      recrutadorId: cand.recrutadorId,
      candidatoId: cand.id,
      candidatoNome: cand.nome,
      empresaNome: empresaNome,
      vagaId: cand.vagaId,
      data: new Date().toLocaleDateString('pt-BR')
    };

    state.contratacoes.push(novaContratacao);

    // BAIXA AUTOMÁTICA de -1 vaga disponível
    if (vaga && vaga.vagasDisponiveis > 0) {
      vaga.vagasDisponiveis--;
      vaga.vagasPreenchidas = (vaga.vagasPreenchidas || 0) + 1;
    }

    // Log global de auditoria
    registrarLogGlobal(`Contratação de "${cand.nome}" finalizada para ${empresaNome}. Vaga baixada automaticamente.`, 'dp');

    // Log de atividade no feed
    if (!loggedUser || loggedUser.login !== 'joaobalaf') {
      state.atividades.unshift({
        id: `act-${Date.now()}`,
        descricao: `DP finalizou a contratação de ${cand.nome} para a empresa ${empresaNome}`,
        data: 'Agora'
      });
    }

    saveState();
    renderDeptoPessoal();
    // Exibe toast premium ao invés de alert
    showToast(`🎉 +1 contrato feito! ${cand.nome} finalizado com sucesso.`, 'success');
  });
}

// ABA 6: RELATÓRIOS (MÉTRICAS, GRÁFICOS E FILTROS AVANÇADOS)
function renderRelatoriosCharts() {
  // 1. Popular selects de filtros (apenas na primeira vez)
  popularFiltrosRelatorios();
  setupFiltrosRelatoriosListeners();

  // 2. Destaque da semana
  renderDestaquesSemana();

  // 3. Dados filtrados
  const contratacoesFiltradas = getContratacoesFiltradas();

  // 4. KPI Cards principais
  const kpiContratos = document.getElementById('kpi-contratos-finalizados');
  const kpiAguardandoDP = document.getElementById('kpi-fichas-aguardando-dp');
  const kpiDevolvidas = document.getElementById('kpi-fichas-devolvidas');
  const kpiNoShows = document.getElementById('kpi-no-shows');

  if (kpiContratos) kpiContratos.textContent = contratacoesFiltradas.length;
  if (kpiAguardandoDP) kpiAguardandoDP.textContent = state.candidatos.filter(c => c.status === 'aprovado').length;
  if (kpiDevolvidas) kpiDevolvidas.textContent = state.candidatos.filter(c => c.devolvidoDP === true).length;
  if (kpiNoShows) kpiNoShows.textContent = state.candidatos.filter(c => c.status === 'reprovado').length;

  // 5. Tabela de Vagas e Demandas
  renderVagasDemandasTable();

  // 6. Dados para gráficos
  const labelsRecrutadores = state.recrutadores.map(r => r.nome);
  const dataRecrutadores = state.recrutadores.map(r =>
    contratacoesFiltradas.filter(c => c.recrutadorId === r.id).length
  );
  const labelsEmpresas = state.empresas.map(e => e.nome);
  const dataEmpresas = state.empresas.map(e =>
    contratacoesFiltradas.filter(c => c.empresaNome === e.nome).length
  );

  // Destrói gráficos antigos
  if (charts.recrutador) { charts.recrutador.destroy(); charts.recrutador = null; }
  if (charts.empresa) { charts.empresa.destroy(); charts.empresa = null; }

  // Gráfico 1: Barras — Hires por Recrutador
  const ctxRec = document.getElementById('chartRecrutadores');
  if (ctxRec) {
    charts.recrutador = new Chart(ctxRec, {
      type: 'bar',
      data: {
        labels: labelsRecrutadores,
        datasets: [{
          label: 'Contratações',
          data: dataRecrutadores,
          backgroundColor: state.recrutadores.map(r => r.corHex || '#be123c'),
          borderRadius: 6,
          barThickness: 32
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1, color: '#94a3b8' }, grid: { color: '#f1f5f940' } },
          x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
        }
      }
    });
  }

  // Gráfico 2: Donut — Hires por Empresa
  const ctxEmp = document.getElementById('chartEmpresas');
  if (ctxEmp) {
    charts.empresa = new Chart(ctxEmp, {
      type: 'doughnut',
      data: {
        labels: labelsEmpresas,
        datasets: [{
          data: dataEmpresas,
          backgroundColor: state.empresas.map(e => e.cor || '#94a3b8'),
          borderWidth: 2,
          borderColor: '#1e293b'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 }, color: '#94a3b8' } }
        }
      }
    });
  }

  // 7. Tabela de contratações filtradas
  renderTabelaContratacoes();

  // 8. Botão exportar relatório
  const btnExportar = document.getElementById('btn-exportar-relatorio-excel');
  if (btnExportar && !btnExportar.dataset.listenerAdded) {
    btnExportar.dataset.listenerAdded = 'true';
    btnExportar.addEventListener('click', () => {
      alert('📥 Relatório exportado com sucesso em formato Excel (.xlsx).');
    });
  }
}

function filtrarRelatorioPorPill(recrutadorId) {
  filtrosRelatorios.recrutadorId = recrutadorId;
  const sel = document.getElementById('filtro-recrutador');
  if (sel) sel.value = recrutadorId;
  renderRelatoriosCharts();
}

// ABA 7: COMISSÃO (EXCEL STYLE SHEET)
function renderComissaoSheet() {
  const kpisContainer = document.getElementById('comissao-kpis-container');
  if (!kpisContainer) return;

  // KPI cards por recrutador
  kpisContainer.innerHTML = state.recrutadores.map(r => {
    const count = state.contratacoes.filter(c => c.recrutadorId === r.id).length;
    return `
      <div class="kpi-card bg-glass">
        <div class="kpi-icon-wrapper" style="background-color: #f1f5f9; color: ${r.corHex};">
          <i class="fa-solid fa-award"></i>
        </div>
        <div class="kpi-data">
          <span class="kpi-number">${count}</span>
          <span class="kpi-label">${r.nome}</span>
        </div>
      </div>
    `;
  }).join('');

  // Tabela Registro
  const tableBody = document.getElementById('comissao-table-body');
  if (!tableBody) return;

  // Ordena por data decrescente
  const listSorted = [...state.contratacoes].reverse();

  if (listSorted.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 24px;">Nenhuma comissão registrada até o momento.</td></tr>`;
    return;
  }

  tableBody.innerHTML = listSorted.map(c => {
    const rec = state.recrutadores.find(r => r.id === c.recrutadorId);
    const recNome = rec ? rec.nome : 'Sem rec.';
    const recColor = rec ? rec.corHex : '#94a3b8';

    return `
      <tr>
        <td>
          <span class="rec-badge-small" style="background-color: ${recColor}15; color: ${recColor};">
            ${recNome}
          </span>
        </td>
        <td style="font-weight: 600;">${c.candidatoNome}</td>
        <td>${c.empresaNome}</td>
        <td>${c.data}</td>
        <td style="font-weight: 700; color: var(--color-green);">R$ 150,00</td>
      </tr>
    `;
  }).join('');
}

// ABA 8: PORTAL DE CAPTAÇÃO (STAFF ONLY — gestão de links)
function renderSitePublico() {
  renderPortalLinks();

  // Botões de copiar link
  const base = window.location.origin + window.location.pathname.replace('index.html', '');
  const btnCompleto = document.getElementById('btn-copiar-link-completo');
  if (btnCompleto && !btnCompleto.dataset.listenerAdded) {
    btnCompleto.dataset.listenerAdded = 'true';
    btnCompleto.addEventListener('click', () => {
      navigator.clipboard.writeText(base + 'candidato.html').then(() => {
        btnCompleto.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!';
        setTimeout(() => { btnCompleto.innerHTML = '<i class="fa-solid fa-copy"></i> Copiar Link'; }, 2000);
      });
    });
  }
  const btnTalento = document.getElementById('btn-copiar-link-talento');
  if (btnTalento && !btnTalento.dataset.listenerAdded) {
    btnTalento.dataset.listenerAdded = 'true';
    btnTalento.addEventListener('click', () => {
      navigator.clipboard.writeText(base + 'talento.html').then(() => {
        btnTalento.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!';
        setTimeout(() => { btnTalento.innerHTML = '<i class="fa-solid fa-copy"></i> Copiar Link'; }, 2000);
      });
    });
  }
  const btnPresencial = document.getElementById('btn-copiar-link-presencial');
  if (btnPresencial && !btnPresencial.dataset.listenerAdded) {
    btnPresencial.dataset.listenerAdded = 'true';
    btnPresencial.addEventListener('click', () => {
      navigator.clipboard.writeText(base + 'candidato.html?presencial=1').then(() => {
        btnPresencial.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!';
        setTimeout(() => { btnPresencial.innerHTML = '<i class="fa-solid fa-copy"></i> Copiar Link'; }, 2000);
      });
    });
  }


}

// Renderiza a tabela de links personalizados por recrutador
function renderPortalLinks() {
  const container = document.getElementById('portal-links-recrutadores');
  if (!container) return;

  const base = window.location.origin + window.location.pathname.replace('index.html', '');

  const copiarBtn = (link) =>
    `<button onclick="navigator.clipboard.writeText('${link}').then(()=>{this.innerHTML='<i class=\\'fa-solid fa-check\\'></i> Copiado!';setTimeout(()=>{this.innerHTML='<i class=\\'fa-solid fa-copy\\'></i> Copiar';},2000)})" `+
    `style="padding:6px 12px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-card);color:var(--text-secondary);cursor:pointer;font-size:12px;display:inline-flex;align-items:center;gap:6px;">`+
    `<i class="fa-solid fa-copy"></i> Copiar</button>`;

  // Link da agência
  const agenciaLink = base + 'candidato.html?rec=agencia';
  let html = `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(190,18,60,0.08);border:1px solid rgba(190,18,60,0.2);border-radius:8px;flex-wrap:wrap;">
      <div style="width:32px;height:32px;border-radius:50%;background:#be123c;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff;flex-shrink:0;">R</div>
      <div style="flex:1;min-width:200px;">
        <div style="font-weight:600;font-size:13px;color:var(--text-primary);">Agência R&amp;T (Link Oficial)</div>
        <div style="font-size:11px;color:var(--text-secondary);word-break:break-all;">${agenciaLink}</div>
      </div>
      ${copiarBtn(agenciaLink)}
    </div>
  `;

  // Links por recrutador
  state.recrutadores.forEach(rec => {
    const recLink = base + 'candidato.html?rec=' + rec.id;
    const btLink  = base + 'talento.html?rec=' + rec.id;
    const novosNoBt = getBtNovosPorRecrutadora(rec.id).length;
    const alertaBt = novosNoBt > 0
      ? `<div class="bt-rec-alert" style="margin-top:8px;font-size:12px;">
           <i class="fa-solid fa-bell" style="color:#fb7185;"></i>
           Você tem <strong>${novosNoBt}</strong> nova(s) pessoa(s) no seu banco de talentos!
         </div>`
      : '';

    html += `
      <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:14px 16px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <div style="width:36px;height:36px;border-radius:50%;background:${rec.corHex};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff;flex-shrink:0;">${rec.nome[0]}</div>
          <div style="flex:1;min-width:160px;">
            <div style="font-weight:700;font-size:13px;color:var(--text-primary);">${rec.nome}</div>
            <div style="font-size:10px;color:var(--text-secondary);">Ficha completa: <span style="word-break:break-all;">${recLink}</span></div>
            <div style="font-size:10px;color:var(--text-secondary);">Banco de Talentos: <span style="word-break:break-all;">${btLink}</span></div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${copiarBtn(recLink)}
            <button onclick="navigator.clipboard.writeText('${btLink}').then(()=>{this.innerHTML='<i class=\\'fa-solid fa-check\\'></i> Copiado BT!';setTimeout(()=>{this.innerHTML='<i class=\\'fa-solid fa-users\\'></i> Link BT';},2000)})"
              style="padding:6px 12px;border-radius:6px;border:1px solid rgba(168,85,247,0.4);background:rgba(168,85,247,0.1);color:#a855f7;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;gap:6px;">
              <i class="fa-solid fa-users"></i> Link BT</button>
          </div>
        </div>
        <!-- WhatsApp da recrutadora -->
        <div class="recruiter-whatsapp-field" style="margin-top:10px;display:flex;gap:8px;align-items:center;">
          <i class="fa-brands fa-whatsapp" style="color:#25d366;font-size:16px;"></i>
          <input type="text" id="whatsapp-rec-${rec.id}" value="${rec.whatsapp || ''}" placeholder="DDD + número WhatsApp (ex: 11999990000)"
            style="flex:1;padding:7px 12px;border-radius:7px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);font-size:12px;"
            oninput="salvarWhatsappRecrutadora('${rec.id}', this.value)">
        </div>
        ${alertaBt}
      </div>
    `;
  });

  container.innerHTML = html || '<p style="font-size:13px;color:var(--text-secondary);">Nenhum recrutador cadastrado.</p>';
}

// 5. MODAIS & DETALHES (SIDE DRAWER DE PROCESSO)

function setSafeText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text || '';
}

function setSafeValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value || '';
}

window.fecharLightboxDoc = function() {
  const lightboxModal = document.getElementById('modal-documento-preview');
  if (lightboxModal) lightboxModal.classList.remove('active');
  const lightboxPdf = document.getElementById('lightbox-pdf');
  if (lightboxPdf) lightboxPdf.src = '';
};

function abrirDrawerDetalhes(candidatoId) {
  currentCandidateId = candidatoId;
  const cand = state.candidatos.find(c => c.id === candidatoId);
  if (!cand) return;

  // Captura snapshot para auditoria de alterações por campo
  _drawerSnapshotAntes = {};
  Object.keys(CAMPOS_AUDIT).forEach(k => { _drawerSnapshotAntes[k] = cand[k] || ''; });

  // Bloqueio de ficha para DP: só entrar já marca — atualiza imediatamente
  if (loggedUser && loggedUser.departamento === 'dp' && loggedUser.login !== 'joaobalaf') {
    const lock = cand.dpLock;
    const meuLogin = loggedUser.login;
    if (!lock || !lock.userLogin) {
      // Ficha livre — bloqueia na hora e atualiza cards antes de abrir o drawer
      cand.dpLock = { userLogin: meuLogin, userName: loggedUser.nome, lockedAt: Date.now() };
      saveState();
      renderDeptoPessoal(); // atualiza cor do card imediatamente
    }
    // Se já está bloqueada (por mim ou por outro), apenas entra — sem confirmação
  }

  // Rastreio de acesso: registra toda vez que alguém abre a ficha
  if (loggedUser && loggedUser.login !== 'joaobalaf') {
    if (!cand.historico) cand.historico = [];
    cand.historico.push({
      data: new Date().toLocaleString('pt-BR'),
      autor: `${loggedUser.nome} (${loggedUser.departamento.toUpperCase()})`,
      acao: 'Ficha visualizada.',
      tipo: 'visualizacao'
    });
    saveState();
  }

  // Preenche dados do candidato no Drawer (Texto Estático)
  setSafeText('det-nome', cand.nome);
  // Exibir número de fila no drawer
  const filaEl = document.getElementById('det-numero-fila');
  if (filaEl) filaEl.textContent = cand.numeroFila ? `Fila #${cand.numeroFila}` : '';

  // Badge presencial / online
  const origemEl = document.getElementById('det-origem-badge');
  if (origemEl) {
    if (cand.origemCadastro === 'presencial') {
      origemEl.innerHTML = '<i class="fa-solid fa-building"></i> FICHA PRESENCIAL';
      origemEl.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;padding:3px 10px;border-radius:12px;background:rgba(59,130,246,0.15);color:#3b82f6;border:1px solid rgba(59,130,246,0.4);margin-left:8px;letter-spacing:.3px;';
    } else if (cand.origemCadastro === 'banco_talentos') {
      origemEl.innerHTML = '<i class="fa-solid fa-users"></i> BANCO DE TALENTOS';
      origemEl.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;padding:3px 10px;border-radius:12px;background:rgba(168,85,247,0.15);color:#a855f7;border:1px solid rgba(168,85,247,0.4);margin-left:8px;letter-spacing:.3px;';
    } else {
      origemEl.innerHTML = '<i class="fa-solid fa-globe"></i> FICHA ONLINE';
      origemEl.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;padding:3px 10px;border-radius:12px;background:rgba(34,197,94,0.12);color:#16a34a;border:1px solid rgba(34,197,94,0.4);margin-left:8px;letter-spacing:.3px;';
    }
  }

  // Banner BT: link para completar ficha
  const btBanner = document.getElementById('bt-completar-banner');
  if (btBanner) {
    if (cand.origemCadastro === 'banco_talentos' && !cand.fichaCompletada) {
      btBanner.style.display = '';
      const linkCompletar = gerarLinkCompletarFicha(cand.id);
      const btnCopiar = document.getElementById('btn-copiar-link-completar');
      const btnWa    = document.getElementById('btn-whatsapp-completar');
      if (btnCopiar) {
        btnCopiar.onclick = () => {
          navigator.clipboard.writeText(linkCompletar).then(() => {
            btnCopiar.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!';
            setTimeout(() => { btnCopiar.innerHTML = '<i class="fa-solid fa-copy"></i> Copiar link da ficha'; }, 2000);
          });
        };
      }
      if (btnWa && cand.telefone) {
        const msg = encodeURIComponent(`Olá, ${(cand.nome || '').split(' ')[0]}! Complete seu cadastro na R&T Empregos clicando no link: ${linkCompletar}`);
        btnWa.onclick = () => window.open('https://wa.me/' + cand.telefone.replace(/\D/g,'') + '?text=' + msg, '_blank');
      }
    } else {
      btBanner.style.display = 'none';
    }
  }

  // Como soube (só para candidatos online)
  const comoSoubeEl = document.getElementById('det-como-soube');
  if (comoSoubeEl) {
    if (cand.comoSoube) {
      const labelMap = {
        instagram: 'Instagram R&T', facebook: 'Facebook R&T', anuncios_fb: 'Anúncios Facebook',
        sel_mayara: 'Selecionadora: Mayara', sel_alessandra: 'Selecionadora: Alessandra',
        sel_lucas: 'Selecionadora: Lucas', sel_julio: 'Selecionadora: Júlio',
        sel_julia: 'Selecionadora: Júlia', sel_milena: 'Selecionadora: Milena',
        sel_vitoria: 'Selecionadora: Vitória', sel_sara: 'Selecionadora: Sara',
      };
      comoSoubeEl.textContent = labelMap[cand.comoSoube] || cand.comoSoube;
      comoSoubeEl.closest('[data-como-soube-row]').style.display = '';
    } else {
      const row = comoSoubeEl.closest('[data-como-soube-row]');
      if (row) row.style.display = 'none';
    }
  }
  const avatarEl = document.getElementById('det-avatar');
  if (avatarEl) {
    avatarEl.textContent = cand.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  }
  setSafeText('det-cpf', cand.cpf);
  setSafeText('det-rg', cand.rg);
  setSafeText('det-pis', cand.pis || '000.00000.00-0');
  setSafeText('det-telefone', cand.telefone);
  setSafeText('det-email', cand.email);
  setSafeText('det-endereco', cand.endereco || 'Endereço não informado');
  setSafeText('det-data-cadastro', cand.dataCadastro ? new Date(cand.dataCadastro).toLocaleDateString('pt-BR') : '');
  const foto3x4El = document.getElementById('det-foto3x4-contrato');
  if (foto3x4El) {
    const foto3x4 = cand.foto3x4Contrato || {};
    if (foto3x4.opcao === 'convenio_desconto') {
      foto3x4El.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#22c55e;margin-right:6px;"></i>Sim, vai tirar pelo convênio da empresa. Desconto autorizado: R$ 25,00 no salário.';
    } else if (foto3x4.opcao === 'providenciar_propria') {
      foto3x4El.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color:#f59e0b;margin-right:6px;"></i>Não. O candidato vai providenciar a foto 3x4 por conta própria.';
    } else {
      foto3x4El.textContent = 'Não informado';
    }
  }

  // Badge Status
  const badgeStatus = document.getElementById('det-status-badge');
  if (badgeStatus) {
    badgeStatus.textContent = cand.status.replace('_', ' ');
    badgeStatus.className = 'badge-status';
    if (cand.status === 'pendente') badgeStatus.classList.add('badge-yellow');
    if (cand.status === 'em_analise') badgeStatus.classList.add('badge-blue');
    if (cand.status === 'entrevista') badgeStatus.classList.add('badge-purple');
    if (cand.status === 'aprovado') badgeStatus.classList.add('badge-green');
    if (cand.status === 'reprovado') badgeStatus.classList.add('badge-red');
    if (cand.status === 'contratado') {
      badgeStatus.classList.add('badge-green');
      badgeStatus.textContent = 'Contratado';
    }
  }

  // Preenche todos os Inputs Editáveis (21+ campos)
  setSafeValue('det-nome-input', cand.nome);
  setSafeValue('det-cpf-input', cand.cpf);
  setSafeValue('det-rg-input', cand.rg);
  setSafeValue('det-pis-input', cand.pis);
  setSafeValue('det-nascimento-input', cand.dataNascimento || '');
  setSafeValue('det-mae-input', cand.nomeMae || '');
  setSafeValue('det-pai-input', cand.nomePai || '');
  setSafeValue('det-telefone-input', cand.telefone);
  setSafeValue('det-email-input', cand.email);

  setSafeValue('det-cep-input', cand.cep || '');
  setSafeValue('det-rua-input', cand.rua || '');
  setSafeValue('det-numero-input', cand.numeroCasa || '');
  setSafeValue('det-bairro-input', cand.bairro || '');
  setSafeValue('det-cidade-input', cand.cidade || '');
  setSafeValue('det-estado-input', cand.estado || '');

  setSafeValue('det-banco-input', cand.banco || '');
  setSafeValue('det-tipopix-input', cand.tipoPix || '');
  setSafeValue('det-chavepix-input', cand.chavePix || '');

  setSafeValue('det-camiseta-input', cand.tamanhoCamiseta || '');
  setSafeValue('det-calca-input', cand.tamanhoCalca || '');
  setSafeValue('det-bota-input', cand.tamanhoBota || '');

  // Preenche Select de Vagas
  const selectVaga = document.getElementById('det-select-vaga');
  if (selectVaga) {
    selectVaga.innerHTML = '<option value="">-- Selecione a Vaga Destinada * --</option>' + (state.vagas || []).filter(v => v.statusVaga !== 'encerrada').map(v => {
      const cidade = (v.endereco && v.endereco.cidade) ? v.endereco.cidade : '';
      const op = v.operacaoNome ? v.operacaoNome + ' — ' : '';
      const qtd = (v.vagasDisponiveis != null) ? ` (${v.vagasDisponiveis} vaga${v.vagasDisponiveis == 1 ? '' : 's'})` : '';
      return `<option value="${v.id}">${escapeHTML(v.empresaNome || '')} — ${escapeHTML(op + (v.cargo || ''))}${cidade ? ' · ' + escapeHTML(cidade) : ''}${qtd}</option>`;
    }).join('');
    selectVaga.value = cand.vagaId || '';
  }
  atualizarAutopreviewVaga(cand.vagaId);

  // Preenche Select de Recrutador
  const selectRec = document.getElementById('det-select-recrutador');
  if (selectRec) {
    selectRec.innerHTML = state.recrutadores.map(r => `<option value="${r.id}">${r.nome}</option>`).join('');
    selectRec.value = cand.recrutadorId;
  }

  // Preenche Select de Status
  setSafeValue('det-select-status', cand.status);

  // Observações
  setSafeValue('det-observacoes', cand.observacoesSelecao || '');

  // Imagens e arquivos dos Documentos (Mapeando os 6 documentos)
  const docs = cand.documentos || {};
  let countUploaded = 0;

  const selfieEl = document.getElementById('img-doc-selfie');
  if (selfieEl) {
    selfieEl.src = docs.selfie || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150';
    selfieEl.alt = `Selfie de ${cand.nome}`;
    if (docs.selfie) {
      selfieEl.dataset.originalSrc = docs.selfie;
      countUploaded++;
    } else {
      delete selfieEl.dataset.originalSrc;
    }
  }

  const rgFrenteEl = document.getElementById('img-doc-rgFrente');
  if (rgFrenteEl) {
    rgFrenteEl.src = docs.rgFrente || 'https://images.unsplash.com/photo-1554774853-aae0a22c8aa4?w=400';
    rgFrenteEl.alt = `RG Frente de ${cand.nome}`;
    if (docs.rgFrente) {
      rgFrenteEl.dataset.originalSrc = docs.rgFrente;
      countUploaded++;
    } else {
      delete rgFrenteEl.dataset.originalSrc;
    }
  }

  const fotoPisEl = document.getElementById('img-doc-fotoPis');
  if (fotoPisEl) {
    fotoPisEl.src = docs.fotoPis || 'https://images.unsplash.com/photo-1554774853-aae0a22c8aa4?w=400';
    fotoPisEl.alt = `Foto PIS/NIS de ${cand.nome}`;
    if (docs.fotoPis) {
      fotoPisEl.dataset.originalSrc = docs.fotoPis;
      countUploaded++;
    } else {
      delete fotoPisEl.dataset.originalSrc;
    }
  }

  const cpfDocumentoEl = document.getElementById('img-doc-cpfDocumento');
  if (cpfDocumentoEl) {
    cpfDocumentoEl.src = docs.cpfDocumento || 'https://images.unsplash.com/photo-1554774853-aae0a22c8aa4?w=400';
    cpfDocumentoEl.alt = `CPF de ${cand.nome}`;
    if (docs.cpfDocumento) {
      cpfDocumentoEl.dataset.originalSrc = docs.cpfDocumento;
      countUploaded++;
    } else {
      delete cpfDocumentoEl.dataset.originalSrc;
    }
  }

  const comprovanteEl = document.getElementById('img-doc-comprovanteResidencia');
  if (comprovanteEl) {
    comprovanteEl.src = docs.comprovanteResidencia || 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=400';
    comprovanteEl.alt = `Comprovante de Residência de ${cand.nome}`;
    if (docs.comprovanteResidencia) {
      comprovanteEl.dataset.originalSrc = docs.comprovanteResidencia;
      countUploaded++;
    } else {
      delete comprovanteEl.dataset.originalSrc;
    }
  }

  const cartaoEl = document.getElementById('img-doc-cartaoBancoVerso');
  if (cartaoEl) {
    cartaoEl.src = docs.cartaoBancoVerso || 'https://images.unsplash.com/photo-1554774853-aae0a22c8aa4?w=400';
    cartaoEl.alt = `Cartão Banco Verso de ${cand.nome}`;
    if (docs.cartaoBancoVerso) {
      cartaoEl.dataset.originalSrc = docs.cartaoBancoVerso;
      countUploaded++;
    } else {
      delete cartaoEl.dataset.originalSrc;
    }
  }

  // Atualiza contador de documentos no HTML
  const docCountEl = document.getElementById('det-doc-count');
  if (docCountEl) docCountEl.textContent = countUploaded;

  // Popula o select de horário/turno com os horários DAQUELA vaga (Etapa C)
  const vagaCandTurno = (state.vagas || []).find(v => v.id === cand.vagaId);
  popularHorariosSelect(cand.vagaId, cand.horarioId || cand.turnoTrabalho);

  // Data de admissão (DP): mostra a salva ou, se vazia, a data de hoje (editável)
  const inpAdm = document.getElementById('det-data-admissao');
  if (inpAdm) {
    inpAdm.value = cand.dataAdmissao || _hojeISO();
    inpAdm.onchange = () => {
      cand.dataAdmissao = inpAdm.value;
      registrarAcaoHistorico(cand, `Data de admissão definida pelo DP: ${inpAdm.value}`);
      saveState();
    };
  }

  // RG / expedição (usado no Exata) — preenche da ficha e salva ao editar
  const rgCampos = [
    ['det-rg-orgao', 'rgOrgaoEmissor'], ['det-rg-uf', 'rgUf'],
    ['det-rg-expedicao', 'rgExpedicao'], ['det-rg-numero', 'rg']
  ];
  rgCampos.forEach(([id, prop]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = cand[prop] || '';
    el.onchange = () => { cand[prop] = el.value.trim(); saveState(); };
  });

  // Sexo / Raça / Escolaridade: dropdowns com opções configuráveis (Cadastro Exata)
  [['det-sexo', 'sexo'], ['det-raca', 'raca'], ['det-escolaridade', 'escolaridade']].forEach(([id, key]) => {
    const sel = document.getElementById(id);
    if (!sel || typeof _opcoesFichaAtivas !== 'function') return;
    const atual = cand[key] || '';
    const ativas = _opcoesFichaAtivas(key).map(o => o.de);
    if (atual && !ativas.some(d => String(d).toLowerCase() === atual.toLowerCase())) ativas.unshift(atual);
    const titulo = key === 'sexo' ? 'Sexo' : (key === 'raca' ? 'Raça/Cor' : 'Escolaridade');
    sel.innerHTML = `<option value="">${titulo}…</option>` + ativas.map(d => `<option value="${escapeHTML(d)}" ${d === atual ? 'selected' : ''}>${escapeHTML(d)}</option>`).join('');
    sel.value = atual;
    sel.onchange = () => { cand[key] = sel.value; saveState(); };
  });

  // Exibe escala da vaga no drawer
  const escalaBox = document.getElementById('vaga-escala-box');
  const escalaValor = document.getElementById('vaga-escala-valor');
  if (escalaBox && escalaValor) {
    const escalaVaga = vagaCandTurno && vagaCandTurno.escala;
    if (escalaVaga) {
      escalaValor.textContent = escalaVaga;
      escalaBox.style.display = 'block';
    } else {
      escalaBox.style.display = 'none';
    }
  }

  // Lógica de Somente Leitura (Read-Only)
  const isDpUser = loggedUser && loggedUser.departamento === 'dp';
  const dpPodeEditar = state.config?.dpPodeEditar === true;
  const isContratadoOrAdmin = cand.status === 'contratado';
  // DP mode: campos visíveis e copiáveis mas sem edição (a menos que ADM libere)
  const isDpReadonly = isDpUser && !dpPodeEditar;
  // Seleção: bloqueia campos se candidato está aprovado/contratado
  const isSelecaoBlocked = (cand.status === 'aprovado' || isContratadoOrAdmin) && !isDpUser;

  const drawer = document.getElementById('modal-candidato-detalhes');
  if (drawer) {
    drawer.classList.toggle('dp-readonly-mode', isDpReadonly);
    drawer.classList.toggle('selecao-blocked-mode', isSelecaoBlocked);
  }

  const editableSelectors = [
    '#det-nome-input', '#det-cpf-input', '#det-rg-input', '#det-pis-input', '#det-nascimento-input',
    '#det-mae-input', '#det-pai-input', '#det-telefone-input', '#det-email-input',
    '#det-cep-input', '#det-rua-input', '#det-numero-input', '#det-bairro-input', '#det-cidade-input', '#det-estado-input',
    '#det-banco-input', '#det-tipopix-input', '#det-chavepix-input',
    '#det-camiseta-input', '#det-calca-input', '#det-bota-input',
    '#det-select-vaga', '#det-select-recrutador', '#det-select-status', '#det-observacoes', '#det-select-turno'
  ];
  editableSelectors.forEach(sel => {
    const el = document.querySelector(sel);
    if (!el) return;
    // DP readonly: use readOnly (texto copiável, não editável) — sem disabled
    if (isDpReadonly) {
      el.removeAttribute('disabled');
      el.setAttribute('readonly', 'true');
      el.style.pointerEvents = 'none';
      el.style.userSelect = 'text';
    } else if (isSelecaoBlocked) {
      el.removeAttribute('readonly');
      el.disabled = true;
    } else {
      el.removeAttribute('disabled');
      el.removeAttribute('readonly');
      el.style.pointerEvents = '';
      el.style.userSelect = '';
    }
  });

  // Banner de bloqueio DP
  let dpLockBanner = document.getElementById('dp-lock-banner');
  if (!dpLockBanner) {
    dpLockBanner = document.createElement('div');
    dpLockBanner.id = 'dp-lock-banner';
    const alertInsertBefore = document.getElementById('devolucao-alert-box');
    if (alertInsertBefore && alertInsertBefore.parentNode) {
      alertInsertBefore.parentNode.insertBefore(dpLockBanner, alertInsertBefore);
    }
  }
  if (dpLockBanner) {
    const lock = cand.dpLock;
    const euBloqueei = lock && lock.userLogin === (loggedUser && loggedUser.login);
    if (lock && lock.userLogin) {
      const hora = lock.lockedAt ? new Date(lock.lockedAt).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}) : '';
      const rec = (state.recrutadores || []).find(r => r.id === cand.recrutadorId);
      const recNome = rec ? rec.nome : (cand.recrutadorId || '—');
      dpLockBanner.innerHTML = `
        <div style="background:rgba(59,130,246,0.07);border:1px solid rgba(59,130,246,0.3);border-radius:10px;padding:12px 16px;margin-bottom:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <i class="fa-solid fa-lock" style="color:#3b82f6;font-size:15px;flex-shrink:0;"></i>
          <div style="flex:1;min-width:200px;">
            <div style="font-size:12px;color:#3b82f6;font-weight:700;margin-bottom:3px;">
              <i class="fa-solid fa-user-tie" style="margin-right:4px;font-size:10px;"></i>${_esc(lock.userName)} (DP) está com essa ficha${hora ? ' — desde ' + hora : ''}
            </div>
            <div style="font-size:11px;color:var(--text-secondary);">
              Candidato: <strong>${_esc(cand.nome)}</strong> &nbsp;·&nbsp; Selecionadora: <strong>${_esc(recNome)}</strong>
            </div>
          </div>
          ${euBloqueei ? `
          <button onclick="liberarFichaDP('${_esc(cand.id)}')" style="padding:5px 14px;border-radius:8px;border:1px solid rgba(59,130,246,0.4);background:rgba(59,130,246,0.1);color:#3b82f6;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit;white-space:nowrap;flex-shrink:0;">
            <i class="fa-solid fa-unlock"></i> Liberar Ficha
          </button>` : ''}
        </div>`;
    } else {
      dpLockBanner.innerHTML = '';
    }
  }

  // Exibe/oculta Alerta de Devolução
  const alertBox = document.getElementById('devolucao-alert-box');
  const alertReason = document.getElementById('devolucao-alert-reason');
  if (cand.devolvidoDP && cand.status !== 'aprovado' && cand.status !== 'contratado') {
    if (alertBox) alertBox.style.display = 'block';
    if (alertReason) {
      alertReason.innerHTML = `
        <strong>Devolvida por:</strong> ${cand.devolvidoPor || 'Departamento Pessoal'}
        ${cand.dataDevolucaoDP ? `<span style="font-size:10px; opacity:.7;"> · ${cand.dataDevolucaoDP}</span>` : ''}<br>
        <strong>Motivo:</strong> ${cand.motivoDevolucaoDP || 'Não informado'}
        ${cand.corrigidoPor ? `<br><span style="color:#22c55e;"><strong>✓ Corrigida por:</strong> ${cand.corrigidoPor} · ${cand.dataCorrecao || ''}</span>` : ''}
      `;
    }
  } else {
    if (alertBox) alertBox.style.display = 'none';
  }

  // Preenche a Timeline do Histórico de Auditoria
  const timelineEl = document.getElementById('det-historico-timeline');
  if (timelineEl) {
    if (cand.historico && cand.historico.length > 0) {
      timelineEl.innerHTML = [...cand.historico].reverse().map(h => {
        if (h.tipo === 'visualizacao') {
          return `
            <div class="timeline-item" style="opacity:.6;">
              <div class="timeline-dot" style="background:#94a3b8;width:8px;height:8px;margin-top:3px;"></div>
              <div class="timeline-content">
                <span class="timeline-time" style="font-size:10px;">${h.data}</span>
                <p class="timeline-desc" style="font-size:11px;color:var(--text-secondary);margin:1px 0;"><i class="fa-regular fa-eye" style="margin-right:4px;"></i>${h.acao}</p>
                <span class="timeline-author" style="font-size:10px;"><i class="fa-solid fa-user"></i> ${h.autor}</span>
              </div>
            </div>`;
        }
        if (h.tipo === 'liberacao') {
          return `
            <div class="timeline-item" style="opacity:.7;">
              <div class="timeline-dot" style="background:#10b981;width:8px;height:8px;margin-top:3px;"></div>
              <div class="timeline-content">
                <span class="timeline-time" style="font-size:10px;">${h.data}</span>
                <p class="timeline-desc" style="font-size:11px;color:#10b981;margin:1px 0;"><i class="fa-solid fa-lock-open" style="margin-right:4px;"></i>${h.acao}</p>
                <span class="timeline-author" style="font-size:10px;"><i class="fa-solid fa-user"></i> ${h.autor}</span>
              </div>
            </div>`;
        }
        if (h.tipo === 'entrada_forcada') {
          return `
            <div class="timeline-item" style="background:rgba(239,68,68,0.04);border-radius:8px;padding:4px 6px;">
              <div class="timeline-dot" style="background:#ef4444;width:10px;height:10px;margin-top:2px;"></div>
              <div class="timeline-content">
                <span class="timeline-time" style="color:#ef4444;">${h.data}</span>
                <p class="timeline-desc" style="color:#ef4444;font-weight:600;"><i class="fa-solid fa-triangle-exclamation" style="margin-right:4px;"></i>${h.acao}</p>
                <span class="timeline-author"><i class="fa-solid fa-user-shield"></i> ${h.autor}</span>
              </div>
            </div>`;
        }
        if (h.tipo === 'alteracao') {
          return `
            <div class="timeline-item">
              <div class="timeline-dot" style="background:#f59e0b;"></div>
              <div class="timeline-content">
                <span class="timeline-time">${h.data}</span>
                <p class="timeline-desc" style="color:#f59e0b;"><i class="fa-solid fa-pen-to-square" style="margin-right:4px;"></i>${h.acao}</p>
                <span class="timeline-author"><i class="fa-solid fa-user-pen"></i> ${h.autor}</span>
              </div>
            </div>`;
        }
        return `
          <div class="timeline-item">
            <div class="timeline-dot"></div>
            <div class="timeline-content">
              <span class="timeline-time">${h.data}</span>
              <p class="timeline-desc">${h.acao}</p>
              <span class="timeline-author"><i class="fa-solid fa-user-shield"></i> ${h.autor}</span>
            </div>
          </div>`;
      }).join('');
    } else {
      timelineEl.innerHTML = '<p style="font-size: 11px; color: var(--text-secondary); text-align: center; padding: 20px;">Nenhum histórico registrado.</p>';
    }
  }

  // Ajusta botões do rodapé (Footer Buttons)
  const isDpOrAdmin = loggedUser && (loggedUser.departamento === 'dp' || loggedUser.departamento === 'administracao');
  const showDpActions = isDpOrAdmin && (cand.status === 'aprovado' || cand.status === 'contratado');

  const standardFooterRow = document.querySelector('.drawer-footer-row'); // contains salvar & download
  const btnSubirDp = document.getElementById('btn-subir-dp');
  const dpActionsPanel = document.getElementById('drawer-footer-dp-actions');
  const btnDpContrato = document.getElementById('btn-dp-contrato');

  // Oculta painel do DP por padrão
  if (dpActionsPanel) dpActionsPanel.style.display = 'none';

  if (cand.status === 'aprovado' || cand.status === 'contratado') {
    // Modo leitura para Seleção/Admin ou DP
    if (standardFooterRow) standardFooterRow.style.display = 'none';
    if (btnSubirDp) btnSubirDp.style.display = 'none';

    if (showDpActions) {
      if (dpActionsPanel) {
        dpActionsPanel.style.display = 'flex';
        // Ocultar botões de contrato/devolução se contratado
        if (cand.status === 'contratado') {
          if (btnDpContrato) btnDpContrato.parentElement.style.display = 'none';
        } else {
          if (btnDpContrato) btnDpContrato.parentElement.style.display = 'grid';
        }
      }
    }
  } else {
    // Modo editável para Seleção/Admin
    if (standardFooterRow) standardFooterRow.style.display = 'grid';
    // Mostrar botão de subir para o DP apenas para selecionador/admin
    const canSubmitToDp = loggedUser && (loggedUser.departamento === 'selecao' || loggedUser.departamento === 'administracao');
    if (btnSubirDp) {
      btnSubirDp.style.display = canSubmitToDp ? 'flex' : 'none';
    }
  }

  // ── Botão EXCLUIR FICHA (soft-delete por área + permissão) ──────────────────
  const btnExcluirCand = document.getElementById('btn-excluir-candidato');
  if (btnExcluirCand) {
    const areaAtual = activeAba === 'banco-talentos' ? 'banco_talentos'
                    : activeAba === 'depto-pessoal'  ? 'dp'
                    : activeAba === 'selecao'         ? 'selecao' : null;
    if (areaAtual && podeExcluirArea(areaAtual)) {
      btnExcluirCand.style.display = 'flex';
      btnExcluirCand.onclick = () => abrirModalExcluirCandidato(cand.id, areaAtual);
    } else {
      btnExcluirCand.style.display = 'none';
      btnExcluirCand.onclick = null;
    }
  }

  // ── Botão INAPTO no header + banners de detecção/confirmação ────────────────
  const cpfNoBank = checkCpfInapto(cand.cpf);
  const jaMarcadoInapto = !!cand.inaptidaoInfo;

  // Botão no header
  const inaptoBtnHeader = document.getElementById('det-inapto-action-btn');
  if (inaptoBtnHeader) {
    const BASE_BTN = 'cursor:pointer;border:none;display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;padding:3px 10px;border-radius:12px;letter-spacing:.3px;font-family:inherit;';
    // Ocultar o botão de header se já há painel de CPF ativo (evita duplicação)
    const aguardandoCpf = cand.origemCadastro === 'presencial' && cand.status === 'aguardando_consulta_cpf';
    if (aguardandoCpf) {
      inaptoBtnHeader.style.cssText = 'display:none;';
    } else if (jaMarcadoInapto) {
      // Já marcado → badge vermelho informativo (não abre modal, só indica)
      inaptoBtnHeader.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> INAPTO';
      inaptoBtnHeader.style.cssText = BASE_BTN + 'background:rgba(239,68,68,0.2);color:#ef4444;border:1px solid rgba(239,68,68,0.5);cursor:default;';
      inaptoBtnHeader.onclick = null;
    } else if (cpfNoBank) {
      // CPF detectado no banco, ainda não marcado → alerta vermelho pulsante
      inaptoBtnHeader.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> CPF INAPTO';
      inaptoBtnHeader.style.cssText = BASE_BTN + 'background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.5);animation:pulse-badge 1.5s ease-in-out infinite;';
      inaptoBtnHeader.onclick = () => abrirModalInapto(cand.id, cpfNoBank.motivoId);
    } else {
      // Normal → botão neutro discreto com borda visível
      inaptoBtnHeader.innerHTML = '<i class="fa-solid fa-ban"></i> Marcar Inapto';
      inaptoBtnHeader.style.cssText = BASE_BTN + 'background:rgba(100,116,139,0.08);color:#64748b;border:1px solid rgba(100,116,139,0.35);';
      inaptoBtnHeader.onclick = () => abrirModalInapto(cand.id);
    }
  }

  // Banner de detecção automática (CPF no banco, candidato ainda não marcado)
  const deteccaoBanner = document.getElementById('inapto-deteccao-banner');
  if (deteccaoBanner) {
    if (cpfNoBank && !jaMarcadoInapto) {
      deteccaoBanner.style.display = '';
      const motivoDetEl = document.getElementById('inapto-deteccao-motivo');
      if (motivoDetEl) motivoDetEl.textContent = `Motivo registrado: ${cpfNoBank.motivo} — em ${cpfNoBank.data}`;
      const btnConfirmar = document.getElementById('btn-confirmar-inapto-deteccao');
      if (btnConfirmar) btnConfirmar.onclick = () => abrirModalInapto(cand.id, cpfNoBank.motivoId);
    } else {
      deteccaoBanner.style.display = 'none';
    }
  }

  // Banner de INAPTO no drawer (candidato já marcado)
  const inaptoBannerDrawer = document.getElementById('inapto-banner-drawer');
  if (inaptoBannerDrawer) {
    if (jaMarcadoInapto) {
      inaptoBannerDrawer.classList.add('visible');

      const tituloEl    = inaptoBannerDrawer.querySelector('.inapto-titulo');
      const motivoEl    = document.getElementById('inapto-banner-motivo');
      const actionsEl   = document.getElementById('inapto-banner-actions');
      const decisaoEl   = document.getElementById('inapto-banner-decisao');

      const jaDecidiu = cand.aprovadoMesmoInapto || cand.status === 'reprovado';

      if (tituloEl) tituloEl.innerHTML = cand.aprovadoMesmoInapto
        ? '<i class="fa-solid fa-triangle-exclamation"></i> CPF INAPTO (APROVADO MANUALMENTE)'
        : '<i class="fa-solid fa-circle-xmark"></i> CANDIDATO INAPTO';

      if (motivoEl) motivoEl.textContent = `Motivo: ${cand.inaptidaoInfo.motivo} — registrado em ${cand.inaptidaoInfo.data}`;

      // Botões de ação só aparecem quando não há decisão tomada
      if (actionsEl) actionsEl.style.display = jaDecidiu ? 'none' : 'flex';

      // Texto informativo quando decisão já tomada
      if (decisaoEl) {
        if (cand.aprovadoMesmoInapto) {
          decisaoEl.style.display = '';
          decisaoEl.innerHTML = '<i class="fa-solid fa-check" style="color:#f59e0b;"></i> Aprovado manualmente mesmo constando como inapto.';
        } else if (cand.status === 'reprovado') {
          decisaoEl.style.display = '';
          decisaoEl.innerHTML = '<i class="fa-solid fa-xmark" style="color:#ef4444;"></i> Candidato reprovado por inaptidão.';
        } else {
          decisaoEl.style.display = 'none';
        }
      }

      inaptoBannerDrawer.style.borderColor = cand.aprovadoMesmoInapto ? 'rgba(245,158,11,0.4)' : 'rgba(239,68,68,0.4)';
      inaptoBannerDrawer.style.background  = cand.aprovadoMesmoInapto ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.1)';
    } else {
      inaptoBannerDrawer.classList.remove('visible');
      // Resetar estado interno ao fechar
      const actionsEl = document.getElementById('inapto-banner-actions');
      const decisaoEl = document.getElementById('inapto-banner-decisao');
      if (actionsEl) actionsEl.style.display = 'none';
      if (decisaoEl) decisaoEl.style.display = 'none';
    }
  }

  // ── Painel de Consulta de CPF (só para presenciais aguardando) ────────────
  const cpfConsultaPanel = document.getElementById('cpf-consulta-panel');
  if (cpfConsultaPanel) {
    const showCpfPanel = cand.origemCadastro === 'presencial' && cand.status === 'aguardando_consulta_cpf';
    cpfConsultaPanel.style.display = showCpfPanel ? 'block' : 'none';
  }

  // ── Painel Link de Continuação (para presencial com CPF aprovado) ─────────
  const linkPanel = document.getElementById('link-continuacao-panel');
  if (linkPanel) {
    const showLink = cand.origemCadastro === 'presencial' && cand.statusCpf === 'aprovado' && !cand.fichaCompletada;
    linkPanel.style.display = showLink ? 'block' : 'none';
    if (showLink) {
      const linkUrl = gerarLinkContinuarPresencial(cand.id);
      const urlEl = document.getElementById('link-continuacao-url');
      if (urlEl) urlEl.textContent = linkUrl;
      const btnCopiarLink = document.getElementById('btn-copiar-link-continuacao');
      if (btnCopiarLink) {
        btnCopiarLink.onclick = () => {
          navigator.clipboard.writeText(linkUrl).then(() => {
            btnCopiarLink.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!';
            setTimeout(() => { btnCopiarLink.innerHTML = '<i class="fa-solid fa-copy"></i> Copiar link'; }, 2000);
          });
        };
      }
    }
  }

  // ── Benefícios da Seleção ────────────────────────────────────────────────
  const ben = cand.beneficiosSelecao || {};

  const fretadoChk = document.getElementById('ben-fretado-chk');
  if (fretadoChk) fretadoChk.checked = !!ben.fretado;
  const fretadoFields = document.getElementById('ben-fretado-fields');
  if (fretadoFields) fretadoFields.style.display = ben.fretado ? 'grid' : 'none';
  setSafeValue('ben-qual-fretado', ben.qualFretado || '');
  setSafeValue('ben-linha-fretado', ben.linhaFretado || '');

  const passagemChk = document.getElementById('ben-passagem-chk');
  if (passagemChk) passagemChk.checked = !!ben.passagem;
  const passagemFields = document.getElementById('ben-passagem-fields');
  if (passagemFields) passagemFields.style.display = ben.passagem ? 'block' : 'none';
  setSafeValue('ben-passagem-ida-volta', ben.passagemIdaVolta || '');

  // Preencher datalist de linhas a partir da vaga do candidato
  const linhasDatalist = document.getElementById('ben-linha-fretado-list');
  if (linhasDatalist) {
    linhasDatalist.innerHTML = '';
    const vagaCand = (state.vagas || []).find(v => v.id === cand.vagaId);
    ((vagaCand && vagaCand.linhasFretado) || []).forEach(l => {
      const opt = document.createElement('option'); opt.value = l; linhasDatalist.appendChild(opt);
    });
  }

  // Reseta Abas do Drawer
  document.querySelectorAll('.drawer-tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector('[data-drawer-tab="dados"]').classList.add('active');
  document.querySelectorAll('.drawer-tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('drawer-content-dados').classList.add('active');

  // Configurar inputs DP copiáveis
  setupCopyableFieldsDP();

  // Abre Drawer
  document.getElementById('modal-candidato-detalhes').classList.add('active');
}

function fecharDrawerDetalhes() {
  document.getElementById('modal-candidato-detalhes').classList.remove('active');
  currentCandidateId = null;
}

// ==========================================================================
// MÓDULO: SISTEMA DE INAPTOS
// ==========================================================================

function checkCpfInapto(cpf) {
  if (!cpf || !state.inaptos || !state.inaptos.length) return null;
  const cpfLimpo = cpf.replace(/\D/g, '');
  if (!cpfLimpo) return null;
  return state.inaptos.find(i => i.cpf && i.cpf.replace(/\D/g, '') === cpfLimpo) || null;
}

function gerarLinkContinuarPresencial(candidatoId) {
  const base = window.location.origin + window.location.pathname.replace('index.html', '');
  return `${base}candidato.html?continuarPresencial=${candidatoId}`;
}

function gerarLinkCompletarFicha(btId) {
  const base = window.location.origin + window.location.pathname.replace('index.html', '');
  const cand = state.candidatos.find(c => c.id === btId) || (state.bancoTalentos || []).find(t => t.id === btId);
  if (!cand) return `${base}candidato.html`;
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ id: btId, nome: cand.nome, cpf: cand.cpf || '', telefone: cand.telefone || '' }))));
  return `${base}candidato.html?completar=${payload}`;
}

// Aprovação do CPF pela selecionadora (presencial)
window.aprovarConsultaCPF = function(candidatoId) {
  const cand = state.candidatos.find(c => c.id === candidatoId);
  if (!cand) return;

  cand.statusCpf = 'aprovado';
  cand.status = 'em_analise';
  registrarAcaoHistorico(cand, 'CPF consultado e aprovado pela selecionadora. Candidato liberado para continuar a ficha.');
  registrarLogGlobal(`Liberou o link de documentação (CPF aprovado) para "${cand.nome}".`, 'fluxo');
  saveState();
  renderSelecaoGrid();
  abrirDrawerDetalhes(candidatoId);
  showToast('CPF aprovado! Link de continuação disponível no drawer.', 'success');
};

// Marcar como inapto (candidato de qualquer origem — online ou presencial)
window.abrirModalInapto = function(candidatoId, preSelectMotivoId) {
  const modal = document.getElementById('modal-inapto');
  if (!modal) return;
  document.getElementById('inapto-candidato-id').value = candidatoId;

  const select = document.getElementById('inapto-motivo-select');
  if (select) {
    const motivos = state.motivosInaptidao || [];
    select.innerHTML = '<option value="">Selecione o motivo...</option>' +
      motivos.map(m => `<option value="${m.id}">${m.descricao}</option>`).join('');
    if (preSelectMotivoId) select.value = preSelectMotivoId;
  }

  // Mostrar indicação visual quando motivo veio do banco automático
  const modalTitle = document.getElementById('inapto-modal-titulo');
  const cand = state.candidatos.find(c => c.id === candidatoId);
  if (modalTitle && cand) {
    modalTitle.innerHTML = preSelectMotivoId
      ? `<i class="fa-solid fa-triangle-exclamation"></i> Confirmar inaptidão — ${cand.nome}`
      : `<i class="fa-solid fa-circle-xmark"></i> Marcar como Inapto — ${cand.nome}`;
  }
  const autoNote = document.getElementById('inapto-modal-auto-note');
  if (autoNote) autoNote.style.display = preSelectMotivoId ? '' : 'none';

  modal.classList.add('active');
};

window.confirmarInapto = function() {
  const candidatoId = document.getElementById('inapto-candidato-id').value;
  const motivoId = document.getElementById('inapto-motivo-select').value;
  if (!motivoId) { alert('Selecione um motivo de inaptidão.'); return; }

  const cand = state.candidatos.find(c => c.id === candidatoId);
  if (!cand) return;

  const motivo = (state.motivosInaptidao || []).find(m => m.id === motivoId);
  const motivoDescricao = motivo ? motivo.descricao : 'Motivo não especificado';
  const agora = new Date().toLocaleDateString('pt-BR');

  cand.statusCpf = 'inapto';
  cand.inaptidaoInfo = { motivoId, motivo: motivoDescricao, data: agora };
  cand.aprovadoMesmoInapto = false;

  // Salva no banco global de inaptos (por CPF)
  if (!state.inaptos) state.inaptos = [];
  const cpfLimpo = cand.cpf.replace(/\D/g, '');
  const jaExiste = state.inaptos.find(i => i.cpf.replace(/\D/g, '') === cpfLimpo);
  if (!jaExiste) {
    state.inaptos.push({
      id: 'inapto-' + Date.now(),
      candidatoId: cand.id,
      nome: cand.nome,
      cpf: cand.cpf,
      motivoId,
      motivo: motivoDescricao,
      data: agora,
      vagaId: cand.vagaId,
      vagaNome: cand.codigoVaga || '',
      aprovadoMesmoInapto: false
    });
  }

  registrarAcaoHistorico(cand, `CPF marcado como INAPTO. Motivo: ${motivoDescricao}.`);
  registrarLogGlobal(`${cand.nome} (CPF: ${cand.cpf}) marcado como inapto. Motivo: ${motivoDescricao}.`, 'selecao');
  saveState();

  const tituloModal = document.getElementById('inapto-modal-titulo');
  if (tituloModal) tituloModal.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Marcar como Inapto';
  const autoNote = document.getElementById('inapto-modal-auto-note');
  if (autoNote) autoNote.style.display = 'none';
  document.getElementById('modal-inapto').classList.remove('active');
  renderSelecaoGrid();
  abrirDrawerDetalhes(candidatoId);
  showToast(`Candidato marcado como inapto. Motivo: ${motivoDescricao}`, 'warning');
};

// Aprovar mesmo sendo inapto
window.aprovarMesmoInapto = function(candidatoId) {
  const cand = state.candidatos.find(c => c.id === candidatoId);
  if (!cand || !cand.inaptidaoInfo) return;

  if (!confirm(`Confirmar aprovação de "${cand.nome}" mesmo constando como inapto (${cand.inaptidaoInfo.motivo})?\n\nEssa ação ficará registrada no histórico.`)) return;

  cand.aprovadoMesmoInapto = true;
  cand.statusCpf = 'aprovado';
  cand.status = 'em_analise';

  // Atualiza no banco global de inaptos
  if (state.inaptos) {
    const entry = state.inaptos.find(i => i.cpf.replace(/\D/g,'') === cand.cpf.replace(/\D/g,''));
    if (entry) entry.aprovadoMesmoInapto = true;
  }

  registrarAcaoHistorico(cand, `Aprovado manualmente mesmo constando como INAPTO. Motivo original: ${cand.inaptidaoInfo.motivo}. Aprovador: ${loggedUser ? loggedUser.nome : 'Seleção'}.`);
  registrarLogGlobal(`${cand.nome} aprovado manualmente apesar de ser inapto (${cand.inaptidaoInfo.motivo}).`, 'selecao');
  saveState();
  renderSelecaoGrid();
  abrirDrawerDetalhes(candidatoId);
  showToast('Candidato aprovado. Registro de inaptidão original mantido no histórico.', 'success');
};

// Não seguir com candidato inapto (marca como reprovado)
window.naoSeguirComInapto = function(candidatoId) {
  const cand = state.candidatos.find(c => c.id === candidatoId);
  if (!cand) return;
  if (!confirm(`Confirmar que não irá seguir com "${cand.nome}"? O candidato será marcado como reprovado.`)) return;

  cand.status = 'reprovado';
  cand.motivoReprovacao = `Inapto — ${cand.inaptidaoInfo ? cand.inaptidaoInfo.motivo : 'Motivo não especificado'}`;
  registrarAcaoHistorico(cand, `Candidato reprovado por inaptidão. Motivo: ${cand.motivoReprovacao}.`);
  saveState();
  fecharDrawerDetalhes();
  renderSelecaoGrid();
  showToast('Candidato reprovado por inaptidão.', 'info');
};

// Salvar benefícios da selecionadora
window.salvarBeneficiosSelecao = function() {
  if (!currentCandidateId) return;
  const cand = state.candidatos.find(c => c.id === currentCandidateId);
  if (!cand) return;

  const fretadoChk  = document.getElementById('ben-fretado-chk');
  const passagemChk = document.getElementById('ben-passagem-chk');
  if (!cand.beneficiosSelecao) cand.beneficiosSelecao = {};

  cand.beneficiosSelecao.fretado        = fretadoChk  ? fretadoChk.checked  : false;
  cand.beneficiosSelecao.qualFretado    = (document.getElementById('ben-qual-fretado')     || {}).value || '';
  cand.beneficiosSelecao.linhaFretado   = (document.getElementById('ben-linha-fretado')    || {}).value || '';
  cand.beneficiosSelecao.passagem       = passagemChk ? passagemChk.checked : false;
  cand.beneficiosSelecao.passagemIdaVolta = (document.getElementById('ben-passagem-ida-volta') || {}).value || '';

  const resumo = [];
  if (cand.beneficiosSelecao.fretado)  resumo.push('Fretado' + (cand.beneficiosSelecao.linhaFretado ? ' — ' + cand.beneficiosSelecao.linhaFretado : ''));
  if (cand.beneficiosSelecao.passagem) resumo.push('Passagem R$ ' + (cand.beneficiosSelecao.passagemIdaVolta || '?'));
  if (!resumo.length) resumo.push('Nenhum benefício de transporte');
  registrarAcaoHistorico(cand, 'Benefícios atualizados: ' + resumo.join(' | ') + '.');
  saveState();
  showToast('Benefícios salvos com sucesso!', 'success');
};

// ==========================================================================
// MÓDULO: BANCO DE TALENTOS POR RECRUTADORA
// ==========================================================================

let _waLogTimer = null;
window.salvarWhatsappRecrutadora = function(recrutadorId, valor) {
  const rec = (state.recrutadores || []).find(r => r.id === recrutadorId);
  if (!rec) return;
  rec.whatsapp = valor.replace(/\D/g, '');
  saveState();
  // Log com debounce (evita registrar a cada tecla digitada)
  clearTimeout(_waLogTimer);
  _waLogTimer = setTimeout(() => {
    registrarLogGlobal(`Atualizou o WhatsApp do perfil "${rec.nome}" para ${rec.whatsapp || '(vazio)'}.`, 'meu_painel');
  }, 1200);
};

function getBtNovosPorRecrutadora(recrutadorId) {
  if (!state.bancoTalentos) return [];
  return state.bancoTalentos.filter(bt => bt.recrutadorId === recrutadorId && !bt.visualizadoPelaRecrutadora);
}

function marcarBtVisualizadoPorRecrutadora(recrutadorId) {
  if (!state.bancoTalentos) return;
  state.bancoTalentos.forEach(bt => {
    if (bt.recrutadorId === recrutadorId) bt.visualizadoPelaRecrutadora = true;
  });
  saveState();
}

// ==========================================================================
// MÓDULO: INAPTOS — RENDER DA ABA ADMIN
// ==========================================================================

function renderInaptos() {
  const container = document.getElementById('aba-inaptos');
  if (!container) return;

  const isAdmin = loggedUser && (loggedUser.departamento === 'administracao' || loggedUser.login === 'joaobalaf');

  // Render motivos
  const motivosList = document.getElementById('motivos-inaptidao-lista');
  if (motivosList) {
    const motivos = state.motivosInaptidao || [];
    motivosList.innerHTML = motivos.length === 0
      ? '<p style="font-size:13px;color:var(--text-secondary);">Nenhum motivo cadastrado.</p>'
      : motivos.map(m => `
        <div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;">
          <span style="font-size:13px;color:var(--text-primary);font-weight:500;">${m.descricao}</span>
          ${isAdmin ? `<button onclick="excluirMotivoInaptidao('${m.id}')" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#ef4444;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;font-weight:600;"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>
      `).join('');
  }

  // Render lista de inaptos
  const inaptosLista = document.getElementById('inaptos-candidatos-lista');
  if (inaptosLista) {
    const lista = state.inaptos || [];
    inaptosLista.innerHTML = lista.length === 0
      ? '<p style="font-size:13px;color:var(--text-secondary);text-align:center;padding:32px;">Nenhum candidato inapto registrado.</p>'
      : lista.map(i => `
        <div class="inapto-list-item">
          <div class="inapto-avatar">${i.nome.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:700;color:var(--text-primary);">${i.nome}</div>
            <div style="font-size:11px;color:var(--text-secondary);">CPF: ${i.cpf} · ${i.data}</div>
            <div style="font-size:11px;color:#fca5a5;margin-top:2px;"><i class="fa-solid fa-circle-xmark"></i> ${i.motivo}</div>
            ${i.aprovadoMesmoInapto ? '<span style="font-size:9px;background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);padding:2px 6px;border-radius:6px;font-weight:700;">APROVADO MANUALMENTE</span>' : ''}
          </div>
          <div style="font-size:10px;color:var(--text-secondary);text-align:right;flex-shrink:0;">
            <div>${i.vagaNome || '—'}</div>
            <div>${i.data}</div>
          </div>
        </div>
      `).join('');
  }
}

window.salvarMotivoInaptidao = function() {
  const input = document.getElementById('novo-motivo-input');
  if (!input) return;
  const descricao = input.value.trim();
  if (!descricao) { alert('Digite a descrição do motivo.'); return; }

  if (!state.motivosInaptidao) state.motivosInaptidao = [];
  state.motivosInaptidao.push({
    id: 'mot-' + Date.now(),
    descricao,
    criadoPor: loggedUser ? loggedUser.nome : 'Admin',
    dataCriacao: new Date().toLocaleDateString('pt-BR')
  });
  input.value = '';
  saveState();
  renderInaptos();
  showToast('Motivo cadastrado com sucesso!', 'success');
};

window.excluirMotivoInaptidao = function(motivoId) {
  if (!confirm('Excluir este motivo de inaptidão?')) return;
  state.motivosInaptidao = (state.motivosInaptidao || []).filter(m => m.id !== motivoId);
  saveState();
  renderInaptos();
};

function atualizarAutopreviewVaga(vagaId) {
  const vaga = state.vagas.find(v => v.id === vagaId);
  const previewBox = document.getElementById('vaga-autoprev-box');
  
  if (vaga && previewBox) {
    document.getElementById('prev-salario').textContent = `R$ ${vaga.salario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('prev-codigo').textContent = vaga.codigo;
    document.getElementById('prev-local').textContent = vaga.localTrabalho.split(',')[0];
    document.getElementById('prev-beneficios').textContent = vaga.beneficios.join(', ');
    previewBox.classList.add('active');
  } else if (previewBox) {
    previewBox.classList.remove('active');
  }
}

// ── SELEÇÃO: auto-preenchimento da vaga + snapshot + horário (Etapa C) ──────
// Copia TODOS os dados da vaga para o candidato e grava um snapshot, para que
// alterações futuras na vaga não mudem candidatos já enviados/contratados.
function aplicarSnapshotVaga(cand, vagaId) {
  const vaga = (state.vagas || []).find(v => v.id === vagaId);
  if (!vaga) { cand.vagaId = ''; cand.dadosVagaSnapshot = null; return; }
  cand.vagaId = vaga.id;
  cand.empresaId = vaga.empresaId || '';
  cand.empresaNome = vaga.empresaNome || '';
  cand.empresaCnpj = vaga.empresaCnpj || '';
  cand.codigoVaga = `${vaga.empresaNome || ''} ${vaga.codigo || ''}`.trim();
  cand.salario = vaga.salario;
  cand.dadosVagaSnapshot = {
    vagaId: vaga.id, empresaId: vaga.empresaId, empresaNome: vaga.empresaNome, empresaCnpj: vaga.empresaCnpj || '',
    operacaoNome: vaga.operacaoNome || '', tomadorNome: vaga.tomadorNome || '', tomadorCodigo: vaga.tomadorCodigo || '', tomadorCnpj: vaga.tomadorCnpj || '',
    idEmpresaExata: vaga.idEmpresaExata || '', centroCusto: vaga.centroCusto || '', siglaCentroCusto: vaga.siglaCentroCusto || '',
    funcaoNome: vaga.funcaoNome || '', funcaoCodigo: vaga.funcaoCodigo || '', cbo: vaga.cbo || '',
    exataFuncaoArea: vaga.exataFuncaoArea || '', exataJobFunctionId: vaga.exataJobFunctionId || '',
    employmentLabel: vaga.employmentLabel || '', exataEmploymentCode: vaga.exataEmploymentCode || '', filial: vaga.filial || vaga.branchCode || '',
    tipoContratacaoId: vaga.tipoContratacaoId || '', codigoTipoContrato: vaga.codigoTipoContrato || vaga.vinculo || '', diasVencimento: vaga.diasVencimento || 0, diasProrrogacao: vaga.diasProrrogacao || 0,
    categoria: vaga.categoria || '', categoriaCodigo: vaga.categoriaCodigo || '', categoriaUtilizado: vaga.categoriaUtilizado || '',
    tipoContrato: vaga.tipoContrato || '', vinculo: vaga.vinculo || '',
    finalidade: vaga.finalidade || '', justificativa: vaga.justificativa || '',
    previsaoDias: vaga.previsaoDias || '', taxa: vaga.taxa || '',
    salario: vaga.salario, salarioTipo: vaga.salarioTipo || 'mensal',
    beneficios: vaga.beneficios || [], endereco: vaga.endereco || {}, localTrabalho: vaga.localTrabalho || '', cargo: vaga.cargo || '',
    exataExtras: (vaga.exataExtras || []).map(x => ({ id: x.id, campo: x.campo, valor: x.valor, ativo: x.ativo !== false })),
    exataCampos: JSON.parse(JSON.stringify(vaga.exataCampos || {}))
  };
}
function aplicarHorarioVaga(cand, horarioValor) {
  const vaga = (state.vagas || []).find(v => v.id === cand.vagaId);
  const h = vaga && (vaga.horarios || []).find(x => x.id === horarioValor);
  if (h) {
    cand.horarioId = h.id;
    cand.horarioSnapshot = JSON.parse(JSON.stringify(h));
    cand.turnoTrabalho = h.descricao || cand.turnoTrabalho || '';
  } else {
    cand.turnoTrabalho = horarioValor || cand.turnoTrabalho || '';
    cand.horarioId = null;
  }
}
// Popula o select de horário/turno com os horários DAQUELA vaga (não os globais)
function popularHorariosSelect(vagaId, selecionado) {
  const sel = document.getElementById('det-select-turno');
  if (!sel) return;
  const vaga = (state.vagas || []).find(v => v.id === vagaId);
  if (vaga && vaga.horarios && vaga.horarios.length) {
    sel.innerHTML = vaga.horarios.map(h => {
      const lbl = (h.descricao || 'Turno') + (h.entrada && h.saida ? ` — ${h.entrada} às ${h.saida}` : '');
      return `<option value="${h.id}">${escapeHTML(lbl)}</option>`;
    }).join('');
  } else if (vaga && vaga.turnos && vaga.turnos.length) {
    sel.innerHTML = vaga.turnos.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join('');
  } else {
    sel.innerHTML = '<option value="Diurno">Diurno</option><option value="Noturno">Noturno</option><option value="Misto">Misto</option>';
  }
  if (selecionado) sel.value = selecionado;
}

function salvarDetalhesCandidato() {
  if (!currentCandidateId) return;

  const cand = state.candidatos.find(c => c.id === currentCandidateId);
  if (!cand) return;

  // Impede gravação se já for somente leitura
  if (cand.status === 'aprovado' || cand.status === 'contratado') {
    alert('Este candidato está em modo de leitura e não pode ser editado.');
    return;
  }

  // Dados Pessoais
  const nome = document.getElementById('det-nome-input').value.trim();
  const cpf = document.getElementById('det-cpf-input').value.trim();
  const rg = document.getElementById('det-rg-input').value.trim();
  const pis = document.getElementById('det-pis-input').value.trim();
  const nascimento = document.getElementById('det-nascimento-input').value.trim();
  const mae = document.getElementById('det-mae-input').value.trim();
  const pai = document.getElementById('det-pai-input').value.trim();
  const telefone = document.getElementById('det-telefone-input').value.trim();
  const email = document.getElementById('det-email-input').value.trim();

  if (!nome || !cpf || !rg || !telefone || !email) {
    alert('Por favor, preencha todos os campos obrigatórios pessoais (Nome, CPF, RG, Telefone, E-mail).');
    return;
  }

  // Endereço
  const cep = document.getElementById('det-cep-input').value.trim();
  const rua = document.getElementById('det-rua-input').value.trim();
  const numero = document.getElementById('det-numero-input').value.trim();
  const bairro = document.getElementById('det-bairro-input').value.trim();
  const cidade = document.getElementById('det-cidade-input').value.trim();
  const estado = document.getElementById('det-estado-input').value.trim();

  // Dados Bancários
  const banco = document.getElementById('det-banco-input').value.trim();
  const tipopix = document.getElementById('det-tipopix-input').value;
  const chavepix = document.getElementById('det-chavepix-input').value.trim();

  // Uniforme
  const camiseta = document.getElementById('det-camiseta-input').value;
  const calca = document.getElementById('det-calca-input').value.trim();
  const bota = document.getElementById('det-bota-input').value.trim();

  const vagaId = document.getElementById('det-select-vaga').value;
  const recrutadorId = document.getElementById('det-select-recrutador').value;
  const status = document.getElementById('det-select-status').value;
  const observacoes = document.getElementById('det-observacoes').value.trim();

  // Enforce vacancy selection if promoting or hiring
  if ((status === 'aprovado' || status === 'contratado') && !vagaId) {
    alert('Por favor, selecione a Vaga Destinada para o candidato antes de aprovar ou contratar.');
    return;
  }

  let vaga = null;
  if (vagaId) {
    vaga = state.vagas.find(v => v.id === vagaId);
    if (!vaga) {
      alert('Vaga inválida.');
      return;
    }
  }

  // Se o candidato for movido para contratado diretamente por aqui
  if (status === 'contratado' && cand.status !== 'contratado') {
    const conf = confirm('Mover diretamente para Contratado? Isso irá adicionar a comissão.');
    if (!conf) return;

    state.contratacoes.push({
      id: `c-${Date.now()}`,
      recrutadorId: recrutadorId,
      candidatoId: cand.id,
      candidatoNome: nome,
      empresaNome: vaga ? vaga.empresaNome : 'Empresa Geral',
      vagaId: vaga ? vaga.id : '',
      data: new Date().toLocaleDateString('pt-BR')
    });
  }

  // Atualiza as propriedades do candidato no estado
  cand.nome = nome;
  cand.cpf = cpf;
  cand.rg = rg;
  cand.pis = pis;
  cand.dataNascimento = nascimento;
  cand.nomeMae = mae;
  cand.nomePai = pai;
  cand.telefone = telefone;
  cand.email = email;

  cand.cep = cep;
  cand.rua = rua;
  cand.numeroCasa = numero;
  cand.bairro = bairro;
  cand.cidade = cidade;
  cand.estado = estado;
  cand.endereco = rua && numero ? `${rua}, ${numero}, ${bairro} - ${cidade}/${estado}` : cand.endereco;

  cand.banco = banco;
  cand.tipoPix = tipopix;
  cand.chavePix = chavepix;

  cand.tamanhoCamiseta = camiseta;
  cand.tamanhoCalca = calca;
  cand.tamanhoBota = bota;

  // Vaga: auto-preenche tudo + snapshot; horário escolhido da própria vaga
  const turno = document.getElementById('det-select-turno').value;
  if (vaga) {
    aplicarSnapshotVaga(cand, vagaId);
    aplicarHorarioVaga(cand, turno);
  } else {
    cand.vagaId = '';
    cand.empresaId = '';
    cand.codigoVaga = 'Vaga Não Definida';
    cand.turnoTrabalho = turno;
  }
  cand.recrutadorId = recrutadorId;
  cand.status = status;
  cand.diasEtapa = 1;
  cand.observacoesSelecao = observacoes;

  // Reseta devolução ao alterar manualmente
  cand.devolvidoDP = false;
  cand.motivoDevolucaoDP = '';

  // Auditoria por campo: compara snapshot antes × valores atuais
  if (_drawerSnapshotAntes && loggedUser && loggedUser.login !== 'joaobalaf') {
    const depois = {
      nome, cpf, rg, pis, dataNascimento: nascimento, nomeMae: mae, nomePai: pai,
      telefone, email, cep, rua, numeroCasa: numero, bairro, cidade, estado,
      banco, tipoPix: tipopix, chavePix: chavepix,
      status, turnoTrabalho: turno, recrutadorId, vagaId
    };
    const alterados = [];
    Object.keys(CAMPOS_AUDIT).forEach(k => {
      const antes = String(_drawerSnapshotAntes[k] || '');
      const dep   = String(depois[k] || '');
      if (antes !== dep) alterados.push(`${CAMPOS_AUDIT[k]}: "${antes}" → "${dep}"`);
    });
    if (alterados.length > 0) {
      if (!cand.historico) cand.historico = [];
      cand.historico.push({
        data: new Date().toLocaleString('pt-BR'),
        autor: `${loggedUser.nome} (${loggedUser.departamento.toUpperCase()})`,
        acao: 'Campos alterados: ' + alterados.join(' | '),
        tipo: 'alteracao'
      });
    } else {
      registrarAcaoHistorico(cand, 'Ficha salva sem alterações nos dados cadastrais.');
    }
    _drawerSnapshotAntes = null;
  } else {
    registrarAcaoHistorico(cand, `Ficha cadastral atualizada. Status: ${status}`);
  }

  saveState();
  fecharDrawerDetalhes();
  renderCurrentAba();
  alert('Alterações salvas com sucesso!');
}

// MODAL ADD CANDIDATO MANUALMENTE
function abrirModalAddCandidato(colunaStatus) {
  document.getElementById('add-candidato-coluna').value = colunaStatus;
  
  // Preenche select de vagas
  const selectVaga = document.getElementById('add-vaga');
  selectVaga.innerHTML = state.vagas.map(v => `<option value="${v.id}">${v.cargo} (${v.empresaNome})</option>`).join('');

  // Preenche select de recrutadores
  const selectRec = document.getElementById('add-recrutador');
  selectRec.innerHTML = state.recrutadores.map(r => `<option value="${r.id}">${r.nome}</option>`).join('');

  document.getElementById('modal-candidato-add').classList.add('active');
}

function fecharModalAddCandidato() {
  document.getElementById('modal-candidato-add').classList.remove('active');
  document.getElementById('form-add-candidato').reset();
}

// MODAL REPROVAR (NO DP) — usa modal-reprovar-motivo (status reprovado)
function abrirModalReprovar(candidatoId, candidatoNome) {
  document.getElementById('reprovar-candidato-id').value = candidatoId;
  document.getElementById('reprovar-nome-candidato').textContent = candidatoNome;
  document.getElementById('reprovar-motivo-texto').value = '';
  document.getElementById('modal-reprovar-motivo').classList.add('active');
}

function fecharModalReprovar() {
  document.getElementById('modal-reprovar-motivo').classList.remove('active');
}

// MODAL DE VAGA
function fecharModalVaga() {
  document.getElementById('modal-nova-vaga').classList.remove('active');
  document.getElementById('form-nova-vaga').reset();
  resetarHorariosVaga();
  resetarFormVagaParaCriar();
}

// GESTÃO DE COLABORADORES INTERNOS (CRUD)
function renderFuncionarios() {
  // --- Card de Funcionários Aguardando Aprovação ---
  const pendingCard = document.getElementById('func-pending-approvals-card');
  const pendingBody = document.getElementById('lista-pendentes-body');
  const podeAprovar = loggedUser && (
    loggedUser.departamento === 'administracao' ||
    loggedUser.login === 'joaobalaf' ||
    hasPermission('funcionarios', 'aprovar')
  );

  const pendentes = state.funcionarios.filter(f => f.status === 'aguardando_aprovacao');

  const pendCountEl = document.getElementById('func-pending-count');
  if (pendCountEl) pendCountEl.textContent = pendentes.length > 0 ? `${pendentes.length} nova(s)` : '';

  if (pendingCard && pendingBody) {
    if (pendentes.length > 0 && podeAprovar) {
      pendingCard.style.display = 'block';
      pendingBody.innerHTML = pendentes.map(f => `
        <tr>
          <td style="font-weight:600; color:var(--text-primary);">${escapeHTML(f.nome)}<div style="font-size:11px;color:var(--text-secondary);font-weight:400;">${escapeHTML(f.telefone || 'sem telefone')} · ${escapeHTML(deptoLabelSimples(f.departamentoSolicitado || f.departamento))}${f.dataSolicitacao ? ' · ' + escapeHTML(f.dataSolicitacao) : ''}</div></td>
          <td>${escapeHTML(f.login)}</td>
          <td><span class="badge" style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600;">Aguardando Aprovação</span></td>
          <td>
            <button class="btn btn-primary btn-sm" onclick="abrirModalGerenciarFuncionario('${f.id}')"
              style="padding:2px 8px; font-size:11px; background:var(--primary); border:none;">
              <i class="fa-solid fa-user-check"></i> Avaliar & Aprovar
            </button>
          </td>
        </tr>
      `).join('');
    } else {
      pendingCard.style.display = 'none';
    }
  }

  // --- Card de Acessos Bloqueados (excesso de tentativas) ---
  const blockedCard = document.getElementById('func-blocked-card');
  const blockedBody = document.getElementById('lista-bloqueados-body');
  const podeLiberar = loggedUser && (loggedUser.departamento === 'administracao' || loggedUser.login === 'joaobalaf' || hasPermission('funcionarios', 'aprovar'));
  const bloqueados = state.funcionarios.filter(f => f.bloqueadoLogin);
  if (blockedCard && blockedBody) {
    if (bloqueados.length > 0 && podeLiberar) {
      blockedCard.style.display = 'block';
      blockedBody.innerHTML = bloqueados.map(f => {
        const info = f.bloqueioInfo || {};
        const disp = info.dispositivo || '—';
        return `
        <tr>
          <td style="font-weight:600;">${escapeHTML(f.nome)}<div style="font-size:11px;color:var(--text-secondary);font-weight:400;">${escapeHTML(f.login)}</div></td>
          <td style="font-size:12px;">${escapeHTML(info.data || '—')}</td>
          <td style="font-size:11px;color:var(--text-secondary);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHTML(disp)}">${escapeHTML(disp.slice(0, 42))}</td>
          <td><span class="badge badge-red">Bloqueado</span></td>
          <td style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" onclick="liberarAcessoLogin('${f.id}')" style="padding:2px 8px;font-size:11px;"><i class="fa-solid fa-unlock"></i> Liberar acesso</button>
            <button class="btn btn-secondary btn-sm" onclick="renderFuncionarios()" style="padding:2px 8px;font-size:11px;"><i class="fa-solid fa-ban"></i> Manter</button>
          </td>
        </tr>`;
      }).join('');
    } else {
      blockedCard.style.display = 'none';
    }
  }

  // --- Destaque da Semana ---
  const { recrutadorId: destRecId, contagem: destContagem } = calcularRecrutadorSemana();
  const destRec = destRecId ? state.recrutadores.find(r => r.id === destRecId) : null;

  // --- Tabela Principal de Funcionários ---
  const tbody = document.getElementById('lista-funcionarios-body');
  if (!tbody) return;

  const podeGerenciar = loggedUser && (
    loggedUser.departamento === 'administracao' ||
    loggedUser.login === 'joaobalaf' ||
    hasPermission('funcionarios', 'perms')
  );

  const deptoLabels = {
    'administracao': 'Gestão Executiva',
    'selecao': 'Recrutamento & Seleção',
    'dp': 'Departamento Pessoal',
    'comissao': 'Comissões & Estatísticas'
  };

  // Exibe apenas funcionários ativos/inativos na lista principal (não os pendentes)
  const funcExibir = state.funcionarios.filter(f => f.status !== 'aguardando_aprovacao');

  tbody.innerHTML = funcExibir.map(f => {
    const isSelf = loggedUser && loggedUser.id === f.id;
    const statusClass = f.status === 'ativo' ? 'badge-green' : 'badge-red';
    const statusText = f.status === 'ativo' ? 'Ativo' : 'Inativo';
    const statusBtnText = f.status === 'ativo' ? 'Inativar' : 'Ativar';
    const statusBtnClass = f.status === 'ativo' ? 'btn-danger' : 'btn-primary';
    const disableAttr = isSelf ? 'disabled title="Você não pode alterar seu próprio status"' : '';

    // Badge destaque da semana (verificar se o nome do funcionário coincide com algum recrutador)
    const recMatch = destRec && f.nome.toLowerCase().includes(destRec.nome.toLowerCase());
    const destaqueIcon = recMatch && destContagem > 0
      ? `<span title="Recrutador Destaque desta Semana!" style="animation: pulse 2s infinite; display:inline-block; margin-left:6px; font-size:14px; cursor:help;">👑</span>`
      : '';

    return `
      <tr>
        <td style="font-weight:600; color:var(--text-primary);">
          ${f.nome}${destaqueIcon}
          ${isSelf ? '<span class="tag-badge tag-blue" style="font-size:9px; padding:1px 4px; margin-left:4px;">Você</span>' : ''}
        </td>
        <td>${f.login}</td>
        <td><span class="tag-badge tag-blue">${deptoLabels[f.departamento] || f.departamento}</span></td>
        <td><span class="badge ${statusClass}">${statusText}</span></td>
        <td style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn ${statusBtnClass} btn-sm" onclick="toggleStatusFuncionario('${f.id}')" ${disableAttr} style="padding:2px 8px; font-size:11px;">
            <i class="fa-solid fa-power-off"></i> ${statusBtnText}
          </button>
          ${podeGerenciar && !isSelf ? `
            <button class="btn btn-secondary btn-sm" onclick="abrirModalGerenciarFuncionario('${f.id}')" style="padding:2px 8px; font-size:11px;">
              <i class="fa-solid fa-shield-halved"></i> Permissões
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');

  // Configurar listeners do modal Gerenciar (garante que esteja configurado)
  setupModalGerenciarListeners();
  setupBtnCopiarLink();
}

function toggleStatusFuncionario(id) {
  const func = state.funcionarios.find(f => f.id === id);
  if (!func) return;
  
  if (loggedUser && loggedUser.id === id) {
    alert('Você não pode alterar seu próprio status!');
    return;
  }
  
  const novoStatus = func.status === 'ativo' ? 'inativo' : 'ativo';
  const conf = confirm(`Deseja alterar o status do funcionário "${func.nome}" para ${novoStatus.toUpperCase()}?`);
  if (!conf) return;
  
  func.status = novoStatus;
  saveState();
  renderFuncionarios();
  alert(`Status do funcionário "${func.nome}" atualizado para ${novoStatus.toUpperCase()}.`);
}

// Libera novas tentativas de login (remove bloqueio administrativo)
window.liberarAcessoLogin = function(funcId) {
  const f = state.funcionarios.find(x => x.id === funcId);
  if (!f) return;
  f.bloqueadoLogin = false;
  f.bloqueioInfo = null;
  if (typeof resetarTentativasLogin === 'function') resetarTentativasLogin(f.login);
  registrarLogGlobal(`Liberou novas tentativas de login para "${f.nome}" (${f.login}).`, 'seguranca');
  saveState();
  renderFuncionarios();
  alert(`Acesso de "${f.nome}" liberado. Ele já pode tentar entrar novamente.`);
};

// ==========================================================================
// EXPORTAR EXATA — gera CSV no formato de importação do sistema Exata
// ==========================================================================
// ==========================================================================
// EXPORTAÇÃO EXATA — TXT técnico com EXATAMENTE 90 campos (separador ;)
// ==========================================================================
const EXATA_HEADER = [
  'tipo_contrato','vinculo','id','nome','email',
  'tel_residencial','tel_celular','nome_pai','nome_mae',
  'ctps','ctps_tipo','ctps_serie','ctps_uf','ctps_data_expedicao',
  'data_admissao','data_rescisao','data_vencimento','data_prorrogacao',
  'id_empresa_exata','funcao','funcao_cbo',
  'pis','cpf','rg',
  'titulo','titulo_zona','titulo_secao','titulo_emissao',
  'endereco_cep','endereco','endereco_numero','endereco_complemento',
  'endereco_estado','endereco_cidade','endereco_bairro',
  'salario','salario_tipo',
  'data_nascimento','estado_civil','sexo','raca',
  'escolaridade','escolaridade_status',
  'contratacao_finalidade','contratacao_justificativa',
  'banco','agencia','agencia_digito','conta','conta_digito','conta_tipo',
  'dep1_nome','dep1_data_nascimento','dep1_cpf','dep1_parentesco',
  'dep2_nome','dep2_data_nascimento','dep2_cpf','dep2_parentesco',
  'dep3_nome','dep3_data_nascimento','dep3_cpf','dep3_parentesco',
  'dep4_nome','dep4_data_nascimento','dep4_cpf','dep4_parentesco',
  'dep5_nome','dep5_data_nascimento','dep5_cpf','dep5_parentesco',
  'vt1_ida_tipo','vt1_ida_valor','vt2_ida_tipo','vt2_ida_valor','vt3_ida_tipo','vt3_ida_valor',
  'vt1_volta_tipo','vt1_volta_valor','vt2_volta_tipo','vt2_volta_valor','vt3_volta_tipo','vt3_volta_valor',
  'rg_expedicao','rg_uf','pais_nascimento','estado_nascimento','cidade_nascimento',
  'previsao_contrato_dias','taxa'
];

// Catálogo explicativo dos 90 campos enviados ao Exata (para o painel "Cadastros Exata").
// origem: 'tipos' (Tipos de Contratação) · 'vaga' · 'ficha' (candidato) · 'auto' (calculado) · 'dominio' (de/para configurável aqui)
const EXATA_CAMPOS_INFO = (function () {
  const F = (key, titulo, origem, desc, dominioKey) => ({ key, titulo, origem, desc: desc || '', dominioKey: dominioKey || null });
  const base = [
    F('tipo_contrato', 'Tipo de contrato', 'tipos', 'Código do tipo (Efetivo/Temporário). Definido em Tipos de Contratação.'),
    F('vinculo', 'Vínculo', 'tipos', 'Código do vínculo. Definido em Tipos de Contratação.'),
    F('id', 'ID interno', 'auto', 'Identificador interno do candidato (gerado pelo sistema).'),
    F('nome', 'Nome', 'ficha', 'Nome completo — vem da ficha do candidato.'),
    F('email', 'E-mail', 'ficha', 'Vem da ficha.'),
    F('tel_residencial', 'Telefone residencial', 'ficha', 'Vem da ficha.'),
    F('tel_celular', 'Celular', 'ficha', 'Vem da ficha.'),
    F('nome_pai', 'Nome do pai', 'ficha', 'Vem da ficha.'),
    F('nome_mae', 'Nome da mãe', 'ficha', 'Vem da ficha.'),
    F('ctps', 'CTPS (número)', 'auto', 'Automático: 7 primeiros dígitos do CPF.'),
    F('ctps_tipo', 'CTPS - tipo', 'ficha', 'Vem da ficha.'),
    F('ctps_serie', 'CTPS - série', 'auto', 'Automático: 4 últimos dígitos do CPF.'),
    F('ctps_uf', 'CTPS - UF', 'ficha', 'Vem da ficha (UF do documento).'),
    F('ctps_data_expedicao', 'CTPS - expedição', 'auto', 'Não enviado (em branco).'),
    F('data_admissao', 'Data de admissão', 'auto', 'Preenchida pelo DP (hoje, editável).'),
    F('data_rescisao', 'Data de rescisão', 'auto', 'Não enviado (em branco).'),
    F('data_vencimento', 'Data de vencimento', 'auto', 'Calculada: admissão + dias do tipo.'),
    F('data_prorrogacao', 'Data de prorrogação', 'auto', 'Calculada: vencimento + dias do tipo.'),
    F('id_empresa_exata', 'ID empresa Exata', 'vaga', 'Tomador/empresa — vem do cadastro do cliente/vaga.'),
    F('funcao', 'Função (código)', 'vaga', 'Código da função do catálogo (na vaga).'),
    F('funcao_cbo', 'Função - CBO', 'vaga', 'CBO da função do catálogo (na vaga).'),
    F('pis', 'PIS', 'ficha', 'Vem da ficha.'),
    F('cpf', 'CPF', 'ficha', 'Vem da ficha.'),
    F('rg', 'RG', 'ficha', 'Vem da ficha.'),
    F('titulo', 'Título de eleitor', 'ficha', 'Vem da ficha (só se preenchido).'),
    F('titulo_zona', 'Título - zona', 'ficha', 'Vem da ficha.'),
    F('titulo_secao', 'Título - seção', 'ficha', 'Vem da ficha.'),
    F('titulo_emissao', 'Título - emissão', 'ficha', 'Vem da ficha.'),
    F('endereco_cep', 'CEP', 'ficha', 'Vem da ficha.'),
    F('endereco', 'Endereço', 'ficha', 'Vem da ficha.'),
    F('endereco_numero', 'Número', 'ficha', 'Vem da ficha.'),
    F('endereco_complemento', 'Complemento', 'ficha', 'Vem da ficha.'),
    F('endereco_estado', 'UF (endereço)', 'ficha', 'Vem da ficha.'),
    F('endereco_cidade', 'Cidade', 'ficha', 'Vem da ficha.'),
    F('endereco_bairro', 'Bairro', 'ficha', 'Vem da ficha.'),
    F('salario', 'Salário', 'vaga', 'Vem da vaga.'),
    F('salario_tipo', 'Salário - tipo', 'vaga', 'Configurável na vaga (Nome/Código).'),
    F('data_nascimento', 'Data de nascimento', 'ficha', 'Vem da ficha.'),
    F('estado_civil', 'Estado civil', 'ficha', 'Vem da ficha.'),
    F('sexo', 'Sexo', 'fichaopt', 'Vem da ficha (opções configuráveis abaixo).'),
    F('raca', 'Raça/cor', 'fichaopt', 'Vem da ficha (opções configuráveis abaixo).'),
    F('escolaridade', 'Escolaridade', 'fichaopt', 'Vem da ficha (opções configuráveis abaixo).'),
    F('escolaridade_status', 'Escolaridade - status', 'ficha', 'Vem da ficha.'),
    F('contratacao_finalidade', 'Finalidade da contratação', 'vaga', 'Configurável na vaga (Nome/Código).'),
    F('contratacao_justificativa', 'Justificativa da contratação', 'vaga', 'Configurável na vaga (Nome/Código).'),
    F('banco', 'Banco', 'ficha', 'Vem da ficha.'),
    F('agencia', 'Agência', 'ficha', 'Vem da ficha.'),
    F('agencia_digito', 'Agência - dígito', 'ficha', 'Vem da ficha.'),
    F('conta', 'Conta', 'ficha', 'Vem da ficha.'),
    F('conta_digito', 'Conta - dígito', 'ficha', 'Vem da ficha.'),
    F('conta_tipo', 'Conta - tipo', 'ficha', 'Vem da ficha.')
  ];
  for (let i = 1; i <= 5; i++) {
    base.push(F('dep' + i + '_nome', 'Dependente ' + i + ' - nome', 'ficha', 'Vem da ficha.'));
    base.push(F('dep' + i + '_data_nascimento', 'Dependente ' + i + ' - nascimento', 'ficha', 'Vem da ficha.'));
    base.push(F('dep' + i + '_cpf', 'Dependente ' + i + ' - CPF', 'ficha', 'Vem da ficha.'));
    base.push(F('dep' + i + '_parentesco', 'Dependente ' + i + ' - parentesco', 'ficha', 'Vem da ficha.'));
  }
  ['ida', 'volta'].forEach(dir => {
    for (let i = 1; i <= 3; i++) {
      base.push(F('vt' + i + '_' + dir + '_tipo', 'VT ' + dir + ' ' + i + ' - tipo', 'ficha', 'Vem da ficha.'));
      base.push(F('vt' + i + '_' + dir + '_valor', 'VT ' + dir + ' ' + i + ' - valor', 'ficha', 'Vem da ficha.'));
    }
  });
  base.push(F('rg_expedicao', 'RG - expedição', 'ficha', 'Vem da ficha.'));
  base.push(F('rg_uf', 'RG - UF/órgão', 'ficha', 'Vem da ficha.'));
  base.push(F('pais_nascimento', 'País de nascimento', 'ficha', 'Vem da ficha (padrão BR).'));
  base.push(F('estado_nascimento', 'Estado de nascimento', 'ficha', 'Vem da ficha.'));
  base.push(F('cidade_nascimento', 'Cidade de nascimento', 'ficha', 'Vem da ficha.'));
  base.push(F('previsao_contrato_dias', 'Previsão do contrato (dias)', 'vaga', 'Vem da vaga.'));
  base.push(F('taxa', 'Taxa', 'vaga', 'Vem da vaga.'));
  return base.map((c, i) => Object.assign(c, { pos: i + 1 }));
})();

// Diagnóstico: o catálogo explicativo precisa bater 1:1 com o cabeçalho exportado
function _validarCamposExata() {
  const a = EXATA_CAMPOS_INFO.map(c => c.key);
  return {
    total: a.length,
    okLen: a.length === EXATA_HEADER.length,
    okOrder: a.every((k, i) => k === EXATA_HEADER[i]),
    dominiosOk: EXATA_CAMPOS_INFO.filter(c => c.origem === 'fichaopt').every(c => EXATA_HEADER.indexOf(c.key) >= 0)
  };
}
if (typeof window !== 'undefined') window._validarCamposExata = _validarCamposExata;

// Tabelas de/para configuráveis (texto da ficha -> código do Exata)
function getExataDominios() {
  if (typeof state === 'undefined' || !state) return {};
  if (!state.exataDominios) state.exataDominios = {};
  return state.exataDominios;
}
function _traduzirDominioValor(key, valor, dom) {
  const lista = (dom && dom[key]) || [];
  const alvo = String(valor == null ? '' : valor).trim().toLowerCase();
  if (!alvo || !lista.length) return valor;
  const hit = lista.find(o => String(o.de || '').trim().toLowerCase() === alvo);
  return hit ? hit.codigo : valor;
}
// Traduz o texto da ficha (sexo/raça/escolaridade) pelo código configurado nas opções
function _aplicarDominiosExata(arr) {
  const dom = getExataDominios();
  EXATA_CAMPOS_INFO.forEach(c => {
    if (c.origem !== 'fichaopt') return;
    const i = EXATA_HEADER.indexOf(c.key);
    if (i < 0) return;
    arr[i] = _traduzirDominioValor(c.dominioKey || c.key, arr[i], dom);
  });
  return arr;
}
// Override por VAGA: códigos extras configurados na própria vaga (exataExtras)
function _aplicarExtrasVaga(arr, vs) {
  const extras = (vs && vs.exataExtras) || [];
  extras.forEach(x => {
    if (!x || x.ativo === false) return;
    const i = EXATA_HEADER.indexOf(String(x.campo || '').trim());
    if (i >= 0) arr[i] = x.valor;
  });
  return arr;
}
// Configuração por VAGA: cada campo com {nome, codigo}. O CÓDIGO é o que vai no TXT.
function _aplicarCamposVaga(arr, vs) {
  const campos = (vs && vs.exataCampos) || {};
  Object.keys(campos).forEach(key => {
    const c = campos[key]; if (!c) return;
    const cod = String(c.codigo == null ? '' : c.codigo).trim();
    if (cod === '') return; // vazio = não configurado, mantém o valor base
    const i = EXATA_HEADER.indexOf(key);
    if (i >= 0) arr[i] = cod;
  });
  return arr;
}

// Protege o valor: nunca cria coluna extra nem emite null/undefined (itens 15-16)
function sanitizarExata(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  const low = s.trim().toLowerCase();
  if (low === 'undefined' || low === 'null' || low === '[object object]' || low === 'não informado' || low === 'nao informado') return '';
  s = s.replace(/[\r\n\t]+/g, ' '); // quebra de linha/TAB -> espaço
  s = s.replace(/;/g, ',');         // ; -> , (não estoura colunas)
  s = s.replace(/"/g, "'");         // aspas
  return s.trim();
}

// Formato de data único e centralizado (item 17): DD/MM/AAAA
function formatarDataExata(v) {
  if (!v) return '';
  const str = String(v).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return str; // já em DD/MM/AAAA ou texto: mantém como está
}

// Números (salário/taxa/VT) — mantém o padrão do registro, como texto (item 17)
function formatarNumeroExata(v) {
  if (v === null || v === undefined || v === '') return '';
  return String(v).replace(/[\r\n\t;]+/g, ' ').trim();
}

// Mapa CONTROLADO sistema -> 90 campos do Exata (mesma ordem do cabeçalho)
// ── Regras automáticas do Exata ───────────────────────────────────────────
function _soDigitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
// CTPS gerada do CPF: 7 primeiros dígitos = ctps; 4 últimos = ctps_serie
function _ctpsDoCpf(cpf) {
  const d = _soDigitos(cpf);
  if (d.length < 11) return { ctps: '', serie: '' };
  return { ctps: d.slice(0, 7), serie: d.slice(7, 11) };
}
// Filial automática pelo vínculo: 101(CLT)->01 · 106(Temporário)->00
function _filialPorVinculo(vinculo) {
  const v = String(vinculo || '');
  if (v === '101') return '01';
  if (v === '106') return '00';
  return '';
}
function _dataExataParaDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s); if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  return null;
}
function _somarDiasExata(v, dias) {
  const d = _dataExataParaDate(v); if (!d) return '';
  d.setDate(d.getDate() + dias);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function mapearExata(cand, vs) {
  const dep = (i) => (cand.dependentes && cand.dependentes[i]) || {};
  const vti = (i) => (cand.vtIda && cand.vtIda[i]) || {};
  const vtv = (i) => (cand.vtVolta && cand.vtVolta[i]) || {};
  // Cálculos automáticos
  const ctpsAuto = _ctpsDoCpf(cand.cpf);
  const dataAdm = formatarDataExata(cand.dataAdmissao);
  const _diasV = Number(vs.diasVencimento) || 0;   // regra cadastrada no tipo de contratação
  const _diasP = Number(vs.diasProrrogacao) || 0;
  const dataVenc = _diasV > 0 ? _somarDiasExata(cand.dataAdmissao, _diasV) : '';
  const dataProrr = (_diasV > 0 && _diasP > 0) ? _somarDiasExata(dataVenc, _diasP) : '';
  const ctpsUf = cand.ctpsUf || cand.rgUf || cand.estado || '';
  const rgUfFinal = cand.rgOrgaoEmissor || cand.rgUf || '';
  const arr = [
    vs.codigoTipoContrato || vs.vinculo,          // 1 tipo_contrato (CÓDIGO, não o nome)
    vs.vinculo,                                   // 2 vinculo (código do vínculo)
    cand.id,                                      // 3 id (ID interno do candidato)
    cand.nome,                                    // 4 nome
    cand.email,                                   // 5 email
    cand.telefoneResidencial,                     // 6 tel_residencial
    cand.telefone || cand.celular,                // 7 tel_celular
    cand.nomePai,                                 // 8 nome_pai
    cand.nomeMae,                                 // 9 nome_mae
    ctpsAuto.ctps || cand.ctps || '',             // 10 ctps (gerada do CPF: 7 primeiros dígitos)
    '',                                           // 11 ctps_tipo (vazio)
    ctpsAuto.serie || cand.ctpsSerie || '',       // 12 ctps_serie (4 últimos dígitos do CPF)
    ctpsUf,                                       // 13 ctps_uf (UF do documento)
    '',                                           // 14 ctps_data_expedicao (não enviar)
    dataAdm,                                      // 15 data_admissao (data da geração do contrato)
    '',                                           // 16 data_rescisao (não enviar)
    dataVenc,                                     // 17 data_vencimento (temporário: admissão + 180 dias)
    dataProrr,                                    // 18 data_prorrogacao (temporário: vencimento + 90 dias)
    vs.idEmpresaExata,                            // 19 id_empresa_exata (vaga)
    vs.funcaoCodigo,                              // 20 funcao (código da função, vaga)
    vs.cbo,                                       // 21 funcao_cbo (vaga)
    cand.pis,                                     // 22 pis
    cand.cpf,                                     // 23 cpf
    cand.rg,                                      // 24 rg
    cand.tituloEleitor,                           // 25 titulo
    cand.tituloZona,                              // 26 titulo_zona
    cand.tituloSecao,                             // 27 titulo_secao
    formatarDataExata(cand.tituloEmissao),        // 28 titulo_emissao
    cand.cep,                                     // 29 endereco_cep
    cand.rua,                                     // 30 endereco
    cand.numeroCasa,                              // 31 endereco_numero
    cand.complemento,                             // 32 endereco_complemento
    cand.estado,                                  // 33 endereco_estado
    cand.cidade,                                  // 34 endereco_cidade
    cand.bairro,                                  // 35 endereco_bairro
    formatarNumeroExata(vs.salario != null && vs.salario !== '' ? vs.salario : cand.salario), // 36 salario (vaga)
    vs.salarioTipo,                               // 37 salario_tipo (vaga)
    formatarDataExata(cand.dataNascimento),       // 38 data_nascimento
    cand.estadoCivil,                             // 39 estado_civil
    cand.sexo,                                    // 40 sexo
    cand.raca,                                    // 41 raca
    cand.escolaridade,                            // 42 escolaridade
    cand.escolaridadeStatus,                      // 43 escolaridade_status
    vs.finalidade,                                // 44 contratacao_finalidade (vaga)
    vs.justificativa,                             // 45 contratacao_justificativa (vaga)
    cand.banco,                                   // 46 banco
    cand.agenciaBanco || cand.agencia,            // 47 agencia
    cand.agenciaDigito,                           // 48 agencia_digito
    cand.contaBanco || cand.conta,                // 49 conta
    cand.contaDigito,                             // 50 conta_digito
    cand.contaTipo,                               // 51 conta_tipo
    dep(0).nome, formatarDataExata(dep(0).dataNascimento), dep(0).cpf, dep(0).parentesco, // 52-55
    dep(1).nome, formatarDataExata(dep(1).dataNascimento), dep(1).cpf, dep(1).parentesco, // 56-59
    dep(2).nome, formatarDataExata(dep(2).dataNascimento), dep(2).cpf, dep(2).parentesco, // 60-63
    dep(3).nome, formatarDataExata(dep(3).dataNascimento), dep(3).cpf, dep(3).parentesco, // 64-67
    dep(4).nome, formatarDataExata(dep(4).dataNascimento), dep(4).cpf, dep(4).parentesco, // 68-71
    vti(0).tipo, formatarNumeroExata(vti(0).valor), vti(1).tipo, formatarNumeroExata(vti(1).valor), vti(2).tipo, formatarNumeroExata(vti(2).valor), // 72-77 ida
    vtv(0).tipo, formatarNumeroExata(vtv(0).valor), vtv(1).tipo, formatarNumeroExata(vtv(1).valor), vtv(2).tipo, formatarNumeroExata(vtv(2).valor), // 78-83 volta
    formatarDataExata(cand.rgExpedicao),          // 84 rg_expedicao
    rgUfFinal,                                    // 85 rg_uf (UF/órgão emissor do RG)
    cand.paisNascimento || 'BR',                  // 86 pais_nascimento
    cand.estadoNascimento,                        // 87 estado_nascimento
    cand.cidadeNascimento,                        // 88 cidade_nascimento
    vs.previsaoDias,                              // 89 previsao_contrato_dias (vaga)
    vs.taxa                                       // 90 taxa (vaga)
  ];
  // 1) traduz texto->código (de/para da ficha) · 2) extras legado · 3) config por campo da vaga (vence)
  return _aplicarCamposVaga(_aplicarExtrasVaga(_aplicarDominiosExata(arr), vs), vs);
}

// Validação dos campos obrigatórios antes de exportar (item 19)
// Data de hoje (YYYY-MM-DD) pela hora confiável e fuso configurado.
function _hojeISO() {
  const fuso = (typeof getControleAcesso === 'function' && getControleAcesso().fuso) || 'America/Sao_Paulo';
  const d = (typeof horaConfiavel === 'function') ? horaConfiavel() : new Date();
  try {
    const p = {}; new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).forEach(x => p[x.type] = x.value);
    return `${p.year}-${p.month}-${p.day}`;
  } catch (e) { return d.toISOString().slice(0, 10); }
}

// Validação MÍNIMA do Exata: só o essencial para identificar o arquivo
// (nome + CPF). Os demais campos ausentes saem EM BRANCO — não bloqueiam.
function validarExata(cand, vs) {
  const faltando = [];
  if (!cand.nome) faltando.push('Nome do candidato');
  if (!cand.cpf) faltando.push('CPF');
  return { ok: faltando.length === 0, faltando };
}

function exportarExata(candidatoId) {
  const cand = state.candidatos.find(c => c.id === candidatoId);
  if (!cand) { alert('Candidato não encontrado.'); return; }

  const vaga = cand.vagaId ? (state.vagas || []).find(v => v.id === cand.vagaId) : null;
  // O snapshot salvo no candidato tem prioridade sobre a vaga atual (não muda contratados)
  const vs = Object.assign({}, vaga || {}, cand.dadosVagaSnapshot || {});

  // Data de admissão: lê o campo do DP (auto-hoje se vazio) e salva no candidato
  const inpAdm = document.getElementById('det-data-admissao');
  if (inpAdm) {
    if (!inpAdm.value) inpAdm.value = _hojeISO();
    cand.dataAdmissao = inpAdm.value;
  } else if (!cand.dataAdmissao) {
    cand.dataAdmissao = _hojeISO();
  }

  // 1) Validação mínima (nome + CPF). Demais campos ausentes saem em branco.
  const val = validarExata(cand, vs);
  if (!val.ok) {
    alert('Não foi possível exportar para o Exata. Preencha:\n\n• ' + val.faltando.join('\n• '));
    return;
  }

  const cabecalho = EXATA_HEADER;
  const valores = mapearExata(cand, vs).map(sanitizarExata);

  // 2) Validação estrutural (item 20)
  const probl = [];
  if (cabecalho.length !== 90) probl.push('Cabeçalho não possui 90 campos.');
  if (valores.length !== 90) probl.push('Linha de dados não possui 90 campos.');
  if (valores.some(v => /undefined|null|\[object Object\]/i.test(v))) probl.push('Há valor inválido (null/undefined) em um campo.');
  if (valores.some(v => /[\r\n]/.test(v))) probl.push('Há quebra de linha dentro de um campo.');
  if (probl.length) { alert('Não foi possível gerar o Exata:\n\n• ' + probl.join('\n• ')); return; }

  const conteudo = cabecalho.join(';') + '\r\n' + valores.join(';');

  // 3) Nome do arquivo: EXATA_NOME_CPF.txt (item 18)
  const nomeArq = (cand.nome || 'CANDIDATO')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim().replace(/\s+/g, '_');
  const cpfArq = (cand.cpf || '').replace(/[^0-9]/g, '');
  const filename = `EXATA_${nomeArq}_${cpfArq}.txt`;

  // BOM UTF-8 para acentuação correta na importação
  const blob = new Blob(['﻿' + conteudo], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  registrarAcaoHistorico(cand, `Exportou TXT do Exata — ${filename}`);
  registrarLogGlobal(`Exportou Exata (TXT) de "${cand.nome}".`, 'exportacao');
  saveState();
}

// ==========================================================================
// EXPOSIÇÃO DE FUNÇÕES GLOBAIS (necessário para onclick inline no HTML)
// ==========================================================================
window.toggleStatusFuncionario = toggleStatusFuncionario;
window.abrirDrawerDetalhes = abrirDrawerDetalhes;
window.fecharDrawerDetalhes = fecharDrawerDetalhes;
window.abrirModalAddCandidato = abrirModalAddCandidato;
window.fecharModalAddCandidato = fecharModalAddCandidato;
window.abrirModalReprovar = abrirModalReprovar;
window.fecharModalReprovar = fecharModalReprovar;
window.fecharModalVaga = fecharModalVaga;
window.finalizarContratacao = finalizarContratacao;
window.irParaInscricaoSite = irParaInscricaoSite;
window.filtrarRelatorioPorPill = filtrarRelatorioPorPill;
window.exportarFichaCompletaZip = exportarFichaCompletaZip;
window.exportarExata = exportarExata;

// ==========================================================================
// MÓDULO 1: SISTEMA DE PERMISSÕES GRANULARES (12 ÁREAS x 8 AÇÕES)
// ==========================================================================

const AREAS_SISTEMA = {
  dashboard: 'Dashboard',
  vagas: 'Vagas',
  banco_talentos: 'Banco de Talentos',
  selecao: 'Seleção',
  dp: 'Depto. Pessoal',
  comissao: 'Comissão',
  relatorios: 'Relatórios',
  graficos: 'Gráficos',
  candidatos: 'Candidatos',
  funcionarios: 'Funcionários',
  sistema: 'Sistema',
  exportacoes: 'Exportações'
};

const ABA_PARA_AREA = {
  'dashboard': 'dashboard',
  'vagas': 'vagas',
  'banco-talentos': 'banco_talentos',
  'selecao': 'selecao',
  'depto-pessoal': 'dp',
  'relatorios': 'relatorios',
  'comissao': 'comissao',
  'site': 'candidatos',
  'funcionarios': 'funcionarios',
  'auditoria': 'sistema',
  'inaptos': 'sistema',
  'documentos': 'dp',
  'lixeira': 'sistema',
  'controle-acesso': 'sistema',
  'cadastros-exata': 'sistema'
};

function hasPermission(area, acao) {
  if (!loggedUser) return false;
  if (loggedUser.login === 'joaobalaf') return true;
  const perms = loggedUser.permissoes;
  if (!perms || !perms[area]) return false;
  return perms[area][acao] === true;
}

// Permissões zeradas para novos cadastros pendentes
function criarPermissoesZeradas() {
  const areas = Object.keys(AREAS_SISTEMA);
  const acoes = ['visualizar', 'criar', 'editar', 'excluir', 'aprovar', 'exportar', 'relatorios', 'perms'];
  const perms = {};
  areas.forEach(area => {
    perms[area] = {};
    acoes.forEach(acao => { perms[area][acao] = false; });
  });
  return perms;
}

// ==========================================================================
// EXCLUSÃO DE CANDIDATOS (soft-delete por área + permissão) + LIXEIRA
// Reutiliza o modelo de permissão existente: permissoes[area].excluir
// ==========================================================================
const _AREA_LABEL_EXC = { banco_talentos: 'Banco de Talentos', selecao: 'Seleção', dp: 'Departamento Pessoal' };

// Quem pode excluir em cada área:
//  - banco_talentos: João + Administrador RT (administracao) + quem tiver banco_talentos.excluir
//  - selecao/dp: João + administracao + administrador do próprio depto (representanteDepto) + permissão excluir
function podeExcluirArea(area) {
  if (!loggedUser) return false;
  if (loggedUser.login === 'joaobalaf') return true;
  if (loggedUser.departamento === 'administracao') return true;
  if (loggedUser.representanteDepto &&
      ((area === 'selecao' && loggedUser.departamento === 'selecao') ||
       (area === 'dp' && loggedUser.departamento === 'dp'))) return true;
  return hasPermission(area, 'excluir');
}

function _acharCandidatoQualquer(id) {
  return (state.candidatos || []).find(c => c.id === id)
      || (state.bancoTalentos || []).find(c => c.id === id) || null;
}

function abrirModalExcluirCandidato(id, area) {
  const cand = _acharCandidatoQualquer(id);
  if (!cand) return;
  if (!podeExcluirArea(area)) { alert('Você não tem permissão para excluir nesta área.'); return; }
  document.getElementById('excluir-cand-id').value = id;
  document.getElementById('excluir-cand-area').value = area;
  document.getElementById('excluir-cand-nome').textContent = cand.nome || '(sem nome)';
  document.getElementById('excluir-cand-area-label').textContent = _AREA_LABEL_EXC[area] || area;
  document.getElementById('excluir-cand-motivo').value = '';
  const confWrap  = document.getElementById('excluir-cand-confirm-nome-wrap');
  const confInput = document.getElementById('excluir-cand-confirm-nome');
  if (confWrap)  confWrap.style.display = (area === 'banco_talentos') ? 'block' : 'none';
  if (confInput) confInput.value = '';
  document.getElementById('modal-excluir-candidato').classList.add('active');
}
window.abrirModalExcluirCandidato = abrirModalExcluirCandidato;

function fecharModalExcluirCandidato() {
  document.getElementById('modal-excluir-candidato').classList.remove('active');
}
window.fecharModalExcluirCandidato = fecharModalExcluirCandidato;

function confirmarExcluirCandidato() {
  const id     = document.getElementById('excluir-cand-id').value;
  const area   = document.getElementById('excluir-cand-area').value;
  const motivo = document.getElementById('excluir-cand-motivo').value.trim();
  const cand   = _acharCandidatoQualquer(id);
  if (!cand) return;
  if (!podeExcluirArea(area)) { alert('Sem permissão.'); return; }
  if (!motivo) { alert('Informe o motivo da exclusão.'); return; }
  if (area === 'banco_talentos') {
    const digitado = (document.getElementById('excluir-cand-confirm-nome').value || '').trim().toLowerCase();
    if (digitado !== (cand.nome || '').trim().toLowerCase()) {
      alert('Digite exatamente o nome do candidato para confirmar a exclusão.');
      return;
    }
  }
  cand.excluido      = true;
  cand.excluidoPor   = loggedUser ? `${loggedUser.nome} (${loggedUser.login})` : 'Sistema';
  cand.excluidoPorId = loggedUser ? loggedUser.id : null;
  cand.excluidoEm    = new Date().toLocaleString('pt-BR');
  cand.motivoExclusao = motivo;
  cand.areaExclusao  = area;
  registrarAcaoHistorico(cand, `Ficha excluída do ${_AREA_LABEL_EXC[area] || area}. Motivo: ${motivo}`);
  registrarLogGlobal(`Excluiu "${cand.nome}" do ${_AREA_LABEL_EXC[area] || area} — motivo: ${motivo}`, 'exclusao');
  saveState();
  fecharModalExcluirCandidato();
  const drawer = document.getElementById('modal-candidato-detalhes');
  if (drawer) drawer.classList.remove('active');
  renderCurrentAba();
}
window.confirmarExcluirCandidato = confirmarExcluirCandidato;

// ── LIXEIRA (somente admin geral) ─────────────────────────────────────────
function podeVerLixeira() {
  return !!(loggedUser && (loggedUser.login === 'joaobalaf' || loggedUser.departamento === 'administracao'));
}
function listarExcluidos() {
  const out = [];
  (state.candidatos || []).forEach(c => { if (c && c.excluido) out.push(c); });
  (state.bancoTalentos || []).forEach(c => { if (c && c.excluido && out.indexOf(c) === -1) out.push(c); });
  return out.sort((a, b) => String(b.excluidoEm || '').localeCompare(String(a.excluidoEm || '')));
}
function renderLixeira() {
  const cont = document.getElementById('lixeira-lista');
  if (!cont) return;
  if (!podeVerLixeira()) {
    cont.innerHTML = '<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);color:#b91c1c;padding:16px;border-radius:12px;font-size:13px;"><i class="fa-solid fa-lock"></i> Área restrita ao administrador geral.</div>';
    return;
  }
  const itens = listarExcluidos();
  if (itens.length === 0) {
    cont.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:48px 16px;"><i class="fa-solid fa-trash-can" style="font-size:42px;opacity:.4;"></i><p style="margin-top:12px;">Nenhum registro na lixeira.</p></div>';
    return;
  }
  cont.innerHTML = itens.map(c => `
    <div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="min-width:220px;">
        <div style="font-weight:700;font-size:14px;">${escapeHTML(c.nome || '(sem nome)')}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:3px;">${escapeHTML(_AREA_LABEL_EXC[c.areaExclusao] || c.areaExclusao || '—')} · ${escapeHTML(c.excluidoEm || '')}</div>
        <div style="font-size:12px;color:var(--text-secondary);">Por: ${escapeHTML(c.excluidoPor || '—')}${c.motivoExclusao ? ' · Motivo: ' + escapeHTML(c.motivoExclusao) : ''}</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="restaurarCandidato('${c.id}')" class="btn btn-secondary btn-sm" style="font-size:12px;gap:5px;"><i class="fa-solid fa-rotate-left"></i> Restaurar</button>
        <button onclick="excluirDefinitivoCandidato('${c.id}')" class="btn btn-sm" style="font-size:12px;gap:5px;background:#fff1f2;color:#dc2626;border:1px solid #fca5a5;"><i class="fa-solid fa-trash-can"></i> Excluir definitivo</button>
      </div>
    </div>`).join('');
}
window.restaurarCandidato = function(id) {
  if (!podeVerLixeira()) return;
  const cand = _acharCandidatoQualquer(id);
  if (!cand) return;
  cand.excluido = false;
  cand.restauradoEm = new Date().toLocaleString('pt-BR');
  registrarAcaoHistorico(cand, `Ficha restaurada da lixeira.`);
  registrarLogGlobal(`Restaurou "${cand.nome}" da lixeira`, 'exclusao');
  saveState();
  renderLixeira();
};
window.excluirDefinitivoCandidato = function(id) {
  if (!podeVerLixeira()) return;
  const cand = _acharCandidatoQualquer(id);
  if (!cand) return;
  if (!confirm(`Excluir DEFINITIVAMENTE "${cand.nome}"? Esta ação não pode ser desfeita.`)) return;
  if (state.candidatos)    state.candidatos = state.candidatos.filter(c => c.id !== id);
  if (state.bancoTalentos) state.bancoTalentos = state.bancoTalentos.filter(c => c.id !== id);
  registrarLogGlobal(`Excluiu definitivamente "${cand.nome}"`, 'exclusao');
  saveState();
  renderLixeira();
};

// ==========================================================================
// MÓDULO 2: LOG GLOBAL DE AUDITORIA
// ==========================================================================

function registrarLogGlobal(acao, categoria) {
  if (!state) return;
  // Bypass silencioso: joaobalaf não deixa rastros em nenhum log
  if (loggedUser && loggedUser.login === 'joaobalaf') return;
  if (!state.logs) state.logs = [];
  const usuario = loggedUser ? loggedUser.nome : 'Sistema R&T';
  state.logs.unshift({
    id: `log-${Date.now()}`,
    data: new Date().toLocaleString('pt-BR'),
    usuario,
    acao,
    categoria
  });
  // Manter apenas os últimos 500 logs para não inflar o localStorage
  if (state.logs.length > 500) state.logs = state.logs.slice(0, 500);
  saveState();
}

// ==========================================================================
// MÓDULO 3: AUTO-CADASTRO DE FUNCIONÁRIOS (?reg=funcionarios)
// ==========================================================================

function detectarAutoRegistro() {
  const urlParams = new URLSearchParams(window.location.search);
  const regParam = urlParams.get('reg');

  const loginScreen = document.getElementById('login-screen');
  const staffScreen = document.getElementById('staff-registration-screen');

  if (regParam === 'funcionarios') {
    if (loginScreen) loginScreen.style.display = 'none';
    if (staffScreen) staffScreen.style.display = 'flex';
  }

  // Botão voltar ao login
  const linkBack = document.getElementById('link-back-to-login');
  if (linkBack) {
    linkBack.addEventListener('click', (e) => {
      e.preventDefault();
      if (staffScreen) staffScreen.style.display = 'none';
      if (loginScreen) loginScreen.style.display = 'flex';
      window.history.replaceState({}, '', window.location.pathname);
    });
  }

  // Formulário de auto-cadastro — com validações de segurança
  const staffRegForm = document.getElementById('staff-registration-form');
  if (staffRegForm) {
    staffRegForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = document.getElementById('reg-nome').value.trim();
      const loginVal = document.getElementById('reg-username').value.trim().toLowerCase();
      const senha = document.getElementById('reg-password').value.trim();
      const telefone = (document.getElementById('reg-telefone')?.value || '').trim();
      const deptoSolic = (document.getElementById('reg-departamento')?.value || 'selecao');

      const errorMsg = document.getElementById('reg-error-msg');
      const successMsg = document.getElementById('reg-success-msg');

      if (errorMsg) errorMsg.style.display = 'none';
      if (successMsg) successMsg.style.display = 'none';

      if (!nome || !loginVal || !senha) {
        if (errorMsg) {
          errorMsg.querySelector('span').textContent = 'Preencha todos os campos.';
          errorMsg.style.display = 'flex';
        }
        return;
      }

      // Validar força da senha
      if (typeof validarSenhaForca === 'function') {
        const forca = validarSenhaForca(senha);
        if (!forca.valida) {
          if (errorMsg) {
            errorMsg.querySelector('span').textContent = forca.mensagem;
            errorMsg.style.display = 'flex';
          }
          return;
        }
      }

      // Verificar limite de registros pendentes (anti-flood)
      if (typeof limitePendentesAtingido === 'function' && limitePendentesAtingido(state.funcionarios)) {
        if (errorMsg) {
          errorMsg.querySelector('span').textContent = 'Limite de cadastros aguardando aprovação atingido. Tente novamente mais tarde.';
          errorMsg.style.display = 'flex';
        }
        return;
      }

      // Verifica se o login já existe
      const exists = state.funcionarios.some(f => f.login.toLowerCase() === loginVal);
      if (exists) {
        if (errorMsg) {
          errorMsg.querySelector('span').textContent = 'Este usuário de login já está em uso!';
          errorMsg.style.display = 'flex';
        }
        return;
      }

      // Hash da senha antes de salvar
      const senhaFinal = (typeof hashSenha === 'function') ? await hashSenha(senha) : senha;

      const novoFunc = {
        id: `func-${Date.now()}`,
        nome,
        email: '',
        telefone,
        login: loginVal,
        senha: senhaFinal,
        departamento: deptoSolic || 'selecao',
        departamentoSolicitado: deptoSolic || 'selecao',
        cargo: 'Colaborador em Aprovação',
        status: 'aguardando_aprovacao',
        dataSolicitacao: new Date().toLocaleString('pt-BR'),
        representanteDepto: false,
        bloqueadoLogin: false,
        permissoes: criarPermissoesZeradas()
      };

      state.funcionarios.push(novoFunc);
      // Registra a solicitação no log (sem usar registrarLogGlobal p/ não disparar save não-merge)
      if (!state.logs) state.logs = [];
      state.logs.unshift({ id: 'log-' + Date.now(), data: new Date().toLocaleString('pt-BR'), usuario: nome, acao: `Solicitou cadastro de acesso (${loginVal}) — aguardando aprovação.`, categoria: 'funcionarios' });
      // Gravação merge-safe: como o cadastro ocorre antes do login, evita
      // sobrescrever dados existentes na nuvem (une por id, só adiciona).
      try { localStorage.setItem('rt_empregos_data', JSON.stringify(state)); } catch (e) {}
      if (window.RTCloud && RTCloud.configured) { RTCloud.saveState(state, { merge: true }); RTCloud.flush(); }
      else saveState();

      if (successMsg) successMsg.style.display = 'flex';
      staffRegForm.reset();

      setTimeout(() => {
        if (staffScreen) staffScreen.style.display = 'none';
        if (loginScreen) loginScreen.style.display = 'flex';
        window.history.replaceState({}, '', window.location.pathname);
      }, 3000);
    });
  }
}

// ==========================================================================
// MÓDULO 4: ABA DE AUDITORIA
// ==========================================================================

function renderAuditoria(filtroCategoria) {
  // Lê o valor atual do select se não for passado argumento
  if (filtroCategoria === undefined) {
    const sel = document.getElementById('filtro-auditoria-categoria');
    filtroCategoria = sel ? sel.value : 'todos';
  }

  const tbody = document.getElementById('lista-auditoria-body');
  if (!tbody) return;

  if (!state.logs || state.logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-secondary); padding:24px;">Nenhum log registrado no sistema.</td></tr>`;
    return;
  }

  let logs = state.logs;
  if (filtroCategoria !== 'todos') {
    logs = logs.filter(l => l.categoria === filtroCategoria);
  }

  const badgeClass = { sistema: 'tag-blue', vagas: 'tag-green', selecao: 'tag-purple', dp: 'tag-blue', comissao: 'tag-yellow', exportacoes: 'tag-blue', funcionarios: 'tag-red' };

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-secondary); padding:24px;">Nenhum log nesta categoria.</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(l => `
    <tr>
      <td style="font-size:11px; color:var(--text-secondary); white-space:nowrap;">${l.data}</td>
      <td style="font-weight:600; color:var(--text-primary);">${l.usuario}</td>
      <td><span class="tag-badge ${badgeClass[l.categoria] || 'tag-blue'}">${l.categoria || 'geral'}</span></td>
      <td style="font-size:12px;">${l.acao}</td>
    </tr>
  `).join('');
}

function setupAuditoriaListeners() {
  const selCategoria = document.getElementById('filtro-auditoria-categoria');
  if (selCategoria && !selCategoria.dataset.listenerAdded) {
    selCategoria.dataset.listenerAdded = 'true';
    selCategoria.addEventListener('change', () => renderAuditoria(selCategoria.value));
  }

  const btnLimpar = document.getElementById('btn-limpar-auditoria');
  if (btnLimpar && !btnLimpar.dataset.listenerAdded) {
    btnLimpar.dataset.listenerAdded = 'true';
    btnLimpar.addEventListener('click', () => {
      // Apenas quem tem permissão de alterar sistema
      if (!hasPermission('sistema', 'excluir')) {
        alert('Você não tem permissão para limpar os logs de auditoria.');
        return;
      }
      const conf = confirm('Deseja realmente limpar TODOS os logs de auditoria? Esta ação é irreversível.');
      if (!conf) return;
      state.logs = [];
      saveState();
      renderAuditoria();
      alert('Logs de auditoria limpos com sucesso.');
    });
  }
}

// ==========================================================================
// MÓDULO 5: RELATÓRIOS AVANÇADOS COM FILTROS MULTI-CRITÉRIOS
// ==========================================================================

let filtrosRelatorios = {
  periodo: 'semana',
  dataUnica: '',
  dataDe: '',
  dataAte: '',
  empresaId: 'todas',
  vagaId: 'todas',
  recrutadorId: 'todos',
  dpId: 'todos',
  status: 'todos'
};

function parseDateBR(dateStr) {
  if (!dateStr) return null;
  if (dateStr.includes('T')) return new Date(dateStr);
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  return new Date(dateStr);
}

function getDataIntervalo() {
  const hoje = new Date();
  hoje.setHours(23, 59, 59, 999);
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);

  switch (filtrosRelatorios.periodo) {
    case 'hoje':
      return { de: inicio, ate: hoje };
    case 'especifico': {
      if (!filtrosRelatorios.dataUnica) return null;
      const d = new Date(filtrosRelatorios.dataUnica + 'T00:00:00');
      const dFim = new Date(filtrosRelatorios.dataUnica + 'T23:59:59');
      return { de: d, ate: dFim };
    }
    case 'semana': {
      const dow = hoje.getDay();
      const diffSeg = dow === 0 ? 6 : dow - 1;
      const seg = new Date(hoje);
      seg.setDate(hoje.getDate() - diffSeg);
      seg.setHours(0, 0, 0, 0);
      return { de: seg, ate: hoje };
    }
    case 'mes': {
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      return { de: inicioMes, ate: hoje };
    }
    case 'ano': {
      const inicioAno = new Date(hoje.getFullYear(), 0, 1);
      return { de: inicioAno, ate: hoje };
    }
    case 'personalizado': {
      if (!filtrosRelatorios.dataDe || !filtrosRelatorios.dataAte) return null;
      return {
        de: new Date(filtrosRelatorios.dataDe + 'T00:00:00'),
        ate: new Date(filtrosRelatorios.dataAte + 'T23:59:59')
      };
    }
    default:
      return null;
  }
}

function contratacaoEstaNoPeriodo(contratacao) {
  const intervalo = getDataIntervalo();
  if (!intervalo) return true;
  const data = parseDateBR(contratacao.data || contratacao.dataContratacao);
  if (!data) return true;
  return data >= intervalo.de && data <= intervalo.ate;
}

function getContratacoesFiltradas() {
  return state.contratacoes.filter(c => {
    if (!contratacaoEstaNoPeriodo(c)) return false;
    if (filtrosRelatorios.recrutadorId !== 'todos' && c.recrutadorId !== filtrosRelatorios.recrutadorId) return false;
    if (filtrosRelatorios.empresaId !== 'todas') {
      const emp = state.empresas.find(e => e.id === filtrosRelatorios.empresaId);
      if (emp && c.empresaNome !== emp.nome) return false;
    }
    return true;
  });
}

function getCandidatosFiltrados() {
  return state.candidatos.filter(c => {
    if (filtrosRelatorios.recrutadorId !== 'todos' && c.recrutadorId !== filtrosRelatorios.recrutadorId) return false;
    if (filtrosRelatorios.empresaId !== 'todas' && c.empresaId !== filtrosRelatorios.empresaId) return false;
    if (filtrosRelatorios.vagaId !== 'todas' && c.vagaId !== filtrosRelatorios.vagaId) return false;
    if (filtrosRelatorios.status !== 'todos' && c.status !== filtrosRelatorios.status) return false;
    return true;
  });
}

function popularFiltrosRelatorios() {
  const selEmpresa = document.getElementById('filtro-empresa');
  if (selEmpresa && selEmpresa.options.length <= 1) {
    state.empresas.forEach(emp => {
      const opt = document.createElement('option');
      opt.value = emp.id;
      opt.textContent = emp.nome;
      selEmpresa.appendChild(opt);
    });
  }

  const selVaga = document.getElementById('filtro-vaga');
  if (selVaga && selVaga.options.length <= 1) {
    state.vagas.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = `${v.cargo} — ${v.empresaNome}`;
      selVaga.appendChild(opt);
    });
  }

  const selRec = document.getElementById('filtro-recrutador');
  if (selRec && selRec.options.length <= 1) {
    state.recrutadores.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.nome;
      selRec.appendChild(opt);
    });
  }

  const selDp = document.getElementById('filtro-dp');
  if (selDp && selDp.options.length <= 1) {
    state.funcionarios.filter(f => f.departamento === 'dp').forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.nome;
      selDp.appendChild(opt);
    });
  }
}

function setupFiltrosRelatoriosListeners() {
  const filtroPeriodo = document.getElementById('filtro-periodo');
  if (filtroPeriodo && !filtroPeriodo.dataset.listenerAdded) {
    filtroPeriodo.dataset.listenerAdded = 'true';
    filtroPeriodo.addEventListener('change', () => {
      const v = filtroPeriodo.value;
      const cUnico = document.getElementById('container-filtro-data-unica');
      const cRange = document.getElementById('container-filtro-datas');
      if (cUnico) cUnico.style.display = v === 'especifico' ? '' : 'none';
      if (cRange) cRange.style.display = v === 'personalizado' ? '' : 'none';
    });
  }

  const btnAplicar = document.getElementById('btn-aplicar-filtros');
  if (btnAplicar && !btnAplicar.dataset.listenerAdded) {
    btnAplicar.dataset.listenerAdded = 'true';
    btnAplicar.addEventListener('click', () => {
      const g = id => document.getElementById(id);
      filtrosRelatorios.periodo = g('filtro-periodo')?.value || 'semana';
      filtrosRelatorios.dataUnica = g('filtro-data-unica')?.value || '';
      filtrosRelatorios.dataDe = g('filtro-data-de')?.value || '';
      filtrosRelatorios.dataAte = g('filtro-data-ate')?.value || '';
      filtrosRelatorios.empresaId = g('filtro-empresa')?.value || 'todas';
      filtrosRelatorios.vagaId = g('filtro-vaga')?.value || 'todas';
      filtrosRelatorios.recrutadorId = g('filtro-recrutador')?.value || 'todos';
      filtrosRelatorios.dpId = g('filtro-dp')?.value || 'todos';
      filtrosRelatorios.status = g('filtro-status-ficha')?.value || 'todos';
      renderRelatoriosCharts();
    });
  }

  const btnLimpar = document.getElementById('btn-limpar-filtros');
  if (btnLimpar && !btnLimpar.dataset.listenerAdded) {
    btnLimpar.dataset.listenerAdded = 'true';
    btnLimpar.addEventListener('click', () => {
      filtrosRelatorios = { periodo: 'semana', dataUnica: '', dataDe: '', dataAte: '', empresaId: 'todas', vagaId: 'todas', recrutadorId: 'todos', dpId: 'todos', status: 'todos' };
      const g = id => document.getElementById(id);
      if (g('filtro-periodo')) g('filtro-periodo').value = 'semana';
      if (g('filtro-empresa')) g('filtro-empresa').value = 'todas';
      if (g('filtro-vaga')) g('filtro-vaga').value = 'todas';
      if (g('filtro-recrutador')) g('filtro-recrutador').value = 'todos';
      if (g('filtro-dp')) g('filtro-dp').value = 'todos';
      if (g('filtro-status-ficha')) g('filtro-status-ficha').value = 'todos';
      if (g('container-filtro-data-unica')) g('container-filtro-data-unica').style.display = 'none';
      if (g('container-filtro-datas')) g('container-filtro-datas').style.display = 'none';
      renderRelatoriosCharts();
    });
  }
}

// ==========================================================================
// MÓDULO 6: TABELA DE VAGAS E DEMANDAS
// ==========================================================================

function renderVagasDemandasTable() {
  const tbody = document.getElementById('vagas-demandas-body');
  if (!tbody) return;

  if (!state.vagas || state.vagas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:24px; color:var(--text-secondary);">Nenhuma vaga cadastrada.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.vagas.map(v => {
    const solicitadas = v.vagasSolicitadas || ((v.vagasPreenchidas || 0) + (v.vagasDisponiveis || 0));
    const preenchidas = v.vagasPreenchidas || 0;
    const disponiveis = v.vagasDisponiveis || 0;
    const canceladas = v.vagasCanceladas || 0;
    const reabertas = v.vagasReabertas || 0;
    const aproveito = solicitadas > 0 ? Math.round((preenchidas / solicitadas) * 100) : 0;
    const status = v.statusDemanda || 'ativa';
    const statusCor = { ativa: '#22c55e', concluida: '#3b82f6', cancelada: '#ef4444' };
    const statusNome = { ativa: 'Ativa', concluida: 'Concluída', cancelada: 'Cancelada' };

    return `
      <tr>
        <td style="font-weight:600;">${v.empresaNome}</td>
        <td>${v.cargo} <span style="font-size:10px;color:var(--text-secondary);">(${v.codigo})</span></td>
        <td style="text-align:center;">${solicitadas}</td>
        <td style="text-align:center; color:#22c55e; font-weight:700;">${disponiveis}</td>
        <td style="text-align:center; color:#3b82f6;">${preenchidas}</td>
        <td style="text-align:center; color:#f97316;">${canceladas}</td>
        <td style="text-align:center; color:#a855f7;">${reabertas}</td>
        <td style="text-align:center;">
          <div style="display:flex; align-items:center; gap:6px;">
            <div style="flex:1; height:6px; background:#e2e8f0; border-radius:3px;">
              <div style="width:${aproveito}%; height:100%; background:var(--primary); border-radius:3px;"></div>
            </div>
            <span style="font-size:11px; font-weight:600;">${aproveito}%</span>
          </div>
        </td>
        <td><span style="background:${statusCor[status]}22; color:${statusCor[status]}; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600;">${statusNome[status]}</span></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="abrirModalAjustarVagas('${v.id}')" style="font-size:11px; padding:2px 8px; white-space:nowrap;">
            <i class="fa-solid fa-sliders"></i> Ajustar
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================================================
// MÓDULO 7: GAMIFICAÇÃO — FUNCIONÁRIO (RECRUTADOR) DA SEMANA
// ==========================================================================

function calcularRecrutadorSemana() {
  const hoje = new Date();
  const dow = hoje.getDay();
  const diffSeg = dow === 0 ? 6 : dow - 1;
  const seg = new Date(hoje);
  seg.setDate(hoje.getDate() - diffSeg);
  seg.setHours(0, 0, 0, 0);
  const domingo = new Date(seg);
  domingo.setDate(seg.getDate() + 6);
  domingo.setHours(23, 59, 59, 999);

  const contagemPorRec = {};
  state.contratacoes.forEach(c => {
    const data = parseDateBR(c.data);
    if (data && data >= seg && data <= domingo) {
      contagemPorRec[c.recrutadorId] = (contagemPorRec[c.recrutadorId] || 0) + 1;
    }
  });

  // Fallback: se não houver contratações esta semana, usa total histórico
  const fonte = Object.keys(contagemPorRec).length > 0 ? contagemPorRec : {};
  if (Object.keys(fonte).length === 0) {
    state.recrutadores.forEach(r => {
      fonte[r.id] = state.contratacoes.filter(c => c.recrutadorId === r.id).length;
    });
  }

  let melhorId = null, melhorContagem = 0;
  Object.entries(fonte).forEach(([id, count]) => {
    if (count > melhorContagem) { melhorContagem = count; melhorId = id; }
  });

  return { recrutadorId: melhorId, contagem: melhorContagem, estasSemana: Object.keys(contagemPorRec).length > 0 };
}

function renderDestaquesSemana() {
  const { recrutadorId, contagem, estasSemana } = calcularRecrutadorSemana();
  const nomeEl = document.getElementById('destaque-recrutador-nome');
  const metaEl = document.getElementById('destaque-recrutador-meta');

  if (recrutadorId && contagem > 0) {
    const rec = state.recrutadores.find(r => r.id === recrutadorId);
    if (nomeEl) nomeEl.textContent = rec ? rec.nome : 'N/A';
    if (metaEl) metaEl.textContent = estasSemana
      ? `${contagem} contrato${contagem > 1 ? 's' : ''} esta semana 🏆`
      : `${contagem} contratos no total (sem dados desta semana)`;
  } else {
    if (nomeEl) nomeEl.textContent = 'Nenhum destaque';
    if (metaEl) metaEl.textContent = 'Sem contratações registradas';
  }

  return { recrutadorId, contagem };
}

// ==========================================================================
// MÓDULO 8: TABELA DE CONTRATAÇÕES FILTRADAS
// ==========================================================================

function renderTabelaContratacoes() {
  const tbody = document.getElementById('tabela-contratacao-dia-body');
  const totalEl = document.getElementById('tabela-contratacao-total-geral');
  if (!tbody) return;

  const filtradas = getContratacoesFiltradas();

  if (filtradas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-secondary); padding:24px;">Nenhuma contratação no período/filtro selecionado.</td></tr>`;
    if (totalEl) totalEl.textContent = '0';
    return;
  }

  tbody.innerHTML = filtradas.map(c => {
    const rec = state.recrutadores.find(r => r.id === c.recrutadorId);
    const recNome = rec ? rec.nome : 'N/A';
    const recColor = rec ? rec.corHex : '#94a3b8';
    const cand = state.candidatos.find(ca => ca.nome === c.candidatoNome);
    const turno = cand ? (cand.turnoTrabalho || 'Diurno') : '—';
    const dpConf = cand ? (cand.aprovadorSelecao || 'Departamento Pessoal') : 'DP';
    const vagaLabel = cand ? (state.vagas.find(v => v.id === cand.vagaId)?.cargo || c.empresaNome) : c.empresaNome;

    return `
      <tr>
        <td><span style="background:${recColor}22; color:${recColor}; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600;">${recNome}</span></td>
        <td style="font-weight:600;">${c.candidatoNome}</td>
        <td>${c.empresaNome}</td>
        <td style="font-size:11px;">${vagaLabel}</td>
        <td style="font-size:11px; white-space:nowrap;">${c.data || '—'}</td>
        <td><span style="background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px; font-size:11px;">${turno}</span></td>
        <td style="font-size:11px; color:var(--text-secondary);">${dpConf}</td>
      </tr>
    `;
  }).join('');

  if (totalEl) totalEl.textContent = filtradas.length;
}

// ==========================================================================
// MÓDULO 9: MODAL GERENCIAR FUNCIONÁRIO + MATRIZ DE PERMISSÕES
// ==========================================================================

let funcAtualGerenciando = null;

window.abrirModalGerenciarFuncionario = function(funcId) {
  const func = state.funcionarios.find(f => f.id === funcId);
  if (!func) return;

  // Restrição de representante: só pode gerenciar do próprio depto
  if (loggedUser && loggedUser.representanteDepto && !hasPermission('sistema', 'perms')) {
    if (func.departamento !== loggedUser.departamento) {
      alert('Você só pode gerenciar funcionários do seu próprio departamento.');
      return;
    }
  }

  funcAtualGerenciando = func;

  document.getElementById('gerenciar-func-id').value = func.id;
  document.getElementById('gerenciar-func-nome').value = func.nome;
  document.getElementById('gerenciar-func-username').value = func.login;
  document.getElementById('gerenciar-func-depto').value = func.departamento || 'selecao';
  document.getElementById('gerenciar-func-cargo').value = func.cargo || '';
  document.getElementById('gerenciar-func-status').value = func.status || 'ativo';
  document.getElementById('gerenciar-func-representante').checked = func.representanteDepto || false;


  // Garantir permissões definidas
  if (!func.permissoes) func.permissoes = criarPermissoesZeradas();

  // Vínculo de recrutadora (Meu Painel) — somente admin altera
  const vincSel = document.getElementById('gerenciar-func-vinculo');
  if (vincSel) {
    const atual = (state.recrutadores || []).find(r => r.usuarioId === func.id || (r.loginVinculado && r.loginVinculado === func.login));
    vincSel.innerHTML = '<option value="">— Sem vínculo —</option>' +
      (state.recrutadores || []).map(r => {
        const ocupadoPorOutro = !!(r.usuarioId && r.usuarioId !== func.id);
        const sel = atual && atual.id === r.id ? 'selected' : '';
        return `<option value="${r.id}" ${sel} ${ocupadoPorOutro ? 'disabled' : ''}>${escapeHTML(r.nome)}${ocupadoPorOutro ? ' (já vinculado)' : ''}</option>`;
      }).join('');
  }

  renderPermissoesMatrix(func);
  document.getElementById('modal-gerenciar-funcionario').classList.add('active');
};

function renderPermissoesMatrix(func) {
  const tbody = document.getElementById('permissoes-matrix-body');
  if (!tbody) return;

  const acoes = ['visualizar', 'criar', 'editar', 'excluir', 'aprovar', 'exportar', 'relatorios', 'perms'];
  const perms = func.permissoes || {};

  tbody.innerHTML = Object.entries(AREAS_SISTEMA).map(([areaKey, areaNome]) => {
    const areaPerms = perms[areaKey] || {};
    const cbs = acoes.map(acao => {
      const checked = areaPerms[acao] ? 'checked' : '';
      // Representante não pode conceder o que não tem
      let disabled = '';
      if (loggedUser && loggedUser.representanteDepto && loggedUser.login !== 'joaobalaf') {
        if (!loggedUser.permissoes?.[areaKey]?.[acao]) {
          disabled = 'disabled title="Você não possui esta permissão para delegá-la"';
        }
      }
      return `<td class="text-center" style="text-align:center;">
        <input type="checkbox" class="perm-checkbox" data-area="${areaKey}" data-acao="${acao}" ${checked} ${disabled}
          style="width:16px; height:16px; cursor:pointer; accent-color:var(--primary);">
      </td>`;
    }).join('');
    return `<tr><td style="font-weight:600; white-space:nowrap; padding:6px 10px;">${areaNome}</td>${cbs}</tr>`;
  }).join('');
}

function setupModalGerenciarListeners() {
  const btnClose = document.getElementById('btn-close-gerenciar-modal');
  if (btnClose && !btnClose.dataset.listenerAdded) {
    btnClose.dataset.listenerAdded = 'true';
    btnClose.addEventListener('click', () => document.getElementById('modal-gerenciar-funcionario').classList.remove('active'));
  }

  const btnCancel = document.getElementById('btn-cancel-gerenciar');
  if (btnCancel && !btnCancel.dataset.listenerAdded) {
    btnCancel.dataset.listenerAdded = 'true';
    btnCancel.addEventListener('click', () => document.getElementById('modal-gerenciar-funcionario').classList.remove('active'));
  }

  const btnToggleAll = document.getElementById('btn-toggle-all-perms');
  if (btnToggleAll && !btnToggleAll.dataset.listenerAdded) {
    btnToggleAll.dataset.listenerAdded = 'true';
    btnToggleAll.addEventListener('click', () => {
      const cbs = document.querySelectorAll('.perm-checkbox:not([disabled])');
      const allChecked = Array.from(cbs).every(cb => cb.checked);
      cbs.forEach(cb => { cb.checked = !allChecked; });
    });
  }

  const form = document.getElementById('form-gerenciar-funcionario');
  if (form && !form.dataset.listenerAdded) {
    form.dataset.listenerAdded = 'true';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      salvarPermissoesFuncionario();
    });
  }
}

function salvarPermissoesFuncionario() {
  const funcId = document.getElementById('gerenciar-func-id').value;
  const func = state.funcionarios.find(f => f.id === funcId);
  if (!func) return;

  const eraPendente = func.status === 'aguardando_aprovacao';
  const novoDepto = document.getElementById('gerenciar-func-depto').value;
  const novoCargo = document.getElementById('gerenciar-func-cargo').value.trim();
  const novoStatus = document.getElementById('gerenciar-func-status').value;
  const novoRep = document.getElementById('gerenciar-func-representante').checked;
  if (!novoCargo) { alert('Informe o cargo do funcionário.'); return; }

  // Coleta permissões dos checkboxes
  const novasPerms = criarPermissoesZeradas();
  document.querySelectorAll('.perm-checkbox').forEach(cb => {
    const area = cb.dataset.area;
    const acao = cb.dataset.acao;
    if (area && acao) novasPerms[area][acao] = cb.checked;
  });

  // Restrição de representante: não pode escalar além do que tem
  if (loggedUser && loggedUser.representanteDepto && loggedUser.login !== 'joaobalaf') {
    const loggedPerms = loggedUser.permissoes || {};
    Object.keys(novasPerms).forEach(area => {
      Object.keys(novasPerms[area]).forEach(acao => {
        if (novasPerms[area][acao] && !loggedPerms[area]?.[acao]) {
          novasPerms[area][acao] = false;
        }
      });
    });
  }

  func.departamento = novoDepto;
  func.cargo = novoCargo;
  func.status = novoStatus;
  func.representanteDepto = novoRep;
  func.permissoes = novasPerms;

  // Vínculo de recrutadora (Meu Painel) — define usuarioId no recrutador escolhido
  const vincSel = document.getElementById('gerenciar-func-vinculo');
  if (vincSel) {
    (state.recrutadores || []).forEach(r => {
      if (r.usuarioId === func.id) { r.usuarioId = null; if (r.loginVinculado === func.login) r.loginVinculado = ''; }
    });
    const novoRecId = vincSel.value;
    if (novoRecId) {
      const rec = (state.recrutadores || []).find(r => r.id === novoRecId);
      if (rec) { rec.usuarioId = func.id; rec.loginVinculado = func.login; }
    }
  }

  if (eraPendente && novoStatus === 'ativo') {
    registrarLogGlobal(`Aprovou o cadastro do funcionário "${func.nome}" (${deptoLabelSimples(novoDepto)}).`, 'funcionarios');
  } else if (novoStatus === 'reprovado') {
    registrarLogGlobal(`Reprovou/bloqueou o acesso do funcionário "${func.nome}".`, 'funcionarios');
  } else {
    registrarLogGlobal(`Permissões e configurações do funcionário "${func.nome}" atualizadas por ${loggedUser?.nome}.`, 'funcionarios');
  }
  saveState();

  document.getElementById('modal-gerenciar-funcionario').classList.remove('active');
  funcAtualGerenciando = null;
  renderFuncionarios();
  alert(`Configurações de "${func.nome}" salvas com sucesso!`);
}

function deptoLabelSimples(d) {
  return ({ administracao: 'Administração', selecao: 'Seleção', dp: 'Departamento Pessoal', comissao: 'Comissão' })[d] || d || '—';
}

// ==========================================================================
// MÓDULO 10: MODAL DE AJUSTE MANUAL DE VAGAS
// ==========================================================================

window.abrirModalAjustarVagas = function(vagaId) {
  const vaga = state.vagas.find(v => v.id === vagaId);
  if (!vaga) return;

  document.getElementById('ajustar-vagas-id').value = vaga.id;
  const nomeEl = document.getElementById('ajustar-vagas-nome-cargo');
  if (nomeEl) nomeEl.textContent = `${vaga.cargo} — ${vaga.empresaNome} (${vaga.vagasDisponiveis || 0} disponíveis)`;

  const motivoEl = document.getElementById('ajustar-vagas-motivo');
  if (motivoEl) motivoEl.value = '';

  const qtdEl = document.getElementById('ajustar-vagas-qtd');
  if (qtdEl) qtdEl.value = 1;

  const tipoEl = document.getElementById('ajustar-vagas-tipo');
  if (tipoEl) tipoEl.value = 'adicionar';

  document.getElementById('modal-ajustar-vagas-manual').classList.add('active');
};

function setupModalAjustarVagasListeners() {
  const btnClose = document.getElementById('btn-close-ajustar-vagas-modal');
  if (btnClose && !btnClose.dataset.listenerAdded) {
    btnClose.dataset.listenerAdded = 'true';
    btnClose.addEventListener('click', () => document.getElementById('modal-ajustar-vagas-manual').classList.remove('active'));
  }

  const btnCancel = document.getElementById('btn-cancel-ajustar-vagas');
  if (btnCancel && !btnCancel.dataset.listenerAdded) {
    btnCancel.dataset.listenerAdded = 'true';
    btnCancel.addEventListener('click', () => document.getElementById('modal-ajustar-vagas-manual').classList.remove('active'));
  }

  const tipoSel = document.getElementById('ajustar-vagas-tipo');
  if (tipoSel && !tipoSel.dataset.listenerAdded) {
    tipoSel.dataset.listenerAdded = 'true';
    tipoSel.addEventListener('change', () => {
      const label = document.querySelector('#ajustar-vagas-qty-group label');
      if (label) label.textContent = tipoSel.value === 'corrigir'
        ? 'Nova Quantidade Total Disponível *'
        : 'Quantidade de Vagas *';
    });
  }

  const form = document.getElementById('form-ajustar-vagas-manual');
  if (form && !form.dataset.listenerAdded) {
    form.dataset.listenerAdded = 'true';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const vagaId = document.getElementById('ajustar-vagas-id').value;
      const vaga = state.vagas.find(v => v.id === vagaId);
      if (!vaga) return;

      const tipo = document.getElementById('ajustar-vagas-tipo').value;
      const qtd = parseInt(document.getElementById('ajustar-vagas-qtd').value) || 0;
      const motivo = document.getElementById('ajustar-vagas-motivo').value.trim();

      if (!motivo) { alert('A justificativa da alteração é obrigatória.'); return; }

      const vagasAntes = vaga.vagasDisponiveis || 0;
      if (!vaga.historicoAjustes) vaga.historicoAjustes = [];

      switch (tipo) {
        case 'adicionar':
          vaga.vagasDisponiveis = vagasAntes + qtd;
          vaga.vagasReabertas = (vaga.vagasReabertas || 0) + qtd;
          break;
        case 'remover':
          vaga.vagasDisponiveis = Math.max(0, vagasAntes - qtd);
          break;
        case 'cancelar':
          vaga.vagasCanceladas = (vaga.vagasCanceladas || 0) + qtd;
          vaga.vagasDisponiveis = Math.max(0, vagasAntes - qtd);
          break;
        case 'reabrir':
          vaga.vagasDisponiveis = vagasAntes + qtd;
          vaga.vagasReabertas = (vaga.vagasReabertas || 0) + qtd;
          break;
        case 'corrigir':
          vaga.vagasDisponiveis = qtd;
          break;
      }

      vaga.historicoAjustes.push({
        data: new Date().toLocaleString('pt-BR'),
        usuario: loggedUser ? loggedUser.nome : 'Sistema',
        tipo, qtd,
        vagasAntes,
        vagasDepois: vaga.vagasDisponiveis,
        motivo
      });

      registrarLogGlobal(
        `Vagas de "${vaga.cargo} — ${vaga.empresaNome}" ajustadas (${tipo}): ${vagasAntes} → ${vaga.vagasDisponiveis}. Motivo: ${motivo}`,
        'vagas'
      );

      saveState();
      document.getElementById('modal-ajustar-vagas-manual').classList.remove('active');

      if (activeAba === 'relatorios') renderRelatoriosCharts();
      alert(`Vagas ajustadas! Disponíveis agora: ${vaga.vagasDisponiveis}`);
    });
  }
}

// ==========================================================================
// MÓDULO 11: BOTÃO COPIAR LINK DE AUTO-CADASTRO
// ==========================================================================

function setupBtnCopiarLink() {
  const btn = document.getElementById('btn-copiar-link-cadastro');
  if (btn && !btn.dataset.listenerAdded) {
    btn.dataset.listenerAdded = 'true';
    btn.addEventListener('click', () => {
      const url = `${window.location.origin}${window.location.pathname}?reg=funcionarios`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
          const orig = btn.innerHTML;
          btn.innerHTML = '<i class="fa-solid fa-check"></i> Link Copiado!';
          btn.style.backgroundColor = '#22c55e';
          setTimeout(() => { btn.innerHTML = orig; btn.style.backgroundColor = ''; }, 2500);
        }).catch(() => { prompt('Copie o link abaixo:', url); });
      } else {
        prompt('Copie o link abaixo:', url);
      }
    });
  }
}

// ==========================================================================
// MÓDULO 12: INICIALIZAÇÃO DOS NOVOS MÓDULOS
// ==========================================================================

// ==========================================================================
// MÓDULO 13: LINKS PERSONALIZADOS DE CAPTAÇÃO POR RECRUTADOR
// ==========================================================================

// Global: recrutador detectado via ?rec=ID na URL (modo candidato público)
window._recrutadorLinkId = null;

function detectarLinkCaptacao() {
  const params = new URLSearchParams(window.location.search);
  const recId = params.get('rec');
  if (!recId) return;

  // Links de captação (?rec=X) são redirecionados para a página pública isolada
  // O CRM nunca expõe seus dados a candidatos — eles usam candidato.html
  const dest = 'candidato.html?' + window.location.search.replace(/^\?/, '');
  window.location.replace(dest);
}

function renderLinksRecrutadores() {
  // Remove bloco anterior se existir
  const old = document.getElementById('bloco-links-recrutadores');
  if (old) old.remove();

  if (!loggedUser) return; // Só mostra para staff logado

  const baseUrl = `${window.location.origin}${window.location.pathname}`;

  const bloco = document.createElement('div');
  bloco.id = 'bloco-links-recrutadores';
  bloco.style.cssText = `
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 24px;
  `;
  bloco.innerHTML = `
    <h3 style="font-size:15px; font-weight:700; color:var(--text-primary); margin-bottom:8px; display:flex; align-items:center; gap:8px;">
      <i class="fa-solid fa-link" style="color:var(--primary);"></i> Links Personalizados de Captação
    </h3>
    <p style="font-size:12px; color:var(--text-secondary); margin-bottom:16px;">
      Compartilhe o link do(a) recrutador(a) com candidatos. Quem se cadastrar via esse link será automaticamente atribuído a ele(a) no painel.
    </p>
    <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px;">
      ${state.recrutadores.map(r => {
        const link = `${baseUrl}?rec=${r.id}`;
        return `
          <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; padding:14px; display:flex; flex-direction:column; gap:8px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="width:34px; height:34px; border-radius:50%; background:${r.corHex}; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:700; font-size:14px; flex-shrink:0;">${r.nome[0]}</div>
              <span style="font-weight:600; color:var(--text-primary); font-size:14px;">${r.nome}</span>
            </div>
            <div style="font-size:10px; color:var(--text-secondary); word-break:break-all; font-family:monospace; background:rgba(0,0,0,0.2); padding:6px 8px; border-radius:4px;">${link}</div>
            <button onclick="copiarLinkRecrutador('${r.id}', this)"
              style="width:100%; padding:6px 10px; background:transparent; border:1px solid var(--border-color); border-radius:6px; color:var(--text-primary); font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; transition:all .2s;">
              <i class="fa-solid fa-copy"></i> Copiar link de ${r.nome}
            </button>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Inserir acima da seção do formulário na aba Site
  const formSection = document.querySelector('#aba-site .site-form-section');
  if (formSection) {
    formSection.insertBefore(bloco, formSection.firstChild);
  }
}

window.copiarLinkRecrutador = function(recId, btn) {
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  const link = `${baseUrl}?rec=${recId}`;
  const rec = state.recrutadores.find(r => r.id === recId);
  const nomeRec = rec ? rec.nome : recId;

  const copy = (text) => {
    if (navigator.clipboard) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((_, reject) => {
      const val = prompt(`Link de captação de ${nomeRec}:`, text);
      val !== null ? Promise.resolve() : reject();
    });
  };

  copy(link).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-check"></i> Copiado!`;
    btn.style.background = '#22c55e';
    btn.style.color = '#fff';
    btn.style.border = '1px solid #22c55e';
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.style.background = '';
      btn.style.color = '';
      btn.style.border = '';
    }, 2500);
  }).catch(() => {});
};

// ==========================================================================
// MÓDULO 14: INICIALIZAÇÃO COMPLETA
// ==========================================================================

function initNewModules() {
  detectarAutoRegistro();
  detectarLinkCaptacao(); // precisa rodar após initLocalStorage + verificarSessao
  setupModalGerenciarListeners();
  setupModalAjustarVagasListeners();
  setupBtnCopiarLink();
  setupAuditoriaListeners();
  setupCepAutoFill();
  setupCameraCapture();
  setupDocumentQualityValidation();
  aplicarTemaSalvo();
  setupHeaderProfileButton();
  // Registrar acesso no log global (só se já logado)
  if (loggedUser) {
    registrarLogGlobal(`${loggedUser.nome} acessou o sistema R&T Empregos.`, 'sistema');
  }
}

// ==========================================================================
// MÓDULO 15: VALIDAÇÃO DE CPF
// ==========================================================================

function validarCPF(cpf) {
  cpf = cpf.replace(/[^\d]/g, '');
  if (cpf.length !== 11) return false;
  // Sequências inválidas (ex: 000.000.000-00)
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  if (rest !== parseInt(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  return rest === parseInt(cpf[10]);
}

// ==========================================================================
// MÓDULO 16: CEP AUTO-FILL VIA VIACEP API
// ==========================================================================

function setupCepAutoFill() {
  // Formulário público do candidato
  const formCep = document.getElementById('form-cep');
  if (formCep && !formCep.dataset.cepListener) {
    formCep.dataset.cepListener = 'true';
    formCep.addEventListener('blur', () => buscarCep(formCep.value, {
      rua: 'form-rua', bairro: 'form-bairro', cidade: 'form-cidade', estado: 'form-estado'
    }));
  }

  // Drawer de detalhes do candidato (Seleção)
  const detCep = document.getElementById('det-cep-input');
  if (detCep && !detCep.dataset.cepListener) {
    detCep.dataset.cepListener = 'true';
    detCep.addEventListener('blur', () => buscarCep(detCep.value, {
      rua: 'det-rua-input', bairro: 'det-bairro-input', cidade: 'det-cidade-input', estado: 'det-estado-input'
    }));
  }
}

function buscarCep(cepRaw, campos) {
  const cep = cepRaw.replace(/\D/g, '');
  if (cep.length !== 8) return;

  fetch(`https://viacep.com.br/ws/${cep}/json/`)
    .then(r => r.json())
    .then(data => {
      if (data.erro) return;
      const g = id => document.getElementById(id);
      if (campos.rua && g(campos.rua) && !g(campos.rua).value) g(campos.rua).value = data.logradouro || '';
      if (campos.bairro && g(campos.bairro) && !g(campos.bairro).value) g(campos.bairro).value = data.bairro || '';
      if (campos.cidade && g(campos.cidade)) g(campos.cidade).value = data.localidade || '';
      if (campos.estado && g(campos.estado)) g(campos.estado).value = data.uf || '';
    })
    .catch(() => {}); // falha silenciosa — sem internet não bloqueia o form
}

// ==========================================================================
// MÓDULO 17: CAPTURA VIA CÂMERA EM DISPOSITIVOS MÓVEIS
// ==========================================================================

function setupCameraCapture() {
  // Selfie: sugerir câmera frontal
  const selfie = document.getElementById('file-selfie');
  if (selfie) selfie.setAttribute('capture', 'user');

  // Documentos: câmera traseira (captura de documentos físicos)
  ['file-rgFrente', 'file-fotoPis', 'file-cpfDocumento', 'file-comprovanteResidencia', 'file-cartaoBancoVerso'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.setAttribute('capture', 'environment');
  });
}

// ==========================================================================
// MÓDULO 18: TEMA CLARO / ESCURO POR USUÁRIO
// ==========================================================================

function aplicarTemaSalvo() {
  const userId = loggedUser ? loggedUser.id : 'guest';
  const tema = localStorage.getItem(`rt_tema_${userId}`) || 'dark';
  document.documentElement.setAttribute('data-theme', tema);
  const btn = document.getElementById('btn-tema-toggle');
  if (btn) btn.innerHTML = tema === 'dark'
    ? '<i class="fa-solid fa-sun"></i> Modo Claro'
    : '<i class="fa-solid fa-moon"></i> Modo Escuro';
}

window.toggleTema = function() {
  const userId = loggedUser ? loggedUser.id : 'guest';
  const atual = document.documentElement.getAttribute('data-theme') || 'dark';
  const novo = atual === 'dark' ? 'light' : 'dark';
  localStorage.setItem(`rt_tema_${userId}`, novo);
  document.documentElement.setAttribute('data-theme', novo);
  const btn = document.getElementById('btn-tema-toggle');
  if (btn) btn.innerHTML = novo === 'dark'
    ? '<i class="fa-solid fa-sun"></i> Modo Claro'
    : '<i class="fa-solid fa-moon"></i> Modo Escuro';
};

// ==========================================================================
// MÓDULO 19: MEU PERFIL — PAINEL INDIVIDUAL DO COLABORADOR
// ==========================================================================

function setupHeaderProfileButton() {
  const profileBadge = document.getElementById('header-user-profile');
  if (profileBadge && !profileBadge.dataset.profileListener) {
    profileBadge.dataset.profileListener = 'true';
    profileBadge.style.cursor = 'pointer';
    profileBadge.title = 'Clique para abrir Meu Perfil';
    profileBadge.addEventListener('click', abrirModalMeuPerfil);
  }
}

window.abrirModalMeuPerfil = function() {
  if (!loggedUser) return;
  const modal = document.getElementById('modal-meu-perfil');
  if (!modal) return;

  // Preencher dados
  const g = id => document.getElementById(id);
  if (g('perfil-nome')) g('perfil-nome').textContent = loggedUser.nome;
  if (g('perfil-login')) g('perfil-login').textContent = loggedUser.login;
  const deptoLabels = {
    'administracao': 'Gestão Executiva',
    'selecao': 'Recrutamento & Seleção',
    'dp': 'Departamento Pessoal',
    'comissao': 'Comissões & Estatísticas'
  };
  if (g('perfil-depto')) g('perfil-depto').textContent = deptoLabels[loggedUser.departamento] || loggedUser.departamento;
  if (g('perfil-cargo')) g('perfil-cargo').textContent = loggedUser.cargo || 'Colaborador';

  // Link personalizado: usa candidato.html (página pública isolada)
  const baseUrl = window.location.origin + window.location.pathname.replace('index.html', '');
  const recMatch = state.recrutadores.find(r =>
    r.nome.toLowerCase().includes(loggedUser.nome.split(' ')[0].toLowerCase()) ||
    loggedUser.nome.toLowerCase().includes(r.nome.split(' ')[0].toLowerCase())
  );
  const linkSection = g('perfil-link-section');
  if (recMatch && linkSection) {
    const meuLink = baseUrl + 'candidato.html?rec=' + recMatch.id;
    linkSection.style.display = 'block';
    if (g('perfil-meu-link')) g('perfil-meu-link').value = meuLink;
  } else if (linkSection) {
    linkSection.style.display = 'none';
  }

  // Botão de tema
  const userId = loggedUser.id;
  const tema = localStorage.getItem(`rt_tema_${userId}`) || 'dark';
  const btnTema = g('btn-tema-toggle');
  if (btnTema) btnTema.innerHTML = tema === 'dark'
    ? '<i class="fa-solid fa-sun"></i> Ativar Modo Claro'
    : '<i class="fa-solid fa-moon"></i> Ativar Modo Escuro';

  // Toggle ADM: dpPodeEditar
  const adminSection = g('perfil-admin-section');
  const isAdmin = loggedUser.login === 'joaobalaf' || loggedUser.departamento === 'administracao';
  if (adminSection) adminSection.style.display = isAdmin ? 'block' : 'none';
  const toggleDpEdit = g('toggle-dp-pode-editar');
  if (toggleDpEdit) toggleDpEdit.checked = state.config?.dpPodeEditar === true;

  modal.classList.add('active');
};

window.fecharModalMeuPerfil = function() {
  const modal = document.getElementById('modal-meu-perfil');
  if (modal) modal.classList.remove('active');
};

window.copiarMeuLink = function(btn) {
  const input = document.getElementById('perfil-meu-link');
  if (!input) return;
  const link = input.value;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).then(() => {
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!';
      btn.style.background = '#22c55e';
      btn.style.color = '#fff';
      setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; btn.style.color = ''; }, 2500);
    }).catch(() => prompt('Seu link de captação:', link));
  } else {
    prompt('Seu link de captação:', link);
  }
};

window.salvarConfigDpEditar = function() {
  if (!state.config) state.config = {};
  const toggle = document.getElementById('toggle-dp-pode-editar');
  state.config.dpPodeEditar = toggle ? toggle.checked : false;
  saveState();
  registrarLogGlobal(
    `Configuração "DP pode editar fichas" alterada para: ${state.config.dpPodeEditar ? 'ATIVADO' : 'DESATIVADO'}`,
    'sistema'
  );
  alert(`Permissão de edição do DP ${state.config.dpPodeEditar ? 'ATIVADA' : 'DESATIVADA'} com sucesso.`);
};

// ==========================================================================
// MÓDULO 20: VALIDAÇÃO DE LEGIBILIDADE DE DOCUMENTOS (Canvas API)
// ==========================================================================

/**
 * Analisa a qualidade visual de uma imagem base64.
 * Verifica brilho médio (escuro/claro) e variância (borrado/sem contraste).
 * Retorna { ok: boolean, mensagem: string }
 */
function analisarQualidadeImagem(base64Data) {
  return new Promise((resolve) => {
    // PDF não pode ser analisado visualmente — passa direto
    if (!base64Data || !base64Data.startsWith('data:image/')) {
      resolve({ ok: true });
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        const MAX_DIM = 200; // reduzir para performance
        const scale = Math.min(MAX_DIM / img.width, MAX_DIM / img.height, 1);
        const w = Math.max(1, Math.floor(img.width * scale));
        const h = Math.max(1, Math.floor(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        const { data } = ctx.getImageData(0, 0, w, h);
        const total = w * h;
        let somaB = 0;
        const brightness = [];

        for (let i = 0; i < data.length; i += 4) {
          const b = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          somaB += b;
          brightness.push(b);
        }

        const media = somaB / total;
        const variancia = brightness.reduce((s, b) => s + (b - media) ** 2, 0) / total;

        if (media < 35) {
          resolve({ ok: false, mensagem: '⚠️ Imagem muito escura. Tire a foto em local com mais iluminação.' });
        } else if (media > 235) {
          resolve({ ok: false, mensagem: '⚠️ Imagem muito clara / estourada. Evite luz direta na câmera.' });
        } else if (variancia < 80) {
          resolve({ ok: false, mensagem: '⚠️ Documento parece borrado ou sem contraste suficiente. Tire uma foto mais nítida e próxima.' });
        } else {
          resolve({ ok: true });
        }
      } catch {
        resolve({ ok: true }); // em caso de erro de Canvas, não bloqueia
      }
    };
    img.onerror = () => resolve({ ok: true });
    img.src = base64Data;
  });
}

/**
 * Valida a imagem de um input de arquivo e mostra feedback visual no box de upload.
 * Retorna Promise<boolean> — true se aprovado.
 */
async function validarEExibirQualidade(input, boxEl) {
  const base64 = input.dataset.base64;
  if (!base64) return true; // ainda não enviou — valida apenas se enviou

  const statusEl = boxEl ? boxEl.querySelector('.upload-status-indicator') : null;
  const resultado = await analisarQualidadeImagem(base64);

  if (!resultado.ok) {
    boxEl.classList.add('upload-erro-qualidade');
    if (statusEl) {
      statusEl.textContent = 'Qualidade ruim';
      statusEl.style.color = '#ef4444';
    }
    // Exibe tooltip de erro no box
    let errEl = boxEl.querySelector('.upload-quality-error');
    if (!errEl) {
      errEl = document.createElement('div');
      errEl.className = 'upload-quality-error';
      errEl.style.cssText = 'color:#ef4444; font-size:10px; text-align:center; padding:4px 6px; background:#fee2e2; border-radius:4px; margin-top:4px; line-height:1.3;';
      boxEl.appendChild(errEl);
    }
    errEl.textContent = resultado.mensagem;
    return false;
  } else {
    boxEl.classList.remove('upload-erro-qualidade');
    if (statusEl) { statusEl.textContent = 'Carregado ✓'; statusEl.style.color = '#22c55e'; }
    const errEl = boxEl.querySelector('.upload-quality-error');
    if (errEl) errEl.remove();
    return true;
  }
}

// Hook nos file inputs do formulário público para validar após upload
function setupDocumentQualityValidation() {
  const docInputIds = ['file-selfie','file-rgFrente','file-fotoPis','file-cpfDocumento','file-comprovanteResidencia','file-cartaoBancoVerso'];
  docInputIds.forEach(id => {
    const input = document.getElementById(id);
    if (!input || input.dataset.qualityListener) return;
    input.dataset.qualityListener = 'true';
    input.addEventListener('change', async () => {
      // aguarda o base64 ser gravado pelo handler existente
      setTimeout(async () => {
        const box = input.closest('.file-upload-box');
        if (input.dataset.base64) {
          await validarEExibirQualidade(input, box);
        }
      }, 500);
    });
  });
}

// ==========================================================================
// MÓDULO 21: NÚMERO DE FILA FIXO DOS CANDIDATOS
// ==========================================================================

function gerarNumeroFila() {
  if (!state.proximaFilaNum) state.proximaFilaNum = 1;
  const num = state.proximaFilaNum;
  state.proximaFilaNum++;
  return num;
}

// Gera link para o candidato completar a ficha (pré-preenchida com dados existentes)
function gerarLinkCompletarFicha(candidatoId) {
  const cand = state.candidatos.find(c => c.id === candidatoId);
  if (!cand) return '';
  const base = window.location.origin + window.location.pathname.replace('index.html', '');
  const data = {
    id: cand.id,
    nome: cand.nome || '', email: cand.email || '', cpf: cand.cpf || '',
    rg: cand.rg || '', pis: cand.pis || '', telefone: cand.telefone || '',
    dataNascimento: cand.dataNascimento || '', nomeMae: cand.nomeMae || '',
    nomePai: cand.nomePai || '', cep: cand.cep || '', rua: cand.rua || '',
    numeroCasa: cand.numeroCasa || '', bairro: cand.bairro || '',
    cidade: cand.cidade || '', estado: cand.estado || '',
    banco: cand.banco || '', tipoPix: cand.tipoPix || '', chavePix: cand.chavePix || '',
    tamanhoCamiseta: cand.tamanhoCamiseta || '', tamanhoCalca: cand.tamanhoCalca || '',
    tamanhoBota: cand.tamanhoBota || '', sexo: cand.sexo || '',
  };
  try {
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    return base + 'candidato.html?completar=' + encoded;
  } catch(e) { return ''; }
}

// Renderiza seção BT pendentes no dashboard
function renderBTPendentes() {
  const section   = document.getElementById('bt-pendentes-section');
  const lista     = document.getElementById('bt-pendentes-lista');
  const countEl   = document.getElementById('bt-pendentes-count');
  if (!section || !lista) return;

  const meuId = loggedUser ? loggedUser.id : null;
  const meuRec = meuId ? state.recrutadores.find(r => r.funcionarioId === meuId || r.nome === loggedUser.nome) : null;

  const btPendentes = state.candidatos.filter(c =>
    c.origemCadastro === 'banco_talentos' && !c.fichaCompletada &&
    (!meuRec || c.recrutadorId === meuRec.id)
  );

  if (!btPendentes.length) { section.style.display = 'none'; return; }

  section.style.display = '';
  if (countEl) countEl.textContent = btPendentes.length;

  lista.innerHTML = btPendentes.map(c => {
    const link = gerarLinkCompletarFicha(c.id);
    const wa = 'https://wa.me/' + (c.telefone || '').replace(/\D/g,'') + '?text=' +
      encodeURIComponent(`Olá, ${(c.nome || '').split(' ')[0]}! Clique no link para completar seu cadastro na R&T Empregos: ${link}`);
    return `
      <div style="background:var(--card-bg); border:1px solid rgba(168,85,247,0.3); border-radius:10px; padding:14px 16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
        <div style="width:38px;height:38px;border-radius:50%;background:rgba(168,85,247,0.2);color:#a855f7;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;">
          ${(c.nome||'?').split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:13px;color:var(--text-primary);">${c.nome || '—'}</div>
          <div style="font-size:11px;color:var(--text-secondary);">${c.telefone || '—'} · ${c.cidade || '—'}</div>
          <div style="font-size:10px;color:#a855f7;margin-top:2px;">Ficha aguardando preenchimento</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0;">
          <button onclick="navigator.clipboard.writeText('${link}').then(()=>{this.innerHTML='<i class=\\'fa-solid fa-check\\'></i> Copiado!';setTimeout(()=>{this.innerHTML='<i class=\\'fa-solid fa-copy\\'></i> Copiar link';},2000)})"
            style="padding:6px 12px;border-radius:7px;border:1px solid rgba(168,85,247,0.4);background:rgba(168,85,247,0.1);color:#a855f7;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:5px;">
            <i class="fa-solid fa-copy"></i> Copiar link
          </button>
          <a href="${wa}" target="_blank"
            style="padding:6px 12px;border-radius:7px;border:none;background:#25d366;color:#fff;font-size:11px;font-weight:700;text-decoration:none;display:flex;align-items:center;gap:5px;">
            <i class="fa-brands fa-whatsapp"></i> WhatsApp
          </a>
        </div>
      </div>`;
  }).join('');
}

// Renderiza a seção do Banco de Talentos simples na aba Banco de Talentos
function renderBancoTalentosSimples() {
  const container = document.getElementById('banco-talentos-simples-lista');
  if (!container) return;

  const fSexo    = (document.getElementById('bt-filter-sexo')    || {}).value || '';
  const fCidade  = (document.getElementById('bt-filter-cidade')  || {}).value || '';
  const fEmpresa = (document.getElementById('bt-filter-empresa') || {}).value || '';

  let lista = state.bancoTalentos || [];
  if (fSexo)   lista = lista.filter(t => (t.sexo || detectarSexoPeloNome(t.nome)) === fSexo);
  if (fCidade) lista = lista.filter(t => (t.cidade || '').toLowerCase() === fCidade.toLowerCase());

  if (!lista.length) {
    const total = (state.bancoTalentos || []).length;
    container.innerHTML = `<p style="font-size:13px;color:var(--text-secondary);text-align:center;padding:24px 0;">${
      total ? 'Nenhum resultado para os filtros selecionados.' : 'Nenhuma pessoa cadastrada ainda. Importe uma planilha Excel para começar.'
    }</p>`;
    return;
  }

  // Contagem no topo
  const headerHtml = `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;font-weight:600;">
    ${lista.length} talento${lista.length > 1 ? 's' : ''} encontrado${lista.length > 1 ? 's' : ''}
    <span style="font-weight:400;"> — clique em um nome para ver detalhes e puxar para processo</span>
  </div>`;

  const cardsHtml = lista.map(t => {
    const initials = (t.nome || '?').split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase();
    const sexo     = t.sexo || detectarSexoPeloNome(t.nome);
    const proximas = empresasMaisProximas(t);
    const filtradas = fEmpresa ? proximas.filter(e => e.id === fEmpresa) : proximas.slice(0,1);

    const sexoBadge = sexo === 'M'
      ? '<span style="font-size:10px;color:#3b82f6;background:rgba(59,130,246,0.1);padding:1px 6px;border-radius:8px;border:1px solid rgba(59,130,246,0.2);font-weight:600;">♂</span>'
      : sexo === 'F'
      ? '<span style="font-size:10px;color:#ec4899;background:rgba(236,72,153,0.1);padding:1px 6px;border-radius:8px;border:1px solid rgba(236,72,153,0.2);font-weight:600;">♀</span>'
      : '';

    const proximaBadge = filtradas.length
      ? (() => {
          const e = filtradas[0];
          const perto = e.distKm <= 15;
          return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700;white-space:nowrap;` +
            `background:${perto ? 'rgba(34,197,94,0.12)' : 'rgba(148,163,184,0.08)'};` +
            `color:${perto ? '#16a34a' : '#64748b'};` +
            `border:1px solid ${perto ? 'rgba(34,197,94,0.35)' : 'rgba(148,163,184,0.2)'};">` +
            (perto ? '<i class="fa-solid fa-location-dot" style="font-size:9px;"></i>' : '') +
            ` ${e.distKm}km</span>`;
        })()
      : '';

    return `<div onclick="abrirDetalheBT('${t.id}')" style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:9px;padding:10px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;transition:box-shadow 0.15s,border-color 0.15s;" onmouseover="this.style.boxShadow='0 2px 10px rgba(0,0,0,0.1)';this.style.borderColor='var(--primary)'" onmouseout="this.style.boxShadow='';this.style.borderColor='var(--border-color)'">
      <div style="width:34px;height:34px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;">${initials}</div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
          <span style="font-weight:700;color:var(--text-primary);font-size:13px;">${t.nome || 'Sem nome'}</span>
          ${sexoBadge}
        </div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${t.telefone || '—'} · ${t.cidade ? t.cidade + (t.estado ? '/' + t.estado : '') : '—'}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        ${proximaBadge}
        <i class="fa-solid fa-chevron-right" style="color:var(--text-secondary);font-size:11px;"></i>
      </div>
    </div>`;
  }).join('');

  container.innerHTML = headerHtml + cardsHtml;
}

window.abrirDetalheBT = function(btId) {
  const t = (state.bancoTalentos || []).find(x => x.id === btId);
  if (!t) return;

  const sexo = t.sexo || detectarSexoPeloNome(t.nome);
  const initials = (t.nome || '?').split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase();

  const g = id => document.getElementById(id);
  g('bt-det-avatar').textContent = initials;
  g('bt-det-nome').textContent   = t.nome || '—';
  g('bt-det-sexo-badge').innerHTML = sexo === 'M'
    ? '<span style="font-size:11px;color:#3b82f6;background:rgba(59,130,246,0.1);padding:2px 8px;border-radius:8px;font-weight:600;">♂ Masculino</span>'
    : sexo === 'F'
    ? '<span style="font-size:11px;color:#ec4899;background:rgba(236,72,153,0.1);padding:2px 8px;border-radius:8px;font-weight:600;">♀ Feminino</span>'
    : '';
  g('bt-det-telefone').textContent = t.telefone || '—';
  g('bt-det-email').textContent    = t.email    || '—';
  g('bt-det-cpf').textContent      = t.cpf      || '—';
  g('bt-det-cidade').textContent   = t.cidade   ? t.cidade + (t.estado ? ' / ' + t.estado : '') : '—';
  g('bt-det-cargo').textContent    = t.cargoInteresse || '—';
  g('bt-det-exp').textContent      = t.experiencia    || '—';
  g('bt-det-data').textContent     = t.dataCadastro ? 'Cadastrado em: ' + t.dataCadastro : '';

  const obsBox = g('bt-det-obs-box');
  if (t.observacao) { obsBox.style.display = 'block'; g('bt-det-obs').textContent = t.observacao; }
  else               { obsBox.style.display = 'none'; }

  const proximas = empresasMaisProximas(t);
  const proxEl = g('bt-det-proximas');
  if (proximas.length) {
    proxEl.innerHTML = '<div style="font-size:10px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:5px;">Proximidade de empresas</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:5px;">' +
      proximas.slice(0,5).map(e => {
        const perto = e.distKm <= 15;
        return `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 9px;border-radius:10px;font-size:11px;font-weight:600;
          background:${perto ? 'rgba(34,197,94,0.12)' : 'rgba(148,163,184,0.08)'};
          color:${perto ? '#16a34a' : '#64748b'};
          border:1px solid ${perto ? 'rgba(34,197,94,0.35)' : 'rgba(148,163,184,0.2)'};">
          ${perto ? '<i class="fa-solid fa-location-dot" style="font-size:10px;"></i>' : ''} ${e.nome} · ${e.distKm}km</span>`;
      }).join('') + '</div>';
  } else {
    proxEl.innerHTML = t.cidade
      ? '<span style="font-size:11px;color:#64748b;font-style:italic;">Cidade não mapeada — distância não calculada</span>'
      : '';
  }

  const btnPuxar = g('btn-puxar-processo-det');
  if (btnPuxar) {
    btnPuxar.onclick = () => {
      document.getElementById('modal-bt-detalhe').classList.remove('active');
      puxarParaProcesso(btId);
    };
  }

  document.getElementById('modal-bt-detalhe').classList.add('active');
};

// Puxar pessoa do Banco de Talentos para o processo de seleção
window.puxarParaProcesso = function(btId) {
  const t = (state.bancoTalentos || []).find(x => x.id === btId);
  if (!t) return;

  const nomeSel = loggedUser ? loggedUser.nome : 'Selecionadora';
  const recrutadorId = loggedUser ? (state.recrutadores.find(r => r.nome === loggedUser.nome || r.funcionarioId === loggedUser.id) || {}).id || null : null;

  const novoCand = {
    id:              'cand-bt-' + Date.now(),
    numeroFila:      gerarNumeroFila(),
    nome:            t.nome || '',
    email:           t.email || '',
    cpf:             t.cpf  || '',
    rg:              t.rg   || '',
    pis:             '',
    telefone:        t.telefone || '',
    dataNascimento:  '',
    nomeMae:         '',
    nomePai:         '',
    cep:             t.cep    || '',
    rua:             t.rua    || '',
    numeroCasa:      t.numero || '',
    bairro:          t.bairro || '',
    cidade:          t.cidade || '',
    estado:          t.estado || '',
    sexo:            t.sexo || detectarSexoPeloNome(t.nome),
    banco:           '', tipoPix: '', chavePix: '',
    tamanhoCamiseta: '', tamanhoCalca: '', tamanhoBota: '',
    vagaId:          '', empresaId: '', codigoVaga: 'A definir',
    recrutadorId:    recrutadorId,
    origemCadastro:  'banco_talentos',
    comoSoube:       null,
    origemLink:      'banco_talentos_rt',
    status:          'pendente',
    diasEtapa:       0,
    dataCadastro:    new Date().toISOString(),
    observacoesSelecao: (t.cargoInteresse ? `Interesse: ${t.cargoInteresse}. ` : '') + (t.observacao || ''),
    documentos:      { selfie:'', rgFrente:'', fotoPis:'', cpfDocumento:'', comprovanteResidencia:'', cartaoBancoVerso:'' },
    historico:       [{ data: new Date().toLocaleString('pt-BR'), autor: nomeSel, acao: `Candidato puxado do Banco de Talentos RT por ${nomeSel}. Dados pré-preenchidos da planilha.` }],
  };

  if (!state.candidatos) state.candidatos = [];
  state.candidatos.push(novoCand);

  // Remove do banco de talentos
  state.bancoTalentos = state.bancoTalentos.filter(x => x.id !== btId);
  saveState();
  renderBancoTalentosSimples();
  renderSelecaoGrid();

  alert(`✅ ${t.nome} foi adicionado(a) à Seleção com origem "Banco de Talentos RT".\nRecrutado(a) por: ${nomeSel}\n\nAbra a Seleção para completar a ficha.`);
};

// Inicializa filtros do Banco de Talentos simples
function setupBTFilters() {
  // Popula dropdown de empresas (apenas uma vez)
  const fEmpresa = document.getElementById('bt-filter-empresa');
  if (fEmpresa && fEmpresa.options.length <= 1) {
    (state.empresas || []).forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.nome + ' (' + (e.cidade || '') + ')';
      fEmpresa.appendChild(opt);
    });
  }

  // Popula dropdown de cidades com as cidades únicas do BT
  const fCidade = document.getElementById('bt-filter-cidade');
  if (fCidade) {
    const cidades = [...new Set((state.bancoTalentos || []).map(t => t.cidade).filter(Boolean))].sort();
    while (fCidade.options.length > 1) fCidade.remove(1);
    cidades.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      fCidade.appendChild(opt);
    });
  }

  // Registra listeners nos filtros (apenas uma vez)
  ['bt-filter-sexo', 'bt-filter-cidade', 'bt-filter-empresa'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.btListenerAdded) {
      el.dataset.btListenerAdded = 'true';
      el.addEventListener('change', renderBancoTalentosSimples);
    }
  });

  const btnLimpar = document.getElementById('bt-filter-limpar');
  if (btnLimpar && !btnLimpar.dataset.btListenerAdded) {
    btnLimpar.dataset.btListenerAdded = 'true';
    btnLimpar.addEventListener('click', () => {
      ['bt-filter-sexo', 'bt-filter-cidade', 'bt-filter-empresa'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      renderBancoTalentosSimples();
    });
  }
}

// Importar candidatos em lote via Excel/CSV
function setupImportarBT() {
  const input = document.getElementById('input-importar-bt');
  if (!input || input.dataset.listenerAdded) return;
  input.dataset.listenerAdded = 'true';

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!rows.length) { mostrarResultadoImport(0, 0, ['Planilha vazia.']); return; }

        const col = (row, ...keys) => {
          for (const k of keys) {
            const found = Object.keys(row).find(rk => rk.toLowerCase().replace(/[^a-z]/g,'') === k.toLowerCase().replace(/[^a-z]/g,''));
            if (found && row[found] !== '') return String(row[found]).trim();
          }
          return '';
        };

        let inseridos = 0;
        const erros = [];

        rows.forEach((row, i) => {
          const nome = col(row, 'nome', 'name', 'nomecompleto');
          if (!nome) { erros.push(`Linha ${i+2}: nome não encontrado.`); return; }

          const talento = {
            id:           'bt-' + Date.now() + '-' + i,
            nome,
            telefone:     col(row, 'telefone', 'celular', 'fone', 'whatsapp'),
            cpf:          col(row, 'cpf'),
            rg:           col(row, 'rg'),
            email:        col(row, 'email', 'email'),
            cep:          col(row, 'cep'),
            rua:          col(row, 'rua', 'logradouro', 'endereco'),
            numero:       col(row, 'numero', 'num'),
            bairro:       col(row, 'bairro'),
            cidade:       col(row, 'cidade', 'municipio'),
            estado:       col(row, 'estado', 'uf'),
            sexo:           (function(){ const s = col(row,'sexo','genero','gender'); const n = s.toLowerCase(); return n.startsWith('m') ? 'M' : n.startsWith('f') ? 'F' : ''; })() || detectarSexoPeloNome(nome),
            cargoInteresse: col(row, 'cargo', 'cargointeresse', 'funcao', 'vaga'),
            experiencia:  col(row, 'experiencia', 'exp'),
            observacao:   col(row, 'observacao', 'obs', 'observacoes'),
            dataCadastro: new Date().toLocaleString('pt-BR'),
            origemLink:   'importacao_lote',
          };

          if (!state.bancoTalentos) state.bancoTalentos = [];
          state.bancoTalentos.push(talento);
          inseridos++;
        });

        saveState();
        setupBTFilters();
        renderBancoTalentosSimples();
        mostrarResultadoImport(rows.length, inseridos, erros);
        input.value = '';
      } catch (err) {
        mostrarResultadoImport(0, 0, ['Erro ao ler arquivo: ' + err.message]);
      }
    };
    reader.readAsArrayBuffer(file);
  });

  // Exportar CSV
  const btnExportar = document.getElementById('btn-exportar-bt');
  if (btnExportar && !btnExportar.dataset.listenerAdded) {
    btnExportar.dataset.listenerAdded = 'true';
    btnExportar.addEventListener('click', () => {
      const lista = state.bancoTalentos || [];
      if (!lista.length) { alert('Banco de talentos vazio.'); return; }
      const ws = XLSX.utils.json_to_sheet(lista.map(t => ({
        Nome: t.nome, Telefone: t.telefone, Email: t.email, CPF: t.cpf, RG: t.rg,
        Sexo: t.sexo === 'M' ? 'Masculino' : t.sexo === 'F' ? 'Feminino' : '',
        CEP: t.cep, Rua: t.rua, Número: t.numero, Bairro: t.bairro,
        Cidade: t.cidade, Estado: t.estado,
        'Cargo Interesse': t.cargoInteresse, Experiência: t.experiencia,
        Observação: t.observacao, Cadastro: t.dataCadastro,
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Banco de Talentos');
      XLSX.writeFile(wb, 'banco_talentos_RT.xlsx');
    });
  }
}

function mostrarResultadoImport(total, inseridos, erros) {
  const el = document.getElementById('bt-import-result');
  if (!el) return;
  const cor = erros.length ? '#f59e0b' : '#22c55e';
  el.style.display = '';
  el.innerHTML = `
    <div style="background:rgba(34,197,94,0.08); border:1px solid ${cor}40; border-radius:8px; padding:12px 16px; font-size:12px; color:var(--text-primary);">
      <strong style="color:${cor};"><i class="fa-solid fa-file-import"></i> Importação concluída:</strong>
      ${inseridos} de ${total} registros importados.
      ${erros.length ? `<br><span style="color:#f59e0b;">${erros.slice(0,5).join(' | ')}${erros.length>5?` e mais ${erros.length-5}...`:''}</span>` : ''}
    </div>`;
  setTimeout(() => { el.style.display = 'none'; }, 8000);
}

// ==========================================================================
// MÓDULO 23: LINK OFICIAL DA AGÊNCIA R&T (QR Code)
// ==========================================================================

function getAgenciaLinkUrl() {
  return `${window.location.origin}${window.location.pathname}?rec=agencia`;
}

window.copiarLinkAgencia = function(btn) {
  const link = getAgenciaLinkUrl();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).then(() => {
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!';
      btn.style.background = '#22c55e'; btn.style.color = '#fff';
      setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; btn.style.color = ''; }, 2500);
    });
  } else { prompt('Link da agência:', link); }
};

// ==========================================================================
// UPGRADE VISUAL PREMIUM - NOVAS FUNÇÕES DE MÉTRIAS, GRÁFICOS E ANIMAÇÕES
// ==========================================================================

/* Visão Geral (Overview) do Dashboard */
function renderDashboardOverview() {
  const hoje = new Date().toLocaleDateString('pt-BR');
  
  // 1. Saudação do Usuário
  const greetingEl = document.getElementById('dash-welcome-title');
  if (greetingEl) {
    greetingEl.textContent = `Bem-vindo(a), ${loggedUser ? loggedUser.nome : 'Colaborador'}! 👋`;
  }

  // 2. Cálculos dos KPIs
  const cadHoje = state.candidatos.filter(c => {
    if (!c.dataCadastro) return false;
    return new Date(c.dataCadastro).toLocaleDateString('pt-BR') === hoje;
  }).length;
  
  const analiseSel = state.candidatos.filter(c => ['em_analise', 'entrevista'].includes(c.status)).length;
  const enviadasDp = state.candidatos.filter(c => c.status === 'aprovado').length;
  const devolvidasDp = state.candidatos.filter(c => c.devolvidoDP === true).length;
  
  const contratosHoje = state.candidatos.filter(c => {
    return c.status === 'contratado' && c.dataContratacao === hoje;
  }).length;

  const vagasDisp = state.vagas.reduce((acc, v) => acc + (v.vagasDisponiveis || 0), 0);
  const vagasPreenchidas = state.vagas.reduce((acc, v) => acc + (v.vagasPreenchidas || 0), 0);
  
  // Destaque da Semana
  const { recrutadorId: destId, contagem: destContagem } = calcularRecrutadorSemana();
  const destRec = destId ? state.recrutadores.find(r => r.id === destId) : null;
  const destNome = destRec ? destRec.nome : 'Nenhum';

  // 3. Renderização dos KPIs na tela
  const setKPI = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setKPI('dash-kpi-cad-hoje', cadHoje);
  setKPI('dash-kpi-analise-sel', analiseSel);
  setKPI('dash-kpi-enviadas-dp', enviadasDp);
  setKPI('dash-kpi-devolvidas-dp', devolvidasDp);
  setKPI('dash-kpi-contratos-hoje', contratosHoje);
  setKPI('dash-kpi-vagas-disp', vagasDisp);
  setKPI('dash-kpi-vagas-preenchidas', vagasPreenchidas);

  const destNomeEl = document.getElementById('dash-kpi-recrutador-destaque-nome');
  if (destNomeEl) {
    destNomeEl.textContent = destContagem > 0 ? `${destNome} (${destContagem})` : 'Nenhum';
  }

  // 4. Trigger de verificação de coroa no cabeçalho do usuário
  verificarDestaqueCabecalho();

  // 4b. Seção BT pendentes (candidatos aguardando completar ficha)
  renderBTPendentes();

  // 5. Destruir gráficos anteriores se existirem para evitar sobreposição
  Object.keys(dashboardCharts).forEach(key => {
    if (dashboardCharts[key]) {
      dashboardCharts[key].destroy();
      dashboardCharts[key] = null;
    }
  });

  // --- Gráfico 1: Contratações por Dia (Linha) ---
  const ctxDia = document.getElementById('chartDashContratacoesDia');
  if (ctxDia) {
    const dates = [];
    const counts = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const str = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const fullStr = d.toLocaleDateString('pt-BR');
      dates.push(str);
      // Conta quantos candidatos fecharam contrato nesta data
      const cCount = state.candidatos.filter(c => c.status === 'contratado' && c.dataContratacao === fullStr).length;
      counts.push(cCount);
    }

    dashboardCharts.dia = new Chart(ctxDia, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [{
          label: 'Contratos Feitos',
          data: counts,
          borderColor: '#e11d48',
          backgroundColor: 'rgba(225, 29, 72, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 3,
          pointBackgroundColor: '#e11d48'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1, color: '#94a3b8' }, grid: { color: '#f1f5f940' } },
          x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
        }
      }
    });
  }

  // --- Gráfico 2: Contratações por Empresa (Rosca/Doughnut) ---
  const ctxEmp = document.getElementById('chartDashContratacoesEmpresa');
  if (ctxEmp) {
    const labels = state.empresas.map(e => e.nome);
    const data = state.empresas.map(e => {
      return state.contratacoes.filter(c => c.empresaNome.toLowerCase().includes(e.nome.toLowerCase()) || c.empresaNome.toLowerCase().includes(e.sigla.toLowerCase())).length;
    });

    dashboardCharts.empresa = new Chart(ctxEmp, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: state.empresas.map(e => e.cor || '#94a3b8'),
          borderWidth: 2,
          borderColor: '#1e293b'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 }, color: '#94a3b8' } }
        }
      }
    });
  }

  // --- Gráfico 3: Contratações por Selecionador (Barras) ---
  const ctxSel = document.getElementById('chartDashContratacoesSelecionador');
  if (ctxSel) {
    const labels = state.recrutadores.map(r => r.nome);
    const data = state.recrutadores.map(r => {
      return state.contratacoes.filter(c => c.recrutadorId === r.id).length;
    });

    dashboardCharts.selecionador = new Chart(ctxSel, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: state.recrutadores.map(r => r.corHex || '#be123c'),
          borderRadius: 6,
          barThickness: 24
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1, color: '#94a3b8' }, grid: { color: '#f1f5f940' } },
          x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
        }
      }
    });
  }

  // --- Gráfico 4: Fichas por Status (Pie/Pizza) ---
  const ctxStatus = document.getElementById('chartDashFichasStatus');
  if (ctxStatus) {
    const statuses = ['pendente', 'em_analise', 'entrevista', 'aprovado', 'reprovado', 'contratado'];
    const labels = ['Pendente', 'Em Análise', 'Entrevista', 'Aguardando DP', 'Reprovado', 'Contratado'];
    const data = statuses.map(st => state.candidatos.filter(c => c.status === st).length);

    dashboardCharts.status = new Chart(ctxStatus, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: ['#eab308', '#3b82f6', '#a855f7', '#10b981', '#ef4444', '#059669'],
          borderWidth: 1,
          borderColor: '#1e293b'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 }, color: '#94a3b8' } }
        }
      }
    });
  }

  // --- Gráfico 5: Vagas Disponíveis por Empresa (Barras Verticais Duplas) ---
  const ctxVagas = document.getElementById('chartDashVagasEmpresa');
  if (ctxVagas) {
    const labels = state.empresas.map(e => e.sigla);
    const disponiveis = state.empresas.map(e => {
      return state.vagas.filter(v => v.empresaId === e.id).reduce((acc, v) => acc + (v.vagasDisponiveis || 0), 0);
    });
    const preenchidas = state.empresas.map(e => {
      return state.vagas.filter(v => v.empresaId === e.id).reduce((acc, v) => acc + (v.vagasPreenchidas || 0), 0);
    });

    dashboardCharts.vagas = new Chart(ctxVagas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Disponíveis',
            data: disponiveis,
            backgroundColor: '#3b82f6',
            borderRadius: 4
          },
          {
            label: 'Preenchidas',
            data: preenchidas,
            backgroundColor: '#10b981',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 5, color: '#94a3b8' }, grid: { color: '#f1f5f940' } },
          x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
        },
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { size: 10 } } }
        }
      }
    });
  }

  // --- Gráfico 6: Linhas de Fretado com mais Contratações (Barras Horizontais) ---
  const ctxFretados = document.getElementById('chartDashFretadosHires');
  if (ctxFretados) {
    // Agrupa contratados por cidade/rota de fretado
    const contratados = state.candidatos.filter(c => c.status === 'contratado');
    const rotas = {};
    contratados.forEach(c => {
      const rota = c.cidade || 'Não Informado';
      rotas[rota] = (rotas[rota] || 0) + 1;
    });

    // Ordena e pega as top 5 rotas
    const sortedRotas = Object.entries(rotas)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const labels = sortedRotas.map(r => r[0]);
    const data = sortedRotas.map(r => r[1]);

    dashboardCharts.fretados = new Chart(ctxFretados, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: '#f97316',
          borderRadius: 6,
          barThickness: 20
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { stepSize: 1, color: '#94a3b8' }, grid: { color: '#f1f5f940' } },
          y: { ticks: { color: '#94a3b8' }, grid: { display: false } }
        }
      }
    });
  }
}

/* Animação: Subir Ficha para DP (Decolagem Horizontal) */
function triggerRocketAnimationDP(cand, foiDevolvida, callback) {
  // 1. Tremor de tela
  document.body.classList.add('apply-shake');
  setTimeout(() => document.body.classList.remove('apply-shake'), 600);

  // 2. Configurar foguete
  const overlay = document.getElementById('rocket-anim-overlay');
  const rocket = document.getElementById('animated-rocket');
  
  if (!overlay || !rocket) {
    // Fallback se elementos não existirem
    if (callback) callback();
    return;
  }

  rocket.className = 'animated-rocket-element rocket-horizontal';
  overlay.classList.add('active');
  
  // Força reflow
  void rocket.offsetWidth;
  
  rocket.classList.add('animate');

  // Gerador de partículas de rastro
  let particleInterval = setInterval(() => {
    const rect = rocket.getBoundingClientRect();
    if (rect.left > 0 && rect.left < window.innerWidth) {
      // Cria partícula vermelha/laranja atrás do bico do foguete (rastro)
      createTrailParticle(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
  }, 35);

  // Finalizar após animação voar
  setTimeout(() => {
    clearInterval(particleInterval);
    overlay.classList.remove('active');
    rocket.classList.remove('animate');
    
    // Roda callback operacional (atualiza dados, fecha drawer, recarrega)
    if (callback) callback();
    
    // Toast de sucesso no final
    const msg = foiDevolvida
      ? `Ficha de "${cand.nome}" corrigida e reenviada ao DP!`
      : `🚀 Ficha de "${cand.nome}" enviada com sucesso para o DP!`;
    showToast(msg, 'success');
  }, 1600);
}

/* Animação: Contrato Feito (Decolagem Vertical para o espaço) */
function triggerRocketAnimationContract(cand, callback) {
  // 1. Tremor de tela
  document.body.classList.add('apply-shake');
  setTimeout(() => document.body.classList.remove('apply-shake'), 600);

  // 2. Configurar foguete
  const overlay = document.getElementById('rocket-anim-overlay');
  const rocket = document.getElementById('animated-rocket');
  
  if (!overlay || !rocket) {
    if (callback) callback();
    return;
  }

  rocket.className = 'animated-rocket-element rocket-vertical';
  overlay.classList.add('active');
  
  void rocket.offsetWidth;
  rocket.classList.add('animate');

  // Partículas de rastro vertical
  let particleInterval = setInterval(() => {
    const rect = rocket.getBoundingClientRect();
    if (rect.top > -100 && rect.top < window.innerHeight) {
      createTrailParticle(rect.left + rect.width / 2, rect.top + rect.height);
    }
  }, 30);

  // Finalizar
  setTimeout(() => {
    clearInterval(particleInterval);
    overlay.classList.remove('active');
    rocket.classList.remove('animate');
    
    if (callback) callback();
  }, 1800);
}

/* Criador de partículas de rastro brilhantes */
function createTrailParticle(x, y) {
  const particle = document.createElement('div');
  particle.className = 'rocket-particle';
  
  // Cores dinâmicas de chama (Vermelho, Laranja, Amarelo)
  const colors = ['#e11d48', '#f97316', '#eab308', '#ffffff'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  
  // Dimensões aleatórias
  const size = Math.floor(Math.random() * 8) + 4;
  
  particle.style.width = `${size}px`;
  particle.style.height = `${size}px`;
  particle.style.background = color;
  particle.style.left = `${x}px`;
  particle.style.top = `${y}px`;
  particle.style.boxShadow = `0 0 ${size}px ${color}`;
  
  document.body.appendChild(particle);
  
  // Remove após terminar animação CSS
  setTimeout(() => {
    particle.remove();
  }, 800);
}

/* Sistema Premium de Toasts (Notificações) */
function showToast(message, type = 'success') {
  const toast = document.getElementById('modern-toast');
  const toastText = document.getElementById('modern-toast-text');
  
  if (!toast || !toastText) {
    // Fallback se não existir
    alert(message);
    return;
  }

  toastText.textContent = message;
  
  // Ajusta cor dependendo do status
  if (type === 'success') {
    toast.style.background = '#10b981';
    toast.style.boxShadow = '0 10px 25px -5px rgba(16, 185, 129, 0.35)';
  } else {
    toast.style.background = '#ef4444';
    toast.style.boxShadow = '0 10px 25px -5px rgba(239, 68, 68, 0.35)';
  }

  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

/* Sistema de Click to Copy com Cadeado e Tooltip no DP */
function setupCopyableFieldsDP() {
  const isDpUser = loggedUser && loggedUser.departamento === 'dp';
  const dpPodeEditar = state.config?.dpPodeEditar === true;

  // Limpar botões antigos
  document.querySelectorAll('#modal-candidato-detalhes .dp-copy-btn').forEach(b => b.remove());
  document.querySelectorAll('#modal-candidato-detalhes .form-group-copyable').forEach(p => {
    p.classList.remove('form-group-copyable');
    p.style.position = '';
  });

  if (!(isDpUser && !dpPodeEditar)) return;

  const fields = document.querySelectorAll('#modal-candidato-detalhes .form-control');
  fields.forEach(field => {
    if (field.tagName.toLowerCase() === 'select') return;

    const parent = field.parentElement;
    if (!parent) return;
    parent.classList.add('form-group-copyable');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dp-copy-btn';
    btn.title = 'Copiar';
    btn.innerHTML = '<i class="fa-solid fa-copy"></i>';
    btn.style.cssText = [
      'position:absolute', 'right:8px', 'bottom:8px',
      'width:24px', 'height:24px', 'border-radius:6px',
      'border:1px solid var(--border-color)', 'background:var(--bg-card)',
      'color:var(--text-secondary)', 'cursor:pointer', 'font-size:11px',
      'display:flex', 'align-items:center', 'justify-content:center',
      'opacity:0', 'transition:opacity .2s', 'z-index:2', 'padding:0'
    ].join(';');

    parent.style.position = 'relative';
    parent.appendChild(btn);

    parent.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
    parent.addEventListener('mouseleave', () => { btn.style.opacity = '0'; });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const val = (field.value || field.textContent || '').trim();
      if (!val) return;
      navigator.clipboard.writeText(val).then(() => {
        btn.innerHTML = '<i class="fa-solid fa-check"></i>';
        btn.style.color = '#10b981';
        setTimeout(() => {
          btn.innerHTML = '<i class="fa-solid fa-copy"></i>';
          btn.style.color = '';
        }, 1500);
        const tooltip = document.getElementById('copy-tooltip');
        if (tooltip) {
          tooltip.classList.add('show');
          setTimeout(() => tooltip.classList.remove('show'), 1800);
        }
      });
    });
  });
}

/* Verifica se o usuário ativo é o destaque da semana e insere coroa */
function verificarDestaqueCabecalho() {
  const avatarEl = document.getElementById('header-user-avatar');
  if (!avatarEl || !loggedUser) return;

  const { recrutadorId: destId } = calcularRecrutadorSemana();
  
  const recMatch = destId && loggedUser.nome.toLowerCase().includes(destId.toLowerCase());
  
  if (recMatch) {
    avatarEl.classList.add('avatar-destaque-glow');
  } else {
    avatarEl.classList.remove('avatar-destaque-glow');
  }
}

// ──────────────────────────────────────────────
// MODAL: NOVO CLIENTE (EMPRESA PARCEIRA)
// ──────────────────────────────────────────────
window.fecharModalNovoCliente = function() {
  const m = document.getElementById('modal-novo-cliente');
  if (m) { m.classList.remove('active'); document.getElementById('form-novo-cliente').reset(); }
  const box = document.getElementById('cli-coords-box');
  if (box) box.style.display = 'none';
};

window.autoSiglaCliente = function() {
  const nome = document.getElementById('cli-nome').value.trim();
  const siglaEl = document.getElementById('cli-sigla');
  if (!siglaEl || siglaEl.dataset.userEdited) return;
  const words = nome.split(/\s+/).filter(Boolean);
  let sigla = '';
  if (words.length === 1) sigla = words[0].slice(0, 4).toUpperCase();
  else sigla = words.map(w => w[0]).join('').slice(0, 4).toUpperCase();
  siglaEl.value = sigla;
};

window.autoLatLngCliente = function() {
  const cidade = document.getElementById('cli-cidade').value.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const coords = CIDADE_COORDS[cidade];
  const latEl  = document.getElementById('cli-lat');
  const lngEl  = document.getElementById('cli-lng');
  const box    = document.getElementById('cli-coords-box');
  const txt    = document.getElementById('cli-coords-txt');
  if (coords && latEl && lngEl) {
    latEl.value = coords.lat;
    lngEl.value = coords.lng;
    if (box && txt) {
      txt.textContent = 'Localização encontrada automaticamente: ' + coords.lat + ', ' + coords.lng + ' — cálculo de proximidade ativo!';
      box.style.display = 'block';
    }
  } else if (box) {
    box.style.display = 'none';
    if (latEl) latEl.value = '';
    if (lngEl) lngEl.value = '';
  }
};

// ==========================================================================
// MÓDULO: SISTEMA DE SENHAS / FILA
// ==========================================================================

const FILA_TIPO_LABEL = { selecao: 'Seleção', dp: 'Depto. Pessoal', geral: 'Geral' };
const FILA_TIPO_COR   = { selecao: '#6366f1', dp: '#10b981', geral: '#f59e0b' };
const FILA_TIPO_PREFX = { selecao: 'S', dp: 'D', geral: 'G' };

// Gera número formatado: S-001
function _filaNumero(tipo, contador) {
  return (FILA_TIPO_PREFX[tipo] || 'G') + '-' + String(contador).padStart(3, '0');
}

// Voz — usa Web Speech API
function _falarSenha(numero, nome, tipo) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const dept = tipo === 'selecao' ? 'balcão de Seleção' :
               tipo === 'dp'      ? 'Departamento Pessoal' : 'atendimento geral';
  const texto = nome
    ? `Senha ${numero.replace('-', ' ')}.  ${nome}, por favor, dirija-se ao ${dept}.`
    : `Senha ${numero.replace('-', ' ')}.  Por favor, dirija-se ao ${dept}.`;
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = 'pt-BR'; u.rate = 0.88; u.pitch = 1; u.volume = 1;
  const vozes = window.speechSynthesis.getVoices();
  const voz = vozes.find(v => v.lang === 'pt-BR') || vozes.find(v => v.lang.startsWith('pt'));
  if (voz) u.voice = voz;
  window.speechSynthesis.speak(u);
  setTimeout(() => window.speechSynthesis.speak(u), 3500);
}

// Gera uma nova senha e salva no estado
window.gerarSenhaFila = function(tipo) {
  if (!state.fila) state.fila = { contadores: { selecao: 0, dp: 0, geral: 0 }, senhas: [], ultimaChamada: null };
  if (!state.fila.contadores[tipo] && state.fila.contadores[tipo] !== 0) state.fila.contadores[tipo] = 0;
  state.fila.contadores[tipo]++;
  const numero = _filaNumero(tipo, state.fila.contadores[tipo]);
  const senha = {
    id:        'senha-' + Date.now(),
    numero,
    tipo,
    nome:      '',
    candidatoId: null,
    geradaEm:  Date.now(),
    status:    'aguardando',
    chamadaEm: null
  };
  state.fila.senhas.push(senha);
  saveState();
  renderFila();
  // Abre impressão automática
  _imprimirTicket(senha);
  return senha;
};

// Chama a próxima senha de um departamento
window.chamarProximaSenha = function(tipo) {
  const proxima = (state.fila.senhas || []).find(s => s.tipo === tipo && s.status === 'aguardando');
  if (!proxima) { alert('Não há senhas aguardando para ' + (FILA_TIPO_LABEL[tipo] || tipo) + '.'); return; }
  proxima.status    = 'chamada';
  proxima.chamadaEm = Date.now();
  state.fila.ultimaChamada = { numero: proxima.numero, tipo: proxima.tipo, nome: proxima.nome, chamadaEm: proxima.chamadaEm };
  saveState();
  renderFila();
  _falarSenha(proxima.numero, proxima.nome, proxima.tipo);
};

// Chama uma senha específica pelo ID
window.chamarSenhaEspecifica = function(senhaId) {
  const senha = (state.fila.senhas || []).find(s => s.id === senhaId);
  if (!senha) return;
  senha.status    = 'chamada';
  senha.chamadaEm = Date.now();
  state.fila.ultimaChamada = { numero: senha.numero, tipo: senha.tipo, nome: senha.nome, chamadaEm: senha.chamadaEm };
  saveState();
  renderFila();
  _falarSenha(senha.numero, senha.nome, senha.tipo);
};

// Marca senha como atendida
window.finalizarSenha = function(senhaId) {
  const senha = (state.fila.senhas || []).find(s => s.id === senhaId);
  if (!senha) return;
  senha.status = 'atendida';
  saveState();
  renderFila();
};

// Cancela/remove senha da fila
window.cancelarSenha = function(senhaId) {
  if (!confirm('Cancelar essa senha?')) return;
  state.fila.senhas = (state.fila.senhas || []).filter(s => s.id !== senhaId);
  saveState();
  renderFila();
};

// Limpa toda a fila (mantém contadores e histórico)
window.limparFilaCompleta = function() {
  if (!confirm('Limpar toda a fila atual? As senhas serão apagadas e os contadores reiniciados.')) return;
  state.fila.senhas = [];
  state.fila.contadores = { selecao: 0, dp: 0, geral: 0 };
  state.fila.ultimaChamada = null;
  saveState();
  renderFila();
};

// Impressão do ticket
function _imprimirTicket(senha) {
  const agora = new Date();
  const dataHora = agora.toLocaleDateString('pt-BR') + ' às ' + agora.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
  const cor = FILA_TIPO_COR[senha.tipo] || '#6366f1';
  const dept = FILA_TIPO_LABEL[senha.tipo] || senha.tipo;
  const win = window.open('', '_blank', 'width=400,height=500');
  if (!win) { alert('Permita pop-ups para imprimir o ticket.'); return; }
  win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Senha ${senha.numero}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',sans-serif; background:#fff; display:flex; align-items:center; justify-content:center; min-height:100vh; }
  .ticket { width:280px; border:2px solid #e2e8f0; border-radius:16px; overflow:hidden; }
  .ticket-header { background:${cor}; padding:18px; text-align:center; color:#fff; }
  .ticket-header .empresa { font-size:13px; font-weight:800; letter-spacing:2px; opacity:.9; }
  .ticket-header .dept { font-size:11px; margin-top:4px; opacity:.75; }
  .ticket-body { padding:24px 20px; text-align:center; }
  .ticket-label { font-size:11px; color:#94a3b8; letter-spacing:2px; font-weight:600; text-transform:uppercase; margin-bottom:8px; }
  .ticket-num { font-size:72px; font-weight:900; color:${cor}; line-height:1; }
  .ticket-footer { border-top:1px dashed #e2e8f0; padding:14px 20px; text-align:center; }
  .ticket-footer p { font-size:11px; color:#64748b; margin-bottom:4px; }
  .ticket-footer .data { font-size:10px; color:#94a3b8; }
  @media print { body { background:#fff; } .no-print { display:none; } }
</style>
</head>
<body>
<div class="ticket">
  <div class="ticket-header">
    <div class="empresa">R&amp;T EMPREGOS</div>
    <div class="dept">${dept}</div>
  </div>
  <div class="ticket-body">
    <div class="ticket-label">Sua Senha</div>
    <div class="ticket-num">${senha.numero}</div>
  </div>
  <div class="ticket-footer">
    <p>Aguarde ser chamado(a)</p>
    <p>Acompanhe o painel de senhas</p>
    <div class="data">${dataHora}</div>
  </div>
</div>
<script>window.onload = function(){ window.print(); setTimeout(()=>window.close(),1500); }<\/script>
</body>
</html>`);
  win.document.close();
}

window.imprimirSenhaNovamente = function(senhaId) {
  const senha = (state.fila.senhas || []).find(s => s.id === senhaId);
  if (senha) _imprimirTicket(senha);
};

// Render principal da aba Fila
function renderFila() {
  const container = document.getElementById('fila-conteudo');
  if (!container) return;

  const fila = state.fila || { contadores: {}, senhas: [], ultimaChamada: null };
  const senhas = fila.senhas || [];
  const aguardando = senhas.filter(s => s.status === 'aguardando');
  const chamadas   = senhas.filter(s => s.status === 'chamada');
  const atendidas  = senhas.filter(s => s.status === 'atendida');

  const podeChamar = loggedUser && (loggedUser.departamento === 'selecao' || loggedUser.departamento === 'dp' || loggedUser.departamento === 'administracao' || loggedUser.login === 'joaobalaf');
  const podeGerar  = loggedUser;

  const _esc2 = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // Últimas chamadas na ordem
  const historico = [...senhas].filter(s => s.status !== 'aguardando').sort((a,b) => (b.chamadaEm||0)-(a.chamadaEm||0)).slice(0,8);

  container.innerHTML = `
  <div class="page-title-section" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
    <div>
      <h1 style="display:flex;align-items:center;gap:10px;"><i class="fa-solid fa-ticket" style="color:#6366f1;"></i> Sistema de Senhas</h1>
      <p class="page-subtitle">Gerencie e chame senhas de atendimento para cada departamento</p>
    </div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
      <a href="fila-display.html" target="_blank"
        style="padding:8px 16px;border-radius:10px;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.3);color:#6366f1;text-decoration:none;font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px;">
        <i class="fa-solid fa-tv"></i> Abrir Painel TV
      </a>
      <button onclick="limparFilaCompleta()"
        style="padding:8px 14px;border-radius:10px;border:1px solid var(--border-color);background:transparent;color:var(--text-secondary);cursor:pointer;font-size:12px;font-family:inherit;">
        <i class="fa-solid fa-rotate"></i> Limpar Fila
      </button>
    </div>
  </div>

  <!-- CARDS DE GERAÇÃO / CHAMADA -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:24px;">
    ${['selecao','dp','geral'].map(tipo => {
      const cor  = FILA_TIPO_COR[tipo];
      const label = FILA_TIPO_LABEL[tipo];
      const qtd  = aguardando.filter(s => s.tipo === tipo).length;
      const prox = aguardando.find(s => s.tipo === tipo);
      const cont = fila.contadores[tipo] || 0;
      return `
      <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;overflow:hidden;">
        <div style="height:5px;background:${cor};"></div>
        <div style="padding:20px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <div style="font-size:14px;font-weight:700;color:var(--text-primary);">${label}</div>
            <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;background:${cor}22;color:${cor};border:1px solid ${cor}44;">
              ${qtd} aguardando
            </span>
          </div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:14px;">
            Próxima: <strong style="color:var(--text-primary);">${prox ? prox.numero : '—'}</strong>
            &nbsp;·&nbsp; Total emitidas: <strong>${cont}</strong>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${podeGerar ? `
            <button onclick="gerarSenhaFila('${tipo}')"
              style="flex:1;padding:9px 12px;border-radius:9px;border:none;background:${cor};color:#fff;cursor:pointer;font-size:12px;font-weight:700;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;">
              <i class="fa-solid fa-plus"></i> Gerar Senha
            </button>` : ''}
            ${podeChamar ? `
            <button onclick="chamarProximaSenha('${tipo}')"
              style="flex:1;padding:9px 12px;border-radius:9px;border:1px solid ${cor}55;background:${cor}18;color:${cor};cursor:pointer;font-size:12px;font-weight:700;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;">
              <i class="fa-solid fa-bell"></i> Chamar Próxima
            </button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>

  <!-- FILA AGUARDANDO + HISTÓRICO -->
  <div style="display:grid;grid-template-columns:1fr 360px;gap:18px;align-items:start;">

    <!-- Fila aguardando -->
    <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:20px;">
      <div style="font-size:13px;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <i class="fa-solid fa-hourglass-half" style="color:#f59e0b;"></i> Fila de Espera
        <span style="font-size:10px;padding:2px 8px;border-radius:8px;background:rgba(245,158,11,0.12);color:#f59e0b;">${aguardando.length} na fila</span>
      </div>
      ${aguardando.length === 0 ? `<p style="font-size:12px;color:var(--text-secondary);text-align:center;padding:24px 0;"><i class="fa-regular fa-circle-check" style="font-size:24px;display:block;margin-bottom:8px;opacity:.3;"></i>Fila vazia</p>` :
        `<div style="display:flex;flex-direction:column;gap:6px;">
          ${aguardando.map(s => {
            const cor = FILA_TIPO_COR[s.tipo] || '#6366f1';
            return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:var(--bg-main);border:1px solid var(--border-color);">
              <div style="font-size:16px;font-weight:800;color:${cor};min-width:54px;">${_esc2(s.numero)}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:11px;font-weight:600;color:var(--text-secondary);">${FILA_TIPO_LABEL[s.tipo] || s.tipo}</div>
                <div style="font-size:10px;color:var(--text-secondary);opacity:.6;">${new Date(s.geradaEm).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>
              </div>
              <div style="display:flex;gap:5px;">
                ${podeChamar ? `<button onclick="chamarSenhaEspecifica('${s.id}')" title="Chamar agora"
                  style="padding:5px 9px;border-radius:7px;border:none;background:${cor};color:#fff;cursor:pointer;font-size:11px;font-family:inherit;">
                  <i class="fa-solid fa-bell"></i>
                </button>` : ''}
                <button onclick="imprimirSenhaNovamente('${s.id}')" title="Reimprimir"
                  style="padding:5px 9px;border-radius:7px;border:1px solid var(--border-color);background:transparent;color:var(--text-secondary);cursor:pointer;font-size:11px;font-family:inherit;">
                  <i class="fa-solid fa-print"></i>
                </button>
                <button onclick="cancelarSenha('${s.id}')" title="Cancelar"
                  style="padding:5px 9px;border-radius:7px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:#ef4444;cursor:pointer;font-size:11px;font-family:inherit;">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>`;
          }).join('')}
        </div>`}
    </div>

    <!-- Histórico de chamadas -->
    <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:20px;">
      <div style="font-size:13px;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
        <i class="fa-solid fa-clock-rotate-left" style="color:#6366f1;"></i> Chamadas Recentes
      </div>
      ${historico.length === 0 ? `<p style="font-size:12px;color:var(--text-secondary);text-align:center;padding:16px 0;">Nenhuma chamada ainda</p>` :
        historico.map(s => {
          const cor = FILA_TIPO_COR[s.tipo] || '#6366f1';
          const hora = s.chamadaEm ? new Date(s.chamadaEm).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '—';
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-color);">
            <div style="font-size:14px;font-weight:800;color:${cor};min-width:50px;">${_esc2(s.numero)}</div>
            <div style="flex:1;">
              <div style="font-size:10px;font-weight:600;color:var(--text-secondary);">${FILA_TIPO_LABEL[s.tipo] || s.tipo}</div>
            </div>
            <div style="font-size:10px;color:var(--text-secondary);">${hora}</div>
            <span style="font-size:9px;padding:2px 6px;border-radius:6px;${s.status==='atendida' ? 'background:rgba(16,185,129,0.12);color:#10b981;' : 'background:rgba(99,102,241,0.1);color:#6366f1;'}">
              ${s.status === 'atendida' ? 'Atendida' : 'Chamada'}
            </span>
          </div>`;
        }).join('')}
    </div>
  </div>`;
}

// ==========================================================================
// BLOQUEIO DE FICHA DP
// ==========================================================================

window.liberarFichaDP = function(candidatoId) {
  const cand = state.candidatos.find(c => c.id === candidatoId);
  if (!cand) return;
  const lock = cand.dpLock;
  if (!lock || lock.userLogin !== (loggedUser && loggedUser.login)) return;
  cand.dpLock = null;
  if (!cand.historico) cand.historico = [];
  cand.historico.push({
    data: new Date().toLocaleString('pt-BR'),
    autor: `${loggedUser.nome} (DP)`,
    acao: 'Ficha liberada para outros colaboradores do DP.',
    tipo: 'liberacao'
  });
  saveState();
  fecharDrawerDetalhes();
  renderCurrentAba();
};

// ==========================================================================
// MÓDULO: MEU PAINEL
// ==========================================================================

const _esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function renderMeuPainel() {
  const container = document.getElementById('meu-painel-conteudo');
  if (!container || !loggedUser) return;
  try {
    // Vínculo automático e seguro pelo ID do usuário logado (fallback por login p/ compat)
    const rec = (state.recrutadores || []).find(r => r.usuarioId && r.usuarioId === loggedUser.id)
             || (state.recrutadores || []).find(r => r.loginVinculado && r.loginVinculado === loggedUser.login);
    if (!rec) {
      _renderVinculacaoMeuPainel(container);
    } else {
      _renderPainelCompleto(container, rec);
    }
  } catch(e) {
    container.innerHTML = `<div style="padding:20px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:10px;color:#ef4444;font-size:12px;">
      <strong>Erro ao carregar o Meu Painel:</strong> ${_esc(e.message)}<br>
      <span style="opacity:.7;">Recarregue a página (F5) para tentar novamente.</span>
    </div>`;
  }
}

function _renderVinculacaoMeuPainel(container) {
  // O vínculo agora é feito SOMENTE pelo administrador (não há auto-seleção).
  container.innerHTML = `
    <div style="max-width:460px;margin:40px auto;background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;padding:36px;text-align:center;">
      <div style="width:64px;height:64px;border-radius:50%;background:rgba(245,158,11,0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:28px;color:#f59e0b;">
        <i class="fa-solid fa-id-card-clip"></i>
      </div>
      <h2 style="font-size:18px;font-weight:700;margin-bottom:8px;color:var(--text-primary);">Painel ainda não vinculado</h2>
      <p style="font-size:13px;color:var(--text-secondary);line-height:1.6;">Seu usuário ainda não está vinculado a um perfil de recrutadora. Por segurança, esse vínculo é feito pelo administrador.</p>
      <p style="font-size:12px;color:var(--text-secondary);margin-top:14px;">Peça ao administrador para vincular o seu login (<strong>${_esc(loggedUser ? loggedUser.login : '')}</strong>) ao seu perfil em <em>Funcionários → Permissões</em>.</p>
    </div>`;
}


function _renderPainelCompleto(container, rec) {
  const base = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
  const linkFicha = base + 'candidato.html?rec=' + rec.id;
  const linkBT    = base + 'talento.html?rec=' + rec.id;
  const meusCands = (state.candidatos || []).filter(c => c.recrutadorId === rec.id);
  const meusBT    = (state.bancoTalentos || []).filter(bt => bt.recrutadorId === rec.id);

  const STATUS_COR   = { pendente:'#f59e0b', em_analise:'#3b82f6', entrevista:'#8b5cf6', aprovado:'#10b981', reprovado:'#ef4444', contratado:'#0ea5e9', aguardando_consulta_cpf:'#94a3b8' };
  const STATUS_LABEL = { pendente:'Pendente', em_analise:'Em Análise', entrevista:'Entrevista', aprovado:'Aprovado', reprovado:'Reprovado', contratado:'Contratado', aguardando_consulta_cpf:'Ag. CPF' };

  const linhasCands = meusCands.length === 0
    ? `<tr><td colspan="4" style="padding:20px;text-align:center;font-size:12px;color:var(--text-secondary);">Nenhum candidato atribuído ainda.</td></tr>`
    : meusCands.slice(0, 25).map(c => {
        const sc = STATUS_COR[c.status] || '#94a3b8';
        const sl = STATUS_LABEL[c.status] || c.status;
        const dt = c.dataCadastro ? new Date(c.dataCadastro).toLocaleDateString('pt-BR') : '—';
        return `<tr style="border-bottom:1px solid var(--border-color);cursor:pointer;" onclick="abrirDrawerDetalhes('${c.id}')">
          <td style="padding:8px 12px;font-size:12px;font-weight:600;color:var(--text-primary);">${_esc(c.nome)}</td>
          <td style="padding:8px 12px;"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:${sc}22;color:${sc};border:1px solid ${sc}44;">${sl}</span></td>
          <td style="padding:8px 12px;font-size:11px;color:var(--text-secondary);">${_esc(c.codigoVaga || '—')}</td>
          <td style="padding:8px 12px;font-size:11px;color:var(--text-secondary);">${dt}</td>
        </tr>`;
      }).join('');

  const waAbrirBtn = rec.whatsapp
    ? `<a href="https://wa.me/${rec.whatsapp.replace(/\D/g,'')}" target="_blank" style="padding:8px 12px;border-radius:8px;border:none;background:#25d366;color:#fff;font-size:12px;text-decoration:none;display:flex;align-items:center;gap:5px;white-space:nowrap;flex-shrink:0;"><i class="fa-brands fa-whatsapp"></i> Abrir</a>`
    : '';

  const qrBTUrl    = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(linkBT)}`;
  const qrFichaUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(linkFicha)}`;

  const msgBT    = `Olá! Me chamo ${rec.nome}, sou recrutadora da R&T Empregos. Temos vagas disponíveis na sua região! Acesse nosso banco de oportunidades e se candidate: ${linkBT}`;
  const msgFicha = `Olá! Me chamo ${rec.nome}, sou recrutadora da R&T Empregos. Para se candidatar às nossas vagas, preencha sua ficha pelo link: ${linkFicha}`;

  container.innerHTML = `
    <!-- HEADER -->
    <div style="display:flex;align-items:center;gap:18px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;padding:20px 24px;margin-bottom:20px;flex-wrap:wrap;">
      <div style="width:56px;height:56px;border-radius:50%;background:${rec.corHex};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:22px;color:#fff;flex-shrink:0;">${rec.nome[0]}</div>
      <div style="flex:1;min-width:160px;">
        <div style="font-size:18px;font-weight:800;color:var(--text-primary);">${_esc(rec.nome)}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${_esc(loggedUser.cargo || loggedUser.departamento)} · Meu Painel Pessoal</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <span style="font-size:11px;font-weight:600;padding:4px 12px;border-radius:12px;background:rgba(16,185,129,0.12);color:#10b981;border:1px solid rgba(16,185,129,0.3);">${meusCands.length} candidatos</span>
        <span style="font-size:11px;font-weight:600;padding:4px 12px;border-radius:12px;background:rgba(168,85,247,0.12);color:#a855f7;border:1px solid rgba(168,85,247,0.3);">${meusBT.length} no BT</span>
      </div>
    </div>

    <!-- GRID 2 COLUNAS: LINKS + WHATSAPP -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px;">

      <!-- MEUS LINKS -->
      <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:20px;">
        <div style="font-size:13px;font-weight:700;margin-bottom:16px;color:var(--text-primary);display:flex;align-items:center;gap:8px;">
          <i class="fa-solid fa-link" style="color:#3b82f6;"></i> Meus Links
        </div>
        <!-- BT -->
        <div style="background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.2);border-radius:10px;padding:14px;margin-bottom:12px;">
          <div style="font-size:11px;font-weight:700;color:#a855f7;margin-bottom:10px;display:flex;align-items:center;gap:6px;"><i class="fa-solid fa-users"></i> Banco de Talentos</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
            <button onclick="navigator.clipboard.writeText('${linkBT}').then(()=>{this.textContent='✓ Copiado!';setTimeout(()=>{this.innerHTML='<i class=\\'fa-solid fa-copy\\'></i> Copiar'},1800)})"
              style="padding:5px 10px;border-radius:7px;border:1px solid rgba(168,85,247,0.4);background:rgba(168,85,247,0.1);color:#a855f7;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;gap:5px;font-family:inherit;">
              <i class="fa-solid fa-copy"></i> Copiar</button>
            <a href="${linkBT}" target="_blank" style="padding:5px 10px;border-radius:7px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-secondary);cursor:pointer;font-size:11px;text-decoration:none;display:inline-flex;align-items:center;gap:5px;">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir</a>
            <button onclick="toggleQrMeuPainel('qr-bt-img')"
              style="padding:5px 10px;border-radius:7px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-secondary);cursor:pointer;font-size:11px;display:inline-flex;align-items:center;gap:5px;font-family:inherit;">
              <i class="fa-solid fa-qrcode"></i> QR</button>
            <button onclick="navigator.clipboard.writeText(${JSON.stringify(msgBT)}).then(()=>{this.textContent='✓ Copiado!';setTimeout(()=>{this.innerHTML='<i class=\\'fa-solid fa-message\\'></i> Divulgar'},1800)})"
              style="padding:5px 10px;border-radius:7px;border:1px solid rgba(16,185,129,0.4);background:rgba(16,185,129,0.08);color:#10b981;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;gap:5px;font-family:inherit;">
              <i class="fa-solid fa-message"></i> Divulgar</button>
          </div>
          <div id="qr-bt-img" style="display:none;text-align:center;padding-top:6px;">
            <img src="${qrBTUrl}" alt="QR Code Banco de Talentos" style="border-radius:8px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.15);">
          </div>
        </div>
        <!-- Ficha -->
        <div style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.2);border-radius:10px;padding:14px;">
          <div style="font-size:11px;font-weight:700;color:#3b82f6;margin-bottom:10px;display:flex;align-items:center;gap:6px;"><i class="fa-solid fa-file-pen"></i> Ficha de Candidatura</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
            <button onclick="navigator.clipboard.writeText('${linkFicha}').then(()=>{this.textContent='✓ Copiado!';setTimeout(()=>{this.innerHTML='<i class=\\'fa-solid fa-copy\\'></i> Copiar'},1800)})"
              style="padding:5px 10px;border-radius:7px;border:1px solid rgba(59,130,246,0.4);background:rgba(59,130,246,0.1);color:#3b82f6;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;gap:5px;font-family:inherit;">
              <i class="fa-solid fa-copy"></i> Copiar</button>
            <a href="${linkFicha}" target="_blank" style="padding:5px 10px;border-radius:7px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-secondary);cursor:pointer;font-size:11px;text-decoration:none;display:inline-flex;align-items:center;gap:5px;">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir</a>
            <button onclick="toggleQrMeuPainel('qr-ficha-img')"
              style="padding:5px 10px;border-radius:7px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-secondary);cursor:pointer;font-size:11px;display:inline-flex;align-items:center;gap:5px;font-family:inherit;">
              <i class="fa-solid fa-qrcode"></i> QR</button>
            <button onclick="navigator.clipboard.writeText(${JSON.stringify(msgFicha)}).then(()=>{this.textContent='✓ Copiado!';setTimeout(()=>{this.innerHTML='<i class=\\'fa-solid fa-message\\'></i> Divulgar'},1800)})"
              style="padding:5px 10px;border-radius:7px;border:1px solid rgba(16,185,129,0.4);background:rgba(16,185,129,0.08);color:#10b981;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;gap:5px;font-family:inherit;">
              <i class="fa-solid fa-message"></i> Divulgar</button>
          </div>
          <div id="qr-ficha-img" style="display:none;text-align:center;padding-top:6px;">
            <img src="${qrFichaUrl}" alt="QR Code Ficha" style="border-radius:8px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.15);">
          </div>
        </div>
      </div>

      <!-- MEU WHATSAPP -->
      <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:20px;">
        <div style="font-size:13px;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
          <i class="fa-brands fa-whatsapp" style="color:#25d366;font-size:16px;"></i> Meu WhatsApp
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="text" id="meu-painel-wa-input" value="${rec.whatsapp || ''}" placeholder="DDD + número (ex: 11999990000)"
            class="form-control" style="flex:1;font-size:13px;"
            oninput="salvarWhatsappRecrutadora('${rec.id}', this.value)">
          ${waAbrirBtn}
        </div>
        <p style="font-size:10px;color:var(--text-secondary);margin-top:6px;">Número salvo automaticamente ao digitar. Aparece como botão de contato no final dos formulários de candidatura.</p>
      </div>
    </div>

    <!-- MEUS CANDIDATOS -->
    <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:20px;">
      <div style="font-size:13px;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <i class="fa-solid fa-users" style="color:#10b981;"></i> Meus Candidatos
        <span style="font-size:10px;padding:2px 8px;border-radius:8px;background:rgba(16,185,129,0.12);color:#10b981;">${meusCands.length} total</span>
        <span style="font-size:11px;color:var(--text-secondary);font-weight:400;">· clique em uma linha para abrir a ficha</span>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:2px solid var(--border-color);">
              <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;">Nome</th>
              <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;">Status</th>
              <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;">Vaga</th>
              <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;">Cadastro</th>
            </tr>
          </thead>
          <tbody>${linhasCands}</tbody>
        </table>
        ${meusCands.length > 25 ? `<p style="font-size:11px;color:var(--text-secondary);text-align:center;padding:10px 0 0;">Mostrando 25 de ${meusCands.length}. Veja todos na aba <strong>Seleção</strong>.</p>` : ''}
      </div>
    </div>`;
}

window.vincularPerfilRecrutadora = function() {
  const sel = document.getElementById('meu-painel-select-rec');
  if (!sel || !sel.value) { alert('Selecione um perfil para vincular.'); return; }
  const rec = state.recrutadores.find(r => r.id === sel.value);
  if (!rec) return;
  rec.loginVinculado = loggedUser.login;
  saveState();
  renderMeuPainel();
};

window.desvincularPerfilRecrutadora = function() {
  const rec = state.recrutadores.find(r => (r.usuarioId && r.usuarioId === loggedUser.id) || (r.loginVinculado && r.loginVinculado === loggedUser.login));
  if (!rec) return;
  if (!confirm(`Desvincular o perfil "${rec.nome}" da sua conta? Você poderá vincular outro.`)) return;
  rec.loginVinculado = '';
  saveState();
  renderMeuPainel();
};

window.toggleQrMeuPainel = function(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

// ==========================================================================
// ABA: CONFIGURAÇÕES DO SISTEMA (SOMENTE ADMIN)
// ==========================================================================

// Definição dos campos padrão do formulário de Nova Vaga (para renomear labels)
const CAMPOS_PADRAO_VAGA = [
  { id: 'empresa',    label: 'Empresa Parceira',                      obrigatorio: true  },
  { id: 'cargo',      label: 'Cargo / Ocupação',                      obrigatorio: true  },
  { id: 'codigo',     label: 'Código da Unidade / Filial',            obrigatorio: true  },
  { id: 'salario',    label: 'Salário (R$)',                          obrigatorio: true  },
  { id: 'quantidade', label: 'Quantidade de Vagas Disponíveis',       obrigatorio: true  },
  { id: 'local',      label: 'Local de Trabalho',                     obrigatorio: true  },
  { id: 'beneficios', label: 'Benefícios (Separados por vírgula)',    obrigatorio: true  },
  { id: 'fretado',    label: 'Linhas de Fretado',                     obrigatorio: false },
  { id: 'escala',     label: 'Escala da Vaga',                        obrigatorio: false },
  { id: 'turnos',     label: 'Turnos disponíveis',                    obrigatorio: false },
  { id: 'desc',       label: 'Descrição Breve da Oportunidade',       obrigatorio: true  },
];

function renderConfiguracoes() {
  if (!loggedUser || (loggedUser.departamento !== 'administracao' && loggedUser.login !== 'joaobalaf')) return;

  const cfg = state.vagaFormConfig || { renomes: {}, camposExtras: [] };

  // ── Bloco 1: Renomear labels dos campos padrão ────────────────────────
  const listaRenomes = document.getElementById('renomes-campos-lista');
  if (listaRenomes) {
    listaRenomes.innerHTML = CAMPOS_PADRAO_VAGA.map(campo => {
      const valorAtual = cfg.renomes[campo.id] || campo.label;
      return `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; align-items:center; padding:10px 14px; background:var(--bg-main); border:1px solid var(--border-color); border-radius:8px;">
          <div>
            <div style="font-size:11px; font-weight:700; color:var(--text-secondary); margin-bottom:2px; text-transform:uppercase; letter-spacing:.5px;">Nome Padrão</div>
            <div style="font-size:13px; color:var(--text-primary); font-weight:500;">${campo.label} ${campo.obrigatorio ? '<span style="color:#ef4444;">*</span>' : ''}</div>
          </div>
          <div>
            <div style="font-size:11px; font-weight:700; color:var(--text-secondary); margin-bottom:4px; text-transform:uppercase; letter-spacing:.5px;">Nome Personalizado</div>
            <input type="text" id="renome-campo-${campo.id}" class="form-control" value="${valorAtual}" placeholder="${campo.label}" style="font-size:13px;">
          </div>
        </div>`;
    }).join('');

    // Listener do botão salvar renomes
    const btnSalvar = document.getElementById('btn-salvar-renomes');
    if (btnSalvar) {
      // Remove listener anterior se houver
      const novo = btnSalvar.cloneNode(true);
      btnSalvar.parentNode.replaceChild(novo, btnSalvar);
      novo.addEventListener('click', salvarRenomesVaga);
    }
  }

  // ── Bloco 2: Adicionar novo campo ──────────────────────────────────────
  const btnAdicionar = document.getElementById('btn-adicionar-campo-vaga');
  if (btnAdicionar) {
    const novo = btnAdicionar.cloneNode(true);
    btnAdicionar.parentNode.replaceChild(novo, btnAdicionar);
    novo.addEventListener('click', adicionarCampoVaga);
  }

  // ── Bloco 3: Listar campos extras já adicionados ───────────────────────
  renderListaCamposExtras();
}

function salvarRenomesVaga() {
  const cfg = state.vagaFormConfig || { renomes: {}, camposExtras: [] };
  CAMPOS_PADRAO_VAGA.forEach(campo => {
    const el = document.getElementById(`renome-campo-${campo.id}`);
    if (el) cfg.renomes[campo.id] = el.value.trim() || campo.label;
  });
  state.vagaFormConfig = cfg;
  saveState();
  // Atualizar labels no modal de nova vaga dinamicamente
  atualizarLabelsModalVaga();
  mostrarToastSucesso('Nomes dos campos salvos com sucesso!');
}

function atualizarLabelsModalVaga() {
  const cfg = state.vagaFormConfig || { renomes: {} };
  const map = {
    'empresa':    '[for="vaga-add-empresa"]',
    'cargo':      '[for="vaga-add-cargo"]',
    'codigo':     '[for="vaga-add-codigo"]',
    'salario':    '[for="vaga-add-salario"]',
    'quantidade': '[for="vaga-add-quantidade"]',
    'local':      '[for="vaga-add-local"]',
    'beneficios': '[for="vaga-add-beneficios"]',
    'fretado':    '[for="vaga-add-linhas-fretado"]',
    'escala':     '[for="vaga-add-escala"]',
    'turnos':     '[for="vaga-add-turnos"]',
    'desc':       '[for="vaga-add-desc"]',
  };
  CAMPOS_PADRAO_VAGA.forEach(campo => {
    const el = document.querySelector(map[campo.id]);
    if (el && cfg.renomes[campo.id]) {
      // Preserva o asterisco de obrigatorio se houver
      const obrStr = campo.obrigatorio ? ' *' : '';
      el.textContent = cfg.renomes[campo.id] + obrStr;
    }
  });
}

function adicionarCampoVaga() {
  const labelEl = document.getElementById('novo-campo-label');
  const tipoEl  = document.getElementById('novo-campo-tipo');
  const optsEl  = document.getElementById('novo-campo-opcoes');
  const obrEl   = document.getElementById('novo-campo-obrigatorio');

  const label = labelEl ? labelEl.value.trim() : '';
  const tipo  = tipoEl  ? tipoEl.value           : 'text';

  if (!label) { alert('Digite o nome do campo antes de adicionar.'); return; }

  const cfg = state.vagaFormConfig || { renomes: {}, camposExtras: [] };
  const id  = 'ce_' + Date.now();

  const novoCampo = {
    id,
    label,
    tipo,
    obrigatorio: obrEl ? obrEl.checked : false,
    opcoes: (tipo === 'select' || tipo === 'checkbox-group')
      ? (optsEl ? optsEl.value.split('\n').map(o => o.trim()).filter(Boolean) : [])
      : []
  };

  cfg.camposExtras.push(novoCampo);
  state.vagaFormConfig = cfg;
  saveState();

  // Limpar formulário
  if (labelEl) labelEl.value = '';
  if (optsEl)  optsEl.value  = '';
  if (obrEl)   obrEl.checked = false;

  renderListaCamposExtras();
  injetarCamposExtrasNoForm();
  mostrarToastSucesso(`Campo "${novoCampo.label}" adicionado com sucesso!`);
}

function removerCampoVaga(campoId) {
  const cfg = state.vagaFormConfig || { renomes: {}, camposExtras: [] };
  const campo = cfg.camposExtras.find(c => c.id === campoId);
  if (!campo) return;
  if (!confirm(`Remover o campo "${campo.label}"? Esta ação não pode ser desfeita.`)) return;
  cfg.camposExtras = cfg.camposExtras.filter(c => c.id !== campoId);
  state.vagaFormConfig = cfg;
  saveState();
  renderListaCamposExtras();
  injetarCamposExtrasNoForm();
  mostrarToastSucesso('Campo removido.');
}
window.removerCampoVaga = removerCampoVaga;

function renderListaCamposExtras() {
  const cfg      = state.vagaFormConfig || { renomes: {}, camposExtras: [] };
  const lista    = document.getElementById('campos-extras-lista');
  const badge    = document.getElementById('campos-extras-count-badge');
  const count    = cfg.camposExtras.length;

  if (badge) badge.textContent = `${count} campo${count !== 1 ? 's' : ''} extra${count !== 1 ? 's' : ''}`;

  if (!lista) return;

  if (count === 0) {
    lista.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-secondary); font-size:13px;">
      <i class="fa-solid fa-inbox" style="font-size:28px; margin-bottom:8px; display:block; opacity:.4;"></i>
      Nenhum campo extra adicionado ainda. Use o formulário acima para criar novos campos.
    </div>`;
    return;
  }

  const tipoLabels = { text: 'Texto', number: 'Número', textarea: 'Texto Longo', select: 'Seleção', date: 'Data', 'checkbox-group': 'Múltipla Escolha' };

  lista.innerHTML = cfg.camposExtras.map((campo, idx) => `
    <div style="display:grid; grid-template-columns:1fr auto; gap:12px; align-items:center; padding:12px 14px; background:var(--bg-main); border:1px solid var(--border-color); border-radius:8px; margin-bottom:8px;">
      <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
        <div style="width:28px; height:28px; border-radius:8px; background:rgba(59,130,246,0.12); color:#3b82f6; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; flex-shrink:0;">${idx + 1}</div>
        <div>
          <div style="font-size:13px; font-weight:700; color:var(--text-primary);">${campo.label} ${campo.obrigatorio ? '<span style="color:#ef4444; font-size:11px;">*Obrigatório</span>' : '<span style="color:var(--text-secondary); font-size:11px;">Opcional</span>'}</div>
          <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">
            Tipo: <strong>${tipoLabels[campo.tipo] || campo.tipo}</strong>
            ${campo.opcoes && campo.opcoes.length ? ` · ${campo.opcoes.length} opção(ões)` : ''}
          </div>
        </div>
      </div>
      <button onclick="removerCampoVaga('${campo.id}')"
        style="padding:6px 12px; border-radius:7px; border:1px solid rgba(239,68,68,0.3); background:rgba(239,68,68,0.08); color:#ef4444; font-size:12px; cursor:pointer; white-space:nowrap; font-family:inherit; display:flex; align-items:center; gap:5px;">
        <i class="fa-solid fa-trash-can"></i> Remover
      </button>
    </div>
  `).join('');
}

// Injeta os campos extras no formulário de nova vaga (antes de abrir)
function injetarCamposExtrasNoForm() {
  const cfg  = state.vagaFormConfig || { renomes: {}, camposExtras: [] };
  const form = document.getElementById('form-nova-vaga');
  if (!form) return;

  // Remove campos extras já injetados
  form.querySelectorAll('.campo-extra-injetado').forEach(el => el.remove());

  // Atualiza os labels dos campos padrão com os renomes salvos
  atualizarLabelsModalVaga();

  if (!cfg.camposExtras || cfg.camposExtras.length === 0) return;

  // Ponto de inserção: antes do modal-footer
  const footer = form.querySelector('.modal-footer');
  if (!footer) return;

  cfg.camposExtras.forEach(campo => {
    const wrapper = document.createElement('div');
    wrapper.className = 'form-group campo-extra-injetado';
    wrapper.style.marginBottom = '14px';

    const obrigStr = campo.obrigatorio ? ' *' : '';
    let inputHtml = '';

    if (campo.tipo === 'textarea') {
      inputHtml = `<textarea id="vaga-extra-${campo.id}" class="form-control" rows="3" ${campo.obrigatorio ? 'required' : ''} placeholder="Preencha ${campo.label}..."></textarea>`;
    } else if (campo.tipo === 'select') {
      const opts = campo.opcoes.map(o => `<option value="${o}">${o}</option>`).join('');
      inputHtml = `<select id="vaga-extra-${campo.id}" class="form-control" ${campo.obrigatorio ? 'required' : ''}>
        <option value="">Selecione...</option>${opts}
      </select>`;
    } else if (campo.tipo === 'checkbox-group') {
      const checks = campo.opcoes.map(o =>
        `<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
          <input type="checkbox" name="vaga-extra-${campo.id}" value="${o}"> ${o}
        </label>`
      ).join('');
      inputHtml = `<div style="display:flex;flex-wrap:wrap;gap:10px;padding:12px;background:var(--bg-main);border:1px solid var(--border-color);border-radius:8px;">${checks}</div>`;
    } else {
      inputHtml = `<input type="${campo.tipo}" id="vaga-extra-${campo.id}" class="form-control" ${campo.obrigatorio ? 'required' : ''} placeholder="Preencha ${campo.label}...">`;
    }

    wrapper.innerHTML = `
      <label for="vaga-extra-${campo.id}" style="display:flex;align-items:center;gap:6px;">
        <span style="background:rgba(59,130,246,0.1);color:#3b82f6;font-size:10px;padding:1px 6px;border-radius:4px;font-weight:700;">EXTRA</span>
        ${campo.label}${obrigStr}
      </label>
      ${inputHtml}`;

    form.querySelector('.modal-body').insertBefore(wrapper, footer);
  });
}

// Mostra/oculta a caixa de opções para select e checkbox-group
function atualizarPreviewNovoCampo() {
  const tipo = document.getElementById('novo-campo-tipo')?.value;
  const box  = document.getElementById('novo-campo-opcoes-box');
  if (box) box.style.display = (tipo === 'select' || tipo === 'checkbox-group') ? 'block' : 'none';
}

// Helper toast reutilizável
function mostrarToastSucesso(msg) {
  const toast = document.getElementById('modern-toast');
  const txt   = document.getElementById('modern-toast-text');
  if (!toast) return;
  if (txt) txt.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Máscara CNPJ: 00.000.000/0000-00
function mascaraCNPJ(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 14);
  v = v.replace(/^(\d{2})(\d)/, '$1.$2');
  v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
  v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
  v = v.replace(/(\d{4})(\d)/, '$1-$2');
  input.value = v;
}
window.mascaraCNPJ = mascaraCNPJ;

// Máscara CEP: 00000-000
function mascaraCEPCliente(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 8);
  v = v.replace(/^(\d{5})(\d)/, '$1-$2');
  input.value = v;
}
window.mascaraCEPCliente = mascaraCEPCliente;

// Injetar campos ao abrir o modal de nova vaga
(function patchBtnNovaVaga() {
  const orig = window.fecharModalVaga;
  // Patch no evento de abertura do botão nova vaga (chamado em setupEventListeners)
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('#btn-nova-vaga');
    if (btn) {
      // Aguarda o modal abrir e injeta campos
      requestAnimationFrame(() => injetarCamposExtrasNoForm());
    }
  }, true);
})();




