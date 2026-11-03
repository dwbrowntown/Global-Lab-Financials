# Global Labs Lab Forecast - Sigma + Snowflake Build Specification

Source: SharePoint, `Desktop/Extreme Info/ICO Buildout Docs/Lab_Forecast_Sigma_Build_Spec.docx` (modified 2026-08-04). Text extracted from the Word document; SQL and tables kept as written, spacing cleaned.

Consolidated reference for building the lab budget forecast in Sigma Computing on native Snowflake tables, replacing the Excel + Power Query model.

| Item | Value |
|---|---|
| Purpose | Single copy-paste source for the Snowflake + Sigma build |
| Owner | Dan Brown, dabrown@extremenetworks.com |
| Current state | Excel + Power Query pulling ICO forms, Legacy orders and 3P spend from SharePoint |
| Target state | Snowflake data model (`LAB_FORECAST`) surfaced through three Sigma dashboards embedded in SharePoint |
| Refresh | Daily. Snowflake tasks 02:00 UTC, Sigma data sources 03:00 UTC |
| Audience | Finance (budget pressure) and Lab operations (order and shipping status) |
| Fiscal calendar | Extreme Networks, FY starts 1 July |
| Quarterly allowance | CapEx $300,000, OpEx $100,000 per quarter (from current model) |

**Read Section 2 first.** Four defects in the existing draft SQL either fail to compile or silently drop data. Every SQL block in Section 4 is the corrected version. Do not paste from the older draft files.

## 1. What We Are Building

Three source systems converge into one consolidated spend fact table in Snowflake. Sigma reads reporting views off that fact table and presents three dashboards. Nothing is transformed inside Sigma except presentation-layer formatting and the scenario selector.

### 1.1 Data flow

```
SOURCES                          SNOWFLAKE                                   SIGMA
ICO order forms ---------------> STAGING.ICO_ORDERS_RAW -----------------> Dashboard 1
 (SharePoint 02_Orders_History)   TRANSFORMATION.ORDERS_TRANSFORMED_ICO      Finance / Budget Pressure
Legacy orders -----------------> STAGING.LEGACY_ORDERS_RAW ---------------> Dashboard 2
 (Master_Tracking_Workbook tab)   TRANSFORMATION.ORDERS_TRANSFORMED_LEGACY   Active Orders & Shipping
3P contracts ------------------> STAGING.THIRDPARTY_SPEND_RAW ------------> Dashboard 3
 (Master_3P_Tracker)              TRANSFORMATION.ORDERS_TRANSFORMED_THIRDPARTY  Forecast Scenarios
Budget allowances -------------> STAGING.BUDGET_ALLOWANCES_RAW
Account mapping ---------------> REFERENCE.ACCOUNT_CATEGORY_MAPPING
                                      |
                                      v
                       CONSOLIDATION.GLOBAL_LAB_CONSOLIDATED_SPEND
                                      |
        +-------------------+---------+---------+-------------------+
        v                   v                   v                   v
BUDGET_PRESSURE_    BUDGET_VARIANCE_    ACTIVE_ORDERS_      FORECAST_
BY_QUARTER          WITH_ALLOWANCES     DETAIL              SCENARIOS
```

### 1.2 Snowflake object inventory

Database `LAB_FORECAST`. Five schemas, four staging tables, one reference table, three transformation views, one consolidation view, five reporting views.

| Schema | Object | Role |
|---|---|---|
| STAGING | ICO_ORDERS_RAW | ICO form line items: cost, account, ship dates |
| STAGING | LEGACY_ORDERS_RAW | Historical orders with FY/FQ already assigned (frozen) |
| STAGING | THIRDPARTY_SPEND_RAW | 3P contracts and one-time purchases |
| STAGING | BUDGET_ALLOWANCES_RAW | Quarterly CapEx / OpEx budget by FY+FQ |
| REFERENCE | ACCOUNT_CATEGORY_MAPPING | Account code to CapEx / OpEx |
| TRANSFORMATION | GET_FISCAL_YEAR / _QUARTER / _FYFQ | Fiscal calendar functions |
| TRANSFORMATION | ORDERS_TRANSFORMED_ICO | Adds recognition date, FY/FQ, budget category |
| TRANSFORMATION | ORDERS_TRANSFORMED_LEGACY | Standardises legacy to the common schema |
| TRANSFORMATION | ORDERS_TRANSFORMED_THIRDPARTY | Amortises term contracts monthly; one-time in a single period |
| CONSOLIDATION | GLOBAL_LAB_CONSOLIDATED_SPEND | Union of all three sources, the fact table |
| REPORTING | BUDGET_PRESSURE_BY_QUARTER | Sigma source: spend by FY/FQ/category/source |
| REPORTING | BUDGET_VARIANCE_WITH_ALLOWANCES | Sigma source: budget vs actual, remaining, status |
| REPORTING | ACTIVE_ORDERS_DETAIL | Sigma source: open orders, days to ship |
| REPORTING | FORECAST_SCENARIOS | Sigma source: baseline + 7/14/30-day slip |
| REPORTING | DATA_QUALITY_SUMMARY | Sigma source: unmapped accounts, missing dates |

### 1.3 The one rule that drives everything

**Budget is recognised in the quarter the parts actually ship.** If `ACTUAL_SHIP_DATE` is populated, use it. Otherwise use `SCHEDULED_SHIP_DATE`. If both are null the order is "Unscheduled" and is reported as a data-quality exception rather than assigned to a quarter. Approved ICO cost (Subtotal + Use Tax) is frozen at approval and must never be recalculated from current pricing.

## 2. Fix Before You Build: Four Defects in the Draft SQL

Items 1 and 2 change every number on every dashboard.

### 2.1 Fiscal year is off by one

The draft returns `YEAR(d)` when month >= 7. It should return `YEAR(d) + 1`.

| Record | Date | Workbook says | Draft SQL gives |
|---|---|---|---|
| PO_1240873 (Spirent, 3P) | 2025-07-01 | FY2026 Q1 | FY2025 Q3 |
| PO_1228978 (Ekahau, 3P) | 2024-12-15 | FY2025 Q2 | FY2024 Q4 |
| SO 5017025 (Legacy) | 2024-07-19 | FY2025 Q1 | FY2024 Q3 |
| ICO file naming convention | Jan-Mar 2026 | FY26Q3 | FY2026 Q1 |

The two source documents disagree: `Global_Labs_Budget_Technical_Architecture` says "if month >= 7 then Year+1", while `Global_Labs_Budget_Model_Playbook` says "Year - 1". The data confirms the Technical Architecture version.

### 2.2 Fiscal quarter returns the calendar quarter

The draft uses `FLOOR((MONTH(d) - 1) / 3) + 1`, the calendar quarter. With a July year start, July must be Q1. Correct expression: `'Q' || TO_VARCHAR(FLOOR(MOD(MONTH(d) + 5, 12) / 3) + 1)`.

| Month | Jul | Oct | Jan | Apr |
|---|---|---|---|---|
| Correct fiscal Q | Q1 | Q2 | Q3 | Q4 |
| Draft SQL gives | Q3 | Q4 | Q1 | Q2 |

### 2.3 The ICO view will not compile

The draft filters `WHERE FISCAL_YEAR IS NOT NULL AND BUDGET_CATEGORY IS NOT NULL`, but both are aliases created in the same SELECT. Snowflake does not allow alias references in WHERE, so it resolves them against `ICO_ORDERS_RAW` and throws "invalid identifier". The corrected view in Section 4.4 wraps the projection in a CTE. Also, `COALESCE(acm.BUDGET_CATEGORY, 'Unknown')` can never be null, so that filter would never have excluded anything.

