-- Marts: the tables the dashboard export reads. Rebuilt from staging on every run.
-- Grain is daily throughout; the dashboard adds up any date range itself. Facts carry the
-- marketplace (inventory: the fulfilment network) and money in its own currency;
-- dim_fx_monthly turns it into USD.

DROP TABLE IF EXISTS marts.dim_date, marts.dim_product, marts.dim_campaign, marts.dim_target,
    marts.dim_marketplace, marts.dim_fx_monthly, marts.fct_sales_daily, marts.fct_ads_campaign_daily, marts.fct_ads_target_daily,
    marts.fct_ads_product_daily, marts.fct_inventory_daily, marts.dim_product_cost,
    marts.fct_profit_daily;

-- Dimensions -------------------------------------------------------------------------------

CREATE TABLE marts.dim_date AS
SELECT
    d::date AS date,
    extract(year FROM d)::int AS year,
    extract(month FROM d)::int AS month,
    to_char(d, 'YYYY-MM') AS year_month,
    extract(isodow FROM d)::int AS iso_weekday,
    extract(isodow FROM d) IN (6, 7) AS is_weekend
FROM generate_series(
    (SELECT min(date) FROM staging.stg_sales_traffic),
    (SELECT max(date) FROM staging.stg_sales_traffic),
    interval '1 day'
) AS d;

CREATE TABLE marts.dim_marketplace AS
SELECT marketplace, marketplace_id, name, currency, network, has_ads
FROM staging.stg_marketplaces;

-- USD per unit of each currency, by month; USD itself is 1.
CREATE TABLE marts.dim_fx_monthly AS
SELECT year_month, currency, usd_rate FROM staging.stg_fx_rates
UNION ALL
SELECT DISTINCT year_month, 'USD', 1::numeric(12, 6) FROM staging.stg_fx_rates;

CREATE TABLE marts.dim_product AS
SELECT asin, sku, title, category, price, launch_date
FROM staging.stg_products;

CREATE TABLE marts.dim_campaign AS
WITH all_days AS (
    SELECT * FROM staging.stg_sp_campaigns
    UNION ALL SELECT * FROM staging.stg_sb_campaigns
    UNION ALL SELECT * FROM staging.stg_sd_campaigns
)
SELECT DISTINCT ON (campaign_id)
    campaign_id,
    marketplace,
    campaign_name,
    ad_product,
    CASE ad_product
        WHEN 'SP' THEN 'Sponsored Products'
        WHEN 'SB' THEN 'Sponsored Brands'
        WHEN 'SD' THEN 'Sponsored Display'
    END AS ad_product_name,
    campaign_status,
    budget
FROM all_days
ORDER BY campaign_id, date DESC;  -- latest name, status and budget

CREATE TABLE marts.dim_target AS
WITH all_days AS (
    SELECT * FROM staging.stg_sp_targeting
    UNION ALL SELECT * FROM staging.stg_sb_targeting
    UNION ALL SELECT * FROM staging.stg_sd_targeting
)
SELECT DISTINCT ON (campaign_id, target_id)
    campaign_id, target_id, marketplace, ad_group_id, ad_product, target_text, match_type
FROM all_days
ORDER BY campaign_id, target_id, date DESC;

-- Facts ------------------------------------------------------------------------------------

CREATE TABLE marts.fct_sales_daily AS
SELECT date, marketplace, asin, units, orders, sales, currency, sessions, page_views, buy_box_pct
FROM staging.stg_sales_traffic;

CREATE TABLE marts.fct_ads_campaign_daily AS
SELECT date, marketplace, campaign_id, ad_product, impressions, clicks, cost, orders, sales,
    units
FROM (
    SELECT * FROM staging.stg_sp_campaigns
    UNION ALL SELECT * FROM staging.stg_sb_campaigns
    UNION ALL SELECT * FROM staging.stg_sd_campaigns
) c;

CREATE TABLE marts.fct_ads_target_daily AS
SELECT date, marketplace, campaign_id, target_id, ad_product, impressions, clicks, cost, orders,
    sales
FROM (
    SELECT * FROM staging.stg_sp_targeting
    UNION ALL SELECT * FROM staging.stg_sb_targeting
    UNION ALL SELECT * FROM staging.stg_sd_targeting
) t;

-- Product-level ad results: Sponsored Products and Sponsored Display only, because Amazon
-- reports Sponsored Brands spend per campaign, not per product.
CREATE TABLE marts.fct_ads_product_daily AS
SELECT
    date,
    marketplace,
    asin,
    sum(impressions)::int AS impressions,
    sum(clicks)::int AS clicks,
    sum(cost)::numeric(12, 2) AS cost,
    sum(orders)::int AS orders,
    sum(sales)::numeric(12, 2) AS sales
