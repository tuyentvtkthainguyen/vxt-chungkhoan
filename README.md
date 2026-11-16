# VXT Chứng Khoán

Quét mã cổ phiếu Việt Nam, tổng hợp tin tức, chấm điểm kỹ thuật và gợi ý điểm vào – ra (vùng mua, cắt lỗ, mục tiêu).

> Công cụ hỗ trợ phân tích kỹ thuật, **không phải khuyến nghị đầu tư**.
> Không tài khoản, không theo dõi, không thu thập dữ liệu người dùng.

## Ba cách dùng

| Cách | Link truy cập | Dữ liệu |
|---|---|---|
| **GitHub Pages** (không cần máy chủ) | `https://tuyentvtkthainguyen.github.io/vxt-chungkhoan/` | GitHub Actions tự lấy giá + tin mỗi 15 phút trong giờ giao dịch |
| **Máy tính cá nhân** | `http://127.0.0.1:8686` | Trực tiếp, mỗi lần bấm Quét |
| **VPS** | tên miền / IP của bạn | Trực tiếp, có khóa mật khẩu |

### 1. GitHub Pages
- Kho này có workflow `.github/workflows/cap-nhat-du-lieu.yml`, chạy 9:00–15:00 giờ VN (thứ 2–6) mỗi 15 phút, sau giờ đóng cửa và sáng thứ 7.
- Lần đầu: **Settings → Pages → Source: GitHub Actions**, sau đó **Actions → Cập nhật dữ liệu & xuất bản trang → Run workflow**.
- Muốn theo dõi thêm mã: sửa `watchlist.txt` rồi Commit.
- GitHub có thể chạy lịch trễ vài phút đến vài chục phút lúc đông; đây là dữ liệu tham khảo, không phải bảng giá thời gian thực.
- Máy chủ GitHub đặt ở nước ngoài; nếu nguồn dữ liệu VN chặn, tab Actions sẽ báo lỗi – khi đó dùng cách 2 hoặc 3.

### 2. Máy tính cá nhân
Cài Python 3.8+, chạy `CHAY_WINDOWS.bat` (Windows) hoặc `./chay_mac_linux.sh`.

### 3. VPS
`sudo bash deploy/cai_dat_vps.sh ck.tenmien.vn` – xem `HUONG_DAN.txt`. Có `Dockerfile` / `docker-compose.yml`.

## Cấu trúc
```
server.py              máy chủ (lấy giá VNDirect → TCBS → SSI, tin RSS), chỉ dùng thư viện chuẩn Python
static/                giao diện: analysis.js (chỉ báo, chấm điểm), app.js (UI), index.html, style.css
pages/pages.js         bộ đọc dữ liệu JSON cho bản GitHub Pages
scripts/               build_site.py (tạo trang tĩnh), fetch_data.py (lấy dữ liệu ra JSON)
watchlist.txt          danh sách mã GitHub tự cập nhật
deploy/                script cài VPS, systemd, nginx
```

## Cách chấm điểm (tóm tắt)
Xu hướng EMA20/50/200 · MACD · RSI14 · bứt phá/thủng đỉnh-đáy 20 phiên kèm khối lượng · không mua đuổi khi giá cách EMA20 > 2,5 ATR.
Điểm ≥ 5: MUA · 3–4: MUA THĂM DÒ · −2…2: THEO DÕI · ≤ −3: BÁN/ĐỨNG NGOÀI.
Cắt lỗ theo ATR/đáy gần (tối đa ~8%), mục tiêu theo kháng cự và tỷ lệ R, làm tròn theo bước giá HOSE/HNX.
