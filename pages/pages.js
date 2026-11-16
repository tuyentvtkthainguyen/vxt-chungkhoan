/* VXT Chứng Khoán - bản GitHub Pages: đọc dữ liệu JSON do GitHub Actions cập nhật định kỳ. Không thu thập dữ liệu người dùng. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  let META = null;
  const cache = new Map();
  const get = async url => { const r = await fetch(url + "?v=" + Math.floor(Date.now() / 60000), { cache: "no-store" }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); };
  const fmtTime = ts => new Date(ts * 1000).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

  async function loadMeta() {
    try {
      META = await get("data/meta.json");
      if (!META.symbols.length) { $("#dataInfo").innerHTML = `<span class="down">Lần cập nhật ${fmtTime(META.updated)} không lấy được giá (nguồn dữ liệu có thể chặn máy chủ GitHub). Xem tab Actions trên GitHub.</span>`; return; }
      const age = (Date.now() / 1000 - META.updated) / 60;
      $("#dataInfo").innerHTML = `Dữ liệu cập nhật <b>${fmtTime(META.updated)}</b> · ${META.symbols.length} mã` +
        (age > 180 ? ` <span class="warn">(cũ ${Math.round(age / 60)} giờ – ngoài giờ giao dịch hoặc GitHub chưa chạy)</span>` : "");
    } catch (e) { $("#dataInfo").innerHTML = `<span class="down">Chưa có dữ liệu – GitHub Actions chưa chạy lần nào.</span>`; }
  }

  window.VXT_PROVIDER = {
    async getHist(sym) {
      if (cache.has(sym) && Date.now() - cache.get(sym).at < 120000) return cache.get(sym).v;
      try {
        const j = await get(`data/hist/${encodeURIComponent(sym)}.json`);
        const v = { symbol: sym, source: j.src + (META ? " · " + fmtTime(META.updated) : ""), candles: j.d.map(a => ({ t: a[0], o: a[1], h: a[2], l: a[3], c: a[4], v: a[5] })) };
        cache.set(sym, { at: Date.now(), v });
        return v;
      } catch (e) {
        if (META && META.failed && META.failed[sym]) throw new Error("Lần cập nhật gần nhất lỗi: " + META.failed[sym]);
        throw new Error("Mã chưa có trong watchlist.txt của kho GitHub");
      }
    },
    async getNews() {
      try { return await get("data/news.json"); } catch (e) { return { items: [], errors: ["Chưa có dữ liệu tin"] }; }
    },
    importedLabel: "Toàn bộ watchlist (GitHub)",
    listImported: () => (META ? META.symbols.filter(s => !/^(VNINDEX|VN30|HNXINDEX|HNX30|UPCOMINDEX)$/.test(s)) : []),
    init(app) {
      app.setDemo(false);
      const sw = document.querySelector(".switch"); if (sw) sw.style.display = "none";
      loadMeta().then(() => { app.renderTable(); });
      setInterval(loadMeta, 5 * 60000);
    },
  };
})();
