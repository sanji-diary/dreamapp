import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { readAssets } from './assets.mjs';

const assets = await readAssets();
const stripExports = source => source.replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/gm, '');
const physics = stripExports(assets['/physics.mjs'][1]);
const rounds = stripExports((await readFile('rounds.mjs','utf8')).replace(/^import[^;]+;\s*/m, ''));
const moduleText = [
  'const ASSETS = '+JSON.stringify(assets)+';',
  'const gameApi = (() => {',
  '  const { STAGES, isValidShot, simulateShot } = (() => {', physics,
  '  return { STAGES, isValidShot, simulateShot }; })();',
  rounds, 'return gameApi; })();', await readFile('worker.mjs','utf8')
].join('\n');
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',moduleText);
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');

