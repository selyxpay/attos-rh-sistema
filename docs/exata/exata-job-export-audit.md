# Auditoria — Integração de Vagas com a Exportação Exata

Data: 2026-06-17 · Responsável: equipe técnica (Claude)
Escopo: estado atual da integração Vaga ↔ Exata antes de qualquer alteração estrutural.

## 0. Realidade da arquitetura (IMPORTANTE)
Este projeto **não é** um sistema com backend/SQL/migrations/Docker. É um app **client-side** (HTML + CSS + JS) que roda no navegador, hospedado no **Netlify**, com dados na nuvem via **Firebase Firestore** (camada `window.RTCloud` em `js/firebase-sync.js`). Todo o "estado" fica num único objeto `state` sincronizado.

Consequências para esta solicitação (que usa termos de backend):
- "Tabela `ExataJobFunction`" → estrutura JS + **arquivo JSON versionado** + cópia em `state` (Firebase). Não há banco relacional.
- "Seed / migration" → **carga idempotente** do JSON para `state.catalogoFuncoesExata` (cria se não existe; não duplica; registra divergências).
- "Backend valida pelo id / não confiar no frontend" → a validação ocorre **no cliente** contra o catálogo em memória. **Validação 100% server-side não é possível** sem Firestore Rules/Cloud Functions (limitação a registrar; pode ser endurecimento futuro).
- "API de consulta" → funções de busca em memória.
- Sem `force reset`, sem apagar dados: nada disso se aplica a SQL aqui; preservar `state` e o histórico do git.

## 1. Onde está a exportação Exata hoje
- Função: `exportarExata(candidatoId)` em **`js/app.js`** (~linha 4840). Botão **"EXPORTAR EXATA"** (`#btn-dp-exportar-exata`) no painel do DP, dentro do drawer da ficha (`#modal-candidato-detalhes`).
- Helpers: `EXATA_HEADER` (array de 90 colunas), `mapearExata(cand, vs)` (monta os 90 valores), `sanitizarExata`, `formatarDataExata`, `formatarNumeroExata`, `validarExata` (atualmente exige só Nome + CPF).

## 2. O que ela faz
- Gera **1 arquivo `.txt` por CANDIDATO** (registro de **admissão**), não por vaga.
- Formato confirmado e em uso: **separador `;`**, **1 linha de cabeçalho + 1 linha de dados**, **exatamente 90 campos**, **CRLF** (`\r\n`), **BOM UTF-8**. Nome do arquivo: `EXATA_NOME_CPF.txt`.
- Campos vindos da vaga (via `cand.dadosVagaSnapshot`): `funcao` (recebe **funcaoCodigo**), `funcao_cbo` (recebe **cbo**), `vinculo`, `tipo_contrato`, `salario`, `id_empresa_exata`, etc.
- `data_admissao` agora é preenchida pelo DP (campo `#det-data-admissao`, auto-hoje editável).

## 3. Onde a "função" da vaga é cadastrada hoje (e por que está incompleto)
- Tela **"Criar Nova Vaga"** (`#modal-nova-vaga`, `index.html`), seção 4.4. Campos **texto livre**:
  - `vaga-add-funcao-nome` (default "Assistente de Operações")
  - `vaga-add-funcao-codigo` (default "1189")
  - `vaga-add-cbo` (vazio)
  - `vaga-add-vinculo` (texto, ex. "CLT") · `vaga-add-tipo-contrato` (texto)
- Salvos no objeto vaga em `js/app.js` (handler `form-nova-vaga`): `funcaoNome`, `funcaoCodigo`, `cbo`, `vinculo`, `tipoContrato`, `idEmpresaExata`, `categoria`, `categoriaCodigo`.
- **Por que está incorreto/incompleto para o Exata:**
  1. **Não existe catálogo** de funções (código/descrição/CBO/área). Nenhuma referência a `ExataJobFunction`, lista de CBO ou `784205` no projeto.
  2. Campos são **digitação livre** → permitem combinações inválidas (código de uma função + CBO de outra) e **perda de zeros à esquerda** (ex.: "0002" digitado como "2").
  3. **Não há "Área"** nem **"Filial"** na vaga.
  4. **Vínculo é texto livre**, sem os códigos oficiais (Efetivo 101 / Temporário 106 / Intermitente 111).
  5. Não há busca por código/descrição/CBO, nem autopreenchimento vinculado, nem snapshot dedicado da função.

