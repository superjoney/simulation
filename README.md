# Call center simulator

User-testing harness for call-center prototypes. The participant works in the prototype as the
representative while ElevenLabs voice agents call in as customers. A session plays two calls back to
back, each with its own customer, prototype data and playbook.

| Customer | Playbook | Agent |
| --- | --- | --- |
| Ruth Calloway | Escrow refund reissue | `agent_1701m4b8pgpze1ys6fn2g0m9qqkt` (Ruth-agent) |
| Marcus Dell | Payment increase after paid shortage | add in `public/config.js` |
| Dana Whitcomb | Insurance premium change | add in `public/config.js` |

Customers without an agent ID are skipped, so a session needs at least two agents for two calls.

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

## Running a session

1. The participant enters their ID, clicks **Allow microphone**, picks their microphone and
   speaker (the level bar and **Play test sound** confirm both), and presses **Start**.
2. The first customer's prototype opens on "No active call". The participant clicks
   **Initiate call simulation** and the first agent calls in.
3. When the call ends, a card counts down 10 seconds, then the next customer's prototype loads and
   their call starts on its own. **Pause next call** holds it (for wrap-up notes) until
   **Start next call** is pressed.
4. After the last call the card says the session is complete.

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
- rewrites the right panel (why they're calling, recap, activity, payments, upcoming changes, taxes
  and insurance) and the live call summary for that customer;
- fixes the right panel so it opens and stays open on laptop-width screens.

Every edit is an exact match, so if a new export changes the code the build stops with the line that
no longer matches. To use a new export, replace the file in `prototypes-src/` and rebuild.

Details the scripts don't give (phone numbers, emails, household members, tax and insurance figures,
Marcus's and Dana's street addresses) are invented and marked in `tools/clients.js`. The prototype's
Loan details, Cases, Touchpoints and Documents tabs are placeholders in the export itself.

## Call controls

The export didn't include its telephony files, so `public/prototypes/cc-controls.js` and
`cc-controls.css` rebuild them: the call bar at the top of the prototype (caller, number, timer, mute,
hold, add, keypad, End, pop-out), wired to the voice call.

- **Mute** stops the participant's microphone.
- **Hold** mutes both directions and tells the agent it's on hold; resuming tells it the representative is back.
- **End** hangs up the agent.
- **Add** and **keypad** open a note saying they aren't available in the simulation.

## Files

- `server.js`: static server, token endpoint, session log writer
- `public/index.html`, `simulator.js`, `simulator.css`: setup screen, call sequence, session log
- `public/config.js`: customers, agents and session settings
- `public/prototypes/`: generated per-customer prototypes and the call controls
- `prototypes-src/`: the original prototype export
- `tools/build-prototypes.js`, `tools/clients.js`, `tools/sim-client-runtime.js`: the prototype build
