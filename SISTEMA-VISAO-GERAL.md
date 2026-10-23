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

### 4.0 Como a senha é guardada (e por que não existe mais "ver senha")

**scrypt com sal, uma vez por pessoa.** O formato gravado no campo `senha` é:

```
scrypt$<N>$<r>$<p>$<sal em hex>$<chave em hex>
```

Guardar os parâmetros junto é o que permite endurecer o custo amanhã sem
invalidar o que já está gravado. Hoje: N=16384, r=8, p=1 — cerca de **60 ms e
16 MB por conferência**, que é lento de propósito: adivinhar senha em massa
deixa de ser viável. A comparação usa `crypto.timingSafeEqual`.

**O que havia antes, e por que era grave:**

| Antes | Problema |
|---|---|
| `senha` = **SHA-256 sem sal** | rápido de calcular e sem sal: senha curta ou numérica se quebra fora do sistema em pouco tempo, e duas pessoas com a mesma senha tinham o mesmo hash |
| `senhaVisivel` = **a senha em texto puro** | o login capturava a senha digitada e **guardava**, para o admin poder consultar. Ou seja: o `state.json` carregava a senha de todo mundo legível, e ele é o arquivo que mais circula (backup, cópia para a máquina de quem programa, 16 MB trafegando) |

Hoje: `senhaVisivel` **não existe mais** — é apagada de toda conta na subida, e
nenhuma rota volta a gravá-la. `/api/ver-senha` continua existindo, responde
`ok:false, motivo:'hash_forte'` e **não mostra senha de ninguém**. Quem precisa
dar acesso usa **Redefinir senha** (senha provisória), e o dono escolhe a
definitiva no primeiro acesso.

**Conferência e migração sozinha** (`senhaConfere`):

1. começa com `scrypt$` → confere com scrypt;
2. 64 caracteres hex → SHA-256 **legado**, aceita;
3. qualquer outra coisa → texto puro **legado**, aceita.

No login, quando a senha estava guardada do jeito antigo, o servidor
**regrava em scrypt** na hora (é o único momento em que ele vê a senha em
texto). A pessoa não percebe nada e continua com a mesma senha.

**A regra da senha nova** (`politicaSenha`, um lugar só): mínimo **8**
caracteres, pelo menos **uma letra** e **um número**, não pode ser igual à
antiga, não pode ser igual ao login, e não pode estar na lista das que já
foram públicas (`HASH_SENHAS_PUBLICAS`). Antes cada rota tinha o seu mínimo
(4, 6, 8) — e a mais frouxa é que valia na prática.

### 4.0.1 Troca obrigatória de senha

Por que existe: em 21/10/2026 saiu uma falha crítica no mundo PHP
(CVE-2026-109618 / CVE-2026-109619). Este sistema é Node e **não usa PHP**,
mas senhas antigas dele já estiveram num repositório público — e o histórico do
Git não se apaga. Então todas foram rotacionadas.

| Peça | Onde | O que faz |
|---|---|---|
| Marcação | `rotacaoDeSenhasNoBoot()` | em **toda** subida, marca `precisaTrocarSenha = true` em quem tem senha guardada do jeito **antigo** e ainda não está marcado. Idempotente por conta: quem já trocou (scrypt) não é marcado de novo, e conta que chegar depois (restauração de backup) é pega na subida seguinte |
| Tranca | `bloqueioDeTrocaDeSenha()` | responde **423** em qualquer `/api/` enquanto a conta estiver marcada. Vem **antes** do portão de telas: quem precisa trocar não usa nem o que teria permissão de usar |
| O que continua livre | `ROTAS_LIVRES_NA_TROCA` | login, logout, `/api/me`, `/api/time`, `/api/saude`, as rotas de troca de senha, as rotas **públicas** (ficha do candidato, diária, relatório por link) e o webhook da Meta. Arquivos da tela (não-`/api/`) passam, senão a tela da troca não carregaria |
| A tela | `js/troca-senha.js` | monta a tela que tranca o sistema. Carregado **antes** do `app.js`: ele envelopa o `fetch` e, ao ver um 423, abre a tela na hora — vale para quem **já estava logado**, sem precisar conferir em cada uma das centenas de chamadas |
| No login | `login.html` | o `/api/login` devolve `trocaObrigatoria` e a mensagem; a tela de troca aparece ali mesmo |
| Troca | `POST /api/trocar-senha-obrigatoria` | **não pede a senha antiga** (a pessoa acabou de provar quem é no login, e metade chegou aqui porque a senha antiga vazou). Grava em scrypt, limpa a marca, registra na Auditoria e **derruba as outras sessões** daquela pessoa |
| Botão do admin | `POST /api/exigir-troca-senha` | marca **todas** as contas de novo, inclusive a de quem clicou. Fica em Funcionários: "Exigir troca de senha de todos" |

