// build.mjs bundles gameApi and the same client files as the Node preview.
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/')) {
      const db = env.DB;
      const store = {
        run: (sql,...args) => db.prepare(sql).bind(...args).run(),
        first: (sql,...args) => db.prepare(sql).bind(...args).first(),
        all: async (sql,...args) => (await db.prepare(sql).bind(...args).all()).results
      };
      return gameApi(request, store);
    }
    const asset = Object.hasOwn(ASSETS, path === '/' ? '/index.html' : path) && ASSETS[path === '/' ? '/index.html' : path];
    if (!asset) return new Response('Not found', {status:404});
    return new Response(asset[1], {headers:{'Content-Type':asset[0]+'; charset=utf-8','Cache-Control':'no-cache'}});
  }
};

