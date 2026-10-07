# Call center simulator

User-testing harness for call-center prototypes. The participant works in the prototype as the
representative; when they click **Initiate call simulation**, the ElevenLabs agent **Ruth-agent**
(`agent_1701m4b8pgpze1ys6fn2g0m9qqkt`) joins as the caller and talks to them over the microphone.

## Run it

```bash
npm start                                   # http://localhost:3000
# optional: WebRTC token auth (needed if the agent requires authentication)
ELEVENLABS_API_KEY=sk_... npm start
```

Requires Node 18+. No `npm install` step. Use Chrome or Edge, and open the page through the server
(not `file://`) so the simulator can see the prototype's start button.

| Env var | Default | Purpose |
| --- | --- | --- |
| `ELEVENLABS_API_KEY` | none | When set, the browser gets a short-lived conversation token from `/api/conversation-token`, so the key never reaches the browser. When unset, the browser connects with the agent ID, which only works if the agent is public (authentication off). |
| `ELEVENLABS_AGENT_ID` | Ruth-agent | Use a different agent. |
| `PORT` | `3000` | Server port. |

## Running a session

1. Open the simulator. Enter a participant ID, pick the prototype, click **Check microphone** and
   allow access. Do this before the participant sits down so they never see a permission prompt.
2. Click **Start session**. The prototype opens on its "No active call" screen.
3. The participant clicks **Initiate call simulation**. The voice agent connects, and the call
   controls at the bottom show the caller, a timer, mute and end call.
4. When either side hangs up, the session log is saved to `sessions/<participant>_<timestamp>.json`.

Shortcut: `/?participant=P07&prototype=rail-snapshot-2&go=1` skips the setup screen.

### Researcher log

Press **Ctrl+Shift+L** (or add `&debug=1` to the URL) to open the session log: live transcript,
the ElevenLabs conversation ID, and every labelled control the participant clicked, with
timestamps. **Download JSON** saves the same file. The full recording is also in the ElevenLabs
dashboard under the conversation ID; the participant ID is sent as `userId`, so you can filter by it.

## Configuration (`public/config.js`)

- `prototypes`: add a prototype by dropping its HTML into `public/prototypes/` and adding an entry.
  `startSelector` is the element that starts the call (`#tm-start` for the current builds). Leave it
  empty to show a green start button in the call controls instead.
- `connectionType`: `"webrtc"` (default) or `"websocket"`.
- `dynamicVariables`: values for the agent's `{{variables}}`, e.g. a scenario name. Only add keys
  the agent defines.
- `sendNavigationContext`: when `true`, the agent gets a silent note each time the participant
  clicks a control ("The representative clicked: Context"), so the caller can react to pauses
  or wrong turns. Off by default.

The caller's persona, scenario and voice are set on the agent in the ElevenLabs dashboard. The
current prototype's scenario is Marcus Johnson (loan 456123789) calling about a payment increase
after paying an escrow shortage.

## Call controls

The prototype export didn't include its telephony files, so `public/prototypes/cc-controls.js` and
`cc-controls.css` rebuild them. They render the call bar at the top of the prototype (caller, number,
timer, mute, hold, add, keypad, End, pop-out) and drive the voice call:

- **Mute** stops the participant's microphone.
- **Hold** mutes both directions and tells the agent it's on hold; resuming tells it the representative is back.
- **End** hangs up the agent.
- **Add** and **keypad** open a note saying they aren't available in the simulation.

Any prototype that loads `cc-controls.js` from its own folder gets these controls. For others, the simulator
shows its own floating call bar instead.

## Files

- `server.js`: static server, token endpoint, session log writer
- `public/index.html`, `simulator.js`, `simulator.css`: setup screen, call controls, session log
- `public/config.js`: agent and prototype settings
- `public/prototypes/rail-snapshot-2.html`: the prototype, unmodified
- `public/prototypes/cc-controls.js`, `cc-controls.css`: the prototype's call controls, wired to the voice call
