"""Official AWS prices from the public Price List API (no credentials needed).

    python3 aws_price.py services                       # all service codes (AmazonEC2, AmazonRDS, AWSELB, ...)
    python3 aws_price.py regions AmazonRDS              # regions where the service has a price file
    python3 aws_price.py fetch AmazonRDS ap-southeast-7 [--out DIR]   # → DIR/AmazonRDS_ap-southeast-7.json
    python3 aws_price.py query DIR/AmazonRDS_ap-southeast-7.json \
        --attr instanceType=db.m7g.large --attr databaseEngine=PostgreSQL --attr deploymentOption=Single-AZ
    python3 aws_price.py query FILE --family "NAT Gateway"
    python3 aws_price.py query FILE --usagetype "Requests-Tier1$" --show-attrs

Each result line: usagetype | unit | USD per unit | range | description. The publication date is
printed first: write it next to every price you use ("AWS Price List, published YYYY-MM-DD").
EC2 region files are large (100+ MB): fetch once, then query the file as often as needed.
"""
import argparse
import json
import os
import re
import sys
import urllib.request

BASE = "https://pricing.us-east-1.amazonaws.com"


def get(url):
    with urllib.request.urlopen(url, timeout=300) as r:
        return r.read()


def cmd_services(_):
    idx = json.loads(get(f"{BASE}/offers/v1.0/aws/index.json"))
    for code in sorted(idx["offers"]):
        print(code)


def cmd_regions(a):
    idx = json.loads(get(f"{BASE}/offers/v1.0/aws/{a.service}/current/region_index.json"))
    for r in sorted(idx["regions"]):
        print(r)


def cmd_fetch(a):
    os.makedirs(a.out, exist_ok=True)
    path = os.path.join(a.out, f"{a.service}_{a.region}.json")
    data = get(f"{BASE}/offers/v1.0/aws/{a.service}/current/{a.region}/index.json")
    open(path, "wb").write(data)
    print(path, f"{len(data) / 1e6:.1f} MB")


def cmd_query(a):
    d = json.load(open(a.file))
    print("publicationDate", d.get("publicationDate"), "| region file", os.path.basename(a.file))
    attrs = dict(kv.split("=", 1) for kv in a.attr)
    n = 0
    for sku, p in d["products"].items():
        at = p.get("attributes", {})
        if a.family and p.get("productFamily") != a.family:
            continue
        if any(at.get(k) != v for k, v in attrs.items()):
            continue
        if a.usagetype and not re.search(a.usagetype, at.get("usagetype", "")):
            continue
        for term in d.get("terms", {}).get(a.term, {}).get(sku, {}).values():
            for dim in term["priceDimensions"].values():
                rng = f'{dim.get("beginRange", "")}-{dim.get("endRange", "")}'
                print(f'{at.get("usagetype", "")} | {dim["unit"]} | {float(dim["pricePerUnit"].get("USD", 0)):.6f} | {rng} | {dim["description"][:100]}')
                n += 1
        if a.show_attrs:
            print("   attrs:", {k: v for k, v in at.items() if k not in ("servicecode", "location", "locationType")})
        if n >= a.limit:
            print("… limit reached (use --limit)")
            return
    if n == 0:
        print("no match: list values with --show-attrs and a looser filter (e.g. only --family)")


ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
sub = ap.add_subparsers(dest="cmd", required=True)
sub.add_parser("services").set_defaults(fn=cmd_services)
p = sub.add_parser("regions"); p.add_argument("service"); p.set_defaults(fn=cmd_regions)
p = sub.add_parser("fetch"); p.add_argument("service"); p.add_argument("region"); p.add_argument("--out", default="awsprice"); p.set_defaults(fn=cmd_fetch)
p = sub.add_parser("query"); p.add_argument("file"); p.add_argument("--family"); p.add_argument("--attr", action="append", default=[])
p.add_argument("--usagetype"); p.add_argument("--term", default="OnDemand", help="OnDemand or Reserved")
p.add_argument("--limit", type=int, default=20); p.add_argument("--show-attrs", action="store_true"); p.set_defaults(fn=cmd_query)
a = ap.parse_args()
try:
    a.fn(a)
except urllib.error.URLError as e:
    sys.exit(f"network error: {e} · if a proxy blocks this host, fall back to WebSearch and mark the price 'estimate'")
