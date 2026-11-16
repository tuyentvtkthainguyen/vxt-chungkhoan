#!/usr/bin/env python3
"""Tạo trang tĩnh cho GitHub Pages từ static/ + pages/pages.js. Cách dùng: python scripts/build_site.py <thư_mục_site>"""
import os, shutil, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "site")
os.makedirs(out, exist_ok=True)
for f in ("style.css", "analysis.js", "app.js"):
    shutil.copy(os.path.join(ROOT, "static", f), out)
shutil.copy(os.path.join(ROOT, "pages", "pages.js"), out)
html = open(os.path.join(ROOT, "static", "index.html"), encoding="utf-8").read()
html = html.replace('<script src="app.js"></script>', '<script src="pages.js"></script>\n<script src="app.js"></script>')
html = html.replace('<main>', '<div id="dataInfo" class="muted small" style="padding:6px 16px;max-width:1400px;margin:0 auto">Đang tải thông tin dữ liệu…</div>\n<main>', 1)
html = html.replace("dữ liệu: VNDirect / TCBS / SSI (tự chuyển nguồn)", "dữ liệu tự cập nhật bằng GitHub Actions từ VNDirect / TCBS / SSI")
open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(html)
open(os.path.join(out, ".nojekyll"), "w").close()
print("Đã tạo", out)
