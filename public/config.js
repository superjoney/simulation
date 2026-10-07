// Simulator settings. Edit this file to add prototypes or change call behaviour.
window.SIM_CONFIG = {
  // ElevenLabs agent that plays the caller. The server's ELEVENLABS_AGENT_ID overrides this.
  agentId: "agent_1701m4b8pgpze1ys6fn2g0m9qqkt",

  // "webrtc" (lower latency, recommended) or "websocket".
  connectionType: "webrtc",

  // Prototypes the researcher can pick on the setup screen.
  //   file:          path under public/
  //   startSelector: the element in the prototype that starts the call when clicked
  //   caller:        name shown in the call controls
  //   callerPhone:   number shown in the call controls
  prototypes: [
    {
      id: "rail-snapshot-2",
      label: "TMD future testing · v30 rail snapshot 2",
      file: "prototypes/rail-snapshot-2.html",
      startSelector: "#tm-start",
      caller: "Marcus Johnson",
      callerPhone: "(444) 222 – 8888",
    },
  ],

  // Extra values for the agent's {{dynamic_variables}}. Only add keys the agent defines.
  dynamicVariables: {},

  // When true, the agent receives a silent note (no spoken reply) each time the participant
  // clicks a labelled control in the prototype, e.g. "The representative clicked: Context".
  sendNavigationContext: false,
};
