import http from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gameApi } from './rounds.mjs';
import { readAssets } from './assets.mjs';

export function openStore(filename) {
  const db = new DatabaseSync(filename);
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; BEGIN IMMEDIATE');
    db.exec('CREATE TABLE IF NOT EXISTS local_migrations (tag TEXT PRIMARY KEY)');
    const journal = JSON.parse(readFileSync(new URL('./drizzle/meta/_journal.json',import.meta.url),'utf8'));
    for (const {tag} of journal.entries) {
      if (db.prepare('SELECT tag FROM local_migrations WHERE tag=?').get(tag)) continue;
      db.exec(readFileSync(new URL('./drizzle/'+tag+'.sql',import.meta.url),'utf8'));
      db.prepare('INSERT INTO local_migrations VALUES (?)').run(tag);
    }
    db.exec('COMMIT');
  } catch (error) { db.close(); throw error; }
  return {
    run:(sql,...args) => db.prepare(sql).run(...args),
    first:(sql,...args) => db.prepare(sql).get(...args),
    all:(sql,...args) => db.prepare(sql).all(...args),
    close:() => db.close()
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = process.env.EGG_DATA_DIR || fileURLToPath(new URL('./.data',import.meta.url));
  mkdirSync(directory,{recursive:true});
  const store = openStore(resolve(directory,'egg.sqlite'));
  const assets = await readAssets();
  const port = Number(process.env.PORT || 4186);
  http.createServer(async (req,res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/api/')) {
        const asset = assets[url.pathname === '/' ? '/index.html' : url.pathname];
        if (!asset) return res.writeHead(404).end();
        res.writeHead(200,{'Content-Type':asset[0]+'; charset=utf-8','Cache-Control':'no-cache'});
        return res.end(asset[1]);
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8192) return res.writeHead(413).end();
        chunks.push(chunk);
      }
      const response = await gameApi(new Request(url,{method:req.method,headers:req.headers,
        body:['GET','HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks)}), store);
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(await response.text());
    } catch (error) { console.error(error.message); res.writeHead(500).end(); }
  }).listen(port,process.env.HOST || '0.0.0.0',() => {
    console.log('PC: http://localhost:'+port);
    if (process.argv.includes('--open') && process.platform === 'win32') {
      import('node:child_process').then(({execFile}) =>
        execFile('rundll32.exe', ['url.dll,FileProtocolHandler', 'http://localhost:'+port], {windowsHide:true}));
    }
    for (const items of Object.values(networkInterfaces())) for (const item of items) {
      if (item.family === 'IPv4' && !item.internal) console.log('Phone: http://'+item.address+':'+port);
    }
  });
}

