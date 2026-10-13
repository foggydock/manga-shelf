const Util = (() => {
  function showBanner(message, type = "info") {
    const el = document.getElementById("banner");
    if (!el) { console.log(`[${type}] ${message}`); return; }
    el.textContent = message;
    el.className = `banner banner-${type}`;
    el.style.display = "block";
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.display = "none"; }, 4000);
  }

  // [1,2,3,5,7,8] -> "1-3,5,7-8"
  function toRangeString(arr) {
    if (!arr || arr.length === 0) return "";
    const sorted = Array.from(new Set(arr)).sort((a, b) => a - b);
    const parts = [];
    let start = sorted[0], prev = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
      const cur = sorted[i];
      if (cur === prev + 1) { prev = cur; continue; }
      parts.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = prev = cur;
    }
    return parts.join(",");
  }

  // 所持巻の抜け（歯抜け）を返す: ownedの最大値までで所持していない巻
  function findGaps(owned) {
    if (!owned || owned.length === 0) return [];
    const set = new Set(owned);
    const max = Math.max(...owned);
    const gaps = [];
    for (let i = 1; i <= max; i++) if (!set.has(i)) gaps.push(i);
    return gaps;
  }

  // 1巻から途切れずに続くチェック済み巻数を返す。
  function consecutiveFromOne(volumes) {
    const set = new Set(volumes || []);
    let volume = 1;
    while (set.has(volume)) volume++;
    return volume - 1;
  }

  // チェック済みの巻。旧形式（既読・所持）しかない作品はそちらを使う。
  function progressVolumes(series) {
    return series?.checked_volumes || (series?.read_volumes?.length ? series.read_volumes : (series?.owned_volumes || []));
  }

  // 全巻数が確定しており、1巻から全てチェック済みのときだけ読了とする。
  // 表示用のチェック欄数だけでは読了と判定しない。
  function isSeriesComplete(series) {
    const total = series?.total_volumes;
    if (!Number.isSafeInteger(total) || total < 1) return false;
    return consecutiveFromOne(progressVolumes(series)) >= total;
  }

  // チェック欄を作りすぎて画面が固まらないための上限。
  const MAX_VOLUMES = 500;

  function validateVolumeFields(fields) {
    const total = fields.total_volumes;
    const displayCount = fields.volume_display_count;
    const checked = fields.checked_volumes || [];
    if (!Number.isSafeInteger(displayCount) || displayCount < 1 || displayCount > MAX_VOLUMES) {
      return `チェック欄を表示する巻数は1以上${MAX_VOLUMES}以下の整数で入力してください`;
    }
    if (total !== null && (!Number.isSafeInteger(total) || total < 1 || total > MAX_VOLUMES)) {
      return `全巻数は1以上${MAX_VOLUMES}以下の整数で入力してください`;
    }
    const maxChecked = checked.length ? Math.max(...checked) : 0;
    if (total !== null && maxChecked > total) {
      return `チェック済みの${maxChecked}巻は、全${total}巻を超えています`;
    }
    return null;
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  return { MAX_VOLUMES, showBanner, toRangeString, findGaps, consecutiveFromOne, progressVolumes, isSeriesComplete, validateVolumeFields, escapeHtml };
})();
window.Util = Util;
