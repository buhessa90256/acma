(function (global) {
  const STORE_KEY = "acma-state-v1";

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || "null") || defaultState();
    } catch {
      return defaultState();
    }
  }

  function defaultState() {
    return {
      consent: false,
      retentionDays: 14,
      recordConsentedMedia: false,
      language: "en",
      sessions: [],
      av: {
        camera: "PTZ-402B (1080p / 30fps)",
        mic: "Omnidirectional array — Hall 402",
        gateway: "REST / WebRTC",
        platforms: ["Zoom", "Teams", "Google Meet"]
      }
    };
  }

  function saveState(state) {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  function participantById(id) {
    return ACMA_DATA.participants.find((p) => p.id === id);
  }

  function createSession() {
    const now = new Date();
    return {
      id: ACMA_DATA.sessionTemplate.id + "-" + now.getTime().toString(36),
      code: ACMA_DATA.sessionTemplate.id,
      title: ACMA_DATA.sessionTemplate.title,
      room: ACMA_DATA.sessionTemplate.room,
      course: ACMA_DATA.sessionTemplate.course,
      startedAt: now.toISOString(),
      endedAt: null,
      status: "live",
      ticks: [],
      transcript: [],
      events: [],
      attentionSeries: [],
      talkSeconds: Object.fromEntries(ACMA_DATA.participants.map((p) => [p.id, 0])),
      interruptions: 0,
      volumeSpikes: 0,
      uncertainMatches: 0,
      raisedHands: [],
      liveAttention: 0.82,
      liveDb: 42,
      activeSpeaker: null,
      pipeline: "calibrating"
    };
  }

  class SessionEngine {
    constructor(onTick, onEvent) {
      this.onTick = onTick;
      this.onEvent = onEvent;
      this.session = null;
      this.timer = null;
      this.t0 = 0;
      this.elapsed = 0;
      this.speed = 2;
      this.scriptIndex = 0;
      this.hands = new Set();
    }

    start() {
      this.stop();
      this.session = createSession();
      this.t0 = performance.now();
      this.elapsed = 0;
      this.scriptIndex = 0;
      this.hands = new Set();
      this.session.pipeline = "ready";
      this.onEvent("pipeline", { message: "Pipeline ready (1080p / 30 FPS). VAD calibrated." });
      this.timer = setInterval(() => this.tick(), 250);
      return this.session;
    }

    setSpeed(s) {
      this.speed = s;
    }

    raiseHand(pid) {
      this.hands.add(pid);
      if (this.session) {
        this.session.raisedHands = [...this.hands];
        this.onEvent("hand", { participant: participantById(pid) });
      }
    }

    lowerHand(pid) {
      this.hands.delete(pid);
      if (this.session) this.session.raisedHands = [...this.hands];
    }

    tick() {
      if (!this.session || this.session.status !== "live") return;
      this.elapsed += 0.25 * this.speed;
      const t = this.elapsed;
      const s = this.session;

      const next = ACMA_DATA.script[this.scriptIndex];
      let spoke = false;
      if (next && t >= next.t) {
        const who = participantById(next.speaker);
        s.activeSpeaker = next.speaker;
        s.liveDb = next.db;
        s.liveAttention = next.attention;
        s.transcript.push({
          t: Math.round(t),
          speakerId: next.speaker,
          speaker: who.name,
          text: next.text,
          db: next.db,
          match: next.interrupt ? "reconciled" : "bound"
        });
        s.talkSeconds[next.speaker] += Math.max(3, next.text.split(" ").length / 2.2);
        if (next.interrupt) {
          s.interruptions += 1;
          this.onEvent("interrupt", { speaker: who.name, text: next.text });
        }
        if (next.db >= 70) {
          s.volumeSpikes += 1;
          this.onEvent("spike", { db: next.db, speaker: who.name });
        }
        if (next.hand) {
          this.hands.add(next.hand);
          s.raisedHands = [...this.hands];
          this.onEvent("hand", { participant: participantById(next.hand) });
          setTimeout(() => this.lowerHand(next.hand), 8000 / this.speed);
        }
        if (Math.random() < 0.08) s.uncertainMatches += 1;
        this.scriptIndex += 1;
        spoke = true;
        this.onEvent("caption", { speaker: who, text: next.text });
      } else {
        s.liveDb = Math.max(36, s.liveDb + (Math.random() * 6 - 3.4));
        const drift = (Math.random() - 0.48) * 0.03;
        s.liveAttention = Math.min(0.96, Math.max(0.55, s.liveAttention + drift));
        if (!spoke && Math.random() < 0.08) s.activeSpeaker = null;
      }

      const visualId = s.activeSpeaker;
      const audioId = visualId ? "speaker_" + (ACMA_DATA.participants.findIndex((p) => p.id === visualId) + 1) : null;
      const obj = {
        timestamp: new Date().toISOString(),
        session_id: s.code,
        elapsed_s: Number(t.toFixed(1)),
        active_speaker_audio_id: audioId,
        active_speaker_visual_id: visualId,
        transcript_chunk: s.transcript.length ? s.transcript[s.transcript.length - 1].text : "",
        audio_metrics: {
          db_level: Number(s.liveDb.toFixed(1)),
          interruption_detected: Boolean(next && next.interrupt && t >= next.t && t < next.t + 0.4)
        },
        visual_metrics: {
          raised_hands: s.raisedHands.map((id) => participantById(id).name),
          room_attention_score: Number(s.liveAttention.toFixed(2))
        }
      };
      s.ticks.push(obj);
      if (s.ticks.length > 240) s.ticks.shift();
      s.attentionSeries.push({ t, v: s.liveAttention });
      if (s.attentionSeries.length > 240) s.attentionSeries.shift();
      this.onTick(s, obj);
    }

    end() {
      if (!this.session) return null;
      this.session.status = "ended";
      this.session.endedAt = new Date().toISOString();
      this.session.pipeline = "summarizing";
      clearInterval(this.timer);
      this.timer = null;

      const talk = Object.entries(this.session.talkSeconds).sort((a, b) => b[1] - a[1]);
      const dominant = talk.filter(([, sec]) => sec >= 12).map(([id]) => participantById(id));
      const silent = talk.filter(([, sec]) => sec < 4).map(([id]) => participantById(id));
      const pkg = ACMA_DATA.summaryPackage;
      this.session.report = {
        generatedAt: new Date().toISOString(),
        abstract: pkg.abstract,
        decisions: pkg.decisions.slice(),
        actions: pkg.actions.slice(),
        themes: pkg.themes.slice(),
        dominant: dominant.map((p) => p.name),
        silent: silent.map((p) => p.name),
        interruptions: this.session.interruptions,
        volumeSpikes: this.session.volumeSpikes,
        uncertainMatches: this.session.uncertainMatches,
        durationSec: Math.round(this.elapsed),
        wer: 3.8,
        speakerAccuracy: 98.2
      };
      this.session.pipeline = "complete";
      return this.session;
    }

    stop() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
    }
  }

  global.ACMA_ENGINE = { loadState, saveState, defaultState, SessionEngine, participantById };
})(window);
