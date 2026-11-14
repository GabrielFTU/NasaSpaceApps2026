/** Utilitários geográficos para o desenho de áreas no mapa. Pontos no formato [lat, lon]. */

const R = 6378137; // raio equatorial WGS84 (m)
const rad = (d: number) => (d * Math.PI) / 180;

/** Área geodésica aproximada de um polígono, em hectares (mesma fórmula usada pelo Leaflet.draw). */
export function polygonAreaHa(points: [number, number][]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [lat1, lon1] = points[i];
    const [lat2, lon2] = points[(i + 1) % points.length];
    area += rad(lon2 - lon1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((area * R * R) / 2) / 10000;
}

/** Centro aproximado (média dos vértices) — suficiente para áreas rurais pequenas. */
export function polygonCenter(points: [number, number][]): [number, number] {
  const lat = points.reduce((a, p) => a + p[0], 0) / points.length;
  const lon = points.reduce((a, p) => a + p[1], 0) / points.length;
  return [lat, lon];
}

/** Perímetro em metros (haversine). */
export function polygonPerimeterM(points: [number, number][]): number {
  if (points.length < 2) return 0;
  let d = 0;
  for (let i = 0; i < points.length; i++) {
    const [la1, lo1] = points[i];
    const [la2, lo2] = points[(i + 1) % points.length];
    const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
    d += 2 * R * Math.asin(Math.sqrt(a));
  }
  return d;
}

/** Ponto dentro do polígono (ray casting). Pontos [lat, lon]. */
export function pointInPolygon(lat: number, lon: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonBounds(points: [number, number][]) {
  const lats = points.map((p) => p[0]);
  const lons = points.map((p) => p[1]);
  return { south: Math.min(...lats), north: Math.max(...lats), west: Math.min(...lons), east: Math.max(...lons) };
}

/** true quando duas arestas não adjacentes se cruzam (contorno "em oito"). */
export function selfIntersects(points: [number, number][]): boolean {
  const n = points.length;
  if (n < 4) return false;
  const cross = (a: [number, number], b: [number, number], c: [number, number]) => (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
  const hit = (p1: [number, number], p2: [number, number], p3: [number, number], p4: [number, number]) => {
    const d1 = cross(p3, p4, p1);
    const d2 = cross(p3, p4, p2);
    const d3 = cross(p1, p2, p3);
    const d4 = cross(p1, p2, p4);
    return d1 * d2 < 0 && d3 * d4 < 0;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // arestas adjacentes pelo fechamento
      if (hit(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** Retângulo de exemplo ao redor de um ponto (largura/altura em metros). */
export function rectAround(lat: number, lon: number, wM: number, hM: number): [number, number][] {
  const dLat = hM / 2 / 111320;
  const dLon = wM / 2 / (111320 * Math.cos(rad(lat)));
  return [
    [lat + dLat, lon - dLon],
    [lat + dLat * 0.9, lon + dLon],
    [lat - dLat, lon + dLon * 0.95],
    [lat - dLat * 0.95, lon - dLon * 1.05],
  ];
}