### 2.4 Thirteen account codes are unmapped

The mapping table seeds only 20050 (CapEx) and 87165 (OpEx). The shipping data has 15 distinct account codes across 23,782 lines. Unmapped codes land in "Unmapped" and are excluded from CapEx/OpEx variance reporting, roughly 2,500 lines of real spend.

| Account | Lines | Category |
|---|---|---|
| 87165 | 16,174 | OpEx (confirmed) |
| 20050 | 5,142 | CapEx (confirmed) |
| 20020 | 1,250 | NEEDS SIGN-OFF |
| 89220 | 430 | NEEDS SIGN-OFF |
| 89270 | 240 | NEEDS SIGN-OFF |
| 89160 | 222 | NEEDS SIGN-OFF |
| 85170 | 144 | NEEDS SIGN-OFF |
| 89170 | 62 | NEEDS SIGN-OFF |
| 89130 | 60 | NEEDS SIGN-OFF |
| 87100 | 22 | NEEDS SIGN-OFF |
| 89250 | 14 | NEEDS SIGN-OFF |
| 85180 | 12 | NEEDS SIGN-OFF |
| 89701 | 4 | NEEDS SIGN-OFF |
| 45295 | 2 | NEEDS SIGN-OFF |
| 60273 | 2 | NEEDS SIGN-OFF |

**Action before Phase 1 sign-off:** get Finance to classify the 13 codes as CapEx or OpEx (or explicitly out of scope). Until then the Finance dashboard understates spend. `REPORTING.DATA_QUALITY_SUMMARY` surfaces the gap.

### 2.5 Two smaller mismatches

- **Shipping status values.** The Sigma spec assumes Open / Pending / Shipped. The data uses `CLOSED` (23,618), `AWAITING_SHIPPING` (124), `AWAITING_FULFILLMENT` (36) and `BOOKED` (2). Map to display labels in Sigma rather than renaming source data.
- **Variance view drops empty quarters.** A LEFT JOIN from spend to allowances hides any quarter with a budget but no spend yet, the forward quarters Finance wants to see. Section 4.8 uses a FULL OUTER JOIN.

## 3. Locked Business Rules

Carried forward from the Excel model. Do not change during migration; matching them is how the reconciliation passes.

| Rule | Definition |
|---|---|
| Fiscal year | Starts 1 July. Month >= 7 gives FY = calendar year + 1; otherwise FY = calendar year. |
| Fiscal quarters | Q1 Jul-Sep, Q2 Oct-Dec, Q3 Jan-Mar, Q4 Apr-Jun |
| Recognition date | `ACTUAL_SHIP_DATE` if set, else `SCHEDULED_SHIP_DATE`. Both null: Unscheduled (excluded from quarter reporting, surfaced in DQ). |
| Approved cost is frozen | ICO Subtotal + Use Tax = Budget Hit, captured at approval. Never re-priced from the current pricing file. |
| CapEx / OpEx | Derived from account code via `ACCOUNT_CATEGORY_MAPPING`, the single source of truth. |
| Legacy orders | FY and FQ arrive pre-assigned and are loaded as-is. Frozen history. |
| 3P term contracts | Term Expense = Yes: total cost split evenly across every month from contract start to end. |
| 3P one-time purchases | Term Expense = No: recognised in a single period on the order date. |
| Budget allowance | Applied at quarter level, not per order. CapEx $300k / OpEx $100k per quarter. |
| Remaining budget | Quarter allowance minus actual spend. Status: Green < 70%, Yellow 70-90%, Red > 90%, Over > 100%. |
| Refresh window | Snowflake tasks 02:00 UTC; Sigma data sources 03:00 UTC; dashboards current by 03:15 UTC. |

### 3.1 Reference data observed in the source workbooks

| Dimension | Values present |
|---|---|
| GEO | Americas (15,906 lines), APAC (4,768), EMEA (3,106). 3P tracker also uses AMER and Global. |
| Teams (3P) | Engineering (11 contracts), Training Labs (6) |
| Top departments | 2138, 7030, 6140, 4988, 7130, 2283, 3190, 7120, 4210, 4280 (20+ codes) |
| ICO types | ENG, PEP, CTC, Sales Enablement, SERVICE (+ others on the ICO Type sheet) |
| Legacy volume | 267 orders, $2,541,756 total, FY2024 Q1 to FY2026 Q4, 265 CapEx / 2 OpEx |
| 3P volume | 17 contracts, $432,935 total, 13 OpEx / 4 CapEx, 8 term / 9 one-time |
| Vendors (3P) | Dell, Amazon, VMware, Keysight, Ekahau, Spirent, Pure Storage, Extreme Networks, Monoprice, CDW, HP |

## 4. Snowflake Build Script

Run in order in a Snowflake worksheet. Corrected version: the fiscal calendar functions, the ICO view structure and the variance join all differ from the earlier draft. Runtime under two minutes.

### 4.1 Database and schemas

```sql
USE DATABASE LAB_FORECAST;
CREATE SCHEMA IF NOT EXISTS STAGING;
CREATE SCHEMA IF NOT EXISTS REFERENCE;
CREATE SCHEMA IF NOT EXISTS TRANSFORMATION;
CREATE SCHEMA IF NOT EXISTS CONSOLIDATION;
CREATE SCHEMA IF NOT EXISTS REPORTING;
```

### 4.2 Fiscal calendar functions (corrected)

```sql
-- FY starts 1 July: month >= 7 belongs to the NEXT calendar year's FY.
-- July 2025 -> FY2026. Verified against 3P tracker and ICO file naming.
CREATE OR REPLACE FUNCTION TRANSFORMATION.GET_FISCAL_YEAR(d DATE)
RETURNS INT
LANGUAGE SQL
AS $$
  CASE WHEN MONTH(d) >= 7 THEN YEAR(d) + 1 ELSE YEAR(d) END
$$;

-- Fiscal quarter with a July start: Q1 Jul-Sep, Q2 Oct-Dec, Q3 Jan-Mar, Q4 Apr-Jun
CREATE OR REPLACE FUNCTION TRANSFORMATION.GET_FISCAL_QUARTER(d DATE)
RETURNS STRING
LANGUAGE SQL
AS $$
  'Q' || TO_VARCHAR(FLOOR(MOD(MONTH(d) + 5, 12) / 3) + 1)
$$;

-- Combined label matching the ICO file convention, e.g. FY26Q3
CREATE OR REPLACE FUNCTION TRANSFORMATION.GET_FYFQ(d DATE)
RETURNS STRING
LANGUAGE SQL
AS $$
  'FY' || RIGHT(TO_VARCHAR(CASE WHEN MONTH(d) >= 7 THEN YEAR(d) + 1 ELSE YEAR(d) END), 2)
  || 'Q' || TO_VARCHAR(FLOOR(MOD(MONTH(d) + 5, 12) / 3) + 1)
$$;

-- Sanity check: expect FY2026/Q1, FY2025/Q2, FY2025/Q1, FY2024/Q3
SELECT d,
       TRANSFORMATION.GET_FISCAL_YEAR(d)    AS FY,
       TRANSFORMATION.GET_FISCAL_QUARTER(d) AS FQ,
       TRANSFORMATION.GET_FYFQ(d)           AS FYFQ
FROM VALUES ('2025-07-01'::DATE), ('2024-12-15'::DATE),
            ('2024-07-19'::DATE), ('2024-03-06'::DATE) AS t(d);
```

