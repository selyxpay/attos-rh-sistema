# Relatório Final — Integração Vagas ↔ Exata (catálogo de funções)

Data: 2026-06-17

## Estrutura encontrada
- App **client-side** (HTML/JS) + **Firebase** (Firestore via `RTCloud`) + **Netlify**. Sem backend/SQL/migrations.
- Exportação Exata = **1 TXT por candidato (admissão)**, 90 campos `;`, CRLF, BOM UTF-8, nome `EXATA_NOME_CPF.txt` (`exportarExata` em `js/app.js`).
- Função na vaga era **texto livre** (sem catálogo, sem área/filial, sem vínculo codificado). Detalhes em `docs/exata/exata-job-export-audit.md`.

## Estrutura alterada / criada
- **Catálogo oficial** (337 funções) — fonte versionada `data/exata-job-functions-raw.txt` → `data/exata-job-functions.json` + `js/exata-catalogo.js` (`window.EXATA_FUNCOES`). Carregado no `index.html`.
- **Vaga → seção "Informações para o Exata"**: busca de função por **código / descrição / CBO** (datalist) com **autopreenchimento vinculado** (código, descrição oficial, CBO, área — read-only), **Tipo de vínculo** (Efetivo 101 / Temporário 106 / Intermitente 111) e **Filial** (1/2).
- Campos novos na vaga: `exataJobFunctionId`, `funcaoCodigo` (texto), `cbo` (texto), `funcaoNome`, `exataFuncaoArea`, `vinculo` (=código), `employmentType`, `employmentLabel`, `exataEmploymentCode`, `filial`/`branchCode`. Snapshot do candidato (`aplicarSnapshotVaga`) carrega esses campos.
- **Validação ao salvar a vaga**: exige função válida do catálogo (com CBO), tipo de vínculo e filial — com mensagens específicas.

## Mapeamento (catálogo → TXT de 90 campos)
| Campo TXT | Origem |
|---|---|
| `funcao` (pos. 20) | **código** da função do catálogo (ex.: `0002`) — texto, zeros preservados |
| `funcao_cbo` (pos. 21) | **CBO** da função do catálogo (ex.: `784205`) |
| `vinculo` (pos. 2) | **código** do tipo de vínculo (101 / 106 / 111) |
- **Área** e **Filial** ficam salvas na vaga (uso interno): **não há coluna** para elas nos 90 campos confirmados → não são exportadas.
- `FUNCAO_CBO` = recebe o **CBO** (confirmado por você: cada coluna do cabeçalho recebe o dado correspondente).

## Migrations / banco
- Não aplicável (sem SQL). Campos novos são aditivos; nada foi apagado. Catálogo é arquivo versionado + cópia em runtime.

## Catálogo importado
- **337** funções · **0** duplicados · **0** incompletos · código 4 chars · CBO 6 chars · zeros preservados. (Ver `exata-job-functions-import-report.md`.)

## Vínculo e Filial
- Vínculo: nome na tela, **código oficial** salvo e exportado (101/106/111). Sem código livre.
- Filial: "Filial 1"/"Filial 2" na tela, `branchCode` 1/2 salvo (interno; sem coluna no TXT atual).

## Exemplo de TXT (cabeçalho + 1 candidato, recorte)
```
tipo_contrato;vinculo;id;nome;...;funcao;funcao_cbo;...
;106;cand-123;ANA;...;0002;784205;...
```
(2 linhas, `;`, CRLF, BOM UTF-8, 90 campos exatos; arquivo `EXATA_ANA_11122233344.txt`.)

## Testes executados (automáticos, Node)
- Catálogo: 337 / 0 dup / 0 incompletos / código 4 / CBO 6 / **zeros preservados** ✅
- `getFuncaoExata('0002')` → AUX. DE PRODUCAO / 784205 / D ✅
- Export com função do catálogo: `funcao`=`0002` (zeros), `funcao_cbo`=`784205`, `vinculo`=`106` ✅
- 90 campos, sem null/undefined, sem IDs duplicados, sintaxe/carga OK ✅

## Pendências / limitações
- **Testes de UI** (busca/autofill/validação/edição/pré-visualização no navegador) e contra um **arquivo de exemplo aceito pelo Exata** dependem de você no ambiente real.
- **Pré-visualização do TXT** e **exportação em lote de várias vagas/candidatos** (item 14/15) não foram incluídas nesta etapa — o export atual é por candidato. Posso adicionar a pré-visualização e o lote como próximo passo.
- **Área administrativa do catálogo** (item 18) e edição auditada: catálogo está somente-leitura (fonte no `.txt`); a área admin pode ser adicionada depois.
- Validação **server-side** real (não confiar no navegador) exige Firestore Rules/Functions — limitação do app client-side.

## Confirmações
- Nenhuma função existente removida; vagas/candidatos preservados; export continua separado do "Exportar Pasta" (Word).
