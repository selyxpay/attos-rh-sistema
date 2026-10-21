# R&T VAGAS IA — Visão geral técnica do sistema

> Documento de contexto para outra IA que vá ajudar a melhorar este sistema.
> Descreve o que o sistema é, como está construído, o que já existe dentro dele,
> e quais são as regras e armadilhas conhecidas.
>
> **Leia a seção 8 ("Regras inegociáveis") antes de propor qualquer mudança.**

---

## 1. O que é

Sistema interno de uma agência de recrutamento e serviços (R&T). Está **em
produção**, usado todos os dias por várias pessoas ao mesmo tempo: Seleção, DP
(Departamento Pessoal), Supervisão, Gestão, Financeiro e Clínica.

Cobre o ciclo completo: divulgar vaga → receber candidato → selecionar →
contratar → exame médico → entregar equipamento → folha de pagamento →
atendimento por WhatsApp. Tem também um módulo de diárias (trabalho avulso de
campo) com cadastro e presença feitos pelo celular do próprio trabalhador.

---

## 2. Arquitetura — o mais importante de entender

É **deliberadamente simples**, e isso é decisão de projeto, não falta de maturidade:

| Camada | O que é |
|---|---|
| Backend | **Um único arquivo** `server.cjs` (~3.100 linhas), Node.js puro |
| Framework | **Nenhum.** Sem Express. Um `http.createServer` com cadeia de `if/else` sobre `urlPath` |
| Banco de dados | **Nenhum** (exceto WhatsApp). Todo o estado é **um JSON** em disco: `state.json` |
| Frontend | **Um único arquivo** `js/app.js` (~19.500 linhas), JS puro, sem React/Vue/build |
| Dependência npm | **Uma só**: `sql.js` (SQLite em JS puro, usado só pelo WhatsApp) |
| Deploy | `git push` → Coolify → VPS → `node server.cjs` |

### Por que isso importa

Não há build, bundler, transpilador nem `node_modules` grande. **Não proponha
migrar para framework, banco de dados, TypeScript ou build system** — já foi
decidido e está fora de questão. Toda melhoria precisa caber em "Node puro +
JSON + JS puro no navegador".

### Bibliotecas de frontend (todas por CDN, sem build)

`pdf.js` (ler PDF), `Tesseract.js` (OCR de PDF escaneado), `XLSX` (planilha),
`JSZip` (gerar .zip e .docx), `Chart.js` (gráficos), Font Awesome, Google Fonts.

---

## 3. Como o dado vive (a parte mais delicada)

### 3.1 O estado

Tudo fica num objeto JS global `state`, persistido inteiro como `state.json`.
Principais chaves (cada uma é uma lista de registros com `id`, salvo indicado):

| Chave | Conteúdo |
|---|---|
| `candidatos` | Candidatos e histórico deles no funil |
| `vagas` | Vagas abertas |
| `bancoTalentos` | Currículos guardados para o futuro |
| `funcionarios` | Usuários do sistema (login, senha, departamento, permissões) |
| `empresas` / `tomadores` / `clientes` | Cadastros usados pelo Fluxo Financeiro |
| `fluxosFinanceiros` | As "fichas" de pagamento (ver seção 6) |
| `equipamentos` / `relatoriosEquip` | Entrega e devolução de equipamento |
| `examesMedicos` | Exames médicos (ASO) |
| `contratacoes` | Contratações efetivadas |
| `inaptos` / `motivosInaptidao` | Pessoas bloqueadas e os motivos |
| `trabalhadoresDiaria` / `diarias` / `presencasDiaria` | Módulo Diária |
| `precificacao` | Tabela custo x repasse (aba Margem) |
| `logs` | Auditoria de ações |
| `fila` | Senhas de atendimento presencial (**objeto**, não lista) |
| `ffWorkflow` | Quem aprova cada etapa do financeiro (**objeto**, não lista) |
| `config`, `controleAcesso`, `vagaFormConfig` | Configurações (**objetos**) |

### 3.2 Como salva — LEIA COM ATENÇÃO

O navegador manda o estado para `POST /api/state`. O servidor escolhe entre
**substituir tudo** e **mesclar**:

- Cliente **atualizado** (`baseVersion` igual à versão do servidor) → substitui tudo.
- Cliente **atrasado** (alguém gravou nesse meio-tempo) → **mescla**, para não
  apagar o que a outra pessoa acabou de salvar.

Mesclar tem duas limitações que já causaram bugs reais em produção:

1. **Mesclar nunca remove.** Exclusão feita por cliente atrasado simplesmente
   não acontecia: sumia da tela, não dava erro, e voltava no recarregamento.
2. **Mesclar não sobrescreve chave que não é lista.** Mudança de configuração
   feita por cliente atrasado era descartada em silêncio.

Por isso o save aceita campos extras, todos opcionais:

```js
RTCloud.salvarAgora(state, {
  merge: true,
  upsertIds: ['ff-123'],    // registros que EU mudei (só estes são sobrescritos)
  deleteIds: ['ff-999'],    // registros que EU apaguei (exclusão vale no merge)
  setKeys: ['ffWorkflow'],  // chaves de CONFIGURAÇÃO que mudei de propósito
});
```

**Regra para quem for mexer:**