### 4.3 Staging and reference tables

```sql
CREATE TABLE IF NOT EXISTS STAGING.ICO_ORDERS_RAW (
  ORDER_ID            VARCHAR NOT NULL,
  ORDER_SOURCE_FILE   VARCHAR,
  ORDER_DATE          DATE,
  ICO_TYPE            VARCHAR,
  DEPARTMENT          VARCHAR,
  ACCOUNT_CODE        VARCHAR,
  GEO                 VARCHAR,
  LINE_ITEM_NUMBER    INT,
  PART_NUMBER         VARCHAR,
  DESCRIPTION         VARCHAR,
  LOCKED_SUBTOTAL     DECIMAL(15,2),
  LOCKED_USE_TAX      DECIMAL(15,2),
  BUDGET_HIT          DECIMAL(15,2),   -- subtotal + use tax, frozen at approval
  SCHEDULED_SHIP_DATE DATE,
  ACTUAL_SHIP_DATE    DATE,
  SHIPPING_STATUS     VARCHAR,         -- CLOSED / AWAITING_SHIPPING / AWAITING_FULFILLMENT / BOOKED
  LOAD_TIMESTAMP      TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- FY/FQ arrive pre-assigned and frozen. Never recompute.
CREATE TABLE IF NOT EXISTS STAGING.LEGACY_ORDERS_RAW (
  SO_NUMBER        VARCHAR NOT NULL,
  REFERENCE_NUMBER VARCHAR,
  VENDOR           VARCHAR,
  PART             VARCHAR,
  TYPE             VARCHAR,            -- CapEx / OpEx
  TEAM             VARCHAR,
  GEO              VARCHAR,
  FISCAL_YEAR      INT,
  FISCAL_QUARTER   VARCHAR,
  BUDGET_HIT       DECIMAL(15,2),
  SOURCE           VARCHAR DEFAULT 'Legacy',
  LOAD_TIMESTAMP   TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Columns mirror Master_3P_Tracker.xlsx exactly
CREATE TABLE IF NOT EXISTS STAGING.THIRDPARTY_SPEND_RAW (
  REFERENCE_NUMBER VARCHAR NOT NULL,
  ORDER_DATE       DATE,
  VENDOR           VARCHAR,
  PART             VARCHAR,
  QUANTITY         DECIMAL(15,2),
  UNIT_COST        DECIMAL(15,2),
  TOTAL_COST       DECIMAL(15,2),
  TYPE             VARCHAR,            -- CapEx / OpEx
  TERM_EXPENSE     VARCHAR,            -- 'Yes' = amortise monthly, 'No' = single period
  CONTRACT_START   DATE,
  CONTRACT_END     DATE,
  TEAM             VARCHAR,
  GEO              VARCHAR,
  PROJECT_CODE     VARCHAR,
  ORDER_STATUS     VARCHAR,
  NOTES            VARCHAR,
  LOAD_TIMESTAMP   TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS STAGING.BUDGET_ALLOWANCES_RAW (
  FISCAL_YEAR     INT,
  FISCAL_QUARTER  VARCHAR,
  BUDGET_CATEGORY VARCHAR,
  QUARTER_BUDGET  DECIMAL(15,2),
  LOAD_TIMESTAMP  TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS REFERENCE.ACCOUNT_CATEGORY_MAPPING (
  ACCOUNT_CODE    VARCHAR NOT NULL PRIMARY KEY,
  BUDGET_CATEGORY VARCHAR NOT NULL,
  DEPARTMENT      VARCHAR,
  DESCRIPTION     VARCHAR,
  ACTIVE_FLAG     VARCHAR DEFAULT 'Y',
  LOAD_TIMESTAMP  TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Only these two are confirmed. Add the remaining 13 codes from Section 2.4
-- once Finance signs off; do not guess.
INSERT INTO REFERENCE.ACCOUNT_CATEGORY_MAPPING
  (ACCOUNT_CODE, BUDGET_CATEGORY, DESCRIPTION)
VALUES
  ('20050', 'CapEx', 'Lab capital equipment'),
  ('87165', 'OpEx',  'Lab operating expense');

-- Current allowance: CapEx 300k / OpEx 100k per quarter
INSERT INTO STAGING.BUDGET_ALLOWANCES_RAW
  (FISCAL_YEAR, FISCAL_QUARTER, BUDGET_CATEGORY, QUARTER_BUDGET)
SELECT fy, fq, cat, amt
FROM VALUES
  (2026,'Q1','CapEx',300000),(2026,'Q1','OpEx',100000),
  (2026,'Q2','CapEx',300000),(2026,'Q2','OpEx',100000),
  (2026,'Q3','CapEx',300000),(2026,'Q3','OpEx',100000),
  (2026,'Q4','CapEx',300000),(2026,'Q4','OpEx',100000)
AS t(fy, fq, cat, amt);
```

### 4.4 ICO transformation view (corrected)

The projection is wrapped in a CTE so derived fiscal columns can be filtered, and unmapped accounts are labelled `'Unmapped'` rather than silently dropped.

```sql
CREATE OR REPLACE VIEW TRANSFORMATION.ORDERS_TRANSFORMED_ICO AS
WITH base AS (
  SELECT
    'ICO' AS SOURCE,
    ico.ORDER_ID,
    ico.ORDER_DATE,
    ico.DEPARTMENT,
    ico.ACCOUNT_CODE,
    ico.LINE_ITEM_NUMBER,
    ico.DESCRIPTION,
    ico.BUDGET_HIT,
    COALESCE(ico.ACTUAL_SHIP_DATE, ico.SCHEDULED_SHIP_DATE) AS PLANNED_RECOGNITION_DATE,
    CASE
      WHEN ico.ACTUAL_SHIP_DATE    IS NOT NULL THEN 'Actual'
      WHEN ico.SCHEDULED_SHIP_DATE IS NOT NULL THEN 'Scheduled'
      ELSE 'Unscheduled'
    END AS RECOGNITION_TYPE,
    COALESCE(acm.BUDGET_CATEGORY, 'Unmapped') AS BUDGET_CATEGORY,
    ico.SHIPPING_STATUS,
    ico.SCHEDULED_SHIP_DATE,
    ico.ACTUAL_SHIP_DATE
  FROM STAGING.ICO_ORDERS_RAW ico
  LEFT JOIN REFERENCE.ACCOUNT_CATEGORY_MAPPING acm
    ON ico.ACCOUNT_CODE = acm.ACCOUNT_CODE
   AND acm.ACTIVE_FLAG  = 'Y'
  WHERE ico.BUDGET_HIT IS NOT NULL
)
SELECT
  SOURCE, ORDER_ID, ORDER_DATE, DEPARTMENT, ACCOUNT_CODE,
  LINE_ITEM_NUMBER, DESCRIPTION, BUDGET_HIT,
  PLANNED_RECOGNITION_DATE, RECOGNITION_TYPE,
  TRANSFORMATION.GET_FISCAL_YEAR(PLANNED_RECOGNITION_DATE)    AS FISCAL_YEAR,
  TRANSFORMATION.GET_FISCAL_QUARTER(PLANNED_RECOGNITION_DATE) AS FISCAL_QUARTER,
  TRANSFORMATION.GET_FYFQ(PLANNED_RECOGNITION_DATE)           AS FYFQ,
  BUDGET_CATEGORY, SHIPPING_STATUS,
  SCHEDULED_SHIP_DATE, ACTUAL_SHIP_DATE
FROM base;
```

