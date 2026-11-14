/**
 * Paleta oficial de uma camada do GIBS (colormap XML v1.3), para desenhar a legenda no app
 * quando a imagem de legenda da NASA usa uma unidade inadequada (ex.: Kelvin → °C).
 * As cores e os limites são exatamente os da paleta oficial — só a unidade do rótulo muda.
 */

export interface ScaleStop {
  /** Valor no início da faixa, já convertido. */
  value: number;
  color: string;
}

export interface LegendScale {
  stops: ScaleStop[];
  min: number;
  max: number;
  unit: string;
}

export type UnitConversion = { from: "K"; to: "°C" };

const convert = (v: number, c?: UnitConversion) => (c?.from === "K" ? v - 273.15 : v);

const cache = new Map<string, Promise<LegendScale>>();

export function loadLegendScale(colormap: string, conversion?: UnitConversion): Promise<LegendScale> {
  const key = `${colormap}:${conversion?.to ?? ""}`;
  if (!cache.has(key)) {
    const p = fetch(`https://gibs.earthdata.nasa.gov/colormaps/v1.3/${colormap}.xml`, { signal: AbortSignal.timeout(20000) })
      .then((r) => {
        if (!r.ok) throw new Error(`Paleta indisponível (HTTP ${r.status})`);
        return r.text();
      })
      .then((xml) => {
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        // o primeiro ColorMap costuma ser "No Data"; usamos o que tem unidade/valores
        const maps = [...doc.getElementsByTagName("ColorMap")].filter((m) => m.getAttribute("title") !== "No Data");
        const map = maps[0];
        if (!map) throw new Error("Paleta sem entradas");
        const stops: ScaleStop[] = [];
        for (const el of map.getElementsByTagName("ColorMapEntry")) {
          if (el.getAttribute("transparent") === "true") continue;
          const nums = (el.getAttribute("value") ?? "").match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
          if (!nums.length) continue; // faixas abertas (-INF/INF) ficam nas pontas da barra
          const [r, g, b] = (el.getAttribute("rgb") ?? "0,0,0").split(",").map(Number);
          stops.push({ value: convert(nums[0], conversion), color: `rgb(${r},${g},${b})` });
        }
        if (stops.length < 2) throw new Error("Paleta sem entradas");
        stops.sort((a, b) => a.value - b.value);
        return { stops, min: stops[0].value, max: stops.at(-1)!.value, unit: conversion?.to ?? map.getAttribute("units") ?? "" };
      })
      .catch((e) => {
        cache.delete(key);
        throw e;
      });
    cache.set(key, p);
  }
  return cache.get(key)!;
}
