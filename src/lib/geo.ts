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
