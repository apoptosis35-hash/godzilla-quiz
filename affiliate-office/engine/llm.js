// Claude 呼び出しの薄いラッパー。認証情報が無ければオフライン（テンプレート）モードで動く。
export const MODEL = process.env.AFFILIATE_MODEL || "claude-opus-5-5";

let client = null;
export async function initLLM({ offline }) {
  if (offline) return false;
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk"); // オフライン時は未インストールでも動く
    client = new Anthropic();
    return true;
  } catch (e) {
    console.warn(`Claude APIの認証情報が見つからないのでオフラインモードで動きます (${e.message})`);
    return false;
  }
}

async function call({ system, prompt, schema, effort = "medium" }) {
  const params = {
    model: MODEL,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: { effort, ...(schema ? { format: { type: "json_schema", schema } } : {}) },
    system,
    messages: [{ role: "user", content: prompt }],
    // 安全分類器に断られた場合、サーバー側で推奨モデルに自動フォールバック
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };
  const msg = await client.beta.messages.stream(params).finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("リクエストが拒否されました");
  if (msg.stop_reason === "max_tokens") throw new Error("出力が上限で途切れました");
  const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
  return schema ? JSON.parse(text) : text;
}

export const llm = {
  get online() { return client !== null; },
  json: (system, prompt, schema, effort) => call({ system, prompt, schema, effort }),
  text: (system, prompt, effort) => call({ system, prompt, effort }),
};
