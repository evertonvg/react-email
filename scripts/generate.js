// Gera um template em templates/ a partir de um modelo em fill-templates/,
// substituindo as variáveis {{ nome }} dos .mjml pelos valores do variables.json.
//
// Uso:
//   npm run generate                       pergunta qual modelo usar
//   npm run generate -- promocao           usa o modelo informado
//   npm run generate -- promocao --force   sobrescreve o destino sem perguntar
//
// variables.json:
//   {
//     "output": "cliente-x/promo-outubro",   destino dentro de templates/ (opcional: pergunta se faltar)
//     "titulo": "50% OFF",                   usado como {{ titulo }}
//     "empresa": { "nome": "ACME" }          usado como {{ empresa.nome }}
//   }
//
// Se algum .mjml usar uma variável que não está no JSON, nada é gerado e o comando falha.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import readline from "node:readline/promises";

const ROOT = path.resolve(import.meta.dirname, "..");
const FILL_DIR = path.join(ROOT, "fill-templates");
const TEMPLATES_DIR = path.join(ROOT, "templates");
const VARIABLES_FILE = "variables.json";
const VARIABLE_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;

const args = process.argv.slice(2);
const force = args.includes("--force");
const [nameArg] = args.filter((a) => !a.startsWith("--"));

let rl;
const ask = (question) => {
  rl ??= readline.createInterface({ input: process.stdin, output: process.stdout });
  return rl.question(question);
};

function fail(message) {
  console.error(`✘ ${message}`);
  rl?.close();
  process.exit(1);
}

// Modelo = pasta com index.mjml + variables.json (pode estar em subpastas).
function findModels(dir = FILL_DIR, prefix = "") {
  if (!fs.existsSync(dir)) return [];
  if (prefix && fs.existsSync(path.join(dir, "index.mjml"))) {
    return fs.existsSync(path.join(dir, VARIABLES_FILE)) ? [prefix] : [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "images")
    .flatMap((d) => findModels(path.join(dir, d.name), prefix ? `${prefix}/${d.name}` : d.name))
    .sort();
}

async function chooseModel(models) {
  if (nameArg) {
    const name = nameArg.replace(/^fill-templates\//, "").replace(/\/+$/, "");
    if (!models.includes(name)) fail(`Modelo não encontrado: ${name}\n  Disponíveis: ${models.join(", ")}`);
    return name;
  }
  console.log("Modelos em fill-templates/:");
  models.forEach((m, i) => console.log(`  ${i + 1}) ${m}`));
  const answer = (await ask("Qual modelo? (número ou nome) ")).trim();
  const chosen = models[Number(answer) - 1] ?? answer.replace(/\/+$/, "");
  if (!models.includes(chosen)) fail(`Modelo não encontrado: ${answer}`);
  return chosen;
}

function readVariables(modelDir) {
  const file = path.join(modelDir, VARIABLES_FILE);
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("precisa ser um objeto { }");
    return data;
  } catch (err) {
    fail(`${path.relative(ROOT, file)} inválido: ${err.message}`);
  }
}

// "empresa.nome" → data.empresa.nome
function lookup(data, key) {
  return key.split(".").reduce((obj, part) => (obj != null && Object.hasOwn(obj, part) ? obj[part] : undefined), data);
}

// Todas as chaves "folha" do JSON, para avisar das que não foram usadas.
function leafKeys(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v !== null && typeof v === "object" && !Array.isArray(v) ? leafKeys(v, key) : [key];
  });
}

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name);
    return d.isDirectory() ? listFiles(full, base) : [path.relative(base, full)];
  });
}

// Substitui as variáveis de um arquivo; devolve o texto novo e os problemas encontrados.
function fill(source, data, file, used) {
  const problems = [];
  const lines = source.split("\n");
  const result = lines.map((line, i) =>
    line.replace(VARIABLE_RE, (match, key) => {
      used.add(key);
      const value = lookup(data, key);
      const where = `${file}:${i + 1}`;
      if (value === undefined) {
        problems.push(`${where}  {{ ${key} }} não existe no ${VARIABLES_FILE}`);
      } else if (value === null || typeof value === "object") {
        problems.push(`${where}  {{ ${key} }} precisa ser texto, número ou booleano`);
      } else {
        return String(value);
      }
      return match;
    }),
  );
  return { text: result.join("\n"), problems };
}

function validateOutput(output) {
  const clean = String(output).trim().replace(/^templates\//, "").replace(/\/+$/, "");
  if (!clean || path.isAbsolute(clean) || clean.split("/").some((p) => p === ".." || p === "." || p === "")) {
    fail(`"output" inválido: ${output} (use algo como cliente-x/campanha)`);
  }
  return clean;
}

async function main() {
  const models = findModels();
  if (!models.length) fail(`Nenhum modelo em fill-templates/ (cada um precisa de index.mjml + ${VARIABLES_FILE})`);

  const model = await chooseModel(models);
  const modelDir = path.join(FILL_DIR, model);
  const { output, ...data } = readVariables(modelDir);

  // 1. Substitui tudo em memória; só grava se não houver nenhum problema.
  const used = new Set();
  const problems = [];
  const files = listFiles(modelDir)
    .filter((f) => f !== VARIABLES_FILE && !path.basename(f).startsWith("."))
    .map((rel) => {
      const src = path.join(modelDir, rel);
      if (!rel.endsWith(".mjml")) return { rel, src };
      const filled = fill(fs.readFileSync(src, "utf8"), data, path.join("fill-templates", model, rel), used);
      problems.push(...filled.problems);
      return { rel, text: filled.text };
    });

  if (problems.length) {
    fail(`Variáveis com problema — nada foi gerado:\n  ${problems.join("\n  ")}`);
  }

  const unused = leafKeys(data).filter((k) => !used.has(k));
  if (unused.length) console.warn(`⚠ Não usadas no template: ${unused.join(", ")}`);

  // 2. Destino
  const dest = validateOutput(output ?? (await ask("Destino em templates/ (ex.: cliente-x/campanha): ")));
  const destDir = path.join(TEMPLATES_DIR, dest);

  if (fs.existsSync(destDir)) {
    if (!fs.existsSync(path.join(destDir, "index.mjml"))) {
      fail(`templates/${dest} já existe e não é um template (pode ser a pasta de um cliente) — escolha outro "output"`);
    }
    if (!force) {
      if (!process.stdin.isTTY) fail(`templates/${dest} já existe — use --force para sobrescrever`);
      const answer = (await ask(`templates/${dest} já existe. Sobrescrever? (s/N) `)).trim().toLowerCase();
      if (answer !== "s" && answer !== "sim") fail("Cancelado.");
    }
    fs.rmSync(destDir, { recursive: true, force: true });
  } else {
    // Não pode ficar dentro de outro template (ele não seria encontrado pelo build).
    let parent = path.dirname(destDir);
    while (parent.startsWith(TEMPLATES_DIR + path.sep)) {
      if (fs.existsSync(path.join(parent, "index.mjml"))) {
        fail(`templates/${dest} ficaria dentro do template templates/${path.relative(TEMPLATES_DIR, parent)}`);
      }
      parent = path.dirname(parent);
    }
  }
  rl?.close();

  // 3. Grava
  for (const f of files) {
    const target = path.join(destDir, f.rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (f.text !== undefined) fs.writeFileSync(target, f.text);
    else fs.copyFileSync(f.src, target);
  }
  console.log(`✔ fill-templates/${model} → templates/${dest}`);

  // 4. Compila para conferir
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "build.js"), dest], { stdio: "inherit" });
  console.log(`Visualize com npm run dev em http://localhost:3000/${dest}/`);
}

await main();
