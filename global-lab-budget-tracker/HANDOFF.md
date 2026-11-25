# Handoff: Global Lab Budget Tracker (2026-11-25)

**Goal:** Get third-party (procurement) data flowing into the Global Lab Budget Tracker again, then keep it refreshing weekly.

**Artifact (source of truth, Sigma retired):** https://claude.ai/artifact/G15yu1y4MHoQUPTggoF85b
**Source:** GitHub `dwbrowntown/Global-Lab-Financials`, branch `claude/hopeful-turing-13udq9`, folder `global-lab-budget-tracker`. Read its README first. Edit `src/`, never `dist/`. Build with `tools/build.py`, test with `tools/harness.js` (must end `errors: []`), then publish `dist/` to the artifact URL.

**Rules (locked):**
- An order's full cost hits the quarter its last part ships; scheduled ship date until it ships; past-due rolls to the current quarter.
- CapEx = new asset over $5K, one asset per project per site. OpEx = everything else.
- Maintenance is OpEx, spread over its term. Finance: $30K+/yr prepaid and amortized; under $30K expensed when posted.
- Allowance $300K CapEx / $100K OpEx per quarter. Third-party counts, but only lines marked Dan's (`tpOwner` in `src/settings.js`).

**Current state:**
- Build 4, artifact version 12. Orders refreshed Nov 25 (211 orders). FY27 Q2: CapEx $256,767 (86%), OpEx $47,046 (47%).
- Third-party rows are carried from Oct 7. `EDNA_PROCUREMENT` returns 0 rows for DABROWN@EXTREMENETWORKS.COM on role EDNA_BUS_SALES_OPS_RO. Access request drafted to Taylor Merine, Michael Hammer, Harris Tucker and Piyali Saha (cc DJ).
- Weekly refresh task "Global Lab Budget Tracker weekly refresh" (Wed 6:41am ET) runs without a Snowflake connector, so it does nothing. Dan needs to add Snowflake to it in claude.ai.

**Open questions:**
- DJ: do the third-party lines raised by others ($537K, mostly Ireland maintenance: Scaltel, Infoguard, Jcubedata) count against Dan? Email sent Nov 13.
- Finance: account 20020, FX rate source, FY27 allowance confirmation, GL relief per line or per order.
- PRIN10000235 vs 10000209 duplicate and unit price.

**Next steps for the new chat:**
1. Confirm Snowflake is connected. Run `SELECT COUNT(*) FROM EDNA.CONS_INSIGHTS_MART.EDNA_PROCUREMENT` and `SELECT CURRENT_ROLE()`.
2. Open the artifact link and press Refresh from Snowflake. If the top bar says "3P data carried", procurement is still blocked.
3. If rows come back: run the README "Refresh the data" steps with `sql/procurement.sql`, rebuild, run the harness, publish, commit and push.
4. Update `tpOwner` in `src/settings.js` once DJ answers, then republish.
