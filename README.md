# Global Lab Financials

Working repo for the Global Lab budget tracker and the documents behind it. Owner: Dan Brown.

## Layout

| Path | What it is |
|---|---|
| `global-lab-budget-tracker/` | The published Claude artifact "Global Lab Budget Tracker" (`index.html`, `data.js`). Pulls live ICO order data from Snowflake (`EDNA_ORDER_MANAGEMENT_REPORT`). CapEx $300K and OpEx $100K per quarter, depts 7030, 7110, 7120, 7130, 7140. |
| `lab-forecast-engine-teardown/` | The published Claude artifact "Lab Forecast Engine Teardown" (`index.html`). |
| `docs/source-docs/` | Design and handoff documents pulled from SharePoint / Copilot Chat Files. See index below. |

Artifact URLs:
- Budget Tracker: https://claude.ai/artifact/G15yu1y4MHoQUPTggoF85b
- Forecast Engine Teardown: https://claude.ai/artifact/JtEoTT2RZyUxyAhpRVQk25

The repo copy is a working copy. Changes here do not reach the live artifact until it is republished.

## Source document index

| File | Original | Notes |
|---|---|---|
| `Global_Labs_Budget_Technical_Architecture.md` | `Global_Labs_Budget_Technical_Architecture.docx` | Power Query model design, failure modes |
| `Global_Labs_Budget_Model_Build_Dependency_Map.md` | `Global_Labs_Budget_Model_Build_Dependency_Map.pptx` | Query layers and error propagation |
| `ICO_Budget_Model_Document_v1.1.md` | `ICO Budget Model Document.docx` | Blueprint and SOP v1.1 with full M code |
| `Global_Labs_ICO_Budget_Model_Technical_Blueprint_SOP_Guide.txt` | `Global Labs ICO Budget Model - Technical Blueprint & SOP Guide.docx` | Raw text extract, unformatted |
| `Global_Labs_Budget_Tracker_Handoff_v1.1.1.txt` | `Global_Labs_Budget_Tracker_Handoff_v1.1.1.docx` | Raw text extract, unformatted. Generated from the embedded Power Query mashup. |
| `Lab_Forecast_Sigma_Build_Spec.md` | `Lab_Forecast_Sigma_Build_Spec.docx` | Snowflake + Sigma build, corrected SQL, open decisions |
| `Global_Lab_ICO_Automation_Project_Description.md` | `Project_Description_Global_Lab_ICO.docx` | ICO automation scope, roles, next steps |

## Not yet saved here

- `Lab_NPI Budget Management Build 1.0.docx` (Master Tracking Workbook goals and per-query documentation). Found on SharePoint, read, not yet copied.
- The Excel workbooks themselves (Master_Tracking_Workbook, Master_3P_Tracker, Global_Labs_ICO_Budget_Model) were not found in the search.
- Related email threads (for example "Global Lab Budget Tracker: how the dashboard works", "PRIN Requisitions - MPA End Date").