- Alterou ou criou registro → `{ merge: true, upsertIds: [id] }`
- Apagou registro → `{ merge: true, deleteIds: [id] }`
- Mudou configuração (objeto, não lista) → `{ merge: true, setKeys: ['chave'] }`
- `salvarAgora(state)` **sem opções** hoje é seguro: o `vps-sync.js` guarda uma
  foto do estado cada vez que ele vem do servidor e, na hora de salvar,
  descobre sozinho o que mudou (`_oQueMudou`). Isso existe porque ~90 telas
  chamam `saveState()` sem dizer nada, e antes esse caminho subia como
  "substitui tudo" — era o que desfazia a aprovação de ficha feita por outra
  pessoa. **Ainda assim, declare as opções quando você sabe o que mudou:** é
  mais barato e não depende da foto estar em dia.

**Três casos que o diff automático NÃO cobre — aí as opções são obrigatórias:**

1. Chaves com merge próprio no servidor (`fila`, `_docsMeta`): o diff as
   ignora de propósito. `fila` só aceita senha NOVA pelo merge, então alterar
   ou remover senha exige `setKeys: ['fila']`.
2. Lista de texto puro, sem `id` (ex.: `ffSigiloLogins`): o merge só
   acrescenta, então remoção exige `setKeys`.
3. Save com `somenteAlvos: true` recorta o corpo: tudo que precisa subir tem
   que estar em `upsertIds`, inclusive o id do log de auditoria.

No servidor, **toda** gravação de estado passa por `comTrava(fn)`, um mutex que
serializa as escritas. Nunca grave estado fora dele.

### 3.3 Sincronização

`js/vps-sync.js` expõe `window.RTCloud`. Faz polling de `/api/state/version` e só
baixa o estado inteiro quando a versão mudou. A versão local **só avança quando
a tela realmente absorveu** o estado novo — se falhar, fica atrasada de
propósito, para o próximo save ser tratado como "mesclar" em vez de "substituir".

### 3.4 Backup — dois, que se completam

**Na inicialização** (`backupDaInicializacao`, no `server.cjs`). A cada subida do
processo, **antes de o sistema ler ou gravar qualquer coisa**, o `state.json`
atual é copiado para `DATA_DIR/backups/` com data e hora no nome
(`state_2026-10-21_10h30.json`). Deploy é justamente quando o processo sobe, então
**todo deploy deixa para trás a foto de como o sistema estava um instante antes
dele** — sem ninguém precisar lembrar de fazer backup à mão.

Ficam as **20 cópias mais recentes**. O que essa função nunca faz:

- não altera, não move e não renomeia o `state.json` (só **lê** e escreve outro
  arquivo);
- não apaga nada que não seja cópia dela mesma (os `state-hora-*` e
  `state-dia-*` do backup por hora ficam intactos);
- não impede o sistema de subir: qualquer falha vira log e a vida segue. Isso é
  testado.

Ela também confere a cópia depois de escrever e grita no log se saiu diferente
do original — backup que não confere é pior que nenhum, porque dá falsa
segurança.

**O banco do WhatsApp e as sessões** também são copiados na subida
(`backupExtraDaInicializacao`), com os mesmos cuidados e o mesmo limite de 20.
Eles guardam o que **não dá para recriar**: as conversas e as contas
conectadas (com o token) ficam no SQLite, e as sessões abertas no
`sessions.json`. Faltava cópia dos dois — o backup só cobria o `state.json`.

**Por hora e por dia** (`fazerBackupSePreciso`). Gira em 24 slots de hora + 7 de
dia, com nomes fixos. A cópia das 14h de hoje sobrescreve a das 14h de ontem.
Serve para voltar algumas horas; a da inicialização serve para voltar um deploy.

**As duas ficam em `DATA_DIR/backups/`**, ou seja, dentro do volume persistente
do Coolify (`DATA_DIR=/data` no container). Se ficassem dentro do container,
sumiriam no deploy seguinte — que é exatamente quando o backup mais importa.

**A pasta nunca sai pela web.** O servidor de arquivos estáticos recusa qualquer
caminho que caia na pasta de dados (`_caminhoDeDados`) e qualquer arquivo que
seja do servidor (`_arquivoDoServidor`). Isso não é detalhe: a conferência
anterior só perguntava "está dentro da pasta da aplicação?", e a pasta de dados
padrão fica **dentro** dela — então `/server-data/state.json` entregava o banco
inteiro sem login, e `/server.cjs` entregava o backend todo. A única parte da
pasta de dados que é pública de propósito é `/uploads/` (regra 7).

### 3.5 Outras redes de segurança

`equipamentos-protecao.cjs` é um módulo isolado com proteções extras para os
dados de equipamento (parte crítica do negócio): guarda anti-sumiço, espelho
independente em pasta própria e arquivo dos excluídos. Se ele falhar, o sistema
continua salvando normalmente.

---

## 4. Login, perfis e permissões

- Sessão por cookie HttpOnly `rt_session`, guardada em `sessions.json`.
- Usuários ficam em `state.funcionarios`, com `login`, `departamento`, o mapa
  de `telas` (acesso por tela, abaixo) e o mapa antigo de `permissoes` (ajuste
  fino de botões dentro das telas).
- **Mestre**: logins `joaobalaf` e `admin` — acesso total.

### 4.1 Acesso por tela (`js/telas.js`) — leia antes de mexer em permissão

Arquivo **único**, carregado por `<script>` no navegador **e** por `require()`
no `server.cjs`. A regra não pode existir em dois lugares: já existiu, e as
duas cópias divergiram (havia tela que o menu escondia e a função deixava
entrar).

`funcionario.telas` é um mapa de aba para nível:

| Nível | O que significa |
|---|---|
| `'nao'` (ou chave ausente) | A aba não aparece **e** os dados dela não descem no `/api/state` |
| `'ver'` | A tela abre, mas o servidor **recusa gravar** |
| `'editar'` | Ver e editar |

