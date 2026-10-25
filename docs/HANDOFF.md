# Handoff: call center simulator (Oct 25, 2026)

Everything a new chat (or person) needs to pick this project up. Read this first, then `README.md`.

**How the owner wants to work from here:** locally first. Build and test on your own machine, commit
locally, and only push to GitHub when a change is ready. Pushing is what deploys (see "Where it runs").

---

## What this is

A call center simulator for user testing. A participant plays a client relations agent in a clickable
prototype of the AI Desktop (the "TM" interface) while an ElevenLabs voice agent calls in as a customer.
Each customer has their own call script, their own data in the prototype and their own playbook.

| Customer | Playbook | ElevenLabs agent |
| --- | --- | --- |
| Ruth Calloway | Escrow refund issue (e11) | `agent_1701m4b8pgpze1ys6fn2g0m9qqkt` |
| Dana Whitcomb | Insurance premium change (i02) | `agent_6301m0ztb3e3ew3a7x5y5abhwjx6` |
| Marcus Dell | Payment increase after paid shortage (e03) | `agent_8801m4b9kpqye5e8vv0m0emfvqk3` (not in the rotation now) |

The three call scripts (TMD Call 1–3) were shared as uploads in the original chat; their facts are
captured in `tools/clients.js` and `tools/touchpoints.js` (lines marked "script").

## Branches