### 4.5 Legacy transformation view

```sql
CREATE OR REPLACE VIEW TRANSFORMATION.ORDERS_TRANSFORMED_LEGACY AS
SELECT
  'Legacy'                      AS SOURCE,
  SO_NUMBER                     AS ORDER_ID,
  CAST(NULL AS DATE)            AS ORDER_DATE,
  TEAM                          AS DEPARTMENT,
  CAST(NULL AS VARCHAR)         AS ACCOUNT_CODE,
  1                             AS LINE_ITEM_NUMBER,
  PART                          AS DESCRIPTION,
  BUDGET_HIT,
  CAST(NULL AS DATE)            AS PLANNED_RECOGNITION_DATE,
  'Historical'                  AS RECOGNITION_TYPE,
  FISCAL_YEAR,                  -- pre-assigned, frozen
  FISCAL_QUARTER,               -- pre-assigned, frozen
  'FY' || RIGHT(TO_VARCHAR(FISCAL_YEAR), 2) || FISCAL_QUARTER AS FYFQ,
  TYPE                          AS BUDGET_CATEGORY,
  CAST(NULL AS VARCHAR)         AS SHIPPING_STATUS,
  CAST(NULL AS DATE)            AS SCHEDULED_SHIP_DATE,
  CAST(NULL AS DATE)            AS ACTUAL_SHIP_DATE
FROM STAGING.LEGACY_ORDERS_RAW
WHERE BUDGET_HIT IS NOT NULL
  AND FISCAL_YEAR IS NOT NULL
  AND FISCAL_QUARTER IS NOT NULL;
```

### 4.6 Third-party transformation view

Two branches: term contracts amortised evenly across every month in the term, and one-time purchases recognised in a single period. The month spine is anchored to each contract start rather than a hard-coded date, so contracts outside a fixed window are no longer dropped.

```sql
CREATE OR REPLACE VIEW TRANSFORMATION.ORDERS_TRANSFORMED_THIRDPARTY AS
WITH term_contracts AS (
  SELECT
    REFERENCE_NUMBER, VENDOR, PART, TYPE, TOTAL_COST, TEAM, GEO,
    CONTRACT_START, CONTRACT_END,
    GREATEST(
      DATEDIFF(MONTH, DATE_TRUNC('MONTH', CONTRACT_START),
                      DATE_TRUNC('MONTH', CONTRACT_END)) + 1, 1
    ) AS MONTHS_IN_TERM
  FROM STAGING.THIRDPARTY_SPEND_RAW
  WHERE TOTAL_COST     IS NOT NULL
    AND TERM_EXPENSE   = 'Yes'
    AND CONTRACT_START IS NOT NULL
    AND CONTRACT_END   IS NOT NULL
),
month_spine AS (
  SELECT
    c.*,
    DATEADD(MONTH, s.SEQ, DATE_TRUNC('MONTH', c.CONTRACT_START))::DATE AS MONTH_START
  FROM term_contracts c
  JOIN (
    SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1 AS SEQ
    FROM TABLE(GENERATOR(ROWCOUNT => 240))   -- supports terms up to 20 years
  ) s
    ON s.SEQ < c.MONTHS_IN_TERM
),
amortised AS (
  SELECT
    'ThirdParty'                                                  AS SOURCE,
    REFERENCE_NUMBER || '_' || TO_VARCHAR(MONTH_START,'YYYYMM')   AS ORDER_ID,
    CONTRACT_START                                                AS ORDER_DATE,
    TEAM                                                          AS DEPARTMENT,
    CAST(NULL AS VARCHAR)                                         AS ACCOUNT_CODE,
    ROW_NUMBER() OVER (PARTITION BY REFERENCE_NUMBER ORDER BY MONTH_START) AS LINE_ITEM_NUMBER,
    PART || ' (' || VENDOR || ')'                                 AS DESCRIPTION,
    ROUND(TOTAL_COST / MONTHS_IN_TERM, 2)                         AS BUDGET_HIT,
    MONTH_START                                                   AS PLANNED_RECOGNITION_DATE,
    'Amortized'                                                   AS RECOGNITION_TYPE,
    TYPE                                                          AS BUDGET_CATEGORY
  FROM month_spine
),
one_time AS (
  SELECT
    'ThirdParty'                                AS SOURCE,
    REFERENCE_NUMBER                            AS ORDER_ID,
    COALESCE(ORDER_DATE, CONTRACT_START)        AS ORDER_DATE,
    TEAM                                        AS DEPARTMENT,
    CAST(NULL AS VARCHAR)                       AS ACCOUNT_CODE,
    1                                           AS LINE_ITEM_NUMBER,
    PART || ' (' || VENDOR || ')'               AS DESCRIPTION,
    TOTAL_COST                                  AS BUDGET_HIT,
    COALESCE(ORDER_DATE, CONTRACT_START)        AS PLANNED_RECOGNITION_DATE,
    'One-Time'                                  AS RECOGNITION_TYPE,
    TYPE                                        AS BUDGET_CATEGORY
  FROM STAGING.THIRDPARTY_SPEND_RAW
  WHERE TOTAL_COST IS NOT NULL
    AND COALESCE(TERM_EXPENSE, 'No') <> 'Yes'
    AND COALESCE(ORDER_DATE, CONTRACT_START) IS NOT NULL
),
combined AS (
  SELECT * FROM amortised
  UNION ALL
  SELECT * FROM one_time
)
SELECT
  SOURCE, ORDER_ID, ORDER_DATE, DEPARTMENT, ACCOUNT_CODE,
  LINE_ITEM_NUMBER, DESCRIPTION, BUDGET_HIT,
  PLANNED_RECOGNITION_DATE, RECOGNITION_TYPE,
  TRANSFORMATION.GET_FISCAL_YEAR(PLANNED_RECOGNITION_DATE)    AS FISCAL_YEAR,
  TRANSFORMATION.GET_FISCAL_QUARTER(PLANNED_RECOGNITION_DATE) AS FISCAL_QUARTER,
  TRANSFORMATION.GET_FYFQ(PLANNED_RECOGNITION_DATE)           AS FYFQ,
  BUDGET_CATEGORY,
  CAST(NULL AS VARCHAR) AS SHIPPING_STATUS,
  CAST(NULL AS DATE)    AS SCHEDULED_SHIP_DATE,
  CAST(NULL AS DATE)    AS ACTUAL_SHIP_DATE
FROM combined;
```

### 4.7 Consolidation view (the fact table)

Columns are listed explicitly in all three branches so column order can never drift, which was the schema-mismatch failure mode in the Power Query model.

