// wreads dashboard (UI only, React + htm, no build step).
// Sidebar of files on the left, the study view on the right, and a mode bar
// on top: Type-along, Mad libs, Speed read.
//
// Files come from three places, in this order:
//   1. loadFiles()  -> the backend, once it exists (returns null for now)
//   2. this browser -> files dropped on the landing page or here (IndexedDB)
//   3. SAMPLE_FILES -> built-in demo docs so the page is never empty
// Text is read in the browser (TXT/MD directly, PDF with pdf.js).

import React, { useState, useEffect, useRef, useMemo, useCallback } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import htm from "https://esm.sh/htm@3.1.1";
import { saveLocalFiles, listLocalFiles, removeLocalFile } from "./local-files.js";

const html = htm.bind(React.createElement);
const Frag = React.Fragment;

// ---------------------------------------------------------------------------
// BACKEND HOOKS: UI only for now.
// Replace these bodies when the server is ready. Returning null means
// "no backend yet, use what's in the browser".
// ---------------------------------------------------------------------------

/** List the user's files. Return [{ id, name, size }] or null. */
async function loadFiles() {
  // TODO(backend): fetch the logged-in user's files.
  return null;
}

/** Get the plain text for one file. Return a string, or null to read it in the browser. */
async function loadFileText(file) {
  // TODO(backend): return text the server already extracted.
  return null;
}

/** Called when a file is removed from the sidebar. */
async function deleteFile(file) {
  // TODO(backend): delete it on the server too.
}

// ---------------------------------------------------------------------------
// Sample docs (so there's always something to try)
// ---------------------------------------------------------------------------

const SAMPLE_FILES = [
  {
    id: "sample-cells",
    name: "Cell Biology - Chapter 3.txt",
    size: 1800,
    sample: true,
    text: `Every living thing is made of cells. A cell is the smallest unit that can carry out all the processes of life: taking in energy, getting rid of waste, growing, and making copies of itself.

Cells come in two broad types. Prokaryotic cells, like bacteria, are small and simple. Their genetic material floats freely inside the cell instead of being wrapped in a nucleus. Eukaryotic cells, like the ones in plants and animals, are larger and keep their DNA inside a membrane-bound nucleus.

Inside a eukaryotic cell are organelles, tiny structures that each do a specific job. The mitochondria turn glucose and oxygen into ATP, the molecule cells use for energy. Ribosomes read instructions from RNA and build proteins. The endoplasmic reticulum folds and transports those proteins, and the Golgi apparatus packages them to be shipped where they are needed.

Plant cells have a few extras. A rigid cell wall made of cellulose gives them structure, and chloroplasts capture sunlight to make sugar through photosynthesis. A large central vacuole stores water and helps the plant stay firm.

The cell membrane surrounds every cell. It is selectively permeable, which means it lets some substances pass through while keeping others out. This control is what allows a cell to keep a stable environment inside, a balance known as homeostasis.`,
  },
  {
    id: "sample-history",
    name: "World History - Industrial Revolution.md",
    size: 1500,
    sample: true,
    text: `# The Industrial Revolution

The Industrial Revolution began in Britain in the late 1700s and changed how people lived and worked. Before it, most goods were made by hand at home or in small workshops. Afterward, machines in large factories produced goods faster and cheaper than ever before.

## Why Britain?

Britain had several advantages. It had large deposits of coal and iron, a growing population that could work in factories, and a network of rivers and canals for moving goods. Banks were willing to lend money to people with new ideas, and the government protected inventions with patents.

## Key inventions

The steam engine, improved by James Watt in the 1770s, could power machines anywhere, not just next to rivers. The spinning jenny and the power loom transformed the textile industry. Later, railways connected cities and made it possible to move raw materials and finished products across the country in hours instead of days.

## Effects on society

Cities grew quickly as people moved from farms to find factory work. Living conditions were often crowded and unhealthy, and many workers, including children, worked long hours for low pay. Over time, these problems led to labour unions, new laws limiting working hours, and public health reforms.`,
  },
  {
    id: "sample-psych",
    name: "Intro to Psychology - Memory.pdf",
    size: 1300,
    sample: true,
    text: `Memory is the process of taking in information, storing it, and getting it back later. Psychologists often describe it in three stages: encoding, storage, and retrieval.

Encoding is how information gets into memory in the first place. We remember things better when we process them deeply, by thinking about what they mean, than when we only notice how they look or sound. This is why rereading a page often feels productive but does not stick.

Short-term memory holds a small amount of information for a few seconds. Without rehearsal, most of it fades. Long-term memory can hold a huge amount of information for years, and moving information there takes effort and repetition.

Retrieval practice, also called the testing effect, is one of the most reliable ways to strengthen long-term memory. Trying to recall information, even when it feels hard, makes it easier to remember next time. Spacing that practice out over several days works better than cramming it into one long session.

Generating information yourself, such as writing it out or filling in missing words, also improves memory. This is known as the generation effect, and it is part of why active study methods beat passive reading.`,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACCEPT = [".pdf", ".docx", ".txt", ".md"];
const extOf = (name) => (name.split(".").pop() || "").toLowerCase();
const fmtSize = (b) =>
  b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`;
const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

/** Make text typeable: straight quotes, plain dashes, tidy spaces. */
function normalize(t) {
  return t
    .replace(/\r\n?/g, "\n")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl")
    .replace(/[  -​  　\t]/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripMarkdown(t) {
  return t
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]{1,3}([^*_`~]+)[*_`~]{1,3}/g, "$1")
    .replace(/^>\s?/gm, "");
}

/** Split text into study-sized parts (~one paragraph each). */
function toChunks(text, max = 340) {
  const out = [];
  for (const para of text.split(/\n\s*\n/)) {
    const p = para.replace(/\n/g, " ").trim();
    if (!p) continue;
    if (p.length <= max) { out.push(p); continue; }
    let cur = "";
    for (const s of p.split(/(?<=[.!?])\s+/)) {
      if (s.length > max) {
        if (cur) { out.push(cur); cur = ""; }
        let piece = "";
        for (const w of s.split(" ")) {
          if ((piece + " " + w).trim().length > max) { out.push(piece.trim()); piece = w; }
          else piece = (piece + " " + w).trim();
        }
        if (piece) cur = piece;
      } else if ((cur + " " + s).trim().length > max) { out.push(cur); cur = s; }
      else cur = (cur + " " + s).trim();
    }
    if (cur) out.push(cur);
  }
  return out;
}

let pdfjsPromise = null;
function loadPdfJs() {
  const V = "4.10.38";
  pdfjsPromise ||= import(`https://cdn.jsdelivr.net/npm/pdfjs-dist@${V}/build/pdf.min.mjs`).then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${V}/build/pdf.worker.min.mjs`;
    return lib;
  });
  return pdfjsPromise;
}

