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

async function researchManga(title: string, author?: string) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return null;
  const prompt =
    `現在日付は${new Date().toISOString().slice(0, 10)}です。` +
    `漫画「${title}」（作者候補: ${author || "不明"}）についてウェブ検索し、` +
    `作者、現在の連載状況、完結している場合の最終巻数、作品紹介に必要な事実を調べてください。` +
    `出版社・公式書店・公式作品ページを優先し、同名作品、ジュニア版、小説版、スピンオフを混同しないでください。`;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      signal: AbortSignal.timeout(45000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
    },
  );
  if (!res.ok) return null;
  const json = await res.json();
  return json?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "").join("\n") || null;
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
  const research = await researchManga(title, author);
  if (!research) return null;
  const prompt =
    `以下のウェブ検索結果だけを根拠に、漫画作品について日本語で紹介文（あらすじ・見どころ）を150字程度で書いてください。` +
    `誰かにおすすめするときにそのまま使える文体にしてください。` +
    `わかれば作者名（author）と連載状況（status。「完結」「連載中」のいずれか）も返してください。不明なら空文字にしてください。\n` +
    `完結済みで最終巻数を検索結果から確実に確認できる場合だけtotal_volumesに正の整数を返し、それ以外はnullにしてください。既刊数と最終巻数を混同しないでください。架空・不明な作品の情報は作らず空文字にしてください。\n` +
    `タイトル: ${title}\n作者（既知なら）: ${author || "不明"}\n検索結果:\n${research}`;
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
