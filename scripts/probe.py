"""Dò thử các nguồn dữ liệu (chạy trong GitHub Actions) - in mã trạng thái và đoạn đầu phản hồi."""
import json, sys, time, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server
now = int(time.time()); d = time.strftime("%Y-%m-%d", time.gmtime(now - 60*86400)); t = time.strftime("%Y-%m-%d")
dmy0 = time.strftime("%d/%m/%Y", time.gmtime(now - 60*86400)); dmy1 = time.strftime("%d/%m/%Y")
C = [
 ("vnd_foreign", "https://finfo-api.vndirect.com.vn/v4/foreigns?q=code:FPT&sort=tradingDate:desc&size=5", "https://dstock.vndirect.com.vn/"),
 ("vnd_ratios", "https://finfo-api.vndirect.com.vn/v4/ratios/latest?filter=ratioCode:MARKETCAP,PRICE_TO_EARNINGS,PRICE_TO_BOOK,ROAE_TR_AVG5Q,EPS_TR&where=code:FPT&order=reportDate&fields=ratioCode,value", "https://dstock.vndirect.com.vn/"),
 ("vnd_events", "https://finfo-api.vndirect.com.vn/v4/events?q=code:FPT&sort=disclosureDate:desc&size=5", "https://dstock.vndirect.com.vn/"),
 ("vnd_news", "https://finfo-api.vndirect.com.vn/v4/news?q=code:FPT~newsType:disclosure&sort=newsDate:desc~newsTime:desc&size=5", "https://dstock.vndirect.com.vn/"),
 ("vnd_proprietary", "https://finfo-api.vndirect.com.vn/v4/proprietary_trading?q=code:FPT&sort=date:desc&size=5", "https://dstock.vndirect.com.vn/"),
 ("tcbs_overview", "https://apipubaws.tcbs.com.vn/tcanalysis/v1/ticker/FPT/overview", "https://tcinvest.tcbs.com.vn/"),
 ("tcbs_ratio", "https://apipubaws.tcbs.com.vn/tcanalysis/v1/finance/FPT/financialratio?yearly=0&isAll=false", "https://tcinvest.tcbs.com.vn/"),
 ("tcbs_foreign", "https://apipubaws.tcbs.com.vn/stock-insight/v1/stock/FPT/foreigner-trading?page=0&size=5", "https://tcinvest.tcbs.com.vn/"),
 ("tcbs_events", "https://apipubaws.tcbs.com.vn/tcanalysis/v1/ticker/FPT/events-news?page=0&size=5", "https://tcinvest.tcbs.com.vn/"),
 ("tcbs_news", "https://apipubaws.tcbs.com.vn/tcanalysis/v1/ticker/FPT/activity-news?page=0&size=5", "https://tcinvest.tcbs.com.vn/"),
 ("cafef_ngoai", f"https://s.cafef.vn/Ajax/PageNew/DataHistory/GDKhoiNgoai.ashx?Symbol=FPT&StartDate={dmy0}&EndDate={dmy1}&PageIndex=1&PageSize=5", "https://s.cafef.vn/"),
 ("cafef_tudoanh", f"https://s.cafef.vn/Ajax/PageNew/DataHistory/GDTuDoanh.ashx?Symbol=FPT&StartDate={dmy0}&EndDate={dmy1}&PageIndex=1&PageSize=5", "https://s.cafef.vn/"),
 ("ssi_foreign", "https://iboard-query.ssi.com.vn/v2/stock/FPT", "https://iboard.ssi.com.vn/"),
 ("hnx_rss", "https://www.hnx.vn/rss/tin-tuc-cong-bo-thong-tin.rss", None),
 ("ssc_rss", "https://ssc.gov.vn/webcenter/portal/ubck/pages_r/rss", None),
 ("vietstock_cbtt", "https://vietstock.vn/739/chung-khoan/thong-tin-cong-bo.rss", None),
 ("cafef_cbtt", "https://cafef.vn/thi-truong-chung-khoan/thong-tin-cong-bo.rss", None),
]
for name, url, ref in C:
    try:
        raw = server.http_get(url, timeout=15, referer=ref)
        txt = raw.decode("utf-8", "replace")
        print(f"### {name} OK {len(raw)}B :: {txt[:900]!r}")
    except Exception as e:
        code = getattr(e, "code", "")
        print(f"### {name} FAIL {type(e).__name__} {code} {str(e)[:120]}")
