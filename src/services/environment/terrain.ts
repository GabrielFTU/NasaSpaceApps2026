import { pointInPolygon, polygonBounds } from "@/lib/geo";
import { SLOPE_CLASSES, slopeClassIndex } from "./catalog";

/**
 * Elevação e declividade a partir dos Terrain Tiles (AWS Open Data, formato "terrarium").
 * No Brasil a fonte dos tiles é o SRTM (NASA/USGS, ~30 m). Cada pixel PNG codifica a altitude:
 *   elevação (m) = R × 256 + G + B / 256 − 32768
 *
 * Estatísticas do talhão = pixels cujo CENTRO cai dentro do polígono. Nada é interpolado:
 * cada valor vem de um pixel real do modelo de elevação.
 */

export const TERRAIN_SOURCE = {
  name: "Terrain Tiles (AWS Open Data)",
  base: "SRTM 1″ (NASA/USGS) no Brasil",
  url: "https://registry.opendata.aws/terrain-tiles/",
  /** Zoom de leitura: ~18 m/pixel no Paraná — próximo dos 30 m do SRTM, sem inventar detalhe. */
  zoom: 13,
};

const TILE = 256;
const tileUrl = (z: number, x: number, y: number) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

const tileCache = new Map<string, Promise<Float32Array>>();

export function loadElevationTile(z: number, x: number, y: number): Promise<Float32Array> {
  const key = `${z}/${x}/${y}`;
  if (!tileCache.has(key)) {
    const p = fetch(tileUrl(z, x, y))
      .then((r) => {
        if (!r.ok) throw new Error(`Terrain Tiles HTTP ${r.status}`);
        return r.blob();
      })
      .then((b) => createImageBitmap(b))
      .then((bmp) => {
        const canvas = document.createElement("canvas");
        canvas.width = TILE;
        canvas.height = TILE;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(bmp, 0, 0);
        const px = ctx.getImageData(0, 0, TILE, TILE).data;
        const out = new Float32Array(TILE * TILE);
        for (let i = 0; i < out.length; i++) out[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
        return out;
      })
      .catch((e) => {
        tileCache.delete(key);
        throw e;
      });
    if (tileCache.size > 200) tileCache.delete(tileCache.keys().next().value!);
    tileCache.set(key, p);
  }
  return tileCache.get(key)!;
}

/* ---------- Projeção Web Mercator (pixels globais) ---------- */

const worldPx = (z: number) => TILE * 2 ** z;
const lonToPx = (lon: number, z: number) => ((lon + 180) / 360) * worldPx(z);
const latToPx = (lat: number, z: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * worldPx(z);
};
const pxToLon = (px: number, z: number) => (px / worldPx(z)) * 360 - 180;
const pxToLat = (py: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * py) / worldPx(z);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
};
/** Tamanho real (m) de um pixel na latitude. */
export const pixelSizeM = (lat: number, z: number) => (40075016.686 * Math.cos((lat * Math.PI) / 180)) / worldPx(z);

/**
 * Declividade (%) pelo método de Horn numa grade `w × h` com acesso `at(i, j)` (bordas replicadas).
 */
function hornSlope(at: (i: number, j: number) => number, i: number, j: number, cell: number) {
  const a = at(i - 1, j - 1), b = at(i, j - 1), c = at(i + 1, j - 1);
  const d = at(i - 1, j), f = at(i + 1, j);
  const g = at(i - 1, j + 1), h = at(i, j + 1), k = at(i + 1, j + 1);
  const dzdx = (c + 2 * f + k - (a + 2 * d + g)) / (8 * cell);
  const dzdy = (g + 2 * h + k - (a + 2 * b + c)) / (8 * cell);
  return Math.sqrt(dzdx * dzdx + dzdy * dzdy) * 100;
}

export interface TerrainStats {
  pixelCount: number;
  pixelSizeM: number;
  elevation: { min: number; max: number; mean: number };
  slope: { mean: number; p90: number; max: number };
  /** Fração (0–1) da área do talhão em cada classe de SLOPE_CLASSES. */
  slopeClasses: number[];
  zoom: number;
  source: string;
  fetchedAt: string;
}

