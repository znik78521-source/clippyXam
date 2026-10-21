export type RouterId = "openrouter" | "groq" | "teamorouter";
export interface RouterModel {
  id: string;
  name: string;
  group?: "fast" | "reserve";
}
export const ROUTERS: { id: RouterId; name: string }[] = [
  { id: "openrouter", name: "OpenRouter — бесплатные модели" },
  { id: "groq", name: "Groq — только аккаунт Free" },
  { id: "teamorouter", name: "TeamoRouter — платный, по тарифу" },
];
export const ROUTER_MODELS: Record<Exclude<RouterId, "openrouter">, RouterModel[]> = {
  // Official Groq docs list these API model IDs, but do not guarantee that each
  // is enabled on every Free account. The app cannot inspect billing tier; the
  // user must keep the account on Free and verify current model availability.
  // No cross-provider fallback or automatic plan upgrade is ever requested.
  groq: [
    { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B — проверь доступность Free" },
    { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B — проверь доступность Free" },
    { id: "openai/gpt-oss-safeguard-20b", name: "GPT-OSS Safeguard 20B — проверь доступность Free" },
    { id: "qwen/qwen3.8-27b", name: "Qwen 3.8 27B — проверь доступность Free" },
  ],
  // TeamoRouter is pay-as-you-go. This ID contains "free", but its advertised
  // promotion is discounted, not zero-priced. Never treat it as free.
  teamorouter: [
    { id: "deepseek-v4-flash-free", name: "DeepSeek V4 Flash Free (проверяй цену; может тарифицироваться)" },
  ],
};
export function routerModelAllowed(router: RouterId, model: string) {
  if (router === "openrouter")
    return model === "openrouter/free" || /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_./-]+:free$/.test(model);
  return ROUTER_MODELS[router].some((entry) => entry.id === model);
}
export const ROUTER_ENDPOINTS: Record<RouterId, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
  teamorouter: "https://api.teamorouter.com/v1",
};
