-- Three layers, as in the design:
--   raw      tables shaped like Amazon SP-API and Ads v3 reports, loaded by the generator
--   staging  views that type, rename and deduplicate raw
--   marts    tables the dashboard export reads
CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS staging;
CREATE SCHEMA IF NOT EXISTS marts;
