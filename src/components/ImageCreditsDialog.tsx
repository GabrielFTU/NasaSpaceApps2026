import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { IMAGE_CREDITS } from "@/data/imageCredits";

const label = (file: string) =>
  file
    .replace(/^\/(culturas|solos)\//, "")
    .replace(/\.jpg$/, "")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

/** Link do rodapé + lista de autoria/licença das fotos (exigido pelas licenças CC BY e CC BY-SA). */
export function ImageCreditsLink() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="cursor-pointer underline-offset-2 hover:text-foreground hover:underline">
        Créditos das imagens
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Créditos das imagens" description="Fotos do Wikimedia Commons, usadas conforme a licença de cada autor.">
        <ul className="-mx-1 max-h-[60vh] divide-y divide-border overflow-y-auto pb-4 text-[13px]">
          {IMAGE_CREDITS.map((c) => (
            <li key={c.file} className="flex items-center gap-3 px-1 py-2">
              <img src={c.file} alt="" loading="lazy" className="size-10 shrink-0 rounded-[6px] object-cover" />
              <div className="min-w-0">
                <p className="font-medium">
                  {label(c.file)}
                  <span className="ml-1.5 text-[11px] font-normal text-subtle-foreground">{c.file.startsWith("/solos") ? "solo" : "cultura"}</span>
                </p>
                <p className="truncate text-muted-foreground">
                  <a href={c.source} target="_blank" rel="noreferrer" className="hover:text-foreground hover:underline">
                    {c.author}
                  </a>
                  {" · "}
                  {c.licenseUrl ? (
                    <a href={c.licenseUrl} target="_blank" rel="noreferrer" className="hover:text-foreground hover:underline">
                      {c.license}
                    </a>
                  ) : (
                    c.license
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
