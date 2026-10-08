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
