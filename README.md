# R&T VAGAS IA

Sistema interno de recrutamento e serviços da R&T. **Está em produção**, usado
todos os dias por várias pessoas ao mesmo tempo.

Antes de mexer em qualquer coisa, leia o
[SISTEMA-VISAO-GERAL.md](SISTEMA-VISAO-GERAL.md) — principalmente a seção 8,
"Regras inegociáveis". Ele explica a arquitetura (Node puro, sem framework, sem
banco de dados, sem build), como o dado é salvo e quais armadilhas já morderam
em produção.

## Rodar o sistema

```bash
npm install          # uma dependência só: sql.js (SQLite do módulo WhatsApp)
node server.cjs      # sobe em http://localhost:3000
```

Variáveis de ambiente: `PORT`, `DATA_DIR`, `ADMIN_SENHA`, `APP_URL`,
`NODE_ENV`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`.

Para rodar na sua máquina sem encostar em dado real, aponte o `DATA_DIR` para
uma pasta nova:

```bash
PORT=3010 DATA_DIR=/tmp/rt-local ADMIN_SENHA='umaSenhaQualquer' node server.cjs
```

## Testes

Node puro, sem framework e sem dependência nova. Cada suíte roda num servidor
próprio, numa porta livre e com uma pasta de dados nova e descartável — **nenhum
teste encosta no `server-data/` real nem na VPS**.

```bash
node testes/rodar.cjs            # roda todas
node testes/rodar.cjs --lista    # mostra as suítes
node testes/rodar.cjs sync       # roda uma só
```

| Suíte | O que cobre | Precisa do Chrome |
|---|---|---|
| `ff` | Leitura de PDF do Fluxo Financeiro e valor em reais (regra 10) | não |
| `seguranca` | Queda do servidor por URL inválida, escalada de acesso, senha no payload | não |
| `upload` | Tipo do arquivo pelo conteúdo real, SVG barrado, `nosniff` | não |
| `upload-ui` | A foto renderiza no `<img>`; o SVG não | sim |
| `dados` | Fila, acento em texto grande, sigilo, Diária, lista vazia | não |
| `dados-ui` | Fila pela tela, cadastro de candidato, log de equipamento | sim |
| `sync` | Duas pessoas usando o sistema ao mesmo tempo | não |
| `telas` | Permissão por tela, com bloqueio no servidor | não |
| `whatsapp` | Layout do WhatsApp no computador, em 4 resoluções | sim |
| `limpeza` | Corpo de requisição inválido, rota inexistente | não |
| `limpeza-ui` | Link de completar ficha, kanban removido, as 25 abas | sim |
| `abas` | Varredura das 25 abas: erro de console e chamada que falha | sim |

As suítes de tela sobem um Chrome sem janela sozinhas. O executor procura o
navegador nos caminhos usuais; se não achar, **pula** essas suítes em vez de
falhar. Para apontar manualmente:

```bash
CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe" node testes/rodar.cjs
```

O executor devolve código de saída 1 se qualquer suíte falhar, então dá para
usar num gancho de pré-deploy.

### Escrever um teste novo

1. Crie `testes/minha-suite.cjs`. O endereço do servidor chega em
   `process.env.BASE` e a porta do navegador em `process.env.CDP`. **Não use
   porta fixa**: um teste apontado para a porta errada roda contra dado real.
2. Registre a suíte na lista `SUITES` dentro de
   [testes/rodar.cjs](testes/rodar.cjs), dizendo se precisa de servidor e de
   navegador. Se precisar de contas específicas, escreva uma função de semente
   ali do lado das que já existem.
3. Termine com `process.exit(falhas ? 1 : 0)`, senão o executor não sabe se
   passou.

## Deploy

`git push` → Coolify → VPS. O passo a passo, **incluindo o backup antes de
publicar**, está em [docs/DEPLOY-COOLIFY.md](docs/DEPLOY-COOLIFY.md).

Dois pontos que já causaram problema:

- O volume persistente precisa estar montado na pasta de dados. Sem isso,
  cadastro e documento somem no próximo deploy.
- Ao mexer em `js/*.js` ou `css/*.css`, suba o `?v=` no `index.html`, senão o
  navegador continua servindo a versão velha.

## Onde está cada coisa

```
server.cjs                   backend inteiro (rotas, auth, estado, backup)
js/app.js                    frontend inteiro do painel
js/vps-sync.js               sincronização com o servidor (window.RTCloud)
js/telas.js                  permissão por tela — MESMO arquivo nas duas pontas
whatsapp-*.cjs               módulo WhatsApp (API da Meta, webhook, SQLite)
equipamentos-protecao.cjs    redes de segurança dos dados de equipamento
index.html                   painel admin (as 25 abas)
*.html (raiz)                páginas públicas
testes/                      a suíte de testes
docs/                        deploy no Coolify, WhatsApp, equipamentos
```
