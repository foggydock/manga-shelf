const DB = (() => {
  let client = null;

  function init() {
    const cfg = window.MANGA_CONFIG;
    if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      Util.showBanner("js/config.js に Supabase の URL と Publishable key を設定してください", "error");
      return null;
    }
    if (!window.supabase) {
      Util.showBanner("Supabase JS が読み込めていません（ネット未接続？）", "error");
      return null;
    }
    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    return client;
  }

  function getClient() { return client; }

  async function listSeries() {
    if (!client) return [];
    const { data, error } = await client
      .from("manga_shelf_series")
      .select("*")
      .order("title", { ascending: true });
    if (error) { Util.showBanner(`読み込みエラー: ${error.message}`, "error"); return []; }
    return data || [];
  }

  async function insertSeries(row) {
    if (!client) return { error: { message: "未接続" } };
    const payload = { ...row, user_id: window.Auth?.getUserId?.() || undefined };
    return await client.from("manga_shelf_series").insert(payload).select().single();
  }

  async function updateSeries(id, fields) {
    if (!client) return { error: { message: "未接続" } };
    return await client
      .from("manga_shelf_series")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
  }

  async function deleteSeries(id) {
    if (!client) return { error: { message: "未接続" } };
    const { error } = await client.from("manga_shelf_series").delete().eq("id", id);
    return { error };
  }

  async function fetchSynopsis(title, author) {
    if (!client) return { error: { message: "未接続" } };
    return await client.functions.invoke("manga-meta", { body: { title, author } });
  }

  return { init, getClient, listSeries, insertSeries, updateSeries, deleteSeries, fetchSynopsis };
})();
window.DB = DB;
