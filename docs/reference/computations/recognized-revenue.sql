-- Recognized revenue for one fiscal year, net of refunds and intercompany.
-- The sanctioned definition: an agent may bind @fiscal_year and @region and
-- must not edit anything else.
SELECT
  SUM(o.amount_usd) AS recognized_revenue
FROM `finance.orders` AS o
WHERE o.fiscal_year = @fiscal_year
  AND (@region IS NULL OR o.region = @region)
  AND o.status = 'recognized'
