import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, CloudRain, CloudSun, Droplets, RefreshCw, SprayCan, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { fmt, parseISODate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isRainDay, isSprayDay, summarize, type ForecastDay } from "@/services/forecast";
import { useForecast } from "../useForecast";

const RAIN = "#2a78d6";
/** Intervalo do avanço automático do carrossel (ms) — devagar de propósito. */
const AUTO_MS = 4000;
const GAP = 8;

type Span = "7" | "15" | "30";
const SPANS: { value: Span; label: string }[] = [
  { value: "7", label: "7 dias" },
  { value: "15", label: "15 dias" },
  { value: "30", label: "30 dias" },
];

function dayName(iso: string, i: number) {
  if (i === 0) return "Hoje";
  if (i === 1) return "Amanhã";
  const d = parseISODate(iso);
  const w = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return `${w.charAt(0).toUpperCase()}${w.slice(1)} ${d.getDate()}`;
}

/** Cabeçalho do cartão do dia: data completa + dia da semana por extenso (ou Hoje/Amanhã). */
function dayHeader(iso: string, i: number) {
  const d = parseISODate(iso);
  const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const weekday = i === 0 ? "Hoje" : i === 1 ? "Amanhã" : d.toLocaleDateString("pt-BR", { weekday: "long" });
  return { date, weekday };
}

