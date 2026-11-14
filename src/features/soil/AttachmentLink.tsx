import { FileText } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { loadFile } from "@/lib/fileStore";
import type { SoilAttachment } from "@/types";

/** Abre o laudo guardado no navegador em uma nova aba. */
export function AttachmentLink({ attachment }: { attachment: SoilAttachment }) {
  const open = async () => {
    try {
      const blob = await loadFile(attachment.fileId);
      if (!blob) throw new Error();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error("Laudo indisponível", "O arquivo não está mais neste navegador.");
    }
  };
  return (
    <button type="button" onClick={open} className="inline-flex min-w-0 cursor-pointer items-center gap-1.5 text-[13px] font-medium text-primary hover:underline" title="Abrir laudo">
      <FileText className="size-4 shrink-0" />
      <span className="truncate">{attachment.name}</span>
    </button>
  );
}
