# Global Labs ICO Budget Model - Technical Blueprint & SOP Guide, v1.1 (Rebuild-Ready)

Source: `Microsoft Copilot Chat Files/ICO Budget Model Document.docx` (modified 2026-04-01). Owner: Global Lab Operations. System author: Dan Brown. Text extracted from the Word document.

## 1. Executive Summary

An Excel Desktop + Power Query system giving a single source of truth for lab spend across ICO (Internal Consumption Orders), Third-Party (3P) purchases, and Legacy historical orders. It solves four problems: fragmented cost tracking across spreadsheets and emails; accidental re-costing of approved orders; inconsistent fiscal quarter recognition; lack of auditability and rebuild documentation.

It enforces historical cost locking, quarterly budget recognition, clear CapEx/OpEx classification, and repeatable rebuild from documented M code only.

## 2. Non-Negotiable Design Principles (Locked)

Implemented in code, not policy.

1. Excel Desktop only (Power Query SharePoint connector required).
2. All transformation logic lives in Power Query.
3. No Excel formulas for business logic.
4. ICO, 3P, and Legacy tables are FACT tables.
5. Once an order is Closed, it is never recalculated.
6. Legacy orders already contain locked FY/FQ.
7. Functional naming only (Src_, Stg_, Fact_, Rpt_, DQ_, fx_).
8. All queries except Fact_ and Rpt_ are Connection-Only.
9. Every query is documented with full M code.

## 3. Architecture

```
SharePoint
 |- ICO Forms (immutable historical artifacts)
 |- Shipping exports (Details View)
 |- ICO Pricing (newest master)
 |- 3P Tracker
Power Query
 |- Src_*   raw extraction
 |- Stg_*   cleaning / normalization
 |- Fact_*  business rules + locking
 |- DQ_*    exceptions, visibility
 |- Rpt_*   presentation
Excel output tabs
```

## 4. SharePoint Folder Structure (Locked)

```
/Shared Documents/Global Lab Budget & Order Tracking/
 |- 01_Master_ICO          latest pricing only
 |- 02_Orders_History      approved ICO forms, immutable
 |- 04_Shipping_Data       Details View exports
 |- 05_Lead_Time           Product Availability
 |- 07_Third_Party_Orders  3P tracker
```

Rules: archive old ICO pricing files elsewhere; Orders_History holds approved ICOs only; never rename files once consumed.

## 5. Fiscal & Budget Rules (Authoritative)

- Fiscal year July to June. Q1 = Jul-Sep, Q2 = Oct-Dec, Q3 = Jan-Mar, Q4 = Apr-Jun.
- Cost recognition: the entire order cost hits the final quarter only.
- Forecasting: Actual Ship Date if Closed, Scheduled Ship Date if Open.
- Default allowances: CapEx $300,000 per quarter, OpEx $100,000 per quarter.

## 6. Naming Standards

| Prefix | Meaning |
|---|---|
| Src_ | Raw source ingestion |
| Stg_ | Cleaned/normalized |
| Fact_ | Locked authoritative facts |
| DQ_ | Data quality checks |
| Rpt_ | Reporting / dashboards |
| fx_ | Reusable functions |

## 7. Query Inventory and Full M Code

### Parameter: p_SharePoint_SiteUrl

```m
let
    Value = "https://extremenetworks2com.sharepoint.com/sites/services-lab-operations"
in
    Value
```

### fx_GetNewestSharePointFile

```m
(siteUrl as text, folderPathFragment as text, optional nameLike as nullable text, optional ext as nullable text) as record =>
let
    Src = SharePoint.Files(siteUrl, [ApiVersion = 15]),
    Clean =
        Table.SelectRows(
            Src,
            each [Content] <> null
                and [Attributes]?[Hidden]? <> true
                and not Text.StartsWith([Name], "~$")
                and Text.Contains(Text.Lower([Folder Path]), Text.Lower(folderPathFragment))
        ),
    NameFilter =
        if nameLike <> null then
            Table.SelectRows(Clean, each Text.Contains(Text.Lower([Name]), Text.Lower(nameLike)))
        else
            Clean,
    ExtFilter =
        if ext <> null then
            Table.SelectRows(NameFilter, each Text.Lower([Extension]) = Text.Lower(ext))
        else
            NameFilter,
    Sorted = Table.Sort(ExtFilter, {{"Date modified", Order.Descending}}),
    Result =
        if Table.RowCount(Sorted) = 0 then
            error "No file found for " & folderPathFragment
        else
            Sorted{0}
in
    Result
```

