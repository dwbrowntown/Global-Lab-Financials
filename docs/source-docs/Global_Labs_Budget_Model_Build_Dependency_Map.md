# Global Labs Budget Model - Build & Dependency Map

Source: SharePoint, `Desktop/Extreme Info/ICO Buildout Docs/Excel Buildout/Global_Labs_Budget_Model_Build_Dependency_Map.pptx`. Text extracted from the slides.

## Data Sources

- ICO: SharePoint files, extracted via `fx_ExtractICO` into `Orders_Internal_Header` and `Orders_OrderLevel_Cost`.
- Legacy: internal Excel table `Legacy_Orders`, the basis of legacy records.
- Third Party: `Third_Party_Base`, amortized into `Third_Party_Unified_Budget`.
- Auxiliary: `Account_Category_Mapping`, `Department_GEO_Mapping`.

## Query Layers

Source extraction, then Transformations, then Consolidation, then Reporting Aggregates.

- `Orders_Internal_*`: parse SharePoint files into usable tables.
- `Legacy_Orders`: read from the workbook.
- `Third_Party_Unified_Budget`: amortize third-party expenses.
- `Global_Lab_Consolidated_Spend`: union all sources with matching schema.

## Dependencies

`Global_Lab_Consolidated_Spend` depends on the ICO queries (`Orders_OrderLevel_Cost` and Header), `Legacy_Orders`, `Third_Party_Unified_Budget`, and `Account_Category_Mapping`.

## Error Propagation

- If `Legacy_Orders` fails: Consolidated includes only ICO and third-party, so the pivot shows only third-party.
- If ICO parse fails: ICO is missing; reports reflect Legacy and 3P.
- If Third Party errors: the unify step is missing 3P; other groups remain.
- `Table.Combine` needs matching schema; a missing Type causes an error if not added.

## Status & Next Steps

- Status: Consolidated model stable, except subscription failures on `Legacy_Orders`.
- Next: resolve the download error on `Legacy_Orders`.
- Verify all branches contribute rows to Consolidated.
- Refresh all reporting queries and verify expected outputs.
