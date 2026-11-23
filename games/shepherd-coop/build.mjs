import { readFile,writeFile,mkdir,copyFile } from 'node:fs/promises';
const read = name => readFile(new URL(name,import.meta.url),'utf8');
const assets = Object.create(null);
for (const name of ['index.html','styles.css','client.mjs','renderer.mjs','engine.mjs','motion.mjs']) {
  const type = name.endsWith('mjs')?'text/javascript':name.endsWith('css')?'text/css':'text/html';
  assets['/'+name] = [type,await read(name)];
}
const engine = assets['/engine.mjs'][1].replace(/^export\s+(?=(?:const|function)\b)/gm,'');
const rooms = (await read('rooms.mjs')).replace(/^import .*?;\s*$/m,'').replace('export async function roomApi','async function roomApi');
const worker = 'const ASSETS='+JSON.stringify(assets)+';\n'+
  'const roomApi=(()=>{const {createGame,startGame,stepGame}=(()=>{\n'+engine+'\nreturn {createGame,startGame,stepGame};})();\n'+rooms+'\nreturn roomApi;})();\n'+await read('worker.mjs');
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',worker);
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
