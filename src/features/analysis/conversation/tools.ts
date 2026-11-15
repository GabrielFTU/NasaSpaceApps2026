import { CROPS, CROP_MAP, DRAINAGE_LABEL, FALLOW_ID, PRIORITY_LABEL, SOIL_TEXTURE_LABEL } from "@/data/crops";
import type { AssistantTool, ToolOutcome } from "@/services/assistant";
import type { Crop, Priorities, PriorityKey, Property, SoilProfile } from "@/types";

/* =====================================================================================
 * Memória estruturada da análise (modo conversa).
 * O agricultor conta como trabalha; o assistente propõe atualizações; este módulo valida,
 * guarda a origem de cada dado e diz o que ainda falta. O roteiro sai do que falta, não de uma
 * sequência fixa.
 * ===================================================================================== */

/** Cultura como o agricultor falou. `id` nulo = fora do catálogo (registrada, mas sem parâmetros). */
export interface CropEntry {
  name: string;
  id: string | null;
  note?: string;
}

export interface ConvState {
  propertyId: string | null;
  propertyConfirmed: boolean;
  /** O que planta hoje. null = ainda não sabemos; "desconhecido" = o agricultor não sabe. */
  verao: CropEntry | null;
  inverno: CropEntry | null;
  candidates: CropEntry[];
  soil: SoilProfile | null;
  soilSource: "cadastro" | "laudo" | null;
  soilConfirmed: boolean;
  /** Campos do solo que o agricultor corrigiu na conversa. */
  soilChanged: string[];
  priorities: Priorities | null;
  /** O que o agricultor disse, nas palavras dele (ex.: "colher mais sem estragar a terra"). */
  prioritiesNote: string;
  /** Coisas que o agricultor disse não saber. */
  unknown: string[];
}

export const EMPTY_CONV: ConvState = {
  propertyId: null,
  propertyConfirmed: false,
  verao: null,
  inverno: null,
  candidates: [],
  soil: null,
  soilSource: null,
  soilConfirmed: false,
  soilChanged: [],
  priorities: null,
  prioritiesNote: "",
  unknown: [],
};

export type CropPurpose = "verao" | "inverno" | "interesse";

/** O que o chat mostra como componente interativo. */
export type Widget =
  | { kind: "crops"; purpose: CropPurpose; ids: string[] }
  | { kind: "options"; options: string[] }
  | { kind: "properties"; ids: string[] };

export interface GenerateInput {
  propertyId: string;
  verao: string;
  inverno: string;
  interest: string[];
  soil: SoilProfile;
  priorities: Priorities;
}

/** O que a tela da análise oferece: ler/gravar o estado e gerar a comparação. */
export interface AnalysisActions {
  maxInterest: number;
  properties: Property[];
  summerIds: string[];
  winterIds: string[];
  interestIds: string[];
  get: () => ConvState;
  set: (next: ConvState) => void;
  /** Perfil de solo efetivo (laudo > cadastro) da propriedade e de onde veio. */
  soilOf: (p: Property) => { soil: SoilProfile; source: "cadastro" | "laudo" };
  generate: (input: GenerateInput) => Promise<string>;
}

/* ---------- resolução de culturas pelo nome que o agricultor usou ---------- */

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .trim();

const FALLOW_WORDS = ["pousio", "descanso", "descansando", "parado", "parada", "nada", "deixo a terra", "sem plantio", "vazio"];

type Resolved = { ok: CropEntry } | { ambiguous: Crop[] };

