(function (global) {
  const ICE = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" },
      { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
      { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" }
    ]
  };
  let roomCode = null, userId = null, userName = "", members = [], localStream = null, peer = null, starting = false, captions = null, captionsOn = false, onCaption = null, helloTimer = null;
  const calls = {}, remotes = {};
  function pid(id) {
    return ("acma" + String(roomCode || "") + String(id || "")).replace(/[^a-zA-Z0-9]/g, "").slice(0, 50);
  }
  function tile(id, name, stream, mine) {
    const grid = document.getElementById("video-grid");
    if (!grid) return;
    let el = document.getElementById("tile-" + id);
    if (!el) {
      el = document.createElement("div");
      el.className = "vid-tile" + (mine ? " mine" : "");
      el.id = "tile-" + id;
      const video = document.createElement("video");
      video.playsInline = true; video.autoplay = true; video.muted = !!mine;
      const label = document.createElement("span"); label.className = "vid-name";
      el.appendChild(video); el.appendChild(label); grid.appendChild(el);
    }
    el.querySelector(".vid-name").textContent = name + (mine ? " \u00b7 you" : "");
    const v = el.querySelector("video");
    if (stream && v.srcObject !== stream) v.srcObject = stream;
    v.muted = !!mine; v.play().catch(function () {});
  }
  function dropTile(id) {
    const el = document.getElementById("tile-" + id);
    if (el) el.remove();
    delete remotes[id]; delete calls[id];
  }
  function bindCall(id, name, call) {
    calls[id] = call;
    call.on("stream", function (stream) { remotes[id] = stream; tile(id, name || "Member", stream, false); });
    call.on("close", function () { dropTile(id); });
    call.on("error", function () { dropTile(id); });
  }
  function ensurePeer() {
    if (peer && !peer.destroyed) return peer;
    if (typeof Peer === "undefined" || !roomCode || !userId) return null;
    peer = new Peer(pid(userId), { host: "0.peerjs.com", port: 443, path: "/", secure: true, debug: 0, config: ICE });
    peer.on("call", function (call) {
      if (localStream) call.answer(localStream); else call.answer();
      const fromId = call.peer;
      const member = members.find(function (m) { return pid(m.userId) === fromId; });
      bindCall(fromId, member ? member.name : "Member", call);
    });
    peer.on("error", function (err) {
      if (err && err.type === "unavailable-id") {
        try { peer.destroy(); } catch (e) {}
        peer = null; setTimeout(ensurePeer, 800);
      }
    });
    peer.on("open", function () { connectMembers(); });
    return peer;
  }
  function connectMembers() {
    if (!peer || !peer.id || !localStream) return;
    members.forEach(function (m) {
      if (!m || m.userId === userId) return;
      const dest = pid(m.userId);
      if (remotes[dest]) return;
      if (calls[dest]) {
        if (calls[dest].open) return;
        try { calls[dest].close(); } catch (e) {}
        delete calls[dest];
      }
      if (peer.id <= dest) return;
      try {
        const call = peer.call(dest, localStream);
        if (call) bindCall(dest, m.name, call);
      } catch (e) {}
    });
  }
  async function start() {
    if (!roomCode) throw new Error("Join a room first.");
    if (starting) return localStream;
    if (localStream && localStream.getTracks().some(function (t) { return t.readyState === "live"; })) {
      tile(userId, userName, localStream, true); ensurePeer(); connectMembers(); startCaptions(onCaption); return localStream;
    }
    starting = true;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 360 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      tile(userId, userName, localStream, true);
      ensurePeer(); connectMembers(); startCaptions(onCaption);
      if (helloTimer) clearInterval(helloTimer);
      helloTimer = setInterval(connectMembers, 4000);
      return localStream;
    } finally { starting = false; }
  }
  function stop() {
    if (helloTimer) { clearInterval(helloTimer); helloTimer = null; }
    if (localStream) localStream.getTracks().forEach(function (t) { t.stop(); });
    localStream = null;
    Object.keys(calls).forEach(function (id) { try { calls[id].close(); } catch (e) {} dropTile(id); });
    dropTile(userId);
    if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
    stopCaptions();
  }
  function attachRoom(code, me, list) {
    const same = roomCode === code && userId === (me && me.id);
    roomCode = code; userId = me && me.id; userName = me && me.name || "";
    if (list) members = list;
    if (!same && peer) { try { peer.destroy(); } catch (e) {} peer = null; }
    ensurePeer();
  }
  function setMembers(list) { members = list || []; connectMembers(); }
  function detectLang(text) { return /[\u0600-\u06FF]/.test(text) ? "ar" : "en"; }
  function startCaptions(handler) {
    if (handler) onCaption = handler;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return false;
    if (captionsOn) return true;
    captionsOn = true;
    function listen(lang) {
      if (!captionsOn) return;
      const rec = new SR(); captions = rec;
      rec.continuous = true; rec.interimResults = true; rec.lang = lang;
      rec.onresult = function (ev) {
        const res = ev.results[ev.results.length - 1];
        const text = (res[0] && res[0].transcript || "").trim();
        if (!text) return;
        if (onCaption) onCaption({ text: text, lang: detectLang(text), interim: !res.isFinal });
      };
      rec.onend = function () {
        if (!captionsOn) return;
        setTimeout(function () { listen(lang === "ar-SA" ? "en-US" : "ar-SA"); }, 280);
      };
      rec.onerror = function () {};
      try { rec.start(); } catch (e) {}
    }
    listen(window.ACMA_I18N && ACMA_I18N.current() === "ar" ? "ar-SA" : "en-US");
    return true;
  }
  function stopCaptions() {
    captionsOn = false;
    if (captions) { try { captions.stop(); } catch (e) {} captions = null; }
  }
  global.ACMA_MEDIA = {
    attachRoom: attachRoom, setMembers: setMembers, start: start, stop: stop,
    startCaptions: startCaptions, stopCaptions: stopCaptions,
    isLive: function () { return !!(localStream && localStream.getTracks().some(function (t) { return t.readyState === "live"; })); },
    captionsActive: function () { return captionsOn; }
  };
})(window);
