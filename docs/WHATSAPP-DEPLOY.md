# Módulo WhatsApp — Guia de Deploy na VPS (Hostinger)

Guia completo para colocar o módulo WhatsApp Oficial (WhatsApp Cloud API da Meta)
em produção na sua VPS, junto com o sistema ATTOS RH que já roda lá.

> **Resumo da arquitetura**
> Internet → Domínio (HTTPS) → **Nginx** → **Node.js (server.cjs, via PM2)** → banco SQLite do WhatsApp (`DATA_DIR/whatsapp.db`) e Meta Cloud API.
> O webhook da Meta chega em `https://SEU_DOMINIO/webhooks/whatsapp`.
> **O Access Token da Meta fica só no servidor** (no banco), nunca no navegador.

Índice: 1) Dependências · 2) `.env` · 3) Meta Developers · 4) WhatsApp Business ·
5) Número oficial · 6) Webhook · 7) Nginx · 8) SSL · 9) PM2 · 10) Reiniciar ·
11) Atualizar · 12) Backup · 13) Restaurar · 14) Logs · 15) Erros comuns.

---

## 1. Instalar dependências

Pré-requisitos na VPS: **Node.js 18+** e **npm**. Confira:

```bash
node -v      # deve mostrar v18 ou maior
npm -v
```

No diretório do projeto:

```bash
cd /caminho/do/projeto        # ex: /var/www/rt-vagas
npm install                    # instala o sql.js (banco do WhatsApp)
```

Não precisa de compilador C++ nem Python — o `sql.js` é JavaScript puro.

---

## 2. Configurar o `.env`

Copie o exemplo e edite:

```bash
cp .env.example .env
nano .env
```

Preencha:

```
PORT=3000
DATA_DIR=./server-data
APP_URL=https://SEU_DOMINIO

# Gere um token aleatório para o webhook:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
WHATSAPP_VERIFY_TOKEN=coloque_aqui_o_token_gerado
WHATSAPP_APP_SECRET=chave_secreta_do_app_meta
```

- **WHATSAPP_VERIFY_TOKEN**: string aleatória que você escolhe. A MESMA vai no Meta Developer.
- **WHATSAPP_APP_SECRET**: vem do Meta Developer (Configurações do App → Básico → Chave Secreta). Valida a assinatura dos webhooks.
- **WHATSAPP_CRYPTO_KEY** (recomendado): cifra o Access Token dentro do banco. Gere com o mesmo comando do verify token. Com ela, quem copiar o `whatsapp.db` **não consegue ler** os tokens. Guarde a chave: se ela for perdida, é só recadastrar os tokens em *WhatsApp → Conexões* (nenhum outro dado é afetado).
- O **Access Token, Phone Number ID e WABA ID** NÃO vão no `.env` — são cadastrados dentro do sistema em **WhatsApp → Conexões** e ficam salvos no banco.

O `server.cjs` lê o `.env` automaticamente na inicialização. O arquivo `.env` **nunca** vai para o Git (já está no `.gitignore`).

---

## 3. Configurar o Meta for Developers

1. Acesse <https://developers.facebook.com/> e crie/entre no seu **App** (tipo *Business*).
2. Adicione o produto **WhatsApp**.
3. Em **Configurações do App → Básico**, anote o **App ID** e a **Chave Secreta** (→ `WHATSAPP_APP_SECRET`).

## 4. WhatsApp Business Platform

1. No painel do WhatsApp do app, você verá o **WhatsApp Business Account (WABA) ID**.
2. Gere um **Access Token permanente** (via System User no Business Manager, com permissões `whatsapp_business_messaging` e `whatsapp_business_management`). O token temporário de teste dura só 24h — para produção use o permanente.

## 5. Configurar o número oficial

1. Em **WhatsApp → Configuração da API**, adicione/valide o **número de telefone** oficial (não pode ser um número já usado no WhatsApp normal/Business app).
2. Anote o **Phone Number ID** desse número.
3. Dentro do sistema ATTOS RH: **WhatsApp → Conexões** → preencha *Phone Number ID*, *WABA ID* e *Access Token* → **Salvar** → **Testar** (deve dizer "Conectado").

## 6. Configurar o Webhook na Meta

1. Em **WhatsApp → Configuração → Webhook**, clique em **Editar**.
2. **URL de callback:** `https://SEU_DOMINIO/webhooks/whatsapp`
3. **Token de verificação:** o mesmo valor de `WHATSAPP_VERIFY_TOKEN`.
4. Clique em **Verificar e salvar** (a Meta faz um GET; o sistema responde o desafio).
5. Em **Campos do webhook**, assine **`messages`** (obrigatório).

> O webhook é **idempotente**: se a Meta reenviar o mesmo evento, a mensagem não duplica (controle por ID único `wamid`).

---

## 7. Nginx (proxy reverso)

Crie/edite o site (ex: `/etc/nginx/sites-available/rt`):

```nginx
server {
    server_name SEU_DOMINIO;

    client_max_body_size 40M;   # uploads (PDF/mídia) — combina com o limite do backend

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SSE (tempo real das mensagens) — NÃO pode ter buffer nem timeout curto
    location /api/whatsapp/events {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }
}
```

Ative e recarregue:

```bash
ln -s /etc/nginx/sites-available/rt /etc/nginx/sites-enabled/   # se ainda não existir
nginx -t && systemctl reload nginx
```

