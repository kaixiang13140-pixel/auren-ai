# AUREN AI

RM0 public-data research dashboard for US / MY. Python 3.12 collectors use the standard library; no paid APIs or Python packages are required. Existing Supabase login, watchlist, CSV export and user-entered profit calculator are preserved.

## Development

```sh
python3 -m unittest discover -s tests -v
python3 scripts/collect_trends.py
python3 scripts/collect_candidates.py
python3 -m http.server 8000 --bind 127.0.0.1
```

The dashboard reads `data/*.json`. Supabase authentication requires your existing project URL, publishable key, administrator account and RLS configuration; never use a service-role key in the browser.

## Evidence and limitations

Products are community catalog records, not verified suppliers or Shopify listings. Jewelry category discovery is prioritized, but free catalogs may have few jewelry records. Country tags do not prove shipping availability. Prices, sales, GMV and product trend growth stay unknown. Research priority is 60% completeness + 20 points for jewelry + 20 for US/MY catalog country evidence. It is a manual-review priority, not an opportunity or profitability prediction.

Google Trends RSS supplies search topics and approximate traffic strings. The last observed traffic string is retained for context; snapshots have no common measurement window, so no growth percentage is calculated. Cached market/product records are labeled stale and retain their original observation time when their source fails. All-source failure preserves the entire previous output and fails visibly.

The daily GitHub Action tests first, runs both collectors independently, commits successful updates, and reports failed collectors afterward. GitHub Pages must already serve the repository branch for committed JSON to update the website; this workflow does not sync catalogs into Supabase or publish products to Shopify.

Required outbound hosts: trends.google.com, world.openproductsfacts.org, world.openbeautyfacts.org, world.openpetfoodfacts.org, world.openfoodfacts.org. Browser login also needs esm.sh and your project's Supabase host.

## Product research interface and sales charts

The public research dashboard includes filtering, pagination and product details. It loads without Supabase credentials; the private database, favorites and CSV export retain admin authentication. The layout is an independent AUREN AI implementation inspired by product analytics dashboards; it is not a verified pixel-for-pixel Kalodata reproduction.

Open catalogs currently do not provide verified prices or sales. They display unknown values. Existing Supabase `products.price` / `currency` fields remain visible in the private table. Sales charts use imported observations only, with gaps for missing dates. A product in an order file is not automatically matched to a community catalog product by name.

Import an English Shopify Orders CSV, or download the header-only daily summary template in the UI. Daily summary columns: `date,product_id,product_name,market,currency,price,units,source`. Use a stable product identifier, a US/MY market, a three-letter currency code, a nonnegative unit price and integer daily units; one row per product/market/currency/date. Unknown units must not be entered as zero.

Shopify imports require `Name`, `Created at`, `Currency`, `Financial Status`, `Lineitem quantity`, `Lineitem name`, `Lineitem price`, `Shipping Country`, and `Cancelled at`; SKU is preferred, with line-item name as the fallback identity. Include complete orders and deduplicate the export before importing. Only paid, uncancelled US/MY order lines are included. Refunded, partially refunded and other statuses are excluded, so totals are not accounting net sales. The price shown is the last imported order-line price for the latest recorded date, before discounts; it is not a current supplier offer. Dates retain the source date rather than converting timezones. Currency and markets are never combined.

CSV files are processed in browser memory only, never uploaded or committed; imports replace the previous dataset and are cleared on page refresh. Customer metadata is not retained in normalized records. Limits: 10 MB and 20,000 data rows. The recent 30/90 day window ends at each product's last observed date, with no assumptions about unobserved days. No Shopify account connection or automatic order synchronization is configured.

Run frontend logic checks with `node --test tests/analytics.test.mjs` (Node 22+). Browser smoke tests can be run with `python3 tests/browser_smoke.py` when Playwright and Chromium are installed; the test uses synthetic test-only orders and mocked Supabase responses, not production credentials.
