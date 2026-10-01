"""Write the simulation out as files shaped like real Amazon reports.

| File                                | Real report                                            |
| ----------------------------------- | ------------------------------------------------------ |
| products.json                       | Catalog listing (not an Amazon report)                 |
| sales_traffic/YYYY-MM-DD.json       | SP-API GET_SALES_AND_TRAFFIC_REPORT, DAY / CHILD ASIN  |
| fba_inventory/YYYY-MM-DD.tsv        | SP-API GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA         |
| ads/<reportTypeId>.json.gz          | Amazon Ads v3 reports, timeUnit DAILY, GZIP_JSON       |

Ads reports cover the whole year with a `date` column, as a DAILY v3 report does. Rows with no
impressions are left out, as Amazon does.
"""

import csv
import gzip
import io
import json
from pathlib import Path

import numpy as np

from . import config
from .simulate import AdCells, Simulation

# Ads v3 report columns written for each report type (see the Design tab, "Source reports").
AD_COLUMNS = {
    "spCampaigns": [
        "date",
        "campaignId",
        "campaignName",
        "campaignStatus",
        "campaignBudgetAmount",
        "campaignBudgetCurrencyCode",
        "impressions",
        "clicks",
        "cost",
        "purchases7d",
        "sales7d",
        "unitsSoldClicks7d",
    ],
    "spTargeting": [
        "date",
        "campaignId",
        "adGroupId",
        "keywordId",
        "keyword",
        "matchType",
        "impressions",
        "clicks",
        "cost",
        "purchases7d",
        "sales7d",
    ],
    "spAdvertisedProduct": [
        "date",
        "campaignId",
        "adGroupId",
        "adId",
        "advertisedAsin",
        "advertisedSku",
        "impressions",
        "clicks",
        "cost",
        "purchases7d",
        "sales7d",
    ],
    "sbCampaigns": [
        "date",
        "campaignId",
        "campaignName",
        "campaignStatus",
        "costType",
        "impressions",
        "clicks",
        "cost",
        "purchases",
        "sales",
        "unitsSold",
    ],
    "sbTargeting": [
        "date",
        "campaignId",
        "adGroupId",
        "keywordId",
        "keywordText",
        "matchType",
        "impressions",
        "clicks",
        "cost",
        "purchases",
        "sales",
    ],
    "sdCampaigns": [
        "date",
        "campaignId",
        "campaignName",
        "campaignStatus",
        "costType",
        "impressions",
        "clicks",
        "cost",
        "purchases",
        "sales",
        "unitsSold",
    ],
    "sdTargeting": [
        "date",
        "campaignId",
        "adGroupId",
        "targetingId",
        "targetingExpression",
        "targetingText",
        "impressions",
        "clicks",
        "cost",
        "purchases",
        "sales",
    ],
    "sdAdvertisedProduct": [
        "date",
        "campaignId",
        "adGroupId",
        "adId",
        "promotedAsin",
        "promotedSku",
        "impressions",
        "clicks",
        "cost",
        "purchases",
        "sales",
    ],
}

# Header of GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA, in Amazon's order.
FBA_COLUMNS = [
    "sku",
    "fnsku",
    "asin",
    "product-name",
    "condition",
    "your-price",
    "mfn-listing-exists",
    "mfn-fulfillable-quantity",
    "afn-listing-exists",
    "afn-warehouse-quantity",
    "afn-fulfillable-quantity",
    "afn-unsellable-quantity",
    "afn-reserved-quantity",
    "afn-total-quantity",
    "per-unit-volume",
    "afn-inbound-working-quantity",
    "afn-inbound-shipped-quantity",
    "afn-inbound-receiving-quantity",
    "afn-researching-quantity",
    "afn-reserved-future-supply",
    "afn-future-supply-buyable",
]


def money(cents) -> float:
    return round(int(cents) / 100, 2)


def amount(cents) -> dict:
    return {"amount": money(cents), "currencyCode": config.CURRENCY}


def write_all(sim: Simulation, out: Path) -> dict[str, int]:
    """Write every report under `out` and return the number of rows per report."""
    out.mkdir(parents=True, exist_ok=True)
    counts = {"products": _write_products(sim, out)}
    counts["sales_traffic"] = _write_sales_traffic(sim, out / "sales_traffic")
    counts["fba_inventory"] = _write_fba_inventory(sim, out / "fba_inventory")
    counts.update(_write_ads(sim, out / "ads"))
    return counts


