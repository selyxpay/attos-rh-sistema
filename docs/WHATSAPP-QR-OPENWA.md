# Segundo WhatsApp (QR Code) — guia de uso

O sistema agora tem **dois WhatsApps**, separados de propósito, na coluna da esquerda:

| Menu | O que é | Como conecta | Risco |
|---|---|---|---|
| **WhatsApp Oficial** | API oficial da Meta | Credenciais (token) | Nenhum. É o caminho aprovado. |
| **WhatsApp QR** | OpenWA, serviço à parte | Lendo o QR Code, como no WhatsApp Web | **Não é oficial. O número pode ser bloqueado.** |

Um não interfere no outro. Se o QR cair, o Oficial continua funcionando, e vice-versa.

---

## Leia isto antes

1. **Use um número dedicado.** Um chip só para isso. Nunca o número do WhatsApp
   Oficial e nunca o número principal da empresa.
2. **O bloqueio é possível.** O próprio projeto OpenWA avisa. Automação não
   oficial viola os termos do WhatsApp. Se bloquearem, você perde aquele número.
3. **Não mande disparo em massa.** Muita mensagem para desconhecidos é o
   caminho mais rápido para o bloqueio.
4. **O celular precisa ficar por perto no começo.** Só para ler o QR. Depois
   a sessão fica de pé sozinha, mas se o WhatsApp for desconectado no celular,
   precisa ler o QR de novo.

---

## Parte 1 — Ligar o serviço (uma vez só)

O OpenWA **não roda dentro deste sistema**. Ele é um servidor separado, em
Docker. Você sobe ele no Coolify e depois avisa este sistema onde ele está.

### 1.1 Criar o serviço no Coolify

1. Coolify → o projeto onde já está o `R&T VAGAS IA` → **+ New** → **Resource**
   → **Public Repository**.
2. Repositório: `https://github.com/rmyndharis/OpenWA`
3. Build Pack: **Dockerfile**
4. Porta exposta: **2785**
5. **Storages**: monte um volume persistente para a pasta de sessões do OpenWA
   (o repositório indica o caminho). **Sem volume, toda vez que fizer deploy
   o WhatsApp desconecta e você tem que ler o QR de novo.**
6. Memória: reserve **pelo menos 1 GB** para esse serviço. Cada conexão de
   WhatsApp sobe um navegador por baixo e come de 300 a 500 MB.

### 1.2 Definir a chave de acesso

Ainda no serviço do OpenWA, em **Environment Variables**, crie:

```
API_KEY = <invente uma senha longa, tipo 40 caracteres aleatórios>
```

Guarde essa chave. Ela é o que impede qualquer um de mandar mensagem pelo seu
WhatsApp.

Faça o **Deploy** e espere ficar verde. A primeira subida demora (~2 a 5 min).

### 1.3 Avisar o sistema R&T onde ele está

Agora no serviço **R&T VAGAS IA** (o principal), em **Environment Variables**,
crie duas variáveis:

```
OPENWA_URL      = http://<nome-do-servico-openwa>:2785
OPENWA_API_KEY  = <a MESMA chave que você pôs no OpenWA>
```

> O `<nome-do-servico-openwa>` é o nome interno que o Coolify deu ao container.
> Se os dois serviços estiverem na mesma rede do Coolify, esse endereço interno
> funciona e é o mais seguro — o OpenWA nem precisa ficar aberto na internet.
> Se preferir domínio público, use `https://wa.seudominio.com.br`.

Depois **Redeploy** no R&T VAGAS IA.

### 1.4 Conferir

Entre no sistema → menu **WhatsApp QR**.

- Se aparecer *"Ainda não está ligado"* → alguma das duas variáveis não foi
  criada, ou o Redeploy não rodou. A própria tela diz qual falta.
- Se aparecer *"O serviço não respondeu"* → o OpenWA está fora do ar, ainda
  subindo, ou o endereço está errado. Espere 1 minuto e clique **Atualizar**.
- Se aparecer *"Serviço no ar"* → deu certo. Siga para a Parte 2.

---

## Parte 2 — Conectar o celular (uma vez, e sempre que cair)

1. Menu **WhatsApp QR**.
2. Botão **Gerar QR Code**. Espere alguns segundos, o código aparece na tela.
3. No celular do número dedicado: **WhatsApp → Configurações (ou os três
   pontinhos) → Aparelhos conectados → Conectar um aparelho**.
4. Aponte a câmera para o código na tela do computador.
5. O código se renova sozinho a cada poucos segundos — se ele mudar antes de
   você ler, tudo bem, leia o novo.
6. Depois de ler, clique em **Atualizar** no topo da tela. Deve aparecer
   **"Conectado"**.

---

## Parte 3 — Usar

Na mesma tela, o bloco **Enviar uma mensagem de teste**:

- **Número (com DDD)**: `11912345678`. Não precisa digitar o `55` — o sistema
  põe sozinho. Também aceita com pontuação: `(11) 91234-5678`.
- **Mensagem**: o texto.
- **Enviar**.

Aparece *"Enviado para 5511912345678"* em verde, ou o motivo do erro em vermelho.

---

## Quando der problema

| O que aparece | O que fazer |
|---|---|
| "Ainda não está ligado" | Criar `OPENWA_URL` e `OPENWA_API_KEY` no Coolify e dar Redeploy. |
| "O serviço não respondeu" | O OpenWA está fora do ar ou ainda subindo. Veja os logs dele no Coolify. |
| "O OpenWA recusou a chave de acesso" | A `OPENWA_API_KEY` daqui está diferente da `API_KEY` de lá. As duas têm que ser idênticas. |
| "Não consegui pegar o código" | Clique em **Gerar QR Code** de novo. Se insistir, reinicie o serviço OpenWA. |
| Estava conectado e parou | Alguém desconectou no celular, ou o serviço subiu sem volume persistente. Leia o QR de novo e confira o volume. |
| "Sem acesso" | Seu login não tem permissão de WhatsApp. Peça ao administrador. |
| Número bloqueado pelo WhatsApp | Não tem recurso técnico. Troque o chip e leia o QR com o número novo. É o risco que a tela avisa. |

---

## Quem pode usar

Só entra na tela **WhatsApp QR** quem for:

- usuário mestre, ou
- do departamento **Administração**, ou
- tiver a permissão **WhatsApp → aprovar**.

O bloqueio é no servidor também, não só na tela: quem não pode recebe erro 403
mesmo tentando chamar direto.

---

## Detalhe técnico (para quem for mexer no código)

- `openwa.cjs` — a ponte. Lê `OPENWA_URL` e `OPENWA_API_KEY`, tem tempo limite
  de 15s e **nunca lança exceção**: devolve sempre `{ ok, status, dados, erro }`.
- `server.cjs` — rotas `/api/openwa/situacao`, `/iniciar`, `/qr/:sessao`,
  `/enviar`. Todas exigem login **e** permissão de WhatsApp.
- `js/app.js` — `renderWhatsappQr()`, `owaAtualizar()`, `owaGerarQr()`,
  `owaEnviar()`.
- **A chave nunca vai para o navegador.** O front fala só com `/api/openwa/*`;
  quem conversa com o OpenWA é o servidor daqui.
- O módulo é carregado dentro de `try/catch`: se `openwa.cjs` sumir, o sistema
  sobe igual e só essa aba responde que está indisponível.
