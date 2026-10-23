# Segurança da VPS e do Coolify — o que o João precisa conferir

Escrito para: o João, direto no terminal da VPS (sem precisar saber programar).

Contexto: em **21/10/2026** saiu uma falha crítica no mundo **PHP**
(**CVE-2026-109618** e **CVE-2026-109619**, nota 9.2, execução de comando
remoto **sem login**, apelidada de "PHP2Shell").

## Primeiro, a boa notícia

**O sistema R&T não usa PHP.** Nem uma linha. Conferido em 23/10/2026:

| Onde | O que foi conferido | Resultado |
|---|---|---|
| Imagem do Docker | `FROM node:20-alpine` + `COPY` de arquivos `.cjs`/`.html`/`.js` | **sem PHP** |
| Dependências | `package.json` tem **uma**: `sql.js` (JavaScript puro) | **sem PHP** |
| Varredura no projeto | busca por `php` em código, Dockerfile e configuração | **nada** |
| `npm audit` | com e sem as de desenvolvimento | **0 vulnerabilidades** |

Então a falha **não atinge o sistema**. O que pode estar exposto é o que roda
**ao lado** dele na VPS: o **Coolify** (que é feito em PHP/Laravel) e qualquer
PHP que a Hostinger tenha instalado na máquina.

## O que fazer na VPS — passo a passo

Entre na VPS pelo terminal (SSH) e rode os comandos abaixo, um por vez.

### 1. Ver se existe PHP na máquina e qual a versão

```bash
php -v
```

- Se responder **"command not found"**: não há PHP instalado. Pule para o item 3.
- Se mostrar uma versão, anote o número e compare com a tabela:

| Versão instalada | Situação |
|---|---|
| 8.5.12, 8.4.27, 8.3.36, 8.2.35 **ou mais nova** | **corrigida** — nada a fazer |
| qualquer coisa **abaixo** dessas | **precisa atualizar agora** |

Dica: dá para ver todas as versões instaladas com
`ls /etc/php/` (Ubuntu/Debian) ou `dpkg -l | grep php`.

### 2. Atualizar o PHP (se a versão for antiga)

```bash
sudo apt update
sudo apt upgrade -y
php -v                    # confere se subiu para a versão corrigida
```

Se o `apt upgrade` não subir a versão (acontece quando o repositório da
distribuição está atrasado), use o repositório do Ondřej, que é o padrão em
Ubuntu/Debian:

```bash
sudo add-apt-repository ppa:ondrej/php -y
sudo apt update
sudo apt install --only-upgrade php8.3 php8.3-fpm -y     # troque 8.3 pela sua linha
sudo systemctl restart php8.3-fpm
php -v
```

### 3. Ver a versão do Coolify e atualizar

No painel: **Settings → há um aviso de atualização no topo quando existe
versão nova**. Pelo terminal:

```bash
docker ps --format '{{.Image}}' | grep -i coolify
```

Para atualizar (é o comando oficial, pode rodar com o sistema no ar):

```bash
curl -fsSL https://cdn.coollabs.io/coolify/upgrade.sh | sudo bash
```

O Coolify reinicia só ele mesmo. **O sistema R&T continua no ar** durante a
atualização — ele é um container separado.

Depois de atualizar, confira que o sistema respondeu:

```bash
curl -s https://vemserrt.com.br/api/saude
```

### 4. Fechar a porta do painel do Coolify para a internet

Esta é a proteção que vale mais do que qualquer atualização: se o painel não
estiver aberto para o mundo, nem uma falha nota 9.2 alcança ele.

```bash
sudo ufw status                     # ve o que esta aberto
sudo ufw allow 22/tcp               # SSH (nao se tranque para fora!)
sudo ufw allow 80,443/tcp           # o site
sudo ufw deny 8000/tcp              # painel do Coolify (porta padrao)
sudo ufw enable
```

Para administrar o Coolify depois disso, use um túnel SSH em vez de abrir a
porta:

```bash
ssh -L 8000:localhost:8000 usuario@IP-DA-VPS
# e abra http://localhost:8000 no seu navegador
```

### 5. Conferir o resto da máquina

```bash
sudo apt list --upgradable          # o que mais esta atrasado
docker images | head                # imagens antigas rodando ao lado
last -n 20                          # ultimos acessos por SSH
```

## Variáveis que precisam estar configuradas no Coolify

No Coolify, no serviço do R&T, em **Environment Variables**:

| Variável | Para que serve | Se faltar |
|---|---|---|
| `ADMIN_SENHA` | senha da conta `admin` no primeiro boot | a conta nasce **sem senha** e ninguém entra nela (falha fechada, de propósito) |
| `WHATSAPP_APP_SECRET` | confere a assinatura dos webhooks da Meta | o sistema **aceita** o webhook sem conferir a assinatura e avisa no log — qualquer um que descubra a URL pode simular mensagem recebida |
| `WHATSAPP_VERIFY_TOKEN` | registro do webhook na Meta | o webhook não registra |
| `WHATSAPP_TOKEN_KEY` | cifra o token da Meta dentro do banco | quem copiar o `whatsapp.db` lê o token |

**Confira hoje se `WHATSAPP_APP_SECRET` está preenchida.** É a única da lista
que falha em silêncio: o WhatsApp continua funcionando sem ela.

## O que já está protegido no sistema (não precisa fazer nada)

- Senha guardada com **scrypt + sal** (nem o sistema consegue ler a senha de
  ninguém), e **nenhuma senha em texto puro** no `state.json`.
- **Troca obrigatória de senha** de todas as contas antigas (23/10/2026).
- Cookie de sessão com **HttpOnly**, **SameSite=Lax** e **Secure** quando o
  acesso é por HTTPS; sessão com prazo.
- Cabeçalhos: **HSTS**, CSP, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy`.
- Limite de tentativas de login **por conta** (5 erros → 1 min) e **por IP**
  (30 erros em 10 min → 10 min).
- `/server.cjs`, `/data`, `.env` e os arquivos internos **não saem** pela web
  (suíte `backend`).
- Upload decidido pelo **conteúdo** do arquivo, não pela extensão; SVG e HTML
  barrados (suíte `upload`).
- `.env` fora do Git; segredos só por variável de ambiente.

## O que continua sendo risco conhecido (e por quê)

| Risco | Por que está assim | O que reduz |
|---|---|---|
| As senhas antigas estão no **histórico do Git** (commits `a82b7eb` e `59f4e8e`) | reescrever o histórico quebraria o deploy e os clones | a troca obrigatória: aquelas senhas **não valem mais** |
| A pasta `/uploads/` é **pública** | a API da Meta precisa buscar a mídia por URL | nome de arquivo aleatório, tipo conferido pelo conteúdo, SVG/HTML barrados. Documento sensível vai para pasta protegida, fora de `/uploads/` |
| Webhook sem assinatura quando falta `APP_SECRET` | derrubar o webhook pararia o atendimento | configurar a variável (item acima) |
