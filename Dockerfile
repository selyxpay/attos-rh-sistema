# ==========================================================================
# R&T VAGAS IA — site + backend (Node) rodando 100% na VPS.
# --------------------------------------------------------------------------
# Arquitetura: GitHub -> Coolify -> VPS.
# O GitHub tem o CÓDIGO. A VPS tem os DADOS REAIS.
#
# ATENÇÃO (persistência): os dados ficam em /data, que PRECISA ser um volume
# persistente montado pelo Coolify. Sem esse volume, cada deploy sobe um
# container novo e vazio — os registros de Equipamentos, as fotos e o banco do
# WhatsApp seriam perdidos. Confira em Coolify -> Storages antes de publicar.
# ==========================================================================
FROM node:20-alpine
WORKDIR /app

# --- Dependências primeiro (aproveita o cache do Docker) -------------------
# O sql.js (banco do WhatsApp) é JavaScript puro: não precisa de compilador.
# FFMPEG: converte o audio GRAVADO NA TELA (webm/opus, o unico formato que o
# navegador grava) para OGG/Opus, que e o que a Meta mostra como MENSAGEM DE
# VOZ. Sem ele o sistema sobe igual: a gravacao pela tela avisa que nao da e o
# envio de audio por ARQUIVO continua funcionando (ver audio-voz.cjs).
RUN apk add --no-cache ffmpeg

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Backend ---------------------------------------------------------------
COPY server.cjs ./
# Base inicial de EMPRESAS/TOMADORES/CLIENTES do Fluxo Financeiro (import idempotente).
COPY ff-cadastros-base.json ./
# Tabela CUSTO x REPASSE de exames (modulo Margem) — base de importacao.
COPY precificacao-base.json ./
# Proteção dos dados críticos de Equipamentos (guarda anti-sumiço + espelho).
# Sem estes arquivos o sistema sobe, mas SEM a rede de segurança.
COPY equipamentos-protecao.cjs restaurar-equipamentos.cjs ./
# Ferramentas de diagnostico e backup (somente leitura / nao destrutivas).
COPY verificar-sistema.cjs backup-dados.cjs limpar-fotos-embutidas.cjs reparar-listas-infladas.cjs restaurar-empresas.cjs restaurar-registros.cjs ./
# Módulo WhatsApp (API Oficial da Meta). Se faltar, o servidor sobe do mesmo
# jeito e só o WhatsApp responde 503 — o resto do sistema não é afetado.
# ATENCAO: este COPY lista os arquivos UM POR UM. Arquivo .cjs novo que o
# server.cjs passe a exigir TEM que entrar aqui, senao o require falha e o
# modulo morre em producao -- foi o que aconteceu com o whatsapp-bot.cjs.
# A suite "imagem" confere isso automaticamente: rode os testes antes de subir.
COPY whatsapp-db.cjs whatsapp-api.cjs whatsapp-webhook.cjs whatsapp-bot.cjs whatsapp-lembretes.cjs whatsapp-envio-grupo.cjs audio-voz.cjs ./
# Ponte para o SEGUNDO WhatsApp (QR Code, serviço OpenWA à parte). Mesma regra:
# se faltar ou não estiver configurado, só essa aba avisa — nada mais é afetado.
COPY openwa.cjs ./

# --- Frontend --------------------------------------------------------------
COPY index.html login.html candidato.html talento.html fila-display.html relatorio-equip.html ./
# Diária (Presença RT) — página pública do trabalhador de campo (cadastro + check-in).
COPY diaria-trabalhador.html ./
# Politica de privacidade — PUBLICA de proposito: a Meta exige que ela abra
# sem login para aprovar o app do WhatsApp Business.
COPY privacidade.html ./
COPY robots.txt sitemap.xml ./
COPY css ./css
COPY js  ./js
COPY img ./img

# --- Execução --------------------------------------------------------------
ENV NODE_ENV=production
ENV PORT=80
ENV DATA_DIR=/data

# TETO DE MEMÓRIA DO NODE (metade da proteção; a outra está no Coolify).
# --------------------------------------------------------------------------
# O que esta linha faz: limita o monte (heap) do JavaScript a 512 MB. Se algo
# dentro do sistema sair comendo memória — uma cópia a mais do state.json, uma
# mídia grande, um laço ruim — o Node morre DENTRO do contêiner, o Coolify o
# levanta de novo em segundos e a VPS continua de pé. Sem teto, o processo
# cresce até o kernel começar a matar coisa no servidor inteiro: aí caem o
# site, o painel do Coolify e o agente da Hostinger ao mesmo tempo.
#
# Por que 512 MB: o uso real é de ~95 MB de heap e ~200 MB de RSS, com o
# state.json em 16 MB. 512 MB dá folga de cinco vezes e ainda assim é um teto.
#
# O QUE ESTA LINHA NÃO FAZ: ela não limita o contêiner, só o heap do Node
# (buffers de mídia e o SQLite ficam fora dela). O limite DURO é no Coolify:
#   Coolify → aplicação R&T → Advanced/Resource Limits → Memory Limit: 768M
# Com os dois, nem o Node nem o contêiner conseguem derrubar a VPS.
ENV NODE_OPTIONS=--max-old-space-size=512

EXPOSE 80

# Declara /data como volume: reforça que esta pasta é persistente e não deve
# ser recriada a cada deploy. (No Coolify, monte o volume apontando para /data.)
VOLUME ["/data"]

# Confere se o servidor está de pé (não depende de nenhum módulo opcional).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:80,path:'/api/time'},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.cjs"]
