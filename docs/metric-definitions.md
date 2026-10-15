# Metric definitions

Every metric on the dashboard uses exactly one of these definitions, computed over the selected date range. A ratio whose denominator is zero is shown as a dash, not 0.

| Metric | Definition | Notes |
| --- | --- | --- |
| Total sales | Sum of ordered product sales (USD) | All orders, organic and ad-attributed |
| Ad spend | Sum of ad cost across campaigns | |
| Ad sales | Sales attributed to ads | 7-day attribution for Sponsored Products, 14-day for Sponsored Brands and Sponsored Display |
| ACoS | Ad spend / ad sales | Lower is better |
| TACoS | Ad spend / total sales | Shows how ad-dependent the business is |
| ROAS | Ad sales / ad spend | Inverse of ACoS |
| CTR | Clicks / impressions | |
| CPC | Ad spend / clicks | |
| Ad conversion rate | Ad orders / clicks | |
| Unit session percentage | Units ordered / sessions | Product-level conversion, as in Amazon's Business Report |
| Avg daily units | Units sold in last 30 days / 30 | Always the last 30 days, regardless of filter |
| Days of cover | Available units / avg daily units | Shown as "no recent sales" when avg daily units is 0 |

Product-level ad spend and TACoS use Sponsored Products and Sponsored Display only, because Amazon reports Sponsored Brands spend per campaign, not per product. Account-level totals include all three ad types.

## Marketplaces, currency and profit (CR-1)

| Metric | Definition | Notes |
| --- | --- | --- |
| Currency conversion | Local amount × the fixed monthly USD rate for the month of the event | Rates are synthetic; converted in one place (`web/src/metrics/currency.ts`) and once in SQL for the parity check. A missing rate is an error, never treated as USD |
| Revenue | Ordered product sales (as Total sales), in the display currency | |
| Share of revenue | Marketplace revenue / revenue of all marketplaces, in USD | Always USD, so shares add up to 100% |
| Average order value | Revenue / orders | |
| Refunds | Refunded principal, counted on the refund's posted date | Not the order date |
| Referral fees | Amazon's referral fee on shipped items, less the fee returned on refunds, plus Amazon's refund administration fee | Finances API fee types `Commission` and `RefundCommission` |
| FBA fees | FBA fulfilment fees on shipped items | Fee type `FBAPerUnitFulfillmentFee` |
| Amazon fees | Referral fees + FBA fees | |
| Product cost | Units shipped × the seller's unit cost in force on that day | Entered by the seller, not from Amazon |
| Net profit | Revenue − refunds − Amazon fees − ad spend − product cost | Storage and inbound costs left out |
| Net margin | Net profit / revenue | Can be negative |
| Profit per unit | Net profit / units shipped | |

Product profit counts the ad spend Amazon reports per product (Sponsored Products and Sponsored Display), so a product table's totals row is the sum of its rows. The account's profit (the Profit page's KPI tiles and chart) also counts Sponsored Brands spend, which Amazon reports per campaign only.