**Onde o servidor confere** (três pontos, todos em `server.cjs`):

1. `permitirRota()` — portão único logo depois da checagem de sessão, com uma
   tabela de rota para tela. `GET`/`HEAD` exige `ver`, o resto exige `editar`.
2. `RTTelas.filtrarEstadoPorTelas()` — na **leitura** do `/api/state`, tira as
   chaves das telas que a pessoa não pode ver (lista vira `[]`).
3. `RTTelas.reporChavesNaoEditaveis()` — na **escrita**, as chaves das telas
   que a pessoa não pode editar voltam a ser as do servidor.

**Compatibilidade:** conta sem o campo `telas` tem o nível **derivado** das
regras antigas, reproduzindo o que o menu já mostrava — ninguém perde nem ganha
acesso. Quando o admin salva `telas` daquela pessoa, o mapa passa a valer.

#### ⚠️ Padrão provisório: área ausente vira "ver e editar"

Na derivação, quando a matriz antiga de `permissoes` **não tem** a área daquela
tela, o nível sai como **`'editar'`** (ver e editar), não como "sem acesso".

**Por que está assim.** O `state.json` de produção só tem **12 das 16 áreas** —
faltam `exame_medico`, `equipamentos`, `fluxo_financeiro` e `whatsapp` — e há
conta com `permissoes: {}` (vazio). Nesses casos o acesso nunca veio da matriz:
veio do **departamento**, e a pessoa trabalhava na tela normalmente. Quem for
conservador aqui tira o DP de Equipamentos e o Financeiro do Fluxo Financeiro no
dia do deploy, o que seria pior que o problema que se quer resolver.

**Isto é TEMPORÁRIO.** O padrão certo é "sem acesso", e o caminho para chegar
lá, nesta ordem:

1. **Completar as 16 áreas** em todos os funcionários do `state.json`,
   preenchendo-as com o que cada pessoa de fato usa hoje. Dá para fazer pela
   tela de Funcionários, pessoa por pessoa, ou por um script que preencha a
   partir do departamento.
2. **Conferir** que ninguém ficou com área em branco — enquanto houver uma, o
   padrão provisório continua sendo usado para ela.
3. **Inverter o padrão** na função `_nivelPorRegraAntiga` de `js/telas.js`:
   trocar o `if (!p) return 'editar'` por `return 'nao'`.
4. Melhor ainda: depois do passo 1, salvar o mapa `telas` de cada pessoa pela
   tela de Funcionários. A partir daí a derivação deixa de ser usada para quem
   tem o mapa, e o padrão provisório perde o efeito naturalmente.

Enquanto o passo 3 não acontecer, **toda tela cuja área falte na matriz fica
aberta para quem já enxerga a tela** — o que é o comportamento de hoje, mas não
é o que se quer no fim.

**Três chaves com tratamento próprio:** `funcionarios` nunca vira lista vazia
(outras telas mostram nome de autor), vai numa versão enxuta; `logs` é só de
**acrescentar**, porque toda ação grava log mesmo de quem não abre a Auditoria;
`fila` mantém o merge próprio.

**Campos que o cliente NUNCA define** (`_reporCamposDeAcesso` no `server.cjs`
repõe do próprio estado): `senha` e `senhaVisivel` para qualquer um, e
`permissoes`, `telas`, `departamento`, `status`, `podeVerSenhas` e afins para
quem não é admin. Era por aqui que qualquer funcionário logado se promovia a
administrador ou reescrevia o hash da senha da conta mestre.
- **Departamentos**: `administracao`, `dp`, `selecao`, `financeiro`, `comissao`,
  `clinica`.
- `index.html` e `js/app.js` **só são servidos a quem tem sessão válida**. Sem
  login o visitante recebe apenas `login.html` — o "esqueleto" do sistema nem
  chega ao navegador.
- **Empresas sigilosas**: filtro (`_semSigilo` / `_devolverSigilo`) remove
  empresas confidenciais do payload de quem não pode vê-las e as devolve antes
  de gravar — senão um save comum apagaria tudo que é sigiloso.

### Páginas públicas (sem login)

`login.html`, `candidato.html` (ficha de candidatura), `talento.html` (banco de
talentos), `diaria-trabalhador.html` (cadastro e presença do trabalhador de
diária), `relatorio-equip.html` (conferência de equipamento por link com token),
`fila-display.html` (painel de senhas para TV), `privacidade.html`.

Quem não está logado só consegue **adicionar** em `candidatos`, `bancoTalentos`
e `fila` (constante `CHAVES_ESCRITA_PUBLICA`). Nunca apagar, nunca mexer em
configuração, nunca tocar em funcionários ou vagas.

---

## 5. Os módulos (25 abas do painel)

**Recrutamento**
- **Dashboard** — visão geral e kanban do funil.
- **Vagas** — cadastro de vagas e demandas.
- **Banco de Talentos** — currículos para o futuro.
- **Seleção** — funil do candidato (triagem → entrevista → aprovado/reprovado).
- **Depto. Pessoal** — documentação e contratação.
- **Exame Médico** — ASO e integração com a clínica.
- **Inaptos** — pessoas bloqueadas e motivo.
- **Documentos** — documentos guardados por pessoa.

**Financeiro**
- **Fluxo Financeiro** — o módulo mais complexo (seção 6).
- **Comissão** — planilha de comissão.
- **Margem** — tabela de custo x repasse (`state.precificacao`).
- **Cadastros Exata** — empresas, tomadores e clientes usados nas fichas.

