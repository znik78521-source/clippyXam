// Fixed-purpose, owner-only transport. No arbitrary URLs, paid routes, disk logs or TLS bypass.
const { isTrustedFrame } = require("./window-policy.cjs");
const ENDPOINTS = {
  models: "https://openrouter.ai/api/v1/models",
  chat: "https://openrouter.ai/api/v1/chat/completions",
};
function codeFor(error) {
  const code = String(error?.code || "") + " " + String(error?.message || "");
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN/.test(code)) return "DNS";
  if (/ERR_CERT|ERR_SSL|CERT_|TLS|UNABLE_TO_VERIFY/.test(code)) return "TLS";
  if (/ERR_PROXY|ERR_TUNNEL|PROXY_CONNECTION/.test(code)) return "PROXY";
  if (/ERR_INTERNET_DISCONNECTED|ENETUNREACH/.test(code)) return "OFFLINE";
  if (/ERR_CONNECTION|ECONNRESET|ECONNREFUSED/.test(code)) return "CONNECTION";
  return "NETWORK";
}
function validate(input) {
  if (
    !input ||
    typeof input.id !== "string" ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(input.id)
  )
    throw new Error("INVALID_REQUEST");
  if (input.kind === "models")
    return { url: ENDPOINTS.models, init: { method: "GET" } };
  if (input.kind !== "chat") throw new Error("INVALID_REQUEST");
  if (typeof input.key !== "string" || !/^[\x21-\x7e]{1,4096}$/.test(input.key))
    throw new Error("INVALID_KEY");
  const b = input.body;
  if (
    !b ||
    typeof b.model !== "string" ||
    b.model.length > 160 ||
    !(
      b.model === "openrouter/free" ||
      /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_./-]+:free$/.test(b.model)
    )
  )
    throw new Error("INVALID_REQUEST");
  if (
    b.provider?.max_price?.prompt !== 0 ||
    b.provider?.max_price?.completion !== 0 ||
    ![400, 2048].includes(b.max_tokens)
  )
    throw new Error("INVALID_REQUEST");
  if (
    !Array.isArray(b.messages) ||
    !b.messages.length ||
    b.messages.length > 21
  )
    throw new Error("INVALID_REQUEST");
  const messages = b.messages.map((m) => {
    if (
      !m ||
      !["system", "user", "assistant"].includes(m.role) ||
      typeof m.content !== "string" ||
      m.content.length > 60000
    )
      throw new Error("INVALID_REQUEST");
    return { role: m.role, content: m.content };
  });
  const body = JSON.stringify({
    model: b.model,
    max_tokens: b.max_tokens,
    messages,
    provider: {
      ...(b.provider.sort === "latency" ? { sort: "latency" } : {}),
      max_price: { prompt: 0, completion: 0 },
    },
  });
  if (Buffer.byteLength(body) > 256 * 1024) throw new Error("INVALID_REQUEST");
  return {
    url: ENDPOINTS.chat,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.key}`,
        "Content-Type": "application/json",
        "X-Title": "clippyXam",
      },
      body,
    },
  };
}
async function readJSON(response, limit) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("RESPONSE_TOO_LARGE");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}
function createOpenRouter({ fetchImpl, timeoutMs = 17000 }) {
  const active = new Map();
  return {
    async request(input) {
      let request;
      try {
        request = validate(input);
      } catch (e) {
        return {
          error:
            e.message === "INVALID_KEY" ? "INVALID_KEY" : "INVALID_REQUEST",
        };
      }
      // StrictMode can overlap a cancelled startup catalogue fetch with its
      // replacement. Leave room for those plus the owner's actual chat call.
      if (active.has(input.id) || active.size >= 4) return { error: "BUSY" };
      const controller = new AbortController();
      active.set(input.id, controller);
      const timer = setTimeout(() => controller.abort("TIMEOUT"), timeoutMs);
      try {
        const response = await fetchImpl(request.url, {
          ...request.init,
          signal: controller.signal,
          credentials: "omit",
          redirect: "error",
        });
        const data = await readJSON(
          response,
          input.kind === "models" ? 8 * 1024 * 1024 : 256 * 1024,
        );
        controller.signal.throwIfAborted();
        return { status: response.status, data };
      } catch (error) {
        return {
          error: controller.signal.aborted
            ? controller.signal.reason === "TIMEOUT"
              ? "TIMEOUT"
              : "ABORTED"
            : error?.message === "RESPONSE_TOO_LARGE"
              ? "RESPONSE_TOO_LARGE"
              : codeFor(error),
        };
      } finally {
        clearTimeout(timer);
        active.delete(input.id);
      }
    },
    cancel(id) {
      if (typeof id === "string") active.get(id)?.abort("ABORTED");
    },
    dispose() {
      for (const controller of active.values()) controller.abort("ABORTED");
    },
  };
}
function installOpenRouterIPC({ ipcMain, getOwner, getURL, transport }) {
  function trusted(event) {
    const owner = getOwner();
    if (!owner || !isTrustedFrame(event, owner, getURL()))
      throw new Error("Untrusted OpenRouter command");
  }
  ipcMain.handle("openrouter:request", (event, input) => {
    trusted(event);
    return transport.request(input);
  });
  ipcMain.handle("openrouter:cancel", (event, id) => {
    trusted(event);
    transport.cancel(id);
  });
}
module.exports = { createOpenRouter, installOpenRouterIPC, codeFor, validate };
