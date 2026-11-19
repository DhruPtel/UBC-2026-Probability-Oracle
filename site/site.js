// Shared by the product site's pages (unit 11.10): the header and footer, formatting, the line
// chart, copy buttons and the snippet tabs. Every number comes from the server; a missing one is "—".
const $ = (id) => document.getElementById(id);
function el(tag, cls, ...kids) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.append(...kids.filter((k) => k !== null && k !== undefined));
  return e;
}
const SVG = (tag, attrs = {}) => {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};
const NONE = "—";
const SITE = location.origin;
const GITHUB = "https://github.com/DhruPtel/UBC-2026-Probability-Oracle";
const pct = (bps) => (bps === null || bps === undefined ? NONE : (Math.round(bps / 10) / 10).toString() + "%");
const money = (n) => (n === null || n === undefined ? NONE : "$" + Number(n).toFixed(2));
function ago(time) {
  if (!time) return NONE;
  const s = Math.max(0, (Date.now() - (typeof time === "number" ? time * 1000 : Date.parse(time))) / 1000);
  return s < 90 ? "just now" : s < 5400 ? Math.round(s / 60) + " min ago" : s < 129600 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " days ago";
}
function link(text, href) {
  const a = el("a", "", text);
  a.href = href;
  if (/^https?:/.test(href)) { a.target = "_blank"; a.rel = "noopener"; }
  return a;
}
async function get(path) {
  try {
    const res = await fetch(path), data = await res.json();
    return res.ok ? data : null;
  } catch { return null; }
}

function chrome(current) {
  const nav = el("nav");
  nav.setAttribute("aria-label", "Site");
  for (const [href, name] of [["/markets", "Markets"], ["/use", "Use it"], ["/insure", "Insure an agent"], [GITHUB, "GitHub"]]) {
    const a = link(name, href);
    if (href === current) a.setAttribute("aria-current", "page");
    nav.append(a);
  }
  const mark = link("Probability Oracle", "/"), demo = link("Open live demo", "/overview");
  mark.className = "wordmark";
  demo.className = "btn small";
  const top = el("header", "top", el("div", "wrap", mark, nav, demo));
  document.body.prepend(top);
  document.body.append(el("footer", "foot", el("div", "wrap", el("span", "", "Data provided by Gemini"), el("span", "", "Arc testnet"), link("GitHub", GITHUB), el("span", "", "UBC 2026"))));
}

// A copy button: "Copy code", then "Copied".
function copyButton(label, text) {
  const b = el("button", "btn quiet small", label);
  b.type = "button";
  b.onclick = async () => {
    try { await navigator.clipboard.writeText(typeof text === "function" ? text() : text); b.textContent = "Copied"; } catch { b.textContent = "Select and copy"; }
    setTimeout(() => { b.textContent = label; }, 1600);
  };
  return b;
}
function codeBox(text, label = "Copy code") {
  const pre = el("pre", text.includes("\n") ? "" : "oneline", text);
  pre.tabIndex = 0;
  return el("div", "codebox", pre, copyButton(label, text));
}