/** Estatísticas de elevação/declividade dentro do polígono [lat, lon][]. */
export async function computeTerrainStats(polygon: [number, number][]): Promise<TerrainStats> {
  const b = polygonBounds(polygon);
  let z = TERRAIN_SOURCE.zoom;
  // talhões muito grandes: reduz o zoom para não baixar dezenas de tiles
  const tilesAt = (zz: number) =>
    (Math.floor(lonToPx(b.east, zz) / TILE) - Math.floor(lonToPx(b.west, zz) / TILE) + 1) *
    (Math.floor(latToPx(b.south, zz) / TILE) - Math.floor(latToPx(b.north, zz) / TILE) + 1);
  while (z > 9 && tilesAt(z) > 16) z--;

  // mosaico com 1 pixel de margem para o vizinho do método de Horn
  const x0 = Math.floor(lonToPx(b.west, z)) - 1;
  const x1 = Math.ceil(lonToPx(b.east, z)) + 1;
  const y0 = Math.floor(latToPx(b.north, z)) - 1;
  const y1 = Math.ceil(latToPx(b.south, z)) + 1;
  const tx0 = Math.floor(x0 / TILE), tx1 = Math.floor(x1 / TILE);
  const ty0 = Math.floor(y0 / TILE), ty1 = Math.floor(y1 / TILE);

  const tiles = new Map<string, Float32Array>();
  const jobs: Promise<void>[] = [];
  for (let tx = tx0; tx <= tx1; tx++)
    for (let ty = ty0; ty <= ty1; ty++) jobs.push(loadElevationTile(z, tx, ty).then((t) => void tiles.set(`${tx}/${ty}`, t)));
  await Promise.all(jobs);

  const elevAt = (gx: number, gy: number) => {
    const cx = Math.min(Math.max(gx, x0), x1);
    const cy = Math.min(Math.max(gy, y0), y1);
    const t = tiles.get(`${Math.floor(cx / TILE)}/${Math.floor(cy / TILE)}`)!;
    return t[(cy % TILE) * TILE + (cx % TILE)];
  };

  const centerLat = (b.north + b.south) / 2;
  const cell = pixelSizeM(centerLat, z);
  const elevs: number[] = [];
  const slopes: number[] = [];
  for (let gy = y0 + 1; gy < y1; gy++) {
    const lat = pxToLat(gy + 0.5, z);
    for (let gx = x0 + 1; gx < x1; gx++) {
      if (!pointInPolygon(lat, pxToLon(gx + 0.5, z), polygon)) continue;
      elevs.push(elevAt(gx, gy));
      slopes.push(hornSlope(elevAt, gx, gy, cell));
    }
  }
  if (!elevs.length) throw new Error("O talhão é menor que um pixel do modelo de elevação.");

  const sorted = [...slopes].sort((a, c) => a - c);
  const classes = SLOPE_CLASSES.map(() => 0);
  slopes.forEach((s) => classes[slopeClassIndex(s)]++);
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

  return {
    pixelCount: elevs.length,
    pixelSizeM: cell,
    elevation: { min: Math.min(...elevs), max: Math.max(...elevs), mean: mean(elevs) },
    slope: { mean: mean(slopes), p90: sorted[Math.floor(sorted.length * 0.9)] ?? sorted.at(-1)!, max: sorted.at(-1)! },
    slopeClasses: classes.map((c) => c / slopes.length),
    zoom: z,
    source: `${TERRAIN_SOURCE.name} — ${TERRAIN_SOURCE.base}`,
    fetchedAt: new Date().toISOString(),
  };
}

/** Pinta um tile de declividade (classes Embrapa) num canvas 256×256. Bordas do tile replicam o pixel vizinho. */
const SLOPE_RGB = SLOPE_CLASSES.map((c) => [parseInt(c.color.slice(1, 3), 16), parseInt(c.color.slice(3, 5), 16), parseInt(c.color.slice(5, 7), 16)]);
const renderedSlope = new Map<string, Promise<ImageData>>();

/** Calcula (uma vez por tile, com cache) a imagem de classes de declividade. Laço sem alocações nem sqrt. */
function slopeImage(z: number, x: number, y: number): Promise<ImageData> {
  const key = `${z}/${x}/${y}`;
  if (!renderedSlope.has(key)) {
    const p = loadElevationTile(z, x, y).then((elev) => {
      const cell = pixelSizeM(pxToLat(y * TILE + TILE / 2, z), z);
      // compara o gradiente ao quadrado com os limites ao quadrado: (pct/100 · 8·cell)²
      const k = 8 * cell;
      const limits = SLOPE_CLASSES.map((c) => (Number.isFinite(c.max) ? ((c.max / 100) * k) ** 2 : Infinity));
      const img = new ImageData(TILE, TILE);
      const d = img.data;
      const last = TILE - 1;
      for (let j = 0; j < TILE; j++) {
        const jm = (j === 0 ? 0 : j - 1) * TILE, j0 = j * TILE, jp = (j === last ? last : j + 1) * TILE;
        for (let i = 0; i < TILE; i++) {
          const im = i === 0 ? 0 : i - 1, ip = i === last ? last : i + 1;
          const a = elev[jm + im], b = elev[jm + i], c = elev[jm + ip];
          const dd = elev[j0 + im], f = elev[j0 + ip];
          const g = elev[jp + im], h = elev[jp + i], q = elev[jp + ip];
          const gx = c + 2 * f + q - (a + 2 * dd + g);
          const gy = g + 2 * h + q - (a + 2 * b + c);
          const s2 = gx * gx + gy * gy;
          let ci = 0;
          while (s2 >= limits[ci]) ci++;
          const rgb = SLOPE_RGB[ci];
          const o = (j0 + i) * 4;
          d[o] = rgb[0];
          d[o + 1] = rgb[1];
          d[o + 2] = rgb[2];
          d[o + 3] = 255;
        }
      }
      return img;
    });
    p.catch(() => renderedSlope.delete(key));
    if (renderedSlope.size > 150) renderedSlope.delete(renderedSlope.keys().next().value!);
    renderedSlope.set(key, p);
  }
  return renderedSlope.get(key)!;
}

/** Pinta um tile de declividade (classes Embrapa) num canvas 256×256. Bordas do tile replicam o pixel vizinho. */
export async function renderSlopeTile(canvas: HTMLCanvasElement, z: number, x: number, y: number) {
  const img = await slopeImage(z, x, y);
  canvas.width = TILE;
  canvas.height = TILE;
  canvas.getContext("2d")!.putImageData(img, 0, 0);
}
