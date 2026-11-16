/* VXT Chứng Khoán - giao diện. Không thu thập dữ liệu người dùng; chỉ lưu cài đặt trong trình duyệt. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  const PRESETS = {
    "VN30 (tham khảo)": "ACB BCM BID BVH CTG FPT GAS GVR HDB HPG LPB MBB MSN MWG PLX SAB SHB SSB SSI STB TCB TPB VCB VHM VIB VIC VJC VNM VPB VRE",
    "Ngân hàng": "VCB BID CTG TCB MBB VPB ACB HDB STB SHB TPB VIB LPB MSB OCB EIB SSB NAB",
    "Chứng khoán": "SSI VND HCM VCI SHS MBS VIX FTS BSI CTS ORS AGR",
    "Bất động sản & KCN": "VHM VIC VRE NVL KDH DXG PDR NLG DIG CEO KBC IDC SZC HDG",
    "Thép & Vật liệu XD": "HPG HSG NKG VGS TLH POM HT1 BCC KSB VCS",
    "Dầu khí": "GAS PLX PVS PVD PVT BSR PVC OIL",
    "Bán lẻ & Công nghệ": "MWG FRT DGW PNJ FPT CMG ELC CTR VGI",
    "Hóa chất & Phân bón": "DGC DPM DCM CSV LAS BFC",
    "Xuất khẩu (thủy sản, dệt)": "VHC ANV IDI FMC TCM MSH STK TNG",
    "Đầu tư công & Xây dựng": "VCG HHV LCG C4G CII FCN KSB PC1 CTD HBC",
    "Danh mục của tôi": "",
  };
  const IMP = (window.VXT_PROVIDER && window.VXT_PROVIDER.importedLabel) || "Mã đã nhập (CSV)";
  if (window.VXT_PROVIDER) PRESETS[IMP] = "";
  const EXCH = { SHS: "HNX", MBS: "HNX", PVS: "HNX", CEO: "HNX", IDC: "HNX", VGS: "HNX", PVC: "HNX", TNG: "HNX",
    VCS: "HNX", BCC: "HNX", NVB: "HNX", C4G: "UPCOM", OIL: "UPCOM", VGI: "UPCOM", ACV: "UPCOM", HBC: "UPCOM" };
  const ALL_KNOWN = new Set(Object.values(PRESETS).join(" ").split(/\s+/).filter(Boolean));

  const store = {
    get(k, d) { try { const v = localStorage.getItem("vxtck_" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("vxtck_" + k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } },
  };

  const S = {
    demo: store.get("demo", false), results: {}, filter: "all", sortK: "score", sortDir: -1,
    news: [], extra: null, cand: {}, cur: null, curData: null, zoom: 120, showBB: false, scanning: false, autoTimer: null,
  };

  const fmt = (x, d = 2) => x == null || isNaN(x) ? "–" : (+x).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
  const cls = x => x > 0 ? "up" : x < 0 ? "down" : "ref";
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isIndex = s => /^(VNINDEX|VN30|HNXINDEX|HNX30|UPCOMINDEX)$/.test(s);

  async function api(path) {
    const sep = path.includes("?") ? "&" : "?";
    const r = await fetch(path + (S.demo ? sep + "demo=1" : ""));
    const j = await r.json().catch(() => ({ error: "Phản hồi không hợp lệ" }));
    if (!r.ok || j.error) throw new Error(j.error || ("HTTP " + r.status));
    return j;
  }
  const P = window.VXT_PROVIDER || null;
  const getHist = (sym, days = 760) => P ? P.getHist(sym, days, S.demo) : api(`/api/history?symbol=${encodeURIComponent(sym)}&days=${days}`);

  /* ---------------- Giờ giao dịch ---------------- */
  function vnNow() { const d = new Date(); return new Date(d.getTime() + (d.getTimezoneOffset() + 420) * 60000); }
  function session() {
    const d = vnNow(), wd = d.getDay(), m = d.getHours() * 60 + d.getMinutes();
    if (wd === 0 || wd === 6) return "Nghỉ cuối tuần";
    if (m < 540) return "Chưa mở cửa";
    if (m < 555) return "ATO";
    if (m < 690) return "Phiên sáng";
    if (m < 780) return "Nghỉ trưa";
    if (m < 870) return "Phiên chiều";
    if (m < 885) return "ATC";
    if (m < 900) return "Thỏa thuận";
    return "Đã đóng cửa";
  }
  /* Tỷ lệ thời gian phiên đã trôi qua nếu nến cuối là phiên hôm nay (9:00-11:30, 13:00-14:45) */
  function partialOf(candles) {
    const d = vnNow(), last = candles[candles.length - 1];
    const ld = new Date((last.t + 25200) * 1000);
    if (ld.getUTCFullYear() !== d.getFullYear() || ld.getUTCMonth() !== d.getMonth() || ld.getUTCDate() !== d.getDate()) return 1;
    const m = d.getHours() * 60 + d.getMinutes();
    const done = Math.max(0, Math.min(m, 690) - 540) + Math.max(0, Math.min(m, 885) - 780);
    return Math.min(1, done / 255);
  }
  function tickClock() {
    const d = vnNow();
    $("#clock").textContent = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) + " · " + session();
  }

  /* ---------------- Thị trường ---------------- */
  async function loadMarket() {
    try {
      const j = await getHist("VNINDEX", 760);
      const a = TA.analyze(j.candles, { isIndex: true, partial: partialOf(j.candles) });
      if (!a.ok) throw new Error(a.reason);
      const state = a.cls.startsWith("buy") ? ["Tích cực", "up"] : a.cls === "sell" ? ["Tiêu cực – hạn chế giải ngân", "down"] : ["Trung tính", "ref"];
      $("#market").innerHTML = `VN-Index <b class="${cls(a.chg)}">${fmt(a.last)}</b>
        <span class="${cls(a.chg)}">${a.chg >= 0 ? "+" : ""}${fmt(a.chg)} (${fmt(a.chgPct)}%)</span>
        · Xu hướng: <b class="${state[1]}">${state[0]}</b> <span class="muted small">(${esc(j.source)})</span>`;
      S.market = a;
    } catch (e) {
      $("#market").innerHTML = `<span class="muted">Không tải được VN-Index: ${esc(e.message)}. Thử bật “Dữ liệu mẫu” nếu máy không có mạng.</span>`;
    }
  }

  /* ---------------- Quét ---------------- */
  function currentList() {
    const custom = $("#custom").value.toUpperCase().split(/[\s,;]+/).filter(x => /^[A-Z0-9]{3,12}$/.test(x));
    const p = PRESETS[$("#preset").value] || "";
    const pv = $("#preset").value;
    const base = pv === IMP && P ? P.listImported() : pv === "Danh mục của tôi" ? [] : p.split(/\s+/).filter(Boolean);
    return [...new Set([...custom, ...base])];
  }

  /* Dữ liệu khối ngoại & cơ bản */
  async function loadExtra(list) {
    try {
      S.extra = P && P.getExtra ? await P.getExtra(S.demo) :
        await api(`/api/extra?symbols=${encodeURIComponent(list.filter(x => !isIndex(x)).join(","))}`);
    } catch (e) { S.extra = S.extra || null; }
    return S.extra;
  }
  function extraOf(sym) {
    const x = S.extra; if (!x) return null;
    const flow = x.flow && x.flow[sym], fund = x.fund && x.fund[sym];
    return flow || fund ? { flow, fund } : null;
  }
  function analyzeSym(sym, candles, source) {
    const a = TA.analyze(candles, { exchange: EXCH[sym] || "HOSE", isIndex: isIndex(sym), partial: partialOf(candles), extra: extraOf(sym) });
    if (!a.ok) return { sym, err: a.reason };
    const bt = TA.backtest(candles, a.techScore);
    const s10 = bt && bt.same[1];
    return { sym, ...a, source, bt, ext: extraOf(sym), p10: s10 && s10.n >= 5 ? s10.upPct : null, p10n: s10 ? s10.n : 0,
      fnet: (() => { const e = extraOf(sym); return e && e.flow && e.flow.today ? e.flow.today.net : null; })() };
  }

  async function scan() {
    if (S.scanning) return;
    const list = currentList();
    if (!list.length) { $("#progress").textContent = "Danh mục trống – hãy nhập mã."; return; }
    store.set("custom", $("#custom").value); store.set("preset", $("#preset").value);
    S.scanning = true; S.results = {};
    let done = 0;
    const prog = () => { $("#progress").innerHTML = `<span class="bar"><i style="width:${(done / list.length * 100).toFixed(0)}%"></i></span> ${done}/${list.length}`; };
    prog();
    const queue = [...list];
    const extraP = loadExtra(list).then(() => {  // có dữ liệu khối ngoại/cơ bản thì chấm điểm lại
      Object.keys(S.cand).forEach(sym => { if (S.results[sym] && !S.results[sym].err) S.results[sym] = analyzeSym(sym, S.cand[sym].c, S.cand[sym].src); });
      renderTable();
    });
    const worker = async () => {
      while (queue.length) {
        const sym = queue.shift();
        try {
          const j = await getHist(sym, 760);
          S.cand[sym] = { c: j.candles, src: j.source };
          S.results[sym] = analyzeSym(sym, j.candles, j.source);
        } catch (e) { S.results[sym] = { sym, err: e.message }; }
        done++; prog(); renderTable();
      }
    };
    await Promise.all([1, 2, 3, 4].map(worker));
    await Promise.race([extraP, new Promise(r => setTimeout(r, 60000))]);
    S.scanning = false;
    const errs = Object.values(S.results).filter(r => r.err).length;
    $("#progress").textContent = `Xong ${list.length} mã lúc ${vnNow().toLocaleTimeString("vi-VN")}` + (errs ? ` · ${errs} mã lỗi` : "");
    if (errs === list.length && !S.demo) $("#progress").textContent += " – kiểm tra mạng hoặc bật Dữ liệu mẫu.";
  }

  function newsCount(sym) { return S.news.filter(n => n.tickers.includes(sym)).length; }

  function renderTable() {
    const rows = Object.values(S.results).map(r => ({ ...r, news: newsCount(r.sym) }));
    const f = S.filter;
    const shown = rows.filter(r => f === "all" || (f === "news" ? r.news > 0 : f === "prob" ? r.p10 >= 60 : !r.err && (f === "buy" ? r.cls.startsWith("buy") : r.cls === f)));
    const k = S.sortK, d = S.sortDir;
    shown.sort((a, b) => {
      if (a.err && !b.err) return 1; if (b.err && !a.err) return -1;
      const x = a[k], y = b[k];
      if (typeof x === "string") return d * x.localeCompare(y);
      return d * ((x ?? -1e9) - (y ?? -1e9));
    });
    $("#tbl tbody").innerHTML = shown.map(r => r.err ? `<tr data-s="${r.sym}"><td class="sym">${r.sym}</td><td colspan="12" style="text-align:left"><span class="tag err">Lỗi</span> <span class="muted small">${esc(r.err)}</span></td></tr>` : `
      <tr data-s="${r.sym}">
        <td class="sym">${r.sym}</td>
        <td class="${cls(r.chg)}">${fmt(r.last)}</td>
        <td class="${cls(r.chg)}">${r.chg >= 0 ? "+" : ""}${fmt(r.chgPct)}</td>
        <td style="text-align:left"><span class="tag ${r.cls}">${r.signal}</span><span class="score">${r.score > 0 ? "+" : ""}${r.score}</span></td>
        <td class="${r.rsi > 70 ? "down" : r.rsi < 30 ? "up" : ""}">${fmt(r.rsi, 0)}</td>
        <td class="${r.volRatio >= 1.5 ? "ref" : ""}">${fmt(r.volRatio, 1)}</td>
        <td>${fmt(r.value20, 1)}</td>
        <td class="${cls(r.fnet)}">${r.fnet == null ? "–" : (r.fnet > 0 ? "+" : "") + fmt(r.fnet, 1)}</td>
        <td class="${r.p10 == null ? "muted" : r.p10 >= 60 ? "up" : r.p10 <= 40 ? "down" : ""}" title="${r.p10n} lần tín hiệu tương tự">${r.p10 == null ? "–" : fmt(r.p10, 0) + "%"}<span class="score">${r.p10n ? "n" + r.p10n : ""}</span></td>
        <td>${r.plan ? fmt(r.plan.entryLo) + " – " + fmt(r.plan.entryHi) : `<span class="muted small">chờ > ${fmt(r.trigger)}</span>`}</td>
        <td class="down">${r.plan ? fmt(r.plan.stop) : "–"}</td>
        <td class="up">${r.plan ? fmt(r.plan.t1) + " / " + fmt(r.plan.t2) : "–"}</td>
        <td>${r.news ? `<span class="symtag">${r.news}</span>` : ""}</td>
      </tr>`).join("");
  }

  /* ---------------- Chi tiết ---------------- */
  async function viewSymbol(sym) {
    sym = (sym || "").toUpperCase().trim();
    if (!/^[A-Z0-9]{3,12}$/.test(sym)) return;
    $("#sym").value = sym; S.cur = sym; showTab("detail");
    $("#detailHead").innerHTML = `<p class="muted">Đang tải ${sym}…</p>`;
    try {
      const j = await getHist(sym, 760);
      if (!S.extra) await loadExtra([sym]);
      else if (!P && !extraOf(sym) && !isIndex(sym)) { const keep = S.extra; await loadExtra([sym]); S.extra = { flow: { ...keep.flow, ...S.extra.flow }, fund: { ...keep.fund, ...S.extra.fund } }; }
      const r = analyzeSym(sym, j.candles, j.source);
      if (r.err) throw new Error(r.err);
      const a = r;
      S.curData = { sym, candles: j.candles, a, source: j.source };
      renderDetail(); drawChart();
      if (P && P.onDetail) P.onDetail(S.curData);
    } catch (e) {
      $("#detailHead").innerHTML = `<p class="down">Không tải được ${sym}: ${esc(e.message)}</p>`;
      S.curData = null; drawChart();
    }
  }

  function renderDetail() {
    const { sym, a, source } = S.curData;
    $("#detailHead").innerHTML = `<div class="dhead">
      <span class="big">${sym}</span>
      <span class="big ${cls(a.chg)}">${fmt(a.last)}</span>
      <span class="${cls(a.chg)}">${a.chg >= 0 ? "+" : ""}${fmt(a.chg)} (${fmt(a.chgPct)}%)</span>
      <span class="tag ${a.cls}">${a.signal}</span><span class="muted">Điểm ${a.score > 0 ? "+" : ""}${a.score}</span>
      <span class="muted small">Mở ${fmt(a.open)} · Cao ${fmt(a.high)} · Thấp ${fmt(a.low)} · KL ${fmt(a.vol, 0)} · Nguồn ${esc(source)}</span></div>`;
    const p = a.plan;
    let html = `<h3>Kế hoạch giao dịch (Long)</h3>`;
    if (p) {
      html += `<p><b>${esc(p.type)}</b></p><div class="kv">
        <div>Vùng mua</div><div>${fmt(p.entryLo)} – ${fmt(p.entryHi)}</div>
        <div>Cắt lỗ</div><div class="down">${fmt(p.stop)} (−${fmt(p.riskPct, 1)}%)</div>
        <div>Mục tiêu 1</div><div class="up">${fmt(p.t1)}</div>
        <div>Mục tiêu 2</div><div class="up">${fmt(p.t2)}</div>
        <div>Lời/Lỗ tại T1</div><div>${fmt(p.rr, 1)} R</div></div>
        <p class="muted small">Gợi ý: rủi ro mỗi lệnh ≤ 1–2% tổng vốn. Số CP = (vốn × 1%) ÷ (giá mua − cắt lỗ), làm tròn lô 100.</p>`;
    } else {
      html += `<p>Chưa có điểm mua đẹp. <b>Chờ</b> giá đóng cửa vượt <b class="up">${fmt(a.trigger)}</b> kèm khối lượng ≥ 1,3 lần TB20.</p>`;
    }
    html += `<h3 style="margin-top:14px">Nếu đang nắm giữ</h3>` + a.exits.map(x => `<div class="exit ${x.on ? "on" : ""}">${x.on ? "⚠ " : "○ "}${esc(x.txt)}</div>`).join("");
    html += `<div class="kv" style="margin-top:10px">
      <div>Hỗ trợ gần</div><div>${a.supports.map(x => fmt(x)).join(" · ") || "–"}</div>
      <div>Kháng cự gần</div><div>${a.resist.map(x => fmt(x)).join(" · ") || "–"}</div></div>`;
    $("#planCard").innerHTML = html;
    $("#reasonCard").innerHTML = `<h3>Lý do chấm điểm</h3>` +
      a.reasons.map(r => `<div class="reason"><span class="pt ${cls(r.pt)}">${r.pt > 0 ? "+" : ""}${r.pt}</span><span>${esc(r.txt)}</span></div>`).join("") +
      (a.warns.length ? `<p class="warn">${a.warns.map(esc).join("<br>")}</p>` : "") +
      (S.market && S.market.cls === "sell" && !isIndex(sym) ? `<p class="warn">VN-Index đang xu hướng xấu: nên giảm tỷ trọng giải ngân.</p>` : "") +
      `<div class="kv" style="margin-top:10px">
        <div>EMA20 / 50 / 200</div><div>${fmt(a.ema20)} / ${fmt(a.ema50)} / ${fmt(a.ema200)}</div>
        <div>RSI 14</div><div>${fmt(a.rsi, 1)}</div>
        <div>MACD / Tín hiệu</div><div>${fmt(a.macd, 3)} / ${fmt(a.macdSig, 3)}</div>
        <div>ATR 14</div><div>${fmt(a.atr)} (${fmt(a.atrPct, 1)}%)</div>
        <div>KL / TB20</div><div>${fmt(a.volRatio, 2)} lần</div>
        <div>GTGD TB 20 phiên</div><div>${fmt(a.value20, 1)} tỷ</div>
        <div>Đỉnh / đáy 20 phiên</div><div>${fmt(a.hi20)} / ${fmt(a.lo20)}</div></div>`;
    const items = S.news.filter(n => n.tickers.includes(sym)).slice(0, 15);
    $("#btCard").innerHTML = btHtml(a);
    $("#extCard").innerHTML = extHtml(sym, a);
    $("#symNews").innerHTML = `<h3>Tin liên quan ${sym}</h3>` + (items.length ? items.map(newsHtml).join("") : `<p class="muted">Chưa thấy tin nhắc tới ${sym} trong các nguồn RSS gần đây.</p>`);
  }

  function pctTxt(v, sign = true) { return v == null ? "–" : `<span class="${cls(v)}">${sign && v > 0 ? "+" : ""}${fmt(v, 1)}%</span>`; }
  function btHtml(a) {
    const b = a.bt;
    if (!b) return `<h3>Xác suất theo lịch sử</h3><p class="muted">Chưa đủ dữ liệu (cần ≥ 120 phiên).</p>`;
    const row = (s, base) => `<tr><td style="text-align:left">${s.h} phiên</td><td>${s.n}</td>
      <td class="${s.upPct == null ? "" : s.upPct >= 60 ? "up" : s.upPct <= 40 ? "down" : ""}"><b>${s.upPct == null ? "–" : fmt(s.upPct, 0) + "%"}</b></td>
      <td>${pctTxt(s.avgPct)}</td><td>${pctTxt(s.medPct)}</td><td class="muted">${base.upPct == null ? "–" : fmt(base.upPct, 0) + "%"} / ${pctTxt(base.avgPct)}</td></tr>`;
    const few = b.same[1].n < 10;
    return `<h3>Xác suất theo lịch sử của chính mã này</h3>
      <p class="muted small">Những lần trước điểm kỹ thuật tương tự hôm nay (cùng nhóm “${a.signal}”, chênh ≤ 1 điểm) trong ${b.bars} phiên, mua ở giá đóng cửa:</p>
      <div class="tablewrap"><table><thead><tr><th>Sau</th><th>Số lần</th><th>Tỷ lệ tăng</th><th>Lãi/lỗ TB</th><th>Trung vị</th><th>Mọi phiên (so sánh)</th></tr></thead>
      <tbody>${b.same.map((s, k) => row(s, b.base[k])).join("")}</tbody></table></div>
      <p style="margin:8px 0 0">Mô phỏng lệnh (cắt lỗ 2×ATR, mục tiêu 1,5R, giữ tối đa 20 phiên): chạm mục tiêu <b class="up">${b.trade.tpPct == null ? "–" : fmt(b.trade.tpPct, 0) + "%"}</b>,
      chạm cắt lỗ <b class="down">${b.trade.slPct == null ? "–" : fmt(b.trade.slPct, 0) + "%"}</b>${b.trade.n ? `, còn lại hết hạn (${b.trade.n} lệnh)` : ""}.</p>
      <p class="${few ? "warn" : "muted"} small">${few ? "Ít mẫu (< 10 lần): con số dễ sai lệch, chỉ tham khảo. " : ""}Thống kê quá khứ, chưa tính phí, thuế và trượt giá; không đảm bảo lặp lại.</p>`;
  }
  function extHtml(sym, a) {
    const e = a.ext;
    if (isIndex(sym)) return "";
    if (!e) return `<h3>Khối ngoại & chỉ số cơ bản</h3><p class="muted">${S.extra ? "Nguồn chưa có dữ liệu cho mã này." : "Đang tải hoặc nguồn chưa phản hồi."}</p>`;
    const f = e.flow, u = e.fund;
    let h = `<h3>Khối ngoại & chỉ số cơ bản</h3><div class="grid2"><div><div class="kv">`;
    if (f && f.today) h += `<div>KN mua / bán (${esc(f.today.date || "")})</div><div>${fmt(f.today.buy, 1)} / ${fmt(f.today.sell, 1)} tỷ</div>
      <div>KN ròng phiên</div><div class="${cls(f.today.net)}">${f.today.net > 0 ? "+" : ""}${fmt(f.today.net, 1)} tỷ</div>`;
    if (f && f.days >= 2) h += `<div>KN ròng ${Math.min(5, f.days)} phiên</div><div class="${cls(f.net5)}">${fmt(f.net5, 1)} tỷ</div>`;
    if (f && f.days >= 10) h += `<div>KN ròng ${Math.min(20, f.days)} phiên</div><div class="${cls(f.net20)}">${fmt(f.net20, 1)} tỷ</div>`;
    if (f && f.today && f.today.room != null) h += `<div>Room ngoại còn</div><div>${fmt(f.today.room, 0)} CP</div>`;
    if (!f) h += `<div>Khối ngoại</div><div class="muted">chưa có</div>`;
    h += `</div>${f && f.days < 5 ? `<p class="muted small">Lịch sử khối ngoại đang được tích lũy (${f.days} phiên).</p>` : ""}</div><div><div class="kv">`;
    if (u) h += `<div>Kỳ báo cáo</div><div>${esc(u.q || "")}</div>
      <div>P/E · P/B</div><div>${fmt(u.pe, 1)} · ${fmt(u.pb, 2)}</div>
      <div>ROE · ROA</div><div>${fmt(u.roe, 1)}% · ${fmt(u.roa, 1)}%</div>
      <div>LNST 4 quý so cùng kỳ</div><div>${pctTxt(u.npGrowth)}</div>
      <div>Biên LN gộp · ròng</div><div>${fmt(u.gm, 1)}% · ${fmt(u.npm, 1)}%</div>
      <div>Nợ / Vốn CSH</div><div>${fmt(u.de, 2)}</div>
      <div>Vốn hóa</div><div>${fmt(u.mc, 0)} tỷ</div>`;
    else h += `<div>Chỉ số cơ bản</div><div class="muted">chưa có</div>`;
    return h + `</div></div></div><p class="muted small">Nguồn: khối ngoại SSI iBoard · chỉ số tài chính Vietcap (TTM). Ngân hàng không có biên LN gộp.</p>`;
  }

  /* ---------------- Biểu đồ (canvas, không dùng thư viện ngoài) ---------------- */
  const cv = $("#chart");
  let hoverIdx = null, layout = null;

  function drawChart() {
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, Hh = cv.clientHeight;
    cv.width = W * dpr; cv.height = Hh * dpr;
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, Hh);
    if (!S.curData) { g.fillStyle = "#8b98a9"; g.font = "14px sans-serif"; g.fillText("Nhập mã để xem biểu đồ", 20, 40); return; }
    const { candles, a } = S.curData;
    const n = candles.length, cnt = Math.min(S.zoom, n), s = n - cnt;
    const padR = 64, padT = 30, plotW = W - padR - 8;
    const hP = (Hh - padT) * 0.62, hV = (Hh - padT) * 0.14, hR = (Hh - padT) * 0.2, gap = (Hh - padT) * 0.02;
    const yP0 = padT, yV0 = yP0 + hP + gap, yR0 = yV0 + hV + gap;
    const ser = a.series;
    let hi = -Infinity, lo = Infinity, vmax = 0;
    for (let i = s; i < n; i++) {
      hi = Math.max(hi, candles[i].h); lo = Math.min(lo, candles[i].l); vmax = Math.max(vmax, candles[i].v);
      if (S.showBB && ser.bb.up[i] != null) { hi = Math.max(hi, ser.bb.up[i]); lo = Math.min(lo, ser.bb.lo[i]); }
    }
    if (a.plan) { hi = Math.max(hi, a.plan.t2); lo = Math.min(lo, a.plan.stop); }
    const pad = (hi - lo) * 0.06; hi += pad; lo -= pad;
    const bw = plotW / cnt;
    const X = i => 8 + (i - s) * bw + bw / 2;
    const Y = v => yP0 + (hi - v) / (hi - lo) * hP;
    const YV = v => yV0 + hV - v / vmax * hV;
    const YR = v => yR0 + (100 - v) / 100 * hR;
    layout = { s, n, bw, padR, W };

    // lưới + trục giá
    g.font = "11px sans-serif"; g.textAlign = "left";
    g.strokeStyle = "#222b38"; g.fillStyle = "#8b98a9"; g.lineWidth = 1;
    for (let k = 0; k <= 5; k++) {
      const v = lo + (hi - lo) * k / 5, y = Y(v);
      g.beginPath(); g.moveTo(8, y); g.lineTo(W - padR, y); g.stroke();
      g.fillText(fmt(v), W - padR + 6, y + 4);
    }
    [30, 50, 70].forEach(v => { g.strokeStyle = v === 50 ? "#222b38" : "#3a2f20"; g.beginPath(); g.moveTo(8, YR(v)); g.lineTo(W - padR, YR(v)); g.stroke(); g.fillText(v, W - padR + 6, YR(v) + 4); });
    // nhãn tháng
    let lastM = -1;
    for (let i = s; i < n; i++) {
      const d = new Date((candles[i].t + 25200) * 1000), m = d.getUTCMonth();
      if (m !== lastM && i > s) { g.fillStyle = "#56627a"; g.fillText(`T${m + 1}/${String(d.getUTCFullYear()).slice(2)}`, X(i), Hh - 4); }
      lastM = m;
    }
    // Bollinger
    if (S.showBB) {
      g.fillStyle = "rgba(163,113,247,.07)"; g.beginPath();
      let st = false;
      for (let i = s; i < n; i++) if (ser.bb.up[i] != null) { st ? g.lineTo(X(i), Y(ser.bb.up[i])) : g.moveTo(X(i), Y(ser.bb.up[i])); st = true; }
      for (let i = n - 1; i >= s; i--) if (ser.bb.lo[i] != null) g.lineTo(X(i), Y(ser.bb.lo[i]));
      g.closePath(); g.fill();
    }
    // nến + khối lượng
    for (let i = s; i < n; i++) {
      const c = candles[i], up = c.c >= c.o, col = up ? "#1fbf75" : "#f0506e";
      g.strokeStyle = col; g.fillStyle = col;
      const x = X(i), w = Math.max(1, bw * 0.7);
      g.beginPath(); g.moveTo(x, Y(c.h)); g.lineTo(x, Y(c.l)); g.stroke();
      const yo = Y(c.o), yc = Y(c.c);
      g.fillRect(x - w / 2, Math.min(yo, yc), w, Math.max(1, Math.abs(yo - yc)));
      g.globalAlpha = 0.45; g.fillRect(x - w / 2, YV(c.v), w, yV0 + hV - YV(c.v)); g.globalAlpha = 1;
    }
    const line = (arr, col, y = Y, wdt = 1.3) => {
      g.strokeStyle = col; g.lineWidth = wdt; g.beginPath(); let st = false;
      for (let i = s; i < n; i++) if (arr[i] != null) { st ? g.lineTo(X(i), y(arr[i])) : g.moveTo(X(i), y(arr[i])); st = true; }
      g.stroke(); g.lineWidth = 1;
    };
    line(ser.e20, "#e3b341"); line(ser.e50, "#3b82f6"); line(ser.e200, "#a371f7");
    line(ser.rsi, "#58a6ff", YR);
    // mức kế hoạch
    const lvl = (v, col, txt) => {
      const y = Y(v); g.setLineDash([5, 4]); g.strokeStyle = col; g.beginPath(); g.moveTo(8, y); g.lineTo(W - padR, y); g.stroke(); g.setLineDash([]);
      g.fillStyle = col; g.fillRect(W - padR, y - 8, padR, 16); g.fillStyle = "#0d1117"; g.fillText(txt + " " + fmt(v), W - padR + 3, y + 4);
    };
    if (a.plan) {
      g.fillStyle = "rgba(59,130,246,.12)"; g.fillRect(8, Y(a.plan.entryHi), W - padR - 8, Math.max(2, Y(a.plan.entryLo) - Y(a.plan.entryHi)));
      lvl(a.plan.stop, "#f0506e", "SL"); lvl(a.plan.t1, "#1fbf75", "T1"); lvl(a.plan.t2, "#1fbf75", "T2");
    }
    // giá hiện tại
    const yl = Y(a.last); g.fillStyle = a.chg >= 0 ? "#1fbf75" : "#f0506e"; g.fillRect(W - padR, yl - 8, padR, 16);
    g.fillStyle = "#fff"; g.fillText(fmt(a.last), W - padR + 4, yl + 4);
    g.fillStyle = "#8b98a9"; g.fillText("RSI 14", 12, yR0 + 12); g.fillText("KL", 12, yV0 + 12);
    // con trỏ
    let i = hoverIdx != null && hoverIdx >= s && hoverIdx < n ? hoverIdx : n - 1;
    if (hoverIdx != null) { g.strokeStyle = "#44516a"; g.beginPath(); g.moveTo(X(i), padT); g.lineTo(X(i), Hh - 14); g.stroke(); }
    const c = candles[i], d = new Date((c.t + 25200) * 1000);
    $("#tip").innerHTML = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()} · O ${fmt(c.o)} H ${fmt(c.h)} L ${fmt(c.l)} <b class="${c.c >= c.o ? "up" : "down"}">C ${fmt(c.c)}</b> · KL ${fmt(c.v, 0)} · RSI ${fmt(ser.rsi[i], 0)}
      · <span style="color:#e3b341">EMA20</span> <span style="color:#3b82f6">EMA50</span> <span style="color:#a371f7">EMA200</span>`;
  }
  function onMove(clientX) {
    if (!layout) return;
    const r = cv.getBoundingClientRect(), x = clientX - r.left;
    hoverIdx = Math.floor((x - 8) / layout.bw) + layout.s;
    if (x > layout.W - layout.padR) hoverIdx = null;
    drawChart();
  }
  cv.addEventListener("mousemove", e => onMove(e.clientX));
  cv.addEventListener("mouseleave", () => { hoverIdx = null; drawChart(); });
  cv.addEventListener("touchmove", e => onMove(e.touches[0].clientX), { passive: true });
  window.addEventListener("resize", () => { if ($("#tab-detail").classList.contains("active")) drawChart(); });

  /* ---------------- Tin tức ---------------- */
  const POS = ["lãi", "tăng trưởng", "kỷ lục", "cổ tức", "mua vào", "trúng thầu", "vượt kế hoạch", "mua ròng", "nâng hạng", "tích cực", "khởi sắc", "bứt phá", "mua lại cổ phiếu", "hồi phục"];
  const NEG = ["lỗ", "giảm", "bán ra", "xử phạt", "phạt", "đình chỉ", "cảnh báo", "kiểm soát", "hủy niêm yết", "khởi tố", "bắt", "bán ròng", "nợ xấu", "thua lỗ", "giải chấp", "lao dốc", "bán tháo"];
  function sentiment(t) {
    const s = " " + t.toLowerCase() + " ";
    const has = w => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, "u").test(s);
    let v = 0; POS.forEach(w => { if (has(w)) v++; }); NEG.forEach(w => { if (has(w)) v--; });
    return v;
  }
  function extractTickers(text) {
    const set = new Set(ALL_KNOWN); currentList().forEach(x => set.add(x));
    const found = new Set();
    (text.match(/(?<![A-Za-z0-9À-ỹ])[A-Z][A-Z0-9]{2}(?![A-Za-z0-9À-ỹ])/g) || []).forEach(m => { if (set.has(m)) found.add(m); });
    return [...found];
  }
  async function loadNews() {
    $("#newsInfo").textContent = "Đang tải tin…";
    try {
      const j = P ? await P.getNews(S.demo) : await api("/api/news");
      S.news = j.items.map(n => ({ ...n, tickers: extractTickers(n.title + " " + n.desc), sent: sentiment(n.title) }));
      $("#newsInfo").textContent = `${S.news.length} tin` + (j.errors.length ? ` · ${j.errors.length} nguồn lỗi` : "");
      $("#newsInfo").title = j.errors.join("\n");
    } catch (e) { $("#newsInfo").textContent = "Không tải được tin: " + e.message; }
    renderNews(); renderTable(); if (S.curData) renderDetail();
  }
  function ago(ts) {
    if (!ts) return "";
    const m = Math.round((Date.now() / 1000 - ts) / 60);
    if (m < 60) return m + " phút trước"; if (m < 1440) return Math.round(m / 60) + " giờ trước";
    return new Date(ts * 1000).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  }
  function newsHtml(n) {
    const sTag = n.sent > 0 ? `<span class="tag buy2">+</span> ` : n.sent < 0 ? `<span class="tag sell">−</span> ` : "";
    return `<a class="news" href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">
      <div class="t">${sTag}${n.tickers.map(t => `<span class="symtag">${t}</span>`).join("")}${esc(n.title)}</div>
      <div class="m">${n.cat === "cbtt" ? '<span class="tag hold">Công bố</span> ' : ""}${esc(n.source)} · ${ago(n.ts)}</div>${n.desc ? `<div class="d">${esc(n.desc.slice(0, 220))}</div>` : ""}</a>`;
  }
  function renderNews() {
    const q = $("#newsQ").value.trim().toLowerCase();
    const onlyWatch = $("#newsWatch").checked, wl = new Set(currentList()), onlyCb = $("#newsCbtt") && $("#newsCbtt").checked;
    const items = S.news.filter(n => (!q || (n.title + " " + n.desc).toLowerCase().includes(q) || n.tickers.includes(q.toUpperCase()))
      && (!onlyWatch || n.tickers.some(t => wl.has(t))) && (!onlyCb || n.cat === "cbtt"));
    $("#newsList").innerHTML = `<div class="card" style="padding:0">${items.slice(0, 150).map(newsHtml).join("") || `<p class="muted" style="padding:12px">Không có tin phù hợp.</p>`}</div>`;
  }

  /* ---------------- Sự kiện ---------------- */
  function showTab(t) {
    $$(".tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
    $$(".tab").forEach(s => s.classList.toggle("active", s.id === "tab-" + t));
    if (t === "detail") requestAnimationFrame(drawChart);
  }
  $$(".tabs button").forEach(b => b.onclick = () => showTab(b.dataset.tab));
  $("#preset").innerHTML = Object.keys(PRESETS).map(k => `<option>${esc(k)}</option>`).join("");
  $("#preset").value = store.get("preset", "VN30 (tham khảo)");
  if (!$("#preset").value) $("#preset").selectedIndex = 0;
  $("#custom").value = store.get("custom", "");
  $("#demo").checked = S.demo;
  $("#demo").onchange = () => { S.demo = $("#demo").checked; store.set("demo", S.demo); loadMarket(); loadNews(); scan(); if (S.cur) viewSymbol(S.cur); };
  $("#btnScan").onclick = scan;
  $("#preset").onchange = scan;
  $("#custom").addEventListener("keydown", e => { if (e.key === "Enter") scan(); });
  $("#auto").onchange = () => {
    clearInterval(S.autoTimer);
    if ($("#auto").checked) S.autoTimer = setInterval(() => { loadMarket(); scan(); loadNews(); }, 5 * 60 * 1000);
  };
  $$(".chip").forEach(c => c.onclick = () => { $$(".chip").forEach(x => x.classList.remove("active")); c.classList.add("active"); S.filter = c.dataset.f; renderTable(); });
  $$("#tbl th[data-k]").forEach(th => th.onclick = () => { const k = th.dataset.k; S.sortDir = S.sortK === k ? -S.sortDir : (k === "sym" ? 1 : -1); S.sortK = k; renderTable(); });
  $("#tbl tbody").onclick = e => { const tr = e.target.closest("tr"); if (tr) viewSymbol(tr.dataset.s); };
  $("#btnView").onclick = () => viewSymbol($("#sym").value);
  $("#sym").addEventListener("keydown", e => { if (e.key === "Enter") viewSymbol($("#sym").value); });
  $$(".seg button").forEach(b => b.onclick = () => { $$(".seg button").forEach(x => x.classList.remove("active")); b.classList.add("active"); S.zoom = +b.dataset.z; drawChart(); });
  $("#showBB").onchange = () => { S.showBB = $("#showBB").checked; drawChart(); };
  $("#newsQ").oninput = renderNews; $("#newsWatch").onchange = renderNews; if ($("#newsCbtt")) $("#newsCbtt").onchange = renderNews; $("#btnNews").onclick = loadNews;

  tickClock(); setInterval(tickClock, 30000);
  window.VXT_APP = {
    scan, viewSymbol, showTab, loadNews, loadMarket, renderTable,
    setDemo(v) { S.demo = !!v; $("#demo").checked = S.demo; store.set("demo", S.demo); },
    setPreset(name) { $("#preset").value = name; },
    isDemo: () => S.demo,
  };
  if (P && P.init) P.init(window.VXT_APP, S);
  loadMarket(); loadNews(); scan();
})();
