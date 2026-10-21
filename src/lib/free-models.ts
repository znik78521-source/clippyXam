import { openRouterFetch } from "./openrouter-transport";
export const DEFAULT_MODEL = "openrouter/free";
export interface FreeModel {
  id: string;
  name: string;
  group: "fast" | "reserve";
}
export function isFreeModel(id: string) {
  return (
    id === DEFAULT_MODEL ||
    (id.length <= 160 && /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_./-]+:free$/.test(id))
  );
}
function priority(id: string) {
  const size = Number(
    /(?:^|[-/])(\d+(?:\.\d+)?)b(?:[-:]|$)/i.exec(id)?.[1] || 100,
  );
  return size + (/thinking|reasoning|coder/i.test(id) ? 100 : 0);
}
export function orderFreeModels(models: FreeModel[]) {
  return [...models].sort(
    (a, b) => priority(a.id) - priority(b.id) || a.id.localeCompare(b.id),
  );
}
// Bootstrap only. Refreshed from the public OpenRouter catalog, never marketed as a speed benchmark.
export const BOOTSTRAP_MODELS: FreeModel[] = [
  { id: "qwen/qwen3-4b:free", name: "Qwen3 4B", group: "fast" },
  { id: "google/gemma-4-31b-it:free", name: "Gemma 4 31B", group: "reserve" },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    name: "Llama 3.3 70B",
    group: "reserve",
  },
];
export function parseFreeModels(payload: unknown): FreeModel[] {
  const rows = (payload as { data?: unknown })?.data;
  if (!Array.isArray(rows)) throw new Error("Некорректный каталог моделей.");
  const result = new Map<string, FreeModel>();
  const zero = (v: unknown) =>
    (typeof v === "number" || typeof v === "string") &&
    String(v).trim() !== "" &&
    Number(v) === 0;
  for (const row of rows.slice(0, 5000)) {
    if (
      !row ||
      typeof row.id !== "string" ||
      row.id === DEFAULT_MODEL ||
      row.id.startsWith("liquid/") ||
      !isFreeModel(row.id)
    )
      continue;
    if (!zero(row.pricing?.prompt) || !zero(row.pricing?.completion)) continue;
    if (row.pricing?.request !== undefined && !zero(row.pricing.request))
      continue;
    if (
      !row.architecture?.output_modalities?.includes("text") ||
      !row.architecture?.input_modalities?.includes("text")
    )
      continue;
    result.set(row.id, {
      id: row.id,
      name: typeof row.name === "string" ? row.name.slice(0, 120) : row.id,
      group: priority(row.id) <= 8 ? "fast" : "reserve",
    });
  }
  return orderFreeModels([...result.values()]);
}
export async function fetchFreeModels(signal: AbortSignal) {
  // Intentionally no Authorization: listing is public and does not receive the user's API key.
  const response = await openRouterFetch("models", {
    signal,
  });
  if (!response.ok)
    throw new Error(`Каталог недоступен (HTTP ${response.status}).`);
  return parseFreeModels(await response.json());
}
export function fallbackCandidates(
  preferred: string,
  models: FreeModel[],
  enabled = true,
): string[] {
  if (!isFreeModel(preferred))
    throw new Error(
      "Разрешены только бесплатные модели с :free или openrouter/free.",
    );
  const first = preferred.startsWith("liquid/") ? DEFAULT_MODEL : preferred;
  if (!enabled) return [first];
  const available = orderFreeModels(models)
    .map((m) => m.id)
    .filter((id) => isFreeModel(id) && !id.startsWith("liquid/"));
  return [
    ...new Set([
      first,
      ...(first === DEFAULT_MODEL ? [] : [DEFAULT_MODEL]),
      ...available,
    ]),
  ].slice(0, 4);
}
