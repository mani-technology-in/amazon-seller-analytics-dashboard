-- Staging layer: typed, snake_case views over the raw report records.
-- If the same record is loaded twice (same natural key), the most recently loaded one wins.
-- The marketplace (or, for inventory, the fulfilment network) comes from the file's folder,
-- e.g. sales_traffic/UK/2026-09-30.json. Money is numeric(12,2) in the marketplace's own
-- currency; conversion to USD happens in the dashboard and the parity check. Ad "orders" and
-- "sales" are each ad type's own attribution: 7-day for Sponsored Products (purchases7d,
-- sales7d), 14-day for Sponsored Brands and Sponsored Display (purchases, sales).
--
-- The views are rebuilt from scratch each run, so a column can be added anywhere in a view
-- (CREATE OR REPLACE VIEW can only add columns at the end). Nothing outside staging depends on
-- these views: the marts are tables.

DROP SCHEMA IF EXISTS staging CASCADE;
CREATE SCHEMA staging;

CREATE OR REPLACE VIEW staging.stg_products AS
SELECT DISTINCT ON (record->>'asin')
    record->>'asin' AS asin,
    record->>'sku' AS sku,
    record->>'title' AS title,
    record->>'brand' AS brand,
    record->>'category' AS category,
    (record #>> '{price,amount}')::numeric(12, 2) AS price,
    (record->>'launchDate')::date AS launch_date
FROM raw.products
ORDER BY record->>'asin', loaded_at DESC;

CREATE OR REPLACE VIEW staging.stg_marketplaces AS
SELECT DISTINCT ON (record->>'code')
    record->>'code' AS marketplace,
    record->>'marketplaceId' AS marketplace_id,
    record->>'name' AS name,
    record->>'currencyCode' AS currency,
    record->>'fulfillmentNetwork' AS network,
    (record->>'adsProfile')::boolean AS has_ads
FROM raw.marketplaces
ORDER BY record->>'code', loaded_at DESC;

CREATE OR REPLACE VIEW staging.stg_fx_rates AS
SELECT DISTINCT ON (record->>'month', record->>'currency')
    record->>'month' AS year_month,
    record->>'currency' AS currency,
    (record->>'usd_rate')::numeric(12, 6) AS usd_rate
FROM raw.fx_rates
ORDER BY record->>'month', record->>'currency', loaded_at DESC;

CREATE OR REPLACE VIEW staging.stg_sales_traffic AS
SELECT DISTINCT ON (report_date, split_part(source_file, '/', 2), record->>'childAsin')
    report_date AS date,
    split_part(source_file, '/', 2) AS marketplace,
    record->>'childAsin' AS asin,
    record->>'parentAsin' AS parent_asin,
    record->>'sku' AS sku,
    (record #>> '{salesByAsin,unitsOrdered}')::int AS units,
    (record #>> '{salesByAsin,totalOrderItems}')::int AS orders,
    (record #>> '{salesByAsin,orderedProductSales,amount}')::numeric(12, 2) AS sales,
    record #>> '{salesByAsin,orderedProductSales,currencyCode}' AS currency,
    (record #>> '{trafficByAsin,sessions}')::int AS sessions,
    (record #>> '{trafficByAsin,pageViews}')::int AS page_views,
    (record #>> '{trafficByAsin,buyBoxPercentage}')::numeric(5, 2) AS buy_box_pct,
    (record #>> '{trafficByAsin,unitSessionPercentage}')::numeric(5, 2) AS unit_session_pct
FROM raw.sales_traffic_by_asin
ORDER BY report_date, split_part(source_file, '/', 2), record->>'childAsin', loaded_at DESC;

CREATE OR REPLACE VIEW staging.stg_fba_inventory AS
SELECT DISTINCT ON (report_date, split_part(source_file, '/', 2), record->>'sku')
    report_date AS date,
    split_part(source_file, '/', 2) AS network,
    record->>'asin' AS asin,
    record->>'sku' AS sku,
    (record->>'afn-fulfillable-quantity')::int AS available,
    (record->>'afn-reserved-quantity')::int AS reserved,
    (record->>'afn-unsellable-quantity')::int AS unsellable,
    (record->>'afn-warehouse-quantity')::int AS warehouse,
    (record->>'afn-inbound-working-quantity')::int AS inbound_working,
    (record->>'afn-inbound-shipped-quantity')::int AS inbound_shipped,
    (record->>'afn-inbound-receiving-quantity')::int AS inbound_receiving
FROM raw.fba_inventory_snapshot
ORDER BY report_date, split_part(source_file, '/', 2), record->>'sku', loaded_at DESC;

-- Campaign reports -------------------------------------------------------------------------

CREATE OR REPLACE VIEW staging.stg_sp_campaigns AS
SELECT DISTINCT ON (report_date, record->>'campaignId')
    report_date AS date,
    split_part(source_file, '/', 2) AS marketplace,
    'SP'::text AS ad_product,
    (record->>'campaignId')::bigint AS campaign_id,
    record->>'campaignName' AS campaign_name,
    record->>'campaignStatus' AS campaign_status,
    (record->>'campaignBudgetAmount')::numeric(12, 2) AS budget,
    (record->>'impressions')::int AS impressions,
    (record->>'clicks')::int AS clicks,
    (record->>'cost')::numeric(12, 2) AS cost,
    (record->>'purchases7d')::int AS orders,
    (record->>'sales7d')::numeric(12, 2) AS sales,
    (record->>'unitsSoldClicks7d')::int AS units
FROM raw.sp_campaigns
ORDER BY report_date, record->>'campaignId', loaded_at DESC;

CREATE OR REPLACE VIEW staging.stg_sb_campaigns AS
SELECT DISTINCT ON (report_date, record->>'campaignId')
    report_date AS date,
    split_part(source_file, '/', 2) AS marketplace,
    'SB'::text AS ad_product,
    (record->>'campaignId')::bigint AS campaign_id,
    record->>'campaignName' AS campaign_name,
    record->>'campaignStatus' AS campaign_status,
    NULL::numeric(12, 2) AS budget,
    (record->>'impressions')::int AS impressions,
    (record->>'clicks')::int AS clicks,
    (record->>'cost')::numeric(12, 2) AS cost,
    (record->>'purchases')::int AS orders,
    (record->>'sales')::numeric(12, 2) AS sales,
    (record->>'unitsSold')::int AS units
FROM raw.sb_campaigns
ORDER BY report_date, record->>'campaignId', loaded_at DESC;

CREATE OR REPLACE VIEW staging.stg_sd_campaigns AS
SELECT DISTINCT ON (report_date, record->>'campaignId')
    report_date AS date,
    split_part(source_file, '/', 2) AS marketplace,
    'SD'::text AS ad_product,
    (record->>'campaignId')::bigint AS campaign_id,
    record->>'campaignName' AS campaign_name,
    record->>'campaignStatus' AS campaign_status,
    NULL::numeric(12, 2) AS budget,
    (record->>'impressions')::int AS impressions,
    (record->>'clicks')::int AS clicks,
    (record->>'cost')::numeric(12, 2) AS cost,
    (record->>'purchases')::int AS orders,
    (record->>'sales')::numeric(12, 2) AS sales,
    (record->>'unitsSold')::int AS units
FROM raw.sd_campaigns
ORDER BY report_date, record->>'campaignId', loaded_at DESC;

-- Keyword and target reports --------------------------------------------------------------

CREATE OR REPLACE VIEW staging.stg_sp_targeting AS
SELECT DISTINCT ON (report_date, record->>'campaignId', record->>'keywordId')
    report_date AS date,
    split_part(source_file, '/', 2) AS marketplace,
    'SP'::text AS ad_product,
    (record->>'campaignId')::bigint AS campaign_id,
    (record->>'adGroupId')::bigint AS ad_group_id,
    (record->>'keywordId')::bigint AS target_id,
    record->>'keyword' AS target_text,
    record->>'matchType' AS match_type,
    (record->>'impressions')::int AS impressions,
    (record->>'clicks')::int AS clicks,
    (record->>'cost')::numeric(12, 2) AS cost,
    (record->>'purchases7d')::int AS orders,
    (record->>'sales7d')::numeric(12, 2) AS sales
FROM raw.sp_targeting
ORDER BY report_date, record->>'campaignId', record->>'keywordId', loaded_at DESC;

CREATE OR REPLACE VIEW staging.stg_sb_targeting AS
SELECT DISTINCT ON (report_date, record->>'campaignId', record->>'keywordId')
    report_date AS date,
    split_part(source_file, '/', 2) AS marketplace,
    'SB'::text AS ad_product,
    (record->>'campaignId')::bigint AS campaign_id,
    (record->>'adGroupId')::bigint AS ad_group_id,
    (record->>'keywordId')::bigint AS target_id,
    record->>'keywordText' AS target_text,
    record->>'matchType' AS match_type,
    (record->>'impressions')::int AS impressions,
    (record->>'clicks')::int AS clicks,
    (record->>'cost')::numeric(12, 2) AS cost,
    (record->>'purchases')::int AS orders,
    (record->>'sales')::numeric(12, 2) AS sales
FROM raw.sb_targeting
ORDER BY report_date, record->>'campaignId', record->>'keywordId', loaded_at DESC;

CREATE OR REPLACE VIEW staging.stg_sd_targeting AS
SELECT DISTINCT ON (report_date, record->>'campaignId', record->>'targetingId')
    report_date AS date,
    split_part(source_file, '/', 2) AS marketplace,
    'SD'::text AS ad_product,
    (record->>'campaignId')::bigint AS campaign_id,
    (record->>'adGroupId')::bigint AS ad_group_id,
    (record->>'targetingId')::bigint AS target_id,
    record->>'targetingText' AS target_text,
    CASE
        WHEN record->>'targetingExpression' LIKE 'views=%'
            OR record->>'targetingExpression' LIKE 'purchases=%' THEN 'AUDIENCE'
        ELSE 'PRODUCT'
    END AS match_type,
    (record->>'impressions')::int AS impressions,
    (record->>'clicks')::int AS clicks,
    (record->>'cost')::numeric(12, 2) AS cost,
    (record->>'purchases')::int AS orders,
    (record->>'sales')::numeric(12, 2) AS sales
FROM raw.sd_targeting
ORDER BY report_date, record->>'campaignId', record->>'targetingId', loaded_at DESC;

-- Advertised product reports (Sponsored Brands has none: Amazon reports its spend per campaign)

CREATE OR REPLACE VIEW staging.stg_sp_advertised_product AS
SELECT DISTINCT ON (report_date, record->>'adId')
    report_date AS date,
    split_part(source_file, '/', 2) AS marketplace,
    'SP'::text AS ad_product,
    (record->>'campaignId')::bigint AS campaign_id,
    (record->>'adGroupId')::bigint AS ad_group_id,
    (record->>'adId')::bigint AS ad_id,
    record->>'advertisedAsin' AS asin,
    record->>'advertisedSku' AS sku,
    (record->>'impressions')::int AS impressions,
    (record->>'clicks')::int AS clicks,
    (record->>'cost')::numeric(12, 2) AS cost,
    (record->>'purchases7d')::int AS orders,
    (record->>'sales7d')::numeric(12, 2) AS sales
FROM raw.sp_advertised_product
ORDER BY report_date, record->>'adId', loaded_at DESC;

CREATE OR REPLACE VIEW staging.stg_sd_advertised_product AS
SELECT DISTINCT ON (report_date, record->>'adId')
    report_date AS date,
    split_part(source_file, '/', 2) AS marketplace,
    'SD'::text AS ad_product,
    (record->>'campaignId')::bigint AS campaign_id,
    (record->>'adGroupId')::bigint AS ad_group_id,
    (record->>'adId')::bigint AS ad_id,
    record->>'promotedAsin' AS asin,
    record->>'promotedSku' AS sku,
    (record->>'impressions')::int AS impressions,
    (record->>'clicks')::int AS clicks,
    (record->>'cost')::numeric(12, 2) AS cost,
    (record->>'purchases')::int AS orders,
    (record->>'sales')::numeric(12, 2) AS sales
FROM raw.sd_advertised_product
ORDER BY report_date, record->>'adId', loaded_at DESC;
