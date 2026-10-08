#!/usr/bin/env python3
"""Collect publicly available Google Trends trending-search RSS for US and MY.
These are SEARCH TOPICS, not product sales or verified product listings.
"""
import json
import os
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

OUTPUT = Path("data/trending_searches.json")
NS = {"ht": "https://trends.google.com/trending/rss"}

def fetch_market(market):
    url = "https://trends.google.com/trending/rss?geo=" + market
    request = urllib.request.Request(url, headers={
        "User-Agent": "AUREN-AI-Trends/1.0 (public RSS research)",
        "Accept": "application/rss+xml, application/xml, text/xml"
    })
    with urllib.request.urlopen(request, timeout=25) as response:
        root = ET.fromstring(response.read())
    items = []
    for item in root.findall("./channel/item"):
        title = (item.findtext("title") or "").strip()
        if not title:
            continue
        traffic = item.findtext("ht:approx_traffic", default=None, namespaces=NS)
        items.append({
            "market": market,
            "keyword": title,
            "approx_search_traffic": traffic,
            "published_at": item.findtext("pubDate"),
            "source_platform": "Google Trends",
            "source_url": url,
            "data_type": "trending_search_keyword",
            "is_product": False,
            "sales": None
        })
    if not items:
        raise RuntimeError(f"No RSS trend items found for {market}; refusing to publish empty data")
    return items

def main():
    now = datetime.now(timezone.utc).isoformat()
    all_items = []
    for market in ("US", "MY"):
        records = fetch_market(market)
        print(f"{market}: {len(records)} search trends")
        all_items.extend(records)
    result = {
        "generated_at": now,
        "source": "Google Trends public trending searches RSS",
        "disclaimer": "Search trends only. Not TikTok Shop products, sales, GMV, or verified demand.",
        "markets": ["US", "MY"],
        "items": all_items
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temp = OUTPUT.with_suffix(".tmp")
    temp.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp, OUTPUT)
    print(f"Saved {len(all_items)} verified RSS entries to {OUTPUT}")

if __name__ == "__main__":
    main()
