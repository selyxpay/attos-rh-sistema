# R&T VAGAS IA — site + backend próprio (Node) rodando 100% na sua VPS.
# Guarda os dados e as fotos no próprio servidor (sem Firebase).
FROM node:20-alpine
WORKDIR /app

# Arquivos do site + servidor (o server.cjs usa só Node puro, sem instalar nada)
COPY server.cjs ./
COPY index.html login.html candidato.html talento.html fila-display.html ./
COPY robots.txt sitemap.xml ./
COPY css ./css
COPY js  ./js
COPY img ./img

# Porta do site e pasta de dados PERSISTENTES (no Coolify montamos um volume em /data)
ENV PORT=80
ENV DATA_DIR=/data
EXPOSE 80

CMD ["node", "server.cjs"]
