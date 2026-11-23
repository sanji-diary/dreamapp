// The build inserts the browser assets and shared simulation modules above this handler.
function databaseStore(db) {
  return {
    async clean(roomCutoff, resultCutoff) {
      await db.batch([
        db.prepare('DELETE FROM game_rooms WHERE touched < ?').bind(roomCutoff),
        db.prepare('DELETE FROM game_results WHERE completed_at < ?').bind(resultCutoff)
      ]);
    },
    async create(code, room) {
      const result = await db.prepare('INSERT OR IGNORE INTO game_rooms (code,revision,touched,payload) VALUES (?,0,?,?)')
        .bind(code,room.updated,JSON.stringify(room)).run();
      return result.meta.changes === 1;
    },
    async read(code) {
      const row = await db.prepare('SELECT revision,payload FROM game_rooms WHERE code = ?').bind(code).first();
      return row && {revision:row.revision,room:JSON.parse(row.payload)};
    },
    async write(code,rev,room) {
      const result = await db.prepare('UPDATE game_rooms SET revision=revision+1,touched=?,payload=? WHERE code=? AND revision=?')
        .bind(room.updated,JSON.stringify(room),code,rev).run();
      return result.meta.changes === 1;
    },
    async results(launchId,roundId,cutoff,after,limit) {
      const {results} = await db.prepare(
        'SELECT seq, result_id AS resultId, round_id AS roundId, completed_at AS completedAt, saved_count AS savedCount FROM game_results WHERE launch_id=? AND (? IS NULL OR round_id=?) AND completed_at>=? AND seq>? ORDER BY seq LIMIT ?'
      ).bind(launchId,roundId,roundId,cutoff,after,limit).all();
      return results;
    }
  };
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/')) return roomApi(request, databaseStore(env.DB));
    const asset = ASSETS[path === '/' ? '/index.html' : path];
    if (!asset) return new Response('Not found',{status:404});
    return new Response(asset[1],{headers:{'content-type':asset[0]+'; charset=utf-8','cache-control':'no-cache'}});
  }
};
