# R&T VAGAS IA — site estático (HTML/JS + Firebase) servido pelo nginx.
# Coolify detecta este Dockerfile e publica automaticamente como site estático.
FROM nginx:alpine

# Configuração do servidor (cabeçalhos de segurança + cache)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Arquivos do site (apenas o que é servido no navegador)
COPY index.html candidato.html talento.html fila-display.html /usr/share/nginx/html/
COPY css /usr/share/nginx/html/css
COPY js  /usr/share/nginx/html/js
COPY img /usr/share/nginx/html/img

EXPOSE 80