## 4. Dados utilizados / dependências (não quebrar)
- `mapearExata` lê `cand.dadosVagaSnapshot.funcaoCodigo` e `.cbo`. Qualquer mudança deve **preencher esses campos** a partir do catálogo, mantendo o snapshot.
- O snapshot da vaga é gravado em `aplicarSnapshotVaga(cand, vagaId)` ao escolher a vaga na Seleção. Precisará incluir os novos campos (`exataJobFunctionId` + snapshots de código/descrição/CBO/área/vínculo/filial).
- Vagas e candidatos **já cadastrados** não têm esses campos → tratar como "incompleto, revisar antes de exportar" (não preencher silenciosamente).
- O painel de Vagas (`renderVagasGrid`) e a Seleção (`det-select-vaga`) consomem a vaga; adições são compatíveis (campos novos opcionais).

## 5. Preservação de dados já cadastrados
- Nada será apagado. Campos novos são **aditivos** (migração com default), como nas entregas anteriores.
- A função texto-livre atual (`funcaoNome/funcaoCodigo/cbo`) é **mantida** como legado; o novo fluxo por catálogo passa a ser a fonte oficial, com fallback de revisão para vagas antigas.

## 6. BLOQUEIOS — o que falta para concluir (sem inventar)
Conforme o item 2 da solicitação ("se o layout oficial não estiver disponível, não invente; informe qual documento é necessário"):

1. **Catálogo completo de funções NÃO foi anexado.** A solicitação diz "o catálogo completo que estou enviando", mas só veio **1 exemplo** (`0002 / AUX. DE PRODUCAO / 784205 / D`). Preciso da **lista completa** (Código, Descrição, CBO, Área) — em CSV ou JSON — para criar `data/exata-job-functions.json` e popular o catálogo.

2. **Layout oficial do TXT de VAGAS não está disponível.** A solicitação fala em "exportar **vagas** selecionadas" e `mapJobToExataRecord(job)`, mas o único layout que temos é o **TXT de admissão do CANDIDATO (90 campos)** — que tem `vinculo`, `funcao`, `funcao_cbo`, mas **não tem** colunas de **Área** nem **Filial**. Preciso confirmar:
   - O catálogo (código/CBO/área/vínculo/filial) **alimenta o TXT de candidato existente** (campos `funcao`/`funcao_cbo`/`vinculo`)? **Ou** existe um **TXT de vagas separado**, com layout próprio (posicional ou `;`), que eu ainda não tenho?
   - **`FUNCAO_CBO`** recebe o quê exatamente: só o CBO, o código da função, ou código+CBO? (a spec proíbe assumir).
   - **Filial**: 1/2, 01/02, 001/002 ou texto?
   - **Vínculo** no TXT: o código 101/106/111 ou texto? (há sobreposição: "106" já era usado como *código de categoria* na vaga).
   - **Área** vai para o TXT? Em qual coluna?

## 7. Recomendação de sequência (após desbloqueio)
1. Criar `data/exata-job-functions.json` (catálogo versionado) + carga idempotente em `state.catalogoFuncoesExata` (+ relatório de importação).
2. Adicionar seção **"Informações para o Exata"** na vaga: busca (código/descrição/CBO) + autopreenchimento vinculado + Vínculo (101/106/111) + Filial.
3. Validação ao salvar a vaga e **tela de conferência** antes de exportar.
4. Mapeamento **isolado** (`EXATA_FIELDS` + `mapJobToExataRecord`/ajuste do `mapearExata`) conforme o layout confirmado no item 6.
5. Documentação (`exata-job-functions.md`, `exata-txt-layout.md`, etc.) e testes (preservação de zeros, vínculo, filial, ordem, encoding).

## 8. Conclusão da auditoria
A base existe (export de candidato 90 campos funcionando), mas **falta o catálogo de funções e a confirmação do layout** para a parte de vagas. Posso começar imediatamente pelo **catálogo + interface + validação** assim que receber a lista completa e a confirmação do item 6 — sem isso, qualquer mapeamento de Área/Filial/FUNCAO_CBO seria adivinhação, o que a própria solicitação proíbe.
