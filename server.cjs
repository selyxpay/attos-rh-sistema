const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const BASE = path.resolve(__dirname);

console.log('BASE:', BASE);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// ==========================================================================
// CABEÇALHOS DE SEGURANÇA HTTP
// Adicionados em todas as respostas para proteção contra ataques comuns.
// ==========================================================================
const SECURITY_HEADERS = {
  // Impede que o site seja embutido em iframes (clickjacking)
  'X-Frame-Options': 'DENY',

  // Impede que o browser adivinhe o tipo de conteúdo (MIME sniffing)
  'X-Content-Type-Options': 'nosniff',

  // Não envia o URL de origem nas requisições externas (vazamento de info)
  'Referrer-Policy': 'no-referrer',

  // Desativa funcionalidades do browser que não são usadas pelo sistema
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',

  // Content Security Policy: define origens permitidas para cada tipo de recurso
  // scripts e estilos permitidos: apenas CDNs conhecidos e o próprio servidor
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://www.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
    "img-src 'self' data: blob: https://images.unsplash.com https://ui-avatars.com https://api.qrserver.com",
    "connect-src 'self' https://viacep.com.br https://*.googleapis.com https://*.firebaseio.com https://*.appspot.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '),
};

http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  let filePath = path.resolve(BASE, '.' + urlPath);
  if (!filePath.startsWith(BASE)) {
    res.writeHead(403, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    res.end('403 Forbidden');
    return;
  }


  console.log('Request:', req.url, '->', filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.log('ERROR:', err.code, filePath);
      res.writeHead(404, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
      res.end('404 Not Found: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath);
    const contentType = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType, ...SECURITY_HEADERS });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log('Servidor em: http://localhost:' + PORT);
  console.log('Cabeçalhos de segurança HTTP ativos.');
});