def _write_products(sim: Simulation, out: Path) -> int:
    rows = [
        {
            "asin": p.asin,
            "sku": p.sku,
            "title": p.title,
            "brand": config.BRAND,
            "category": p.category,
            "price": {"amount": p.price, "currencyCode": config.CURRENCY},
            "launchDate": p.launch_date.isoformat(),
        }
        for p in sim.catalog.products
    ]
    (out / "products.json").write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
    return len(rows)


def _write_sales_traffic(sim: Simulation, out: Path) -> int:
    out.mkdir(exist_ok=True)
    rows_written = 0
    for d, day in enumerate(sim.days):
        by_asin = []
        for p in sim.catalog.products:
            i = p.index
            sessions = int(sim.sessions[i, d])
            units = int(sim.units[i, d])
            if sessions == 0 and units == 0:
                continue
            by_asin.append(
                {
                    "parentAsin": p.asin,
                    "childAsin": p.asin,
                    "sku": p.sku,
                    "salesByAsin": {
                        "unitsOrdered": units,
                        "orderedProductSales": amount(sim.sales_cents[i, d]),
                        "totalOrderItems": int(sim.orders[i, d]),
                    },
                    "trafficByAsin": {
                        "sessions": sessions,
                        "pageViews": int(sim.page_views[i, d]),
                        "buyBoxPercentage": float(sim.buy_box_pct[i, d]),
                        "unitSessionPercentage": round(100 * units / sessions, 2)
                        if sessions
                        else 0.0,
                    },
                }
            )
        report = {
            "reportSpecification": {
                "reportType": "GET_SALES_AND_TRAFFIC_REPORT",
                "reportOptions": {"dateGranularity": "DAY", "asinGranularity": "CHILD"},
                "dataStartTime": day.isoformat(),
                "dataEndTime": day.isoformat(),
                "marketplaceIds": [config.MARKETPLACE_ID],
            },
            "salesAndTrafficByDate": [
                {
                    "date": day.isoformat(),
                    "salesByDate": {
                        "orderedProductSales": amount(sim.sales_cents[:, d].sum()),
                        "unitsOrdered": int(sim.units[:, d].sum()),
                        "totalOrderItems": int(sim.orders[:, d].sum()),
                    },
                    "trafficByDate": {
                        "sessions": int(sim.sessions[:, d].sum()),
                        "pageViews": int(sim.page_views[:, d].sum()),
                    },
                }
            ],
            "salesAndTrafficByAsin": by_asin,
        }
        path = out / f"{day.isoformat()}.json"
        path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        rows_written += len(by_asin)
    return rows_written


def _inbound(shipments, d: int) -> tuple[int, int, int]:
    working = shipped = receiving = 0
    for s in shipments:
        if not s.created <= d < s.arrives:
            continue
        if d < s.created + config.INBOUND_WORKING_DAYS:
            working += s.quantity
        elif d >= s.arrives - config.INBOUND_RECEIVING_DAYS:
            receiving += s.quantity
        else:
            shipped += s.quantity
    return working, shipped, receiving


def _write_fba_inventory(sim: Simulation, out: Path) -> int:
    out.mkdir(exist_ok=True)
    rows_written = 0
    for d, day in enumerate(sim.days):
        buf = io.StringIO()
        w = csv.writer(buf, delimiter="\t", lineterminator="\n")
        w.writerow(FBA_COLUMNS)
        for p in sim.catalog.products:
            i = p.index
            working, shipped, receiving = _inbound(sim.shipments[i], d)
            if (p.launch_date - sim.days[0]).days > d and not (working + shipped + receiving):
                continue  # not listed yet
            on_hand = int(sim.stock_end[i, d])
            reserved = int(sim.reserved[i, d])
            unsellable = int(sim.unsellable[i, d])
            fulfillable = on_hand - reserved
            warehouse = on_hand + unsellable
            w.writerow(
                [
                    p.sku,
                    "X00" + p.asin[3:],
                    p.asin,
                    p.title,
                    "New",
                    f"{p.price:.2f}",
                    "No",
                    0,
                    "Yes",
                    warehouse,
                    fulfillable,
                    unsellable,
                    reserved,
                    warehouse + working + shipped + receiving,
                    "0.12",
                    working,
                    shipped,
                    receiving,
                    0,
                    0,
                    0,
                ]
            )
            rows_written += 1
        (out / f"{day.isoformat()}.tsv").write_text(buf.getvalue(), encoding="utf-8")
    return rows_written