### Src_ICO_Pricing_Current

```m
let
    Site = p_SharePoint_SiteUrl,
    File = fx_GetNewestSharePointFile(Site, "/01_Master_ICO/", null, ".xlsx"),
    WB = Excel.Workbook(File[Content], null, true),
    SC = WB{[Item="SC", Kind="Sheet"]}[Data],
    Promoted = Table.PromoteHeaders(SC, [PromoteAllScalars=true]),
    Selected = Table.SelectColumns(Promoted, {"Part #", "Description", "Cost"}),
    Renamed = Table.RenameColumns(Selected, {
        {"Part #", "Part Number"},
        {"Cost", "Unit Cost"}
    }),
    Clean = Table.TransformColumns(Renamed, {
        {"Part Number", each Text.Upper(Text.Trim(Text.From(_))), type text}
    }),
    Typed = Table.TransformColumnTypes(Clean, {{"Unit Cost", Currency.Type}})
in
    Typed
```

### Src_LeadTime_Current

```m
let
    Site = p_SharePoint_SiteUrl,
    File = fx_GetNewestSharePointFile(Site, "/05_Lead_Time/", null, ".xlsx"),
    WB = Excel.Workbook(File[Content], null, true),
    Sheet = WB{[Item="Planning Lead Time", Kind="Sheet"]}[Data],
    Skip = Table.Skip(Sheet, 5),
    Promoted = Table.PromoteHeaders(Skip, [PromoteAllScalars=true]),
    Selected = Table.SelectColumns(Promoted, {"MKTG#", "Planning Lead Time…", "Item status"}),
    Renamed = Table.RenameColumns(Selected, {
        {"MKTG#", "Part Number"},
        {"Planning Lead Time…", "Lead Time (Weeks)"}
    }),
    Clean = Table.TransformColumns(Renamed, {
        {"Part Number", each Text.Upper(Text.Trim(Text.From(_))), type text}
    })
in
    Clean
```

### Src_Legacy_Orders (worksheet table)

```m
let
    Src = Excel.CurrentWorkbook(){[Name="tbl_Legacy"]}[Content],
    Typed = Table.TransformColumnTypes(Src, {
        {"Reference Number", type text},
        {"Fiscal Year", Int64.Type},
        {"Fiscal Quarter", type text},
        {"Budget Hit", Currency.Type}
    }),
    Source = Table.AddColumn(Typed, "Source", each "Legacy", type text)
in
    Source
```

### Fact_ICO_Recognition

```m
let
    Orders = Src_ICO_Forms_AllHeaders,
    Shipping = Src_Shipping_Details_Current,

    ShipAgg =
        Table.Group(
            Shipping,
            {"Order Number"},
            {
                {"Final Actual Ship Date", each List.Max([Actual Ship Date]), type nullable date},
                {"Scheduled Ship Date", each List.Max([Schedule Ship Date]), type nullable date},
                {"Ordered", each List.Sum([Ordered Quantity]), Int64.Type},
                {"Shipped", each List.Sum([Shipped Quantity]), Int64.Type}
            }
        ),

    Joined =
        Table.NestedJoin(Orders, {"SO Number"}, ShipAgg, {"Order Number"}, "Ship", JoinKind.LeftOuter),

    Expanded = Table.ExpandTableColumn(Joined, "Ship",
        {"Final Actual Ship Date", "Scheduled Ship Date", "Ordered", "Shipped"}),

    Status =
        Table.AddColumn(Expanded, "Shipping Status",
            each if [Shipped] >= [Ordered] then "Closed" else "Open", type text),

    Recognition =
        Table.AddColumn(Status, "Planned Recognition Date",
            each if [Shipping Status] = "Closed"
                 then [Final Actual Ship Date]
                 else [Scheduled Ship Date],
            type date),

    FY =
        Table.AddColumn(Recognition, "Fiscal Year",
            each if Date.Month([Planned Recognition Date]) >= 7
                 then Date.Year([Planned Recognition Date]) + 1
                 else Date.Year([Planned Recognition Date]),
            Int64.Type),

    FQ =
        Table.AddColumn(FY, "Fiscal Quarter",
            each
                let m = Date.Month([Planned Recognition Date]) in
                if m >= 7 and m <= 9 then "Q1"
                else if m >= 10 then "Q2"
                else if m <= 3 then "Q3"
                else "Q4",
            type text),

    Final =
        Table.SelectColumns(FQ, {"SO Number", "Fiscal Year", "Fiscal Quarter", "Locked Total Cost"}),

    Renamed = Table.RenameColumns(Final, {{"Locked Total Cost", "Budget Hit"}}),
    Source = Table.AddColumn(Renamed, "Source", each "ICO", type text)
in
    Source
```

