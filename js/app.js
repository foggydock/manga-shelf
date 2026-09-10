const App = (() => {
  let seriesList = [];
  let editingId = null;
  let editVersion = 0;
  let candidate = null;
  let candidateUrl = null;
  let saving = false;
  let newSeriesId = null;

  function editMessage(text, error = false) {
    el("editMessage").textContent = text;
    el("editMessage").className = "edit-message" + (error ? " error" : "");
    el("editMessage").hidden = !text;
  }

  function clearCandidate() {
    if (candidateUrl) URL.revokeObjectURL(candidateUrl);
    candidateUrl = null;
    candidate = null;
    el("coverCandidateImage").removeAttribute("src");
    el("coverCandidate").hidden = true;
    el("useCoverCandidate").checked = false;
  }

  function resetFetch() {
    editVersion++;
    clearCandidate();
    el("fetchMetadataBtn").disabled = false;
    el("fetchMetadataBtn").textContent = "✨ 作品情報をまとめて取得";
    editMessage("");
  }

  function el(id) { return document.getElementById(id); }

  async function boot() {
    DB.init();
    await Auth.refreshSession();
    Auth.onChange(() => render());
    el("loginBtn").addEventListener("click", openLoginModal);
    el("logoutBtn").addEventListener("click", async () => { await Auth.signOut(); await load(); });
    el("addBtn").addEventListener("click", () => openEditModal(null));
    el("fetchCoversBtn").addEventListener("click", onFetchCoversClick);
    el("searchInput").addEventListener("input", render);
    el("loginForm").addEventListener("submit", onLoginSubmit);
    el("loginCancelBtn").addEventListener("click", closeLoginModal);
    el("editForm").addEventListener("submit", onEditSubmit);
    el("editCancelBtn").addEventListener("click", closeEditModal);
    el("deleteBtn").addEventListener("click", onDeleteClick);
    el("fetchMetadataBtn").addEventListener("click", onFetchMetadataClick);
    el("editTitle").addEventListener("input", resetFetch);
    el("editAuthor").addEventListener("input", resetFetch);
    el("editIsbn").addEventListener("input", resetFetch);

    await load();
  }

  async function load() {
    seriesList = await DB.listSeries();
    render();
  }

  function render() {
    const loggedIn = Auth.isLoggedIn();
    el("loginBtn").style.display = loggedIn ? "none" : "inline-block";
    el("logoutBtn").style.display = loggedIn ? "inline-block" : "none";
    el("addBtn").style.display = loggedIn ? "inline-block" : "none";
    el("fetchCoversBtn").style.display = loggedIn ? "inline-block" : "none";
    el("loggedInAs").style.display = loggedIn ? "inline-block" : "none";
    el("loggedInAs").textContent = loggedIn ? Auth.getUserEmail() : "";

    const q = (el("searchInput").value || "").toLowerCase();
    const filtered = seriesList.filter(s =>
      !q || (s.title || "").toLowerCase().includes(q) || (s.author || "").toLowerCase().includes(q)
    );

    const grid = el("grid");
    grid.innerHTML = "";
    if (filtered.length === 0) {
      grid.innerHTML = `<p class="empty">${seriesList.length === 0 ? "まだ登録がありません" : "該当する漫画がありません"}</p>`;
      return;
    }

    for (const s of filtered) grid.appendChild(renderCard(s, loggedIn));
  }

  function renderCard(s, loggedIn) {
    const owned = s.owned_volumes || [];
    const read = s.read_volumes || [];
    const gaps = Util.findGaps(owned);
    const unread = owned.filter(v => !read.includes(v));
    const maxOwned = owned.length ? Math.max(...owned) : 0;

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-cover">
        ${s.cover_url
          ? `<img class="cover-img" alt="">`
          : `<div class="cover-placeholder">📖</div>`}
      </div>
      <div class="card-body">
        <h3>${Util.escapeHtml(s.title)}</h3>
        ${s.author ? `<p class="author">${Util.escapeHtml(s.author)}</p>` : ""}
        ${s.status ? `<span class="badge">${Util.escapeHtml(s.status)}</span>` : ""}
        <div class="vol-row"><span class="vol-label">所持</span><span>${owned.length ? Util.toRangeString(owned) + "巻" : "なし"}${s.total_volumes ? ` / 全${s.total_volumes}巻` : ""}</span></div>
        <div class="vol-row"><span class="vol-label">既読</span><span>${read.length ? Util.toRangeString(read) + "巻" : "なし"}</span></div>
        ${gaps.length ? `<div class="vol-row gap"><span class="vol-label">抜け</span><span>${Util.toRangeString(gaps)}巻</span></div>` : ""}
        ${unread.length ? `<div class="vol-row unread"><span class="vol-label">積読</span><span>${Util.toRangeString(unread)}巻</span></div>` : ""}
        ${s.synopsis ? `<p class="synopsis">${Util.escapeHtml(s.synopsis)}</p>` : ""}
        ${loggedIn ? `<button class="edit-link" data-id="${s.id}">編集</button>` : ""}
      </div>
    `;
    if (loggedIn) {
      card.querySelector(".edit-link").addEventListener("click", () => openEditModal(s));
    }
    if (s.cover_url) {
      const img = card.querySelector(".cover-img");
      Covers.resolveUrl(s.cover_url).then((url) => { if (url) img.src = url; });
    }
    return card;
  }

  // --- ログイン ---
  function openLoginModal() { el("loginModal").style.display = "flex"; }
  function closeLoginModal() { el("loginModal").style.display = "none"; el("loginForm").reset(); }

  async function onLoginSubmit(e) {
    e.preventDefault();
    const email = el("loginEmail").value.trim();
    const password = el("loginPassword").value;
    const { error } = await Auth.signInWithPassword(email, password);
    if (error) { Util.showBanner(`ログイン失敗: ${error.message}`, "error"); return; }
    closeLoginModal();
    Util.showBanner("ログインしました", "success");
    await load();
  }

  // --- 追加・編集 ---
  function openEditModal(s) {
    resetFetch();
    newSeriesId = null;
    editingId = s ? s.id : null;
    el("editModalTitle").textContent = s ? "編集" : "新規登録";
    el("editTitle").value = s?.title || "";
    el("editIsbn").value = "";
    el("editAuthor").value = s?.author || "";
    el("editCoverUrl").value = s?.cover_url || "";
    el("editStatus").value = s?.status || "";
    el("editTotalVolumes").value = s?.total_volumes ?? "";
    el("editOwned").value = Util.toRangeString(s?.owned_volumes || []);
    el("editRead").value = Util.toRangeString(s?.read_volumes || []);
    el("editSynopsis").value = s?.synopsis || "";
    el("deleteBtn").style.display = s ? "inline-block" : "none";
    el("editModal").style.display = "flex";
  }

  function closeEditModal() {
    if (saving) return;
    resetFetch();
    el("editModal").style.display = "none";
    el("editForm").reset();
    editingId = null;
  }

  async function onEditSubmit(e) {
    e.preventDefault();
    const fields = {
      title: el("editTitle").value.trim(),
      author: el("editAuthor").value.trim() || null,
      cover_url: el("editCoverUrl").value.trim() || null,
      status: el("editStatus").value.trim() || null,
      total_volumes: el("editTotalVolumes").value ? parseInt(el("editTotalVolumes").value, 10) : null,
      owned_volumes: Util.parseRange(el("editOwned").value),
      read_volumes: Util.parseRange(el("editRead").value),
      synopsis: el("editSynopsis").value.trim() || null,
    };
    if (saving) return;
    if (!fields.title) { editMessage("タイトルは必須です", true); return; }
    saving = true;
    editVersion++; // 取得中の結果が保存後に別の編集画面へ入らないようにする。
    const controls = Array.from(el("editForm").querySelectorAll("input, textarea, button"));
    controls.forEach(control => { control.disabled = true; });
    try {
      const id = editingId || (newSeriesId ||= crypto.randomUUID());
      if (!fields.cover_url && candidate && el("useCoverCandidate").checked) {
        editMessage("書影を保存しています…");
        const uploaded = await Covers.upload(id, candidate.blob);
        if (uploaded.error) throw new Error(`書影の保存に失敗しました: ${uploaded.error.message}`);
        fields.cover_url = uploaded.url;
        // DB保存に失敗しても、再試行時に同じ画像を使えるようにする。
        el("editCoverUrl").value = uploaded.url;
      }
      const { error } = editingId
        ? await DB.updateSeries(editingId, fields)
        : await DB.insertSeries({ ...fields, id });
      if (error) throw new Error(error.message);
      saving = false;
      closeEditModal();
      Util.showBanner("保存しました", "success");
      await load();
    } catch (error) {
      editMessage(`保存エラー: ${error.message}`, true);
    } finally {
      saving = false;
      controls.forEach(control => { control.disabled = false; });
      el("fetchMetadataBtn").textContent = "✨ 作品情報をまとめて取得";
    }
  }

  async function onFetchCoversClick() {
    await Covers.runBatch(seriesList, () => {});
    await load();
  }

  async function withTimeout(task) {
    let timer;
    try {
      return await Promise.race([
        task(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("取得に時間がかかっています。再試行してください")), 60000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function onFetchMetadataClick() {
    const title = el("editTitle").value.trim();
    const author = el("editAuthor").value.trim();
    const isbn = el("editIsbn").value.replace(/[^0-9Xx]/g, "");
    if (!title) { editMessage("タイトルを先に入力してください", true); return; }
    if (isbn && isbn.length !== 10 && isbn.length !== 13) {
      editMessage("ISBNは10桁または13桁で入力してください", true);
      return;
    }
    const version = ++editVersion;
    const btn = el("fetchMetadataBtn");
    btn.disabled = true;
    btn.textContent = "取得中…";
    editMessage("作品情報と書影を探しています…");
    // 片方が失敗しても、もう片方の候補は利用できる。
    const [meta, cover] = await Promise.allSettled([
      withTimeout(() => DB.fetchSynopsis(title, author)),
      el("editCoverUrl").value.trim() || candidate
        ? Promise.resolve(null) : withTimeout(() => Covers.prepareCandidate(title, author, isbn)),
    ]);
    if (version !== editVersion) return;
    try {
      const messages = [];
      const data = meta.status === "fulfilled" ? meta.value?.data : null;
      const error = meta.status === "fulfilled" ? meta.value?.error : meta.reason;
      let filled = 0;
      if (!error && data?.ok) {
        for (const [id, value] of [
          ["editAuthor", data.author], ["editSynopsis", data.synopsis],
          ["editStatus", data.status],
          ["editTotalVolumes", Number.isSafeInteger(data.total_volumes) && data.total_volumes > 0
            ? String(data.total_volumes) : null],
        ]) {
          if (!el(id).value.trim() && typeof value === "string" && value.trim()) {
            el(id).value = value.trim();
            filled++;
          }
        }
        messages.push(filled ? `空欄の${filled}項目に候補を入れました。` : "補完できる空欄の情報はありませんでした。");
        messages.push("AIの候補です。巻数・完結状況を含め、内容を確認して保存してください。");
      } else {
        messages.push(`作品情報を取得できませんでした: ${error?.message || data?.error || "時間をおいて再試行してください"}`);
      }
      if (cover.status === "fulfilled" && cover.value && !el("editCoverUrl").value.trim()) {
        clearCandidate();
        candidate = cover.value;
        candidateUrl = URL.createObjectURL(candidate.blob);
        el("coverCandidateImage").src = candidateUrl;
        el("coverCandidateTitle").textContent = `${candidate.matched_title}${candidate.isbn ? " / ISBN " + candidate.isbn : ""}`;
        el("coverCandidate").hidden = false;
        messages.push("書影の作品名・巻を確認し、使う場合はチェックしてください。");
      } else if (cover.status === "rejected") {
        messages.push(`書影を取得できませんでした: ${cover.reason?.message || "再試行してください"}`);
      }
      editMessage(messages.join("\n"));
    } catch (error) {
      editMessage(`候補の表示に失敗しました: ${error.message}`, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "✨ 作品情報をまとめて取得";
    }
  }

  async function onDeleteClick() {
    if (!editingId) return;
    if (!confirm("削除しますか？")) return;
    const { error } = await DB.deleteSeries(editingId);
    if (error) { Util.showBanner(`削除エラー: ${error.message}`, "error"); return; }
    closeEditModal();
    Util.showBanner("削除しました", "success");
    await load();
  }

  return { boot };
})();
window.addEventListener("DOMContentLoaded", App.boot);