function Stat({ icon, color, label, value, unit, caption, tone }: { icon: ReactNode; color: string; label: string; value: string; unit?: string; caption: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="glass-soft flex items-start gap-2.5 rounded-[8px] p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] [&_svg]:size-[18px]" style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, white)` }}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] text-muted-foreground">{label}</p>
        <p className={cn("tabular mt-0.5 text-[22px] font-bold leading-tight tracking-tight", tone === "bad" && "text-danger", tone === "good" && "text-success")}>
          {value}
          {unit && <span className="ml-1 text-sm font-semibold">{unit}</span>}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{caption}</p>
      </div>
    </div>
  );
}

function DayCard({ d, i, max }: { d: ForecastDay; i: number; max: number }) {
  const rainy = isRainDay(d);
  const Icon = rainy ? CloudRain : d.rain >= 1 || (d.rainProb ?? 0) >= 30 ? CloudSun : Sun;
  const spray = isSprayDay(d);
  const h = dayHeader(d.date, i);
  return (
    <div
      data-day
      className={cn(
        "glass-soft flex shrink-0 snap-start flex-col items-center gap-1 rounded-[8px] px-1 py-2.5 text-center",
        // 7 cartões preenchem a largura; abaixo de 96px cada, vira rolagem
        "min-w-[96px] basis-[calc((100%-48px)/7)]",
        i === 0 && "!bg-primary-soft/70",
      )}
      title={`${h.weekday}, ${h.date}: ${fmt.n0(d.rain)} mm (${d.rainProb ?? "—"}% de chance) · ${fmt.n0(d.tmin)}–${fmt.n0(d.tmax)} °C · vento até ${fmt.n0(d.wind)} km/h · ET₀ ${fmt.n1(d.et0)} mm`}
    >
      <span className="tabular whitespace-nowrap text-[12px] font-semibold">{h.date}</span>
      <span className={cn("-mt-1 block whitespace-nowrap text-[11px] first-letter:uppercase", i === 0 ? "font-semibold text-primary" : "text-muted-foreground")}>{h.weekday}</span>
      <Icon className={cn("size-5", rainy ? "text-[#2a78d6]" : "text-[#eda100]")} />
      <div className="flex h-10 w-2.5 items-end overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="w-full rounded-full" style={{ height: `${max > 0 ? Math.max(d.rain > 0 ? 8 : 0, (d.rain / max) * 100) : 0}%`, background: RAIN }} />
      </div>
      <span className={cn("tabular text-[13px] font-bold", d.rain >= 1 ? "text-[#1f5fae]" : "text-subtle-foreground")}>{d.rain >= 1 ? `${fmt.n0(d.rain)} mm` : "—"}</span>
      <span className="tabular text-[11px] text-muted-foreground">{d.rainProb ?? "—"}%</span>
      <span className="tabular text-[11px]">
        <strong className="font-semibold">{fmt.n0(d.tmax)}°</strong> <span className="text-subtle-foreground">{fmt.n0(d.tmin)}°</span>
      </span>
      <span className={cn("mt-0.5 flex size-5 items-center justify-center rounded-full", spray ? "bg-success-soft text-success" : "opacity-0")} title={spray ? "Bom para pulverizar" : undefined}>
        <SprayCan className="size-3" />
      </span>
    </div>
  );
}

/**
 * Faixa de dias em carrossel: arrasta com mouse/dedo, setas nas laterais e avanço automático lento.
 * O avanço pausa enquanto a pessoa interage (mouse em cima, foco, arrasto) e respeita "reduzir movimento".
 */
function DayCarousel({ days }: { days: ForecastDay[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [edges, setEdges] = useState({ start: true, end: true });
  const drag = useRef<{ x: number; left: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const max = Math.max(...days.map((d) => d.rain));

  const step = () => {
    const el = ref.current;
    const card = el?.querySelector<HTMLElement>("[data-day]");
    return card ? card.offsetWidth + GAP : 96;
  };
  const updateEdges = () => {
    const el = ref.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  };
  const go = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * step(), behavior: "smooth" });

  useEffect(() => {
    ref.current?.scrollTo({ left: 0 });
    updateEdges();
  }, [days.length]);

  useEffect(() => {
    window.addEventListener("resize", updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
  }, []);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      const el = ref.current;
      if (!el || el.scrollWidth <= el.clientWidth + 2) return; // tudo cabe: nada a girar
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
      if (atEnd) el.scrollTo({ left: 0, behavior: "smooth" });
      else go(1);
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [paused, days.length]);

  return (
    <div
      className="group relative mt-2"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        ref={ref}
        onScroll={updateEdges}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") return; // toque já rola nativamente
          drag.current = { x: e.clientX, left: ref.current!.scrollLeft };
          ref.current!.setPointerCapture(e.pointerId);
          setDragging(true);
        }}
        onPointerMove={(e) => {
          const s = drag.current;
          if (!s || !ref.current) return;
          ref.current.scrollLeft = s.left - (e.clientX - s.x);
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false); // devolve o snap: o carrossel encaixa no dia mais próximo
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => window.setTimeout(() => setPaused(false), AUTO_MS)}
        className={cn(
          "flex gap-2 overflow-x-auto pb-1 select-none",
          dragging ? "cursor-grabbing snap-none" : "cursor-grab snap-x snap-mandatory scroll-smooth",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
        role="region"
        aria-label="Previsão por dia"
        tabIndex={0}
      >
        {days.map((d, i) => (
          <DayCard key={d.date} d={d} i={i} max={max} />
        ))}
      </div>

      {/* setas e esmaecimento nas bordas, só quando há mais conteúdo daquele lado */}
      {!edges.start && (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-white/70 to-transparent" />
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Dias anteriores"
            className="glass absolute left-1 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <ChevronLeft className="size-4" />
          </button>
        </>
      )}
      {!edges.end && (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white/70 to-transparent" />
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Próximos dias"
            className="glass absolute right-1 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <ChevronRight className="size-4" />
          </button>
        </>
      )}
    </div>
  );
}

/** Previsão de 7, 15 ou 30 dias com os indicadores que pesam na decisão do dia a dia. */
export function ForecastPanel({ lat, lon }: { lat: number; lon: number }) {
  const [span, setSpan] = useState<Span>("7");
  const n = Number(span);
  const extended = span === "30";
  const f = useForecast(lat, lon, extended);

  return (
    <section className="relative isolate overflow-hidden rounded-[12px] bg-white p-4 shadow-card" aria-label="Previsão do tempo">
      {/* manchas de cor suaves por trás — é o que o vidro dos cartões desfoca */}
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 -z-10 size-72 rounded-full bg-[#2a78d6]/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 -z-10 size-72 rounded-full bg-[#7cc300]/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute bottom-0 right-1/3 -z-10 size-48 rounded-full bg-[#1baf7a]/10 blur-3xl" />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Próximos {n} dias</h2>
          {extended && <p className="text-xs text-muted-foreground">Previsão estendida — use como tendência.</p>}
        </div>
        <div className="flex items-center gap-2">
          {f.status === "error" && (
            <Button variant="outline" size="sm" onClick={f.reload}>
              <RefreshCw /> Tentar novamente
            </Button>
          )}
          <Segmented value={span} onChange={setSpan} options={SPANS} aria-label="Período da previsão" />
        </div>
      </div>

      {f.status === "loading" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[80px] rounded-[8px]" />
          ))}
        </div>
      )}

      {f.status === "error" && <p className="rounded-md bg-muted px-3 py-3 text-sm text-muted-foreground">{f.error}</p>}

      {f.status === "ready" &&
        (() => {
          const days = f.data.days.slice(0, n);
          const s = summarize(f.data.days, n);
          const next = s.nextRain;
          const nameOf = (d: ForecastDay) => dayName(d.date, days.indexOf(d));
          const spray = s.sprayDays.map(nameOf);
          return (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <Stat
                  icon={<CloudRain />}
                  color={RAIN}
                  label="Chuva esperada"
                  value={fmt.n0(s.rain)}
                  unit="mm"
                  caption={`${s.rainyDays} ${s.rainyDays === 1 ? "dia" : "dias"} com chuva`}
                />
                <Stat
                  icon={<CalendarClock />}
                  color="#5b4bd6"
                  label="Próxima chuva"
                  value={next ? nameOf(next) : "Sem previsão"}
                  caption={next ? `${fmt.n0(next.rain)} mm · ${next.rainProb ?? "—"}% de chance` : `nos próximos ${n} dias`}
                />
                <Stat
                  icon={<Droplets />}
                  color={s.balance < 0 ? "#eb6834" : "#1baf7a"}
                  label="Balanço hídrico"
                  value={`${s.balance > 0 ? "+" : ""}${fmt.n0(s.balance)}`}
                  unit="mm"
                  tone={s.balance < -10 ? "bad" : s.balance > 0 ? "good" : undefined}
                  caption={s.balance < 0 ? `Déficit · a planta perde ${fmt.n0(s.et0)} mm` : "Excedente · solo deve ganhar água"}
                />
                <Stat
                  icon={<SprayCan />}
                  color="#1d6f2c"
                  label="Bom para pulverizar"
                  value={`${spray.length}`}
                  unit={spray.length === 1 ? "dia" : "dias"}
                  caption={spray.length ? spray.slice(0, 3).join(", ") + (spray.length > 3 ? ` +${spray.length - 3}` : "") : "Chuva ou vento forte no período"}
                />
              </div>

              <DayCarousel days={days} />
            </>
          );
        })()}
    </section>
  );
}
