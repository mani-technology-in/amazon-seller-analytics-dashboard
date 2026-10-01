-- Marts: the tables the dashboard export reads. Rebuilt from staging on every run.
-- Grain is daily throughout; the dashboard adds up any date range itself.

DROP TABLE IF EXISTS marts.dim_date, marts.dim_product, marts.dim_campaign, marts.dim_target,
    marts.fct_sales_daily, marts.fct_ads_campaign_daily, marts.fct_ads_target_daily,
    marts.fct_ads_product_daily, marts.fct_inventory_daily;

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
    campaign_id, target_id, ad_group_id, ad_product, target_text, match_type
FROM all_days
ORDER BY campaign_id, target_id, date DESC;

-- Facts ------------------------------------------------------------------------------------

CREATE TABLE marts.fct_sales_daily AS
SELECT date, asin, units, orders, sales, sessions, page_views, buy_box_pct
FROM staging.stg_sales_traffic;

CREATE TABLE marts.fct_ads_campaign_daily AS
SELECT date, campaign_id, ad_product, impressions, clicks, cost, orders, sales, units
FROM (
    SELECT * FROM staging.stg_sp_campaigns
    UNION ALL SELECT * FROM staging.stg_sb_campaigns
    UNION ALL SELECT * FROM staging.stg_sd_campaigns
) c;

CREATE TABLE marts.fct_ads_target_daily AS
SELECT date, campaign_id, target_id, ad_product, impressions, clicks, cost, orders, sales
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
GROUP BY date, asin;

CREATE TABLE marts.fct_inventory_daily AS
SELECT
    date,
    asin,
    available,
    reserved,
    inbound_working + inbound_shipped + inbound_receiving AS inbound,
    unsellable
FROM staging.stg_fba_inventory;

-- Keys and indexes -------------------------------------------------------------------------

ALTER TABLE marts.dim_date ADD PRIMARY KEY (date);
ALTER TABLE marts.dim_product ADD PRIMARY KEY (asin);
ALTER TABLE marts.dim_campaign ADD PRIMARY KEY (campaign_id);
ALTER TABLE marts.dim_target ADD PRIMARY KEY (campaign_id, target_id);
ALTER TABLE marts.fct_sales_daily ADD PRIMARY KEY (date, asin);
ALTER TABLE marts.fct_ads_campaign_daily ADD PRIMARY KEY (date, campaign_id);
ALTER TABLE marts.fct_ads_target_daily ADD PRIMARY KEY (date, campaign_id, target_id);
ALTER TABLE marts.fct_ads_product_daily ADD PRIMARY KEY (date, asin);
ALTER TABLE marts.fct_inventory_daily ADD PRIMARY KEY (date, asin);
