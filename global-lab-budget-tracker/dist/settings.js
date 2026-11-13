/* Global Lab Budget Tracker settings.
   This file holds every business rule the page uses that Finance or Dan can change without touching the page code.
   Edit here, rebuild with tools/build.py, and republish. Status values: 'confirmed' (Finance signed off),
   'pending' (in use, waiting on Finance), 'proposed' (Dan's working assumption, not yet confirmed). */
window.LAB_SETTINGS = {
  version: '2026-11-13b',

  /* Quarterly allowance by fiscal year. 'default' applies to any year not listed. */
  allowances: {
    FY26: { CapEx: 300000, OpEx: 100000, status: 'confirmed' },
    FY27: { CapEx: 300000, OpEx: 100000, status: 'pending', note: 'Carried forward from FY26. Waiting on Finance to confirm FY27.' },
    default: { CapEx: 300000, OpEx: 100000, status: 'pending' }
  },

  /* Approved account list. The envelope comes from here, not from the account prefix.
     An account that is not listed falls back to the prefix rule (2xxxx CapEx, otherwise OpEx) and is flagged on the watch list. */
  accounts: {
    '20050': { cat: 'CapEx', desc: 'Fixed Assets Clearing', status: 'confirmed', note: 'Anne reviews 20050 monthly and reclasses support lines per the $30K rule.' },
    '20020': { cat: 'CapEx', desc: 'To confirm (used by project 7000400)', status: 'pending' },
    '20040': { cat: 'CapEx', desc: 'To confirm', status: 'pending' },
    '20500': { cat: 'CapEx', desc: 'Likely a miskey of 20050', status: 'flag', note: 'Not a known lab account. Check the order and correct the account.' },
    '87165': { cat: 'OpEx', desc: 'Lab operating expense', status: 'confirmed' },
    '87100': { cat: 'OpEx', desc: 'Computer Expense', status: 'pending' },
    '87120': { cat: 'OpEx', desc: 'Equipment Repairs & Maint', status: 'pending' },
    '87140': { cat: 'OpEx', desc: 'To confirm', status: 'pending' },
    '87160': { cat: 'OpEx', desc: 'Software and Software Maintenance', status: 'pending' },
    '89150': { cat: 'OpEx', desc: 'Evaluation Units', status: 'pending' },
    '89170': { cat: 'OpEx', desc: 'Prototype Materials', status: 'pending' },
    '89180': { cat: 'OpEx', desc: 'Beta Materials', status: 'pending' },
    '89260': { cat: 'OpEx', desc: 'Software Licensing', status: 'pending' },
    '89270': { cat: 'OpEx', desc: 'Lab Equipment', status: 'pending' }
  },

  /* Finance's asset test: a new asset over this amount, one asset per project per location. */
  assetMin: 5000,

  /* Anne's rule for support and maintenance on third-party spend: at or above this annual amount it goes to prepaid
     and is amortized monthly over the term; below it, it is expensed when posted. */
  supportAmortizeMin: 30000,

  /* Days before the snapshot counts as stale. */
  staleDays: 8,

  /* USD per unit of currency. Provisional until Finance gives the rate source to use. */
  fx: {
    status: 'provisional', asOf: '2026-11-13', note: 'Provisional planning rates, not Finance rates. INR uses the rupee rate Dan used for the Chennai colo quote on Sep 21 (95.85 per USD).',
    rates: { USD: 1, INR: 0.010433, EUR: 1.16, GBP: 1.33, JPY: 0.0066, BRL: 0.185 }
  },

  /* Requisitions with currency code 0: the currency is inferred from the requisition number format. */
  currencyByReq: [
    { re: '^PRUS', ccy: 'USD' }, { re: '^PRIN', ccy: 'INR' }, { re: '^PRGB', ccy: 'GBP' }, { re: '^PRJP', ccy: 'JPY' }, { re: '^PRBR', ccy: 'BRL' },
    { re: '^10\\d{6}$', ccy: 'USD' }, { re: '^#*600\\d{3}$', ccy: 'GBP' }, { re: '^5100\\d{7}$', ccy: 'JPY' }, { re: '^40\\d{4}$', ccy: 'INR' }
  ],

  /* Projects. One asset per project per location (department). 'since' is the date from which orders at the same
     location with no project code are listed as possible members. */
  projects: {
    '7000400': { name: 'Chennai Training Lab', loc: '7120', since: '2026-07-01', status: 'proposed', note: 'Name per Dan. Project code seen on 82 Chennai orders from Oct 28.' },
    '7000200': { name: 'Project 7000200', loc: '', since: '2026-11-01', status: 'pending', note: 'One order, dept 7030 shipping to Ireland. Name and site to confirm.' }
  },

  /* Orders or requisitions assigned to a project by hand when the system has no project code on them. */
  assign: {
    'PRIN10000209': { project: '7000400', status: 'proposed', note: 'Chennai Training Lab equipment (Lantronix terminal servers), per Dan Oct 20.' },
    'PRIN10000210': { project: '7000400', status: 'proposed', note: 'Chennai Training Lab equipment (Palo Alto PA-3420), per Dan Oct 20.' },
    'PRIN10000213': { project: '7000400', status: 'proposed', note: 'Chennai Training Lab equipment (HPE DL380), per Dan Oct 20.' },
    'PRIN10000234': { project: '7000400', status: 'proposed', note: 'Chennai Training Lab equipment (APC rack PDUs), per Dan Oct 20.' },
    'PRIN10000170': { project: '7000400', status: 'proposed', note: 'Chennai Training Lab cables and power cords, per Dan Oct 20.' }
  },

  /* Where a requisition's cost lands when it is not the approval date.
     land: 'open' rolls with the current quarter until it is received, like a past-due order.
     date: planned receipt date. hold: excluded from every total. */
  tpLanding: {
    'PRIN10000210': { land: 'open', note: 'Timing plan approved by Dan Nov 13: Palo Alto PA-3420s received in FY27 Q2.' },
    'PRIN10000209': { date: '2027-01-15', note: 'Timing plan approved by Dan Nov 13: Lantronix received in FY27 Q3. Confirm with procurement.' },
    'PRIN10000213': { date: '2027-01-15', note: 'Timing plan approved by Dan Nov 13: HPE DL380s received in FY27 Q3. Confirm with procurement.' },
    'PRIN10000235': { hold: true, note: 'No PO issued. Dan is checking whether it duplicates PRIN10000209 (unit price differs: about 455K vs 2.15M INR).' },
    'PRUS10002240': { hold: true, note: 'Returned and rejected by Corporate Procurement as a duplicate requisition (Charles Pitchaimani, Aug 27; confirmed in the Duplicate Keysight PO thread).' }
  },

  /* Whose budget a requisition belongs to. Only 'mine' counts against the lab allowance.
     'check' is shown with its total so Dan can place it; 'notMine' is shown but never counted.
     Approver names are not readable in EDNA on this connection, so this is set from the requester and Dan's mailbox. */
  tpOwner: {
    byRequester: {
      'Dan Brown': 'mine',
      'Scott Groff': 'mine',
      'Kathryn Darbyshire': 'notMine'
    },
    byReq: {},
    notes: {
      'Scott Groff': 'GTAC lab requisitions from before Dan took over from Scott.',
      'Kathryn Darbyshire': 'Training budget ($82K earmarked; Colossyan is training content), per DJ Sep 23.'
    },
    default: 'check'
  },

  /* Per-order changes Dan has approved that EDNA does not show yet (the GL reclass is Finance's step). */
  orderOverrides: {
    '36576': { cat: 'CapEx', project: '7000400', status: 'requested', note: 'Chennai Training Lab gear coded to OpEx 87165. Reclass to CapEx under 7000400 approved by Dan Nov 13; Finance to reclass.' },
    '36577': { cat: 'CapEx', project: '7000400', status: 'requested', note: 'Chennai Training Lab gear coded to OpEx 87165. Reclass to CapEx under 7000400 approved by Dan Nov 13; Finance to reclass.' },
    '36579': { cat: 'CapEx', project: '7000400', status: 'requested', note: 'Chennai Training Lab gear coded to OpEx 87165. Reclass to CapEx under 7000400 approved by Dan Nov 13; Finance to reclass.' },
    '46941': { cat: 'OpEx', status: 'requested', note: 'XSE-600 under $5K with no project: code to OpEx 87165 to match SO 47169. Approved by Dan Nov 13.' },
    '47326': { cat: 'OpEx', status: 'requested', note: 'XSE-600 under $5K with no project: code to OpEx 87165 to match SO 47169. Approved by Dan Nov 13.' }
  },

  /* Orders left out of every total. */
  excludeOrders: {
    '55170': 'The two 7830-32CE switches were taken off and will be ordered later due to delays (Dan, Nov 13). Ask Order Management to cancel the lines.'
  },

  /* Support, maintenance and subscription terms. Seeded from Brandon's 3P Requisitions sheet on the Lab Operations
     SharePoint (Maintenance column and MPA dates) and Dan's Oct 20 note. amount is in the contract currency.
     Budget rule (Dan, Nov 13): maintenance is OpEx and is spread monthly across its term, whatever account it was coded to.
     GL timing follows Anne's rule instead: $30K a year or more is prepaid and amortized; less is expensed when posted. */
  contracts: [
    { ref: 'PRUS10000003', vendor: 'Keysight', what: 'Test equipment maintenance', start: '2026-02-01', end: '2027-01-31', amount: 84981, ccy: 'USD', source: '3P Requisitions sheet' },
    { ref: 'PRIE10000088', vendor: 'Scaltel Gruppe', what: 'Software and maintenance', start: '2026-08-01', end: '2027-01-31', amount: 164451, ccy: 'EUR', source: '3P Requisitions sheet' },
    { ref: 'PRUS10000160', vendor: 'When I Work', what: 'Software licensing', start: '2026-02-06', end: '2027-02-07', amount: 14280, ccy: 'USD', source: '3P Requisitions sheet' },
    { ref: '600946', vendor: 'Yorktel', what: 'AV equipment maintenance, Reading', start: '2025-11-10', end: '2026-12-19', amount: 9984, ccy: 'GBP', source: '3P Requisitions sheet' },
    { ref: 'PRUS10002239', vendor: 'Keysight', what: 'Lab equipment support', start: '2026-07-27', end: '2027-07-26', amount: 8344, ccy: 'USD', source: '3P Requisitions sheet' },
    { ref: 'PRIE10000132', vendor: 'Infoguard Com-Sys', what: 'Software maintenance (contract 5-01693520)', start: '2025-01-01', end: '2025-12-31', amount: 147358, ccy: 'EUR', source: '3P Requisitions sheet', note: 'Approved Sep 2026 against a 2025 term. Confirm the renewal term.' },
    { ref: 'PRIE10000104', vendor: 'Jcubedata', what: 'Software maintenance', start: '', end: '', amount: 64127, ccy: 'USD', source: '3P Requisitions sheet' },
    { ref: '10308262', vendor: 'Spirent Communications', what: 'Software and equipment maintenance', start: '', end: '', amount: 71139, ccy: 'USD', source: '3P Requisitions sheet' },
    { ref: '10313585', vendor: 'QA Cafe', what: 'Software maintenance', start: '', end: '', amount: 30006, ccy: 'USD', accounts: ['87160'], source: '3P Requisitions sheet', note: 'The $11,500 line on 20050 is equipment, not maintenance.' },
    { ref: '10312566', vendor: 'Eve-NG', what: 'Software licensing', start: '', end: '', amount: 14256, ccy: 'USD', source: '3P Requisitions sheet' },
    { ref: '10311997', vendor: '27 Virtual Consulting', what: 'Software maintenance', start: '', end: '', amount: 17574, ccy: 'USD', source: '3P Requisitions sheet' },
    { ref: 'CDRouter', vendor: 'QA Cafe', what: 'CDRouter subscription renewal', start: '', end: '', amount: 0, ccy: 'USD', source: '3P Requisitions sheet' }
  ],

  /* Days ahead to list a contract as coming up for renewal. */
  renewalWindowDays: 180
};
