#!/usr/bin/env python3
"""AUREN AI: discover factual catalog records from free, open product databases.

IMPORTANT: These are community-contributed PRODUCT RECORDS, not marketplace
listings, verified sourcing opportunities, search trends, sales or GMV.
Do not label unknown-market products as available in US/MY.
The extracted/combined open-data catalog is attributed and shared under ODbL.
"""
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

OUTPUT = Path("data/product_candidates.json")
LICENSE_URL = "https://opendatacommons.org/licenses/odbl/1-0/"
FIELDS = "code,product_name,product_name_en,brands,categories_tags,countries_tags,image_front_url,last_modified_t"
SOURCES = [
    {"key": "opf_jewelry", "name": "Open Products Facts", "host": "world.openproductsfacts.org",
     "params": {"categories_tags": "en:jewellery"}, "fallback_category": "Other", "page_size": 70},
    {"key": "opf_general", "name": "Open Products Facts", "host": "world.openproductsfacts.org",
     "params": {}, "fallback_category": "Other", "page_size": 100},
    {"key": "obf", "name": "Open Beauty Facts", "host": "world.openbeautyfacts.org",
     "params": {}, "fallback_category": "Beauty & Personal Care", "page_size": 75},
    {"key": "opf_pet", "name": "Open Pet Food Facts", "host": "world.openpetfoodfacts.org",
     "params": {}, "fallback_category": "Pet Supplies", "page_size": 45},
    {"key": "off", "name": "Open Food Facts", "host": "world.openfoodfacts.org",
     "params": {}, "fallback_category": "Food & Beverage", "page_size": 45},
]
CATEGORY_RULES = [
    ("Jewelry & Accessories", r"\b(jewell?ery|jewel|bracelets?|necklaces?|earrings?|pendants?|rings?|brooches?|watches?|sunglasses?|accessories)\b|手链|首饰|项链|戒指|耳环|饰品"),
    ("Beauty & Personal Care", r"\b(makeup|cosmetics?|skincare|skin care|serums?|shampoo|lipsticks?|perfumes?|deodorants?|cleansers?|moisturizers?|toothpaste|beauty)\b|护肤|美妆"),
    ("Pet Supplies", r"\b(pets?|cats?|dogs?|pupp(y|ies)|kittens?|pet food|pet care|aquarium)\b"),
    ("Electronics", r"\b(electronics?|headphones?|earbuds?|chargers?|smartphones?|speakers?|cameras?|laptops?|power banks?|usb)\b"),
    ("Home & Living", r"\b(furniture|home decor|bedding|pillows?|lamps?|storage|household|mattress)\b"),
    ("Kitchen", r"\b(kitchen|cookware|utensils?|knives|cutlery|tableware|mugs?|bottles?|cups?)\b"),
    ("Fitness & Sports", r"\b(fitness|sports?|yoga|gym|cycling|running shoes|exercise|training)\b"),
    ("Automotive", r"\b(automotive|vehicle|car parts?|motorcycle|tires?|dashcam)\b"),
    ("Fashion", r"\b(clothing|fashion|dresses?|shirts?|jeans|skirts?|trousers?|bags?|handbags?|shoes?|sneakers?)\b"),
    ("Food & Beverage", r"\b(food|drinks?|beverages?|snacks?|chocolate|sweets?|coffee|tea|biscuits?|cereal)\b"),
]

def classify(name, tags, fallback):
    tokens = " ".join(str(x).replace("en:", "").replace("-", " ") for x in tags)
    text = (name + " " + tokens).lower()
    for category, pattern in CATEGORY_RULES:
        if re.search(pattern, text, flags=re.IGNORECASE):
            return category
    return fallback

def market_tags(tags):
    tags = [str(t).lower() for t in tags]
    markets = []
    if any(t in ("en:united-states", "en:united-states-of-america", "en:usa") for t in tags):
        markets.append("US")
    if "en:malaysia" in tags:
        markets.append("MY")
    return markets