/** Acha a cultura do catálogo pelo id ou nome. Sem correspondência, vira cultura informada (id nulo). */
export function resolveCrop(text: string, validIds: string[], allowFallow: boolean): Resolved {
  const q = norm(text);
  if (allowFallow && FALLOW_WORDS.some((w) => q.includes(w))) return { ok: { name: "Pousio", id: FALLOW_ID } };
  const exact = CROPS.find((c) => c.id === text || norm(c.name) === q || norm(c.id) === q);
  const hits = exact ? [exact] : CROPS.filter((c) => norm(c.name).includes(q) || (q.length > 3 && q.includes(norm(c.name))));
  if (hits.length > 1) {
    const valid = hits.filter((c) => validIds.includes(c.id));
    if (valid.length === 1) return { ok: { name: valid[0].name, id: valid[0].id } };
    return { ambiguous: hits };
  }
  const c = hits[0];
  const name = text.trim().replace(/^./, (ch) => ch.toUpperCase());
  if (!c) return { ok: { name, id: null, note: "fora do catálogo — sem parâmetros agronômicos" } };
  if (!validIds.includes(c.id)) return { ok: { name: c.name, id: null, note: "no catálogo, mas não nesta época/função" } };
  return { ok: { name: c.name, id: c.id } };
}

/* ---------- o que falta e se dá para gerar ---------- */

export function missing(s: ConvState): string[] {
  const m: string[] = [];
  if (!s.propertyId) m.push("qual propriedade");
  if (!s.verao) m.push("o que planta hoje no verão");
  if (!s.inverno) m.push("o que planta hoje no inverno (ou se deixa a terra descansar)");
  if (!s.candidates.length) m.push("se quer manter o que planta ou conhecer outras culturas (culturas de interesse)");
  if (s.propertyId && !s.soilConfirmed) m.push("confirmar o solo que está no cadastro");
  if (!s.priorities) m.push("o que mais preocupa ou importa na próxima safra (prioridades)");
  return m;
}

export interface Readiness {
  blocking: string[];
  /** Limitações que deixam a comparação parcial (pedem consentimento). */
  partial: string[];
  /** Informações registradas que não entram no cálculo. */
  notes: string[];
}

export function readiness(s: ConvState): Readiness {
  const blocking: string[] = [];
  const partial: string[] = [];
  const notes: string[] = [];
  if (!s.propertyId) blocking.push("falta a propriedade");
  if (!s.priorities) blocking.push("faltam as prioridades");
  if (!s.verao) blocking.push("falta o que planta no verão");
  else if (!s.verao.id)
    blocking.push(`a cultura de verão (${s.verao.name}) não tem parâmetros na base; sem uma cultura de verão do catálogo não dá para simular a rotação atual`);
  if (!s.inverno) blocking.push("falta o que planta no inverno");
  else if (!s.inverno.id) partial.push(`${s.inverno.name} no inverno não tem parâmetros; na simulação o inverno atual entraria como pousio`);
  const evaluable = s.candidates.filter((c) => c.id);
  if (!evaluable.length) blocking.push("nenhuma cultura de interesse do catálogo para comparar");
  for (const c of s.candidates.filter((x) => !x.id)) notes.push(`${c.name}: registrada, mas fica fora do cálculo (sem parâmetros)`);
  if (!s.soilConfirmed) partial.push("solo não confirmado pelo agricultor");
  if (s.soilSource !== "laudo") notes.push("sem análise de solo de laboratório: avaliação do solo é aproximada");
  return { blocking, partial, notes };
}

/** Entrada do motor a partir do estado (chame só sem bloqueios). Inverno fora do catálogo entra como pousio. */
export function inputFromState(s: ConvState, maxInterest: number): GenerateInput {
  return {
    propertyId: s.propertyId!,
    verao: s.verao!.id!,
    inverno: s.inverno?.id ?? FALLOW_ID,
    interest: s.candidates
      .filter((c) => c.id)
      .map((c) => c.id!)
      .slice(0, maxInterest),
    soil: s.soil!,
    priorities: s.priorities!,
  };
}

