/* Sayt emulyatori: deploy/_worker.js ni Node'da ishga tushiradi.
   KV (env.DB) — xotirada, D1 (env.BAZA) — node:sqlite (xotirada).
   Telegram va push so'rovlari tarmoqqa chiqmaydi (yoziladi).
   ishgaTushir({papka, env}) → {url, env, telegram, close}            */
const http = require('http'), fs = require('fs'), path = require('path');
const { DatabaseSync } = require('node:sqlite');

function soxtaKV() {
  const m = new Map();
  return {
    async get(k, t) { const x = m.get(k); if (!x) return null; return t === 'json' ? JSON.parse(x.v) : x.v; },
    async getWithMetadata(k) { const x = m.get(k); return x ? { value: x.v, metadata: x.meta } : { value: null, metadata: null }; },
    async put(k, v, o) { m.set(k, { v: String(v), meta: (o && o.metadata) || null }); },
    async delete(k) { m.delete(k); },
    async list(o) { const p = (o && o.prefix) || ''; return { keys: [...m.keys()].filter(k => k.startsWith(p)).sort().map(name => ({ name, metadata: m.get(name).meta })), list_complete: true }; },
    _m: m
  };
}
function sqliteD1() {
  const db = new DatabaseSync(':memory:');
  const tayyorla = (sql) => {
    const b = { sql, args: [] };
    const st = () => db.prepare(sql);
    const q = {
      bind(...a) { b.args = a.map(x => x === undefined ? null : typeof x === 'boolean' ? (x ? 1 : 0) : x); return q; },
      async first(col) { const r = st().get(...b.args); return r === undefined ? null : col ? r[col] : Object.assign({}, r); },
      async all() { return { results: st().all(...b.args).map(r => Object.assign({}, r)) }; },
      async run() { const r = st().run(...b.args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) }, changes: Number(r.changes) }; },
      _b: b
    };
    return q;
  };
  return {
    prepare: tayyorla,
    async batch(arr) { const out = []; db.exec('BEGIN'); try { for (const q of arr) out.push(await q.run()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return out; },
    async exec(s) { db.exec(s); return {}; },
    _db: db
  };
}
async function ishgaTushir({ papka, env } = {}) {
  const ROOT = path.join(__dirname, '..', papka || 'deploy');
  const kod = fs.readFileSync(path.join(ROOT, '_worker.js'), 'utf8');
  const mod = await import('data:text/javascript;base64,' + Buffer.from(kod).toString('base64'));
  const telegram = [], aslFetch = globalThis.fetch;
  let id = 1000;
  globalThis.fetch = async (u, o) => {
    const s = String(u);
    if (s.startsWith('https://api.telegram.org/')) {
      let b = {}; try { b = JSON.parse((o && o.body) || '{}'); } catch (e) {}
      telegram.push(Object.assign(b, { _url: s }));
      return new Response(JSON.stringify({ ok: true, result: { message_id: ++id, username: 'sinov_bot' } }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (/^https:\/\/(fcm\.googleapis\.com|[a-z.]*push\.apple\.com|updates\.push\.services\.mozilla\.com)/.test(s)) return new Response('', { status: 201 });
    return aslFetch(u, o);
  };
  const ASSETS = { fetch: async (req) => {
    let p = decodeURIComponent(new URL(req.url).pathname); if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return new Response('yo‘q', { status: 404 });
    const tur = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' }[path.extname(f)] || 'application/octet-stream';
    return new Response(fs.readFileSync(f), { headers: { 'Content-Type': tur } });
  } };
  // bot tokeni kodda yo'q — sinovda soxta qiymat (Telegram so'rovlari baribir tarmoqqa chiqmaydi)
  env = Object.assign({ DB: soxtaKV(), ASSETS, BOT_TOKEN: '000:sinov', CHAT_ID: '1' }, env || {});
  const srv = http.createServer(async (q, r) => {
    const ch = []; for await (const c of q) ch.push(c);
    const body = ch.length ? Buffer.concat(ch) : undefined;
    const req = new Request('http://localhost' + q.url, { method: q.method, headers: q.headers, body: q.method === 'GET' || q.method === 'HEAD' ? undefined : body });
    let res;
    try { res = await mod.default.fetch(req, env, { waitUntil() {} }); } catch (e) { res = new Response(String(e.stack || e), { status: 500 }); }
    r.statusCode = res.status; res.headers.forEach((v, k) => r.setHeader(k, v));
    r.end(Buffer.from(await res.arrayBuffer()));
  });
  await new Promise(ok => srv.listen(0, ok));
  return { url: `http://localhost:${srv.address().port}/`, env, telegram, close: () => { srv.close(); globalThis.fetch = aslFetch; } };
}
module.exports = { ishgaTushir, soxtaKV, sqliteD1 };