**Operação**
- **Entrega/Devolução de Equipamentos** — com módulo próprio de proteção.
- **Diária (Presença RT)** — seção 7.
- **Fila** — senhas de atendimento presencial, com painel para TV.
- **Site** — links públicos e configuração do formulário de candidatura.

**Administração**
- **Funcionários**, **Controle de Acesso** (matriz de permissões),
  **Configurações**, **Auditoria** (log de ações), **Lixeira**, **Meu Painel**.

### 5.1 Tela do WhatsApp Oficial — o que já foi arrumado

Mensagem que **não é texto** não tem texto nenhum: áudio e figurinha nunca
têm, e foto, vídeo e documento só têm se a pessoa escreveu legenda. O código
caía num `content || ''`, então a conversa mostrava **balão vazio só com a
hora** e a lista mostrava **"—"**. Ninguém sabia o que havia chegado.

Hoje existe `WA_ROTULO_TIPO` em `js/whatsapp.js`, com rótulo e ícone para 16
tipos. Ele serve a conversa (`_waBolha`) e a lista (`_waPrevia`). **Tipo novo
que a Meta inventar entra nessa tabela** — sem ela, cai em "Mensagem não
suportada", que já é melhor que balão vazio.

A coluna `last_message_type` foi acrescentada à tabela de conversas por
`ALTER TABLE` (padrão que o arquivo já usava). Conversa antiga fica com a
coluna vazia e a tela cai no texto, como antes: nenhuma linha existente foi
reescrita.

Outros três pontos da mesma tela:

- **Iniciais do avatar** usam `_waLetras`, que separa por caractere de verdade
  (`Intl.Segmenter`, com `Array.from` como alternativa). `charAt(0)` cortava o
  emoji pela metade e a metade solta virava "?" — era isso que aparecia no
  avatar e no nome de quem usa emoji no WhatsApp.
- **Estado da conversa** só aparece quando é diferente de "aberta". Antes toda
  conversa levava "● Aberta", que não informava nada e tapava a prévia.
- **Texto da mensagem** usa a classe `texto-longo` (regra 15) e transforma
  endereço em link. O link é montado **depois** do escape, nunca antes.

### 5.2 Bot de atendimento (`whatsapp-bot.cjs`)

Responde sozinho quem chama no WhatsApp oficial e encaminha para o lugar certo,
principalmente o link de cadastro nas vagas.

**Onde cada coisa mora, e por quê:**

| O que | Onde | Motivo |
|---|---|---|
| Configuração (ligado, modo, passos, textos) | `state.json`, chave `botWhatsapp` | usa o contrato de gravação (`setKeys`), a permissão por tela e a Auditoria |
| Execução (quem já recebeu, fila, contagem do dia) | SQLite do WhatsApp | muda a cada mensagem; no `state.json` inflaria o arquivo |
| Mídia dos passos | `DATA_DIR/bot-midia/` | **fora** de `/uploads/`, que é público (regra 7) |

**A ordem de decisão é a parte mais importante.** Está em `decidir()`, que é uma
função **pura** — dá para testar sozinha, e é o que a suíte `bot` faz. Nesta
ordem:

1. pediu para sair → nunca mais nada automático
2. pediu atendente → avisa, marca a conversa e para
3. contato pausado → não responde
4. já está no meio de uma sequência → encerra o que falta, **não reinicia**
5. regra do modo escolhido, respeitando o limite
6. nada disso → não responde, deixa para o atendente

Mudar essa ordem muda o comportamento do sistema. Mexa nela e nos testes juntos.

**Garantias que o desenho dá:**

- **Não duplica.** `whatsapp_bot_fila.wamid_gatilho` é `UNIQUE`: a mesma
  mensagem recebida nunca enfileira duas vezes, nem se a Meta repetir o
  webhook.
- **Retoma depois de reinício.** A fila vive no banco, não em memória. E o
  índice do passo **avança antes do envio**, de propósito: se o processo cair
  no meio, o passo não é repetido na volta. Repetir mensagem para o cliente é
  pior que perder uma.
- **Falha num passo não trava os outros.** O erro é registrado e a sequência
  segue.
- **Controle de ritmo.** Um passo por vez, com espaçamento mínimo calculado a
  partir de `ritmo.porMinuto`.
- **Media id reaproveitado.** O arquivo sobe para a Meta uma vez; o id fica em
  `whatsapp_bot_midia`. Quando a Meta expira o id (cerca de 30 dias), o envio
  falha, o cache é descartado e o arquivo sobe de novo, uma vez só.
- **Atendente respondendo para o bot na hora.** O envio manual chama
  `aoAtendenteResponder`, que pausa aquele contato. Nota interna não conta: ela
  não vai para o cliente.

**O bot vem DESLIGADO.** `CONFIG_PADRAO.ligado = false`. Depois de um deploy
ninguém é surpreendido por mensagem automática.

**Áudio como mensagem de voz:** a Meta só mostra como voz se o arquivo for
**OGG/Opus**. A imagem do container é `node:20-alpine` e **não tem ffmpeg**,
então o sistema não converte: ele **confere os bytes** e recusa outro formato
com uma mensagem dizendo o que fazer. Se um dia instalarem ffmpeg na imagem,
dá para converter no upload.

**Permissão:** a aba é a tela `bot` (26ª), e toda rota `/api/whatsapp/bot/` passa
pelo portão — `GET` exige "só ver", o resto exige "ver e editar". A regra do bot
vem **antes** da do WhatsApp em `ROTAS_POR_TELA`, porque `permitirRota` usa o
primeiro padrão que casa.