> O bloco `/api/whatsapp/events` é **essencial**: sem `proxy_buffering off`, as mensagens em tempo real (SSE) não chegam ao navegador.

## 8. SSL (HTTPS) — obrigatório para o webhook

A Meta só aceita webhook em **HTTPS**. Use o Certbot (grátis):

```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d SEU_DOMINIO
```

O Certbot ajusta o Nginx para 443 e renova sozinho. Teste a renovação:

```bash
certbot renew --dry-run
```

## 9. Subir com PM2

```bash
npm install -g pm2                       # se ainda não tiver
pm2 start server.cjs --name rt-vagas     # inicia
pm2 save                                 # salva a lista
pm2 startup                              # gera o comando p/ subir no boot (rode o que ele mostrar)
```

O `.env` é lido automaticamente pelo `server.cjs`. Confirme que subiu:

```bash
pm2 status
pm2 logs rt-vagas --lines 30             # deve mostrar "[WhatsApp] Banco de dados inicializado"
```

## 10. Reiniciar

```bash
pm2 restart rt-vagas
```

> O sistema salva o banco do WhatsApp **antes de encerrar** (SIGINT/SIGTERM), então reiniciar pelo PM2 **não perde** mensagens.

## 11. Atualizar o sistema (novas versões)

```bash
cd /caminho/do/projeto
git pull                    # baixa o código novo
npm install                 # caso tenha dependência nova
pm2 restart rt-vagas
```

Os dados (state.json, whatsapp.db, uploads) ficam em `DATA_DIR` e **não são tocados** pelo `git pull`.

## 12. Backup

Todos os dados ficam em `DATA_DIR` (padrão `server-data/`):
- `state.json` — sistema ATTOS RH.
- `whatsapp.db` — banco do WhatsApp (contatos, conversas, mensagens).
- `uploads/` — mídias e documentos.
- `backups/` — snapshots automáticos do `state.json` (o servidor já guarda 24 por hora + 7 por dia).

**Backup do WhatsApp** — basta copiar o arquivo `.db`:

```bash
cp server-data/whatsapp.db  ~/backups/whatsapp-$(date +%F-%H%M).db
```

**Backup completo** (recomendado, agende no cron):

```bash
tar -czf ~/backups/rt-$(date +%F).tar.gz server-data/
```

Exemplo de cron diário às 3h (`crontab -e`):

```
0 3 * * * cd /caminho/do/projeto && tar -czf ~/backups/rt-$(date +\%F).tar.gz server-data/
```

## 13. Restaurar um backup

```bash
pm2 stop rt-vagas
cp ~/backups/whatsapp-DATA.db  server-data/whatsapp.db      # ou: tar -xzf rt-DATA.tar.gz
pm2 start rt-vagas
```

O sistema carrega o banco do arquivo na inicialização.

## 14. Logs

```bash
pm2 logs rt-vagas                 # ao vivo
pm2 logs rt-vagas --lines 200     # últimas 200 linhas
pm2 logs rt-vagas --err           # só erros
```

Mensagens úteis do módulo: `[WhatsApp] Banco de dados inicializado`, `[WhatsApp Webhook] ...`, `[RT] .env carregado.`.

## 15. Erros comuns (troubleshooting)

| Sintoma | Causa provável | Solução |
|---|---|---|
| Webhook não verifica na Meta | Token diferente, ou sem HTTPS | `WHATSAPP_VERIFY_TOKEN` no `.env` = token no Meta; SSL ativo; URL exata `/webhooks/whatsapp` |
| Mensagens recebidas não aparecem | Campo `messages` não assinado, ou webhook com erro | Assine `messages`; veja `pm2 logs` por `[WhatsApp Webhook]` |
| Tempo real (SSE) não atualiza | Nginx com buffer no `/api/whatsapp/events` | Confirme o bloco com `proxy_buffering off` e `proxy_read_timeout 3600s` |
| Assinatura inválida (403) | `WHATSAPP_APP_SECRET` errado | Copie a Chave Secreta certa do app; ou deixe vazio p/ testar (sem validar assinatura) |
| Erro ao enviar mensagem | Access Token ausente/expirado, ou fora da janela de 24h | Reconfigure o token em *WhatsApp → Conexões*; fora de 24h só dá para enviar **template** |
| Só dá para enviar template | Regra da Meta: fora da janela de 24h da última msg do cliente | Use um template aprovado (aba Templates) |
| Módulo some/erro 503 | Banco ainda inicializando | Aguarde alguns segundos; veja se o `.db` foi criado em `DATA_DIR` |
| "Módulo WhatsApp inicializando..." | `sql.js` não carregou | `npm install`; confira `node_modules/sql.js` |
| Item WhatsApp não aparece p/ um usuário | Sem a permissão | Admin → Funcionários → editar → marque a permissão **WhatsApp** |

---

### Segurança (checklist)
- [x] Access Token só no servidor (banco), nunca no frontend.
- [x] `.env` e `*.db` no `.gitignore` (não vão pro Git).
- [x] Webhook valida assinatura (`X-Hub-Signature-256`) quando `WHATSAPP_APP_SECRET` está definido.
- [x] Todas as rotas `/api/whatsapp/*` exigem login + permissão (validado no backend, não só na tela).
- [x] HTTPS obrigatório (Certbot).

### O que depende de você (credenciais da Meta)
Envio/recebimento real de mensagens, sincronização de templates e status de entrega/leitura
só funcionam depois de configurar o número + Access Token reais no painel da Meta e em
*WhatsApp → Conexões*.
