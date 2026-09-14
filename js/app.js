(function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  let user = null;
  let room = null;
  let mediaStream = null;
  const screens = ["auth", "home", "room", "live", "report", "account"];

  function toast(msg) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(function () { el.classList.remove("show"); }, 2600);
  }

  function show(name) {
    screens.forEach(function (id) {
      const el = $("#screen-" + id);
      if (el) el.classList.toggle("active", id === name);
    });
    $$(".tabbar button, .desk-nav button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-go") === name);
    });
    $$(".need-auth").forEach(function (el) { el.classList.toggle("hidden", !user); });
    window.scrollTo(0, 0);
  }

  function refreshUser() {
    const raw = ACMA_STORE.current();
    user = raw ? ACMA_STORE.publicUser(raw) : null;
    const chip = $("#who-chip");
    if (chip) chip.textContent = user ? user.name : "Sign in";
    return user;
  }

  function go(name) {
    refreshUser();
    if (!user && name !== "auth") { show("auth"); toast("Create an account or sign in first."); return; }
    if (name === "home") { renderHome(); show("home"); return; }
    if (name === "room") {
      if (!room) { renderHome(); show("home"); toast("Open or join a room first."); return; }
      renderRoom(); show("room"); return;
    }
    if (name === "live") {
      if (!room) { renderHome(); show("home"); toast("Join a room to go live."); return; }
      renderLive(); show("live"); return;
    }
    if (name === "report") { renderReport(); show("report"); return; }
    if (name === "account") { renderAccount(); show("account"); return; }
    if (name === "auth") show("auth");
  }

  function setAuthMode(mode) {
    $("#auth-register") && $("#form-register").classList.toggle("hidden", mode !== "register");
    $("#form-login").classList.toggle("hidden", mode !== "login");
    $$("[data-auth]").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-auth") === mode); });
  }

  async function onRegister(e) {
    e.preventDefault();
    $("#reg-err").textContent = "";
    try {
      user = await ACMA_STORE.register($("#reg-name").value, $("#reg-email").value, $("#reg-pass").value);
      refreshUser(); renderHome(); show("home");
      toast("Account created. Welcome, " + user.name + ".");
    } catch (err) { $("#reg-err").textContent = err.message; }
  }

  async function onLogin(e) {
    e.preventDefault();
    $("#login-err").textContent = "";
    try {
      user = await ACMA_STORE.login($("#login-email").value, $("#login-pass").value);
      refreshUser(); renderHome(); show("home");
      toast("Signed in as " + user.name + ".");
    } catch (err) { $("#login-err").textContent = err.message; }
  }

  function renderHome() {
    refreshUser();
    if (!user) { show("auth"); return; }
    $("#home-hero").innerHTML = '<p class="kicker">Your workspace</p><h2>Hello, ' + user.name.split(" ")[0] + '.</h2><p>Create a room, then share the code so others can join.</p>';
    const list = ACMA_STORE.myRooms().map(function (r) {
      const p = ACMA_STORE.populated(r);
      const role = r.hostId === user.id ? "Host" : "Member";
      return '<button class="card" type="button" data-open-room="' + r.id + '" style="text-align:left;width:100%"><h3>' + r.name + '</h3><p class="muted">' + r.code + " \u00b7 " + role + " \u00b7 " + p.members.length + " members \u00b7 " + r.status + "</p></button>";
    }).join("");
    $("#home-rooms").innerHTML = list || '<div class="card muted">No rooms yet. Create one or join with a code.</div>';
  }

  function openRoom(id) {
    const found = ACMA_STORE.getRoom(id);
    if (!found) { toast("Room not found."); return; }
    room = ACMA_STORE.populated(found);
    renderRoom(); show("room");
  }

  function createRoom() {
    $("#create-err").textContent = "";
    try {
      const created = ACMA_STORE.createRoom($("#room-name").value, $("#room-topic").value);
      room = ACMA_STORE.populated(created);
      $("#room-name").value = ""; $("#room-topic").value = "";
      renderRoom(); show("room");
      toast("Room created. Share code " + room.code);
    } catch (err) { $("#create-err").textContent = err.message; }
  }

  function joinByCode() {
    $("#join-err").textContent = "";
    try {
      const joined = ACMA_STORE.joinRoom($("#join-code").value);
      room = ACMA_STORE.populated(joined);
      $("#join-code").value = "";
      renderRoom(); show("room");
      toast("Joined " + room.name);
    } catch (err) { $("#join-err").textContent = err.message; }
  }

  function reloadRoom() {
    if (!room) return null;
    room = ACMA_STORE.populated(ACMA_STORE.getRoom(room.id));
    return room;
  }

  function escapeHtml(s) {
    const box = document.createElement("div");
    box.textContent = s == null ? "" : String(s);
    return box.innerHTML;
  }

  function renderRoom() {
    reloadRoom();
    if (!room) { renderHome(); show("home"); return; }
    const host = room.members.find(function (m) { return m.role === "host"; });
    $("#room-title").textContent = room.name;
    $("#room-meta").textContent = (room.topic || "No topic") + " \u00b7 hosted by " + (host ? host.name : "-");
    $("#room-code").textContent = room.code;
    $("#room-status").textContent = room.live ? "LIVE" : String(room.status).toUpperCase();
    $("#room-members").innerHTML = room.members.map(function (m) {
      const hand = room.hands.indexOf(m.userId) !== -1;
      return '<div class="member"><div class="avatar" style="background:#2ee6c833;color:#2ee6c8">' + m.initials + "</div><div><b>" + m.name + '</b><p class="muted">' + m.role + (hand ? " \u00b7 hand raised" : "") + "</p></div></div>";
    }).join("");
    $("#room-chat").innerHTML = room.messages.slice(-40).map(function (msg) {
      const t = new Date(msg.at);
      const stamp = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
      return '<div class="line"><time>' + stamp + '</time><div><span class="spk">' + msg.name + "</span> " + escapeHtml(msg.text) + "</div></div>";
    }).join("") || '<p class="muted">No messages yet.</p>';
  }

  function sendMessage() {
    if (!room) return;
    try {
      ACMA_STORE.addMessage(room.id, $("#chat-text").value);
      $("#chat-text").value = "";
      renderRoom();
      if ($("#screen-live").classList.contains("active")) renderLive();
    } catch (err) { toast(err.message); }
  }

  function copyCode() {
    if (!room) return;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(room.code).then(function () { toast("Code copied: " + room.code); });
    else toast(room.code);
  }

  function renderLive() {
    reloadRoom();
    if (!room) return;
    $("#session-code").textContent = room.code;
    $("#session-title").textContent = room.name;
    $("#live-status").textContent = room.live ? "LIVE" : "STANDBY";
    $("#faces").innerHTML = room.members.map(function (m) {
      const hand = room.hands.indexOf(m.userId) !== -1;
      return '<div class="face"><div class="dot" style="background:#2ee6c833;color:#2ee6c8">' + m.initials + "</div><b>" + m.name.split(" ")[0] + '</b><span class="muted">' + (hand ? "hand" : m.role) + "</span></div>";
    }).join("");
    const last = room.messages[room.messages.length - 1];
    $("#caption-who").textContent = last ? last.name + " \u00b7 room feed" : "Waiting";
    $("#caption-text").textContent = last ? last.text : "Type a note or use Host mic.";
    $("#transcript").innerHTML = room.messages.slice().reverse().slice(0, 30).map(function (msg) {
      const t = new Date(msg.at);
      const stamp = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
      return '<div class="line"><time>' + stamp + '</time><div><span class="spk">' + msg.name + "</span> " + escapeHtml(msg.text) + "</div></div>";
    }).join("") || '<p class="muted">Live transcript is empty.</p>';
    $("#json-live").textContent = JSON.stringify({ timestamp: new Date().toISOString(), room_code: room.code, members: room.members.map(function (m) { return m.name; }), live: room.live }, null, 2);
    $("#att-val").textContent = room.members.length;
    $("#att-bar").style.width = Math.min(100, room.members.length * 18) + "%";
    $("#hands-val").textContent = room.hands.length;
    $("#int-val").textContent = room.messages.length;
    $("#db-val").textContent = room.live ? "on" : "off";
  }

  function startLive() {
    if (!room) return;
    ACMA_STORE.setLive(room.id, true);
    reloadRoom(); renderLive(); show("live");
    $("#chip-live").classList.remove("hidden");
    tryCamera();
    toast("Room is live.");
  }

  function endLive() {
    if (!room) return;
    ACMA_STORE.setLive(room.id, false);
    stopCamera();
    $("#chip-live").classList.add("hidden");
    reloadRoom(); renderReport(); show("report");
    toast("Session closed. Minutes built from the room thread.");
  }

  function renderReport() {
    refreshUser();
    const rooms = user ? ACMA_STORE.myRooms() : [];
    const target = room ? ACMA_STORE.populated(ACMA_STORE.getRoom(room.id)) : (rooms[0] ? ACMA_STORE.populated(rooms[0]) : null);
    if (!target) {
      $("#report-body").innerHTML = '<div class="hero"><p class="kicker">Minutes</p><h2>No room yet</h2><p>Create or join a room first.</p></div>';
      return;
    }
    const speakers = {};
    target.messages.forEach(function (m) { speakers[m.name] = (speakers[m.name] || 0) + 1; });
    const ranked = Object.keys(speakers).sort(function (a, b) { return speakers[b] - speakers[a]; });
    $("#report-body").innerHTML =
      '<div class="hero"><p class="kicker">Session report</p><h2>' + target.name + "</h2><p>" + target.code + " \u00b7 " + target.members.length + " members \u00b7 " + target.messages.length + " notes</p></div>" +
      '<section class="card report" style="margin-top:12px"><h3>Summary</h3><p>' + target.members.length + " people in " + target.name + ". " + target.messages.length + " contributions captured.</p></section>" +
      '<section class="card report"><h3>Who spoke</h3><ul>' + (ranked.length ? ranked.map(function (n) { return "<li>" + n + " \u2014 " + speakers[n] + " turns</li>"; }).join("") : "<li>No speakers yet.</li>") + "</ul></section>" +
      '<section class="card"><h3>Full transcript</h3><div class="list" style="max-height:360px;margin-top:8px">' +
      target.messages.map(function (msg) { return '<div class="line"><time></time><div><span class="spk">' + msg.name + "</span> " + escapeHtml(msg.text) + "</div></div>"; }).join("") +
      "</div></section>";
  }

  function renderAccount() {
    refreshUser();
    if (!user) { show("auth"); return; }
    $("#account-body").innerHTML =
      '<div class="hero"><p class="kicker">Account</p><h2>' + user.name + "</h2><p>" + user.email + "</p></div>" +
      '<div class="card" style="margin-top:12px"><div class="toggle"><span>Rooms</span><b>' + ACMA_STORE.myRooms().length + "</b></div></div>" +
      '<button class="btn ghost full" style="margin-top:12px" id="signout" type="button">Sign out</button>';
    $("#signout").onclick = function () {
      stopCamera(); ACMA_STORE.logout(); user = null; room = null;
      $("#chip-live").classList.add("hidden"); $("#who-chip").textContent = "Sign in";
      show("auth"); toast("Signed out.");
    };
  }

  async function tryCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      const v = $("#room-video");
      v.srcObject = mediaStream; v.classList.remove("hidden"); $("#room-fallback").classList.add("hidden");
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

  function toggleSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast("Type notes if speech recognition is unavailable."); return; }
    if (!room) { toast("Open a room first."); return; }
    const rec = new SR();
    rec.lang = "en-US"; rec.interimResults = false;
    rec.onresult = function (ev) {
      try { ACMA_STORE.addMessage(room.id, ev.results[0][0].transcript); renderLive(); renderRoom(); } catch (err) {}
    };
    rec.start(); toast("Listening...");
  }

  document.body.addEventListener("click", function (e) {
    const auth = e.target.closest("[data-auth]");
    if (auth) setAuthMode(auth.getAttribute("data-auth"));
    const goBtn = e.target.closest("[data-go]");
    if (goBtn) go(goBtn.getAttribute("data-go"));
    const open = e.target.closest("[data-open-room]");
    if (open) openRoom(open.getAttribute("data-open-room"));
  });

  $("#form-register").addEventListener("submit", onRegister);
  $("#form-login").addEventListener("submit", onLogin);
  $("#btn-create-room").addEventListener("click", createRoom);
  $("#btn-join-room").addEventListener("click", joinByCode);
  $("#btn-copy-code").addEventListener("click", copyCode);
  $("#btn-send").addEventListener("click", sendMessage);
  $("#chat-text").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  $("#btn-start-live").addEventListener("click", startLive);
  $("#btn-hand").addEventListener("click", function () {
    if (!room) return; ACMA_STORE.toggleHand(room.id); renderRoom(); renderLive();
  });
  $("#btn-end").addEventListener("click", endLive);
  $("#btn-mic").addEventListener("click", toggleSpeech);
  $("#who-chip").addEventListener("click", function () { go(user ? "account" : "auth"); });
  $("#btn-leave").addEventListener("click", function () {
    if (!room) return; ACMA_STORE.leaveRoom(room.id); room = null; renderHome(); show("home"); toast("Left the room.");
  });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(function () {});
  window.ACMA = { go: go };
  refreshUser();
  setAuthMode("register");
  if (user) { renderHome(); show("home"); } else show("auth");
})();
