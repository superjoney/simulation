# Call center simulator

User-testing harness for call-center prototypes. The participant works in the prototype as the
representative while ElevenLabs voice agents call in as customers. A session plays two calls back to
back, each with its own customer, prototype data and playbook.

| Customer | Playbook | Agent |
| --- | --- | --- |
| Ruth Calloway | Escrow refund reissue | `agent_1701m4b8pgpze1ys6fn2g0m9qqkt` (Ruth-agent) |
| Marcus Dell | Payment increase after paid shortage | `agent_8801m4b9kpqye5e8vv0m0emfvqk3` |
| Dana Whitcomb | Insurance premium change | `agent_6301m0ztb3e3ew3a7x5y5abhwjx6` |

A session plays two of the three; **Study settings** picks which two and in what order.

## Run it

```bash
npm start                                   # http://localhost:3000
# optional: WebRTC token auth (needed if the agents require authentication)
ELEVENLABS_API_KEY=sk_... npm start
```

Requires Node 18+. No `npm install` step. Use Chrome or Edge, and open the page through the server
(not `file://`).

| Env var | Default | Purpose |
| --- | --- | --- |
| `ELEVENLABS_API_KEY` | none | When set, the browser gets a short-lived conversation token per call from `/api/conversation-token`, so the key never reaches the browser. When unset, the browser connects with the agent ID, which only works if the agent is public (authentication off). |
| `PORT` | `3000` | Server port. |
| `SESSIONS_DIR` | `./sessions` | Where session logs are saved. Point it at a mounted volume when hosted. |
| `SIM_LABEL` | none | Shows a badge (e.g. `TEST`) on every screen. Set it on test copies only. |
| `RESEARCHERS` | none | Dashboard logins, e.g. `jenn:pass1, sam:pass2`. The dashboard at `/admin` is off when unset. |
| `SESSION_SECRET` | derived | Optional extra secret for signing dashboard sign-ins. Changing it signs everyone out. |
| `RESEARCHER_KEY` | none | Enables `GET /api/sessions?key=…`, which downloads every saved log. Off when unset. |

## Hosting on Railway

`railway.json` sets the start command and health check; Railway supplies `PORT`.

1. New Project → Deploy from GitHub repo → `superjoney/simulation` (branch `main`, or this branch).
2. Variables: `RESEARCHERS` (dashboard logins), `SESSIONS_DIR=/data/sessions`, and optionally
   `RESEARCHER_KEY` and `ELEVENLABS_API_KEY`.
3. Attach a volume mounted at `/data`, so session logs survive redeploys.
4. Settings → Networking → Generate Domain, and share that https link.

Download every saved log as one JSON file at `https://<your-domain>/api/sessions?key=<RESEARCHER_KEY>`.

## Running an unmoderated study

1. Sign in at `/admin` with a name and password from `RESEARCHERS`.
2. **Invites**: paste the participant emails and press **Add invites**. Each person gets a personal
   link (`/?p=CODE`). **Download for mail merge (CSV)** gives `email, first_name, link, status` for
   a mail merge.
3. For Slack or anyone without a personal link, share the **Shared link** (the site's home page).
   Participants enter their email; anyone not on the invite list still takes part but is flagged.
4. Participants see a welcome and consent screen, an audio check, a short briefing, then two calls.
   Call order is counterbalanced automatically. If they refresh or come back later, they resume
   where they left off; once finished, the link says the study is complete.
5. **Overview** shows the funnel, completion, pauses and per-customer medians (handle time, time to
   verify, holds, transfers). **Participants** lists everyone with filters; click a row for each
   call's metrics, the steps taken, the transcript and every event. Export CSV (one row per
   participant) or JSON (every event).

6. **Behaviour** (per customer):
   - *Anchor questions*: each caller says two lines word for word (see the scripts). The dashboard
     finds them in the transcript and times the participant's first reply, any hold, and the related
     playbook step. Each call gets an automatic outcome (answered without hold / held then answered /
     not asked); researchers can override it, or mark "gave up or guessed", in the participant's detail.
   - *Answer checks*: auto-detected from speech and clicks (e.g. confirmed the address before
     reissuing, gave $1,440.95, said "$22 less"). Pointers to check in the transcript, not verdicts.
     Defined in `lib/study.js`.
   - *Click quality*: rage clicks (3+ in a second in one spot) and dead clicks (nothing on the page
     changed within a second), with where they happened.
   - *Feature use*: which controls people used, in which area of the screen, and when first.
7. **Baseline**: upload a CSV export from the current system (one row per call), map its columns
   (handle time, time to verify, holds, hold time, transferred, call type) and match its call types
   to the scenarios. The tab then compares the current system with the prototype, overall and per
   scenario. Times can be seconds, minutes, or `m:ss` / `h:mm:ss`.

Data is stored in `SESSIONS_DIR`: `participants.json`, `events/<code>.jsonl` and `baseline.json`.

## Running a session

1. The participant enters their name, clicks **Allow microphone**, picks their microphone and
   speaker (the level bar and **Play test sound** confirm both), and presses **Start**. The
   microphone stays open for the whole session, so the browser doesn't ask again between calls.
