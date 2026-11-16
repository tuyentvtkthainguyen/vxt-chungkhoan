"""Dò cấu trúc dữ liệu (chạy trong GitHub Actions)."""
import json, sys, time, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server
now = int(time.time())
dmy = lambda d: time.strftime("%d/%m/%Y", time.gmtime(now - d*86400))
def J(url, ref): return json.loads(server.http_get(url, timeout=25, referer=ref))
try:
    d = J("https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/FPT/statistics-financial", "https://trading.vietcap.com.vn/")["data"]
    print("### VCI n=", len(d), "last keys/values:", json.dumps(d[-1])[:2500])
    print("### VCI order:", [(x.get("yearReport"), x.get("quarter")) for x in d[-6:]])
except Exception as e: print("### VCI FAIL", e)
try:
    d = J("https://iboard-query.ssi.com.vn/stock/group/VN30", "https://iboard.ssi.com.vn/")["data"][0]
    print("### SSI keys:", json.dumps({k: v for k, v in d.items() if "oreign" in k or k in ("matchedPrice","nmTotalTradedQty","nmTotalTradedValue","stockSymbol","lastMatchedPrice")}))
except Exception as e: print("### SSI FAIL", e)
for ps in (5000,):
    try:
        t=time.time(); d = J(f"https://s.cafef.vn/Ajax/PageNew/DataHistory/GDKhoiNgoai.ashx?Symbol=FPT&StartDate={dmy(35)}&EndDate={dmy(0)}&PageIndex=1&PageSize={ps}", "https://s.cafef.vn/")["Data"]
        rows = d["Data"]; dates = sorted({r["Ngay"] for r in rows})
        print(f"### CAFEF ps={ps} total={d['TotalCount']} got={len(rows)} dates={dates[:3]}..{dates[-3:]} n_dates={len(dates)} t={time.time()-t:.1f}s fpt={[r for r in rows if r['Symbol']=='FPT'][:2]}")
    except Exception as e: print("### CAFEF FAIL", e)
for q in ("symbol=FPT&type=0", "Symbol=FPT&Type=1", "symbol=FPT&PageIndex=1&PageSize=3&StartDate=&EndDate="):
    try:
        print("### TD", q, server.http_get("https://s.cafef.vn/Ajax/PageNew/DataHistory/GDTuDoanh.ashx?"+q, timeout=15, referer="https://s.cafef.vn/")[:300])
    except Exception as e: print("### TD FAIL", q, e)
