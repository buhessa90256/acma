(function (global) {
  const ICE = { iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" }
  ]};
  let mqttClient = null, roomCode = null, userId = null, userName = "", localStream = null, captions = null, captionsOn = false;
  const peers = {}, remotes = {};
  let onCaption = null, onStatus = null;
  function topic() { return "acma/v1/rtc/" + roomCode; }
  function bus() {
    if (mqttClient) return mqttClient;
    if (typeof mqtt === "undefined") return null;
    mqttClient = mqtt.connect("wss://broker.emqx.io:8084/mqtt", { clientId: "rtc-" + Math.random().toString(16).slice(2, 10), clean: true, reconnectPeriod: 1500 });
    mqttClient.on("connect", function () { if (roomCode) mqttClient.subscribe(topic(), { qos: 1 }); });
    mqttClient.on("message", function (tp, payload) {
      if (!roomCode || tp !== topic()) return;
      let msg; try { msg = JSON.parse(payload.toString()); } catch (e) { return; }
      handleSignal(msg);
    });
    return mqttClient;
  }
  function send(msg) {
    const c = bus();
    if (!c || !roomCode) return;
    c.publish(topic(), JSON.stringify(Object.assign({ from: userId, name: userName }, msg)), { qos: 1 });
  }
  function tile(id, name, stream, mine) {
    const grid = document.getElementById("video-grid");
    if (!grid) return;
    let el = document.getElementById("tile-" + id);
    if (!el) {
      el = document.createElement("div");
      el.className = "vid-tile" + (mine ? " mine" : "");
      el.id = "tile-" + id;
      el.innerHTML = '<video playsinline autoplay ' + (mine ? "muted" : "") + '></video><span class="vid-name"></span>';
      grid.appendChild(el);
    }
    el.querySelector(".vid-name").textContent = name + (mine ? " \u00b7 you" : "");
    const v = el.querySelector("video");
    if (stream && v.srcObject !== stream) v.srcObject = stream;
    if (!mine) v.muted = false;
    v.play().catch(function () {});
  }
  function dropTile(id) {
    const el = document.getElementById("tile-" + id);
    if (el) el.remove();
    delete remotes[id];
  }
  async function ensurePeer(id) {
    if (peers[id]) return peers[id];
    const pc = new RTCPeerConnection(ICE);
    peers[id] = pc;
    if (localStream) localStream.getTracks().forEach(function (t) { pc.addTrack(t, localStream); });
    pc.onicecandidate = function (e) { if (e.candidate) send({ type: "ice", to: id, candidate: e.candidate }); };
    pc.ontrack = function (e) { remotes[id] = e.streams[0]; tile(id, pc._name || "Member", e.streams[0], false); };
    pc.onconnectionstatechange = function () {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed") {
        try { pc.close(); } catch (err) {}
        delete peers[id]; dropTile(id);
      }
    };
    return pc;
  }
  async function offerTo(id) {
    const pc = await ensurePeer(id);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ type: "offer", to: id, sdp: pc.localDescription });
  }
  async function handleSignal(msg) {
    if (!msg || msg.from === userId) return;
    if (msg.to && msg.to !== userId && msg.type !== "hello") return;
    if (msg.type === "hello") {
      const pc = await ensurePeer(msg.from);
      pc._name = msg.name || "Member";
      if (userId > msg.from) offerTo(msg.from);
      return;
    }
    if (msg.type === "bye") {
      if (peers[msg.from]) { try { peers[msg.from].close(); } catch (e) {} }
      delete peers[msg.from]; dropTile(msg.from); return;
    }
    if (msg.type === "offer") {
      const pc = await ensurePeer(msg.from);
      pc._name = msg.name || "Member";
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ type: "answer", to: msg.from, sdp: pc.localDescription });
      return;
    }
    if (msg.type === "answer" && peers[msg.from]) {
      await peers[msg.from].setRemoteDescription(new RTCSessionDescription(msg.sdp)); return;
    }
    if (msg.type === "ice" && peers[msg.from] && msg.candidate) {
      try { await peers[msg.from].addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch (e) {}
    }
  }
  function attachRoom(code, me) {
    roomCode = code; userId = me.id; userName = me.name; bus();
    const c = mqttClient;
    if (c && c.connected) c.subscribe(topic(), { qos: 1 });
    else if (c) c.once("connect", function () { c.subscribe(topic(), { qos: 1 }); });
  }
  async function start() {
    if (!roomCode) throw new Error("Join a room first.");
    localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 360 } }, audio: { echoCancellation: true, noiseSuppression: true } });
    tile(userId, userName, localStream, true);
    Object.keys(peers).forEach(function (id) {
      const pc = peers[id];
      localStream.getTracks().forEach(function (t) {
        const sent = pc.getSenders().some(function (s) { return s.track && s.track.kind === t.kind; });
        if (!sent) pc.addTrack(t, localStream);
      });
    });
    send({ type: "hello" });
    if (onStatus) onStatus("live");
    return localStream;
  }
  function stop() {
    send({ type: "bye" });
    if (localStream) localStream.getTracks().forEach(function (t) { t.stop(); });
    localStream = null;
    Object.keys(peers).forEach(function (id) { try { peers[id].close(); } catch (e) {} dropTile(id); delete peers[id]; });
    dropTile(userId); stopCaptions(); if (onStatus) onStatus("off");
  }
  function detectLang(text) { return /[\u0600-\u06FF]/.test(text) ? "ar" : "en"; }
  function startCaptions(handler) {
    onCaption = handler;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return false;
    stopCaptions(); captionsOn = true;
    function listen(lang) {
      if (!captionsOn) return;
      const rec = new SR(); captions = rec;
      rec.continuous = true; rec.interimResults = true; rec.lang = lang;
      rec.onresult = function (ev) {
        const res = ev.results[ev.results.length - 1];
        const text = (res[0] && res[0].transcript || "").trim();
        if (!text) return;
        const guessed = detectLang(text);
        if (onCaption) onCaption({ text: text, lang: guessed, interim: !res.isFinal });
      };
      rec.onend = function () {
        if (!captionsOn) return;
        setTimeout(function () { listen(lang === "ar-SA" ? "en-US" : "ar-SA"); }, 250);
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
    attachRoom: attachRoom, start: start, stop: stop, startCaptions: startCaptions, stopCaptions: stopCaptions,
    isLive: function () { return !!(localStream && localStream.getTracks().some(function (t) { return t.readyState === "live"; })); },
    captionsActive: function () { return captionsOn; },
    onStatus: function (fn) { onStatus = fn; }
  };
})(window);
