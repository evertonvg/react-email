// Compila templates/<nome>/index.mjml para dist/<nome>/index.html (+ images/)
// e, com --zip, gera dist/<nome>.zip pronto para entregar ao cliente.
//
// Uso:
//   node scripts/build.js [nome...] [--zip] [--cdn=https://cdn.exemplo.com/pasta] [--watch] [--serve]
//
//   nome     compila só os templates informados (padrão: todos). Aceita o caminho
//            completo (cliente-x/black-friday) ou só a pasta do cliente (cliente-x)
//   --zip    gera o pacote zip de cada template
//   --cdn    troca "images/..." por URL absoluta (para plataformas que não hospedam imagens)
//   --watch  recompila ao salvar qualquer arquivo em templates/ ou components/
//   --serve  sobe servidor com live reload em http://localhost:3000 (porta via PORT=)

import fs from "node:fs";
import path from "node:path";
import mjml2html from "mjml";
import { ZipArchive } from "archiver";
import { startServer } from "./serve.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const TEMPLATES_DIR = path.join(ROOT, "templates");
const COMPONENTS_DIR = path.join(ROOT, "components");
const DIST_DIR = path.join(ROOT, "dist");

// Aliases para <mj-include path="@components/header.mjml" />
const ALIASES = {
  "@components": COMPONENTS_DIR,
  "@templates": TEMPLATES_DIR,
};

// O MJML recusa caminhos absolutos no mj-include e o pré-processador não sabe em qual
// arquivo está. Então o alias vira um caminho relativo que sobe até a raiz do disco
// ("../" a mais é ignorado) e desce até a pasta — funciona de qualquer arquivo.
const TO_FS_ROOT = "../".repeat(64);
function resolveAliases(xml) {
  return xml.replace(/(<mj-include\b[^>]*?\bpath=["'])(@\w+)\//g, (match, prefix, alias) => {
    if (!ALIASES[alias]) {
      console.warn(`  ⚠ alias desconhecido: ${alias} (disponíveis: ${Object.keys(ALIASES).join(", ")})`);
      return match;
    }
    return `${prefix}${TO_FS_ROOT}${ALIASES[alias].replace(/^\//, "")}/`;
  });
}

const args = process.argv.slice(2);
const flags = {
  zip: args.includes("--zip"),
  watch: args.includes("--watch"),
  serve: args.includes("--serve"),
  cdn: args.find((a) => a.startsWith("--cdn="))?.slice("--cdn=".length).replace(/\/$/, ""),
};
const only = args.filter((a) => !a.startsWith("--"));

// Uma pasta com index.mjml é um template; sem ele, é agrupadora (ex.: cliente) e
// a busca desce nela. Nomes são caminhos relativos: "cliente-x/black-friday".
function findTemplates(dir = TEMPLATES_DIR, prefix = "") {
  if (prefix && fs.existsSync(path.join(dir, "index.mjml"))) return [prefix];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "images")
    .flatMap((d) => findTemplates(path.join(dir, d.name), prefix ? `${prefix}/${d.name}` : d.name))
    .sort();
}

// Filtro aceita o nome exato ou uma pasta agrupadora: "cliente-x" compila todos dele.
function listTemplates() {
  const all = findTemplates();
  if (!only.length) return all;

  const filters = only.map((n) => n.replace(/^templates\//, "").replace(/\/+$/, ""));
  const missing = filters.filter((f) => !all.some((t) => t === f || t.startsWith(`${f}/`)));
  if (missing.length) throw new Error(`Template não encontrado: ${missing.join(", ")}`);
  return all.filter((t) => filters.some((f) => t === f || t.startsWith(`${f}/`)));
}

async function buildTemplate(name) {
  const srcDir = path.join(TEMPLATES_DIR, name);
  const outDir = path.join(DIST_DIR, name);

  const source = fs.readFileSync(path.join(srcDir, "index.mjml"), "utf8");

  // {{ variavel }} sobrando = modelo de fill-templates/ copiado sem passar pelo npm run generate
  const leftover = source
    .split("\n")
    .flatMap((line, i) => [...line.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map((m) => `linha ${i + 1}: {{ ${m[1]} }}`));
  if (leftover.length) {
    throw new Error(`variáveis não substituídas (use npm run generate):\n    ${leftover.join("\n    ")}`);
  }
  const { html, errors } = await mjml2html(source, {
    filePath: path.join(srcDir, "index.mjml"), // permite <mj-include> relativo
    ignoreIncludes: false, // MJML 5 desliga includes por padrão
    includePath: [TEMPLATES_DIR, COMPONENTS_DIR], // só essas pastas podem ser incluídas
    preprocessors: [resolveAliases], // roda também em cada arquivo incluído
    validationLevel: "soft",
  });

  for (const e of errors) console.warn(`  ⚠ ${name}: linha ${e.line} — ${e.message}`);
  if (html.includes("mj-include denied")) {
    console.warn(`  ⚠ ${name}: mj-include bloqueado — só é permitido incluir arquivos de templates/ ou components/`);
  }

  const finalHtml = flags.cdn
    ? html.replace(/(src|href|background)="images\//g, `$1="${flags.cdn}/${name}/images/`)
    : html;

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), finalHtml);

  const imagesDir = path.join(srcDir, "images");
  if (fs.existsSync(imagesDir)) {
    fs.cpSync(imagesDir, path.join(outDir, "images"), {
      recursive: true,
      filter: (p) => !path.basename(p).startsWith("."),
    });
  }

  if (flags.zip) await zipDir(outDir, `${outDir}.zip`);

  console.log(`✔ ${name}${flags.zip ? ` → dist/${name}.zip` : ""}`);
}

function zipDir(dir, zipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(dir, false); // conteúdo na raiz do zip: index.html + images/
    archive.finalize();
  });
}

async function buildAll() {
  let names;
  try {
    names = listTemplates();
  } catch (err) {
    console.error(`✘ ${err.message}`);
    process.exit(1);
  }
  for (const name of names) {
    try {
      await buildTemplate(name);
    } catch (err) {
      console.error(`✘ ${name}: ${err.message}`);
      process.exitCode = 1;
    }
  }
}

await buildAll();

const reload = flags.serve ? startServer(DIST_DIR, Number(process.env.PORT) || 3000) : () => {};

if (flags.watch) {
  console.log("Observando templates/ e components/ ...");
  let timer;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await buildAll();
      reload();
    }, 150);
  };
  for (const dir of [TEMPLATES_DIR, COMPONENTS_DIR]) {
    if (fs.existsSync(dir)) fs.watch(dir, { recursive: true }, rebuild);
  }
}