**WhatsApp (dois canais independentes)**
- **WhatsApp Oficial** — API oficial da Meta (`whatsapp-api.cjs`,
  `whatsapp-webhook.cjs`). Dados em SQLite via `sql.js` (`whatsapp-db.cjs`) — é
  a **única** parte do sistema que não usa o `state.json`.
- **WhatsApp QR** — ponte com OpenWA (segundo número, por QR Code).

### 5.3 Mensagens prontas (`js/whatsapp-respostas-ui.js`)

As frases que a equipe repete o dia todo, a um clique, dentro da conversa.

**Onde cada coisa mora, e por quê:**

| O que | Onde | Motivo |
|---|---|---|
| Catálogo (título, texto, anexo, ordem) | `state.json`, chave `respostasRapidas` | lista com `id`: usa o contrato de gravação (`upsertIds`/`deleteIds`), a permissão por tela e a Auditoria |
| Anexo (imagem ou PDF) | `DATA_DIR/bot-midia/` | **fora** de `/uploads/`, que é público (regra 7). Mesma pasta da mídia do bot, e o mesmo cache de `media id` da Meta |
| Texto final (variáveis trocadas) | servidor, `_waTextoDaPronta` | um lugar só: a prévia que cai na caixa e o envio direto usam a MESMA função |

**Como o atendente usa:** uma fileira de botões acima da caixa de escrever.
Clicar põe o texto na caixa (para ajustar antes de mandar); o avião ao lado
manda na hora. Na caixa vazia, a barra `/` abre a lista com busca.

**Janela de 24 horas.** A Meta só aceita mensagem escrita à mão nas 24 horas
seguintes à última mensagem **recebida**. Fora disso, os botões aparecem
desligados com o aviso do motivo, e a rota de envio recusa com `409` **antes**
de chamar a Meta. Na dúvida (banco indisponível, conversa sem nenhuma mensagem
recebida) a janela conta como **fechada**: tentar enviar fora dela volta como
erro da Meta e mancha a qualidade do número.

**Mandar mensagem pronta pausa o bot naquele contato** — é atendimento humano,
igual a responder à mão (`aoAtendenteResponder`).

**Permissão:** é a tela `whatsapp`. As rotas `/api/whatsapp/respostas/` passam
pelo portão normal (`GET` exige "só ver", `POST` exige "ver e editar") e a chave
`respostasRapidas` está em `CHAVES_POR_TELA` — sem a tela, o `/api/state`
devolve o catálogo como estava.

**Testado por:** suíte `respostas` (janela de 24h no banco, catálogo, permissão,
anexo, prévia) e `respostas-ui` (fileira com a janela fechada, lista do `/`,
cadastro com HTML no título, celular).

### 5.4 Mídia que chega do contato

Foto, áudio, vídeo, documento e figurinha que a pessoa manda.

**A URL da Meta expira em minutos.** Por isso o arquivo é baixado quando a
mensagem chega (em segundo plano, para não atrasar a resposta ao webhook, que
a Meta exige rápida) e guardado em `DATA_DIR/wa-midia`.

| O que | Onde | Motivo |
|---|---|---|
| O arquivo | `DATA_DIR/wa-midia/wa_*` | **fora** de `/uploads/`, que é público (regra 7): foto e documento do candidato saíam por link adivinhável |
| O endereço na mensagem | `whatsapp_messages.media_url` | gravado por `messages.gravarMidia`, que usa o helper `run` — é ele que **salva o banco em disco** |
| A ficha do arquivo | tabela `whatsapp_media` | via `media.registrar`, pelo mesmo helper |
| Quem entrega | `GET /api/whatsapp/midia/<arquivo>` | exige sessão e a tela `whatsapp`; o tipo sai do **conteúdo** do arquivo |

**Tentativas.** Três tentativas com intervalo crescente, porque a falha quase
sempre é passageira (rede, 429 da Meta). O que **não** se tenta de novo é mídia
que a Meta já apagou (ela guarda por cerca de 30 dias): nesse caso a mensagem
fica marcada (`media_falhou`) e a tela mostra **"mídia não disponível"** com um
botão de tentar de novo — antes isso ficava em "(baixando...)" para sempre.
Ao abrir uma conversa, a tela pede ao servidor para tentar o que ficou
pendente (`POST /api/whatsapp/conversations/<id>/midia-pendente`, no máximo 10
por vez, uma atrás da outra para não tomar limite da Meta).

**Áudio de voz.** Chega como `audio/ogg; codecs=opus`. A tabela de extensões
comparava a string inteira e devolvia nada: o arquivo virava `.bin`, era
servido como `application/octet-stream` e o player não tocava. Agora o
parâmetro é descartado antes da comparação. Onde o navegador não toca OGG/Opus
(Safari/iPhone), a tela troca o player por um **botão de baixar**.

**Compatibilidade:** a mídia antiga, que ficou na pasta pública, continua
aparecendo — a rota nova procura lá também. Nada foi movido nem apagado.

**Testado por:** suíte `midia`.

---

## 6. Fluxo Financeiro em detalhe

Fluxo da "ficha" de pagamento, com 4 etapas fixas:

```
rascunho (DP monta)
  → aguardando_coordenacao (Supervisão DP)
  → aguardando_gestao (Gestão)
  → aguardando_financeiro (Financeiro paga)
  → pago (falta anexar comprovante)
  → finalizado
```

Mais `reprovado` e `cancelado`. **Quem** responde por cada etapa é configurável
pelo administrador em `state.ffWorkflow` — não está fixo no código.

### Como a ficha nasce

O DP sobe um ou mais **PDFs** da folha (sistema "Exata"). O sistema lê o PDF por
dois caminhos e usa o melhor resultado:

