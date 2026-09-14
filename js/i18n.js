(function (global) {
  const KEY = "acma-lang";
  const dict = {
    en: {
      brandSub: "Classroom & Meeting Assistant",
      signIn: "Sign in",
      createAccount: "Create account",
      accountsTitle: "Create an account. Open a room. Share the code.",
      accountsBody: "Anyone can register. The host creates a room, then others join with the 6-character code.",
      fullName: "Full name", email: "Email", password: "Password", hello: "Hello",
      workspace: "Your workspace",
      workspaceHint: "Create a room, share camera and mic, or join with a code.",
      createRoom: "Create a room", joinRoom: "Join a room", roomName: "Room name", topic: "Topic",
      roomCode: "Room code", yourRooms: "Your rooms",
      noRooms: "No rooms yet. Create one or join with a code.",
      members: "Members", notes: "Notes", copyCode: "Copy code", startLive: "Start live session",
      leaveRoom: "Leave room", shareMedia: "Share camera & mic", stopMedia: "Stop camera & mic",
      captionsOn: "Live captions on", captionsOff: "Live captions off",
      typeHere: "Type if you have no microphone", send: "Post", raiseHand: "Raise hand",
      endSession: "End session", liveTranscript: "Live transcript", waiting: "Waiting",
      demoBtn: "Dr. Amal demo", demoHint: "Scripted classroom demo \u2014 not a real room.",
      demoTitle: "Systems Design Studio \u2014 Week 4", demoHost: "Dr. Amal Hassan",
      home: "Home", room: "Room", live: "Live", report: "Report", account: "Account",
      cameraHint: "Others in the room see and hear you after you tap Share camera & mic.",
      posted: "Posted", listening: "Listening \u2014 Arabic and English",
      noSpeech: "This browser cannot caption speech. Use the text box.",
      mediaOn: "Camera and microphone are live.", mediaOff: "Media stopped.",
      needRoom: "Open or join a room first."
    },
    ar: {
      brandSub: "\u0645\u0633\u0627\u0639\u062f \u0627\u0644\u0635\u0641\u0648\u0641 \u0648\u0627\u0644\u0627\u062c\u062a\u0645\u0627\u0639\u0627\u062a",
      signIn: "\u062f\u062e\u0648\u0644",
      createAccount: "\u0625\u0646\u0634\u0627\u0621 \u062d\u0633\u0627\u0628",
      accountsTitle: "\u0623\u0646\u0634\u0626 \u062d\u0633\u0627\u0628\u0627\u064b. \u0627\u0641\u062a\u062d \u063a\u0631\u0641\u0629. \u0634\u0627\u0631\u0643 \u0627\u0644\u0631\u0645\u0632.",
      accountsBody: "\u0623\u064a \u0634\u062e\u0635 \u064a\u0633\u062c\u0651\u0644. \u0627\u0644\u0645\u0636\u064a\u0641 \u064a\u0646\u0634\u0626 \u0627\u0644\u063a\u0631\u0641\u0629 \u0648\u0627\u0644\u0622\u062e\u0631\u0648\u0646 \u064a\u062f\u062e\u0644\u0648\u0646 \u0628\u0631\u0645\u0632 \u0645\u0646 6 \u062e\u0627\u0646\u0627\u062a.",
      fullName: "\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644", email: "\u0627\u0644\u0628\u0631\u064a\u062f", password: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631", hello: "\u0645\u0631\u062d\u0628\u0627\u064b",
      workspace: "\u0645\u0633\u0627\u062d\u062a\u0643",
      workspaceHint: "\u0623\u0646\u0634\u0626 \u063a\u0631\u0641\u0629 \u0648\u0634\u0627\u0631\u0643 \u0627\u0644\u0643\u0627\u0645\u064a\u0631\u0627 \u0648\u0627\u0644\u0645\u064a\u0643\u0631\u0648\u0641\u0648\u0646 \u0623\u0648 \u0627\u0646\u0636\u0645 \u0628\u0631\u0645\u0632.",
      createRoom: "\u0625\u0646\u0634\u0627\u0621 \u063a\u0631\u0641\u0629", joinRoom: "\u0627\u0644\u0627\u0646\u0636\u0645\u0627\u0645 \u0644\u063a\u0631\u0641\u0629", roomName: "\u0627\u0633\u0645 \u0627\u0644\u063a\u0631\u0641\u0629", topic: "\u0627\u0644\u0645\u0648\u0636\u0648\u0639",
      roomCode: "\u0631\u0645\u0632 \u0627\u0644\u063a\u0631\u0641\u0629", yourRooms: "\u063a\u0631\u0641\u0643",
      noRooms: "\u0644\u0627 \u063a\u0631\u0641 \u0628\u0639\u062f. \u0623\u0646\u0634\u0626 \u0648\u0627\u062d\u062f\u0629 \u0623\u0648 \u0627\u0646\u0636\u0645 \u0628\u0631\u0645\u0632.",
      members: "\u0627\u0644\u0623\u0639\u0636\u0627\u0621", notes: "\u0627\u0644\u0645\u0644\u0627\u062d\u0638\u0627\u062a", copyCode: "\u0646\u0633\u062e \u0627\u0644\u0631\u0645\u0632", startLive: "\u0628\u062f\u0621 \u0627\u0644\u0628\u062b",
      leaveRoom: "\u0645\u063a\u0627\u062f\u0631\u0629 \u0627\u0644\u063a\u0631\u0641\u0629", shareMedia: "\u0645\u0634\u0627\u0631\u0643\u0629 \u0627\u0644\u0643\u0627\u0645\u064a\u0631\u0627 \u0648\u0627\u0644\u0645\u064a\u0643\u0631\u0648\u0641\u0648\u0646", stopMedia: "\u0625\u064a\u0642\u0627\u0641 \u0627\u0644\u0643\u0627\u0645\u064a\u0631\u0627 \u0648\u0627\u0644\u0645\u064a\u0643\u0631\u0648\u0641\u0648\u0646",
      captionsOn: "\u0627\u0644\u062a\u0641\u0631\u064a\u063a \u064a\u0639\u0645\u0644", captionsOff: "\u062a\u0634\u063a\u064a\u0644 \u0627\u0644\u062a\u0641\u0631\u064a\u063a",
      typeHere: "\u0627\u0643\u062a\u0628 \u0647\u0646\u0627 \u0625\u0630\u0627 \u0644\u0645 \u064a\u062a\u0648\u0641\u0631 \u0645\u064a\u0643\u0631\u0648\u0641\u0648\u0646", send: "\u0646\u0634\u0631", raiseHand: "\u0631\u0641\u0639 \u0627\u0644\u064a\u062f",
      endSession: "\u0625\u0646\u0647\u0627\u0621 \u0627\u0644\u062c\u0644\u0633\u0629", liveTranscript: "\u0627\u0644\u062a\u0641\u0631\u064a\u063a \u0627\u0644\u062d\u064a", waiting: "\u0628\u0627\u0644\u0627\u0646\u062a\u0638\u0627\u0631",
      demoBtn: "\u0639\u0631\u0636 \u062f. \u0623\u0645\u0644", demoHint: "\u0639\u0631\u0636 \u0635\u0641\u0651\u064a \u062a\u062c\u0631\u064a\u0628\u064a \u2014 \u0644\u064a\u0633\u062a \u063a\u0631\u0641\u0629 \u062d\u0642\u064a\u0642\u064a\u0629.",
      demoTitle: "\u0627\u0633\u062a\u0648\u062f\u064a\u0648 \u062a\u0635\u0645\u064a\u0645 \u0627\u0644\u0623\u0646\u0638\u0645\u0629 \u2014 \u0627\u0644\u0623\u0633\u0628\u0648\u0639 4", demoHost: "\u062f. \u0623\u0645\u0644 \u062d\u0633\u0646",
      home: "\u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629", room: "\u0627\u0644\u063a\u0631\u0641\u0629", live: "\u0645\u0628\u0627\u0634\u0631", report: "\u0627\u0644\u062a\u0642\u0631\u064a\u0631", account: "\u0627\u0644\u062d\u0633\u0627\u0628",
      cameraHint: "\u0628\u0639\u062f \u0645\u0634\u0627\u0631\u0643\u0629 \u0627\u0644\u0643\u0627\u0645\u064a\u0631\u0627 \u064a\u0631\u0627\u0643 \u0648\u064a\u0633\u0645\u0639\u0643 \u0628\u0627\u0642\u064a \u0627\u0644\u0623\u0639\u0636\u0627\u0621.",
      posted: "\u062a\u0645 \u0627\u0644\u0646\u0634\u0631", listening: "\u064a\u0633\u062a\u0645\u0639 \u2014 \u0639\u0631\u0628\u064a \u0648\u0625\u0646\u062c\u0644\u064a\u0632\u064a",
      noSpeech: "\u0627\u0644\u0645\u062a\u0635\u0641\u062d \u0644\u0627 \u064a\u062f\u0639\u0645 \u062a\u0641\u0631\u064a\u063a \u0627\u0644\u0635\u0648\u062a. \u0627\u0633\u062a\u062e\u062f\u0645 \u0635\u0646\u062f\u0648\u0642 \u0627\u0644\u0643\u062a\u0627\u0628\u0629.",
      mediaOn: "\u0627\u0644\u0643\u0627\u0645\u064a\u0631\u0627 \u0648\u0627\u0644\u0645\u064a\u0643\u0631\u0648\u0641\u0648\u0646 \u064a\u0639\u0645\u0644\u0627\u0646.", mediaOff: "\u062a\u0645 \u0625\u064a\u0642\u0627\u0641 \u0627\u0644\u0648\u0633\u0627\u0626\u0637.",
      needRoom: "\u0627\u0641\u062a\u062d \u063a\u0631\u0641\u0629 \u0623\u0648 \u0627\u0646\u0636\u0645 \u0623\u0648\u0644\u0627\u064b."
    }
  };
  function current() { return localStorage.getItem(KEY) === "ar" ? "ar" : "en"; }
  function apply() {
    const lang = current();
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.body.classList.toggle("rtl", lang === "ar");
    document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) { el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph"))); });
    const btn = document.getElementById("lang-toggle");
    if (btn) btn.textContent = lang === "ar" ? "EN" : "\u0639";
  }
  function set(lang) { localStorage.setItem(KEY, lang === "ar" ? "ar" : "en"); apply(); return current(); }
  function toggle() { return set(current() === "ar" ? "en" : "ar"); }
  function t(key) { const lang = current(); return (dict[lang] && dict[lang][key]) || dict.en[key] || key; }
  function speechLang() { return current() === "ar" ? "ar-SA" : "en-US"; }
  global.ACMA_I18N = { current: current, set: set, toggle: toggle, t: t, apply: apply, speechLang: speechLang };
})(window);
