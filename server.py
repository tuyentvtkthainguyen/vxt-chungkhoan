#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VXT Chứng Khoán - máy chủ cục bộ
- Chỉ chạy trên máy của bạn (127.0.0.1), không thu thập hay gửi dữ liệu người dùng đi đâu.
- Lấy giá lịch sử từ các nguồn công khai (VNDirect, TCBS, SSI - tự chuyển nguồn khi lỗi).
- Lấy tin tức từ RSS công khai (CafeF, Vietstock, VnExpress...).
Chỉ dùng thư viện chuẩn của Python 3.8+, không cần cài thêm gì.
"""
import argparse
import base64
import hashlib
import hmac
import json
import math
import os
import random
import re
import ssl
import sys
import threading
import time
import urllib.parse
import urllib.request
import webbrowser
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from concurrent.futures import ThreadPoolExecutor
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HOST = os.environ.get("VXT_HOST", "127.0.0.1")
PORT = int(os.environ.get("VXT_PORT", "8686"))
PASSWORD = os.environ.get("VXT_PASSWORD", "")          # đặt để khóa trang bằng mật khẩu khi chạy trên VPS
ACCESS_LOG = os.environ.get("VXT_LOG", "0") == "1"      # mặc định không ghi nhật ký truy cập (không lưu IP người dùng)
RATE_PER_MIN = int(os.environ.get("VXT_RATE", "240"))   # giới hạn số lần gọi API mỗi phút cho mỗi kết nối
ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(ROOT, "static")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
SSL_CTX = ssl.create_default_context()

INDEXES = {"VNINDEX", "VN30", "HNXINDEX", "HNX30", "UPCOMINDEX", "HNX", "UPCOM"}
SYMBOL_RE = re.compile(r"^[A-Z0-9]{1,12}$")

NEWS_FEEDS = [
    ("CafeF", "https://cafef.vn/thi-truong-chung-khoan.rss"),
    ("CafeF", "https://cafef.vn/doanh-nghiep.rss"),
    ("Vietstock", "https://vietstock.vn/830/chung-khoan/co-phieu.rss"),
    ("Vietstock", "https://vietstock.vn/737/doanh-nghiep/hoat-dong-kinh-doanh.rss"),
    ("VnExpress", "https://vnexpress.net/rss/kinh-doanh/chung-khoan.rss"),
    ("VnExpress", "https://vnexpress.net/rss/kinh-doanh.rss"),
    ("Tin nhanh CK", "https://www.tinnhanhchungkhoan.vn/rss/chung-khoan-1.rss"),
    ("Vietstock · GD nội bộ", "https://vietstock.vn/739/chung-khoan/thong-tin-cong-bo.rss"),
    ("Vietstock · Cổ tức", "https://vietstock.vn/738/chung-khoan/co-tuc.rss"),
]
CBTT_SOURCES = {"Vietstock · GD nội bộ", "Vietstock · Cổ tức"}

_cache = {}
_cache_lock = threading.Lock()


def cache_get(key, ttl):
    with _cache_lock:
        v = _cache.get(key)
        if v and time.time() - v[0] < ttl:
            return v[1]
    return None


def cache_set(key, value):
    with _cache_lock:
        _cache[key] = (time.time(), value)


def http_get(url, timeout=12, referer=None):
    headers = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "vi,en;q=0.8"}
    if referer:
        headers["Referer"] = referer
        headers["Origin"] = referer.rstrip("/")
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as r:
        return r.read()


# ----------------------------- Giá lịch sử ---------------------------------

def _from_tv_arrays(d):
    """Định dạng kiểu TradingView: {t:[],o:[],h:[],l:[],c:[],v:[]}"""
    t, o, h, l, c = d.get("t") or [], d.get("o") or [], d.get("h") or [], d.get("l") or [], d.get("c") or []
    v = d.get("v") or [0] * len(t)
    out = []
    for i in range(len(t)):
        try:
            out.append({"t": int(t[i]), "o": float(o[i]), "h": float(h[i]),
                        "l": float(l[i]), "c": float(c[i]), "v": float(v[i] or 0)})
        except (TypeError, ValueError, IndexError):
            continue
    return out


def src_vndirect(sym, frm, to):
    url = ("https://dchart-api.vndirect.com.vn/dchart/history?resolution=D"
           f"&symbol={sym}&from={frm}&to={to}")
    d = json.loads(http_get(url, referer="https://dchart.vndirect.com.vn/"))
    if d.get("s") not in (None, "ok"):
        raise ValueError("VNDirect: không có dữ liệu")
    return _from_tv_arrays(d)


def src_tcbs(sym, frm, to):
    typ = "index" if sym in INDEXES else "stock"
    url = ("https://apipubaws.tcbs.com.vn/stock-insight/v2/stock/bars-long-term"
           f"?ticker={sym}&type={typ}&resolution=D&from={frm}&to={to}")
    d = json.loads(http_get(url, referer="https://tcinvest.tcbs.com.vn/"))
    out = []
    for r in d.get("data") or []:
        try:
            ts = r.get("tradingDate", "")[:10]
            t = int(time.mktime(time.strptime(ts, "%Y-%m-%d")))
            out.append({"t": t, "o": float(r["open"]), "h": float(r["high"]),
                        "l": float(r["low"]), "c": float(r["close"]),
                        "v": float(r.get("volume") or 0)})
        except (KeyError, TypeError, ValueError):
            continue
    return out


def src_ssi(sym, frm, to):
    url = ("https://iboard-api.ssi.com.vn/statistics/charts/history?resolution=1D"
           f"&symbol={sym}&from={frm}&to={to}")
    d = json.loads(http_get(url, referer="https://iboard.ssi.com.vn/"))
    return _from_tv_arrays(d.get("data") or {})


SOURCES = [("VNDirect", src_vndirect), ("TCBS", src_tcbs), ("SSI", src_ssi)]


def normalize(sym, candles):
    """Gom về đơn vị nghìn đồng (cổ phiếu), sắp xếp, bỏ trùng ngày."""
    candles = [c for c in candles if c["c"] > 0 and c["h"] >= c["l"]]
    if not candles:
        return candles
    seen = {}
    for c in candles:
        day = time.strftime("%Y-%m-%d", time.gmtime(c["t"] + 7 * 3600))
        seen[day] = c
    candles = sorted(seen.values(), key=lambda x: x["t"])
    if sym not in INDEXES:
        closes = sorted(c["c"] for c in candles)
        med = closes[len(closes) // 2]
        if med > 500:  # nguồn trả về đồng -> đổi sang nghìn đồng
            for c in candles:
                for k in ("o", "h", "l", "c"):
                    c[k] = round(c[k] / 1000.0, 3)
    return candles


def demo_candles(sym, days):
    """Dữ liệu giả lập để thử giao diện khi không có mạng."""
    rnd = random.Random(int(hashlib.md5(sym.encode()).hexdigest()[:12], 16) + int(time.time() // 86400))
    price = 1250.0 if sym in INDEXES else rnd.uniform(12, 120)
    drift = rnd.uniform(-0.0006, 0.0012)
    vol = rnd.uniform(0.012, 0.028) * (0.6 if sym in INDEXES else 1)
    base_v = rnd.uniform(0.5e6, 12e6)
    t = int(time.time()) - 2000 * 86400  # luôn sinh cùng một chuỗi rồi cắt, để mọi khung thời gian khớp nhau
    cutoff = int(time.time()) - days * 86400
    out = []
    i = 0
    while t < time.time():
        wd = time.gmtime(t + 7 * 3600).tm_wday
        if wd < 5:
            i += 1
            regime = math.sin(i / 37.0) * 0.004
            r = rnd.gauss(drift + regime, vol)
            o = price * (1 + rnd.gauss(0, vol / 3))
            c = max(0.5, price * (1 + r))
            h = max(o, c) * (1 + abs(rnd.gauss(0, vol / 2)))
            l = min(o, c) * (1 - abs(rnd.gauss(0, vol / 2)))
            v = base_v * (1 + abs(r) * 25) * rnd.uniform(0.5, 1.5)
            out.append({"t": t, "o": round(o, 2), "h": round(h, 2), "l": round(l, 2),
                        "c": round(c, 2), "v": round(v)})
            price = c
        t += 86400
    return [c for c in out if c["t"] >= cutoff]


def get_history(sym, days, demo=False):
    key = ("h", sym, days, demo)
    hit = cache_get(key, 120)
    if hit:
        return hit
    if demo:
        res = {"symbol": sym, "source": "Dữ liệu mẫu", "candles": normalize(sym, demo_candles(sym, days))}
        cache_set(key, res)
        return res
    to = int(time.time()) + 86400
    frm = to - days * 86400
    errors = []
    for name, fn in SOURCES:
        try:
            candles = normalize(sym, fn(sym, frm, to))
            if len(candles) >= 5:
                res = {"symbol": sym, "source": name, "candles": candles}
                cache_set(key, res)
                return res
            errors.append(f"{name}: ít dữ liệu")
        except Exception as e:  # noqa: BLE001
            errors.append(f"{name}: {type(e).__name__}")
    raise RuntimeError("Không lấy được dữ liệu " + sym + " (" + "; ".join(errors) + ")")


# ------------------------------- Tin tức -----------------------------------

TAG_RE = re.compile(r"<[^>]+>")


def clean_html(s):
    s = TAG_RE.sub(" ", s or "")
    for a, b in (("&nbsp;", " "), ("&amp;", "&"), ("&quot;", '"'), ("&#39;", "'"),
                 ("&lt;", "<"), ("&gt;", ">")):
        s = s.replace(a, b)
    return re.sub(r"\s+", " ", s).strip()


def parse_rss(source, raw):
    items = []
    root = ET.fromstring(raw)
    for it in root.iter("item"):
        title = clean_html(it.findtext("title"))
        link = (it.findtext("link") or "").strip()
        desc = clean_html(it.findtext("description"))[:400]
        pub = it.findtext("pubDate") or ""
        ts = 0
        try:
            ts = int(parsedate_to_datetime(pub).timestamp())
        except Exception:  # noqa: BLE001
            pass
        if title and link.startswith("http"):
            items.append({"title": title, "link": link, "desc": desc, "ts": ts, "source": source,
                          "cat": "cbtt" if source in CBTT_SOURCES else "tin"})
    return items


def get_news(demo=False):
    hit = cache_get(("news", demo), 600)
    if hit:
        return hit
    if demo:
        now = int(time.time())
        sample = [
            ("HPG báo lãi quý tăng mạnh nhờ giá thép phục hồi", "HPG"),
            ("FPT ký hợp đồng chuyển đổi số lớn tại Nhật Bản", "FPT"),
            ("Khối ngoại bán ròng mạnh VHM, VIC phiên cuối tuần", "VHM"),
            ("SSI chốt quyền trả cổ tức bằng tiền mặt", "SSI"),
            ("MWG đặt kế hoạch tăng trưởng lợi nhuận năm tới", "MWG"),
            ("Cổ phiếu ngân hàng bị chốt lời, VCB, TCB điều chỉnh", "VCB"),
            ("VN-Index giằng co quanh vùng kháng cự, thanh khoản suy giảm", ""),
        ]
        res = {"items": [{"title": "[MẪU] " + t, "link": "https://example.com", "desc": "Tin mẫu để thử giao diện.",
                          "ts": now - i * 5400, "source": "Mẫu"} for i, (t, _) in enumerate(sample)],
               "errors": []}
        cache_set(("news", demo), res)
        return res
    items, errors = [], []
    lock = threading.Lock()

    def work(src, url):
        try:
            got = parse_rss(src, http_get(url, timeout=10))
            with lock:
                items.extend(got)
        except Exception as e:  # noqa: BLE001
            with lock:
                errors.append(f"{src} ({urllib.parse.urlparse(url).path}): {type(e).__name__}")

    ths = [threading.Thread(target=work, args=f, daemon=True) for f in NEWS_FEEDS]
    for t in ths:
        t.start()
    for t in ths:
        t.join(15)
    uniq = {}
    for it in items:
        uniq.setdefault(it["link"], it)
    items = sorted(uniq.values(), key=lambda x: -x["ts"])[:300]
    res = {"items": items, "errors": errors}
    if items:
        cache_set(("news", demo), res)
    return res


# ----------------------- Dòng tiền khối ngoại & cơ bản ----------------------

SSI_GROUPS = ["VN30", "HOSE", "HNX", "UPCOM", "VNINDEX", "HNXIndex", "HNXUpcomIndex"]


def _vn_today():
    return time.strftime("%Y-%m-%d", time.gmtime(time.time() + 7 * 3600))


def foreign_today(symbols):
    """Khối ngoại mua/bán trong phiên gần nhất (SSI iBoard). Giá trị: tỷ đồng."""
    want = {s for s in symbols if s not in INDEXES}
    out = {}

    def take(d):
        sym = d.get("stockSymbol")
        if sym not in want or sym in out:
            return
        bv, sv = d.get("buyForeignValue"), d.get("sellForeignValue")
        if bv is None or sv is None:
            return
        td = str(d.get("tradingDate") or "")
        date = f"{td[:4]}-{td[4:6]}-{td[6:8]}" if len(td) == 8 else _vn_today()
        out[sym] = {"date": date, "buy": round(bv / 1e9, 3), "sell": round(sv / 1e9, 3),
                    "net": round((bv - sv) / 1e9, 3), "room": d.get("remainForeignQtty")}

    for g in SSI_GROUPS:
        if want <= set(out):
            break
        try:
            j = json.loads(http_get(f"https://iboard-query.ssi.com.vn/stock/group/{g}", timeout=20,
                                    referer="https://iboard.ssi.com.vn/"))
            for d in j.get("data") or []:
                take(d)
        except Exception:  # noqa: BLE001
            pass
    for sym in sorted(want - set(out)):
        try:
            j = json.loads(http_get(f"https://iboard-query.ssi.com.vn/stock/{sym}", timeout=10,
                                    referer="https://iboard.ssi.com.vn/"))
            take(j.get("data") or {})
        except Exception:  # noqa: BLE001
            pass
    return out


def fundamentals(sym):
    """Chỉ số tài chính theo quý (TTM) từ Vietcap. Tăng trưởng LNST = LNST 4 quý gần nhất so với cùng kỳ."""
    j = json.loads(http_get(f"https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/{sym}/statistics-financial",
                            timeout=20, referer="https://trading.vietcap.com.vn/"))
    rows = [r for r in (j.get("data") or []) if 1 <= int(r.get("quarter") or 0) <= 4]
    rows.sort(key=lambda r: (int(r.get("yearReport") or 0), int(r["quarter"])))
    if not rows:
        raise ValueError("không có dữ liệu")
    last = rows[-1]

    def ni(r):  # LNST 4 quý = vốn hóa / P/E
        try:
            return r["marketCap"] / r["pe"] if r.get("pe") else None
        except (TypeError, ZeroDivisionError):
            return None

    growth = None
    if len(rows) >= 5:
        a, b = ni(last), ni(rows[-5])
        if a is not None and b and b > 0:
            growth = (a / b - 1) * 100
    pct = lambda v: round(v * 100, 2) if isinstance(v, (int, float)) else None
    num = lambda v, k=2: round(v, k) if isinstance(v, (int, float)) else None
    return {"q": f"Q{last['quarter']}/{last.get('yearReport')}", "pe": num(last.get("pe")), "pb": num(last.get("pb")),
            "ps": num(last.get("ps")), "roe": pct(last.get("roe")), "roa": pct(last.get("roa")),
            "gm": pct(last.get("grossMargin")), "npm": pct(last.get("afterTaxProfitMargin")),
            "de": num(last.get("debtToEquity")), "mc": num((last.get("marketCap") or 0) / 1e9, 0),
            "dy": pct(last.get("dividendYield")), "npGrowth": num(growth, 1)}


def merge_flow(old, today):
    """Gộp khối ngoại hôm nay vào lịch sử (giữ 40 phiên) và tính ròng 5/20 phiên."""
    flow = {}
    for sym in set(old) | set(today):
        hist = dict((d, v) for d, v in (old.get(sym, {}).get("hist") or []))
        t = today.get(sym)
        if t:
            hist[t["date"]] = t["net"]
        h = sorted(hist.items())[-40:]
        nets = [v for _, v in h]
        flow[sym] = {"hist": h, "today": t or old.get(sym, {}).get("today"),
                     "net5": round(sum(nets[-5:]), 2) if nets else None,
                     "net20": round(sum(nets[-20:]), 2) if nets else None,
                     "days": len(nets)}
    return flow


_flow_mem = {}


def get_extra(symbols, demo=False):
    key = ("extra", tuple(sorted(symbols)), demo)
    hit = cache_get(key, 300)
    if hit:
        return hit
    if demo:
        rnd = random.Random(int(time.time() // 86400))
        res = {"updated": int(time.time()), "flow": {}, "fund": {}}
        for s in symbols:
            if s in INDEXES:
                continue
            nets = [round(rnd.gauss(0, 8), 2) for _ in range(20)]
            res["flow"][s] = {"hist": [[f"d{i}", v] for i, v in enumerate(nets)], "today": {"date": _vn_today(), "buy": 10, "sell": 10 - nets[-1], "net": nets[-1], "room": None},
                              "net5": round(sum(nets[-5:]), 2), "net20": round(sum(nets), 2), "days": 20}
            res["fund"][s] = {"q": "Q3/2026", "pe": round(rnd.uniform(5, 25), 1), "pb": round(rnd.uniform(0.8, 4), 2), "roe": round(rnd.uniform(5, 28), 1),
                              "roa": round(rnd.uniform(1, 12), 1), "gm": 25.0, "npm": 10.0, "de": 0.8, "mc": 20000, "dy": 2.0, "npGrowth": round(rnd.uniform(-40, 60), 1), "ps": 1.2}
        cache_set(key, res)
        return res
    global _flow_mem
    _flow_mem = merge_flow(_flow_mem, foreign_today(symbols))
    fund = {}
    with ThreadPoolExecutor(max_workers=4) as ex:
        for s, f in zip(symbols, ex.map(lambda x: _safe(fundamentals, x), symbols)):
            if f and s not in INDEXES:
                fund[s] = f
    res = {"updated": int(time.time()), "flow": {k: v for k, v in _flow_mem.items() if k in symbols}, "fund": fund}
    cache_set(key, res)
    return res


def _safe(fn, *a):
    try:
        return fn(*a)
    except Exception:  # noqa: BLE001
        return None


# ------------------------------- HTTP --------------------------------------

_rate = {}
_rate_lock = threading.Lock()


def rate_ok(key):
    """Giới hạn tốc độ trong bộ nhớ (không ghi ra đĩa), chống bị gọi dồn làm nguồn dữ liệu chặn."""
    now = time.time()
    with _rate_lock:
        if len(_rate) > 5000:
            _rate.clear()
        win, cnt = _rate.get(key, (now, 0))
        if now - win >= 60:
            win, cnt = now, 0
        cnt += 1
        _rate[key] = (win, cnt)
        return cnt <= RATE_PER_MIN


class Handler(SimpleHTTPRequestHandler):
    server_version = "VXT"
    sys_version = ""

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=STATIC, **kw)

    def log_message(self, fmt, *args):
        if ACCESS_LOG:
            sys.stderr.write("  " + (fmt % args) + "\n")

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        super().end_headers()

    def client_key(self):
        fwd = self.headers.get("X-Forwarded-For", "")
        return (fwd.split(",")[0].strip() if fwd else self.client_address[0])

    def authorized(self):
        if not PASSWORD:
            return True
        h = self.headers.get("Authorization", "")
        if h.startswith("Basic "):
            try:
                pw = base64.b64decode(h[6:]).decode("utf-8").split(":", 1)[1]
                return hmac.compare_digest(pw.encode(), PASSWORD.encode())
            except Exception:  # noqa: BLE001
                return False
        return False

    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/healthz":
            return self.send_json({"ok": True})
        if not self.authorized():
            self.send_response(401)
            self.send_header("WWW-Authenticate", 'Basic realm="VXT Chung Khoan", charset="UTF-8"')
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if u.path.startswith("/api/") and not rate_ok(self.client_key()):
            return self.send_json({"error": "Gọi quá nhanh, thử lại sau ít giây"}, 429)
        q = urllib.parse.parse_qs(u.query)
        demo = q.get("demo", ["0"])[0] == "1"
        if u.path == "/api/history":
            sym = q.get("symbol", [""])[0].upper().strip()
            if not SYMBOL_RE.match(sym):
                return self.send_json({"error": "Mã không hợp lệ"}, 400)
            try:
                days = max(60, min(2000, int(q.get("days", ["520"])[0])))
            except ValueError:
                days = 520
            try:
                return self.send_json(get_history(sym, days, demo))
            except Exception as e:  # noqa: BLE001
                return self.send_json({"error": str(e)}, 502)
        if u.path == "/api/news":
            try:
                return self.send_json(get_news(demo))
            except Exception as e:  # noqa: BLE001
                return self.send_json({"items": [], "errors": [str(e)]}, 502)
        if u.path == "/api/extra":
            syms = [x for x in q.get("symbols", [""])[0].upper().split(",") if SYMBOL_RE.match(x)][:150]
            try:
                return self.send_json(get_extra(syms, demo))
            except Exception as e:  # noqa: BLE001
                return self.send_json({"error": str(e)}, 502)
        if u.path == "/api/ping":
            return self.send_json({"ok": True, "time": int(time.time())})
        return super().do_GET()


def main():
    ap = argparse.ArgumentParser(description="VXT Chứng Khoán")
    ap.add_argument("--host", default=HOST, help="127.0.0.1 = chỉ máy này; 0.0.0.0 = mở cho mạng ngoài (VPS)")
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()
    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    srv.daemon_threads = True
    shown = "127.0.0.1" if args.host in ("0.0.0.0", "::") else args.host
    url = f"http://{shown}:{args.port}/"
    print("=" * 60)
    print("  VXT Chứng Khoán đang chạy tại:", url)
    if args.host in ("0.0.0.0", "::"):
        print("  Đang mở cho mạng ngoài." + ("" if PASSWORD else "  CẢNH BÁO: chưa đặt VXT_PASSWORD!"))
    print("  Đóng cửa sổ này (hoặc Ctrl+C) để tắt.")
    print("=" * 60, flush=True)
    if not args.no_browser and args.host in ("127.0.0.1", "localhost"):
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