| Branch | What it is |
| --- | --- |
| `main` | What the **live** Railway service runs. After PR #4 is merged it has everything below from `prototype-v2`. |
| `prototype-v2` | Current development line (PR [#4](https://github.com/superjoney/simulation/pull/4)): new prototype version, Ruth + Dana, random order and rail versions, Touchpoints. |
| `claude/elevenlabs-agent-deploy-jooaju` | The **study platform** version, built on the older prototype and not merged: invite links (`?p=CODE`), consent, survey with dictation, **Build your panel** co-creation activity, researcher dashboard at `/admin`. The Railway **test** service runs it. |
| `v1-working`, `v2-study-platform` | Frozen restore points (first working version; the study platform as of Oct 15). Don't push to them. |

Start new work on a new branch from `main` (after PR #4 is merged), e.g. `git switch -c cocreation main`.

## Working locally

Needs Node 18 or newer (no `npm install`; there are no dependencies) and Chrome or Edge.

```bash
git clone https://github.com/superjoney/simulation.git
cd simulation
git switch main            # or prototype-v2 until PR #4 is merged
git switch -c my-feature   # your local working branch
npm start                  # http://localhost:3000
```

- **Voice calls:** with no `ELEVENLABS_API_KEY` set, the browser connects with the agent IDs, which works
  while the agents are public in ElevenLabs. If they require auth, start with
  `ELEVENLABS_API_KEY=sk_... npm start` (never commit the key; `.env` is git-ignored).
- **Microphone:** browsers only allow it on `https` or `localhost`, so use `http://localhost:3000`, not your
  machine's IP address. Open the page through the server, never as a file.
- **Your local data** (session logs, `progress.json`) goes to `./sessions/`, which is git-ignored. Delete
  it to start fresh (for example to see a "new participant" again).
- **Researcher view:** add `&debug=1` to the URL, or press Ctrl+Shift+L, for the session log.
- **Optional:** `SIM_LABEL=LOCAL npm start` shows a badge so you never confuse it with the live site.
- **Pushing** is the last step: `git push -u origin my-feature`, then open a pull request into `main`.
  Nothing deploys until the pull request is merged.

## Where it runs (Railway)

- **Live service** deploys from `main` automatically on every merge.
- **V2 / test services** deploy from their branches (`prototype-v2`; the study branch).
- Each service needs a volume at `/data` with `SESSIONS_DIR=/data/sessions`, or participants' saved
  progress is lost on every redeploy. `SIM_LABEL` must **not** be set on the live service.

## How the prototype pages are built

The prototype is a single bundled HTML export (the page lives as a JSON string inside
`<script type="__bundler/template">`). We never hand-edit an export; each step is a script that writes a
new version, and earlier versions are kept.

```
prototypes-src/rail-snapshot-2.html          original export (never edited)
  └─ tools/make-rail-snapshot-3.js           + the Oct 15 changes in prototypes-src/changes/2026-10-15-rail/
     → prototypes-src/rail-snapshot-3.html     (Payments card, search label, Escrow refund issue playbook, v53/v54 tweaks)
       └─ tools/bundle-sections.js           + section handbacks in prototypes-src/sections/<name>/
          → prototypes-src/rail-snapshot-4.html  (Touchpoints tab)
            └─ tools/build-prototypes.js     + per-customer data
               → public/prototypes/{ruth,marcus,dana}.html   (what the simulator serves)
```

Commands (run in order after changing anything upstream):

```bash
node tools/make-rail-snapshot-3.js
node tools/bundle-sections.js prototypes-src/rail-snapshot-3.html prototypes-src/rail-snapshot-4.html
npm run build:prototypes
npm run test:touchpoints                      # → CUSTOMER TOUCHPOINTS PROBLEMS 0
TM_TB=<decoded copy printed by bundle-sections> node prototypes-src/sections/touchpoints/test-touchpoints.js | tail -1   # → 0
```

Rules that keep this safe:
- Every edit is an **exact find-and-replace with an expected count**; a new export that changes the code
  fails the build loudly instead of silently showing wrong data. If a count fails, look at what changed.
- Files handed over by the design team (`prototypes-src/changes/…`, `prototypes-src/sections/…`) are kept
  **as handed over**; adjustments live in the scripts.
- When re-encoding a template, every `/` is written as `/` (that's how the export does it, so diffs stay minimal).
- The design kit (`kit/`, `build.py`, `flows*.js`) is **not** in this repo; its other tests run there.

## Per-customer data

- `tools/clients.js`: identity (name, loan, last-4, address, phone), right-rail content (why they're
  calling, Recap, activity, Payments card, upcoming changes, taxes and insurance), cases, call summary,
  and Ruth's escrow-analysis figures for the playbook.
- `tools/touchpoints.js`: each customer's Touchpoints history, documents and case handlers.
- `tools/sim-client-runtime.js`: injected into each page as `window.SIM_CLIENT`; draws the right rail
  (Recap, Upcoming changes with the share countdown, Activity + "View full touchpoint history",
  Payments card, taxes and insurance), the generic playbooks, Marcus's "Refer to Home Loan Expert".

### Ruth's numbers must stay consistent (owner's explicit request)

"Today" is **Oct 5, 2026** (after her Oct 1 payment, which she gives during verification).

| Fact | Value |
| --- | --- |
| Refund check 0041887 | $1,284.60, mailed Aug 4, 2026, not cashed |
| Days since mailed / days left | 62 / 118 (day 180 = Jan 31, 2027) |
| Payment from Sep 1 | $1,612.40 = $1,509.20 P&I + $103.20 escrow (was $1,626.40 with $117.20) |
| Escrow bills | $842.40 tax + $396.00 insurance = $1,238.40/yr → $103.20/mo (last year $1,010.40 + $396.00) |
| Cushion | 2 × $103.20 = $206.40 (the projected low point, **not** today's balance) |
| Analysis Jul 28 | low point $1,491.00 − cushion $206.40 = $1,284.60 surplus refunded |
| Escrow balance today | $619.20 = $412.80 left after the refund + $103.20 (Sep 1) + $103.20 (Oct 1) |
| Autopay / phone | ····2208 / (303) 555-0148 |

Dana: payment $1,683.22 (autopay ····7731), escrow $401.75/mo; Summit $1,644 → Front Range Mutual $1,380
from Oct 1 (policy FRM-2209-4417), dec page received Oct 3; payment $1,661.22 after the off-cycle analysis.
Money in the customer's favour shows in green (`cx-ok`), e.g. Ruth's $1,284.60 and Dana's −$264/yr.

## Study logic (simulator)

- `public/config.js`:
  - `callSet: ["ruth", "dana"]`: every participant gets both, in a random order.
  - `railVariants: ["upcoming", "recap", "both"]`: right-rail version per participant. Random, never the
    same as the previous participant's.
- `server.js` saves both choices per **name** in `SESSIONS_DIR/progress.json`. Returning with the same
  name (case and spacing ignored) resumes at the first unfinished call, with the same order and version.
  Finished names start fresh.
- **Researcher overrides:** use Study settings (the small link under Start), or the link itself, e.g.
  `?order=dana,ruth&rail=recap`.
- **Session flow:** setup → the prototype's start card → call 1 → 10 s break (pausable) → call 2 → end
  card. The end card is in `afterCall()` in `public/simulator.js`; a new end-of-session step plugs in there.

## Starting the new co-creation activity

- An activity already exists on the **study branch**: "Build your panel" (`public/panel-activity.js`,
  `/api/panel` in `server.js`, a Panel tab in the dashboard). It assumes that branch's identity system
  (invite codes), survey and dashboard, none of which are on `main`.
- On `main`, participants are identified only by the name they type, and data is saved in session logs and
  `progress.json`. Decide early whether the new activity:
  - reuses or replaces Build your panel;
  - needs the study platform (invites, dashboard) brought over;
  - stands alone.
- Match the prototype's Nova styles (`nova-button`, `nova-chip`, tokens like `var(--nova-gray-800)`) so it
  feels like the same product, and save answers as they go (people refresh).

## Open items

- Dana's inbound letter from Summit shows "System gen" in Touchpoints (the section labels every letter that way).
- Touchpoints "Move money for this transaction" isn't built (would need `TM.router.openMoveMoney(txn)`).
- The call-order picker in Study settings still lists orders with Marcus (random only uses Ruth and Dana).