Detalhe que vale lembrar: **derrubar as outras sessões** é parte da correção.
Sem isso, quem já estava dentro com a senha vazada continuaria dentro —
trocar a senha não expulsaria ninguém.

**Senha que outra pessoa define é provisória.** Vale para `/api/reset-senha` e
para o cadastro de colaborador pela tela de Funcionários (que chega pelo
`POST /api/state` com o hash feito no navegador): a conta nasce com
`precisaTrocarSenha = true`, o dono escolhe a dele no primeiro acesso, e aí
**ninguém mais conhece a senha dele**.

**Testado por:** suíte `senha` (`testes/senha-forte.cjs`), que sobe o servidor
por conta própria porque parte da prova é o que acontece **na subida** e depois
de **reiniciar**: scrypt com sal, nenhuma senha em texto no `state.json`, a
rotação mirando só o legado, instalação nova não trancando ninguém, 423 em todo
o sistema, a regra da senha nova, as outras sessões caindo, a senha antiga
deixando de valer, o botão do admin, a senha provisória e o limite por IP.

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

#### A tela do bot: passo a passo, e nada grava sozinho

Seis passos numerados, cada um dizendo **completo** ou o que falta:
1. Mensagem de boas-vindas (sequência e prévia lado a lado) · 2. Quando
responder · 3. Link das vagas · 4. Lembrete · 5. Atendente e saída ·
6. Testar no meu número. Os números do bot ficam em cartões no topo e o diário
num bloco recolhível no fim.

**As mudanças ficam num rascunho** e só valem depois de **Salvar alterações**
(com confirmação). Antes, cada campo gravava sozinho: trocar uma palavra já
valia para quem estivesse escrevendo para o número naquele segundo.

**Ligar e desligar pedem confirmação**, com o resumo do que vai valer (modo,
quantos passos, lembrete e horário). Se faltar algo obrigatório, o sistema diz
o que é e não liga. Com o bot no ar, uma faixa verde mostra **desde quando**
(`botWhatsapp.ligadoEm`).

#### Lembrete do bot

O bot responde a sequência e, se o lembrete estiver ligado, **agenda os
lembretes daquele contato** — mesma configuração (horário, data opcional,
lista de lembretes com texto e anexo) e **mesmo motor e mesma fila** da seção
5.6. Nada de texto fixo no código: tudo vem da tela.

- `{horario}` vale **na sequência e no lembrete**, sempre o mesmo horário.
- **Horário vencido não agenda nada**: o bot responde e pronto. Quem chama às
  14h não recebe lembrete da entrevista do meio-dia (nem de amanhã, sem
  ninguém ter combinado isso) — é o `naoVirarODia` do motor.
- Chamar o bot de novo **atualiza** o agendamento, não duplica (a chave única
  da tabela é a mesma).
- No painel **Lembretes agendados** esses eventos aparecem com o selo **Bot**,
  com cancelar e reagendar como os outros.

#### Robozinho na lista de conversas

A lista traz, sem abrir a conversa: 🤖 colorido (bot ativo naquele contato),
apagado (pausado) ou bem apagado (a pessoa pediu para sair), com a dica
"Atendido pelo bot às HH:MM"; e 🔔 quando há lembrete agendado. Um filtro
**Bot** fica ao lado de Todas / Não lidas / Aguardando atendente. Os sinais
entram na **assinatura** do item, então a lista continua atualizando em diff,
sem piscar. As quatro informações saem de subconsultas na própria consulta da
lista — o custo fica no tamanho da página, não do banco.

**Testado por:** suíte `bot-lembrete` (bot agenda, horário vencido não agenda,
não duplica, selo do painel, sinais da lista e filtro) e pela suíte
`respostas-ui` (passos na tela, rascunho que só vale ao salvar, confirmação de
ligar/desligar, robozinho e sininho).

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

### 5.5 Por que dava "Bad Gateway" (502), e a tela estável

**A causa.** `lerEstado()` lia e interpretava o `state.json` **inteiro, de
forma síncrona, a cada chamada** — e o portão de permissão chama duas vezes por
requisição da API (`permitirRota` e `waUsuarioTemPermissao`). Com o arquivo em
16 MB, cada chamada custava ~100-300 ms de CPU travada e dezenas de MB de lixo
para o coletor. Três pessoas atendendo, com a tela consultando a cada poucos
segundos, bastavam para o Node parar de responder: o proxy devolvia **502** e o
healthcheck derrubava o container.

**O que mudou no servidor:**

