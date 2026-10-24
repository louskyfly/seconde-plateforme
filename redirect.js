// Ancien site Render (seconde-plateforme.onrender.com) : redirige tout vers le
// nouveau site (GitHub Pages + Firebase). Lancé par `npm start` sur Render.
import http from 'node:http';
const TARGET = 'https://louskyfly.github.io/seconde-plateforme/';
const port = process.env.PORT || 10000;
http.createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (path === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end('{"status":"ok","redirect":true}');
  }
  let dest = TARGET;
  if (path.startsWith('/gestion') || path.startsWith('/admin') || path.startsWith('/login')) dest = TARGET + 'login';
  else if (path.length > 1 && !path.startsWith('/api')) dest = TARGET + path.replace(/^\/+/, '');
  res.writeHead(301, { Location: dest, 'Cache-Control': 'no-cache' });
  res.end('Le site a déménagé : ' + dest);
}).listen(port, () => console.log('Redirection active sur le port ' + port));
