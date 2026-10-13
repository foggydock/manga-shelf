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

  // 作品を削除したあとに、自前バケットの表紙画像も消す。外部URLの表紙は何もしない。
  // 画像だけ残っても害は小さいので、失敗しても作品の削除は成功のまま扱い、結果だけ返す。
  async function remove(url) {
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    if (!url || !url.includes(marker)) return { removed: false };
    const client = DB.getClient();
    if (!client) return { removed: false, error: { message: "未接続" } };
    const path = decodeURIComponent(url.split(marker)[1].split("?")[0]);
    const { error } = await client.storage.from(BUCKET).remove([path]);
    return error ? { removed: false, error } : { removed: true };
  }

  // 編集用候補は保存ボタンを押すまでStorageへ書き込まない。
  async function prepareCandidate(title, author, isbn = "") {
    // ISBNが指定された場合はタイトル検索をせず、その版の書影を直接取得する。
    // シリーズ名が続編や別版に曖昧一致する事故を避けるため、ISBNを常に最優先する。
    let result = isbn
      ? await DB.fetchCover({ isbn })
      : await DB.fetchCover({ title, author });
    // シリーズ名だけではNDL上の「作品名 1」に一致しない場合がある。
    // 第1巻を明示した検索を一度だけ試し、候補名とISBNは画面で確認してもらう。
    if (!isbn && (result.error || !result.data?.ok || !result.data.b64)) {
      result = await DB.fetchCover({ title: `${title} 1`, author });
    }
    const { data, error } = result;
    if (error || !data?.ok || !data.b64) {
      throw new Error(error?.message || data?.error || "書影が見つかりませんでした");
    }
    const blob = await shrink(b64ToBlob(data.b64, data.mime));
    return { blob, matched_title: data.matched_title || title, isbn: data.isbn || isbn };
  }

  async function fetchOne(series) {
    const res = await DB.fetchCover({ title: series.title, author: series.author });
    const d = res && res.data;
    if (!d || res.error || d.ok === false) {
      return { error: (d && d.error) || (res.error && res.error.message) || "取得できませんでした" };
    }
    // 保留にする（自動では入れない）候補は、保存領域へ書き込まない。
    if (!d.exact) return { matched_title: d.matched_title, exact: false };
    const small = await shrink(b64ToBlob(d.b64, d.mime));
    const up = await upload(series.id, small);
    if (up.error) return { error: up.error.message };
    return { url: up.url, matched_title: d.matched_title, exact: true };
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

  async function runBatch(seriesList) {
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
    }
    ui(false);

    Util.showBanner(`書影を${ok}件に入れました（保留${ambiguous.length}・不明${missed.length}）`, "success");
    // スマホでは開発者用の画面（コンソール）を見られないため、対象の作品名を画面に出す。
    if (ambiguous.length || missed.length) {
      const lines = [`書影を${ok}件に入れました。`];
      if (ambiguous.length) {
        lines.push("", `■ 保留 ${ambiguous.length}件（作品名が完全には一致しないため入れていません。編集画面の「作品情報をまとめて取得」で確認して選べます）`);
        lines.push(...ambiguous.map((t) => `・${t}`));
      }
      if (missed.length) {
        lines.push("", `■ 見つからず ${missed.length}件`);
        lines.push(...missed.map((t) => `・${t}`));
      }
      alert(lines.join("\n"));
    }
    return { ok, ambiguous, missed };
  }

  return { runBatch, resolveUrl, prepareCandidate, upload, remove };
})();
window.Covers = Covers;
