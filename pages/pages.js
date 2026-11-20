/* VXT Chứng Khoán - bản GitHub Pages: đọc dữ liệu JSON do GitHub Actions cập nhật định kỳ. Không thu thập dữ liệu người dùng. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  let META = null, BASE = "data/";
  const cache = new Map();
  // Dữ liệu trong phiên được đẩy lên nhánh "data" mỗi 10 phút; trang tự chọn nguồn mới hơn.
  const parts = location.hostname.endsWith("github.io") ? [location.hostname.split(".")[0], location.pathname.split("/").filter(Boolean)[0]] : null;
  const LIVE = parts && parts[1] ? `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/data/data/` : null;
  const get = async url => { const r = await fetch(url + "?v=" + Math.floor(Date.now() / 60000), { cache: "no-store" }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); };
  async function pickMeta() {
    const [a, b] = await Promise.all([get("data/meta.json").catch(() => null), LIVE ? get(LIVE + "meta.json").catch(() => null) : null]);
    if (b && b.symbols && b.symbols.length && (!a || b.updated > a.updated)) { BASE = LIVE; return b; }
    BASE = "data/"; if (!a) throw new Error("no data"); return a;
  }
  const fmtTime = ts => new Date(ts * 1000).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

  function isOpen() {
    const d = new Date(Date.now() + 7 * 3600e3), wd = d.getUTCDay(), m = d.getUTCHours() * 60 + d.getUTCMinutes();
    return wd >= 1 && wd <= 5 && m >= 540 && m <= 900;
  }
  async function loadMeta() {
    try {
      const prevUpd = META && META.updated;
      META = await pickMeta();
      if (prevUpd && META.updated !== prevUpd) { cache.clear(); if (window.VXT_APP) { window.VXT_APP.loadMarket(); window.VXT_APP.loadNews(); window.VXT_APP.scan(); } }
      if (!META.symbols.length) { $("#dataInfo").innerHTML = `<span class="down">Lần cập nhật ${fmtTime(META.updated)} không lấy được giá (nguồn dữ liệu có thể chặn máy chủ GitHub). Xem tab Actions trên GitHub.</span>`; return; }
      const age = (Date.now() / 1000 - META.updated) / 60;
      $("#dataInfo").innerHTML = `Dữ liệu cập nhật <b>${fmtTime(META.updated)}</b> · ${META.symbols.length} mã` +
        (age > 30 && isOpen() ? ` <span class="warn">(chậm ${Math.round(age)} phút)</span>` : "") + (age > 1200 && !isOpen() ? ` <span class="warn">(cũ ${Math.round(age / 60)} giờ – ngoài giờ giao dịch hoặc GitHub chưa chạy)</span>` : "");
    } catch (e) { $("#dataInfo").innerHTML = `<span class="down">Chưa có dữ liệu – GitHub Actions chưa chạy lần nào.</span>`; }
  }

  window.VXT_PROVIDER = {
    async getHist(sym) {
      if (cache.has(sym) && Date.now() - cache.get(sym).at < 120000) return cache.get(sym).v;
      try {
        const j = await get(`${BASE}hist/${encodeURIComponent(sym)}.json`);
        const v = { symbol: sym, source: j.src + (META ? " · " + fmtTime(META.updated) : ""), candles: j.d.map(a => ({ t: a[0], o: a[1], h: a[2], l: a[3], c: a[4], v: a[5] })) };
        cache.set(sym, { at: Date.now(), v });
        return v;
      } catch (e) {
        if (META && META.failed && META.failed[sym]) throw new Error("Lần cập nhật gần nhất lỗi: " + META.failed[sym]);
        throw new Error("Mã chưa có trong watchlist.txt của kho GitHub");
      }
    },
    async getExtra() {
      try { return await get(BASE + "extra.json"); } catch (e) { return null; }
    },
    async getNews() {
      try { return await get(BASE + "news.json"); } catch (e) { return { items: [], errors: ["Chưa có dữ liệu tin"] }; }
    },
    importedLabel: "Toàn bộ watchlist (GitHub)",
    listImported: () => (META ? META.symbols.filter(s => !/^(VNINDEX|VN30|HNXINDEX|HNX30|UPCOMINDEX)$/.test(s)) : []),
    init(app) {
      app.setDemo(false);
      const sw = document.querySelector(".switch"); if (sw) sw.style.display = "none";
      loadMeta().then(() => { const pr = document.querySelector("#preset"); if (pr && pr.value === "Toàn bộ watchlist (GitHub)") app.scan(); else app.renderTable(); });
      setInterval(loadMeta, 3 * 60000);
    },
  };
})();