2. The first customer's prototype opens on "No active call". The participant clicks
   **Initiate call simulation** and the first agent calls in.
3. When the call ends, a card counts down 10 seconds, then the next customer's prototype loads and
   their call starts on its own. **Start now** skips the wait; **Pause next call** holds it (for
   wrap-up notes) until **Start next call** is pressed.
4. After the last call the card says the session is complete.
5. The rocket logo in the prototype goes back to the start page (with a confirm during a call).

**Study settings** (small link under Start) sets the call order, e.g. Ruth → Marcus or
Marcus → Ruth, for counterbalancing. Links can preset it:
`/?participant=P07&order=marcus,ruth`.

### Session log

Press **Ctrl+Shift+L** (or add `&debug=1` to the URL) to open the log: each call's transcript and
ElevenLabs conversation ID, every labelled control the participant clicked, call controls used
(mute, hold), pauses, and timings. It's saved after every call to
`sessions/<participant>_<timestamp>.json` and can be downloaded from the panel. The participant ID is
sent to ElevenLabs as `userId`, so the dashboard recordings can be filtered by it.

## Configuration (`public/config.js`)

- `clients`: the customers, each with `agentId`, display name, phone and playbook.
- `callsPerSession` (2) and `breakSeconds` (10).
- `ringSeconds` (3): how long the phone rings before the caller connects; it keeps ringing until they do. `0` turns the ring off.
- `connectionType`: `"webrtc"` (default) or `"websocket"`.
- `dynamicVariables`: values for the agents' `{{variables}}`. Only add keys the agents define.
- `sendNavigationContext`: when `true`, the agent gets a silent note each time the participant
  clicks a control, so the caller can react to long pauses. Off by default.

Each caller's persona and lines come from the agent's system prompt in the ElevenLabs dashboard
(the "ElevenLabs agent system prompt" section of each TMD call script).

## Per-customer prototypes

`prototypes-src/rail-snapshot-2.html` is the original export, never edited. Running

```bash
npm run build:prototypes
```

generates `public/prototypes/ruth.html`, `marcus.html` and `dana.html` from it, using the customer
data in `tools/clients.js`. Each build:

- shows that customer's name, loan number, address, phone, email, last-4 SSN and last payment in the
  identity check, header and call controls, matching the call scripts;
- opens that customer's playbook after verification (refund reissue, paid shortage or premium change);
- rewrites the right panel (why they're calling, activity, payments, upcoming changes, taxes and
  insurance) and the live call summary for that customer. The Recap appears for Marcus only, as a
  refinance pitch (FHA Streamline, estimated figures);
- fixes the right panel so it opens and stays open on laptop-width screens;
- lets Ruth's reissue go by standard mail, FedEx or wire;
- adds generic playbooks to the "Something else…" dropdown (payoff quote, make a payment, autopay,
  address change, late fee waiver, 1098, hardship, modification), with neutral guidance from the
  customer's loan;
- adds **Refer to Home Loan Expert** to Marcus's refinance recap: it shows a green lead number and
  dials the Home Loan Expert on a second line;
- checks off the Mini-Miranda when the participant clicks anywhere on it;
- removes the iAssist system labels, "Needs SME" tags, reviewer flags and data-source tooltips.

Every edit is an exact match, so if a new export changes the code the build stops with the line that
no longer matches. To use a new export, replace the file in `prototypes-src/` and rebuild.

Details the scripts don't give (phone numbers, emails, household members, tax and insurance figures,
Marcus's and Dana's street addresses) are invented and marked in `tools/clients.js`. The prototype's
Loan details, Cases, Touchpoints and Documents tabs are placeholders in the export itself.

## Call controls

The export didn't include its telephony files, so `public/prototypes/cc-controls.js` and
`cc-controls.css` rebuild them: the call bar at the top of the prototype (caller, number, timer, mute,
hold, add, keypad, End, pop-out), wired to the voice call. Popped out, it becomes a compact phone card
in the bottom-left corner that can be dragged anywhere.

- **Mute** stops the participant's microphone.
- **Hold** mutes both directions and tells the agent it's on hold; resuming tells it the representative is back.
- **End** hangs up the agent.
- **+** opens a transfer list (Home Loan Expert, Banking CO, Insurance Team, Escrow, Research, Loss
  Mitigation). Picking one puts the caller on hold and opens a second line that dials, rings and
  connects. **Transfer** hands the caller over and ends the call; the red handset hangs up the second
  line and takes the caller off hold.
- **Keypad** opens a dial pad; tones aren't sent.

## Files

- `server.js`: static server, token endpoint, participant and event API, dashboard API
- `lib/store.js`, `lib/metrics.js`, `lib/auth.js`: participant store, metrics, researcher sign-in
- `lib/study.js`: anchor lines and answer checks per customer; `lib/baseline.js`: baseline CSV and comparison
- `public/admin/`: researcher dashboard
- `public/index.html`, `simulator.js`, `simulator.css`: setup screen, call sequence, session log
- `public/config.js`: customers, agents and session settings
- `public/prototypes/`: generated per-customer prototypes and the call controls
- `prototypes-src/`: the original prototype export
- `tools/build-prototypes.js`, `tools/clients.js`, `tools/sim-client-runtime.js`: the prototype build
