(function (global) {
  const ICE = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" },
      { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
      { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" }
    ]
  };
  let roomCode = null, userId = null, userName = "", members = [], localStream = null, mqttClient = null, starting = false, captions = null, captionsOn = false, onCaption = null, helloTimer = null;
  const peers = {}, remotes = {}, names = {};
  function topic() { return "acma/v1/rtc/" + roomCode; }
  function grids() {
    return [document.getElementById("video-grid"), document.getElementById("room-video-grid")].filter(Boolean);
  }
  function tile(id, name, stream, mine) {
    grids().forEach(function (grid) {
      const elId = grid.id + "-" + id;
      let el = document.getElementById(elId);
      if (!el) {
        el = document.createElement("div");
        el.className = "vid-tile" + (mine ? " mine" : "");
        el.id = elId;
        const video = document.createElement("video");
        video.setAttribute("playsinline", "true");
        video.setAttribute("autoplay", "true");
        video.muted = !!mine;
        const label = document.createElement("span");
        label.className = "vid-name";
        el.appendChild(video); el.appendChild(label); grid.appendChild(el);
      }
      el.querySelector(".vid-name").textContent = (name || "Member") + (mine ? " \u00b7 you" : "");
      const v = el.querySelector("video");
      if (stream && v.srcObject !== stream) v.srcObject = stream;
      v.muted = !!mine;
      var p = v.play(); if (p && p.catch) p.catch(function () {});
    });
  }
  function dropTile(id) {
    grids().forEach(function (grid) {
      const el = document.getElementById(grid.id + "-" + id);
      if (el) el.remove();
    });
    delete remotes[id];
  }
  function bus() {
    if (mqttClient) return mqttClient;
    if (typeof mqtt === "undefined") return null;
    mqttClient = mqtt.connect("wss://broker.emqx.io:8084/mqtt", {
      clientId: "rtc-" + Math.random().toString(16).slice(2, 12),
      clean: true, reconnectPeriod: 1200
    });
    mqttClient.on("connect", function () {
      if (roomCode) mqttClient.subscribe(topic(), { qos: 1 });
      announce();
    });
    mqttClient.on("message", function (tp, payload) {
      if (!roomCode || tp !== topic()) return;
      var msg; try { msg = JSON.parse(payload.toString()); } catch (e) { return; }
      handleSignal(msg);
    });
    return mqttClient;
  }
  function send(msg) {
    var c = bus();
    if (!c || !roomCode || !c.connected) return;
    c.publish(topic(), JSON.stringify(Object.assign({ from: userId, name: userName }, msg)), { qos: 1 });
  }
  function announce() { if (userId && roomCode) send({ type: "hello", hasCam: !!localStream }); }
  function memberName(id) {
    if (names[id]) return names[id];
    var m = members.find(function (x) { return x.userId === id; });
    return m ? m.name : "Member";
  }
  async function ensurePeer(id) {
    if (peers[id]) return peers[id];
    var pc = new RTCPeerConnection(ICE);
    pc._id = id; pc._iceQueue = []; pc._makingOffer = false;
    pc._polite = String(userId) > String(id);
    peers[id] = pc;
    if (localStream) localStream.getTracks().forEach(function (t) { pc.addTrack(t, localStream); });
    pc.onicecandidate = function (e) { if (e.candidate) send({ type: "ice", to: id, candidate: e.candidate }); };
    pc.ontrack = function (e) {
      var stream = (e.streams && e.streams[0]) || new MediaStream([e.track]);
      remotes[id] = stream; tile(id, memberName(id), stream, false);
    };
    pc.onnegotiationneeded = function () { makeOffer(id); };
    pc.onconnectionstatechange = function () {
      if (pc.connectionState === "failed") { try { pc.restartIce(); } catch (e) {} }
    };
    return pc;
  }
  async function makeOffer(id) {
    var pc = peers[id];
    if (!pc || pc._makingOffer || pc.signalingState !== "stable") return;
    try {
      pc._makingOffer = true;
      var offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: "offer", to: id, sdp: pc.localDescription });
    } catch (e) {}
    finally { pc._makingOffer = false; }
  }
  async function flushIce(pc) {
    if (!pc || !pc.remoteDescription) return;
    var q = pc._iceQueue.splice(0);
    for (var i = 0; i < q.length; i++) {
      try { await pc.addIceCandidate(new RTCIceCandidate(q[i])); } catch (e) {}
    }
  }
  async function handleSignal(msg) {
    if (!msg || !msg.from || msg.from === userId) return;
    if (msg.to && msg.to !== userId) return;
    if (msg.name) names[msg.from] = msg.name;
    if (msg.type === "hello") { await ensurePeer(msg.from); if (localStream) makeOffer(msg.from); return; }
    if (msg.type === "bye") {
      if (peers[msg.from]) { try { peers[msg.from].close(); } catch (e) {} delete peers[msg.from]; }
      dropTile(msg.from); return;
    }
    if (msg.type === "offer" && msg.sdp) {
      var pc = await ensurePeer(msg.from);
      var glare = pc._makingOffer || pc.signalingState !== "stable";
      if (glare && !pc._polite) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        await flushIce(pc);
        var answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ type: "answer", to: msg.from, sdp: pc.localDescription });
      } catch (e) {}
      return;
    }
    if (msg.type === "answer" && msg.sdp && peers[msg.from]) {
      try {
        if (peers[msg.from].signalingState === "have-local-offer") {
          await peers[msg.from].setRemoteDescription(new RTCSessionDescription(msg.sdp));
          await flushIce(peers[msg.from]);
        }
      } catch (e) {}
      return;
    }
    if (msg.type === "ice" && msg.candidate && peers[msg.from]) {
      var p2 = peers[msg.from];
      if (p2.remoteDescription) {
        try { await p2.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch (e) {}
      } else p2._iceQueue.push(msg.candidate);
    }
  }
  function attachRoom(code, me, list) {
    roomCode = code; userId = me && me.id; userName = (me && me.name) || "";
    if (list) members = list;
    var c = bus();
    if (c && c.connected) { c.subscribe(topic(), { qos: 1 }); announce(); }
    if (helloTimer) clearInterval(helloTimer);
    helloTimer = setInterval(announce, 3000);
  }
  function setMembers(list) {
    members = list || [];
    members.forEach(function (m) { if (m && m.userId && m.userId !== userId) ensurePeer(m.userId); });
  }
  async function start() {
    if (!roomCode) throw new Error("Join a room first.");
    if (starting) return localStream;
    if (localStream && localStream.getTracks().some(function (t) { return t.readyState === "live"; })) {
      tile(userId, userName, localStream, true); announce(); startCaptions(onCaption); return localStream;
    }
    starting = true;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 360 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      tile(userId, userName, localStream, true);
      Object.keys(peers).forEach(function (id) {
        var pc = peers[id];
        localStream.getTracks().forEach(function (t) {
          var has = pc.getSenders().some(function (s) { return s.track && s.track.kind === t.kind; });
          if (!has) pc.addTrack(t, localStream);
        });
        makeOffer(id);
      });
      members.forEach(function (m) { if (m && m.userId && m.userId !== userId) ensurePeer(m.userId); });
      announce(); startCaptions(onCaption); return localStream;
    } finally { starting = false; }
  }
  function stop() {
    send({ type: "bye" });
    if (helloTimer) { clearInterval(helloTimer); helloTimer = null; }
    if (localStream) localStream.getTracks().forEach(function (t) { t.stop(); });
    localStream = null;
    Object.keys(peers).forEach(function (id) { try { peers[id].close(); } catch (e) {} delete peers[id]; dropTile(id); });
    dropTile(userId); stopCaptions();
  }
  function detectLang(text) { return /[\u0600-\u06FF]/.test(text) ? "ar" : "en"; }
  function startCaptions(handler) {
    if (handler) onCaption = handler;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return false;
    if (captionsOn) return true;
    captionsOn = true;
    function listen(lang) {
      if (!captionsOn) return;
      var rec = new SR(); captions = rec;
      rec.continuous = true; rec.interimResults = true; rec.lang = lang;
      rec.onresult = function (ev) {
        var res = ev.results[ev.results.length - 1];
        var text = (res[0] && res[0].transcript || "").trim();
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
