import http from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { roomApi } from './rooms.mjs';

const files = new Map([
  ['/', ['index.html','text/html']], ['/index.html',['index.html','text/html']],
  ...['engine.mjs','renderer.mjs','client.mjs','motion.mjs','styles.css'].map(name => ['/'+name,[name,name.endsWith('.css')?'text/css':'text/javascript']])
]);
// The embedded server and the hosted game apply the same result-recording trigger.
export function createLocalStore(directory) {
  mkdirSync(directory,{recursive:true});
  const db = new DatabaseSync(join(directory,'game.sqlite'));
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; BEGIN IMMEDIATE');
    db.exec('CREATE TABLE IF NOT EXISTS local_migrations (tag TEXT PRIMARY KEY)');
    const journal = JSON.parse(readFileSync(new URL('./drizzle/meta/_journal.json',import.meta.url),'utf8'));
    for (const {tag} of journal.entries) {
      if (db.prepare('SELECT 1 FROM local_migrations WHERE tag=?').get(tag)) continue;
      db.exec(readFileSync(new URL('./drizzle/'+tag+'.sql',import.meta.url),'utf8'));
      db.prepare('INSERT INTO local_migrations(tag) VALUES(?)').run(tag);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.close(); // Rolls back any uncommitted schema edits.
    throw error;
  }
  const insert = db.prepare('INSERT OR IGNORE INTO game_rooms(code,revision,touched,payload) VALUES(?,0,?,?)');
  const read = db.prepare('SELECT revision,payload FROM game_rooms WHERE code=?');
  const write = db.prepare('UPDATE game_rooms SET revision=revision+1,touched=?,payload=? WHERE code=? AND revision=?');
  const results = db.prepare('SELECT seq, result_id AS resultId, round_id AS roundId, completed_at AS completedAt, saved_count AS savedCount FROM game_results WHERE launch_id=? AND (? IS NULL OR round_id=?) AND completed_at>=? AND seq>? ORDER BY seq LIMIT ?');
  return {
    clean(roomCutoff, resultCutoff) {
      db.prepare('DELETE FROM game_rooms WHERE touched < ?').run(roomCutoff);
      db.prepare('DELETE FROM game_results WHERE completed_at < ?').run(resultCutoff);
    },
    create(code,room) { return insert.run(code,room.updated,JSON.stringify(room)).changes === 1; },
    read(code) {
      const row = read.get(code);
      return row && {revision:row.revision,room:JSON.parse(row.payload)};
    },
    write(code,revision,room) { return write.run(room.updated,JSON.stringify(room),code,revision).changes === 1; },
    results(launchId,roundId,cutoff,after,limit) { return results.all(launchId,roundId,roundId,cutoff,after,limit); },
    close() { db.close(); }
  };
}

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '0.0.0.0';
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const store = createLocalStore(process.env.SHEPHERD_DATA_DIR || fileURLToPath(new URL('./.data/',import.meta.url)));
  http.createServer(async (req,res) => {
    try {
      const url = new URL(req.url, 'http://' + req.headers.host);
      if (url.pathname.startsWith('/api/')) {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size>4096) {res.writeHead(413).end();return;}
          chunks.push(chunk);
        }
        const request = new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
        const response = await roomApi(request, store);
        res.writeHead(response.status,Object.fromEntries(response.headers));
        res.end(await response.text());
        return;
      }
      const asset = files.get(url.pathname);
      if (!asset) {res.writeHead(404).end();return;}
      const content = await readFile(new URL('./'+asset[0],import.meta.url));
      res.writeHead(200,{'Content-Type':asset[1]+'; charset=utf-8','Cache-Control':'no-cache'});
      res.end(content);
    } catch (err) {
      console.error(err.message);
      if(!res.headersSent) res.writeHead(500);
      res.end();
    }
  }).listen(port,host,() => {
    console.log('PC: http://localhost:'+port);
    if (host !== '0.0.0.0') return;
    for(const items of Object.values(networkInterfaces())) for(const item of items) {
      if(item.family==='IPv4' && !item.internal && !item.address.startsWith('169.254.')) console.log('Phone: http://'+item.address+':'+port);
    }
  });
}