```sql
CREATE OR REPLACE VIEW CONSOLIDATION.GLOBAL_LAB_CONSOLIDATED_SPEND AS
SELECT SOURCE, ORDER_ID, ORDER_DATE, DEPARTMENT, ACCOUNT_CODE,
       LINE_ITEM_NUMBER, DESCRIPTION, BUDGET_HIT,
       PLANNED_RECOGNITION_DATE, RECOGNITION_TYPE,
       FISCAL_YEAR, FISCAL_QUARTER, FYFQ, BUDGET_CATEGORY,
       SHIPPING_STATUS, SCHEDULED_SHIP_DATE, ACTUAL_SHIP_DATE
FROM TRANSFORMATION.ORDERS_TRANSFORMED_ICO
UNION ALL
SELECT SOURCE, ORDER_ID, ORDER_DATE, DEPARTMENT, ACCOUNT_CODE,
       LINE_ITEM_NUMBER, DESCRIPTION, BUDGET_HIT,
       PLANNED_RECOGNITION_DATE, RECOGNITION_TYPE,
       FISCAL_YEAR, FISCAL_QUARTER, FYFQ, BUDGET_CATEGORY,
       SHIPPING_STATUS, SCHEDULED_SHIP_DATE, ACTUAL_SHIP_DATE
FROM TRANSFORMATION.ORDERS_TRANSFORMED_LEGACY
UNION ALL
SELECT SOURCE, ORDER_ID, ORDER_DATE, DEPARTMENT, ACCOUNT_CODE,
       LINE_ITEM_NUMBER, DESCRIPTION, BUDGET_HIT,
       PLANNED_RECOGNITION_DATE, RECOGNITION_TYPE,
       FISCAL_YEAR, FISCAL_QUARTER, FYFQ, BUDGET_CATEGORY,
       SHIPPING_STATUS, SCHEDULED_SHIP_DATE, ACTUAL_SHIP_DATE
FROM TRANSFORMATION.ORDERS_TRANSFORMED_THIRDPARTY;
```

### 4.8 Reporting views (the Sigma data sources)

```sql
-- 1. Budget pressure: spend rolled up by quarter, category and source
CREATE OR REPLACE VIEW REPORTING.BUDGET_PRESSURE_BY_QUARTER AS
SELECT
  FISCAL_YEAR,
  FISCAL_QUARTER,
  FYFQ,
  BUDGET_CATEGORY,
  SOURCE,
  COUNT(DISTINCT ORDER_ID)        AS ORDER_COUNT,
  SUM(BUDGET_HIT)                 AS TOTAL_SPEND,
  MIN(PLANNED_RECOGNITION_DATE)   AS EARLIEST_SHIP_DATE,
  MAX(PLANNED_RECOGNITION_DATE)   AS LATEST_SHIP_DATE
FROM CONSOLIDATION.GLOBAL_LAB_CONSOLIDATED_SPEND
WHERE FISCAL_YEAR IS NOT NULL
GROUP BY 1,2,3,4,5;

-- 2. Budget variance: FULL OUTER JOIN so budgeted quarters with no spend
--    still appear (forward quarters Finance needs to see)
CREATE OR REPLACE VIEW REPORTING.BUDGET_VARIANCE_WITH_ALLOWANCES AS
WITH spend AS (
  SELECT FISCAL_YEAR, FISCAL_QUARTER, BUDGET_CATEGORY,
         SUM(BUDGET_HIT) AS ACTUAL_SPEND
  FROM CONSOLIDATION.GLOBAL_LAB_CONSOLIDATED_SPEND
  WHERE FISCAL_YEAR IS NOT NULL
    AND BUDGET_CATEGORY IN ('CapEx','OpEx')
  GROUP BY 1,2,3
)
SELECT
  COALESCE(s.FISCAL_YEAR,     b.FISCAL_YEAR)     AS FISCAL_YEAR,
  COALESCE(s.FISCAL_QUARTER,  b.FISCAL_QUARTER)  AS FISCAL_QUARTER,
  COALESCE(s.BUDGET_CATEGORY, b.BUDGET_CATEGORY) AS BUDGET_CATEGORY,
  b.QUARTER_BUDGET,
  COALESCE(s.ACTUAL_SPEND, 0)                    AS ACTUAL_SPEND,
  b.QUARTER_BUDGET - COALESCE(s.ACTUAL_SPEND, 0) AS REMAINING_BUDGET,
  ROUND(100.0 * COALESCE(s.ACTUAL_SPEND, 0) / NULLIF(b.QUARTER_BUDGET, 0), 1) AS PCT_OF_BUDGET,
  CASE
    WHEN b.QUARTER_BUDGET IS NULL                          THEN 'No Budget Set'
    WHEN COALESCE(s.ACTUAL_SPEND,0) >  b.QUARTER_BUDGET        THEN 'Over'
    WHEN COALESCE(s.ACTUAL_SPEND,0) >  b.QUARTER_BUDGET * 0.9  THEN 'Red'
    WHEN COALESCE(s.ACTUAL_SPEND,0) >  b.QUARTER_BUDGET * 0.7  THEN 'Yellow'
    ELSE 'Green'
  END AS STATUS
FROM spend s
FULL OUTER JOIN STAGING.BUDGET_ALLOWANCES_RAW b
  ON  s.FISCAL_YEAR     = b.FISCAL_YEAR
  AND s.FISCAL_QUARTER  = b.FISCAL_QUARTER
  AND s.BUDGET_CATEGORY = b.BUDGET_CATEGORY;

-- 3. Active orders: anything not yet actually shipped
CREATE OR REPLACE VIEW REPORTING.ACTIVE_ORDERS_DETAIL AS
SELECT
  SOURCE, ORDER_ID, DESCRIPTION, DEPARTMENT, ACCOUNT_CODE, BUDGET_HIT,
  PLANNED_RECOGNITION_DATE, RECOGNITION_TYPE,
  FISCAL_YEAR, FISCAL_QUARTER, FYFQ, BUDGET_CATEGORY,
  SHIPPING_STATUS, SCHEDULED_SHIP_DATE, ACTUAL_SHIP_DATE,
  DATEDIFF(DAY, CURRENT_DATE(), PLANNED_RECOGNITION_DATE) AS DAYS_TO_SHIP,
  CASE
    WHEN PLANNED_RECOGNITION_DATE IS NULL THEN 'Unscheduled'
    WHEN DATEDIFF(DAY, CURRENT_DATE(), PLANNED_RECOGNITION_DATE) <  0  THEN 'Overdue'
    WHEN DATEDIFF(DAY, CURRENT_DATE(), PLANNED_RECOGNITION_DATE) <= 7  THEN '0-7 Days'
    WHEN DATEDIFF(DAY, CURRENT_DATE(), PLANNED_RECOGNITION_DATE) <= 14 THEN '8-14 Days'
    WHEN DATEDIFF(DAY, CURRENT_DATE(), PLANNED_RECOGNITION_DATE) <= 30 THEN '15-30 Days'
    ELSE '30+ Days'
  END AS SHIP_BUCKET
FROM CONSOLIDATION.GLOBAL_LAB_CONSOLIDATED_SPEND
WHERE ACTUAL_SHIP_DATE IS NULL;

-- 4. Forecast scenarios: driven off a scenario table rather than four
--    repeated UNION blocks, so adding a scenario is a one-line change
CREATE OR REPLACE VIEW REPORTING.FORECAST_SCENARIOS AS
WITH scenarios AS (
  SELECT 'Baseline' AS SCENARIO, 0 AS SLIP_DAYS
  UNION ALL SELECT 'Slip 7 Days',  7
  UNION ALL SELECT 'Slip 14 Days', 14
  UNION ALL SELECT 'Slip 30 Days', 30
),
open_orders AS (
  SELECT SOURCE, ORDER_ID, BUDGET_HIT,
         PLANNED_RECOGNITION_DATE, BUDGET_CATEGORY
  FROM CONSOLIDATION.GLOBAL_LAB_CONSOLIDATED_SPEND
  WHERE ACTUAL_SHIP_DATE IS NULL            -- shipped orders cannot move
    AND PLANNED_RECOGNITION_DATE IS NOT NULL
),
shifted AS (
  SELECT
    s.SCENARIO, s.SLIP_DAYS, o.ORDER_ID, o.BUDGET_HIT, o.BUDGET_CATEGORY,
    DATEADD(DAY, s.SLIP_DAYS, o.PLANNED_RECOGNITION_DATE) AS SHIFTED_DATE
  FROM open_orders o
  CROSS JOIN scenarios s
)
SELECT
  SCENARIO,
  SLIP_DAYS,
  TRANSFORMATION.GET_FISCAL_YEAR(SHIFTED_DATE)    AS FISCAL_YEAR,
  TRANSFORMATION.GET_FISCAL_QUARTER(SHIFTED_DATE) AS FISCAL_QUARTER,
  TRANSFORMATION.GET_FYFQ(SHIFTED_DATE)           AS FYFQ,
  BUDGET_CATEGORY,
  COUNT(DISTINCT ORDER_ID) AS ORDER_COUNT,
  SUM(BUDGET_HIT)          AS PROJECTED_SPEND
FROM shifted
GROUP BY 1,2,3,4,5,6;

-- 5. Data quality: keeps excluded rows visible instead of silent
CREATE OR REPLACE VIEW REPORTING.DATA_QUALITY_SUMMARY AS
SELECT 'Unmapped account code' AS ISSUE, 'High' AS PRIORITY,
       SOURCE, COUNT(*) AS ROW_COUNT, SUM(BUDGET_HIT) AS AFFECTED_SPEND
FROM CONSOLIDATION.GLOBAL_LAB_CONSOLIDATED_SPEND
WHERE BUDGET_CATEGORY = 'Unmapped'
GROUP BY 1,2,3
UNION ALL
SELECT 'Missing recognition date', 'High',
       SOURCE, COUNT(*), SUM(BUDGET_HIT)
FROM CONSOLIDATION.GLOBAL_LAB_CONSOLIDATED_SPEND
WHERE PLANNED_RECOGNITION_DATE IS NULL
  AND RECOGNITION_TYPE <> 'Historical'
GROUP BY 1,2,3
UNION ALL
SELECT 'Missing fiscal year', 'High',
       SOURCE, COUNT(*), SUM(BUDGET_HIT)
FROM CONSOLIDATION.GLOBAL_LAB_CONSOLIDATED_SPEND
WHERE FISCAL_YEAR IS NULL
GROUP BY 1,2,3
UNION ALL
SELECT 'Zero or negative budget hit', 'Medium',
       SOURCE, COUNT(*), SUM(BUDGET_HIT)
FROM CONSOLIDATION.GLOBAL_LAB_CONSOLIDATED_SPEND
WHERE BUDGET_HIT <= 0
GROUP BY 1,2,3;
```