def _rows(sim: Simulation, a: AdCells, kind: str) -> list[dict]:
    """Aggregate one campaign's cells to the grain of a report kind."""
    c = a.campaign
    sp = c.ad_product == "SPONSORED_PRODUCTS"
    orders_col, sales_col = ("purchases7d", "sales7d") if sp else ("purchases", "sales")
    axes = {"campaign": (0, 1), "target": (1,), "product": (0,)}[kind]
    m = {
        "impressions": a.impressions.sum(axis=axes),
        "clicks": a.clicks.sum(axis=axes),
        "cost": a.cost_cents.sum(axis=axes),
        "orders": a.orders.sum(axis=axes),
        "units": a.units.sum(axis=axes),
        "sales": a.sales_cents.sum(axis=axes),
    }
    rows = []
    keys = [None] if kind == "campaign" else range(m["impressions"].shape[0])
    for k in keys:
        for d, day in enumerate(sim.days):
            imp = int(m["impressions"][d] if k is None else m["impressions"][k, d])
            if imp == 0:
                continue

            def v(name, k=k, d=d):
                return m[name][d] if k is None else m[name][k, d]

            row = {
                "date": day.isoformat(),
                "campaignId": c.campaign_id,
                "impressions": imp,
                "clicks": int(v("clicks")),
                "cost": money(v("cost")),
                orders_col: int(v("orders")),
                sales_col: money(v("sales")),
            }
            if kind == "campaign":
                row.update(campaignName=c.name, campaignStatus="ENABLED")
                if sp:
                    row.update(
                        campaignBudgetAmount=c.budget,
                        campaignBudgetCurrencyCode=config.CURRENCY,
                        unitsSoldClicks7d=int(v("units")),
                    )
                else:
                    row.update(costType="CPC", unitsSold=int(v("units")))
            elif kind == "target":
                t = c.targets[k]
                row["adGroupId"] = c.ad_group_id
                if c.ad_product == "SPONSORED_DISPLAY":
                    row.update(
                        targetingId=t.target_id,
                        targetingExpression=t.text,
                        targetingText=t.text,
                    )
                elif c.ad_product == "SPONSORED_BRANDS":
                    row.update(keywordId=t.target_id, keywordText=t.text, matchType=t.match_type)
                else:
                    row.update(keywordId=t.target_id, keyword=t.text, matchType=t.match_type)
            else:
                p = sim.catalog.products[int(a.product_idx[k])]
                row.update(adGroupId=c.ad_group_id, adId=c.ad_ids[p.asin])
                if sp:
                    row.update(advertisedAsin=p.asin, advertisedSku=p.sku)
                else:
                    row.update(promotedAsin=p.asin, promotedSku=p.sku)
            rows.append(row)
    return rows


def _write_ads(sim: Simulation, out: Path) -> dict[str, int]:
    out.mkdir(exist_ok=True)
    prefix = {"SPONSORED_PRODUCTS": "sp", "SPONSORED_BRANDS": "sb", "SPONSORED_DISPLAY": "sd"}
    kinds = {"Campaigns": "campaign", "Targeting": "target", "AdvertisedProduct": "product"}
    counts = {}
    for report_type, columns in AD_COLUMNS.items():
        pre, suffix = report_type[:2], report_type[2:]
        rows = []
        for a in sim.ads:
            if prefix[a.campaign.ad_product] == pre:
                rows.extend(_rows(sim, a, kinds[suffix]))
        rows = [{col: r[col] for col in columns} for r in rows]
        payload = json.dumps(rows, separators=(",", ":")).encode("utf-8")
        # mtime=0 keeps the file byte-identical between runs
        with (
            open(out / f"{report_type}.json.gz", "wb") as f,
            gzip.GzipFile(fileobj=f, mode="wb", mtime=0, filename="") as gz,
        ):
            gz.write(payload)
        counts[report_type] = len(rows)
    return counts


def ad_totals(sim: Simulation) -> dict[str, np.ndarray]:
    """Account-level daily totals, used by tests."""
    n = len(sim.days)
    tot = {k: np.zeros(n, dtype=np.int64) for k in ("impressions", "cost", "sales")}
    for a in sim.ads:
        tot["impressions"] += a.impressions.sum(axis=(0, 1))
        tot["cost"] += a.cost_cents.sum(axis=(0, 1))
        tot["sales"] += a.sales_cents.sum(axis=(0, 1))
    return tot
