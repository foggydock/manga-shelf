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

  // "1-5,7,9-10" -> [1,2,3,4,5,7,9,10]
  function parseRange(str) {
    if (!str) return [];
    const out = new Set();
    for (const part of String(str).split(",").map(s => s.trim()).filter(Boolean)) {
      const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i);
      } else if (/^\d+$/.test(part)) {
        out.add(parseInt(part, 10));
      }
    }
    return Array.from(out).sort((a, b) => a - b);
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

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  return { showBanner, parseRange, toRangeString, findGaps, escapeHtml };
})();
window.Util = Util;