/** Texto do estado para o contexto do assistente — com a origem de cada dado. */
export function describeState(s: ConvState, properties: Property[]): string {
  const p = properties.find((x) => x.id === s.propertyId);
  const crop = (c: CropEntry | null) => (!c ? "ainda não informado" : c.id ? `${c.name} (id ${c.id})` : `${c.name} — ${c.note ?? "fora do catálogo"}`);
  const lines = [
    "ESTADO DA ANÁLISE (fonte da verdade — consulte antes de perguntar):",
    `- Propriedade: ${p ? `${p.name} (${p.city}/${p.state}), ${s.propertyConfirmed ? "confirmada" : "selecionada, não confirmada"}` : "não escolhida"}`,
    `- Planta hoje no verão: ${crop(s.verao)}`,
    `- Planta hoje no inverno: ${crop(s.inverno)}`,
    `- Culturas de interesse: ${s.candidates.length ? s.candidates.map((c) => crop(c)).join("; ") : "nenhuma ainda"}`,
  ];
  if (s.soil) {
    const so = s.soil;
    lines.push(
      `- Solo (origem: ${s.soilSource === "laudo" ? "análise de laboratório" : "cadastro da propriedade"}${s.soilChanged.length ? `; corrigido pelo agricultor: ${s.soilChanged.join(", ")}` : ""}; ${s.soilConfirmed ? "CONFIRMADO pelo agricultor" : "NÃO confirmado ainda"}): textura ${SOIL_TEXTURE_LABEL[so.texture].toLowerCase()}, drenagem ${DRAINAGE_LABEL[so.drainage].toLowerCase()}, pH ${so.ph ?? "não informado"}, M.O. ${so.organicMatter ?? "não informada"}${so.compaction ? ", sinais de compactação" : ""}${so.erosionHistory ? ", histórico de erosão" : ""}`,
    );
  }
  lines.push(
    `- Prioridades: ${s.priorities ? (Object.keys(s.priorities) as PriorityKey[]).map((k) => `${PRIORITY_LABEL[k]} ${s.priorities![k]}/5`).join(", ") : "não definidas"}${s.prioritiesNote ? ` (nas palavras dele: "${s.prioritiesNote}")` : ""}`,
  );
  if (s.unknown.length) lines.push(`- Não sabe: ${s.unknown.join("; ")}`);
  const m = missing(s);
  lines.push(m.length ? `O QUE AINDA FALTA: ${m.join("; ")}` : "NADA FALTA: apresente o resumo e peça confirmação para gerar.");
  return lines.join("\n");
}

/* ---------- ferramentas ---------- */

export const ANALYSIS_TOOLS: AssistantTool[] = [
  {
    name: "atualizar_analise",
    description:
      "Registra no estado da análise tudo o que a pessoa contou, de uma vez (pode ter várias informações numa mensagem). Envie só os campos que a pessoa informou agora. Culturas podem ir pelo nome que ela usou, mesmo fora do catálogo (ex.: 'tomate') — o sistema registra e marca a limitação. A resposta traz o estado atualizado, conflitos e o que falta.",
    parameters: {
      type: "object",
      properties: {
        propriedade_id: { type: "string", description: "id da lista de propriedades" },
        verao_atual: { type: "string", description: "o que planta hoje no verão (nome ou id)" },
        inverno_atual: { type: "string", description: "o que planta hoje no inverno (nome, id ou 'pousio')" },
        substituir_rotacao: {
          type: "boolean",
          description: "true SÓ quando a pessoa disse claramente que a nova cultura entra NO LUGAR da anterior. Nunca por conta própria; 'também'/'em outra área' é acréscimo, não substituição",
        },
        culturas_interesse: {
          type: "object",
          properties: {
            acao: { type: "string", enum: ["adicionar", "remover", "substituir"] },
            culturas: { type: "array", items: { type: "string" } },
          },
          required: ["acao", "culturas"],
        },
        solo: {
          type: "object",
          description: "correções que a pessoa fez e/ou a confirmação do solo do cadastro",
          properties: {
            confirmado: { type: "boolean", description: "true quando a pessoa disse que o solo do cadastro está certo (ou depois de corrigir)" },
            textura: { type: "string", enum: ["arenosa", "media", "argilosa", "muito_argilosa"] },
            drenagem: { type: "string", enum: ["boa", "moderada", "ruim"] },
            ph: { type: "number" },
            materia_organica: { type: "number" },
            compactacao: { type: "boolean" },
            erosao: { type: "boolean" },
          },
        },
        prioridades: {
          type: "object",
          description: "pesos de 0 a 5 que traduzem o que a pessoa disse",
          properties: {
            conservacao: { type: "integer" },
            agua: { type: "integer" },
            produtividade: { type: "integer" },
            diversificacao: { type: "integer" },
            nas_palavras_dele: { type: "string" },
          },
          required: ["conservacao", "agua", "produtividade", "diversificacao"],
        },
        nao_sabe: { type: "array", items: { type: "string" }, description: "itens que a pessoa disse não saber" },
      },
    },
  },
  {
    name: "mostrar_culturas",
    description:
      "Mostra cartões com foto de culturas do catálogo como APOIO visual (a pessoa pode clicar ou responder escrevendo). Use quando ela quiser conhecer opções ou estiver em dúvida. finalidade: verao/inverno = o que planta hoje; interesse = alternativas para comparar. 3 a 12 ids.",
    parameters: {
      type: "object",
      properties: {
        finalidade: { type: "string", enum: ["verao", "inverno", "interesse"] },
        culturas: { type: "array", items: { type: "string" } },
      },
      required: ["finalidade", "culturas"],
    },
  },
  {
    name: "mostrar_opcoes",
    description: "Mostra 2 a 4 botões curtos de resposta rápida, como apoio. A pessoa pode clicar ou escrever outra coisa.",
    parameters: { type: "object", properties: { opcoes: { type: "array", items: { type: "string" } } }, required: ["opcoes"] },
  },
  {
    name: "gerar_comparacao",
    description:
      "Confere se há dados suficientes e, se houver, gera a comparação de três estratégias e abre o resultado. Só chame depois que a pessoa confirmar o resumo. Se a comparação for parcial, o sistema devolve as limitações: explique e só chame de novo com exploratoria=true se a pessoa aceitar.",
    parameters: { type: "object", properties: { exploratoria: { type: "boolean" } } },
  },
];

