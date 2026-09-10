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
COPY whatsapp-db.cjs whatsapp-api.cjs whatsapp-webhook.cjs ./
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
EXPOSE 80

# Declara /data como volume: reforça que esta pasta é persistente e não deve
# ser recriada a cada deploy. (No Coolify, monte o volume apontando para /data.)
VOLUME ["/data"]

# Confere se o servidor está de pé (não depende de nenhum módulo opcional).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:80,path:'/api/time'},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.cjs"]
