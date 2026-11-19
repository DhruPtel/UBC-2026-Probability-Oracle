// Shared by the judges' pages: the home page (unit 7.7) and the two demos (7.8, 7.9).
// First the parts of the shared look (docs/design/): the top bar, the 0–100 rule bar, the
// two-bar picture, the event marks, the arrow's dots. Then what the two demo pages share:
// the replay clock, the header with its progress bar and button, the workflow diagram,
// the events list, and bootDemo, which loads GET /api/demo/<kind> and redraws on every event.

const $ = (id) => document.getElementById(id);
const pct = (bps) => (bps % 100 ? (bps / 100).toFixed(1) : String(bps / 100)) + "%";
const usd = (n) => "$" + (n < 0.1 ? n.toFixed(3) : n.toFixed(2));
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
// The top tier, in the same words everywhere: the borrow cap is held at today's level; open
// loans, repayments, deposits and withdrawals carry on.
const NO_NEW = "No new borrowing", NO_NEW_SHORT = "No new";

const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname); // the hosted copy has no terminal to point at
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

// --- "How this works": a page's explanation sits behind a small button, closed at first.
function howToggle(button, text) {
  button.onclick = () => {
    text.hidden = !text.hidden;
    button.setAttribute("aria-expanded", !text.hidden);
  };
}

// --- The top bar: name, the tabs, and the status of what feeds the page.
// current: the tab's path. live: the page's EventSource on /events.
// Returns { gemini(ok) } for the page to report whether Gemini's prices arrived.
function topBar(current, live) {
  const tabs = [["/", "Overview"], ["/oracle", "Oracle"], ["/pools", "BTC pools"], ["/agents", "Agents"]];
  $("bar").innerHTML =
    `<div class="bar-in"><div class="brand"><svg aria-hidden="true" width="20" height="22" viewBox="0 0 22 24"><rect x="2" y="2" width="18" height="20" rx="6" fill="none" stroke="#E9ECEE" stroke-width="1.5"/><path d="M 2.8 13 L 19.2 13 L 19.2 16 Q 19.2 21.2 14 21.2 L 8 21.2 Q 2.8 21.2 2.8 16 Z" fill="#8FB0FF"/></svg>Probability Oracle</div>` +
    `<nav aria-label="Screens">${tabs.map(([href, name]) => `<a href="${href}"${href === current ? ' aria-current="page"' : ""}>${name}</a>`).join("")}</nav>` +
    `<div class="status"><span><i class="dot off" id="bar-dot"></i><span id="bar-gemini">Gemini prices loading</span></span><span id="bar-block">Arc testnet</span><button type="button" id="bar-stream" aria-expanded="false" aria-controls="streampanel"></button></div></div>`;
  // The Stream (unit 10b.7): on with the time of its last delivery, or off with how to start it.
  // A click opens a panel: what it watches, where it delivers, what a delivery sets off, the last 10.
  const clock = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour12: false });
  let streamOn = null, lastAt = null;
  const stream = (up, last) => {
    streamOn = up; lastAt = last ?? lastAt;
    const b = $("bar-stream");
    b.innerHTML = `<i class="dot${up ? "" : " off"}"></i>`;
    b.append(up ? "QuickNode Stream: on" + (lastAt ? ", last delivery " + clock(lastAt) : ", waiting for a post") : "QuickNode Stream off" + (LOCAL ? ": start with npm run demo" : ""));
  };
  const panel = el("div", "howtext over streampanel");
  panel.id = "streampanel";
  panel.hidden = true;
  document.body.append(panel);
  async function fillPanel() {
    const s = await (await fetch("/api/stream")).json(), list = (items) => { const ul = el("ul"); ul.append(...items.map((t) => (typeof t === "string" ? el("li", "", t) : t))); return ul; };
    stream(!!s.streamId, s.lastDelivery);
    const head = el("div", "between"), filter = el("p", "overview", s.filter.note + " "), file = el("a", "", s.filter.file);
    head.append(el("h2", "", s.streamId ? "QuickNode Stream: on" : "QuickNode Stream: off"), el("span", "chip" + (s.streamId ? " blue" : ""), s.streamId ? "Deliveries are signed" : LOCAL ? "Start with npm run demo" : "Not running now"));
    file.href = s.filter.url; file.target = "_blank"; file.rel = "noopener";
    filter.append(file);
    const contracts = s.watches.contracts.map((c) => { const li = el("li"), a = el("a", "", c.address.slice(0, 8) + "…" + c.address.slice(-4)); a.href = c.url; a.target = "_blank"; a.rel = "noopener"; li.append(c.name + " ", a); return li; });
    const table = el("table", "mfeed"), body = el("tbody");
    table.innerHTML = "<thead><tr><th>Delivered</th><th>After the block</th><th>What arrived</th><th>What it set off</th></tr></thead>";
    for (const d of s.deliveries) { const tr = el("tr"); tr.append(el("td", "", clock(d.receivedAt)), el("td", "", d.delayMs === null ? "–" : (d.delayMs / 1000).toFixed(1) + " s"), el("td", "", d.events.join(", ").replace(/GEMI-/g, "")), el("td", "", d.did.join(", "))); body.append(tr); }
    if (!s.deliveries.length) { const tr = el("tr"), td = el("td", "none", "No deliveries yet."); td.colSpan = 4; tr.append(td); body.append(tr); }
    table.append(body);
    const cols = el("div", "cols"), col = (title, node) => { const d = el("div"); d.append(el("b", "", title), node); return d; };
    cols.append(col("Watches on " + s.watches.network, list([...contracts, ...s.watches.events])), col("A delivery sets off", list(s.triggers)));
    const off = el("p", "overview", s.streamId ? "" : "The Stream is off, so nothing is delivered: the replays trigger the keeper and the agent directly and say so, live pools wait for the next manual sync, and covered agents do not re-check. It bills per block while it is on, so it runs during demos.");
    panel.replaceChildren(head, ...(s.streamId ? [] : [off]), cols, filter, el("p", "overview", s.destination), el("b", "", "Last 10 deliveries"), table);
  }
  $("bar-stream").onclick = () => {
    panel.hidden = !panel.hidden;
    $("bar-stream").setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) fillPanel();
  };
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) $("bar-stream").click(); });
  fetch("/api/stream").then((res) => res.json()).then((s) => stream(!!s.streamId, s.lastDelivery));
  live.addEventListener("status", (e) => {
    const s = JSON.parse(e.data);
    $("bar-block").textContent = "Arc testnet, block " + s.block.toLocaleString("en-US");
    if (s.streamUp !== streamOn || s.lastDelivery !== lastAt) { stream(s.streamUp, s.lastDelivery); if (!panel.hidden) fillPanel(); }
  });
  live.addEventListener("stream", () => { if (streamOn) { stream(true, new Date().toISOString()); if (!panel.hidden) fillPanel(); } });
  return {
    // text: what to say instead, for example "Replaying real Gemini prices" on a demo page.
    gemini(ok, text) {
      $("bar-dot").classList.toggle("off", !ok);
      $("bar-gemini").textContent = text ?? (ok ? "Gemini prices live" : "Gemini prices unavailable");
    },
  };
}

