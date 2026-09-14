window.ACMA_DATA = {
  sessionTemplate: {
    id: "CLASS-402-B",
    title: "Systems Design Studio — Week 4",
    room: "Hall 402-B",
    course: "CS-402 Multimodal Systems",
    startedAt: null
  },
  users: {
    host: { id: "u-host", name: "Dr. Amal Hassan", role: "host", title: "Faculty / Meeting Host" },
    attendee: { id: "u-jordan", name: "Jordan Lee", role: "attendee", title: "Student / Attendee" },
    admin: { id: "u-admin", name: "Samir Qureshi", role: "admin", title: "IT & AV Administrator" },
    compliance: { id: "u-legal", name: "Elena Voss", role: "compliance", title: "Compliance & Legal" }
  },
  participants: [
    { id: "p-amal", name: "Dr. Amal Hassan", role: "Host", initials: "AH", color: "#2ee6c8", speakingBias: 0.28 },
    { id: "p-jordan", name: "Jordan Lee", role: "Student", initials: "JL", color: "#4cc9f0", speakingBias: 0.18 },
    { id: "p-sara", name: "Sara Kim", role: "Student", initials: "SK", color: "#a78bfa", speakingBias: 0.16 },
    { id: "p-omar", name: "Omar Nasser", role: "Student", initials: "ON", color: "#f4b942", speakingBias: 0.14 },
    { id: "p-priya", name: "Priya Shah", role: "Student", initials: "PS", color: "#fb7185", speakingBias: 0.1 },
    { id: "p-alex", name: "Alex Chen", role: "Student", initials: "AC", color: "#34d399", speakingBias: 0.08 },
    { id: "p-maya", name: "Maya Torres", role: "Student", initials: "MT", color: "#60a5fa", speakingBias: 0.05 },
    { id: "p-noah", name: "Noah Brooks", role: "Student", initials: "NB", color: "#94a3b8", speakingBias: 0.01 }
  ],
  script: [
    { t: 2, speaker: "p-amal", text: "Welcome back. Today we lock the fusion contract for who-said-what minutes.", db: 64, attention: 0.86 },
    { t: 8, speaker: "p-amal", text: "Edge vision stays on the room device. Cloud handles Whisper, diarization, and the LLM package.", db: 62, attention: 0.84 },
    { t: 14, speaker: "p-jordan", text: "If lip activity disagrees with the d-vector cluster, do we bind to the visual identity?", db: 66, attention: 0.88, hand: null },
    { t: 18, speaker: "p-amal", text: "Yes. Visual lip timeline wins when confidence is high. Otherwise we flag an uncertain match.", db: 63, attention: 0.87 },
    { t: 24, speaker: "p-sara", text: "Can the dashboard surface raised hands without interrupting the lecturer?", db: 61, attention: 0.83, hand: "p-sara" },
    { t: 28, speaker: "p-amal", text: "That is the point of the live engagement pane. Hands appear as cues, not as a takeover.", db: 64, attention: 0.85 },
    { t: 34, speaker: "p-omar", text: "I still worry about FERPA if we keep face embeddings after class.", db: 68, attention: 0.81 },
    { t: 38, speaker: "p-amal", text: "Default is in-memory purge. Recordings persist only with explicit consent and a retention window.", db: 63, attention: 0.84 },
    { t: 44, speaker: "p-priya", text: "How fast is the post-session package? Leadership asked for minutes inside five minutes.", db: 60, attention: 0.82, hand: "p-priya" },
    { t: 48, speaker: "p-amal", text: "Target is under five minutes: transcript consolidate, flags, executive summary, decisions, actions.", db: 65, attention: 0.86 },
    { t: 54, speaker: "p-alex", text: "We should treat overlapping speech as an interruption event, not just noise.", db: 72, attention: 0.79, interrupt: true },
    { t: 56, speaker: "p-omar", text: "Exactly — volume spikes plus overlap should hit the dynamics report.", db: 74, attention: 0.77, interrupt: true },
    { t: 62, speaker: "p-amal", text: "Agreed. Acoustic event detector already labels cross-talk frames.", db: 64, attention: 0.83 },
    { t: 68, speaker: "p-maya", text: "Silent participants should be listed privately for the host, not broadcast to the room.", db: 59, attention: 0.8 },
    { t: 72, speaker: "p-amal", text: "Correct. Flags are host-only. We never grade from participation transcripts.", db: 62, attention: 0.84 },
    { t: 78, speaker: "p-jordan", text: "Decision: bind speaker identity with AV fusion, then generate the JSON object every second.", db: 66, attention: 0.88 },
    { t: 84, speaker: "p-amal", text: "Action items: Samir confirms PTZ 1080p/30, Elena signs the consent copy, I publish minutes after we end.", db: 63, attention: 0.9 },
    { t: 90, speaker: "p-amal", text: "If there are no other hands, we will close the capture pipeline and request the summary package.", db: 61, attention: 0.87 }
  ],
  summaryPackage: {
    abstract:
      "Studio locked the multimodal fusion contract for CLASS-402-B: edge vision stays local, cloud runs Whisper diarization and LLM minutes. Speaker identity is bound by aligning audio d-vectors with lip-activity timelines. Recordings remain in-memory unless consent is granted. Minutes, flags, decisions, and actions ship within five minutes of session end.",
    decisions: [
      "Visual lip timeline overrides uncertain audio-only speaker clusters when lip confidence is high.",
      "Raised-hand and silence flags stay on the host dashboard and are not broadcast to attendees.",
      "Overlapping speech plus volume spikes are logged as interruption / cross-talk events.",
      "No automated grading from participation transcripts."
    ],
    actions: [
      { owner: "Samir Qureshi", task: "Confirm room PTZ cameras hold 1080p / 30 FPS and directional mic arrays.", due: "This week" },
      { owner: "Elena Voss", task: "Publish FERPA/GDPR consent copy and retention window for consented recordings.", due: "Before next studio" },
      { owner: "Dr. Amal Hassan", task: "Review generated minutes and share the package with absentees.", due: "Within 5 minutes of end" }
    ],
    themes: ["Multimodal fusion", "Privacy by default", "Inclusive facilitation", "Five-minute minutes"]
  }
};
