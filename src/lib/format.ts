const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export const fmt = {
  n0: (v: number) => nf0.format(v),
  n1: (v: number) => nf1.format(v),
  n2: (v: number) => nf2.format(v),
  coord: (v: number) => v.toFixed(5),
};

/** Datas ISO "YYYY-MM-DD" interpretadas como datas locais (sem fuso). */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }) {
  return parseISODate(iso).toLocaleDateString("pt-BR", opts).replace(".", "");
}

export function formatDateTime(isoTs: string) {
  return new Date(isoTs).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatShortDay(iso: string) {
  return parseISODate(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function formatMonth(iso: string) {
  return parseISODate(iso).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
}