1. **Leitura por coluna** (preferida) — o PDF informa a posição horizontal de
   cada pedaço de texto. O sistema acha a linha de cabeçalho ("Nome do
   funcionário", "C.P.F.", "Valor líquido"), anota o X de cada coluna e encaixa
   cada pedaço na coluna certa. Imune a sobrenome com espaço ou acento.
2. **Leitura por texto corrido** (antiga, fallback) — junta a linha e adivinha
   por regex onde termina o nome e começa o CPF.
3. **OCR** (`Tesseract.js`) — só quando o PDF é imagem (escaneado ou print).
   Gera as posições e volta para o caminho 1.

Modelos reconhecidos: relação de pagamento comum e **Pensão Alimentícia** (tem
coluna "Nome do pensionista" e às vezes **não traz CPF** — por isso, nesse
modelo, quem valida a linha é o nome, não o CPF).

### Conferência

Cada linha lida vira um registro com `status` `'ok'` ou `'conferir'`. O sistema
soma as linhas e **compara com o Sub-Total / Total Geral impresso no PDF** —
divergência aparece em vermelho. Hoje é **aviso, não bloqueio**: dá para enviar
para aprovação mesmo com divergência.

---

## 7. Diária (Presença RT) em detalhe

Módulo de trabalho avulso de campo. O trabalhador usa **o próprio celular**,
pelo link público `diaria-trabalhador.html`.

**Cadastro em 3 passos:** dados pessoais (com validação do dígito do CPF) →
endereço (CEP preenchido pelo ViaCEP, sempre editável; se a API falhar, digita à
mão) → Pix + 3 documentos (RG frente, RG verso, comprovante). As fotos são
reduzidas no próprio navegador antes de subir (celular no 4G).

**Login:** nome completo = usuário, telefone = senha. O nome é normalizado
(minúsculo, sem acento, espaços colapsados) e o telefone também (remove o `+55`
quando a pessoa cola do WhatsApp). Limite de 5 tentativas erradas por IP a cada
10 minutos. Token fica no `localStorage`, com lista de tokens (vários aparelhos).

**Status do trabalhador:** `pendente_aprovacao` → `ativo` / `recusado` /
`bloqueado`. O admin vê a ficha completa com os 3 documentos ampliáveis, pode
corrigir dados, trocar um documento (imagem ou PDF), imprimir ou baixar tudo,
aprovar, recusar com motivo, bloquear ou excluir de vez.

**Presença:** o admin abre a diária do dia → aparece "Confirmar presença" no
painel do trabalhador → ele clica → entra na lista do admin como "aguardando" →
o admin confere quem está mesmo no local e confirma um a um (ou todos) → copia
um relatório em texto para mandar ao supervisor. Há também um botão para
**pausar cadastros novos** quando a diária lota.

### Segurança dos documentos — regra crítica

Os documentos (RG, comprovante) ficam em `DIARIA_DOCS_DIR`, **fora** de
`UPLOADS_DIR`. Isso é de propósito: tudo dentro de `/uploads/` é servido **sem
login nenhum**. Documento pessoal só sai pela rota de admin autenticada
`/api/diaria/admin/arquivo/...`, que valida a sessão e confere que o caminho
montado continua dentro da pasta de documentos.
**Nunca mova documento de pessoa para `/uploads/`.**

---

## 8. Regras inegociáveis

1. **Não sugerir** framework, banco de dados, build, TypeScript ou reescrita.
   É Node puro + JSON + JS puro no navegador, por decisão.
2. **Toda escrita de estado no servidor passa por `comTrava`.** Sem exceção.
3. **Todo save do cliente declara o que mudou** (`upsertIds` / `deleteIds` /
   `setKeys`). Save sem opções substitui tudo e causa perda de dado quando há
   duas pessoas trabalhando ao mesmo tempo.
4. **Nunca montar caminho de arquivo com dado da requisição** sem `path.basename`
   **e** conferir que o caminho final continua dentro da pasta esperada. Já
   houve falha assim: dava para ler o `state.json` (senhas de todos) e o
   `sessions.json` (sessões ativas).
5. **Documento pessoal nunca em pasta pública.**
6. **ID de registro não pode ser só `Date.now()`** — duas pessoas no mesmo
   milissegundo geravam o mesmo id e uma sobrescrevia os documentos da outra.
   Use timestamp + sufixo aleatório.
7. **`/uploads/` é público.** Qualquer coisa colocada lá é acessível por quem
   tiver o link.
8. **Volume persistente no Coolify** precisa estar montado na pasta de dados.
   Sem isso, cadastro e documento somem no próximo deploy.
9. **Cache-busting**: ao mexer em `js/app.js` ou `css/*.css`, suba o `?v=` no
   `index.html`, senão o navegador serve a versão velha.
10. **Dinheiro em formato brasileiro** (`1.234,56`). Cuidado ao converter: já
    houve caso de valor ficar 100x maior.
11. **Nunca decodificar endereço direto.** Use `decodeSeguro()` /
    `queryParaMapa()`. `decodeURIComponent` lança com um `%` solto, e isso
    ficava na primeira linha do handler: `GET /%` derrubava o processo inteiro,
    sem login, e todo mundo caía junto.
12. **Permissão se confere no SERVIDOR.** Esconder a aba do menu não protege
    nada. Rota nova que pertence a uma tela entra em `ROTAS_POR_TELA`; chave
    nova do estado entra em `CHAVES_POR_TELA` (`js/telas.js`).
13. **Ler corpo de requisição só com `Buffer.concat`.** Concatenar `Buffer` em
    texto parte caractere acentuado na fronteira dos pedaços, e o `JSON.parse`
    aceita o resultado corrompido sem erro.
14. **Toda rota deve responder.** Falha dentro do `comTrava` sem responder
    pendura o `fetch` do navegador para sempre e mata a sincronização daquela
    aba, em silêncio. Por isso o `comTrava` recebe o `res`.
15. **Texto escrito pela pessoa, na exibição: `escapeHTML` + classe
    `texto-longo`.** Os dois juntos, sempre. O `escapeHTML` evita a injeção;
    a classe (`white-space: pre-wrap`) preserva as quebras de linha. Sem a
    classe, o HTML junta quebra e espaço num espaço só e o texto colado
    aparece todo emendado — foi o que acontecia com o descritivo da vaga. Sem
    o `escapeHTML`, um descritivo com `<img onerror=...>` executava.
    Para campo de ENTRADA (`textarea`) não precisa de nada: ele já preserva.
16. **Arquivo `.cjs` novo que o servidor exige TEM que entrar no `COPY` do
    Dockerfile.** Ele lista os arquivos **um por um**; não copia a raiz
    inteira. Arquivo esquecido não existe na imagem, o `require` falha e o
    módulo morre **só em produção** — localmente tudo passa, porque o arquivo
    está lá. Já aconteceu: o `whatsapp-bot.cjs` ficou fora do `COPY` e
    derrubou o canal inteiro do WhatsApp.
    A suíte `imagem` confere isso sozinha. Rode os testes antes de subir.
17. **Peça opcional carrega no `try` dela, sozinha.** Juntar um extra no mesmo
    `try/catch` das peças essenciais faz a falha do extra desligar o
    essencial. Foi assim que um arquivo faltando virou "WhatsApp
    inicializando" e aba Conexões vazia: o bot é um extra, mas estava no mesmo
    `try` do banco, da API e do webhook.
18. **Teste de tela espera CONDIÇÃO, nunca tempo fixo.** Na execução completa
    a máquina está ocupada e um `espera(3000)` não basta: duas suítes falharam
    por carga e passavam sozinhas. Suíte que falha por carga é pior que suíte
    que não existe, porque ensina a ignorar a falha. Use o `esperarPor` que já
    existe nas suítes.

---

## 9. Armadilhas conhecidas (já morderam em produção)

Todas as linhas abaixo **já foram corrigidas**. Ficam registradas porque são o
tipo de erro que volta: se você mexer na área, confira que não reintroduziu.

| Sintoma | Causa |
|---|---|
| Registro apagado volta sozinho | Exclusão sem `deleteIds` com cliente atrasado |
| Configuração volta ao valor anterior | Mudança sem `setKeys` com cliente atrasado |
| Aprovação de outra pessoa é desfeita | Save sem `upsertIds` sobrescrevendo cópia velha |
| "Pessoa fantasma" na ficha | Cabeçalho da tabela, repetido em cada página do PDF, entrando como se fosse gente |
| Valor 100x maior | `1.500.00` (padrão americano) lido como `150000` |
| Sistema inteiro cai | `decodeURIComponent` com `%` solto, sem try/catch, na primeira linha do handler |
| Lista cresce sem parar | Mesclar lista sem `id` duplica o conteúdo a cada save (já chegou a 78 MB) |
| Nome truncado entra sem conferência | Leitor por coluna aceitando nome curto como `'ok'` |
| Senha da fila volta para "aguardando" | `fila` tem merge próprio e só aceita senha nova; alterar exige `setKeys` |
| Acento vira `?` depois de salvar | `data += chunk` partia caractere de 2 bytes na fronteira dos pedaços |
| Cadastro sumia sem avisar | `.find()` de vaga usado sem conferir, estourando no meio do submit |
| Ação não aparece na Auditoria | Save com `somenteAlvos` deixando a lista `logs` de fora |
| Acesso a empresa sigilosa volta | Lista de logins sem `id`: o merge só acrescenta, remoção exige `setKeys` |
| Excluído na Diária reaparece sem documento | Rota grava direto no estado; a aba seguia com a cópia velha e o merge a empurrava de volta |
| Duas ações no mesmo milissegundo, uma desaparece | `id` só com `Date.now()` (regra 6) |
| Primeiro item de uma lista apaga o do colega | Lista vazia classificada como configuração, subindo como `setKeys` |
| Faixa branca e contatos escondidos no WhatsApp | `flex: 1` herdado da barra horizontal valendo na altura dentro da coluna |
| Requisição que nunca termina e aba para de sincronizar | Falha dentro do `comTrava` sem responder |
| Qualquer logado virava administrador | `POST /api/state` aceitava `departamento`/`permissoes`/`senha` do cliente |
| Hash da senha de todos no payload | O filtro removia só `senhaVisivel`, não `senha` |
| Arquivo anônimo hospedado no domínio | `/api/upload` sem checagem e `/uploads/` servindo `.html` como página |
| WhatsApp preso em "inicializando" e Conexões vazia | Arquivo `.cjs` novo fora do `COPY` do Dockerfile: o `require` falha e, por estar no mesmo `try` dos módulos essenciais, desliga o canal todo. **Nada havia sumido** |
| Suíte de tela falhando só na execução completa | Espera por tempo fixo em vez de por condição, com a máquina ocupada |
| Tela nova aparecendo sempre vazia | Ler o estado por `window.state`: o `state` é declarado com `let` no `js/app.js`, e `let` **não** cria propriedade no `window` — leia pelo nome (`typeof state !== 'undefined'`) |
| Aba que não aparece, ou que diz "sem permissão" para quem tem | Mesmo caso com `window.loggedUser`: também é `let` no `js/app.js`. A aba Bot ficava invisível e o salvar recusava calado |
| Foto recebida "desaparece" depois de um deploy | Gravar o endereço do arquivo com `getDb().prepare(...).run(...)`: muda só a memória. Toda escrita no SQLite do WhatsApp tem que passar pelo helper `run` do módulo, que salva em disco |
| Áudio de voz que não toca | Tipo da Meta vem com parâmetro (`audio/ogg; codecs=opus`); comparar a string inteira com a tabela dava `.bin` e `octet-stream` |
| Mensagem velha passando na frente da nova | `ORDER BY` numa data gravada como texto: `"...T10:00"` é maior que `"... 23:00"` (o `T` vem depois do espaço). Ordene por `julianday(...)` |

---

## 10. Onde está cada coisa

```
server.cjs                   backend inteiro (rotas, auth, estado, backup)
whatsapp-api.cjs             cliente da API oficial da Meta
whatsapp-webhook.cjs         recebimento de mensagens
whatsapp-db.cjs              SQLite (sql.js) do módulo WhatsApp
equipamentos-protecao.cjs    redes de segurança do módulo de equipamentos
index.html                   painel admin (as 25 abas)
js/app.js                    frontend inteiro do painel
js/vps-sync.js               sincronização com o servidor (window.RTCloud)
js/telas.js                  permissão por tela — MESMO arquivo nas duas pontas
whatsapp-bot.cjs             motor do bot (ordem de decisão, fila, envio)
js/whatsapp-bot-ui.js        a aba Bot
js/whatsapp-respostas-ui.js  mensagens prontas (fileira na conversa + cadastro)
DATA_DIR/wa-midia/          midia que CHEGA do contato (fora da pasta publica)
js/security.js               camadas extras de proteção no navegador
js/data.js                   dados iniciais (NUNCA colocar senha aqui)
css/                         estilos (style, design-system, por módulo)
*.html (raiz)                páginas públicas
docs/                        deploy no Coolify, WhatsApp, equipamentos
```

### Variáveis de ambiente

`PORT`, `DATA_DIR`, `ADMIN_SENHA`, `APP_URL`, `NODE_ENV`,
`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`.

---

## 11. O que já foi feito e o que falta

### Já resolvido (outubro de 2026)

- Queda do processo por endereço mal formado, sem login (21 pontos).
- Escalada de privilégio pelo `POST /api/state` e vazamento do hash das senhas.
- Upload anônimo e HTML servido como página no próprio domínio.
- Falha dentro do `comTrava` que pendurava a requisição para sempre.
- Oito casos de dado que não gravava ou voltava sozinho (Fila, acento,
  candidato, equipamento, sigilo, Diária, ids, lista vazia).
- Layout do WhatsApp no computador (busca roubando metade da lista).
- Permissão por tela com bloqueio no servidor (seção 4.1).
- Bot de atendimento no WhatsApp oficial, nascendo desligado (seção 5.2).
- Mensagens prontas na conversa, com janela de 24 horas respeitada (seção 5.3).
- Mídia recebida: download que persiste, tipo certo no áudio de voz e rota
  com sessão em vez da pasta pública (seção 5.4).
- Testes automatizados **no repositório**: `node testes/rodar.cjs` sobe um
  servidor isolado numa porta livre (com pasta de dados descartável) por suíte,
  e um Chrome sem janela nas suítes de tela. Hoje são 21 suítes, cobrindo
  sincronização com duas sessões, segurança, permissão por tela, upload por
  conteúdo, bot, mensagens prontas e varredura das 25 abas no navegador.
  `node testes/rodar.cjs --lista` mostra todas; `node testes/rodar.cjs <nome>`
  roda uma.

### O que falta

Sugestões que **cabem** na arquitetura atual:

1. **Rodar as suítes no deploy.** Elas já estão no repositório
   (`node testes/rodar.cjs`), mas ninguém as roda automaticamente: hoje depende
   de quem está mexendo lembrar.
2. **Divergência de total no Fluxo Financeiro** hoje é só aviso. Avaliar
   bloquear o envio para aprovação quando a diferença passar de um limite.
3. **Exclusão some da tela antes do servidor confirmar** em algumas telas.
   Confirmar primeiro, remover depois.
4. **`js/app.js` tem ~19.300 linhas num arquivo só.** Dá para separar por módulo
   em vários `<script>` sem introduzir build.
5. **Filtro por REGISTRO, não só por chave.** A permissão por tela hoje é por
   chave do estado: quem tem a tela Seleção recebe `candidatos` inteiro. Para
   limitar por registro (só os do próprio recrutador, por exemplo) o molde já
   existe em `_fichaEhSigilosa`.
6. **Nega por padrão em `/api/*`.** Hoje rota que não está em `ROTAS_POR_TELA`
   passa pela cadeia normal. Inverter é mais seguro, mas quebra qualquer rota
   esquecida — melhor ligar depois, com a lista estabilizada.
7. **Índice por id**: várias telas fazem `.find()` em lista grande dentro de
   laço. Com muitos registros isso fica lento.
8. **No celular, a caixa do WhatsApp passa da borda** e a página rola para
   alcançá-la. É anterior às correções de outubro e vem da regra própria de
   celular (`calc(100dvh - 165px)` com muito cabeçalho acima).
6. **Sem limite de tamanho do `state.json`.** Conforme cresce, cada save manda o
   arquivo inteiro. Vale medir e, se preciso, separar listas históricas
   (ex.: presenças antigas) em arquivo por mês.