FROM (
    SELECT * FROM staging.stg_sp_advertised_product
    UNION ALL SELECT * FROM staging.stg_sd_advertised_product
) p
GROUP BY date, marketplace, asin;

CREATE TABLE marts.fct_inventory_daily AS
SELECT
    date,
    network,
    asin,
    available,
    reserved,
    inbound_working + inbound_shipped + inbound_receiving AS inbound,
    unsellable
FROM staging.stg_fba_inventory;

-- Profit (CR-1) ----------------------------------------------------------------------------

-- The seller's unit cost (USD, not from Amazon) and the dates it applies to.
CREATE TABLE marts.dim_product_cost AS
SELECT
    p.asin,
    c.sku,
    c.unit_cost,
    c.currency,
    c.valid_from,
    coalesce(
        lead(c.valid_from) OVER (PARTITION BY c.sku ORDER BY c.valid_from) - 1, DATE '9999-12-31'
    ) AS valid_to
FROM staging.stg_product_costs c
JOIN staging.stg_products p USING (sku);

-- Amazon's money per product, marketplace and day, in the marketplace's currency. Shipments and
-- referral fees count on the day they post; refunds (and the referral fee they return) on the
-- day the refund posts; Amazon's refund administration fee counts as referral fee. Product cost = units shipped x the unit cost in force, converted from
-- USD at the month's rate (NULL, never a lost row, if a cost or rate is missing; a test checks
-- there are none). Ad spend stays in the ads facts and is added by the metrics.
CREATE TABLE marts.fct_profit_daily AS
WITH days AS (
    SELECT date, marketplace, sku FROM staging.stg_finance_shipments
    UNION
    SELECT date, marketplace, sku FROM staging.stg_finance_refunds
)
SELECT
    d.date,
    d.marketplace,
    p.asin,
    coalesce(s.units, 0) AS units_shipped,
    coalesce(s.principal, 0)::numeric(12, 2) AS principal,
    coalesce(r.units, 0) AS refund_units,
    coalesce(r.refund, 0)::numeric(12, 2) AS refunds,
    (coalesce(s.referral_fee, 0) - coalesce(r.referral_fee_returned, 0)
        + coalesce(r.refund_admin_fee, 0))::numeric(12, 2) AS referral_fees,
    coalesce(s.fba_fee, 0)::numeric(12, 2) AS fba_fees,
    round(coalesce(s.units, 0) * c.unit_cost / fx.usd_rate, 2)::numeric(12, 2) AS product_cost,
    m.currency
FROM days d
JOIN staging.stg_products p ON p.sku = d.sku
JOIN marts.dim_marketplace m ON m.marketplace = d.marketplace
LEFT JOIN marts.dim_product_cost c ON c.sku = d.sku AND d.date BETWEEN c.valid_from AND c.valid_to
LEFT JOIN marts.dim_fx_monthly fx ON fx.year_month = to_char(d.date, 'YYYY-MM') AND fx.currency = m.currency
LEFT JOIN staging.stg_finance_shipments s
    ON s.date = d.date AND s.marketplace = d.marketplace AND s.sku = d.sku
LEFT JOIN staging.stg_finance_refunds r
    ON r.date = d.date AND r.marketplace = d.marketplace AND r.sku = d.sku;

-- Keys and indexes -------------------------------------------------------------------------

ALTER TABLE marts.dim_date ADD PRIMARY KEY (date);
ALTER TABLE marts.dim_product ADD PRIMARY KEY (asin);
ALTER TABLE marts.dim_marketplace ADD PRIMARY KEY (marketplace);
ALTER TABLE marts.dim_fx_monthly ADD PRIMARY KEY (year_month, currency);
ALTER TABLE marts.dim_campaign ADD PRIMARY KEY (campaign_id);
ALTER TABLE marts.dim_target ADD PRIMARY KEY (campaign_id, target_id);
ALTER TABLE marts.fct_sales_daily ADD PRIMARY KEY (date, marketplace, asin);
ALTER TABLE marts.fct_ads_campaign_daily ADD PRIMARY KEY (date, campaign_id);
ALTER TABLE marts.fct_ads_target_daily ADD PRIMARY KEY (date, campaign_id, target_id);
ALTER TABLE marts.fct_ads_product_daily ADD PRIMARY KEY (date, marketplace, asin);
ALTER TABLE marts.fct_inventory_daily ADD PRIMARY KEY (date, network, asin);
ALTER TABLE marts.dim_product_cost ADD PRIMARY KEY (sku, valid_from);
ALTER TABLE marts.fct_profit_daily ADD PRIMARY KEY (date, marketplace, asin);
