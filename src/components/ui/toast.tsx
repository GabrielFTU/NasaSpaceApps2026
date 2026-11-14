import { create } from "zustand";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cn, uid } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
}

const useToastStore = create<{ items: ToastItem[]; push: (t: Omit<ToastItem, "id">) => void; dismiss: (id: string) => void }>(
  (set) => ({
    items: [],
    push: (t) => {
      const id = uid("t");
      set((s) => ({ items: [...s.items.slice(-2), { ...t, id }] }));
      setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), 4200);
    },
    dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  }),
);

export const toast = {
  success: (title: string, description?: string) => useToastStore.getState().push({ kind: "success", title, description }),
  error: (title: string, description?: string) => useToastStore.getState().push({ kind: "error", title, description }),
  info: (title: string, description?: string) => useToastStore.getState().push({ kind: "info", title, description }),
};

const ICON = { success: CheckCircle2, error: TriangleAlert, info: Info };
const ICON_COLOR = { success: "text-success", error: "text-danger", info: "text-info" };

export function Toaster() {
  const { items, dismiss } = useToastStore();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 left-4 z-[1100] flex flex-col items-end gap-2 sm:left-auto" aria-live="polite">
      {items.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className="animate-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-md"
          >
            <Icon className={cn("mt-0.5 size-4 shrink-0", ICON_COLOR[t.kind])} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.title}</p>
              {t.description && <p className="mt-0.5 text-[13px] text-muted-foreground">{t.description}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="cursor-pointer text-muted-foreground hover:text-foreground" aria-label="Fechar aviso">
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