/* ---------- validação e execução ---------- */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const strArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const err = (content: string): ToolOutcome => ({ content, isError: true });
const sameCrop = (a: CropEntry, b: CropEntry) => (a.id && b.id ? a.id === b.id : norm(a.name) === norm(b.name));

export function createToolRunner(actions: AnalysisActions, show: (w: Widget) => void) {
  return async (name: string, input: unknown): Promise<ToolOutcome> => {
    if (!isObj(input)) return err("Entrada inválida: esperado um objeto.");

    if (name === "mostrar_opcoes") {
      if (!strArr(input.opcoes) || input.opcoes.length < 2) return err("opcoes deve ter de 2 a 4 textos.");
      show({ kind: "options", options: input.opcoes.slice(0, 4).map((o) => o.slice(0, 60)) });
      return { content: "Botões exibidos (a pessoa pode clicar ou escrever). Não repita 'escolha abaixo'; termine a mensagem." };
    }

    if (name === "mostrar_culturas") {
      const purpose = input.finalidade;
      if (purpose !== "verao" && purpose !== "inverno" && purpose !== "interesse") return err("finalidade deve ser verao, inverno ou interesse.");
      if (!strArr(input.culturas)) return err("culturas deve ser uma lista de ids.");
      const valid = purpose === "verao" ? actions.summerIds : purpose === "inverno" ? [FALLOW_ID, ...actions.winterIds] : actions.interestIds;
      const ids = [...new Set(input.culturas.map((c) => (c === "pousio" ? FALLOW_ID : c)))].filter((c) => valid.includes(c)).slice(0, 12);
      if (!ids.length) return err(`Nenhum id válido para "${purpose}". Use ids do catálogo.`);
      show({ kind: "crops", purpose, ids });
      return { content: `Cartões exibidos: ${ids.map((i) => (i === FALLOW_ID ? "pousio" : (CROP_MAP[i]?.name ?? i))).join(", ")}. Termine a mensagem.` };
    }

    if (name === "atualizar_analise") return applyUpdate(actions, input);

    if (name === "gerar_comparacao") {
      const s = actions.get();
      const r = readiness(s);
      if (r.blocking.length) return err(`Ainda não dá para gerar: ${r.blocking.join("; ")}. Explique isso de forma simples e pergunte o que falta (ou ofereça alternativas reais).`);
      if (r.partial.length && input.exploratoria !== true)
        return err(
          `Comparação ficaria PARCIAL: ${r.partial.join("; ")}. Explique as limitações em linguagem simples e pergunte se a pessoa quer seguir mesmo assim (análise exploratória). Não gere sem o sim dela.`,
        );
      const out = await actions.generate(inputFromState(s, actions.maxInterest));
      return { content: `${out}${r.notes.length ? ` Observações para mencionar: ${r.notes.join("; ")}.` : ""}` };
    }

    return err(`Ferramenta desconhecida: ${name}`);
  };
}

