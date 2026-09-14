(function () {
  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  let user = null;
  let room = null;
  const screens = ["auth", "home", "room", "live", "report", "account", "demo"];
  function toast(msg) {
    const el = $("#toast"); if (!el) return;
    el.textContent = msg; el.classList.add("show");
    setTimeout(function () { el.classList.remove("show"); }, 2800);
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
    if (!user && name !== "auth") { show("auth"); return; }
    if (name === "home") { renderHome(); show("home"); return; }
    if (name === "room") {
      if (!room) { renderHome(); show("home"); return; }
      renderRoom(); show("room"); return;
    }
    if (name === "live") {
      if (!room) { renderHome(); show("home"); return; }
      show("live"); renderLive(); autoMedia(); return;
    }
    if (name === "report") { renderReport(); show("report"); return; }
    if (name === "account") { renderAccount(); show("account"); return; }
    show("auth");
  }
  function setAuthMode(mode) {
    var reg = $("#form-register"); var login = $("#form-login");
    if (reg) reg.classList.toggle("hidden", mode !== "register");
    if (login) login.classList.toggle("hidden", mode !== "login");
    $$("[data-auth]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-auth") === mode);
    });
  }
  async function onRegister(e) {
    e.preventDefault(); $("#reg-err").textContent = "";
    try {
      user = await ACMA_STORE.register($("#reg-name").value, $("#reg-email").value, $("#reg-pass").value);
      refreshUser(); renderHome(); show("home");
    } catch (err) { $("#reg-err").textContent = err.message; }
  }
  async function onLogin(e) {
    e.preventDefault(); $("#login-err").textContent = "";
    try {
      user = await ACMA_STORE.login($("#login-email").value, $("#login-pass").value);
      refreshUser(); renderHome(); show("home"); publishMine();
    } catch (err) { $("#login-err").textContent = err.message; }
  }
  function publishMine() {
    if (!ACMA_STORE.publishRoom) return;
    ACMA_STORE.myRooms().forEach(function (r) { ACMA_STORE.publishRoom(r); });
  }
  function bindMedia() {
    if (!room || !user || !window.ACMA_MEDIA) return;
    ACMA_MEDIA.attachRoom(room.code, user, room.members || []);
    ACMA_MEDIA.startCaptions(onCaptionText);
  }
  function onCaptionText(item) {
    var who = $("#caption-who"); var text = $("#caption-text");
    if (who) who.textContent = (user && user.name) + " \u00b7 " + item.lang;
    if (text) text.textContent = item.text;
    if (!item.interim && room && item.text) {
      try { ACMA_STORE.addMessage(room.id, item.text); reloadRoom(); renderLive(); } catch (e) {}
    }
  }
  async function autoMedia() {
    if (!room || !window.ACMA_MEDIA) return;
    bindMedia();
    try {
      await ACMA_MEDIA.start();
      if (room && !room.live) ACMA_STORE.setLive(room.id, true);
    } catch (err) { toast(err.message || String(err)); }
  }
  function bindRoom(next) {
    room = ACMA_STORE.populated(next);
    bindMedia();
    if (room && ACMA_STORE.watch) {
      ACMA_STORE.watch(room.code, function (updated) {
        if (!room || updated.code !== room.code) return;
        room = ACMA_STORE.populated(updated);
        if (window.ACMA_MEDIA) ACMA_MEDIA.setMembers(room.members || []);
        if ($("#screen-room") && $("#screen-room").classList.contains("active")) renderRoom();
        if ($("#screen-live") && $("#screen-live").classList.contains("active")) renderLive();
      });
    }
  }
  function renderHome() {
    refreshUser(); if (!user) { show("auth"); return; }
    $("#home-hero").innerHTML = "<p class='kicker'>" + ACMA_I18N.t("workspace") + "</p><h2>" + ACMA_I18N.t("hello") + ", " + user.name.split(" ")[0] + ".</h2><p>" + ACMA_I18N.t("workspaceHint") + "</p>";
    var list = ACMA_STORE.myRooms().map(function (r) {
      var p = ACMA_STORE.populated(r);
      var role = r.hostId === user.id ? "Host" : "Member";
      return "<button class='card' type='button' data-open-room='" + r.id + "' style='text-align:left;width:100%'><h3>" + r.name + "</h3><p class='muted'>" + r.code + " \u00b7 " + role + " \u00b7 " + p.members.length + "</p></button>";
    }).join("");
    $("#home-rooms").innerHTML = list || ("<div class='card muted'>" + ACMA_I18N.t("noRooms") + "</div>");
  }
  function openRoom(id) {
    var found = ACMA_STORE.getRoom(id); if (!found) return;
    bindRoom(found); if (ACMA_STORE.publishRoom) ACMA_STORE.publishRoom(found);
    renderRoom(); show("room");
  }
  async function createRoom() {
    $("#create-err").textContent = "";
    try {
      var created = await ACMA_STORE.createRoom($("#room-name").value, $("#room-topic").value);
      bindRoom(created); $("#room-name").value = ""; $("#room-topic").value = "";
      renderRoom(); show("room"); toast(room.code);
    } catch (err) { $("#create-err").textContent = err.message; }
  }
  async function joinByCode() {
    $("#join-err").textContent = "";
    try {
      var joined = await ACMA_STORE.joinRoom($("#join-code").value);
      bindRoom(joined); $("#join-code").value = ""; renderRoom(); show("room");
    } catch (err) { $("#join-err").textContent = err.message; }
  }
  function reloadRoom() {
    if (!room) return null;
    var fresh = ACMA_STORE.getRoom(room.id) || ACMA_STORE.findRoomByCode(room.code);
    room = ACMA_STORE.populated(fresh || room); return room;
  }
  function escapeHtml(s) {
    var box = document.createElement("div"); box.textContent = s == null ? "" : String(s); return box.innerHTML;
  }
  function transcriptHtml(messages) {
    return (messages || []).slice(-50).reverse().map(function (msg) {
      var t = new Date(msg.at);
      var stamp = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
      return "<div class='line'><time>" + stamp + "</time><div><span class='spk'>" + escapeHtml(msg.name) + "</span> " + escapeHtml(msg.text) + "</div></div>";
    }).join("") || "<p class='muted'>-</p>";
  }
  function renderRoom() {
    reloadRoom(); if (!room) { renderHome(); show("home"); return; }
    var host = room.members.find(function (m) { return m.role === "host"; });
    $("#room-title").textContent = room.name;
    $("#room-meta").textContent = (room.topic || "") + " \u00b7 " + (host ? host.name : "-");
    $("#room-code").textContent = room.code;
    $("#room-status").textContent = room.live ? "LIVE" : String(room.status).toUpperCase();
    $("#room-members").innerHTML = room.members.map(function (m) {
      var hand = (room.hands || []).indexOf(m.userId) !== -1;
      return "<div class='member'><div class='avatar' style='background:#2ee6c833;color:#2ee6c8'>" + m.initials + "</div><div><b>" + m.name + "</b><p class='muted'>" + m.role + (hand ? " \u00b7 hand" : "") + "</p></div></div>";
    }).join("");
    $("#room-chat").innerHTML = transcriptHtml(room.messages);
  }
  function postText(sel) {
    if (!room) return;
    var input = $(sel);
    try {
      ACMA_STORE.addMessage(room.id, input.value); input.value = ""; renderRoom();
      if ($("#screen-live") && $("#screen-live").classList.contains("active")) renderLive();
    } catch (err) { toast(err.message); }
  }
  function copyCode() {
    if (!room) return;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(room.code).then(function () { toast(room.code); });
    else toast(room.code);
  }
  function renderLive() {
    reloadRoom(); if (!room) return;
    $("#session-code").textContent = room.code;
    $("#session-title").textContent = room.name;
    $("#live-status").textContent = room.live || (window.ACMA_MEDIA && ACMA_MEDIA.isLive()) ? "LIVE" : "STANDBY";
    $("#faces").innerHTML = room.members.map(function (m) {
      var hand = (room.hands || []).indexOf(m.userId) !== -1;
      return "<div class='face'><div class='dot' style='background:#2ee6c833;color:#2ee6c8'>" + m.initials + "</div><b>" + m.name.split(" ")[0] + "</b><span class='muted'>" + (hand ? "hand" : m.role) + "</span></div>";
    }).join("");
    var last = room.messages && room.messages[room.messages.length - 1];
    $("#caption-who").textContent = last ? last.name : ACMA_I18N.t("waiting");
    $("#caption-text").textContent = last ? last.text : "-";
    $("#transcript").innerHTML = transcriptHtml(room.messages);
    $("#att-val").textContent = room.members.length;
    $("#hands-val").textContent = (room.hands || []).length;
    $("#int-val").textContent = (room.messages || []).length;
    $("#db-val").textContent = window.ACMA_MEDIA && ACMA_MEDIA.isLive() ? "on" : "off";
    if (window.ACMA_MEDIA) ACMA_MEDIA.setMembers(room.members || []);
    if (!window.ACMA_MEDIA || !ACMA_MEDIA.isLive()) autoMedia();
  }
  function startLive() {
    if (!room) return;
    ACMA_STORE.setLive(room.id, true);
    $("#chip-live").classList.remove("hidden");
    show("live"); renderLive(); autoMedia();
  }
  function endLive() {
    if (!room) return;
    ACMA_STORE.setLive(room.id, false);
    if (window.ACMA_MEDIA) ACMA_MEDIA.stop();
    $("#chip-live").classList.add("hidden");
    reloadRoom(); renderReport(); show("report");
  }
  function openDemo() { show("demo"); if (window.ACMA_DEMO) ACMA_DEMO.start(); }
  function renderReport() {
    refreshUser();
    var rooms = user ? ACMA_STORE.myRooms() : [];
    var target = room ? ACMA_STORE.populated(ACMA_STORE.getRoom(room.id) || room) : (rooms[0] ? ACMA_STORE.populated(rooms[0]) : null);
    if (!target) { $("#report-body").innerHTML = "<div class='hero'><h2>" + ACMA_I18N.t("needRoom") + "</h2></div>"; return; }
    var speakers = {};
    (target.messages || []).forEach(function (m) { speakers[m.name] = (speakers[m.name] || 0) + 1; });
    var ranked = Object.keys(speakers).sort(function (a, b) { return speakers[b] - speakers[a]; });
    var rows = ranked.length ? ranked.map(function (n) { return "<li>" + n + " - " + speakers[n] + "</li>"; }).join("") : "<li>-</li>";
    $("#report-body").innerHTML = "<div class='hero'><p class='kicker'>Report</p><h2>" + target.name + "</h2><p>" + target.code + "</p></div><section class='card report' style='margin-top:12px'><ul>" + rows + "</ul></section>";
  }
  function renderAccount() {
    refreshUser(); if (!user) { show("auth"); return; }
    $("#account-body").innerHTML = "<div class='hero'><p class='kicker'>" + ACMA_I18N.t("account") + "</p><h2>" + user.name + "</h2><p>" + user.email + "</p></div><button class='btn ghost full' style='margin-top:12px' id='signout' type='button'>Sign out</button>";
    $("#signout").onclick = function () {
      if (window.ACMA_MEDIA) ACMA_MEDIA.stop();
      ACMA_STORE.logout(); user = null; room = null;
      $("#who-chip").textContent = ACMA_I18N.t("signIn"); show("auth");
    };
  }
  document.body.addEventListener("click", function (e) {
    var auth = e.target.closest("[data-auth]"); if (auth) setAuthMode(auth.getAttribute("data-auth"));
    var goBtn = e.target.closest("[data-go]"); if (goBtn) go(goBtn.getAttribute("data-go"));
    var open = e.target.closest("[data-open-room]"); if (open) openRoom(open.getAttribute("data-open-room"));
  });
  function on(id, ev, fn) { var el = document.getElementById(id); if (el) el.addEventListener(ev, fn); }
  on("form-register", "submit", onRegister);
  on("form-login", "submit", onLogin);
  on("btn-create-room", "click", createRoom);
  on("btn-join-room", "click", joinByCode);
  on("btn-copy-code", "click", copyCode);
  on("btn-send", "click", function () { postText("#chat-text"); });
  on("chat-text", "keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); postText("#chat-text"); } });
  on("btn-live-send", "click", function () { postText("#live-text"); });
  on("live-text", "keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); postText("#live-text"); } });
  on("btn-start-live", "click", startLive);
  on("btn-hand", "click", function () { if (!room) return; ACMA_STORE.toggleHand(room.id); renderRoom(); renderLive(); });
  on("btn-end", "click", endLive);
  on("btn-demo", "click", openDemo);
  on("lang-toggle", "click", function () {
    ACMA_I18N.toggle(); ACMA_I18N.apply();
    if (user && $("#screen-home") && $("#screen-home").classList.contains("active")) renderHome();
    if (room && $("#screen-live") && $("#screen-live").classList.contains("active")) renderLive();
    refreshUser();
  });
  on("who-chip", "click", function () { go(user ? "account" : "auth"); });
  on("btn-leave", "click", function () {
    if (!room) return;
    if (window.ACMA_MEDIA) ACMA_MEDIA.stop();
    ACMA_STORE.leaveRoom(room.id); room = null; renderHome(); show("home");
  });
  window.ACMA = { go: go };
  ACMA_I18N.apply(); refreshUser(); setAuthMode("register");
  if (user) { publishMine(); renderHome(); show("home"); } else show("auth");
})();
