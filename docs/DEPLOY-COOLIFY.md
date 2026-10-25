# Deploy — GitHub → Coolify → VPS

Guia do deploy do ATTOS RH. Arquitetura oficial e única:

```
GitHub (código)  →  Coolify (build/publicação)  →  VPS (dados reais)
```

> **A regra de ouro:** o GitHub tem o **código**. A VPS tem os **dados**.
> Um deploy troca o código e **não pode** encostar nos dados.

---

## ⚠️ PASSO 1 — Antes de qualquer coisa: backup da VPS

Faça isto **antes** de publicar. Entre na VPS por SSH:

```bash
# descubra onde o container guarda os dados (volume do Coolify)
docker volume ls
docker inspect <nome-do-container> | grep -A5 Mounts

# backup completo (registros + fotos + banco do WhatsApp)
tar -czf ~/backup-rt-$(date +%F-%H%M).tar.gz /caminho/do/volume/

# confira que o arquivo tem tamanho de verdade
ls -lh ~/backup-rt-*.tar.gz
```

Guarde esse arquivo **fora da VPS** (baixe para o seu computador).

---

## ⚠️ PASSO 2 — Confirmar o volume persistente (o mais importante)

Se o `/data` **não** for um volume persistente, cada deploy sobe um container
novo e vazio — e os registros de Equipamentos, as fotos e o banco do WhatsApp
somem.

No painel do Coolify, na aplicação:

1. Abra **Storages** (ou *Persistent Storage*).
2. Precisa existir um volume montado em **`/data`**.
3. Se **não existir**, crie antes de publicar:
   - *Name*: `rt-dados`
   - *Destination Path*: `/data`
4. Salve.

Como conferir depois do deploy: veja os **Logs** da aplicação. O sistema
imprime, logo no início:

```
=== DADOS ENCONTRADOS EM /data ===
  versão do estado ..... 57
  Equipamentos ......... 912 registro(s), 875 foto(s)
  Candidatos ........... 340
  ...
```

- Números **iguais aos de antes** → volume certo, tudo bem.
- **Zero em tudo** logo depois de um deploy → **PARE**. Não cadastre nada.
  O volume não está montado. Corrija e restaure o backup.

O sistema também avisa sozinho nesse caso:

```
*** ATENÇÃO: o sistema já foi usado antes (versão 57), mas está SEM registros.
*** Isso costuma significar que o volume persistente NÃO está montado em /data.
```

---

## PASSO 3 — Variáveis de ambiente no Coolify

Em **Environment Variables**, defina:

| Variável | Valor | Obrigatória |
|---|---|---|
| `NODE_ENV` | `production` | Sim — impede que as senhas apareçam no log |
| `DATA_DIR` | `/data` | Sim |
| `PORT` | `80` | Sim |
| `APP_URL` | `https://attosrh.com.br` | Sim |
| `WHATSAPP_VERIFY_TOKEN` | (gerado por você) | Só para o WhatsApp |
| `WHATSAPP_APP_SECRET` | (do Meta Developer) | Só para o WhatsApp |
| `WHATSAPP_CRYPTO_KEY` | (gerado por você) | Recomendado |

Gerar os valores aleatórios (rode no seu computador ou na VPS):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **Nunca** coloque esses valores em arquivo no GitHub. Eles ficam só aqui.
> **Guarde a `WHATSAPP_CRYPTO_KEY`**: se ela mudar, os Access Tokens salvos
> param de ser lidos e será preciso recadastrá-los em *WhatsApp → Conexões*
> (nenhum outro dado é afetado).

---

## PASSO 4 — Publicar

1. Envie o código: `git push`
2. No Coolify, clique em **Deploy** (ou aguarde o deploy automático).
3. Acompanhe os **Logs** do build. O build agora roda `npm ci` — isso é normal
   e leva alguns segundos a mais que antes.

---

## PASSO 5 — Conferir depois do deploy

**No log do Coolify**, confirme que aparecem:

```
[Equip-Proteção] ativa em: /data/equipamentos
=== DADOS ENCONTRADOS EM /data ===   (com os números certos)
[WhatsApp] Banco de dados inicializado: /data/whatsapp.db
[RT] N conta(s) de acesso carregada(s). (As senhas não são exibidas em produção.)
```

**No sistema**, confira na mão:

- [ ] Entrar com sua conta.
- [ ] **Equipamentos**: a lista mostra as pessoas (não só os números).
- [ ] Abrir um registro antigo: as **fotos abrem**.
- [ ] A busca encontra uma pessoa conhecida.
- [ ] Pelo **celular**: abrir Equipamentos, tirar foto e salvar um registro.
- [ ] Vagas, Seleção, DP, Funcionários e Fluxo Financeiro abrem normalmente.

**Conferência dos dados por linha de comando** (dentro do container):

```bash
node restaurar-equipamentos.cjs
```

Se disser `registros que voltariam: 0`, sistema e espelho batem — está tudo certo.

---

## Se algo der errado

**Os registros de Equipamentos sumiram:**

```bash
node restaurar-equipamentos.cjs            # confere (não altera nada)
node restaurar-equipamentos.cjs --aplicar  # restaura, com backup antes
```

Detalhes em [EQUIPAMENTOS-PROTECAO.md](EQUIPAMENTOS-PROTECAO.md).

**O sistema não sobe:** veja os Logs no Coolify. Se falar em módulo do
WhatsApp, o resto do sistema continua funcionando — o WhatsApp é isolado e só
ele fica indisponível (responde 503).

**Voltar para a versão anterior:** no Coolify, em *Deployments*, use o botão de
**Rollback** no deploy anterior. Os dados em `/data` não são afetados.

---

## Depois do primeiro deploy (segurança)

1. **Troque as senhas fracas.** As contas de exemplo (`123`, `clinica123`…)
   estão no código no GitHub. O log do sistema avisa quais logins ainda usam
   essas senhas. Troque em **Funcionários**.
2. **Firebase antigo**: o projeto `vagasrt` não é mais usado, mas as
   credenciais dele ficaram no histórico do Git. Se não usa mais, apague o
   projeto no console do Firebase.

---

## WhatsApp (depois que o sistema estiver no ar)

O módulo já está pronto, mas só funciona de verdade com as credenciais reais da
Meta. Passo a passo completo: [WHATSAPP-DEPLOY.md](WHATSAPP-DEPLOY.md).

Resumo do que depende de você:

1. Criar o App no [Meta for Developers](https://developers.facebook.com/) e
   adicionar o produto **WhatsApp**.
2. Pegar o **App Secret** → variável `WHATSAPP_APP_SECRET`.
3. Cadastrar o **número oficial** e anotar o **Phone Number ID** e o **WABA ID**.
4. Gerar um **Access Token permanente** (System User no Business Manager).
5. No sistema: **WhatsApp → Conexões** → preencher Phone Number ID, WABA ID,
   Access Token e o **funcionário responsável** → *Salvar* → *Testar*.
6. No Meta: **Webhook** → URL `https://attosrh.com.br/webhooks/whatsapp`,
   token de verificação = `WHATSAPP_VERIFY_TOKEN`, e assinar o campo `messages`.

Repita o passo 5 para cada número/funcionário (Carlos → número A, Pedro →
número B…). Cada um só enxerga as conversas do próprio número; o administrador
vê todos.
