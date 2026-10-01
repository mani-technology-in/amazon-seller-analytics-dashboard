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
