/**
 * Cotações para o cálculo de retorno da rotação.
 *
 *  - HOJE: indicadores diários do CEPEA/ESALQ, lidos do widget público "cotações para o seu site"
 *    (proxy /cepea no Vite; em produção, a API do backend). Mercado físico, R$.
 *  - NA COLHEITA (projeção): o preço de hoje × a variação da curva de contratos futuros (CBOT/ICE)
 *    entre o vencimento mais próximo e o vencimento da época de colheita. É uma estimativa: não
 *    considera mudança do câmbio nem do prêmio de porto/basis.
 *
 * Conversões para a unidade usada no motor (economics.ts): trigo R$/t → R$/sc 60 kg;
 * algodão ¢R$/lp → R$/@ (15 kg de pluma).
 */

export interface MarketQuote {
  /** Chaves de economics.ts que usam esta cotação (ex.: milho e milho:inverno). */
  keys: string[];
  label: string;
  /** R$ na unidade do motor (sc, @ ou t). */
  price: number;
  unit: string;
  date: string; // DD/MM/AAAA como publicado
  source: string;
}

export interface HarvestQuote {
  keys: string[];
  price: number;
  /** Variação aplicada sobre o preço de hoje (1,05 = +5%). */
  ratio: number;
  contract: string; // ex.: "CBOT soja mai/27"
}

export interface MarketData {
  spot: MarketQuote[];
  harvest: HarvestQuote[];
  fetchedAt: string;
}

/* ---------- CEPEA ---------- */

const LB_PER_ARROBA = 15 / 0.45359237;

const CEPEA: { id: number; name: RegExp; keys: string[]; label: string; unit: string; convert?: (v: number) => number }[] = [
  { id: 12, name: /^soja - pr/i, keys: ["soja"], label: "Soja (PR)", unit: "sc" },
  { id: 77, name: /^milho/i, keys: ["milho", "milho:inverno", "milho_braquiaria", "milho_braquiaria:inverno"], label: "Milho", unit: "sc" },
  { id: 178, name: /^trigo - pr/i, keys: ["trigo"], label: "Trigo (PR)", unit: "sc", convert: (t) => t * 0.06 },
  { id: 54, name: /^algod/i, keys: ["algodao"], label: "Algodão (pluma)", unit: "@", convert: (c) => (c / 100) * LB_PER_ARROBA },
  { id: 91, name: /^arroz/i, keys: ["arroz"], label: "Arroz em casca", unit: "sc 50 kg" },
  { id: 72, name: /^mandioca/i, keys: ["mandioca"], label: "Mandioca", unit: "t" },
];

const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

async function fetchCepea(): Promise<MarketQuote[]> {
  const qs = CEPEA.map((c) => `id_indicador%5B%5D=${c.id}`).join("&");
  const r = await fetch(`/cepea/br/widgetproduto.js.php?${qs}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`CEPEA respondeu HTTP ${r.status}`);
  const html = (await r.text()).replace(/\s+/g, " ");
  const rows = [...html.matchAll(/<td>([\d/]+)<\/td> <td><span class="maior">([^<]+)<\/span>.*?<td>[^<]*<span class="maior">([^<]+)<\/span>/g)];
  return rows.flatMap((m) => {
    const c = CEPEA.find((x) => x.name.test(m[2].trim()));
    if (!c) return [];
    const v = num(m[3]);
    if (!Number.isFinite(v)) return [];
    return [{ keys: c.keys, label: c.label, price: c.convert ? c.convert(v) : v, unit: c.unit, date: m[1], source: `CEPEA/ESALQ — ${m[2].trim()}` }];
  });
}

/* ---------- Futuros (curva) ---------- */

const MONTH_CODE = "FGHJKMNQUVXZ";
const MONTH_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Contrato que vence logo após a colheita da PRÓXIMA safra (pelo menos 3 meses à frente). */
function harvestContract(root: string, exchange: string, harvestMonth: number, contractMonth: number) {
  const now = new Date();
  const y = harvestMonth - now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() + 1;
  const yy = String(y).slice(2);
  return { symbol: `${root}${MONTH_CODE[contractMonth]}${yy}.${exchange}`, label: `${MONTH_PT[contractMonth]}/${yy}` };
}

const FUTURES: { keys: string[]; front: string; name: string; harvest: ReturnType<typeof harvestContract> }[] = [
  { keys: ["soja"], front: "ZS=F", name: "CBOT soja", harvest: harvestContract("ZS", "CBT", 2, 4) }, // colhe mar → mai
  { keys: ["milho", "milho_braquiaria"], front: "ZC=F", name: "CBOT milho", harvest: harvestContract("ZC", "CBT", 2, 4) },
  { keys: ["milho:inverno", "milho_braquiaria:inverno"], front: "ZC=F", name: "CBOT milho", harvest: harvestContract("ZC", "CBT", 6, 6) }, // safrinha jul
  { keys: ["trigo"], front: "ZW=F", name: "CBOT trigo", harvest: harvestContract("ZW", "CBT", 9, 11) }, // colhe out → dez
  { keys: ["algodao"], front: "CT=F", name: "ICE algodão", harvest: harvestContract("CT", "NYB", 6, 6) },
];

async function lastPrice(symbol: string): Promise<number> {
  const r = await fetch(`/yahoo/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Futuros: HTTP ${r.status}`);
  const j = await r.json();
  const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (typeof p !== "number") throw new Error(`Sem cotação para ${symbol}`);
  return p;
}

async function fetchHarvest(spot: MarketQuote[]): Promise<HarvestQuote[]> {
  const symbols = [...new Set(FUTURES.flatMap((f) => [f.front, f.harvest.symbol]))];
  const prices = new Map<string, number>();
  await Promise.all(
    symbols.map((s) =>
      lastPrice(s)
        .then((p) => prices.set(s, p))
        .catch(() => {}),
    ),
  );
  return FUTURES.flatMap((f) => {
    const front = prices.get(f.front);
    const later = prices.get(f.harvest.symbol);
    const base = spot.find((q) => q.keys.includes(f.keys[0]));
    if (!front || !later || !base) return [];
    const ratio = later / front;
    return [{ keys: f.keys, price: base.price * ratio, ratio, contract: `${f.name} ${f.harvest.label}` }];
  });
}

/* ---------- API pública (com cache diário) ---------- */

const CACHE_KEY = "semeia:market:v1";
const TTL_MS = 3 * 60 * 60 * 1000;

export async function getMarketData(force = false): Promise<MarketData> {
  if (!force) {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as MarketData | null;
      if (c && Date.now() - new Date(c.fetchedAt).getTime() < TTL_MS) return c;
    } catch {
      /* sem cache */
    }
  }
  const spot = await fetchCepea();
  if (!spot.length) throw new Error("O CEPEA não devolveu cotações.");
  const harvest = await fetchHarvest(spot).catch(() => []);
  const data: MarketData = { spot, harvest, fetchedAt: new Date().toISOString() };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    /* armazenamento cheio/bloqueado */
  }
  return data;
}

export type PriceBasis = "hoje" | "colheita" | "referencia";

/** Preços de mercado no formato de ajuste do motor (só o campo price). */
export function marketPrices(data: MarketData | null, basis: PriceBasis): Record<string, { price: number }> {
  if (!data || basis === "referencia") return {};
  const out: Record<string, { price: number }> = {};
  for (const q of data.spot) for (const k of q.keys) out[k] = { price: q.price };
  if (basis === "colheita") for (const h of data.harvest) for (const k of h.keys) out[k] = { price: h.price };
  return out;
}
