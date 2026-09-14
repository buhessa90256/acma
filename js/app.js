(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const state = ACMA_ENGINE.loadState();
  let user = null;
  let engine = null;
  let mediaStream = null;
  let recognizing = false;
  let recognition = null;
  const screens = ["login", "home", "live", "report", "admin", "compliance", "account"];

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2800);
  }

  function show(name) {
    screens.forEach((id) => $("#screen-" + id)?.classList.toggle("active", id === name));
    $$(".tabbar button, .desk-nav button").forEach((b) => {
      b.classList.toggle("active", b.dataset.go === name);
    });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function persist() {
    ACMA_ENGINE.saveState(state);
  }

  function login(role) {
    user = { ...ACMA_DATA.users[role] };
    $("#who-chip").textContent = user.name.split(" ")[0] + " \u00b7 " + user.role;
    renderHome();
    show("home");
    toast("Signed in as " + user.title);
  }

  function renderHome() {
    $("#home-hero").innerHTML = `<p class="kicker">${user.title}</p><h2>Good day, ${user.name.split(" ")[0]}.</h2><p>${
      user.role === "host"
        ? "Start an assisted session for Hall 402-B. Edge vision and cloud STT will bind who said what in real time."
        : user.role === "attendee"
        ? "Join the live room to follow captions and raise a hand. Your biometric stream is processed in-memory unless you consented to recording."
        : user.role === "admin"
        ? "Confirm A/V endpoints, WebRTC gateway health, and retention defaults before faculty go live."
        : "Review consent posture, purge policy, and FERPA/GDPR alignment for classroom capture."
    }</p>`;
    const last = state.sessions[0];
    $("#home-stats").innerHTML = `<div class="card stat"><div class="val">${state.sessions.length}</div><div class="lbl">Stored sessions</div></div><div class="card stat"><div class="val">${state.consent ? "On" : "Off"}</div><div class="lbl">Capture consent</div></div><div class="card stat"><div class="val">${state.retentionDays}d</div><div class="lbl">Retention window</div></div><div class="card stat"><div class="val">${last ? last.report?.speakerAccuracy || "\u2014" : "\u2014"}</div><div class="lbl">Last ID accuracy</div></div>`;
    $("#home-actions").innerHTML = `<button class="btn full" data-act="start">${user.role === "attendee" ? "Join live session" : "Run assisted session"}</button><div class="row" style="margin-top:10px"><button class="btn ghost" data-act="reports">Session reports</button>${user.role === "admin" ? '<button class="btn ghost" data-act="admin">A/V and retention</button>' : ""}${user.role === "compliance" ? '<button class="btn ghost" data-act="legal">Compliance desk</button>' : ""}</div>`;
    const list = state.sessions.slice(0, 5).map((s) => `<button class="card" style="text-align:left;width:100%" data-open="${s.id}"><h3>${s.title}</h3><p class="muted">${s.code} \u00b7 ${s.room} \u00b7 ${s.status} \u00b7 ${new Date(s.startedAt).toLocaleString()}</p></button>`).join("") || `<div class="card muted">No finalized sessions yet.</div>`;
    $("#home-sessions").innerHTML = list;
  }

  function renderFaces(session) {
    $("#faces").innerHTML = ACMA_DATA.participants.map((p) => {
      const on = session.activeSpeaker === p.id;
      const hand = session.raisedHands.includes(p.id);
      return `<div class="face ${on ? "on" : ""}"><div class="dot" style="background:${p.color}33;color:${p.color}">${p.initials}${hand ? "\u270b" : ""}</div><b>${p.name.split(" ")[0]}</b><span class="muted">${on ? "speaking" : hand ? "hand" : p.role}</span></div>`;
    }).join("");
  }

  function renderTick(session, obj) {
    $("#att-val").textContent = Math.round(session.liveAttention * 100) + "%";
    $("#att-bar").style.width = session.liveAttention * 100 + "%";
    $("#db-val").textContent = Math.round(session.liveDb) + " dB";
    $("#db-bar").style.width = Math.min(100, (session.liveDb / 90) * 100) + "%";
    $("#db-meter").classList.toggle("hot", session.liveDb >= 70);
    $("#int-val").textContent = session.interruptions;
    $("#hands-val").textContent = session.raisedHands.length;
    const last = session.transcript[session.transcript.length - 1];
    if (last) {
      $("#caption-who").textContent = last.speaker + " \u00b7 bound via AV fusion";
      $("#caption-text").textContent = last.text;
    }
    $("#json-live").textContent = JSON.stringify(obj, null, 2);
    $("#transcript").innerHTML = session.transcript.slice().reverse().map((line) => `<div class="line"><time>${fmtT(line.t)}</time><div><span class="spk">${line.speaker}</span> ${escapeHtml(line.text)}</div></div>`).join("");
    renderFaces(session);
    $("#live-status").textContent = session.pipeline === "ready" ? "LIVE" : session.pipeline.toUpperCase();
  }

  function fmtT(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function escapeHtml(s) {
    const box = document.createElement("div");
    box.textContent = s == null ? "" : String(s);
    return box.innerHTML;
  }

  async function startSession() {
    if (!state.consent) {
      $("#modal-consent").classList.add("open");
      return;
    }
    if (engine) engine.stop();
    engine = new ACMA_ENGINE.SessionEngine(renderTick, onEngineEvent);
    engine.setSpeed(Number(document.getElementById("speed").value) || 2);
    const session = engine.start();
    $("#session-code").textContent = session.code;
    $("#session-title").textContent = session.title;
    $("#caption-who").textContent = "Calibrating capture pipeline";
    $("#caption-text").textContent = "Camera, mic array and VAD coming online\u2026";
    $("#transcript").innerHTML = "";
    renderFaces(session);
    show("live");
    $("#chip-live").classList.remove("hidden");
    if (user.role !== "attendee") tryCamera();
  }

  function onEngineEvent(type, payload) {
    if (type === "interrupt") toast("Cross-talk flagged \u00b7 " + payload.speaker);
    if (type === "hand") toast("Raised hand \u00b7 " + payload.participant.name);
    if (type === "pipeline") toast(payload.message);
  }

  async function tryCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      const v = $("#room-video");
      v.srcObject = mediaStream;
      v.classList.remove("hidden");
      $("#room-fallback").classList.add("hidden");
    } catch (err) {}
  }

  function stopCamera() {
    if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
    const v = $("#room-video");
    if (v) { v.srcObject = null; v.classList.add("hidden"); }
    const fb = $("#room-fallback");
    if (fb) fb.classList.remove("hidden");
  }

  function endSession() {
    if (!engine) return;
    const session = engine.end();
    state.sessions.unshift(session);
    persist();
    stopCamera();
    $("#chip-live").classList.add("hidden");
    renderReport(session);
    show("report");
    toast("Minutes package ready (under 5 minutes).");
  }

  function renderReport(session) {
    const r = session.report;
    if (!r) {
      $("#report-body").innerHTML = `<div class="card muted">End a live session to generate minutes.</div>`;
      return;
    }
    $("#report-body").innerHTML = `<div class="hero"><p class="kicker">Session report</p><h2>${session.title}</h2><p>${session.code} \u00b7 ${session.room} \u00b7 ${r.durationSec}s \u00b7 WER ${r.wer}% \u00b7 Speaker map ${r.speakerAccuracy}%</p></div><div class="grid stats" style="margin-top:12px"><div class="card stat"><div class="val">${session.transcript.length}</div><div class="lbl">Transcript chunks</div></div><div class="card stat"><div class="val">${r.interruptions}</div><div class="lbl">Interruptions</div></div><div class="card stat"><div class="val">${r.volumeSpikes}</div><div class="lbl">Volume spikes</div></div><div class="card stat"><div class="val">${r.uncertainMatches}</div><div class="lbl">Uncertain AV matches</div></div></div><section class="card report" style="margin-top:12px"><h3>Executive summary</h3><p>${r.abstract}</p></section><section class="card report"><h3>Key decisions</h3><ul>${r.decisions.map((d) => `<li>${d}</li>`).join("")}</ul></section><section class="card report"><h3>Action items</h3><ul>${r.actions.map((a) => `<li><b>${a.owner}</b> \u2014 ${a.task} <span class="muted">(${a.due})</span></li>`).join("")}</ul></section><section class="card"><h3>Participation flags</h3><div class="flags" style="margin-top:8px">${r.dominant.map((n) => `<span class="hot">Dominant \u00b7 ${n}</span>`).join("")}${r.silent.map((n) => `<span class="silent">Silent \u00b7 ${n}</span>`).join("")}</div><p class="muted" style="margin-top:8px">Flags are host-only and are not written into attendee notes.</p></section><section class="card"><h3>Diarized transcript</h3><div class="list" style="max-height:360px;margin-top:8px">${session.transcript.map((line) => `<div class="line"><time>${fmtT(line.t)}</time><div><span class="spk">${line.speaker}</span> ${escapeHtml(line.text)}</div></div>`).join("")}</div></section><div class="row" style="margin-top:12px"><button class="btn" id="btn-share">Share notes with absentees</button><button class="btn ghost" id="btn-export">Export JSON package</button></div>`;
    $("#btn-share").onclick = () => toast("Notes queued to absentees and attendees.");
    $("#btn-export").onclick = () => exportSession(session);
  }

  function exportSession(session) {
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = session.code + "-package.json";
    a.click();
  }

  function renderAdmin() {
    $("#admin-body").innerHTML = `<div class="hero"><p class="kicker">IT and AV</p><h2>Configure room integration</h2><p>Software integrates with existing hardware. No PTZ install is in scope.</p></div><div class="card" style="margin-top:12px"><div class="toggle"><span>Camera endpoint</span><input id="av-cam" type="text" value="${state.av.camera}"></div><div class="toggle"><span>Microphone array</span><input id="av-mic" type="text" value="${state.av.mic}"></div><div class="toggle"><span>Gateway</span><input id="av-gw" type="text" value="${state.av.gateway}"></div><div class="toggle"><span>Retention (days)</span><input id="av-ret" type="text" value="${state.retentionDays}"></div></div><div class="card" style="margin-top:12px"><h3>Conference connectors</h3><p class="muted">REST / Webhooks to Zoom, Teams and Google Meet.</p><div class="flags" style="margin-top:8px">${state.av.platforms.map((p) => `<span>${p} API</span>`).join("")}</div></div><button class="btn full" style="margin-top:12px" id="save-av">Save configuration</button>`;
    $("#save-av").onclick = () => {
      state.av.camera = $("#av-cam").value;
      state.av.mic = $("#av-mic").value;
      state.av.gateway = $("#av-gw").value;
      state.retentionDays = Number($("#av-ret").value) || 14;
      persist();
      toast("A/V profile saved.");
    };
  }

  function renderCompliance() {
    $("#compliance-body").innerHTML = `<div class="hero"><p class="kicker">GDPR / FERPA</p><h2>Privacy and retention desk</h2><p>Streams are encrypted in transit. Video and audio stay in-memory unless recording consent is explicit.</p></div><div class="card" style="margin-top:12px"><div class="toggle"><span>Session capture consent</span><b>${state.consent ? "Granted" : "Missing"}</b></div><div class="toggle"><span>Store consented recordings</span><b>${state.recordConsentedMedia ? "Allowed" : "Denied"}</b></div><div class="toggle"><span>Retention window</span><b>${state.retentionDays} days</b></div><div class="toggle"><span>Sessions on device</span><b>${state.sessions.length}</b></div></div><div class="row" style="margin-top:12px"><button class="btn warn" id="purge">Purge in-memory buffers and local sessions</button><button class="btn ghost" id="revoke">Revoke consent</button></div>`;
    $("#purge").onclick = () => {
      state.sessions = [];
      persist();
      toast("Local transcripts and metadata purged.");
      renderCompliance();
    };
    $("#revoke").onclick = () => {
      state.consent = false;
      state.recordConsentedMedia = false;
      persist();
      toast("Consent revoked. Future capture is blocked.");
      renderCompliance();
    };
  }

  function renderAccount() {
    $("#account-body").innerHTML = `<div class="hero"><p class="kicker">Account</p><h2>${user.name}</h2><p>${user.title}</p></div><div class="card" style="margin-top:12px"><div class="toggle"><span>Role</span><b>${user.role}</b></div><div class="toggle"><span>Language</span><select id="lang"><option value="en">English</option><option value="ar">Arabic</option></select></div></div><button class="btn ghost full" style="margin-top:12px" id="signout">Switch role / sign out</button>`;
    $("#lang").value = state.language;
    $("#lang").onchange = () => { state.language = $("#lang").value; persist(); toast("Language saved."); };
    $("#signout").onclick = () => {
      if (engine) engine.stop();
      stopCamera();
      user = null;
      $("#chip-live").classList.add("hidden");
      show("login");
    };
  }

  function wire() {
    $$("[data-role]").forEach((b) => b.addEventListener("click", () => login(b.dataset.role)));
    document.body.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]") && e.target.closest("[data-act]").dataset.act;
      const go = e.target.closest("[data-go]") && e.target.closest("[data-go]").dataset.go;
      const open = e.target.closest("[data-open]") && e.target.closest("[data-open]").dataset.open;
      if (act === "start") startSession();
      if (act === "reports") {
        renderReport(state.sessions[0] || { report: null, title: "No report", transcript: [] });
        show("report");
      }
      if (act === "admin") { renderAdmin(); show("admin"); }
      if (act === "legal") { renderCompliance(); show("compliance"); }
      if (go && user) {
        if (go === "home") renderHome();
        if (go === "live" && !engine) startSession();
        else if (go === "live") show("live");
        if (go === "report") { renderReport(state.sessions[0] || { report: null, title: "No report", transcript: [] }); show("report"); }
        if (go === "account") { renderAccount(); show("account"); }
        if (go === "admin") { renderAdmin(); show("admin"); }
        if (go === "compliance") { renderCompliance(); show("compliance"); }
      }
      if (open) {
        const s = state.sessions.find((x) => x.id === open);
        if (s) { renderReport(s); show("report"); }
      }
    });
    $("#btn-end").addEventListener("click", endSession);
    $("#btn-hand").addEventListener("click", () => {
      engine && engine.raiseHand(user && user.id === "u-jordan" ? "p-jordan" : "p-maya");
    });
    $("#speed").addEventListener("change", (e) => engine && engine.setSpeed(Number(e.target.value)));
    $("#grant-consent").addEventListener("click", () => {
      state.consent = true;
      state.recordConsentedMedia = $("#consent-record").checked;
      persist();
      $("#modal-consent").classList.remove("open");
      startSession();
    });
    $("#deny-consent").addEventListener("click", () => {
      $("#modal-consent").classList.remove("open");
      toast("Capture blocked — consent token missing.");
    });
    $("#btn-mic").addEventListener("click", toggleSpeech);
  }

  function toggleSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast("Live mic STT is not available in this browser. Demo captions still run."); return; }
    if (recognizing) { recognition.stop(); recognizing = false; $("#btn-mic").textContent = "Host mic"; return; }
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (ev) => {
      let text = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) text += ev.results[i][0].transcript;
      if (text.trim() && engine && engine.session) {
        $("#caption-who").textContent = (user && user.name ? user.name : "Host") + " \u00b7 device mic";
        $("#caption-text").textContent = text.trim();
      }
    };
    recognition.onend = () => { recognizing = false; };
    recognition.start();
    recognizing = true;
    $("#btn-mic").textContent = "Stop mic";
    toast("Device speech recognition on.");
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  wire();
  show("login");
})();
