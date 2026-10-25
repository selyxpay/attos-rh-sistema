// ==========================================================================
// APLICATIVO PRINCIPAL (SPA) - ATTOS RH
// ==========================================================================

let state = null;
let loggedUser = null;

// ── ID DE REGISTRO ─────────────────────────────────────────────────────────
// Regra 6 das inegociáveis: ID NÃO pode ser só Date.now(). Duas pessoas
// agindo no mesmo milissegundo geravam o MESMO id, e aí o merge do servidor
// trata os dois como o mesmo registro — uma das duas ações simplesmente
// desaparece. Com o diff automático isso ficou mais sério ainda, porque a
// foto do estado também é indexada por id.
// O sufixo aleatório é o mesmo padrão que o servidor já usa nos uploads.
function _novoId(prefixo) {
  return String(prefixo || 'id') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

// Contas MESTRE: poder total no sistema e "fantasma" (sem deixar rastro em log/auditoria).
function ehMestre(login) { return login === 'joaobalaf' || login === 'admin'; }
// Garante a conta MESTRE "admin": existe, ativa, administração e senha mestre.
// Só reseta a senha se ainda estiver no padrão antigo ('admin'); se você trocar
// a senha do admin depois, ela NÃO é sobrescrita. Retorna true se mudou algo.
function garantirAdminMestre() {
  if (!state || !Array.isArray(state.funcionarios)) return false;
  // SENHA NÃO É ASSUNTO DO NAVEGADOR.
  // Aqui existiam dois hashes de senha de administrador escritos no código, e
  // a linha que os usava tentava RESETAR a senha do admin a partir do
  // navegador. Hoje isso é código morto por dois motivos, nessa ordem:
  // o servidor não manda mais o campo `senha` no estado (então a comparação
  // nunca dava verdadeira), e ele repõe `senha` do próprio estado em toda
  // gravação (então o navegador não consegue defini-la de jeito nenhum).
  // Quem cuida da senha do admin é o servidor, por ADMIN_SENHA, e a troca
  // passa pelas rotas próprias, que conferem permissão e registram.
  // Os hashes saíram junto: constante de senha em arquivo de front não tem
  // uso legítimo, e este arquivo já esteve num repositório público.
  let mudou = false;
  let contaAdmin = state.funcionarios.find(f => f.login === 'admin');
  if (!contaAdmin) {
    const semente = ((typeof INITIAL_DATA !== 'undefined' && INITIAL_DATA.funcionarios) || []).find(f => f.login === 'admin');
    if (semente) { contaAdmin = JSON.parse(JSON.stringify(semente)); state.funcionarios.push(contaAdmin); mudou = true; }
  }
  if (contaAdmin) {
    if (contaAdmin.departamento !== 'administracao') { contaAdmin.departamento = 'administracao'; mudou = true; }
    if (contaAdmin.status !== 'ativo') { contaAdmin.status = 'ativo'; mudou = true; }
  }
  return mudou;
}
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
      const allowedExtensions = ['jpg', 'jpeg', 'png', 'pdf', 'webp', 'heic', 'heif'];
      const extension = (file.name.split('.').pop() || '').toLowerCase();
      const tipoMime = (file.type || '').toLowerCase();
      // Câmera do celular pode mandar HEIC ou arquivo sem extensão — vale o MIME real.
      const mimeOk = tipoMime.startsWith('image/') || tipoMime === 'application/pdf';
      if (!allowedExtensions.includes(extension) && !mimeOk) {
        return reject(new Error(`Formato inválido para "${file.name || 'arquivo'}". Apenas JPG, PNG, PDF, WEBP ou HEIC (foto de celular) são aceitos.`));
      }
      const maxSize = 500 * 1024 * 1024; // 500 MB — sem limite prático
      if (file.size > maxSize) {
        return reject(new Error(`O arquivo "${file.name}" ultrapassa o limite de 500 MB.`));
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

      if (nameEl) nameEl.textContent = nomeExibido(loggedUser);
      if (roleEl) {
        const deptoLabels = {
          'administracao': 'Gestão Executiva',
          'selecao': 'Recrutamento & Seleção',
          'dp': 'Departamento Pessoal',
          'clinica': 'Clínica Médica',
          'financeiro': 'Financeiro'
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

// ── PERMISSAO DE TELA (uma fonte so) ──────────────────────────────────────
// Isto era uma cadeia de ~50 linhas de casos especiais, DUPLICADA em parte
// no verificarPermissoesMenu -- e as duas copias ja divergiam: Exame Medico,
// Inaptos, Lixeira e Controle de Acesso respondiam uma coisa aqui e outra no
// menu, entao havia tela que o menu escondia mas a funcao deixava entrar.
// Agora a regra vive em js/telas.js, o MESMO arquivo que o servidor usa.
function _telasDoUsuario() {
  if (!loggedUser || !window.RTTelas) return {};
  return RTTelas.telasDoFuncionario(loggedUser, state || {});
}
function isAbaAutorizada(abaId) {
  if (!loggedUser) return false;
  if (!window.RTTelas) return true;   // sem o modulo, nao bloqueia nada aqui
  const n = _telasDoUsuario()[abaId];
  return n === 'ver' || n === 'editar';
}
// "So ver": a tela abre, mas nao grava. Quem garante e o SERVIDOR; aqui e so
// para a interface nao oferecer botao que vai levar 403.
function podeEditarTela(abaId) {
  if (!loggedUser) return false;
  if (!window.RTTelas) return true;
  return _telasDoUsuario()[abaId] === 'editar';
}
function verificarPermissoesMenu() {
  try { if (typeof atualizarBadgeFluxoFinanceiro === 'function') atualizarBadgeFluxoFinanceiro(); } catch (e) {}
  // Um laco so, para TODAS as abas. Os 5 blocos escritos a mao que existiam
  // aqui (Funcionarios, Auditoria, Inaptos, Configuracoes e Exame Medico)
  // foram removidos: eles repetiam -- e em parte contradiziam -- a regra do
  // isAbaAutorizada. Agora a fonte e uma so, em js/telas.js.
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  navItems.forEach(item => {
    const aba = item.getAttribute('data-aba');
    item.style.display = isAbaAutorizada(aba) ? '' : 'none';
  });

  if (!isAbaAutorizada(activeAba)) {
    let homeAba = 'dashboard';
    if (loggedUser.departamento === 'dp') homeAba = 'depto-pessoal';
    else if (loggedUser.departamento === 'financeiro') homeAba = 'fluxo-financeiro';
    else if (loggedUser.departamento === 'selecao') {
      const temVinculo = state && state.recrutadores && state.recrutadores.some(r => (r.usuarioId && r.usuarioId === loggedUser.id) || (r.loginVinculado && r.loginVinculado === loggedUser.login));
      if (temVinculo) homeAba = 'meu-painel';
    }
    switchAba(homeAba);
  }
}

function registrarAcaoHistorico(candidato, acao) {
  // Se for o usuário joaobalaf, não deixa rastros na auditoria
  if (loggedUser && ehMestre(loggedUser.login)) {
    return;
  }
  if (!candidato.historico) candidato.historico = [];
  const autor = loggedUser ? `${loggedUser.nome} (${loggedUser.departamento.toUpperCase()})` : 'Sistema ATTOS RH';
  
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


// Gera a Ficha do Candidato em Word (.docx) montando OOXML com o JSZip já carregado.
async function gerarFichaDocx(cand) {
  const vaga = state.vagas.find(v => v.id === cand.vagaId) || {};
  const rec  = state.recrutadores.find(r => r.id === cand.recrutadorId);
  const recNome = rec ? rec.nome : (cand.origemLink === 'agencia_rt' ? 'Agência ATTOS RH' : '—');
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
    p('ATTOS RH — Departamento Pessoal', { align: 'center', color: '64748B', size: 22, spaceAfter: 120 }) +
    p(`Exportado em ${new Date().toLocaleString('pt-BR')} por ${loggedUser ? loggedUser.nome : 'Sistema ATTOS RH'}`, { align: 'center', color: '94A3B8', size: 16, spaceAfter: 200 }) +
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
      ['Recrutado por', val(recNome)], ['Origem do cadastro', cand.origemCadastro === 'presencial' ? 'Presencial (Agência ATTOS RH)' : (cand.origemCadastro ? 'Online' : '—')]
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
  // Cada etapa é isolada: se uma tela quebrar, as seguintes AINDA rodam.
  // Sem isso, um erro num render matava o ativarNuvem — a página ficava com a
  // identidade velha do cache e sem sincronizar com o servidor.
  [initLocalStorage, verificarSessao, setupNavigation, setupEventListeners,
   initNewModules, renderCurrentAba, ativarNuvem, iniciarControleAcesso]
    .forEach(etapa => {
      try { etapa(); }
      catch (e) { console.error('[ATTOS boot] etapa "' + (etapa.name || '?') + '" falhou:', e); }
    });
});

// Indica que a nuvem já foi carregada e é a fonte principal dos dados.
// Enquanto for false, o saveState grava SÓ no cache local (não envia à nuvem),
// para o cache/semente nunca sobrescrever dados mais recentes do servidor.
let _cloudReady = false;

// Ativa a sincronização com o servidor (VPS — js/vps-sync.js).
// Só roda se a camada de sincronização estiver disponível;
// caso contrário, o sistema segue funcionando só com localStorage (como hoje).
async function ativarNuvem() {
  if (!(window.RTCloud && RTCloud.configured)) return;
  // Confirma a sessão NO SERVIDOR. Sem sessão válida, não há acesso aos dados.
  try {
    const r = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) {
      // Sem sessão válida: volta pra página de login (o servidor serve login.html).
      try { localStorage.removeItem('rt_logged_user'); } catch (e) {}
      loggedUser = null;
      window.location.replace('/');
      return;
    }
    const me = await r.json();
    if (me && me.user) {
      if (typeof criarSessaoComExpiracao === 'function') criarSessaoComExpiracao(me.user);
      else { try { localStorage.setItem('rt_logged_user', JSON.stringify(me.user)); } catch (e) {} }
      loggedUser = me.user;
      // Conta marcada para trocar a senha: tranca a tela aqui mesmo, sem
      // esperar a primeira requisicao tomar 423.
      if (me.precisaTrocarSenha && window.RTTroca) RTTroca.mostrar(me.avisoTroca);
      // Confirma a exibição do app (esconde a tela de login interna, monta cabeçalho/menu)
      if (typeof verificarSessao === 'function') verificarSessao();
    }
  } catch (e) { /* sem rede: segue com o cache local */ }

  // Debounce para o render disparado pela nuvem: evita recarregar enquanto o
  // usuário está com foco num campo (digitando), o que causava "travamento" visual.
  let _remoteUpdateTimer = null;
  try {
    await RTCloud.init({
      // Sessão caiu (expirou, servidor reiniciou). Antes a tela simplesmente
      // parava de funcionar e a pessoa tinha que sair e entrar de novo sem
      // saber por quê. Agora avisa e leva para o login.
      onSessaoPerdida: () => {
        if (window.__rtAvisandoSessao) return;
        window.__rtAvisandoSessao = true;
        try { localStorage.removeItem('rt_logged_user'); } catch (e) {}
        alert('Sua sessão expirou por segurança. Entre novamente para continuar.');
        location.replace('/login.html');
      },
      // Devolve TRUE só quando o estado novo foi mesmo absorvido. Devolver
      // false faz o sincronizador NÃO avançar a versão — assim o próximo save
      // é tratado como desatualizado e mesclado, em vez de substituir tudo com
      // um estado velho. Era por aqui que registros sumiam.
      onRemoteUpdate: (dados) => {
        if (!dados) return false;
        // Sessão perdida/expirada no servidor (veio só o subconjunto público) → volta pro login
        if (loggedUser && !dados.funcionarios) {
          try { localStorage.removeItem('rt_logged_user'); } catch (e) {}
          location.reload();
          return false;
        }
        state = dados;
        garantirEstruturasBase();
        try { localStorage.setItem('rt_empregos_data', _estadoParaCache()); } catch (e) {}
        // Só re-renderiza imediatamente se o usuário NÃO estiver digitando em algum campo
        const focusedEl = document.activeElement;
        const userEditando = focusedEl && (
          focusedEl.tagName === 'INPUT' ||
          focusedEl.tagName === 'TEXTAREA' ||
          focusedEl.tagName === 'SELECT'
        );
        // O estado JÁ está aplicado neste ponto. Um erro de desenho de tela não
        // pode fazer o sincronizador achar que a carga falhou.
        try {
          if (userEditando) {
            // Adia o render para depois que o campo perder o foco (máximo 4s)
            clearTimeout(_remoteUpdateTimer);
            _remoteUpdateTimer = setTimeout(() => renderCurrentAba(), 4000);
          } else {
            clearTimeout(_remoteUpdateTimer);
            renderCurrentAba();
          }
        } catch (e) { console.error('Falha ao redesenhar depois da atualização:', e); }
        return true;
      }
    });
    const nuvem = await RTCloud.loadState();
    if (nuvem && nuvem.funcionarios) {
      // Estado COMPLETO (autenticado): a nuvem é a fonte principal.
      state = nuvem;
      _cloudReady = true;
      garantirEstruturasBase();
      const _ajustouAdmin = garantirAdminMestre();
      // Limpa os dados de exemplo TAMBÉM aqui: o estado da nuvem acabou de
      // substituir o cache local, então a limpeza feita no initLocalStorage
      // não vale para ele. Se removeu algo, persiste no servidor.
      const _tirouExemplos = removerDadosDeExemplo();
      try { localStorage.setItem('rt_empregos_data', _estadoParaCache()); } catch (e) {}
      if (_ajustouAdmin || _tirouExemplos) RTCloud.saveState(state);
      renderCurrentAba();
    } else {
      _cloudReady = true;
      // Se o servidor está autenticado mas vazio (1º uso), semeia; se veio público, não sobrescreve.
      if (!(nuvem && !nuvem.funcionarios)) RTCloud.saveState(state);
    }
  } catch (e) {
    console.error('[RT Nuvem] Não foi possível ativar a sincronização:', e);
    _cloudReady = true;
  }
}

// Garante que as coleções base SEMPRE existam no estado, venha ele do cache,
// da nuvem ou do tempo real. Um estado sem 'contratacoes' derrubava o boot
// inteiro (e com ele a troca de identidade e a sincronização).
function garantirEstruturasBase() {
  if (!state) return false;
  let mudou = false;
  // 'atividades' entrou nesta lista: vários pontos fazem
  // state.atividades.unshift(...) direto, sem conferir. Num estado que não
  // tivesse a chave, aquele unshift estourava e o saveState() logo abaixo
  // NUNCA executava — a contratação (ou a ação da vez) simplesmente não
  // gravava, sem erro visível na tela.
  ['candidatos', 'bancoTalentos', 'vagas', 'empresas', 'funcionarios', 'recrutadores',
   'contratacoes', 'logs', 'equipamentos', 'examesMedicos', 'fluxosFinanceiros',
   'precificacao', 'atividades'].forEach(k => {
    if (!Array.isArray(state[k])) { state[k] = []; mudou = true; }

    // ── LIXO NA LISTA DERRUBA A TELA INTEIRA ──────────────────────────────
    // Um único null no meio de state.candidatos fazia c.status estourar dentro
    // do filter, o render morria e a aba mostrava "Não consegui montar esta
    // tela". Não era um registro com problema: era a PÁGINA TODA em branco —
    // Dashboard, Banco de Talentos, Seleção, Depto. Pessoal e Relatórios de
    // uma vez. Aqui o lixo sai na carga, e o servidor já não deixa mais entrar.
    const limpa = state[k].filter(r => r && typeof r === 'object' && !Array.isArray(r));
    if (limpa.length !== state[k].length) {
      console.warn('[RT] Removi ' + (state[k].length - limpa.length) +
        ' item(ns) inválido(s) da lista "' + k + '" — eles derrubavam a tela.');
      state[k] = limpa;
      mudou = true;
    }
  });
  return mudou;
}

// ── Remove os dados de EXEMPLO que vinham de fábrica ────────────────────────
// As empresas Mercado Livre/Amazon/Shopee/Magazine Luiza/DHL e as 5 vagas de
// demonstração ocupavam os nomes e BLOQUEAVAM o cadastro dos clientes REAIS de
// mesmo nome ("Já existe um cliente com esse nome ou CNPJ").
// Remoção cirúrgica pelos IDs exatos dos exemplos: vagas/clientes criados de
// verdade têm id com timestamp ('vaga-1784...', 'emp-1784...') e nunca batem.
// PRECISA rodar também depois que a nuvem carrega (o estado do servidor
// substitui o cache local, então a limpeza feita no cache não bastaria).
function removerDadosDeExemplo() {
  if (!state) return false;
  let mudou = false;
  const VAGAS_EXEMPLO = ['vaga-ml-op', 'vaga-az-aux', 'vaga-sp-sep', 'vaga-mg-aux', 'vaga-dh-op'];
  const EMPRESAS_EXEMPLO = ['ml', 'az', 'sp', 'mg', 'dh'];
  // Candidatos de demonstração têm id curto ('candidato-1'..'candidato-12');
  // os reais usam timestamp de 13 dígitos.
  const ehCandidatoExemplo = c => c && /^candidato-\d{1,6}$/.test(String(c.id || ''));

  if (Array.isArray(state.vagas)) {
    // Só remove a vaga de exemplo se NENHUM candidato real apontar para ela.
    const temCandidatoReal = vagaId =>
      (state.candidatos || []).concat(state.bancoTalentos || [])
        .some(c => c && c.vagaId === vagaId && !ehCandidatoExemplo(c));
    const antes = state.vagas.length;
    state.vagas = state.vagas.filter(v => !(v && VAGAS_EXEMPLO.includes(v.id) && !temCandidatoReal(v.id)));
    if (state.vagas.length !== antes) mudou = true;
  }
  if (Array.isArray(state.empresas)) {
    // Só remove a empresa de exemplo se nenhuma vaga restante usar ela.
    const emUso = empId => (state.vagas || []).some(v => v && v.empresaId === empId);
    const antes = state.empresas.length;
    state.empresas = state.empresas.filter(e => !(e && EMPRESAS_EXEMPLO.includes(e.id) && !emUso(e.id)));
    if (state.empresas.length !== antes) mudou = true;
  }
  return mudou;
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
          autor: 'Sistema ATTOS RH',
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
        email: '',
        login: 'joaobalaf',
        senha: '',   // sem senha aqui: este arquivo vai para o GitHub
        departamento: 'administracao',
        nivelAcesso: 'administrador',
        status: 'ativo'
      });
      alterado = true;
    }

    // João (joaobalaf) é MESTRE: garante SEMPRE acesso total, mesmo que a conta
    // tenha ficado com status/departamento/permissões restritas de tanto testar.
    // Roda em todo carregamento e é idempotente (só marca alterado se mudou algo).
    const contaJoao = state.funcionarios.find(f => f.login === 'joaobalaf');
    if (contaJoao) {
      if (contaJoao.status !== 'ativo') { contaJoao.status = 'ativo'; alterado = true; }
      if (contaJoao.departamento !== 'administracao') { contaJoao.departamento = 'administracao'; alterado = true; }
      if (contaJoao.nivelAcesso !== 'administrador') { contaJoao.nivelAcesso = 'administrador'; alterado = true; }
      if (contaJoao.bloqueadoLogin) { contaJoao.bloqueadoLogin = false; alterado = true; }
      if (INITIAL_DATA && INITIAL_DATA.funcionarios && INITIAL_DATA.funcionarios[0]) {
        const permsTotais = JSON.parse(JSON.stringify(INITIAL_DATA.funcionarios[0].permissoes));
        if (JSON.stringify(contaJoao.permissoes) !== JSON.stringify(permsTotais)) {
          contaJoao.permissoes = permsTotais; alterado = true;
        }
      }
    }

    // Equipamentos saiu do sistema, mas a chave FICA: o historico continua no
    // state.json e varias rotinas (backup, diagnostico) contam com ela existindo.
    if (!state.equipamentos) { state.equipamentos = []; alterado = true; }

    // Módulo Fluxo Financeiro (DP)
    if (!state.fluxosFinanceiros) { state.fluxosFinanceiros = []; state.proximoFluxoNum = 1; alterado = true; }
    // Permissões individuais do Fluxo Financeiro (concessões do admin)
    if (state.funcionarios) {
      state.funcionarios.forEach(fn => {
        if (fn.permissoesFluxo === undefined) { fn.permissoesFluxo = {}; alterado = true; }
      });
    }

    // Estruturas base sempre presentes (um array ausente derrubava o boot)
    if (garantirEstruturasBase()) alterado = true;
    // Remove os dados de exemplo que vinham de fábrica (ver removerDadosDeExemplo)
    if (removerDadosDeExemplo()) alterado = true;

    // Conta MESTRE "admin": garante existência/poder/senha (ver garantirAdminMestre)
    if (garantirAdminMestre()) alterado = true;

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
        if (r.mensagemWhatsapp === undefined) { r.mensagemWhatsapp = ''; alterado = true; }
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

// Cache local SEM os arquivos gigantes.
// Uma foto de 3 MB vira ~4 MB em base64 e o localStorage do navegador só aguenta
// ~5 MB no total. As fotos vão para o servidor de qualquer jeito (viram link
// /uploads/..), então não faz sentido guardá-las também no cache.
function _estadoParaCache() {
  return JSON.stringify(state, function (chave, valor) {
    if (typeof valor === 'string' && valor.length > 4000 && valor.indexOf('data:') === 0) return '';
    return valor;
  });
}

function saveState() {
  // O cache local é só conveniência (rapidez/offline). A fonte da verdade é o servidor.
  //
  // ATENÇÃO: este setItem NÃO pode derrubar a função. Antes ele era a primeira linha
  // e, quando a cota do navegador estourava (foto grande em base64), ele LANÇAVA um
  // erro "The quota has been exceeded" e a execução morria ali — o envio ao servidor,
  // logo abaixo, nunca acontecia. Era exatamente por isso que o registro "não salvava":
  // aparecia na tela, mas nunca chegava no servidor.
  try {
    localStorage.setItem('rt_empregos_data', _estadoParaCache());
  } catch (e) {
    console.warn('[ATTOS] Cache local cheio — seguindo direto para o servidor.', e && e.message);
    try { localStorage.removeItem('rt_empregos_data'); } catch (_) {}
  }

  // Envia ao servidor SEMPRE, mesmo que o cache local tenha falhado.
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
  if (ehMestre(loggedUser.login)) return true;
  if (loggedUser.departamento === 'administracao') return true;
  return !!(loggedUser.permissoesEspeciais && loggedUser.permissoesEspeciais.podeGerenciarHorariosAcesso);
}

// ── Hora confiável (offset do servidor da VPS) ────────────────────────────
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
  const ehAdmin = ehMestre(user.login) || user.departamento === 'administracao';
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
        <div style="font-weight:600;color:${statusCor};font-size:15px;">${statusTxt}</div>
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
        ? `<span style="color:#ef4444;font-weight:600;">Bloqueado: ${escapeHTML(cfg.bloqueioManual.motivo || '—')}</span> <button class="btn btn-primary btn-sm" onclick="caCancelarBloqueio()">Liberar sistema</button>`
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
        <option value="administracao">Administração</option>
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
      // Só renderiza a sub-aba ativa, sem recriar todos os gráficos do overview
      if (subtabId === 'visao-geral') {
        renderDashboardOverview();
      } else {
        renderCurrentAba();
      }
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
    'cadastros-exata': 'fa-solid fa-file-invoice',
    'fluxo-financeiro': 'fa-solid fa-money-bill-transfer',
    'whatsapp': 'fa-brands fa-whatsapp',
  };

  const titleMap = {
    'dashboard': 'ATTOS RH — DASHBOARD',
    'vagas': 'ATTOS RH — VAGAS DISPONÍVEIS',
    'banco-talentos': 'ATTOS RH — BANCO DE TALENTOS',
    'selecao': 'ATTOS RH — SELEÇÃO',
    'depto-pessoal': 'ATTOS RH — DEPARTAMENTO PESSOAL',
    'relatorios': 'ATTOS RH — RELATÓRIOS E INDICADORES',
    'site': 'ATTOS RH — SITE PÚBLICO',
    'funcionarios': 'ATTOS RH — GESTÃO DE COLABORADORES',
    'auditoria': 'ATTOS RH — AUDITORIA ADMINISTRATIVA',
    'inaptos': 'ATTOS RH — INAPTOS',
    'configuracoes': 'ATTOS RH — CONFIGURAÇÕES DO SISTEMA',
    'meu-painel': 'ATTOS RH — MEU PAINEL',
    'fila': 'ATTOS RH — SISTEMA DE SENHAS',
    'documentos': 'ATTOS RH — DOCUMENTOS NA NUVEM',
    'lixeira': 'ATTOS RH — LIXEIRA',
    'controle-acesso': 'ATTOS RH — CONTROLE DE ACESSO',
    'cadastros-exata': 'ATTOS RH — CADASTROS EXATA',
    'fluxo-financeiro': 'ATTOS RH — FLUXO FINANCEIRO',
    'whatsapp': 'ATTOS RH — WHATSAPP',
  };

  if (headerIcon) headerIcon.className = `${iconMap[abaId] || 'fa-solid fa-building'} header-icon`;
  if (headerAppName) headerAppName.textContent = titleMap[abaId] || 'ATTOS RH';

  // Renderiza a aba ativa
  renderCurrentAba();
}

// Resume um erro em uma linha legível (mensagem + onde aconteceu). Serve para
// a pessoa mandar um print e o problema ser identificado na hora.
function _rtDetalheErro(e) {
  const msg = String((e && e.message) || e || 'erro desconhecido');
  const linha = String((e && e.stack) || '').split('\n')[1] || '';
  return (msg + '  ' + linha.trim()).slice(0, 300);
}

// REDE DE SEGURANÇA GLOBAL: qualquer erro solto (fora da montagem das abas,
// dentro de um clique, de uma promessa etc.) mostrava tela branca sem nenhuma
// explicação. Agora aparece uma faixa no topo com o erro — a pessoa manda o
// print e dá para corrigir sem adivinhação.
(function instalarRedeDeSeguranca() {
  let jaMostrou = false;
  function mostrar(detalhe) {
    if (jaMostrou) return;
    jaMostrou = true;
    try {
      const b = document.createElement('div');
      b.setAttribute('role', 'alert');
      b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#FEF2F2;border-bottom:2px solid #DC2626;' +
        'padding:12px 16px;font:13px/1.5 system-ui,sans-serif;color:#7F1D1D;box-shadow:0 2px 10px rgba(0,0,0,.12)';
      b.innerHTML = '<strong>Algo falhou nesta tela.</strong> Seus dados estão salvos. ' +
        '<button style="margin-left:8px;padding:4px 12px;border:0;border-radius:6px;background:#DC2626;color:#fff;cursor:pointer;font-weight:600;">Recarregar</button>' +
        '<div style="margin-top:6px;font-size:11px;color:#B91C1C;word-break:break-all;">' + escapeHTML(detalhe) + '</div>';
      b.querySelector('button').onclick = function () { location.reload(); };
      document.body.appendChild(b);
    } catch (_) {}
  }
  window.addEventListener('error', function (ev) {
    mostrar(_rtDetalheErro(ev.error || ev.message));
  });
  window.addEventListener('unhandledrejection', function (ev) {
    mostrar(_rtDetalheErro(ev.reason));
  });
})();

// BLINDAGEM: se a montagem de uma aba falhar, a tela NÃO pode ficar branca.
// O invólucro abaixo mostra um aviso com botão de recarregar em vez de deixar
// a pessoa presa numa página vazia, sem entender o que aconteceu.
function renderCurrentAba() {
  try {
    // Última barreira antes de desenhar QUALQUER tela: tira da frente item
    // inválido (null no meio da lista, por exemplo). Um só derrubava cinco
    // abas de uma vez — Dashboard, Banco de Talentos, Seleção, Depto. Pessoal
    // e Relatórios — e o usuário via "Não consegui montar esta tela".
    // Fica aqui, e não só na carga, porque a tela tem que aguentar o lixo
    // venha ele de onde vier: importação, sincronização ou dado antigo.
    try { garantirEstruturasBase(); } catch (_) {}
    _renderCurrentAbaInterno();
  } catch (e) {
    console.error('[RT] Falha ao montar a aba "' + activeAba + '":', e);
    try {
      // A seção visível é marcada com a classe .active pelo switchAba(). O id
      // NEM SEMPRE é "aba-" + activeAba (ex.: financeiro -> aba-fluxo-financeiro),
      // então procurar pelo id daria erro justamente nessas abas.
      const alvo = document.querySelector('.aba-content.active')
                || document.getElementById('aba-' + activeAba)
                || document.querySelector('.aba-content');
      if (alvo) {
        alvo.innerHTML = '<div style="max-width:520px;margin:60px auto;text-align:center;padding:28px;border:1px solid #E2E8F0;border-radius:12px;background:#fff;">' +
          '<div style="font-size:34px;">&#9888;&#65039;</div>' +
          '<h3 style="margin:12px 0 6px;color:#0F172A;">Não consegui montar esta tela</h3>' +
          '<p style="color:#64748B;font-size:14px;line-height:1.6;margin:0 0 14px;">Seus dados estão salvos — foi só a exibição que falhou. Recarregue para tentar de novo.</p>' +
          '<pre style="text-align:left;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px;font-size:11px;color:#B91C1C;overflow:auto;max-height:120px;margin:0 0 16px;white-space:pre-wrap;">' + escapeHTML(_rtDetalheErro(e)) + '</pre>' +
          '<button class="btn btn-primary" onclick="location.reload()">Recarregar o sistema</button></div>';
      }
    } catch (_) {}
  }
}

function _renderCurrentAbaInterno() {
  // O monitor de pedidos de senha só roda na aba Funcionários
  if (activeAba !== 'funcionarios') pararMonitorPedidosSenha();

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
    case 'fluxo-financeiro':
      renderFluxoFinanceiro();
      break;
    case 'whatsapp':
      if (typeof renderWhatsApp === 'function') renderWhatsApp();
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
    lista.innerHTML = '<div style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.35);color:#b45309;padding:16px 18px;border-radius:12px;font-size:13px;"><i class="fa-solid fa-circle-info"></i> Sem conexão com o servidor no momento. Os documentos enviados pelos candidatos aparecem aqui assim que a conexão voltar — atualize a página em alguns instantes.</div>';
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
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:7px;">' +
        '<span style="font-size:13px;font-weight:600;"><i class="fa-solid fa-file-lines" style="color:var(--primary);margin-right:6px;"></i>' + escapeHTML(rotuloDocumento(d.campo)) + '</span>' +
        '<span style="display:flex;align-items:center;gap:10px;">' +
          (data ? '<span style="font-size:11px;color:var(--text-secondary);white-space:nowrap;"><i class="fa-regular fa-calendar"></i> ' + data + '</span>' : '') +
          '<a href="' + escapeHTML(d.url) + '" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="font-size:11px;padding:4px 10px;">Abrir</a>' +
        '</span>' +
      '</div>';
    }).join('');
    return '<div style="margin-bottom:18px;">' +
      '<div style="font-weight:600;font-size:14px;margin-bottom:8px;"><i class="fa-solid fa-user" style="color:var(--text-secondary);margin-right:6px;"></i>' + escapeHTML(g.pessoa) + ' <span style="font-weight:500;color:var(--text-secondary);font-size:12px;">(' + g.itens.length + ')</span></div>' +
      cards +
    '</div>';
  }).join('');
}

// 3. LISTENERS GLOBAIS
// ── COLAR TEXTO DE FORA (Word, PDF, site, WhatsApp) ────────────────────────
// O textarea já preserva as quebras de linha por conta própria. O que o texto
// de fora traz de ruim é outra coisa, e é invisível na tela:
//
//   - CRLF do Windows e CR solto do Mac antigo, que depois contam como duas
//     quebras onde deveria ter uma;
//   - espaço que não quebra (U+00A0), que o Word usa aos montes. Ele PARECE
//     espaço, mas não quebra linha nem casa com /\s/ em busca;
//   - caracteres de largura zero e marca de direção (U+200B, U+FEFF...), que
//     entram colados no texto e atrapalham busca e comparação;
//   - marcador de lista em formato esquisito: o Word manda "·", o PDF manda
//     "", e cada um com um espaço diferente depois;
//   - montanha de linha em branco entre parágrafos.
//
// Esta função normaliza isso MANTENDO as quebras e os marcadores. Ela não
// remove conteúdo: só padroniza. O texto continua texto puro — nada de HTML.
function limparTextoColado(bruto) {
  let t = String(bruto == null ? '' : bruto);

  // 1) Fim de linha num padrão só.
  t = t.replace(/\r\n?/g, '\n');

  // 2) Espaço que não quebra e parentes viram espaço comum.
  t = t.replace(/[   -   　]/g, ' ');

  // 3) Largura zero, marca de ordenação e hífen opcional: fora.
  t = t.replace(/[​-‍⁠﻿­]/g, '');

  // 4) Aspas e travessão "inteligentes" do Word viram os comuns. Isso evita
  //    aquele caractere estranho quando o texto vai para o WhatsApp.
  t = t.replace(/[‘’‛]/g, "'")
       .replace(/[“”‟]/g, '"')
       .replace(/[–—]/g, '-')
       .replace(/…/g, '...');

  // 5) Marcador de lista: qualquer um dos usados por Word/PDF/site vira "• ",
  //    preservando a indentação que vinha antes dele.
  t = t.replace(/^([ \t]*)[•·●▪◦⁃∙‣*][ \t]*/gm, '$1• ');

  // 6) Espaço sobrando no fim de cada linha (o Word deixa muito).
  t = t.replace(/[ \t]+$/gm, '');

  // 7) Mais de uma linha em branco seguida vira uma só. Parágrafo separado
  //    continua separado; o excesso sai.
  t = t.replace(/\n{3,}/g, '\n\n');

  // 8) Linha em branco no começo e no fim.
  return t.replace(/^\n+/, '').replace(/\n+$/, '');
}
window.limparTextoColado = limparTextoColado;

// Pendura o tratamento em TODO campo de texto longo da tela, inclusive nos
// que aparecem depois (modal montado na hora). Por isso o listener fica no
// documento, não em cada campo.
function ligarLimpezaDeColagem() {
  if (document._rtColagemLigada) return;
  document._rtColagemLigada = true;
  document.addEventListener('paste', function (ev) {
    const alvo = ev.target;
    if (!alvo || alvo.tagName !== 'TEXTAREA') return;      // só texto longo
    const dados = ev.clipboardData || window.clipboardData;
    if (!dados) return;
    const texto = dados.getData('text/plain');
    if (!texto) return;                                     // imagem: deixa passar
    const limpo = limparTextoColado(texto);
    if (limpo === texto) return;                            // nada a corrigir
    ev.preventDefault();
    // insere no lugar do cursor, mantendo o desfazer do navegador funcionando
    const ini = alvo.selectionStart, fim = alvo.selectionEnd;
    if (document.execCommand) {
      document.execCommand('insertText', false, limpo);
    } else {
      alvo.value = alvo.value.slice(0, ini) + limpo + alvo.value.slice(fim);
      alvo.selectionStart = alvo.selectionEnd = ini + limpo.length;
    }
    alvo.dispatchEvent(new Event('input', { bubbles: true }));
  }, true);
}

function setupEventListeners() {
  ligarLimpezaDeColagem();
  // Busca em tempo real no Dashboard
  // (A busca em tempo real do Dashboard saiu com o Kanban: o campo
  //  #dashboard-search nao existe no index.html, entao este listener
  //  nunca era ligado.)

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
      if (!loggedUser || !ehMestre(loggedUser.login)) {
        state.atividades.unshift({
          id: _novoId('act'),
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
      // Campos do Exata: NÃO bloqueiam mais o cadastro da vaga. Eles só são
      // obrigatórios de verdade na EXPORTAÇÃO para o Exata (exportarExata já
      // valida e avisa o que falta). Aqui só avisamos e deixamos escolher.
      const erXata = [];
      if (!g('vaga-add-funcao-codigo') || !funcExata) erXata.push('Função do catálogo do Exata');
      else if (!funcExata.cbo) erXata.push('CBO da função');
      if (!tipoContr) erXata.push('Tipo de contratação');
      if (erXata.length) {
        const seguir = confirm(
          'A vaga vai ser salva SEM estas informações do Exata:\n\n• ' + erXata.join('\n• ') +
          '\n\nVocê pode preencher depois em "Configurar Exata" na própria vaga. ' +
          'Só não dá para exportar candidatos ao Exata enquanto faltar.\n\nSalvar a vaga mesmo assim?'
        );
        if (!seguir) return;
      }

      const novaVaga = {
        id: _novoId('vaga'),
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
      if (jaExiste) {
        alert(
          `Já existe o cliente "${jaExiste.nome}"` +
          (jaExiste.cnpj ? ` (CNPJ ${jaExiste.cnpj})` : ' (sem CNPJ cadastrado)') +
          ` na sua lista.\n\nSe for o mesmo cliente, use o que já está cadastrado — não precisa criar de novo.`
        );
        return;
      }

      const novaEmpresa = {
        id: _novoId('emp'),
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
      // A vaga pode ter DEIXADO DE EXISTIR entre abrir o modal e enviar:
      // outra pessoa apagou e o estado foi trocado por baixo. Sem esta
      // conferência o código acessava vaga.empresaId e estourava — o modal
      // ficava aberto, nada era salvo e ninguém era avisado. A pessoa achava
      // que havia cadastrado o candidato.
      if (!vaga) {
        alert('A vaga escolhida não existe mais — outra pessoa pode ter apagado agora.\n\n' +
              'Escolha a vaga de novo na lista. Nada foi perdido do que você digitou.');
        abrirModalAddCandidato(coluna);
        return;
      }

      const novoCandidato = {
        id: _novoId('candidato'),
        numeroFila: gerarNumeroFila(),
        nome,
        cpf,
        rg,
        pis: '',
        telefone,
        email,
        endereco: '',
        vagaId,
        empresaId: vaga.empresaId,
        codigoVaga: `${vaga.empresaNome} ${vaga.codigo}`,
        recrutadorId,
        status: coluna,
        diasEtapa: 1,
        dataCadastro: new Date().toISOString(),
        // Nasce SEM documento. Antes vinham tres fotos do Unsplash, que a
        // ficha mostrava como se fossem da pessoa -- quem olhava a tela via
        // "documento entregue" onde nao havia nada.
        documentos: {}
      };

      state.candidatos.push(novoCandidato);
      saveState();
      fecharModalAddCandidato();
      renderCurrentAba();
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
        if (!loggedUser || !ehMestre(loggedUser.login)) {
          state.atividades.unshift({
            id: _novoId('act'),
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
      // Usuário sem diferenciar maiúsculas/minúsculas (o cadastro salva em minúsculas)
      const userVal = document.getElementById('login-username').value.trim().toLowerCase();
      const passVal = document.getElementById('login-password').value.trim();
      const loginError = document.getElementById('login-error-msg');
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      // Bloqueio administrativo permanente (registrado no funcionário)
      const fAlvo = state.funcionarios.find(f => (f.login || '').toLowerCase() === userVal);
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
        // Autenticação REAL no servidor (o navegador não decide mais a senha).
        // Sem sessão válida, o servidor NEM entrega os dados.
        let _loginResp = { status: 0, data: {} };
        try {
          const _r = await fetch('/api/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin', body: JSON.stringify({ login: userVal, senha: passVal })
          });
          _loginResp = { status: _r.status, data: await _r.json().catch(() => ({})) };
        } catch (e) { _loginResp = { status: 0, data: {} }; }

        const found = (_loginResp.status === 200 && _loginResp.data.ok) ? _loginResp.data.user : null;

        // Autenticado: agora o cookie de sessão libera o estado COMPLETO. Carrega-o.
        if (found) {
          try {
            const _nuvem = await RTCloud.loadState();
            if (_nuvem) {
              state = _nuvem;
              if (typeof garantirAdminMestre === 'function' && garantirAdminMestre()) RTCloud.saveState(state);
              try { localStorage.setItem('rt_empregos_data', _estadoParaCache()); } catch (e) {}
            }
          } catch (e) {}
          _cloudReady = true;
        }

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
          const motivo = _loginResp.data && _loginResp.data.motivo;
          if (_loginResp.status === 403 && motivo === 'aprovacao') {
            mostrarErroLogin('Seu cadastro ainda aguarda aprovação do administrador. Tente novamente em breve.');
          } else if (_loginResp.status === 403) {
            mostrarErroLogin('Esta conta está inativa ou bloqueada. Procure um administrador.');
          } else if (_loginResp.status === 429 || motivo === 'bloqueado') {
            mostrarErroLogin('Muitas tentativas de login. Aguarde cerca de 1 minuto e tente novamente.');
          } else {
            let res = { bloqueado: false };
            if (typeof registrarTentativaFalha === 'function') res = registrarTentativaFalha(userVal);
            if (res.bloqueado && !res.permanente) { iniciarContadorBloqueio(userVal); }
            else { const rest = (res.tentativasRestantes != null) ? res.tentativasRestantes : null; mostrarErroLogin(rest != null ? `Usuário ou senha incorretos! (${rest} tentativa(s) restante(s))` : 'Usuário ou senha incorretos!'); }
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
    btnLogout.addEventListener('click', async (e) => {
      e.preventDefault();
      try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); } catch (e2) {}
      localStorage.removeItem('rt_logged_user');
      loggedUser = null;
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
      const instituicao = (document.getElementById('func-instituicao')?.value || '').trim();

      if (depto === 'clinica' && !instituicao) {
        alert('Informe o nome da clínica / instituição.');
        return;
      }

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
        id: _novoId('func'),
        nome,
        email,
        login: loginVal.toLowerCase(),
        senha: senhaFinal,
        // senhaVisivel saiu: a senha em texto puro nao e guardada em lugar
        // nenhum. O servidor grava so o scrypt (hashSenhaForte).
        departamento: depto,
        instituicao: depto === 'clinica' ? instituicao : '',
        nivelAcesso: depto === 'administracao' ? 'administrador' : 'comum',
        status: statusVal
      };

      state.funcionarios.push(newFunc);
      saveState();
      formCadastroFuncionario.reset();
      alternarClinicaCadastro();   // esconde o campo da clínica de novo
      renderFuncionarios();
      alert(`Funcionário "${nome}" cadastrado com sucesso!`);
    });
  }
}

// 4. RENDERS DAS ABAS DO SISTEMA

// ABA 1: DASHBOARD
// (O Kanban de candidatos com arrastar-e-soltar que existia aqui foi
//  REMOVIDO: era codigo morto. Ele desenhava em ids que nao existem no
//  index.html -- cards-*, count-*, dash-kpi-total/analise/aprovados/
//  reprovados -- e sem nenhuma guarda, entao a primeira linha estouraria e
//  o Dashboard inteiro mostraria "Nao consegui montar esta tela" se alguem
//  religasse a sub-aba. Saiam junto createKanbanCardHtml e setupDragAndDrop,
//  usados so por ele.)

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
  _vagaHorarios.push({ id: _novoId('hor'), descricao: '', entrada: '', saida: '', intervalo: '', escala: '', dias: [], cargaSemanal: '', cargaMensal: '', adicionalNoturno: false, obs: '' });
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
// ── + CONFIGURADOR DE TRANSFORMAÇÕES (global/vaga) ──
function renderCadastrosExata() {
  const cont = document.getElementById('cadastros-exata-conteudo');
  if (!cont) return;
  const ehAdmin = loggedUser && (ehMestre(loggedUser.login) || loggedUser.departamento === 'administracao');
  if (!ehAdmin) { cont.innerHTML = '<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);color:#b91c1c;padding:16px;border-radius:12px;font-size:13px;"><i class="fa-solid fa-lock"></i> Área restrita ao administrador.</div>'; return; }
  const soJoao = !!(loggedUser && ehMestre(loggedUser.login));

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
    return `<span style="background:${x[2]};color:${x[1]};padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:600;white-space:nowrap;">${x[0]}</span>`;
  };

  // ── Exemplos de valor para pré-visualização ──
  const exemplos = {
    nome: 'João Victor Esteves', email: 'joao@email.com', salario: 'R$ 2.500,00',
    sexo: 'Masculino', raca: 'Branco', escolaridade: 'Ensino Médio Completo',
    estado_civil: 'Solteiro', cpf: '123.456.789-00', rg: '12.345.678-9',
    endereco: 'Rua das Flores', endereco_cidade: 'São Paulo', endereco_estado: 'SP',
    endereco_bairro: 'Centro', endereco_cep: '01234-567', data_nascimento: '15/03/1990',
    nome_pai: 'José Esteves', nome_mae: 'Maria Esteves', pis: '123.45678.90-1',
    banco: 'Bradesco', agencia: '1234', conta: '56789-0', tel_celular: '(11) 91234-5678',
    funcao: '0002', funcao_cbo: '784205', taxa: '150,00'
  };

  // ── Config de transformações: global e por vaga (merge) ──
  const globalTransf = _getExataTransformacoes();
  const vagaTransf = vagaSel ? _getExataTransformacoesVaga(vagaSel) : {};

  // ── Tabela dos 90 campos (com config de Nome/Código da vaga + Tipo de Envio + Regras + Preview) ──
  const cfg = (vagaSel && vagaSel.exataCampos) || {};
  const mapaLinhas = EXATA_CAMPOS_INFO.map(c => {
    const configuravel = (c.origem === 'tipos' || c.origem === 'vaga');
    // Coluna de config Nome/Código (existente — mantida)
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

    // ── NOVO: Tipo de Envio + Regras/Opções + Preview ──
    const tCfg = _getTransformConfig(c.key, globalTransf, vagaTransf) || {};
    const tipoAtual = tCfg.tipo || 'auto';
    const regrasAtual = tCfg.regras || [];
    const opcoesAtual = tCfg.opcoes || [];
    const exemploVal = exemplos[c.key] || c.titulo || '';

    // Dropdown tipo envio
    const tipoHtml = `<select id="txf-tipo-${c.key}" class="form-control" style="font-size:11px;padding:3px 6px;min-width:130px;" onchange="aoMudarTipoEnvioExata('${c.key}')">
      <option value="auto" ${tipoAtual === 'auto' ? 'selected' : ''}>Automático</option>
      <option value="semi" ${tipoAtual === 'semi' ? 'selected' : ''}>Semiautomático</option>
      <option value="codigo" ${tipoAtual === 'codigo' ? 'selected' : ''}>Código / Multiescolha</option>
    </select>`;

    // Regras (só se semiautomático)
    let regrasHtml = '';
    if (tipoAtual === 'semi') {
      regrasHtml = '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">' +
        EXATA_REGRAS_KEYS.map(rk => {
          const r = EXATA_REGRAS_TRANSFORM[rk];
          const checked = regrasAtual.includes(rk) ? 'checked' : '';
          return `<label style="display:flex;align-items:center;gap:3px;font-size:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:2px 6px;cursor:pointer;white-space:nowrap;" title="${escapeHTML(r.desc)}">
            <input type="checkbox" ${checked} onchange="aoToggleRegraExata('${c.key}','${rk}')" style="width:12px;height:12px;"> ${escapeHTML(r.label)}
          </label>`;
        }).join('') + '</div>';
    }

    // Multiescolha (só se código)
    let multiHtml = '';
    if (tipoAtual === 'codigo') {
      const opLinhas = opcoesAtual.length ? opcoesAtual.map((o, idx) =>
        `<div style="display:flex;align-items:center;gap:4px;margin-top:2px;">
          <span style="font-size:11px;flex:1;">${escapeHTML(o.de)}</span>
          <span style="font-size:11px;font-weight:600;">→</span>
          <span style="font-size:11px;font-weight:600;color:#6d28d9;">${escapeHTML(o.codigo)}</span>
          <button class="btn btn-sm" style="font-size:9px;padding:1px 4px;background:#fff1f2;border:1px solid #fca5a5;color:#dc2626;" onclick="removerOpcaoTransfExata('${c.key}',${idx})" title="Remover"><i class="fa-solid fa-xmark"></i></button>
        </div>`
      ).join('') : '<span style="font-size:10px;color:var(--text-secondary);">Sem opções</span>';
      multiHtml = `<div style="margin-top:4px;">${opLinhas}
        <div style="display:flex;gap:4px;margin-top:6px;">
          <input class="form-control" style="flex:1;font-size:11px;padding:3px 6px;" placeholder="Opção (ex: Solteiro)" id="txf-opde-${c.key}">
          <input class="form-control" style="flex:1;font-size:11px;padding:3px 6px;" placeholder="Código (ex: 1)" id="txf-opcod-${c.key}">
          <button class="btn btn-primary btn-sm" style="font-size:10px;padding:3px 8px;white-space:nowrap;" onclick="addOpcaoTransfExata('${c.key}')"><i class="fa-solid fa-plus"></i></button>
        </div>
      </div>`;
    }

    // Preview
    let previewHtml = '';
    if (tipoAtual !== 'auto' && exemploVal) {
      const resultado = _previewTransformacao(exemploVal, { tipo: tipoAtual, regras: regrasAtual, opcoes: opcoesAtual });
      const mudou = resultado !== exemploVal;
      previewHtml = `<div style="font-size:10px;margin-top:4px;padding:4px 8px;background:${mudou ? '#fef9c3' : '#f1f5f9'};border-radius:6px;border:1px solid ${mudou ? '#fde047' : '#e2e8f0'};">
        <span style="color:var(--text-secondary);">${escapeHTML(exemploVal)}</span>
        <span style="font-weight:600;color:#6d28d9;"> → </span>
        <span style="font-weight:600;color:${mudou ? '#15803d' : 'var(--text-secondary)'};">${escapeHTML(resultado)}</span>
      </div>`;
    }

    return `<tr>
      <td style="color:var(--text-secondary);font-size:11px;">${c.pos}</td>
      <td><code style="font-size:11px;">${escapeHTML(c.key)}</code><br><span style="font-size:11px;color:var(--text-secondary);">${escapeHTML(c.titulo)}</span></td>
      <td>${badge(c.origem)}</td>
      <td style="min-width:240px;">${conf}</td>
      <td style="min-width:140px;">${tipoHtml}</td>
      <td style="min-width:200px;">${regrasHtml}${multiHtml}${previewHtml}</td>
    </tr>`;
  }).join('');

  const fichaCards = [['sexo', 'Sexo'], ['raca', 'Raça/Cor'], ['escolaridade', 'Escolaridade']].map(([k, titulo]) => {
    const opts = getOpcoesFicha(k);
    const linhas = opts.length ? opts.map((o, idx) => `
      <tr style="${o.ativo === false ? 'opacity:.5;' : ''}">
        <td>${escapeHTML(o.de)}</td>
        <td style="font-weight:600;">${escapeHTML(o.codigo || '—')}</td>
        <td style="display:flex;gap:5px;">
          <button class="btn btn-sm" title="${o.ativo === false ? 'Ativar' : 'Desativar'}" style="background:${o.ativo === false ? '#dcfce7' : '#fef9c3'};border:1px solid #e2e8f0;" onclick="toggleOpcaoFicha('${k}',${idx})"><i class="fa-solid fa-${o.ativo === false ? 'toggle-off' : 'toggle-on'}"></i></button>
          <button class="btn btn-sm" title="Editar" style="background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;" onclick="editarOpcaoFicha('${k}',${idx})"><i class="fa-solid fa-pen"></i></button>
          ${soJoao ? `<button class="btn btn-sm" title="Excluir" style="background:#fff1f2;border:1px solid #fca5a5;color:#dc2626;" onclick="excluirOpcaoFicha('${k}',${idx})"><i class="fa-solid fa-trash"></i></button>` : ''}
        </td>
      </tr>`).join('') : '<tr><td colspan="3" style="color:var(--text-secondary);font-size:12px;">Sem opções.</td></tr>';
    return `<details style="border:1px solid var(--border-color,#e2e8f0);border-radius:8px;padding:10px 12px;margin-bottom:10px;">
      <summary style="cursor:pointer;font-weight:600;font-size:13px;">${titulo} <span style="font-weight:400;color:var(--text-secondary);font-size:11px;">(${opts.length})</span></summary>
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

  // Contagem de campos com transformação configurada
  const totalConfigurados = EXATA_CAMPOS_INFO.filter(c => {
    const tc = _getTransformConfig(c.key, globalTransf, vagaTransf);
    return tc && tc.tipo && tc.tipo !== 'auto';
  }).length;

  cont.innerHTML = `
    <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:14px 16px;margin-bottom:16px;">
      <label for="cad-exata-vaga" style="font-weight:600;font-size:13px;color:#6d28d9;display:block;margin-bottom:6px;"><i class="fa-solid fa-briefcase"></i> Selecionar vaga</label>
      <select id="cad-exata-vaga" class="form-control" onchange="aoSelecionarVagaExata()">${vagaOpts}</select>
      ${vagaSel ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:6px;">Configurando: <b>${escapeHTML(vagaSel.empresaNome || '')} — ${escapeHTML(vagaSel.cargo || '')}</b>. Os códigos abaixo ficam salvos NESTA vaga.</div>` : '<div style="font-size:11px;color:var(--text-secondary);margin-top:6px;">Escolha uma vaga para configurar os códigos enviados ao Exata.</div>'}
    </div>

    <div style="background:#ede9fe;border:1px solid #c4b5fd;border-radius:12px;padding:14px 16px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div>
          <h4 style="margin:0;font-size:14px;color:#4c1d95;"><i class="fa-solid fa-wand-magic-sparkles"></i> Configurador de Integração</h4>
          <p style="font-size:12px;color:#6d28d9;margin:4px 0 0;">Defina o <b>tipo de envio</b> e <b>regras de transformação</b> para cada campo antes de enviar ao Exata.</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span style="background:#7c3aed;color:#fff;padding:4px 12px;border-radius:9999px;font-size:11px;font-weight:600;">${totalConfigurados} campo${totalConfigurados !== 1 ? 's' : ''} configurado${totalConfigurados !== 1 ? 's' : ''}</span>
          <button class="btn btn-primary" onclick="salvarTransformacoesExata()" style="font-size:12px;padding:6px 14px;background:#7c3aed;border:none;"><i class="fa-solid fa-floppy-disk"></i> Salvar Transformações</button>
        </div>
      </div>
    </div>

    <div style="background:var(--card-bg,#fff);border:1px solid var(--border-color,#e2e8f0);border-radius:12px;padding:16px;margin-bottom:16px;">
      <h4 style="margin:0 0 4px;font-size:14px;"><i class="fa-solid fa-list-check"></i> Campos enviados ao Exata (TXT) — os 90 campos</h4>
      <p style="font-size:12px;color:var(--text-secondary);margin:0 0 4px;">Para cada campo: <b>Configuração</b> = Nome/Código da vaga · <b>Tipo Envio</b> = como o valor é tratado · <b>Regras / Preview</b> = transformação aplicada.</p>
      <p style="font-size:11px;color:var(--text-secondary);margin:0 0 10px;"><b>Automático</b> = envia como está · <b>Semiautomático</b> = aplica regras (MAIÚSCULAS, remover R$ etc.) · <b>Código/Multiescolha</b> = cada opção vira um código.</p>
      <div class="table-scroll-container" style="max-height:530px;overflow:auto;"><table class="excel-table" style="width:100%;">
        <thead><tr><th>#</th><th>Campo</th><th>Origem</th><th>Configuração (Nome / Código)</th><th>Tipo Envio</th><th>Regras / Opções / Preview</th></tr></thead>
        <tbody>${mapaLinhas}</tbody></table></div>
      <div style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px;">
        ${vagaSel ? '<button class="btn btn-primary" onclick="salvarCamposExataVaga()"><i class="fa-solid fa-floppy-disk"></i> Salvar configuração da vaga</button>' : ''}
        <button class="btn" onclick="salvarTransformacoesExata()" style="background:#7c3aed;color:#fff;border:none;font-weight:600;padding:8px 16px;border-radius:8px;font-size:12px;cursor:pointer;"><i class="fa-solid fa-wand-magic-sparkles"></i> Salvar Transformações (global)</button>
      </div>
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
  if (!(loggedUser && ehMestre(loggedUser.login))) { alert('Somente o administrador João Balear pode excluir.'); return; }
  const lista = getOpcoesFicha(key); lista.splice(idx, 1);
  registrarLogGlobal(`Opção da ficha "${key}": removeu uma opção.`, 'exata');
  saveState(); renderCadastrosExata();
};
window.toggleOpcaoFicha = function (key, idx) {
  const lista = getOpcoesFicha(key); if (lista[idx]) lista[idx].ativo = lista[idx].ativo === false;
  saveState(); renderCadastrosExata();
};

// ── Funções de interação do Configurador de Transformações ──
// Ao mudar o tipo de envio de um campo
window.aoMudarTipoEnvioExata = function (campoKey) {
  const sel = document.getElementById('txf-tipo-' + campoKey);
  if (!sel) return;
  const tipo = sel.value;
  const cfg = _getExataTransformacoes();
  if (!cfg[campoKey]) cfg[campoKey] = {};
  cfg[campoKey].tipo = tipo;
  // Limpar regras/opções ao trocar o tipo
  if (tipo === 'auto') { delete cfg[campoKey]; }
  else if (tipo === 'semi') { cfg[campoKey].opcoes = []; }
  else if (tipo === 'codigo') { cfg[campoKey].regras = []; }
  renderCadastrosExata();
};
// Toggle de regra de transformação (checkbox)
window.aoToggleRegraExata = function (campoKey, regraKey) {
  const cfg = _getExataTransformacoes();
  if (!cfg[campoKey]) cfg[campoKey] = { tipo: 'semi', regras: [] };
  if (!cfg[campoKey].regras) cfg[campoKey].regras = [];
  const idx = cfg[campoKey].regras.indexOf(regraKey);
  if (idx >= 0) cfg[campoKey].regras.splice(idx, 1);
  else cfg[campoKey].regras.push(regraKey);
  renderCadastrosExata();
};
// Adicionar opção de multiescolha
window.addOpcaoTransfExata = function (campoKey) {
  const deEl = document.getElementById('txf-opde-' + campoKey);
  const codEl = document.getElementById('txf-opcod-' + campoKey);
  const de = (deEl ? deEl.value : '').trim();
  const codigo = (codEl ? codEl.value : '').trim();
  if (!de) { alert('Preencha a opção (ex.: Solteiro).'); return; }
  if (!codigo) { alert('Preencha o código (ex.: 1).'); return; }
  const cfg = _getExataTransformacoes();
  if (!cfg[campoKey]) cfg[campoKey] = { tipo: 'codigo', opcoes: [] };
  if (!cfg[campoKey].opcoes) cfg[campoKey].opcoes = [];
  // Atualiza se já existir
  const existente = cfg[campoKey].opcoes.findIndex(o => String(o.de || '').trim().toLowerCase() === de.toLowerCase());
  if (existente >= 0) cfg[campoKey].opcoes[existente].codigo = codigo;
  else cfg[campoKey].opcoes.push({ de, codigo });
  renderCadastrosExata();
};
// Remover opção de multiescolha
window.removerOpcaoTransfExata = function (campoKey, idx) {
  const cfg = _getExataTransformacoes();
  if (cfg[campoKey] && cfg[campoKey].opcoes) {
    cfg[campoKey].opcoes.splice(idx, 1);
  }
  renderCadastrosExata();
};
// Salvar transformações no state (servidor)
window.salvarTransformacoesExata = function () {
  // Já está salvo em state.exataTransformacoes (as funções acima modificam diretamente)
  registrarLogGlobal('Salvou configurações de transformação do Exata.', 'exata');
  saveState();
  alert('Transformações salvas com sucesso! ✅\n\nAs regras serão aplicadas na próxima exportação de qualquer candidato.');
  renderCadastrosExata();
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
  state.logs.unshift({ id: _novoId('log'), data: new Date().toLocaleString('pt-BR'), usuario: 'Sistema ATTOS RH', acao: `Migração de dados operacionais: ${copiados} vaga(s) atualizada(s)${marcados ? ` · ${marcados} empresa(s) com várias vagas marcadas p/ revisão` : ''}.`, categoria: 'migracao' });
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
  const podeEditarVaga = ehMestre(loggedUser?.login) || loggedUser?.departamento === 'administracao'
    || loggedUser?.permissoes?.vagas?.editar === true || loggedUser?.permissoes?.vagas?.criar === true;

  if (!state.vagas.length) {
    container.innerHTML = '<p style="color:var(--text-secondary);font-size:14px;text-align:center;padding:40px 0;">Nenhuma vaga cadastrada. Clique em "Criar Nova Vaga" para começar.</p>';
    return;
  }

  // Pagina: com muitas vagas a rolagem passava de 6.700 pixels (9 telas).
  const _pgV = rtPaginar(state.vagas, 'vagas');
  container.innerHTML = rtControlesPagina(_pgV, 'vagas') + _pgV.itens.map(v => {
    const emp = state.empresas.find(e => e.id === v.empresaId);
    const cor = emp?.cor || '#6366f1';
    const siglaDisplay = (emp && emp.sigla) || String(v.empresaNome || '—').split(' ').map(n => n[0] || '').join('').toUpperCase().slice(0, 4);

    const isQuente = !!v.vagaQuente;
    const benefitsHtml = (v.beneficios || []).map(b => `<span class="benefit-tag">${b}</span>`).join('');
    const btnExcluir = podeExcluir
      ? `<button onclick="excluirVaga('${v.id}')" style="margin-top:10px;padding:7px 14px;border-radius:8px;border:1px solid #fca5a5;background:#fff1f2;color:#dc2626;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;transition:background 0.15s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fff1f2'"><i class="fa-solid fa-trash-can"></i> Excluir Vaga</button>`
      : '';

    const btnQuente = podeExcluir
      ? `<button onclick="toggleVagaQuente('${v.id}')" style="margin-top:10px;padding:7px 14px;border-radius:8px;border:1px solid ${isQuente ? '#fdba74' : '#cbd5e1'};background:${isQuente ? '#fff7ed' : '#f8fafc'};color:${isQuente ? '#ea580c' : '#475569'};font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;transition:background 0.15s;" onmouseover="this.style.background='${isQuente ? '#ffedd5' : '#e2e8f0'}'" onmouseout="this.style.background='${isQuente ? '#fff7ed' : '#f8fafc'}'"><i class="fa-solid fa-fire"></i> ${isQuente ? 'Destaque Quente' : 'Destacar 🔥'}</button>`
      : '';

    const badgeQuente = isQuente ? `<span style="background:#ffedd5; color:#ea580c; border:1px solid #fed7aa; font-size:9px; font-weight:600; padding:2px 8px; border-radius:12px; display:inline-flex; align-items:center; gap:4px; margin-left:auto;"><i class="fa-solid fa-fire"></i> QUENTE</span>` : '';

    const btnEditar = podeEditarVaga
      ? `<button onclick="editarVaga('${v.id}')" style="margin-top:10px;padding:7px 14px;border-radius:8px;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;transition:background 0.15s;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'"><i class="fa-solid fa-pen-to-square"></i> Editar Vaga</button>`
      : '';

    const btnConfigExata = podeEditarVaga
      ? `<button onclick="abrirConfigExata('${v.id}')" style="margin-top:10px;padding:7px 14px;border-radius:8px;border:1px solid #c4b5fd;background:#f5f3ff;color:#6d28d9;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;transition:background 0.15s;" onmouseover="this.style.background='#ede9fe'" onmouseout="this.style.background='#f5f3ff'"><i class="fa-solid fa-file-invoice"></i> Configurar Exata</button>`
      : '';

    return `
      <div class="vaga-card" style="${isQuente ? 'border-color:#f97316; box-shadow:0 0 10px rgba(249,115,22,0.15);' : ''}">
        <div class="vaga-card-header">
          <div class="vaga-logo-badge" style="background:${cor};color:#fff;">${siglaDisplay}</div>
          <div class="vaga-title-area">
            <span class="vaga-company">${escapeHTML(v.empresaNome)}</span>
            <span class="vaga-cargo">${escapeHTML(v.cargo)}</span>
          </div>
          ${badgeQuente}
        </div>
        <!-- texto-longo = white-space: pre-wrap. Sem isso o HTML junta as
             quebras de linha num espaço só, e o descritivo colado pela pessoa
             aparecia todo emendado. O dado SEMPRE esteve certo no banco (o
             textarea preserva as quebras): quem perdia era a exibição. Por
             isso as vagas antigas passam a aparecer certas sem redigitar.
             E escapeHTML porque isto é texto que a pessoa escreve: antes ia
             cru para dentro do HTML. -->
        <p class="vaga-desc texto-longo">${escapeHTML(v.descricao)}</p>
        <span class="vaga-salario">R$ ${Number(v.salario).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        <div class="vaga-tags-benefits">${benefitsHtml}</div>
        <div class="vaga-details">
          <div class="vaga-detail-row"><i class="fa-solid fa-location-dot"></i><span>Local: ${escapeHTML(v.localTrabalho)}</span></div>
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

  // Quem já apareceu em algum grupo de empresa. Serve para, no fim, achar quem
  // não apareceu em NENHUM — ver comentário do grupo "Sem empresa" lá embaixo.
  const _mostrados = new Set();

  (state.empresas || []).forEach(emp => {
    // Candidatos vinculados a esta empresa parceira
    const candEmpresa = state.candidatos.filter(c => {
      const matchEmp = c.empresaId === emp.id;
      const matchFiltro = filtroNome === '' || c.nome.toLowerCase().includes(filtroNome.toLowerCase());
      return matchEmp && matchFiltro && !c.excluido;
    });

    if (candEmpresa.length === 0 && filtroNome !== '') return; // oculta grupo vazio na busca

    candEmpresa.forEach(c => _mostrados.add(c.id));

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
            <div class="banco-logo-badge" style="background-color: ${emp.cor || '#64748B'};">${escapeHTML(emp.sigla || (emp.nome || '').slice(0,3).toUpperCase())}</div>
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

  // ── NINGUÉM PODE FICAR INVISÍVEL ────────────────────────────────────────
  // Esta tela agrupa por empresa. Quem estiver ligado a uma empresa que não
  // existe mais (empresa apagada, id trocado, cadastro antigo) não caía em
  // nenhum grupo e simplesmente NÃO APARECIA — a pessoa continuava no banco,
  // mas ninguém conseguia vê-la. Foi assim que "sumiu gente do banco de dados".
  // Agora quem sobra vai para um grupo próprio, à vista, com aviso.
  const orfaos = (state.candidatos || []).filter(c => {
    if (!c || c.excluido || _mostrados.has(c.id)) return false;
    if (filtroNome && !String(c.nome || '').toLowerCase().includes(filtroNome.toLowerCase())) return false;
    return true;
  });

  if (orfaos.length) {
    const cards = orfaos.map(c => {
      const iniciais = String(c.nome || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
      return `
        <div class="banco-candidato-card" onclick="abrirDrawerDetalhes('${c.id}')" style="cursor: pointer;">
          <div class="avatar-circle c-yellow">${iniciais}</div>
          <div class="banco-cand-info">
            <span class="banco-cand-name">${escapeHTML(c.nome || '')}</span>
            <span class="banco-cand-sub">${escapeHTML(c.codigoVaga || 'sem empresa vinculada')}</span>
          </div>
        </div>`;
    }).join('');

    container.insertAdjacentHTML('beforeend', `
      <div class="banco-grupo-secao">
        <div class="banco-grupo-header">
          <div class="banco-grupo-title">
            <div class="banco-logo-badge" style="background-color:#B45309;">?</div>
            <h2>Sem empresa vinculada</h2>
          </div>
          <span class="banco-count-badge">${orfaos.length}</span>
        </div>
        <p style="font-size:12px;color:var(--text-secondary);padding:0 4px 10px;">
          Estas pessoas estão no banco, mas a empresa delas não existe mais no cadastro.
          Abra cada uma e escolha a empresa certa para ela voltar ao grupo dela.
        </p>
        <div class="banco-grupo-grid">${cards}</div>
      </div>`);
  }

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

  // Pagina: 340 candidatos davam 8.900 pixels de rolagem (12 telas).
  const _pgS = rtPaginar(candidatosSelecao, 'selecao');
  container.innerHTML = rtControlesPagina(_pgS, 'selecao') + _pgS.itens.map(c => {
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
      ? `<span style="font-size:9px;font-weight:600;padding:3px 8px;border-radius:8px;background:rgba(59,130,246,0.15);color:#3b82f6;border:1px solid rgba(59,130,246,0.4);flex-shrink:0;letter-spacing:.3px;"><i class="fa-solid fa-building"></i> FICHA PRESENCIAL</span>`
      : c.origemCadastro === 'banco_talentos'
      ? `<span style="font-size:9px;font-weight:600;padding:3px 8px;border-radius:8px;background:rgba(168,85,247,0.15);color:#a855f7;border:1px solid rgba(168,85,247,0.4);flex-shrink:0;letter-spacing:.3px;"><i class="fa-solid fa-users"></i> BANCO DE TALENTOS</span>`
      : `<span style="font-size:9px;font-weight:600;padding:3px 8px;border-radius:8px;background:rgba(34,197,94,0.12);color:#16a34a;border:1px solid rgba(34,197,94,0.4);flex-shrink:0;letter-spacing:.3px;"><i class="fa-solid fa-globe"></i> FICHA ONLINE</span>`;

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
        <h3 style="font-size: 14px; font-weight:600; color: #10b981; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-circle-check"></i> Contratos Finalizados Hoje (${hoje})
          <span style="background:#10b98120; color:#10b981; padding:2px 10px; border-radius:16px; font-size:12px;">${contratadosHoje.length}</span>
        </h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px;">
          ${contratadosHoje.map(c => {
            const initials = c.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
            const recFinDia = state.recrutadores.find(r => r.id === c.recrutadorId);
            const vagaFinDia = state.vagas.find(v => v.id === c.vagaId);
            return `
              <div style="background: rgba(16,185,129,0.07); border: 1px solid rgba(16,185,129,0.25); border-radius:8px; padding: 14px; display: flex; align-items: center; gap: 12px; cursor: pointer;"
                onclick="abrirDrawerDetalhes('${c.id}')">
                <div style="width:40px; height:40px; border-radius:50%; background:#10b981; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:600; font-size:14px; flex-shrink:0;">${initials}</div>
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

  // Pagina: a lista inteira chegava a 12.800 pixels de rolagem (17 telas).
  const _pgDP = rtPaginar(candidatosAprovados, 'depto-pessoal');
  container.innerHTML = rtControlesPagina(_pgDP, 'depto-pessoal') + _pgDP.itens.map(c => {
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

    // Etiqueta do número da fila. Ver filaParaExibir(): nunca sai "#NaN".
    const filaTexto = filaParaExibir(c.numeroFila);
    const filaTitulo = filaTexto === '-' ? ` title="Número de fila inválido no cadastro: ${esc(c.numeroFila)}"` : '';
    const filaBadge = filaTexto
      ? `<span${filaTitulo} style="background:rgba(190,18,60,0.15); color:var(--primary); font-size:9px; font-weight:600; padding:1px 5px; border-radius:8px; white-space:nowrap;">#${filaTexto}</span>`
      : '';

    return `
      <div class="dp-card" style="${lockStyle}">
        ${isLocked ? `
          <div style="padding:6px 16px 0;display:flex;align-items:center;gap:6px;">
            <i class="fa-solid fa-lock" style="color:#3b82f6;font-size:10px;"></i>
            <span style="font-size:10px;font-weight:600;color:#3b82f6;">${esc(dpLock.userName)} está editando${lockHora ? ' desde ' + lockHora : ''}</span>
          </div>` : ''}
        <div class="dp-card-header" onclick="abrirDrawerDetalhes('${esc(c.id)}')" style="cursor: pointer;">
          <div class="dp-avatar" style="${isLocked ? 'background:#3b82f6;' : ''}">${initials}</div>
          <div class="dp-title-info">
            <span class="dp-cand-name" style="display:flex; align-items:center; gap:6px;">
              ${filaBadge}
              ${nomeSeguro}
            </span>
            <span class="dp-cand-company">${vagaSegura}</span>
          </div>
        </div>
        <div class="dp-card-meta" style="display: flex; flex-direction: column; gap: 4px; padding: 12px 16px; border-bottom: 1px solid var(--border-color); font-size: 11px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 600; color: var(--text-secondary);">Origem:</span>
            ${c.origemCadastro === 'presencial'
              ? `<span style="font-size:9px;font-weight:600;padding:3px 8px;border-radius:8px;background:rgba(59,130,246,0.15);color:#3b82f6;border:1px solid rgba(59,130,246,0.4);letter-spacing:.3px;"><i class="fa-solid fa-building"></i> FICHA PRESENCIAL</span>`
              : `<span style="font-size:9px;font-weight:600;padding:3px 8px;border-radius:8px;background:rgba(34,197,94,0.12);color:#16a34a;border:1px solid rgba(34,197,94,0.4);letter-spacing:.3px;"><i class="fa-solid fa-globe"></i> FICHA ONLINE</span>`}
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

    // Registra a contratação. É daqui que saem os números do Dashboard e dos
  // Relatórios (a planilha de Comissão, que também lia isto, saiu do sistema).
    const vaga = state.vagas.find(v => v.id === cand.vagaId);
    const empresaNome = vaga ? vaga.empresaNome : 'Empresa Geral';

    const novaContratacao = {
      id: _novoId('c'),
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
    if (!loggedUser || !ehMestre(loggedUser.login)) {
      state.atividades.unshift({
        id: _novoId('act'),
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
          backgroundColor: state.recrutadores.map(r => r.corHex || '#0A5F80'),
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
      <div style="width:32px;height:32px;border-radius:50%;background:#0A5F80;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;color:#fff;flex-shrink:0;">R</div>
      <div style="flex:1;min-width:200px;">
        <div style="font-weight:600;font-size:13px;color:var(--text-primary);">Agência ATTOS RH (Link Oficial)</div>
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
      <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px;padding:14px 16px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <div style="width:36px;height:36px;border-radius:50%;background:${rec.corHex};display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px;color:#fff;flex-shrink:0;">${rec.nome[0]}</div>
          <div style="flex:1;min-width:160px;">
            <div style="font-weight:600;font-size:13px;color:var(--text-primary);">${rec.nome}</div>
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
            style="flex:1;padding:7px 12px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);font-size:12px;"
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
  if (loggedUser && loggedUser.departamento === 'dp' && !ehMestre(loggedUser.login)) {
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
  if (loggedUser && !ehMestre(loggedUser.login)) {
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
  // Mesma regra do cartão do DP, para as duas telas dizerem a mesma coisa.
  if (filaEl) {
    const filaTxt = filaParaExibir(cand.numeroFila);
    filaEl.textContent = filaTxt ? `Fila #${filaTxt}` : '';
    if (filaTxt === '-') filaEl.title = 'Número de fila inválido no cadastro: ' + String(cand.numeroFila);
    else filaEl.removeAttribute('title');
  }

  // Badge presencial / online
  const origemEl = document.getElementById('det-origem-badge');
  if (origemEl) {
    if (cand.origemCadastro === 'presencial') {
      origemEl.innerHTML = '<i class="fa-solid fa-building"></i> FICHA PRESENCIAL';
      origemEl.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:600;padding:3px 10px;border-radius:12px;background:rgba(59,130,246,0.15);color:#3b82f6;border:1px solid rgba(59,130,246,0.4);margin-left:8px;letter-spacing:.3px;';
    } else if (cand.origemCadastro === 'banco_talentos') {
      origemEl.innerHTML = '<i class="fa-solid fa-users"></i> BANCO DE TALENTOS';
      origemEl.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:600;padding:3px 10px;border-radius:12px;background:rgba(168,85,247,0.15);color:#a855f7;border:1px solid rgba(168,85,247,0.4);margin-left:8px;letter-spacing:.3px;';
    } else {
      origemEl.innerHTML = '<i class="fa-solid fa-globe"></i> FICHA ONLINE';
      origemEl.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:600;padding:3px 10px;border-radius:12px;background:rgba(34,197,94,0.12);color:#16a34a;border:1px solid rgba(34,197,94,0.4);margin-left:8px;letter-spacing:.3px;';
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
        const msg = encodeURIComponent(`Olá, ${(cand.nome || '').split(' ')[0]}! Complete seu cadastro na ATTOS RH clicando no link: ${linkCompletar}`);
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
        instagram: 'Instagram ATTOS RH', facebook: 'Facebook ATTOS RH', anuncios_fb: 'Anúncios Facebook',
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
  setSafeText('det-pis', cand.pis || '—');
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
  // Espaco vazio desenhado na propria pagina, para o <img> nao ficar com o
  // icone de imagem quebrada quando o documento ainda nao chegou. Era aqui
  // que entrava foto do Unsplash: imagem de outra pessoa, ocupando o lugar
  // do documento de verdade.
  const SEM_DOC = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260">' +
    '<rect width="400" height="260" fill="#eef2f6"/>' +
    '<text x="200" y="136" text-anchor="middle" font-family="sans-serif" ' +
    'font-size="17" fill="#8a99a8">Documento nao enviado</text></svg>');

  const selfieEl = document.getElementById('img-doc-selfie');
  if (selfieEl) {
    selfieEl.src = docs.selfie || SEM_DOC;
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
    rgFrenteEl.src = docs.rgFrente || SEM_DOC;
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
    fotoPisEl.src = docs.fotoPis || SEM_DOC;
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
    cpfDocumentoEl.src = docs.cpfDocumento || SEM_DOC;
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
    comprovanteEl.src = docs.comprovanteResidencia || SEM_DOC;
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
    cartaoEl.src = docs.cartaoBancoVerso || SEM_DOC;
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
        <div style="background:rgba(59,130,246,0.07);border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:12px 16px;margin-bottom:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <i class="fa-solid fa-lock" style="color:#3b82f6;font-size:15px;flex-shrink:0;"></i>
          <div style="flex:1;min-width:200px;">
            <div style="font-size:12px;color:#3b82f6;font-weight:600;margin-bottom:3px;">
              <i class="fa-solid fa-user-tie" style="margin-right:4px;font-size:10px;"></i>${_esc(lock.userName)} (DP) está com essa ficha${hora ? ' — desde ' + hora : ''}
            </div>
            <div style="font-size:11px;color:var(--text-secondary);">
              Candidato: <strong>${_esc(cand.nome)}</strong> &nbsp;·&nbsp; Selecionadora: <strong>${_esc(recNome)}</strong>
            </div>
          </div>
          ${euBloqueei ? `
          <button onclick="liberarFichaDP('${_esc(cand.id)}')" style="padding:5px 14px;border-radius:8px;border:1px solid rgba(59,130,246,0.4);background:rgba(59,130,246,0.1);color:#3b82f6;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit;white-space:nowrap;flex-shrink:0;">
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
        <strong>Devolvida por:</strong> ${escapeHTML(cand.devolvidoPor || 'Departamento Pessoal')}
        ${cand.dataDevolucaoDP ? `<span style="font-size:10px; opacity:.7;"> · ${escapeHTML(cand.dataDevolucaoDP)}</span>` : ''}<br>
        <strong>Motivo:</strong> <span class="texto-longo">${escapeHTML(cand.motivoDevolucaoDP || 'Não informado')}</span>
        ${cand.corrigidoPor ? `<br><span style="color:#22c55e;"><strong>✓ Corrigida por:</strong> ${escapeHTML(cand.corrigidoPor)} · ${escapeHTML(cand.dataCorrecao || '')}</span>` : ''}
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
    const BASE_BTN = 'cursor:pointer;border:none;display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:600;padding:3px 10px;border-radius:12px;letter-spacing:.3px;font-family:inherit;';
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

// (A segunda declaração de gerarLinkCompletarFicha que existia aqui foi
//  removida: ela era código morto por hoisting. A versão única, que procura
//  em candidatos E no banco de talentos, está mais abaixo no arquivo.)

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
      motivos.map(m => `<option value="${escapeHTML(m.id)}">${escapeHTML(m.descricao)}</option>`).join('');
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
      id: _novoId('inapto'),
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
// Mensagem que o candidato envia para a recrutadora ao terminar a ficha
// (usada pelo botão de WhatsApp no final do candidato.html)
let _waMsgLogTimer = null;
window.salvarMensagemWhatsappRecrutadora = function(recrutadorId, valor) {
  const rec = (state.recrutadores || []).find(r => r.id === recrutadorId);
  if (!rec) return;
  rec.mensagemWhatsapp = String(valor || '').slice(0, 500);
  saveState();
  clearTimeout(_waMsgLogTimer);
  _waMsgLogTimer = setTimeout(() => {
    registrarLogGlobal(`Atualizou a mensagem de WhatsApp do perfil "${rec.nome}".`, 'meu_painel');
  }, 2500);
};

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


// ==========================================================================
// MÓDULO: INAPTOS — RENDER DA ABA ADMIN
// ==========================================================================

function renderInaptos() {
  const container = document.getElementById('aba-inaptos');
  if (!container) return;

  const isAdmin = loggedUser && (loggedUser.departamento === 'administracao' || ehMestre(loggedUser.login));

  // Render motivos
  const motivosList = document.getElementById('motivos-inaptidao-lista');
  if (motivosList) {
    const motivos = state.motivosInaptidao || [];
    motivosList.innerHTML = motivos.length === 0
      ? '<p style="font-size:13px;color:var(--text-secondary);">Nenhum motivo cadastrado.</p>'
      : motivos.map(m => `
        <div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;">
          <span class="texto-longo" style="font-size:13px;color:var(--text-primary);font-weight:500;">${escapeHTML(m.descricao)}</span>
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
            <div style="font-size:13px;font-weight:600;color:var(--text-primary);">${i.nome}</div>
            <div style="font-size:11px;color:var(--text-secondary);">CPF: ${i.cpf} · ${i.data}</div>
            <div style="font-size:11px;color:#fca5a5;margin-top:2px;"><i class="fa-solid fa-circle-xmark"></i> ${i.motivo}</div>
            ${i.aprovadoMesmoInapto ? '<span style="font-size:9px;background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);padding:2px 6px;border-radius:6px;font-weight:600;">APROVADO MANUALMENTE</span>' : ''}
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
    id: _novoId('mot'),
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
    const conf = confirm('Mover diretamente para Contratado? Isso irá registrar a contratação.');
    if (!conf) return;

    state.contratacoes.push({
      id: _novoId('c'),
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
  if (_drawerSnapshotAntes && loggedUser && !ehMestre(loggedUser.login)) {
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
// Só mestre e administração enxergam TODOS os funcionários. Os demais (ex.: o
// representante do departamento) só veem as pessoas do próprio departamento.
function _verTodosFuncionarios() {
  return !!(loggedUser && (
    ehMestre(loggedUser.login) ||
    loggedUser.departamento === 'administracao' ||
    hasPermission('sistema', 'perms')
  ));
}
// usarSolicitado=true para a lista de pendentes (que ainda usa o departamento pedido no cadastro)
function _funcionariosVisiveis(lista, usarSolicitado) {
  if (!loggedUser) return [];
  if (_verTodosFuncionarios()) return lista;
  const meuDepto = loggedUser.departamento;
  return lista.filter(f => (usarSolicitado ? (f.departamentoSolicitado || f.departamento) : f.departamento) === meuDepto);
}

function renderFuncionarios() {
  // --- Card de Funcionários Aguardando Aprovação ---
  const pendingCard = document.getElementById('func-pending-approvals-card');
  const pendingBody = document.getElementById('lista-pendentes-body');
  const podeAprovar = loggedUser && (
    loggedUser.departamento === 'administracao' ||
    ehMestre(loggedUser.login) ||
    hasPermission('funcionarios', 'aprovar')
  );

  const pendentes = _funcionariosVisiveis(state.funcionarios.filter(f => f.status === 'aguardando_aprovacao'), true);

  const pendCountEl = document.getElementById('func-pending-count');
  if (pendCountEl) pendCountEl.textContent = pendentes.length > 0 ? `${pendentes.length} nova(s)` : '';

  if (pendingCard && pendingBody) {
    if (pendentes.length > 0 && podeAprovar) {
      pendingCard.style.display = 'block';
      pendingBody.innerHTML = pendentes.map(f => `
        <tr>
          <td style="font-weight:600; color:var(--text-primary);">${escapeHTML(f.nome)}<div style="font-size:11px;color:var(--text-secondary);font-weight:400;">${escapeHTML(f.telefone || 'sem telefone')} · ${escapeHTML(deptoLabelSimples(f.departamentoSolicitado || f.departamento))}${f.instituicao ? ' · <strong>' + escapeHTML(f.instituicao) + '</strong>' : ''}${f.dataSolicitacao ? ' · ' + escapeHTML(f.dataSolicitacao) : ''}</div></td>
          <td>${escapeHTML(f.login)}</td>
          <td><span class="badge" style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:600;">Aguardando Aprovação</span></td>
          <td>
            <button class="btn btn-primary btn-sm" onclick="abrirModalGerenciarFuncionario('${f.id}')"
              style="padding:2px 8px; font-size:11px; background:var(--primary); border:none;">
              <i class="fa-solid fa-user-check"></i> Avaliar & Aprovar
            </button>
            ${podeExcluirFuncionario(f) ? `
              <button class="btn btn-danger btn-sm" onclick="excluirFuncionario('${f.id}')"
                style="padding:2px 8px; font-size:11px; margin-left:6px;"
                title="Apagar este cadastro definitivamente">
                <i class="fa-solid fa-trash-can"></i> Excluir
              </button>` : ''}
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
  const podeLiberar = loggedUser && (loggedUser.departamento === 'administracao' || ehMestre(loggedUser.login) || hasPermission('funcionarios', 'aprovar'));
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
    ehMestre(loggedUser.login) ||
    hasPermission('funcionarios', 'perms')
  );

  const deptoLabels = {
    'administracao': 'Gestão Executiva',
    'selecao': 'Recrutamento & Seleção',
    'dp': 'Departamento Pessoal',
    'clinica': 'Clínica Médica',
    'financeiro': 'Financeiro'
  };

  // Exibe apenas funcionários ativos/inativos na lista principal (não os pendentes),
  // já restrito ao departamento de quem está logado (mestre/admin veem todos).
  const funcExibir = _funcionariosVisiveis(state.funcionarios.filter(f => f.status !== 'aguardando_aprovacao'), false);

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
        <td>
          ${f.login}
          ${podeRedefinirSenha(f) ? `
          <div style="margin-top:3px;display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" style="padding:1px 7px;font-size:10px;" onclick="resetarSenhaFuncionario('${f.id}')"><i class="fa-solid fa-key"></i> Redefinir senha</button>
            ${f.precisaTrocarSenha
              ? '<span title="Esta pessoa vai escolher uma senha nova no próximo acesso." style="font-size:9.5px;font-weight:600;color:#D97706;background:rgba(217,119,6,.12);border:1px solid rgba(217,119,6,.3);padding:1px 6px;border-radius:8px;"><i class="fa-solid fa-hourglass-half"></i> vai trocar a senha</span>'
              : '<span title="A senha é guardada embaralhada (scrypt). Nem o sistema consegue ler." style="font-size:9.5px;font-weight:600;color:#059669;background:rgba(5,150,105,.12);border:1px solid rgba(5,150,105,.3);padding:1px 6px;border-radius:8px;"><i class="fa-solid fa-shield-halved"></i> senha protegida</span>'}
          </div>` : ''}
        </td>
        <td>
          <span class="tag-badge tag-blue">${deptoLabels[f.departamento] || f.departamento}</span>
          ${f.instituicao ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:3px;"><i class="fa-solid fa-hospital"></i> ${escapeHTML(f.instituicao)}</div>` : ''}
        </td>
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
          ${podeExcluirFuncionario(f) ? `
            <button class="btn btn-danger btn-sm" onclick="excluirFuncionario('${f.id}')" style="padding:2px 8px; font-size:11px;"
                    title="Apagar este funcionário e o histórico dele definitivamente">
              <i class="fa-solid fa-trash-can"></i> Excluir
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');

  // Pedidos de nova senha: fica olhando enquanto a aba estiver aberta
  iniciarMonitorPedidosSenha();

  // Campo "Nome da clínica" no cadastro: só aparece quando o depto é Clínica
  const selDeptoNovo = document.getElementById('func-depto');
  if (selDeptoNovo && !selDeptoNovo.dataset.clinicaOk) {
    selDeptoNovo.addEventListener('change', alternarClinicaCadastro);
    selDeptoNovo.dataset.clinicaOk = '1';
  }
  alternarClinicaCadastro();

  // Configurar listeners do modal Gerenciar (garante que esteja configurado)
  setupModalGerenciarListeners();
  setupBtnCopiarLink();
}

// ── Meu Perfil: nome exibido e troca da própria senha ─────────────────────

// Nome que aparece na tela. O nome REAL continua sendo usado na auditoria e nos
// registros — só a exibição muda.
function nomeExibido(u) {
  if (!u) return 'Colaborador';
  return (u.nomeExibicao && String(u.nomeExibicao).trim()) || u.nome || 'Colaborador';
}

function _perfilMsg(id, texto, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = texto;
  el.style.color = ok ? '#10b981' : '#ef4444';
  el.style.display = 'block';
}

window.salvarNomeExibicao = async function () {
  const inp = document.getElementById('perfil-nome-exibicao');
  if (!inp) return;
  const novo = inp.value.trim();
  try {
    const r = await fetch('/api/nome-exibicao', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify({ nomeExibicao: novo })
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 200 && d.ok) {
      if (loggedUser) loggedUser.nomeExibicao = d.nomeExibicao || '';
      const f = (state.funcionarios || []).find(x => loggedUser && x.id === loggedUser.id);
      if (f) f.nomeExibicao = d.nomeExibicao || '';

      // Atualiza o topo e a saudação da dashboard na hora
      const nameEl = document.getElementById('header-user-name');
      if (nameEl) nameEl.textContent = nomeExibido(loggedUser);
      const greet = document.getElementById('dash-welcome-title');
      if (greet) greet.textContent = `Bem-vindo(a), ${nomeExibido(loggedUser)}! 👋`;

      _perfilMsg('perfil-nome-msg', novo ? `Pronto! Agora você aparece como "${novo}".` : 'Voltou a usar seu nome completo.', true);
    } else {
      _perfilMsg('perfil-nome-msg', 'Não foi possível salvar. Tente de novo.', false);
    }
  } catch (e) { _perfilMsg('perfil-nome-msg', 'Erro de conexão. Tente de novo.', false); }
};

window.trocarMinhaSenha = async function () {
  const atual = document.getElementById('perfil-senha-atual')?.value || '';
  const nova  = document.getElementById('perfil-senha-nova')?.value || '';
  const nova2 = document.getElementById('perfil-senha-nova2')?.value || '';

  if (!atual) { _perfilMsg('perfil-senha-msg', 'Informe a sua senha atual.', false); return; }
  if (nova.length < 6) { _perfilMsg('perfil-senha-msg', 'A nova senha precisa ter ao menos 6 caracteres.', false); return; }
  if (nova !== nova2) { _perfilMsg('perfil-senha-msg', 'As duas senhas novas não são iguais.', false); return; }

  try {
    const r = await fetch('/api/trocar-senha', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify({ senhaAtual: atual, senhaNova: nova })
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 200 && d.ok) {
      ['perfil-senha-atual', 'perfil-senha-nova', 'perfil-senha-nova2'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      _perfilMsg('perfil-senha-msg', 'Senha alterada! Use a nova no próximo login.', true);
    } else if (d.motivo === 'senha_atual') {
      _perfilMsg('perfil-senha-msg', 'A senha atual está errada.', false);
    } else if (d.motivo === 'igual') {
      _perfilMsg('perfil-senha-msg', 'A nova senha é igual à atual. Escolha outra.', false);
    } else {
      _perfilMsg('perfil-senha-msg', 'Não foi possível trocar a senha. Tente de novo.', false);
    }
  } catch (e) { _perfilMsg('perfil-senha-msg', 'Erro de conexão. Tente de novo.', false); }
};

// ── Pedidos de redefinição de senha (aprovação do admin) ──────────────────
// Os pedidos NÃO ficam no estado normal: o token de redefinição é secreto e não
// pode viajar junto com os dados que todo funcionário logado recebe. Por isso o
// painel busca a lista numa rota própria, que só o admin acessa.
let _pedidosSenhaTimer = null;

function podeAprovarSenha() {
  return !!(loggedUser && (ehMestre(loggedUser.login) || loggedUser.departamento === 'administracao'));
}

async function carregarPedidosSenha() {
  const card = document.getElementById('card-pedidos-senha');
  if (!card) return;
  if (!podeAprovarSenha()) { card.style.display = 'none'; return; }

  try {
    const r = await fetch('/api/solicitacoes-senha', { credentials: 'same-origin' });
    if (!r.ok) { card.style.display = 'none'; return; }
    const d = await r.json().catch(() => ({}));
    _renderPedidosSenha((d && d.pedidos) || []);
  } catch (e) { /* sem rede: tenta de novo no próximo ciclo */ }
}
window.carregarPedidosSenha = carregarPedidosSenha;

function _renderPedidosSenha(pedidos) {
  const card = document.getElementById('card-pedidos-senha');
  const tbody = document.getElementById('lista-pedidos-senha');
  const cnt = document.getElementById('pedidos-senha-count');
  if (!card || !tbody) return;

  // Mostra os pendentes primeiro; some quando não há nada recente
  const relevantes = pedidos.filter(p => ['pendente', 'aprovada'].includes(p.status));
  if (!relevantes.length) { card.style.display = 'none'; return; }

  card.style.display = 'block';
  const pendentes = relevantes.filter(p => p.status === 'pendente').length;
  if (cnt) cnt.textContent = pendentes ? `${pendentes} aguardando você` : 'liberados';

  tbody.innerHTML = relevantes.map(p => {
    const quando = _formatarDataHoraBR(new Date(p.criadoEm || 0).toISOString());
    const pend = p.status === 'pendente';
    const situacao = pend
      ? '<span class="badge badge-red">Esperando você liberar</span>'
      : `<span class="badge badge-green">Liberado — criando a senha</span>`;
    return `
      <tr>
        <td style="font-weight:600;">${escapeHTML(p.nome || '—')}</td>
        <td>${escapeHTML(p.login || '—')}</td>
        <td>${escapeHTML(deptoLabelSimples(p.departamento))}</td>
        <td>${quando}</td>
        <td>${situacao}</td>
        <td>
          ${pend ? `
            <button class="btn btn-primary btn-sm" style="padding:2px 8px;font-size:11px;"
                    onclick="responderPedidoSenha('${p.id}', 'aprovar')">
              <i class="fa-solid fa-unlock"></i> Liberar
            </button>
            <button class="btn btn-danger btn-sm" style="padding:2px 8px;font-size:11px;margin-left:6px;"
                    onclick="responderPedidoSenha('${p.id}', 'recusar')">
              <i class="fa-solid fa-ban"></i> Recusar
            </button>`
            : `<small style="color:var(--text-secondary);">Liberado por ${escapeHTML(p.aprovadoPor || '—')}</small>`}
        </td>
      </tr>`;
  }).join('');
}

window.responderPedidoSenha = async function (id, acao) {
  if (acao === 'recusar' && !confirm('Recusar este pedido de nova senha?')) return;
  try {
    const r = await fetch('/api/aprovar-senha', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify({ id: id, acao: acao })
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 200 && d.ok) {
      await carregarPedidosSenha();
      if (acao === 'aprovar') alert('Liberado! A tela da pessoa vai mudar sozinha em alguns segundos para ela criar a nova senha.');
    } else if (r.status === 403) {
      alert('Você não tem permissão para liberar redefinição de senha.');
    } else if (r.status === 409) {
      alert('Este pedido já foi tratado.');
      await carregarPedidosSenha();
    } else { alert('Não foi possível responder ao pedido.'); }
  } catch (e) { alert('Erro de conexão. Tente novamente.'); }
};

// Enquanto a aba Funcionários estiver aberta, fica de olho em novos pedidos
function iniciarMonitorPedidosSenha() {
  if (_pedidosSenhaTimer) return;
  if (!podeAprovarSenha()) return;
  carregarPedidosSenha();
  _pedidosSenhaTimer = setInterval(carregarPedidosSenha, 8000);
}
function pararMonitorPedidosSenha() {
  if (_pedidosSenhaTimer) { clearInterval(_pedidosSenhaTimer); _pedidosSenhaTimer = null; }
}

// ── Clínicas parceiras (Exame Médico) ─────────────────────────────────────
// Atalho de digitação SÓ nas telas internas (cadastro/gestão de funcionário).
// O cadastro público não recebe esta lista: lá a pessoa digita o nome da própria
// clínica, para não revelarmos com quem temos parceria.
const CLINICAS_PARCEIRAS = [
  'Agimed', 'Inovare', 'Med Seg', 'Ação Med', 'Medicina do Trabalho',
  'Portal Médic', 'Fonseca', 'Prever', 'Messias', 'Master',
  'JC Hannover', 'Gold Med', 'Atlas'
];

function _preencherDatalistClinicas() {
  const dl = document.getElementById('lista-clinicas-parceiras');
  if (!dl || dl.dataset.pronto) return;
  dl.innerHTML = CLINICAS_PARCEIRAS.map(c => `<option value="${escapeHTML(c)}"></option>`).join('');
  dl.dataset.pronto = '1';
}

// Mostra o campo "Nome da clínica" apenas quando o departamento escolhido é Clínica
function _alternarCampoClinica(idSelect, idWrap, idInput) {
  const sel  = document.getElementById(idSelect);
  const wrap = document.getElementById(idWrap);
  if (!sel || !wrap) return;
  const ehClinica = sel.value === 'clinica';
  wrap.style.display = ehClinica ? '' : 'none';
  if (!ehClinica) {
    const inp = document.getElementById(idInput);
    if (inp) inp.value = '';
  } else {
    _preencherDatalistClinicas();
  }
}
// Chamado pelo cadastro de funcionário e pelo modal de gerenciar
function alternarClinicaCadastro()   { _alternarCampoClinica('func-depto', 'func-instituicao-wrap', 'func-instituicao'); }
function alternarClinicaGerenciar()  { _alternarCampoClinica('gerenciar-func-depto', 'gerenciar-func-instituicao-wrap', 'gerenciar-func-instituicao'); }
window.alternarClinicaCadastro  = alternarClinicaCadastro;
window.alternarClinicaGerenciar = alternarClinicaGerenciar;

// ── Excluir funcionário definitivamente ───────────────────────────────────
// Só mestre/administração. Nunca a própria conta, nunca uma conta MESTRE
// (apagar joaobalaf/admin trancaria todo mundo pra fora do sistema).
function podeExcluirFuncionario(f) {
  if (!loggedUser || !f) return false;
  if (loggedUser.id === f.id) return false;          // não apaga a si mesmo
  if (ehMestre(f.login)) return false;               // não apaga conta mestre
  return ehMestre(loggedUser.login) || loggedUser.departamento === 'administracao';
}

function excluirFuncionario(id) {
  const f = (state.funcionarios || []).find(x => x.id === id);
  if (!f) return;

  if (!podeExcluirFuncionario(f)) {
    if (loggedUser && loggedUser.id === f.id) alert('Você não pode excluir a sua própria conta.');
    else if (ehMestre(f.login)) alert('Esta é uma conta mestre do sistema e não pode ser excluída.');
    else alert('Você não tem permissão para excluir funcionários.');
    return;
  }

  const qtdLogs = (state.logs || []).filter(l => l.usuario === f.nome).length;

  if (!confirm(
    `EXCLUIR DEFINITIVAMENTE "${f.nome}" (login: ${f.login})?\n\n` +
    `Isso vai apagar de vez:\n` +
    `  • a conta e o acesso dele ao sistema;\n` +
    `  • o histórico de auditoria dele (${qtdLogs} registro(s));\n` +
    `  • o vínculo dele com recrutador, se houver.\n\n` +
    `NÃO tem como desfazer.`
  )) return;

  if (!confirm(`Tem certeza absoluta? "${f.nome}" será apagado para sempre.`)) return;

  // Remove o funcionário
  state.funcionarios = (state.funcionarios || []).filter(x => x.id !== id);

  // Remove o histórico/auditoria dele
  if (Array.isArray(state.logs)) {
    state.logs = state.logs.filter(l => l.usuario !== f.nome);
  }

  // Desfaz o vínculo com recrutador (evita referência apontando pro nada)
  (state.recrutadores || []).forEach(r => {
    if (r.usuarioId === f.id) r.usuarioId = null;
    if (r.loginVinculado === f.login) r.loginVinculado = '';
  });

  // Fica registrado QUEM apagou (a conta some, mas a responsabilidade não)
  registrarLogGlobal(`Excluiu definitivamente o funcionário "${f.nome}" (${f.login}).`, 'funcionarios');

  saveState();
  renderFuncionarios();
  alert(`"${f.nome}" foi excluído do sistema.`);
}
window.excluirFuncionario = excluirFuncionario;

// Quem pode ver/redefinir a senha: mestre (admin/João) ou administração vê todos.
// Os demais só se estiverem MARCADOS (podeVerSenhas) e forem do MESMO departamento.
function podeRedefinirSenha(f) {
  if (!loggedUser) return false;
  if (ehMestre(loggedUser.login) || loggedUser.departamento === 'administracao') return true;
  return !!(loggedUser.podeVerSenhas && f.departamento === loggedUser.departamento);
}
window.exigirTrocaDeSenhaDeTodos = async function () {
  if (!confirm(
    'Exigir que TODAS as contas troquem a senha no próximo acesso?\n\n' +
    'Isso inclui a sua: você também vai trocar agora.\n\n' +
    'Use quando desconfiar de vazamento de senha.'
  )) return;
  try {
    const r = await fetch('/api/exigir-troca-senha', { method: 'POST', credentials: 'same-origin' });
    const d = await r.json().catch(() => ({}));
    if (r.status === 200 && d.ok) {
      alert(d.marcadas + ' conta(s) vão trocar a senha no próximo acesso.\n\nA sua tela vai pedir a troca agora.');
      window.location.reload();
      return;
    }
    if (r.status === 403) { alert('Só a administração pode exigir a troca de senha de todos.'); return; }
    alert('Não consegui marcar as contas. Tente de novo.');
  } catch (e) { alert('Erro de conexão. Tente novamente.'); }
};

// Dar acesso a alguém é SÓ por aqui: define uma senha provisória e o dono
// troca no primeiro login. Não existe caminho para ler a senha de ninguém.
window.resetarSenhaFuncionario = async function (funcId) {
  const func = (state.funcionarios || []).find(f => f.id === funcId);
  if (!func) return;
  const nova = prompt(`Definir uma senha PROVISÓRIA para "${func.nome}"\n(pelo menos 8 caracteres, com letras e números):`);
  if (nova == null) return;
  const critica = (window.RTTroca && RTTroca.criticar) ? RTTroca.criticar(nova, nova) : '';
  if (critica) { alert(critica); return; }
  try {
    const r = await fetch('/api/reset-senha', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify({ funcId: funcId, novaSenha: nova })
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 200 && d.ok) {
      alert(
        'Senha PROVISÓRIA de "' + func.nome + '":\n\n' + nova + '\n\n' +
        'Passe para a pessoa. No primeiro acesso ela vai escolher a senha definitiva, ' +
        'e aí ninguém mais conhece a senha dela.'
      );
      try { const nuvem = await RTCloud.loadState(); if (nuvem) { state = nuvem; renderFuncionarios(); } } catch (e) {}
    } else if (r.status === 403) {
      alert('Você não tem permissão para redefinir a senha deste funcionário (só do seu departamento).');
    } else {
      alert('Não foi possível redefinir a senha. Tente novamente.');
    }
  } catch (e) { alert('Erro de conexão. Tente novamente.'); }
};

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

// ── ENGINE DE TRANSFORMAÇÃO — regras pré-definidas para o configurador Exata ──
const EXATA_REGRAS_TRANSFORM = {
  MAIUSCULAS:           { label: 'MAIÚSCULAS', desc: 'Converte para letras maiúsculas', fn: v => v.toUpperCase() },
  MINUSCULAS:           { label: 'minúsculas', desc: 'Converte para letras minúsculas', fn: v => v.toLowerCase() },
  REMOVER_ACENTOS:      { label: 'Remover acentos', desc: 'Tira acentos (São Paulo → SAO PAULO)', fn: v => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '') },
  REMOVER_ESPACOS:      { label: 'Remover espaços', desc: 'Tira todos os espaços', fn: v => v.replace(/\s+/g, '') },
  REMOVER_RS:           { label: 'Remover R$', desc: 'Tira "R$" e espaço', fn: v => v.replace(/R\$\s*/gi, '') },
  REMOVER_PONTO_MILHAR: { label: 'Remover ponto de milhar', desc: 'Tira . antes de 3 dígitos', fn: v => v.replace(/\.(?=\d{3})/g, '') },
  SO_DIGITOS:           { label: 'Só dígitos', desc: 'Mantém apenas números', fn: v => v.replace(/\D/g, '') },
  TRIM:                 { label: 'Trim (espaços bordas)', desc: 'Remove espaços no início/fim', fn: v => v.trim() }
};
// Lista ordenada das chaves para UI
const EXATA_REGRAS_KEYS = Object.keys(EXATA_REGRAS_TRANSFORM);

// Retorna a config global de transformações
function _getExataTransformacoes() {
  if (typeof state === 'undefined' || !state) return {};
  if (!state.exataTransformacoes) state.exataTransformacoes = {};
  return state.exataTransformacoes;
}
// Retorna a config de uma vaga (override)
function _getExataTransformacoesVaga(vs) {
  return (vs && vs.exataTransformacoes) || {};
}
// Merge: vaga sobrescreve global
function _getTransformConfig(key, globalCfg, vagaCfg) {
  if (vagaCfg[key]) return vagaCfg[key];
  if (globalCfg[key]) return globalCfg[key];
  return null;
}

// Aplica regras de transformação a um valor individual
function _aplicarRegrasValor(valor, regras) {
  if (!regras || !regras.length) return valor;
  let v = String(valor == null ? '' : valor);
  if (!v) return v;
  regras.forEach(rKey => {
    const regra = EXATA_REGRAS_TRANSFORM[rKey];
    if (regra && typeof regra.fn === 'function') v = regra.fn(v);
  });
  return v;
}

// Traduz um valor pela tabela de opções de multiescolha configurada
function _traduzirMultiescolha(valor, opcoes) {
  if (!opcoes || !opcoes.length) return valor;
  const alvo = String(valor == null ? '' : valor).trim().toLowerCase();
  if (!alvo) return valor;
  const hit = opcoes.find(o => String(o.de || '').trim().toLowerCase() === alvo);
  return hit ? (hit.codigo || valor) : valor;
}

// Pipeline: aplica transformações configuradas (global + override por vaga)
function _aplicarTransformacoes(arr, vs) {
  const globalCfg = _getExataTransformacoes();
  const vagaCfg = _getExataTransformacoesVaga(vs);
  EXATA_CAMPOS_INFO.forEach(c => {
    const i = EXATA_HEADER.indexOf(c.key);
    if (i < 0) return;
    const cfg = _getTransformConfig(c.key, globalCfg, vagaCfg);
    if (!cfg) return; // sem configuração = mantém valor original (retrocompatível)
    const tipo = cfg.tipo || 'auto';
    if (tipo === 'auto') return; // automático = sem transformação
    if (tipo === 'semi') {
      arr[i] = _aplicarRegrasValor(arr[i], cfg.regras || []);
    } else if (tipo === 'codigo') {
      arr[i] = _traduzirMultiescolha(arr[i], cfg.opcoes || []);
    }
  });
  return arr;
}

// Preview: simula a transformação de um valor de exemplo
function _previewTransformacao(valorExemplo, cfg) {
  if (!cfg) return valorExemplo;
  const tipo = cfg.tipo || 'auto';
  if (tipo === 'auto') return valorExemplo;
  if (tipo === 'semi') return _aplicarRegrasValor(valorExemplo, cfg.regras || []);
  if (tipo === 'codigo') return _traduzirMultiescolha(valorExemplo, cfg.opcoes || []);
  return valorExemplo;
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
  // 1) traduz texto→código (de/para da ficha) · 2) transformações configuradas · 3) extras legado · 4) config por campo da vaga (vence)
  return _aplicarCamposVaga(_aplicarExtrasVaga(_aplicarTransformacoes(_aplicarDominiosExata(arr), vs), vs), vs);
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
  relatorios: 'Relatórios',
  graficos: 'Gráficos',
  candidatos: 'Candidatos',
  funcionarios: 'Funcionários',
  fluxo_financeiro: 'Fluxo Financeiro (DP)',
  whatsapp: 'WhatsApp',
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
  'site': 'candidatos',
  'funcionarios': 'funcionarios',
  'auditoria': 'sistema',
  'inaptos': 'sistema',
  'documentos': 'dp',
  'lixeira': 'sistema',
  'controle-acesso': 'sistema',
  'cadastros-exata': 'sistema',
  'fluxo-financeiro': 'fluxo_financeiro',
  'whatsapp': 'whatsapp'
};

function hasPermission(area, acao) {
  if (!loggedUser) return false;
  if (ehMestre(loggedUser.login)) return true;
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
//  - banco_talentos: João + Administrador (administracao) + quem tiver banco_talentos.excluir
//  - selecao/dp: João + administracao + administrador do próprio depto (representanteDepto) + permissão excluir
function podeExcluirArea(area) {
  if (!loggedUser) return false;
  if (ehMestre(loggedUser.login)) return true;
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
  return !!(loggedUser && (ehMestre(loggedUser.login) || loggedUser.departamento === 'administracao'));
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
    <div style="border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="min-width:220px;">
        <div style="font-weight:600;font-size:14px;">${escapeHTML(c.nome || '(sem nome)')}</div>
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

// Devolve o ID do log criado, ou null quando não registrou (conta mestre).
// Quem salva com upsertIds precisa desse id, senão o log não sobe junto e a
// ação não aparece na Auditoria.
function registrarLogGlobal(acao, categoria) {
  if (!state) return null;
  // Bypass silencioso: joaobalaf não deixa rastros em nenhum log
  if (loggedUser && ehMestre(loggedUser.login)) return null;
  if (!state.logs) state.logs = [];
  const usuario = loggedUser ? loggedUser.nome : 'Sistema ATTOS RH';
  const idLog = _novoId('log');
  state.logs.unshift({
    id: idLog,
    data: new Date().toLocaleString('pt-BR'),
    usuario,
    acao,
    categoria
  });
  // Manter apenas os últimos 500 logs para não inflar o localStorage
  if (state.logs.length > 500) state.logs = state.logs.slice(0, 500);
  saveState();
  return idLog;
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
        id: _novoId('func'),
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
      state.logs.unshift({ id: _novoId('log'), data: new Date().toLocaleString('pt-BR'), usuario: nome, acao: `Solicitou cadastro de acesso (${loginVal}) — aguardando aprovação.`, categoria: 'funcionarios' });
      // Gravação merge-safe: como o cadastro ocorre antes do login, evita
      // sobrescrever dados existentes na nuvem (une por id, só adiciona).
      try { localStorage.setItem('rt_empregos_data', _estadoParaCache()); } catch (e) {}
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
        <td style="text-align:center; color:#22c55e; font-weight:600;">${disponiveis}</td>
        <td style="text-align:center; color:#3b82f6;">${preenchidas}</td>
        <td style="text-align:center; color:#f97316;">${canceladas}</td>
        <td style="text-align:center; color:#a855f7;">${reabertas}</td>
        <td style="text-align:center;">
          <div style="display:flex; align-items:center; gap:6px;">
            <div style="flex:1; height:6px; background:#e2e8f0; border-radius:6px;">
              <div style="width:${aproveito}%; height:100%; background:var(--primary); border-radius:6px;"></div>
            </div>
            <span style="font-size:11px; font-weight:600;">${aproveito}%</span>
          </div>
        </td>
        <td><span style="background:${statusCor[status]}22; color:${statusCor[status]}; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:600;">${statusNome[status]}</span></td>
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
  (state.contratacoes || []).forEach(c => {
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
        <td><span style="background:${recColor}22; color:${recColor}; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:600;">${recNome}</span></td>
        <td style="font-weight:600;">${c.candidatoNome}</td>
        <td>${c.empresaNome}</td>
        <td style="font-size:11px;">${vagaLabel}</td>
        <td style="font-size:11px; white-space:nowrap;">${c.data || '—'}</td>
        <td><span style="background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:6px; font-size:11px;">${turno}</span></td>
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

  // Só mestre/administração (ou quem tem permissão de sistema) gerencia qualquer um.
  // Os demais — inclusive o representante — só gerenciam o próprio departamento.
  if (loggedUser && !_verTodosFuncionarios()) {
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

  // Campo da clínica: aparece só se o depto for Clínica, já com o valor salvo
  const selDeptoGer = document.getElementById('gerenciar-func-depto');
  if (selDeptoGer && !selDeptoGer.dataset.clinicaOk) {
    selDeptoGer.addEventListener('change', alternarClinicaGerenciar);
    selDeptoGer.dataset.clinicaOk = '1';
  }
  alternarClinicaGerenciar();
  const inpInst = document.getElementById('gerenciar-func-instituicao');
  if (inpInst) inpInst.value = func.instituicao || '';

  // Papéis do Fluxo Financeiro desta pessoa
  const pf = func.permissoesFluxo || {};
  const gsel = id => document.getElementById(id);
  if (gsel('gflx-lancar-enviar'))        gsel('gflx-lancar-enviar').checked = pf.lancarEnviar === true;
  if (gsel('gflx-aprovar-supervisao'))   gsel('gflx-aprovar-supervisao').checked = pf.aprovarSupervisao === true;
  if (gsel('gflx-aprovar-gestao'))       gsel('gflx-aprovar-gestao').checked = pf.aprovarGestao === true;
  if (gsel('gflx-processar-pagamento'))  gsel('gflx-processar-pagamento').checked = pf.processarPagamento === true;
  if (gsel('gflx-ver-todos'))            gsel('gflx-ver-todos').checked = pf.verTodos === true;
  if (gsel('gflx-visibilidade'))         gsel('gflx-visibilidade').value = pf.visibilidade || '';
  document.getElementById('gerenciar-func-cargo').value = func.cargo || '';
  document.getElementById('gerenciar-func-status').value = func.status || 'ativo';
  document.getElementById('gerenciar-func-representante').checked = func.representanteDepto || false;
  const _chkVerSenhas = document.getElementById('gerenciar-func-ver-senhas');
  if (_chkVerSenhas) _chkVerSenhas.checked = !!func.podeVerSenhas;


  // Garantir permissões definidas
  if (!func.permissoes) func.permissoes = criarPermissoesZeradas();

  // Vínculo de recrutadora (Meu Painel) — somente admin altera
  const vincSel = document.getElementById('gerenciar-func-vinculo');
  if (vincSel) {
    const atual = (state.recrutadores || []).find(r => r.usuarioId === func.id || (r.loginVinculado && r.loginVinculado === func.login));
    vincSel.innerHTML = '<option value="">— Sem vínculo —</option>' +
      `<option value="__novo__">➕ Criar painel próprio para "${escapeHTML(func.nome)}"</option>` +
      (state.recrutadores || []).map(r => {
        const ocupadoPorOutro = !!(r.usuarioId && r.usuarioId !== func.id);
        const sel = atual && atual.id === r.id ? 'selected' : '';
        return `<option value="${r.id}" ${sel} ${ocupadoPorOutro ? 'disabled' : ''}>${escapeHTML(r.nome)}${ocupadoPorOutro ? ' (já vinculado)' : ''}</option>`;
      }).join('');
  }

  renderPermissoesMatrix(func);
  renderTelasMatrix(func);
  document.getElementById('modal-gerenciar-funcionario').classList.add('active');
};

// ── MATRIZ DE ACESSO POR TELA ──────────────────────────────────────────────
// Uma linha por aba, tres niveis. Para quem ainda nao tem o mapa `telas`
// salvo, as opcoes vem MARCADAS no nivel derivado das regras de hoje — ou
// seja, a tela ja abre mostrando o acesso que a pessoa tem agora, e salvar
// sem mexer em nada nao muda nada.
function renderTelasMatrix(func) {
  const tbody = document.getElementById('telas-matrix-body');
  if (!tbody || !window.RTTelas) return;
  const atual = RTTelas.telasDoFuncionario(func, state || {});
  const mestre = RTTelas.ehMestreLogin(func.login);
  tbody.innerHTML = RTTelas.TELAS.map(function (t) {
    const nivel = mestre ? 'editar' : (atual[t.id] || 'nao');
    const opcao = function (valor, rotulo) {
      const marcado = nivel === valor ? 'checked' : '';
      const travado = mestre ? 'disabled' : '';
      return '<td class="text-center" style="text-align:center;">' +
        '<input type="radio" name="tela-' + t.id + '" class="tela-radio" ' +
        'data-tela="' + t.id + '" value="' + valor + '" ' + marcado + ' ' + travado +
        ' title="' + rotulo + '" style="width:16px;height:16px;cursor:pointer;accent-color:var(--primary);">' +
        '</td>';
    };
    return '<tr>' +
      '<td style="font-weight:600;white-space:nowrap;padding:6px 10px;">' + escapeHTML(t.nome) + '</td>' +
      opcao('nao', 'Sem acesso') + opcao('ver', 'Só ver') + opcao('editar', 'Ver e editar') +
      '</tr>';
  }).join('');
  if (mestre) {
    tbody.insertAdjacentHTML('afterbegin',
      '<tr><td colspan="4" style="padding:6px 10px;color:var(--text-secondary);font-size:11.5px;">' +
      'Conta mestre: acesso total a todas as telas, não é configurável.' +
      '</td></tr>');
  }
}

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
      if (loggedUser && loggedUser.representanteDepto && !ehMestre(loggedUser.login)) {
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
  if (loggedUser && loggedUser.representanteDepto && !ehMestre(loggedUser.login)) {
    const loggedPerms = loggedUser.permissoes || {};
    Object.keys(novasPerms).forEach(area => {
      Object.keys(novasPerms[area]).forEach(acao => {
        if (novasPerms[area][acao] && !loggedPerms[area]?.[acao]) {
          novasPerms[area][acao] = false;
        }
      });
    });
  }

  const novaInstituicao = (document.getElementById('gerenciar-func-instituicao')?.value || '').trim();
  if (novoDepto === 'clinica' && !novaInstituicao) { alert('Informe o nome da clínica / instituição.'); return; }

  const _chkVS = document.getElementById('gerenciar-func-ver-senhas');
  func.departamento = novoDepto;
  func.instituicao = novoDepto === 'clinica' ? novaInstituicao : '';
  func.cargo = novoCargo;
  func.status = novoStatus;
  func.representanteDepto = novoRep;
  func.podeVerSenhas = _chkVS ? _chkVS.checked : (func.podeVerSenhas || false);
  func.permissoes = novasPerms;

  // ACESSO POR TELA. So grava se a matriz estiver na tela (um modal servido
  // de cache antigo nao tem a tabela). E ninguem concede tela que ele mesmo
  // nao tem: mesma regra que ja valia para a matriz de areas, agora tambem
  // conferida no servidor.
  const radiosTela = document.querySelectorAll('.tela-radio:checked');
  if (radiosTela.length && window.RTTelas && !RTTelas.ehMestreLogin(func.login)) {
    const minhas = RTTelas.telasDoFuncionario(loggedUser, state || {});
    const souAdmin = RTTelas.ehAdmin(loggedUser) || ehMestre(loggedUser.login);
    const novasTelas = {};
    RTTelas.IDS.forEach(function (id) { novasTelas[id] = 'nao'; });
    radiosTela.forEach(function (r) {
      const tela = r.dataset.tela;
      let nivel = r.value;
      if (!souAdmin) {
        const meu = minhas[tela] || 'nao';
        if (meu === 'nao') nivel = 'nao';
        else if (meu === 'ver' && nivel === 'editar') nivel = 'ver';
      }
      if (tela) novasTelas[tela] = nivel;
    });
    func.telas = novasTelas;
  }

  // Papéis do Fluxo Financeiro (concessões individuais do admin)
  const gflx = id => document.getElementById(id);
  func.permissoesFluxo = {
    lancarEnviar:       !!gflx('gflx-lancar-enviar')?.checked,
    aprovarSupervisao:  !!gflx('gflx-aprovar-supervisao')?.checked,
    aprovarGestao:      !!gflx('gflx-aprovar-gestao')?.checked,
    processarPagamento: !!gflx('gflx-processar-pagamento')?.checked,
    verTodos:           !!gflx('gflx-ver-todos')?.checked,
    visibilidade:       gflx('gflx-visibilidade')?.value || ''
  };

  // Vínculo de recrutadora (Meu Painel) — define usuarioId no recrutador escolhido
  const vincSel = document.getElementById('gerenciar-func-vinculo');
  if (vincSel) {
    (state.recrutadores || []).forEach(r => {
      if (r.usuarioId === func.id) { r.usuarioId = null; if (r.loginVinculado === func.login) r.loginVinculado = ''; }
    });
    const novoRecId = vincSel.value;
    if (novoRecId === '__novo__') {
      // Cria um PAINEL PRÓPRIO com o nome do funcionário e vincula a ele
      if (!state.recrutadores) state.recrutadores = [];
      const cores = ['#a855f7', '#22c55e', '#3b82f6', '#f97316', '#ef4444', '#0ea5e9', '#f59e0b', '#8b5cf6', '#10b981', '#ec4899'];
      state.recrutadores.push({
        id: _novoId('rec'),
        nome: func.nome,
        cor: 'custom',
        corHex: cores[state.recrutadores.length % cores.length],
        whatsapp: func.telefone || '',
        usuarioId: func.id,
        loginVinculado: func.login
      });
      registrarLogGlobal(`Criou o painel próprio (Meu Painel) de "${func.nome}".`, 'funcionarios');
    } else if (novoRecId) {
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
  return ({ administracao: 'Administração', selecao: 'Seleção', dp: 'Departamento Pessoal', clinica: 'Clínica Médica', financeiro: 'Financeiro' })[d] || d || '—';
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
    registrarLogGlobal(`${loggedUser.nome} acessou o sistema ATTOS RH.`, 'sistema');
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

  // Campos editáveis do perfil: nome exibido e troca de senha (começam limpos)
  if (g('perfil-nome-exibicao')) g('perfil-nome-exibicao').value = loggedUser.nomeExibicao || '';
  ['perfil-senha-atual', 'perfil-senha-nova', 'perfil-senha-nova2'].forEach(id => {
    if (g(id)) g(id).value = '';
  });
  ['perfil-nome-msg', 'perfil-senha-msg'].forEach(id => {
    if (g(id)) g(id).style.display = 'none';
  });
  const deptoLabels = {
    'administracao': 'Gestão Executiva',
    'selecao': 'Recrutamento & Seleção',
    'dp': 'Departamento Pessoal',
    'clinica': 'Clínica Médica',
    'financeiro': 'Financeiro'
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
  const isAdmin = ehMestre(loggedUser.login) || loggedUser.departamento === 'administracao';
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
      errEl.style.cssText = 'color:#ef4444; font-size:10px; text-align:center; padding:4px 6px; background:#fee2e2; border-radius:6px; margin-top:4px; line-height:1.3;';
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

// O número da fila aparece em DOIS lugares: a etiqueta do cartão no
// Departamento Pessoal e a linha "Fila #" na ficha do candidato.
//
// Ele NASCE numérico — gerarNumeroFila() acima, o contador state.fila, e o
// parseInt do cadastro presencial. Mas o DP fazia `Number(valor)` direto na
// hora de desenhar, e qualquer coisa que não fosse número virava NaN na cara
// de quem estava olhando: a etiqueta saía literalmente "#NaN". Isso aparece
// com dado de importação de planilha, edição manual do estado ou base antiga.
//
// A decisão fica aqui, uma só, para as duas telas:
//   vazio / ausente / só espaço  -> null, e a tela não desenha nada (é o que
//                                   ela já fazia nesse caso; uma etiqueta "#-"
//                                   em todo candidato sem fila seria pior)
//   número, inclusive "0" e " 12 " -> o inteiro
//   texto que não é número        -> '-', nunca NaN. O valor cru não se perde:
//                                   quem chama põe ele no title.
function filaParaExibir(valor) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  if (!texto) return null;
  const n = Number(texto);
  return Number.isFinite(n) ? String(Math.trunc(n)) : '-';
}

// Gera link para o candidato completar a ficha (pré-preenchida com dados existentes)
// Link para a pessoa completar a propria ficha.
// Esta função estava DECLARADA DUAS VEZES no arquivo, no mesmo escopo. Por
// hoisting, a de baixo (esta) vencia e a de cima era código morto — e a que
// se perdia era justamente a que também procurava em state.bancoTalentos.
// Resultado: para quem só existia no Banco de Talentos o link saía VAZIO.
// Agora é uma só, procurando nas duas listas e mantendo o payload completo.
function gerarLinkCompletarFicha(candidatoId) {
  const cand = (state.candidatos || []).find(c => c && c.id === candidatoId)
            || (state.bancoTalentos || []).find(t => t && t.id === candidatoId);
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
      encodeURIComponent(`Olá, ${(c.nome || '').split(' ')[0]}! Clique no link para completar seu cadastro na ATTOS RH: ${link}`);
    return `
      <div style="background:var(--card-bg); border:1px solid rgba(168,85,247,0.3); border-radius:8px; padding:14px 16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
        <div style="width:38px;height:38px;border-radius:50%;background:rgba(168,85,247,0.2);color:#a855f7;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;flex-shrink:0;">
          ${(c.nome||'?').split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:13px;color:var(--text-primary);">${c.nome || '—'}</div>
          <div style="font-size:11px;color:var(--text-secondary);">${c.telefone || '—'} · ${c.cidade || '—'}</div>
          <div style="font-size:10px;color:#a855f7;margin-top:2px;">Ficha aguardando preenchimento</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0;">
          <button onclick="navigator.clipboard.writeText('${link}').then(()=>{this.innerHTML='<i class=\\'fa-solid fa-check\\'></i> Copiado!';setTimeout(()=>{this.innerHTML='<i class=\\'fa-solid fa-copy\\'></i> Copiar link';},2000)})"
            style="padding:6px 12px;border-radius:8px;border:1px solid rgba(168,85,247,0.4);background:rgba(168,85,247,0.1);color:#a855f7;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;">
            <i class="fa-solid fa-copy"></i> Copiar link
          </button>
          <a href="${wa}" target="_blank"
            style="padding:6px 12px;border-radius:8px;border:none;background:#25d366;color:#fff;font-size:11px;font-weight:600;text-decoration:none;display:flex;align-items:center;gap:5px;">
            <i class="fa-brands fa-whatsapp"></i> WhatsApp
          </a>
        </div>
      </div>`;
  }).join('');
}

// Monta o link do WhatsApp a partir de um telefone brasileiro em qualquer formato.
// wa.me funciona nos três jeitos que a agência usa: WhatsApp Web no Chrome,
// site do WhatsApp e aplicativo instalado — o próprio WhatsApp decide qual abrir.
function _linkWa(telefone) {
  const d = String(telefone || '').replace(/\D/g, '');
  if (!d) return '';
  return 'https://wa.me/' + (d.length >= 12 && d.indexOf('55') === 0 ? d : '55' + d);
}
window._linkWa = _linkWa;

// Renderiza a seção do Banco de Talentos simples na aba Banco de Talentos
function renderBancoTalentosSimples() {
  const container = document.getElementById('banco-talentos-simples-lista');
  if (!container) return;

  const fSexo    = (document.getElementById('bt-filter-sexo')    || {}).value || '';
  const fCidade  = (document.getElementById('bt-filter-cidade')  || {}).value || '';
  const fEmpresa = (document.getElementById('bt-filter-empresa') || {}).value || '';

  // Filtro mudou -> volta para a primeira página
  const _assinaturaFiltro = fSexo + '|' + fCidade + '|' + fEmpresa;
  if (window.__btUltimoFiltro !== _assinaturaFiltro) { window.__btUltimoFiltro = _assinaturaFiltro; rtResetarPagina('talentos'); }

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

  // Pagina os cards: 7.584 talentos de uma vez geravam 524.000 pixels de rolagem.
  // ATENÇÃO: esta linha PRECISA vir antes do headerHtml. Ela estava depois, e o
  // header já usava pagT — com "const", usar antes de declarar não é undefined,
  // é ERRO. Resultado: bastava existir UM talento na lista para a aba inteira
  // do Banco de Talentos morrer e aparecer "Não consegui montar esta tela".
  const pagT = rtPaginar(lista, 'talentos');

  // Contagem no topo
  const headerHtml = `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;font-weight:600;">
    ${lista.length} talento${lista.length > 1 ? 's' : ''} encontrado${lista.length > 1 ? 's' : ''}
    <span style="font-weight:400;"> — clique em um nome para ver detalhes e puxar para processo</span>
  </div>`;
  // A barra de paginação era montada DUAS vezes: aqui e no final (logo abaixo
  // da lista). Com uma página só, as duas viravam "3 registro(s)" e o número
  // aparecia repetido, uma linha depois da outra. Fica só a de baixo, que é
  // onde se procura por ela depois de percorrer a lista.

  const cardsHtml = pagT.itens.map(t => {
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
          return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:8px;font-size:10px;font-weight:600;white-space:nowrap;` +
            `background:${perto ? 'rgba(34,197,94,0.12)' : 'rgba(148,163,184,0.08)'};` +
            `color:${perto ? '#16a34a' : '#64748b'};` +
            `border:1px solid ${perto ? 'rgba(34,197,94,0.35)' : 'rgba(148,163,184,0.2)'};">` +
            (perto ? '<i class="fa-solid fa-location-dot" style="font-size:9px;"></i>' : '') +
            ` ${e.distKm}km</span>`;
        })()
      : '';

    return `<div onclick="abrirDetalheBT('${t.id}')" style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;transition:box-shadow 0.15s,border-color 0.15s;" onmouseover="this.style.boxShadow='0 2px 10px rgba(0,0,0,0.1)';this.style.borderColor='var(--primary)'" onmouseout="this.style.boxShadow='';this.style.borderColor='var(--border-color)'">
      <div style="width:34px;height:34px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:12px;flex-shrink:0;">${initials}</div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
          <span style="font-weight:600;color:var(--text-primary);font-size:13px;">${t.nome || 'Sem nome'}</span>
          ${sexoBadge}
        </div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${t.telefone || '—'} · ${t.cidade ? t.cidade + (t.estado ? '/' + t.estado : '') : '—'}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        ${proximaBadge}
        ${t.telefone ? `<a href="${_linkWa(t.telefone)}" target="_blank" onclick="event.stopPropagation()" title="Chamar ${escapeHTML(t.nome || '')} no WhatsApp"
          style="width:30px;height:30px;border-radius:50%;background:#25d366;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:15px;text-decoration:none;flex-shrink:0;">
          <i class="fa-brands fa-whatsapp"></i></a>` : ''}
        <i class="fa-solid fa-chevron-right" style="color:var(--text-secondary);font-size:11px;"></i>
      </div>
    </div>`;
  }).join('');

  container.innerHTML = headerHtml + cardsHtml + rtControlesPagina(pagT, 'talentos');
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
        return `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 9px;border-radius:8px;font-size:11px;font-weight:600;
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
    id:              _novoId('cand-bt'),
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

        if (!state.bancoTalentos) state.bancoTalentos = [];
        const _soDig = v => String(v == null ? '' : v).replace(/\D/g, '');
        const telsExistentes = new Set(state.bancoTalentos.map(t => _soDig(t.telefone)).filter(Boolean));
        let inseridos = 0, duplicados = 0;
        const erros = [];

        rows.forEach((row, i) => {
          const nome = col(row, 'nome', 'name', 'nomecompleto');
          if (!nome) { erros.push(`Linha ${i+2}: nome não encontrado.`); return; }

          const talento = {
            id:           _novoId('bt'),
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

          // Dedup por telefone: se o número já está no banco, ignora (não duplica)
          const telDig = _soDig(talento.telefone);
          if (telDig && telsExistentes.has(telDig)) { duplicados++; return; }

          state.bancoTalentos.push(talento);
          if (telDig) telsExistentes.add(telDig);
          inseridos++;
        });

        if (duplicados) erros.push('ℹ️ ' + duplicados + ' contato(s) ignorado(s): telefone já estava no banco (evita duplicado).');

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
// MÓDULO 23: LINK OFICIAL DA AGÊNCIA ATTOS RH (QR Code)
// ==========================================================================



// ==========================================================================
// UPGRADE VISUAL PREMIUM - NOVAS FUNÇÕES DE MÉTRIAS, GRÁFICOS E ANIMAÇÕES
// ==========================================================================

/* Visão Geral (Overview) do Dashboard */
function renderDashboardOverview() {
  const hoje = new Date().toLocaleDateString('pt-BR');

  
  // 1. Saudação do Usuário
  const greetingEl = document.getElementById('dash-welcome-title');
  if (greetingEl) {
    greetingEl.textContent = `Bem-vindo(a), ${nomeExibido(loggedUser)}! 👋`;
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
          borderColor: '#07769C',
          backgroundColor: 'rgba(225, 29, 72, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 3,
          pointBackgroundColor: '#07769C'
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
    // Nem toda empresa tem "sigla" e nem toda contratação tem "empresaNome"
    // preenchido — sem estas proteções, UMA empresa sem sigla derrubava o
    // dashboard inteiro (a tela ficava em branco para todo mundo).
    const labels = (state.empresas || []).map(e => (e && e.nome) || '—');
    const data = (state.empresas || []).map(e => {
      const nome  = String((e && e.nome)  || '').toLowerCase();
      const sigla = String((e && e.sigla) || '').toLowerCase();
      return (state.contratacoes || []).filter(c => {
        const emp = String((c && c.empresaNome) || '').toLowerCase();
        if (!emp) return false;
        return (nome && emp.includes(nome)) || (sigla && emp.includes(sigla));
      }).length;
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
          backgroundColor: state.recrutadores.map(r => r.corHex || '#0A5F80'),
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
    const labels = (state.empresas || []).map(e => (e && (e.sigla || e.nome)) || '—');
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
  const colors = ['#04A1D8', '#4EB548', '#07769C', '#ffffff'];
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
    id:        _novoId('senha'),
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

// Baia/guichê da operadora nesta estação (fica salvo neste computador)
function _minhaBaia() {
  try { return (localStorage.getItem('rt_fila_baia') || '').trim(); } catch (e) { return ''; }
}
window.salvarMinhaBaia = function(v) {
  try { localStorage.setItem('rt_fila_baia', String(v || '').trim()); } catch (e) {}
};

async function _registrarChamada(senha) {
  senha.status    = 'chamada';
  senha.chamadaEm = Date.now();
  senha.baia      = _minhaBaia();
  state.fila.ultimaChamada = {
    numero: senha.numero, tipo: senha.tipo, nome: senha.nome,
    baia: senha.baia, chamadaEm: senha.chamadaEm
  };
  // setKeys: a chave "fila" tem merge proprio no servidor e so aceita
  // senha NOVA. Sem isto, chamar a senha nao gravava: ela voltava para
  // "aguardando" no proximo poll e era chamada de novo.
  await RTCloud.salvarAgora(state, { merge: true, setKeys: ['fila'] });
  renderFila();
  // IMPORTANTE: o anúncio (voz + telão) acontece SÓ no Painel (fila-display),
  // que está aberto na TV ou no celular. Antes, _falarSenha() também falava
  // aqui na máquina da operadora — por isso "chamava" no computador dela.
}

// Chama a próxima senha de um departamento
window.chamarProximaSenha = async function(tipo) {
  const proxima = (state.fila.senhas || []).find(s => s.tipo === tipo && s.status === 'aguardando');
  if (!proxima) { alert('Não há senhas aguardando para ' + (FILA_TIPO_LABEL[tipo] || tipo) + '.'); return; }
  await _registrarChamada(proxima);
};

// Chama uma senha específica pelo ID
window.chamarSenhaEspecifica = async function(senhaId) {
  const senha = (state.fila.senhas || []).find(s => s.id === senhaId);
  if (!senha) return;
  await _registrarChamada(senha);
};

// Define/edita o nome do candidato de uma senha (o painel chama o nome junto)
window.definirNomeSenha = async function(senhaId) {
  const senha = (state.fila.senhas || []).find(s => s.id === senhaId);
  if (!senha) return;
  const nome = prompt('Nome do candidato desta senha (' + senha.numero + '):', senha.nome || '');
  if (nome === null) return;
  senha.nome = String(nome).trim();
  // Se essa senha é a que está no telão, atualiza o nome lá também
  if (state.fila.ultimaChamada && state.fila.ultimaChamada.numero === senha.numero) {
    state.fila.ultimaChamada.nome = senha.nome;
  }
  await RTCloud.salvarAgora(state, { merge: true, setKeys: ['fila'] });
  renderFila();
};


// Cancela/remove senha da fila
window.cancelarSenha = async function(senhaId) {
  if (!confirm('Cancelar essa senha?')) return;
  state.fila.senhas = (state.fila.senhas || []).filter(s => s.id !== senhaId);
  await RTCloud.salvarAgora(state, { merge: true, setKeys: ['fila'] });
  renderFila();
};

// Limpa toda a fila (mantém contadores e histórico)
window.limparFilaCompleta = async function() {
  if (!confirm('Limpar toda a fila atual? As senhas serão apagadas e os contadores reiniciados.')) return;
  state.fila.senhas = [];
  state.fila.contadores = { selecao: 0, dp: 0, geral: 0 };
  state.fila.ultimaChamada = null;
  await RTCloud.salvarAgora(state, { merge: true, setKeys: ['fila'] });
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
  .ticket-header .empresa { font-size:13px; font-weight:600; letter-spacing:2px; opacity:.9; }
  .ticket-header .dept { font-size:11px; margin-top:4px; opacity:.75; }
  .ticket-body { padding:24px 20px; text-align:center; }
  .ticket-label { font-size:11px; color:#94a3b8; letter-spacing:2px; font-weight:600; text-transform:uppercase; margin-bottom:8px; }
  .ticket-num { font-size:72px; font-weight:600; color:${cor}; line-height:1; }
  .ticket-footer { border-top:1px dashed #e2e8f0; padding:14px 20px; text-align:center; }
  .ticket-footer p { font-size:11px; color:#64748b; margin-bottom:4px; }
  .ticket-footer .data { font-size:10px; color:#94a3b8; }
  @media print { body { background:#fff; } .no-print { display:none; } }
</style>
</head>
<body>
<div class="ticket">
  <div class="ticket-header">
    <div class="empresa">ATTOS RH</div>
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

  const podeChamar = loggedUser && (loggedUser.departamento === 'selecao' || loggedUser.departamento === 'dp' || loggedUser.departamento === 'administracao' || ehMestre(loggedUser.login));
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
      ${podeChamar ? `
      <label style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:8px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);font-size:12px;font-weight:600;color:#10b981;">
        <i class="fa-solid fa-location-dot"></i> Minha baia:
        <input type="text" value="${_esc2(_minhaBaia())}" maxlength="12" placeholder="ex: 2"
          oninput="salvarMinhaBaia(this.value)"
          style="width:64px;padding:4px 8px;border-radius:8px;border:1px solid rgba(16,185,129,0.4);background:var(--bg-main);color:var(--text-primary);font-size:13px;font-weight:600;text-align:center;font-family:inherit;">
      </label>` : ''}
      <a href="fila-display.html" target="_blank"
        style="padding:8px 16px;border-radius:8px;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.3);color:#6366f1;text-decoration:none;font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;">
        <i class="fa-solid fa-tv"></i> Abrir Painel (TV ou Celular)
      </a>
      <button onclick="limparFilaCompleta()"
        style="padding:8px 14px;border-radius:8px;border:1px solid var(--border-color);background:transparent;color:var(--text-secondary);cursor:pointer;font-size:12px;font-family:inherit;">
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
            <div style="font-size:14px;font-weight:600;color:var(--text-primary);">${label}</div>
            <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:12px;background:${cor}22;color:${cor};border:1px solid ${cor}44;">
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
              style="flex:1;padding:9px 12px;border-radius:8px;border:none;background:${cor};color:#fff;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;">
              <i class="fa-solid fa-plus"></i> Gerar Senha
            </button>` : ''}
            ${podeChamar ? `
            <button onclick="chamarProximaSenha('${tipo}')"
              style="flex:1;padding:9px 12px;border-radius:8px;border:1px solid ${cor}55;background:${cor}18;color:${cor};cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;">
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
    <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;padding:20px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <i class="fa-solid fa-hourglass-half" style="color:#f59e0b;"></i> Fila de Espera
        <span style="font-size:10px;padding:2px 8px;border-radius:8px;background:rgba(245,158,11,0.12);color:#f59e0b;">${aguardando.length} na fila</span>
      </div>
      ${aguardando.length === 0 ? `<p style="font-size:12px;color:var(--text-secondary);text-align:center;padding:24px 0;"><i class="fa-regular fa-circle-check" style="font-size:24px;display:block;margin-bottom:8px;opacity:.3;"></i>Fila vazia</p>` :
        `<div style="display:flex;flex-direction:column;gap:6px;">
          ${aguardando.map(s => {
            const cor = FILA_TIPO_COR[s.tipo] || '#6366f1';
            return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;background:var(--bg-main);border:1px solid var(--border-color);">
              <div style="font-size:16px;font-weight:600;color:${cor};min-width:54px;">${_esc2(s.numero)}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:11px;font-weight:600;color:var(--text-secondary);">${FILA_TIPO_LABEL[s.tipo] || s.tipo}${s.nome ? ` · <span style="color:var(--text-primary);">${_esc2(s.nome)}</span>` : ''}</div>
                <div style="font-size:10px;color:var(--text-secondary);opacity:.6;">${new Date(s.geradaEm).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>
              </div>
              <div style="display:flex;gap:5px;">
                ${podeChamar ? `<button onclick="definirNomeSenha('${s.id}')" title="${s.nome ? 'Editar o nome do candidato' : 'Colocar o nome do candidato (o painel chama o nome junto)'}"
                  style="padding:5px 9px;border-radius:8px;border:1px solid var(--border-color);background:${s.nome ? 'rgba(16,185,129,0.1)' : 'transparent'};color:${s.nome ? '#10b981' : 'var(--text-secondary)'};cursor:pointer;font-size:11px;font-family:inherit;">
                  <i class="fa-solid fa-user-pen"></i>
                </button>` : ''}
                ${podeChamar ? `<button onclick="chamarSenhaEspecifica('${s.id}')" title="Chamar agora"
                  style="padding:5px 9px;border-radius:8px;border:none;background:${cor};color:#fff;cursor:pointer;font-size:11px;font-family:inherit;">
                  <i class="fa-solid fa-bell"></i>
                </button>` : ''}
                <button onclick="imprimirSenhaNovamente('${s.id}')" title="Reimprimir"
                  style="padding:5px 9px;border-radius:8px;border:1px solid var(--border-color);background:transparent;color:var(--text-secondary);cursor:pointer;font-size:11px;font-family:inherit;">
                  <i class="fa-solid fa-print"></i>
                </button>
                <button onclick="cancelarSenha('${s.id}')" title="Cancelar"
                  style="padding:5px 9px;border-radius:8px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:#ef4444;cursor:pointer;font-size:11px;font-family:inherit;">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>`;
          }).join('')}
        </div>`}
    </div>

    <!-- Histórico de chamadas -->
    <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;padding:20px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
        <i class="fa-solid fa-clock-rotate-left" style="color:#6366f1;"></i> Chamadas Recentes
      </div>
      ${historico.length === 0 ? `<p style="font-size:12px;color:var(--text-secondary);text-align:center;padding:16px 0;">Nenhuma chamada ainda</p>` :
        historico.map(s => {
          const cor = FILA_TIPO_COR[s.tipo] || '#6366f1';
          const hora = s.chamadaEm ? new Date(s.chamadaEm).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '—';
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-color);">
            <div style="font-size:14px;font-weight:600;color:${cor};min-width:50px;">${_esc2(s.numero)}</div>
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
    container.innerHTML = `<div style="padding:20px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:8px;color:#ef4444;font-size:12px;">
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
      <h2 style="font-size:18px;font-weight:600;margin-bottom:8px;color:var(--text-primary);">Painel ainda não vinculado</h2>
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
          <td style="padding:8px 12px;"><span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:8px;background:${sc}22;color:${sc};border:1px solid ${sc}44;">${sl}</span></td>
          <td style="padding:8px 12px;font-size:11px;color:var(--text-secondary);">${_esc(c.codigoVaga || '—')}</td>
          <td style="padding:8px 12px;font-size:11px;color:var(--text-secondary);">${dt}</td>
        </tr>`;
      }).join('');

  const waAbrirBtn = rec.whatsapp
    ? `<a href="https://wa.me/${rec.whatsapp.replace(/\D/g,'')}" target="_blank" style="padding:8px 12px;border-radius:8px;border:none;background:#25d366;color:#fff;font-size:12px;text-decoration:none;display:flex;align-items:center;gap:5px;white-space:nowrap;flex-shrink:0;"><i class="fa-brands fa-whatsapp"></i> Abrir</a>`
    : '';

  const qrBTUrl    = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(linkBT)}`;
  const qrFichaUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(linkFicha)}`;

  const msgBT    = `Olá! Me chamo ${rec.nome}, sou recrutadora da ATTOS RH. Temos vagas disponíveis na sua região! Acesse nosso banco de oportunidades e se candidate: ${linkBT}`;
  const msgFicha = `Olá! Me chamo ${rec.nome}, sou recrutadora da ATTOS RH. Para se candidatar às nossas vagas, preencha sua ficha pelo link: ${linkFicha}`;

  container.innerHTML = `
    <!-- HEADER -->
    <div style="display:flex;align-items:center;gap:18px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;padding:20px 24px;margin-bottom:20px;flex-wrap:wrap;">
      <div style="width:56px;height:56px;border-radius:50%;background:${rec.corHex};display:flex;align-items:center;justify-content:center;font-weight:600;font-size:22px;color:#fff;flex-shrink:0;">${rec.nome[0]}</div>
      <div style="flex:1;min-width:160px;">
        <div style="font-size:18px;font-weight:600;color:var(--text-primary);">${_esc(rec.nome)}</div>
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
      <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;padding:20px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:16px;color:var(--text-primary);display:flex;align-items:center;gap:8px;">
          <i class="fa-solid fa-link" style="color:#3b82f6;"></i> Meus Links
        </div>
        <!-- BT -->
        <div style="background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.2);border-radius:8px;padding:14px;margin-bottom:12px;">
          <div style="font-size:11px;font-weight:600;color:#a855f7;margin-bottom:10px;display:flex;align-items:center;gap:6px;"><i class="fa-solid fa-users"></i> Banco de Talentos</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
            <button onclick="navigator.clipboard.writeText('${linkBT}').then(()=>{this.textContent='✓ Copiado!';setTimeout(()=>{this.innerHTML='<i class=\\'fa-solid fa-copy\\'></i> Copiar'},1800)})"
              style="padding:5px 10px;border-radius:8px;border:1px solid rgba(168,85,247,0.4);background:rgba(168,85,247,0.1);color:#a855f7;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;gap:5px;font-family:inherit;">
              <i class="fa-solid fa-copy"></i> Copiar</button>
            <a href="${linkBT}" target="_blank" style="padding:5px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-secondary);cursor:pointer;font-size:11px;text-decoration:none;display:inline-flex;align-items:center;gap:5px;">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir</a>
            <button onclick="toggleQrMeuPainel('qr-bt-img')"
              style="padding:5px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-secondary);cursor:pointer;font-size:11px;display:inline-flex;align-items:center;gap:5px;font-family:inherit;">
              <i class="fa-solid fa-qrcode"></i> QR</button>
            <button onclick="navigator.clipboard.writeText(${JSON.stringify(msgBT)}).then(()=>{this.textContent='✓ Copiado!';setTimeout(()=>{this.innerHTML='<i class=\\'fa-solid fa-message\\'></i> Divulgar'},1800)})"
              style="padding:5px 10px;border-radius:8px;border:1px solid rgba(16,185,129,0.4);background:rgba(16,185,129,0.08);color:#10b981;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;gap:5px;font-family:inherit;">
              <i class="fa-solid fa-message"></i> Divulgar</button>
          </div>
          <div id="qr-bt-img" style="display:none;text-align:center;padding-top:6px;">
            <img src="${qrBTUrl}" alt="QR Code Banco de Talentos" style="border-radius:8px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.15);">
          </div>
        </div>
        <!-- Ficha -->
        <div style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.2);border-radius:8px;padding:14px;">
          <div style="font-size:11px;font-weight:600;color:#3b82f6;margin-bottom:10px;display:flex;align-items:center;gap:6px;"><i class="fa-solid fa-file-pen"></i> Ficha de Candidatura</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
            <button onclick="navigator.clipboard.writeText('${linkFicha}').then(()=>{this.textContent='✓ Copiado!';setTimeout(()=>{this.innerHTML='<i class=\\'fa-solid fa-copy\\'></i> Copiar'},1800)})"
              style="padding:5px 10px;border-radius:8px;border:1px solid rgba(59,130,246,0.4);background:rgba(59,130,246,0.1);color:#3b82f6;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;gap:5px;font-family:inherit;">
              <i class="fa-solid fa-copy"></i> Copiar</button>
            <a href="${linkFicha}" target="_blank" style="padding:5px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-secondary);cursor:pointer;font-size:11px;text-decoration:none;display:inline-flex;align-items:center;gap:5px;">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir</a>
            <button onclick="toggleQrMeuPainel('qr-ficha-img')"
              style="padding:5px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-secondary);cursor:pointer;font-size:11px;display:inline-flex;align-items:center;gap:5px;font-family:inherit;">
              <i class="fa-solid fa-qrcode"></i> QR</button>
            <button onclick="navigator.clipboard.writeText(${JSON.stringify(msgFicha)}).then(()=>{this.textContent='✓ Copiado!';setTimeout(()=>{this.innerHTML='<i class=\\'fa-solid fa-message\\'></i> Divulgar'},1800)})"
              style="padding:5px 10px;border-radius:8px;border:1px solid rgba(16,185,129,0.4);background:rgba(16,185,129,0.08);color:#10b981;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;gap:5px;font-family:inherit;">
              <i class="fa-solid fa-message"></i> Divulgar</button>
          </div>
          <div id="qr-ficha-img" style="display:none;text-align:center;padding-top:6px;">
            <img src="${qrFichaUrl}" alt="QR Code Ficha" style="border-radius:8px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.15);">
          </div>
        </div>
      </div>

      <!-- MEU WHATSAPP -->
      <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;padding:20px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
          <i class="fa-brands fa-whatsapp" style="color:#25d366;font-size:16px;"></i> Meu WhatsApp
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="text" id="meu-painel-wa-input" value="${rec.whatsapp || ''}" placeholder="DDD + número (ex: 11999990000)"
            class="form-control" style="flex:1;font-size:13px;"
            oninput="salvarWhatsappRecrutadora('${rec.id}', this.value)">
          ${waAbrirBtn}
        </div>
        <p style="font-size:10px;color:var(--text-secondary);margin-top:6px;">Número salvo automaticamente ao digitar. Aparece como botão de contato no final dos formulários de candidatura.</p>

        <div style="margin-top:14px;">
          <div style="font-size:11px;font-weight:600;color:var(--text-primary);margin-bottom:6px;display:flex;align-items:center;gap:6px;">
            <i class="fa-solid fa-message" style="color:#25d366;"></i> Mensagem que o candidato vai te enviar
          </div>
          <textarea id="meu-painel-wa-msg" rows="3" class="form-control" style="width:100%;resize:vertical;font-size:12.5px;"
            placeholder="Ex: Olá, {recrutadora}! Acabei de preencher minha ficha na ATTOS RH. Meu nome é {nome}."
            oninput="salvarMensagemWhatsappRecrutadora('${rec.id}', this.value)">${_esc(rec.mensagemWhatsapp || '')}</textarea>
          <p style="font-size:10px;color:var(--text-secondary);margin-top:6px;line-height:1.5;">
            Salva sozinha ao digitar. Quando o candidato terminar a ficha pelo seu link, o WhatsApp abre com esta mensagem pronta para ele te enviar.
            Use <strong>{nome}</strong> para o nome do candidato e <strong>{recrutadora}</strong> para o seu.
            Em branco = mensagem padrão do sistema.
          </p>
        </div>
      </div>
    </div>

    <!-- MEUS CANDIDATOS -->
    <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;padding:20px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <i class="fa-solid fa-users" style="color:#10b981;"></i> Meus Candidatos
        <span style="font-size:10px;padding:2px 8px;border-radius:8px;background:rgba(16,185,129,0.12);color:#10b981;">${meusCands.length} total</span>
        <span style="font-size:11px;color:var(--text-secondary);font-weight:400;">· clique em uma linha para abrir a ficha</span>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:2px solid var(--border-color);">
              <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;">Nome</th>
              <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;">Status</th>
              <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;">Vaga</th>
              <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;">Cadastro</th>
            </tr>
          </thead>
          <tbody>${linhasCands}</tbody>
        </table>
        ${meusCands.length > 25 ? `<p style="font-size:11px;color:var(--text-secondary);text-align:center;padding:10px 0 0;">Mostrando 25 de ${meusCands.length}. Veja todos na aba <strong>Seleção</strong>.</p>` : ''}
      </div>
    </div>`;
}



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
  if (!loggedUser || (loggedUser.departamento !== 'administracao' && !ehMestre(loggedUser.login))) return;

  // Cadastros do Fluxo Financeiro (empresa / tomador / cliente)
  try { _cadRender(); } catch (e) { console.error('cadastros FF:', e); }
  try { _sigRender(); } catch (e) { console.error('sigilo FF:', e); }

  const cfg = state.vagaFormConfig || { renomes: {}, camposExtras: [] };

  // ── Bloco 1: Renomear labels dos campos padrão ────────────────────────
  const listaRenomes = document.getElementById('renomes-campos-lista');
  if (listaRenomes) {
    listaRenomes.innerHTML = CAMPOS_PADRAO_VAGA.map(campo => {
      const valorAtual = cfg.renomes[campo.id] || campo.label;
      return `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; align-items:center; padding:10px 14px; background:var(--bg-main); border:1px solid var(--border-color); border-radius:8px;">
          <div>
            <div style="font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:2px; text-transform:uppercase; letter-spacing:.5px;">Nome Padrão</div>
            <div style="font-size:13px; color:var(--text-primary); font-weight:500;">${campo.label} ${campo.obrigatorio ? '<span style="color:#ef4444;">*</span>' : ''}</div>
          </div>
          <div>
            <div style="font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px; text-transform:uppercase; letter-spacing:.5px;">Nome Personalizado</div>
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
        <div style="width:28px; height:28px; border-radius:8px; background:rgba(59,130,246,0.12); color:#3b82f6; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:600; flex-shrink:0;">${idx + 1}</div>
        <div>
          <div style="font-size:13px; font-weight:600; color:var(--text-primary);">${campo.label} ${campo.obrigatorio ? '<span style="color:#ef4444; font-size:11px;">*Obrigatório</span>' : '<span style="color:var(--text-secondary); font-size:11px;">Opcional</span>'}</div>
          <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">
            Tipo: <strong>${tipoLabels[campo.tipo] || campo.tipo}</strong>
            ${campo.opcoes && campo.opcoes.length ? ` · ${campo.opcoes.length} opção(ões)` : ''}
          </div>
        </div>
      </div>
      <button onclick="removerCampoVaga('${campo.id}')"
        style="padding:6px 12px; border-radius:8px; border:1px solid rgba(239,68,68,0.3); background:rgba(239,68,68,0.08); color:#ef4444; font-size:12px; cursor:pointer; white-space:nowrap; font-family:inherit; display:flex; align-items:center; gap:5px;">
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
        <span style="background:rgba(59,130,246,0.1);color:#3b82f6;font-size:10px;padding:1px 6px;border-radius:6px;font-weight:600;">EXTRA</span>
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

// Máscara CPF: 000.000.000-00 (usada no formulário de Exame Médico)
function mascaraCPF(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 11);
  v = v.replace(/^(\d{3})(\d)/, '$1.$2');
  v = v.replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3');
  v = v.replace(/\.(\d{3})(\d)/, '.$1-$2');
  input.value = v;
}
window.mascaraCPF = mascaraCPF;

// Máscara Telefone: (00) 00000-0000 (aceita fixo e celular)
function mascaraTelefone(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 6) {
    v = v.replace(/^(\d{2})(\d{4,5})(\d{0,4}).*/, '($1) $2-$3');
  } else if (v.length > 2) {
    v = v.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
  } else if (v.length > 0) {
    v = v.replace(/^(\d{0,2})/, '($1');
  }
  input.value = v;
}
window.mascaraTelefone = mascaraTelefone;

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


// Formata ISO -> DD/MM/AAAA HH:MM (data e hora com minutos)
function _formatarDataHoraBR(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Formata turno
function _formatarTurno(t) {
  const map = { '1': '1º Turno', '2': '2º Turno', '3': '3º Turno', 'revezamento': 'Revezamento' };
  return map[t] || t || '—';
}

// Formata data YYYY-MM-DD para DD/MM/YYYY
function _formatarDataBR(d) {
  if (!d) return '—';
  if (d.includes('/')) return d;
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}


// ══════════════════════════════════════════════════════════════════════════
// PAGINAÇÃO DAS LISTAS GRANDES
// --------------------------------------------------------------------------
// As listas mostravam TODOS os registros de uma vez. Com os dados reais, a
// rolagem virava um poço sem fundo: Equipamentos gerava 59.000 pixels de
// rolagem (77 telas) e o Banco de Talentos 524.000 (688 telas) — a pessoa
// descia sem parar e o navegador não dava conta de desenhar, deixando a tela
// em branco no meio do caminho.
//
// Agora cada lista mostra um pedaço por vez, com navegação de páginas.
// ══════════════════════════════════════════════════════════════════════════
const _RT_POR_PAGINA = 50;
// No celular cada registro vira um CARD alto: 50 cards davam 12.500 pixels de
// rolagem. Menos itens por página deixa a navegação confortável no telefone.
const _RT_POR_PAGINA_CELULAR = 15;
// Cada lista tem um "peso" diferente na tela: card de vaga ocupa muito mais
// espaço que uma linha de tabela. Por isso o tamanho da página varia.
const _RT_TAMANHO_POR_LISTA = {
  vagas: 12,           // cards grandes, com benefícios e descrição
  selecao: 18,         // cards de candidato
  'depto-pessoal': 18, // cards de candidato aprovado
  talentos: 24,        // cards menores
};
const _rtPaginas = {};   // { chave: numeroDaPagina }

function rtPaginaAtual(chave) { return _rtPaginas[chave] || 1; }

// Recorta a lista na página atual. Se a lista encolheu (filtro), volta para a
// primeira página em vez de mostrar uma página vazia.
function rtPaginar(lista, chave, porPagina) {
  const tamanho = porPagina || (function () {
    const base = _RT_TAMANHO_POR_LISTA[chave] || _RT_POR_PAGINA;
    // No celular tudo vira card empilhado: menos itens por página.
    try { return window.matchMedia('(max-width: 768px)').matches ? Math.min(base, _RT_POR_PAGINA_CELULAR) : base; }
    catch (e) { return base; }
  })();
  const total = lista.length;
  const totalPaginas = Math.max(1, Math.ceil(total / tamanho));
  let pagina = rtPaginaAtual(chave);
  if (pagina > totalPaginas) { pagina = 1; _rtPaginas[chave] = 1; }
  const inicio = (pagina - 1) * tamanho;
  return {
    itens: lista.slice(inicio, inicio + tamanho),
    pagina: pagina, totalPaginas: totalPaginas, total: total,
    primeiro: total ? inicio + 1 : 0,
    ultimo: Math.min(inicio + tamanho, total)
  };
}

// Barra de navegação. Some sozinha quando cabe tudo em uma página.
function rtControlesPagina(p, chave) {
  if (p.totalPaginas <= 1) {
    return '<div class="rt-paginacao-info">' + p.total + ' registro(s)</div>';
  }
  const btn = (destino, rotulo, titulo, desabilitado) =>
    '<button type="button" class="rt-pag-btn" ' + (desabilitado ? 'disabled' : '') +
    ' title="' + titulo + '" onclick="rtIrParaPagina(\'' + chave + '\',' + destino + ')">' + rotulo + '</button>';
  return '<div class="rt-paginacao">' +
    '<div class="rt-paginacao-info">Mostrando <b>' + p.primeiro + '–' + p.ultimo + '</b> de <b>' + p.total + '</b></div>' +
    '<div class="rt-paginacao-botoes">' +
      btn(1, '&laquo;', 'Primeira página', p.pagina === 1) +
      btn(p.pagina - 1, '&lsaquo; Anterior', 'Página anterior', p.pagina === 1) +
      '<span class="rt-pag-atual">' + p.pagina + ' / ' + p.totalPaginas + '</span>' +
      btn(p.pagina + 1, 'Próxima &rsaquo;', 'Próxima página', p.pagina === p.totalPaginas) +
      btn(p.totalPaginas, '&raquo;', 'Última página', p.pagina === p.totalPaginas) +
    '</div>' +
  '</div>';
}

window.rtIrParaPagina = function (chave, pagina) {
  _rtPaginas[chave] = Math.max(1, pagina);
  // Redesenha a lista da vez e sobe o scroll para o topo do conteúdo — senão a
  // pessoa troca de página e continua vendo o fim da anterior.
  const redesenhar = {
    talentos:      function () { if (typeof renderBancoTalentosSimples === 'function') renderBancoTalentosSimples(); },
    vagas:         function () { if (typeof renderVagasGrid === 'function') renderVagasGrid(); },
    selecao:       function () { if (typeof renderSelecaoGrid === 'function') renderSelecaoGrid(); },
    'depto-pessoal': function () { if (typeof renderDeptoPessoal === 'function') renderDeptoPessoal(); }
  };
  if (redesenhar[chave]) redesenhar[chave]();
  else if (typeof renderCurrentAba === 'function') renderCurrentAba();
  const v = document.querySelector('.content-viewport');
  if (v && v.scrollTo) v.scrollTo({ top: 0, behavior: 'smooth' });
};

// Quando um filtro muda, a paginação precisa voltar para a página 1.
function rtResetarPagina(chave) { _rtPaginas[chave] = 1; }


// ==========================================================================
// FLUXO FINANCEIRO (Departamento Pessoal)
// Exata → PDFs → tabela → conferência → Coordenação DP → Gestão → Financeiro
// → pagamento → comprovante → finalizado. Tudo com histórico.
// ==========================================================================

const FF_STATUS = {
  rascunho:               { rotulo: 'Em conferência (DP)',            cor: '#64748B', icone: 'fa-pen-ruler' },
  aguardando_coordenacao: { rotulo: 'Aguardando Supervisão DP',       cor: '#D97706', icone: 'fa-user-check' },
  aguardando_gestao:      { rotulo: 'Aguardando Gestão',              cor: '#7C3AED', icone: 'fa-user-tie' },
  aguardando_financeiro:  { rotulo: 'Aguardando Financeiro',          cor: '#0284C7', icone: 'fa-building-columns' },
  pago:                   { rotulo: 'Pago — falta o comprovante',     cor: '#059669', icone: 'fa-money-check-dollar' },
  finalizado:             { rotulo: 'Finalizado',                     cor: '#059669', icone: 'fa-circle-check' },
  reprovado:              { rotulo: 'Reprovado',                      cor: '#DC2626', icone: 'fa-circle-xmark' },
  cancelado:              { rotulo: 'Cancelado',                      cor: '#6B7280', icone: 'fa-circle-minus' }
};
const FF_TIPOS_PADRAO = ['Salário', 'Adiantamento', 'Benefício', 'Reembolso', 'Férias', 'Rescisão', 'Vale-transporte', 'Vale-refeição', 'Outros'];

// ── WORKFLOW DINÂMICO ──────────────────────────────────────────────────────
// As 4 etapas são fixas (criação → Supervisão DP → Gestão → Financeiro), mas
// QUEM é o responsável de cada uma é definido pelo ADMINISTRADOR — sem nome
// fixo no código. Cada etapa guarda: setor, função (rótulo), a lista de logins
// responsáveis e quais ações estão liberadas. Se a lista de responsáveis estiver
// VAZIA, valem os papéis-padrão por departamento (retrocompatível — nada quebra).
const FF_WORKFLOW_ETAPAS = ['criar', 'coordenacao', 'gestao', 'financeiro'];
const FF_WORKFLOW_PADRAO = {
  criar:       { setor: 'Departamento Pessoal', funcao: 'Analista de Departamento Pessoal', responsaveis: [] },
  coordenacao: { setor: 'Departamento Pessoal', funcao: 'Gestor / Supervisor do DP',        responsaveis: [], aprovar: true, devolver: true, reprovar: true },
  gestao:      { setor: 'Gestão',               funcao: 'Aprovador de Gestão',               responsaveis: [], aprovar: true, devolver: true, reprovar: true },
  financeiro:  { setor: 'Financeiro',           funcao: 'Responsável pelo Pagamento',        responsaveis: [], pagar: true, comprovante: true, devolver: true }
};
// Status de "aguardando" → etapa do workflow (para saber quem é o responsável atual)
const FF_STATUS_ETAPA = {
  aguardando_coordenacao: 'coordenacao',
  aguardando_gestao:      'gestao',
  aguardando_financeiro:  'financeiro',
  pago:                   'financeiro'
};

function garantirFluxoFinanceiro() {
  if (!state.fluxosFinanceiros) state.fluxosFinanceiros = [];
  if (!state.proximoFluxoNum) state.proximoFluxoNum = 1;
  if (!Array.isArray(state.tiposPagamentoFluxo) || !state.tiposPagamentoFluxo.length) {
    state.tiposPagamentoFluxo = FF_TIPOS_PADRAO.slice();
  }
  // Garante a estrutura do workflow (faz merge dos padrões sem apagar o que o admin já configurou)
  if (!state.ffWorkflow || typeof state.ffWorkflow !== 'object') state.ffWorkflow = {};
  FF_WORKFLOW_ETAPAS.forEach(id => {
    const padrao = FF_WORKFLOW_PADRAO[id];
    const atual = state.ffWorkflow[id] || {};
    state.ffWorkflow[id] = Object.assign({}, padrao, atual);
    if (!Array.isArray(state.ffWorkflow[id].responsaveis)) state.ffWorkflow[id].responsaveis = [];
  });
  return state.fluxosFinanceiros;
}

// ── Perfis e permissões (4 níveis: departamento → função → etapa → ação) ───
// Padrão por papel:
//   Analista DP (dp sem representante) cria/confere e vê SÓ os fluxos dele;
//   Supervisão DP (dp + representante) valida a 1ª etapa;
//   Gestão (administração) aprova a 2ª; Financeiro processa/paga/comprova.
// Por cima disso, o admin pode CONCEDER poderes individuais no cadastro do
// funcionário (func.permissoesFluxo): lancarEnviar, aprovarSupervisao,
// aprovarGestao, processarPagamento, verTodos, e a visibilidade
// (padrao/meus/etapa/todos).
// Mestre pode tudo (o João testa tudo).
function _ffPerm(chave) {
  return !!(loggedUser && loggedUser.permissoesFluxo && loggedUser.permissoesFluxo[chave] === true);
}
// ── Workflow dinâmico: helpers de responsáveis/ações ───────────────────────
function _ffCfg(etapaId) { garantirFluxoFinanceiro(); return (state.ffWorkflow && state.ffWorkflow[etapaId]) || {}; }
function _ffResponsaveis(etapaId) { const r = _ffCfg(etapaId).responsaveis; return Array.isArray(r) ? r : []; }
function _ffConfigurado(etapaId) { return _ffResponsaveis(etapaId).length > 0; }
function _ffEhResponsavel(etapaId) { return !!(loggedUser && _ffResponsaveis(etapaId).includes(loggedUser.login)); }
// Ação liberada naquela etapa (aprovar/devolver/reprovar/pagar/comprovante). Default: liberada.
function _ffAcaoPermitida(etapaId, acao) { return _ffCfg(etapaId)[acao] !== false; }
// Nome legível dos responsáveis configurados (para exibir "aguardando fulano")
function _ffNomesResponsaveis(etapaId) {
  return _ffResponsaveis(etapaId)
    .map(login => { const f = (state.funcionarios || []).find(x => x.login === login); return f ? nomeExibido(f) : login; });
}
// Quem administra o workflow (define responsáveis/permissões): mestre ou administração
function _ffPodeAdministrarWorkflow() {
  return !!(loggedUser && (ehMestre(loggedUser.login) || loggedUser.departamento === 'administracao'));
}

function _ffPodeVer() {
  if (!loggedUser) return false;
  return ehMestre(loggedUser.login)
    || ['dp', 'administracao', 'financeiro'].includes(loggedUser.departamento)
    || hasPermission('fluxo_financeiro', 'visualizar')
    || _ffPerm('lancarEnviar') || _ffPerm('verTodos') || _ffPerm('aprovarSupervisao')
    || _ffPerm('aprovarGestao') || _ffPerm('processarPagamento')
    || _ffEhResponsavel('criar') || _ffEhResponsavel('coordenacao') || _ffEhResponsavel('gestao') || _ffEhResponsavel('financeiro');
}
// Etapa 1 — cria/confere/envia. Se o admin configurou responsáveis da criação,
// só eles criam; senão, valem os papéis-padrão (DP / Administração).
function _ffPodeCriar() {
  if (!loggedUser) return false;
  if (ehMestre(loggedUser.login)) return true;
  if (_ffPerm('lancarEnviar')) return true;          // concedido no cadastro da pessoa
  if (hasPermission('fluxo_financeiro', 'criar')) return true;
  if (_ffConfigurado('criar')) return _ffEhResponsavel('criar');
  return loggedUser.departamento === 'dp' || loggedUser.departamento === 'administracao';
}
// Etapa 2 — Supervisão DP. Se há responsáveis configurados, são eles; senão,
// o padrão (representante do DP ou administração). O poder individual dado no
// cadastro (aprovarSupervisao) sempre soma.
function _ffEhCoordenacao() {
  if (!loggedUser) return false;
  if (ehMestre(loggedUser.login)) return true;
  if (_ffPerm('aprovarSupervisao')) return true;
  if (_ffConfigurado('coordenacao')) return _ffEhResponsavel('coordenacao');
  return (loggedUser.departamento === 'dp' && loggedUser.representanteDepto) || loggedUser.departamento === 'administracao';
}
// Etapa 3 — Gestão
function _ffEhGestao() {
  if (!loggedUser) return false;
  if (ehMestre(loggedUser.login)) return true;
  if (_ffPerm('aprovarGestao')) return true;
  if (_ffConfigurado('gestao')) return _ffEhResponsavel('gestao');
  return loggedUser.departamento === 'administracao';
}
// Etapa 4/5 — Financeiro (processa, paga, anexa comprovante)
function _ffEhFinanceiro() {
  if (!loggedUser) return false;
  if (ehMestre(loggedUser.login)) return true;
  if (_ffPerm('processarPagamento')) return true;
  if (_ffConfigurado('financeiro')) return _ffEhResponsavel('financeiro');
  return loggedUser.departamento === 'financeiro';
}
// Visão gerencial: vê tudo, inclusive a planilha gerencial e o monitoramento
function _ffVeTudo() {
  if (!loggedUser) return false;
  return ehMestre(loggedUser.login)
    || loggedUser.departamento === 'administracao'
    || _ffPerm('verTodos');
}
// A ação que cabe ao usuário logado no status atual (usada nos KPIs e na lista)
function _ffEhMinhaVez(f) {
  if (!loggedUser || !f) return false;
  // Pagamento reprovado de UMA pessoa: a ficha volta a pedir ação de quem a
  // montou (para corrigir) e, depois de corrigida, do Financeiro (para
  // conferir). É assim que a "notificação" aparece — no contador Minha vez.
  if (_ffLinhasReprovadas(f).length && (_ffEhDonoDaFicha(f) || _ffEhCoordenacao())) return true;
  if (_ffLinhasCorrigidas(f).length && _ffEhFinanceiro()) return true;
  switch (f.status) {
    case 'rascunho':               return _ffPodeCriar() && (f.criadoPorLogin === loggedUser.login || _ffEhCoordenacao() || _ffVeTudo());
    case 'aguardando_coordenacao': return _ffEhCoordenacao();
    case 'aguardando_gestao':      return _ffEhGestao();
    case 'aguardando_financeiro':  return _ffEhFinanceiro();
    case 'pago':                   return _ffEhFinanceiro();
    default: return false;
  }
}
// Quem montou a ficha. NÃO é mais uma trava para aprovar: quem é responsável
// pela etapa aprova, mesmo tendo subido os documentos — e segue aprovando as
// etapas seguintes de que também for responsável. Numa equipe pequena a
// supervisora costuma ser a mesma pessoa que lança, e a trava antiga travava
// o trabalho. Quem NÃO é responsável pela etapa continua sem aprovar.
// A função segue em uso para permissões de rascunho, cancelar e excluir.
function _ffEhCriador(f) {
  return !!(loggedUser && f && f.criadoPorLogin === loggedUser.login && !ehMestre(loggedUser.login));
}

// ── Visibilidade: quem vê QUAIS fluxos ─────────────────────────────────────
// Afunilamento: o analista vê só os dele; a Supervisão vê todos os do DP; a
// Gestão vê o que já passou da Supervisão; o Financeiro vê o que foi liberado.
// O admin pode trocar por pessoa: 'meus' | 'etapa' | 'todos' (vazio = padrão).
function _ffVisiveis() {
  garantirFluxoFinanceiro();
  const todos = state.fluxosFinanceiros;
  if (!loggedUser) return [];
  if (_ffVeTudo()) return todos;

  const modo = (loggedUser.permissoesFluxo && loggedUser.permissoesFluxo.visibilidade) || '';
  if (modo === 'todos') return todos;
  if (modo === 'meus')  return todos.filter(f => f.criadoPorLogin === loggedUser.login);
  if (modo === 'etapa') return todos.filter(f => _ffEhMinhaVez(f));

  // padrão por papel
  if (_ffEhCoordenacao()) return todos;   // a Supervisão acompanha tudo do DP
  if (_ffEhFinanceiro()) {
    return todos.filter(f => ['aguardando_financeiro', 'pago', 'finalizado'].includes(f.status));
  }
  if (loggedUser.departamento === 'dp') {
    return todos.filter(f => f.criadoPorLogin === loggedUser.login);   // analista: só os dele
  }
  return todos.filter(f => f.criadoPorLogin === loggedUser.login || _ffEhMinhaVez(f));
}

// ── Prazo do pagamento: 🟢 no prazo · 🟡 amanhã · 🔴 hoje/atrasado ─────────
function _ffPrazo(f) {
  if (!f || !f.dataPagamento || ['pago', 'finalizado', 'reprovado'].includes(f.status)) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(f.dataPagamento + 'T00:00:00');
  const dias = Math.round((alvo - hoje) / 86400000);
  if (dias < 0)  return { nivel: 'atrasado', cor: '#DC2626', rotulo: `ATRASADO ${-dias}d` };
  if (dias === 0) return { nivel: 'hoje',    cor: '#DC2626', rotulo: 'PAGA HOJE' };
  if (dias === 1) return { nivel: 'amanha',  cor: '#D97706', rotulo: 'paga AMANHÃ' };
  return { nivel: 'ok', cor: '#059669', rotulo: `em ${dias} dias` };
}

// ── Formatação ─────────────────────────────────────────────────────────────
function _ffMoedaBR(n) {
  return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
// "1.234,56" -> 1234.56
function _ffParseValor(s) {
  const t = String(s == null ? '' : s).replace(/[^\d,.-]/g, '').trim();
  if (!t) return 0;
  let normalizado;
  if (t.includes(',')) {
    // Padrão brasileiro: vírgula é decimal, ponto (se tiver) é milhar.
    normalizado = t.replace(/\./g, '').replace(',', '.');
  } else {
    const ultimoPonto = t.lastIndexOf('.');
    if (ultimoPonto >= 0 && t.length - ultimoPonto - 1 === 2) {
      // Sem vírgula nenhuma, mas o ÚLTIMO ponto tem exatamente 2 casas
      // depois — é alguém editando no padrão americano ("1500.00" ou
      // "1.500.00"). Sem isso, "1.500.00" virava 150000 (100x maior) em
      // vez de 1500 — os pontos antes do último são milhar, viram nada.
      normalizado = t.slice(0, ultimoPonto).replace(/\./g, '') + '.' + t.slice(ultimoPonto + 1);
    } else {
      // Só ponto(s) fora desse padrão — trata como separador de milhar
      // (ex.: "1.500" sozinho quer dizer 1500, não 1,5).
      normalizado = t.replace(/\./g, '');
    }
  }
  const n = parseFloat(normalizado);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}
function _ffTotal(f) {
  return (f.linhas || []).reduce((s, l) => s + (Number(l.valor) || 0), 0);
}

// VALIDAÇÃO MATEMÁTICA, POR ARQUIVO: a soma linha a linha é recalculada do zero
// a cada render (se o DP editar uma linha, o cheque acompanha) e comparada com o
// Sub-Total E com o Total Geral impressos NAQUELE PDF. Nada de valor fixo:
// cada arquivo novo é uma conta nova.
// bate: true = fecha no centavo | false = diverge | null = PDF sem total impresso
function _ffChequeTotais(f) {
  return (f.arquivos || []).map(a => {
    const soma = Math.round((f.linhas || [])
      .filter(l => l.arquivo === a.nome)
      .reduce((s, l) => s + (Number(l.valor) || 0), 0) * 100) / 100;
    const sub = (a.subTotal === null || a.subTotal === undefined) ? null : Number(a.subTotal);
    // compat: fluxos antigos guardavam só "totalDeclarado"
    const tg  = (a.totalGeral === null || a.totalGeral === undefined)
      ? ((a.totalDeclarado === null || a.totalDeclarado === undefined) ? null : Number(a.totalDeclarado))
      : Number(a.totalGeral);
    const bateSub   = sub === null ? null : Math.abs(soma - sub) < 0.01;
    const bateTotal = tg  === null ? null : Math.abs(soma - tg)  < 0.01;
    // resultado geral do arquivo: false se QUALQUER comparação divergir
    const bate = (bateSub === false || bateTotal === false) ? false
               : (bateSub === null && bateTotal === null) ? null : true;
    return { arquivo: a.nome, soma, subTotal: sub, totalGeral: tg, bateSub, bateTotal, bate, totalDeclarado: tg };
  });
}
function _ffHist(f, acao) {
  f.historico = f.historico || [];
  f.historico.push({ data: new Date().toISOString(), usuario: loggedUser ? nomeExibido(loggedUser) : 'Sistema', login: loggedUser ? loggedUser.login : '', acao });
}
// Registra no histórico que o processo caiu na fila de uma etapa (auditoria da
// "notificação ao responsável"). Nomeia o setor e, se configurados, as pessoas.
function _ffNotificar(f, etapaId) {
  const c = _ffCfg(etapaId);
  const nomes = _ffNomesResponsaveis(etapaId);
  const alvo = nomes.length ? nomes.join(', ') : `${c.setor || ''} — ${c.funcao || 'responsável'}`.trim();
  _ffHist(f, `Notificação enviada ao responsável (${c.setor || ''} · ${c.funcao || ''}): ${alvo}.`);
}
function _ffCompetenciaBR(c) {
  const m = String(c || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return c || '—';
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${meses[+m[2] - 1]}/${m[1]}`;
}

// ── Leitura do PDF (pdf.js) ────────────────────────────────────────────────
// Extrai o texto agrupando os pedaços pela posição vertical (linha visual).
async function _ffLerPdf(file) {
  if (!window.pdfjsLib) throw new Error('O leitor de PDF não carregou. Atualize a página (Ctrl+Shift+R).');
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const paginas = doc.numPages;      // TODAS as páginas, sempre — 1, 2 ou dezenas
  let texto = '';
  const linhasComPosicao = [];       // para a leitura por coluna (ver abaixo)
  for (let p = 1; p <= paginas; p++) {
    const pagina = await doc.getPage(p);
    const conteudo = await pagina.getTextContent();

    // AGRUPAR POR PROXIMIDADE, NÃO POR ALTURA ARREDONDADA.
    // Antes era Math.round(y): dois pedaços da MESMA linha impressos a 700,4 e
    // 700,6 viravam 700 e 701 — a linha se partia em duas e nenhuma das metades
    // batia com o formato esperado. A pessoa simplesmente não aparecia, e o
    // arquivo "não era lido". Isso acontece quando o gerador desenha o modelo
    // do formulário e os dados em passadas diferentes, com um fio de diferença.
    //
    // Agora pedaços a menos de meia altura de letra um do outro são a mesma
    // linha — que é como o olho humano lê a tabela.
    const itens = conteudo.items
      .filter(it => it && String(it.str || '').trim())
      .map(it => ({
        x: it.transform[4],
        y: it.transform[5],
        alt: Math.abs(it.height || it.transform[3] || 8),
        str: it.str
      }))
      .sort((a, b) => (b.y - a.y) || (a.x - b.x));

    const grupos = [];
    itens.forEach(it => {
      const ultimo = grupos[grupos.length - 1];
      // Tolerância pela altura da própria letra (mínimo 2pt): fonte grande
      // aceita mais desalinho, fonte miúda aceita menos.
      const folga = Math.max(2, it.alt * 0.6);
      if (ultimo && Math.abs(ultimo.y - it.y) <= folga) {
        ultimo.pedacos.push(it);
        // a linha fica na média das alturas, para não escorregar aos poucos
        ultimo.y = (ultimo.y * (ultimo.pedacos.length - 1) + it.y) / ultimo.pedacos.length;
      } else {
        grupos.push({ y: it.y, pedacos: [it] });
      }
    });

    grupos.forEach(g => {
      const pedacos = g.pedacos.sort((a, b) => a.x - b.x);
      texto += pedacos.map(i => i.str).join(' ') + '\n';
      // Guarda ONDE cada pedaço estava. É isto que permite ler por coluna em
      // vez de contar espaços — ver _ffLerPorColuna.
      linhasComPosicao.push({ pagina: p, y: g.y, pedacos });
    });
  }
  try { doc.destroy(); } catch (e) {}
  // Quantos caracteres "de verdade" saíram. PDF digitalizado (escaneado, ou
  // impresso e fotografado) devolve praticamente nada aqui: o conteúdo dele é
  // imagem, não texto. É esse número que decide se vale acionar o OCR.
  const letras = texto.replace(/\s/g, '').length;
  return { texto, paginas, letras, linhasComPosicao };
}

// ══════════════════════════════════════════════════════════════════════════
// LEITURA POR COLUNA — o jeito certo de ler uma tabela de PDF
// --------------------------------------------------------------------------
// A leitura por texto corrido junta a linha inteira e depois tenta adivinhar
// onde termina o nome e começa o CPF contando espaços. Isso quebra sozinho:
// bastou um sobrenome "Sá" para uma pessoa sumir de uma relação de pagamento.
//
// Só que o PDF JÁ SABE onde cada coluna está — cada pedaço de texto vem com a
// sua posição horizontal. Então lemos o cabeçalho uma vez ("C.P.F.", "Lote",
// "Conta bancária", "Valor líquido"...), anotamos a posição de cada coluna, e
// depois é só encaixar cada pedaço na coluna mais próxima.
//
// Assim o nome está na COLUNA DO NOME, e nenhum sobrenome, acento ou espaço a
// mais consegue confundir o sistema.
//
// Quando o cabeçalho não é encontrado, devolve null — e o caminho antigo
// assume. Nada deixa de funcionar por causa disto.
// ══════════════════════════════════════════════════════════════════════════

// Cada coluna que interessa e como reconhecê-la no cabeçalho impresso.
const FF_COLUNAS = [
  { campo: 'codigo',  rx: /^fl\.?\s*c[óo]digo|^c[óo]digo/i },
  { campo: 'nome',    rx: /nome\s+do?\s+funcion/i },
  // Relatório de Pensão Alimentícia: quem RECEBE o dinheiro é o pensionista,
  // não o funcionário (dele só saiu o desconto). Coluna própria pra não
  // grudar os dois nomes num só campo.
  { campo: 'pensionista', rx: /nome\s+do\s+pensionista/i },
  { campo: 'cpf',     rx: /^c\.?\s*p\.?\s*f\.?/i },
  { campo: 'demissao',rx: /demiss/i },
  { campo: 'comp',    rx: /^comp/i },
  { campo: 'banco',   rx: /^bco|^banco$/i },
  { campo: 'lote',    rx: /^lote/i },
  { campo: 'tc',      rx: /^tcta|^t\.?\s*cta/i },
  { campo: 'agencia', rx: /^age/i },
  { campo: 'conta',   rx: /conta\s+banc/i },
  // \b em vez de $: alguns modelos (ex.: SFP0594) imprimem "Valor--------"
  // (traço decorativo de preenchimento colado na palavra) — sem isso o
  // cabeçalho inteiro deixava de ser reconhecido por causa só do "Valor".
  { campo: 'valor',   rx: /valor\s+l[íi]quido|^valor\b/i },
  { campo: 'origem',  rx: /^orig/i }
];

// Acha a linha de cabeçalho e devolve { campo: xInicial }. Sem cabeçalho
// reconhecível, devolve null.
function _ffMapaDeColunas(linhas) {
  for (const linha of linhas) {
    const juntou = linha.pedacos.map(p => p.str).join(' ');
    // O cabeçalho da relação sempre tem estas três coisas juntas
    if (!/nome\s+do?\s+funcion/i.test(juntou)) continue;
    if (!/c\.?\s*p\.?\s*f\.?/i.test(juntou)) continue;

    // Testa cada pedaço sozinho primeiro; só junta com o(s) vizinho(s) se
    // nada bateu ainda. "Nome do funcionário" (ou "...pensionista") no PDF
    // comum costuma vir como UM pedaço só, mas no OCR cada palavra sai
    // separada ("Nome" / "do" / "funcionário------") — sem essa janela, a
    // coluna nunca era reconhecida vinda de imagem.
    const mapa = {};
    const pedacos = linha.pedacos;
    for (let i = 0; i < pedacos.length; i++) {
      let usado = 1;
      const max = Math.min(4, pedacos.length - i);
      for (let n = 1; n <= max; n++) {
        const janela = pedacos.slice(i, i + n).map(p => String(p.str || '').trim()).filter(Boolean).join(' ');
        if (!janela) continue;
        const achou = FF_COLUNAS.find(c => c.rx.test(janela));
        if (achou) {
          if (mapa[achou.campo] === undefined) mapa[achou.campo] = pedacos[i].x;
          usado = n;
          break;
        }
      }
      i += usado - 1;
    }
    // Precisa ao menos de nome, CPF e valor para valer a pena
    if (mapa.nome !== undefined && mapa.cpf !== undefined && mapa.valor !== undefined) {
      return { mapa, y: linha.y, pagina: linha.pagina };
    }
  }
  return null;
}

// Distribui os pedaços de uma linha nas colunas do mapa.
function _ffEncaixarNasColunas(pedacos, mapa) {
  const campos = Object.keys(mapa).sort((a, b) => mapa[a] - mapa[b]);
  const saida = {};
  campos.forEach(c => { saida[c] = []; });
  pedacos.forEach(p => {
    const txt = String(p.str || '').trim();
    if (!txt) return;
    // A coluna deste pedaço é a última cujo início fica à esquerda dele.
    // Uma folga de 6pt cobre número que imprime encostado no título da coluna.
    let alvo = campos[0];
    for (const c of campos) { if (p.x >= mapa[c] - 6) alvo = c; else break; }
    saida[alvo].push(txt);
  });
  const texto = {};
  campos.forEach(c => { texto[c] = saida[c].join(' ').trim(); });
  return texto;
}

// Lê a relação inteira pelas colunas. Devolve as linhas no MESMO formato que
// o leitor antigo, para o resto do sistema não notar diferença nenhuma.
function _ffLerPorColuna(linhasComPosicao) {
  if (!Array.isArray(linhasComPosicao) || !linhasComPosicao.length) return null;
  const cab = _ffMapaDeColunas(linhasComPosicao);
  if (!cab) return null;
  // Relatório de Pensão Alimentícia: tem uma coluna "Nome do pensionista"
  // além de "Nome do funcionário". Esse relatório às vezes não imprime o CPF
  // do pensionista — por isso, só pra ESTE modelo, o nome (não o CPF) é quem
  // decide se a linha vale.
  const temPensionista = cab.mapa.pensionista !== undefined;

  const out = [];
  linhasComPosicao.forEach(linha => {
    // A própria linha do cabeçalho não é gente — e ela se REPETE em toda
    // página do relatório, não só na primeira. Comparar com a posição de UMA
    // ocorrência só pegava o cabeçalho da página 1 e deixava passar o das
    // páginas seguintes como se fosse gente — virava um "registro" fantasma
    // com o rótulo da coluna no lugar do nome (mais visível no relatório de
    // Pensão Alimentícia, onde não tem CPF pra barrar isso). Por isso aqui
    // testamos CADA linha pelo mesmo critério usado pra achar o cabeçalho,
    // não só a posição da primeira vez que ele apareceu.
    const juntouLinha = linha.pedacos.map(p => p.str).join(' ');
    if (/nome\s+do?\s+funcion/i.test(juntouLinha) && /c\.?\s*p\.?\s*f\.?/i.test(juntouLinha)) return;
    const col = _ffEncaixarNasColunas(linha.pedacos, cab.mapa);

    if (temPensionista) {
      const nomePensionista = String(col.pensionista || '').replace(/[^\p{L}\s'.-]/gu, ' ').replace(/\s+/g, ' ').trim();
      // Linha de total/rodapé ("Total das pensões...") não é gente — mesmo
      // que caia por baixo da coluna do pensionista.
      if (/^total\b/i.test(nomePensionista) || nomePensionista.length < 3) return;
      const nomeFunc = String(col.nome || '').replace(/[^\p{L}\s'.-]/gu, ' ').replace(/\s+/g, ' ').trim();
      const cpfBrutoP = String(col.cpf || '').replace(/\s/g, '');
      const cpfValidoP = /^\d{3}[.,\-]?\d{3}[.,\-]?\d{3}[.,\-]?\d{2}$/.test(cpfBrutoP);
      const achadosP = [...String(col.valor || '').matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})/g)];
      const semValorP = !achadosP.length;
      const valorP = semValorP ? 0 : _ffParseValor(achadosP[achadosP.length - 1][1]);
      const meioP = _ffParseMeioExata([col.banco, col.lote, col.tc, col.agencia, col.conta].filter(Boolean).join(' '));
      out.push({
        id: 'ffl-' + Date.now() + '-' + out.length + '-' + Math.random().toString(36).slice(2, 5),
        codigo: String(col.codigo || '').replace(/\D/g, ''),
        // O pagamento é PARA o pensionista — o nome do funcionário fica só de
        // referência (é dele que saiu o desconto), pra não sumir da ficha.
        nome: nomeFunc ? `${nomePensionista} (pensão — func. ${nomeFunc})` : nomePensionista,
        cpf: cpfValidoP ? _ffNormalizarCpf(cpfBrutoP) : '',
        valor: valorP,
        origem: 'Pensão',
        semValorNoPdf: semValorP,
        lidoPorColuna: true,
        status: (nomePensionista.length >= 3 && (valorP > 0 || semValorP)) ? 'ok' : 'conferir',
        banco: meioP.banco || String(col.banco || '').replace(/\D/g, ''),
        lote: meioP.lote || String(col.lote || '').replace(/\D/g, ''),
        tc: meioP.tc || String(col.tc || '').trim(),
        agencia: meioP.agencia, agenciaDg: meioP.agenciaDg,
        conta: meioP.conta, contaDg: meioP.contaDg
      });
      return;
    }

    // Uma pessoa tem CPF na coluna do CPF. Total, cabeçalho e rodapé não têm —
    // e é só isso que precisamos verificar. Nada de adivinhar por palavra.
    const cpfBruto = String(col.cpf || '').replace(/\s/g, '');
    if (!/^\d{3}[.,\-]?\d{3}[.,\-]?\d{3}[.,\-]?\d{2}$/.test(cpfBruto)) return;

    const nome = String(col.nome || '').replace(/[^\p{L}\s'.-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (nome.length < 3) return;

    // O valor é o último número no formato dinheiro dentro da coluna do valor.
    const achados = [...String(col.valor || '').matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})/g)];
    const semValor = !achados.length;
    const valor = semValor ? 0 : _ffParseValor(achados[achados.length - 1][1]);

    // Conta e agência: reaproveita a mesma leitura já usada e testada.
    const meio = _ffParseMeioExata([col.demissao, col.comp, col.banco, col.lote,
                                    col.tc, col.agencia, col.conta].filter(Boolean).join(' '));

    out.push({
      id: 'ffl-' + Date.now() + '-' + out.length + '-' + Math.random().toString(36).slice(2, 5),
      codigo: String(col.codigo || '').replace(/\D/g, ''),
      nome,
      cpf: _ffNormalizarCpf(cpfBruto),
      valor,
      origem: String(col.origem || '').trim(),
      semValorNoPdf: semValor,
      lidoPorColuna: true,
      // Mesmo critério do leitor de texto: nome curto (3-4 letras) passa
      // pelo corte de "não é gente" mas ainda pode ser um pedaço de nome
      // truncado pela OCR — vai pra conferência manual em vez de 'ok' direto.
      status: (nome.length >= 5 && (valor > 0 || semValor)) ? 'ok' : 'conferir',
      demissao: meio.demissao, competencia: meio.competencia,
      banco: meio.banco || String(col.banco || '').replace(/\D/g, ''),
      lote: meio.lote || String(col.lote || '').replace(/\D/g, ''),
      tc: meio.tc || String(col.tc || '').trim(),
      agencia: meio.agencia, agenciaDg: meio.agenciaDg,
      conta: meio.conta, contaDg: meio.contaDg
    });
  });

  return out.length ? out : null;
}

// ══════════════════════════════════════════════════════════════════════════
// LEITURA POR IMAGEM (OCR) — só para PDF que não tem texto dentro
// --------------------------------------------------------------------------
// Bancária impressa e escaneada, ou print de tela salvo como PDF, não tem
// camada de texto: o pdf.js não acha nada porque não há nada para achar. Aqui
// desenhamos cada página numa tela e lemos as letras da imagem.
//
// REGRA: isto NUNCA substitui a leitura normal. Só roda quando a leitura
// normal voltou vazia. O que funciona hoje segue exatamente igual — e o texto
// que sai do OCR passa pelo MESMO _ffAnalisarTexto, com as mesmas regras de
// validação, para não existir "dois jeitos de ler" que divergem entre si.
// ══════════════════════════════════════════════════════════════════════════
const FF_OCR_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let _ffOcrCarregando = null;

function _ffTemOcr() { return typeof Tesseract !== 'undefined' && Tesseract && Tesseract.createWorker; }

// NADA aqui pode esperar para sempre. Sem prazo, um download travado deixa a
// tela em "Processando..." sem fim, e a pessoa não sabe se espera ou desiste.
function _ffComPrazo(promessa, ms, mensagem) {
  let relogio;
  return Promise.race([
    promessa,
    new Promise((_, rejeita) => { relogio = setTimeout(() => rejeita(new Error(mensagem)), ms); })
  ]).finally(() => clearTimeout(relogio));
}

function _ffCarregarOcr() {
  if (_ffTemOcr()) return Promise.resolve(true);
  if (_ffOcrCarregando) return _ffOcrCarregando;
  _ffOcrCarregando = new Promise(resolve => {
    const s = document.createElement('script');
    s.src = FF_OCR_URL;
    s.crossOrigin = 'anonymous';
    s.referrerPolicy = 'no-referrer';
    s.onload = () => resolve(_ffTemOcr());
    s.onerror = () => { _ffOcrCarregando = null; resolve(false); };
    document.head.appendChild(s);
  });
  // 40s para o script chegar. Se a internet estiver ruim, é melhor avisar do
  // que deixar a tela parada.
  return _ffComPrazo(_ffOcrCarregando, 40000, 'O leitor de imagem demorou demais para carregar.')
    .catch(() => { _ffOcrCarregando = null; return false; });
}

// Converte o hOCR (HTML com a posição de cada palavra, formato padrão do
// Tesseract) no MESMO formato "linhasComPosicao" que o PDF comum devolve —
// assim a leitura por coluna (_ffLerPorColuna) funciona igual, mesmo vindo de
// uma imagem escaneada. Cada .ocr_line do Tesseract já É uma linha da tabela;
// cada .ocrx_word dentro dela carrega a própria posição horizontal (bbox).
function _ffHocrParaLinhas(hocrHtml, pagina) {
  const linhas = [];
  if (!hocrHtml) return linhas;
  let doc;
  try { doc = new DOMParser().parseFromString(hocrHtml, 'text/html'); } catch (e) { return linhas; }
  const bboxDe = el => {
    const m = (el.getAttribute('title') || '').match(/bbox\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/);
    return m ? { x0: +m[1], y0: +m[2] } : null;
  };
  doc.querySelectorAll('.ocr_line').forEach((linhaEl, i) => {
    const bb = bboxDe(linhaEl);
    const pedacos = [];
    linhaEl.querySelectorAll('.ocrx_word').forEach(wEl => {
      const txt = (wEl.textContent || '').trim();
      if (!txt) return;
      const wb = bboxDe(wEl);
      pedacos.push({ str: txt, x: wb ? wb.x0 : 0 });
    });
    if (pedacos.length) linhas.push({ pagina, y: bb ? bb.y0 : i, pedacos });
  });
  return linhas;
}

// Lê as letras das imagens das páginas. `aviso` recebe o texto de andamento.
async function _ffLerPdfPorImagem(file, aviso) {
  if (aviso) aviso('Este PDF é uma imagem. Carregando o leitor de imagem...');
  const temOcr = await _ffCarregarOcr();
  if (!temOcr) throw new Error('Não consegui carregar o leitor de imagem. Confira a internet e tente de novo.');

  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const paginas = doc.numPages;

  // 'por' = português. O dicionário desce uma vez e fica no cache do navegador.
  // Na PRIMEIRA vez são alguns MB: por isso o prazo aqui é mais folgado.
  if (aviso) aviso('Preparando o leitor de imagem (só na primeira vez, pode levar 1 minuto)...');
  const worker = await _ffComPrazo(
    Tesseract.createWorker('por'), 120000,
    'O dicionário do leitor de imagem demorou demais para baixar. Tente de novo com uma internet melhor.');

  let texto = '';
  const linhasComPosicao = [];
  try {
    for (let p = 1; p <= paginas; p++) {
      if (aviso) aviso(`Lendo a imagem da página ${p} de ${paginas}... (é mais devagar que PDF comum)`);
      const pagina = await doc.getPage(p);
      // A escala decide TUDO no tempo do OCR: dobrar a escala quadruplica os
      // pixels a analisar. Miramos numa largura de ~1700px, que é o suficiente
      // para o OCR não trocar 8 por 3 numa tabela bancária, sem processar pixel
      // à toa. Escala fixa de 2,5 fazia uma página A3 virar 4 vezes mais
      // trabalho que uma A4 — e a espera era essa.
      const base = pagina.getViewport({ scale: 1 });
      const escala = Math.max(1.5, Math.min(3, 1700 / (base.width || 600)));
      const viewport = pagina.getViewport({ scale: escala });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await pagina.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      // 90s por página. Página de bancária leva 10 a 20s num computador comum;
      // se passar disso, alguma coisa travou e é melhor dizer do que esperar.
      // Pede também o hOCR (a posição de cada palavra) — é o que permite ler
      // por coluna depois, igual um PDF comum (ver _ffHocrParaLinhas).
      const r = await _ffComPrazo(worker.recognize(canvas, {}, { text: true, hocr: true }), 90000,
        `A leitura da página ${p} passou de 90 segundos e foi interrompida.`);
      texto += ((r && r.data && r.data.text) || '') + '\n';
      try { linhasComPosicao.push(..._ffHocrParaLinhas((r && r.data && r.data.hocr) || '', p)); }
      catch (e) { console.error('[FF] hOCR desta página não deu pra aproveitar:', e); }
      canvas.width = canvas.height = 0;   // devolve a memória na hora
    }
  } finally {
    try { await worker.terminate(); } catch (e) {}
    try { doc.destroy(); } catch (e) {}
  }
  return { texto: _ffArrumarTextoOcr(texto), paginas, letras: texto.replace(/\s/g, '').length, linhasComPosicao };
}

// O OCR erra de um jeito previsível em tabela bancária. Estas trocas são só
// as SEGURAS — as que não podem mudar o sentido de um número:
//   • "l" e "I" no meio de dígitos é 1;  "O" e "o" entre dígitos é 0.
//   • ponto que virou espaço no valor ("1 234,56") volta a juntar.
// Nada de adivinhar dígito por semelhança: se ficou ilegível, é melhor a
// conferência contra o total do PDF acusar do que o sistema inventar valor.
function _ffArrumarTextoOcr(t) {
  return String(t || '')
    .split('\n')
    .map(l => l
      // Bloco de 4+ caracteres feito de dígitos e das letras que o OCR troca
      // por dígito (O/o por 0, l/I por 1). Só corrige quando a MAIORIA já é
      // dígito — assim "CC", "PX" e nomes ficam intactos, e "1244Ol" vira
      // "1244 01" mesmo com os dois erros colados, que a troca letra a letra
      // não pegava (ela exigia dígito dos dois lados).
      .replace(/[\dOolI]{4,}/g, bloco => {
        const digitos = (bloco.match(/\d/g) || []).length;
        if (digitos < bloco.length / 2) return bloco;
        return bloco.replace(/[Oo]/g, '0').replace(/[lI]/g, '1');
      })
      // NÃO tentamos recuperar o ponto do milhar ("1 234,56" -> "1.234,56").
      // Parece inofensivo e não é: na relação bancária o dígito da conta fica
      // logo antes do valor, então "...124401 9 112,00" virava "9.112,00" e o
      // sistema INVENTAVA R$ 9.112,00 no lugar de R$ 112,00. Valor errado para
      // mais é o pior defeito possível aqui. Se o milhar se perder, a conferência
      // contra o Total Geral do PDF acusa — e alguém confere. Melhor assim.
      .replace(/[ \t]+/g, ' ')
      .trim())
    .filter(l => l)
    .join('\n');
}

// CPF em qualquer formato ("578.533.588.30", "578.533.588-30", "57853358830")
// vira o padrão ###.###.###-##.
function _ffNormalizarCpf(s) {
  const d = String(s || '').replace(/\D/g, '');
  if (d.length !== 11) return String(s || '').trim();
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// Dígito verificador do CPF (algoritmo oficial da Receita). true = matematicamente
// válido. Usado como ALERTA de auditoria, nunca como bloqueio: relatório com CPF
// mascarado/truncado reprovaria em massa.
function _ffCpfValido(s) {
  const d = String(s || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += parseInt(d[i], 10) * (t + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== parseInt(d[t], 10)) return false;
  }
  return true;
}

// Lê o texto de UM PDF do Exata e devolve { linhas, totalDeclarado }.
//
// CALIBRADO NO RELATÓRIO REAL do Exata (SFP99024 — "pagamentos agendados na
// relação"): cada linha de colaborador é
//   005000 SUSANA COSTA PEREIRA  578.533.588.30 07/26 237 270 CC 0354 000000182135 0   844,00 AA01
// Detalhes que quebravam o leitor genérico:
//  - o CPF vem com PONTO no final (578.533.588.30), não com traço;
//  - "Sub-Total R$ 48.108,00" tem hífen e virava uma linha fantasma na soma;
//  - o cabeçalho traz o CNPJ com vírgulas (36,927,751,0001,03) que parecia valor.
// O "Total Geral" impresso no PDF é capturado para BATER com a soma das linhas.
// Interpreta o "meio" de uma linha (tudo entre o CPF e o valor) por SIGNIFICADO,
// não por posição fixa — funciona para os dois modelos e para linhas PIX (que
// não têm agência/conta). Classifica os tokens: data de demissão, competência,
// banco, lote, TC, agência(+dígito) e conta(+dígito).
function _ffParseMeioExata(meio) {
  const r = { demissao: '', competencia: '', banco: '', lote: '', tc: '', agencia: '', agenciaDg: '', conta: '', contaDg: '' };
  let toks = String(meio || '').trim().split(/\s+/).filter(Boolean);

  let i = toks.findIndex(t => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t));   // data completa = demissão
  if (i >= 0) { r.demissao = toks[i]; toks.splice(i, 1); }
  i = toks.findIndex(t => /^\d{1,2}\/\d{2}$/.test(t));               // dd/aa = competência
  if (i >= 0) { r.competencia = toks[i]; toks.splice(i, 1); }

  const iTc = toks.findIndex(t => /^[A-Z]{2,3}$/.test(t));           // CC / PX / CD / TED
  if (iTc >= 0) r.tc = toks[iTc];

  const antes = (iTc >= 0 ? toks.slice(0, iTc) : toks).filter(t => /^\d+$/.test(t));
  r.banco = antes[0] || '';
  r.lote = antes[1] || '';

  const depois = (iTc >= 0 ? toks.slice(iTc + 1) : []).filter(t => /^\d+$/.test(t));
  if (depois.length) {
    // a CONTA é o número mais longo; o que vem antes é agência(+dígito), o depois é dígito da conta
    let idx = 0, max = -1;
    depois.forEach((t, k) => { if (t.length > max) { max = t.length; idx = k; } });
    r.conta = depois[idx];
    const ac = depois.slice(0, idx);
    r.agencia = ac[0] || '';
    r.agenciaDg = ac[1] || '';
    r.contaDg = depois[idx + 1] || '';
  }
  return r;
}

// Lê o texto de UM relatório do Exata. Reconhece automaticamente o MODELO:
//   • Modelo 1 (SFP99024): CPF com pontos, totais "Sub-Total"/"Total Geral".
//   • Modelo 2 (relação bancária RT2): CPF com vírgula (380802298,13), seções
//     por banco (Bradesco/Itaú/PIX), linhas PIX sem agência/conta, totais por
//     "Tot.Cliente". As colunas são lidas por significado, não por posição fixa.
// Devolve linhas estruturadas + Sub-Total + Total Geral (recalculável) + metadados.
function _ffAnalisarTexto(texto) {
  const txt = String(texto || '');
  const out = [];
  let subTotal = null;
  let totalGeralM1 = null;   // "Total Geral" (modelo 1)
  let somaTotCliente = 0;    // soma dos "Tot.Cliente" (modelo 2)
  let temTotCliente = false;

  // Modelo detectado (só para o relatório/rótulo — a leitura funciona nos dois)
  let modelo = 'Genérico';
  if (/pens[ãa]o\s+aliment[íi]cia|nome\s+do\s+pensionista|sfp0594/i.test(txt)) modelo = 'Pensão Alimentícia (SFP0594)';
  else if (/tot\.?\s*cliente|ordem\s+pagamento|total\s+da\s+rela[çc][ãa]o/i.test(txt)) modelo = 'Relação bancária (RT2)';
  else if (/sfp99024|sub[\s-]*total|total\s+geral|rela[çc][ãa]o\s+N\./i.test(txt)) modelo = 'SFP99024 (RT1)';

  // Metadados
  let dataPagamentoPdf = null, relacaoNumero = null;
  const mDt = txt.match(/data\s+d?[eo]?\s*pagamento\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (mDt) dataPagamentoPdf = mDt[1];
  const mRel = txt.match(/rela[çc][ãa]o\s+N\.?\s*(\d{4,12})/i) || txt.match(/ordem\s+pagamento\s+nr\.?\s*(\d{3,12})/i);
  if (mRel) relacaoNumero = mRel[1];

  // Linha de colaborador: código + nome + CPF + (meio) + [valor] + origem.
  // O CPF aceita ponto, espaço, traço OU vírgula antes dos 2 últimos dígitos
  // (RT2 imprime "380802298,13"). O valor é o último "0.000,00" antes da origem.
  //
  // O VALOR É OPCIONAL de propósito: na relação bancária existem pessoas SEM
  // valor nenhum — a linha termina direto na origem (PR01). Elas não têm nada
  // a receber, e antes o sistema inventava um valor para elas (pegava o
  // "068,38" do próprio CPF). Agora ficam com valor zero, como no PDF.
  const rxLinha = /^\s*(\d{3,10})\s+(.+?)\s+(\d{3}[.\s]?\d{3}[.\s]?\d{3}[.,\s-]?\d{2})\s+(.+?)(?:\s+(\d{1,3}(?:\.\d{3})*,\d{2}))?\s+(\S{1,6})\s*$/;

  const novaLinha = extra => Object.assign({
    id: 'ffl-' + Date.now() + '-' + out.length + '-' + Math.random().toString(36).slice(2, 5),
    codigo: '', nome: '', cpf: '', competencia: '', demissao: '', banco: '', lote: '', tc: '',
    agencia: '', agenciaDg: '', conta: '', contaDg: '', origem: '', valor: 0, status: 'conferir'
  }, extra);

  txt.split(/\n+/).forEach(l => {
    const linha = l.trim();
    if (!linha) return;

    // ── Totais impressos (nunca viram registro) ──
    const mTG = linha.match(/total\s+geral\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
    if (mTG) { totalGeralM1 = _ffParseValor(mTG[1]); return; }
    // Relatório de Pensão Alimentícia: "Total das pensoes 282,85"
    const mTP = linha.match(/total\s+das\s+pens[õo]es\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
    if (mTP) { totalGeralM1 = _ffParseValor(mTP[1]); return; }
    const mSub = linha.match(/sub[\s-]*total\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
    if (mSub) { subTotal = _ffParseValor(mSub[1]); return; }
    // Modelo 2: "Tot.Cliente - EBAZAR CAJAMAR 130,00" — soma p/ o total do documento
    const mTC = linha.match(/tot\.?\s*cliente.*?(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/i);
    if (mTC) { somaTotCliente += _ffParseValor(mTC[1]); temTotCliente = true; return; }

    // ── Cabeçalhos/rodapés dos DOIS modelos (repetidos em cada página) ──
    // Estes são ancorados no INÍCIO da linha, então nunca pegam um nome de
    // pessoa por engano.
    if (/^\s*(empresa|banco|per[íi]odo|ordem\s+pagamento|forma\s+pagamento|data\s+(emiss[ãa]o|pagamento)|fl\.?\s*c[óo]digo|p[áa]gina|nome\s+do?\s+funcion[áa]rio|total\s+da\s+(p[áa]gina|rela[çc][ãa]o)|tot\.?\s*cliente|ordem\s+de\s+c[óo]digos|relat[óo]rio|usu[áa]rio)/i.test(linha)) return;

    // ── Linha de colaborador ──
    // ESTA CHECAGEM VEM ANTES do filtro de razão social lá embaixo, e isso é
    // proposital. O filtro procura "S/A", "LTDA", "CNPJ" em QUALQUER lugar da
    // linha — e "SA" é sobrenome comum no Brasil (Sá). Com o filtro na frente,
    // "014438 MARIA DE FATIMA SA ... 137,00" era descartada antes de ser lida,
    // e a conferência acusava divergência de exatamente R$ 137,00 contra o
    // total impresso no PDF. Pessoa primeiro; razão social só depois.
    const m = rxLinha.exec(linha);
    if (m) {
      const nome = m[2].replace(/[^\p{L}\s'.-]/gu, ' ').replace(/\s+/g, ' ').trim();
      const semValor = !m[5];                       // a linha veio sem valor no PDF
      const valor = semValor ? 0 : _ffParseValor(m[5]);
      const meio = _ffParseMeioExata(m[4]);
      out.push(novaLinha(Object.assign({
        codigo: m[1], nome, cpf: _ffNormalizarCpf(m[3]),
        valor, origem: m[6], semValorNoPdf: semValor,
        // Sem valor no PDF é uma situação legítima (nada a receber), não erro
        status: (nome && nome.length >= 5 && (valor > 0 || semValor)) ? 'ok' : 'conferir'
      }, meio)));
      return;
    }

    // ── Agora sim: linha de razão social / rodapé de banco ──
    // Só chega aqui quem NÃO é linha de colaborador. Mesmo assim exigimos que
    // a linha não tenha CPF: se tem CPF, é gente, e gente não se descarta por
    // causa de um sobrenome que parece sigla de empresa.
    const temCpf = /\d{3}[.\s]?\d{3}[.\s]?\d{3}[.,\s-]?\d{2}(?!\d)/.test(linha);
    if (!temCpf && /\bltda\b|\bs\/?a\b|\bcnpj\b|bradesco|banco\s+ita[uú]|\bpix\b\s*$/i.test(linha)) return;

    // ── Fallback genérico (outros layouts) — exige CPF para confiar ──
    const cpfM = linha.match(/\d{3}[.\s]?\d{3}[.\s]?\d{3}[.,\s-]?\d{2}(?!\d)/);
    // O CPF sai impresso com vírgula em alguns modelos ("588587068,38"), e o
    // final dele parece dinheiro. Tira o CPF da linha ANTES de procurar valor,
    // senão a pessoa sem valor acaba recebendo um número que não existe.
    const semCpf = cpfM ? (linha.slice(0, cpfM.index) + ' ' + linha.slice(cpfM.index + cpfM[0].length)) : linha;
    const valores = [...semCpf.matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})\b/g)];
    if (!valores.length) return;
    const valor = _ffParseValor(valores[valores.length - 1][1]);
    let nome = linha;
    if (cpfM) nome = linha.slice(0, cpfM.index);
    const pv = nome.search(/(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}\b/);
    if (pv >= 0) nome = nome.slice(0, pv);
    nome = nome.replace(/^[\s\d\-.,:|/]+/, '').replace(/[^\p{L}\s'.-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (/^(nome|colaborador|funcion[áa]rio|cpf|matr[íi]cula|valor|banco|ag[êe]ncia|conta|data)$/i.test(nome)) return;
    if (!cpfM) return;   // sem CPF confiável, não arrisca virar registro
    out.push(novaLinha({
      nome, cpf: _ffNormalizarCpf(cpfM[0]), valor,
      status: (nome && nome.length >= 5 && valor > 0) ? 'ok' : 'conferir'
    }));
  });

  // Pensão Alimentícia por TEXTO CORRIDO (sem posição de coluna — PDF escaneado
  // que caiu no OCR, por exemplo): nome do funcionário e do pensionista vêm
  // colados, sem nada que separe os dois. Ler por coluna resolve isso (ver
  // _ffLerPorColuna); aqui, sem coluna, não tem como confiar cegamente —
  // então marca pra CONFERÊNCIA em vez de fingir que o nome saiu certo.
  if (modelo === 'Pensão Alimentícia (SFP0594)') {
    out.forEach(l => {
      if (!l.lidoPorColuna) {
        l.status = 'conferir';
        if (!/conferir nome/i.test(l.origem || '')) l.origem = (l.origem ? l.origem + ' — ' : '') + 'conferir nome (2 pessoas na linha)';
      }
    });
  }

  // Total do documento: modelo 1 usa "Total Geral"; modelo 2 usa a soma dos
  // "Tot.Cliente". Sem nenhum dos dois, fica null (o painel avisa "sem total").
  const totalGeral = (totalGeralM1 !== null) ? totalGeralM1 : (temTotCliente ? somaTotCliente : null);
  return { linhas: out, subTotal, totalGeral, dataPagamentoPdf, relacaoNumero, modelo };
}

// ── Cheques técnicos do fluxo inteiro (auditoria fina) ─────────────────────
function _ffChequesTecnicos(f) {
  const linhas = f.linhas || [];
  const cheques = { cpfInvalidos: [], valoresZerados: [], competencias: [], datasPdf: [], stats: null };

  // 1) Dígito verificador do CPF (alerta, não bloqueio)
  cheques.cpfInvalidos = linhas.filter(l => l.cpf && !_ffCpfValido(l.cpf));

  // 2) Valores zerados/negativos — nunca deveriam existir num pagamento
  // Zerado porque o PDF veio SEM valor (nada a receber) é normal e fica de
  // fora. O que continua sendo apontado é o zerado inesperado, que costuma
  // ser leitura errada do arquivo.
  cheques.valoresZerados = linhas.filter(l => !(Number(l.valor) > 0) && !l.semValorNoPdf);
  cheques.semValorNoPdf = linhas.filter(l => l.semValorNoPdf);

  // 3) Competências encontradas nas linhas (misturadas = alerta)
  cheques.competencias = [...new Set(linhas.map(l => l.competencia).filter(Boolean))];

  // 4) Data de pagamento impressa em cada PDF × data escolhida no fluxo
  const dataFluxoBR = f.dataPagamento
    ? f.dataPagamento.split('-').reverse().join('/')   // 2026-07-15 -> 15/07/2026
    : null;
  (f.arquivos || []).forEach(a => {
    if (a.dataPagamentoPdf) {
      cheques.datasPdf.push({ arquivo: a.nome, dataPdf: a.dataPagamentoPdf, bate: dataFluxoBR === a.dataPagamentoPdf });
    }
  });

  // 5) Estatística dos valores (para enxergar fora-da-curva de longe)
  const vals = linhas.map(l => Number(l.valor) || 0).filter(v => v > 0);
  if (vals.length) {
    const soma = vals.reduce((s, v) => s + v, 0);
    const freq = new Map();
    vals.forEach(v => freq.set(v, (freq.get(v) || 0) + 1));
    const [maisComum, vezes] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
    cheques.stats = {
      menor: Math.min(...vals), maior: Math.max(...vals),
      media: Math.round((soma / vals.length) * 100) / 100,
      maisComum, vezes
    };
  }

  // Competência do fluxo (2026-07) no formato das linhas (07/26), para comparar
  const mComp = String(f.competencia || '').match(/^(\d{4})-(\d{2})$/);
  cheques.compFluxo = mComp ? `${mComp[2]}/${mComp[1].slice(2)}` : null;

  return cheques;
}

// Duplicidades no fluxo inteiro (todos os arquivos juntos). O CPF é o principal
// identificador. NADA é excluído sozinho — só sinalizado para conferência humana.
// ── Quem subiu a ficha ────────────────────────────────────────────────────
// Aparece antes do número em todas as listas: assim dá para saber de bate-
// pronto que a Tayla subiu a #20 e a #12. Fichas antigas, de antes deste
// campo existir, caem no login gravado e, em último caso, mostram "—".
function _ffQuemSubiu(f) {
  if (!f) return '<span class="ff-quem-vazio">—</span>';
  let nome = String(f.criadoPor || '').trim();
  if (!nome && f.criadoPorLogin) {
    const func = (state.funcionarios || []).find(x => x && x.login === f.criadoPorLogin);
    nome = func ? nomeExibido(func) : f.criadoPorLogin;
  }
  if (!nome) return '<span class="ff-quem-vazio" title="Ficha antiga, sem esse registro">—</span>';
  const inic = nome.trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase();
  return '<span class="ff-quem" title="Subiu os arquivos: ' + escapeHTML(nome) + '">' +
    '<span class="ff-quem-bola">' + escapeHTML(inic) + '</span>' +
    '<span class="ff-quem-nome">' + escapeHTML(_ffPrimeiroNome(nome)) + '</span></span>';
}
// Nome curto para caber na coluna sem quebrar a tabela
function _ffPrimeiroNome(nome) {
  const p = String(nome || '').trim().split(/\s+/);
  if (p.length <= 2) return p.join(' ');
  return p[0] + ' ' + p[p.length - 1];
}
window._ffQuemSubiu = _ffQuemSubiu;

// O LOTE é o tipo de pagamento (salário, benefício, rescisão...). A MESMA
// pessoa pode aparecer em lotes diferentes sem ser erro — são pagamentos
// distintos. Duplicidade de verdade é a mesma pessoa DUAS VEZES NO MESMO LOTE.
// Por isso a chave é CPF + LOTE, e não só o CPF.
function _ffLoteDaLinha(l) { return String((l && l.lote) || '').trim(); }
function _ffLoteRotulo(l) { const v = _ffLoteDaLinha(l); return v || '—'; }

function _ffDuplicidades(f) {
  const grupos = { cpf: [], codigo: [], nome: [] };
  const por = (campo, normaliza) => {
    const mapa = new Map();
    (f.linhas || []).forEach(l => {
      const v = normaliza(l[campo]);
      if (!v) return;
      // Mesma pessoa em lotes diferentes = pagamentos diferentes, não é duplicata
      const chave = v + '||lote:' + _ffLoteDaLinha(l);
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(l);
    });
    return [...mapa.entries()].filter(([, ls]) => ls.length > 1)
      .map(([chave, ls]) => ({ chave: chave.split('||lote:')[0], lote: chave.split('||lote:')[1] || '', linhas: ls }));
  };
  grupos.cpf    = por('cpf',    v => String(v || '').replace(/\D/g, ''));
  grupos.codigo = por('codigo', v => String(v || '').trim());
  grupos.nome   = por('nome',   v => String(v || '').trim().toUpperCase());
  return grupos;
}

// ── Aba: render principal ──────────────────────────────────────────────────
let _ffSubAba = 'painel';
let _ffPdfsTemp = [];        // Files escolhidos no modal de novo fluxo
let _ffDetalheId = null;

function trocarSubAbaFF(sub) {
  _ffSubAba = sub;
  document.querySelectorAll('#ff-subtabs .exame-subtab').forEach(b => b.classList.toggle('active', b.dataset.subaba === sub));
  // Os cartões do painel e os contadores das abas são recalculados aqui
  // também: sem isso eles ficavam com o número velho até a pessoa sair e
  // voltar do módulo — e o estorno que acabou de entrar não aparecia.
  try { _ffAtualizarNumeros(); } catch (e) { console.error('KPIs do Fluxo:', e); }
  _ffRenderLista();
}
window.trocarSubAbaFF = trocarSubAbaFF;

function renderFluxoFinanceiro() {
  garantirFluxoFinanceiro();

  const actions = document.getElementById('ff-header-actions');
  if (actions) {
    actions.innerHTML = _ffPodeCriar()
      ? `<button class="mod-btn-primary" onclick="abrirModalNovoFluxo()"><i class="fa-solid fa-plus"></i> + NOVO FLUXO FINANCEIRO</button>`
      : '';
  }
  _ffAtualizarNumeros();
  _ffRenderLista();
}

// Todos os cartões do painel e os números das abas num lugar só, para poderem
// ser recalculados de qualquer lugar (trocar de aba, salvar, reprovar...).
function _ffAtualizarNumeros() {
  garantirFluxoFinanceiro();
  const fluxos = _ffVisiveis();   // cada um vê só o que o papel/permissão permite
  const hoje = new Date(); const p = n => String(n).padStart(2, '0');
  const hojeStr = `${hoje.getFullYear()}-${p(hoje.getMonth() + 1)}-${p(hoje.getDate())}`;
  const amanhaD = new Date(hoje.getTime() + 86400000);
  const amanhaStr = `${amanhaD.getFullYear()}-${p(amanhaD.getMonth() + 1)}-${p(amanhaD.getDate())}`;

  const minhaVez   = fluxos.filter(f => _ffEhMinhaVez(f));
  const andamento  = fluxos.filter(f => ['rascunho', 'aguardando_coordenacao', 'aguardando_gestao', 'aguardando_financeiro'].includes(f.status));
  const finalizados = fluxos.filter(f => ['pago', 'finalizado'].includes(f.status));
  const problemas  = fluxos.filter(f => ['reprovado', 'cancelado'].includes(f.status));
  const pagosHoje  = fluxos.filter(f => ['pago', 'finalizado'].includes(f.status) && f.dataPagamento === hojeStr)
                           .reduce((s, f) => s + _ffTotal(f), 0);
  // PRÉVIA DE AMANHÃ (visão gerencial): tudo que tem pagamento marcado
  // para amanhã e ainda está vivo no fluxo
  const deAmanha = fluxos.filter(f => f.dataPagamento === amanhaStr && f.status !== 'reprovado' && f.status !== 'finalizado');
  const valorAmanha = deAmanha.reduce((s, f) => s + _ffTotal(f), 0);

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('ff-kpi-minha-vez', minhaVez.length);
  set('ff-kpi-andamento', andamento.length);
  set('ff-kpi-amanha', deAmanha.length ? `${_ffMoedaBR(valorAmanha)} · ${deAmanha.length}` : '—');
  set('ff-kpi-hoje', _ffMoedaBR(pagosHoje));
  set('ff-kpi-finalizados', finalizados.length);
  set('ff-count-minha-vez', minhaVez.length);
  set('ff-count-andamento', andamento.length);
  // "A Pagar": tudo que já passou pelas aprovações e espera o Financeiro
  set('ff-count-a-pagar', fluxos.filter(f => f.status === 'aguardando_financeiro').length);
  set('ff-count-finalizados', finalizados.length);
  set('ff-count-problemas', problemas.length);
  set('ff-count-todos', fluxos.length);

  // ── Estornos: contador da aba + cartões do painel + aba piscando ────────
  const estornos = _ffEstornosPendentes();
  set('ff-count-estornos', estornos.length);
  set('ff-kpi-estornos', estornos.length);
  set('ff-kpi-estornos-valor', estornos.length
    ? _ffMoedaBR(_ffTotalEstornosPendentes())
    : 'nada devolvido pelo banco');
  // Estornos que o DP já reenviou — fecha a conta com o cartão de cima
  const resolvidos = _ffEstornosResolvidos();
  set('ff-kpi-estornos-ok', resolvidos.length);
  set('ff-kpi-estornos-ok-valor', resolvidos.length
    ? _ffMoedaBR(resolvidos.reduce((s, e) => s + (Number(e.l.valor) || 0), 0)) + ' já reenviado'
    : 'nenhum reenviado ainda');
  const abaEst = document.querySelector('#ff-subtabs [data-subaba="estornos"]');
  if (abaEst) abaEst.classList.toggle('tem-estorno', estornos.length > 0);
  const cardEst = document.getElementById('ff-card-estornos');
  if (cardEst) cardEst.classList.toggle('tem-estorno', estornos.length > 0);

  // Aba "Gerencial" (planilha) e "Monitoramento" só para quem tem visão geral
  const abaGer = document.querySelector('#ff-subtabs [data-subaba="gerencial"]');
  if (abaGer) abaGer.style.display = _ffVeTudo() ? '' : 'none';
  const abaMon = document.querySelector('#ff-subtabs [data-subaba="monitor"]');
  if (abaMon) abaMon.style.display = _ffVeTudo() ? '' : 'none';
  // Aba "Configuração do Fluxo" só para quem administra o workflow (admin/mestre)
  const abaCfg = document.querySelector('#ff-subtabs [data-subaba="config"]');
  if (abaCfg) abaCfg.style.display = _ffPodeAdministrarWorkflow() ? '' : 'none';

  atualizarBadgeFluxoFinanceiro();
}
window._ffAtualizarNumeros = _ffAtualizarNumeros;

// Bolinha vermelha no menu lateral com o nº de fluxos aguardando VOCÊ
function atualizarBadgeFluxoFinanceiro() {
  const item = document.querySelector('#nav-item-fluxo-financeiro a');
  if (!item) return;
  const antigo = item.querySelector('.ff-nav-badge');
  if (antigo) antigo.remove();
  if (!loggedUser || !_ffPodeVer() || !state || !state.fluxosFinanceiros) return;
  const n = state.fluxosFinanceiros.filter(f => _ffEhMinhaVez(f) && f.status !== 'rascunho').length;
  if (!n) return;
  const b = document.createElement('span');
  b.className = 'ff-nav-badge';
  b.textContent = n > 9 ? '9+' : String(n);
  item.appendChild(b);
}

// ── PAINEL do módulo Fluxo Financeiro (dentro da própria aba) ──────────────
// Visão de comando: quanto está parado em cada etapa, o que paga amanhã/hoje,
// atrasados, gargalos e os últimos movimentos. Respeita a visibilidade da
// pessoa (analista vê só o dele; supervisão/gerencial veem tudo).
function _ffRenderPainel(cont) {
  // Avisos de divergência: ficam AQUI, no painel do Fluxo Financeiro, que é
  // onde o assunto pertence. Só aparecem quando há algo pendente.
  setTimeout(function () { try { _rtRenderAvisos(); } catch (e) { console.error('[RT] avisos:', e); } }, 0);
  const fluxos = _ffVisiveis();
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const p = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const hojeStr = ymd(hoje);
  const amanhaStr = ymd(new Date(hoje.getTime() + 86400000));

  const vivos = fluxos.filter(f => f.status !== 'reprovado');
  const somaDe = arr => arr.reduce((s, f) => s + _ffTotal(f), 0);

  const porEtapa = {
    rascunho:               fluxos.filter(f => f.status === 'rascunho'),
    aguardando_coordenacao: fluxos.filter(f => f.status === 'aguardando_coordenacao'),
    aguardando_gestao:      fluxos.filter(f => f.status === 'aguardando_gestao'),
    aguardando_financeiro:  fluxos.filter(f => f.status === 'aguardando_financeiro'),
    pago:                   fluxos.filter(f => f.status === 'pago'),
    finalizado:             fluxos.filter(f => f.status === 'finalizado'),
    reprovado:              fluxos.filter(f => f.status === 'reprovado')
  };
  const minhaVez = fluxos.filter(f => _ffEhMinhaVez(f));
  const pagaAmanha = fluxos.filter(f => f.dataPagamento === amanhaStr && !['finalizado', 'reprovado'].includes(f.status));
  const pagaHoje   = fluxos.filter(f => f.dataPagamento === hojeStr && !['finalizado', 'reprovado'].includes(f.status));
  const pagosHoje  = fluxos.filter(f => ['pago', 'finalizado'].includes(f.status) && f.dataPagamento === hojeStr);
  const atrasados  = fluxos.filter(f => { const pz = _ffPrazo(f); return pz && pz.nivel === 'atrasado'; });
  const semCompr   = fluxos.filter(f => f.status === 'pago');
  const totalAberto = somaDe(vivos.filter(f => !['finalizado'].includes(f.status)));

  // Agrupamento por Empresa para o Pagamento de Amanhã
  const empresasAmanha = {};
  pagaAmanha.forEach(f => {
    const nome = f.empresaNome || 'Outras Empresas';
    if (!empresasAmanha[nome]) empresasAmanha[nome] = { qtd: 0, valor: 0 };
    empresasAmanha[nome].qtd += (f.linhas || []).length;
    empresasAmanha[nome].valor += _ffTotal(f);
  });
  const listaEmpresasAmanha = Object.entries(empresasAmanha);

  // Barra de etapas: quanto tem parado em cada fase (só as vivas)
  const etapaCard = (chave, rot) => {
    const arr = porEtapa[chave]; const st = FF_STATUS[chave];
    return `<div onclick="_ffPainelIr('${chave}')" class="ff-etapa-card">
      <div class="ff-etapa-card-top"><span style="color:${st.cor};"><i class="fa-solid ${st.icone}"></i></span>
        <span class="ff-etapa-card-num">${arr.length}</span></div>
      <div class="ff-etapa-card-lbl">${rot}</div>
      <div class="ff-etapa-card-val">${arr.length ? _ffMoedaBR(somaDe(arr)) : '—'}</div>
    </div>`;
  };

  // Próximos pagamentos (ordenados por data, os vivos)
  const proximos = [...vivos]
    .filter(f => f.dataPagamento)
    .sort((a, b) => String(a.dataPagamento).localeCompare(String(b.dataPagamento)))
    .slice(0, 6);

  // Últimos movimentos (do histórico de todos os fluxos visíveis)
  const movimentos = [];
  fluxos.forEach(f => (f.historico || []).forEach(h => movimentos.push({ ...h, numero: f.numero })));
  movimentos.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));

  cont.innerHTML = `
    <!-- HERO CARD: PAGAMENTOS PARA AMANHÃ -->
    <div class="ff-hero-amanha">
      <div class="ff-hero-amanha-header">
        <div class="ff-hero-amanha-title">
          <i class="fa-solid fa-clock-rotate-left"></i> PAGAMENTOS PARA AMANHÃ
        </div>
        <div class="ff-hero-amanha-date-badge">
          <i class="fa-solid fa-calendar-day"></i> ${_formatarDataBR(amanhaStr)}
        </div>
      </div>
      
      <div class="ff-hero-amanha-main">
        <div class="ff-hero-amanha-bigval">
          <div class="ff-hero-amanha-amount">${_ffMoedaBR(somaDe(pagaAmanha))}</div>
          <div class="ff-hero-amanha-count">${pagaAmanha.length} processo(s) agendado(s)</div>
          <div class="ff-hero-amanha-sublabel">VALOR TOTAL PREVISTO</div>
        </div>

        <div>
          <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">
            <i class="fa-solid fa-building"></i> Divisão por Empresa
          </div>
          ${listaEmpresasAmanha.length ? `
            <div class="ff-company-grid">
              ${listaEmpresasAmanha.map(([emp, d]) => `
                <div class="ff-company-card">
                  <div class="ff-company-name">${escapeHTML(emp)}</div>
                  <div class="ff-company-qty">${d.qtd} pagamento(s)</div>
                  <div class="ff-company-val">${_ffMoedaBR(d.valor)}</div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div style="font-size:12.5px;color:#94a3b8;padding:12px;background:#f8fafc;border-radius:8px;border:1px dashed #e2e8f0;">
              Nenhum pagamento agendado especificamente para amanhã.
            </div>
          `}
        </div>
      </div>
    </div>

    <!-- PAINEL DE ETAPAS -->
    <div class="exame-detalhe-laudo" style="margin-top:20px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;padding:20px;">
      <h4 style="display:flex;align-items:center;justify-content:space-between;margin:0 0 14px 0;">
        <span><i class="fa-solid fa-diagram-project" style="color:#0284c7;"></i> Status dos Processos do Fluxo</span>
        <span style="font-size:12px;font-weight:600;color:#059669;background:rgba(5,150,105,0.08);padding:4px 12px;border-radius:16px;">
          ${_ffMoedaBR(totalAberto)} em aberto
        </span>
      </h4>
      <div class="ff-etapas-summary-grid">
        ${etapaCard('rascunho', 'Conferência DP')}
        ${etapaCard('aguardando_coordenacao', 'Supervisão DP')}
        ${etapaCard('aguardando_gestao', 'Gestão')}
        ${etapaCard('aguardando_financeiro', 'Financeiro')}
        ${etapaCard('pago', 'Falta comprovante')}
        ${etapaCard('finalizado', 'Finalizados')}
      </div>
      ${porEtapa.reprovado.length ? `<div style="margin-top:12px;font-size:12px;color:#DC2626;font-weight:600;"><i class="fa-solid fa-circle-xmark"></i> ${porEtapa.reprovado.length} reprovado(s) — <a href="#" onclick="trocarSubAbaFF('problemas');return false;" style="color:#DC2626;text-decoration:underline;">ver problemas</a></div>` : ''}
      ${semCompr.length ? `<div style="margin-top:6px;font-size:12px;color:#D97706;font-weight:600;"><i class="fa-solid fa-receipt"></i> ${semCompr.length} pago(s) aguardando envio de comprovante</div>` : ''}
    </div>

    <!-- PRÓXIMOS PAGAMENTOS E ÚLTIMOS MOVIMENTOS -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px;" class="ff-p-2col">
      <!-- Próximos pagamentos -->
      <div class="ff-table-container" style="padding:18px;">
        <h4 style="margin:0 0 14px 0;font-size:14px;font-weight:600;color:#0f172a;display:flex;align-items:center;gap:8px;">
          <i class="fa-solid fa-calendar-check" style="color:#2563eb;"></i> Próximos Pagamentos
        </h4>
        ${proximos.length ? `
          <div class="table-scroll-container">
            <table class="ff-table">
              <thead><tr><th>Data</th><th>Empresa</th><th>Tipo</th><th style="text-align:right;">Valor</th><th>Status</th></tr></thead>
              <tbody>
                ${proximos.map(f => {
                  const pz = _ffPrazo(f); const st = FF_STATUS[f.status] || FF_STATUS.rascunho;
                  return `<tr onclick="abrirDetalheFluxo('${f.id}')" style="cursor:pointer;">
                    <td style="white-space:nowrap;font-weight:600;">${_formatarDataBR(f.dataPagamento)}${pz && pz.nivel !== 'ok' ? `<div class="ff-prazo-tag ff-prazo-${pz.nivel}">${pz.rotulo}</div>` : ''}</td>
                    <td style="font-weight:600;">${escapeHTML(f.empresaNome)}</td>
                    <td>${escapeHTML(f.tipo)}</td>
                    <td style="text-align:right;" class="ff-val-destaque">${_ffMoedaBR(_ffTotal(f))}</td>
                    <td><span class="ff-badge ff-badge-${f.status}" style="color:${st.cor};">${st.rotulo}</span></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : `<div class="ff-empty-box" style="padding:24px 12px;"><i class="fa-solid fa-calendar-xmark" style="font-size:24px;color:#cbd5e1;"></i><p style="margin:8px 0 0;font-size:12px;color:#94a3b8;">Nenhum pagamento agendado.</p></div>`}
      </div>

      <!-- Últimos movimentos -->
      <div class="ff-table-container" style="padding:18px;">
        <h4 style="margin:0 0 14px 0;font-size:14px;font-weight:600;color:#0f172a;display:flex;align-items:center;gap:8px;">
          <i class="fa-solid fa-clock-rotate-left" style="color:#7c3aed;"></i> Últimas Atividades
        </h4>
        ${movimentos.length ? `
          <div style="max-height:300px;overflow-y:auto;padding-right:6px;">
            ${movimentos.slice(0, 10).map(m => `
              <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px dashed #e2e8f0;font-size:12px;">
                <span style="color:#94a3b8;white-space:nowrap;font-size:11px;">${_formatarDataHoraBR(m.data)}</span>
                <span style="min-width:0;color:#334155;"><strong>#${escapeHTML(m.numero)}</strong> · <span style="color:#0f172a;font-weight:600;">${escapeHTML(m.usuario)}</span> — ${escapeHTML(String(m.acao).slice(0, 70))}</span>
              </div>`).join('')}
          </div>
        ` : `<div class="ff-empty-box" style="padding:24px 12px;"><i class="fa-solid fa-history" style="font-size:24px;color:#cbd5e1;"></i><p style="margin:8px 0 0;font-size:12px;color:#94a3b8;">Sem histórico de atividades.</p></div>`}
      </div>
    </div>`;
}

// Clicar num card de etapa do painel leva para a lista filtrada certa
window._ffPainelIr = function(chave) {
  if (chave === 'rascunho' || chave === 'aguardando_coordenacao' || chave === 'aguardando_gestao' || chave === 'aguardando_financeiro') {
    trocarSubAbaFF('andamento');
  } else if (chave === 'pago' || chave === 'finalizado') {
    trocarSubAbaFF('finalizados');
  } else if (chave === 'reprovado') {
    trocarSubAbaFF('problemas');
  } else {
    trocarSubAbaFF('todos');
  }
};

let _ffFiltroBusca = '';
let _ffFiltroEmpresa = '';

// Tempo decorrido humanizado ("há 2h 15min", "há 3 dias")
function _ffTempoDesde(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'agora';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `há ${h}h ${String(min % 60).padStart(2, '0')}min`;
  return `há ${Math.floor(h / 24)} dias`;
}
function _ffEtapaAtualId(f) { return FF_STATUS_ETAPA[f && f.status] || null; }
// "Desde quando" o processo está parado na etapa atual (envio, aprovação anterior, ou criação)
function _ffAguardandoDesde(f) {
  if (f.status === 'aguardando_coordenacao') return f.enviadoEm || f.criadoEm;
  if (f.status === 'aguardando_gestao')      return (f.aprovacoes && f.aprovacoes.coordenacao && f.aprovacoes.coordenacao.em) || f.enviadoEm;
  if (f.status === 'aguardando_financeiro' || f.status === 'pago') return (f.aprovacoes && f.aprovacoes.gestao && f.aprovacoes.gestao.em) || f.enviadoEm;
  return f.criadoEm;
}

// ── CONFIGURAÇÃO DO FLUXO DE APROVAÇÃO (admin) ─────────────────────────────
// O admin define QUEM é o responsável de cada etapa. Sem responsável marcado,
// valem os papéis-padrão por departamento (retrocompatível). Salva na hora.
function _ffRenderConfig(cont) {
  garantirFluxoFinanceiro();
  const ativos = (state.funcionarios || []).filter(f => f.status === 'ativo')
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
  const etapas = [
    { id: 'criar',       n: '1', titulo: 'Criação / Conferência',  acoes: [] },
    { id: 'coordenacao', n: '2', titulo: 'Supervisão do DP',       acoes: [['aprovar', 'Aprovar'], ['devolver', 'Devolver'], ['reprovar', 'Reprovar']] },
    { id: 'gestao',      n: '3', titulo: 'Gestão',                 acoes: [['aprovar', 'Aprovar'], ['devolver', 'Devolver'], ['reprovar', 'Reprovar']] },
    { id: 'financeiro',  n: '4', titulo: 'Financeiro',             acoes: [['pagar', 'Pagar'], ['comprovante', 'Anexar comprovante'], ['devolver', 'Devolver']] }
  ];
  const cardEtapa = e => {
    const cfg = _ffCfg(e.id);
    const resp = _ffResponsaveis(e.id);
    const listaPessoas = ativos.map(fu => {
      const marc = resp.includes(fu.login);
      return `<label style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:8px;cursor:pointer;font-size:12.5px;${marc ? 'background:rgba(2,132,199,.10);' : ''}">
        <input type="checkbox" ${marc ? 'checked' : ''} onchange="ffToggleResponsavel('${e.id}','${fu.login}')">
        <span style="font-weight:${marc ? '700' : '500'};color:#0f172a;">${escapeHTML(nomeExibido(fu))}</span>
        <span style="color:#94a3b8;font-size:11px;">@${escapeHTML(fu.login)} · ${escapeHTML(deptoLabelSimples(fu.departamento) || fu.departamento || '')}</span>
      </label>`;
    }).join('');
    const acoesHtml = e.acoes.length ? `<div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;padding-top:8px;border-top:1px dashed var(--border-color);">
      ${e.acoes.map(([k, rot]) => `<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">
        <input type="checkbox" ${cfg[k] !== false ? 'checked' : ''} onchange="ffToggleAcaoEtapa('${e.id}','${k}')"> ${rot}</label>`).join('')}
    </div>` : '';
    return `<div style="border:1px solid var(--border-color);border-radius:12px;padding:14px;background:var(--card-bg,#fff);">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <span style="width:26px;height:26px;border-radius:50%;background:#0284c7;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;">${e.n}</span>
        <div>
          <div style="font-weight:600;font-size:14px;color:#0f172a;">${escapeHTML(e.titulo)}</div>
          <div style="font-size:11px;color:#64748b;">Setor: ${escapeHTML(cfg.setor || '—')} · Função: ${escapeHTML(cfg.funcao || '—')}</div>
        </div>
      </div>
      <div style="font-size:11px;font-weight:600;color:${resp.length ? '#0284c7' : '#D97706'};margin:6px 0;">
        ${resp.length ? `<i class="fa-solid fa-user-check"></i> ${resp.length} responsável(is) definido(s)` : '<i class="fa-solid fa-triangle-exclamation"></i> Sem responsável — usando o padrão por departamento'}
      </div>
      <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border-color);border-radius:8px;padding:4px;">${listaPessoas || '<div style="padding:10px;color:#94a3b8;font-size:12px;">Nenhum funcionário ativo.</div>'}</div>
      ${acoesHtml}
    </div>`;
  };
  cont.innerHTML = `
    <div style="margin-bottom:14px;">
      <h3 style="margin:0 0 4px;font-size:16px;font-weight:600;color:#0f172a;"><i class="fa-solid fa-sliders" style="color:#0284c7;"></i> Configuração do Fluxo de Aprovação</h3>
      <p style="margin:0;font-size:12.5px;color:#64748b;">Defina QUEM é o responsável de cada etapa. Se alguém sair da empresa, é só trocar aqui — o fluxo continua funcionando, sem mexer no sistema. As alterações são salvas na hora.</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;">
      ${etapas.map(cardEtapa).join('')}
    </div>`;
}

window.ffToggleResponsavel = async function(etapaId, login) {
  if (!_ffPodeAdministrarWorkflow()) return;
  garantirFluxoFinanceiro();
  const et = state.ffWorkflow[etapaId];
  if (!Array.isArray(et.responsaveis)) et.responsaveis = [];
  const i = et.responsaveis.indexOf(login);
  const fu = (state.funcionarios || []).find(x => x.login === login);
  if (i >= 0) et.responsaveis.splice(i, 1);
  else et.responsaveis.push(login);
  registrarLogGlobal(`Fluxo Financeiro — ${i >= 0 ? 'removeu' : 'definiu'} "${fu ? fu.nome : login}" como responsável da etapa "${etapaId}".`, 'dp');
  try {
    // setKeys: ffWorkflow e um OBJETO de configuracao, nao uma lista com id.
    // Sem marcar a chave, um save feito com a versao atrasada caia no merge
    // anti-perda, que mantem a configuracao do SERVIDOR e descarta a nova --
    // a tela mostrava o responsavel trocado e ele voltava sozinho depois.
    if (window.RTCloud && RTCloud.configured && typeof RTCloud.salvarAgora === 'function') await RTCloud.salvarAgora(state, { merge: true, setKeys: ['ffWorkflow'] });
    else saveState();
  } catch (e) { alert('Não salvou: ' + (e.message || e)); }
  _ffRenderLista();
};

window.ffToggleAcaoEtapa = async function(etapaId, acao) {
  if (!_ffPodeAdministrarWorkflow()) return;
  garantirFluxoFinanceiro();
  const et = state.ffWorkflow[etapaId];
  et[acao] = (et[acao] === false);   // alterna (default é true)
  try {
    // setKeys: ffWorkflow e um OBJETO de configuracao, nao uma lista com id.
    // Sem marcar a chave, um save feito com a versao atrasada caia no merge
    // anti-perda, que mantem a configuracao do SERVIDOR e descarta a nova --
    // a tela mostrava o responsavel trocado e ele voltava sozinho depois.
    if (window.RTCloud && RTCloud.configured && typeof RTCloud.salvarAgora === 'function') await RTCloud.salvarAgora(state, { merge: true, setKeys: ['ffWorkflow'] });
    else saveState();
  } catch (e) { alert('Não salvou: ' + (e.message || e)); }
  _ffRenderLista();
};

// ── MONITORAMENTO DO WORKFLOW (admin) ──────────────────────────────────────
// Onde está cada processo, com quem, há quanto tempo — para achar gargalos.
function _ffRenderMonitor(cont) {
  garantirFluxoFinanceiro();
  const emAndamento = state.fluxosFinanceiros
    .filter(f => ['aguardando_coordenacao', 'aguardando_gestao', 'aguardando_financeiro', 'pago'].includes(f.status))
    .map(f => ({ f, desde: _ffAguardandoDesde(f) }))
    .sort((a, b) => String(a.desde || '').localeCompare(String(b.desde || '')));   // mais parado primeiro
  const linha = ({ f, desde }) => {
    const st = FF_STATUS[f.status] || FF_STATUS.rascunho;
    const etId = _ffEtapaAtualId(f);
    const nomes = etId ? _ffNomesResponsaveis(etId) : [];
    const cfg = etId ? _ffCfg(etId) : {};
    const parado = Date.now() - new Date(desde || f.criadoEm).getTime();
    const alerta = parado > 86400000 ? '#DC2626' : (parado > 14400000 ? '#D97706' : '#059669');   // >24h vermelho, >4h laranja
    return `<tr>
      <td>${_ffQuemSubiu(f)}</td>
      <td style="font-weight:600;color:#0284c7;">#${escapeHTML(f.numero)}</td>
      <td style="font-weight:600;">${escapeHTML(f.empresaNome || '—')}</td>
      <td class="ff-val-destaque">${_ffMoedaBR(_ffTotal(f))}</td>
      <td><span class="ff-badge" style="color:${st.cor};">${st.rotulo}</span><div style="font-size:10px;color:#64748b;">${escapeHTML(cfg.setor || '')}</div></td>
      <td>${nomes.length ? escapeHTML(nomes.join(', ')) : `<span style="color:#94a3b8;">padrão (${escapeHTML(cfg.funcao || '')})</span>`}</td>
      <td>${_formatarDataHoraBR(desde)}</td>
      <td style="font-weight:600;color:${alerta};">${_ffTempoDesde(desde)}</td>
    </tr>`;
  };
  cont.innerHTML = `
    <div style="margin-bottom:14px;">
      <h3 style="margin:0 0 4px;font-size:16px;font-weight:600;color:#0f172a;"><i class="fa-solid fa-tower-broadcast" style="color:#0284c7;"></i> Monitoramento do Workflow</h3>
      <p style="margin:0;font-size:12.5px;color:#64748b;">Todo processo em andamento, com quem está parado e há quanto tempo. 🟢 no prazo · 🟡 mais de 4h · 🔴 mais de 24h.</p>
    </div>
    ${emAndamento.length ? `<div class="ff-table-container"><table class="ff-table">
      <thead><tr><th>Enviado por</th><th>Nº</th><th>Empresa</th><th style="text-align:right;">Valor</th><th>Etapa atual</th><th>Responsável</th><th>Aguardando desde</th><th>Tempo parado</th></tr></thead>
      <tbody>${emAndamento.map(linha).join('')}</tbody>
    </table></div>` : `<div class="ff-empty-box"><div class="ff-empty-icon"><i class="fa-solid fa-mug-hot"></i></div><div class="ff-empty-title">Nada parado 👌</div><div class="ff-empty-text">Não há processos aguardando ação no momento.</div></div>`}`;
}


// ══════════════════════════════════════════════════════════════════════════
// TELA "A PAGAR" — uso do Financeiro
// --------------------------------------------------------------------------
// Junta, de TODAS as empresas, as fichas que já passaram por todas as
// aprovações e estão prontas para pagar. O filtro é pela DATA DE ENVIO AO
// FINANCEIRO (f.enviadoEm), não pela data do documento — é assim que o
// financeiro trabalha: "o que entrou para eu pagar nesse período".
// ══════════════════════════════════════════════════════════════════════════
let _ffPagarDe = '', _ffPagarAte = '', _ffPagarBusca = '';
let _ffFinBuscaPessoa = '';
let _ffPagarSelecao = {};

// Data em que a ficha chegou ao Financeiro. Fichas antigas (de antes deste
// campo existir) caem para a aprovação da gestão e, por último, para a criação.

// Selo colorido do status — mesmo visual usado na lista principal.
function _ffSelo(f) {
  const st = FF_STATUS[f && f.status] || FF_STATUS.rascunho;
  return '<span class="ff-status-badge" style="background:' + st.cor + '1A;color:' + st.cor + ';">' +
         '<i class="fa-solid ' + st.icone + '"></i> ' + escapeHTML(st.rotulo) + '</span>';
}

function _ffDataEnvioFinanceiro(f) {
  return (f && (f.enviadoEm
    || (f.aprovacoes && f.aprovacoes.gestao && f.aprovacoes.gestao.em)
    || f.criadoEm)) || '';
}
function _ffSoData(iso) { return String(iso || '').slice(0, 10); }

// Número(s) da RELAÇÃO impressos no PDF do banco ("relação N. 0004847"). É o
// código que identifica cada remessa bancária — o Financeiro usa ele para
// achar a bancária no extrato, então precisa ficar visível e ser pesquisável.
function _ffRelacoes(f) {
  const arr = (f && Array.isArray(f.arquivos) ? f.arquivos : [])
    .map(a => a && a.relacaoNumero).filter(Boolean).map(String);
  return [...new Set(arr)];
}
// Cada linha guarda de qual PDF ela veio (l.arquivo). Aqui achamos esse
// arquivo dentro da ficha para responder "essa pessoa está em qual nota, e
// qual é o número DELA" — em vez de listar os números de todos os arquivos.
function _ffArquivoDaLinha(f, l) {
  const nome = String((l && l.arquivo) || '');
  const arqs = (f && Array.isArray(f.arquivos)) ? f.arquivos : [];
  if (!arqs.length) return null;
  const achado = nome ? arqs.find(a => a && String(a.nome || '') === nome) : null;
  // Se a ficha só tem UM arquivo, a pessoa só pode ter vindo dele.
  return achado || (arqs.length === 1 ? arqs[0] : null);
}

function _ffRelacaoTexto(f) {
  const r = _ffRelacoes(f);
  return r.length ? r.join(' · ') : '';
}
function _ffSeloRelacao(f) {
  const r = _ffRelacoes(f);
  if (!r.length) return '<span class="ff-relacao ff-relacao-vazia" title="O PDF não trouxe o número da relação">sem nº</span>';
  return r.map(n => '<span class="ff-relacao" title="Número da relação bancária (código da remessa)">N. ' + escapeHTML(n) + '</span>').join(' ');
}

function _ffQtdColaboradores(f) {
  return Array.isArray(f && f.linhas) ? f.linhas.length : 0;
}

// Linhas (pessoas) de uma ficha que batem com o que foi digitado — por nome
// ou por CPF. Usada tanto para filtrar as fichas quanto para montar o bloco
// "achei fulano em tal ficha".
function _ffLinhasQueBatem(f, q) {
  const termo = String(q || '').trim().toLowerCase();
  if (!termo) return [];
  const soDigitos = termo.replace(/\D/g, '');
  const out = [];
  (Array.isArray(f.linhas) ? f.linhas : []).forEach(function (l, i) {
    if (!l) return;
    const nome = String(l.nome || '').toLowerCase();
    const cpf = String(l.cpf || '').replace(/\D/g, '');
    const bateNome = termo.length >= 2 && nome.includes(termo);
    const bateCpf = soDigitos.length >= 3 && cpf.includes(soDigitos);
    if (bateNome || bateCpf) out.push({ l: l, posicao: i + 1 });
  });
  return out;
}

function _ffFiltraPorEnvio(lista) {
  return lista.filter(f => {
    const d = _ffSoData(_ffDataEnvioFinanceiro(f));
    if (_ffPagarDe && (!d || d < _ffPagarDe)) return false;
    if (_ffPagarAte && (!d || d > _ffPagarAte)) return false;
    if (_ffPagarBusca) {
      const q = _ffPagarBusca.toLowerCase().trim();
      // O MESMO campo procura ficha e COLABORADOR: quem digita um nome não
      // precisa saber em qual ficha a pessoa está — é justamente isso que ele
      // quer descobrir. Nome e CPF das linhas entram na busca junto com o
      // número, a empresa e o tipo.
      const alvo = [f.numero, f.empresaNome, f.tipo, _ffIdentificacao(f), _ffRelacaoTexto(f)].join(' ').toLowerCase();
      if (alvo.includes(q)) return true;
      return _ffLinhasQueBatem(f, q).length > 0;
    }
    return true;
  });
}

function _ffBarraFiltroEnvio(tela) {
  const ehFin = tela === 'fin';
  return '<div class="ff-filtros-envio">' +
    '<div class="ff-filtro-campo"><label>Enviado ao financeiro — de</label>' +
      '<input type="date" id="ff-filtro-de" class="form-control" value="' + escapeHTML(_ffPagarDe) + '" onchange="ffFiltroEnvio(\'de\', this.value)"></div>' +
    '<div class="ff-filtro-campo"><label>até</label>' +
      '<input type="date" id="ff-filtro-ate" class="form-control" value="' + escapeHTML(_ffPagarAte) + '" onchange="ffFiltroEnvio(\'ate\', this.value)"></div>' +
    '<div class="ff-filtro-campo ff-filtro-cresce">' +
      // id fixo: é ele que permite devolver o foco depois de redesenhar a lista
      '<label>' + (ehFin ? 'Buscar colaborador (nome ou CPF)' : 'Buscar ficha OU colaborador') + '</label>' +
      '<input type="text" id="ff-filtro-busca" class="form-control" placeholder="' +
      (ehFin ? 'Ex.: João Silva — procura em TODAS as fichas'
             : 'Nome, CPF, nº da ficha, empresa ou tipo') + '"' +
      ' value="' + escapeHTML(ehFin ? _ffFinBuscaPessoa : _ffPagarBusca) + '"' +
      ' oninput="ffFiltroEnvio(\'' + (ehFin ? 'pessoa' : 'busca') + '\', this.value)"></div>' +
    '<button class="btn btn-secondary" onclick="ffFiltroEnvio(\'limpar\')"><i class="fa-solid fa-eraser"></i> Limpar</button>' +
  '</div>';
}

// ── O campo perdia o foco a cada letra ────────────────────────────────────
// Ao digitar, a lista inteira é redesenhada e o input é recriado do zero —
// o cursor ia embora e era preciso clicar de novo a cada tecla. Aqui a gente
// guarda quem estava com o foco e onde estava o cursor, redesenha, e devolve.
function _rtComFoco(render) {
  const antes = document.activeElement;
  const id = antes && antes.id;
  const ini = (antes && antes.selectionStart != null) ? antes.selectionStart : null;
  const fim = (antes && antes.selectionEnd != null) ? antes.selectionEnd : null;
  render();
  if (!id) return;
  const depois = document.getElementById(id);
  if (!depois || depois === antes) return;
  try {
    depois.focus({ preventScroll: true });
    if (ini != null && depois.setSelectionRange) depois.setSelectionRange(ini, fim);
  } catch (e) { /* campo que não aceita seleção: o foco já basta */ }
}
window._rtComFoco = _rtComFoco;

window.ffFiltroEnvio = function (campo, valor) {
  if (campo === 'de') _ffPagarDe = valor;
  else if (campo === 'ate') _ffPagarAte = valor;
  else if (campo === 'busca') _ffPagarBusca = valor;
  else if (campo === 'pessoa') _ffFinBuscaPessoa = valor;
  else if (campo === 'limpar') { _ffPagarDe = ''; _ffPagarAte = ''; _ffPagarBusca = ''; _ffFinBuscaPessoa = ''; }
  _rtComFoco(_ffRenderLista);
};


// ══════════════════════════════════════════════════════════════════════════
// REPROVAR UMA PESSOA DENTRO DA FICHA (e o conserto de volta)
// --------------------------------------------------------------------------
// O banco devolve o pagamento de UMA pessoa (Pix errado, conta errada...).
// Antes só dava para reprovar a ficha inteira. Agora o Financeiro reprova a
// LINHA daquela pessoa, escreve o motivo, e a ficha volta a aparecer em
// "Minha vez" para quem a montou. Essa pessoa corrige, descreve o que estava
// errado e o que é o certo, e a ficha volta para o Financeiro conferir.
//
// Situações da linha:
//   ok         → conferida, sem problema
//   conferir   → o sistema não teve certeza ao ler o PDF
//   reprovado  → o Financeiro devolveu (tem l.reprovacao com o motivo)
//   corrigido  → quem montou já ajustou (tem l.correcao) e espera conferência
// ══════════════════════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════════════════════
// PAINEL DE AVISOS (divergências que esperam alguém)
// --------------------------------------------------------------------------
// Não é uma aba fixa: ele só EXISTE quando há algo pendente. Sem pendência,
// o painel some por completo e o Dashboard fica como sempre foi.
//
// Aparece para quem precisa agir:
//  - Pagamento REPROVADO  → para quem montou a ficha (e para a Supervisão)
//  - Correção FEITA       → para o Financeiro conferir
// ══════════════════════════════════════════════════════════════════════════

// Junta tudo que está pendente PARA MIM, em uma lista pronta de exibir.
function _rtAvisosPendentes() {
  const avisos = [];
  if (!loggedUser) return avisos;
  const fluxos = Array.isArray(state.fluxosFinanceiros) ? state.fluxosFinanceiros : [];

  fluxos.forEach(f => {
    if (!f || !Array.isArray(f.linhas)) return;
    const souDono = _ffEhDonoDaFicha(f);
    const souSupervisao = (typeof _ffEhCoordenacao === 'function') && _ffEhCoordenacao();
    const souFinanceiro = (typeof _ffEhFinanceiro === 'function') && _ffEhFinanceiro();
    const vejoTudo = (typeof _ffVeTudo === 'function') && _ffVeTudo();

    f.linhas.forEach((l, i) => {
      if (!l) return;
      if (l.status === 'reprovado' && (souDono || souSupervisao || vejoTudo)) {
        avisos.push({
          tipo: 'reprovado', fluxo: f, linha: l, indice: i,
          quando: (l.reprovacao && l.reprovacao.em) || f.criadoEm || ''
        });
      } else if (l.status === 'corrigido' && (souFinanceiro || vejoTudo)) {
        avisos.push({
          tipo: 'corrigido', fluxo: f, linha: l, indice: i,
          quando: (l.correcao && l.correcao.em) || ''
        });
      }
    });
  });
  // mais recentes primeiro
  return avisos.sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
}

function _rtRenderAvisos() {
  const cont = document.getElementById('ff-avisos');
  if (!cont) return;
  let avisos = [];
  try { avisos = _rtAvisosPendentes(); } catch (e) { console.error('[RT] avisos:', e); }

  if (!avisos.length) { cont.innerHTML = ''; return; }   // sem pendência: nem existe

  const reprovados = avisos.filter(a => a.tipo === 'reprovado');
  const corrigidos = avisos.filter(a => a.tipo === 'corrigido');

  const cartao = a => {
    const f = a.fluxo, l = a.linha;
    const rel = (typeof _ffRelacaoTexto === 'function') ? _ffRelacaoTexto(f) : '';
    const emp = (typeof _ffIdentificacao === 'function') ? _ffIdentificacao(f) : (f.empresaNome || '—');
    const reprovado = a.tipo === 'reprovado';
    const detalhe = reprovado
      ? '<div class="rt-aviso-motivo"><b>Motivo:</b> ' + escapeHTML((l.reprovacao && l.reprovacao.motivo) || '—') + '</div>'
      : '<div class="rt-aviso-motivo"><b>Estava:</b> ' + escapeHTML((l.correcao && l.correcao.oQueEstavaErrado) || '—') +
        '<br><b>Corrigido para:</b> ' + escapeHTML((l.correcao && l.correcao.oCorreto) || '—') +
        ((l.correcao && l.correcao.observacao) ? '<br><b>Obs.:</b> ' + escapeHTML(l.correcao.observacao) : '') + '</div>';
    const autor = reprovado ? (l.reprovacao && l.reprovacao.por) : (l.correcao && l.correcao.por);
    const quando = (typeof _ffDataHora === 'function') ? _ffDataHora(a.quando) : '';

    return '<article class="rt-aviso-card ' + (reprovado ? 'rt-aviso-vermelho' : 'rt-aviso-azul') + '">' +
      '<header class="rt-aviso-topo">' +
        '<span class="rt-aviso-tag">' + (reprovado ? 'Pagamento reprovado' : 'Correção para conferir') + '</span>' +
        (rel ? '<span class="rt-aviso-relacao" title="Número da relação bancária">N. ' + escapeHTML(rel) + '</span>' : '') +
      '</header>' +
      '<h4 class="rt-aviso-pessoa">' + escapeHTML(l.nome || '(sem nome)') +
        (l.cpf ? ' <span class="rt-aviso-cpf">CPF ' + escapeHTML(l.cpf) + '</span>' : '') + '</h4>' +
      '<div class="rt-aviso-onde">' + escapeHTML(emp) + ' &middot; Ficha #' + escapeHTML(f.numero || '—') +
        ' &middot; ' + escapeHTML(f.tipo || '') + '</div>' +
      detalhe +
      '<footer class="rt-aviso-rodape">' +
        '<span class="rt-aviso-quem">' + escapeHTML(autor || '') + (quando ? ' &middot; ' + quando : '') + '</span>' +
        '<button class="btn btn-sm btn-primary" onclick="rtAbrirAviso(\'' + f.id + '\')">' +
          (reprovado ? 'Corrigir agora' : 'Conferir') + '</button>' +
      '</footer>' +
    '</article>';
  };

  cont.innerHTML =
    '<section class="rt-avisos-painel">' +
      '<header class="rt-avisos-cabecalho">' +
        '<span class="rt-sino" aria-hidden="true"><i class="fa-solid fa-bell"></i></span>' +
        '<div>' +
          '<h3 class="rt-avisos-titulo">' + avisos.length + ' aviso(s) esperando você</h3>' +
          '<p class="rt-avisos-sub">' +
            (reprovados.length ? reprovados.length + ' pagamento(s) reprovado(s) para corrigir' : '') +
            (reprovados.length && corrigidos.length ? ' &middot; ' : '') +
            (corrigidos.length ? corrigidos.length + ' correção(ões) para o Financeiro conferir' : '') +
          '</p>' +
        '</div>' +
        '<span class="rt-avisos-contador">' + avisos.length + '</span>' +
      '</header>' +
      '<div class="rt-avisos-lista">' + avisos.map(cartao).join('') + '</div>' +
    '</section>';
}
window._rtRenderAvisos = _rtRenderAvisos;

// Abre a ficha do aviso (leva direto para o Fluxo Financeiro).
window.rtAbrirAviso = function (idFluxo) {
  switchAba('fluxo-financeiro');
  setTimeout(function () { try { abrirDetalheFluxo(idFluxo); } catch (e) {} }, 350);
};

// Marcador no menu lateral: bolinha vermelha no Fluxo Financeiro quando há aviso.
// A bolinha no menu foi removida: o aviso mora dentro do proprio Fluxo
// Financeiro, e o item do menu volta a ficar limpo (verde com o icone branco).
function _rtAtualizarSinoMenu() {
  try {
    const item = document.getElementById('nav-item-fluxo-financeiro');
    const selo = item && item.querySelector('.rt-nav-alerta');
    if (selo) selo.remove();
  } catch (e) {}
}
window._rtAtualizarSinoMenu = _rtAtualizarSinoMenu;

// ══════════════════════════════════════════════════════════════════════════
// ESTORNO — o pagamento saiu, o banco devolveu, e o dinheiro voltou à conta
// --------------------------------------------------------------------------
// Por que existe uma aba só para isso:
//   O valor devolvido JÁ FOI SOLICITADO num dia anterior. Não dá para pedir
//   de novo. Mas o Financeiro PAGA de novo, porque o dinheiro está de volta
//   na conta. Então o mesmo valor circula duas vezes e é solicitado uma só.
//   Se entrar junto com o pagamento do dia, a conta com quem libera o dinheiro
//   não fecha. Por isso: telas separadas, total somado.
//
// O caminho:
//   1) Financeiro reprova a pessoa e marca o motivo como ESTORNO
//   2) A pessoa entra na fila de estornos — todo mundo enxerga
//   3) O DP sobe uma ficha NOVA marcada como Estorno, só com essas pessoas,
//      e aponta quais estornos ela cobre
//   4) Quem foi coberto sai da fila (5 -> cobre 3 -> sobram 2), sem lançamento
//      manual
//   5) No "A Pagar" o total aparece quebrado: folha + estorno = total do dia
// ══════════════════════════════════════════════════════════════════════════
const FF_MOTIVO_ESTORNO  = 'estorno';
const FF_MOTIVO_CORRIGIR = 'corrigir';

function _ffEhFichaEstorno(f) { return !!(f && f.tipoLancamento === 'estorno'); }
window._ffEhFichaEstorno = _ffEhFichaEstorno;

// A linha é um estorno em aberto? (reprovada como estorno e ainda não coberta)
function _ffLinhaEstornoAberto(l) {
  return !!(l && l.status === 'reprovado' &&
    l.reprovacao && l.reprovacao.tipo === FF_MOTIVO_ESTORNO &&
    !l.estornoCobertoPor);
}

// Fila de estornos: todas as pessoas devolvidas que ainda não voltaram numa
// ficha de estorno. É o que a aba mostra e o que alimenta o contador.
function _ffEstornosPendentes() {
  const out = [];
  _ffVisiveis().forEach(function (f) {
    if (_ffEhFichaEstorno(f)) return;                 // a própria ficha de estorno não gera estorno
    (Array.isArray(f.linhas) ? f.linhas : []).forEach(function (l, i) {
      if (_ffLinhaEstornoAberto(l)) out.push({ f: f, l: l, indice: i });
    });
  });
  return out.sort(function (a, b) {
    return String((b.l.reprovacao || {}).em || '').localeCompare(String((a.l.reprovacao || {}).em || ''));
  });
}
window._ffEstornosPendentes = _ffEstornosPendentes;

function _ffTotalEstornosPendentes() {
  return _ffEstornosPendentes().reduce(function (s, e) { return s + (Number(e.l.valor) || 0); }, 0);
}

// Estornos que o DP já reenviou numa ficha de estorno. Junto com a fila de
// pendentes, dão o retrato completo: quanto voltou e quanto já foi resolvido.
function _ffEstornosResolvidos() {
  const out = [];
  _ffVisiveis().forEach(function (f) {
    if (_ffEhFichaEstorno(f)) return;
    (Array.isArray(f.linhas) ? f.linhas : []).forEach(function (l) {
      if (l && l.estornoCobertoPor && l.reprovacao && l.reprovacao.tipo === FF_MOTIVO_ESTORNO) {
        out.push({ f: f, l: l });
      }
    });
  });
  return out;
}
window._ffEstornosResolvidos = _ffEstornosResolvidos;

// Estornos que ESTA ficha de estorno veio cobrir
function _ffEstornosCobertos(f) {
  const ids = Array.isArray(f && f.estornosCobertos) ? f.estornosCobertos : [];
  const out = [];
  ids.forEach(function (ref) {
    const orig = (state.fluxosFinanceiros || []).find(function (x) { return x.id === ref.fichaId; });
    if (!orig) return;
    const linha = (orig.linhas || []).find(function (l) { return l.id === ref.linhaId; });
    if (linha) out.push({ f: orig, l: linha });
  });
  return out;
}

// ── Nova ficha: pagamento do dia ou estorno ───────────────────────────────
// Quando é estorno, o DP escolhe QUAIS pessoas da fila esta ficha vem cobrir.
// É essa escolha que dá baixa automática: 5 na fila, cobre 3, sobram 2.
let _ffLancamento = 'pagamento';
let _ffEstornosEscolhidos = {};     // { 'fichaId||linhaId': true }

window.ffTrocarLancamento = function (tipo) {
  _ffLancamento = tipo === 'estorno' ? 'estorno' : 'pagamento';
  const marca = (id, on) => { const el = document.getElementById(id); if (el) el.classList.toggle('ativa', on); };
  marca('ff-lanc-op-pagamento', _ffLancamento === 'pagamento');
  marca('ff-lanc-op-estorno', _ffLancamento === 'estorno');
  const area = document.getElementById('ff-lanc-estorno-area');
  if (area) area.style.display = _ffLancamento === 'estorno' ? '' : 'none';
  if (_ffLancamento === 'estorno') _ffRenderEscolhaEstornos();
};

window.ffMarcarEstorno = function (chave, on) {
  if (on) _ffEstornosEscolhidos[chave] = true; else delete _ffEstornosEscolhidos[chave];
  _ffRenderEscolhaEstornos();
};
window.ffMarcarTodosEstornos = function (on) {
  _ffEstornosEscolhidos = {};
  if (on) _ffEstornosPendentes().forEach(e => { _ffEstornosEscolhidos[e.f.id + '||' + e.l.id] = true; });
  _ffRenderEscolhaEstornos();
};

function _ffRenderEscolhaEstornos() {
  const area = document.getElementById('ff-lanc-estorno-area');
  if (!area) return;
  const pend = _ffEstornosPendentes();
  if (!pend.length) {
    area.innerHTML = '<div class="ff-lanc-vazio"><i class="fa-solid fa-circle-check"></i> ' +
      'Não há estorno em aberto. Se esta ficha não é um acerto de estorno, volte para ' +
      '<b>Pagamento do dia</b>.</div>';
    return;
  }
  const marcados = Object.keys(_ffEstornosEscolhidos).length;
  const soma = pend.filter(e => _ffEstornosEscolhidos[e.f.id + '||' + e.l.id])
    .reduce((s, e) => s + (Number(e.l.valor) || 0), 0);

  area.innerHTML =
    '<p class="ff-lanc-dica"><i class="fa-solid fa-circle-info"></i> ' +
      'Marque quem esta ficha vem acertar. Quem for marcado <b>sai da fila de estornos</b> ' +
      'assim que a ficha for salva. Esta ficha <b>não leva número de relação novo</b> — ' +
      'o valor já foi solicitado no dia do pagamento original.</p>' +
    '<div class="ff-lanc-barra">' +
      '<label><input type="checkbox" ' + (marcados === pend.length ? 'checked' : '') +
        ' onchange="ffMarcarTodosEstornos(this.checked)"> Marcar todos (' + pend.length + ')</label>' +
      '<span><b>' + marcados + '</b> marcado(s) &middot; <b>' + _ffMoedaBR(soma) + '</b></span>' +
    '</div>' +
    '<div class="ff-lanc-lista">' + pend.map(function (e) {
      const ch = e.f.id + '||' + e.l.id;
      return '<label class="ff-lanc-item' + (_ffEstornosEscolhidos[ch] ? ' marcado' : '') + '">' +
        '<input type="checkbox" ' + (_ffEstornosEscolhidos[ch] ? 'checked' : '') +
          ' onchange="ffMarcarEstorno(\'' + escapeHTML(ch) + '\', this.checked)">' +
        '<span class="ff-lanc-nome">' + escapeHTML(e.l.nome || '(sem nome)') +
          (e.l.lote ? ' <span class="ff-lote-selo">' + escapeHTML(e.l.lote) + '</span>' : '') + '</span>' +
        '<span class="ff-lanc-meta">' + escapeHTML(e.l.cpf || '') + ' · ficha #' + escapeHTML(e.f.numero) + '</span>' +
        '<span class="ff-lanc-val">' + _ffMoedaBR(e.l.valor) + '</span>' +
      '</label>';
    }).join('') + '</div>';
}

// Dá baixa na fila: marca cada linha coberta e guarda o vínculo dos dois lados
function _ffAplicarBaixaEstornos(novaFicha) {
  const refs = [];
  Object.keys(_ffEstornosEscolhidos).forEach(function (ch) {
    const p = ch.split('||');
    const orig = (state.fluxosFinanceiros || []).find(x => x.id === p[0]);
    if (!orig) return;
    const l = (orig.linhas || []).find(x => x && x.id === p[1]);
    if (!l || !_ffLinhaEstornoAberto(l)) return;
    l.estornoCobertoPor = novaFicha.id;
    l.estornoCobertoEm = new Date().toISOString();
    refs.push({ fichaId: orig.id, linhaId: l.id, nome: l.nome || '', valor: Number(l.valor) || 0 });
    _ffHist(orig, 'Estorno de "' + (l.nome || '—') + '" foi reenviado na ficha de estorno #' + novaFicha.numero + '.');
  });
  novaFicha.estornosCobertos = refs;
  return refs;
}

// ── Aba ESTORNOS ──────────────────────────────────────────────────────────
function _ffRenderEstornos(cont) {
  const pend = _ffEstornosPendentes();
  const total = pend.reduce(function (s, e) { return s + (Number(e.l.valor) || 0); }, 0);

  // Fichas de estorno já criadas, para dar o retrato completo
  const fichasEst = _ffVisiveis().filter(_ffEhFichaEstorno)
    .sort(function (a, b) { return String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')); });

  const cabecalho =
    '<div class="est-topo">' +
      '<div class="est-kpi est-kpi-alerta">' +
        '<span class="est-kpi-num">' + pend.length + '</span>' +
        '<span class="est-kpi-rot">pessoa(s) com estorno em aberto</span></div>' +
      '<div class="est-kpi">' +
        '<span class="est-kpi-num">' + _ffMoedaBR(total) + '</span>' +
        '<span class="est-kpi-rot">valor a devolver ao pagamento</span></div>' +
      '<div class="est-kpi">' +
        '<span class="est-kpi-num">' + fichasEst.length + '</span>' +
        '<span class="est-kpi-rot">ficha(s) de estorno criada(s)</span></div>' +
    '</div>' +
    '<p class="est-explica"><i class="fa-solid fa-circle-info"></i> ' +
      'Aqui fica quem o banco devolveu. O valor <b>já foi solicitado</b> num dia anterior, então ' +
      'a ficha de acerto entra como <b>Estorno</b> — nunca junto do pagamento do dia. ' +
      'Quem for coberto por uma ficha de estorno sai desta lista sozinho.</p>' +
    ((pend.length || fichasEst.length)
      ? '<div class="est-acoes-topo">' +
          '<button class="btn btn-secondary" onclick="ffExportarEstornosExcel()">' +
            '<i class="fa-solid fa-file-excel"></i> Baixar relatório em Excel</button>' +
          '<small>Uma linha com os dados e a bancária de cada pessoa, e a linha de baixo com o motivo do estorno. ' +
          'Inclui os que já foram reenviados.</small>' +
        '</div>'
      : '');

  if (!pend.length && !fichasEst.length) {
    cont.innerHTML = cabecalho +
      '<div class="ff-empty-box"><div class="ff-empty-icon"><i class="fa-solid fa-circle-check"></i></div>' +
      '<div class="ff-empty-title">Nenhum estorno 👌</div>' +
      '<div class="ff-empty-text">Quando o Financeiro reprovar um pagamento como estorno, ele aparece aqui.</div></div>';
    return;
  }

  const cartoes = pend.map(function (e) {
    const l = e.l, f = e.f;
    const arq = (typeof _ffArquivoDaLinha === 'function') ? _ffArquivoDaLinha(f, l) : null;
    const rel = (arq && arq.relacaoNumero) ? String(arq.relacaoNumero) : _ffRelacaoTexto(f);
    const dado = function (rot, val) {
      return val ? '<span><b>' + rot + ':</b> ' + escapeHTML(String(val)) + '</span>' : '';
    };
    return '<article class="est-card">' +
      '<header class="est-card-topo">' +
        '<div><div class="est-nome">' + escapeHTML(l.nome || '(sem nome)') + '</div>' +
          '<div class="est-sub">' + escapeHTML(_ffIdentificacao(f)) + '</div></div>' +
        '<div class="est-valor">' + _ffMoedaBR(l.valor) + '</div>' +
      '</header>' +
      '<div class="est-dados">' +
        dado('CPF', l.cpf) +
        dado('Código', l.codigo) +
        (l.lote ? '<span><b>Lote:</b> <span class="ff-lote-selo">' + escapeHTML(l.lote) + '</span></span>' : '') +
        dado('Banco', l.banco) +
        dado('Agência', (l.agencia || '') + (l.agenciaDg ? '-' + l.agenciaDg : '')) +
        dado('Conta', (l.conta || '') + (l.contaDg ? '-' + l.contaDg : '')) +
        dado('Competência', l.competencia) +
        (rel ? '<span><b>Relação:</b> <span class="ff-relacao">N. ' + escapeHTML(rel) + '</span></span>' : '') +
        '<span><b>Ficha:</b> #' + escapeHTML(f.numero) + '</span>' +
      '</div>' +
      '<div class="est-motivo"><b>Motivo do estorno:</b> ' +
        escapeHTML((l.reprovacao && l.reprovacao.motivo) || '—') +
        '<div class="est-quem">Por ' + escapeHTML((l.reprovacao && l.reprovacao.por) || '—') +
          ' · ' + _ffDataHora((l.reprovacao || {}).em) + '</div></div>' +
      '<div class="est-acoes">' +
        '<button class="btn btn-sm btn-secondary" onclick="abrirDetalheFluxo(\'' + f.id + '\')">' +
          '<i class="fa-solid fa-eye"></i> Abrir a ficha original</button>' +
      '</div>' +
    '</article>';
  }).join('');

  const historico = fichasEst.length
    ? '<h4 class="est-titulo-sec"><i class="fa-solid fa-rotate-left"></i> Fichas de estorno criadas</h4>' +
      '<div class="est-fichas">' + fichasEst.map(function (f) {
        const st = FF_STATUS[f.status] || FF_STATUS.rascunho;
        const cob = _ffEstornosCobertos(f);
        return '<div class="est-ficha-item">' +
          '<div><b>#' + escapeHTML(f.numero) + '</b> · ' + escapeHTML(_ffIdentificacao(f)) +
            '<div class="est-sub">' + cob.length + ' estorno(s) coberto(s) · ' + _ffMoedaBR(_ffTotal(f)) +
            ' · ' + _ffQuemSubiu(f) + '</div></div>' +
          '<span class="ff-badge" style="color:' + st.cor + ';">' + escapeHTML(st.rotulo) + '</span>' +
          '<button class="btn btn-sm btn-secondary" onclick="abrirDetalheFluxo(\'' + f.id + '\')">Abrir</button>' +
        '</div>';
      }).join('') + '</div>'
    : '';

  cont.innerHTML = cabecalho +
    (pend.length
      ? '<h4 class="est-titulo-sec"><i class="fa-solid fa-triangle-exclamation"></i> Aguardando o DP reenviar</h4>' +
        '<div class="est-lista">' + cartoes + '</div>'
      : '<div class="est-ok"><i class="fa-solid fa-circle-check"></i> Nenhum estorno em aberto — tudo já foi reenviado.</div>') +
    historico;
}

function _ffLinhasReprovadas(f) {
  return (f && Array.isArray(f.linhas) ? f.linhas : []).filter(l => l && l.status === 'reprovado');
}
function _ffLinhasCorrigidas(f) {
  return (f && Array.isArray(f.linhas) ? f.linhas : []).filter(l => l && l.status === 'corrigido');
}
// Quem montou a ficha precisa agir quando há linha reprovada.
function _ffEhDonoDaFicha(f) {
  return !!(loggedUser && f && f.criadoPorLogin === loggedUser.login);
}

// ── Financeiro reprova a linha de uma pessoa ──────────────────────────────
window.ffReprovarPessoa = async function (indice) {
  const f = (state.fluxosFinanceiros || []).find(x => x.id === _ffDetalheId);
  if (!f) return;
  if (!_ffEhFinanceiro() && !_ffVeTudo()) { alert('Só o Financeiro pode reprovar um pagamento.'); return; }
  const l = (f.linhas || [])[indice];
  if (!l) return;

  // O tipo muda o caminho: ESTORNO entra na fila da aba Estornos (o dinheiro
  // voltou e vai ser pago de novo, sem solicitar de novo). CORRIGIR é quando
  // o dinheiro nem saiu — é só acertar o dado e seguir.
  const ehEstorno = confirm(
    'Reprovar o pagamento de:\n\n' + (l.nome || '(sem nome)') +
    (l.cpf ? '\nCPF ' + l.cpf : '') + '\nValor: ' + _ffMoedaBR(l.valor) +
    '\n\n────────────────────────\n' +
    'É ESTORNO? (o dinheiro saiu e o banco DEVOLVEU para a conta)\n\n' +
    '   OK       = sim, é ESTORNO\n' +
    '   Cancelar = não, o dinheiro NÃO saiu (só corrigir o dado)');

  const motivo = prompt(
    (ehEstorno ? 'ESTORNO de ' : 'Corrigir ') + (l.nome || '(sem nome)') +
    '\n\nQual foi o problema? (ex.: chave Pix inválida, conta bancária errada)', '');
  if (motivo === null) return;
  if (!String(motivo).trim()) { alert('Escreva o motivo — é ele que a pessoa vai ler para corrigir.'); return; }

  l.status = 'reprovado';
  l.reprovacao = {
    motivo: String(motivo).trim(),
    tipo: ehEstorno ? FF_MOTIVO_ESTORNO : FF_MOTIVO_CORRIGIR,
    por: nomeExibido(loggedUser), login: loggedUser.login,
    em: new Date().toISOString()
  };
  l.correcao = null;   // se já havia uma correção, ela foi recusada de novo

  const rot = ehEstorno ? 'ESTORNO' : 'REPROVOU';
  _ffHist(f, 'Financeiro ' + rot + ' o pagamento de "' + (l.nome || '—') + '": ' + l.reprovacao.motivo +
    (ehEstorno ? ' (o valor voltou para a conta e entrou na fila de estornos)' : ''));
  registrarLogGlobal((ehEstorno ? 'Lançou ESTORNO de "' : 'Reprovou o pagamento de "') +
    (l.nome || '—') + '" no Fluxo #' + f.numero + '.', 'dp');
  await _ffSalvarERender(f, ehEstorno
    ? 'Estorno registrado. ' + (l.nome || 'A pessoa') + ' entrou na aba ESTORNOS — o DP precisa reenviar numa ficha de estorno.'
    : 'Pagamento reprovado. ' + (f.criadoPor || 'Quem montou a ficha') +
      ' foi avisado e vai aparecer em "Minha vez" para corrigir.');
};

// ── Quem montou a ficha corrige ───────────────────────────────────────────
window.ffCorrigirPessoa = async function (indice) {
  const f = (state.fluxosFinanceiros || []).find(x => x.id === _ffDetalheId);
  if (!f) return;
  const l = (f.linhas || [])[indice];
  if (!l || l.status !== 'reprovado') return;
  if (!_ffEhDonoDaFicha(f) && !_ffEhCoordenacao() && !_ffVeTudo()) {
    alert('Só quem montou a ficha (ou a Supervisão) pode corrigir.'); return;
  }

  const errado = prompt('Correção de "' + (l.nome || '—') + '"\n\nMotivo informado pelo Financeiro:\n' +
    ((l.reprovacao && l.reprovacao.motivo) || '—') + '\n\n1) O que estava ERRADO?', '');
  if (errado === null) return;
  if (!String(errado).trim()) { alert('Descreva o que estava errado.'); return; }

  const correto = prompt('2) Qual é o dado CORRETO?\n\n(ex.: Pix correto: 111.222.333-44 / Conta: 1234-5 ag. 0001)', '');
  if (correto === null) return;
  if (!String(correto).trim()) { alert('Informe o dado correto.'); return; }

  const obs = prompt('3) Quer acrescentar alguma observação? (opcional)', '') || '';

  l.status = 'corrigido';
  l.correcao = {
    oQueEstavaErrado: String(errado).trim(),
    oCorreto: String(correto).trim(),
    observacao: String(obs).trim(),
    por: nomeExibido(loggedUser), login: loggedUser.login,
    em: new Date().toISOString()
  };

  _ffHist(f, 'Correção de "' + (l.nome || '—') + '": estava "' + l.correcao.oQueEstavaErrado +
    '", o correto é "' + l.correcao.oCorreto + '".' + (l.correcao.observacao ? ' Obs.: ' + l.correcao.observacao : ''));
  registrarLogGlobal('Corrigiu o pagamento de "' + (l.nome || '—') + '" no Fluxo #' + f.numero + '.', 'dp');
  await _ffSalvarERender(f, 'Correção enviada! O Financeiro foi avisado e vai conferir.');
};

// ── Financeiro aceita a correção ──────────────────────────────────────────
window.ffAceitarCorrecao = async function (indice) {
  const f = (state.fluxosFinanceiros || []).find(x => x.id === _ffDetalheId);
  if (!f) return;
  if (!_ffEhFinanceiro() && !_ffVeTudo()) return;
  const l = (f.linhas || [])[indice];
  if (!l || l.status !== 'corrigido') return;
  if (!confirm('Confirmar que o dado de "' + (l.nome || '—') + '" está correto agora?')) return;

  l.status = 'ok';
  _ffHist(f, 'Financeiro conferiu e aceitou a correção de "' + (l.nome || '—') + '".');
  await _ffSalvarERender(f, 'Correção aceita.');
};

// ── Faixa de aviso no topo da ficha ───────────────────────────────────────
// Faz o papel da notificação: quem abre a ficha vê na hora o que precisa fazer.
function _ffAvisoReprovacoes(f) {
  const repro = _ffLinhasReprovadas(f);
  const corr = _ffLinhasCorrigidas(f);
  if (!repro.length && !corr.length) return '';

  let html = '';
  if (repro.length) {
    const paraMim = _ffEhDonoDaFicha(f) || _ffEhCoordenacao() || _ffVeTudo();
    html += '<div class="ff-aviso-repro">' +
      '<div class="ff-aviso-titulo"><i class="fa-solid fa-circle-exclamation"></i> ' +
        repro.length + ' pagamento(s) reprovado(s) pelo Financeiro</div>' +
      '<ul class="ff-aviso-lista">' +
        repro.map(l => '<li><b>' + escapeHTML(l.nome || '—') + '</b>' +
          (l.cpf ? ' <span class="ff-aviso-cpf">CPF ' + escapeHTML(l.cpf) + '</span>' : '') +
          '<div class="ff-aviso-motivo">' + escapeHTML((l.reprovacao && l.reprovacao.motivo) || '—') +
          '<span class="ff-aviso-quem"> — ' + escapeHTML((l.reprovacao && l.reprovacao.por) || '') +
          ', ' + _ffDataHora((l.reprovacao && l.reprovacao.em)) + '</span></div></li>').join('') +
      '</ul>' +
      (paraMim ? '<div class="ff-aviso-acao">Clique em <b>Corrigir</b> na linha da pessoa, na tabela abaixo.</div>' : '') +
    '</div>';
  }
  if (corr.length) {
    html += '<div class="ff-aviso-corr">' +
      '<div class="ff-aviso-titulo"><i class="fa-solid fa-circle-check"></i> ' +
        corr.length + ' correção(ões) aguardando o Financeiro conferir</div>' +
      '<ul class="ff-aviso-lista">' +
        corr.map(l => '<li><b>' + escapeHTML(l.nome || '—') + '</b>' +
          '<div class="ff-aviso-motivo">Estava: ' + escapeHTML((l.correcao && l.correcao.oQueEstavaErrado) || '—') +
          '<br>Correto: <b>' + escapeHTML((l.correcao && l.correcao.oCorreto) || '—') + '</b>' +
          ((l.correcao && l.correcao.observacao) ? '<br>Obs.: ' + escapeHTML(l.correcao.observacao) : '') +
          '<span class="ff-aviso-quem"> — ' + escapeHTML((l.correcao && l.correcao.por) || '') +
          ', ' + _ffDataHora((l.correcao && l.correcao.em)) + '</span></div></li>').join('') +
      '</ul>' +
    '</div>';
  }
  return html;
}

function _ffDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const p = n => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

// Botão que aparece na coluna de situação de cada linha.
function _ffAcaoLinha(f, l, i) {
  if (l.status === 'reprovado') {
    const podeCorrigir = _ffEhDonoDaFicha(f) || _ffEhCoordenacao() || _ffVeTudo();
    return '<span class="ff-sit ff-sit-repro" title="' + escapeHTML((l.reprovacao && l.reprovacao.motivo) || '') + '">🔴 reprovado</span>' +
      (podeCorrigir ? '<button class="ff-btn-linha ff-btn-corrigir" onclick="ffCorrigirPessoa(' + i + ')">Corrigir</button>' : '');
  }
  if (l.status === 'corrigido') {
    const podeAceitar = _ffEhFinanceiro() || _ffVeTudo();
    return '<span class="ff-sit ff-sit-corr" title="Aguardando o Financeiro conferir">🔵 corrigido</span>' +
      (podeAceitar ? '<button class="ff-btn-linha ff-btn-aceitar" onclick="ffAceitarCorrecao(' + i + ')">Aceitar</button>' : '');
  }
  if (l.status === 'conferir') {
    return '<span class="ff-sit ff-sit-conf">🟡 conferir</span>' + _ffBotaoReprovar(i);
  }
  return '<span class="ff-sit ff-sit-ok">🟢 ok</span>' + _ffBotaoReprovar(i);
}
function _ffBotaoReprovar(i) {
  return (_ffEhFinanceiro() || _ffVeTudo())
    ? '<button class="ff-btn-linha ff-btn-reprovar" title="Reprovar o pagamento desta pessoa" onclick="ffReprovarPessoa(' + i + ')">Reprovar</button>'
    : '';
}

function _ffRenderAPagar(cont) {
  if (!_ffEhFinanceiro() && !_ffPodeAdministrarWorkflow()) {
    cont.innerHTML = '<div class="ff-empty-box"><div class="ff-empty-title">Tela do Financeiro</div>' +
      '<div class="ff-empty-text">Esta tela é usada pelo setor Financeiro para efetuar os pagamentos.</div></div>';
    return;
  }
  const todas = _ffVisiveis().filter(f => f.status === 'aguardando_financeiro');
  const lista = _ffFiltraPorEnvio(todas)
    .sort((a, b) => String(_ffDataEnvioFinanceiro(a)).localeCompare(String(_ffDataEnvioFinanceiro(b))));

  const totalValor = lista.reduce((s, f) => s + _ffTotal(f), 0);
  const totalPessoas = lista.reduce((s, f) => s + _ffQtdColaboradores(f), 0);
  const selecionadas = lista.filter(f => _ffPagarSelecao[f.id]);
  const valorSel = selecionadas.reduce((s, f) => s + _ffTotal(f), 0);

  const linhas = lista.map(function (f) {
    const trava = f.divergencia
      ? '<i class="fa-solid fa-triangle-exclamation" title="Divergência sinalizada — pagamento bloqueado" style="color:#B45309;margin-left:6px;"></i>' : '';
    return '<tr>' +
      '<td data-label="" style="width:38px;"><input type="checkbox" ' + (f.divergencia ? 'disabled' : '') + ' ' +
        (_ffPagarSelecao[f.id] ? 'checked' : '') + ' onchange="ffSelecionarPagar(\'' + f.id + '\', this.checked)"></td>' +
      '<td data-label="Enviado por">' + _ffQuemSubiu(f) + '</td>' +
      '<td data-label="Empresa" style="font-weight:600;">' + escapeHTML(_ffIdentificacao(f)) + '</td>' +
      '<td data-label="Documento">#' + escapeHTML(f.numero) + trava +
        '<div style="font-size:11px;color:var(--text-secondary);">' + escapeHTML(f.tipo || '') + '</div></td>' +
      '<td data-label="Relação" class="ff-col-relacao">' + _ffSeloRelacao(f) + '</td>' +
      '<td data-label="Enviado ao financeiro">' + (_formatarDataBR(_ffSoData(_ffDataEnvioFinanceiro(f))) || '—') + '</td>' +
      '<td data-label="Colaboradores" style="text-align:center;font-variant-numeric:tabular-nums;">' + _ffQtdColaboradores(f) + '</td>' +
      '<td data-label="Valor" style="font-weight:600;font-variant-numeric:tabular-nums;">' + _ffMoedaBR(_ffTotal(f)) + '</td>' +
      '<td data-label="Status">' + _ffSelo(f) + '</td>' +
      '<td data-label="Ação"><button class="btn btn-secondary btn-sm" onclick="abrirDetalheFluxo(\'' + f.id + '\')">' +
        '<i class="fa-solid fa-eye"></i> Abrir</button></td>' +
    '</tr>';
  }).join('');

  const corpo = lista.length
    ? '<div class="ff-acoes-lote">' +
        '<label class="ff-selecionar-todas"><input type="checkbox" ' +
          (selecionadas.length === lista.length ? 'checked' : '') + ' onchange="ffSelecionarTodasPagar(this.checked)"> Selecionar todas</label>' +
        '<span class="ff-selecao-info">' + selecionadas.length + ' selecionada(s) &middot; <strong>' + _ffMoedaBR(valorSel) + '</strong></span>' +
        // Baixa as bancárias das fichas marcadas sem precisar abrir uma por uma
        '<button class="btn btn-secondary" id="ff-btn-pdf-lote" ' + (selecionadas.length ? '' : 'disabled') +
          ' title="Junta as bancárias das fichas marcadas num PDF só" onclick="ffBaixarPdfSelecionadas()">' +
          '<i class="fa-solid fa-file-pdf"></i> Baixar bancárias (PDF único)</button>' +
        '<button class="btn btn-primary" ' + (selecionadas.length ? '' : 'disabled') + ' onclick="ffFinalizarPagamentos()">' +
          '<i class="fa-solid fa-circle-check"></i> Finalizar Pagamentos</button>' +
      '</div>' +
      '<div class="table-scroll-container"><table class="excel-table ff-tabela-pagar"><thead><tr>' +
        '<th></th><th>Enviado por</th><th>Empresa / Identificação</th><th>Documento</th><th>Relação</th><th>Enviado ao financeiro</th>' +
        '<th style="text-align:center;">Colab.</th><th>Valor</th><th>Status</th><th>Ação</th>' +
      '</tr></thead><tbody>' + linhas + '</tbody></table></div>'
    : '<div class="ff-empty-box"><div class="ff-empty-title">Nada para pagar ' +
        ((_ffPagarDe || _ffPagarAte) ? 'neste período' : 'no momento') + '</div><div class="ff-empty-text">' +
        (todas.length ? 'Existem ' + todas.length + ' ficha(s) aguardando pagamento — ajuste o filtro de data.'
                      : 'Assim que a Gestão aprovar, as fichas aparecem aqui.') + '</div></div>';

  // O total precisa vir QUEBRADO: o estorno já foi solicitado num dia
  // anterior, então ele soma no que a Letícia paga hoje, mas não pode ser
  // confundido com a folha do dia na hora de acertar com quem libera o dinheiro.
  const daFolha  = lista.filter(f => !_ffEhFichaEstorno(f));
  const doEstorno = lista.filter(_ffEhFichaEstorno);
  const valFolha   = daFolha.reduce((s, f) => s + _ffTotal(f), 0);
  const valEstorno = doEstorno.reduce((s, f) => s + _ffTotal(f), 0);

  const resumo = doEstorno.length
    ? '<div class="ff-resumo-pagar ff-resumo-quebrado">' +
        '<div><span>Pagamento do dia</span><strong>' + _ffMoedaBR(valFolha) + '</strong>' +
          '<small>' + daFolha.length + ' ficha(s)</small></div>' +
        '<div class="ff-parcela-estorno"><span>Estorno</span><strong>' + _ffMoedaBR(valEstorno) + '</strong>' +
          '<small>' + doEstorno.length + ' ficha(s) — já solicitado antes</small></div>' +
        '<div class="ff-parcela-total"><span>Total a aprovar hoje</span><strong>' + _ffMoedaBR(totalValor) + '</strong>' +
          '<small>' + totalPessoas + ' colaborador(es)</small></div>' +
      '</div>'
    : '<div class="ff-resumo-pagar">' +
        '<div><span>Fichas a pagar</span><strong>' + lista.length + '</strong></div>' +
        '<div><span>Colaboradores</span><strong>' + totalPessoas + '</strong></div>' +
        '<div><span>Total do período</span><strong>' + _ffMoedaBR(totalValor) + '</strong></div>' +
      '</div>';

  // Digitou um nome? Mostra a pessoa e em qual ficha ela está, antes da lista.
  let achouPessoa = '';
  const qp = String(_ffPagarBusca || '').trim();
  if (qp) {
    const achados = [];
    lista.forEach(function (f) {
      _ffLinhasQueBatem(f, qp).forEach(function (a) { achados.push({ f: f, l: a.l, posicao: a.posicao }); });
    });
    if (achados.length) {
      const somaAchados = achados.reduce(function (s, a) { return s + (Number(a.l.valor) || 0); }, 0);
      achouPessoa = '<div class="ff-busca-pessoa">' +
        '<div class="ff-busca-titulo"><i class="fa-solid fa-user-check"></i> ' +
          achados.length + ' pagamento(s) a fazer para &ldquo;' + escapeHTML(qp) + '&rdquo;' +
          ' &middot; <b>' + _ffMoedaBR(somaAchados) + '</b></div>' +
        achados.map(function (a) {
          const arq = (typeof _ffArquivoDaLinha === 'function') ? _ffArquivoDaLinha(a.f, a.l) : null;
          const rel = (arq && arq.relacaoNumero) ? String(arq.relacaoNumero) : _ffRelacaoTexto(a.f);
          const semVal = a.l.semValorNoPdf && !(Number(a.l.valor) > 0);
          return '<div class="ff-achado">' +
            '<div class="ff-achado-nome">' + escapeHTML(a.l.nome || '(sem nome)') +
              (a.l.cpf ? '<span class="ff-achado-cpf">CPF ' + escapeHTML(a.l.cpf) + '</span>' : '') +
              (_ffEhFichaEstorno(a.f) ? '<span class="ff-achado-etapa" style="color:#B45309;border-color:#B45309;">estorno</span>' : '') +
            '</div>' +
            '<div class="ff-achado-posicao">Está na <b>posição ' + a.posicao + '</b> de ' +
              _ffQtdColaboradores(a.f) + ' pessoa(s) desta ficha</div>' +
            '<div class="ff-achado-linhas">' +
              '<span><b>Ficha:</b> #' + escapeHTML(a.f.numero) + '</span>' +
              '<span><b>Empresa:</b> ' + escapeHTML(_ffIdentificacao(a.f)) + '</span>' +
              (a.l.lote ? '<span><b>Lote:</b> <span class="ff-lote-selo">' + escapeHTML(a.l.lote) + '</span></span>' : '') +
              (rel ? '<span><b>Relação:</b> <span class="ff-relacao">N. ' + escapeHTML(rel) + '</span></span>' : '') +
              '<span><b>Enviado ao financeiro:</b> ' +
                (_formatarDataBR(_ffSoData(_ffDataEnvioFinanceiro(a.f))) || '—') + '</span>' +
              '<span><b>Valor da pessoa:</b> ' +
                (semVal ? '<span class="ff-sem-valor">— sem valor no PDF</span>'
                        : _ffMoedaBR(Number(a.l.valor) || 0)) + '</span>' +
            '</div>' +
            '<div class="ff-achado-acoes"><button class="btn btn-secondary btn-sm" onclick="abrirDetalheFluxo(\'' + a.f.id + '\')">' +
              '<i class="fa-solid fa-eye"></i> Abrir a ficha</button></div>' +
          '</div>';
        }).join('') +
      '</div>';
    } else if (!lista.length) {
      achouPessoa = '<div class="ff-busca-pessoa ff-busca-vazia">' +
        'Ninguém com &ldquo;' + escapeHTML(qp) + '&rdquo; nas fichas a pagar' +
        ((_ffPagarDe || _ffPagarAte) ? ' deste período.' : '.') +
        ' Se a pessoa já foi paga, procure em <b>Pagos / Finalizados</b>.</div>';
    }
  }

  cont.innerHTML = _ffBarraFiltroEnvio('pagar') + resumo + achouPessoa + corpo;
}

window.ffSelecionarPagar = function (id, marcado) {
  if (marcado) _ffPagarSelecao[id] = true; else delete _ffPagarSelecao[id];
  _ffRenderLista();
};
window.ffSelecionarTodasPagar = function (marcado) {
  _ffPagarSelecao = {};
  if (marcado) {
    _ffFiltraPorEnvio(_ffVisiveis().filter(f => f.status === 'aguardando_financeiro'))
      .filter(f => !f.divergencia)
      .forEach(f => { _ffPagarSelecao[f.id] = true; });
  }
  _ffRenderLista();
};

// Marca as fichas selecionadas como PAGAS de uma vez. Elas saem desta tela e
// passam para "Pagos / Finalizados", onde ainda se anexa o comprovante.
window.ffFinalizarPagamentos = async function () {
  if (!_ffEhFinanceiro() && !_ffPodeAdministrarWorkflow()) return;
  const ids = Object.keys(_ffPagarSelecao);
  const fichas = (state.fluxosFinanceiros || []).filter(f =>
    ids.indexOf(f.id) >= 0 && f.status === 'aguardando_financeiro' && !f.divergencia);
  if (!fichas.length) { alert('Selecione ao menos uma ficha para finalizar.'); return; }
  const total = fichas.reduce((s, f) => s + _ffTotal(f), 0);
  const pessoas = fichas.reduce((s, f) => s + _ffQtdColaboradores(f), 0);
  if (!confirm('Finalizar o pagamento de ' + fichas.length + ' ficha(s)?\n\n' +
               pessoas + ' colaborador(es)\nTotal: ' + _ffMoedaBR(total) +
               '\n\nElas vão para "Pagos / Finalizados".')) return;

  const agora = new Date().toISOString();
  fichas.forEach(function (f) {
    f.aprovacoes = f.aprovacoes || {};
    f.aprovacoes.pagamento = { por: nomeExibido(loggedUser), login: loggedUser.login, em: agora };
    f.status = 'pago';
    f.pagoEm = agora;
    _ffHist(f, 'Financeiro finalizou o pagamento de ' + _ffMoedaBR(_ffTotal(f)) + ' (em lote).');
  });
  registrarLogGlobal('Finalizou o pagamento de ' + fichas.length + ' ficha(s) do Fluxo Financeiro (' + _ffMoedaBR(total) + ').', 'dp');
  _ffPagarSelecao = {};
  try {
    await RTCloud.salvarAgora(state, { merge: true, upsertIds: fichas.map(f => f.id) });
    alert(fichas.length + ' ficha(s) finalizada(s)! Total: ' + _ffMoedaBR(total));
  } catch (e) {
    alert('Não consegui salvar no servidor: ' + (e.message || e));
  }
  renderFluxoFinanceiro();
};

// ══════════════════════════════════════════════════════════════════════════
// TELA "PAGOS / FINALIZADOS" — com busca por COLABORADOR
// --------------------------------------------------------------------------
// Quando o banco devolve um pagamento, ele informa só o nome da pessoa. Aqui
// o financeiro digita esse nome e o sistema diz em qual empresa, ficha e
// posição ele está — sem procurar ficha por ficha.
// ══════════════════════════════════════════════════════════════════════════
function _ffRenderFinalizados(cont) {
  const todas = _ffVisiveis().filter(f => ['pago', 'finalizado'].includes(f.status));
  const lista = _ffFiltraPorEnvio(todas)
    .sort((a, b) => String(_ffDataEnvioFinanceiro(b)).localeCompare(String(_ffDataEnvioFinanceiro(a))));

  let blocoBusca = '';
  const q = (_ffFinBuscaPessoa || '').trim().toLowerCase();
  // A busca varre TODAS as fichas que a pessoa pode ver — não só as já pagas
  // e não só as do período filtrado. Antes ela procurava dentro da lista já
  // filtrada, então quem estava numa ficha em aprovação, ou de outro mês,
  // simplesmente "não existia". Cada resultado mostra em que etapa está.
  const universo = _ffVisiveis();
  // Digitar o número da relação também funciona: mostra a bancária inteira.
  const porRelacao = q && lista.filter(f => _ffRelacaoTexto(f).toLowerCase().includes(q));
  if (q) {
    const soDigitos = q.replace(/\D/g, '');
    const achados = [];
    universo.forEach(function (f) {
      (Array.isArray(f.linhas) ? f.linhas : []).forEach(function (l, i) {
        const nome = String((l && l.nome) || '');
        const cpf = String((l && l.cpf) || '').replace(/\D/g, '');
        const bateNome = nome.toLowerCase().includes(q);
        const bateCpf = soDigitos.length >= 3 && cpf.includes(soDigitos);
        if (bateNome || bateCpf) achados.push({ f: f, l: l, posicao: i + 1 });
      });
    });
    if (achados.length) {
      blocoBusca = '<div class="ff-busca-pessoa">' +
        '<div class="ff-busca-titulo"><i class="fa-solid fa-magnifying-glass"></i> ' +
          achados.length + ' resultado(s) para &ldquo;' + escapeHTML(_ffFinBuscaPessoa) + '&rdquo;</div>' +
        achados.map(function (a) {
          const v0 = (Array.isArray(a.f.vinculos) && a.f.vinculos[0]) || null;
          const empresa = v0 ? v0.empresaNome : (a.f.empresaNome || '—');
          const cliente = v0 ? v0.clienteNome : '';
          const tomador = v0 ? v0.tomadorCodigo : '';
          // Nome do arquivo que vai ser baixado — o mesmo que a exportação gera,
          // para a pessoa reconhecer a planilha na pasta de downloads.
          const arquivo = 'fluxo_financeiro_' + a.f.numero + '_' +
            String(a.f.empresaNome || 'sem_empresa').replace(/[^\w]+/g, '_') + '.xlsx';
          const et = FF_STATUS[a.f.status] || FF_STATUS.rascunho;
          return '<div class="ff-achado">' +
            '<div class="ff-achado-nome">' + escapeHTML(a.l.nome || '(sem nome)') +
              (a.l.cpf ? '<span class="ff-achado-cpf">CPF ' + escapeHTML(a.l.cpf) + '</span>' : '') +
              // Como a busca varre tudo, dizer em que etapa está é essencial
              '<span class="ff-achado-etapa" style="color:' + et.cor + ';border-color:' + et.cor + ';">' +
                escapeHTML(et.rotulo) + '</span>' + '</div>' +
            '<div class="ff-achado-posicao">Está na <b>posição ' + a.posicao + '</b> de ' +
              _ffQtdColaboradores(a.f) + ' pessoa(s) desta ficha</div>' +
            '<div class="ff-achado-linhas">' +
              '<span><b>Empresa:</b> ' + escapeHTML(empresa) + '</span>' +
              (cliente ? '<span><b>Cliente:</b> ' + escapeHTML(cliente) + '</span>' : '') +
              (tomador ? '<span><b>Tomador:</b> ' + escapeHTML(tomador) + '</span>' : '') +
              '<span><b>Documento:</b> #' + escapeHTML(a.f.numero) + '</span>' +
              // O arquivo DESTA pessoa, com o número DELE — não a lista de
              // todos os arquivos da ficha.
              (function () {
                const arq = _ffArquivoDaLinha(a.f, a.l);
                if (!arq) return '';
                let h = '';
                if (arq.relacaoNumero) h += '<span><b>Nota / Relação:</b> <span class="ff-relacao">N. ' + escapeHTML(String(arq.relacaoNumero)) + '</span></span>';
                if (arq.nome) h += '<span><b>Arquivo:</b> ' + escapeHTML(arq.nome) + '</span>';
                return h;
              })() +
              '<span><b>Ficha:</b> ' + escapeHTML(a.f.tipo || '—') +
                (a.f.competencia ? ' · ' + escapeHTML(a.f.competencia) : '') + '</span>' +
              '<span><b>Enviado ao financeiro:</b> ' + (_formatarDataBR(_ffSoData(_ffDataEnvioFinanceiro(a.f))) || '—') + '</span>' +
              '<span><b>Valor da pessoa:</b> ' + _ffMoedaBR(Number(a.l.valor) || 0) + '</span>' +
              '<span><b>Status da ficha:</b> ' + (FF_STATUS[a.f.status] ? FF_STATUS[a.f.status].rotulo : a.f.status) + '</span>' +
              '<span><b>Planilha:</b> ' + escapeHTML(arquivo) + '</span>' +
            '</div>' +
            '<div class="ff-achado-acoes">' +
              // Abre o PDF de onde ESTA pessoa veio, identificado pelo número dele
              (function () {
                const arq = _ffArquivoDaLinha(a.f, a.l);
                const url = (arq && typeof arq.arquivo === 'string' && arq.arquivo.indexOf('/uploads/') === 0) ? arq.arquivo : '';
                if (!url) return '';
                return '<a class="btn btn-sm" style="background:#B45309;color:#fff;" href="' + escapeHTML(url) +
                  '" target="_blank" rel="noopener"><i class="fa-solid fa-file-pdf"></i> Abrir a nota N. ' +
                  escapeHTML(String(arq.relacaoNumero || '—')) + '</a>';
              })() +
              '<button class="btn btn-primary btn-sm" onclick="exportarFluxoExcel(\'' + a.f.id + '\')">' +
                '<i class="fa-solid fa-file-excel"></i> Abrir o Excel desta ficha</button>' +
              '<button class="btn btn-secondary btn-sm" onclick="abrirDetalheFluxo(\'' + a.f.id + '\')">' +
                '<i class="fa-solid fa-eye"></i> Ver a ficha no sistema</button>' +
            '</div>' +
          '</div>';
        }).join('') + '</div>';
    } else {
      blocoBusca = '<div class="ff-busca-pessoa ff-busca-vazia">Nenhum colaborador chamado &ldquo;' +
        escapeHTML(_ffFinBuscaPessoa) + '&rdquo; nas fichas ' +
        ((_ffPagarDe || _ffPagarAte) ? 'deste período' : 'pagas') + '.' +
        ((_ffPagarDe || _ffPagarAte) ? '<br>Tente ampliar o período ou limpar o filtro de datas.' : '') + '</div>';
    }
  }

  const linhas = lista.map(function (f) {
    return '<tr>' +
      '<td data-label="Enviado por">' + _ffQuemSubiu(f) + '</td>' +
      '<td data-label="Empresa" style="font-weight:600;">' + escapeHTML(_ffIdentificacao(f)) + '</td>' +
      '<td data-label="Documento">#' + escapeHTML(f.numero) +
        '<div style="font-size:11px;color:var(--text-secondary);">' + escapeHTML(f.tipo || '') + '</div></td>' +
      '<td data-label="Relação" class="ff-col-relacao">' + _ffSeloRelacao(f) + '</td>' +
      '<td data-label="Enviado ao financeiro">' + (_formatarDataBR(_ffSoData(_ffDataEnvioFinanceiro(f))) || '—') + '</td>' +
      '<td data-label="Colaboradores" style="text-align:center;font-variant-numeric:tabular-nums;">' + _ffQtdColaboradores(f) + '</td>' +
      '<td data-label="Valor" style="font-weight:600;font-variant-numeric:tabular-nums;">' + _ffMoedaBR(_ffTotal(f)) + '</td>' +
      '<td data-label="Status">' + _ffSelo(f) + '</td>' +
      '<td data-label="Ação"><button class="btn btn-secondary btn-sm" onclick="abrirDetalheFluxo(\'' + f.id + '\')">' +
        '<i class="fa-solid fa-eye"></i> Abrir</button></td>' +
    '</tr>';
  }).join('');

  const tabela = lista.length
    ? '<div class="table-scroll-container"><table class="excel-table ff-tabela-pagar"><thead><tr>' +
        '<th>Enviado por</th><th>Empresa / Identificação</th><th>Documento</th><th>Relação</th><th>Enviado ao financeiro</th>' +
        '<th style="text-align:center;">Colab.</th><th>Valor</th><th>Status</th><th>Ação</th>' +
      '</tr></thead><tbody>' + linhas + '</tbody></table></div>'
    : '<div class="ff-empty-box"><div class="ff-empty-title">Nenhuma ficha paga ' +
        ((_ffPagarDe || _ffPagarAte) ? 'neste período' : 'ainda') + '</div><div class="ff-empty-text">' +
        (todas.length ? 'Existem ' + todas.length + ' ficha(s) paga(s) — ajuste o filtro de data.' : '') + '</div></div>';

  cont.innerHTML = _ffBarraFiltroEnvio('fin') + blocoBusca + tabela;
}

function _ffRenderLista() {
  const cont = document.getElementById('ff-lista-container');
  if (!cont) return;
  garantirFluxoFinanceiro();

  // Painel do próprio módulo (não é a dashboard geral do sistema)
  if (_ffSubAba === 'painel') { _ffRenderPainel(cont); return; }

  // Telas do Financeiro
  if (_ffSubAba === 'estornos')    { _ffRenderEstornos(cont); return; }
  if (_ffSubAba === 'a-pagar')     { _ffRenderAPagar(cont); return; }
  if (_ffSubAba === 'finalizados') { _ffRenderFinalizados(cont); return; }

  // Configuração do fluxo de aprovação (admin define os responsáveis de cada etapa)
  if (_ffSubAba === 'config') {
    if (!_ffPodeAdministrarWorkflow()) { cont.innerHTML = '<div class="ff-empty-box"><div class="ff-empty-title">Sem acesso</div><div class="ff-empty-text">Só o administrador configura o fluxo.</div></div>'; return; }
    _ffRenderConfig(cont); return;
  }
  // Monitoramento do workflow (onde está cada processo e há quanto tempo)
  if (_ffSubAba === 'monitor') {
    if (!_ffVeTudo()) { cont.innerHTML = ''; return; }
    _ffRenderMonitor(cont); return;
  }

  // Planilha gerencial (visão gerencial/admin): visão de auditoria completa
  if (_ffSubAba === 'gerencial') {
    if (!_ffVeTudo()) { cont.innerHTML = ''; return; }
    const todos = [...state.fluxosFinanceiros].sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));
    const cel = (quem, quando) => quem
      ? `<div style="font-weight:600;color:#0f172a;">${escapeHTML(quem)}</div><div style="font-size:10px;color:#64748b;">${_formatarDataHoraBR(quando)}</div>`
      : '<span style="color:#cbd5e1;">—</span>';
    cont.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h3 style="margin:0;font-size:16px;font-weight:600;color:#0f172a;"><i class="fa-solid fa-table-cells" style="color:#0284c7;"></i> Visão Gerencial do Fluxo</h3>
        <button class="btn btn-sm btn-outline" style="border-color:#059669;color:#059669;font-weight:600;" onclick="exportarGerencialExcel()">
          <i class="fa-solid fa-file-excel"></i> Exportar planilha gerencial (.xlsx)</button>
      </div>
      <div class="ff-table-container">
        <table class="ff-table">
          <thead><tr><th>Nº</th><th>Empresa</th><th>Tipo</th><th>Pagamento</th><th>Valor</th><th>Analista (criou)</th><th>Supervisão DP</th><th>Gestão</th><th>Financeiro</th><th>Comprovante</th><th>Status</th><th>Ação</th></tr></thead>
          <tbody>
            ${todos.map(f => {
              const st = FF_STATUS[f.status] || FF_STATUS.rascunho;
              const prazo = _ffPrazo(f);
              return `<tr>
                <td style="font-weight:600;color:#0284c7;">#${escapeHTML(f.numero)}</td>
                <td style="font-weight:600;color:#0f172a;">${escapeHTML(f.empresaNome || '—')}</td>
                <td>${escapeHTML(f.tipo || '—')}</td>
                <td>${f.dataPagamento ? _formatarDataBR(f.dataPagamento) : '—'}
                  ${prazo && prazo.nivel !== 'ok' ? `<div class="ff-prazo-tag ff-prazo-${prazo.nivel}">${prazo.rotulo}</div>` : ''}</td>
                <td class="ff-val-destaque">${_ffMoedaBR(_ffTotal(f))}</td>
                <td>${cel(f.criadoPor, f.criadoEm)}</td>
                <td>${cel(f.aprovacoes.coordenacao?.por, f.aprovacoes.coordenacao?.em)}</td>
                <td>${cel(f.aprovacoes.gestao?.por, f.aprovacoes.gestao?.em)}</td>
                <td>${cel(f.aprovacoes.pagamento?.por, f.aprovacoes.pagamento?.em)}</td>
                <td>${f.comprovante ? cel('Anexado', f.comprovante.em) : '<span style="color:#cbd5e1;">—</span>'}</td>
                <td><span class="ff-badge ff-badge-${f.status}" style="color:${st.cor};">${st.rotulo}</span></td>
                <td><button class="btn btn-secondary btn-sm" style="padding:4px 10px;font-size:11px;" onclick="abrirDetalheFluxo('${f.id}')"><i class="fa-solid fa-eye"></i> Abrir</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
    return;
  }

  let lista = _ffVisiveis();
  if (_ffSubAba === 'minha-vez')   lista = lista.filter(f => _ffEhMinhaVez(f));
  if (_ffSubAba === 'andamento')   lista = lista.filter(f => ['rascunho', 'aguardando_coordenacao', 'aguardando_gestao', 'aguardando_financeiro'].includes(f.status));
  if (_ffSubAba === 'finalizados') lista = lista.filter(f => ['pago', 'finalizado'].includes(f.status));
  if (_ffSubAba === 'problemas')   lista = lista.filter(f => ['reprovado', 'cancelado'].includes(f.status));

  // Filtro dinâmico por busca rápida e empresa
  if (_ffFiltroBusca) {
    const q = _ffFiltroBusca.toLowerCase();
    // Busca também por tomador e cliente dos vínculos (fluxos antigos, que só
    // têm empresaNome, continuam sendo encontrados pelo mesmo caminho de antes).
    lista = lista.filter(f => (f.numero && f.numero.includes(q)) ||
      (f.empresaNome && f.empresaNome.toLowerCase().includes(q)) ||
      (f.tipo && f.tipo.toLowerCase().includes(q)) ||
      (f.criadoPor && f.criadoPor.toLowerCase().includes(q)) ||
      _ffRelacaoTexto(f).toLowerCase().includes(q) ||
      (Array.isArray(f.vinculos) && f.vinculos.some(v =>
        (v.empresaNome   || '').toLowerCase().includes(q) ||
        (v.clienteNome   || '').toLowerCase().includes(q) ||
        String(v.tomadorCodigo || '').toLowerCase().includes(q) ||
        (v.tomadorNome   || '').toLowerCase().includes(q))));
  }
  if (_ffFiltroEmpresa) {
    // Um fluxo com vários vínculos aparece no filtro de QUALQUER empresa dele.
    lista = lista.filter(f => f.empresaNome === _ffFiltroEmpresa ||
      (Array.isArray(f.vinculos) && f.vinculos.some(v => v.empresaNome === _ffFiltroEmpresa)));
  }

  lista.sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));

  // Empresas do filtro: as do campo antigo MAIS as que aparecem nos vínculos.
  const empresasUnicas = [...new Set(_ffVisiveis().flatMap(f => [
    f.empresaNome,
    ...(Array.isArray(f.vinculos) ? f.vinculos.map(v => v.empresaNome) : [])
  ]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  // Barra de ferramentas (busca + filtro de empresa)
  const toolbarHtml = `
    <div class="ff-table-toolbar">
      <div class="ff-search-box">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="text" class="ff-search-input" placeholder="Buscar por número, empresa, tipo..." value="${escapeHTML(_ffFiltroBusca)}" oninput="_ffFiltroBusca=this.value;_ffRenderLista();">
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <select class="ff-filter-select" onchange="_ffFiltroEmpresa=this.value;_ffRenderLista();">
          <option value="">Todas as empresas</option>
          ${empresasUnicas.map(e => `<option value="${escapeHTML(e)}" ${e === _ffFiltroEmpresa ? 'selected' : ''}>${escapeHTML(e)}</option>`).join('')}
        </select>
      </div>
    </div>`;

  if (!lista.length) {
    cont.innerHTML = toolbarHtml + `
      <div class="ff-empty-box">
        <div class="ff-empty-icon"><i class="fa-solid fa-money-bill-transfer"></i></div>
        <div class="ff-empty-title">${_ffSubAba === 'minha-vez' ? 'Nada aguardando sua ação 👌' : 'Nenhum fluxo encontrado'}</div>
        <div class="ff-empty-text">
          ${_ffSubAba === 'minha-vez'
            ? 'Todos os processos sob sua responsabilidade foram analisados.'
            : 'Não há registros financeiros nesta categoria no momento.'}
        </div>
        ${_ffPodeCriar() && _ffSubAba !== 'minha-vez' ? `<button class="btn btn-primary" style="margin-top:16px;" onclick="abrirModalNovoFluxo()"><i class="fa-solid fa-plus"></i> Novo Fluxo Financeiro</button>` : ''}
      </div>`;
    return;
  }

  // Callout de pendências: só na aba "Minhas Pendências", quando há algo aguardando VOCÊ
  const minhasPend = lista.filter(f => _ffEhMinhaVez(f));
  const calloutHtml = (_ffSubAba === 'minha-vez' && minhasPend.length) ? `
    <div style="display:flex;align-items:center;gap:12px;background:rgba(217,119,6,.12);border:1px solid rgba(217,119,6,.35);border-left:5px solid #D97706;border-radius:12px;padding:12px 16px;margin-bottom:14px;">
      <i class="fa-solid fa-bell" style="font-size:22px;color:#D97706;"></i>
      <div><div style="font-weight:600;color:#0f172a;font-size:14px;">Você tem ${minhasPend.length} pendência(s) aguardando sua ação</div>
        <div style="font-size:12px;color:#64748b;">Analise cada processo e aprove, devolva ou reprove.</div></div>
    </div>` : '';

  cont.innerHTML = calloutHtml + toolbarHtml + `
    <div class="ff-table-container">
      <table class="ff-table">
        <thead><tr><th>Enviado por</th><th>Nº</th><th>Empresa</th><th>Tipo</th><th>Data Pagamento</th><th>Competência</th><th>Colab.</th><th style="text-align:right;">Valor Total</th><th>Status</th><th style="text-align:center;">Ação</th></tr></thead>
        <tbody>
          ${lista.map(f => {
            const st = FF_STATUS[f.status] || FF_STATUS.rascunho;
            const minha = _ffEhMinhaVez(f);
            return `<tr class="${minha ? 'ff-row-highlight' : ''}">
              <td data-label="Enviado por">${_ffQuemSubiu(f)}</td>
              <td style="font-weight:600;color:#0284c7;">#${escapeHTML(f.numero)}</td>
              <td style="font-weight:600;color:#0f172a;">${escapeHTML(f.empresaNome || '—')}</td>
              <td>${escapeHTML(f.tipo || '—')}</td>
              <td>${f.dataPagamento ? _formatarDataBR(f.dataPagamento) : '—'}</td>
              <td>${escapeHTML(_ffCompetenciaBR(f.competencia))}</td>
              <td style="font-weight:600;">${(f.linhas || []).length}</td>
              <td style="text-align:right;" class="ff-val-destaque">${_ffMoedaBR(_ffTotal(f))}</td>
              <td>
                <span class="ff-badge ff-badge-${f.status}" style="color:${st.cor};">
                  <i class="fa-solid ${st.icone}"></i> ${st.rotulo}
                </span>
                ${minha ? '<div style="font-size:10px;font-weight:600;color:#D97706;margin-top:3px;"><i class="fa-solid fa-hand-point-right"></i> Sua vez</div>' : ''}
                ${(() => { const pz = _ffPrazo(f); return pz && pz.nivel !== 'ok'
                  ? `<div class="ff-prazo-tag ff-prazo-${pz.nivel}"><i class="fa-solid fa-clock"></i> ${pz.rotulo}</div>` : ''; })()}
              </td>
              <td style="text-align:center;"><button class="btn btn-secondary btn-sm" style="padding:4px 12px;font-size:11px;" onclick="abrirDetalheFluxo('${f.id}')"><i class="fa-solid fa-eye"></i> Abrir</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════════
// VÍNCULOS DO FLUXO: EMPRESA → TOMADOR → CLIENTE
// --------------------------------------------------------------------------
// Um fluxo pode ter VÁRIOS vínculos. A chave lógica de um vínculo é
// EMPRESA + TOMADOR + CLIENTE — o código do tomador se repete entre empresas
// (o 76 existe na RT1 e na RT2), então tomador sozinho não identifica nada.
//
// Compatibilidade: fluxos antigos têm só empresaId/empresaNome e nenhum
// vínculo. Eles continuam sendo exibidos normalmente (_ffIdentificacao trata
// os dois formatos) e NÃO são migrados.
// ══════════════════════════════════════════════════════════════════════════
let _ffVinculos = [];

// Só cadastros ATIVOS aparecem para novos lançamentos. Os inativos continuam
// visíveis no histórico, mas não podem ser escolhidos de novo.
// ══════════════════════════════════════════════════════════════════════════
// As três listas do Fluxo Financeiro moram em chaves PRÓPRIAS.
// --------------------------------------------------------------------------
// state.empresas é a lista OPERACIONAL — Vagas, Contratações, os gráficos do
// Dashboard e o mapa de empresas próximas do Banco de Talentos dependem dela,
// com cor e coordenadas. O Fluxo Financeiro tem outra realidade (EMPRESA ->
// TOMADOR -> CLIENTE, vindo da planilha do cliente). Enquanto as duas dividiam
// a mesma lista, atualizar a do financeiro apagava a operacional.
// ══════════════════════════════════════════════════════════════════════════
const FF_CHAVE = { empresas: 'ffEmpresas', tomadores: 'ffTomadores', clientes: 'ffClientes' };
function _ffLista(tipo) {
  const k = FF_CHAVE[tipo] || tipo;
  if (!Array.isArray(state[k])) state[k] = [];
  return state[k];
}
window._ffLista = _ffLista;

function _ffEmpresasAtivas() {
  const veSigilo = (typeof _ffVeSigilo === 'function') ? _ffVeSigilo() : false;
  return _ffLista('empresas')
    .filter(e => e && e.ativo !== false && (veSigilo || e.sigilosa !== true))
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
}
function _ffTomadoresDaEmpresa(empresaId) {
  if (!empresaId) return [];
  return _ffLista('tomadores').filter(t => t && t.ativo !== false && t.empresaId === empresaId)
    .sort((a, b) => (Number(a.codigo) || 0) - (Number(b.codigo) || 0));
}
function _ffClientesDoTomador(empresaId, tomadorId) {
  if (!empresaId || !tomadorId) return [];
  return _ffLista('clientes').filter(c => c && c.ativo !== false &&
      c.empresaId === empresaId && c.tomadorId === tomadorId)
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
}
function _ffNomeTomador(t) {
  if (!t) return '';
  return t.nome ? `${t.codigo} — ${t.nome}` : String(t.codigo);
}

// ══════════════════════════════════════════════════════════════════════════
// EMPRESAS SIGILOSAS
// --------------------------------------------------------------------------
// Uma empresa marcada como sigilosa só aparece para quem está na lista de
// acesso (state.ffSigiloLogins) — e o SERVIDOR é quem garante isso: para os
// outros, esses dados nem saem de lá. O filtro daqui é a segunda camada, para
// a tela nunca mostrar algo que escapou.
//
// A ficha de empresa sigilosa pula Supervisão e Gestão e cai direto em
// "Aguardando Financeiro", com as duas aprovações registradas no histórico
// como automáticas — assim o rastro não fica com buraco.
// ══════════════════════════════════════════════════════════════════════════
function _ffSigiloLogins() {
  return Array.isArray(state.ffSigiloLogins) ? state.ffSigiloLogins : [];
}
function _ffVeSigilo() {
  if (!loggedUser) return false;
  if (ehMestre(loggedUser.login)) return true;
  return _ffSigiloLogins().indexOf(loggedUser.login) >= 0;
}
function _ffEmpresaSigilosa(empresaId) {
  const e = _ffLista('empresas').find(x => x && x.id === empresaId);
  return !!(e && e.sigilosa === true);
}
// A ficha é sigilosa se QUALQUER vínculo dela aponta para empresa sigilosa
function _ffFichaSigilosa(f) {
  if (!f) return false;
  if (f.empresaId && _ffEmpresaSigilosa(f.empresaId)) return true;
  return Array.isArray(f.vinculos) && f.vinculos.some(v => v && _ffEmpresaSigilosa(v.empresaId));
}
window._ffFichaSigilosa = _ffFichaSigilosa;

// ── Lista de quem pode ver (Configurações) ────────────────────────────────
function _sigRender() {
  const cont = document.getElementById('sig-pessoas');
  if (!cont) return;
  const bloco = document.getElementById('sig-bloco');
  // Só o mestre configura quem vê o sigiloso
  if (bloco) bloco.style.display = (loggedUser && ehMestre(loggedUser.login)) ? '' : 'none';
  if (!loggedUser || !ehMestre(loggedUser.login)) return;

  const marcados = _ffSigiloLogins();
  const conta = document.getElementById('sig-conta');
  if (conta) conta.textContent = marcados.length;

  const pessoas = (state.funcionarios || [])
    .filter(f => f && f.login && f.status !== 'inativo' && !ehMestre(f.login))
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));

  if (!pessoas.length) { cont.innerHTML = '<p class="sig-vazio">Nenhum funcionário cadastrado ainda.</p>'; return; }

  cont.innerHTML = '<div class="sig-grade">' + pessoas.map(f => {
    const on = marcados.indexOf(f.login) >= 0;
    return '<label class="sig-pessoa' + (on ? ' ativa' : '') + '">' +
      '<input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="sigAlternar(\'' + escapeHTML(f.login) + '\', this.checked)">' +
      '<span class="sig-nome">' + escapeHTML(nomeExibido(f)) + '</span>' +
      '<span class="sig-depto">' + escapeHTML(f.cargo || f.departamento || '') + '</span>' +
    '</label>';
  }).join('') + '</div>';
}
window._sigRender = _sigRender;

window.sigAlternar = async function (login, ligar) {
  if (!loggedUser || !ehMestre(loggedUser.login)) { alert('Só a conta mestre define quem vê as empresas sigilosas.'); return; }
  const lista = _ffSigiloLogins().slice();
  const i = lista.indexOf(login);
  if (ligar && i < 0) lista.push(login);
  if (!ligar && i >= 0) lista.splice(i, 1);
  state.ffSigiloLogins = lista;
  // setKeys: esta chave é uma lista de LOGINS (texto puro, sem id), então o
  // merge do servidor só sabe ACRESCENTAR o que falta. Passar apenas
  // { merge: true } fazia a remoção nunca acontecer: o mestre desmarcava a
  // pessoa, a tela aceitava, e no recarregamento ela estava marcada de novo
  // — continuando a ver as empresas sigilosas.
  try { await RTCloud.salvarAgora(state, { merge: true, setKeys: ['ffSigiloLogins'] }); }
  catch (e) { alert('Não consegui salvar: ' + (e.message || e)); return; }
  registrarLogGlobal((ligar ? 'Liberou' : 'Removeu') + ' acesso a empresas sigilosas: ' + login + '.', 'sistema');
  _sigRender();
};

// ══════════════════════════════════════════════════════════════════════════
// CADASTROS DO FLUXO FINANCEIRO (Configurações) — empresa, tomador, cliente
// --------------------------------------------------------------------------
// É esta lista que alimenta os selects ao montar uma ficha. O que for criado
// aqui leva origem "manual" e nunca é substituído pela carga da planilha. E
// se um registro da planilha for editado, ele VIRA manual — senão a correção
// se perderia na próxima atualização da base.
//
// Nada é apagado por padrão: o caminho normal é DESATIVAR, que tira do
// formulário e mantém as fichas antigas coerentes. Apagar de vez só é
// oferecido para o que foi criado à mão e nunca entrou numa ficha.
// ══════════════════════════════════════════════════════════════════════════
let _cadAba = 'clientes';
let _cadBusca = '';
let _cadEmpresaFiltro = '';
let _cadVerInativos = false;
let _cadEditandoId = '';

function _cadPode() {
  return !!(loggedUser && (ehMestre(loggedUser.login) || loggedUser.departamento === 'administracao'));
}
function _cadLista(tipo) { return _ffLista(tipo); }
function _cadEmpresa(id) { return _cadLista('empresas').find(e => e && e.id === id) || null; }
function _cadTomador(id) { return _cadLista('tomadores').find(t => t && t.id === id) || null; }
function _cadNorm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
}
// Quantas fichas usam este cadastro (para não deixar apagar algo em uso)
function _cadUsosEmFichas(tipo, id) {
  const campo = tipo === 'empresas' ? 'empresaId' : (tipo === 'tomadores' ? 'tomadorId' : 'clienteId');
  return (state.fluxosFinanceiros || []).filter(f =>
    Array.isArray(f.vinculos) && f.vinculos.some(v => v && v[campo] === id)
  ).length;
}

window.cadTrocarAba = function (aba) {
  _cadAba = aba; _cadBusca = ''; _cadEmpresaFiltro = '';
  const b = document.getElementById('cad-busca'); if (b) b.value = '';
  _cadRender();
};
window.cadFiltrar = function (txt) { _cadBusca = txt; _cadRender(); };
window.cadFiltrarEmpresa = function (id) { _cadEmpresaFiltro = id; _cadRender(); };
window.cadVerInativos = function (v) { _cadVerInativos = !!v; _cadRender(); };

function _cadRender() {
  const cont = document.getElementById('cad-lista');
  if (!cont) return;
  garantirFluxoFinanceiro();

  // Abas + contadores
  ['empresas', 'tomadores', 'clientes'].forEach(t => {
    const btn = document.getElementById('cad-aba-' + t);
    if (btn) btn.classList.toggle('ativa', t === _cadAba);
    const c = document.getElementById('cad-conta-' + t);
    if (c) c.textContent = _cadLista(t).filter(r => r && r.ativo !== false).length;
  });

  // Filtro de empresa: só faz sentido em tomadores/clientes
  const selEmp = document.getElementById('cad-filtro-empresa');
  if (selEmp) {
    selEmp.style.display = _cadAba === 'empresas' ? 'none' : '';
    if (_cadAba !== 'empresas') {
      selEmp.innerHTML = '<option value="">Todas as empresas</option>' +
        _ffEmpresasAtivas().map(e =>
          `<option value="${escapeHTML(e.id)}"${e.id === _cadEmpresaFiltro ? ' selected' : ''}>${escapeHTML(e.nome)}</option>`).join('');
    }
  }

  const q = _cadNorm(_cadBusca);
  let itens = _cadLista(_cadAba).filter(r => {
    if (!r) return false;
    if (!_cadVerInativos && r.ativo === false) return false;
    if (_cadEmpresaFiltro && _cadAba !== 'empresas' && r.empresaId !== _cadEmpresaFiltro) return false;
    if (!q) return true;
    const alvo = _cadNorm([r.nome, r.codigo, r.sigla].filter(Boolean).join(' '));
    return alvo.includes(q);
  });

  itens = itens.sort((a, b) => {
    if (_cadAba === 'tomadores') {
      const ea = (_cadEmpresa(a.empresaId) || {}).nome || '';
      const eb = (_cadEmpresa(b.empresaId) || {}).nome || '';
      if (ea !== eb) return ea.localeCompare(eb, 'pt-BR');
      return String(a.codigo || '').localeCompare(String(b.codigo || ''), 'pt-BR', { numeric: true });
    }
    return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
  });

  if (!itens.length) {
    cont.innerHTML = '<div class="cad-vazio"><i class="fa-solid fa-magnifying-glass"></i>' +
      '<p>' + (_cadBusca || _cadEmpresaFiltro ? 'Nada encontrado com esse filtro.' : 'Nenhum cadastro nesta lista ainda.') + '</p></div>';
    return;
  }

  const linhas = itens.map(r => {
    const inativo = r.ativo === false;
    const usos = _cadUsosEmFichas(_cadAba, r.id);
    const podeApagar = r.origem === 'manual' && usos === 0;

    let titulo = '', sub = '';
    if (_cadAba === 'empresas') {
      titulo = r.nome || '(sem nome)';
      sub = (r.sigla ? 'Sigla ' + r.sigla + ' · ' : '') +
        _cadLista('tomadores').filter(t => t.empresaId === r.id && t.ativo !== false).length + ' tomador(es) · ' +
        _cadLista('clientes').filter(c => c.empresaId === r.id && c.ativo !== false).length + ' cliente(s)';
    } else if (_cadAba === 'tomadores') {
      titulo = _ffNomeTomador(r);
      const cli = _cadLista('clientes').filter(c => c.tomadorId === r.id && c.ativo !== false);
      sub = ((_cadEmpresa(r.empresaId) || {}).nome || '—') + ' · ' +
        (cli.length === 1 ? cli[0].nome : cli.length + ' cliente(s)');
    } else {
      titulo = r.nome || '(sem nome)';
      const t = _cadTomador(r.tomadorId);
      sub = ((_cadEmpresa(r.empresaId) || {}).nome || '—') + ' · tomador ' + (t ? t.codigo : '—');
    }

    return '<div class="cad-item' + (inativo ? ' inativo' : '') + '">' +
      '<div class="cad-item-txt">' +
        '<div class="cad-item-nome">' + escapeHTML(titulo) +
          (inativo ? ' <span class="cad-tag cad-tag-off">desativado</span>' : '') +
          (r.sigilosa === true ? ' <span class="cad-tag cad-tag-sigilo"><i class="fa-solid fa-lock"></i> sigilosa</span>' : '') +
          (r.origem === 'manual' ? ' <span class="cad-tag cad-tag-novo">criado aqui</span>' : '') +
        '</div>' +
        '<div class="cad-item-sub">' + escapeHTML(sub) +
          (usos ? ' · <b>' + usos + ' ficha(s)</b>' : '') + '</div>' +
      '</div>' +
      '<div class="cad-item-acoes">' +
        '<button class="btn btn-sm btn-secondary" onclick="cadAbrirModal(\'' + r.id + '\')" title="Editar">' +
          '<i class="fa-solid fa-pen"></i></button>' +
        '<button class="btn btn-sm btn-secondary" onclick="cadAlternarAtivo(\'' + r.id + '\')" title="' +
          (inativo ? 'Reativar' : 'Desativar') + '">' +
          '<i class="fa-solid fa-' + (inativo ? 'rotate-left' : 'eye-slash') + '"></i></button>' +
        (podeApagar
          ? '<button class="btn btn-sm btn-outline cad-apagar" onclick="cadApagar(\'' + r.id + '\')" title="Apagar de vez">' +
            '<i class="fa-solid fa-trash-can"></i></button>'
          : '') +
      '</div>' +
    '</div>';
  }).join('');

  cont.innerHTML = '<div class="cad-itens">' + linhas + '</div>' +
    '<div class="cad-rodape">' + itens.length + ' de ' + _cadLista(_cadAba).length + ' ' + _cadAba + '</div>';
}
window._cadRender = _cadRender;

// ── Modal ─────────────────────────────────────────────────────────────────
window.cadAbrirModal = function (id) {
  if (!_cadPode()) { alert('Só o administrador altera estes cadastros.'); return; }
  garantirFluxoFinanceiro();
  _cadEditandoId = id || '';
  const g = k => document.getElementById(k);
  const reg = id ? _cadLista(_cadAba).find(r => r && r.id === id) : null;
  const tipo = reg ? _cadAba : _cadAba;

  if (g('cad-tipo')) g('cad-tipo').value = tipo;
  if (g('cad-campo-tipo')) g('cad-campo-tipo').style.display = reg ? 'none' : '';
  if (g('cad-modal-titulo')) g('cad-modal-titulo').textContent = reg ? 'Editar cadastro' : 'Novo cadastro';
  if (g('cad-modal-sub')) g('cad-modal-sub').textContent = reg
    ? (reg.origem === 'base' ? 'Veio da planilha — ao salvar, passa a ser seu e não será substituído' : 'Cadastro criado aqui')
    : 'Empresa, tomador ou cliente';
  if (g('cad-erro')) g('cad-erro').textContent = '';

  _cadPreencherEmpresas(reg ? reg.empresaId : '');
  _cadPreencherTomadores(reg ? reg.empresaId : '', reg ? reg.tomadorId : '');
  if (g('cad-f-nome'))   g('cad-f-nome').value   = reg ? (reg.nome || '') : '';
  if (g('cad-f-codigo')) g('cad-f-codigo').value = reg ? (reg.codigo || '') : '';
  if (g('cad-f-sigla'))  g('cad-f-sigla').value  = reg ? (reg.sigla || '') : '';
  if (g('cad-f-sigilosa')) g('cad-f-sigilosa').checked = !!(reg && reg.sigilosa === true);

  cadTrocarTipo(tipo);
  const m = g('modal-cadastro-ff');
  if (m) m.style.display = 'flex';
  setTimeout(() => { const n = g('cad-f-nome'); if (n && n.offsetParent) n.focus(); }, 120);
};
window.cadFecharModal = function () {
  const m = document.getElementById('modal-cadastro-ff');
  if (m) m.style.display = 'none';
  _cadEditandoId = '';
};
// Mostra só os campos que aquele tipo precisa
window.cadTrocarTipo = function (tipo) {
  const ver = (id, mostrar) => { const el = document.getElementById(id); if (el) el.style.display = mostrar ? '' : 'none'; };
  ver('cad-campo-empresa', tipo !== 'empresas');
  ver('cad-campo-tomador', tipo === 'clientes');
  ver('cad-campo-codigo',  tipo === 'tomadores');
  ver('cad-campo-sigla',   tipo === 'empresas');
  // Marcar como sigilosa é coisa da conta mestre
  ver('cad-campo-sigilosa', tipo === 'empresas' && !!(loggedUser && ehMestre(loggedUser.login)));
  const rot = document.querySelector('#cad-campo-nome label');
  if (rot) rot.textContent = tipo === 'empresas' ? 'Nome da empresa *'
    : (tipo === 'tomadores' ? 'Nome do tomador (opcional)' : 'Nome do cliente *');
  const inp = document.getElementById('cad-f-nome');
  if (inp) inp.placeholder = tipo === 'empresas' ? 'Ex.: 25/Green Service'
    : (tipo === 'tomadores' ? 'Deixe vazio se o tomador não tiver nome' : 'Ex.: SUPERPAV');
};
function _cadPreencherEmpresas(sel) {
  const s = document.getElementById('cad-f-empresa');
  if (!s) return;
  s.innerHTML = '<option value="">Selecionar empresa...</option>' +
    _ffEmpresasAtivas().map(e => `<option value="${escapeHTML(e.id)}"${e.id === sel ? ' selected' : ''}>${escapeHTML(e.nome)}</option>`).join('');
}
function _cadPreencherTomadores(empresaId, sel) {
  const s = document.getElementById('cad-f-tomador');
  if (!s) return;
  const lista = _ffTomadoresDaEmpresa(empresaId);
  s.innerHTML = '<option value="">' + (empresaId ? (lista.length ? 'Selecionar tomador...' : 'Nenhum tomador nesta empresa') : 'Escolha a empresa primeiro') + '</option>' +
    lista.map(t => `<option value="${escapeHTML(t.id)}"${t.id === sel ? ' selected' : ''}>${escapeHTML(_ffNomeTomador(t))}</option>`).join('');
}
window.cadFormEmpresaMudou = function (id) { _cadPreencherTomadores(id, ''); };

window.cadSalvar = async function () {
  if (!_cadPode()) { alert('Só o administrador altera estes cadastros.'); return; }
  const g = k => document.getElementById(k);
  const erro = m => { if (g('cad-erro')) g('cad-erro').textContent = m; };
  const tipo = _cadEditandoId ? _cadAba : (g('cad-tipo') || {}).value || 'clientes';
  const nome = ((g('cad-f-nome') || {}).value || '').trim();
  const empresaId = ((g('cad-f-empresa') || {}).value || '').trim();
  const tomadorId = ((g('cad-f-tomador') || {}).value || '').trim();
  const codigo = ((g('cad-f-codigo') || {}).value || '').trim();
  const sigla = ((g('cad-f-sigla') || {}).value || '').trim();

  if (tipo !== 'tomadores' && !nome) { erro('Escreva o nome.'); return; }
  if (tipo !== 'empresas' && !empresaId) { erro('Escolha a empresa.'); return; }
  if (tipo === 'clientes' && !tomadorId) { erro('Escolha o tomador.'); return; }
  if (tipo === 'tomadores' && !codigo) { erro('Escreva o código do tomador.'); return; }

  const lista = _cadLista(tipo);
  const eu = _cadEditandoId;
  // Repetido? (empresa: nome; tomador: empresa+código; cliente: empresa+tomador+nome)
  const repetido = lista.some(r => {
    if (!r || r.id === eu) return false;
    if (tipo === 'empresas')  return _cadNorm(r.nome) === _cadNorm(nome);
    if (tipo === 'tomadores') return r.empresaId === empresaId && _cadNorm(r.codigo) === _cadNorm(codigo);
    return r.empresaId === empresaId && r.tomadorId === tomadorId && _cadNorm(r.nome) === _cadNorm(nome);
  });
  if (repetido) {
    erro(tipo === 'empresas' ? 'Já existe uma empresa com esse nome.'
      : tipo === 'tomadores' ? 'Essa empresa já tem um tomador com esse código.'
      : 'Esse tomador já tem um cliente com esse nome.');
    return;
  }

  let reg = eu ? lista.find(r => r && r.id === eu) : null;
  if (reg) {
    // Editou algo que veio da planilha? Vira "manual" para não ser substituído.
    reg.origem = 'manual';
    reg.nome = nome;
    if (tipo === 'empresas')  { reg.sigla = sigla; if (ehMestre(loggedUser.login)) reg.sigilosa = !!(g('cad-f-sigilosa') || {}).checked; }
    if (tipo === 'tomadores') { reg.codigo = codigo; reg.empresaId = empresaId; }
    if (tipo === 'clientes')  { reg.empresaId = empresaId; reg.tomadorId = tomadorId; }
  } else {
    const novoId = tipo.slice(0, 3) + '-man-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    reg = { id: novoId, nome: nome, ativo: true, origem: 'manual' };
    if (tipo === 'empresas')  { reg.sigla = sigla; reg.sigilosa = !!(ehMestre(loggedUser.login) && (g('cad-f-sigilosa') || {}).checked); }
    if (tipo === 'tomadores') { reg.empresaId = empresaId; reg.codigo = codigo; }
    if (tipo === 'clientes')  { reg.empresaId = empresaId; reg.tomadorId = tomadorId; }
    _ffLista(tipo).push(reg);
    _cadAba = tipo;
  }

  try { await RTCloud.salvarAgora(state, { merge: true, upsertIds: [reg.id] }); }
  catch (e) { erro('Não consegui salvar: ' + (e.message || e)); return; }
  registrarLogGlobal((eu ? 'Editou' : 'Cadastrou') + ' ' + tipo.slice(0, -1) + ' do Fluxo Financeiro: ' + (nome || codigo) + '.', 'sistema');
  cadFecharModal();
  _cadRender();
};

window.cadAlternarAtivo = async function (id) {
  if (!_cadPode()) return;
  const reg = _cadLista(_cadAba).find(r => r && r.id === id);
  if (!reg) return;
  const desativando = reg.ativo !== false;
  if (desativando) {
    const usos = _cadUsosEmFichas(_cadAba, id);
    const aviso = 'Desativar "' + (reg.nome || reg.codigo) + '"?\n\n' +
      'Ele some do formulário de novas fichas.' +
      (usos ? '\nAs ' + usos + ' ficha(s) que já usam continuam iguais.' : '') +
      '\n\nDá para reativar depois.';
    if (!confirm(aviso)) return;
  }
  reg.ativo = !desativando;
  try { await RTCloud.salvarAgora(state, { merge: true, upsertIds: [reg.id] }); }
  catch (e) { alert('Não consegui salvar: ' + (e.message || e)); return; }
  _cadRender();
};

window.cadApagar = async function (id) {
  if (!_cadPode()) return;
  const lista = _cadLista(_cadAba);
  const reg = lista.find(r => r && r.id === id);
  if (!reg) return;
  if (reg.origem !== 'manual') { alert('Este cadastro veio da planilha oficial. Use DESATIVAR.'); return; }
  const usos = _cadUsosEmFichas(_cadAba, id);
  if (usos) { alert('Não dá para apagar: ' + usos + ' ficha(s) usam este cadastro. Use DESATIVAR.'); return; }
  // Apagar empresa/tomador que tem coisa pendurada quebraria a lista
  if (_cadAba === 'empresas' && _cadLista('tomadores').some(t => t.empresaId === id)) {
    alert('Esta empresa tem tomadores. Apague ou mova os tomadores antes.'); return;
  }
  if (_cadAba === 'tomadores' && _cadLista('clientes').some(c => c.tomadorId === id)) {
    alert('Este tomador tem clientes. Apague os clientes antes.'); return;
  }
  if (!confirm('Apagar "' + (reg.nome || reg.codigo) + '" de vez?\n\nNão dá para desfazer.')) return;
  state[FF_CHAVE[_cadAba] || _cadAba] = lista.filter(r => r && r.id !== id);
  // deleteIds: sem isso, apagar estando com a versao atrasada nao apagava de
  // verdade no servidor (o merge anti-perda so junta, nunca remove) -- o
  // cadastro sumia da tela e reaparecia no proximo carregamento.
  try { await RTCloud.salvarAgora(state, { merge: true, deleteIds: [id] }); }
  catch (e) { alert('Não consegui salvar: ' + (e.message || e)); return; }
  registrarLogGlobal('Apagou ' + _cadAba.slice(0, -1) + ' do Fluxo Financeiro: ' + (reg.nome || reg.codigo) + '.', 'sistema');
  _cadRender();
};

function _ffRenderVinculos() {
  const cont = document.getElementById('ff-vinculos-lista');
  if (!cont) return;
  if (!_ffVinculos.length) _ffVinculos = [{ empresaId: '', tomadorId: '', clienteId: '' }];

  cont.innerHTML = _ffVinculos.map((v, i) => {
    const tomadores = _ffTomadoresDaEmpresa(v.empresaId);
    const clientes  = _ffClientesDoTomador(v.empresaId, v.tomadorId);
    const opt = (val, txt, sel) => `<option value="${escapeHTML(String(val))}"${sel ? ' selected' : ''}>${escapeHTML(txt)}</option>`;
    return `
      <div class="ff-vinculo-linha" data-indice="${i}">
        <div class="ff-vinculo-topo">
          <span class="ff-vinculo-num">Vínculo ${i + 1}</span>
          ${_ffVinculos.length > 1
            ? `<button type="button" class="ff-vinculo-remover" onclick="ffRemoverVinculo(${i})" title="Remover este vínculo"><i class="fa-solid fa-trash-can"></i> Remover</button>`
            : ''}
        </div>
        <div class="ff-vinculo-campos">
          <div class="form-group">
            <label>Empresa *</label>
            <select class="form-control" onchange="ffVinculoMudou(${i},'empresa',this.value)">
              ${opt('', 'Selecionar empresa...', !v.empresaId)}
              ${_ffEmpresasAtivas().map(e => opt(e.id, e.nome, e.id === v.empresaId)).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Tomador *</label>
            <select class="form-control" onchange="ffVinculoMudou(${i},'tomador',this.value)" ${v.empresaId ? '' : 'disabled'}>
              ${opt('', v.empresaId ? (tomadores.length ? 'Selecionar tomador...' : 'Nenhum tomador nesta empresa') : 'Escolha a empresa primeiro', !v.tomadorId)}
              ${tomadores.map(t => opt(t.id, _ffNomeTomador(t), t.id === v.tomadorId)).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Cliente *</label>
            <select class="form-control" onchange="ffVinculoMudou(${i},'cliente',this.value)" ${v.tomadorId ? '' : 'disabled'}>
              ${opt('', v.tomadorId ? (clientes.length ? 'Selecionar cliente...' : 'Nenhum cliente neste tomador') : 'Escolha o tomador primeiro', !v.clienteId)}
              ${clientes.map(c => opt(c.id, c.nome, c.id === v.clienteId)).join('')}
            </select>
            ${v.clienteId && clientes.length === 1
              ? '<small class="ff-auto-dica"><i class="fa-solid fa-wand-magic-sparkles"></i> preenchido pelo tomador</small>'
              : (clientes.length > 1
                  ? '<small class="ff-auto-dica ff-auto-escolha"><i class="fa-solid fa-circle-info"></i> este tomador tem ' + clientes.length + ' clientes — escolha qual</small>'
                  : '')}
          </div>
        </div>
      </div>`;
  }).join('');
}

// Trocar a empresa zera tomador e cliente (senão sobraria uma combinação inválida).
// Ao escolher o tomador, o cliente se preenche sozinho — mas SÓ quando aquele
// código tem um cliente só. Existe caso na planilha com dois (Diárias RT2 ·
// 00021 = ATIVA e ATIVA SJP): aí a lista continua aberta para a pessoa escolher.
window.ffVinculoMudou = function (i, campo, valor) {
  const v = _ffVinculos[i];
  if (!v) return;
  if (campo === 'empresa') {
    v.empresaId = valor; v.tomadorId = ''; v.clienteId = '';
    // Empresa com um tomador só: já desce para ele (e o cliente vem junto).
    const tods = _ffTomadoresDaEmpresa(valor);
    if (tods.length === 1) { v.tomadorId = tods[0].id; _ffAutoCliente(v); }
  } else if (campo === 'tomador') {
    v.tomadorId = valor; v.clienteId = '';
    _ffAutoCliente(v);
  } else {
    v.clienteId = valor;
  }
  _ffRenderVinculos();
};

// Preenche o cliente quando não há dúvida (um único cliente naquele tomador).
function _ffAutoCliente(v) {
  if (!v || !v.tomadorId) return;
  const cli = _ffClientesDoTomador(v.empresaId, v.tomadorId);
  if (cli.length === 1) v.clienteId = cli[0].id;
}
window.ffAdicionarVinculo = function () {
  _ffVinculos.push({ empresaId: '', tomadorId: '', clienteId: '' });
  _ffRenderVinculos();
  const linhas = document.querySelectorAll('#ff-vinculos-lista .ff-vinculo-linha');
  const ultima = linhas[linhas.length - 1];
  if (ultima && ultima.scrollIntoView) ultima.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
};
window.ffRemoverVinculo = function (i) {
  if (_ffVinculos.length <= 1) return;   // sempre fica pelo menos um
  _ffVinculos.splice(i, 1);
  _ffRenderVinculos();
};

// Valida e converte os vínculos da tela em dados para gravar no fluxo.
function _ffVinculosParaSalvar() {
  const out = [];
  for (let i = 0; i < _ffVinculos.length; i++) {
    const v = _ffVinculos[i];
    const emp = _ffLista('empresas').find(e => e.id === v.empresaId);
    const tom = _ffLista('tomadores').find(t => t.id === v.tomadorId);
    const cli = _ffLista('clientes').find(c => c.id === v.clienteId);
    if (!emp || !tom || !cli) {
      return { erro: `Vínculo ${i + 1}: escolha empresa, tomador e cliente.` };
    }
    // Duplicidade dentro do MESMO fluxo (chave EMPRESA+TOMADOR+CLIENTE)
    if (out.some(o => o.empresaId === emp.id && o.tomadorId === tom.id && o.clienteId === cli.id)) {
      return { erro: `Vínculo ${i + 1} está repetido (${emp.nome} · ${tom.codigo} · ${cli.nome}).` };
    }
    out.push({
      empresaId: emp.id, empresaNome: emp.nome,
      tomadorId: tom.id, tomadorCodigo: String(tom.codigo), tomadorNome: tom.nome || '',
      clienteId: cli.id, clienteNome: cli.nome
    });
  }
  // Sigilosa e normal na mesma ficha não pode: a ficha inteira iria direto ao
  // Financeiro (levando a normal junto) ou ficaria escondida de quem precisa.
  const comSigilo = out.filter(o => _ffEmpresaSigilosa(o.empresaId));
  if (comSigilo.length && comSigilo.length !== out.length) {
    return { erro: 'Esta ficha mistura empresa sigilosa com empresa comum. ' +
      'Separe em duas fichas: a sigilosa vai direto para o Financeiro e a comum passa pelas aprovações.' };
  }
  return { vinculos: out };
}

// Texto de identificação de um fluxo — entende o formato NOVO (vínculos) e o
// ANTIGO (só empresaNome). Usado na lista, na busca e no detalhe.
function _ffIdentificacao(f) {
  if (f && Array.isArray(f.vinculos) && f.vinculos.length) {
    return f.vinculos.map(v => `${v.empresaNome} · ${v.tomadorCodigo} · ${v.clienteNome}`).join('  |  ');
  }
  return (f && f.empresaNome) || '—';   // fluxo antigo: continua aparecendo normal
}
window._ffIdentificacao = _ffIdentificacao;

// ── Novo fluxo ─────────────────────────────────────────────────────────────
function abrirModalNovoFluxo() {
  if (!_ffPodeCriar()) { alert('Você não tem permissão para criar fluxos financeiros.'); return; }
  garantirFluxoFinanceiro();
  _ffPdfsTemp = [];

  _ffVinculos = [{ empresaId: '', tomadorId: '', clienteId: '' }];   // sempre começa com 1 linha
  _ffRenderVinculos();
  // toda ficha nasce como pagamento do dia; estorno é escolha explícita
  _ffEstornosEscolhidos = {};
  const radio = document.querySelector('input[name="ff-lanc"][value="pagamento"]');
  if (radio) radio.checked = true;
  ffTrocarLancamento('pagamento');
  const selTipo = document.getElementById('ff-form-tipo');
  if (selTipo) selTipo.innerHTML = '<option value="">Selecione...</option>' +
    state.tiposPagamentoFluxo.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join('');

  ['ff-form-data', 'ff-form-competencia', 'ff-form-obs'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const prev = document.getElementById('ff-arquivos-preview'); if (prev) prev.innerHTML = '';
  const proc = document.getElementById('ff-processando'); if (proc) proc.style.display = 'none';
  const btn = document.getElementById('ff-btn-criar'); if (btn) btn.disabled = false;

  const m = document.getElementById('modal-novo-fluxo'); if (m) m.style.display = 'flex';
}
window.abrirModalNovoFluxo = abrirModalNovoFluxo;

function fecharModalNovoFluxo() {
  const m = document.getElementById('modal-novo-fluxo'); if (m) m.style.display = 'none';
  _ffPdfsTemp = [];
}
window.fecharModalNovoFluxo = fecharModalNovoFluxo;

function receberPdfsFluxo(input) {
  const novos = Array.from(input.files || []).filter(f => /\.pdf$/i.test(f.name));
  input.value = '';
  novos.forEach(f => {
    // Quantidade de arquivos: ILIMITADA (cada PDF sobe sozinho para /uploads).
    // Tamanho por arquivo: 32 MB — teto seguro, porque o servidor monta cada
    // upload na memória (LIMITE_CORPO 48 MB; base64 ≈ 1,34× o arquivo → 32 MB
    // viram ~43 MB, com folga). PDF de relação bancária é bem menor que isso.
    if (f.size > 32 * 1024 * 1024) { alert(`"${f.name}" tem ${(f.size/1048576).toFixed(1)} MB e passa do limite de 32 MB por arquivo. Você pode enviar quantos arquivos quiser, mas cada um precisa ter até 32 MB.`); return; }
    _ffPdfsTemp.push(f);
  });
  const prev = document.getElementById('ff-arquivos-preview');
  if (prev) prev.innerHTML = _ffPdfsTemp.map((f, i) => `
    <div class="exame-pdf-card" style="margin-top:8px;">
      <div class="exame-pdf-icon" style="color:#DC2626;"><i class="fa-solid fa-file-pdf"></i></div>
      <div class="exame-pdf-info"><strong>${escapeHTML(f.name)}</strong><span>${(f.size / 1048576).toFixed(1)} MB</span></div>
      <button class="btn btn-sm btn-outline" style="border-color:#DC2626;color:#DC2626;" onclick="_ffPdfsTemp.splice(${i},1); receberPdfsFluxo({files:[],value:''})">
        <i class="fa-solid fa-trash-can"></i></button>
    </div>`).join('');
  const hint = document.getElementById('ff-upload-hint');
  if (hint) hint.textContent = _ffPdfsTemp.length
    ? `${_ffPdfsTemp.length} arquivo(s) adicionado(s).`
    : 'Um ou vários arquivos. O sistema lê os PDFs e monta a tabela sozinho.';
}
window.receberPdfsFluxo = receberPdfsFluxo;

async function criarFluxoFinanceiro() {
  garantirFluxoFinanceiro();
  const g = id => document.getElementById(id);
  const tipo = g('ff-form-tipo')?.value || '';
  const data = g('ff-form-data')?.value || '';
  const comp = g('ff-form-competencia')?.value || '';
  const obs  = (g('ff-form-obs')?.value || '').trim();

  // Vínculos EMPRESA -> TOMADOR -> CLIENTE (um ou vários)
  const res = _ffVinculosParaSalvar();
  if (res.erro) { alert(res.erro); return; }
  const vinculos = res.vinculos;
  // O 1º vínculo alimenta empresaId/empresaNome: assim tudo que já lia esses
  // campos (filtros, busca, exportação, títulos) continua funcionando igual.
  const empresaId = vinculos[0].empresaId;

  if (!tipo)      { alert('Escolha o tipo de pagamento.'); return; }
  if (!data)      { alert('Informe a data de pagamento.'); return; }
  if (!comp)      { alert('Informe a competência.'); return; }
  if (!_ffPdfsTemp.length) { alert('Adicione ao menos um PDF do Exata.'); return; }

  const empresa = _ffLista('empresas').find(e => e.id === empresaId) || {};
  const btn = g('ff-btn-criar'); if (btn) btn.disabled = true;
  const proc = g('ff-processando'); if (proc) proc.style.display = '';
  const barra = g('ff-barra'); const txt = g('ff-processando-txt');

  try {
    // 1) Lê e extrai cada PDF — TODAS as páginas, e guarda Sub-Total e Total
    //    Geral impressos em cada arquivo para a validação matemática
    const linhas = [];
    const arquivos = [];
    let paginasTotal = 0;
    for (let i = 0; i < _ffPdfsTemp.length; i++) {
      const f = _ffPdfsTemp[i];
      if (txt) txt.textContent = `Lendo ${f.name} (${i + 1} de ${_ffPdfsTemp.length})...`;
      if (barra) barra.style.width = Math.round((i / _ffPdfsTemp.length) * 70) + '%';
      let { texto, paginas, letras, linhasComPosicao } = await _ffLerPdf(f);
      let analise = _ffAnalisarTexto(texto);
      let lidoPorImagem = false;
      let lidoPorColuna = false;

      // LEITURA POR COLUNA: usa a posição real de cada coluna no PDF em vez de
      // contar espaços. É instantânea (a informação já veio junto com o texto)
      // e não se confunde com sobrenome, acento ou espaçamento diferente.
      //
      // Só entra quando encontra MAIS gente que a leitura antiga. Se achar
      // menos, alguma coisa não bateu e o caminho testado continua valendo —
      // melhoria que piora não é melhoria.
      try {
        const porColuna = _ffLerPorColuna(linhasComPosicao);
        if (porColuna && porColuna.length >= (analise.linhas || []).length) {
          const somaCol = porColuna.reduce((s, l) => s + Number(l.valor || 0), 0);
          const somaTxt = (analise.linhas || []).reduce((s, l) => s + Number(l.valor || 0), 0);
          // Se o PDF traz o total impresso, ele é o juiz: fica quem chega mais
          // perto dele. Sem total impresso, fica quem achou mais gente.
          const alvo = analise.totalGeral || analise.subTotal || null;
          const melhor = alvo
            ? Math.abs(somaCol - alvo) <= Math.abs(somaTxt - alvo)
            : porColuna.length > (analise.linhas || []).length || somaCol >= somaTxt;
          if (melhor) { analise = Object.assign({}, analise, { linhas: porColuna }); lidoPorColuna = true; }
        }
      } catch (e) {
        console.error('[FF] leitura por coluna falhou, seguindo pelo texto:', e);
      }

      // Não achou ninguém? Antes de desistir, verifica se o PDF tem texto.
      // Se não tem, é digitalizado — aí dá para ler pela imagem, com as MESMAS
      // regras. Mas isso é LENTO (segundos por página) e por isso NÃO acontece
      // sozinho: quem está esperando decide se vale a pena. Assim o caminho
      // normal — que é a esmagadora maioria — continua tão rápido quanto era.
      if (!analise.linhas.length && letras < 200 &&
          confirm(`"${f.name}" é um PDF digitalizado (imagem), por isso não tem texto para ler.\n\n` +
                  `Posso tentar ler as letras da imagem. É mais devagar: alguns segundos por página, ` +
                  `e na primeira vez baixa o leitor.\n\nQuer que eu tente?`)) {
        try {
          const porImagem = await _ffLerPdfPorImagem(f, msg => { if (txt) txt.textContent = msg; });
          let analiseImg = _ffAnalisarTexto(porImagem.texto);
          // MESMA leitura por coluna do PDF comum, agora com a posição de cada
          // palavra que o OCR devolve (hOCR). Sem isso, um relatório com duas
          // pessoas na mesma linha (Pensão Alimentícia) nunca separa os nomes
          // quando o PDF é escaneado — só functionava pra PDF com texto.
          try {
            const porColunaImg = _ffLerPorColuna(porImagem.linhasComPosicao);
            if (porColunaImg && porColunaImg.length >= (analiseImg.linhas || []).length) {
              const somaColImg = porColunaImg.reduce((s, l) => s + Number(l.valor || 0), 0);
              const somaTxtImg = (analiseImg.linhas || []).reduce((s, l) => s + Number(l.valor || 0), 0);
              const alvoImg = analiseImg.totalGeral || analiseImg.subTotal || null;
              const melhorImg = alvoImg
                ? Math.abs(somaColImg - alvoImg) <= Math.abs(somaTxtImg - alvoImg)
                : porColunaImg.length > (analiseImg.linhas || []).length || somaColImg >= somaTxtImg;
              if (melhorImg) { analiseImg = Object.assign({}, analiseImg, { linhas: porColunaImg }); lidoPorColuna = true; }
            }
          } catch (e) {
            console.error('[FF] leitura por coluna (via OCR) falhou, seguindo pelo texto do OCR:', e);
          }
          if (analiseImg.linhas.length) {
            texto = porImagem.texto; analise = analiseImg; lidoPorImagem = true;
          }
        } catch (e) {
          console.error('[FF] leitura por imagem falhou:', e);
        }
      }

      // Continua sem ninguém: diz POR QUE, em vez de criar uma ficha vazia.
      if (!analise.linhas.length) {
        const motivo = letras < 200
          ? `"${f.name}" é um PDF digitalizado (imagem), sem texto dentro.\n\n` +
            `O que resolve de vez:\n` +
            `• peça o arquivo ORIGINAL do sistema de folha, em vez do escaneado —\n` +
            `  ele lê na hora e sem erro;\n` +
            `• se só existir escaneado, escaneie em preto e branco e nítido, e\n` +
            `  aceite a leitura por imagem quando o sistema perguntar.`
          : `"${f.name}" tem texto, mas não reconheci o formato da relação.\n\n` +
            `Primeiras linhas que li:\n` +
            texto.split('\n').filter(l => l.trim()).slice(0, 6).join('\n');
        // Um erro só, com o motivo. A ficha NÃO é criada de propósito: melhor
        // não criar do que criar faltando gente — isso aqui é pagamento.
        throw new Error(motivo);
      }

      paginasTotal += paginas;
      analise.linhas.forEach(l => {
        l.arquivo = f.name;
        // Marca de onde veio: linha lida por imagem merece um olhar humano,
        // porque OCR erra de vez em quando e a conferência precisa saber disso.
        if (lidoPorImagem) { l.lidoPorImagem = true; l.status = 'conferir'; }
        linhas.push(l);
      });
      // guarda o PDF (vira link /uploads/.. na sincronização) + os totais impressos nele
      const base64 = await fileToBase64(f);
      arquivos.push({
        nome: f.name, arquivo: base64, paginas,
        subTotal: analise.subTotal, totalGeral: analise.totalGeral,
        dataPagamentoPdf: analise.dataPagamentoPdf, relacaoNumero: analise.relacaoNumero,
        modelo: (analise.modelo || 'Genérico') +
                (lidoPorColuna ? ' · por coluna' : '') +
                (lidoPorImagem ? ' · lido por imagem' : ''),
        lidoPorImagem: lidoPorImagem, lidoPorColuna: lidoPorColuna
      });
    }

    if (txt) txt.textContent = `Montando a tabela (${linhas.length} registros encontrados)...`;
    if (barra) barra.style.width = '80%';

    const numero = String(state.proximoFluxoNum).padStart(6, '0');
    state.proximoFluxoNum++;

    const fluxo = {
      id: _novoId('ff'),
      numero,
      empresaId, empresaNome: empresa.nome || '',
      vinculos,                       // formato novo: EMPRESA + TOMADOR + CLIENTE (1 ou vários)
      tipo, dataPagamento: data, competencia: comp, observacao: obs,
      // 'pagamento' (folha do dia) ou 'estorno' (o banco devolveu e vai sair de novo)
      tipoLancamento: _ffLancamento === 'estorno' ? 'estorno' : 'pagamento',
      arquivos, linhas,
      paginasProcessadas: paginasTotal,
      status: 'rascunho',
      criadoPor: loggedUser ? nomeExibido(loggedUser) : 'Sistema',
      criadoPorLogin: loggedUser ? loggedUser.login : '',
      criadoEm: new Date().toISOString(),
      aprovacoes: {},
      comprovante: null,
      historico: []
    };
    _ffHist(fluxo, `Criou o Fluxo Financeiro #${numero} (${empresa.nome} · ${tipo}).`);
    // Ficha de ESTORNO: dá baixa em quem ela veio acertar e explica no histórico
    if (fluxo.tipoLancamento === 'estorno') {
      const cobertos = _ffAplicarBaixaEstornos(fluxo);
      _ffHist(fluxo, 'Ficha de ESTORNO: acerta ' + cobertos.length + ' pagamento(s) que o banco devolveu' +
        (cobertos.length ? ' (' + cobertos.map(c => c.nome).join(', ') + ')' : '') +
        '. Sem número de relação novo — o valor já foi solicitado no dia do pagamento original.');
    }
    _ffHist(fluxo, `Importou ${arquivos.length} arquivo(s) PDF (${paginasTotal} página(s)) — ${linhas.length} registro(s) identificados.`);
    state.fluxosFinanceiros.push(fluxo);

    if (txt) txt.textContent = 'Salvando no servidor...';
    if (barra) barra.style.width = '95%';
    // Esta é a etapa mais demorada: os PDFs sobem para o servidor e o estado é
    // gravado. Sem aviso, a tela parece travada justamente aqui — e a pessoa
    // fecha no meio achando que deu errado.
    if (txt) txt.textContent = 'Enviando os arquivos e salvando no servidor... (não feche esta janela)';
    if (barra) barra.style.width = '90%';
    if (window.RTCloud && RTCloud.configured && typeof RTCloud.salvarAgora === 'function') {
      await RTCloud.salvarAgora(state, { merge: true, upsertIds: [fluxo.id] });
    } else { saveState(); }
    try { localStorage.setItem('rt_empregos_data', _estadoParaCache()); } catch (e) {}
    if (barra) barra.style.width = '100%';

    registrarLogGlobal(`Criou o Fluxo Financeiro #${numero} (${empresa.nome} · ${tipo}) com ${linhas.length} registro(s).`, 'dp');
    fecharModalNovoFluxo();
    renderFluxoFinanceiro();
    abrirDetalheFluxo(fluxo.id);

    // VALIDAÇÃO: soma recalculada × Sub-Total × Total Geral de CADA arquivo,
    // mais a caça de duplicidades (CPF é o principal identificador).
    const cheque = _ffChequeTotais(fluxo);
    const resumoCheque = cheque.map(c => {
      if (c.bate === null) return `• ${c.arquivo}: PDF sem totais impressos (confira manualmente). Soma: ${_ffMoedaBR(c.soma)}`;
      if (c.bate) return `✓ ${c.arquivo}: soma ${_ffMoedaBR(c.soma)} = Sub-Total = Total Geral ✔`;
      const partes = [];
      if (c.bateSub === false)   partes.push(`Sub-Total ${_ffMoedaBR(c.subTotal)}`);
      if (c.bateTotal === false) partes.push(`Total Geral ${_ffMoedaBR(c.totalGeral)}`);
      return `✗ ${c.arquivo}: soma ${_ffMoedaBR(c.soma)} ≠ ${partes.join(' e ')}`;
    }).join('\n');

    const dups = _ffDuplicidades(fluxo);
    const avisoDup = dups.cpf.length
      ? `\n⚠ POSSÍVEL DUPLICIDADE: ${dups.cpf.length} CPF(s) aparecem mais de uma vez. Confira na tabela.` : '';

    const pendentes = linhas.filter(l => l.status === 'conferir').length;
    const modelos = [...new Set(arquivos.map(a => a.modelo).filter(Boolean))];
    alert(`Fluxo #${numero} criado!\n\n` +
      `Arquivos processados: ${arquivos.length}\n` +
      (modelos.length ? `Modelo reconhecido: ${modelos.join(', ')}\n` : '') +
      `Páginas processadas: ${paginasTotal}\n` +
      `Registros identificados: ${linhas.length}\n` +
      `Valor total calculado: ${_ffMoedaBR(_ffTotal(fluxo))}` +
      (pendentes ? `\n⚠ ${pendentes} registro(s) precisam de conferência.` : '') +
      avisoDup +
      `\n\nVALIDAÇÃO DOS TOTAIS:\n${resumoCheque}` +
      `\n\nConfira a tabela e clique em "Enviar para Aprovação".`);
  } catch (e) {
    console.error('[FF] falha ao criar o fluxo:', e);
    alert('NÃO consegui criar o fluxo — nada foi salvo.\n\n' + (e.message || e));
  } finally {
    if (btn) btn.disabled = false;
    if (proc) proc.style.display = 'none';
    if (barra) barra.style.width = '0%';
  }
}
window.criarFluxoFinanceiro = criarFluxoFinanceiro;

// ── Detalhe / conferência / aprovações ─────────────────────────────────────
function abrirDetalheFluxo(id) {
  garantirFluxoFinanceiro();
  const f = state.fluxosFinanceiros.find(x => x.id === id);
  if (!f) return;
  _ffDetalheId = id;
  _ffRenderDetalhe();
  const m = document.getElementById('modal-detalhe-fluxo'); if (m) m.style.display = 'flex';
}
window.abrirDetalheFluxo = abrirDetalheFluxo;

function fecharDetalheFluxo() {
  const m = document.getElementById('modal-detalhe-fluxo'); if (m) m.style.display = 'none';
  _ffDetalheId = null;
  renderFluxoFinanceiro();
}
window.fecharDetalheFluxo = fecharDetalheFluxo;

function _ffRenderDetalhe() {
  const f = (state.fluxosFinanceiros || []).find(x => x.id === _ffDetalheId);
  if (!f) return;
  const st = FF_STATUS[f.status] || FF_STATUS.rascunho;
  const podeEditar = f.status === 'rascunho' && (_ffPodeCriar());

  const tit = document.getElementById('ff-det-titulo');
  if (tit) tit.textContent = `Fluxo Financeiro #${f.numero}`;
  const sub = document.getElementById('ff-det-sub');
  if (sub) sub.textContent = `${_ffIdentificacao(f)} · ${f.tipo} · pagamento ${_formatarDataBR(f.dataPagamento)}` + (_ffRelacaoTexto(f) ? `  ·  Relação N. ${_ffRelacaoTexto(f)}` : '');

  const pendencias = (f.linhas || []).filter(l => l.status === 'conferir').length;

  // Etapas (linha do tempo de aprovação)
  const etapas = [
    { ch: 'criado',      rot: 'DP criou',        ok: true,                          quem: f.criadoPor },
    { ch: 'coordenacao', rot: 'Supervisão DP',   ok: !!f.aprovacoes.coordenacao,    quem: f.aprovacoes.coordenacao?.por },
    { ch: 'gestao',      rot: 'Gestão',          ok: !!f.aprovacoes.gestao,         quem: f.aprovacoes.gestao?.por },
    { ch: 'pagamento',   rot: 'Financeiro pagou',ok: ['pago', 'finalizado'].includes(f.status), quem: f.aprovacoes.pagamento?.por },
    { ch: 'comprovante', rot: 'Comprovante',     ok: f.status === 'finalizado',     quem: null }
  ];

  const cont = document.getElementById('ff-det-conteudo');
  if (cont) {
    cont.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
        <span style="display:inline-flex;align-items:center;gap:7px;padding:6px 14px;border-radius:12px;font-size:13px;font-weight:600;color:${st.cor};background:${st.cor}18;border:1px solid ${st.cor}40;">
          <i class="fa-solid ${st.icone}"></i> ${st.rotulo}</span>
        ${pendencias && f.status === 'rascunho' ? `<span style="font-size:11px;font-weight:600;color:#D97706;"><i class="fa-solid fa-triangle-exclamation"></i> ${pendencias} registro(s) precisam de conferência</span>` : ''}
      </div>

      <div class="ff-faixa-relacao">
        <span class="ff-faixa-rot"><i class="fa-solid fa-barcode"></i> Relação bancária</span>
        <span class="ff-faixa-num">${_ffSeloRelacao(f)}</span>
        <span class="ff-faixa-dica">é este número que identifica a remessa no banco</span>
      </div>

      ${_ffAvisoReprovacoes(f)}

      ${(() => {
        const etId = _ffEtapaAtualId(f);
        if (!etId) return '';
        const nomes = _ffNomesResponsaveis(etId);
        const cfg = _ffCfg(etId);
        const desde = _ffAguardandoDesde(f);
        if (_ffEhMinhaVez(f)) {
          return `<div style="display:flex;align-items:center;gap:12px;background:rgba(217,119,6,.14);border:1px solid rgba(217,119,6,.4);border-left:5px solid #D97706;border-radius:12px;padding:12px 16px;margin-bottom:14px;">
            <i class="fa-solid fa-bell" style="font-size:22px;color:#D97706;"></i>
            <div><div style="font-weight:600;color:#0f172a;font-size:14px;">AGUARDANDO SUA APROVAÇÃO</div>
            <div style="font-size:12px;color:#64748b;">Setor: ${escapeHTML(cfg.setor || '')} · Aguardando ${_ffTempoDesde(desde)}</div></div>
          </div>`;
        }
        return `<div style="font-size:12px;color:#64748b;margin-bottom:14px;">
          <i class="fa-solid fa-user-clock" style="color:#D97706;"></i> Aguardando <strong>${nomes.length ? escapeHTML(nomes.join(', ')) : escapeHTML(cfg.funcao || 'responsável')}</strong> (${escapeHTML(cfg.setor || '')}) · ${_ffTempoDesde(desde)}</div>`;
      })()}

      <!-- Timeline Visual de Aprovação -->
      <div class="ff-timeline-wrapper">
        ${etapas.map((e, idx) => {
          const isCompleted = e.ok;
          const isActive = !e.ok && (
            (e.ch === 'coordenacao' && f.status === 'aguardando_coordenacao') ||
            (e.ch === 'gestao' && f.status === 'aguardando_gestao') ||
            (e.ch === 'pagamento' && f.status === 'aguardando_financeiro') ||
            (e.ch === 'comprovante' && f.status === 'pago')
          );
          return `
            <div class="ff-timeline-step ${isCompleted ? 'completed' : isActive ? 'active' : ''}">
              <div class="ff-timeline-node">
                <i class="fa-solid ${isCompleted ? 'fa-check' : isActive ? 'fa-pen-to-square' : 'fa-circle'}"></i>
              </div>
              <div class="ff-timeline-label">${e.rot}</div>
              ${e.quem ? `<div class="ff-timeline-sub">${escapeHTML(e.quem)}</div>` : ''}
            </div>
            ${idx < etapas.length - 1 ? `<div class="ff-timeline-connector ${isCompleted ? 'completed' : ''}"></div>` : ''}
          `;
        }).join('')}
      </div>

      ${f.divergencia ? `
        <div class="imp-erro" style="margin-top:14px;">
          <i class="fa-solid fa-hand"></i>
          <span><strong>DIVERGÊNCIA SINALIZADA PELO FINANCEIRO — pagamento BLOQUEADO</strong><br>
          Valor aprovado: <strong>${_ffMoedaBR(f.divergencia.valorAprovado)}</strong> ·
          Valor identificado: <strong>${_ffMoedaBR(f.divergencia.valorIdentificado)}</strong> ·
          Diferença: <strong>${_ffMoedaBR(Math.abs(f.divergencia.valorAprovado - f.divergencia.valorIdentificado))}</strong><br>
          Motivo: ${escapeHTML(f.divergencia.motivo)}<br>
          <small>Por ${escapeHTML(f.divergencia.por)} em ${_formatarDataHoraBR(f.divergencia.em)} — só a Gestão resolve.</small></span>
        </div>` : ''}

      ${(() => { const tp = _ffTemposPorEtapa(f); return tp.length ? `
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <span style="font-size:10.5px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;"><i class="fa-solid fa-stopwatch"></i> Tempo em cada etapa:</span>
          ${tp.map(m => `<span style="font-size:11px;padding:3px 10px;border-radius:8px;background:var(--surface-2,#F1F5F9);border:1px solid var(--color-glass-border,#E2E8F0);">
            ${m.rot}: <strong>${m.dur}</strong></span>`).join('')}
        </div>` : ''; })()}

      <div class="exame-detalhe-grid" style="margin-top:16px;">
        <div class="exame-detalhe-grupo">
          <h4><i class="fa-solid fa-circle-info"></i> Dados do fluxo</h4>
          <div class="exame-detalhe-campos">
            <div class="exame-campo"><span class="exame-campo-label">${(f.vinculos||[]).length > 1 ? "Identifica&ccedil;&atilde;o (" + f.vinculos.length + " v&iacute;nculos)" : "Identifica&ccedil;&atilde;o"}</span><span class="exame-campo-valor">${escapeHTML(_ffIdentificacao(f))}</span></div>
            <div class="exame-campo"><span class="exame-campo-label">Tipo</span><span class="exame-campo-valor">${escapeHTML(f.tipo)}</span></div>
            <div class="exame-campo"><span class="exame-campo-label">Data de pagamento</span><span class="exame-campo-valor">${_formatarDataBR(f.dataPagamento)}</span></div>
            <div class="exame-campo"><span class="exame-campo-label">Competência</span><span class="exame-campo-valor">${escapeHTML(_ffCompetenciaBR(f.competencia))}</span></div>
            <div class="exame-campo"><span class="exame-campo-label">Criado por</span><span class="exame-campo-valor">${escapeHTML(f.criadoPor)} em ${_formatarDataHoraBR(f.criadoEm)}</span></div>
            ${f.observacao ? `<div class="exame-campo"><span class="exame-campo-label">Observação</span><span class="exame-campo-valor">${escapeHTML(f.observacao)}</span></div>` : ''}
          </div>
        </div>
        <div class="exame-detalhe-grupo">
          <h4><i class="fa-solid fa-sack-dollar"></i> Totais</h4>
          <div class="exame-detalhe-campos">
            <div class="exame-campo"><span class="exame-campo-label">Valor total</span><span class="exame-campo-valor" style="font-size:20px;font-weight:600;color:#059669;">${_ffMoedaBR(_ffTotal(f))}</span></div>
            <div class="exame-campo"><span class="exame-campo-label">Colaboradores</span><span class="exame-campo-valor">${(f.linhas || []).length}</span></div>
            <div class="exame-campo"><span class="exame-campo-label">Arquivos</span><span class="exame-campo-valor">${(f.arquivos || []).length}</span></div>
          </div>
        </div>
      </div>

      ${(() => {
        // ── PAINEL DE VALIDAÇÃO: recalculado do zero a cada render ──
        const cheque = _ffChequeTotais(f);
        const dups = _ffDuplicidades(f);
        const pend = (f.linhas || []).filter(l => l.status === 'conferir').length;
        const tudoOk = !cheque.some(c => c.bate === false) && !dups.cpf.length && !dups.codigo.length && !dups.nome.length && !pend;
        const linhaVal = (ok, textoOk, textoErro) => ok
          ? `<div style="font-size:12px;padding:3px 0;color:#059669;font-weight:600;">🟢 ${textoOk}</div>`
          : `<div style="font-size:12px;padding:3px 0;color:#DC2626;font-weight:600;">🔴 ${textoErro}</div>`;
        return `
      <div class="exame-detalhe-laudo" style="margin-top:16px;${tudoOk ? 'border-color:#059669;' : ''}">
        <h4><i class="fa-solid fa-scale-balanced"></i> Validação do relatório</h4>
        <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--text-secondary);margin-bottom:10px;">
          <span><strong>${(f.arquivos || []).length}</strong> arquivo(s)</span>
          <span><strong>${f.paginasProcessadas || '—'}</strong> página(s) processadas</span>
          <span><strong>${(f.linhas || []).length}</strong> registro(s)</span>
          <span>Valor total calculado: <strong style="color:#059669;">${_ffMoedaBR(_ffTotal(f))}</strong></span>
        </div>
        ${cheque.map(c => {
          if (c.bate === true) return `<div class="imp-ok" style="margin-top:6px;"><i class="fa-solid fa-circle-check"></i>
            <span><strong>${escapeHTML(c.arquivo)}</strong> (${(f.arquivos.find(a => a.nome === c.arquivo) || {}).paginas || '?'} pág.) — soma ${_ffMoedaBR(c.soma)}
            = Sub-Total = Total Geral. <strong>Fechou no centavo.</strong> ✔</span></div>`;
          if (c.bate === false) {
            const ref = c.bateTotal === false ? c.totalGeral : c.subTotal;
            return `<div class="imp-erro" style="margin-top:6px;"><i class="fa-solid fa-triangle-exclamation"></i>
            <span><strong>${escapeHTML(c.arquivo)}</strong> — DIVERGÊNCIA:<br>
            Total calculado pelo sistema: <strong>${_ffMoedaBR(c.soma)}</strong><br>
            ${c.subTotal !== null ? `Sub-Total informado no PDF: <strong>${_ffMoedaBR(c.subTotal)}</strong> ${c.bateSub ? '✔' : '✗'}<br>` : ''}
            ${c.totalGeral !== null ? `Total Geral informado no PDF: <strong>${_ffMoedaBR(c.totalGeral)}</strong> ${c.bateTotal ? '✔' : '✗'}<br>` : ''}
            Diferença encontrada: <strong>${_ffMoedaBR(Math.abs(c.soma - ref))}</strong> — falta linha ou valor lido errado.</span></div>`;
          }
          return `<div class="imp-aviso" style="margin-top:6px;"><i class="fa-solid fa-circle-info"></i>
            <span><strong>${escapeHTML(c.arquivo)}</strong> — sem Sub-Total/Total Geral impressos; soma das linhas: ${_ffMoedaBR(c.soma)}. Confira manualmente.</span></div>`;
        }).join('')}
        <div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border-color);">
          ${linhaVal(!dups.cpf.length, 'CPF duplicado: não encontrado',
            `POSSÍVEL DUPLICIDADE de CPF: ${dups.cpf.map(g => `${g.linhas[0].cpf} (${g.linhas.length}x — ${g.linhas.map(l => l.nome.split(' ')[0]).join(', ')})`).join(' · ')}`)}
          ${linhaVal(!dups.codigo.length, 'Código duplicado: não encontrado',
            `Código repetido: ${dups.codigo.map(g => `${g.chave} (${g.linhas.length}x)`).join(' · ')}`)}
          ${linhaVal(!dups.nome.length, 'Nome duplicado: não encontrado',
            `Nome repetido: ${dups.nome.map(g => `${g.linhas[0].nome} (${g.linhas.length}x)`).join(' · ')}`)}
          ${linhaVal(!pend, 'Registros com problema de leitura: 0', `${pend} registro(s) precisam de conferência (marcados em amarelo na tabela)`)}
        </div>
        ${(() => {
          // ── CHEQUES TÉCNICOS (auditoria fina) ──
          const t = _ffChequesTecnicos(f);
          const aviso = txt => `<div style="font-size:12px;padding:3px 0;color:#B45309;font-weight:600;">🟡 ${txt}</div>`;
          const okl   = txt => `<div style="font-size:12px;padding:3px 0;color:#059669;font-weight:600;">🟢 ${txt}</div>`;
          const err   = txt => `<div style="font-size:12px;padding:3px 0;color:#DC2626;font-weight:600;">🔴 ${txt}</div>`;
          const partes = [];

          // valores zerados = erro de verdade
          if ((t.semValorNoPdf || []).length) {
            partes.push(okl(`${t.semValorNoPdf.length} pessoa(s) vieram SEM valor no PDF (nada a receber) — mantidas com valor zero, como no arquivo`));
          }
          partes.push(t.valoresZerados.length
            ? err(`${t.valoresZerados.length} registro(s) com valor ZERADO sem ser no PDF — pode ser leitura errada do arquivo`)
            : okl('Nenhum valor zerado ou negativo'));

          // dígito verificador do CPF (alerta: pode ser máscara do relatório)
          partes.push(t.cpfInvalidos.length
            ? aviso(`${t.cpfInvalidos.length} CPF(s) reprovam no dígito verificador (ex: ${t.cpfInvalidos.slice(0, 3).map(l => (l.nome || '').split(' ')[0]).join(', ')}). Pode ser máscara do relatório — confira por amostragem.`)
            : okl('Todos os CPFs passam no dígito verificador'));

          // competência das linhas × competência do fluxo
          if (t.competencias.length > 1) {
            partes.push(aviso(`Competências MISTURADAS nas linhas: ${t.competencias.join(', ')} — confira se os PDFs são do mesmo período`));
          } else if (t.competencias.length === 1 && t.compFluxo && t.competencias[0] !== t.compFluxo) {
            partes.push(aviso(`A competência das linhas é ${t.competencias[0]}, mas o fluxo foi criado como ${t.compFluxo}`));
          } else if (t.competencias.length === 1) {
            partes.push(okl(`Competência única nas linhas: ${t.competencias[0]}`));
          }

          // data de pagamento impressa no PDF × data do fluxo
          t.datasPdf.forEach(dp => {
            partes.push(dp.bate
              ? okl(`Data de pagamento do PDF (${dp.dataPdf}) confere com a do fluxo`)
              : aviso(`${dp.arquivo}: o PDF diz pagamento em ${dp.dataPdf}, mas o fluxo está com ${f.dataPagamento ? f.dataPagamento.split('-').reverse().join('/') : '—'}`));
          });

          // número da relação (rastreabilidade com o Exata)
          const relacoes = (f.arquivos || []).filter(a => a.relacaoNumero).map(a => a.relacaoNumero);
          if (relacoes.length) partes.push(`<div style="font-size:11.5px;padding:3px 0;color:var(--text-secondary);"><i class="fa-solid fa-hashtag"></i> Relação(ões) do Exata: <strong>${[...new Set(relacoes)].join(', ')}</strong></div>`);

          // estatística dos valores
          if (t.stats) partes.push(`<div style="font-size:11.5px;padding:3px 0;color:var(--text-secondary);"><i class="fa-solid fa-chart-simple"></i>
            Valores: menor <strong>${_ffMoedaBR(t.stats.menor)}</strong> · média <strong>${_ffMoedaBR(t.stats.media)}</strong> · maior <strong>${_ffMoedaBR(t.stats.maior)}</strong> · mais comum <strong>${_ffMoedaBR(t.stats.maisComum)}</strong> (${t.stats.vezes}×)</div>`);

          return `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border-color);">
            <div style="font-size:10.5px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Cheques técnicos</div>
            ${partes.join('')}</div>`;
        })()}
        ${tudoOk ? `<div style="margin-top:10px;padding:10px 14px;border-radius:8px;background:rgba(5,150,105,.1);border:1px solid rgba(5,150,105,.35);color:#059669;font-weight:600;font-size:13px;text-align:center;">
          ✅ RELATÓRIO VALIDADO COM SUCESSO</div>` : ''}
      </div>`;
      })()}

      <div class="exame-detalhe-laudo" style="margin-top:16px;">
        <h4><i class="fa-solid fa-table-list"></i> Registros importados (${(f.linhas || []).length})
          ${podeEditar ? `<button class="btn btn-sm btn-outline" style="margin-left:10px;" onclick="ffAdicionarLinha()"><i class="fa-solid fa-plus"></i> Adicionar linha</button>` : ''}
          <button class="btn btn-sm btn-outline" style="margin-left:6px;border-color:#059669;color:#059669;" onclick="exportarFluxoExcel()"><i class="fa-solid fa-file-excel"></i> Exportar Excel</button>
        </h4>
        ${(() => {
          const cpfsDup = new Set();
          _ffDuplicidades(f).cpf.forEach(g => g.linhas.forEach(l => cpfsDup.add(l.id)));
          return `
        <div class="table-scroll-container" style="max-height:340px;overflow-y:auto;">
          <table class="excel-table">
            <thead><tr><th>Código</th><th>Colaborador</th><th>CPF</th><th title="Tipo de pagamento: a mesma pessoa em lotes diferentes é normal">Lote</th><th>Comp.</th><th>Bco</th><th>Ag.</th><th>Conta</th><th>Valor</th><th>Orig</th><th>Situação</th>${podeEditar ? '<th></th>' : ''}</tr></thead>
            <tbody>
              ${(f.linhas || []).map((l, i) => `
                <tr style="${cpfsDup.has(l.id) ? 'background:rgba(220,38,38,.08);' : l.status === 'conferir' ? 'background:rgba(217,119,6,.07);' : ''}">
                  <td style="font-family:monospace;font-size:11px;">${escapeHTML(l.codigo || '—')}</td>
                  <td>${podeEditar ? `<input class="form-control" style="min-width:170px;font-size:12px;padding:4px 8px;" value="${escapeHTML(l.nome || '')}" onchange="ffEditarLinha(${i},'nome',this.value)">` : escapeHTML(l.nome || '—')}</td>
                  <td>${podeEditar ? `<input class="form-control" style="width:135px;font-size:12px;padding:4px 8px;" value="${escapeHTML(l.cpf || '')}" onchange="ffEditarLinha(${i},'cpf',this.value)">` : escapeHTML(l.cpf || '—')}</td>
                  <td class="ff-col-lote">${podeEditar
                    ? `<input class="form-control ff-inp-lote" value="${escapeHTML(l.lote || '')}" placeholder="—" onchange="ffEditarLinha(${i},'lote',this.value)">`
                    : `<span class="ff-lote-selo">${escapeHTML(_ffLoteRotulo(l))}</span>`}</td>
                  <td style="font-size:11px;">${escapeHTML(l.competencia || '—')}</td>
                  <td style="font-size:11px;">${escapeHTML(l.banco || '—')}</td>
                  <td style="font-size:11px;font-family:monospace;">${escapeHTML(l.agencia || '—')}${l.agenciaDg ? '-' + escapeHTML(l.agenciaDg) : ''}</td>
                  <td style="font-size:11px;font-family:monospace;">${escapeHTML(l.conta || '—')}${l.contaDg ? '-' + escapeHTML(l.contaDg) : ''}</td>
                  <td>${podeEditar
                    ? `<input class="form-control" style="width:100px;font-size:12px;padding:4px 8px;text-align:right;" value="${(Number(l.valor) || 0).toFixed(2).replace('.', ',')}" onchange="ffEditarLinha(${i},'valor',this.value)">`
                    : (l.semValorNoPdf && !(Number(l.valor) > 0)
                        ? `<span class="ff-sem-valor" title="O PDF veio sem valor para esta pessoa — nada a receber">—</span>`
                        : `<strong>${_ffMoedaBR(l.valor)}</strong>`)}</td>
                  <td style="font-size:11px;">${escapeHTML(l.origem || '—')}</td>
                  <td class="ff-col-situacao">${cpfsDup.has(l.id)
                    ? '<span class="ff-sit ff-sit-dup" title="Mesmo CPF repetido no MESMO lote ' +
                      escapeHTML(_ffLoteRotulo(l)) + '">⚠ repetido no lote ' + escapeHTML(_ffLoteRotulo(l)) + '</span>' + _ffAcaoLinha(f, l, i)
                    : _ffAcaoLinha(f, l, i)}</td>
                  ${podeEditar ? `<td><button class="btn btn-sm btn-outline" style="border-color:#DC2626;color:#DC2626;padding:2px 8px;" onclick="ffRemoverLinha(${i})"><i class="fa-solid fa-trash-can"></i></button></td>` : ''}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
        })()}
      </div>

      <div class="exame-detalhe-laudo" style="margin-top:16px;">
        <h4><i class="fa-solid fa-file-pdf"></i> Documentos (${(f.arquivos || []).length})</h4>
        ${(f.arquivos || []).map((a, i) => `
          <div class="exame-pdf-card" style="margin-top:8px;">
            <div class="exame-pdf-icon" style="color:#DC2626;"><i class="fa-solid fa-file-pdf"></i></div>
            <div class="exame-pdf-info"><strong>${escapeHTML(a.nome)}</strong>${a.modelo ? `<br><span style="font-size:11px;color:var(--text-secondary);"><i class="fa-solid fa-layer-group"></i> Modelo: ${escapeHTML(a.modelo)}${a.paginas ? ` · ${a.paginas} pág.` : ''}</span>` : ''}</div>
            <button class="btn btn-sm btn-primary" onclick="ffAbrirArquivo(${i})"><i class="fa-solid fa-eye"></i> Abrir</button>
          </div>`).join('')}
        ${f.comprovante ? `
          <div class="exame-pdf-card" style="margin-top:8px;border-color:#059669;">
            <div class="exame-pdf-icon" style="color:#059669;"><i class="fa-solid fa-receipt"></i></div>
            <div class="exame-pdf-info"><strong>Comprovante: ${escapeHTML(f.comprovante.nome)}</strong></div>
            <button class="btn btn-sm btn-primary" onclick="ffAbrirArquivo('comprovante')"><i class="fa-solid fa-eye"></i> Abrir</button>
          </div>` : ''}
        ${(() => {
          // Baixar tudo de uma vez, em vez de abrir e salvar um por um
          const qtd = (f.arquivos || []).length + (f.comprovante ? 1 : 0);
          if (!qtd) return '';
          return `<div class="ff-baixar-tudo">
            <button class="btn btn-primary" id="ff-btn-pdf-unico" onclick="ffBaixarPdfUnico()">
              <i class="fa-solid fa-file-pdf"></i> Baixar tudo num PDF só (${qtd})
            </button>
            <button class="btn btn-secondary" id="ff-btn-baixar-tudo" onclick="ffBaixarTodosPdfs()">
              <i class="fa-solid fa-file-zipper"></i> Baixar em .zip
            </button>
            <small>O PDF único abre com as ${qtd} bancária(s) emendadas, uma embaixo da outra — dá para
            rolar e imprimir tudo de uma vez. O .zip traz os arquivos separados.</small>
          </div>`;
        })()}
      </div>

      <div class="exame-detalhe-laudo" style="margin-top:16px;">
        <h4><i class="fa-solid fa-clock-rotate-left"></i> Histórico</h4>
        <div style="max-height:220px;overflow-y:auto;">
          ${(f.historico || []).slice().reverse().map(h => `
            <div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px dashed var(--border-color);font-size:12px;">
              <span style="color:var(--text-secondary);white-space:nowrap;">${_formatarDataHoraBR(h.data)}</span>
              <span><strong>${escapeHTML(h.usuario)}</strong> — ${escapeHTML(h.acao)}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // Botões do rodapé conforme perfil + status
  const footer = document.getElementById('ff-det-footer');
  if (footer) {
    const b = [];
    b.push(`<button class="btn btn-outline" onclick="fecharDetalheFluxo()"><i class="fa-solid fa-xmark"></i> Fechar</button>`);

    if (f.status === 'rascunho' && _ffPodeCriar()) {
      b.push(`<button class="btn btn-primary" onclick="ffEnviarParaAprovacao()"><i class="fa-solid fa-paper-plane"></i> Finalizar e Enviar</button>`);
      b.push(`<button class="btn btn-outline" style="border-color:#DC2626;color:#DC2626;" onclick="ffExcluirFluxo()"><i class="fa-solid fa-trash"></i> Excluir rascunho</button>`);
    }
    // Ficha JÁ ENVIADA: só o administrador vê o botão de excluir — é assim que
    // se limpa uma nota subida por engano.
    if (f.status !== 'rascunho' && (ehMestre(loggedUser.login) || _ffVeTudo())) {
      b.push(`<button class="btn btn-outline" style="border-color:#DC2626;color:#DC2626;" title="Só o administrador vê esta opção" onclick="ffExcluirFluxo()"><i class="fa-solid fa-trash"></i> Excluir ficha (admin)</button>`);
    }
    if (f.status === 'aguardando_coordenacao' && _ffEhCoordenacao()) {
      {
        if (_ffAcaoPermitida('coordenacao', 'aprovar')) b.push(`<button class="btn btn-success" onclick="ffAprovar('coordenacao')"><i class="fa-solid fa-check"></i> Aprovar e Enviar (Supervisão DP)</button>`);
        if (_ffAcaoPermitida('coordenacao', 'devolver')) b.push(`<button class="btn btn-outline" style="border-color:#D97706;color:#D97706;" onclick="ffDevolver()"><i class="fa-solid fa-rotate-left"></i> Devolver p/ correção</button>`);
        if (_ffAcaoPermitida('coordenacao', 'reprovar')) b.push(`<button class="btn btn-danger" onclick="ffReprovar()"><i class="fa-solid fa-ban"></i> Reprovar</button>`);
      }
    }
    if (f.status === 'aguardando_gestao' && _ffEhGestao()) {
      if (_ffAcaoPermitida('gestao', 'aprovar')) b.push(`<button class="btn btn-success" onclick="ffAprovar('gestao')"><i class="fa-solid fa-check"></i> Aprovar e Enviar (Gestão)</button>`);
      if (_ffAcaoPermitida('gestao', 'devolver')) b.push(`<button class="btn btn-outline" style="border-color:#D97706;color:#D97706;" onclick="ffDevolver()"><i class="fa-solid fa-rotate-left"></i> Devolver p/ correção</button>`);
      if (_ffAcaoPermitida('gestao', 'reprovar')) b.push(`<button class="btn btn-danger" onclick="ffReprovar()"><i class="fa-solid fa-ban"></i> Reprovar</button>`);
    }
    if (f.status === 'aguardando_financeiro' && _ffEhFinanceiro()) {
      if (f.divergencia) {
        b.push(`<span style="font-size:11px;color:#DC2626;font-weight:600;align-self:center;"><i class="fa-solid fa-hand"></i> Pagamento bloqueado pela divergência.</span>`);
      } else {
        if (_ffAcaoPermitida('financeiro', 'pagar')) b.push(`<button class="btn btn-success" onclick="ffMarcarPago()"><i class="fa-solid fa-money-check-dollar"></i> Pagamento Realizado</button>`);
        b.push(`<button class="btn btn-outline" style="border-color:#DC2626;color:#DC2626;" onclick="ffSinalizarDivergencia()"><i class="fa-solid fa-hand"></i> Sinalizar Divergência</button>`);
        if (_ffAcaoPermitida('financeiro', 'devolver')) b.push(`<button class="btn btn-outline" style="border-color:#D97706;color:#D97706;" onclick="ffDevolver()"><i class="fa-solid fa-rotate-left"></i> Devolver p/ correção</button>`);
      }
    }
    if (f.divergencia && _ffEhGestao()) {
      b.push(`<button class="btn btn-success" onclick="ffResolverDivergencia()"><i class="fa-solid fa-check-double"></i> Resolver Divergência</button>`);
    }
    if (f.status === 'pago' && _ffEhFinanceiro()) {
      b.push(`<button class="btn btn-success" onclick="document.getElementById('input-comprovante-fluxo').click()"><i class="fa-solid fa-receipt"></i> Anexar Comprovante</button>`);
    }
    // Desfaz um "Pagamento Realizado" marcado por engano — só o Financeiro vê.
    if ((f.status === 'pago' || f.status === 'finalizado') && _ffEhFinanceiro()) {
      b.push(`<button class="btn btn-outline" style="border-color:#D97706;color:#D97706;" onclick="ffVoltarParaPagamento()" title="Desfaz a confirmação de pagamento e devolve pra fila do Financeiro"><i class="fa-solid fa-rotate-left"></i> Voltar p/ Pagamento</button>`);
    }
    // Cancelar: disponível para fluxos JÁ enviados (nunca apaga — preserva o histórico)
    if (!['rascunho', 'finalizado', 'cancelado'].includes(f.status) &&
        (ehMestre(loggedUser.login) || _ffEhCriador(f) || _ffEhGestao() || _ffEhCoordenacao() || _ffVeTudo())) {
      b.push(`<button class="btn btn-outline" style="border-color:#6B7280;color:#6B7280;" onclick="ffCancelarFluxo()"><i class="fa-solid fa-circle-minus"></i> Cancelar fluxo</button>`);
    }
    footer.innerHTML = b.join('');
  }
}

// Edição das linhas (só em rascunho)
window.ffEditarLinha = function(i, campo, valor) {
  const f = (state.fluxosFinanceiros || []).find(x => x.id === _ffDetalheId);
  if (!f || f.status !== 'rascunho' || !f.linhas[i]) return;
  const anterior = campo === 'valor' ? _ffMoedaBR(f.linhas[i].valor) : (f.linhas[i][campo] || '—');
  if (campo === 'valor') f.linhas[i].valor = _ffParseValor(valor);
  else f.linhas[i][campo] = String(valor || '').trim();
  const novo = campo === 'valor' ? _ffMoedaBR(f.linhas[i].valor) : (f.linhas[i][campo] || '—');
  if (String(anterior) !== String(novo)) {
    _ffHist(f, `Editou a linha ${i + 1} (${f.linhas[i].nome || 'sem nome'}): ${campo} "${anterior}" → "${novo}".`);
  }
  const l = f.linhas[i];
  l.status = (l.nome && l.nome.length >= 5 && Number(l.valor) > 0) ? 'ok' : 'conferir';
  saveState();
  _ffRenderDetalhe();
};
window.ffRemoverLinha = function(i) {
  const f = (state.fluxosFinanceiros || []).find(x => x.id === _ffDetalheId);
  if (!f || f.status !== 'rascunho') return;
  const l = f.linhas[i];
  if (l) _ffHist(f, `Removeu a linha ${i + 1} (${l.nome || 'sem nome'} · ${_ffMoedaBR(l.valor)}).`);
  f.linhas.splice(i, 1);
  saveState(); _ffRenderDetalhe();
};
window.ffAdicionarLinha = function() {
  const f = (state.fluxosFinanceiros || []).find(x => x.id === _ffDetalheId);
  if (!f || f.status !== 'rascunho') return;
  f.linhas.push({ id: _novoId('ffl'), nome: '', cpf: '', valor: 0, arquivo: '(manual)', status: 'conferir' });
  saveState(); _ffRenderDetalhe();
};

// ── Divergência sinalizada pelo Financeiro ─────────────────────────────────
// O Financeiro NÃO altera a aprovação da Gestão: se o valor não fecha, ele
// SINALIZA e o fluxo trava até a Gestão (ou o mestre) resolver.
window.ffSinalizarDivergencia = async function() {
  const f = (state.fluxosFinanceiros || []).find(x => x.id === _ffDetalheId);
  if (!f || f.status !== 'aguardando_financeiro' || !_ffEhFinanceiro()) return;
  const valorIdent = prompt(`Valor aprovado no fluxo: ${_ffMoedaBR(_ffTotal(f))}\n\nQual foi o valor IDENTIFICADO por você? (ex: 48.208,00)`);
  if (valorIdent === null) return;
  const vi = _ffParseValor(valorIdent);
  const motivo = prompt('Descreva a divergência (fica no histórico):');
  if (motivo === null || !String(motivo).trim()) { alert('Escreva o motivo.'); return; }
  f.divergencia = {
    valorAprovado: _ffTotal(f), valorIdentificado: vi,
    motivo: String(motivo).trim(),
    por: nomeExibido(loggedUser), em: new Date().toISOString()
  };
  _ffHist(f, `SINALIZOU DIVERGÊNCIA: aprovado ${_ffMoedaBR(f.divergencia.valorAprovado)} × identificado ${_ffMoedaBR(vi)} (diferença ${_ffMoedaBR(Math.abs(f.divergencia.valorAprovado - vi))}). Motivo: ${f.divergencia.motivo}`);
  registrarLogGlobal(`Sinalizou divergência no Fluxo Financeiro #${f.numero}.`, 'dp');
  await _ffSalvarERender(f, 'Divergência registrada. O fluxo fica BLOQUEADO para pagamento até a Gestão resolver.');
};

window.ffResolverDivergencia = async function() {
  const f = (state.fluxosFinanceiros || []).find(x => x.id === _ffDetalheId);
  if (!f || !f.divergencia) return;
  if (!_ffEhGestao()) { alert('Só a Gestão (ou o administrador) resolve uma divergência.'); return; }
  const nota = prompt('Como a divergência foi resolvida? (fica no histórico)');
  if (nota === null || !String(nota).trim()) { alert('Escreva a resolução.'); return; }
  _ffHist(f, `Gestão RESOLVEU a divergência. ${String(nota).trim()}`);
  f.divergencia = null;
  registrarLogGlobal(`Resolveu a divergência do Fluxo Financeiro #${f.numero}.`, 'dp');
  await _ffSalvarERender(f, 'Divergência resolvida — o pagamento está liberado de novo.');
};

// Tempo que o fluxo passou em cada etapa (identifica gargalo)
function _ffTemposPorEtapa(f) {
  const fmt = ms => {
    if (ms == null || ms < 0) return null;
    const m = Math.round(ms / 60000);
    if (m < 60) return m + 'min';
    const h = Math.floor(m / 60);
    if (h < 48) return h + 'h ' + String(m % 60).padStart(2, '0') + 'min';
    return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
  };
  const t = s => s ? new Date(s).getTime() : null;
  // o envio à Supervisão está no histórico ("enviou para a Supervisão DP")
  const envio = (f.historico || []).find(h => /enviou para a Supervis/i.test(h.acao || ''));
  const marcos = [
    ['DP (conferência)',        t(f.criadoEm),                      t(envio && envio.data)],
    ['Supervisão DP',           t(envio && envio.data),             t(f.aprovacoes.coordenacao?.em)],
    ['Gestão',                  t(f.aprovacoes.coordenacao?.em),    t(f.aprovacoes.gestao?.em)],
    ['Financeiro → pagamento',  t(f.aprovacoes.gestao?.em),         t(f.aprovacoes.pagamento?.em)],
    ['Pagamento → comprovante', t(f.aprovacoes.pagamento?.em),      t(f.comprovante?.em)]
  ];
  return marcos
    .map(([rot, ini, fim]) => ({ rot, dur: (ini != null && fim != null) ? fmt(fim - ini) : null }))
    .filter(m => m.dur !== null);
}

// Planilha gerencial completa em Excel (todos os fluxos, responsáveis e horários)
window.exportarGerencialExcel = function() {
  if (!_ffVeTudo()) return;
  if (typeof XLSX === 'undefined') { alert('O componente de Excel não carregou. Atualize a página (Ctrl+Shift+R).'); return; }
  garantirFluxoFinanceiro();
  const linhas = state.fluxosFinanceiros.map(f => ({
    'Nº': f.numero,
    'Empresa': f.empresaNome || '',
    'Tipo': f.tipo || '',
    'Data pagamento': f.dataPagamento ? _formatarDataBR(f.dataPagamento) : '',
    'Competência': _ffCompetenciaBR(f.competencia),
    'Valor total': _ffTotal(f),
    'Colaboradores': (f.linhas || []).length,
    'Analista (criou)': f.criadoPor || '',
    'Criado em': _formatarDataHoraBR(f.criadoEm),
    'Supervisão DP': f.aprovacoes.coordenacao?.por || '',
    'Supervisão em': f.aprovacoes.coordenacao ? _formatarDataHoraBR(f.aprovacoes.coordenacao.em) : '',
    'Gestão': f.aprovacoes.gestao?.por || '',
    'Gestão em': f.aprovacoes.gestao ? _formatarDataHoraBR(f.aprovacoes.gestao.em) : '',
    'Financeiro': f.aprovacoes.pagamento?.por || '',
    'Pago em': f.aprovacoes.pagamento ? _formatarDataHoraBR(f.aprovacoes.pagamento.em) : '',
    'Comprovante': f.comprovante ? _formatarDataHoraBR(f.comprovante.em) : '',
    'Status': (FF_STATUS[f.status] || {}).rotulo || f.status
  }));
  if (!linhas.length) { alert('Nenhum fluxo para exportar.'); return; }
  const ws = XLSX.utils.json_to_sheet(linhas);
  ws['!cols'] = Object.keys(linhas[0]).map(k => ({ wch: Math.max(13, k.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fluxo Financeiro');
  XLSX.writeFile(wb, 'fluxo_financeiro_gerencial.xlsx');
};

// Exporta a tabela do fluxo em Excel (.xlsx) — uma linha por colaborador
// Aceita um id opcional: assim o Excel pode ser baixado direto do resultado da
// busca por colaborador, sem precisar abrir a ficha antes. Sem id, continua
// exportando a ficha aberta (comportamento de sempre).
window.exportarFluxoExcel = function(idFluxo) {
  const alvo = idFluxo || _ffDetalheId;
  const f = (state.fluxosFinanceiros || []).find(x => x.id === alvo);
  if (!f) return;
  if (typeof XLSX === 'undefined') { alert('O componente de Excel não carregou. Atualize a página (Ctrl+Shift+R).'); return; }

  const linhas = (f.linhas || []).map(l => ({
    'Código': l.codigo || '',
    'Nome do Funcionário': l.nome || '',
    'CPF': l.cpf || '',
    'Competência': l.competencia || '',
    'Banco': l.banco || '',
    'Lote': l.lote || '',
    'TC': l.tc || '',
    'Agência': l.agencia || '',
    'Dígito Agência': l.agenciaDg || '',
    'Conta Bancária': l.conta || '',
    'Dígito Conta': l.contaDg || '',
    'Valor Líquido': Number(l.valor) || 0,
    'Origem': l.origem || '',
    'Arquivo': l.arquivo || '',
    'Situação': l.status === 'ok' ? 'OK' : 'Conferir'
  }));
  linhas.push({ 'Código': '', 'Nome do Funcionário': 'TOTAL', 'Valor Líquido': _ffTotal(f) });

  const ws = XLSX.utils.json_to_sheet(linhas);
  ws['!cols'] = Object.keys(linhas[0]).map(k => ({ wch: Math.max(12, k.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fluxo ' + f.numero);
  XLSX.writeFile(wb, `fluxo_financeiro_${f.numero}_${String(f.empresaNome || 'sem_empresa').replace(/[^\w]+/g, '_')}.xlsx`);
};

// Abre PDF/comprovante em nova aba (mesma técnica do exame médico)
window.ffAbrirArquivo = function(i) {
  const f = (state.fluxosFinanceiros || []).find(x => x.id === _ffDetalheId);
  if (!f) return;
  const item = i === 'comprovante' ? f.comprovante : (f.arquivos || [])[i];
  if (!item || !item.arquivo) { alert('Arquivo não encontrado.'); return; }
  let src = item.arquivo;
  if (src.indexOf('data:') === 0) {
    try {
      const v = src.indexOf(','); const mime = (src.slice(0, v).match(/data:([^;]+)/) || [])[1] || 'application/pdf';
      const bin = atob(src.slice(v + 1)); const bytes = new Uint8Array(bin.length);
      for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
      src = URL.createObjectURL(new Blob([bytes], { type: mime }));
    } catch (e) {}
  } else if (src.charAt(0) === '/') src = window.location.origin + src;
  const w = window.open(src, '_blank');
  if (!w) alert('Habilite os pop-ups deste site para abrir o arquivo.');
};

// ── Baixar TODOS os documentos de uma vez ─────────────────────────────────
// Antes era abrir e salvar PDF por PDF. Aqui os arquivos da ficha (mais o
// comprovante, se já houver) vão para um único .zip. Nome repetido ganha
// sufixo, senão um sobrescreveria o outro dentro do pacote.
function _ffBytesDoArquivo(item) {
  const src = String((item && item.arquivo) || '');
  if (!src) return Promise.reject(new Error('sem arquivo'));
  if (src.indexOf('data:') === 0) {
    const v = src.indexOf(',');
    const bin = atob(src.slice(v + 1));
    const bytes = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
    return Promise.resolve(bytes);
  }
  const url = src.charAt(0) === '/' ? (window.location.origin + src) : src;
  return fetch(url, { credentials: 'same-origin' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
    .then(function (b) { return new Uint8Array(b); });
}

// ── Juntar as bancárias num PDF SÓ ────────────────────────────────────────
// Em vez de um .zip com vários arquivos, sai UM PDF com todas as páginas
// emendadas — abre e rola de cima a baixo, e imprime tudo de uma vez.
// As páginas originais são copiadas como estão (não viram imagem), então o
// texto continua pesquisável e a impressão sai na qualidade do original.
function _ffTemPdfLib() { return typeof PDFLib !== 'undefined' && PDFLib && PDFLib.PDFDocument; }

// Traz a biblioteca só na hora de usar. Ela é grande e serve para uma ação
// pontual — deixá-la no carregamento da página atrasava a abertura do sistema
// para todo mundo, todos os dias, por causa de um botão usado de vez em quando.
let _ffPdfLibCarregando = null;
function _ffCarregarPdfLib() {
  if (_ffTemPdfLib()) return Promise.resolve(true);
  if (_ffPdfLibCarregando) return _ffPdfLibCarregando;
  _ffPdfLibCarregando = new Promise(function (resolve) {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
    s.crossOrigin = 'anonymous';
    s.referrerPolicy = 'no-referrer';
    s.onload = function () { resolve(_ffTemPdfLib()); };
    s.onerror = function () { _ffPdfLibCarregando = null; resolve(false); };
    document.head.appendChild(s);
  });
  return _ffPdfLibCarregando;
}
window._ffCarregarPdfLib = _ffCarregarPdfLib;

// Todos os arquivos de uma ficha (documentos + comprovante), na ordem
function _ffArquivosDaFicha(f, comComprovante) {
  const itens = (Array.isArray(f.arquivos) ? f.arquivos : []).slice();
  if (comComprovante && f.comprovante && f.comprovante.arquivo) {
    itens.push({ nome: 'COMPROVANTE - ' + (f.comprovante.nome || 'comprovante.pdf'), arquivo: f.comprovante.arquivo });
  }
  return itens.filter(a => a && a.arquivo);
}

// Junta os PDFs das fichas indicadas e baixa um arquivo só.
// `fichas` = array de fluxos. `rotulo` entra no nome do arquivo.
async function _ffJuntarPdfs(fichas, rotulo, botaoId) {
  const btn = botaoId ? document.getElementById(botaoId) : null;
  const rotOriginal = btn ? btn.innerHTML : '';
  const passo = t => { if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + t; };
  if (btn) btn.disabled = true;

  try {
    passo('Preparando...');
    if (!(await _ffCarregarPdfLib())) {
      alert('Não consegui carregar a ferramenta de juntar PDFs.\n\n' +
            'Verifique a internet e tente de novo. Enquanto isso, use o botão "Baixar em .zip", ' +
            'que traz os mesmos arquivos separados.');
      return false;
    }
    const juntos = await PDFLib.PDFDocument.create();
    let paginas = 0, arquivosOk = 0;
    const falhou = [];
    const lista = [];
    fichas.forEach(f => _ffArquivosDaFicha(f, true).forEach(a => lista.push({ f: f, a: a })));

    if (!lista.length) { alert('Nenhuma das fichas selecionadas tem arquivo para baixar.'); return false; }

    for (let i = 0; i < lista.length; i++) {
      passo('Juntando ' + (i + 1) + ' de ' + lista.length + '...');
      try {
        const bytes = await _ffBytesDoArquivo(lista[i].a);
        const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
        const copiadas = await juntos.copyPages(doc, doc.getPageIndices());
        copiadas.forEach(p => juntos.addPage(p));
        paginas += copiadas.length;
        arquivosOk++;
      } catch (e) {
        falhou.push((lista[i].a.nome || 'arquivo') + ' (ficha #' + lista[i].f.numero + ')');
      }
    }

    if (!paginas) {
      alert('Não consegui ler nenhum dos arquivos.\n\nEles podem estar protegidos por senha ou não ser PDF. ' +
            'Tente abrir um deles pelo botão "Abrir".');
      return false;
    }

    passo('Montando o arquivo...');
    const blob = new Blob([await juntos.save()], { type: 'application/pdf' });
    const nome = 'bancarias_' + rotulo + '_' + new Date().toISOString().slice(0, 10) + '.pdf';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);

    registrarLogGlobal('Baixou ' + arquivosOk + ' bancária(s) num PDF único (' + paginas + ' páginas).', 'dp');
    if (falhou.length) {
      alert('Juntei ' + arquivosOk + ' de ' + lista.length + ' arquivo(s), num total de ' + paginas + ' página(s).\n\n' +
        'Não consegui estes:\n• ' + falhou.join('\n• ') +
        '\n\nAbra cada um pelo botão "Abrir" para conferir.');
    }
    return true;
  } catch (e) {
    alert('Não consegui montar o PDF: ' + (e.message || e));
    return false;
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = rotOriginal; }
  }
}

// Dentro da ficha: junta os arquivos daquela ficha
window.ffBaixarPdfUnico = async function () {
  const f = (state.fluxosFinanceiros || []).find(x => x.id === _ffDetalheId);
  if (!f) return;
  await _ffJuntarPdfs([f], 'ficha-' + (f.numero || 's-n'), 'ff-btn-pdf-unico');
};

// Na tela A Pagar: junta os arquivos de TODAS as fichas marcadas, sem precisar
// abrir uma por uma
window.ffBaixarPdfSelecionadas = async function () {
  const ids = Object.keys(_ffPagarSelecao || {}).filter(id => _ffPagarSelecao[id]);
  if (!ids.length) { alert('Marque as fichas que você quer baixar.'); return; }
  const fichas = (state.fluxosFinanceiros || []).filter(f => ids.indexOf(f.id) >= 0);
  const semArquivo = fichas.filter(f => !_ffArquivosDaFicha(f, true).length);
  if (semArquivo.length === fichas.length) {
    alert('As fichas marcadas não têm arquivo anexado.'); return;
  }
  const ok = await _ffJuntarPdfs(fichas, fichas.length + '-fichas', 'ff-btn-pdf-lote');
  if (ok && semArquivo.length) {
    alert('Atenção: ' + semArquivo.length + ' ficha(s) marcada(s) não têm arquivo e ficaram de fora:\n• ' +
      semArquivo.map(f => '#' + f.numero).join('\n• '));
  }
};

// ── Relatório de ESTORNOS em Excel ────────────────────────────────────────
// Cada pessoa ocupa DUAS linhas: a de cima com os dados e a bancária, a de
// baixo com o motivo escrito pelo Financeiro. Assim dá para ler de corrido.
window.ffExportarEstornosExcel = function () {
  if (typeof XLSX === 'undefined') { alert('A planilha não carregou. Recarregue a página e tente de novo.'); return; }
  const pend = _ffEstornosPendentes().map(e => Object.assign({}, e, { situacao: 'EM ABERTO — aguardando o DP reenviar' }));
  const feitos = _ffEstornosResolvidos().map(e => {
    const ficha = (state.fluxosFinanceiros || []).find(x => x.id === e.l.estornoCobertoPor);
    return Object.assign({}, e, { situacao: 'REENVIADO na ficha de estorno #' + ((ficha && ficha.numero) || '—') });
  });
  const todos = pend.concat(feitos);
  if (!todos.length) { alert('Não há estorno para exportar.'); return; }

  const cab = ['Situação', 'Colaborador', 'CPF', 'Código', 'Lote', 'Banco', 'Agência', 'Conta',
               'Competência', 'Relação', 'Ficha', 'Empresa / Cliente', 'Valor',
               'Reprovado por', 'Data do estorno'];
  const linhas = [cab];

  todos.forEach(function (e) {
    const l = e.l, f = e.f;
    const arq = (typeof _ffArquivoDaLinha === 'function') ? _ffArquivoDaLinha(f, l) : null;
    const rel = (arq && arq.relacaoNumero) ? String(arq.relacaoNumero) : _ffRelacaoTexto(f);
    linhas.push([
      e.situacao,
      l.nome || '', l.cpf || '', l.codigo || '', l.lote || '',
      l.banco || '', (l.agencia || '') + (l.agenciaDg ? '-' + l.agenciaDg : ''),
      (l.conta || '') + (l.contaDg ? '-' + l.contaDg : ''),
      l.competencia || '', rel || '', '#' + (f.numero || ''),
      _ffIdentificacao(f), Number(l.valor) || 0,
      (l.reprovacao && l.reprovacao.por) || '',
      (l.reprovacao && l.reprovacao.em) ? _ffDataHora(l.reprovacao.em) : ''
    ]);
    // Linha de baixo: o motivo, por extenso
    linhas.push(['MOTIVO DO ESTORNO', (l.reprovacao && l.reprovacao.motivo) || '(sem motivo registrado)',
                 '', '', '', '', '', '', '', '', '', '', '', '', '']);
    linhas.push([]);   // respiro entre uma pessoa e outra
  });

  // Fecho com os totais
  const soma = todos.reduce((s, e) => s + (Number(e.l.valor) || 0), 0);
  linhas.push([]);
  linhas.push(['TOTAL', todos.length + ' estorno(s)', '', '', '', '', '', '', '', '', '', '', soma, '', '']);
  linhas.push(['', 'Em aberto: ' + pend.length + '   ·   Reenviados: ' + feitos.length]);

  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws['!cols'] = [{ wch: 34 }, { wch: 34 }, { wch: 16 }, { wch: 10 }, { wch: 8 }, { wch: 8 },
                 { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 34 },
                 { wch: 13 }, { wch: 22 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Estornos');
  XLSX.writeFile(wb, 'estornos_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  registrarLogGlobal('Exportou o relatório de estornos (' + todos.length + ' registro(s)).', 'dp');
};

window.ffBaixarTodosPdfs = async function () {
  const f = (state.fluxosFinanceiros || []).find(x => x.id === _ffDetalheId);
  if (!f) return;
  const itens = (Array.isArray(f.arquivos) ? f.arquivos : []).slice();
  if (f.comprovante && f.comprovante.arquivo) {
    itens.push({ nome: 'COMPROVANTE - ' + (f.comprovante.nome || 'comprovante.pdf'), arquivo: f.comprovante.arquivo });
  }
  if (!itens.length) { alert('Esta ficha não tem nenhum arquivo para baixar.'); return; }
  if (typeof JSZip === 'undefined') {
    alert('O compactador não carregou. Recarregue a página (Ctrl+Shift+R) e tente de novo.');
    return;
  }

  const btn = document.getElementById('ff-btn-baixar-tudo');
  const rotuloOriginal = btn ? btn.innerHTML : '';
  const passo = (txt) => { if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + txt; };
  if (btn) btn.disabled = true;

  try {
    const zip = new JSZip();
    const usados = {};
    const falhou = [];
    for (let i = 0; i < itens.length; i++) {
      passo('Juntando ' + (i + 1) + ' de ' + itens.length + '...');
      let nome = String(itens[i].nome || ('arquivo-' + (i + 1) + '.pdf')).replace(/[\\/:*?"<>|]/g, '-');
      if (!/\.[a-z0-9]{2,5}$/i.test(nome)) nome += '.pdf';
      if (usados[nome]) { const n = ++usados[nome]; nome = nome.replace(/(\.[^.]+)$/, ' (' + n + ')$1'); }
      else usados[nome] = 1;
      try {
        zip.file(nome, await _ffBytesDoArquivo(itens[i]));
      } catch (e) {
        falhou.push(itens[i].nome || ('arquivo ' + (i + 1)));
      }
    }
    if (!Object.keys(zip.files).length) {
      alert('Não consegui baixar nenhum dos arquivos. Tente abrir um deles para conferir se ainda está no servidor.');
      return;
    }
    passo('Compactando...');
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const nomeZip = 'fluxo_' + (f.numero || 'sem-numero') + '_' +
      String(f.empresaNome || 'documentos').replace(/[^\w]+/g, '_') + '.zip';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nomeZip;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    registrarLogGlobal('Baixou todos os documentos do Fluxo #' + f.numero + ' (' +
      (itens.length - falhou.length) + ' arquivo(s)).', 'dp');
    if (falhou.length) {
      alert('Baixei ' + (itens.length - falhou.length) + ' de ' + itens.length + ' arquivo(s).\n\n' +
        'Não consegui estes:\n• ' + falhou.join('\n• ') +
        '\n\nAbra cada um pelo botão "Abrir" para conferir se ainda estão no servidor.');
    }
  } catch (e) {
    alert('Não consegui montar o pacote: ' + (e.message || e));
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = rotuloOriginal; }
  }
};

// ── Ações do fluxo ─────────────────────────────────────────────────────────
async function _ffSalvarERender(f, msgOk) {
  // Mantem o painel de avisos e o marcador do menu sempre em dia
  setTimeout(function(){ try { _rtRenderAvisos(); _rtAtualizarSinoMenu(); } catch (e) {} }, 100);
  try {
    if (window.RTCloud && RTCloud.configured && typeof RTCloud.salvarAgora === 'function') {
      // merge+upsertIds (igual ao ffFinalizarPagamentos): sem isso, duas
      // pessoas agindo em fichas DIFERENTES quase ao mesmo tempo podiam fazer
      // a segunda gravação reverter a aprovação/pagamento que a primeira
      // acabou de salvar, porque o merge de versão antiga reaplicava a cópia
      // desatualizada de TODAS as fichas que a segunda pessoa ainda tinha na
      // memória — não só a que ela mexeu.
      await RTCloud.salvarAgora(state, { merge: true, upsertIds: f && f.id ? [f.id] : undefined });
    } else { saveState(); }
    try { localStorage.setItem('rt_empregos_data', _estadoParaCache()); } catch (e) {}
    _ffRenderDetalhe(); renderFluxoFinanceiro();
    if (msgOk) alert(msgOk);
  } catch (e) {
    alert('Não foi possível salvar no servidor: ' + (e.message || e) + '\nTente de novo.');
  }
}

window.ffEnviarParaAprovacao = async function() {
  const f = (state.fluxosFinanceiros || []).find(x => x.id === _ffDetalheId);
  if (!f || f.status !== 'rascunho') return;
  if (!(f.linhas || []).length) { alert('O fluxo não tem nenhum registro. Adicione ou importe antes de enviar.'); return; }
  const pend = f.linhas.filter(l => l.status === 'conferir').length;
  if (pend && !confirm(`Ainda há ${pend} registro(s) marcados como "conferir".\n\nEnviar para aprovação mesmo assim?`)) return;

  // Trava de segurança: soma das linhas × total impresso no PDF
  const divergentes = _ffChequeTotais(f).filter(c => c.bate === false);
  if (divergentes.length) {
    const det = divergentes.map(c => `• ${c.arquivo}: soma ${_ffMoedaBR(c.soma)} ≠ total do PDF ${_ffMoedaBR(c.totalDeclarado)} (diferença ${_ffMoedaBR(Math.abs(c.soma - c.totalDeclarado))})`).join('\n');
    if (!confirm(`⚠ ATENÇÃO — os valores NÃO batem com o total impresso no PDF:\n\n${det}\n\nIsso costuma indicar linha faltando ou valor lido errado.\nQuer enviar para aprovação MESMO ASSIM?`)) return;
    _ffHist(f, `Enviou com divergência de totais reconhecida: ${det.replace(/\n/g, ' | ')}`);
  }

  f.enviadoEm = new Date().toISOString();

  // Ficha de ESTORNO: já passou por todas as aprovações no pagamento original.
  // Repetir a fila só atrasaria o acerto, então vai direto ao Financeiro, com
  // as duas aprovações registradas como automáticas para o histórico fechar.
  if (_ffEhFichaEstorno(f)) {
    const agoraE = f.enviadoEm;
    const quemE = nomeExibido(loggedUser) + ' (ficha de estorno)';
    f.aprovacoes = f.aprovacoes || {};
    f.aprovacoes.coordenacao = { por: quemE, em: agoraE, automatica: true };
    f.aprovacoes.gestao      = { por: quemE, em: agoraE, automatica: true };
    f.status = 'aguardando_financeiro';
    _ffHist(f, 'Ficha de ESTORNO enviada direto para o Financeiro (' + f.linhas.length +
      ' registro(s) · ' + _ffMoedaBR(_ffTotal(f)) + '). Supervisão e Gestão já aprovaram no pagamento original.');
    _ffNotificar(f, 'financeiro');
    registrarLogGlobal('Enviou a ficha de ESTORNO #' + f.numero + ' para o Financeiro.', 'dp');
    await _ffSalvarERender(f, 'Estorno #' + f.numero + ' enviado direto para o Financeiro.');
    return;
  }

  // Empresa sigilosa: pula Supervisão e Gestão e vai direto ao Financeiro.
  // As duas aprovações ficam registradas como automáticas, para o histórico
  // não ter buraco e dar para auditar depois.
  if (_ffFichaSigilosa(f)) {
    const agora = f.enviadoEm;
    const quem = nomeExibido(loggedUser) + ' (empresa sigilosa)';
    f.aprovacoes = f.aprovacoes || {};
    f.aprovacoes.coordenacao = { por: quem, em: agora, automatica: true };
    f.aprovacoes.gestao      = { por: quem, em: agora, automatica: true };
    f.status = 'aguardando_financeiro';
    _ffHist(f, `Confirmou a conferência (${f.linhas.length} registros · ${_ffMoedaBR(_ffTotal(f))}). ` +
      `Empresa sigilosa: Supervisão e Gestão aprovadas automaticamente e a ficha seguiu direto para o Financeiro.`);
    _ffNotificar(f, 'financeiro');
    registrarLogGlobal(`Enviou o Fluxo Financeiro #${f.numero} (empresa sigilosa) direto para o Financeiro.`, 'dp');
    await _ffSalvarERender(f, `Fluxo #${f.numero} enviado direto para o Financeiro (empresa sigilosa).`);
    return;
  }

  f.status = 'aguardando_coordenacao';
  _ffHist(f, `Confirmou a conferência (${f.linhas.length} registros · ${_ffMoedaBR(_ffTotal(f))}) e enviou para a Supervisão DP.`);
  _ffNotificar(f, 'coordenacao');
  registrarLogGlobal(`Enviou o Fluxo Financeiro #${f.numero} para aprovação da Supervisão DP.`, 'dp');
  await _ffSalvarERender(f, `Fluxo #${f.numero} enviado para a Supervisão DP.`);
};

window.ffAprovar = async function(etapa) {
  const f = (state.fluxosFinanceiros || []).find(x => x.id === _ffDetalheId);
  if (!f) return;
  const agora = new Date().toISOString();
  const quem = nomeExibido(loggedUser);
  // Quem é responsável pela etapa aprova mesmo tendo subido a ficha. Fica
  // anotado no histórico para a auditoria enxergar depois.
  const mesmaPessoa = _ffEhCriador(f) ? ' (mesma pessoa que montou a ficha)' : '';

  if (etapa === 'coordenacao' && f.status === 'aguardando_coordenacao' && _ffEhCoordenacao()) {
    f.aprovacoes.coordenacao = { por: quem, login: loggedUser.login, em: agora, proprioAutor: !!mesmaPessoa };
    f.status = 'aguardando_gestao';
    f.enviadoEm = agora;
    _ffHist(f, 'Supervisão DP aprovou' + mesmaPessoa + '. Enviado para a Gestão.');
    _ffNotificar(f, 'gestao');
    registrarLogGlobal(`Aprovou (Supervisão DP) o Fluxo Financeiro #${f.numero}${mesmaPessoa}.`, 'dp');
    await _ffSalvarERender(f, 'Aprovado! O fluxo seguiu para a Gestão.');
  } else if (etapa === 'gestao' && f.status === 'aguardando_gestao' && _ffEhGestao()) {
    f.aprovacoes.gestao = { por: quem, login: loggedUser.login, em: agora, proprioAutor: !!mesmaPessoa };
    f.status = 'aguardando_financeiro';
    f.enviadoEm = agora;
    _ffHist(f, 'Gestão aprovou' + mesmaPessoa + '. Enviado para o Financeiro.');
    _ffNotificar(f, 'financeiro');
    registrarLogGlobal(`Aprovou (Gestão) o Fluxo Financeiro #${f.numero}${mesmaPessoa}.`, 'dp');
    await _ffSalvarERender(f, 'Aprovado! O fluxo seguiu para o Financeiro.');
  }
};

window.ffReprovar = async function() {
  const f = (state.fluxosFinanceiros || []).find(x => x.id === _ffDetalheId);
  if (!f) return;
  const motivo = prompt('Motivo da reprovação (fica no histórico):');
  if (motivo === null) return;
  if (!String(motivo).trim()) { alert('Escreva o motivo.'); return; }
  f.status = 'reprovado';
  _ffHist(f, `REPROVOU o fluxo. Motivo: ${String(motivo).trim()}`);
  registrarLogGlobal(`Reprovou o Fluxo Financeiro #${f.numero}.`, 'dp');
  await _ffSalvarERender(f, 'Fluxo reprovado.');
};

window.ffDevolver = async function() {
  const f = (state.fluxosFinanceiros || []).find(x => x.id === _ffDetalheId);
  if (!f) return;
  const motivo = prompt('O que precisa ser corrigido? (fica no histórico)');
  if (motivo === null) return;
  if (!String(motivo).trim()) { alert('Escreva o que corrigir.'); return; }
  f.status = 'rascunho';
  f.aprovacoes = {};   // volta do zero: as aprovações anteriores caem
  f.enviadoEm = null;
  _ffHist(f, `Devolveu para correção. Motivo: ${String(motivo).trim()}`);
  _ffNotificar(f, 'criar');
  registrarLogGlobal(`Devolveu o Fluxo Financeiro #${f.numero} para correção.`, 'dp');
  await _ffSalvarERender(f, 'Fluxo devolvido ao DP para correção.');
};

// CANCELAR: um fluxo que JÁ entrou no workflow nunca é apagado — é cancelado,
// preservando todo o histórico. Só o criador, a Gestão ou o admin podem.
window.ffCancelarFluxo = async function() {
  const f = (state.fluxosFinanceiros || []).find(x => x.id === _ffDetalheId);
  if (!f) return;
  if (['finalizado', 'cancelado'].includes(f.status)) { alert('Este fluxo já está encerrado.'); return; }
  if (f.status === 'rascunho') { alert('Rascunho não se cancela — use "Excluir rascunho".'); return; }
  const podeCancelar = ehMestre(loggedUser.login) || _ffEhCriador(f) || _ffEhGestao() || _ffVeTudo() || _ffEhCoordenacao();
  if (!podeCancelar) { alert('Você não tem permissão para cancelar este fluxo.'); return; }
  const motivo = prompt('Por que este fluxo está sendo cancelado? (fica no histórico)');
  if (motivo === null) return;
  if (!String(motivo).trim()) { alert('Escreva o motivo do cancelamento.'); return; }
  f.statusAntesCancelar = f.status;
  f.status = 'cancelado';
  f.divergencia = null;
  _ffHist(f, `CANCELOU o fluxo. Motivo: ${String(motivo).trim()}`);
  registrarLogGlobal(`Cancelou o Fluxo Financeiro #${f.numero}.`, 'dp');
  await _ffSalvarERender(f, `Fluxo #${f.numero} cancelado. O histórico foi preservado.`);
};

// EXCLUIR: exclusão física permitida SOMENTE para rascunhos (nunca para um
// processo que já entrou no workflow).
window.ffExcluirFluxo = async function() {
  const f = (state.fluxosFinanceiros || []).find(x => x.id === _ffDetalheId);
  if (!f) return;
  // Rascunho: quem criou (ou a Supervisão) apaga. Ficha JÁ ENVIADA: só o
  // administrador — é ele quem limpa uma nota subida por engano.
  const ehAdminFF = ehMestre(loggedUser.login) || _ffVeTudo();
  if (f.status !== 'rascunho' && !ehAdminFF) {
    alert('Esta ficha já foi enviada. Só o administrador pode excluí-la — para os demais, o caminho é CANCELAR (assim o histórico fica preservado).');
    return;
  }
  if (f.status === 'rascunho' && !(ehAdminFF || _ffEhCriador(f) || _ffPodeCriar())) {
    alert('Você não tem permissão para excluir este rascunho.');
    return;
  }
  const relFF = _ffRelacaoTexto(f);
  const avisoFF = 'EXCLUIR DEFINITIVAMENTE a ficha #' + f.numero + '\n\n' +
    'Empresa: ' + (f.empresaNome || '—') + '\n' +
    'Tipo: ' + (f.tipo || '—') + '\n' +
    (relFF ? 'Relação bancária: N. ' + relFF + '\n' : '') +
    'Colaboradores: ' + ((f.linhas || []).length) + '\n' +
    'Situação: ' + ((FF_STATUS[f.status] || {}).rotulo || f.status) + '\n\n' +
    'Os arquivos e o histórico desta ficha somem junto.\nEsta ação NÃO pode ser desfeita.';
  if (!confirm(avisoFF)) return;
  // Ficha que já saiu do rascunho pede uma segunda confirmação
  if (f.status !== 'rascunho' && !confirm('Confirma mesmo? A ficha #' + f.numero + ' será apagada para todos.')) return;
  const idx = state.fluxosFinanceiros.indexOf(f);
  if (idx >= 0) state.fluxosFinanceiros.splice(idx, 1);
  registrarLogGlobal(`Excluiu o rascunho de Fluxo Financeiro #${f.numero}.`, 'dp');
  fecharDetalheFluxo();
  try {
    // deleteIds: exclusao tem que ser explicita, senao um save feito com a
    // versao atrasada nao removia a ficha de verdade (o merge so junta) e
    // ela reaparecia pra todo mundo no proximo carregamento.
    if (window.RTCloud && RTCloud.configured && typeof RTCloud.salvarAgora === 'function') await RTCloud.salvarAgora(state, { merge: true, deleteIds: [f.id] });
    else saveState();
    try { localStorage.setItem('rt_empregos_data', _estadoParaCache()); } catch (e) {}
  } catch (e) { alert('Não foi possível salvar: ' + (e.message || e)); }
  renderFluxoFinanceiro();
};

window.ffMarcarPago = async function() {
  const f = (state.fluxosFinanceiros || []).find(x => x.id === _ffDetalheId);
  if (!f || f.status !== 'aguardando_financeiro' || !_ffEhFinanceiro()) return;
  if (f.divergencia) { alert('Há uma divergência sinalizada — o pagamento fica bloqueado até a Gestão resolver.'); return; }
  if (!confirm(`Confirmar o pagamento de ${_ffMoedaBR(_ffTotal(f))} (${f.empresaNome} · ${f.tipo})?`)) return;
  f.aprovacoes.pagamento = { por: nomeExibido(loggedUser), login: loggedUser.login, em: new Date().toISOString() };
  f.status = 'pago';
  _ffHist(f, `Financeiro confirmou o pagamento de ${_ffMoedaBR(_ffTotal(f))}.`);
  registrarLogGlobal(`Confirmou o pagamento do Fluxo Financeiro #${f.numero} (${_ffMoedaBR(_ffTotal(f))}).`, 'dp');
  await _ffSalvarERender(f, 'Pagamento registrado! Agora anexe o comprovante para finalizar.');
};

window.anexarComprovanteFluxo = async function(input) {
  const file = input.files?.[0];
  input.value = '';
  const f = (state.fluxosFinanceiros || []).find(x => x.id === _ffDetalheId);
  if (!file || !f || f.status !== 'pago') return;
  try {
    const base64 = await fileToBase64(file);
    f.comprovante = { nome: file.name, arquivo: base64, em: new Date().toISOString() };
    f.status = 'finalizado';
    _ffHist(f, `Anexou o comprovante (${file.name}). Fluxo FINALIZADO.`);
    registrarLogGlobal(`Anexou o comprovante e finalizou o Fluxo Financeiro #${f.numero}.`, 'dp');
    await _ffSalvarERender(f, `Fluxo #${f.numero} FINALIZADO com comprovante. ✅`);
  } catch (e) {
    alert('Não foi possível anexar: ' + (e.message || e));
  }
};

// VOLTAR PARA PAGAMENTO: desfaz uma confirmação de pagamento feita por engano
// (ex.: marcaram "Pagamento Realizado" sem ter pago de verdade). Devolve a
// ficha pra fila "Aguardando Financeiro", como se o pagamento ainda não
// tivesse sido confirmado — pra dar pra pagar direito. Só o Financeiro (ou o
// mestre) decide isso; nunca apaga nada, fica tudo no histórico.
window.ffVoltarParaPagamento = async function() {
  const f = (state.fluxosFinanceiros || []).find(x => x.id === _ffDetalheId);
  if (!f) return;
  if (!['pago', 'finalizado'].includes(f.status) || !_ffEhFinanceiro()) return;
  const motivo = prompt('Por que este pagamento está voltando para a fila? (fica no histórico)');
  if (motivo === null) return;
  if (!String(motivo).trim()) { alert('Escreva o motivo.'); return; }
  const estadoAnterior = (FF_STATUS[f.status] || {}).rotulo || f.status;
  const tinhaComprovante = !!f.comprovante;
  f.status = 'aguardando_financeiro';
  f.aprovacoes = f.aprovacoes || {};
  f.aprovacoes.pagamento = null;
  f.comprovante = null;
  _ffHist(f, `Voltou de "${estadoAnterior}" para Aguardando Financeiro. Motivo: ${String(motivo).trim()}` +
    (tinhaComprovante ? ' (o comprovante anexado foi removido).' : '.'));
  registrarLogGlobal(`Voltou o Fluxo Financeiro #${f.numero} para a fila de pagamento.`, 'dp');
  await _ffSalvarERender(f, `Fluxo #${f.numero} voltou para "Aguardando Financeiro". Já pode refazer o pagamento.`);
};

// ── TELA CHEIA DO WHATSAPP ────────────────────────────────────────────────
// Atender é a única coisa que se faz aqui por horas seguidas, e a tela ficava
// pequena no meio do sistema. Neste modo some tudo que não é a conversa: a
// barra lateral, o cabeçalho e o banner do módulo. Sai pelo botão ou com Esc.
function waTelaCheia(ligar) {
  const b = document.body;
  const estava = b.classList.contains('wa-tela-cheia');
  const querLigar = (ligar === undefined) ? !estava : !!ligar;

  // Só faz sentido dentro da aba do WhatsApp. Se alguém chamar de outra tela,
  // leva para lá primeiro — senão o sistema some e não aparece nada no lugar.
  if (querLigar) {
    const sec = document.getElementById('aba-whatsapp');
    if (!sec || !sec.classList.contains('active')) {
      if (typeof switchAba === 'function') switchAba('whatsapp');
    }
  }

  b.classList.toggle('wa-tela-cheia', querLigar);
  try { localStorage.setItem('rt_wa_tela_cheia', querLigar ? '1' : '0'); } catch (e) {}

  // A lista de mensagens tem altura calculada. Depois de mudar o tamanho da
  // caixa, ela precisa voltar para a última mensagem — senão fica no meio.
  setTimeout(function () {
    const m = document.querySelector('.wa-msgs');
    if (m) m.scrollTop = m.scrollHeight;
  }, 60);
}
window.waTelaCheia = waTelaCheia;

// Esc sai da tela cheia. É o que a pessoa tenta por instinto.
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && document.body.classList.contains('wa-tela-cheia')) waTelaCheia(false);
});

// Trocar de aba tem que sair da tela cheia, senão o sistema fica invisível.
(function () {
  const original = window.switchAba;
  if (typeof original !== 'function') return;
  window.switchAba = function (abaId) {
    if (abaId !== 'whatsapp' && document.body.classList.contains('wa-tela-cheia')) {
      document.body.classList.remove('wa-tela-cheia');
      try { localStorage.setItem('rt_wa_tela_cheia', '0'); } catch (e) {}
    }
    return original.apply(this, arguments);
  };
})();
