#!/usr/bin/env bash
# Cài VXT Chứng Khoán lên VPS Ubuntu/Debian.
# Cách dùng (chạy bằng root, trong thư mục đã giải nén):
#   sudo bash deploy/cai_dat_vps.sh                     -> truy cập bằng http://IP-VPS
#   sudo bash deploy/cai_dat_vps.sh ck.tenmien.vn       -> có tên miền + HTTPS miễn phí (Let's Encrypt)
# Có thể đặt sẵn mật khẩu:  VXT_PASSWORD='matkhau' sudo -E bash deploy/cai_dat_vps.sh ck.tenmien.vn
set -euo pipefail
DOMAIN="${1:-}"
APP_DIR=/opt/vxt-chungkhoan
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$(id -u)" -ne 0 ]; then echo "Hãy chạy bằng sudo/root"; exit 1; fi
if [ -z "${VXT_PASSWORD:-}" ]; then
  read -r -s -p "Đặt mật khẩu đăng nhập trang (để trống = không khóa): " VXT_PASSWORD; echo
fi

echo ">> Cài gói cần thiết"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3 nginx ca-certificates
[ -n "$DOMAIN" ] && apt-get install -y certbot python3-certbot-nginx

echo ">> Chép ứng dụng vào $APP_DIR"
id -u vxt >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin vxt
mkdir -p "$APP_DIR"
cp -r "$SRC_DIR/server.py" "$SRC_DIR/static" "$APP_DIR/"
umask 077
printf 'VXT_PASSWORD=%s\nVXT_HOST=127.0.0.1\nVXT_PORT=8686\n' "$VXT_PASSWORD" > /etc/vxt-chungkhoan.env
chown -R root:root "$APP_DIR"; chmod -R a+rX "$APP_DIR"

echo ">> Tạo dịch vụ systemd (tự chạy lại khi lỗi / khởi động lại VPS)"
cp "$SRC_DIR/deploy/vxt-chungkhoan.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now vxt-chungkhoan
systemctl restart vxt-chungkhoan

echo ">> Cấu hình Nginx"
SERVER_NAME="${DOMAIN:-_}"
sed "s/__SERVER_NAME__/$SERVER_NAME/" "$SRC_DIR/deploy/nginx-vxt.conf" > /etc/nginx/sites-available/vxt-chungkhoan
ln -sf /etc/nginx/sites-available/vxt-chungkhoan /etc/nginx/sites-enabled/vxt-chungkhoan
[ -z "$DOMAIN" ] && rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q active; then
  ufw allow 'Nginx Full' || true
fi

if [ -n "$DOMAIN" ]; then
  echo ">> Xin chứng chỉ HTTPS cho $DOMAIN (tên miền phải trỏ về IP VPS này trước)"
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect || \
    echo "!! Chưa xin được HTTPS. Kiểm tra bản ghi DNS rồi chạy: certbot --nginx -d $DOMAIN"
fi

sleep 1
if curl -fsS http://127.0.0.1:8686/healthz >/dev/null; then echo ">> Ứng dụng đang chạy."; else echo "!! Ứng dụng chưa chạy: journalctl -u vxt-chungkhoan -n 50"; fi
IP=$(curl -fsS -4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
echo "=================================================="
if [ -n "$DOMAIN" ]; then echo "  Truy cập: https://$DOMAIN"; else echo "  Truy cập: http://$IP"; fi
[ -n "$VXT_PASSWORD" ] && echo "  Đăng nhập: tên bất kỳ + mật khẩu bạn vừa đặt"
echo "  Kiểm tra nguồn dữ liệu: curl 'http://127.0.0.1:8686/api/history?symbol=FPT&days=100' -u x:\$MATKHAU"
echo "=================================================="
