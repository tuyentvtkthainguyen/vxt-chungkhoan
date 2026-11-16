#!/usr/bin/env python3
"""Lấy giá + tin tức, ghi ra file JSON tĩnh cho GitHub Pages (chạy trong GitHub Actions hoặc trên máy bạn).
Cách dùng: python scripts/fetch_data.py <thư_mục_site>"""
import json, os, re, sys, time
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import server  # noqa: E402  dùng lại bộ lấy dữ liệu của server.py

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "site")
hist_dir = os.path.join(out, "data", "hist")
os.makedirs(hist_dir, exist_ok=True)

text = open(os.path.join(ROOT, "watchlist.txt"), encoding="utf-8").read()
text = "\n".join(l.split("#", 1)[0] for l in text.splitlines())
syms = list(dict.fromkeys(s for s in re.split(r"[\s,;]+", text.upper()) if server.SYMBOL_RE.match(s)))

ok, errors, sources = [], {}, {}


def job(sym):
    for attempt in range(2):
        try:
            r = server.get_history(sym, 760)
            rows = [[c["t"], c["o"], c["h"], c["l"], c["c"], round(c["v"])] for c in r["candles"]]
            with open(os.path.join(hist_dir, sym + ".json"), "w", encoding="utf-8") as f:
                json.dump({"s": sym, "src": r["source"], "d": rows}, f, separators=(",", ":"))
            return sym, r["source"], None
        except Exception as e:  # noqa: BLE001
            err = str(e)
            time.sleep(1.5)
    return sym, None, err


with ThreadPoolExecutor(max_workers=4) as ex:
    for sym, src, err in ex.map(job, syms):
        if err:
            errors[sym] = err
        else:
            ok.append(sym)
            sources[src] = sources.get(src, 0) + 1

# ---- Khối ngoại + cơ bản. Lịch sử khối ngoại được tích lũy qua từng lần chạy (đọc lại từ trang đã xuất bản). ----
prev = {}
repo = os.environ.get("GITHUB_REPOSITORY", "")
if "/" in repo:
    owner, name = repo.split("/", 1)
    try:
        prev = json.loads(server.http_get(f"https://{owner.lower()}.github.io/{name}/data/extra.json?t={int(time.time())}", timeout=20))
    except Exception as e:  # noqa: BLE001
        print("Chưa có extra.json cũ:", type(e).__name__)
today_vn = time.strftime("%Y-%m-%d", time.gmtime(time.time() + 7 * 3600))
ft = server.foreign_today(syms)
flow = server.merge_flow(prev.get("flow") or {}, ft)
fund = prev.get("fund") or {}
if prev.get("fund_date") != today_vn or not fund:
    stocks = [s for s in syms if s not in server.INDEXES]
    with ThreadPoolExecutor(max_workers=4) as ex:
        got = dict(zip(stocks, ex.map(lambda x: server._safe(server.fundamentals, x), stocks)))
    fund = {k: v for k, v in got.items() if v} or fund
    fund_date = today_vn if got and any(got.values()) else prev.get("fund_date")
else:
    fund_date = prev.get("fund_date")
extra = {"updated": int(time.time()), "flow": flow, "fund": fund, "fund_date": fund_date}
with open(os.path.join(out, "data", "extra.json"), "w", encoding="utf-8") as f:
    json.dump(extra, f, ensure_ascii=False, separators=(",", ":"))
print(f"Khối ngoại hôm nay: {len(ft)} mã | lịch sử tối đa {max((v['days'] for v in flow.values()), default=0)} phiên | Cơ bản: {len(fund)} mã ({fund_date})")
if "FPT" in fund:
    print("  FPT:", fund["FPT"], flow.get("FPT", {}).get("today"))

news = server.get_news()
with open(os.path.join(out, "data", "news.json"), "w", encoding="utf-8") as f:
    json.dump(news, f, ensure_ascii=False, separators=(",", ":"))

meta = {"updated": int(time.time()), "symbols": ok, "foreign": len(ft), "fund": len(fund), "failed": errors, "sources": sources,
        "news": len(news.get("items", [])), "news_errors": news.get("errors", [])}
with open(os.path.join(out, "data", "meta.json"), "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, indent=1)
print(f"Giá: {len(ok)}/{len(syms)} mã {sources} | Tin: {meta['news']} | Lỗi: {len(errors)}")
for k, v in list(errors.items())[:10]:
    print("  -", k, v)
if not ok:
    # vẫn xuất bản trang (hiện thông báo lỗi) nhưng đánh dấu cảnh báo trong tab Actions
    print("::error::Không lấy được mã nào - nguồn dữ liệu có thể đang chặn máy chủ GitHub.")
