(function (global) {
  const ICE = { iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" }
  ]};
  let roomCode = null, userId = null, userName = "", members = [];
  let localStream = null, mqttClient = null, starting = false;
  let captions = null, captionsOn = false, onCaption = null, onStatus = null;
  let helloTimer = null, frameTimer = null, meterTimer = null;
  let audioCtx = null, analyser = null, camOn = true, micOn = true;
  const peers = {}, remotes = {}, names = {}, frames = {};
  function topicRtc() { return "acma/v1/rtc/" + roomCode; }
  function topicFrame() { return "acma/v1/frame/" + roomCode; }
  function grids() {
    return [document.getElementById("meet-grid"), document.getElementById("video-grid"), document.getElementById("room-video-grid")].filter(Boolean);
  }
  function tile(id, name, stream, mine, imgData) {
    grids().forEach(function (grid) {
      const elId = grid.id + "-" + id;
      let el = document.getElementById(elId);
      if (!el) {
        el = document.createElement("div");
        el.className = "vid-tile" + (mine ? " mine" : "");
        el.id = elId;
        var video = document.createElement("video"); video.setAttribute("playsinline","true"); video.setAttribute("autoplay","true");
        var image = document.createElement("img"); image.alt = "";
        var label = document.createElement("span"); label.className = "vid-name";
        el.appendChild(video); el.appendChild(image); el.appendChild(label); grid.appendChild(el);
      }
      el.querySelector(".vid-name").textContent = (name || "Member") + (mine ? " \u00b7 you" : "");
      const v = el.querySelector("video"); const img = el.querySelector("img");
      if (stream) {
        if (v.srcObject !== stream) v.srcObject = stream;
        v.muted = !!mine; v.classList.remove("hidden"); if (img) img.classList.add("hidden");
        var p = v.play(); if (p && p.catch) p.catch(function () {});
      } else if (imgData && img) {
        img.src = imgData; img.classList.remove("hidden"); if (!mine) v.classList.add("hidden");
      }
    });
  }
  function dropTile(id) {
    grids().forEach(function (grid) { var el = document.getElementById(grid.id + "-" + id); if (el) el.remove(); });
    delete remotes[id]; delete frames[id];
  }
  function bus() {
    if (mqttClient) return mqttClient;
    if (typeof mqtt === "undefined") return null;
    mqttClient = mqtt.connect("wss://broker.emqx.io:8084/mqtt", { clientId: "rtc-" + Math.random().toString(16).slice(2, 12), clean: true, reconnectPeriod: 1200 });
    mqttClient.on("connect", function () {
      if (!roomCode) return;
      mqttClient.subscribe(topicRtc(), { qos: 0 });
      mqttClient.subscribe(topicFrame(), { qos: 0 });
      announce();
    });
    mqttClient.on("message", function (tp, payload) {
      if (!roomCode) return;
      var msg; try { msg = JSON.parse(payload.toString()); } catch (e) { return; }
      if (tp === topicRtc()) handleSignal(msg);
      if (tp === topicFrame()) handleFrame(msg);
    });
    return mqttClient;
  }
  function send(msg) {
    var c = bus(); if (!c || !roomCode || !c.connected) return;
    c.publish(topicRtc(), JSON.stringify(Object.assign({ from: userId, name: userName }, msg)), { qos: 0 });
  }
  function announce() { if (userId && roomCode) send({ type: "hello", hasCam: !!localStream }); }
  function memberName(id) {
    if (names[id]) return names[id];
    var m = members.find(function (x) { return x.userId === id; });
    return m ? m.name : "Member";
  }
  function handleFrame(msg) {
    if (!msg || !msg.from || msg.from === userId || !msg.img) return;
    if (msg.name) names[msg.from] = msg.name;
    frames[msg.from] = msg.img;
    if (!remotes[msg.from]) tile(msg.from, memberName(msg.from), null, false, msg.img);
  }
  function startFrameRelay() {
    if (frameTimer) return;
    var canvas = document.createElement("canvas"); canvas.width = 240; canvas.height = 136;
    var ctx = canvas.getContext("2d");
    frameTimer = setInterval(function () {
      if (!localStream || !mqttClient || !mqttClient.connected || !camOn) return;
      var el = document.querySelector(".vid-tile.mine video");
      if (!el || el.readyState < 2) return;
      try {
        ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
        var data = canvas.toDataURL("image/jpeg", 0.36);
        if (data.length < 20000) mqttClient.publish(topicFrame(), JSON.stringify({ from: userId, name: userName, img: data }), { qos: 0 });
      } catch (e) {}
    }, 1100);
  }
  async function ensurePeer(id) {
    if (peers[id]) return peers[id];
    var pc = new RTCPeerConnection(ICE);
    pc._iceQueue = []; pc._makingOffer = false; pc._polite = String(userId) > String(id);
    peers[id] = pc;
    if (localStream) localStream.getTracks().forEach(function (t) { pc.addTrack(t, localStream); });
    pc.onicecandidate = function (e) { if (e.candidate) send({ type: "ice", to: id, candidate: e.candidate }); };
    pc.ontrack = function (e) {
      var stream = (e.streams && e.streams[0]) || new MediaStream([e.track]);
      remotes[id] = stream; tile(id, memberName(id), stream, false); if (onStatus) onStatus("peer");
    };
    pc.onnegotiationneeded = function () { makeOffer(id); };
    return pc;
  }
  async function makeOffer(id) {
    var pc = peers[id]; if (!pc || pc._makingOffer || pc.signalingState !== "stable") return;
    try {
      pc._makingOffer = true;
      var offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      send({ type: "offer", to: id, sdp: pc.localDescription });
    } catch (e) {} finally { pc._makingOffer = false; }
  }
  async function flushIce(pc) {
    if (!pc || !pc.remoteDescription) return;
    var q = pc._iceQueue.splice(0);
    for (var i = 0; i < q.length; i++) { try { await pc.addIceCandidate(new RTCIceCandidate(q[i])); } catch (e) {} }
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
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)); await flushIce(pc);
        var answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
        send({ type: "answer", to: msg.from, sdp: pc.localDescription });
      } catch (e) {}
      return;
    }
    if (msg.type === "answer" && msg.sdp && peers[msg.from]) {
      try {
        if (peers[msg.from].signalingState === "have-local-offer") {
          await peers[msg.from].setRemoteDescription(new RTCSessionDescription(msg.sdp)); await flushIce(peers[msg.from]);
        }
      } catch (e) {}
      return;
    }
    if (msg.type === "ice" && msg.candidate && peers[msg.from]) {
      var p2 = peers[msg.from];
      if (p2.remoteDescription) { try { await p2.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch (e) {} }
      else p2._iceQueue.push(msg.candidate);
    }
  }
  function startMeter() {
    if (!localStream) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      var src = audioCtx.createMediaStreamSource(localStream);
      analyser = audioCtx.createAnalyser(); analyser.fftSize = 256; src.connect(analyser);
      var data = new Uint8Array(analyser.frequencyBinCount);
      if (meterTimer) cancelAnimationFrame(meterTimer);
      function tick() {
        analyser.getByteFrequencyData(data);
        var sum = 0; for (var i = 0; i < data.length; i++) sum += data[i];
        var level = Math.min(100, Math.round((sum / data.length) * 1.6));
        var bar = document.getElementById("mic-level"); if (bar) bar.style.width = (micOn ? level : 0) + "%";
        meterTimer = requestAnimationFrame(tick);
      }
      tick();
    } catch (e) {}
  }
  function attachRoom(code, me, list) {
    roomCode = code; userId = me && me.id; userName = (me && me.name) || "";
    if (list) members = list;
    var c = bus();
    if (c && c.connected) { c.subscribe(topicRtc(), { qos: 0 }); c.subscribe(topicFrame(), { qos: 0 }); announce(); }
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
      tile(userId, userName, localStream, true); announce(); startFrameRelay(); startMeter(); startCaptions(onCaption); return localStream;
    }
    starting = true;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 360 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      camOn = true; micOn = true; tile(userId, userName, localStream, true);
      Object.keys(peers).forEach(function (id) {
        var pc = peers[id];
        localStream.getTracks().forEach(function (t) {
          var has = pc.getSenders().some(function (s) { return s.track && s.track.kind === t.kind; });
          if (!has) pc.addTrack(t, localStream);
        });
        makeOffer(id);
      });
      members.forEach(function (m) { if (m && m.userId && m.userId !== userId) ensurePeer(m.userId); });
      announce(); startFrameRelay(); startMeter(); startCaptions(onCaption);
      if (onStatus) onStatus("live"); return localStream;
    } finally { starting = false; }
  }
  function setTrack(kind, enabled) {
    if (!localStream) return;
    localStream.getTracks().forEach(function (t) { if (t.kind === kind) t.enabled = enabled; });
    if (kind === "audio") micOn = enabled; if (kind === "video") camOn = enabled;
  }
  function toggleMic() { setTrack("audio", !micOn); return micOn; }
  function toggleCam() { setTrack("video", !camOn); return camOn; }
  function stop() {
    send({ type: "bye" });
    if (helloTimer) { clearInterval(helloTimer); helloTimer = null; }
    if (frameTimer) { clearInterval(frameTimer); frameTimer = null; }
    if (meterTimer) { cancelAnimationFrame(meterTimer); meterTimer = null; }
    if (localStream) localStream.getTracks().forEach(function (t) { t.stop(); });
    localStream = null;
    Object.keys(peers).forEach(function (id) { try { peers[id].close(); } catch (e) {} delete peers[id]; dropTile(id); });
    dropTile(userId); stopCaptions();
  }
  function detectLang(text) { return /[\u0600-\u06FF]/.test(text) ? "ar" : "en"; }
  function startCaptions(handler) {
    if (handler) onCaption = handler;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return false; if (captionsOn) return true; captionsOn = true;
    function listen() {
      if (!captionsOn) return;
      var rec = new SR(); captions = rec;
      rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
      rec.lang = window.ACMA_I18N ? ACMA_I18N.speechLang() : "en-US";
      rec.onresult = function (ev) {
        var res = ev.results[ev.results.length - 1];
        var text = (res[0] && res[0].transcript || "").trim();
        if (!text) return;
        if (onCaption) onCaption({ text: text, lang: detectLang(text), interim: !res.isFinal });
      };
      rec.onend = function () { if (captionsOn) setTimeout(listen, 400); };
      rec.onerror = function (ev) { if (ev.error === "not-allowed") captionsOn = false; };
      try { rec.start(); } catch (e) {}
    }
    listen(); return true;
  }
  function tapTalk(handler) {
    if (handler) onCaption = handler;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return false;
    try {
      var rec = new SR(); rec.lang = window.ACMA_I18N ? ACMA_I18N.speechLang() : "en-US";
      rec.interimResults = true; rec.continuous = false;
      rec.onresult = function (ev) {
        var res = ev.results[ev.results.length - 1];
        var text = (res[0] && res[0].transcript || "").trim();
        if (text && onCaption) onCaption({ text: text, lang: detectLang(text), interim: !res.isFinal });
      };
      rec.start(); return true;
    } catch (e) { return false; }
  }
  function stopCaptions() { captionsOn = false; if (captions) { try { captions.stop(); } catch (e) {} captions = null; } }
  global.ACMA_MEDIA = {
    attachRoom: attachRoom, setMembers: setMembers, start: start, stop: stop,
    startCaptions: startCaptions, stopCaptions: stopCaptions, tapTalk: tapTalk,
    toggleMic: toggleMic, toggleCam: toggleCam,
    micOn: function () { return micOn; }, camOn: function () { return camOn; },
    remoteCount: function () { return Object.keys(remotes).length + Object.keys(frames).length; },
    isLive: function () { return !!(localStream && localStream.getTracks().some(function (t) { return t.readyState === "live"; })); },
    captionsActive: function () { return captionsOn; }, onStatus: function (fn) { onStatus = fn; }
  };
})(window);