/** Aplica a atualização proposta pelo assistente, com validação, origem dos dados e conflitos. */
const UPDATE_FIELDS = new Set(["propriedade_id", "verao_atual", "inverno_atual", "substituir_rotacao", "culturas_interesse", "solo", "prioridades", "nao_sabe"]);

function applyUpdate(actions: AnalysisActions, input: Record<string, unknown>): ToolOutcome {
  let s = { ...actions.get() };
  const done: string[] = [];
  const conflicts: string[] = [];
  const problems: string[] = [];

  // campo com nome errado não pode sumir calado: o modelo acharia que registrou
  const unknownFields = Object.keys(input).filter((k) => !UPDATE_FIELDS.has(k));
  if (unknownFields.length) problems.push(`campos desconhecidos NÃO registrados: ${unknownFields.join(", ")}. Campos válidos: ${[...UPDATE_FIELDS].join(", ")}. Envie de novo com o nome certo`);

  // propriedade
  if (input.propriedade_id !== undefined) {
    const p = actions.properties.find((x) => x.id === input.propriedade_id);
    if (!p) problems.push(`propriedade_id inválido; use um destes: ${actions.properties.map((x) => x.id).join(", ")}`);
    else {
      if (s.propertyId !== p.id) {
        const { soil, source } = actions.soilOf(p);
        s = { ...s, propertyId: p.id, soil, soilSource: source, soilConfirmed: false, soilChanged: [] };
      }
      s.propertyConfirmed = true;
      done.push(`propriedade ${p.name}`);
    }
  }

  // rotação atual (com detecção de contradição)
  for (const season of ["verao", "inverno"] as const) {
    const raw = input[`${season}_atual`];
    if (raw === undefined) continue;
    if (typeof raw !== "string" || !raw.trim()) {
      problems.push(`${season}_atual deve ser um texto`);
      continue;
    }
    const r = resolveCrop(raw, season === "verao" ? actions.summerIds : actions.winterIds, season === "inverno");
    if ("ambiguous" in r) {
      problems.push(`"${raw}" é ambíguo (${r.ambiguous.map((c) => c.name).join(" ou ")}): pergunte qual`);
      continue;
    }
    const prev = s[season];
    if (prev && !sameCrop(prev, r.ok) && input.substituir_rotacao !== true) {
      conflicts.push(
        `${season}: antes ${prev.name}, agora ${r.ok.name}. Pergunte se substitui (aí envie substituir_rotacao=true), se planta as duas em áreas diferentes, ou se ${r.ok.name} é uma alternativa (aí use culturas_interesse)`,
      );
      continue;
    }
    s[season] = r.ok;
    done.push(`${season} atual: ${r.ok.name}${r.ok.id ? "" : ` (${r.ok.note})`}`);
  }

  // culturas de interesse
  if (input.culturas_interesse !== undefined) {
    const ci = input.culturas_interesse;
    if (!isObj(ci) || !strArr(ci.culturas) || !["adicionar", "remover", "substituir"].includes(ci.acao as string)) problems.push("culturas_interesse inválido");
    else {
      const entries: CropEntry[] = [];
      for (const raw of ci.culturas) {
        const r = resolveCrop(raw, actions.interestIds, false);
        if ("ambiguous" in r) problems.push(`"${raw}" é ambíguo (${r.ambiguous.map((c) => c.name).join(" ou ")}): pergunte qual`);
        else entries.push(r.ok);
      }
      let list = ci.acao === "substituir" ? [] : [...s.candidates];
      if (ci.acao === "remover") list = list.filter((c) => !entries.some((e) => sameCrop(c, e)));
      else for (const e of entries) if (!list.some((c) => sameCrop(c, e))) list.push(e);
      const catalog = list.filter((c) => c.id);
      if (catalog.length > actions.maxInterest) problems.push(`no máximo ${actions.maxInterest} culturas do catálogo; peça para escolher`);
      else {
        s.candidates = list;
        done.push(`interesse: ${list.map((c) => c.name + (c.id ? "" : " (sem parâmetros)")).join(", ") || "nenhuma"}`);
      }
    }
  }

  // solo
  if (input.solo !== undefined) {
    const so = input.solo;
    if (!isObj(so)) problems.push("solo inválido");
    else if (!s.soil) problems.push("escolha a propriedade antes do solo");
    else {
      const patch: Partial<SoilProfile> = {};
      const changed: string[] = [];
      if (so.textura !== undefined) {
        if (!["arenosa", "media", "argilosa", "muito_argilosa"].includes(so.textura as string)) problems.push("textura inválida");
        else ((patch.texture = so.textura as SoilProfile["texture"]), changed.push("textura"));
      }
      if (so.drenagem !== undefined) {
        if (!["boa", "moderada", "ruim"].includes(so.drenagem as string)) problems.push("drenagem inválida");
        else ((patch.drainage = so.drenagem as SoilProfile["drainage"]), changed.push("drenagem"));
      }
      if (so.ph !== undefined) {
        if (typeof so.ph !== "number" || so.ph < 3.5 || so.ph > 9) problems.push("pH deve estar entre 3,5 e 9");
        else ((patch.ph = so.ph), changed.push("pH"));
      }
      if (so.materia_organica !== undefined) {
        if (typeof so.materia_organica !== "number" || so.materia_organica < 0 || so.materia_organica > 15) problems.push("M.O. entre 0 e 15%");
        else ((patch.organicMatter = so.materia_organica), changed.push("matéria orgânica"));
      }
      if (typeof so.compactacao === "boolean") ((patch.compaction = so.compactacao), changed.push("compactação"));
      if (typeof so.erosao === "boolean") ((patch.erosionHistory = so.erosao), changed.push("erosão"));
      s.soil = { ...s.soil, ...patch };
      s.soilChanged = [...new Set([...s.soilChanged, ...changed])];
      if (so.confirmado === true || changed.length) s.soilConfirmed = true;
      done.push(changed.length ? `solo corrigido: ${changed.join(", ")}` : so.confirmado ? "solo confirmado" : "solo sem mudanças");
    }
  }

  // prioridades
  if (input.prioridades !== undefined) {
    const pr = input.prioridades;
    const keys = ["conservacao", "agua", "produtividade", "diversificacao"] as const;
    if (!isObj(pr)) problems.push("prioridades inválidas");
    else {
      const p = {} as Priorities;
      let ok = true;
      for (const k of keys) {
        const v = pr[k];
        if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 5) ok = false;
        else p[k] = v;
      }
      if (!ok) problems.push("prioridades: cada peso deve ser inteiro de 0 a 5");
      else if (keys.every((k) => p[k] === 0)) problems.push("ao menos uma prioridade precisa de peso maior que zero");
      else {
        s.priorities = p;
        if (typeof pr.nas_palavras_dele === "string") s.prioritiesNote = pr.nas_palavras_dele.slice(0, 160);
        done.push("prioridades");
      }
    }
  }

  if (strArr(input.nao_sabe) && input.nao_sabe.length) {
    s.unknown = [...new Set([...s.unknown, ...input.nao_sabe.map((x) => x.slice(0, 80))])];
    done.push(`não sabe: ${input.nao_sabe.join(", ")}`);
  }

  actions.set(s);
  const m = missing(s);
  const parts = [
    done.length ? `Registrado: ${done.join("; ")}.` : "Nada registrado.",
    conflicts.length || problems.length ? "Só diga à pessoa que registrou o que está em 'Registrado'." : "",
    conflicts.length ? `CONFLITO (não aplicado — esclareça com a pessoa): ${conflicts.join(" | ")}.` : "",
    problems.length ? `Problemas: ${problems.join("; ")}.` : "",
    m.length ? `Ainda falta: ${m.join("; ")}.` : "Nada falta: mostre o resumo e peça confirmação para gerar.",
  ];
  return { content: parts.filter(Boolean).join(" "), isError: !done.length && (problems.length > 0 || conflicts.length > 0) };
}

