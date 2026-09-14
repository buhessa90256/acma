(function (global) {
  const USERS_KEY = "acma-users-v1";
  const ROOMS_KEY = "acma-rooms-v1";
  const AUTH_KEY = "acma-auth-v1";
  const ROOM_TOPIC = "acma/v1/room/";

  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; }
    catch (e) { return fallback; }
  }
  function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

  async function hashPass(email, password) {
    const raw = new TextEncoder().encode(String(email).toLowerCase() + "|" + password + "|acma-v1");
    const buf = await crypto.subtle.digest("SHA-256", raw);
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  function uid(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }

  function roomCode() {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function initials(name) {
    return String(name || "U").split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0].toUpperCase(); }).join("");
  }

  function users() { return load(USERS_KEY, []); }
  function rooms() { return load(ROOMS_KEY, []); }
  function setUsers(list) { save(USERS_KEY, list); }
  function setRooms(list) { save(ROOMS_KEY, list); }

  function current() {
    const id = load(AUTH_KEY, null);
    if (!id) return null;
    return users().find(function (u) { return u.id === id; }) || null;
  }
  function setCurrent(id) { save(AUTH_KEY, id); }
  function publicUser(u) {
    return { id: u.id, name: u.name, email: u.email, initials: initials(u.name), createdAt: u.createdAt };
  }

  let mqttClient = null;
  const watchers = {};
  const pendingPub = [];

  function bus() {
    if (mqttClient) return mqttClient;
    if (typeof mqtt === "undefined") return null;
    mqttClient = mqtt.connect("wss://broker.emqx.io:8084/mqtt", {
      clientId: "acma-" + Math.random().toString(16).slice(2, 10),
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 1500
    });
    mqttClient.on("connect", function () {
      pendingPub.splice(0).forEach(function (room) { rawPublish(room); });
    });
    mqttClient.on("message", function (topic, payload) {
      const code = String(topic || "").replace(ROOM_TOPIC, "");
      let room;
      try { room = JSON.parse(payload.toString()); } catch (e) { return; }
      if (!room || !room.code) return;
      upsertLocal(room);
      if (watchers[code]) watchers[code].forEach(function (fn) { fn(room); });
    });
    return mqttClient;
  }

  function rawPublish(room) {
    if (!mqttClient || !mqttClient.connected || !room || !room.code) return false;
    mqttClient.publish(ROOM_TOPIC + room.code, JSON.stringify(room), { retain: true, qos: 1 });
    return true;
  }

  function publishRoom(room) {
    bus();
    if (!rawPublish(room)) pendingPub.push(room);
  }

  function ready() {
    return new Promise(function (resolve, reject) {
      const c = bus();
      if (!c) { reject(new Error("Sync library failed to load. Open the site in Chrome/Safari, not the old installed icon.")); return; }
      if (c.connected) { resolve(c); return; }
      const t = setTimeout(function () { reject(new Error("Cannot reach the room network. Check internet and try again.")); }, 10000);
      c.once("connect", function () { clearTimeout(t); resolve(c); });
    });
  }

  function subscribeRoom(code) {
    const c = bus();
    if (!c || !code) return;
    const go = function () { c.subscribe(ROOM_TOPIC + code, { qos: 1 }); };
    if (c.connected) go(); else c.once("connect", go);
  }

  function fetchRemote(code) {
    code = String(code || "").trim().toUpperCase();
    return ready().then(function (c) {
      return new Promise(function (resolve, reject) {
        const topic = ROOM_TOPIC + code;
        let done = false;
        function finish(err, room) {
          if (done) return;
          done = true;
          if (err) reject(err); else resolve(room);
        }
        function onMsg(topicGot, payload) {
          if (topicGot !== topic) return;
          try { finish(null, JSON.parse(payload.toString())); }
          catch (e) { finish(new Error("No room uses that code.")); }
        }
        c.on("message", onMsg);
        c.subscribe(topic, { qos: 1 }, function () {
          setTimeout(function () {
            finish(new Error("No published room for " + code + ". Host must open ACMA in the browser tab, create/open the room, then you join."));
          }, 8000);
        });
      });
    });
  }

  function upsertLocal(room) {
    const all = rooms();
    const idx = all.findIndex(function (r) { return r.code === room.code || r.id === room.id; });
    if (idx >= 0) all[idx] = room; else all.unshift(room);
    setRooms(all);
    return room;
  }

  async function register(name, email, password) {
    name = String(name || "").trim();
    email = String(email || "").trim().toLowerCase();
    password = String(password || "");
    if (name.length < 2) throw new Error("Enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email.");
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");
    const all = users();
    if (all.some(function (u) { return u.email === email; })) throw new Error("An account with this email already exists.");
    const user = { id: uid("u"), name: name, email: email, pass: await hashPass(email, password), createdAt: new Date().toISOString() };
    all.push(user); setUsers(all); setCurrent(user.id);
    return publicUser(user);
  }

  async function login(email, password) {
    email = String(email || "").trim().toLowerCase();
    const user = users().find(function (u) { return u.email === email; });
    if (!user) throw new Error("No account found for that email.");
    const pass = await hashPass(email, password);
    if (user.pass !== pass) throw new Error("Wrong password.");
    setCurrent(user.id);
    return publicUser(user);
  }

  function logout() { localStorage.removeItem(AUTH_KEY); }

  async function createRoom(name, topic) {
    const me = current();
    if (!me) throw new Error("Sign in first.");
    name = String(name || "").trim();
    if (name.length < 2) throw new Error("Give the room a name.");
    await ready();
    let code = roomCode();
    const all = rooms();
    while (all.some(function (r) { return r.code === code; })) code = roomCode();
    const room = {
      id: uid("r"), code: code, name: name, topic: String(topic || "").trim(),
      hostId: me.id, hostName: me.name, createdAt: new Date().toISOString(), status: "open",
      members: [{ userId: me.id, role: "host", name: me.name, email: me.email, initials: initials(me.name), joinedAt: new Date().toISOString() }],
      messages: [], hands: [], live: false
    };
    all.unshift(room); setRooms(all);
    subscribeRoom(room.code);
    publishRoom(room);
    return room;
  }

  function findRoomByCode(code) {
    code = String(code || "").trim().toUpperCase().replace(/\s+/g, "");
    return rooms().find(function (r) { return r.code === code; }) || null;
  }
  function getRoom(id) { return rooms().find(function (r) { return r.id === id; }) || null; }

  function updateRoom(id, mutator) {
    const all = rooms();
    const idx = all.findIndex(function (r) { return r.id === id; });
    if (idx < 0) throw new Error("Room not found.");
    mutator(all[idx]);
    setRooms(all);
    publishRoom(all[idx]);
    return all[idx];
  }

  async function joinRoom(code) {
    const me = current();
    if (!me) throw new Error("Sign in first.");
    code = String(code || "").trim().toUpperCase().replace(/\s+/g, "");
    await ready();
    let room = findRoomByCode(code);
    if (!room) {
      room = await fetchRemote(code);
      if (!room || !room.code) throw new Error("No room uses that code.");
      upsertLocal(room);
    }
    subscribeRoom(room.code);
    return updateRoom(room.id, function (r) {
      const exists = r.members.some(function (m) { return m.userId === me.id || m.email === me.email; });
      if (!exists) {
        r.members.push({ userId: me.id, role: "attendee", name: me.name, email: me.email, initials: initials(me.name), joinedAt: new Date().toISOString() });
      }
    });
  }

  function leaveRoom(id) {
    const me = current();
    return updateRoom(id, function (r) {
      r.members = r.members.filter(function (m) { return m.userId !== me.id; });
      if (r.hostId === me.id && r.members.length) r.hostId = r.members[0].userId;
      if (!r.members.length) r.status = "closed";
    });
  }

  function myRooms() {
    const me = current();
    if (!me) return [];
    return rooms().filter(function (r) {
      return r.members.some(function (m) { return m.userId === me.id || m.email === me.email; });
    });
  }

  function addMessage(roomId, text) {
    const me = current();
    text = String(text || "").trim();
    if (!text) throw new Error("Type a message first.");
    return updateRoom(roomId, function (r) {
      r.messages.push({ id: uid("m"), userId: me.id, name: me.name, text: text, at: new Date().toISOString() });
    });
  }

  function toggleHand(roomId) {
    const me = current();
    return updateRoom(roomId, function (r) {
      const i = r.hands.indexOf(me.id);
      if (i >= 0) r.hands.splice(i, 1); else r.hands.push(me.id);
    });
  }

  function setLive(roomId, live) {
    return updateRoom(roomId, function (r) { r.live = !!live; r.status = live ? "live" : "open"; });
  }

  function populated(room) {
    if (!room) return null;
    return Object.assign({}, room, {
      members: (room.members || []).map(function (m) {
        return {
          userId: m.userId,
          role: m.userId === room.hostId ? "host" : (m.role || "attendee"),
          joinedAt: m.joinedAt,
          name: m.name || "Member",
          email: m.email || "",
          initials: m.initials || initials(m.name || "?")
        };
      })
    });
  }

  function watch(code, fn) {
    if (!watchers[code]) watchers[code] = [];
    watchers[code].push(fn);
    subscribeRoom(code);
    return function () { watchers[code] = (watchers[code] || []).filter(function (x) { return x !== fn; }); };
  }

  function syncState() {
    const c = bus();
    return { ready: !!(c && c.connected) };
  }

  bus();

  global.ACMA_STORE = {
    current: current, publicUser: publicUser, register: register, login: login, logout: logout,
    createRoom: createRoom, joinRoom: joinRoom, leaveRoom: leaveRoom, findRoomByCode: findRoomByCode,
    getRoom: getRoom, myRooms: myRooms, addMessage: addMessage, toggleHand: toggleHand, setLive: setLive,
    populated: populated, initials: initials, watch: watch, publishRoom: publishRoom, ready: ready, syncState: syncState
  };
})(window);
