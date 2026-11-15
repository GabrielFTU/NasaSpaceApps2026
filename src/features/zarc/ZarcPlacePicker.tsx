import { useEffect, useState } from "react";
import { ChevronDown, MapPin, RotateCcw } from "lucide-react";
import { ZARC_UFS, listZarcMunicipios, type Place } from "@/services/zarc";
import { cn } from "@/lib/utils";

/**
 * Select com aparência de texto. O texto visível acompanha o valor escolhido (largura justa);
 * o <select> nativo fica invisível por cima, mantendo teclado, leitor de tela e lista do sistema.
 */
function InlineSelect({ value, onChange, label, children, className }: { value: string; onChange: (v: string) => void; label: string; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex min-w-0 items-center gap-0.5 rounded-md py-0.5 pl-1.5 pr-1 font-semibold text-foreground hover:bg-muted has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-ring",
        className,
      )}
    >
      <span className="truncate">{value}</span>
      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
        {children}
      </select>
    </span>
  );
}

/**
 * Escolha do município do ZARC. Começa no município da fazenda (`home`);
 * a pessoa pode consultar outro e voltar com um clique.
 */
export function ZarcPlacePicker({ home, value, onChange }: { home: Place; value: Place; onChange: (p: Place) => void }) {
  const [cities, setCities] = useState<string[] | null>(null);
  const isHome = value.city === home.city && value.state === home.state;

  useEffect(() => {
    let alive = true;
    setCities(null);
    listZarcMunicipios(value.state)
      .then((list) => alive && setCities(list))
      .catch(() => alive && setCities([]));
    return () => {
      alive = false;
    };
  }, [value.state]);

  // garante que a cidade atual apareça mesmo se a grafia diferir da tábua
  const options = cities && !cities.includes(value.city) ? [value.city, ...cities] : (cities ?? [value.city]);

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px] text-muted-foreground">
      <MapPin className="size-3.5" />
      <span>Melhores épocas em</span>
      <InlineSelect
        label="Município"
        value={value.city}
        onChange={(city) => onChange({ city, state: value.state })}
        className="max-w-[200px]"
      >
        {options.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </InlineSelect>
      <InlineSelect
        label="Estado"
        value={value.state}
        onChange={async (state) => {
          // ao trocar de UF, volta para a fazenda se for a UF dela; senão, pega o 1º município
          if (state === home.state) return onChange(home);
          const list = await listZarcMunicipios(state).catch(() => []);
          if (list[0]) onChange({ city: list[0], state });
        }}
      >
        {ZARC_UFS.map((uf) => (
          <option key={uf} value={uf}>
            {uf}
          </option>
        ))}
      </InlineSelect>
      {!isHome && (
        <button
          type="button"
          onClick={() => onChange(home)}
          className="ml-1 inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium text-primary hover:bg-primary-soft"
        >
          <RotateCcw className="size-3" /> Voltar para a fazenda
        </button>
      )}
    </div>
  );
}
