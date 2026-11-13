# Global Lab Budget Tracker

The source of truth for the Global Lab budget (depts 7030, 7110, 7120, 7130, 7140). The Sigma workbook is retired.

- Artifact: https://claude.ai/artifact/G15yu1y4MHoQUPTggoF85b
- Version: build 2 (2026-11-13), published as artifact version 10 (id 1794604283-eb06)
- Weekly refresh: scheduled task "Global Lab Budget Tracker weekly refresh", Wednesdays 6:41am ET. It needs the Snowflake connector added to the task in claude.ai to run.
- Owner: Dan Brown

## What it shows

ICO orders and third-party requisitions against the quarterly CapEx and OpEx allowances, with three timing views (Budget quarter, GL timing, Order placed), a Count switch (Orders, + 3P CapEx, + all 3P), projects and the $5K asset test, a watch list, third-party requisitions in USD, and contract renewals.

## Layout

| Path | What it is |
|---|---|
| `src/parts/style.css`, `src/parts/body.html`, `src/parts/app.js` | Page source. Edit these, never `dist/`. |
| `src/settings.js` | Business rules: allowances, approved account list, asset threshold, $30K support rule, FX rates, projects, manual project assignments, third-party landing overrides, contracts. Edit here when Finance confirms something. |
| `src/data.js` | Generated snapshot of EDNA data. Do not edit by hand. |
| `sql/orders.sql`, `sql/procurement.sql` | The two Snowflake queries. `{START}` is July 1 two fiscal years back. Keep in step with `ORDER_SQL` and `TP_SQL` in `app.js`. |
| `raw/` | Saved Snowflake results used to build `src/data.js`. |
| `tools/make_data.js` | Builds `src/data.js` from the saved results. |
| `tools/build.py` | Assembles `dist/index.html`, `dist/settings.js`, `dist/data.js`, stamps the build, escapes to ASCII. |
| `tools/harness.js` | jsdom checks: every view reconciles, Count switch, departments, projects, watch list, contracts, live refresh with two connector envelopes. |
| `dist/` | What gets published. Three files. |
| `src/page.live-2026-11-03.html`, `src/data.prev-2026-10-07.js` | The page and data as they were before build 2, kept for reference and as the third-party fallback. |

## Refresh the data (weekly, Wednesday)

1. Run `sql/orders.sql` with `{START}` replaced (for FY27 that is `2025-07-01`) through the Snowflake `sales-sql-executor` tool. Save the raw result to `raw/orders_<date>.json`. The result is large, so the tool saves it to a file; copy that file.
2. Run `sql/procurement.sql` the same way and save it to `raw/procurement_<date>.json`. If it returns zero rows (it does on the Claude service connection as of 2026-11-13, a row access policy), pass `-` instead and the last good third-party rows are carried with their original date. The page says so on the watch list.
3. Build data, build the page, run the harness:

```bash
node tools/make_data.js raw/orders_<date>.json raw/procurement_<date>.json src/data.js src/data.js <date>
```

```bash
python3 -I tools/build.py . "build N (<date>)"
```

```bash
NODE_PATH=<folder with jsdom 24.1.3>/node_modules node tools/harness.js dist raw/orders_<date>.json
```

The harness must end with `errors: []`. Note: `make_data.js` reads the previous `src/data.js` for the third-party fallback, so pass the current one as the third argument before it is overwritten (the script reads it before writing).

4. Publish `dist/index.html` with `dist/settings.js` and `dist/data.js` as supporting files to the artifact URL above. Read the artifact first.

## Data map

| Data | Where it lives | Backup |
|---|---|---|
| Orders and lines | EDNA `CONS_INSIGHTS_MART.EDNA_ORDER_MANAGEMENT_REPORT` | `raw/` and `src/data.js` in this repo |
| Third-party requisitions | EDNA `CONS_INSIGHTS_MART.EDNA_PROCUREMENT` | `src/data.js` in this repo |
| Rules (allowances, accounts, FX, projects, contracts) | `src/settings.js` in this repo | git history |
| Maintenance flags and term dates | Brandon's `3P Requisitions.xlsx` on the Lab Operations SharePoint, copied into `settings.js` | SharePoint version history |
| Viewer settings (quarter, timing, count) | Each viewer's browser | none needed |

## Open items with Finance (as of 2026-11-13)

- What account 20020 is (project 7000400 uses it) and the approved account list.
- FX rate source for converting third-party spend.
- Whether the GL relieves ICO cost per shipped line or per order.
- FY27 allowances.
- Whether the $100K OpEx allowance covers third-party OpEx.
- Whether PRIN10000235 duplicates PRIN10000209.