### 4.9 Reconciliation query

Run against the Excel Budget Presentation pivot before building anything in Sigma. Totals must agree by FY, FQ, category and source.

```sql
SELECT FISCAL_YEAR, FISCAL_QUARTER, BUDGET_CATEGORY, SOURCE,
       COUNT(*) AS LINE_COUNT,
       SUM(BUDGET_HIT) AS TOTAL_SPEND
FROM CONSOLIDATION.GLOBAL_LAB_CONSOLIDATED_SPEND
WHERE FISCAL_YEAR IN (2025, 2026)
GROUP BY 1,2,3,4
ORDER BY FISCAL_YEAR DESC, FISCAL_QUARTER DESC, BUDGET_CATEGORY, SOURCE;

-- Known control totals from the current workbooks:
--   Legacy_Orders : 267 rows, 2,541,755.70
--   3P tracker    : 17 contracts, 432,935.44 gross before amortisation
```

## 5. Sigma Setup

### 5.1 Connection

1. Sigma, Administration, Connections, Add Connection, Snowflake.
2. Account: the Extreme Snowflake account URL. Warehouse `COMPUTE_WH`. Database `LAB_FORECAST`. Schema `REPORTING`.
3. Authentication: OAuth preferred, or a service account with USAGE on the warehouse and database plus SELECT on the REPORTING schema.
4. Test connection, then save.

```sql
-- Minimum grants for the Sigma service role
GRANT USAGE  ON WAREHOUSE COMPUTE_WH TO ROLE SIGMA_READER;
GRANT USAGE  ON DATABASE  LAB_FORECAST TO ROLE SIGMA_READER;
GRANT USAGE  ON SCHEMA    LAB_FORECAST.REPORTING TO ROLE SIGMA_READER;
GRANT SELECT ON ALL VIEWS IN SCHEMA LAB_FORECAST.REPORTING TO ROLE SIGMA_READER;
GRANT SELECT ON FUTURE VIEWS IN SCHEMA LAB_FORECAST.REPORTING TO ROLE SIGMA_READER;
```

### 5.2 Data sources to publish

One Sigma data source per reporting view. Let Sigma auto-detect the schema, then confirm column types; currency columns arriving as text is the most common cause of broken aggregation.

| Sigma data source | Snowflake view | Type checks |
|---|---|---|
| Budget Pressure by Quarter | REPORTING.BUDGET_PRESSURE_BY_QUARTER | TOTAL_SPEND = Number; FISCAL_YEAR = Number; FYFQ = Text |
| Budget Variance | REPORTING.BUDGET_VARIANCE_WITH_ALLOWANCES | QUARTER_BUDGET, ACTUAL_SPEND, REMAINING_BUDGET, PCT_OF_BUDGET = Number |
| Active Orders Detail | REPORTING.ACTIVE_ORDERS_DETAIL | DAYS_TO_SHIP = Number; ship dates = Date; SHIP_BUCKET = Text |
| Forecast Scenarios | REPORTING.FORECAST_SCENARIOS | PROJECTED_SPEND = Number; SLIP_DAYS = Number |
| Data Quality Summary | REPORTING.DATA_QUALITY_SUMMARY | ROW_COUNT, AFFECTED_SPEND = Number |

### 5.3 Shared workbook controls

Workbook-level controls so one selection drives every element on the page. Keep control IDs lowercase and hyphenated exactly as below; Sigma formulas reference controls by ID, so renaming one later silently breaks formulas.

| Control | Type | Control ID | Default |
|---|---|---|---|
| Fiscal Year | List (multi) | fiscal-year | Current FY |
| Fiscal Quarter | Segmented | fiscal-quarter | All |
| Budget Category | Segmented | budget-category | All |
| Source | List (multi) | source | All (ICO, Legacy, ThirdParty) |
| Scenario | List (single) | scenario | Baseline |
| Days to Ship | Slider range | days-to-ship | -30 to 90 |

### 5.4 Sigma formulas

Confirm function names in the editor autocomplete; Sigma occasionally renames functions between releases.

