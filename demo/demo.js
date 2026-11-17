// Shared by the two demo pages (units 7.5 and 7.6): the step bar, the chart, the Oracle output
// chip, the transaction cards and the focus. A page calls boot(kind, page) and supplies what is
// its own. Everything is drawn from one object, GET /api/demo/<kind>, fetched again whenever
// the server pushes an event on /events.

const $ = (id) => document.getElementById(id);
const pct = (bps) => (bps % 100 ? (bps / 100).toFixed(1) : String(bps / 100)) + "%";
const usd = (n) => "$" + (n < 0.1 ? n.toFixed(3) : n.toFixed(2));
const shortTx = (url) => { const hash = url.split("/").pop(); return hash.slice(0, 6) + "…" + hash.slice(-4); };
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

// --- Focus: one zone (or a card with its transaction) is highlighted; the rest dims.
let focused = ["chart-card"];
let focusTimer;
function applyFocus() {
  for (const zone of document.querySelectorAll(".zone")) zone.classList.toggle("focus", focused.includes(zone.id));
}
// seq: [[ids, ms], …], one after another; then the focus goes back to the chart.
function focusOn(seq) {
  clearTimeout(focusTimer);
  const next = (i) => {
    focused = i < seq.length ? seq[i][0] : ["chart-card"];
    applyFocus();
    if (i < seq.length) focusTimer = setTimeout(() => next(i + 1), seq[i][1]);
  };
  next(0);
}

// --- The step bar. At the end it gives its place to the summary.
function renderSteps(labels, step) {
  const bar = $("steps");
  bar.replaceChildren();
  labels.forEach((label, i) => {
    const n = i + 1;
    const item = el("li", n < step ? "done" : n === step ? "now" : "");
    item.append(el("span", "n", n < step ? "✓" : n), el("span", "", label));
    bar.append(item);
  });
}

// One summary number: stat("19% → 61%", "chance") or with a small unit after the number.
function stat(big, unit) {
  const box = el("div", "stat");
  const number = el("div", "big", big);
  if (unit) number.append(" ", el("small", "", unit));
  box.append(number);
  return box;
}

// --- The chart: the chance of harm over the replayed days. Gemini's whole history is a faint
// blue line from the start; our onchain values draw a red line over it as the replay runs.
// marks: [{ bps, label }] dashed lines. Both lines are steps: a value holds until it changes.
const drawn = { key: "", length: 0 };
function drawChart(view, marks) {
  const svg = $("chart");
  const w = svg.clientWidth, h = svg.clientHeight;
  const published = view.run ? view.run.published : [];
  const key = [view.run && view.run.runId, published.length, w, h].join();
  if (key === drawn.key || !w || !h) return;
  const sameRun = drawn.key.split(",")[0] === key.split(",")[0];
  drawn.key = key;

  const L = 52, R = 26, T = 34, B = 30;
  const t0 = Date.parse(view.path[0].time), t1 = Date.parse(view.path.at(-1).time);
  const X = (time) => L + ((Date.parse(time) - t0) / (t1 - t0)) * (w - L - R);
  const Y = (bps) => T + (1 - bps / 10000) * (h - T - B);
  const steps = (points) => points.map((p, i) => (i ? `H${X(p.time).toFixed(1)}V${Y(p.harmBps).toFixed(1)}` : `M${X(p.time).toFixed(1)} ${Y(p.harmBps).toFixed(1)}`)).join("");

  let out = "";
  for (const bps of [0, 2500, 5000, 7500, 10000]) {
    out += `<line x1="${L}" x2="${w - R}" y1="${Y(bps)}" y2="${Y(bps)}" stroke="var(--hair)" stroke-width="1"/>`;
    out += `<text x="${L - 10}" y="${Y(bps) + 5}" text-anchor="end">${bps / 100}%</text>`;
  }
  for (let day = t0; day <= t1; day += 24 * 3600 * 1000) {
    const date = new Date(day).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    out += `<text x="${X(new Date(day).toISOString())}" y="${h - 8}">${date}</text>`;
  }
  out += `<path d="${steps(view.path)}" fill="none" stroke="var(--gemini)" stroke-width="2" opacity="0.4"/>`;
  for (const m of marks) {
    out += `<line x1="${L}" x2="${w - R}" y1="${Y(m.bps)}" y2="${Y(m.bps)}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="7 6"/>`;
    out += `<text class="mark" x="${w - R}" y="${Y(m.bps) - 8}" text-anchor="end">${m.label}</text>`;
  }
  if (published.length) {
    const last = published.at(-1);
    out += `<path id="red" d="${steps(published)}" fill="none" stroke="var(--oracle)" stroke-width="3.5" stroke-linejoin="round"/>`;
    for (const p of published.slice(0, -1)) {
      out += `<circle cx="${X(p.time)}" cy="${Y(p.harmBps)}" r="4" fill="var(--oracle)" stroke="var(--paper)" stroke-width="1.5"><title>${new Date(p.time).toUTCString().slice(5, 22)} UTC: ${pct(p.harmBps)}, round ${p.round}</title></circle>`;
    }
    const x = X(last.time), y = Y(last.harmBps);
    const flip = x > w - R - 80; // the label moves to the dot's left near the right edge
    out += `<g id="dot" style="transform: translate(${x}px, ${y}px)"><circle r="9" fill="var(--oracle)" stroke="var(--paper)" stroke-width="3"/>` +
      `<text class="now" x="${flip ? -16 : 16}" y="${y < T + 40 ? 30 : -14}" text-anchor="${flip ? "end" : "start"}" paint-order="stroke" stroke="var(--paper)" stroke-width="5">${pct(last.harmBps)}</text></g>`;
    svg.innerHTML = out;

    // The newest piece of the red line draws itself, and the dot rides its tip.
    const red = $("red"), dot = $("dot"), length = red.getTotalLength(), from = drawn.length;
    if (!calm && sameRun && published.length > 1 && from < length) {
      red.style.strokeDasharray = length;
      const began = performance.now();
      (function move(now) {
        if (!red.isConnected) return; // the chart was drawn again meanwhile
        const t = Math.min(1, (now - began) / 800);
        const at = from + (length - from) * (1 - (1 - t) * (1 - t)); // ease out
        const tip = red.getPointAtLength(at);
        red.style.strokeDashoffset = length - at;
        dot.style.transform = `translate(${tip.x}px, ${tip.y}px)`;
        if (t < 1) requestAnimationFrame(move);
      })(began);
    }
    drawn.length = length;
  } else {
    svg.innerHTML = out;
    drawn.length = 0;
  }
}

