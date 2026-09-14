(function (global) {
  let timer = null;
  let idx = 0;
  function people() {
    return (global.ACMA_DATA && ACMA_DATA.participants) || [{ id: "p-amal", name: "Dr. Amal Hassan", initials: "AH", role: "Host" }];
  }
  function script() { return (global.ACMA_DATA && ACMA_DATA.script) || []; }
  function renderFaces() {
    const box = document.getElementById("demo-faces");
    if (!box) return;
    box.innerHTML = people().map(function (p) {
      return '<div class="face" id="demo-face-' + p.id + '"><div class="dot" style="background:#2ee6c833;color:#2ee6c8">' + p.initials + "</div><b>" + p.name.split(" ").pop() + '</b><span class="muted">' + (p.role || "") + "</span></div>";
    }).join("");
  }
  function paint(line) {
    const who = people().find(function (p) { return p.id === line.speaker; }) || { name: "Dr. Amal Hassan" };
    const capWho = document.getElementById("demo-who");
    const capText = document.getElementById("demo-text");
    const list = document.getElementById("demo-transcript");
    if (capWho) capWho.textContent = who.name;
    if (capText) capText.textContent = line.text;
    document.querySelectorAll("#demo-faces .face").forEach(function (el) { el.classList.remove("on"); });
    const face = document.getElementById("demo-face-" + line.speaker);
    if (face) face.classList.add("on");
    if (list) {
      const t = new Date();
      const stamp = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
      const row = document.createElement("div");
      row.className = "line";
      row.innerHTML = "<time>" + stamp + '</time><div><span class="spk">' + who.name + "</span> " + line.text + "</div>";
      list.prepend(row);
    }
  }
  function start() {
    stop(); idx = 0; renderFaces();
    const lines = script();
    if (!lines.length) return;
    paint(lines[0]);
    timer = setInterval(function () {
      idx += 1;
      if (idx >= lines.length) { clearInterval(timer); timer = null; return; }
      paint(lines[idx]);
    }, 2800);
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }
  global.ACMA_DEMO = { start: start, stop: stop, renderFaces: renderFaces };
})(window);
