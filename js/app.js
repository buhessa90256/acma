(function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  const state = ACMA_ENGINE.loadState();
  let user = null;
  let engine = null;
  let mediaStream = null;
  let recognizing = false;
  let recognition = null;
  const screens = ["login", "home", "live", "report", "admin", "compliance", "account"];

  function toast(msg) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(function () { el.classList.remove("show"); }, 2800);
  }

  function persist() { ACMA_ENGINE.saveState(state); }

  function ensureUser(role) {
    const key = role || state.userRole || "host";
    user = Object.assign({}, ACMA_DATA.users[key] || ACMA_DATA.users.host);
    state.userRole = user.role;
    persist();
    const chip = $("#who-chip");
    if (chip) chip.textContent = (user.short || user.name) + " \u00b7 " + user.role;
    return user;
  }

  function show(name) {
    screens.forEach(function (id) {
      const el = $("#screen-" + id);
      if (el) el.classList.toggle("active", id === name);
    });
    $$(".tabbar button, .desk-nav button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-go") === name);
    });
    window.scrollTo(0, 0);
  }

  function go(name) {
    ensureUser();
    if (name === "home") { renderHome(); show("home"); return; }
    if (name === "live") { show("live"); if (!engine) startSession(); return; }
    if (name === "report") { renderReport(state.sessions[0] || { report: null, title: "No report", transcript: [] }); show("report"); return; }
    if (name === "account") { renderAccount(); show("account"); return; }
    if (name === "admin") { renderAdmin(); show("admin"); return; }
    if (name === "compliance") { renderCompliance(); show("compliance"); return; }
    if (name === "login") show("login");
  }

  function login(role) {
    ensureUser(role);
    renderHome();
    show("home");
    toast("Signed in as " + user.title);
  }

  function renderHome() {
    ensureUser();
    const first = user.short || user.name;
    let blurb = "Review consent posture and classroom capture rules.";
    if (user.role === "host") blurb = "Start an assisted session for Hall 402-B.";
    else if (user.role === "attendee") blurb = "Join the live room to follow captions and raise a hand.";
    else if (user.role === "admin") blurb = "Confirm A/V endpoints and retention defaults.";
    $("#home-hero").innerHTML = '<p class="kicker">' + user.title + "</p><h2>Good day, " + first + ".</h2><p>" + blurb + "</p>";
    const last = state.sessions[0];
    const acc = last && last.report && last.report.speakerAccuracy ? last.report.speakerAccuracy : "-";
    $("#home-stats").innerHTML =
      '<div class="card stat"><div class="val">' + state.sessions.length + '</div><div class="lbl">Stored sessions</div></div>' +
      '<div class="card stat"><div class="val">' + (state.consent ? "On" : "Off") + '</div><div class="lbl">Capture consent</div></div>' +
      '<div class="card stat"><div class="val">' + state.retentionDays + 'd</div><div class="lbl">Retention window</div></div>' +
      '<div class="card stat"><div class="val">' + acc + '</div><div class="lbl">Last ID accuracy</div></div>';
    let extra = "";
    if (user.role === "admin") extra += '<button class="btn ghost" data-act="admin" type="button">A/V and retention</button>';
    if (user.role === "compliance") extra += '<button class="btn ghost" data-act="legal" type="button">Compliance desk</button>';
    $("#home-actions").innerHTML =
      '<button class="btn full" data-act="start" type="button">' + (user.role === "attendee" ? "Join live session" : "Run assisted session") + "</button>" +
      '<div class="row" style="margin-top:10px"><button class="btn ghost" data-act="reports" type="button">Session reports</button>' + extra + "</div>";
    const list = state.sessions.slice(0, 5).map(function (s) {
      return '<button class="card" style="text-align:left;width:100%" data-open="' + s.id + '" type="button"><h3>' + s.title + '</h3><p class="muted">' + s.code + " \u00b7 " + s.room + " \u00b7 " + s.status + "</p></button>";
    }).join("");
    $("#home-sessions").innerHTML = list || '<div class="card muted">No finalized sessions yet.</div>';
  }

  function renderFaces(session) {
    $("#faces").innerHTML = ACMA_DATA.participants.map(function (p) {
      const on = session.activeSpeaker === p.id;
      const hand = session.raisedHands.indexOf(p.id) !== -1;
      return '<div class="face ' + (on ? "on" : "") + '"><div class="dot" style="background:' + p.color + "33;color:" + p.color + '">' + p.initials + "</div><b>" + p.name.split(" ").pop() + '</b><span class="muted">' + (on ? "speaking" : hand ? "hand" : p.role) + "</span></div>";
    }).join("");
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
    $("#transcript").innerHTML = session.transcript.slice().reverse().map(function (line) {
      return '<div class="line"><time>' + fmtT(line.t) + '</time><div><span class="spk">' + line.speaker + "</span> " + escapeHtml(line.text) + "</div></div>";
    }).join("");
    renderFaces(session);
    $("#live-status").textContent = session.pipeline === "ready" ? "LIVE" : String(session.pipeline).toUpperCase();
  }

  function onEngineEvent(type, payload) {
    if (type === "interrupt") toast("Cross-talk flagged \u00b7 " + payload.speaker);
    if (type === "hand") toast("Raised hand \u00b7 " + payload.participant.name);
    if (type === "pipeline") toast(payload.message);
  }

  function startSession() {
    ensureUser();
    if (!state.consent) {
      show("live");
      $("#modal-consent").classList.add("open");
      return;
    }
    if (engine) engine.stop();
    engine = new ACMA_ENGINE.SessionEngine(renderTick, onEngineEvent);
    const speedEl = $("#speed");
    engine.setSpeed(Number(speedEl && speedEl.value) || 2);
    const session = engine.start();
    $("#session-code").textContent = session.code;
    $("#session-title").textContent = session.title;
    $("#caption-who").textContent = "Calibrating capture pipeline";
    $("#caption-text").textContent = "Camera, mic array and VAD coming online.";
    $("#transcript").innerHTML = "";
    renderFaces(session);
    show("live");
    $("#chip-live").classList.remove("hidden");
    if (user.role !== "attendee") tryCamera();
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
    if (mediaStream) mediaStream.getTracks().forEach(function (t) { t.stop(); });
    mediaStream = null;
    const v = $("#room-video");
    if (v) { v.srcObject = null; v.classList.add("hidden"); }
    const fb = $("#room-fallback");
    if (fb) fb.classList.remove("hidden");
  }

  function endSession() {
    if (!engine) {
      renderReport({ report: null, title: "No report", transcript: [] });
      show("report");
      return;
    }
    const session = engine.end();
    state.sessions.unshift(session);
    persist();
    stopCamera();
    $("#chip-live").classList.add("hidden");
    engine = null;
    renderReport(session);
    show("report");
    toast("Minutes package ready.");
  }

  function renderReport(session) {
    const r = session && session.report;
    if (!r) {
      $("#report-body").innerHTML = '<div class="hero"><p class="kicker">Session report</p><h2>No minutes yet</h2><p>Open Live, grant consent, then end the session to generate a report.</p></div><button class="btn" data-go="live" type="button" style="margin-top:12px">Go to Live</button>';
      return;
    }
    $("#report-body").innerHTML =
      '<div class="hero"><p class="kicker">Session report</p><h2>' + session.title + "</h2><p>" + session.code + " \u00b7 " + session.room + " \u00b7 " + r.durationSec + "s</p></div>" +
      '<div class="grid stats" style="margin-top:12px">' +
      '<div class="card stat"><div class="val">' + session.transcript.length + '</div><div class="lbl">Transcript chunks</div></div>' +
      '<div class="card stat"><div class="val">' + r.interruptions + '</div><div class="lbl">Interruptions</div></div>' +
      '<div class="card stat"><div class="val">' + r.volumeSpikes + '</div><div class="lbl">Volume spikes</div></div>' +
      '<div class="card stat"><div class="val">' + r.speakerAccuracy + '%</div><div class="lbl">Speaker map</div></div></div>' +
      '<section class="card report" style="margin-top:12px"><h3>Executive summary</h3><p>' + r.abstract + "</p></section>" +
      '<section class="card report"><h3>Key decisions</h3><ul>' + r.decisions.map(function (d) { return "<li>" + d + "</li>"; }).join("") + "</ul></section>" +
      '<section class="card report"><h3>Action items</h3><ul>' + r.actions.map(function (a) { return "<li><b>" + a.owner + "</b> - " + a.task + " (" + a.due + ")</li>"; }).join("") + "</ul></section>" +
      '<section class="card"><h3>Diarized transcript</h3><div class="list" style="max-height:360px;margin-top:8px">' +
      session.transcript.map(function (line) {
        return '<div class="line"><time>' + fmtT(line.t) + '</time><div><span class="spk">' + line.speaker + "</span> " + escapeHtml(line.text) + "</div></div>";
      }).join("") + "</div></section>" +
      '<div class="row" style="margin-top:12px"><button class="btn" id="btn-share" type="button">Share notes</button><button class="btn ghost" id="btn-export" type="button">Export JSON</button></div>';
    const share = $("#btn-share");
    const exp = $("#btn-export");
    if (share) share.onclick = function () { toast("Notes queued to absentees and attendees."); };
    if (exp) exp.onclick = function () { exportSession(session); };
  }

  function exportSession(session) {
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = session.code + "-package.json";
    a.click();
  }

  function renderAdmin() {
    $("#admin-body").innerHTML =
      '<div class="hero"><p class="kicker">IT and AV</p><h2>Configure room integration</h2><p>Software integrates with existing hardware.</p></div>' +
      '<div class="card" style="margin-top:12px">' +
      '<div class="toggle"><span>Camera endpoint</span><input id="av-cam" type="text" value="' + state.av.camera + '"></div>' +
      '<div class="toggle"><span>Microphone array</span><input id="av-mic" type="text" value="' + state.av.mic + '"></div>' +
      '<div class="toggle"><span>Gateway</span><input id="av-gw" type="text" value="' + state.av.gateway + '"></div>' +
      '<div class="toggle"><span>Retention (days)</span><input id="av-ret" type="text" value="' + state.retentionDays + '"></div></div>' +
      '<button class="btn full" style="margin-top:12px" id="save-av" type="button">Save configuration</button>';
    $("#save-av").onclick = function () {
      state.av.camera = $("#av-cam").value;
      state.av.mic = $("#av-mic").value;
      state.av.gateway = $("#av-gw").value;
      state.retentionDays = Number($("#av-ret").value) || 14;
      persist();
      toast("A/V profile saved.");
    };
  }

  function renderCompliance() {
    $("#compliance-body").innerHTML =
      '<div class="hero"><p class="kicker">GDPR / FERPA</p><h2>Privacy and retention desk</h2><p>Streams stay in-memory unless recording consent is explicit.</p></div>' +
      '<div class="card" style="margin-top:12px">' +
      '<div class="toggle"><span>Session capture consent</span><b>' + (state.consent ? "Granted" : "Missing") + "</b></div>" +
      '<div class="toggle"><span>Retention window</span><b>' + state.retentionDays + " days</b></div>" +
      '<div class="toggle"><span>Sessions on device</span><b>' + state.sessions.length + "</b></div></div>" +
      '<div class="row" style="margin-top:12px"><button class="btn warn" id="purge" type="button">Purge local sessions</button><button class="btn ghost" id="revoke" type="button">Revoke consent</button></div>';
    $("#purge").onclick = function () { state.sessions = []; persist(); toast("Local transcripts purged."); renderCompliance(); };
    $("#revoke").onclick = function () { state.consent = false; state.recordConsentedMedia = false; persist(); toast("Consent revoked."); renderCompliance(); };
  }

  function renderAccount() {
    ensureUser();
    $("#account-body").innerHTML =
      '<div class="hero"><p class="kicker">Account</p><h2>' + user.name + "</h2><p>" + user.title + "</p></div>" +
      '<div class="card" style="margin-top:12px"><div class="toggle"><span>Role</span><b>' + user.role + "</b></div></div>" +
      '<p class="muted" style="margin:14px 2px 8px">Switch demo role</p>' +
      '<div class="grid roles" style="margin-top:0">' +
      '<button class="role" data-role="host" type="button"><div class="avatar" style="background:#2ee6c833;color:#2ee6c8">AH</div><div><h3>Dr. Amal Hassan</h3><p>Faculty / Meeting Host</p></div></button>' +
      '<button class="role" data-role="attendee" type="button"><div class="avatar" style="background:#4cc9f033;color:#4cc9f0">JL</div><div><h3>Jordan Lee</h3><p>Student / Attendee</p></div></button>' +
      '<button class="role" data-role="admin" type="button"><div class="avatar" style="background:#f4b94233;color:#f4b942">SQ</div><div><h3>Samir Qureshi</h3><p>IT and AV</p></div></button>' +
      '<button class="role" data-role="compliance" type="button"><div class="avatar" style="background:#a78bfa33;color:#a78bfa">EV</div><div><h3>Elena Voss</h3><p>Compliance and Legal</p></div></button></div>';
  }

  function handleClick(e) {
    const roleBtn = e.target.closest("[data-role]");
    if (roleBtn) { login(roleBtn.getAttribute("data-role")); return; }
    const actBtn = e.target.closest("[data-act]");
    const act = actBtn && actBtn.getAttribute("data-act");
    const goBtn = e.target.closest("[data-go]");
    const dest = goBtn && goBtn.getAttribute("data-go");
    const openBtn = e.target.closest("[data-open]");
    const open = openBtn && openBtn.getAttribute("data-open");
    if (act === "start") startSession();
    if (act === "reports") go("report");
    if (act === "admin") go("admin");
    if (act === "legal") go("compliance");
    if (dest) go(dest);
    if (open) {
      const s = state.sessions.find(function (x) { return x.id === open; });
      if (s) { renderReport(s); show("report"); }
    }
  }

  function toggleSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast("Live mic STT is not available in this browser. Demo captions still run."); return; }
    if (recognizing) { recognition.stop(); recognizing = false; $("#btn-mic").textContent = "Host mic"; return; }
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = function (ev) {
      let text = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) text += ev.results[i][0].transcript;
      if (text.trim() && engine && engine.session) {
        $("#caption-who").textContent = (user && user.name ? user.name : "Host") + " \u00b7 device mic";
        $("#caption-text").textContent = text.trim();
      }
    };
    recognition.onend = function () { recognizing = false; };
    recognition.start();
    recognizing = true;
    $("#btn-mic").textContent = "Stop mic";
    toast("Device speech recognition on.");
  }

  document.body.addEventListener("click", handleClick);
  $("#btn-end").addEventListener("click", endSession);
  $("#btn-hand").addEventListener("click", function () {
    if (engine) engine.raiseHand(user && user.id === "u-jordan" ? "p-jordan" : "p-maya");
  });
  $("#speed").addEventListener("change", function (e) {
    if (engine) engine.setSpeed(Number(e.target.value));
  });
  $("#grant-consent").addEventListener("click", function () {
    state.consent = true;
    state.recordConsentedMedia = $("#consent-record").checked;
    persist();
    $("#modal-consent").classList.remove("open");
    startSession();
  });
  $("#deny-consent").addEventListener("click", function () {
    $("#modal-consent").classList.remove("open");
    toast("Capture blocked. You can still browse Home, Report and Account.");
  });
  $("#btn-mic").addEventListener("click", toggleSpeech);
  $("#who-chip").addEventListener("click", function () { go("account"); });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(function () {});
  }

  window.ACMA = { go: go, login: login };
  ensureUser(state.userRole || "host");
  renderHome();
  show("home");
})();
