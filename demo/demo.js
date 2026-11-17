// Shared by the judges' pages: the home page (unit 7.7) and the two demos.
// First the parts of the shared look (docs/design/): the top bar, the 0–100 rule bar, the
// two-bar picture, the event marks, the arrow's dots. Below them, the 7.5/7.6 demo-page code
// (step bar, chart, transaction cards, boot) that 7.8 and 7.9 will replace.

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

// "12 s ago", "4 min ago", "3 h ago", "2 days ago", from a unix time in seconds.
function ago(seconds) {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - seconds));
  return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 172800 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} days ago`;
}

// --- The top bar: name, the three tabs, and the status of what feeds the page.
// current: "/" | "/demo/agent" | "/demo/protocol". live: the page's EventSource on /events.
// Returns { gemini(ok) } for the page to report whether Gemini's prices arrived.
function topBar(current, live) {
  const tabs = [["/", "Overview"], ["/demo/agent", "Agent insurance"], ["/demo/protocol", "Protocol risk"]];
  $("bar").innerHTML =
    `<div class="bar-in"><div class="brand"><svg aria-hidden="true" width="20" height="22" viewBox="0 0 22 24"><rect x="2" y="2" width="18" height="20" rx="6" fill="none" stroke="#E9ECEE" stroke-width="1.5"/><path d="M 2.8 13 L 19.2 13 L 19.2 16 Q 19.2 21.2 14 21.2 L 8 21.2 Q 2.8 21.2 2.8 16 Z" fill="#8FB0FF"/></svg>Probability Oracle</div>` +
    `<nav aria-label="Screens">${tabs.map(([href, name]) => `<a href="${href}"${href === current ? ' aria-current="page"' : ""}>${name}</a>`).join("")}</nav>` +
    `<div class="status"><span><i class="dot off" id="bar-dot"></i><span id="bar-gemini">Gemini prices loading</span></span><span id="bar-block">Arc testnet</span><span id="bar-stream"></span></div></div>`;
  const stream = (up) => { $("bar-stream").textContent = up ? "QuickNode Stream on" : "QuickNode Stream off"; };
  fetch("/api/stream").then((res) => res.json()).then((s) => stream(!!s.streamId));
  live.addEventListener("status", (e) => {
    const s = JSON.parse(e.data);
    $("bar-block").textContent = "Arc testnet, block " + s.block.toLocaleString("en-US");
    stream(s.streamUp);
  });
  return {
    gemini(ok) {
      $("bar-dot").classList.toggle("off", !ok);
      $("bar-gemini").textContent = ok ? "Gemini prices live" : "Gemini prices unavailable";
    },
  };
}

// --- The 0–100 rule bar: zones along the chance axis, the active one outlined, and a
// "X% now" marker. zones: [{ fromBps, label, tone }] in order, the first from 0;
// tone: "grey" | "blue" | "orange" | "orange2" | "red". active: the index of the zone in force.
const ZONE = {
  grey: { fill: "#E6E9EC", line: "#7D868E", text: "#3E464D", strong: "#1C2126" },
  blue: { fill: "#DDE6FA", line: "#2756C5", text: "#1E46A3", strong: "#1E46A3" },
  orange: { fill: "#FBE3D6", line: "#D8632C", text: "#3E464D", strong: "#8F3A14" },
  orange2: { fill: "#F6C7AE", line: "#D8632C", text: "#3E464D", strong: "#8F3A14" },
  red: { fill: "#F4C9C4", line: "#B8322A", text: "#9A2A23", strong: "#9A2A23" },
};
function ruleBar(svg, { zones, active, nowBps, label }) {
  const W = 420, x = (bps) => (bps / 10000) * W;
  let out = "";
  if (nowBps !== null) {
    const at = x(nowBps), anchor = at < 28 ? "start" : at > W - 28 ? "end" : "middle";
    out += `<text x="${anchor === "start" ? 0 : anchor === "end" ? W : at}" y="9" font-size="11" font-weight="600" fill="#1C2126" text-anchor="${anchor}">${pct(nowBps)} now</text>`;
    out += `<path d="M ${at - 6} 11 L ${at + 6} 11 L ${at} 18 Z" fill="#1C2126"/>`;
  }
  zones.forEach((z, i) => {
    const from = x(z.fromBps), to = i + 1 < zones.length ? x(zones[i + 1].fromBps) : W, c = ZONE[z.tone];
    out += i === active
      ? `<rect x="${from + 0.75}" y="20.75" width="${to - from - 1.5}" height="14.5" fill="${c.fill}" stroke="${c.line}" stroke-width="1.5"/>`
      : `<rect x="${from}" y="20" width="${to - from}" height="16" fill="${c.fill}"/>`;
    out += `<text x="${(from + to) / 2}" y="32" font-size="11" ${i === active ? 'font-weight="600" ' : ""}fill="${i === active ? c.strong : c.text}" text-anchor="middle">${z.label}</text>`;
    if (i) out += `<text x="${from}" y="48" font-size="10" fill="#59626A" text-anchor="middle">${z.fromBps / 100}${zones.length === 2 ? "%" : ""}</text>`;
  });
  out += `<text x="0" y="48" font-size="10" fill="#59626A">0%</text><text x="${W}" y="48" font-size="10" fill="#59626A" text-anchor="end">100%</text>`;
  svg.setAttribute("viewBox", `0 0 ${W} 50`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  svg.innerHTML = out;
}

// --- The two-bar picture. rows: [{ name, share (0 to 1), text, tone }]; tone as a bar colour:
// "" (grey) | "blue" | "orange" | "red".
function bars(box, rows) {
  box.replaceChildren();
  for (const r of rows) {
    const track = el("span", "track"), fill = el("i", r.tone);
    fill.style.width = Math.max(0, Math.min(1, r.share)) * 100 + "%";
    track.append(fill);
    box.append(el("span", "", r.name), track, el("b", "", r.text));
  }
}

// --- The mark at the start of an event row.
const MARKS = {
  warning: ["Warning", `<path d="M 7 0.5 L 13.5 7 L 7 13.5 L 0.5 7 Z" fill="#D8632C"/>`],
  critical: ["Critical", `<path d="M 7 1 L 13.5 13 L 0.5 13 Z" fill="#B8322A"/>`],
  data: ["Data", `<circle cx="7" cy="7" r="5" fill="#2756C5"/>`],
  info: ["Info", `<circle cx="7" cy="7" r="5" fill="none" stroke="#6E7881" stroke-width="1.5"/>`],
  action: ["Action", `<rect x="1.5" y="1.5" width="11" height="11" rx="2" fill="#2756C5"/>`],
};
const mark = (kind) => `<svg role="img" aria-label="${MARKS[kind][0]}" width="14" height="14" viewBox="0 0 14 14">${MARKS[kind][1]}</svg>`;
// One event row: eventRow("1:00", "info", "Replay ended at 61%", "Already covered").
function eventRow(time, kind, title, more) {
  const row = el("li");
  const body = el("span");
  body.append(el("b", "", title));
  if (more) body.append(" ", el("span", "more", more));
  row.append(el("time", "", time));
  row.insertAdjacentHTML("beforeend", mark(kind));
  row.append(body);
  return row;
}

// --- An arrow between two panels: blue dots run along it for 2 s when a real event passes.
const ARROW = `<svg width="36" height="16" viewBox="0 0 36 16"><path d="M 4 8 L 28 8" fill="none" stroke="#7D868E" stroke-width="2"/><path d="M 25 3 L 31 8 L 25 13" fill="none" stroke="#7D868E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path class="flow" d="M 4 8 L 24 8"/></svg>`;
function runFlow(conn) {
  conn.classList.add("live");
  clearTimeout(conn.flowTimer);
  conn.flowTimer = setTimeout(() => conn.classList.remove("live"), 2000);
}

// ---------------------------------------------------------------------------------------------
// The 7.5/7.6 demo pages, until units 7.8 and 7.9.
// ---------------------------------------------------------------------------------------------

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
