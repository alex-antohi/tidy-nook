// Tidy Nook — tiny local server, no dependencies.
// Serves the hub UI, stores your data in data.json, and streams songs from ./music
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 4321;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const MUSIC = path.join(ROOT, 'music');
const DATA = path.join(ROOT, 'data.json');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
  '.wav': 'audio/wav', '.flac': 'audio/flac', '.aac': 'audio/aac', '.webm': 'audio/webm',
};
const AUDIO = new Set(['.mp3', '.m4a', '.ogg', '.opus', '.wav', '.flac', '.aac', '.webm']);

fs.mkdirSync(MUSIC, { recursive: true });

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

// Resolve a URL path inside a base folder, refusing anything that escapes it.
function safeJoin(base, rel) {
  const p = path.normalize(path.join(base, decodeURIComponent(rel)));
  return p.startsWith(base + path.sep) || p === base ? p : null;
}

function listMusic(dir = MUSIC, prefix = '') {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? prefix + '/' + e.name : e.name;
    if (e.isDirectory()) out = out.concat(listMusic(path.join(dir, e.name), rel));
    else if (AUDIO.has(path.extname(e.name).toLowerCase())) out.push(rel);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function streamFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { error: 'not found' });
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      let start = range[1] ? parseInt(range[1], 10) : 0;
      let end = range[2] ? parseInt(range[2], 10) : st.size - 1;
      if (!range[1] && range[2]) { start = st.size - parseInt(range[2], 10); end = st.size - 1; }
      if (start >= st.size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
        return res.end();
      }
      end = Math.min(end, st.size - 1);
      res.writeHead(206, {
        'Content-Type': type, 'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1,
      });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
      fs.createReadStream(file).pipe(res);
    }
  });
}

function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (p === '/api/data' && req.method === 'GET') {
      if (!fs.existsSync(DATA)) return send(res, 200, null);
      return send(res, 200, fs.readFileSync(DATA, 'utf8'));
    }
    if (p === '/api/data' && req.method === 'PUT') {
      const body = await readBody(req);
      JSON.parse(body); // validate
      const tmp = DATA + '.tmp';
      fs.writeFileSync(tmp, body);
      if (fs.existsSync(DATA)) fs.copyFileSync(DATA, DATA + '.bak');
      fs.renameSync(tmp, DATA);
      return send(res, 200, { ok: true });
    }
    if (p === '/api/music') return send(res, 200, listMusic());
    if (p === '/api/oembed') {
      // Fetch a YouTube video's title server-side (avoids browser CORS issues).
      const target = url.searchParams.get('url') || '';
      if (!/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(target)) return send(res, 400, { error: 'bad url' });
      const api = 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(target);
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await fetch(api, { signal: AbortSignal.timeout(6000) });
          if (r.ok) {
            const j = await r.json();
            return send(res, 200, { title: j.title, author: j.author_name });
          }
          if (r.status === 400 || r.status === 404 || r.status === 401) break; // private / removed
        } catch {}
        await new Promise((ok) => setTimeout(ok, 700 * (attempt + 1)));
      }
      return send(res, 200, {});
    }
    if (p.startsWith('/music/')) {
      const f = safeJoin(MUSIC, p.slice('/music/'.length));
      return f ? streamFile(req, res, f) : send(res, 403, { error: 'forbidden' });
    }
    const f = safeJoin(PUBLIC, p === '/' ? 'index.html' : p.slice(1));
    return f ? streamFile(req, res, f) : send(res, 403, { error: 'forbidden' });
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Tidy Nook is open at http://localhost:${PORT}`);
});
