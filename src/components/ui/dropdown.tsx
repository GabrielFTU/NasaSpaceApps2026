import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  hint?: string;
}

interface Props<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: DropdownOption<T>[];
  "aria-label": string;
  /** Classe do botão (o gatilho). */
  className?: string;
  /** Classe da lista. */
  menuClassName?: string;
  align?: "start" | "end";
  side?: "bottom" | "top";
  /** Conteúdo do gatilho; padrão = rótulo da opção escolhida. */
  children?: ReactNode;
}

/** Lista suspensa no visual do app (substitui o <select> nativo). Teclado: ↑ ↓ Enter Esc. */
export function Dropdown<T extends string>({ value, onChange, options, className, menuClassName, align = "start", side = "bottom", children, ...rest }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    requestAnimationFrame(() => listRef.current?.focus());
    return () => document.removeEventListener("mousedown", close);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (v: T) => {
    onChange(v);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setOpen(false);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + d + options.length) % options.length);
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(options[active].value);
    }
    if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={rest["aria-label"]}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => (e.key === "ArrowDown" || e.key === "ArrowUp") && (e.preventDefault(), setOpen(true))}
        className={cn(
          "group flex w-full cursor-pointer items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{children ?? current?.label}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <ul
          id={id}
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-label={rest["aria-label"]}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onKey}
          className={cn(
            "animate-in absolute z-[950] min-w-full max-h-80 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-raised focus:outline-none",
            side === "bottom" ? "top-[calc(100%+8px)]" : "bottom-[calc(100%+8px)]",
            align === "start" ? "left-0" : "right-0",
            menuClassName,
          )}
        >
          {options.map((o, i) => {
            const sel = o.value === value;
            return (
              <li
                key={o.value}
                id={`${id}-${i}`}
                role="option"
                aria-selected={sel}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o.value)}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13.5px] transition-colors",
                  i === active && "bg-muted",
                  sel ? "font-semibold text-foreground" : "text-foreground/85",
                )}
              >
                {o.icon && <span className={cn("shrink-0 [&_svg]:size-4", sel ? "text-primary" : "text-muted-foreground")}>{o.icon}</span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && <span className="block truncate text-xs font-normal text-muted-foreground">{o.hint}</span>}
                </span>
                <Check className={cn("size-4 shrink-0 text-primary", !sel && "invisible")} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