| Calculated column | Formula |
|---|---|
| Days To Ship | `DateDiff("day", Today(), [Planned Recognition Date])` |
| Ship Bucket | `If([Days To Ship] < 0, "Overdue", If([Days To Ship] <= 7, "0-7 Days", If([Days To Ship] <= 14, "8-14 Days", If([Days To Ship] <= 30, "15-30 Days", "30+ Days"))))` |
| Budget Status | `If([Pct Of Budget] > 100, "Over", If([Pct Of Budget] > 90, "Red", If([Pct Of Budget] > 70, "Yellow", "Green")))` |
| Status Icon | `If([Budget Status] = "Green", "✓", If([Budget Status] = "Yellow", "⚠", "✗"))` |
| Shipping Status Label | `If([Shipping Status] = "CLOSED", "Shipped", If([Shipping Status] = "AWAITING_SHIPPING", "Awaiting Shipping", If([Shipping Status] = "AWAITING_FULFILLMENT", "Awaiting Fulfilment", If([Shipping Status] = "BOOKED", "Booked", "Unknown"))))` |
| Baseline Spend | `Sum(If([Scenario] = "Baseline", [Projected Spend], 0))` |
| Scenario Spend | `Sum(If([Scenario] = [Control: scenario], [Projected Spend], 0))` |
| Delta $ | `[Scenario Spend] - [Baseline Spend]` |
| Delta % | `If([Baseline Spend] = 0, 0, Round(100 * [Delta $] / [Baseline Spend], 1))` |

## 6. Dashboard 1: Finance / Budget Pressure

Workbook "Lab Budget Forecast - Finance". Executive view of quarterly budget pressure, variance and spend trend. Users: Finance leads, Lab leadership. One page (Budget Overview). Sources: Budget Pressure by Quarter, Budget Variance.

Layout, top to bottom: controls (Fiscal Year, Fiscal Quarter, Category, Source); three KPIs (Current Q Spend, Remaining, % of Budget Used); Budget Variance table (50%) beside Spend by Source donut (50%); Spend Trend by Quarter stacked bars (full width); Data Quality banner (only visible when unmapped spend > 0).

- **KPI 1 Current Quarter Spend:** `Sum([Total Spend])` from Budget Pressure by Quarter. Currency, 0 decimals. Filter to the latest FY/FQ or respect the controls. Subtitle is the FYFQ label, e.g. FY26Q3.
- **KPI 2 Remaining Budget:** `Sum([Remaining Budget])` from Budget Variance. Green above $100k, yellow $50k-$100k, red below $50k, dark red if negative.
- **KPI 3 Percent of Budget Used:** `Round(100 * Sum([Actual Spend]) / Sum([Quarter Budget]), 1)`. Red above 90, yellow 70-90, green below 70.
- **Budget Variance table:** FY, Quarter, Category (blue CapEx, orange OpEx), Allowed, Actual, Remaining (red if negative; yellow if under 20% of allowance), % Used, Status badge (Green check, Yellow warning, Red cross, Over). Sort FY desc, quarter desc, category asc. Page size 20. CSV export on (Finance requires it).
- **Donut, Spend by Source:** group by SOURCE, value `Sum([Total Spend])`. Colours ICO #4472C4, Legacy #7F7F7F, ThirdParty #ED7D31. Labels show percent and source; tooltip shows dollars.
- **Stacked bars, Spend Trend:** X = FYFQ chronological, Y = `Sum([Total Spend])`, series = BUDGET_CATEGORY. CapEx #4472C4, OpEx #ED7D31. Data labels on totals. Optional reference line at the quarterly allowance.
- **Data quality banner:** Data Quality Summary filtered to ISSUE = "Unmapped account code", single-value element with conditional visibility.

## 7. Dashboard 2: Active Orders & Shipping

Workbook "Lab Forecast - Active Orders & Shipping". Track open orders, shipping status and projected recognition dates. Users: Lab operations, procurement. Page 1 Active Orders, Page 2 Ship Forecast. Source: Active Orders Detail.

**Page 1.** Controls: Source, Shipping Status, Days to Ship range. Then a full-width sortable Active Orders table.

| Column | Field | Format / conditional formatting |
|---|---|---|
| Order ID | ORDER_ID | Text, links to detail |
| Description | DESCRIPTION | Truncate 40 chars |
| Department | DEPARTMENT | Text |
| Budget $ | BUDGET_HIT | Currency |
| Scheduled Ship | SCHEDULED_SHIP_DATE | MM/DD/YYYY; red if past, orange if within 7 days |
| Recognition Q | FYFQ | Text |
| Category | BUDGET_CATEGORY | Badge: blue CapEx, orange OpEx, grey Unmapped |
| Status | Shipping Status Label | Badge: blue Booked, yellow Awaiting, green Shipped |
| Days to Ship | DAYS_TO_SHIP | Red if negative; orange if 0-7 |

Default sort DAYS_TO_SHIP ascending. Page size 50. Row background red when overdue, orange when due within 7 days. The Shipping Status control uses the raw Snowflake values (CLOSED, AWAITING_SHIPPING, AWAITING_FULFILLMENT, BOOKED) and displays the friendly label; default excludes CLOSED.

**Page 2, Ship Forecast.** Category control and KPI Total Open Order Value. Heatmap: rows FYFQ, columns BUDGET_CATEGORY, value `Sum([Budget Hit])`; scale white $0, light blue to $50k, medium blue $50k-$200k, dark blue above $200k; dollar amount in each cell, tooltip adds order count. Histogram: X = SHIP_BUCKET ordered Overdue, 0-7, 8-14, 15-30, 30+; Y = `CountDistinct([Order ID])`; red Overdue, orange 0-7, blue for the rest; counts as labels.

## 8. Dashboard 3: Forecast Scenarios

Workbook "Lab Forecast - Scenario Analysis". Model the impact of shipping delays on quarterly budget recognition. Users: Finance planning, Lab leadership. One page. Source: Forecast Scenarios.

- **Scenario selector:** single-select, ID `scenario`. Values Baseline, Slip 7 Days, Slip 14 Days, Slip 30 Days. Default Baseline. Drives the comparison columns, not a whole-element filter, so baseline and scenario sit side by side.
- **Scenario comparison table:** FYFQ (group header), Category, Baseline $, Scenario $, Delta $ (red negative, green positive), Delta %. Group and collapse by FYFQ. Sort FY desc, quarter desc, category asc.
- **Waterfall:** Baseline total, Pulled Forward (green), Pushed Back (red), Scenario total. Responds to the Category control.
- **Gauge, % of current quarter budget shifted:** `Round(100 * ([Baseline Spend] - [Scenario Spend]) / [Baseline Spend], 1)` for the current FY/FQ. Green below 5%, yellow 5-15%, red above 15%.

**Interpretation note.** `FORECAST_SCENARIOS` only contains orders that have not shipped, because shipped spend cannot move. Its baseline is therefore lower than total quarter spend on Dashboard 1. If Finance wants full-quarter scenario totals, add the already-shipped amount as a fixed floor per quarter and label it clearly.

**Worked examples.**
- All orders slip 14 days: orders scheduled in the last two weeks of a quarter move into the next quarter. Current quarter drops, next rises by the same amount; net total across quarters unchanged.
- 3P renewal slips 30 days: every monthly amortisation bucket for that contract shifts one month. The first quarter of the term loses one month of cost; the final quarter gains one.
- Expedite a lab refresh: not modelled by the slip scenarios (needs negative slip days). Add a "Pull forward 14 days" row to the scenarios CTE if Finance wants it.

## 9. Refresh, Embedding and Access

### 9.1 Daily schedule

| Time (UTC) | System | Action |
|---|---|---|
| 02:00 | Snowflake | LOAD_ICO_ORDERS: merge new and changed ICO lines |
| 02:10 | Snowflake | LOAD_LEGACY_ORDERS: truncate and reload (frozen history) |
| 02:20 | Snowflake | LOAD_THIRDPARTY_SPEND: merge contract changes |
| - | Snowflake | Views need no refresh; they read staging directly |
| 03:00 | Sigma | Data source refresh on all five sources, cache TTL 24 hours |
| 03:15 | Sigma | Dashboards serving current data |

