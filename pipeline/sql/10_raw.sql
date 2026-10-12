-- Raw layer: one row per report record, stored as received.
-- `record` holds the record exactly as the Amazon report has it (Amazon's own field names);
-- the staging views in 20_staging.sql type and rename the fields. A real SP-API or Ads
-- connector would load these same tables, so everything downstream works unchanged.
--
-- Every table has the same shape:
--   report_date  the day the record covers
--   source_file  file the record came from, relative to the generator output folder
--   record       the report record as JSON
--   loaded_at    when it was loaded

CREATE TABLE IF NOT EXISTS raw.products (
    report_date date,
    source_file text NOT NULL,
    record jsonb NOT NULL,
    loaded_at timestamptz NOT NULL DEFAULT now()
);

-- The seller's marketplaces (marketplaces.json) and monthly exchange rates (fx/rates.csv):
-- the seller's own reference data, not Amazon reports.
CREATE TABLE IF NOT EXISTS raw.marketplaces (LIKE raw.products INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS raw.fx_rates (LIKE raw.products INCLUDING DEFAULTS);

-- SP-API GET_SALES_AND_TRAFFIC_REPORT, one record per child ASIN per day per marketplace.
-- The marketplace is the report's marketplaceIds option; source_file names it
-- (sales_traffic/<code>/...). Ads and inventory files are named the same way.
CREATE TABLE IF NOT EXISTS raw.sales_traffic_by_asin (
    report_date date NOT NULL,
    source_file text NOT NULL,
    record jsonb NOT NULL,
    loaded_at timestamptz NOT NULL DEFAULT now()
);

-- SP-API GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA, one snapshot per day
CREATE TABLE IF NOT EXISTS raw.fba_inventory_snapshot (
    report_date date NOT NULL,
    source_file text NOT NULL,
    record jsonb NOT NULL,
    loaded_at timestamptz NOT NULL DEFAULT now()
);

-- Amazon Ads v3 reports, timeUnit DAILY
CREATE TABLE IF NOT EXISTS raw.sp_campaigns (LIKE raw.sales_traffic_by_asin INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS raw.sp_targeting (LIKE raw.sales_traffic_by_asin INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS raw.sp_advertised_product (LIKE raw.sales_traffic_by_asin INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS raw.sb_campaigns (LIKE raw.sales_traffic_by_asin INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS raw.sb_targeting (LIKE raw.sales_traffic_by_asin INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS raw.sd_campaigns (LIKE raw.sales_traffic_by_asin INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS raw.sd_targeting (LIKE raw.sales_traffic_by_asin INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS raw.sd_advertised_product (LIKE raw.sales_traffic_by_asin INCLUDING DEFAULTS);
