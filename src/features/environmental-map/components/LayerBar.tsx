import type { LucideIcon } from "lucide-react";
import { CloudFog, CloudRain, Droplets, Leaf, Mountain, Shovel, Thermometer, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LayerId } from "@/services/environment/catalog";

/**
 * Botões de camada em linguagem simples. Cada botão agrupa uma ou mais camadas do catálogo
 * (ex.: "Umidade do solo" = superfície ou raízes). Só uma camada fica ativa por vez.
 */
export interface LayerChip {
  key: string;
  label: string;
  icon: LucideIcon;
  layers: LayerId[];
  /** O que a camada mostra, para quem não é especialista. */
  what: string;
  /** Como ler as cores. */
  read: string;
}

export const CHIPS: LayerChip[] = [
  {
    key: "ndvi",
    label: "Vegetação",
    icon: Leaf,
    layers: ["ndvi"],
    what: "Mostra o vigor das plantas visto do satélite.",
    read: "Verde escuro = lavoura vigorosa. Amarelo ou marrom = solo exposto, palhada ou planta estressada.",
  },
  {
    key: "precip",
    label: "Chuva",
    icon: CloudRain,
    layers: ["precip"],
    what: "Mostra onde choveu no dia escolhido, estimado por satélite.",
    read: "Sem cor = sem chuva. Quanto mais forte a cor, mais intensa foi a chuva.",
  },
  {
    key: "soilwater",
    label: "Umidade do solo",
    icon: Droplets,
    layers: ["smap_surface", "smap_root"],
    what: "Mostra quanta água há no solo da região.",
    read: "Tons marrons = solo seco. Tons azuis = solo úmido.",
  },
  {
    key: "temp",
    label: "Temperatura",
    icon: Thermometer,
    layers: ["temp"],
    what: "Mostra a temperatura média do ar no mês.",
    read: "Azul = mais frio. Vermelho = mais quente.",
  },
  {
    key: "rh",
    label: "Umidade do ar",
    icon: CloudFog,
    layers: ["rh"],
    what: "Mostra a umidade do ar média do mês, medida no início da tarde.",
    read: "Cada cor é uma faixa de umidade (%) — veja a régua da legenda.",
  },
  {
    key: "elevation",
    label: "Altitude",
    icon: Mountain,
    layers: ["elevation"],
    what: "Mostra a altura do terreno em relação ao nível do mar.",
    read: "Cada cor é uma faixa de altitude — veja a régua da legenda.",
  },
  {
    key: "slope",
    label: "Declividade",
    icon: TrendingUp,
    layers: ["slope"],
    what: "Mostra a inclinação do terreno, calculada a partir da altitude.",
    read: "Verde = plano. Amarelo e laranja = ondulado. Vermelho = íngreme, maior risco de erosão.",
  },
  {
    key: "soil",
    label: "Solo",
    icon: Shovel,
    layers: ["soil"],
    what: "Pinta cada talhão com a textura de solo que você cadastrou.",
    read: "Cores claras = solo arenoso. Cores escuras = solo argiloso.",
  },
];

export const chipFor = (id: LayerId | null) => (id ? CHIPS.find((c) => c.layers.includes(id)) : undefined);

export function LayerBar({ active, onSelect }: { active: LayerId | null; onSelect: (id: LayerId | null) => void }) {
  const current = chipFor(active);
  return (
    <div
      role="radiogroup"
      aria-label="Camada do mapa"
      className="flex max-w-full gap-1 overflow-x-auto rounded-lg glass p-1  [scrollbar-width:none]"
    >
      {CHIPS.map((c) => {
        const on = current?.key === c.key;
        const Icon = c.icon;
        return (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={on}
            title={c.what}
            // clicar na camada ativa desliga; nas demais, ativa a primeira camada do grupo
            onClick={() => onSelect(on ? null : c.layers[0])}
            className={cn(
              "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
              on ? "bg-primary text-white" : "text-foreground hover:bg-muted",
            )}
          >
            <Icon className="size-4" />
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
