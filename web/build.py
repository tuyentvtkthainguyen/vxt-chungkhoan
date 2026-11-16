import base64, pathlib
R = pathlib.Path(__file__).resolve().parent.parent
st = R / "static"; w = R / "web"
html = (st / "index.html").read_text(encoding="utf-8")
css = (st / "style.css").read_text(encoding="utf-8") + (w / "extra.css").read_text(encoding="utf-8")
html = html.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + css + "</style>")
# tab
html = html.replace('<button data-tab="scan" class="active">Quét mã</button>',
  '<button data-tab="home" class="active">Trang chủ</button>\n  <button data-tab="scan">Quét mã</button>')
html = html.replace('<button data-tab="help">Hướng dẫn</button>',
  '<button data-tab="import">Nhập dữ liệu</button>\n  <button data-tab="help">Hướng dẫn</button>\n  <button data-tab="get">Tải bản đầy đủ</button>')
html = html.replace('<section id="tab-scan" class="tab active">', '<section id="tab-scan" class="tab">')
html = html.replace("<main>\n", "<main>\n" + (w / "extra.html").read_text(encoding="utf-8"), 1)
# tin tức: thêm liên kết nguồn cho bản web
html = html.replace('<div id="newsList"></div>', '''<p class="muted small">Bản web không tự tải tin trực tiếp (chỉ có tin mẫu). Đọc tin tại:
      <a href="https://cafef.vn/thi-truong-chung-khoan.chn">CafeF</a> ·
      <a href="https://vietstock.vn/chung-khoan.htm">Vietstock</a> ·
      <a href="https://vnexpress.net/kinh-doanh/chung-khoan">VnExpress</a> ·
      <a href="https://www.tinnhanhchungkhoan.vn/">Tin nhanh CK</a> — hoặc dùng bản đầy đủ để tự gom tin theo mã.</p>
    <div id="newsList"></div>''')
html = html.replace("dữ liệu: VNDirect / TCBS / SSI (tự chuyển nguồn)", "bản web: dữ liệu mẫu hoặc CSV bạn nhập")
zipb64 = base64.b64encode((R.parent / "VXT-ChungKhoan.zip").read_bytes()).decode()
scripts = ('<script type="application/octet-stream" id="zipdata">' + zipb64 + '</script>\n'
  "<script>\n" + (st / "analysis.js").read_text(encoding="utf-8") + "\n</script>\n"
  "<script>\n" + (w / "web.js").read_text(encoding="utf-8") + "\n</script>\n"
  "<script>\n" + (st / "app.js").read_text(encoding="utf-8") + "\n</script>")
html = html.replace('<script src="analysis.js"></script>\n<script src="app.js"></script>', scripts)
assert 'src="app.js"' not in html and 'id="tab-home"' in html
(R / "dist").mkdir(exist_ok=True)
(R / "dist" / "index.html").write_text(html, encoding="utf-8")
print(len(html))
