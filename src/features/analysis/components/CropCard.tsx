import { useState, type ReactNode } from "react";
import { Bean, Carrot, Check, Flower, Leaf, Sprout, Wheat } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Crop, CropFamily, CropGroup } from "@/types";

const ICON_BY_ID: Record<string, typeof Sprout> = { mandioca: Carrot, batata: Carrot, girassol: Flower };
const ICON_BY_FAMILY: Partial<Record<CropFamily, typeof Sprout>> = { leguminosa: Bean, gramínea: Wheat };

const TINT_BY_ID: Record<string, string> = {
  soja: "#cfe3a8",
  feijao: "#e6d3b3",
  milho: "#f3dc8a",
  trigo: "#ecd9a0",
  sorgo: "#e7c3a1",
  mandioca: "#d8c7a6",
};
const TINT_BY_GROUP: Record<CropGroup, string> = {
  graos: "#ecdca6",
  oleaginosas: "#f0e3a0",
  fibras: "#e9e4d6",
  hortalicas: "#f1cfc0",
  forrageiras: "#cfe0b4",
  raizes: "#d8c7a6",
  cobertura: "#d5e6c8",
};

export function CropCard({ crop, selected, onToggle, badge }: { crop: Crop; selected: boolean; onToggle: () => void; badge?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  const Icon = ICON_BY_ID[crop.id] ?? ICON_BY_FAMILY[crop.family] ?? Leaf;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border-2 bg-white text-left transition-all",
        selected ? "border-primary shadow-md" : "border-transparent shadow-card hover:border-input",
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden" style={{ background: TINT_BY_ID[crop.id] ?? TINT_BY_GROUP[crop.group] }}>
        {!failed ? (
          <img
            src={`/culturas/${crop.id}.jpg`}
            alt={crop.name}
            loading="lazy"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Icon className="size-14 text-[#3d5a2a]/70" strokeWidth={1.5} />
          </div>
        )}
        <span
          className={cn(
            "absolute right-2 top-2 flex size-7 items-center justify-center rounded-full border-2 transition-colors",
            selected ? "border-primary bg-primary text-white" : "border-white bg-white/70 text-transparent",
          )}
        >
          <Check className="size-4" strokeWidth={3} />
        </span>
        {badge && <span className="absolute bottom-2 left-2">{badge}</span>}
      </div>
      <span className={cn("px-3 py-2.5 text-[15px] font-semibold leading-tight", selected && "text-primary")}>{crop.name}</span>
    </button>
  );
}
