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

news = server.get_news()
with open(os.path.join(out, "data", "news.json"), "w", encoding="utf-8") as f:
    json.dump(news, f, ensure_ascii=False, separators=(",", ":"))

meta = {"updated": int(time.time()), "symbols": ok, "failed": errors, "sources": sources,
        "news": len(news.get("items", [])), "news_errors": news.get("errors", [])}
with open(os.path.join(out, "data", "meta.json"), "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, indent=1)
print(f"Giá: {len(ok)}/{len(syms)} mã {sources} | Tin: {meta['news']} | Lỗi: {len(errors)}")
for k, v in list(errors.items())[:10]:
    print("  -", k, v)
if not ok:
    # vẫn xuất bản trang (hiện thông báo lỗi) nhưng đánh dấu cảnh báo trong tab Actions
    print("::error::Không lấy được mã nào - nguồn dữ liệu có thể đang chặn máy chủ GitHub.")