### Fact_3P_Recognition

One-time purchases locked; term amortization can be added later without touching COGS logic.

```m
let
    Base = Src_3P_Base,
    Filtered = Table.SelectRows(Base, each [Total Cost] <> null),
    Budget = Table.AddColumn(Filtered, "Budget Hit", each [Total Cost], Currency.Type),
    FY = Table.AddColumn(Budget, "Fiscal Year", each
        if Date.Month([Order Date]) >= 7
        then Date.Year([Order Date]) + 1
        else Date.Year([Order Date]), Int64.Type),
    FQ = Table.AddColumn(FY, "Fiscal Quarter", each
        let m = Date.Month([Order Date]) in
        if m >= 7 and m <= 9 then "Q1"
        else if m >= 10 then "Q2"
        else if m <= 3 then "Q3"
        else "Q4", type text),
    Final = Table.SelectColumns(FQ, {"Reference Number", "Fiscal Year", "Fiscal Quarter", "Budget Hit"}),
    Source = Table.AddColumn(Final, "Source", each "3P", type text)
in
    Source
```

### Fact_Consolidated_Spend

```m
let
    Combined = Table.Combine({
        Fact_ICO_Recognition,
        Fact_3P_Recognition,
        Src_Legacy_Orders
    })
in
    Combined
```

### DQ_Open_Orders_With_No_Date

```m
let
    Src = Fact_ICO_Recognition,
    Issues = Table.SelectRows(Src, each [Fiscal Year] = null or [Fiscal Quarter] = null)
in
    Issues
```

### DQ_Legacy_Without_FYFQ

```m
let
    Src = Src_Legacy_Orders,
    Issues = Table.SelectRows(Src, each [Fiscal Year] = null or [Fiscal Quarter] = null)
in
    Issues
```

### Rpt_Budget_Pressure

```m
let
    Src = Fact_Consolidated_Spend,
    Grouped = Table.Group(
        Src,
        {"Fiscal Year", "Fiscal Quarter"},
        {{"Quarter Spend", each List.Sum([Budget Hit]), Currency.Type}}
    )
in
    Grouped
```

## 8. SOP - Day-to-Day Operation

1. Upload new ICO form to `02_Orders_History`.
2. Upload newest Shipping export to `04_Shipping_Data`.
3. Upload new pricing quarterly to `01_Master_ICO`.
4. Open Excel Desktop.
5. Refresh All.
6. Review Data Quality tabs.
7. Closed orders remain locked forever.

## 9. Rebuild SOP (From Scratch)

1. Create a new blank Excel file.
2. Add parameters.
3. Add fx functions.
4. Add Src queries.
5. Add Fact queries.
6. Add DQ queries.
7. Add Rpt queries.
8. Enable Load ONLY for Fact/DQ/Rpt.
9. Save the workbook.

## 10. Versioning Rule

All changes require a code update, a document update, and a version increment (v1.2, v1.3, ...).

Next step noted in the source: reconcile against a real rebuild, capture every exception, and lock v1.2 as operationally proven.
