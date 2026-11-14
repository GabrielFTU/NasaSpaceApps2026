import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(prefix = "id"): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

/** Pseudoaleatório determinístico (mulberry32) — usado nos mocks para gerar séries estáveis. */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashCoords(lat: number, lon: number): number {
  return Math.abs(Math.round(lat * 1000) * 73856093) ^ Math.abs(Math.round(lon * 1000) * 19349663);
}

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function round(v: number, digits = 1) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
