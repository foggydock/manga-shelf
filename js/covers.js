// 書影の自動取り込み（book-shelf と同じ方式）。
// Edge Function `book-cover` がサーバ側でNDL/openBDから画像を取ってきて base64 で返すので、
// それを縮小して Supabase Storage（manga-shelf-covers）に置き、公開URLを cover_url に保存する。
// NDLのサムネイルは直リンク（hotlink）が403で拒否されるため、必ず自分側に複製して持つ必要がある。
const Covers = (() => {
  const BUCKET = "manga-shelf-covers";
  let cancelRequested = false;

  function b64ToBlob(b64, mime) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime || "image/jpeg" });
  }

  function shrink(blob, maxW = 320, quality = 0.78) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onerror = () => { URL.revokeObjectURL(url); resolve(blob); };
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob((out) => resolve(out || blob), "image/jpeg", quality);
      };
      img.src = url;
    });
  }

  async function upload(seriesId, blob) {
    const client = DB.getClient();
    const uid = Auth.getUserId();
    if (!client || !uid) return { error: { message: "未ログイン" } };
    const path = `${uid}/${seriesId}.jpg`;
    const { error } = await client.storage.from(BUCKET)
      .upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (error) return { error };
    const { data } = client.storage.from(BUCKET).getPublicUrl(path);
    return { url: `${data.publicUrl}?v=${Date.now()}` };
  }

  // manga-shelf-covers に置いた自前バケットの画像は非公開なので、表示のたびに署名付きURLへ差し替える。
  // Amazon等の外部URLはそのまま返す。
  async function resolveUrl(url) {
    if (!url || !url.includes(`/storage/v1/object/public/${BUCKET}/`)) return url;
    const client = DB.getClient();
    if (!client) return url;
    const path = url.split(`/storage/v1/object/public/${BUCKET}/`)[1].split("?")[0];
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data) return null;
    return data.signedUrl;
  }

  // 編集用候補は保存ボタンを押すまでStorageへ書き込まない。
  async function prepareCandidate(title, author) {
    const { data, error } = await DB.fetchCover({ title, author });
    if (error || !data?.ok || !data.b64) {
      throw new Error(error?.message || data?.error || "書影が見つかりませんでした");
    }
    const blob = await shrink(b64ToBlob(data.b64, data.mime));
    return { blob, matched_title: data.matched_title || title, isbn: data.isbn || "" };
  }

  async function fetchOne(series) {
    const res = await DB.fetchCover({ title: series.title, author: series.author });
    const d = res && res.data;
    if (!d || res.error || d.ok === false) {
      return { error: (d && d.error) || (res.error && res.error.message) || "取得できませんでした" };
    }
    const small = await shrink(b64ToBlob(d.b64, d.mime));
    const up = await upload(series.id, small);
    if (up.error) return { error: up.error.message };
    return { url: up.url, matched_title: d.matched_title, exact: !!d.exact };
  }

  function ui(show) {
    let el = document.getElementById("cover-progress");
    if (!el) {
      el = document.createElement("div");
      el.id = "cover-progress";
      el.className = "cover-progress";
      el.innerHTML = `<span id="cover-progress-text"></span><button type="button" id="cover-progress-stop">とめる</button>`;
      document.body.appendChild(el);
      el.querySelector("#cover-progress-stop").addEventListener("click", () => { cancelRequested = true; });
    }
    el.classList.toggle("show", !!show);
    return el;
  }
  function say(msg) {
    ui(true).querySelector("#cover-progress-text").textContent = msg;
  }

  async function runBatch(seriesList, onUpdated) {
    const targets = seriesList.filter((s) => !s.cover_url && s.title);
    if (!targets.length) { Util.showBanner("書影が無い作品はありません", "success"); return; }
    if (!confirm(
      `書影のない ${targets.length} 件を国立国会図書館のデータからさがします。\n` +
      `タイトルがぴったり一致したものだけ自動で入れます（別の版・別巻を取り違えないため）。\n` +
      `途中で「とめる」を押せば、そこまでの分は残ります。始めますか？`
    )) return;

    cancelRequested = false;
    let ok = 0, ambiguous = [], missed = [];
    for (let i = 0; i < targets.length; i++) {
      if (cancelRequested) break;
      const s = targets[i];
      say(`書影をさがしています… ${i + 1}/${targets.length}　（見つかった：${ok}）`);
      let r;
      try { r = await fetchOne(s); } catch (e) { r = { error: String(e) }; }

      if (r.error) { missed.push(s.title); continue; }
      if (!r.exact) {
        ambiguous.push(`${s.title}  →  候補: ${r.matched_title}`);
        continue;
      }
      const upd = await DB.updateSeries(s.id, { cover_url: r.url });
      if (upd.error) { missed.push(s.title); continue; }
      ok++;
      if (onUpdated) onUpdated();
    }
    ui(false);

    Util.showBanner(`書影を${ok}件に入れました（保留${ambiguous.length}・不明${missed.length}）`, "success");
    console.log("書影 保留:", ambiguous);
    console.log("書影 見つからず:", missed);
    return { ok, ambiguous, missed };
  }

  return { runBatch, fetchOne, resolveUrl, prepareCandidate, upload };
})();
window.Covers = Covers;
