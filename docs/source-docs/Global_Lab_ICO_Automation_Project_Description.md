# Global Lab ICO Automation - Project Description

Source: SharePoint, `Project_Description_Global_Lab_ICO.docx` (modified 2026-03-30). Text extracted from the Word document.

## Purpose

Implement a scalable, automated, auditable process for Internal Consumption Orders (ICOs) for the Global Labs. Move from fragmented spreadsheets and manual approvals to an end-to-end workflow using Excel, SharePoint, Power Automate, and analytics (Sigma or Power BI).

## Business Problem

The current Lab ICO process is manual, with disconnected spreadsheets, Smartsheets and email threads. Tracking shipping, consolidating budgets, enforcing cost freeze and approvals, forecasting spend by quarter, and auditing orders is painful and error prone. Status is inconsistent, emails get lost, and there is no single source of truth.

## Current State & Inputs

- Five Smartsheet tabs consolidated into one Smartsheet by hand. Formula consolidation is error prone.
- Excel prototype: a Power Query Master Tracking workbook connecting to pricing, orders history, and shipping exports.
- SE Automation: a proven automated workflow exists for SE ICOs (list price form, backend conversion to COGS, multi-step approval routing via Power Automate, admin notifications). This is the template.
- Lab Ops: global lab equipment orders come from techs, operations, and Facilities and need central budget management. Only one person (Dan) currently authorizes costs; Finance and OM then finalize.
- Lab Ops Owner Group defines accountability (lead Brandon Clay; global Lab Ops owner Dan Brown; site techs; support groups).

## Objectives

- Automate submission, validation and workflow of ICOs.
- Freeze costs at submission.
- Enforce approvals (Lab Ops, Finance, OM) and escalate when thresholds are exceeded.
- Provide end-to-end tracking and an audit trail.
- Integrate shipping/SO data for true delivery status and quarter recognition.
- Enable accurate forecasting and consolidated reporting.

## Organizational Structure

- **Submitters:** Lab Technicians (global), Lab Operations, GTAC Lab Support, Facilities, Training Lab Owners.
- **Owners:** Brandon Clay (Lab Ops Lead), Dan Brown (Global Lab Ops & Budget owner), site techs.
- **Support:** Facilities/IT, Training Lab Owners.
- **Reviewers:** Finance team, Order Management (OM).
- **Executive escalation:** Kevin when cost thresholds are exceeded. Not needed currently.
- **Restricted:** only designated groups may submit, analogous to SE ICO permissions.

## Cross-Functional Collaboration

SE Automation team (Arushi) for automation patterns; IT (Steve) for workflow triggers and SharePoint connectors; Finance for budget hit timing and quarter recognition; Order Management for SO assignment and OM integration; Shipping for SCR/SO data on lead time and delivered cost; Lab Ops Owner Group for users, roles and requirements; Leadership for alignment.

## Architecture Design

- **SharePoint:** canonical folders for pricing (`01_Master_ICO`), archived orders (`02_Orders_History`), reference files and templates (`03_Reference`), shipping exports (`04_Shipping_Data`).
- **Excel:** ICO template and Prep Tool, connecting via Power Query to pricing, history and shipping for cost estimation and freeze.
- **Power Automate:** triggers on file creation to run multi-step approval flows (Lab Ops, then Finance, then OM; conditional escalate to Kevin), write back metadata, send notifications.
- **Power Query:** consolidation queries combining all orders and shipping into a Master Tracking dataset; dynamic lead times; estimated arrival and quarter impact.
- **Analytics:** Sigma or Power BI dashboards for Finance, OM, Lab Ops and leadership; live refresh, role-based views, spend forecasting, pipeline analysis.

## Requirements Summary

- Submitter list and role-based restrictions.
- Metadata fields: Submitter, Dept, Account, Total Cost, Dates (Submitted, Approved), SO Number, Status.
- Approval chain: Dan (Lab Ops), then Finance, then OM; escalate to Kevin if cost exceeds threshold.
- Notifications: Submitter, Dan, Finance, OM, Admin (errors).
- Data integration: pricing file, orders history, shipping exports, consistent schema.
- Form validation: required fields, current version.
- Analytics scope: spend by quarter, forecast vs actuals, pipeline, cycle time, lead time variance.

## Benefits & Impact

- Saves about 35 to 45 labor hours per month (420 to 540 hours per year).
- Unified view of orders and spend across global labs.
- Fewer errors and less rework.
- Accurate quarterly forecasting (cost hits on last ship date).
- Better approval latency and accountability.
- Central budget control that scales across regions and service groups.

## Risks & Open Questions

(Section is empty in the source document.)

## Next Steps

1. Finalize user list, roles, and metadata requirements.
2. Write and approve a formal requirements specification with Arushi and IT.
3. Build SharePoint site and folder structure; assign permissions.
4. Finalize the ICO Excel template and PQ engine.
5. Implement and test the Power Automate flow.
6. Integrate shipping data.
7. Build initial analytics in Sigma/Power BI.
8. Pilot the system, collect feedback, iterate.
9. Train stakeholders.
10. Expand to additional service areas.
