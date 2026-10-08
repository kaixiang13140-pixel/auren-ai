#!/usr/bin/env python3
"""Collect publicly available Google Trends trending-search RSS for US and MY.
These are SEARCH TOPICS, not product sales or verified product listings.
"""
import json
import os
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

OUTPUT = Path("data/trending_searches.json")
NS = {"ht": "https://trends.google.com/trending/rss"}

def fetch_market_once(market):
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

def fetch_market(market):
    for attempt in range(3):
        try:
            return fetch_market_once(market)
        except (urllib.error.URLError, OSError, ET.ParseError, RuntimeError):
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def collect(previous, now):
    all_items, statuses = [], []
    old = {(x["market"], x["keyword"]): x for x in previous.get("items", [])}
    successes = 0
    for market in ("US", "MY"):
        try:
            records = fetch_market(market)
            successes += 1
            for item in records:
                prior = old.get((market, item["keyword"]), {})
                item.update(freshness="fresh", observed_at=now,
                            first_seen_at=prior.get("first_seen_at", now),
                            previous_approx_search_traffic=prior.get("approx_search_traffic"),
                            trend_analysis="RSS snapshot only; traffic estimates are not comparable sales or demand")
            statuses.append({"market": market, "status": "ok", "received": len(records)})
        except (urllib.error.URLError, OSError, ET.ParseError, RuntimeError) as exc:
            records = [{**x, "freshness": "stale"} for x in previous.get("items", []) if x["market"] == market]
            statuses.append({"market": market, "status": "error", "message": str(exc)[:180], "retained": len(records)})
        all_items.extend(records)
    if not successes:
        raise RuntimeError("All trend sources failed; preserving previous output")
    return {"generated_at": now, "source": "Google Trends public trending searches RSS",
            "disclaimer": "Search trends only. Not sales, GMV, or verified product demand.",
            "markets": ["US", "MY"], "sources": statuses, "items": all_items}


def main():
    now = datetime.now(timezone.utc).isoformat()
    previous = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {}
    result = collect(previous, now)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temp = OUTPUT.with_suffix(".tmp")
    temp.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp, OUTPUT)
    print(f"Saved {len(result['items'])} RSS entries to {OUTPUT}")

if __name__ == "__main__":
    main()
