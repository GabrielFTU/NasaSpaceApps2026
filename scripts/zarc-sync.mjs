#!/usr/bin/env node
/**
 * Sincroniza a Tábua de Risco do ZARC (Zoneamento Agrícola de Risco Climático — MAPA)
 * e gera arquivos estáticos compactos em public/zarc/, dois por UF:
 *
 *   <UF>.json         culturas do catálogo de rotação do Semeia (somente sequeiro)
 *   <UF>-outras.json  TODAS as demais culturas zoneadas (perenes, frutíferas, olerícolas,
 *                     forrageiras…), sequeiro e irrigado — só para consulta, carregado sob demanda
 *
 * Fonte oficial (dados abertos, atualização semanal):
 *   https://dados.agricultura.gov.br/dataset/6d3d141c-885e-41a4-ab7f-dc8ff323b96f
 *
 * Por que um script e não uma chamada direta do navegador?
 *   O CSV nacional tem ~220 MB e o servidor do MAPA não envia cabeçalhos CORS.
 *
 * Uso:
 *   npm run zarc:sync                     # baixa a safra configurada abaixo
 *   npm run zarc:sync -- caminho.csv ...  # usa CSV(s) já baixados
 */
import { createReadStream } from "node:fs";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATASET = "https://dados.agricultura.gov.br/dataset/6d3d141c-885e-41a4-ab7f-dc8ff323b96f";
const SOURCES = [
  {
    label: "Safra 2026/2027",
    url: `${DATASET}/resource/139e5a60-1f43-4cc8-aeab-a35dbbf816c0/download/dados-abertos-tabua-de-risco-safra-2026-2027.csv`,
  },
  {
    label: "Perene, Olerícola e Sem Safra",
    url: `${DATASET}/resource/dae65d31-683f-4ac4-ab90-3abd0c1583ba/download/dados-abertos-tabua-de-risco-safra-perene-olericola-sem-safra.csv`,
  },
];

/**
 * Nome da cultura na tábua → culturas do catálogo de rotação (`<idCultura>:<posição>`).
 *
 * Posições: "verao" e "inverno" (2ª safra/safrinha ou cultura de inverno), "anual" (ciclo longo)
 * e "split": a tábua usa um único nome para plantios nas duas épocas, então as janelas são
 * separadas pela data de plantio — ago–dez (decêndios 22–36) → verão; jan–jul (1–21) → inverno
 * (ver splitBySeason).
 *
 * Nomes fora desta tabela vão para <UF>-outras.json (consulta).
 * Manter em sincronia com o campo `zarc` de src/data/crops.ts.
 */
const ROTATION = {
  Soja: ["soja:verao"],
  "Milho 1ª Safra": ["milho:verao"],
  "Milho 2ª Safra": ["milho:inverno"],
  "Milho 1ª Safra consorciado com Braquiária": ["milho_braquiaria:verao"],
  "Milho 2ª Safra consorciado com Braquiária": ["milho_braquiaria:inverno"],
  Feijão: ["feijao:verao"],
  "Feijão 2ª Safra": ["feijao:inverno"],
  "Feijão Caupi": ["feijao_caupi:split"],
  "Sorgo Granífero": ["sorgo:verao"],
  "Sorgo Granífero 2ª Safra": ["sorgo:inverno"],
  "Sorgo Forrageiro": ["sorgo_forrageiro:verao"],
  "Sorgo Forrageiro 2ª Safra": ["sorgo_forrageiro:inverno"],
  Trigo: ["trigo:inverno"],
  Aveia: ["aveia_preta:inverno", "aveia_branca:inverno"],
  "Cevada Grãos": ["cevada:inverno"],
  "Cevada Cervejeira": ["cevada_cervejeira:inverno"],
  Triticale: ["triticale:inverno"],
  Centeio: ["centeio:inverno"],
  Canola: ["canola:inverno"],
  "Algodão Herbáceo": ["algodao:split"],
  Amendoim: ["amendoim:split"],
  Arroz: ["arroz:split"],
  Girassol: ["girassol:split"],
  Mamona: ["mamona:split"],
  Gergelim: ["gergelim:split"],
  "Grão de Bico": ["grao_de_bico:split"],
  Milheto: ["milheto:split"],
  Melancia: ["melancia:split"],
  "Batata Mesa": ["batata:split"],
  Cebola: ["cebola:split"],
  "Mandioca (aipim, macaxeira)": ["mandioca:anual"],
};

const SEQUEIRO = "1";
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/zarc");
const ZERO = "0".repeat(36);
const SUMMER_FROM = 22; // 1º decêndio de agosto

const cleanName = (s) => s.replace(/\s+/g, " ").trim();
const riskChar = (v) => (v === "20" ? "2" : v === "30" ? "3" : v === "40" ? "4" : "0");
const mergeRisk = (a, b) => {
  let s = "";
  for (let i = 0; i < 36; i++) {
    const x = a[i], y = b[i];
    s += x === "0" ? y : y === "0" ? x : x < y ? x : y;
  }
  return s;
};
const isSummerDec = (i) => i + 1 >= SUMMER_FROM; 

function splitBySeason(risks) {
  const summer = Array(36).fill("0");
  const winter = Array(36).fill("0");
  const start = risks.indexOf("0");
  if (start === -1) {
    for (let i = 0; i < 36; i++) (isSummerDec(i) ? summer : winter)[i] = risks[i];
    return [summer.join(""), winter.join("")];
  }
  let win = [];
  const flush = () => {
    if (!win.length) return;
    const nSummer = win.filter(isSummerDec).length;
    for (const i of win) {
      const target = win.length > 18 ? (isSummerDec(i) ? summer : winter) : nSummer * 2 >= win.length ? summer : winter;
      target[i] = risks[i];
    }
    win = [];
  };
  for (let k = 1; k <= 36; k++) {
    const i = (start + k) % 36;
    if (risks[i] === "0") flush();
    else win.push(i);
  }
  flush();
  return [summer.join(""), winter.join("")];
}

