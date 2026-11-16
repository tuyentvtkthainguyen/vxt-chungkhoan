"""Dò thử các nguồn dữ liệu (chạy trong GitHub Actions) - in mã trạng thái và đoạn đầu phản hồi."""
import json, sys, time, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server
now = int(time.time()); d = time.strftime("%Y-%m-%d", time.gmtime(now - 60*86400)); t = time.strftime("%Y-%m-%d")
dmy0 = time.strftime("%d/%m/%Y", time.gmtime(now - 60*86400)); dmy1 = time.strftime("%d/%m/%Y")
C = [
 ("cafef_ngoai_sym", f"https://s.cafef.vn/Ajax/PageNew/DataHistory/GDKhoiNgoai.ashx?symbol=FPT&StartDate={dmy0}&EndDate={dmy1}&PageIndex=1&PageSize=3", "https://s.cafef.vn/"),
 ("cafef_ngoai_all", f"https://s.cafef.vn/Ajax/PageNew/DataHistory/GDKhoiNgoai.ashx?Symbol=&StartDate={dmy1}&EndDate={dmy1}&PageIndex=1&PageSize=3", "https://s.cafef.vn/"),
 ("cafef_tudoanh_sym", f"https://s.cafef.vn/Ajax/PageNew/DataHistory/GDTuDoanh.ashx?symbol=FPT&StartDate={dmy0}&EndDate={dmy1}&PageIndex=1&PageSize=3", "https://s.cafef.vn/"),
 ("cafef_tudoanh_all", f"https://s.cafef.vn/Ajax/PageNew/DataHistory/GDTuDoanh.ashx?symbol=all&StartDate={dmy0}&EndDate={dmy1}&PageIndex=1&PageSize=3", "https://s.cafef.vn/"),
 ("cafef_price", f"https://s.cafef.vn/Ajax/PageNew/DataHistory/PriceHistory.ashx?Symbol=FPT&StartDate={dmy0}&EndDate={dmy1}&PageIndex=1&PageSize=2", "https://s.cafef.vn/"),
 ("tcbs_ext_overview", "https://apiextaws.tcbs.com.vn/tcanalysis/v1/ticker/FPT/overview", "https://tcinvest.tcbs.com.vn/"),
 ("tcbs_ext_ratio", "https://apiextaws.tcbs.com.vn/tcanalysis/v1/finance/FPT/financialratio?yearly=0&isAll=false", "https://tcinvest.tcbs.com.vn/"),
 ("tcbs_ext_info", "https://apiextaws.tcbs.com.vn/tcanalysis/v1/ticker/FPT/stockratio", "https://tcinvest.tcbs.com.vn/"),
 ("kbs_ratio", "https://kbbuddywts.kbsec.com.vn/iis-server/investment/stockinfo/profile/FPT?l=1", "https://kbbuddy.kbsec.com.vn/"),
 ("kbs_snap", "https://kbbuddywts.kbsec.com.vn/iis-server/investment/stock/search/data", "https://kbbuddy.kbsec.com.vn/"),
 ("vci_stat", "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/FPT/statistics-financial", "https://trading.vietcap.com.vn/"),
 ("vci_ratio", "https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/FPT/financial-statement/metrics", "https://trading.vietcap.com.vn/"),
 ("ssi_stock", "https://iboard-query.ssi.com.vn/stock/FPT", "https://iboard.ssi.com.vn/"),
 ("ssi_group", "https://iboard-query.ssi.com.vn/stock/group/VN30", "https://iboard.ssi.com.vn/"),
 ("cafef_cs", "https://s.cafef.vn/Ajax/PageNew/ChiSoTaiChinh.ashx?symbol=FPT", "https://s.cafef.vn/"),
 ("cafef_ctck", "https://cafef.vn/du-lieu/Ajax/PageNew/FinanceRatio.ashx?Symbol=FPT", "https://cafef.vn/"),
 ("vs_cotuc", "https://vietstock.vn/738/chung-khoan/co-tuc.rss", None),
 ("vs_lich", "https://vietstock.vn/1636/chung-khoan/lich-su-kien.rss", None),
 ("vs_bctc", "https://vietstock.vn/737/doanh-nghiep/hoat-dong-kinh-doanh.rss", None),
 ("vs_kqkd", "https://vietstock.vn/4223/doanh-nghiep/ket-qua-kinh-doanh.rss", None),
 ("hose_news", "https://www.hsx.vn/Modules/CMS/Web/LoadArticles?exclude=00000000-0000-0000-0000-000000000000&id=0b4fd640-8aba-4aac-8d51-3a8a1d5a7c3c&pageFieldName1=FromDate&pageFieldValue1=&pageFieldOperator1=eq&pageCriteriaLength=0&_search=false&rows=5&page=1", "https://www.hsx.vn/"),
]
for name, url, ref in C:
    try:
        raw = server.http_get(url, timeout=15, referer=ref)
        txt = raw.decode("utf-8", "replace")
        print(f"### {name} OK {len(raw)}B :: {txt[:900]!r}")
    except Exception as e:
        code = getattr(e, "code", "")
        print(f"### {name} FAIL {type(e).__name__} {code} {str(e)[:120]}")
