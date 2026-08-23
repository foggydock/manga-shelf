const App = (() => {
  let seriesList = [];
  let editingId = null;

  function el(id) { return document.getElementById(id); }

  async function boot() {
    DB.init();
    await Auth.refreshSession();
    Auth.onChange(() => render());
    el("loginBtn").addEventListener("click", openLoginModal);
    el("logoutBtn").addEventListener("click", async () => { await Auth.signOut(); render(); });
    el("addBtn").addEventListener("click", () => openEditModal(null));
    el("fetchCoversBtn").addEventListener("click", onFetchCoversClick);
    el("searchInput").addEventListener("input", render);
    el("loginForm").addEventListener("submit", onLoginSubmit);
    el("loginCancelBtn").addEventListener("click", closeLoginModal);
    el("editForm").addEventListener("submit", onEditSubmit);
    el("editCancelBtn").addEventListener("click", closeEditModal);
    el("deleteBtn").addEventListener("click", onDeleteClick);
    el("genSynopsisBtn").addEventListener("click", onGenSynopsisClick);

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
          ? `<img src="${Util.escapeHtml(s.cover_url)}" alt="">`
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
    render();
  }

  // --- 追加・編集 ---
  function openEditModal(s) {
    editingId = s ? s.id : null;
    el("editModalTitle").textContent = s ? "編集" : "新規登録";
    el("editTitle").value = s?.title || "";
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
    if (!fields.title) { Util.showBanner("タイトルは必須です", "error"); return; }

    const { error } = editingId
      ? await DB.updateSeries(editingId, fields)
      : await DB.insertSeries(fields);

    if (error) { Util.showBanner(`保存エラー: ${error.message}`, "error"); return; }
    closeEditModal();
    Util.showBanner("保存しました", "success");
    await load();
  }

  async function onFetchCoversClick() {
    await Covers.runBatch(seriesList, () => {});
    await load();
  }

  async function onGenSynopsisClick() {
    const title = el("editTitle").value.trim();
    if (!title) { Util.showBanner("タイトルを先に入力してください", "error"); return; }
    const btn = el("genSynopsisBtn");
    btn.disabled = true;
    btn.textContent = "生成中...";
    const author = el("editAuthor").value.trim();
    const { data, error } = await DB.fetchSynopsis(title, author);
    btn.disabled = false;
    btn.textContent = "✨ AIで生成";
    if (error || !data?.ok) {
      Util.showBanner(`生成に失敗しました: ${error?.message || data?.error || "不明なエラー"}`, "error");
      return;
    }
    if (data.synopsis) el("editSynopsis").value = data.synopsis;
    if (data.author && !author) el("editAuthor").value = data.author;
    if (data.status && !el("editStatus").value.trim()) el("editStatus").value = data.status;
    Util.showBanner("あらすじを生成しました", "success");
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
