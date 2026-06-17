# Relatório de Importação — Catálogo de Funções do Exata

Data: 2026-06-17

## Fonte
- Bruto: `data/exata-job-functions-raw.txt` (lista oficial enviada: Código / Descrição / CBO / Área).
- Gerados (versionados):
  - `data/exata-job-functions.json` — array de `{ code, description, cbo, area, isActive }`.
  - `js/exata-catalogo.js` — `window.EXATA_FUNCOES = [...]` (carregado no `index.html` antes do `app.js`).

## Validação executada
| Verificação | Resultado |
|---|---|
| Total de funções importadas | **337** |
| Códigos duplicados | **0** |
| Registros incompletos (faltando campo) | **0** |
| Tamanho do código | **100% com 4 caracteres** |
| Tamanho do CBO | **100% com 6 caracteres** |
| Zeros à esquerda preservados | ✅ (ex.: código `0001`; CBO `010105`) — armazenados como **texto** |
| Áreas (preservadas exatamente) | A=119, D=113, I=83, T=15, S=5, O=1, M=1 |

## Regras aplicadas
- `code` e `cbo` armazenados como **string** — nunca convertidos para número (não perdem zeros).
- `description` mantém a grafia oficial do catálogo (é o valor exportado).
- `area` preserva a sigla exata recebida.
- Importação **idempotente**: o arquivo é a fonte única; reexecutar não duplica (substitui o conteúdo gerado a partir do `.txt`). Para atualizar: editar o `.txt` e regerar.
- Nenhum registro antigo foi apagado (não havia catálogo anterior no projeto).

## Observações / divergências
- Descrições repetidas existem (ex.: "MOTORISTA" em códigos diferentes, "PEDREIRO B" em 0036 e 0040) — **isso é esperado**: o que precisa ser único é o **código**, e está (0 duplicados).
- O catálogo é **somente leitura** no app (fonte versionada). Edição/curadoria deve ser feita no `.txt` + regeração, com este relatório atualizado.