| Mudança | Efeito |
|---|---|
| `lerEstado()` guarda o conteúdo na memória e só relê quando o ARQUIVO muda (data + tamanho) | o custo por requisição vai de centenas de milissegundos para ~zero |
| `lerEstadoParaGravar()` para quem vai ALTERAR | o objeto na memória é compartilhado; quem muda precisa de cópia própria |
| `usuarioDaReq` / `waUsuarioTemPermissao` devolvem **cópia** do funcionário | nenhuma rota altera o cadastro sem querer |
| `filtrarSenhaVisivel` não altera mais o que recebe | antes apagava a senha da cópia compartilhada |
| Varredura de mídia responde `202` e baixa em segundo plano | nenhuma requisição fica presa esperando download |
| No máximo **2 downloads de mídia** ao mesmo tempo, 25 s cada | rajada de fotos não rouba a vez do envio de mensagem |
| Tarefas de subida (carga inicial, migração, resumo) saem do caminho da primeira resposta | o healthcheck (5 s) não falha na subida |
| Índices compostos novos em `whatsapp_messages` | a janela de 24 h e a busca incremental não varrem a tabela |

**O `/api/saude` agora mostra de fora:** `subiu_em`, `uptime_s`, `rss_mb`,
`heap_mb`, `lag_ms` (atraso do event loop) e `estado_mb`. Dois `uptime_s`
baixos em consultas seguidas significam **reinício**; `lag_ms` alto é event
loop travado, que é o que o proxy enxerga como 502.

**A tela ficou estável como o WhatsApp Web:**

- **Nunca apaga por erro.** 502, rede caída ou resposta em HTML mantêm lista e
  conversa na tela; aparece uma faixa fina "Reconectando…" e a nova tentativa
  espera mais a cada vez (1 s → 30 s). O `JSON.parse` só roda depois de
  conferir o `content-type` — era ele que estourava com a página de erro do
  proxy e virava `Unexpected token "B"`.
- **Atualização incremental.** A conversa busca só o que é novo
  (`?since=<id>`); a rolagem para cima busca as anteriores (`?antes=<id>`). A
  lista é comparada item por item por uma assinatura e só o que mudou é
  redesenhado — a conversa com mensagem nova **sobe movendo o elemento**, sem
  piscar e sem perder a seleção.
- **O que está sendo digitado não se perde:** texto, cursor e foco são
  guardados antes de qualquer redesenho e devolvidos depois.
- **Rolagem do WhatsApp:** no fim, acompanha a mensagem nova; se a pessoa subiu
  para ler, a rolagem não se move e aparece o pino "N mensagens novas ↓".
- **Tempo real primeiro** (SSE), com o polling de 8 s só de reserva, e
  **nenhum "carregando"** depois da primeira carga.

**Testado por:** suíte `estavel`.

### 5.6 Lembretes automáticos das mensagens prontas

O caso de uso: o atendente manda a mensagem pronta com o link da entrevista do
meio-dia para várias pessoas. Perto da hora, o sistema manda sozinho — **só
para quem recebeu aquela mensagem** — o lembrete que o atendente escreveu. E na
hora, outro ("já começou, estou te esperando").

**Onde cada coisa mora, e por quê:**

| O que | Onde | Motivo |
|---|---|---|
| Configuração (horário, textos, anexos) | `state.json`, **dentro** da mensagem pronta | vai pelo mesmo `upsertIds`, a mesma permissão e a mesma Auditoria da mensagem pronta |
| Agendamento (uma linha por contato × lembrete) | SQLite, `whatsapp_lembretes` | muda a toda hora e tem que sobreviver a reinício |
| Motor | `whatsapp-lembretes.cjs` | módulo EXTRA, no `try` dele (regra 17) e no `COPY` do Dockerfile (regra 16) |
| Painel | aba **Lembretes agendados** (`js/whatsapp-lembretes-ui.js`) | acompanhamento e correção de rumo |

**Não duplica.** A chave única é `(contact_id, resposta_id, lembrete_id,
evento_em)`: mandar a mesma mensagem pronta duas vezes para a mesma pessoa no
mesmo evento **atualiza** o agendamento. Mudar o horário daquele envio cancela
o agendamento anterior daquela pessoa antes de criar o novo.

**As regras de envio** (`America/Sao_Paulo`, fixo em -3h — o Brasil não tem mais
horário de verão):

- **Atraso tolerado: 10 minutos.** Servidor fora do ar e o horário passou há
  menos que isso? Manda — a pessoa está indo para a entrevista. Mais que isso,
  marca **perdido** e não manda.
- **Janela de 24 horas fechada:** não manda texto livre. Marca
  **janela_fechada** e mostra no painel. O lugar de entrar um modelo aprovado,
  no futuro, está marcado no código.
- **Quem pediu para sair não recebe** — nem com "enviar agora".
- Ritmo controlado (1,2 s entre envios, 10 por rodada, verificação a cada 20 s)
  e **uma** tentativa extra em caso de falha.
