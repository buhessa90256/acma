(function () {
  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  let user = null; let room = null;
  const screens = ["auth", "home", "meet", "report", "account", "demo"];
  function toast(msg) {
    const el = $("#toast"); if (!el) return;
    el.textContent = msg; el.classList.add("show");
    setTimeout(function () { el.classList.remove("show"); }, 2800);
  }
  function show(name) {
    screens.forEach(function (id) { const el = $("#screen-" + id); if (el) el.classList.toggle("active", id === name); });
    $$(".tabbar button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-go") === name); });
    $$(".need-auth").forEach(function (el) { el.classList.toggle("hidden", !user); });
    window.scrollTo(0, 0);
    if (name !== "demo" && window.ACMA_DEMO) ACMA_DEMO.stop();
  }
  function refreshUser() {
    const raw = ACMA_STORE.current();
    user = raw ? ACMA_STORE.publicUser(raw) : null;
    const chip = $("#who-chip"); if (chip) chip.textContent = user ? user.name : ACMA_I18N.t("signIn");
    return user;
  }
  function go(name) {
    refreshUser();
    if (name === "demo") { openDemo(); return; }
    if (!user && name !== "auth") { show("auth"); return; }
    if (name === "home") { renderHome(); show("home"); return; }
    if (name === "meet" || name === "room" || name === "live") {
      if (!room) { renderHome(); show("home"); toast(ACMA_I18N.t("needRoom")); return; }
      renderMeet(); show("meet"); autoMedia(); return;
    }
    if (name === "report") { renderReport(); show("report"); return; }
    if (name === "account") { renderAccount(); show("account"); return; }
    show("auth");
  }
  function setAuthMode(mode) {
    var reg = $("#form-register"); var login = $("#form-login");
    if (reg) reg.classList.toggle("hidden", mode !== "register");
    if (login) login.classList.toggle("hidden", mode !== "login");
    $$("[data-auth]").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-auth") === mode); });
  }
  async function onRegister(e) {
    e.preventDefault(); $("#reg-err").textContent = "";
    try { user = await ACMA_STORE.register($("#reg-name").value, $("#reg-email").value, $("#reg-pass").value); refreshUser(); renderHome(); show("home"); }
    catch (err) { $("#reg-err").textContent = err.message; }
  }
  async function onLogin(e) {
    e.preventDefault(); $("#login-err").textContent = "";
    try { user = await ACMA_STORE.login($("#login-email").value, $("#login-pass").value); refreshUser(); renderHome(); show("home"); publishMine(); }
    catch (err) { $("#login-err").textContent = err.message; }
  }
  function publishMine() { if (!ACMA_STORE.publishRoom) return; ACMA_STORE.myRooms().forEach(function (r) { ACMA_STORE.publishRoom(r); }); }
  function onCaptionText(item) {
    var who = $("#caption-who"); var text = $("#caption-text");
    if (who) who.textContent = (user && user.name) + " \u00b7 " + item.lang;
    if (text) text.textContent = item.text;
    if (!item.interim && room && item.text) { try { ACMA_STORE.addMessage(room.id, item.text); reloadRoom(); renderMeet(); } catch (e) {} }
  }
  function bindMedia() {
    if (!room || !user || !window.ACMA_MEDIA) return;
    ACMA_MEDIA.attachRoom(room.code, user, room.members || []);
    ACMA_MEDIA.startCaptions(onCaptionText);
  }
  async function autoMedia() {
    if (!room || !window.ACMA_MEDIA) return;
    bindMedia();
    try {
      await ACMA_MEDIA.start();
      if (room && !room.live) ACMA_STORE.setLive(room.id, true);
      updateMediaButtons(); setMeetStatus();
    } catch (err) { toast(err.message || String(err)); }
  }
  function setMeetStatus() {
    var el = $("#meet-status"); if (!el) return;
    var n = room && room.members ? room.members.length : 0;
    var rem = window.ACMA_MEDIA ? ACMA_MEDIA.remoteCount() : 0;
    if (rem > 0) el.textContent = "Live with " + rem + " other camera" + (rem > 1 ? "s" : "") + ".";
    else if (n > 1) el.textContent = n + " in the room. Keep this page open so others can see you.";
    else el.textContent = "Share the code. Speak to move the green mic bar.";
  }
  function updateMediaButtons() {
    var mic = $("#btn-mic"); var cam = $("#btn-cam");
    if (mic && window.ACMA_MEDIA) mic.textContent = ACMA_MEDIA.micOn() ? "Mic on" : "Mic off";
    if (cam && window.ACMA_MEDIA) cam.textContent = ACMA_MEDIA.camOn() ? "Cam on" : "Cam off";
  }
  function bindRoom(next) {
    room = ACMA_STORE.populated(next); bindMedia(); autoMedia();
    if (room && ACMA_STORE.watch) {
      ACMA_STORE.watch(room.code, function (updated) {
        if (!room || updated.code !== room.code) return;
        room = ACMA_STORE.populated(updated);
        if (window.ACMA_MEDIA) ACMA_MEDIA.setMembers(room.members || []);
        if ($("#screen-meet") && $("#screen-meet").classList.contains("active")) renderMeet();
      });
    }
  }
  function renderHome() {
    refreshUser(); if (!user) { show("auth"); return; }
    $("#home-hero").innerHTML = "<p class='kicker'>" + ACMA_I18N.t("workspace") + "</p><h2>" + ACMA_I18N.t("hello") + ", " + user.name.split(" ")[0] + ".</h2><p>Create a room or join with a code. Camera starts when you enter.</p>";
    var list = ACMA_STORE.myRooms().map(function (r) {
      var p = ACMA_STORE.populated(r); var role = r.hostId === user.id ? "Host" : "Member";
      return "<button class='card' type='button' data-open-room='" + r.id + "' style='text-align:left;width:100%'><h3>" + r.name + "</h3><p class='muted'>" + r.code + " \u00b7 " + role + " \u00b7 " + p.members.length + "</p></button>";
    }).join("");
    $("#home-rooms").innerHTML = list || ("<div class='card muted'>" + ACMA_I18N.t("noRooms") + "</div>");
  }
  function openRoom(id) {
    var found = ACMA_STORE.getRoom(id); if (!found) return;
    bindRoom(found); if (ACMA_STORE.publishRoom) ACMA_STORE.publishRoom(found);
    renderMeet(); show("meet");
  }
  async function createRoom() {
    $("#create-err").textContent = "";
    try {
      var created = await ACMA_STORE.createRoom($("#room-name").value, $("#room-topic").value);
      bindRoom(created); $("#room-name").value = ""; $("#room-topic").value = "";
      renderMeet(); show("meet"); toast(room.code);
    } catch (err) { $("#create-err").textContent = err.message; }
  }
  async function joinByCode() {
    $("#join-err").textContent = "";
    try {
      var joined = await ACMA_STORE.joinRoom($("#join-code").value);
      bindRoom(joined); $("#join-code").value = ""; renderMeet(); show("meet");
    } catch (err) { $("#join-err").textContent = err.message; }
  }
  function reloadRoom() {
    if (!room) return null;
    var fresh = ACMA_STORE.getRoom(room.id) || ACMA_STORE.findRoomByCode(room.code);
    room = ACMA_STORE.populated(fresh || room); return room;
  }
  function escapeHtml(s) { var box = document.createElement("div"); box.textContent = s == null ? "" : String(s); return box.innerHTML; }
  function transcriptHtml(messages) {
    return (messages || []).slice(-50).reverse().map(function (msg) {
      var t = new Date(msg.at);
      var stamp = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
      return "<div class='line'><time>" + stamp + "</time><div><span class='spk'>" + escapeHtml(msg.name) + "</span> " + escapeHtml(msg.text) + "</div></div>";
    }).join("") || "<p class='muted'>No notes yet.</p>";
  }
  function renderMeet() {
    reloadRoom(); if (!room) { renderHome(); show("home"); return; }
    $("#meet-code").textContent = room.code; $("#meet-title").textContent = room.name;
    setMeetStatus(); $("#chip-live").classList.toggle("hidden", !room.live);
    $("#transcript").innerHTML = transcriptHtml(room.messages);
    var last = room.messages && room.messages[room.messages.length - 1];
    if (last) { $("#caption-who").textContent = last.name; $("#caption-text").textContent = last.text; }
    $("#meet-members").innerHTML = room.members.map(function (m) {
      var hand = (room.hands || []).indexOf(m.userId) !== -1;
      return "<div class='member'><div class='avatar' style='background:#2ee6c833;color:#2ee6c8'>" + m.initials + "</div><div><b>" + m.name + "</b><p class='muted'>" + m.role + (hand ? " \u00b7 hand" : "") + "</p></div></div>";
    }).join("");
    if (window.ACMA_MEDIA) ACMA_MEDIA.setMembers(room.members || []);
    updateMediaButtons();
  }
  function postText() {
    if (!room) return;
    var input = $("#live-text");
    try { ACMA_STORE.addMessage(room.id, input.value); input.value = ""; renderMeet(); } catch (err) { toast(err.message); }
  }
  function copyCode() {
    if (!room) return;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(room.code).then(function () { toast(room.code); });
    else toast(room.code);
  }
  function endLive() {
    if (!room) return;
    ACMA_STORE.setLive(room.id, false);
    if (window.ACMA_MEDIA) ACMA_MEDIA.stop();
    $("#chip-live").classList.add("hidden"); reloadRoom(); renderReport(); show("report");
  }
  function openDemo() { show("demo"); if (window.ACMA_DEMO) ACMA_DEMO.start(); }
  function renderReport() {
    refreshUser();
    var rooms = user ? ACMA_STORE.myRooms() : [];
    var target = room ? ACMA_STORE.populated(ACMA_STORE.getRoom(room.id) || room) : (rooms[0] ? ACMA_STORE.populated(rooms[0]) : null);
    if (!target) { $("#report-body").innerHTML = "<div class='hero'><h2>" + ACMA_I18N.t("needRoom") + "</h2></div>"; return; }
    var speakers = {}; (target.messages || []).forEach(function (m) { speakers[m.name] = (speakers[m.name] || 0) + 1; });
    var ranked = Object.keys(speakers).sort(function (a, b) { return speakers[b] - speakers[a]; });
    var rows = ranked.length ? ranked.map(function (n) { return "<li>" + n + " - " + speakers[n] + "</li>"; }).join("") : "<li>-</li>";
    $("#report-body").innerHTML = "<div class='hero'><p class='kicker'>Minutes</p><h2>" + target.name + "</h2><p>" + target.code + "</p></div><section class='card report' style='margin-top:12px'><ul>" + rows + "</ul></section>";
  }
  function renderAccount() {
    refreshUser(); if (!user) { show("auth"); return; }
    $("#account-body").innerHTML = "<div class='hero'><p class='kicker'>" + ACMA_I18N.t("account") + "</p><h2>" + user.name + "</h2><p>" + user.email + "</p></div><button class='btn ghost full' style='margin-top:12px' id='signout' type='button'>Sign out</button>";
    $("#signout").onclick = function () {
      if (window.ACMA_MEDIA) ACMA_MEDIA.stop(); ACMA_STORE.logout(); user = null; room = null;
      $("#who-chip").textContent = ACMA_I18N.t("signIn"); show("auth");
    };
  }
  document.body.addEventListener("click", function (e) {
    var auth = e.target.closest("[data-auth]"); if (auth) setAuthMode(auth.getAttribute("data-auth"));
    var goBtn = e.target.closest("[data-go]"); if (goBtn) go(goBtn.getAttribute("data-go"));
    var open = e.target.closest("[data-open-room]"); if (open) openRoom(open.getAttribute("data-open-room"));
  });
  function on(id, ev, fn) { var el = document.getElementById(id); if (el) el.addEventListener(ev, fn); }
  on("form-register", "submit", onRegister); on("form-login", "submit", onLogin);
  on("btn-create-room", "click", createRoom); on("btn-join-room", "click", joinByCode);
  on("btn-copy-code", "click", copyCode); on("btn-live-send", "click", postText);
  on("live-text", "keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); postText(); } });
  on("btn-hand", "click", function () { if (!room) return; ACMA_STORE.toggleHand(room.id); renderMeet(); });
  on("btn-end", "click", endLive); on("btn-demo", "click", openDemo);
  on("btn-mic", "click", function () { if (window.ACMA_MEDIA) { ACMA_MEDIA.toggleMic(); updateMediaButtons(); } });
  on("btn-cam", "click", function () { if (window.ACMA_MEDIA) { ACMA_MEDIA.toggleCam(); updateMediaButtons(); } });
  on("btn-talk", "click", function () {
    if (!window.ACMA_MEDIA) return;
    var ok = ACMA_MEDIA.tapTalk(onCaptionText);
    toast(ok ? "Listening... speak now" : ACMA_I18N.t("noSpeech"));
  });
  on("lang-toggle", "click", function () {
    ACMA_I18N.toggle(); ACMA_I18N.apply();
    if (user && $("#screen-home") && $("#screen-home").classList.contains("active")) renderHome();
    if (room && $("#screen-meet") && $("#screen-meet").classList.contains("active")) renderMeet();
    refreshUser();
  });
  on("who-chip", "click", function () { go(user ? "account" : "auth"); });
  on("btn-leave", "click", function () {
    if (!room) return; if (window.ACMA_MEDIA) ACMA_MEDIA.stop();
    ACMA_STORE.leaveRoom(room.id); room = null; renderHome(); show("home");
  });
  window.ACMA = { go: go };
  ACMA_I18N.apply(); refreshUser(); setAuthMode("register");
  if (user) { publishMine(); renderHome(); show("home"); } else show("auth");
})();
