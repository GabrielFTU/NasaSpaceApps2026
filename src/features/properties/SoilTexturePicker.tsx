import { useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SOIL_TEXTURE_LABEL } from "@/data/crops";
import type { SoilProfile } from "@/types";

type Texture = SoilProfile["texture"];

/**
 * Cada textura: foto real em /public/solos/<chave>.jpg (Wikimedia Commons) e, se a foto falhar,
 * uma amostra ilustrada (cor + granulação). A dica é o "teste de mão" usado no campo.
 */
const TEXTURES: Record<Texture, { tip: string; swatch: CSSProperties }> = {
  arenosa: {
    tip: "Áspera, não forma bolinha",
    swatch: {
      backgroundColor: "#d9bf8f",
      backgroundImage:
        "radial-gradient(circle at 20% 30%, #f1e2c2 1.6px, transparent 2px), radial-gradient(circle at 70% 60%, #b89863 1.8px, transparent 2.2px), radial-gradient(circle at 40% 80%, #efdcb5 1.4px, transparent 1.8px)",
      backgroundSize: "9px 9px, 11px 11px, 7px 7px",
    },
  },
  media: {
    tip: "Forma bolinha que quebra fácil",
    swatch: {
      backgroundColor: "#9a6a43",
      backgroundImage:
        "radial-gradient(circle at 30% 40%, #b78559 1.2px, transparent 1.6px), radial-gradient(circle at 70% 70%, #7a5232 1.1px, transparent 1.5px)",
      backgroundSize: "7px 7px, 6px 6px",
    },
  },
  argilosa: {
    tip: "Faz rolinho e gruda nos dedos",
    swatch: {
      backgroundColor: "#8a3d22",
      backgroundImage: "radial-gradient(circle at 50% 50%, #9c4a2b 0.8px, transparent 1.2px), linear-gradient(160deg, rgb(255 255 255 / 0.08), transparent 60%)",
      backgroundSize: "4px 4px, 100% 100%",
    },
  },
  muito_argilosa: {
    tip: "Muito pegajosa, mancha a mão",
    swatch: {
      backgroundColor: "#6e2414",
      backgroundImage:
        "linear-gradient(115deg, transparent 46%, rgb(0 0 0 / 0.25) 47%, transparent 49%), linear-gradient(35deg, transparent 58%, rgb(0 0 0 / 0.2) 59%, transparent 61%), linear-gradient(160deg, rgb(255 255 255 / 0.1), transparent 60%)",
      backgroundSize: "34px 30px, 26px 38px, 100% 100%",
    },
  },
};

function SoilImage({ texture }: { texture: Texture }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative h-16 w-full overflow-hidden rounded-[8px]" style={TEXTURES[texture].swatch}>
      {!failed && (
        <img
          src={`/solos/${texture}.jpg`}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

export function SoilTexturePicker({ value, onChange }: { value: Texture; onChange: (v: Texture) => void }) {
  return (
    <div role="radiogroup" aria-label="Textura do solo" className="grid grid-cols-2 gap-2">
      {(Object.keys(TEXTURES) as Texture[]).map((t) => {
        const on = t === value;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(t)}
            className={cn(
              "relative flex cursor-pointer flex-col gap-1.5 rounded-[10px] p-1.5 text-left ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "bg-primary-soft/60 ring-2 ring-primary" : "ring-border hover:ring-primary/40",
            )}
          >
            <SoilImage texture={t} />
            {on && (
              <span className="absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full bg-primary text-white shadow">
                <Check className="size-3" />
              </span>
            )}
            <span className="px-0.5 pb-0.5">
              <span className="block text-[13px] font-semibold leading-tight">{SOIL_TEXTURE_LABEL[t]}</span>
              <span className="block text-[11px] leading-snug text-muted-foreground">{TEXTURES[t].tip}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