// --- The Oracle output chip: what Gemini said and what we put onchain, on every publish.
function renderChip(view) {
  const last = view.run && view.run.published.at(-1);
  $("chip-gemini").textContent = pct(last ? last.harmBps : view.path[0].harmBps);
  $("chip-onchain").textContent = last ? pct(last.harmBps) : "";
  $("chip-round").textContent = last ? "round " + last.round : "";
  $("chip-tx").hidden = !last;
  if (last) {
    $("chip-tx").href = last.txUrl;
    $("chip-tx").textContent = shortTx(last.txUrl);
  }
}

// --- One transaction card. c: { title, pill, pre, big, note, href }, or null for an empty slot.
function txCard(id, c) {
  const card = $(id);
  const was = card.dataset.shown;
  card.dataset.shown = JSON.stringify(c);
  if (was === card.dataset.shown) return;
  card.className = "tx zone card" + (c ? "" : " empty");
  card.replaceChildren();
  if (!c) return;
  const title = el("div", "tx-title", c.title);
  if (c.pill) title.append(el("span", "pill", c.pill));
  const big = el("div", "tx-big");
  if (c.pre) big.append(el("small", "", c.pre));
  big.append(c.big);
  const foot = el("div", "tx-foot");
  if (c.note) foot.append(el("span", "", c.note));
  if (c.href) {
    const link = el("a", "", shortTx(c.href));
    link.href = c.href;
    link.target = "_blank";
    foot.append(link);
  }
  card.append(title, big, foot);
  if (!calm) card.animate([{ transform: "scale(1.04)" }, { transform: "scale(1)" }], { duration: 350, easing: "ease-out" });
}

// The card both demos share: the newest oracle update.
function oracleCard(view) {
  const last = view.run && view.run.published.at(-1);
  txCard("tx-oracle", last ? { title: "Oracle update", pre: "round", big: String(last.round), href: last.txUrl } : null);
}

// --- boot: load the view, draw it, redraw on every server event.
// page: { steps: [labels], marks(view), render(view), focus(step), summary(view) → [stat, …] }
function boot(kind, page) {
  let view = null, asked = 0, lastStep = -1, lastStatus = "";

  function draw() {
    const status = view.run ? view.run.status : "idle";
    document.body.dataset.status = status;
    document.body.dataset.step = view.step;
    const done = status === "done" && view.summary;

    $("steps").hidden = !!done;
    $("summary").hidden = !done;
    if (done) {
      $("summary").replaceChildren(...page.summary(view), $("actions"));
      $("actions").hidden = false;
    } else {
      renderSteps(page.steps, view.step);
    }
    $("via").hidden = !(view.run && view.run.via === "direct" && status !== "done");

    drawChart(view, page.marks(view));
    renderChip(view);
    page.render(view);

    // The start button sits over the chart until a run is going.
    $("start-wrap").hidden = status === "running" || status === "done";
    $("start").disabled = status === "starting" || !!view.busy;
    $("start").textContent = status === "starting" ? "Starting…" : "Start replay";
    if (view.busy) $("start-note").textContent = `The ${view.busy} demo is running`;

    if (status === "running" && view.step !== lastStep) focusOn(page.focus(view.step));
    if (done && lastStatus !== "done") focusOn([[["top"], 1e9]]);
    lastStep = view.step;
    lastStatus = status;
    applyFocus();
  }

  async function refresh() {
    const mine = ++asked;
    const next = await (await fetch(`/api/demo/${kind}`)).json();
    if (mine !== asked) return; // a newer answer is on its way
    if (next.error) return void ($("start-note").textContent = next.error);
    view = next;
    draw();
  }

  async function start() {
    $("start").disabled = true;
    $("start-note").textContent = "";
    const res = await fetch(`/api/demo/${kind}/start`, { method: "POST" });
    if (!res.ok) $("start-note").textContent = (await res.json()).error;
    refresh();
  }
  $("start").onclick = start;
  $("again").onclick = start;

  let timer;
  const soon = () => { clearTimeout(timer); timer = setTimeout(refresh, 200); };
  const live = new EventSource("/events"); // it reconnects by itself
  for (const type of ["demo", "oracle", "agent", "payment", "defi", "stream"]) live.addEventListener(type, soon);
  // The chart is drawn in pixels, so it is drawn again whenever its box changes size
  // (a window resize, or the web font arriving).
  new ResizeObserver(() => view && draw()).observe($("chart"));
  // For the screenshot script: draw any state object.
  window.show = (state) => { view = state; draw(); };
  return refresh();
}
