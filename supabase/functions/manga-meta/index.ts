// タイトル（＋作者）から編集用の作品情報候補を生成する。書影はbook-coverから取得。
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callGemini(prompt: string, schema: Record<string, unknown>) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return null;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      signal: AbortSignal.timeout(45000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      }),
    },
  );
  if (!res.ok) return null;
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function generateSynopsis(title: string, author?: string) {
  const schema = {
    type: "object",
    properties: {
      synopsis: { type: "string" },
      author: { type: "string" },
      status: { type: "string" },
      total_volumes: { type: "integer", nullable: true },
    },
    required: ["synopsis"],
  };
  const prompt =
    `次の漫画作品について、日本語で紹介文（あらすじ・見どころ）を150字程度で書いてください。` +
    `誰かにおすすめするときにそのまま使える文体にしてください。` +
    `わかれば作者名（author）と連載状況（status。「完結」「連載中」のいずれか）も返してください。不明なら空文字にしてください。\n` +
    `完結済みで最終巻数を確実に知っている場合だけtotal_volumesに正の整数を返し、それ以外はnullにしてください。既刊数と最終巻数を混同しないでください。架空・不明な作品の情報は作らず空文字にしてください。\n` +
    `タイトル: ${title}\n作者（既知なら）: ${author || "不明"}`;
  return await callGemini(prompt, schema);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  try {
    const { title, author } = await req.json();
    if (!title) {
      return new Response(JSON.stringify({ ok: false, error: "タイトルが必要です" }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const result = await generateSynopsis(title, author);
    if (!result) {
      return new Response(JSON.stringify({ ok: false, error: "生成に失敗しました" }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const total = result.total_volumes;
    result.total_volumes = result.status === "完結" && Number.isSafeInteger(total) && total > 0
      ? total : null;
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
