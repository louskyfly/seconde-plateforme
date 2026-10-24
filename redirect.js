// Redirige l'ancien site Render vers le nouveau site (GitHub Pages + Firebase).
import http from 'node:http';
const TARGET = 'https://louskyfly.github.io/seconde-plateforme/';
const port = process.env.PORT || 10000;
http.createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  let dest = TARGET;
  if (path.startsWith('/gestion') || path.startsWith('/admin') || path.startsWith('/login')) dest = TARGET + 'login';
  else if (path.length > 1 && !path.startsWith('/api')) dest = TARGET + path.replace(/^\/+/, '');
  res.writeHead(301, { Location: dest, 'Cache-Control': 'no-cache' });
  res.end('Le site a déménagé : ' + dest);
}).listen(port, () => console.log('Redirect server on ' + port));