async function pdfToText(blob) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    let page = "";
    for (const item of content.items) page += item.str + (item.hasEOL ? "\n" : "");
    pages.push(page);
  }
  return pages.join("\n\n");
}

/** Read a file's text in the browser. Throws an Error with a friendly message. */
async function extractInBrowser(file) {
  if (file.sample) return file.name.endsWith(".md") ? stripMarkdown(file.text) : file.text;
  const ext = extOf(file.name);
  if (!file.blob) throw new Error("This file isn't stored in this browser.");
  if (ext === "txt") return file.blob.text();
  if (ext === "md") return stripMarkdown(await file.blob.text());
  if (ext === "pdf") {
    const t = await pdfToText(file.blob);
    if (!t.replace(/\s/g, "")) throw new Error("This PDF has no selectable text. It's probably a scan or a photo.");
    return t;
  }
  if (ext === "docx") throw new Error("Word files can't be opened here yet. Save it as a PDF and drop that in instead.");
  throw new Error("This file type isn't supported.");
}

// ---------------------------------------------------------------------------
// Mode 1: Type-along
// ---------------------------------------------------------------------------

function TypeAlong({ fileId, chunks }) {
  const key = `wreads:type:${fileId}`;
  const [idx, setIdx] = useState(() => Math.min(store.get(key, 0), chunks.length - 1));
  const [typed, setTyped] = useState("");
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [, tick] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const target = chunks[idx] || "";
  const done = typed.length === target.length && target.length > 0;

  useEffect(() => { store.set(key, idx); }, [idx]);
  useEffect(() => {
    if (!start || done) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [start, done]);

  const go = (n) => {
    setIdx(Math.max(0, Math.min(chunks.length - 1, n)));
    setTyped(""); setStart(null); setEnd(null);
    setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
  };

  const onInput = (e) => {
    const v = e.target.value.slice(0, target.length);
    if (!start && v.length) setStart(Date.now());
    if (v.length === target.length) setEnd(Date.now());
    setTyped(v);
  };
  const onKeyDown = (e) => {
    if (e.key === "Enter" && done) { e.preventDefault(); if (idx < chunks.length - 1) go(idx + 1); }
  };

  let correct = 0;
  for (let i = 0; i < typed.length; i++) if (typed[i] === target[i]) correct++;
  const mins = start ? ((end || Date.now()) - start) / 60000 : 0;
  const wpm = mins > 0.03 ? Math.round(correct / 5 / mins) : 0;
  const acc = typed.length ? Math.round((correct / typed.length) * 100) : 100;

  const words = [];
  let pos = 0;
  target.split(/(?<= )/).forEach((chunk) => { if (chunk) { words.push({ chunk, from: pos }); pos += chunk.length; } });

  return html`<${Frag}>
    <div className="mode-head">
      <h2>Type-along</h2>
      <p>Type the text exactly as you see it. Mistakes show in red.</p>
    </div>
    <div className=${`card typecard ${focused ? "focused" : ""}`}>
      <div className="card-bar">
        <span className="grow">part ${idx + 1} of ${chunks.length}</span>
        ${start ? html`<${Frag}><span><b>${wpm}</b> wpm</span><span><b>${acc}</b>% acc</span><//>`
                : html`<span className="focus-hint">${focused ? "start typing" : "click the text to start"}</span>`}
      </div>
      <div className="progress"><i style=${{ width: `${(idx / chunks.length) * 100}%` }}></i></div>
      <p className="typetext" onClick=${() => inputRef.current.focus()} aria-hidden="true">
        ${words.map((w) => html`<span className="w" key=${w.from}>
          ${[...w.chunk].map((ch, k) => {
            const i = w.from + k;
            const cls = i < typed.length ? (typed[i] === target[i] ? "c ok" : "c bad") : "c";
            return html`<span key=${i} className=${cls + (i === typed.length ? " caret" : "")}>${ch === " " ? " " : ch}</span>`;
          })}
        </span>`)}
      </p>
      <input ref=${inputRef} className="ghost-input" value=${typed} onInput=${onInput} onKeyDown=${onKeyDown}
        onFocus=${() => setFocused(true)} onBlur=${() => setFocused(false)} readOnly=${done}
        autoComplete="off" autoCapitalize="off" spellCheck="false" aria-label="Type the text shown" />
      ${done && html`<div className="done-banner">
        <span>Part done: <b>${wpm} wpm</b> at <b>${acc}%</b>.</span>
        ${idx < chunks.length - 1
          ? html`<button className="btn primary small" onClick=${() => go(idx + 1)}>Next part ↵</button>`
          : html`<span><b>You wreaded the whole file.</b></span>`}
      </div>`}
      <div className="card-foot">
        <div className="pager">
          <button className="btn small" disabled=${idx === 0} onClick=${() => go(idx - 1)}>← Prev</button>
          <button className="btn small" disabled=${idx >= chunks.length - 1} onClick=${() => go(idx + 1)}>Next →</button>
        </div>
        <button className="linkish" onClick=${() => go(idx)}>Restart this part</button>
      </div>
    </div>
  <//>`;
}

