/* VXT Chứng Khoán - bộ chỉ báo kỹ thuật và chấm điểm tín hiệu.
   Giá tính bằng nghìn đồng. Thị trường cơ sở VN chỉ mua (Long), không bán khống. */
(function (root) {
  "use strict";

  function ema(a, n) {
    const out = new Array(a.length).fill(null);
    if (a.length < n) return out;
    let s = 0;
    for (let i = 0; i < n; i++) s += a[i];
    let prev = s / n;
    out[n - 1] = prev;
    const k = 2 / (n + 1);
    for (let i = n; i < a.length; i++) { prev = a[i] * k + prev * (1 - k); out[i] = prev; }
    return out;
  }

  function sma(a, n) {
    const out = new Array(a.length).fill(null);
    let s = 0;
    for (let i = 0; i < a.length; i++) {
      s += a[i];
      if (i >= n) s -= a[i - n];
      if (i >= n - 1) out[i] = s / n;
    }
    return out;
  }

  function rsi(c, n = 14) {
    const out = new Array(c.length).fill(null);
    if (c.length <= n) return out;
    let g = 0, l = 0;
    for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
    g /= n; l /= n;
    out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    for (let i = n + 1; i < c.length; i++) {
      const d = c[i] - c[i - 1];
      g = (g * (n - 1) + Math.max(d, 0)) / n;
      l = (l * (n - 1) + Math.max(-d, 0)) / n;
      out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return out;
  }

  function macd(c, f = 12, s = 26, sig = 9) {
    const ef = ema(c, f), es = ema(c, s);
    const line = c.map((_, i) => (ef[i] != null && es[i] != null ? ef[i] - es[i] : null));
    const start = line.findIndex(v => v != null);
    const signal = new Array(c.length).fill(null);
    if (start >= 0) {
      const sub = ema(line.slice(start), sig);
      for (let i = 0; i < sub.length; i++) signal[start + i] = sub[i];
    }
    const hist = line.map((v, i) => (v != null && signal[i] != null ? v - signal[i] : null));
    return { line, signal, hist };
  }

  function atr(H, L, C, n = 14) {
    const out = new Array(C.length).fill(null);
    const tr = C.map((_, i) => i === 0 ? H[0] - L[0] :
      Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1])));
    if (C.length <= n) return out;
    let s = 0;
    for (let i = 1; i <= n; i++) s += tr[i];
    let prev = s / n; out[n] = prev;
    for (let i = n + 1; i < C.length; i++) { prev = (prev * (n - 1) + tr[i]) / n; out[i] = prev; }
    return out;
  }

  function bollinger(c, n = 20, k = 2) {
    const mid = sma(c, n), up = [], lo = [];
    for (let i = 0; i < c.length; i++) {
      if (mid[i] == null) { up.push(null); lo.push(null); continue; }
      let s = 0;
      for (let j = i - n + 1; j <= i; j++) s += (c[j] - mid[i]) ** 2;
      const sd = Math.sqrt(s / n);
      up.push(mid[i] + k * sd); lo.push(mid[i] - k * sd);
    }
    return { mid, up, lo };
  }

  /* Đỉnh/đáy cục bộ (swing) để tìm hỗ trợ - kháng cự */
  function pivots(H, L, w = 3, lookback = 150) {
    const hi = [], lo = [];
    const s = Math.max(w, H.length - lookback);
    for (let i = s; i < H.length - w; i++) {
      let isH = true, isL = true;
      for (let j = i - w; j <= i + w; j++) {
        if (H[j] > H[i]) isH = false;
        if (L[j] < L[i]) isL = false;
      }
      if (isH) hi.push(H[i]);
      if (isL) lo.push(L[i]);
    }
    return { hi, lo };
  }

  /* Bước giá: HOSE <10k:10đ, 10k-<50k:50đ, >=50k:100đ; HNX/UPCoM 100đ */
  function tick(p, exch) {
    if (exch === "HNX" || exch === "UPCOM") return 0.1;
    if (p < 10) return 0.01;
    if (p < 50) return 0.05;
    return 0.1;
  }
  function roundTick(p, exch, mode) {
    const t = tick(p, exch);
    const f = mode === "down" ? Math.floor : mode === "up" ? Math.ceil : Math.round;
    return +(f(p / t + 1e-9) * t).toFixed(2);
  }

  const maxOf = (a, s, e) => { let m = -Infinity; for (let i = s; i < e; i++) m = Math.max(m, a[i]); return m; };
  const minOf = (a, s, e) => { let m = Infinity; for (let i = s; i < e; i++) m = Math.min(m, a[i]); return m; };

  function analyze(candles, opt = {}) {
    const exch = opt.exchange || "HOSE";
    const isIndex = !!opt.isIndex;
    const n = candles.length;
    if (n < 35) return { ok: false, reason: "Chưa đủ dữ liệu (cần ≥ 35 phiên)" };
    const O = candles.map(x => x.o), H = candles.map(x => x.h), L = candles.map(x => x.l),
      C = candles.map(x => x.c), V = candles.map(x => x.v);
    const e20 = ema(C, 20), e50 = ema(C, 50), e200 = ema(C, 200);
    const R = rsi(C, 14), M = macd(C), A = atr(H, L, C, 14), B = bollinger(C, 20, 2);
    const vAvg = sma(V, 20);
    const i = n - 1, p = i - 1;
    const c = C[i], cp = C[p];
    const a = A[i] || (H[i] - L[i]) || c * 0.02;
    const chg = c - cp, chgPct = (chg / cp) * 100;
    const volRatio = vAvg[p] ? V[i] / vAvg[p] : 1;
    const value20 = (() => { let s = 0, k = 0; for (let j = Math.max(0, n - 20); j < n; j++) { s += C[j] * V[j]; k++; } return s / k / 1e6; })(); // tỷ đồng
    const hi20 = maxOf(H, Math.max(0, n - 21), n - 1), lo20 = minOf(L, Math.max(0, n - 21), n - 1);
    const reasons = [], warns = [];
    let score = 0;
    const add = (pt, txt) => { score += pt; reasons.push({ pt, txt }); };

    // 1. Xu hướng
    const trendUp = c > e20[i] && e20[i] > (e50[i] ?? -Infinity);
    const trendDown = e50[i] != null && c < e20[i] && e20[i] < e50[i];
    if (trendUp) add(2, "Xu hướng tăng: Giá > EMA20 > EMA50");
    else if (trendDown) add(-2, "Xu hướng giảm: Giá < EMA20 < EMA50");
    else if (c > e20[i]) add(1, "Giá nằm trên EMA20");
    else add(-1, "Giá nằm dưới EMA20");
    if (e200[i] != null) {
      if (c > e200[i]) add(1, "Trên EMA200 (xu hướng dài hạn tăng)");
      else add(-1, "Dưới EMA200 (xu hướng dài hạn yếu)");
    }
    // 2. MACD
    const h0 = M.hist[i], h1 = M.hist[p];
    let crossUp = false, crossDn = false;
    for (let k = i; k > i - 3 && k > 0; k--) {
      if (M.hist[k] != null && M.hist[k - 1] != null) {
        if (M.hist[k] > 0 && M.hist[k - 1] <= 0) crossUp = true;
        if (M.hist[k] < 0 && M.hist[k - 1] >= 0) crossDn = true;
      }
    }
    if (crossUp) add(2, "MACD vừa cắt lên đường tín hiệu");
    else if (crossDn) add(-2, "MACD vừa cắt xuống đường tín hiệu");
    else if (h0 != null && h1 != null) {
      if (h0 > 0 && h0 >= h1) add(1, "Động lượng MACD tăng");
      else if (h0 < 0 && h0 <= h1) add(-1, "Động lượng MACD giảm");
    }
    // 3. RSI
    const r = R[i], rp = R[p];
    if (r != null) {
      if (r > 75) add(-1, `RSI ${r.toFixed(0)}: quá mua, dễ điều chỉnh`);
      else if (r >= 50 && r <= 70 && r >= rp) add(1, `RSI ${r.toFixed(0)}: vùng mạnh, đang tăng`);
      else if (r < 30) add(1, `RSI ${r.toFixed(0)}: quá bán, có thể hồi kỹ thuật`);
      else if (r < 45 && r < rp) add(-1, `RSI ${r.toFixed(0)}: yếu, đang giảm`);
    }
    // 4. Bứt phá / thủng nền
    const breakout = c > hi20 && volRatio >= 1.3;
    const breakdown = c < lo20;
    if (breakout) add(2, `Bứt phá đỉnh 20 phiên (${hi20.toFixed(2)}) kèm khối lượng`);
    else if (c > hi20) add(1, "Vượt đỉnh 20 phiên nhưng khối lượng chưa xác nhận");
    if (breakdown) add(-2, `Thủng đáy 20 phiên (${lo20.toFixed(2)})`);
    // 5. Khối lượng
    if (volRatio >= 1.5 && chg > 0 && !breakout) add(1, `Khối lượng gấp ${volRatio.toFixed(1)} lần TB20, giá tăng`);
    if (volRatio >= 1.5 && chg < 0) add(-1, `Bán mạnh: khối lượng gấp ${volRatio.toFixed(1)} lần TB20`);
    // 6. Không mua đuổi
    const stretch = (c - e20[i]) / a;
    if (stretch > 2.5) add(-1, `Giá đã cách EMA20 ${stretch.toFixed(1)} ATR, tránh mua đuổi`);
    // Thanh khoản
    if (!isIndex && value20 < 3) warns.push(`Thanh khoản thấp (${value20.toFixed(1)} tỷ/phiên), khó mua bán khối lượng lớn`);
    if (!isIndex && Math.abs(chgPct) >= 6.5) warns.push("Biến động gần biên độ trần/sàn");

    let signal, cls;
    if (score >= 5) { signal = "MUA"; cls = "buy"; }
    else if (score >= 3) { signal = "MUA THĂM DÒ"; cls = "buy2"; }
    else if (score <= -3) { signal = "BÁN / ĐỨNG NGOÀI"; cls = "sell"; }
    else { signal = "THEO DÕI"; cls = "hold"; }
    if (!isIndex && value20 < 1 && cls.startsWith("buy")) { signal = "THEO DÕI"; cls = "hold"; warns.push("Hạ tín hiệu vì thanh khoản quá thấp"); }

    // Kế hoạch giao dịch (Long)
    const pv = pivots(H, L, 3, 150);
    // gom các mức gần nhau (< 0,5 ATR) thành một vùng
    const cluster = arr => { const out = []; arr.forEach(x => { if (!out.length || Math.abs(out[out.length - 1] - x) > 0.5 * a) out.push(+x.toFixed(2)); }); return out; };
    const supports = cluster(pv.lo.filter(x => x < c - 0.2 * a).sort((x, y) => y - x)).slice(0, 3);
    const resist = cluster(pv.hi.filter(x => x > c + 0.2 * a).sort((x, y) => x - y)).slice(0, 3);
    let plan = null;
    if (cls === "buy" || cls === "buy2" || (r != null && r < 30 && !breakdown)) {
      let type, lo, hi;
      if (breakout) { type = "Mua bứt phá (canh nhịp test lại nền)"; lo = Math.max(hi20, c - 0.5 * a); hi = c; }
      else if (trendUp) { type = "Mua khi giá điều chỉnh về EMA20"; lo = e20[i] - 0.2 * a; hi = Math.min(c, e20[i] + 0.5 * a); if (hi < lo) hi = lo + 0.3 * a; }
      else if (r != null && r < 30) { type = "Bắt đáy thăm dò (rủi ro cao, tỷ trọng nhỏ)"; lo = c - 0.6 * a; hi = c; }
      else { type = "Mua thăm dò quanh giá hiện tại"; lo = c - 0.5 * a; hi = c; }
      const mid = (lo + hi) / 2;
      const swingLo = minOf(L, Math.max(0, n - 10), n);
      let stop = mid - 2 * a;
      if (swingLo < lo && swingLo - 0.2 * a > stop) stop = swingLo - 0.2 * a;
      if (stop < mid * 0.92) stop = mid * 0.92; // giới hạn rủi ro tối đa ~8%
      if (stop >= lo) stop = lo - 0.5 * a;
      const risk = mid - stop;
      let t1 = mid + 1.5 * risk;
      const rz = resist.find(x => x >= mid + risk && x <= mid + 3 * risk);
      if (rz) t1 = rz;
      const t2 = Math.max(mid + 3 * risk, t1 + risk);
      plan = {
        type,
        entryLo: roundTick(lo, exch, "down"), entryHi: roundTick(hi, exch, "up"),
        stop: roundTick(stop, exch, "down"), t1: roundTick(t1, exch), t2: roundTick(t2, exch),
        riskPct: (risk / mid) * 100, rr: (t1 - mid) / risk,
      };
    }
    // Điểm chờ khi chưa có tín hiệu mua
    const trigger = plan ? null : roundTick(Math.max(hi20, e20[i] || 0), exch, "up");

    // Tín hiệu thoát hàng cho người đang nắm giữ
    const hi22 = maxOf(H, Math.max(0, n - 22), n);
    const trail = roundTick(hi22 - 3 * a, exch, "down");
    const below20x2 = C[i] < e20[i] && C[p] < e20[p];
    const exits = [
      { on: c < trail, txt: `Dừng lỗ động (đỉnh 22 phiên − 3×ATR): đóng cửa dưới ${trail}` },
      { on: below20x2, txt: "Đóng cửa dưới EMA20 hai phiên liên tiếp: giảm tỷ trọng" },
      { on: crossDn, txt: "MACD cắt xuống: động lượng suy yếu" },
      { on: r != null && r > 78, txt: "RSI > 78: cân nhắc chốt lời một phần" },
      { on: breakdown, txt: "Thủng đáy 20 phiên: thoát hàng" },
    ];

    return {
      ok: true, last: c, chg, chgPct, open: O[i], high: H[i], low: L[i], vol: V[i],
      ema20: e20[i], ema50: e50[i], ema200: e200[i], rsi: r, macd: M.line[i], macdSig: M.signal[i], hist: h0,
      atr: a, atrPct: (a / c) * 100, volRatio, value20, hi20, lo20,
      score, signal, cls, reasons, warns, plan, trigger, exits, trail, supports, resist,
      series: { e20, e50, e200, rsi: R, macd: M, bb: B },
    };
  }

  const API = { ema, sma, rsi, macd, atr, bollinger, pivots, tick, roundTick, analyze };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.TA = API;
})(this);
