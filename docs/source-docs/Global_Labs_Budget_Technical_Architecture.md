# Global Labs Budget & Order Tracking - Technical Architecture

Source: SharePoint, `Desktop/Extreme Info/ICO Buildout Docs/Excel Buildout/Global_Labs_Budget_Technical_Architecture.docx` (modified 2025-11-04). Text extracted from the Word document.

## Executive Summary

End-to-end design of the Global Labs budget and order tracking model built in Power Query within Excel. It unifies orders from internal consumables (ICO), legacy records, and third-party expenses into a single consolidated spend fact table for budget analysis and variance reporting. It covers source ingestion, transformation steps, assumptions, known issues, and current status.

## Design Goals & Constraints

- Centralize disparate order data into a single fact model accessible across the organization.
- Support existing reporting (Budget Presentation pivot, Variance & Pressure analysis) without redesign.
- Derive consistent attributes (CapEx/OpEx) across heterogeneous source systems.
- Keep refresh performance reasonable; avoid overly complex steps.
- Use only native Power Query operations, no external dependencies.
- Respect data privacy and access control: lock down the SharePoint source and internal data.

## Source Systems

- **ICO orders:** SharePoint files parsed via the `fx_ExtractICO` function into `Orders_Internal_Header` and `Orders_OrderLevel_Cost`. Path: `Global Lab Budget & Order Tracking/02_Orders_History`. Fields: Order Number (extracted), Fiscal Year, Fiscal Quarter, Order Total Cost, Account, etc.
- **Legacy orders:** Excel table `Legacy_Orders` in the workbook or imported from another file. Columns: Reference Number (Order Number), Vendor, Part, Type, Team, Geo, Fiscal Year, Fiscal Quarter, Budget Hit, Source.
- **Third-party unified budget:** built off a `Third_Party_Base` table after amortizing multi-period expenses; derives Fiscal Year, Fiscal Quarter, Budget Hit and includes PO number, Vendor, etc.
- **Auxiliary tables:** `Account_Category_Mapping` (Account to Budget Category), `Department_GEO_Mapping` (Department code to GEO).

## Query-by-Query Breakdown

- **Orders_Internal_Header:** connects to SharePoint.Files, filters to the orders history folder, renames fields, extracts header fields via `fx_ExtractICO`. Outputs Order Number, ICO Type, GEO, Department, Account, Locked SubTotal, Locked Use Tax, Locked Total Cost.
- **Orders_OrderLevel_Cost:** parses line-level cost fields for ICO orders into detailed rows with Part, Unit Cost, Total Cost; derives Fiscal Year and Quarter later if needed; carries Account for type derivation.
- **Legacy_Orders:** reads the embedded Excel table. Converts types for Reference Number, Vendor, Part, Type, Team, Geo, Fiscal Year, Fiscal Quarter, Budget Hit, Source. If the download fails, downstream queries break.
- **Third_Party_Unified_Budget:** selects amortized and one-time third-party purchases, computes Fiscal Year and Quarter from order or contract dates, apportions costs across periods where appropriate, then unifies the two branches. Fields: PO Number, Vendor, Part, Type, Team, Geo, Fiscal Year, Fiscal Quarter, Budget Hit. Also sets FYFQ.
- **Global_Lab_Consolidated_Spend:** core union. Removes errors from `Orders_OrderLevel_Cost`, looks up Account to get Type via `Account_Category_Mapping`, unifies with `Legacy_Orders` and `Third_Party_Unified_Budget`. Identical schema: Fiscal Year, Fiscal Quarter, Type (CapEx/OpEx or null), Budget Hit, Source. Sorts and filters null rows.
- **Budget_Variance_Alerts:** groups consolidated spend by FY, FQ, Type and sums Budget Hit. Annotates with Allowance (300k CapEx, 100k OpEx), computes Remaining Budget and a Status flag.
- **Budget_Pressure_Fact_AllCosts:** selects fields from Consolidated, renames Type to Budget Category (the pivot requires that name), filters to CapEx/OpEx, groups by FY, FQ, Category, Source, sums Budget Hit. Input to the pivot on the Budget Presentation sheet.

## Data Flow

`Orders_Internal_Header` and `Orders_OrderLevel_Cost` feed Consolidated. `Legacy_Orders` feeds Consolidated. `Third_Party_Unified_Budget` feeds Consolidated. Consolidated feeds the Variance and Pressure tables, then the PivotTable reports. All three sources converge in `Global_Lab_Consolidated_Spend` via `Table.Combine`.

## Assumptions Locked During Build

- Account codes map deterministically to CapEx vs OpEx (20050 = CapEx, 87165 = OpEx) via `Account_Category_Mapping`.
- Legacy data encodes Type explicitly.
- Third-party nightly amortization is correct.
- Fiscal Year runs July to June, FY = year of quarter end: if month >= 7 then Year + 1 else Year.
- Rows with missing Fiscal Quarter are ignored.
- Requests import with numeric Reference Numbers aligned to IDs when needed.

## Known Failure Modes

- If an upstream source such as `Legacy_Orders` fails to load ("Download did not complete"), Consolidated misses that branch and the pivot shows only third-party lines.
- If schemas diverge (for example a missing Type column), `Table.Combine` errors.
- If `fx_ExtractICO` fails to parse content, those orders are removed (RemoveRowsWithErrors).
- Partial refreshes: if the internet or SharePoint is unavailable, only some data loads. Errors block downstream processing.

## Current Status & Open Items (as of the doc)

- Consolidated and Variance queries refresh correctly when all sources load.
- The error "We couldn't get the data from Orders_Budget_Pressure_2" is caused by `Legacy_Orders` not downloading completely.
- Open: find out why `Legacy_Orders` fails (SharePoint permission, file name change, or credentials).
- Open: confirm the Account_Channel mapping covers all new accounts.
- Open: test that all transformations handle nulls.
- Future: error logging, optional budget categories, more GEO/Team support.