async function openLines(src) {
  if (/^https?:/.test(src)) {
    const res = await fetch(src);
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} ao baixar ${src}`);
    return readline.createInterface({ input: Readable.fromWeb(res.body), crlfDelay: Infinity });
  }
  return readline.createInterface({ input: createReadStream(src), crlfDelay: Infinity });
}

/** kind ("rot" | "out") → uf → geocodigo → { n, c: { chave → { p: Set<portaria>, rows: Map } } } */
const store = { rot: new Map(), out: new Map() };
const seenNames = new Set();
const safras = new Set();
let kept = 0;

function put(kind, row, key, values, rowKey) {
  const byUf = store[kind];
  if (!byUf.has(row.UF)) byUf.set(row.UF, new Map());
  const munis = byUf.get(row.UF);
  if (!munis.has(row.geocodigo)) munis.set(row.geocodigo, { n: row.municipio, c: {} });
  const m = munis.get(row.geocodigo);
  m.c[key] ??= { p: new Set(), rows: new Map() };
  const prev = m.c[key].rows.get(rowKey);
  if (prev) prev[3] = mergeRisk(prev[3], values[3]);
  else m.c[key].rows.set(rowKey, values);
  if (row.Portaria) m.c[key].p.add(row.Portaria);
  kept++;
}

async function ingest(src, label) {
  const rl = await openLines(src);
  let header = null;
  let total = 0;
  process.stdout.write(`↓ ${label}… `);
  for await (const line of rl) {
    if (!header) {
      header = line.replace(/^﻿/, "").split(";");
      continue;
    }
    total++;
    const c = line.split(";");
    const row = Object.fromEntries(header.map((h, i) => [h, c[i] ?? ""]));
    const name = cleanName(row.Nome_cultura);
    seenNames.add(name);

    let risks = "";
    for (let d = 1; d <= 36; d++) risks += riskChar(row[`dec${d}`]);
    if (risks === ZERO) continue;
    if (row.SafraIni && row.SafraIni !== "0") safras.add(`${row.SafraIni}/${row.SafraFin}`);

    const solo = Number(row.Cod_Solo);
    const ciclo = Number(row.Cod_Ciclo);
    const nm = Number(row.Cod_NM) || 0;
    const manejo = Number(row.Cod_Outros_Manejos) || 1;
    const targets = ROTATION[name];

    if (!targets) {
      put("out", row, name, [solo, ciclo, nm, risks, manejo], `${solo}|${ciclo}|${nm}|${manejo}`);
      continue;
    }
    if (row.Cod_Outros_Manejos !== SEQUEIRO) continue;
    for (const t of targets) {
      const [id, season] = t.split(":");
      let parts = [[t, risks]];
      if (season === "split") {
        const [s, w] = splitBySeason(risks);
        parts = [
          [`${id}:verao`, s],
          [`${id}:inverno`, w],
        ];
      }
      for (const [key, r] of parts) if (r !== ZERO) put("rot", row, key, [solo, ciclo, nm, r], `${solo}|${ciclo}|${nm}`);
    }
  }
  console.log(`${total.toLocaleString("pt-BR")} linhas lidas`);
}

const args = process.argv.slice(2);
const inputs = args.length ? args.map((a) => ({ url: a, label: path.basename(a) })) : SOURCES;
for (const s of inputs) await ingest(s.url, s.label);

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

const generatedAt = new Date().toISOString();
const safra = [...safras].sort().at(-1) ?? "—";
const index = { safra, generatedAt, source: DATASET, ufs: {} };
let totalBytes = 0;

for (const [kind, suffix] of [["rot", ""], ["out", "-outras"]]) {
  for (const [uf, munis] of [...store[kind]].sort()) {
    // R = dicionário de padrões de risco (36 chars: 0 | 2 | 3 | 4), compartilhado pelo arquivo todo
    const out = { uf, safra, generatedAt, source: DATASET, R: [], municipios: {} };
    const dict = new Map();
    const ref = (s) => {
      if (!dict.has(s)) dict.set(s, out.R.push(s) - 1);
      return dict.get(s);
    };
    for (const [geo, m] of munis) {
      const c = {};
      for (const [k, v] of Object.entries(m.c)) c[k] = { p: [...v.p].join(", "), r: [...v.rows.values()].map(([s, ci, nm, r, man]) => (man ? [s, ci, nm, ref(r), man] : [s, ci, nm, ref(r)])) };
      out.municipios[geo] = { n: m.n, c };
    }
    const json = JSON.stringify(out);
    await writeFile(path.join(OUT_DIR, `${uf}${suffix}.json`), json);
    index.ufs[uf] ??= {};
    index.ufs[uf][kind === "rot" ? "rotacao" : "outras"] = { municipios: munis.size, bytes: Buffer.byteLength(json) };
    totalBytes += Buffer.byteLength(json);
  }
}
await writeFile(path.join(OUT_DIR, "index.json"), JSON.stringify(index, null, 2));

const missing = Object.keys(ROTATION).filter((n) => !seenNames.has(n));
console.log(`✔ ${kept.toLocaleString("pt-BR")} recortes · ${Object.keys(index.ufs).length} UFs · ${(totalBytes / 1e6).toFixed(1)} MB em ${OUT_DIR}`);
console.log(`  ${seenNames.size} culturas na tábua · ${Object.keys(ROTATION).length} no catálogo de rotação · demais em <UF>-outras.json`);
if (missing.length) console.warn(`⚠ Culturas de rotação não encontradas na tábua: ${missing.join(", ")}`);