// Lines over time. series: [{ points: [{ t, v }], color, width, step }]; v in basis points.
// The first series is the one the tooltip reads.
function lineChart(svg, series, tip) {
  const w = svg.clientWidth || 600, h = svg.clientHeight || 150, pad = { l: 4, r: 44, t: 8, b: 20 };
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.replaceChildren();
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) { const t = SVG("text", { x: 4, y: h / 2 }); t.textContent = NONE; svg.append(t); return; }
  const t0 = Math.min(...all.map((p) => p.t)), t1 = Math.max(...all.map((p) => p.t));
  let lo = Math.min(...all.map((p) => p.v)), hi = Math.max(...all.map((p) => p.v));
  if (hi - lo < 400) { lo -= 200; hi += 200; }
  lo = Math.max(0, lo - (hi - lo) * 0.08); hi = Math.min(10000, hi + (hi - lo) * 0.08);
  const x = (t) => pad.l + ((t - t0) / (t1 - t0 || 1)) * (w - pad.l - pad.r), y = (v) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (h - pad.t - pad.b);
  for (const v of [lo, hi]) {
    svg.append(SVG("line", { x1: pad.l, x2: w - pad.r, y1: y(v), y2: y(v), stroke: "#DDE1E4", "stroke-width": 1 }));
    const label = SVG("text", { x: w - pad.r + 6, y: y(v) + 4 });
    label.textContent = Math.round(v / 100) + "%";
    svg.append(label);
  }
  const day = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const a = SVG("text", { x: pad.l, y: h - 4 }), b = SVG("text", { x: w - pad.r, y: h - 4, "text-anchor": "end" });
  a.textContent = day(t0); b.textContent = day(t1);
  svg.append(a, b);
  for (const s of [...series].reverse()) {
    if (!s.points.length) continue;
    let d = "";
    s.points.forEach((p, i) => { d += i === 0 ? `M${x(p.t)} ${y(p.v)}` : s.step ? `H${x(p.t)}V${y(p.v)}` : `L${x(p.t)} ${y(p.v)}`; });
    if (s.step) d += `H${x(t1)}`;
    svg.append(SVG("path", { d, fill: "none", stroke: s.color, "stroke-width": s.width ?? 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  }
  if (!tip) return;
  const dot = SVG("circle", { r: 4, fill: "#fff", stroke: "#1C2126", "stroke-width": 2, visibility: "hidden" });
  svg.append(dot);
  const read = series.find((s) => s.points.length) ?? series[0];
  svg.onpointermove = (e) => {
    const box = svg.getBoundingClientRect(), px = ((e.clientX - box.left) / box.width) * w;
    const p = read.points.reduce((best, q) => (Math.abs(x(q.t) - px) < Math.abs(x(best.t) - px) ? q : best));
    dot.setAttribute("cx", x(p.t)); dot.setAttribute("cy", y(p.v)); dot.setAttribute("visibility", "visible");
    tip.hidden = false;
    tip.textContent = `${pct(p.v)} · ${new Date(p.t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" })}`;
    tip.style.left = (x(p.t) / w) * box.width + "px"; tip.style.top = (y(p.v) / h) * box.height + "px";
  };
  svg.onpointerleave = () => { dot.setAttribute("visibility", "hidden"); tip.hidden = true; };
}
// A small line with no axes, for a table row.
function spark(values) {
  const svg = SVG("svg", { class: "spark", viewBox: "0 0 120 30", "aria-hidden": "true" });
  if (values.length < 2) return svg;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  svg.append(SVG("path", { d: values.map((v, i) => `${i ? "L" : "M"}${(i / (values.length - 1)) * 118 + 1} ${27 - ((v - lo) / span) * 24}`).join(""), fill: "none", stroke: "#59626A", "stroke-width": 1.5 }));
  return svg;
}

// The three ways to read, as tabs. `into` gets the tab row and the code under it.
function snippetTabs(into, ctx, start = "Contract") {
  let which = start;
  const kinds = { Contract: () => [codeBox(snippets.contract(ctx()))], API: () => [codeBox(snippets.api(ctx()))], Agent: () => agentBlocks(ctx().site) };
  const draw = () => {
    const tabs = el("div", "tabs");
    tabs.setAttribute("role", "tablist");
    for (const name of Object.keys(kinds)) {
      const b = el("button", "", name);
      b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(name === which));
      b.onclick = () => { which = name; draw(); };
      tabs.append(b);
    }
    into.replaceChildren(tabs, ...kinds[which]());
  };
  draw();
  return { redraw: draw, show: (name) => { which = name; draw(); } };
}
// The MCP config for each client, then the six tools.
function agentBlocks(site) {
  const out = [];
  for (const [client, text] of Object.entries(snippets.agent({ site }))) out.push(el("p", "muted say-plain", `${client}: ${AGENT_FILES[client].replace(/^R/, "r")}`), codeBox(text, "Copy"));
  const list = el("ul", "tools");
  for (const [name, what] of TOOLS) list.append(el("li", "", el("code", "", name), el("span", "", what)));
  out.push(list);
  return out;
}

// The last real cover bought at the desk, from the desk's own record.
function lastCover(desk) {
  let best = null;
  for (const a of desk?.agents ?? []) for (const l of a.lines ?? []) if (l.step === "buy_cover" && l.data?.order && (!best || l.ts > best.line.ts)) best = { agent: a, line: l, order: l.data.order };
  return best;
}
function receipt(cover) {
  const row = (k, v, cls) => [el("dt", cls, k), el("dd", cls, v)];
  const dl = el("dl");
  if (!cover) { dl.append(...row("Cover", NONE)); return el("div", "receipt", dl); }
  const { agent, line, order } = cover;
  dl.append(
    ...row("Agent holds", `${money(agent.valueUsd)} of ${agent.asset}`),
    ...row("Threat", order.risk),
    ...row("Contracts", `${order.contracts} at ${money(order.price)}`),
    ...row("Pays if it happens", money(order.payoutUsd)),
    ...row("Premium, in USDC on Arc", money(order.premiumUsdc), "total"),
    ...row("Transaction", line.txUrl ? link(ago(line.ts), line.txUrl) : NONE),
  );
  return el("div", "receipt", dl);
}
