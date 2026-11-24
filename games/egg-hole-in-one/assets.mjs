import { readdir, readFile } from 'node:fs/promises';

const types = {html:'text/html', css:'text/css', mjs:'text/javascript', svg:'image/svg+xml'};

export async function readAssets() {
  const assets = Object.create(null);
  const base = new URL('./public/', import.meta.url);
  for (const path of await readdir(base, {recursive:true})) {
    const name = path.replaceAll('\\','/');
    const type = types[name.split('.').pop()];
    if (type) assets['/' + name] = [type, await readFile(new URL(name, base), 'utf8')];
  }
  return assets;
}

