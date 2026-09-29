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

// Templates compilados: toda pasta de dist/ com index.html, como caminho relativo.
function findBuilt(dir, prefix = "") {
  if (!fs.existsSync(dir)) return [];
  if (prefix && fs.existsSync(path.join(dir, "index.html"))) return [prefix];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "images")
    .flatMap((d) => findBuilt(path.join(dir, d.name), prefix ? `${prefix}/${d.name}` : d.name))
    .sort();
}

// Lista agrupada pela primeira pasta (cliente). `base` filtra, ex.: "cliente-x".
function indexPage(distDir, base = "") {
  const names = findBuilt(distDir).filter((n) => !base || n.startsWith(`${base}/`));
  const groups = Map.groupBy(names, (n) => (n.includes("/") ? n.slice(0, n.indexOf("/")) : ""));
  const body =
    [...groups]
      .map(([group, list]) => {
        const items = list
          .map((n) => `<li><a href="/${n}/">${group ? n.slice(group.length + 1) : n}</a></li>`)
          .join("");
        return `${group && !base ? `<h2><a href="/${group}/">${group}</a></h2>` : ""}<ul>${items}</ul>`;
      })
      .join("") || "<p>Nenhum template compilado.</p>";
  const title = base || "Templates";
  const back = base ? `<p><a href="/">← todos</a></p>` : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:600px;margin:40px auto;padding:0 16px}li{margin:8px 0;font-size:18px}h2{margin:28px 0 8px;font-size:16px;text-transform:uppercase;letter-spacing:.05em}h2 a{color:inherit;text-decoration:none}</style>
</head><body>${back}<h1>${title}</h1>${body}</body></html>`;
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
      // Pasta agrupadora (ex.: /cliente-x/) sem index.html: lista os templates dela
      if (err && url.endsWith("/")) {
        res.writeHead(200, { "Content-Type": MIME[".html"] });
        return res.end(inject(indexPage(distDir, url.replace(/^\/|\/$/g, ""))));
      }
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
