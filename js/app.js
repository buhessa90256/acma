(function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  let user = null;
  let room = null;
  const screens = ["auth", "home", "room", "live", "report", "account", "demo"];
  function toast(msg) {
    const el = $("#toast"); if (!el) return;
    el.textContent = msg; el.classList.add("show");
    setTimeout(function () { el.classList.remove("show"); }, 2800);
  }
  function show(name) {
    screens.forEach(function (id) { const el = $("#screen-" + id); if (el) el.classList.toggle("active", id === name); });
    $$(".tabbar button, .desk-nav button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-go") === name); });
    $$(".need-auth").forEach(function (el) { el.classList.toggle("hidden", !user); });
    window.scrollTo(0, 0);
    if (name !== "demo" && window.ACMA_DEMO) ACMA_DEMO.stop();
  }
  function refreshUser() {
    const raw = ACMA_STORE.current();
    user = raw ? ACMA_STORE.publicUser(raw) : null;
    const chip = $("#who-chip");
    if (chip) chip.textContent = user ? user.name : ACMA_I18N.t("signIn");
    return user;
  }
  function go(name) {
    refreshUser();
    if (name === "demo") { openDemo(); return; }
    if (!user && name !== "auth") { show("auth"); toast(ACMA_I18N.t("signIn")); return; }
    if (name === "home") { renderHome(); show("home"); return; }
    if (name === "room") { if (!room) { renderHome(); show("home"); toast(ACMA_I18N.t("needRoom")); return; } renderRoom(); show("room"); return; }
    if (name === "live") { if (!room) { renderHome(); show("home"); toast(ACMA_I18N.t("needRoom")); return; } renderLive(); show("live"); return; }
    if (name === "report") { renderReport(); show("report"); return; }
    if (name === "account") { renderAccount(); show("account"); return; }
    if (name === "auth") show("auth");
  }
  function setAuthMode(mode) {
    $("#form-register").classList.toggle("hidden", mode !== "register");
    $("#form-login").classList.toggle("hidden", mode !== "login");
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
  function bindMedia() { if (!room || !user || !window.ACMA_MEDIA) return; ACMA_MEDIA.attachRoom(room.code, user); }
  function bindRoom(next) {
    room = ACMA_STORE.populated(next); bindMedia();
    if (room && ACMA_STORE.watch) {
      ACMA_STORE.watch(room.code, function (updated) {
        if (!room || updated.code !== room.code) return;
        room = ACMA_STORE.populated(updated);
        if ($("#screen-room").classList.contains("active")) renderRoom();
        if ($("#screen-live").classList.contains("active")) renderLive();
      });
    }
  }
  function renderHome() {
    refreshUser(); if (!user) { show("auth"); return; }
    $("#home-hero").innerHTML = '<p class="kicker">' + ACMA_I18N.t("workspace") + "</p><h2>" + ACMA_I18N.t("hello") + ", " + user.name.split(" ")[0] + ".</h2><p>" + ACMA_I18N.t("workspaceHint") + "</p>";
    const list = ACMA_STORE.myRooms().map(function (r) {
      const p = ACMA_STORE.populated(r);
      const role = r.hostId === user.id ? "Host" : "Member";
      return '<button class="card" type="button" data-open-room="' + r.id + '" style="text-align:left;width:100%"><h3>' + r.name + '</h3><p class="muted">' + r.code + " \u00b7 " + role + " \u00b7 " + p.members.length + "</p></button>";
    }).join("");
    $("#home-rooms").innerHTML = list || '<div class="card muted">' + ACMA_I18N.t("noRooms") + "</div>";
  }
  function openRoom(id) {
    const found = ACMA_STORE.getRoom(id); if (!found) return;
    bindRoom(found); if (ACMA_STORE.publishRoom) ACMA_STORE.publishRoom(found); renderRoom(); show("room");
  }
  async function createRoom() {
    $("#create-err").textContent = "\u2026";
    try {
      const created = await ACMA_STORE.createRoom($("#room-name").value, $("#room-topic").value);
      bindRoom(created); $("#room-name").value = ""; $("#room-topic").value = ""; $("#create-err").textContent = "";
      renderRoom(); show("room"); toast(room.code);
    } catch (err) { $("#create-err").textContent = err.message; }
  }
  async function joinByCode() {
    $("#join-err").textContent = "\u2026";
    try {
      const joined = await ACMA_STORE.joinRoom($("#join-code").value);
      bindRoom(joined); $("#join-code").value = ""; $("#join-err").textContent = ""; renderRoom(); show("room");
    } catch (err) { $("#join-err").textContent = err.message; }
  }
  function reloadRoom() {
    if (!room) return null;
    const fresh = ACMA_STORE.getRoom(room.id) || ACMA_STORE.findRoomByCode(room.code);
    room = ACMA_STORE.populated(fresh || room); return room;
  }
  function escapeHtml(s) { const box = document.createElement("div"); box.textContent = s == null ? "" : String(s); return box.innerHTML; }
  function transcriptHtml(messages) {
    return (messages || []).slice(-50).reverse().map(function (msg) {
      const t = new Date(msg.at);
      const stamp = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
      return '<div class="line"><time>' + stamp + '</time><div><span class="spk">' + escapeHtml(msg.name) + "</span> " + escapeHtml(msg.text) + "</div></div>";
    }).join("") || '<p class="muted">\u2014</p>';
  }
  function renderRoom() {
    reloadRoom(); if (!room) { renderHome(); show("home"); return; }
    const host = room.members.find(function (m) { return m.role === "host"; });
    $("#room-title").textContent = room.name;
    $("#room-meta").textContent = (room.topic || "") + " \u00b7 " + (host ? host.name : "-");
    $("#room-code").textContent = room.code;
    $("#room-status").textContent = room.live ? "LIVE" : String(room.status).toUpperCase();
    $("#room-members").innerHTML = room.members.map(function (m) {
      const hand = (room.hands || []).indexOf(m.userId) !== -1;
      return '<div class="member"><div class="avatar" style="background:#2ee6c833;color:#2ee6c8">' + m.initials + "</div><div><b>" + m.name + '</b><p class="muted">' + m.role + (hand ? " \u00b7 hand" : "") + "</p></div></div>";
    }).join("");
    $("#room-chat").innerHTML = transcriptHtml(room.messages);
  }
  function postText(sel) {
    if (!room) return;
    const input = $(sel);
    try { ACMA_STORE.addMessage(room.id, input.value); input.value = ""; renderRoom(); if ($("#screen-live").classList.contains("active")) renderLive(); toast(ACMA_I18N.t("posted")); }
    catch (err) { toast(err.message); }
  }
  function copyCode() {
    if (!room) return;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(room.code).then(function () { toast(room.code); });
    else toast(room.code);
  }
  function renderLive() {
    reloadRoom(); if (!room) return;
    $("#session-code").textContent = room.code; $("#session-title").textContent = room.name;
    $("#live-status").textContent = room.live || (window.ACMA_MEDIA && ACMA_MEDIA.isLive()) ? "LIVE" : "STANDBY";
    $("#faces").innerHTML = room.members.map(function (m) {
      const hand = (room.hands || []).indexOf(m.userId) !== -1;
      return '<div class="face"><div class="dot" style="background:#2ee6c833;color:#2ee6c8">' + m.initials + "</div><b>" + m.name.split(" ")[0] + '</b><span class="muted">' + (hand ? "hand" : m.role) + "</span></div>";
    }).join("");
    const last = room.messages && room.messages[room.messages.length - 1];
    $("#caption-who").textContent = last ? last.name : ACMA_I18N.t("waiting");
    $("#caption-text").textContent = last ? last.text : "\u2014";
    $("#transcript").innerHTML = transcriptHtml(room.messages);
    $("#att-val").textContent = room.members.length;
    $("#hands-val").textContent = (room.hands || []).length;
    $("#int-val").textContent = (room.messages || []).length;
    $("#db-val").textContent = window.ACMA_MEDIA && ACMA_MEDIA.isLive() ? "on" : "off";
    const mediaBtn = $("#btn-media"); if (mediaBtn) mediaBtn.textContent = window.ACMA_MEDIA && ACMA_MEDIA.isLive() ? ACMA_I18N.t("stopMedia") : ACMA_I18N.t("shareMedia");
    const capBtn = $("#btn-captions"); if (capBtn) capBtn.textContent = window.ACMA_MEDIA && ACMA_MEDIA.captionsActive() ? ACMA_I18N.t("captionsOn") : ACMA_I18N.t("captionsOff");
  }
  async function toggleMedia() {
    if (!room) return;
    try {
      if (ACMA_MEDIA.isLive()) { ACMA_MEDIA.stop(); toast(ACMA_I18N.t("mediaOff")); }
      else { await ACMA_MEDIA.start(); ACMA_STORE.setLive(room.id, true); toast(ACMA_I18N.t("mediaOn")); }
      renderLive();
    } catch (err) { toast(err.message || String(err)); }
  }
  function toggleCaptions() {
    if (!window.ACMA_MEDIA) return;
    if (ACMA_MEDIA.captionsActive()) ACMA_MEDIA.stopCaptions();
    else {
      const ok = ACMA_MEDIA.startCaptions(function (item) {
        $("#caption-who").textContent = (user && user.name) + " \u00b7 " + item.lang;
        $("#caption-text").textContent = item.text;
        if (!item.interim && room && item.text) { try { ACMA_STORE.addMessage(room.id, item.text); reloadRoom(); renderLive(); } catch (e) {} }
      });
      toast(ok ? ACMA_I18N.t("listening") : ACMA_I18N.t("noSpeech"));
    }
    renderLive();
  }
  function startLive() { if (!room) return; ACMA_STORE.setLive(room.id, true); $("#chip-live").classList.remove("hidden"); renderLive(); show("live"); }
  function endLive() { if (!room) return; ACMA_STORE.setLive(room.id, false); if (window.ACMA_MEDIA) ACMA_MEDIA.stop(); $("#chip-live").classList.add("hidden"); reloadRoom(); renderReport(); show("report"); }
  function openDemo() { show("demo"); if (window.ACMA_DEMO) ACMA_DEMO.start(); }
  function renderReport() {
    refreshUser();
    const rooms = user ? ACMA_STORE.myRooms() : [];
    const target = room ? ACMA_STORE.populated(ACMA_STORE.getRoom(room.id) || room) : (rooms[0] ? ACMA_STORE.populated(rooms[0]) : null);
    if (!target) { $("#report-body").innerHTML = '<div class="hero"><h2>' + ACMA_I18N.t("needRoom") + "</h2></div>"; return; }
    const speakers = {};
    (target.messages || []).forEach(function (m) { speakers[m.name] = (speakers[m.name] || 0) + 1; });
    const ranked = Object.keys(speakers).sort(function (a, b) { return speakers[b] - speakers[a]; });
    $("#report-body").innerHTML = '<div class="hero"><p class="kicker">Report</p><h2>' + target.name + "</h2><p>" + target.code + "</p></div><section class="card report" style="margin-top:12px"><ul>" + (ranked.length ? ranked.map(function (n) { return "<li>" + n + " \u2014 " + speakers[n] + "</li>"; }).join("") : "<li>\u2014</li>") + "</ul></section>";
  }
  function renderAccount() {
    refreshUser(); if (!user) { show("auth"); return; }
    $("#account-body").innerHTML = '<div class="hero"><p class="kicker">' + ACMA_I18N.t("account") + "</p><h2>" + user.name + "</h2><p>" + user.email + "</p></div><button class="btn ghost full" style="margin-top:12px" id="signout" type="button">Sign out</button>";
    $("#signout").onclick = function () { if (window.ACMA_MEDIA) ACMA_MEDIA.stop(); ACMA_STORE.logout(); user = null; room = null; $("#who-chip").textContent = ACMA_I18N.t("signIn"); show("auth"); };
  }
  document.body.addEventListener("click", function (e) {
    const auth = e.target.closest("[data-auth]"); if (auth) setAuthMode(auth.getAttribute("data-auth"));
    const goBtn = e.target.closest("[data-go]"); if (goBtn) go(goBtn.getAttribute("data-go"));
    const open = e.target.closest("[data-open-room]"); if (open) openRoom(open.getAttribute("data-open-room"));
  });
  $("#form-register").addEventListener("submit", onRegister);
  $("#form-login").addEventListener("submit", onLogin);
  $("#btn-create-room").addEventListener("click", createRoom);
  $("#btn-join-room").addEventListener("click", joinByCode);
  $("#btn-copy-code").addEventListener("click", copyCode);
  $("#btn-send").addEventListener("click", function () { postText("#chat-text"); });
  $("#chat-text").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); postText("#chat-text"); } });
  $("#btn-live-send").addEventListener("click", function () { postText("#live-text"); });
  $("#live-text").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); postText("#live-text"); } });
  $("#btn-start-live").addEventListener("click", startLive);
  $("#btn-media").addEventListener("click", toggleMedia);
  $("#btn-captions").addEventListener("click", toggleCaptions);
  $("#btn-hand").addEventListener("click", function () { if (!room) return; ACMA_STORE.toggleHand(room.id); renderRoom(); renderLive(); });
  $("#btn-end").addEventListener("click", endLive);
  $("#btn-demo").addEventListener("click", openDemo);
  $("#lang-toggle").addEventListener("click", function () {
    ACMA_I18N.toggle(); ACMA_I18N.apply();
    if (user && $("#screen-home").classList.contains("active")) renderHome();
    if (room && $("#screen-live").classList.contains("active")) renderLive();
    refreshUser();
  });
  $("#who-chip").addEventListener("click", function () { go(user ? "account" : "auth"); });
  $("#btn-leave").addEventListener("click", function () {
    if (!room) return; if (window.ACMA_MEDIA) ACMA_MEDIA.stop(); ACMA_STORE.leaveRoom(room.id); room = null; renderHome(); show("home");
  });
  window.ACMA = { go: go };
  ACMA_I18N.apply(); refreshUser(); setAuthMode("register");
  if (user) { publishMine(); renderHome(); show("home"); } else show("auth");
})();