- **O lembrete não pausa o bot** e **não muda o status da conversa**: ele não é
  atendimento humano.
- Se o envio da mensagem pronta falhar, o agendamento é **desfeito**: ninguém
  recebe lembrete de um convite que não chegou.
- Cada envio (e cada falha, com o motivo) vai para a **Auditoria** e para o
  diário do bot.

**Variáveis do lembrete:** `{nome}`, `{saudacao}`, `{horario}` (o horário do
evento) e `{link}` (o primeiro endereço que estiver no texto da própria
mensagem pronta).

**Testado por:** suíte `lembretes` — contas de horário com relógio simulado,
fila na hora certa, nada duplicado, reinício no meio, atraso de 40 min
(perdido) e de 5 min (enviado), janela fechada, pedido de saída, cancelar um,
cancelar o evento e mudar o horário reagendando todos.

### 5.7 Quem mandou cada mensagem

Toda mensagem que SAI guarda em `whatsapp_messages.origem` quem a mandou:
`bot`, `lembrete` ou `atendente` (com o nome em `sender_name`). O balão mostra
isso em letra pequena. **Mensagem antiga fica sem rótulo** — não dá para
adivinhar depois quem foi.

No cabeçalho da conversa, o estado do bot **naquele contato** vem com o motivo
escrito na tela: "o atendente respondeu", "a pessoa pediu atendente", "a pessoa
pediu para sair" ou "o interruptor geral está desligado". Antes o motivo só
existia no `title` (aparecia parando o mouse em cima) e ninguém via. O diário do
bot passou a mostrar o **nome** do contato, o que o bot fez e por quê.

### 5.8 Uma mensagem, uma bolha

A tela desenha a mensagem **na hora de mandar** (a "otimista", para a conversa
responder na velocidade do dedo) e o servidor avisa a **mesma** mensagem pelo
tempo real. Sem amarrar as duas, apareciam **duas bolhas** no painel — para o
contato sempre chegou uma só.

A amarra é o **`cliente_id`**: um id temporário gerado no navegador, enviado no
corpo do envio e devolvido pelo servidor na resposta **e** no aviso do tempo
real. Quem chega com esse id **substitui** a otimista em vez de empilhar.
`wamid` e `id` do banco são a segunda tranca, para os outros caminhos (busca
incremental `?since=`, status da Meta, aviso repetido) não repetirem nada —
e `_waAppendBolha` ainda confere se já existe bolha com aquele id.

Vale para os quatro casos: envio do atendente (pelo avião e pelo envio direto
da mensagem pronta, inclusive **com anexo**), mensagem do **bot** e **lembrete
automático**.

O tratamento do aviso de tempo real virou função com nome
(`_waTratarEvento`), e não um bloco anônimo dentro do `onmessage`: é o que
permite a prova entregar exatamente o mesmo aviso que a Meta provoca em
produção, sem depender de uma conexão aberta.

**Testado por:** suíte `estavel` (seção 6).

### 5.9 Modo fora do expediente

"Saio do trabalho às 18h e ligo o botão." A partir daí, **qualquer pessoa** que
escrever — contato novo ou antigo — recebe o funil que o atendente escreveu, e
os lembretes ficam agendados.

É o **mesmo** motor do bot e dos lembretes, ativado por um interruptor próprio:

| O que | Onde |
|---|---|
| Configuração (funil, lembretes, horário de desligar) | `state.botWhatsapp.foraExpediente` |
| Decisão | `decidir()` do `whatsapp-bot.cjs`, ação `fora_expediente` |
| Agendamento | `whatsapp-lembretes.cjs`, com `resposta_id = 'fora-expediente'` |
| Quem já recebeu | coluna `fora_exp_periodo` em `whatsapp_bot_contatos` |

**As regras:**

- **Prioridade sobre o modo normal**, e funciona mesmo com o bot normal
  desligado (interruptor próprio). O que continua ganhando dele: pedido de
  **saída**, pedido de **atendente** e contato **pausado** à mão.
- **Uma vez por pessoa em cada período ligado.** O período é marcado quando se
  liga (`periodo`); quem escreve de novo não recebe o funil outra vez.
  Desligar e ligar de novo começa um período novo.
- **Horário vencido não agenda** (`naoVirarODia`): o funil vai, o lembrete não.
- **Lembrete que cairia depois de 24 horas** da última mensagem da pessoa não é
  enviado — a Meta não permite texto livre fora da janela. Em vez de falhar na
  hora, já entra no painel como **janela fechada**, com o motivo.
- **Desliga sozinho** no horário escolhido (ex.: amanhã às 08:00). Quem confere
  é o próprio motor, a cada passada da fila — não depende de ninguém abrir a
  tela. Para isso o servidor passa um `gravarConfig` ao bot.
