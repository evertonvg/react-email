// Servidor local com live reload para visualizar dist/ no navegador.
// O script de reload é injetado só na resposta do servidor — o index.html
// em dist/ (e no zip) continua limpo.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const RELOAD_SCRIPT = `<script>
new EventSource("/__reload").onmessage = () => location.reload();
</script>`;

function inject(html) {
  return html.includes("</body>") ? html.replace("</body>", `${RELOAD_SCRIPT}</body>`) : html + RELOAD_SCRIPT;
}

function indexPage(distDir) {
  const names = fs.existsSync(distDir)
    ? fs.readdirSync(distDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];
  const items = names.map((n) => `<li><a href="/${n}/">${n}</a></li>`).join("") || "<li>Nenhum template compilado.</li>";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Templates</title>
<style>body{font-family:system-ui,sans-serif;max-width:600px;margin:40px auto;padding:0 16px}a{font-size:18px}li{margin:8px 0}</style>
</head><body><h1>Templates</h1><ul>${items}</ul></body></html>`;
}

export function startServer(distDir, port) {
  const clients = new Set();

  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://localhost").pathname);

    if (url === "/__reload") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      res.write(": conectado\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    if (url === "/") {
      res.writeHead(200, { "Content-Type": MIME[".html"] });
      return res.end(inject(indexPage(distDir)));
    }

    let file = path.join(distDir, url);
    if (!file.startsWith(distDir + path.sep)) {
      res.writeHead(403);
      return res.end();
    }
    if (url.endsWith("/")) file = path.join(file, "index.html");

    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Não encontrado");
      }
      const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
      res.end(type === MIME[".html"] ? inject(data.toString()) : data);
    });
  });

  server.listen(port, () => console.log(`Visualize em http://localhost:${port}`));

  return function reload() {
    for (const res of clients) res.write("data: reload\n\n");
  };
}
