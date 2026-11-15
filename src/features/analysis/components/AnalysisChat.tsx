import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Check, MapPin, MessageCircle, Mic, RotateCcw, Sparkles, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import type { Property } from "@/types";
import { CROP_MAP, FALLOW_ID } from "@/data/crops";
import { askAssistant, describeError, userTurn, type AssistantTool, type ChatTurn } from "@/services/assistant";
import { createToolRunner, type AnalysisActions, type CropPurpose, type Widget } from "../conversation/tools";

type Bubble =
  | { id: number; role: "user" | "assistant"; text: string; error?: boolean }
  | { id: number; role: "widget"; widget: Widget; done?: string };

const SUGGESTIONS = [
  "Qual rotação combina com o meu solo?",
  "Vale a pena colocar uma cultura de cobertura no inverno?",
  "Quando é a melhor época para plantar soja aqui?",
  "O que significa o risco do ZARC?",
];

/** Limites contra abuso e gasto da cota gratuita. */
const MAX_INPUT_CHARS = 500;
const MAX_USER_MESSAGES = 30;
const MIN_INTERVAL_MS = 1500;

let seq = 0;
const nid = () => ++seq;

/** **negrito** e listas com "-" — o suficiente para as respostas curtas do assistente. */
function RichText({ text }: { text: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
    );
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length)
      blocks.push(
        <ul key={blocks.length} className="my-1 list-disc space-y-0.5 pl-4">
          {list.map((l, i) => (
            <li key={i}>{inline(l)}</li>
          ))}
        </ul>,
      );
    list = [];
  };
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
    if (m) list.push(m[1]);
    else {
      flush();
      if (line.trim())
        blocks.push(
          <p key={blocks.length} className="my-1 first:mt-0 last:mb-0">
            {inline(line.replace(/^#+\s*/, ""))}
          </p>,
        );
    }
  }
  flush();
  return <>{blocks}</>;
}

/* ---------- componentes interativos ---------- */

const cropLabel = (id: string) => (id === FALLOW_ID ? "Pousio" : (CROP_MAP[id]?.name ?? id));

function CropThumb({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);
  if (id === FALLOW_ID || failed) return <div className="aspect-[4/3] w-full bg-[repeating-linear-gradient(135deg,#e9e3d3_0_6px,#efe9da_6px_12px)]" />;
  return <img src={`/culturas/${id}.jpg`} alt="" loading="lazy" onError={() => setFailed(true)} className="aspect-[4/3] w-full object-cover" />;
}

function CropPicker({ widget, done, disabled, max, onPick }: { widget: Extract<Widget, { kind: "crops" }>; done?: string; disabled: boolean; max: number; onPick: (ids: string[]) => void }) {
  const multi = widget.purpose === "interesse";
  const [sel, setSel] = useState<string[]>([]);
  if (done) return <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><Check className="size-3.5 text-primary" /> {done}</p>;
  const toggle = (id: string) => {
    if (!multi) return onPick([id]);
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= max ? s : [...s, id]));
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {widget.ids.map((id) => {
          const on = sel.includes(id);
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(id)}
              aria-pressed={multi ? on : undefined}
              className={cn(
                "relative overflow-hidden rounded-[10px] bg-white text-left ring-1 transition disabled:cursor-not-allowed disabled:opacity-60",
                on ? "ring-2 ring-primary" : "ring-border hover:ring-primary/50",
                "cursor-pointer",
              )}
            >
              <CropThumb id={id} />
              {on && (
                <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-primary text-white">
                  <Check className="size-3" />
                </span>
              )}
              <span className="block truncate px-1.5 py-1 text-[12px] font-medium">{cropLabel(id)}</span>
            </button>
          );
        })}
      </div>
      {multi && (
        <button
          type="button"
          disabled={disabled || !sel.length}
          onClick={() => onPick(sel)}
          className="h-8 cursor-pointer self-start rounded-full bg-primary px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Confirmar {sel.length ? `(${sel.length})` : ""}
        </button>
      )}
    </div>
  );
}