- **Auditoria**: quem ligou, quem desligou e quando. Por isso o interruptor tem
  **rota própria** (`POST /api/whatsapp/bot/fora-expediente`) em vez de ser
  gravado pelo `/api/state`.
- No painel **Lembretes agendados**, esses eventos vêm com o selo **Fora do
  expediente**. Na lista de conversas, uma **lua** marca quem recebeu o funil, e
  há um filtro **Fora do expediente** ao lado do filtro **Bot**.

**Na tela:** um cartão na aba Bot, com interruptor (confirmação + resumo),
faixa "Fora do expediente ligado desde HH:MM", opção de desligar sozinho,
sequência própria (texto, imagem, áudio, PDF, link) com prévia, e lembretes
próprios com atalho **amanhã** na data. O funil e os lembretes seguem a regra
da aba: ficam no rascunho e só valem no **Salvar alterações**; o interruptor,
não — ele vale na hora, com confirmação.

**Testado por:** suíte `fora` (funil para contato novo e antigo, não repetir,
prioridade, saída/atendente/pausado, horário vencido, janela de 24 h,
desligamento automático, lua e filtro) e pela suíte `respostas-ui` (o cartão).

### 5.10 "Janela aberta" e envio em grupo

A Meta só aceita mensagem **escrita à mão** nas 24 horas seguintes à última
mensagem **recebida** (a da pessoa, não a nossa). Fora disso, só modelo
aprovado. Essa aba é a lista de quem **ainda pode receber agora** — e é daí que
sai o envio em grupo, porque a lista já é, por definição, quem pode receber.

**A lista** (`whatsapp-db.cjs`, `janela.lista`) sai de **uma** consulta com
subconsultas por linha: a última mensagem dela, quanto tempo falta, se o bot
atendeu, se recebeu o funil de fora do expediente, quantos lembretes estão
agendados, se está aguardando atendente e **se eu já respondi depois dela**.
Ordena por quem **fecha primeiro**. Filtros: fecha em menos de 2 h, atendidos
pelo bot, fora do expediente, aguardando atendente e sem resposta minha; mais
busca por nome ou número.

Detalhe que custou uma correção: o "já respondi depois" desempata **pelo id**
quando os horários são iguais — `created_at` tem precisão de segundo, e quem
responde na hora cai no mesmo segundo da mensagem recebida.

**A atualização é incremental** (a cada 60 s): compara item por item por uma
assinatura, redesenha só o que mudou e **quem sai da janela desaparece sem a
tela piscar**. A seleção de quem continua é preservada; a de quem saiu é
removida — não dá para mandar para quem já não pode receber.

**O envio em grupo** (`whatsapp-envio-grupo.cjs`, módulo extra no try dele e no
`COPY` do Dockerfile):

| Regra | Como |
|---|---|
| Fila no SQLite | `whatsapp_envios_grupo` + `whatsapp_envio_grupo_itens`, com **UNIQUE (envio_id, contact_id)** — ninguém recebe duas vezes |
| Segundo plano | a rota responde **202** na hora; trinta envios numa requisição seriam trinta segundos e um 502 |
| Ritmo | um por vez, 2 s entre envios, 5 por rodada |
| Retomada | a fila vive no banco: reiniciar não perde nem repete |
| Janela conferida **na hora de cada envio** | entre montar a lista e chegar a vez dela a janela pode fechar: o item é pulado e marcado `janela_fechada` |
| Pedido de saída | pulado e marcado `saida` |
| Conta como mensagem do atendente | **pausa o bot** naquele contato (direto no banco se o módulo do bot não estiver carregado) e entra na conversa com o rótulo **"Envio em grupo"** (`origem = 'grupo'`) |
| Pausar / retomar / cancelar | conferido a cada volta da fila, então vale na hora; cancelar só afeta quem **ainda não recebeu** |
| Lembretes | opção de agendar também os lembretes da mensagem pronta, com o mesmo limite da janela de 24 h |
| Auditoria | quem enviou, quando e para quantos |

O painel do envio mostra enviados, na fila, falhos e pulados, com a lista por
contato e o motivo de cada um.

**Sobre contador de mensagens:** não existe nenhum no sistema — nem contagem
mensal, nem limite de 1.000 grátis, nem aviso de custo, nem bloqueio por
quantidade. O que existe, e **tem** que continuar existindo, é o **controle de
ritmo** (intervalo entre envios, quantos por rodada, no máximo dois downloads
de mídia ao mesmo tempo): ele protege o número de ser limitado pela Meta. A
suíte `janela` confere as duas coisas — que não há cota e que o ritmo continua.