export const CONVERSATION_GUIDE = `MODO CONVERSA — como conduzir:

Objetivo: o agricultor conta como trabalha na propriedade; você organiza isso no estado da análise para comparar três estratégias de rotação (a atual e duas alternativas). Não é um formulário: pergunte só o que falta, guiado por "O QUE AINDA FALTA" no contexto.

Princípios:
1. Linguagem do agricultor: fale de terra, chuva, plantio, colheita. Termos técnicos só quando ajudarem, com explicação curta ("terra arenosa, que seca rápido").
2. Pergunte pouco: uma pergunta aberta por vez, que aceite respostas variadas. Ex.: "Me conta: o que você costuma plantar nessa área ao longo do ano?" ou "E depois da soja, o que entra? Se deixa a terra descansar ou planta algo para cobrir, pode contar também."
3. Extraia tudo de uma vez: se a pessoa disser várias coisas numa mensagem, registre todas numa só chamada de atualizar_analise e não pergunte de novo o que já foi dito.
4. Consulte o ESTADO DA ANÁLISE antes de cada pergunta. Nunca pergunte algo que já está lá.
5. Cultura fora do catálogo (ex.: tomate): registre pelo nome com atualizar_analise, confirme que entendeu e explique em uma frase que ainda não há todos os parâmetros dela, então a análise vai sinalizar essa limitação. Nunca diga que "não está disponível" nem a substitua por outra.
6. Contradições: quando a pessoa citar para a mesma época uma cultura diferente da que já está no estado, NÃO substitua. Envie a nova cultura sem substituir_rotacao; se vier CONFLITO, pergunte de forma simples se ela entra no lugar da anterior, se é plantada em outra área, ou se é uma alternativa para comparar. "Também", "e", "em outra área" indicam acréscimo: a cultura principal continua na rotação atual e a outra vira cultura de interesse (se ela quiser comparar). Só use substituir_rotacao=true quando a pessoa disser claramente que trocou.
6b. Só afirme que registrou algo se a resposta de atualizar_analise listar isso em "Registrado".
7. Dados do cadastro: apresente como "Encontrei no cadastro…" e peça confirmação ("Isso continua certo?"). Separe o que veio do cadastro, o que a pessoa disse e o que é interpretação sua. Não tire conclusões fortes do solo sem análise de laboratório.
8. "Não sei" é resposta válida: registre em nao_sabe e siga.
9. Prioridades: pergunte o que mais preocupa na próxima safra. Se a resposta for ambígua e isso mudar a comparação (ex.: "produzir mais" = colher mais na mesma área? mais colheitas no ano? ganhar mais? perder menos?), faça UMA pergunta objetiva. Traduza em pesos (0–5) e diga em uma frase como entendeu.
10. Botões (mostrar_opcoes, mostrar_culturas) são apoio, não obrigação. Nunca escreva "escolha uma das opções abaixo" ou parecido. A pessoa sempre pode responder do jeito dela.
11. Quando nada faltar: mostre um resumo curto (propriedade, o que planta hoje, o que quer comparar, solo — dizendo a origem —, prioridades e limitações conhecidas) e pergunte se pode explorar as três estratégias. Só então chame gerar_comparacao.
12. Se gerar_comparacao disser que a comparação seria parcial ou que falta algo, explique de forma honesta e simples. Não prometa resultado que o sistema não consegue calcular.
13. A pessoa pode corrigir qualquer coisa a qualquer momento: atualize o estado e revise o que depende disso.`;
