/**
 * Cliente NASA GIBS (Global Imagery Browse Services) — público, sem chave e com CORS liberado.
 *
 * O GIBS publica produtos como imagens coloridas. Para obter o VALOR em um ponto:
 *  1. pedimos ao WMS uma imagem de 3×3 px centrada na coordenada, na data desejada;
 *  2. lemos a cor do pixel central;
 *  3. convertemos a cor no valor usando a paleta oficial do produto (colormap XML).
 * A precisão é a do intervalo de cada cor da paleta (~0,003 m³/m³ no SMAP; ~0,007 no NDVI).
 */

const WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";
const COLORMAPS = "https://gibs.earthdata.nasa.gov/colormaps/v1.3";

interface ColorEntry {
  r: number;
  g: number;
  b: number;
  value: number;
}

const colormapCache = new Map<string, Promise<ColorEntry[]>>();

function loadColormap(name: string): Promise<ColorEntry[]> {
  if (!colormapCache.has(name)) {
    const p = fetch(`${COLORMAPS}/${name}.xml`)
      .then((r) => {
        if (!r.ok) throw new Error(`Paleta ${name} indisponível`);
        return r.text();
      })
      .then((xml) => {
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        const entries: ColorEntry[] = [];
        doc.querySelectorAll("ColorMapEntry").forEach((el) => {
          if (el.getAttribute("transparent") === "true" || el.getAttribute("nodata") === "true") return;
          const [r, g, b] = (el.getAttribute("rgb") ?? "").split(",").map(Number);
          const nums = (el.getAttribute("value") ?? "").match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
          if (nums.length === 0) return;
          const value = nums.length >= 2 ? (nums[0] + nums[1]) / 2 : nums[0];
          entries.push({ r, g, b, value });
        });
        if (!entries.length) throw new Error(`Paleta ${name} vazia`);
        return entries;
      })
      .catch((e) => {
        colormapCache.delete(name);
        throw e;
      });
    colormapCache.set(name, p);
  }
  return colormapCache.get(name)!;
}

function nearest(entries: ColorEntry[], r: number, g: number, b: number): number {
  let best = entries[0];
  let bestD = Infinity;
  for (const e of entries) {
    const d = (e.r - r) ** 2 + (e.g - g) ** 2 + (e.b - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best.value;
}

async function readCenterPixel(url: string): Promise<[number, number, number, number]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GIBS respondeu HTTP ${res.status}`);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  const d = ctx.getImageData(Math.floor(bmp.width / 2), Math.floor(bmp.height / 2), 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

/** Valor do produto no ponto/data, ou null quando não há dado (pixel transparente). */
export async function samplePoint(opts: {
  layer: string;
  colormap: string;
  date: string;
  lat: number;
  lon: number;
  /** meia-largura da janela em graus (próxima da resolução do produto) */
  halfDeg: number;
}): Promise<number | null> {
  const { layer, colormap, date, lat, lon, halfDeg } = opts;
  const bbox = [lat - halfDeg, lon - halfDeg, lat + halfDeg, lon + halfDeg].map((v) => v.toFixed(5)).join(",");
  const url =
    `${WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${layer}&STYLES=&CRS=EPSG:4326` +
    `&BBOX=${bbox}&WIDTH=3&HEIGHT=3&FORMAT=image/png&TRANSPARENT=TRUE&TIME=${date}`;
  const [entries, [r, g, b, a]] = await Promise.all([loadColormap(colormap), readCenterPixel(url)]);
  if (a < 128) return null;
  return nearest(entries, r, g, b);
}

/** Executa tarefas com concorrência limitada (evita dezenas de requisições simultâneas). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}