**Testado por:** suíte `janela` (a lista com 24 h, filtros, busca, quem sai da
janela, fila, não duplicar, reinício no meio, janela que fecha no meio da fila,
pedido de saída, pausar/cancelar, rótulo e pausa do bot) e pela suíte
`respostas-ui` (a aba na tela, seleção respeitando o filtro e o painel de
envio).

### 5.11 Quem já recebeu o disparo e quem ainda não

O uso real: faz-se um disparo para quem está com a janela aberta; depois chega
gente nova, e quem já recebeu volta a escrever e abre uma janela nova. Na hora
de disparar de novo é preciso ver **quem falta**, senão a mesma pessoa recebe a
mesma mensagem duas vezes no mesmo dia.

**Nada de controle novo.** Tudo sai da fila que o envio em grupo já grava:
`whatsapp_envio_grupo_itens` com `status = 'enviado'`. A consulta da lista
(`janela.lista`) passou a trazer, por subconsulta em cada linha,
`disparos_recebidos`, `ultimo_disparo_em`, `ultimo_disparo_titulo` e
`ultimo_disparo_id` — com o índice `idx_envio_itens_contato` por
`(contact_id, status)` para isso não pesar.

| O que aparece | De onde vem |
|---|---|
| Selo **"Disparo enviado há 2h · Entrevista 10h dia 23"** (data e hora quando passa de um dia) | `ultimo_disparo_em` + `ultimo_disparo_titulo` |
| **"Nunca recebeu disparo"** | `disparos_recebidos = 0` |
| Dica do mouse com os envios recebidos (nome, data, hora e começo do texto) | `janela.disparosDosContatos(ids)`, **uma** consulta para a página inteira — nunca uma por linha |
| Filtros "Ainda não recebeu disparo" / "Já recebeu disparo" | `disparos_recebidos = 0` / `> 0` |
| Filtro "Não recebeu o último disparo" | o servidor resolve qual é o último (`envioGrupo.ultimoEnvio()`): a regra mora num lugar só, não na tela |
| Seletor "Não recebeu o envio:" | `NOT EXISTS` daquele `envio_id` com status `enviado` |
| Bloco "Últimos envios" + botão **"Mandar para quem ainda não recebeu"** | `envioGrupo.recentes(10)`; o botão aplica o filtro daquele envio, marca todos e abre o painel |

Os filtros novos **combinam** com os antigos e com a busca (são todos `AND` na
mesma consulta), e o "selecionar todos" continua respeitando o que está na
tela. O selo entra na **assinatura** de cada linha, senão a atualização
incremental não perceberia a mudança e o selo ficaria velho na tela.

