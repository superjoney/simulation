# Handback: Touchpoints (`kit/sections/touchpoints/`)

Section chat, Oct 15, 2026. Read only (no system writes). It registers `TM.feature('tab:touchpoints', { mount, onShow })` and draws only inside `#tm-panel-touchpoints`. The class prefix is `tp-`.

## Files
| File | What it is |
|---|---|
| `f-tp.js` | Data, render, actions. Ported from `reference/v9-sections/f-tp.js`. |
| `f-tp.css` | Layout glue on `var(--nova-…)` tokens. |
| `test-touchpoints.js` | Section test. Run it from `kit/` after a build. |
| `README.md` | Unchanged. |

## What it does (matches the Oct 15 screenshots, condensed)
- **Density pass:** search is full width on its own line, with the chips below it (they wrap as more are added). Rows are a single line of about 46px: the title, then the duration, status or method in gray, truncated rather than wrapped. The expanded detail is compact: allocation sits beside Payment details, other details use a 3-column grid, and artifact cards sit two per row.
- **Header and filters:**
  - The title is "Touchpoint history · {client}".
  - The single-select Nova chips are **All · Calls · Email · Letter · Payment · Cases**.
  - Calls covers inbound and outbound calls, IVR, chat and SMS. Each row shows **IB / OB** in its title (e.g. "IB Call · …", "OB SMS · …").
- **Search** is a Nova typeahead select (`role="combobox"` with a `nova-menu` listbox).
  - Arrow keys, Enter and Escape work in the list.
  - Typing never re-renders the input.
  - Picking a result switches the chip to All if needed, pages to the row, expands it and marks it. The × button clears the search.
- **Table** (Nova): DATE (sortable, newest first) · TOUCHPOINT · AGENT / SYSTEM · chevron.
  - Each row is a title plus a second line (duration, status, method, Mailed, Delivered).
  - The right column shows the CR's short name, a case status tag (Open = info, Resolved = neutral), the payment amount, "System gen" or "Self-service".
  - **List rows have no icons.**
  - 15 rows per page.
- **Expanded row** (one gray block), showing whichever of these the touchpoint has:
  - Handled by (avatar and full name), then the summary.
  - Payment: Autopay / On time tags, Fund allocation (ruled, with a bold total), and Payment details in a 2-column grid (Cleared in green).
  - Case details, email thread, comment codes.
  - Linked communications cards, which jump to that row.
  - **Artifacts** cards, which keep their icons.
- **Artifacts open inline.** The list is replaced by:
  - a breadcrumb: `Touchpoint history › {touchpoint} › {artifact}`;
  - a document preview;
  - a "Back to touchpoint" button.

  The first crumb returns to the list. The second crumb (and Escape) returns with the row expanded. The chip, page and expanded rows are kept. The view also survives a tab or loan re-mount.
- **State** is kept per loan. Cases created on this call (`TM.on('case')`) and documents sent (`TM.on('send')`) appear at the top.

## Tests (last lines, sandbox build `--shell versions`)
```
PROBLEMS 0
BAD 0
V6 PROBLEMS 0
V7 PROBLEMS 0
SHELL PROBLEMS 0
TOUCHPOINTS PROBLEMS 0
```
Add this to the merge loop: `node sections/touchpoints/test-touchpoints.js | tail -1`.

## Synthetic content for SME review
- `p13s` **OB SMS · Payment confirmation** (09/01/26) is a new row that gives Payment → Linked communications an example. It's marked Needs SME.
- Comment code **PYMT-001** on the Sept 1 payment comes from the screenshot. It's marked Needs SME.
- The Sept 1 payment now has a Cleared date of **09/03/26** and the method ACH / Checking ····4399. Its allocation is P&I $1,296.71 + escrow $442.31 + extra principal $120.00 = $1,859.02. That P&I + escrow total matches the page's $1,739.02.
- The new payment date "effective 11/01/26" in the escrow analysis letter summary is invented.
- "Handled by" for the seeded cases:
  - CS-2026-4107: Sam Lee
  - CS-2026-3861: Tanya Burton
  - CS-2026-2210: Jordan Anderson
- The artifact previews are synthetic (the figures are the page's).
- The "IB / OB" labels for SMS, and "Mailed" as the second line for letters, are wording choices. The screenshot repeated "System gen" on both lines.

## Left out on purpose (read only, per the brief)
- **"Move money for this transaction"** (screenshot 4) is not rendered. `TM.router` has no `openMoveMoney`. If you want it, the merge chat can add `TM.router.openMoveMoney(txn)` and I'll wire the link.
- **Send from an artifact** is not included.
- **Rail link** "View full touchpoint history" isn't wired yet. It only needs `TM.router.setTab('touchpoints')`, which is a merge-chat change.

## Shared-file requests
None required. Optional: `TM.router.openMoveMoney` (above).

## Open questions
1. Should Web & app activity (sign-ins, lockouts, in-app requests) get its own chip? Today it shows only under All.
2. The screenshots show MM/DD. Rows from earlier years add /YY, and today's rows show "Today" and the time. OK?
3. A typeahead pick jumps to the row and expands it, without filtering the list down to that one row. Is that what you want?