```sql
-- Create tasks suspended, verify a manual run, then resume
CREATE OR REPLACE TASK STAGING.LOAD_ICO_ORDERS
  WAREHOUSE = COMPUTE_WH
  SCHEDULE  = 'USING CRON 0 2 * * * UTC'
AS
MERGE INTO STAGING.ICO_ORDERS_RAW t
USING (
  SELECT * FROM SOURCE_SYSTEM.ICO_ORDERS   -- replace with the real source
  WHERE LOAD_DATE >= DATEADD(DAY, -1, CURRENT_DATE())
) s
ON t.ORDER_ID = s.ORDER_ID AND t.LINE_ITEM_NUMBER = s.LINE_ITEM_NUMBER
WHEN MATCHED THEN UPDATE SET
  ACTUAL_SHIP_DATE    = s.ACTUAL_SHIP_DATE,
  SCHEDULED_SHIP_DATE = s.SCHEDULED_SHIP_DATE,
  SHIPPING_STATUS     = s.SHIPPING_STATUS,
  LOAD_TIMESTAMP      = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT *;
-- ALTER TASK STAGING.LOAD_ICO_ORDERS RESUME;
```

**Do not merge on ORDER_ID alone.** ICO orders are multi-line; the same SO number appears across many part lines. Merging on ORDER_ID only collapses an order to a single line and understates spend. The composite key `ORDER_ID + LINE_ITEM_NUMBER` is required.

### 9.2 Source integration still to be decided

| Source | Today | Target |
|---|---|---|
| ICO orders | Individual Excel forms in SharePoint 02_Orders_History, parsed by fx_ExtractICO | Direct scheduled extract from the order system. Source system not yet confirmed; the main open dependency. |
| Shipping data | Details View export dropped into 04_Shipping_Data | Same export via COPY INTO, or direct query if the order system exposes it |
| Legacy orders | Master_Tracking_Workbook tab | One-time CSV load, then refresh only when history is corrected |
| 3P contracts | Master_3P_Tracker.xlsx | Monthly CSV load, or Power Automate on file change |
| Budget allowances | Budget_Allowance sheet | Manual quarterly update by Finance |

### 9.3 SharePoint embedding

1. In Sigma, open the workbook, Share, enable embedding, copy the embed link.
2. On the SharePoint page, add an Embed web part and paste the URL.
3. If the web part is blocked, ask the SharePoint admin to allow `app.sigmacomputing.com` as an embed source.

```html
<iframe src="https://app.sigmacomputing.com/embed/<workbook-id>"
        style="width:100%; height:900px; border:none;"></iframe>
```

### 9.4 Permissions

| Role | Access |
|---|---|
| Admin / Owner | Dan Brown: edit workbooks and data sources |
| Editor | Finance lead: modify dashboards |
| Viewer | Finance team, Lab operations: filter, drill, export CSV |
| Viewer (no export) | Apply if any account-level detail is deemed sensitive |

### 9.5 Fallback

- Keep the Excel model frozen as a read-only backup for 30 days after go-live.
- If a Snowflake load fails, Sigma serves stale cached data; add a "data as of" timestamp element to every dashboard.
- Configure a Snowflake notification integration to email or Slack the owner on task failure.

## 10. Rollout Plan

| Phase | Duration | Activities | Exit criteria |
|---|---|---|---|
| 1 Foundation | 2 weeks | Provision LAB_FORECAST; run Section 4 script; resolve the 13 unmapped account codes; load 2 years of history; reconcile against Excel pivots | Totals agree within +/-1% by FY/FQ/category/source |
| 2 Sigma build | 1 week | Connect Sigma; publish 5 data sources; build the three dashboards; QA slicers, charts, exports, load time | Sigma figures match Excel; every dashboard loads in under 5 seconds |
| 3 Integration | 3-4 days | Wire staging tables to source systems; enable Snowflake tasks; configure Sigma refresh and failure alerting | Daily refresh completes unattended; alert fires on induced failure |
| 4 Launch | 2-3 days | Embed in SharePoint; train Finance and Lab teams; freeze the Excel model | Teams using Sigma; no manual Excel exports |
| Buffer | 3-5 days | Contingency for reconciliation gaps and retraining | n/a |

### 10.1 Validation checklist

- [ ] All Snowflake objects create without error, including the three fiscal functions
- [ ] Fiscal calendar sanity check returns FY2026/Q1, FY2025/Q2, FY2025/Q1, FY2024/Q3
- [ ] Legacy load returns 267 rows totalling $2,541,755.70
- [ ] 3P amortisation sums back to the contract totals (gross $432,935.44)
- [ ] DATA_QUALITY_SUMMARY shows zero rows for "Unmapped account code"
- [ ] Reconciliation query matches the Excel Budget Presentation pivot by FY/FQ/category/source
- [ ] All five Sigma data sources publish with correct column types
- [ ] Every control filters every element on its page, no blank results
- [ ] KPI cards show the correct current quarter
- [ ] Variance table shows Green / Yellow / Red / Over correctly, including negative remaining
- [ ] Budgeted future quarters with no spend still appear in the variance table
- [ ] Active Orders sorts overdue first and row shading is correct
- [ ] Slip 7 / 14 / 30 scenarios move spend between quarters and the net total is unchanged
- [ ] Each dashboard loads in under 5 seconds
- [ ] CSV export works from every table
- [ ] Dashboards render inside the SharePoint page without iframe errors
- [ ] Daily refresh completes and dashboards are current by 03:15 UTC
- [ ] Viewers can filter and drill but cannot edit underlying data

### 10.2 Open decisions

| # | Question | Why it blocks |
|---|---|---|
| 1 | CapEx or OpEx for the 13 unmapped account codes? | Roughly 2,500 shipping lines are excluded from variance reporting until answered |
| 2 | Which system is the authoritative source for ICO orders? | Phase 3 automation cannot be built without it; SharePoint form parsing is the fallback |
| 3 | Should unscheduled orders be forced into a quarter or left as an exception? | Changes whether quarter totals are complete or conservative |
| 4 | Are the quarterly allowances still $300k CapEx / $100k OpEx for FY26 and FY27? | Every status colour and remaining-budget figure depends on it |
| 5 | Should the scenario baseline include already-shipped spend? | Determines whether Dashboard 3 baseline ties to Dashboard 1 |
| 6 | Is a "pull forward" scenario needed alongside the slip scenarios? | One extra row in the scenarios CTE if yes |
| 7 | Do legacy FY/FQ assignments for pre-FY2024 orders need correcting? | Some older records appear bucketed into FY2024 Q1 rather than their true ship quarter |

Sources listed in the document: Lab_Forecast_Sigma_Snowflake_Design.md, snowflake_lab_forecast_implementation.sql, Sigma_Dashboard_Configuration_Guide.md, IMPLEMENTATION_ROADMAP.md, Global_Labs_Budget_Technical_Architecture, Global_Labs_Budget_Model_Playbook, ICO_Goals_and_Objectives, Master_Tracking_Workbook.xlsx, Master_Tracking_Workbook_Build_1_0.xlsx, Master_3P_Tracker.xlsx, Global_Labs_ICO_Budget_Model.xlsx, ICO_query_information_.xlsx, Internal_Consumption_Form__Query_Template.xlsx.