**Nome do envio.** O painel tem um campo "Nome deste envio" ("Entrevista 10h
dia 23"). Em branco, o servidor dá um nome automático — `Disparo de DD/MM às
HH:MM` no relógio de Brasília, ou o título da mensagem pronta. Nunca fica sem
nome: sem nome o histórico e o selo não diriam nada.

**Proteção contra repetir.** Antes de enviar, a tela chama
`POST /api/whatsapp/envio-grupo/conferir`, que responde quem da seleção **já
recebeu a mesma mensagem nas últimas 24 horas** — a mesma mensagem pronta
(`resposta_id`) ou o mesmo texto livre. Se houver, o painel mostra
"X pessoas já receberam esta mensagem. Pular essas pessoas?" com os nomes; o
botão principal é **pular**, e há a opção "Mandar mesmo assim". O servidor
**não confia na tela**: ele mesmo pula os repetidos, a não ser que o pedido
venha com `repetirMesmo`, e devolve quantos foram `pulados` (que também vai
para a Auditoria). Passadas as 24 horas não é mais repetição — mas o selo do
histórico continua, porque quem recebeu, recebeu.

**Testado por:** suíte `janela`, seção M (o selo com nome e data, a dica do
mouse, "nunca recebeu" excluindo quem recebeu, o filtro por um envio
escolhido, quem escreveu depois do disparo aparecendo como não recebido, a
combinação com os filtros antigos e com a busca, o aviso de repetição por
pronta e por texto livre, e as 24 horas) e suíte `respostas-ui`, seção 9d (o
selo na linha, a dica, o bloco "Últimos envios" com o botão, o seletor, o
campo do nome e o aviso com o botão de pular como padrão).

### 5.12 Áudio gravado na hora (mensagem de voz)

O problema: a Meta só mostra o áudio como **mensagem de voz** se ele chegar em
**OGG/Opus**. O navegador, por outro lado, só grava em **WEBM/Opus** (Chrome e
Edge) ou OGG/Opus (Firefox). Então, sem conversão, gravar pela tela daria
sempre no mesmo aviso que o upload de arquivo já dava: "a Meta exige OGG/Opus".

Por isso a gravação tem um caminho **separado** do upload de arquivo, e os dois
**convivem**: quem já tem um `.ogg` pronto anexa o arquivo como sempre; quem
não tem, grava na hora.

| Peça | Onde | O que faz |
|---|---|---|
| Gravador | `js/audio-gravador.js` | a tela de gravar: pede o microfone, mostra o tempo correndo, Parar, prévia para ouvir, e **Regravar / Descartar / Usar este áudio**. Carregado em três lugares com a MESMA tela |
| Conversor | `audio-voz.cjs` | roda o ffmpeg: OGG/Opus **mono, 48 kHz**, no máximo **2 processos ao mesmo tempo**, fila de 8, corte em 190 s e tempo limite de 60 s |
| Rota | `POST /api/whatsapp/bot/audio-gravado` | recebe o webm, converte, **confere pelo conteúdo** que saiu OGG mesmo, grava na pasta protegida e devolve `{arquivo, mime:'audio/ogg', tipoAnexo:'audio'}` |
| Imagem | `Dockerfile` | `apk add --no-cache ffmpeg` + `audio-voz.cjs` no `COPY` (regra 16) |
| Saúde | `/api/saude` | `audio_voz.ffmpeg` diz se o conversor está lá |

**Nada é salvo antes do "Usar este áudio".** Gravar, ouvir, regravar e desistir
não deixa rastro no servidor: a gravação vive só na memória da aba até a pessoa
confirmar. Só então ela sobe, é convertida e vira arquivo.

**Onde aparece o botão de microfone:**

- **passos do bot** (tipo áudio) — e, pelo mesmo desenho, a sequência do
  **modo fora do expediente**, já que as duas usam a mesma função com um
  prefixo diferente;
- **mensagens prontas** — ali a mensagem tem UM anexo, então o áudio ocupa o
  lugar dele (a tela avisa isso ao lado do botão).

Depois de escolhido, o passo mostra um **player** para ouvir e botões para
**trocar** (outro arquivo ou outra gravação) ou **remover**.

**Se o ffmpeg não estiver na imagem**, nada quebra: a rota responde
`motivo:'sem_ffmpeg'`, a tela explica e manda usar o arquivo, e o upload de
arquivo OGG continua funcionando igual. É a mesma regra dos outros módulos
opcionais (regra 17).

**Áudio nas mensagens prontas exigiu um ajuste nos três caminhos de envio.**
Mensagem pronta, envio em grupo e lembrete decidiam o tipo da Meta cada um por
conta própria, com `ehDoc ? 'document' : 'image'` — ou seja, áudio chegaria
rotulado como imagem e a Meta recusaria. Agora os três chamam
`waApi.tipoMetaDoAnexo()`, num lugar só, e **áudio vai sem legenda** (a Meta
recusa caption em mensagem de voz).

**Testado por:** suíte `audio` (`testes/audio-gravado.cjs`), que sobe o
servidor várias vezes para provar com e sem conversor: a gravação virando OGG
de verdade (conferido pelo conteúdo), o arquivo fora da pasta pública e só com
login, o limite de tamanho, a conversão que falha sem derrubar o servidor, a
saída que não é OGG sendo recusada, **no máximo 2 conversões ao mesmo tempo**
(medido pelo diário de um dublê de ffmpeg), a convivência entre arquivo e
gravação, e o bot mandando como `type: audio` **sem legenda** — tanto na
sequência real quanto no botão "Enviar teste".

Um detalhe do teste que vale saber: o `audio-voz.cjs` aceita `FFMPEG_BIN`
apontando para um `.cjs`, que então roda pelo próprio node. É a costura que
deixa a suíte provar fila, falha e formato errado **sem precisar de ffmpeg
instalado** na máquina de quem programa (no Windows, não há).

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
| 502 "Bad Gateway" de vez em quando | `lerEstado()` lendo e interpretando o `state.json` inteiro, síncrono, em CADA requisição (duas vezes por chamada da API, por causa do portão de permissão) |
| `Unexpected token "B", "Bad Gateway" is not valid JSON` na tela | `JSON.parse` sem conferir o `content-type`: o proxy devolve HTML quando o Node não responde |
| Tela que pisca e apaga o que está sendo digitado | Redesenhar lista e conversa inteiras a cada atualização (e a cada confirmação de entrega da Meta) |
| Requisição que leva dezenas de segundos | Download de mídia dentro da requisição; agora responde 202 e baixa em segundo plano, no máximo 2 por vez |
| Vírgula sozinha no começo da mensagem | `{nome}` vazio no início do texto: "{nome}, já começou" virava ", já começou" |
| Lembrete/agendamento no horário errado | Comparar data do SQLite (UTC, com espaço) com hora de Brasília. Guardar sempre UTC no formato do SQLite e converter só na tela |
| Mudança no bot valendo antes de confirmar | Campo que grava sozinho no `onchange`. A aba Bot agora edita em rascunho e só grava no "Salvar alterações" |
| Lembrete de horário que já passou | Sem data, o cálculo empurrava o evento para amanhã. No bot isso é errado: usa-se `naoVirarODia` e não se agenda nada |
| Mensagem aparecendo duas vezes só no painel | Bolha otimista desenhada no envio + a mesma mensagem chegando pelo tempo real. Amarrar com `cliente_id` e trancar por `wamid`/`id` |
| `no such column` numa coluna que "existe" | `ALTER TABLE` rodando ANTES de o `CREATE TABLE` daquela tabela, no mesmo `criarTabelas`: falha calada no try/catch e só aparece na primeira mensagem de verdade |
| "Já respondi" aparecendo errado | Comparar só o horário: `created_at` tem precisão de SEGUNDO e a resposta imediata cai no mesmo segundo. Desempatar pelo `id` |
| Selo/etiqueta nova que não atualiza na tela | A atualização incremental compara linhas por uma ASSINATURA: campo que não entra nela fica velho na tela até a página recarregar |
| Senha "protegida" que ainda dá para ler | Hash forte não serve para nada se existir um espelho da senha em texto puro ao lado (era o `senhaVisivel`). Procure o campo, não só o algoritmo |
| Troca de senha que não expulsa ninguém | Trocar a senha não invalida sessão: quem estava dentro com a senha vazada continua dentro. Derrube as outras sessões da pessoa junto |
| Rotação de senha que tranca a instalação nova | Marcar "todo mundo" trancaria os testes e qualquer deploy limpo. Mire em QUEM TEM SENHA ANTIGA — instalação nova já nasce em scrypt |
| Áudio que chega como arquivo e não como voz | A Meta só toca como mensagem de voz se for OGG/Opus E for enviado com `type: audio` SEM caption. Navegador nenhum grava OGG direto (menos o Firefox): precisa converter |
| `spawn` com entrada inválida derrubando o servidor | ffmpeg sai antes de ler tudo e o `stdin` estoura EPIPE. Sem `stdin.on('error')`, o processo do Node morre junto |
| `replace()` comendo pedaço do arquivo num script de patch | `$&`, `$'` e `$1` têm significado no texto de substituição. Em patch, use `split(a).join(b)` |
| Âncora de patch que não casa em `js/app.js` | Esse arquivo é **CRLF**; o resto do projeto é LF. Ajuste o fim de linha antes de procurar |
| Regex que "come" letras dentro de um teste de tela | `\s` dentro de um template literal do `cdp.eval` vira `s`: a expressão virou `/s+/g` e o teste apagou os "s" do texto. Dentro do eval, `\\s` |
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
whatsapp-lembretes.cjs       motor dos lembretes automaticos (fila, fuso, regras)
js/whatsapp-lembretes-ui.js  painel "Lembretes agendados"
whatsapp-envio-grupo.cjs     motor do envio em grupo (fila, ritmo, janela)
js/whatsapp-janela-ui.js     aba "Janela aberta" e o painel de envio
js/troca-senha.js            tela que tranca o sistema ate a pessoa trocar a senha
docs/SEGURANCA-VPS-COOLIFY.md  o que conferir na VPS e no Coolify (PHP, portas, variaveis)
audio-voz.cjs                conversao do audio gravado para OGG/Opus (ffmpeg)
js/audio-gravador.js         a tela de gravar audio (bot, fora do expediente, prontas)
docs/VPS-TRAVOU.md           runbook de VPS travada (memoria, disco, Docker, limpeza)
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
- 502 intermitente (state.json relido do zero em cada requisição) e tela que
  piscava/apagava o que estava sendo digitado (seção 5.5).
- Lembretes automáticos das mensagens prontas, com painel e regras de envio
  (seção 5.6), e o rótulo de quem mandou cada mensagem (seção 5.7).
- Aba Bot em passo a passo, com rascunho e confirmação para ligar, lembrete
  do bot na mesma fila e robozinho na lista de conversas (seção 5.2).
- Mensagem que aparecia duas vezes no painel (seção 5.8) e o modo fora do
  expediente (seção 5.9).
- Lista "Janela aberta" e envio em grupo só para quem está dentro das 24 horas
  (seção 5.10), e o selo de quem já recebeu disparo (seção 5.11).
- Senha em scrypt, fim da senha em texto puro e troca obrigatória de todas as
  senhas antigas (seções 4.0 e 4.0.1).
- Testes automatizados **no repositório**: `node testes/rodar.cjs` sobe um
  servidor isolado numa porta livre (com pasta de dados descartável) por suíte,
  e um Chrome sem janela nas suítes de tela. Hoje são 28 suítes, cobrindo
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
