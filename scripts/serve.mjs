import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT || 5180);
const host = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer((request, response) => {
  try {
    const rawPath = decodeURIComponent((request.url || '/').split('?')[0]);
    const relative = rawPath === '/' ? 'index.html' : rawPath.replace(/^\/+/, '');
    const filePath = path.resolve(root, relative);

    if (!filePath.startsWith(root + path.sep) && filePath !== root) {
      response.writeHead(403);
      response.end('Prohibido');
      return;
    }

    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    const target = stat?.isDirectory() ? path.join(filePath, 'index.html') : filePath;
    if (!fs.existsSync(target)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(`No existe: ${rawPath}`);
      return;
    }

    const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(target).pipe(response);
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(`Error: ${error.message}`);
  }
});

server.listen(port, host, () => {
  console.log(`Mariposa en http://${host}:${port}`);
});