function PropertyChips({ properties, done, disabled, onPick }: { properties: Property[]; done?: string; disabled: boolean; onPick: (id: string) => void }) {
  if (done) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {properties.map((p) => (
        <button
          key={p.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(p.id)}
          className="flex cursor-pointer items-center gap-2 rounded-[12px] bg-white px-3 py-2 text-left ring-1 ring-primary/30 transition hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          <MapPin className="size-4 shrink-0 text-primary" />
          <span>
            <span className="block text-[13px] font-semibold leading-tight">{p.name}</span>
            <span className="block text-[11.5px] text-muted-foreground">
              {p.city}/{p.state} · {fmt.n1(p.areaHa)} ha
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function OptionChips({ options, done, disabled, onPick }: { options: string[]; done?: string; disabled: boolean; onPick: (o: string) => void }) {
  if (done) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          disabled={disabled}
          onClick={() => onPick(o)}
          className="cursor-pointer rounded-full bg-white px-3 py-1.5 text-[13px] font-medium ring-1 ring-primary/30 transition hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/* ---------- chat ---------- */

export interface ConversationSetup {
  tools: AssistantTool[];
  guide: string;
  actions: AnalysisActions;
  /** Primeira fala (local, sem custo) e o botão que inicia a conversa. */
  greeting: string;
  /** Componente mostrado junto da saudação (ex.: escolher a propriedade), sem custo de IA. */
  initialWidget?: Widget;
}

const initialBubbles = (c?: ConversationSetup): Bubble[] =>
  c
    ? [
        { id: nid(), role: "assistant", text: c.greeting },
        ...(c.initialWidget ? [{ id: nid(), role: "widget" as const, widget: c.initialWidget }] : []),
      ]
    : [];

/** Marcador que vai para a IA quando a escolha foi feita clicando (não aparece no balão). */
const CLICK_MARK = " (marcado clicando — já registrado no estado)";

type SpeechRec = { lang: string; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null };
const SpeechRecognitionCtor = (): (new () => SpeechRec) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

interface Props {
  context: string;
  variant?: "floating" | "inline";
  conversation?: ConversationSetup;
  className?: string;
}

/**
 * Chat da análise. No modo flutuante tira dúvidas; no modo conversa (`conversation`) conduz a análise,
 * mostrando cartões de culturas e botões, e preenche o formulário pelas ferramentas.
 */
export function AnalysisChat({ context, variant = "floating", conversation, className }: Props) {
  const inline = variant === "inline";
  const [open, setOpen] = useState(inline);
  const [bubbles, setBubbles] = useState<Bubble[]>(() => initialBubbles(conversation));
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const canSpeak = typeof window !== "undefined" && !!SpeechRecognitionCtor();
  const [history, setHistory] = useState<ChatTurn[]>([]); // conteúdo completo, para reenviar sem editar
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // contexto e ações mais recentes, lidos durante a resposta em andamento
  const latest = useRef({ context, conversation });
  latest.current = { context, conversation };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [bubbles, busy]);
  useEffect(() => {
    if (open && !inline) inputRef.current?.focus();
  }, [open, inline]);
  useEffect(() => () => abortRef.current?.abort(), []);
  const lastSentRef = useRef(0);

  /** Fecha um componente específico com um rótulo do que foi escolhido. */
  const closeWidget = (id: number, label: string) => setBubbles((b) => b.map((x) => (x.id === id && x.role === "widget" ? { ...x, done: label } : x)));

  /** Voz: transcreve em português para o campo de texto (o agricultor confere e envia). */
  const toggleVoice = () => {
    if (listening) return recRef.current?.stop();
    const Ctor = SpeechRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "pt-BR";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const said = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(" ");
      setInput((cur) => `${cur ? `${cur} ` : ""}${said}`.slice(0, MAX_INPUT_CHARS));
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const userCount = bubbles.filter((b) => b.role === "user").length;
  const limitReached = userCount >= MAX_USER_MESSAGES;

  const send = async (raw: string) => {
    const text = raw.trim().slice(0, MAX_INPUT_CHARS);
    if (!text || busy || limitReached) return;
    // intervalo mínimo entre envios (evita disparos seguidos que gastam a cota gratuita)
    const now = Date.now();
    if (now - lastSentRef.current < MIN_INTERVAL_MS) return;
    lastSentRef.current = now;
    const turns: ChatTurn[] = [...history, userTurn(text)];
    setInput("");
    setBusy(true);
    // componentes ainda abertos somem: a pessoa respondeu do jeito dela
    setBubbles((b) => [...b.map((x) => (x.role === "widget" && !x.done ? { ...x, done: "—" } : x)), { id: nid(), role: "user", text }]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const append = (delta: string) =>
      setBubbles((b) => {
        const last = b[b.length - 1];
        if (last?.role === "assistant" && !last.error) return [...b.slice(0, -1), { ...last, text: last.text + delta }];
        if (!delta.trim()) return b;
        return [...b, { id: nid(), role: "assistant", text: delta.trimStart() }];
      });
    const conv = latest.current.conversation;
    const runTool = conv ? createToolRunner(conv.actions, (widget) => setBubbles((b) => [...b, { id: nid(), role: "widget", widget }])) : undefined;

    try {
      const { messages, refused } = await askAssistant({
        history: turns,
        context: latest.current.context,
        guide: conv?.guide,
        tools: conv?.tools,
        runTool,
        onText: append,
        signal: ctrl.signal,
      });
      if (refused) setBubbles((b) => [...b, { id: nid(), role: "assistant", text: "Não posso ajudar com esse pedido. Tente perguntar de outro jeito.", error: true }]);
      else setHistory(messages);
      // remove espaços finais deixados entre ferramentas
      setBubbles((b) => b.map((x) => (x.role === "assistant" ? { ...x, text: x.text.trimEnd() } : x)).filter((x) => x.role !== "assistant" || x.text));
    } catch (e) {
      const msg = describeError(e);
      // a pergunta não entra no histórico: quem perguntou pode reenviar
      if (msg) setBubbles((b) => [...b, { id: nid(), role: "assistant", text: msg, error: true }]);
      else setInput(text);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  /** Clique num componente: registra pelo mesmo caminho validado das ferramentas e avisa o assistente. */
  const pickByClick = async (widgetId: number, update: Record<string, unknown>, said: string, label: string) => {
    const conv = latest.current.conversation;
    if (!conv || busy) return;
    await createToolRunner(conv.actions, () => {})("atualizar_analise", update);
    closeWidget(widgetId, label);
    void send(`${said}${CLICK_MARK}`);
  };

  const pickCrops = (widgetId: number, purpose: CropPurpose, ids: string[]) => {
    const names = ids.map(cropLabel).join(", ");
    if (purpose === "interesse") return pickByClick(widgetId, { culturas_interesse: { acao: "adicionar", culturas: ids } }, `Quero comparar: ${names}.`, `Escolhido: ${names}`);
    const field = purpose === "verao" ? "verao_atual" : "inverno_atual";
    const said = purpose === "verao" ? `No verão eu planto ${names}.` : `No inverno: ${names}.`;
    return pickByClick(widgetId, { [field]: ids[0], substituir_rotacao: true }, said, `Escolhido: ${names}`);
  };

  const pickProperty = (widgetId: number, id: string) => {
    const p = latest.current.conversation?.actions.properties.find((x) => x.id === id);
    if (p) void pickByClick(widgetId, { propriedade_id: id }, `Vamos analisar ${p.name}.`, p.name);
  };

  const reset = () => {
    abortRef.current?.abort();
    setHistory([]);
    setBubbles(initialBubbles(conversation));
  };

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-[950] flex h-12 cursor-pointer items-center gap-2 rounded-full bg-primary pl-4 pr-5 text-sm font-semibold text-white shadow-raised transition-transform hover:scale-[1.03] hover:bg-primary-hover"
      >
        <MessageCircle className="size-5" /> Tire dúvidas
      </button>
    );

  const last = bubbles[bubbles.length - 1];
  const typing = busy && !(last?.role === "assistant" && !last.error && last.text);

  return (
    <section
      aria-label="Assistente da análise"
      className={cn(
        "flex flex-col overflow-hidden",
        inline
          ? "h-[min(720px,calc(100dvh-11rem))] rounded-xl bg-white shadow-card ring-1 ring-border"
          : "glass animate-in fixed inset-x-3 bottom-3 z-[950] h-[min(620px,calc(100dvh-6rem))] rounded-xl border sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[400px]",
        className,
      )}
    >
      <header className="flex items-center gap-2.5 border-b border-border/70 px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-lime text-white">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Assistente Semeia</p>
          <p className="text-[11px] text-muted-foreground">{conversation ? "Vamos montar sua análise conversando" : "Conhece sua propriedade e o que você escolheu"}</p>
        </div>
        {(history.length > 0 || bubbles.length > 2) && (
          <button type="button" onClick={reset} aria-label="Recomeçar conversa" title="Recomeçar conversa" className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <RotateCcw className="size-4" />
          </button>
        )}
        {!inline && (
          <button type="button" onClick={() => setOpen(false)} aria-label="Fechar assistente" className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        )}
      </header>

      <div ref={scrollRef} className={cn("flex-1 space-y-3 overflow-y-auto px-4 py-4", inline && "bg-muted/40")} aria-live="polite">
        {bubbles.length === 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-muted-foreground">Pergunte sobre culturas, solo, épocas de plantio ou o resultado da análise.</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="cursor-pointer rounded-[10px] bg-white/70 px-3 py-2 text-left text-[13px] shadow-sm ring-1 ring-border transition hover:bg-primary-soft/60 hover:ring-primary/30"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {bubbles.map((b) =>
          b.role === "widget" ? (
            <div key={b.id} className={cn(!b.done && b.widget.kind === "crops" && "max-w-[520px]")}>
              {b.widget.kind === "crops" ? (
                <CropPicker widget={b.widget} done={b.done} disabled={busy} max={latest.current.conversation?.actions.maxInterest ?? 6} onPick={(ids) => pickCrops(b.id, (b.widget as Extract<Widget, { kind: "crops" }>).purpose, ids)} />
              ) : b.widget.kind === "properties" ? (
                <PropertyChips
                  properties={(latest.current.conversation?.actions.properties ?? []).filter((p) => (b.widget as Extract<Widget, { kind: "properties" }>).ids.includes(p.id))}
                  done={b.done}
                  disabled={busy}
                  onPick={(id) => pickProperty(b.id, id)}
                />
              ) : (
                <OptionChips options={b.widget.options} done={b.done} disabled={busy} onPick={(o) => send(o)} />
              )}
            </div>
          ) : (
            <div key={b.id} className={cn("flex", b.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[88%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed",
                  b.role === "user" && "rounded-br-md bg-primary text-white",
                  b.role === "assistant" && !b.error && "rounded-bl-md bg-white shadow-sm ring-1 ring-border",
                  b.role === "assistant" && b.error && "rounded-bl-md bg-danger-soft text-danger",
                )}
              >
                {b.role === "assistant" ? <RichText text={b.text} /> : b.text.replace(CLICK_MARK, "")}
              </div>
            </div>
          ),
        )}
        {typing && (
          <span className="flex w-fit gap-1 rounded-2xl rounded-bl-md bg-white px-3.5 py-3 shadow-sm ring-1 ring-border" aria-label="Escrevendo">
            {[0, 1, 2].map((d) => (
              <span key={d} className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${d * 120}ms` }} />
            ))}
          </span>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-border/70 bg-white/60 p-3"
      >
        <div className="flex items-end gap-2 rounded-[14px] bg-white px-3 py-2 ring-1 ring-input focus-within:ring-2 focus-within:ring-ring/40">
          <textarea
            ref={inputRef}
            value={input}
            maxLength={MAX_INPUT_CHARS}
            disabled={limitReached}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder={limitReached ? "Limite de mensagens desta conversa atingido" : conversation ? "Responda ou pergunte sobre a análise…" : "Escreva sua dúvida sobre o campo…"}
            aria-label="Sua mensagem"
            className="max-h-28 min-h-[24px] flex-1 resize-none bg-transparent py-0.5 text-sm outline-none placeholder:text-subtle-foreground"
          />
          {canSpeak && !busy && (
            <button
              type="button"
              onClick={toggleVoice}
              disabled={limitReached}
              aria-label={listening ? "Parar de ouvir" : "Falar em vez de digitar"}
              title={listening ? "Ouvindo… clique para parar" : "Falar em vez de digitar"}
              className={cn(
                "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors disabled:opacity-40",
                listening ? "animate-pulse bg-danger text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Mic className="size-4" />
            </button>
          )}
          {busy ? (
            <button type="button" onClick={() => abortRef.current?.abort()} aria-label="Parar resposta" className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground text-white">
              <Square className="size-3 fill-current" />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} aria-label="Enviar" className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-white disabled:cursor-not-allowed disabled:opacity-40">
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-center text-[10.5px] text-subtle-foreground">
          {limitReached ? (
            <>
              Limite de {MAX_USER_MESSAGES} mensagens.{" "}
              <button type="button" onClick={reset} className="cursor-pointer font-medium text-primary underline">
                Recomeçar
              </button>
            </>
          ) : input.length > MAX_INPUT_CHARS * 0.8 ? (
            `${input.length}/${MAX_INPUT_CHARS} caracteres`
          ) : (
            "Só assuntos do campo e da análise · confirme decisões com seu agrônomo."
          )}
        </p>
      </form>
    </section>
  );
}