// ---------------------------------------------------------------------------
// Mode 2: Mad libs
// ---------------------------------------------------------------------------

const STOP = new Set(("about above after again against because been before being below between both could " +
  "does doing down during each from further have having here hers herself himself into itself just more most " +
  "once only other ours over same should some such than that their theirs them themselves then there these " +
  "they this those through under until very were what when where which while whom will with would your yours " +
  "also often many much made make like used uses using can't don't it's").split(" "));
const LEVELS = { easy: { min: 7, rate: 0.22 }, medium: { min: 5, rate: 0.32 }, hard: { min: 4, rate: 0.5 } };

function rand(seed, i) {
  const x = Math.sin(seed * 9301 + i * 49297) * 233280;
  return x - Math.floor(x);
}

function buildLib(text, level, seed) {
  const { min, rate } = LEVELS[level];
  const parts = [];
  let eligible = [];
  text.split(/(\s+)/).forEach((tok) => {
    const m = tok.match(/^([^A-Za-z0-9]*)([A-Za-z0-9](?:[A-Za-z0-9'-]*[A-Za-z0-9])?)([^A-Za-z0-9]*)$/);
    if (m && m[2].length >= min && !STOP.has(m[2].toLowerCase()) && !/^\d+$/.test(m[2])) {
      eligible.push(parts.length);
      parts.push({ pre: m[1], word: m[2], post: m[3] });
    } else parts.push(tok);
  });
  let picked = eligible.filter((p, i) => rand(seed, i) < rate);
  if (!picked.length && eligible.length) picked = [eligible[Math.floor(rand(seed, 99) * eligible.length)]];
  const set = new Set(picked);
  return parts.map((p, i) => (typeof p === "string" ? p : set.has(i) ? { ...p, blank: true } : p.pre + p.word + p.post));
}

function MadLibs({ fileId, chunks }) {
  const key = `wreads:mad:${fileId}`;
  const [idx, setIdx] = useState(() => Math.min(store.get(key, 0), chunks.length - 1));
  const [level, setLevel] = useState(() => store.get("wreads:mad:level", "medium"));
  const [seed, setSeed] = useState(1);
  const [vals, setVals] = useState({});
  const [checked, setChecked] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => { store.set(key, idx); }, [idx]);
  useEffect(() => { store.set("wreads:mad:level", level); }, [level]);

  const parts = useMemo(() => buildLib(chunks[idx] || "", level, seed), [idx, level, seed, chunks]);
  const blanks = parts.map((p, i) => (typeof p === "object" ? i : -1)).filter((i) => i >= 0);
  const isRight = (i) => (vals[i] || "").trim().toLowerCase() === parts[i].word.toLowerCase();
  const score = blanks.filter(isRight).length;

  const reset = () => { setVals({}); setChecked(false); setRevealed(false); };
  const go = (n) => { setIdx(Math.max(0, Math.min(chunks.length - 1, n))); reset(); };

  return html`<${Frag}>
    <div className="mode-head">
      <h2>Mad libs</h2>
      <p>Fill in the missing words from memory, then check your answers.</p>
    </div>
    <div className="card">
      <div className="card-bar">
        <span className="grow">part ${idx + 1} of ${chunks.length}</span>
        <span className="seg" role="group" aria-label="Difficulty">
          ${Object.keys(LEVELS).map((l) => html`<button key=${l} className=${level === l ? "on" : ""}
            onClick=${() => { setLevel(l); reset(); }}>${l}</button>`)}
        </span>
        <span><b>${score}</b>/${blanks.length} right</span>
      </div>
      <div className="progress"><i style=${{ width: `${(idx / chunks.length) * 100}%` }}></i></div>
      <p className="madtext">
        ${parts.map((p, i) => {
          if (typeof p === "string") return html`<span key=${i}>${p}</span>`;
          const right = isRight(i);
          const cls = revealed || right ? "ok" : checked ? "wrong" : "";
          return html`<span key=${i}>${p.pre}<input
            className=${`blank ${cls}`}
            style=${{ width: `${Math.max(p.word.length, 3) + 1.5}ch` }}
            value=${revealed ? p.word : vals[i] || ""}
            placeholder=${"_".repeat(Math.min(p.word.length, 10))}
            readOnly=${revealed}
            aria-label=${`Blank, ${p.word.length} letters`}
            onInput=${(e) => setVals({ ...vals, [i]: e.target.value })}
            onKeyDown=${(e) => e.key === "Enter" && setChecked(true)}
          />${p.post}</span>`;
        })}
      </p>
      <div className="card-foot">
        <div className="pager">
          <button className="btn small" disabled=${idx === 0} onClick=${() => go(idx - 1)}>← Prev</button>
          <button className="btn small" disabled=${idx >= chunks.length - 1} onClick=${() => go(idx + 1)}>Next →</button>
        </div>
        <div className="pager">
          <button className="linkish" onClick=${() => { setSeed(seed + 1); reset(); }}>New blanks</button>
          <button className="linkish" onClick=${() => setRevealed(!revealed)}>${revealed ? "Hide answers" : "Show answers"}</button>
          <button className="btn primary small" onClick=${() => setChecked(true)}>Check</button>
        </div>
      </div>
      ${checked && !revealed && html`<div className="done-banner">
        <span>${score === blanks.length ? html`<${Frag}><b>All ${score} right.</b> Nice.<//>` : html`<${Frag}><b>${score} of ${blanks.length}</b> right. Red ones need another look.<//>`}</span>
        ${score === blanks.length && idx < chunks.length - 1 && html`<button className="btn primary small" onClick=${() => go(idx + 1)}>Next part</button>`}
      </div>`}
    </div>
  <//>`;
}

// ---------------------------------------------------------------------------
// Mode 3: Speed read
// ---------------------------------------------------------------------------

function pivotIndex(w) {
  const n = w.length;
  return n <= 1 ? 0 : n <= 5 ? 1 : n <= 9 ? 2 : n <= 13 ? 3 : 4;
}

function SpeedRead({ fileId, text }) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const key = `wreads:speed:${fileId}`;
  const [i, setI] = useState(() => Math.min(store.get(key, 0), Math.max(words.length - 1, 0)));
  const [playing, setPlaying] = useState(false);
  const [wpm, setWpm] = useState(() => store.get("wreads:speed:wpm", 300));

  useEffect(() => { store.set("wreads:speed:wpm", wpm); }, [wpm]);
  useEffect(() => { if (!playing) store.set(key, i); }, [playing, i]);

  useEffect(() => {
    if (!playing) return;
    if (i >= words.length - 1) { setPlaying(false); return; }
    const w = words[i];
    let f = 1;
    if (/[.!?]["')]*$/.test(w)) f = 2.2;
    else if (/[,;:]["')]*$/.test(w)) f = 1.5;
    if (w.length > 8) f *= 1.25;
    const id = setTimeout(() => setI((n) => n + 1), (60000 / wpm) * f);
    return () => clearTimeout(id);
  }, [playing, i, wpm, words]);

  useEffect(() => {
    const onKey = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.target.type !== "range") return;
      if (e.code === "Space") { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key === "ArrowLeft") { setPlaying(false); setI((n) => Math.max(0, n - 10)); }
      if (e.key === "ArrowRight") setI((n) => Math.min(words.length - 1, n + 10));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [words.length]);

  const w = words[i] || "";
  const p = pivotIndex(w);
  const finished = i >= words.length - 1 && !playing;
  const minsLeft = Math.ceil((words.length - i) / wpm);
  const ctxFrom = Math.max(0, i - 7);
  const ctx = words.slice(ctxFrom, i + 8);

  return html`<${Frag}>
    <div className="mode-head">
      <h2>Speed read</h2>
      <p>Words flash one at a time. Keep your eyes on the red letter.</p>
    </div>
    <div className="card">
      <div className="card-bar">
        <span className="grow">word ${i + 1} of ${words.length} · ~${minsLeft} min left</span>
        <span className="mono">space: play/pause · ← →: jump</span>
      </div>
      <div className="rsvp" aria-live="off">
        <span className="rsvp-guide top"></span>
        <div className="rsvp-word" aria-label=${w}>
          <span className="l">${w.slice(0, p)}</span><span className="p">${w[p] || ""}</span><span className="r">${w.slice(p + 1)}</span>
        </div>
        <span className="rsvp-guide bottom"></span>
      </div>
      <p className="rsvp-context">
        ${playing ? "" : ctx.map((x, k) => html`<span key=${k}>${ctxFrom + k === i ? html`<b style=${{ color: "var(--ink)" }}>${x}</b>` : x} </span>`)}
      </p>
      <input className="scrub" type="range" min="0" max=${Math.max(words.length - 1, 0)} value=${i}
        aria-label="Position in text" onInput=${(e) => { setPlaying(false); setI(+e.target.value); }} />
      <div className="card-foot">
        <div className="speed-controls">
          <button className="btn primary small" onClick=${() => { if (finished) setI(0); setPlaying(!playing); }}>
            ${playing ? "❚❚ Pause" : finished ? "↺ Again" : "▶ Play"}
          </button>
          <button className="btn small" onClick=${() => { setPlaying(false); setI(Math.max(0, i - 10)); }}>« Back 10</button>
          <button className="linkish" onClick=${() => { setPlaying(false); setI(0); }}>Start over</button>
        </div>
        <label>
          <span><b>${wpm}</b> wpm</span>
          <input type="range" min="100" max="800" step="25" value=${wpm} onInput=${(e) => setWpm(+e.target.value)} aria-label="Words per minute" />
        </label>
      </div>
    </div>
  <//>`;
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------

const MODES = [
  { id: "type", label: "Type-along" },
  { id: "madlibs", label: "Mad libs" },
  { id: "speed", label: "Speed read" },
];

function FileItem({ file, active, onOpen, onRemove }) {
  const ext = extOf(file.name);
  return html`
    <li className=${`file-item ${active ? "active" : ""}`}>
      <button className="file-btn" onClick=${onOpen} aria-current=${active ? "page" : undefined}>
        <span className=${`ext ${ext}`}>${ext}</span>
        <span className="file-text">
          <span className="file-name" title=${file.name}>${file.name.replace(/\.[^.]+$/, "")}</span>
          <span className="file-meta">${file.sample ? "sample" : fmtSize(file.size)}</span>
        </span>
      </button>
      <button className="file-del" aria-label=${`Remove ${file.name}`} title="Remove" onClick=${onRemove}>×</button>
    </li>
  `;
}

function App() {
  const [serverFiles, setServerFiles] = useState(null);
  const [localFiles, setLocalFiles] = useState([]);
  const [hiddenSamples, setHiddenSamples] = useState(() => store.get("wreads:hiddenSamples", []));
  const [activeId, setActiveId] = useState(() => new URLSearchParams(location.hash.slice(1)).get("file"));
  const [mode, setMode] = useState(() => store.get("wreads:mode", "type"));
  const [texts, setTexts] = useState({});
  const [sideOpen, setSideOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState("");
  const pickRef = useRef(null);
  const dragDepth = useRef(0);

  const refreshLocal = useCallback(async () => setLocalFiles(await listLocalFiles()), []);
  useEffect(() => {
    loadFiles().then((f) => f && setServerFiles(f)).catch(() => {});
    refreshLocal();
  }, []);
  useEffect(() => { store.set("wreads:mode", mode); }, [mode]);
  useEffect(() => { store.set("wreads:hiddenSamples", hiddenSamples); }, [hiddenSamples]);

  const mine = serverFiles || localFiles;
  const samples = SAMPLE_FILES.filter((s) => !hiddenSamples.includes(s.id));
  const all = [...mine, ...samples];
  const active = all.find((f) => f.id === activeId) || all[0] || null;

  // Load text for the active file.
  useEffect(() => {
    if (!active || texts[active.id]) return;
    setTexts((t) => ({ ...t, [active.id]: { status: "loading" } }));
    (async () => {
      try {
        const raw = (await loadFileText(active)) ?? (await extractInBrowser(active));
        const text = normalize(raw);
        setTexts((t) => ({ ...t, [active.id]: { status: "ready", text, chunks: toChunks(text) } }));
      } catch (err) {
        setTexts((t) => ({ ...t, [active.id]: { status: "error", error: err.message || "Couldn't read this file." } }));
      }
    })();
  }, [active && active.id]);

  useEffect(() => {
    if (active) history.replaceState(null, "", `#file=${encodeURIComponent(active.id)}`);
  }, [active && active.id]);

  // 1 / 2 / 3 switch modes.
  useEffect(() => {
    const onKey = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      const m = MODES[+e.key - 1];
      if (m) setMode(m.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const addFiles = async (list) => {
    const good = [...list].filter((f) => ACCEPT.some((x) => f.name.toLowerCase().endsWith(x)));
    const skipped = list.length - good.length;
    setNote(skipped ? `Skipped ${skipped} file${skipped > 1 ? "s" : ""}. Only PDF, DOCX, TXT and MD.` : "");
    if (!good.length) return;
    try {
      const saved = await saveLocalFiles(good);
      await refreshLocal();
      setActiveId(saved[0].id);
      setSideOpen(false);
    } catch (err) {
      setNote(err.message);
    }
  };

  const remove = async (file) => {
    if (file.sample) setHiddenSamples([...hiddenSamples, file.id]);
    else { await removeLocalFile(file.id); await deleteFile(file).catch(() => {}); await refreshLocal(); }
    if (active && active.id === file.id) setActiveId(null);
  };

  const open = (f) => { setActiveId(f.id); setSideOpen(false); };
  const state = active ? texts[active.id] : null;
  const ext = active ? extOf(active.name) : "";

  const dragProps = {
    onDragEnter: (e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); dragDepth.current++; setDragging(true); } },
    onDragOver: (e) => e.preventDefault(),
    onDragLeave: () => { dragDepth.current--; if (dragDepth.current <= 0) setDragging(false); },
    onDrop: (e) => { e.preventDefault(); dragDepth.current = 0; setDragging(false); addFiles(e.dataTransfer.files); },
  };

  let body;
  if (!active) {
    body = html`<div className="empty">
      <h2>Nothing to wread yet</h2>
      <p>Drop a PDF, TXT or Markdown file to get started.</p>
      <div className="drop-big" role="button" tabIndex="0" onClick=${() => pickRef.current.click()}
        onKeyDown=${(e) => (e.key === "Enter" || e.key === " ") && pickRef.current.click()}>
        <b>Drop files here</b> or click to browse
      </div>
      ${hiddenSamples.length > 0 && html`<p style=${{ marginTop: "1rem" }}><button className="linkish" onClick=${() => setHiddenSamples([])}>Bring back the sample files</button></p>`}
    </div>`;
  } else if (!state || state.status === "loading") {
    body = html`<p className="loading">Reading ${active.name}</p>`;
  } else if (state.status === "error") {
    body = html`<div className="notice"><h3>Can't open this one</h3><p>${state.error}</p></div>`;
  } else if (!state.chunks.length) {
    body = html`<div className="notice"><h3>This file looks empty</h3><p>There's no text in it to study.</p></div>`;
  } else if (mode === "type") {
    body = html`<${TypeAlong} key=${active.id} fileId=${active.id} chunks=${state.chunks} />`;
  } else if (mode === "madlibs") {
    body = html`<${MadLibs} key=${active.id} fileId=${active.id} chunks=${state.chunks} />`;
  } else {
    body = html`<${SpeedRead} key=${active.id} fileId=${active.id} text=${state.text} />`;
  }

  const wordCount = state && state.status === "ready" ? state.text.split(/\s+/).length : null;

  return html`
    <div className=${`app ${sideOpen ? "side-open" : ""}`}>
      <aside className="side" aria-label="Your files">
        <div className="side-top">
          <a className="logo" href="./" title="Back to home">w<span>reads</span></a>
          <button className="icon-btn menu-btn" aria-label="Close file list" onClick=${() => setSideOpen(false)}>✕</button>
        </div>
        <button className="new-btn" onClick=${() => pickRef.current.click()} ...${dragProps}>
          <span className="plus">+</span> New upload
        </button>
        <input ref=${pickRef} type="file" multiple accept=${ACCEPT.join(",")} hidden
          onChange=${(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <nav className="file-nav">
          ${mine.length > 0 && html`<${Frag}>
            <p className="side-label">// your files</p>
            <ul>${mine.map((f) => html`<${FileItem} key=${f.id} file=${f} active=${active && active.id === f.id} onOpen=${() => open(f)} onRemove=${() => remove(f)} />`)}</ul>
          <//>`}
          ${samples.length > 0 && html`<${Frag}>
            <p className="side-label">// samples</p>
            <ul>${samples.map((f) => html`<${FileItem} key=${f.id} file=${f} active=${active && active.id === f.id} onOpen=${() => open(f)} onRemove=${() => remove(f)} />`)}</ul>
          <//>`}
          ${note && html`<p className="side-label" style=${{ color: "var(--bad)" }}>${note}</p>`}
        </nav>
        <div className="side-foot">
          <span className="guest-pill"><i></i>guest · files stay in this browser</span>
          <a href="./#login"><b>Log in</b> to keep them everywhere →</a>
        </div>
      </aside>
      <div className="scrim" onClick=${() => setSideOpen(false)}></div>

      <main className=${`main ${dragging ? "dragging" : ""}`} ...${dragProps}>
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Open file list" onClick=${() => setSideOpen(true)}>☰</button>
          <div className="doc-title">
            <h1>${active ? active.name.replace(/\.[^.]+$/, "") : "Dashboard"}</h1>
            <p>${active ? [ext.toUpperCase(), active.sample ? "sample" : fmtSize(active.size), wordCount && `${wordCount} words`].filter(Boolean).join(" · ") : "no file open"}</p>
          </div>
          <nav className="modebar" role="tablist" aria-label="Study mode">
            ${MODES.map((m, k) => html`<button key=${m.id} role="tab" aria-selected=${mode === m.id}
              className=${mode === m.id ? "on" : ""} onClick=${() => setMode(m.id)}>
              ${m.label} <kbd>${k + 1}</kbd>
            </button>`)}
          </nav>
        </header>
        <section className="view"><div className="view-inner">${body}</div></section>
      </main>
    </div>
  `;
}

createRoot(document.getElementById("root")).render(html`<${App} />`);
