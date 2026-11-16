/* VXT Chứng Khoán - bản web: dữ liệu mẫu + nhập CSV, không gọi máy chủ ngoài, không thu thập dữ liệu. */
(function () {
  "use strict";
  const IDX = /^(VNINDEX|VN30|HNXINDEX|HNX30|UPCOMINDEX)$/;
  const DB = new Map();
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- Dữ liệu mẫu (giả lập, tất định theo mã và ngày) ---------- */
  function hashStr(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function demoCandles(sym, days) {
    const today = Math.floor(Date.now() / 86400000);
    const r = rng(hashStr(sym) + today);
    const gauss = (m, s) => { const u = 1 - r(), v = r(); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const uni = (a, b) => a + (b - a) * r();
    const isI = IDX.test(sym);
    let price = isI ? 1250 : uni(12, 120);
    const drift = uni(-0.0006, 0.0012), vol = uni(0.012, 0.028) * (isI ? 0.6 : 1), baseV = uni(0.5e6, 12e6);
    const now = Date.now() / 1000;
    let t = Math.floor(now) - 2000 * 86400, i = 0;
    const cutoff = now - days * 86400, out = [];
    while (t < now) {
      const wd = new Date((t + 25200) * 1000).getUTCDay();
      if (wd >= 1 && wd <= 5) {
        i++;
        const ret = gauss(drift + Math.sin(i / 37) * 0.004, vol);
        const o = price * (1 + gauss(0, vol / 3));
        const c = Math.max(0.5, price * (1 + ret));
        const h = Math.max(o, c) * (1 + Math.abs(gauss(0, vol / 2)));
        const l = Math.min(o, c) * (1 - Math.abs(gauss(0, vol / 2)));
        const v = baseV * (1 + Math.abs(ret) * 25) * uni(0.5, 1.5);
        if (t >= cutoff) out.push({ t, o: +o.toFixed(2), h: +h.toFixed(2), l: +l.toFixed(2), c: +c.toFixed(2), v: Math.round(v) });
        price = c;
      }
      t += 86400;
    }
    return out;
  }
  const DEMO_NEWS = [
    "HPG báo lãi quý tăng mạnh nhờ giá thép phục hồi", "FPT ký hợp đồng chuyển đổi số lớn tại Nhật Bản",
    "Khối ngoại bán ròng mạnh VHM, VIC phiên cuối tuần", "SSI chốt quyền trả cổ tức bằng tiền mặt",
    "MWG đặt kế hoạch tăng trưởng lợi nhuận năm tới", "Cổ phiếu ngân hàng bị chốt lời, VCB, TCB điều chỉnh",
    "VN-Index giằng co quanh vùng kháng cự, thanh khoản suy giảm",
  ];

  /* ---------- Đọc CSV ---------- */
  function num(x) {
    x = String(x ?? "").trim().replace(/^"|"$/g, "").replace(/\s/g, "");
    if (!x || x === "-") return NaN;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(x)) x = x.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(x)) x = x.replace(/,/g, "");
    else x = x.replace(",", ".");
    return parseFloat(x);
  }
  function parseDate(x) {
    x = String(x || "").trim().replace(/^"|"$/g, "");
    let m;
    if ((m = x.match(/^(\d{4})(\d{2})(\d{2})$/)) || (m = x.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 1000;
    if ((m = x.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) return Date.UTC(+m[3], +m[2] - 1, +m[1]) / 1000;
    return NaN;
  }
  function splitLine(line, d) {
    const out = []; let cur = "", q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === d && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur); return out.map(s => s.trim());
  }
  const NORM = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[<>()"]/g, "").trim();
  function findCol(head, keys) { for (const k of keys) { const i = head.findIndex(h => h === k || h.includes(k)); if (i >= 0) return i; } return -1; }

  function parseCSV(text, fallbackSym) {
    const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) throw new Error("File trống");
    const first = lines[0];
    const d = ["\t", ";", ","].map(c => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
    let cols = splitLine(first, d);
    const hasHeader = cols.some(c => /[a-zA-ZÀ-ỹ]{3,}/.test(c) && isNaN(parseDate(c))) && !/^[A-Z0-9]{3,12}$/.test(cols[0]) || /date|ngay|ticker|close/i.test(NORM(first));
    let iT = -1, iD, iO, iH, iL, iC, iV, start = 0;
    if (hasHeader) {
      const head = cols.map(NORM);
      iT = findCol(head, ["ticker", "symbol", "ma ck", "ma cp", "ma"]);
      iD = findCol(head, ["dtyyyymmdd", "tradingdate", "date", "ngay"]);
      iO = findCol(head, ["open", "gia mo cua", "mo cua", "mo"]);
      iH = findCol(head, ["high", "gia cao nhat", "cao nhat", "cao"]);
      iL = findCol(head, ["low", "gia thap nhat", "thap nhat", "thap"]);
      iC = findCol(head, ["close", "gia dong cua", "dong cua", "gia dieu chinh", "dong"]);
      iV = findCol(head, ["volume", "vol", "kl khop lenh", "khoi luong khop lenh", "khoi luong", "kl"]);
      if (iT === iD) iT = -1;
      start = 1;
      if (iD < 0 || iC < 0) throw new Error("Không tìm thấy cột Ngày hoặc Giá đóng cửa trong tiêu đề");
    } else if (cols.length >= 7 && /^[A-Za-z0-9^]{2,12}$/.test(cols[0]) && !isNaN(parseDate(cols[1]))) {
      [iT, iD, iO, iH, iL, iC, iV] = [0, 1, 2, 3, 4, 5, 6];
    } else if (cols.length >= 5 && !isNaN(parseDate(cols[0]))) {
      [iD, iO, iH, iL, iC, iV] = [0, 1, 2, 3, 4, cols.length >= 6 ? 5 : -1];
    } else throw new Error("Không nhận ra định dạng. Cần cột: Mã, Ngày, Mở, Cao, Thấp, Đóng, KL");
    const per = new Map(); let bad = 0;
    for (let k = start; k < lines.length; k++) {
      const f = splitLine(lines[k], d);
      const sym = (iT >= 0 ? f[iT] : fallbackSym || "").toUpperCase().replace(/^\^/, "");
      const t = parseDate(f[iD]), c = num(f[iC]);
      if (!/^[A-Z0-9]{3,12}$/.test(sym) || isNaN(t) || !(c > 0)) { bad++; continue; }
      let o = iO >= 0 ? num(f[iO]) : c, h = iH >= 0 ? num(f[iH]) : c, l = iL >= 0 ? num(f[iL]) : c, v = iV >= 0 ? num(f[iV]) : 0;
      if (!(o > 0)) o = c; if (!(h > 0)) h = Math.max(o, c); if (!(l > 0)) l = Math.min(o, c);
      if (!per.has(sym)) per.set(sym, new Map());
      per.get(sym).set(t, { t, o, h: Math.max(h, o, c), l: Math.min(l, o, c), c, v: v > 0 ? v : 0 });
    }
    if (!per.size) throw new Error(fallbackSym || iT >= 0 ? "Không đọc được dòng dữ liệu hợp lệ nào" : "File không có cột Mã – hãy điền mã CK vào ô bên cạnh");
    const added = {};
    per.forEach((m, sym) => {
      let arr = [...m.values()].sort((a, b) => a.t - b.t);
      if (!IDX.test(sym)) {
        const cl = arr.map(x => x.c).sort((a, b) => a - b), med = cl[cl.length >> 1];
        if (med > 500) arr = arr.map(x => ({ ...x, o: x.o / 1000, h: x.h / 1000, l: x.l / 1000, c: x.c / 1000 }));
      }
      const old = DB.get(sym) || [];
      const merged = new Map(old.map(x => [x.t, x])); arr.forEach(x => merged.set(x.t, x));
      DB.set(sym, [...merged.values()].sort((a, b) => a.t - b.t).slice(-1200));
      added[sym] = arr.length;
    });
    return { added, bad };
  }

  function persist() {
    try {
      const obj = {}; DB.forEach((v, k) => { obj[k] = v.map(x => [x.t, x.o, x.h, x.l, x.c, x.v]); });
      const s = JSON.stringify(obj);
      if (s.length < 4.5e6) localStorage.setItem("vxtck_csv", s); else localStorage.removeItem("vxtck_csv");
    } catch (e) { /* bỏ qua */ }
  }
  function restore() {
    try {
      const o = JSON.parse(localStorage.getItem("vxtck_csv") || "{}");
      Object.entries(o).forEach(([k, v]) => DB.set(k, v.map(a => ({ t: a[0], o: a[1], h: a[2], l: a[3], c: a[4], v: a[5] }))));
    } catch (e) { /* bỏ qua */ }
  }

  /* ---------- Nhà cung cấp dữ liệu cho app.js ---------- */
  let APP = null;
  const provider = {
    async getHist(sym, days, demo) {
      if (demo) return { symbol: sym, source: "Dữ liệu mẫu", candles: demoCandles(sym, days) };
      const c = DB.get(sym);
      if (!c) throw new Error("Chưa nhập dữ liệu mã này (tab Nhập dữ liệu)");
      const last = new Date(c[c.length - 1].t * 1000);
      return { symbol: sym, source: `CSV đến ${last.toLocaleDateString("vi-VN")}`, candles: c };
    },
    async getNews(demo) {
      if (demo) { const now = Date.now() / 1000; return { items: DEMO_NEWS.map((t, i) => ({ title: "[MẪU] " + t, link: "https://cafef.vn", desc: "Tin mẫu để thử giao diện.", ts: now - i * 5400, source: "Mẫu" })), errors: [] }; }
      return { items: [], errors: ["Bản web không tải được tin trực tiếp"] };
    },
    async getExtra() { return null; },
    listImported: () => [...DB.keys()].filter(k => !IDX.test(k)).sort(),
    onDetail(cur) { renderAI(cur); },
    init(app) {
      APP = app;
      restore();
      if (!DB.size) app.setDemo(true);
      wire();
      refreshImported();
    },
  };
  window.VXT_PROVIDER = provider;

  function refreshImported() {
    const keys = [...DB.keys()].sort();
    $("#impList").innerHTML = keys.length
      ? keys.map(k => { const c = DB.get(k); const d = new Date(c[c.length - 1].t * 1000).toLocaleDateString("vi-VN"); return `<span class="symtag" title="${c.length} phiên, đến ${d}">${k} · ${c.length}</span>`; }).join(" ")
      : `<span class="muted">Chưa có mã nào.</span>`;
    $("#impCount").textContent = keys.length;
  }

  function doImport(text, sym, label) {
    try {
      const r = parseCSV(text, (sym || "").toUpperCase().trim());
      persist(); refreshImported();
      const syms = Object.keys(r.added);
      $("#impMsg").innerHTML = `<span class="up">Đã nhập ${syms.length} mã từ ${esc(label)}: ${syms.slice(0, 20).join(", ")}${syms.length > 20 ? "…" : ""}</span>` + (r.bad ? ` <span class="muted">(bỏ qua ${r.bad} dòng lỗi)</span>` : "");
      APP.setDemo(false); APP.setPreset("Mã đã nhập (CSV)"); APP.loadMarket(); APP.scan();
    } catch (e) { $("#impMsg").innerHTML = `<span class="down">${esc(label)}: ${esc(e.message)}</span>`; }
  }

  function wire() {
    document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => {
      const g = b.dataset.go;
      if (g === "demo") { APP.setDemo(true); APP.loadMarket(); APP.loadNews(); APP.scan(); APP.showTab("scan"); }
      else APP.showTab(g);
    });
    $("#impFile").onchange = async e => {
      for (const f of e.target.files) {
        const guess = (f.name.toUpperCase().match(/^([A-Z0-9]{3,12})(?=[^A-Z0-9]|$)/) || [])[1];
        doImport(await f.text(), $("#impSym").value || guess, f.name);
      }
      e.target.value = "";
    };
    $("#impPasteBtn").onclick = () => doImport($("#impPaste").value, $("#impSym").value, "dữ liệu dán");
    $("#impClear").onclick = () => { DB.clear(); persist(); refreshImported(); $("#impMsg").textContent = "Đã xóa dữ liệu đã nhập."; APP.setDemo(true); APP.scan(); };
    $("#impSample").onclick = () => {
      const rows = ["Ticker,Date,Open,High,Low,Close,Volume"];
      demoCandles("FPT", 30).slice(-5).forEach(c => rows.push(["FPT", new Date(c.t * 1000).toISOString().slice(0, 10), c.o, c.h, c.l, c.c, c.v].join(",")));
      $("#impPaste").value = rows.join("\n");
    };
    // tải bản chạy trên máy
    const dl = $("#dlBtn");
    if (window.claude && claude.use) {
      claude.use("downloads").then(d => {
        if (!d) { dl.hidden = true; $("#dlNote").textContent = "Khung xem này không hỗ trợ tải file – hãy mở trang trên claude.ai bằng máy tính."; return; }
        dl.onclick = async () => {
          try {
            const bin = Uint8Array.from(atob(document.getElementById("zipdata").textContent.trim()), c => c.charCodeAt(0));
            await d.save({ filename: "VXT-ChungKhoan.zip", data: bin });
            $("#dlNote").textContent = "Đã gửi file. Giải nén rồi bấm đúp CHAY_WINDOWS.bat.";
          } catch (e) { $("#dlNote").textContent = e && e.code === "declined" ? "Bạn đã hủy tải." : "Không tải được: " + (e && (e.message || e.code)); }
        };
      });
    } else { dl.hidden = true; $("#dlNote").textContent = "Không tải được file ở khung xem này."; }
  }

  /* ---------- Hỏi Claude nhận định (chỉ gửi các chỉ số kỹ thuật đã tính) ---------- */
  let samplePromise = null;
  function getSample() { if (!samplePromise) samplePromise = window.claude && claude.use ? claude.use("sample") : Promise.resolve(null); return samplePromise; }
  async function renderAI(cur) {
    const box = document.createElement("div");
    box.className = "card"; box.id = "aiBox";
    box.innerHTML = `<h3>Claude nhận định</h3><p class="muted small">Gửi các chỉ số kỹ thuật của mã này (không gửi thông tin cá nhân) để Claude viết nhận định ngắn bằng tiếng Việt.</p><button class="primary" id="aiBtn">Hỏi Claude về ${esc(cur.sym)}</button><div id="aiOut" style="margin-top:10px;white-space:pre-wrap"></div>`;
    const old = document.getElementById("aiBox"); if (old) old.remove();
    document.getElementById("symNews").before(box);
    const s = await getSample();
    if (!s) { box.remove(); return; }
    let ctrl = null;
    $("#aiBtn").onclick = async () => {
      const a = cur.a;
      const data = {
        ma: cur.sym, nguon: cur.source, gia: a.last, thay_doi_pct: +a.chgPct.toFixed(2), ema20: a.ema20, ema50: a.ema50, ema200: a.ema200,
        rsi14: a.rsi, macd: a.macd, macd_signal: a.macdSig, atr_pct: a.atrPct, kl_so_tb20: a.volRatio, gtgd_tb20_ty: a.value20,
        dinh20: a.hi20, day20: a.lo20, ho_tro: a.supports, khang_cu: a.resist, diem: a.score, tin_hieu: a.signal,
        ly_do: a.reasons.map(r => r.txt), canh_bao: a.warns, ke_hoach: a.plan, nguong_cho_mua: a.trigger,
        dong_cua_10_phien: cur.candles.slice(-10).map(c => +c.c.toFixed(2)),
      };
      const prompt = `Bạn là chuyên viên phân tích kỹ thuật chứng khoán Việt Nam. Dưới đây là số liệu kỹ thuật (giá: nghìn đồng) của một mã cổ phiếu do phần mềm tính sẵn${cur.source === "Dữ liệu mẫu" ? " (LƯU Ý: đây là dữ liệu giả lập để thử nghiệm)" : ""}.
Viết nhận định bằng tiếng Việt, 6-9 câu, văn xuôi ngắn gọn, gồm: (1) xu hướng và động lượng hiện tại, (2) đánh giá kế hoạch mua/cắt lỗ/mục tiêu phần mềm đưa ra có hợp lý không, nên chỉnh gì, (3) kịch bản tích cực và tiêu cực với các mức giá cụ thể, (4) rủi ro cần lưu ý (thanh khoản, T+2, biên độ). Chỉ dựa trên số liệu được cung cấp, không bịa tin tức hay số liệu cơ bản. Kết thúc bằng một câu nhắc đây không phải khuyến nghị đầu tư.
Số liệu: ${JSON.stringify(data)}`;
      if (ctrl) ctrl.abort();
      ctrl = new AbortController();
      $("#aiOut").textContent = "Đang hỏi Claude…";
      $("#aiBtn").disabled = true;
      try {
        const r = await s(prompt, { signal: ctrl.signal, onText: ({ text }) => { $("#aiOut").textContent = text; } });
        $("#aiOut").textContent = r.text;
      } catch (e) {
        if (e && e.code === "not_granted") box.remove();
        else $("#aiOut").textContent = e && e.code === "rate_limited" ? "Đang bị giới hạn lượt hỏi, thử lại sau ít phút." : "Không hỏi được: " + (e && (e.message || e.code));
      } finally { $("#aiBtn").disabled = false; }
    };
  }
})();