def normalize_product(spec, product, previous, now):
    code = str(product.get("code") or "").strip()
    if not re.fullmatch(r"[0-9A-Za-z]{6,28}", code):
        return None
    name = (product.get("product_name_en") or product.get("product_name") or "").strip()
    if len(name) < 3 or name.lower() in ("unknown", "product", "produit", "none"):
        return None
    name = name[:180]
    brand = str(product.get("brands") or "").strip()[:120]
    tags = product.get("categories_tags") or []
    countries = product.get("countries_tags") or []
    if not isinstance(tags, list):
        tags = []
    if not isinstance(countries, list):
        countries = []
    image_url = str(product.get("image_front_url") or "")
    if not image_url.startswith("https://"):
        image_url = None
    markets = market_tags(countries)
    item_id = spec["host"] + ":" + code
    old = previous.get(item_id, {})
    score = 35 + (20 if brand else 0) + (20 if image_url else 0) + (15 if tags else 0) + (10 if markets else 0)
    return {
        "id": item_id,
        "product_name": name,
        "brand": brand or None,
        "category": classify(name, tags, spec["fallback_category"]),
        "image_url": image_url,
        "source_platform": spec["name"],
        "source_url": "https://" + spec["host"] + "/product/" + urllib.parse.quote(code),
        "source_record": "open_product_catalog",
        "market_tags": markets,
        "market_status": "catalog_country_tag_only" if markets else "not_verified",
        "data_completeness_score": score,
        "catalog_last_modified": product.get("last_modified_t"),
        "first_seen_at": old.get("first_seen_at") or now,
        "last_seen_at": now,
        "days_observed": int(old.get("days_observed") or 0) + 1,
        "price": None,
        "seller": None,
        "sales": None,
        "gmv": None,
        "trend_growth": None,
    }

def fetch_source(spec):
    """Retry transient upstream failures and then try a smaller API request.

    Open community datasets are best-effort. Retries never invent records.
    """
    sizes = [spec["page_size"], min(spec["page_size"], 20)]
    last_error = None
    for variant, size in enumerate(sizes):
        params = {"fields": FIELDS, "page_size": str(size)}
        if variant == 0:
            params["sort_by"] = "last_modified_t"
        params.update(spec["params"])
        url = "https://" + spec["host"] + "/api/v2/search?" + urllib.parse.urlencode(params)
        for attempt in range(2):
            request = urllib.request.Request(url, headers={
                "User-Agent": "AUREN-AI/1.1 (public research; https://github.com/kaixiang13140-pixel/auren-ai)",
                "Accept": "application/json",
            })
            try:
                with urllib.request.urlopen(request, timeout=20) as response:
                    data = json.load(response)
                products = data.get("products")
                if not isinstance(products, list):
                    raise ValueError("Search API did not return a products list")
                return products
            except urllib.error.HTTPError as exc:
                last_error = exc
                if exc.code < 500 and exc.code != 429:
                    raise
            except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
                last_error = exc
            print(f"{spec['key']}: upstream failure, variant={variant}, attempt={attempt + 1}: {last_error}")
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"All upstream API attempts failed: {last_error}")

def load_previous():
    if not OUTPUT.exists():
        return {}
    try:
        old = json.loads(OUTPUT.read_text(encoding="utf-8"))
        return {x["id"]: x for x in old.get("products", []) if isinstance(x, dict) and x.get("id")}
    except (ValueError, OSError):
        return {}

def main():
    now = datetime.now(timezone.utc).isoformat()
    previous = load_previous()
    products = {}
    statuses = []
    for index, spec in enumerate(SOURCES):
        if index:
            time.sleep(1)
        try:
            raw = fetch_source(spec)
            accepted = 0
            for item in raw:
                if not isinstance(item, dict):
                    continue
                product = normalize_product(spec, item, previous, now)
                if not product:
                    continue
                if product["id"] not in products:
                    accepted += 1
                    products[product["id"]] = product
            statuses.append({"source": spec["name"], "collection": spec["key"], "status": "ok",
                             "received": len(raw), "accepted": accepted})
            print(spec["key"], "received", len(raw), "accepted", accepted)
        except (urllib.error.URLError, TimeoutError, ValueError, OSError, RuntimeError) as exc:
            statuses.append({"source": spec["name"], "collection": spec["key"],
                             "status": "error", "message": str(exc)[:180]})
            print(spec["key"], "ERROR:", str(exc)[:180])
    if not products:
        raise RuntimeError("No verified source records received. Preserving previous output; no fabricated products.")
    ordered = sorted(products.values(), key=lambda p: (
        p["category"] != "Jewelry & Accessories",
        -p["data_completeness_score"],
        -(int(p["catalog_last_modified"] or 0)),
        p["product_name"].lower(),
    ))[:280]
    payload = {
        "generated_at": now,
        "data_type": "open_catalog_product_records",
        "title": "Public product research candidates, not sales rankings",
        "disclaimer": "Catalog records are not verified for resale, US/MY availability, supplier price, sales, or demand. Completeness is not a product opportunity score.",
        "license": "Open Database License (ODbL) 1.0",
        "license_url": LICENSE_URL,
        "attribution": "Community-contributed product data from Open Products Facts, Open Beauty Facts, Open Pet Food Facts, and Open Food Facts (Open Food Facts community).",
        "sources": statuses,
        "products": ordered,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUTPUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, OUTPUT)
    print("Saved", len(ordered), "real catalog records to", OUTPUT)

if __name__ == "__main__":
    main()