// --- The 0–100 rule bar: zones along the chance axis, the active one outlined, and a
// "X% now" marker, 50 px tall. zones: [{ fromBps, label, tone }] in order, the first from 0;
// tone: "grey" | "blue" | "orange" | "orange2" | "red". active: the index of the zone in force.
const ZONE = {
  grey: { fill: "#E6E9EC", line: "#7D868E", text: "#3E464D", strong: "#1C2126" },
  blue: { fill: "#DDE6FA", line: "#2756C5", text: "#1E46A3", strong: "#1E46A3" },
  orange: { fill: "#FBE3D6", line: "#D8632C", text: "#3E464D", strong: "#8F3A14" },
  orange2: { fill: "#F6C7AE", line: "#D8632C", text: "#3E464D", strong: "#8F3A14" },
  red: { fill: "#F4C9C4", line: "#B8322A", text: "#9A2A23", strong: "#9A2A23" },
};
function ruleBar(svg, { zones, active, nowBps, label, mark = "now" }) { // mark: the word after the number, "now" or "what if"
  const W = svg.clientWidth || 420, x = (bps) => (bps / 10000) * W; // drawn at its size on the page, so the text is the same size in every card
  let out = "";
  if (nowBps !== null) {
    const at = x(nowBps), anchor = at < 28 ? "start" : at > W - 28 ? "end" : "middle";
    out += `<text x="${anchor === "start" ? 0 : anchor === "end" ? W : at}" y="9" font-size="11" font-weight="600" fill="#1C2126" text-anchor="${anchor}">${pct(nowBps)} ${mark}</text>`;
    out += `<path d="M ${at - 6} 11 L ${at + 6} 11 L ${at} 18 Z" fill="#1C2126"/>`;
  }
  zones.forEach((z, i) => {
    const from = x(z.fromBps), to = i + 1 < zones.length ? x(zones[i + 1].fromBps) : W, c = ZONE[z.tone];
    out += i === active
      ? `<rect x="${from + 0.75}" y="20.75" width="${to - from - 1.5}" height="14.5" fill="${c.fill}" stroke="${c.line}" stroke-width="1.5"/>`
      : `<rect x="${from}" y="20" width="${to - from}" height="16" fill="${c.fill}"/>`;
    // A label wider than its zone is squeezed to fit (about 6 px a letter at this size).
    // In a narrow zone the short form is used.
    const text = z.short && z.label.length * 6 > to - from - 8 ? z.short : z.label;
    const fit = text.length * 6 > to - from - 8 ? `textLength="${to - from - 8}" lengthAdjust="spacingAndGlyphs" ` : "";
    out += `<text x="${(from + to) / 2}" y="32" font-size="11" ${fit}${i === active ? 'font-weight="600" ' : ""}fill="${i === active ? c.strong : c.text}" text-anchor="middle">${text}</text>`;
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
// The two demo pages (units 7.8 and 7.9). A demo is a REPLAY of real Gemini hourly prices.
// ---------------------------------------------------------------------------------------------

// The replay clock: seconds since the run started, as "0:36".
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const clockAt = (run, iso) => clock(Math.max(0, (Date.parse(iso) - Date.parse(run.startedAt)) / 1000));
const dayOf = (ms) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// What one post set off: the record in `list` written after this post and before the next.
// The replay waits for that work before it posts again, so the times do not overlap; half a
// second of slack covers a Stream delivery that beats our own receipt for the post.
const during = (run, i, at) => {
  const p = run.published[i], next = run.published[i + 1];
  return Date.parse(at) > Date.parse(p.at) - 500 && (!next || Date.parse(at) < Date.parse(next.at) - 500);
};
const setOffBy = (run, i, list) => list.find((e) => during(run, i, e.at)) ?? null;

// The x scale of a demo chart: the replayed days, left to right. Returns X(iso) and the day ticks.
function replayScale(view, left, right) {
  const t0 = Date.parse(view.from + "T00:00:00Z"), t1 = Date.parse(view.to + "T00:00:00Z") + 24 * 3600 * 1000;
  const X = (when) => left + (((typeof when === "number" ? when : Date.parse(when)) - t0) / (t1 - t0)) * (right - left); // an ISO time, or milliseconds
  const days = [];
  for (let t = t0; t < t1; t += 24 * 3600 * 1000) days.push({ x: X(new Date(t).toISOString()), label: dayOf(t) });
  return { X, days };
}
// A value holds until the next one: a stepped path through points, ending at endX.
const stepped = (points, X, Y, endX) =>
  points.map((p, i) => (i ? `H ${X(p.time).toFixed(1)} V ${Y(p.harmBps).toFixed(1)}` : `M ${X(p.time).toFixed(1)} ${Y(p.harmBps).toFixed(1)}`)).join(" ") + ` H ${endX.toFixed(1)}`;

// --- The banner under the header. b: { tone: "" | "blue" | "orange" | "red", icon, title, more, href }.
// icon: "idle" | "check" | "warning" | "critical". The icon blinks three times when the tone changes.
const BANNER_ICONS = {
  idle: `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="6.5" fill="none" stroke="#6E7881" stroke-width="1.8"/></svg>`,
  check: `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18"><rect x="2" y="2" width="14" height="14" rx="3" fill="#2756C5"/><path d="M 5.5 9.2 L 8 11.6 L 12.5 6.6" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  warning: `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20"><path d="M 10 1 L 19 10 L 10 19 L 1 10 Z" fill="#D8632C"/><path d="M 10 5.5 L 10 11" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="14" r="1.1" fill="#FFFFFF"/></svg>`,
  critical: `<svg aria-hidden="true" width="20" height="18" viewBox="0 0 20 18"><path d="M 10 1 L 19 17 L 1 17 Z" fill="#B8322A"/><path d="M 10 6.5 L 10 11" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="14" r="1.1" fill="#FFFFFF"/></svg>`,
};
function banner(b) {
  const box = $("banner"), key = b.tone + b.icon;
  const blink = box.dataset.key !== undefined && box.dataset.key !== key && (b.icon === "warning" || b.icon === "critical");
  box.dataset.key = key;
  box.className = "banner " + b.tone;
  box.innerHTML = BANNER_ICONS[b.icon];
  if (blink && !calm) box.firstChild.classList.add("blink");
  box.append(el("b", "", b.title), el("span", "", b.more));
  if (b.href) {
    const link = el("a", "", "View transaction");
    link.href = b.href;
    link.target = "_blank";
    box.append(link);
  }
}

// --- The workflow diagram (units 7.16, 7.17): numbered steps that light up one after another.
// A step may also carry `big` (one large value, the story form of unit 7.20) and `always`
// (it stays lit whatever the stage: something that happened at an earlier post).
// steps: [{ title, call, idle, detail, href, tone }]: `call` is the real call or event (drawn last), `idle`
// what the step does in general, `detail` what it did this time. `reach` is how many steps have
// really happened for this `key` (one post); with `animate` they light up 260 ms apart and
// onStep(n) runs as step n lights. Without it (no run, a finished run, reduced motion) they are
// simply drawn as reached.
const workflows = new WeakMap();
function workflow(list, key, steps, reach, animate, onStep) {
  let w = workflows.get(list);
  if (!w) workflows.set(list, (w = { key: undefined, stage: 0, timer: null }));
  const moving = animate && !calm;
  if (w.key !== key) { w.key = key; w.stage = 0; }
  if (!moving || w.stage > reach) w.stage = reach;
  Object.assign(w, { steps, reach, onStep });
  const render = () => list.replaceChildren(...w.steps.map((s, i) => {
    const lit = i < w.stage || !!s.always, li = el("li", "wstep " + (lit ? "on " + (s.tone ?? "") : "off") + (w.timer && i === w.stage - 1 ? " now" : ""));
    const head = el("div", "whead"), detail = el("span", "", lit && s.detail ? s.detail : s.idle);
    head.append(el("span", "badge", i + 1), el("b", "", s.title));
    if (s.big || (!lit && "big" in s && w.key !== "idle")) li.append(head, el("strong", "", lit ? s.big : "–"), detail);
    else li.append(head, detail);
    if (s.call) li.append(el("code", "", s.call)); // the real call, at the foot of the card
    if (lit && s.href) { const a = el("a", "", "View transaction"); a.href = s.href; a.target = "_blank"; li.append(a); }
    return li;
  }));
  render();
  if (w.stage < reach && !w.timer) w.timer = setInterval(() => {
    if (w.stage >= w.reach) { clearInterval(w.timer); w.timer = null; return render(); }
    w.stage++;
    render();
    if (w.onStep) w.onStep(w.stage);
  }, 260);
}
// --- The events list, newest first. rows: [{ at, kind, title, more, tone }] in the order they happened.
function events(list, run, rows) {
  list.replaceChildren(...rows.map((r) => {
    const row = eventRow(clockAt(run, r.at), r.kind, r.title, r.more);
    if (r.tone) row.className = r.tone;
    return row;
  }).reverse());
}

// --- bootDemo: the top bar, the header (progress bar, clock, button), the view, and a redraw
// on every server event. draw(view) is the page's own and runs when the data changes;
// plot(view, head) draws its chart and also runs on every frame while the playhead moves.
// head is { t: milliseconds on the replayed days, bps: the chance shown there, shown: how many
// posts the playhead has reached }, or null before the first post.
const BUTTON_ICONS = {
  play: `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="M 4.5 2.5 L 13 8 L 4.5 13.5 Z" fill="#FFFFFF"/></svg>`,
  again: `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M 3 8 A 5 5 0 1 0 4.5 4.5"/><path d="M 3 2.5 L 3 5.5 L 6 5.5"/></svg>`,
};
// opts (unit 7.21), for a replay that runs inside another page: { live, bar } to share that
// page's event source and top bar, { start } for the button's first label.
function bootDemo(kind, draw, plot, opts = {}) {
  const live = opts.live ?? new EventSource("/events"); // it reconnects by itself
  const bar = opts.bar ?? topBar("/demo/" + kind, live);
  let view = null, asked = 0;

  // The replay clock and the progress bar: every frame while a run is going.
  function progress() {
    const run = view.run, done = run && run.status === "done";
    const total = done ? run.seconds : view.expectedSeconds;
    const now = !run ? 0 : done ? run.seconds : Math.min(total, (Date.now() - Date.parse(run.startedAt)) / 1000);
    $("progress-fill").style.width = (total ? (now / total) * 100 : 0) + "%";
    const text = `${clock(now)} of ${done ? "" : "about "}${clock(total)}`;
    if ($("progress-clock").textContent !== text) $("progress-clock").textContent = text;
    return { now, total };
  }
  function header() {
    const run = view.run, done = run && run.status === "done", going = run && !done;
    const { now, total } = progress();
    $("progress").setAttribute("aria-valuenow", Math.round(now));
    $("progress").setAttribute("aria-valuemax", total);
    $("progress").setAttribute("aria-valuetext", $("progress-clock").textContent);
    $("progress-from").textContent = dayOf(Date.parse(view.from + "T00:00:00Z"));
    $("progress-to").textContent = dayOf(Date.parse(view.to + "T00:00:00Z"));
    const button = $("start"), label = view.busy ? `The ${view.busy} demo is running` : !run ? opts.start ?? "Start replay" : run.status === "starting" ? "Starting…" : going ? "Replaying…" : "Replay again";
    button.disabled = !!going || !!view.busy;
    if (button.dataset.label !== label) {
      button.dataset.label = label;
      button.innerHTML = (done ? BUTTON_ICONS.again : BUTTON_ICONS.play) + label;
    }
    if (!opts.bar) bar.gemini(!!going, going ? "Replaying real Gemini prices" : "Replay of real Gemini prices");
  }

  // --- The playhead (unit 7.10). The chart is drawn up to a moving point on the replayed days.
  // Between two posts it glides toward the hour of the next planned post, so it never stands
  // still; when the post lands it closes the rest of the gap in 350 ms and the value moves to
  // the new number in 450 ms. Only real posts set the value: the glide is the last value held.
  const anim = { runId: null, n: 0, fromT: 0, toT: 0, at: 0, dur: 0, fromBps: 0, toBps: 0 };
  const ease = (k) => 1 - (1 - k) * (1 - k);
  function position(now) {
    const run = view.run, since = now - anim.at;
    if (since < anim.dur) return { t: anim.fromT + (anim.toT - anim.fromT) * ease(since / anim.dur), bps: anim.fromBps, shown: anim.n - 1 };
    const bps = anim.fromBps + (anim.toBps - anim.fromBps) * ease(Math.min(1, (since - anim.dur) / 450));
    const next = run.plan[anim.n], endT = Date.parse(view.to + "T00:00:00Z") + 24 * 3600 * 1000;
    // How long posts have been taking in this run; before the second one, the planned gap.
    const at = run.published.map((p) => Date.parse(p.at)), gap = at.length > 1 ? (at.at(-1) - at[0]) / (at.length - 1) : view.intervalMs + 1000;
    const p = (since - anim.dur) / (next ? gap : 2500);
    const share = !next && run.status === "done" ? Math.min(1, p) : p < 1 ? 0.9 * p : 0.9 + 0.1 * (1 - Math.exp(1 - p)); // the last tenth slows down but never stops
    return { t: anim.toT + ((next ? Date.parse(next) : endT) - anim.toT) * share, bps, shown: anim.n };
  }
  function head() {
    const run = view.run, posts = run ? run.published : [];
    if (!posts.length) return null;
    const last = posts.at(-1), done = run.status === "done";
    // No motion: a finished run this page did not watch, or the reader asked for none.
    if (calm || (done && anim.runId !== run.runId)) return { t: done ? Date.parse(view.to + "T00:00:00Z") + 24 * 3600 * 1000 : Date.parse(last.time), bps: last.harmBps, shown: posts.length };
    const now = performance.now();
    if (anim.runId !== run.runId) Object.assign(anim, { runId: run.runId, n: 0 });
    if (posts.length > anim.n) {
      const from = anim.n ? position(now) : null;
      Object.assign(anim, { n: posts.length, fromT: from ? from.t : Date.parse(last.time), toT: Date.parse(last.time), at: now, dur: from ? 350 : 0, fromBps: from ? from.bps : last.harmBps, toBps: last.harmBps });
    }
    return position(now);
  }
  const moving = () => view && view.run && !calm && anim.runId === view.run.runId && (view.run.status !== "done" || performance.now() - anim.at < 4000);
  function frame() {
    if (view && view.run && view.run.status !== "done") progress();
    if (moving()) plot(view, head());
    requestAnimationFrame(frame);
  }

  function paint() {
    if (!view) return;
    header();
    draw(view);
    plot(view, head());
  }
  async function refresh() {
    const mine = ++asked;
    const next = await (await fetch(`/api/demo/${kind}`)).json();
    if (mine !== asked || next.error) return; // a newer answer is on its way, or the read failed
    view = next;
    paint();
  }
  $("start").onclick = async () => {
    $("start").disabled = true;
    const res = await fetch(`/api/demo/${kind}/start`, { method: "POST" });
    if (!res.ok) alert((await res.json()).error);
    refresh();
  };

  let timer;
  const soon = () => { clearTimeout(timer); timer = setTimeout(refresh, 200); };
  for (const type of ["demo", "oracle", "agent", "payment", "defi", "stream"]) live.addEventListener(type, soon);
  requestAnimationFrame(frame);
  addEventListener("resize", paint); // the charts are drawn in pixels
  document.fonts.ready.then(paint);
  window.show = (state) => { view = state; paint(); }; // for the screenshot script: draw any state
  return refresh();
}
