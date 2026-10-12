import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { randomUUID } from 'crypto';

const PORT = process.env.PORT || 3001;

// Stockage en mémoire des documents (en production : Redis ou DB)
const documents = new Map(); // collection -> Map<id, doc>
const clients = new Map(); // ws -> { collections: Set<string>, lastSeq: number }

function getCollection(name) {
  if (!documents.has(name)) {
    documents.set(name, new Map());
  }
  return documents.get(name);
}

function broadcast(collection, message, excludeWs = null) {
  const msg = JSON.stringify(message);
  for (const [ws, info] of clients) {
    if (ws !== excludeWs && ws.readyState === 1 && info.collections.has(collection)) {
      ws.send(msg);
    }
  }
}

function handleMessage(ws, data) {
  try {
    const msg = JSON.parse(data);
    
    switch (msg.type) {
      case 'subscribe': {
        if (!clients.has(ws)) clients.set(ws, { collections: new Set(), lastSeq: 0 });
        const info = clients.get(ws);
        for (const coll of msg.collections) {
          info.collections.add(coll);
        }
        // Envoie l'état actuel de la collection
        const coll = getCollection(msg.collection);
        const docs = Array.from(coll.values());
        ws.send(JSON.stringify({
          type: 'sync',
          collection: msg.collection,
          docs,
          seq: info.lastSeq
        }));
        break;
      }
      
      case 'create':
      case 'update': {
        const coll = getCollection(msg.collection);
        const doc = { ...msg.doc, updatedAt: Date.now() };
        if (!doc.id) doc.id = randomUUID();
        coll.set(doc.id, doc);
        
        // Confirme au créateur
        ws.send(JSON.stringify({ type: 'ack', id: msg.id, doc }));
        
        // Broadcast aux autres
        broadcast(msg.collection, { type: msg.type, collection: msg.collection, doc }, ws);
        break;
      }
      
      case 'delete': {
        const coll = getCollection(msg.collection);
        coll.delete(msg.id);
        broadcast(msg.collection, { type: 'delete', collection: msg.collection, id: msg.id }, ws);
        break;
      }
      
      case 'sync': {
        // Demande de sync complète
        const coll = getCollection(msg.collection);
        const docs = Array.from(coll.values());
        ws.send(JSON.stringify({
          type: 'sync',
          collection: msg.collection,
          docs,
          seq: Date.now()
        }));
        break;
      }
    }
  } catch (e) {
    console.error('Error handling message:', e);
    ws.send(JSON.stringify({ type: 'error', message: e.message }));
  }
}

const server = createServer((req, res) => {
  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      clients: clients.size,
      collections: Array.from(documents.keys()),
      docsCount: Array.from(documents.values()).reduce((a, m) => a + m.size, 0)
    }));
    return;
  }
  
  // CORS pour dev
  res.writeHead(200, { 
    'Content-Type': 'text/plain',
    'Access-Control-Allow-Origin': '*'
  });
  res.end('Sync server running. WebSocket on same port.');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  console.log('Client connected:', req.socket.remoteAddress);
  clients.set(ws, { collections: new Set(), lastSeq: 0 });
  
  ws.on('message', (data) => handleMessage(ws, data.toString()));
  
  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });
  
  ws.on('error', (err) => {
    console.error('WS error:', err);
    clients.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`Sync server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Nettoyage périodique (optionnel)
setInterval(() => {
  console.log(`Stats: ${clients.size} clients, ${documents.size} collections`);
}, 60000);