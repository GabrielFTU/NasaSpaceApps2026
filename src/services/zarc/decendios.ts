/**
 * Decêndios do ZARC: o ano é dividido em 36 períodos — 3 por mês (dias 1–10, 11–20 e 21–fim).
 * Decêndio 1 = 1–10/jan, 36 = 21–31/dez.
 */
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const LAST_DAY = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const DECENDIOS = Array.from({ length: 36 }, (_, i) => i + 1);
export const MONTH_LABELS = MONTHS;

const month = (dec: number) => Math.floor((dec - 1) / 3);
const part = (dec: number) => (dec - 1) % 3;

export function decStartDay(dec: number) {
  return [1, 11, 21][part(dec)];
}

export function decEndDay(dec: number) {
  return part(dec) === 2 ? LAST_DAY[month(dec)] : [10, 20][part(dec)];
}

export function decMonth(dec: number) {
  return MONTHS[month(dec)];
}

/** "1–10/jan" */
export function decLabel(dec: number) {
  return `${decStartDay(dec)}–${decEndDay(dec)}/${decMonth(dec)}`;
}

/** "11/set a 31/dez" */
export function windowLabel(startDec: number, endDec: number) {
  return `${decStartDay(startDec)}/${decMonth(startDec)} a ${decEndDay(endDec)}/${decMonth(endDec)}`;
}

/** Decêndio (1–36) de uma data. */
export function decendioOf(d: Date) {
  const day = d.getDate();
  return d.getMonth() * 3 + (day <= 10 ? 1 : day <= 20 ? 2 : 3);
}
