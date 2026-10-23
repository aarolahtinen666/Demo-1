// Paikallinen kehityspalvelin ilman Netlify CLI:tä: staattiset sivut + funktiot muistivarastolla.
// Aja: node scripts/link-mock.mjs && node scripts/dev-server.mjs  ->  http://localhost:8888
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import api from "../netlify/functions/api.mjs";
import admin from "../netlify/functions/admin.mjs";
import login from "../netlify/functions/admin-login.mjs";

globalThis.Netlify = { env: { get: (k) => process.env[k] } };
const PORT = Number(process.env.PORT) || 8888;
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json" };
const pub = new URL("../public/", import.meta.url).pathname;

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    let fn = null;
    if (url.pathname === "/api/admin-login") fn = login;
    else if (url.pathname.startsWith("/api/admin/")) fn = admin;
    else if (url.pathname.startsWith("/api/")) fn = api;
    if (fn) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const r = await fn(new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) }));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (p.endsWith("/")) p += "index.html";
    if (!extname(p)) p += ".html";
    const body = await readFile(join(pub, p));
    res.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(await readFile(join(pub, "404.html")));
  }
}).listen(PORT, () => console.log(`Kehityspalvelin: http://localhost:${PORT}`));
