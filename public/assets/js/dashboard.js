// wreads dashboard (React + htm, no build step).
// Sidebar of files on the left, the study view on the right, and a mode bar
// on top: Type-along, Mad libs, Speed read.
//
// Files come from three places, in this order:
//   1. the backend -> saved uploads for the logged-in user
//   2. this browser -> guest uploads and older local files (IndexedDB)
//   3. SAMPLE_FILES -> built-in demo docs so the page is never empty
// New uploads use the server's extracted text; older local files use the browser.

import React, { useState, useEffect, useRef, useMemo, useCallback } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import htm from "https://esm.sh/htm@3.1.1";
import { saveGuestUploads, listLocalFiles, removeLocalFile } from "./local-files.js";
import { getCurrentUser, logoutUser } from "./auth-api.js";
import { uploadFiles, listUploads, loadUploadText, deleteUpload, savedUpload, rejectionMessage } from "./uploads-api.js";

const html = htm.bind(React.createElement);
const Frag = React.Fragment;

/** Get the plain text for one file. Return a string, or null to read it in the browser. */
async function loadFileText(file) {
  return file.server ? loadUploadText(file.id) : file.text ?? null;
}

// ---------------------------------------------------------------------------
// Summaries (Claude, via the PHP backend)
// ---------------------------------------------------------------------------

const BASE = (window.WREADS && window.WREADS.basePath) || "";
// False for guests: summarizing needs an account (the server enforces this too).
const CAN_SUMMARIZE = !!(window.WREADS && window.WREADS.canSummarize);
// Must match SummarizeController::safeId() so both sides agree on the file name.
const summaryKey = (id) => id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);

/** Notes already saved in public/summarized for this file, or null. */
async function loadSavedSummary(file) {
  try {
    const res = await fetch(`${BASE}/summarized/${summaryKey(file.id)}.txt`, { cache: "no-store" });
    const type = res.headers.get("content-type") || "";
    return res.ok && type.startsWith("text/plain") ? await res.text() : null;
  } catch {
    return null;
  }
}

/** Ask the server to summarize this text with Claude. Returns the notes. */
async function requestSummary(file, text) {
  let res;
  try {
    res = await fetch(`${BASE}/api/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: file.id, name: file.name, text }),
    });
  } catch {
    throw new Error("Couldn't reach the server. Is it still running?");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.summary) throw new Error((data && data.error) || "Summarizing failed. Try again.");
  return data.summary;
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

// --- PDF -> text -------------------------------------------------------------
// PDFs only store "draw this text at x,y". We rebuild lines from positions,
// read two-column pages column by column, find paragraphs from line spacing,
// drop repeated headers/footers and page numbers, and re-join hyphenated words.

const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

/** Group text pieces that share a baseline into lines, top to bottom. */
function groupLines(parts) {
  const lines = [];
  for (const p of [...parts].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((l) => Math.abs(l.y - p.y) < Math.max(l.h, p.h) * 0.5);
    if (line) { line.parts.push(p); line.h = Math.max(line.h, p.h); }
    else lines.push({ y: p.y, h: p.h, parts: [p] });
  }
  for (const l of lines) {
    l.parts.sort((a, b) => a.x - b.x);
    let text = "", prevEnd = null;
    for (const p of l.parts) {
      if (prevEnd !== null && p.x - prevEnd > l.h * 0.15 && !text.endsWith(" ") && !p.str.startsWith(" ")) text += " ";
      text += p.str;
      prevEnd = p.x + p.w;
    }
    l.text = text.replace(/\s+/g, " ").trim();
  }
  return lines.sort((a, b) => b.y - a.y);
}

/** Is this a two-column page? True when many rows have a wide empty gap down the middle. */
function isTwoColumn(lines, pageWidth) {
  if (!pageWidth) return false;
  const mid = pageWidth / 2;
  let split = 0, cross = 0;
  for (const l of lines) {
    if (l.parts.some((p) => p.x < mid && p.x + p.w > mid)) { cross++; continue; }
    const leftEnd = Math.max(...l.parts.filter((p) => p.x + p.w <= mid).map((p) => p.x + p.w), -Infinity);
    const rightStart = Math.min(...l.parts.filter((p) => p.x >= mid).map((p) => p.x), Infinity);
    if (rightStart - leftEnd > l.h * 1.5 && isFinite(leftEnd) && isFinite(rightStart)) split++;
  }
  return split >= 4 && split >= cross;
}

/** Turn pdf.js text items into ordered lines: [{ text, newPara }]. */
function pageToLines(items, pageWidth) {
  const parts = items
    .filter((it) => it.str && it.str.trim())
    .map((it) => ({
      str: it.str, x: it.transform[4], y: it.transform[5],
      w: it.width || 0, h: it.height || Math.abs(it.transform[3]) || 10,
    }));

  let ordered = groupLines(parts);
  if (isTwoColumn(ordered, pageWidth)) {
    // Read the whole left column, then the right one.
    const mid = pageWidth / 2;
    const left = groupLines(parts.filter((p) => p.x + p.w / 2 < mid));
    const right = groupLines(parts.filter((p) => p.x + p.w / 2 >= mid));
    ordered = [...left, ...right];
  }

  // Paragraph breaks: a bigger-than-usual gap, or jumping back up (new column).
  const gaps = [];
  for (let i = 1; i < ordered.length; i++) {
    const g = ordered[i - 1].y - ordered[i].y;
    if (g > 0) gaps.push(g);
  }
  const normal = median(gaps) || 12;
  return ordered.map((l, i) => {
    const g = i === 0 ? 0 : ordered[i - 1].y - l.y;
    return { text: l.text, newPara: i > 0 && (g <= 0 || g > normal * 1.45) };
  });
}

const PAGE_NUM = /^(page\s*)?(\d{1,4}|[ivxlc]{1,6})(\s*(of|\/)\s*\d{1,4})?$/i;
const lineKey = (t) => t.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();

/** Drop repeated headers/footers + page numbers, then join lines into paragraphs. */
function pagesToText(pages) {
  const EDGE = 2; // look at the first/last 2 lines of each page
  const counts = new Map();
  if (pages.length >= 3) {
    for (const lines of pages) {
      const seen = new Set();
      [...lines.slice(0, EDGE), ...lines.slice(-EDGE)].forEach((l) => seen.add(lineKey(l.text)));
      seen.forEach((k) => counts.set(k, (counts.get(k) || 0) + 1));
    }
  }
  const repeated = (t) => pages.length >= 3 && (counts.get(lineKey(t)) || 0) >= Math.max(2, pages.length * 0.5);

  const paras = [];
  pages.forEach((lines, pi) => {
    const kept = lines.filter((l, i) => {
      const atEdge = i < EDGE || i >= lines.length - EDGE;
      return !(atEdge && (PAGE_NUM.test(l.text) || repeated(l.text)));
    });
    kept.forEach((l, i) => {
      const last = paras[paras.length - 1];
      const continuesAcrossPage = i === 0 && pi > 0 && last && !/[.!?:"')]$/.test(last) && /^[a-z(]/.test(l.text);
      if (!last || (l.newPara && !continuesAcrossPage) || (i === 0 && !continuesAcrossPage)) {
        paras.push(l.text);
      } else if (/[A-Za-z]-$/.test(last) && /^[a-z]/.test(l.text)) {
        paras[paras.length - 1] = last.slice(0, -1) + l.text;   // re-join "photo-" + "synthesis"
      } else {
        paras[paras.length - 1] = last + " " + l.text;
      }
    });
  });
  return paras.join("\n\n");
}

async function pdfToText(blob) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { width } = page.getViewport({ scale: 1 });
    pages.push(pageToLines((await page.getTextContent()).items, width));
  }
  return pagesToText(pages);
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
// Keyboard shortcuts plumbing
// Each mode registers its own commands (for the command line) through
// useModeCommands(); `overlay` is true while the command line or the
// shortcuts sheet is open, so modes ignore keys then.
// ---------------------------------------------------------------------------

const ShortcutCtx = React.createContext({ cmdRef: { current: [] }, overlay: false });
const typingIn = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.target.type !== "range";
const hasMods = (e) => e.metaKey || e.ctrlKey || e.altKey;

function useModeCommands(list) {
  const { cmdRef } = React.useContext(ShortcutCtx);
  useEffect(() => { cmdRef.current = list; });
  useEffect(() => () => { cmdRef.current = []; }, []);
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
    if (e.key === "Tab") { e.preventDefault(); go(idx); }   // monkeytype-style restart
    if (e.key === "Enter" && done) { e.preventDefault(); if (idx < chunks.length - 1) go(idx + 1); }
  };

  const { overlay } = React.useContext(ShortcutCtx);
  useEffect(() => {
    const onKey = (e) => {
      if (overlay || hasMods(e)) return;
      // ← → always change part, even while typing.
      if (e.key === "ArrowRight") { e.preventDefault(); go(idx + 1); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(idx - 1); return; }
      if (typingIn(e)) return;
      const onPage = document.activeElement === document.body || !document.activeElement;
      if (e.key === "Tab" && onPage) { e.preventDefault(); go(idx); }          // restart (only when not on a button/link)
      if (e.key === "Enter" && onPage) { e.preventDefault(); inputRef.current.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, overlay, chunks.length]);

  useModeCommands([
    { label: "Restart this part", keys: "tab", run: () => go(idx) },
    { label: "Next part", keys: "→", run: () => go(idx + 1) },
    { label: "Previous part", keys: "←", run: () => go(idx - 1) },
    { label: "Back to the first part", run: () => go(0) },
    { label: "Start typing", keys: "enter", run: () => inputRef.current.focus() },
  ]);

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
                : html`<span className="focus-hint">${focused ? "start typing" : html`<${Frag}>click or press <kbd>enter</kbd> to start<//>`}</span>`}
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

// Mad libs blanks out KEY TERMS, not random words. Each word gets a score:
//   + repeats a lot in this file        (the topic words)
//   + not an everyday English word      ("mitochondria" beats "important")
//   + Capitalised mid-sentence / ACRONYM (names, places, ATP, DNA)
//   + used in a definition              ("X is ...", "called X", "known as X")
//   + longer words, a little
// The best-scoring words in each part are blanked. "New blanks" mixes in a
// bit of randomness so you get the next-best terms instead.

const STOP = new Set(("a an the and or but nor so yet for of to in on at by with from into onto upon about above " +
  "after again against because been before being below between both could does doing down during each further " +
  "have having here hers herself himself itself just more most once only other ours over same should some such " +
  "than that their theirs them themselves then there these they this those through under until very were what " +
  "when where which while whom will with would your yours also often many much made make like used uses using " +
  "can't don't it's is are was be it its as if not no can may might must shall our we you he she his her him " +
  "who whose why how all any few own out off too").split(" "));

// Everyday words: allowed, but pushed way down so real terms win.
const COMMON = new Set(("people person thing things something nothing everything anything someone everyone time times " +
  "year years day days week way ways part parts place places world life lives work works worked working hand hands " +
  "home house water food money group groups number numbers problem problems fact facts example examples case cases " +
  "point points area areas system systems kind kinds type types form forms level levels result results reason " +
  "reasons idea ideas change changes changed order lot side line lines end start started begin began began important " +
  "different large small great good better best bad little long short high low early late young old new first last " +
  "next second third every another still even never always sometimes usually really actually simply able possible " +
  "certain common general main major whole real true easy hard clear free full open close known called become " +
  "becomes became take takes took taken give gives gave given come comes came going goes went gone keep keeps kept " +
  "seem seems seemed find finds found think thinks thought know knows knew show shows showed shown help helps helped " +
  "need needs needed want wants wanted turn turns turned move moves moved live lived bring brings brought happen " +
  "happens happened include includes included including allow allows allowed provide provides provided continue " +
  "remain remains several various within without around across along among toward towards behind beyond however " +
  "therefore although though whether either neither rather quite almost enough itself instead later before after " +
  "during while about against between thing makes making getting gets things others called called based means " +
  "mean meant around today together tell told says said say saying ask asked carry carries carried hold holds held " +
  "process processes stage stages step steps rest stay stays light small large inside outside smallest largest biggest remember remembered information goods pass passes stable broad extras").split(" "));

const LEVELS = {
  easy:   { per: 38, min: 1 },  // ~1 blank per 38 words
  medium: { per: 20, min: 2 },
  hard:   { per: 11, min: 3 },
};

function rand(seed, i) {
  const x = Math.sin(seed * 9301 + i * 49297) * 233280;
  return x - Math.floor(x);
}

/** Count how often each word appears in the whole file. */
function wordFreq(text) {
  const freq = new Map();
  for (const m of text.toLowerCase().matchAll(/[a-z][a-z'-]*[a-z]/g)) freq.set(m[0], (freq.get(m[0]) || 0) + 1);
  return freq;
}

const WORD_RE = /^([^A-Za-z0-9]*)([A-Za-z0-9](?:[A-Za-z0-9'-]*[A-Za-z0-9])?)([^A-Za-z0-9]*)$/;

function scoreWord(word, ctx, freq) {
  const lower = word.toLowerCase();
  const acronym = /^[A-Z]{2,6}s?$/.test(word);
  if (STOP.has(lower) || /^\d+$/.test(word)) return -Infinity;
  if (!acronym && word.length < 4) return -Infinity;
  let score = 0;
  const n = freq.get(lower) || 1;
  score += Math.min(Math.log2(n), 2) * 0.7;                      // repeats in this file (capped,
                                                                 // so one topic word doesn't win every part)
  score += COMMON.has(lower) || COMMON.has(lower.replace(/s$/, "")) ? -3 : 1.5;  // not an everyday word
  score += Math.min(Math.max(word.length - 5, 0), 7) * 0.3;      // longer = more specific
  if (acronym) score += 2.5;
  else if (/^[A-Z]/.test(word) && !ctx.sentenceStart) score += 2;  // Name mid-sentence
  if (ctx.definition) score += 2;
  return score;
}

/** Split a part into text + blank objects. */
function buildLib(text, level, seed, freq) {
  const tokens = text.split(/(\s+)/);
  const parts = [];
  const cands = [];
  let sentenceStart = true;
  let wordIndex = 0;
  tokens.forEach((tok, ti) => {
    const m = tok.match(WORD_RE);
    if (!m || !tok.trim()) { parts.push(tok); return; }
    const [, pre, word, post] = m;
    const nextWord = (tokens[ti + 2] || "").toLowerCase().replace(/[^a-z]/g, "");
    const prev1 = (tokens[ti - 2] || "").toLowerCase().replace(/[^a-z]/g, "");
    const prev2 = (tokens[ti - 4] || "").toLowerCase().replace(/[^a-z]/g, "");
    const next2 = (tokens[ti + 4] || "").toLowerCase().replace(/[^a-z]/g, "");
    const definition = !/[,;:]$/.test(post) && (
      (["is", "are"].includes(nextWord) && ["a", "an", "the", "one", "called", "known"].includes(next2))
      || ["means", "refers", "describes"].includes(nextWord))
      || prev1 === "called" || (prev2 === "known" && prev1 === "as") || prev1 === "named";
    const score = scoreWord(word, { sentenceStart: sentenceStart && !pre.includes("("), definition }, freq);
    if (score > -Infinity) cands.push({ at: parts.length, word, score, wordIndex });
    parts.push({ pre, word, post });
    sentenceStart = /[.!?]["')]*$/.test(post);
    wordIndex++;
  });

  const { per, min } = LEVELS[level];
  const want = Math.max(min, Math.round(wordIndex / per));
  const jitter = seed > 1 ? 2.2 : 0;
  const ranked = cands
    .map((c, i) => ({ ...c, rank: c.score + rand(seed, i) * jitter }))
    .sort((a, b) => b.rank - a.rank);

  const chosen = new Set(), usedWords = new Set(), usedIdx = [];
  for (const c of ranked) {
    if (chosen.size >= want) break;
    const lower = c.word.toLowerCase().replace(/(es|s)$/, "");          // "cell" = "cells"
    if (usedWords.has(lower)) continue;                                   // same term once per part
    if (usedIdx.some((w) => Math.abs(w - c.wordIndex) < 3)) continue;   // keep blanks spread out
    chosen.add(c.at); usedWords.add(lower); usedIdx.push(c.wordIndex);
  }
  return parts.map((p, i) => (typeof p === "string" ? p : chosen.has(i) ? { ...p, blank: true } : p.pre + p.word + p.post));
}

function MadLibs({ fileId, chunks, text }) {
  const freq = useMemo(() => wordFreq(text), [text]);
  const key = `wreads:mad:${fileId}`;
  const [idx, setIdx] = useState(() => Math.min(store.get(key, 0), chunks.length - 1));
  const [level, setLevel] = useState(() => store.get("wreads:mad:level", "medium"));
  const [seed, setSeed] = useState(1);
  const [vals, setVals] = useState({});
  const [checked, setChecked] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => { store.set(key, idx); }, [idx]);
  useEffect(() => { store.set("wreads:mad:level", level); }, [level]);

  const parts = useMemo(() => buildLib(chunks[idx] || "", level, seed, freq), [idx, level, seed, chunks, freq]);
  const blanks = parts.map((p, i) => (typeof p === "object" ? i : -1)).filter((i) => i >= 0);
  const isRight = (i) => (vals[i] || "").trim().toLowerCase() === parts[i].word.toLowerCase();
  const score = blanks.filter(isRight).length;

  const reset = () => { setVals({}); setChecked(false); setRevealed(false); };
  const go = (n) => { setIdx(Math.max(0, Math.min(chunks.length - 1, n))); reset(); };

  const { overlay } = React.useContext(ShortcutCtx);
  useEffect(() => {
    const onKey = (e) => {
      if (overlay || hasMods(e)) return;
      // ← → always change part, even inside a blank.
      if (e.key === "ArrowRight") { e.preventDefault(); go(idx + 1); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(idx - 1); return; }
      if (typingIn(e)) return;
      if (e.key === "Enter") { e.preventDefault(); const first = document.querySelector(".blank"); first && first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, overlay, chunks.length]);

  useModeCommands([
    { label: "Check answers", keys: "enter", run: () => setChecked(true) },
    { label: revealed ? "Hide answers" : "Show answers", run: () => setRevealed(!revealed) },
    { label: "New blanks", run: () => { setSeed(seed + 1); reset(); } },
    ...Object.keys(LEVELS).map((l) => ({ label: `Difficulty: ${l}`, run: () => { setLevel(l); reset(); } })),
    { label: "Next part", keys: "→", run: () => go(idx + 1) },
    { label: "Previous part", keys: "←", run: () => go(idx - 1) },
  ]);

  return html`<${Frag}>
    <div className="mode-head">
      <h2>Mad libs</h2>
      <p>Key terms are blanked out. Fill them in from memory, then check.</p>
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

  const faster = () => setWpm((v) => Math.min(800, v + 25));
  const slower = () => setWpm((v) => Math.max(100, v - 25));
  const { overlay } = React.useContext(ShortcutCtx);
  useEffect(() => {
    const onKey = (e) => {
      if (overlay || typingIn(e) || hasMods(e)) return;
      if (e.code === "Space") { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key === "ArrowLeft") { e.preventDefault(); setPlaying(false); setI((n) => Math.max(0, n - 10)); }
      if (e.key === "ArrowRight") { e.preventDefault(); setI((n) => Math.min(words.length - 1, n + 10)); }
      if (e.key === "ArrowUp") { e.preventDefault(); faster(); }
      if (e.key === "ArrowDown") { e.preventDefault(); slower(); }
      if (e.key === "Home") { e.preventDefault(); setPlaying(false); setI(0); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [words.length, overlay]);

  useModeCommands([
    { label: playing ? "Pause" : "Play", keys: "space", run: () => setPlaying(!playing) },
    { label: "Faster (+25 wpm)", keys: "↑", run: faster },
    { label: "Slower (-25 wpm)", keys: "↓", run: slower },
    { label: "Back 10 words", keys: "←", run: () => { setPlaying(false); setI(Math.max(0, i - 10)); } },
    { label: "Forward 10 words", keys: "→", run: () => setI(Math.min(words.length - 1, i + 10)) },
    { label: "Start over", keys: "home", run: () => { setPlaying(false); setI(0); } },
  ]);

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
        <span className="mono">${wpm} wpm</span>
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
  { id: "type", label: "Type-along", hints: [["tab", "restart"], ["enter", "next part"], ["← →", "parts"]] },
  { id: "madlibs", label: "Mad libs", hints: [["tab", "next blank"], ["enter", "check"], ["← →", "parts"]] },
  { id: "speed", label: "Speed read", hints: [["space", "play / pause"], ["← →", "jump"], ["↑ ↓", "speed"]] },
];

const SIDE = { min: 200, max: 480, default: 280, step: 40, snapClosed: 120 };

const SHORTCUT_SHEET = [
  ["Anywhere", [
    ["esc", "command line (also ctrl + k)"], ["?", "this list"], ["1 2 3", "switch mode"],
    ["u", "new upload"], ["[", "show / hide file list"], ["{  }", "file list thinner / wider"],
    ["j  k", "next / previous file"],
  ]],
  ["Type-along", [
    ["enter", "start typing (or click the text)"], ["tab", "restart the part"],
    ["enter", "next part, once a part is done"], ["← →", "previous / next part (works while typing too)"],
  ]],
  ["Mad libs", [
    ["tab  shift+tab", "move between blanks"], ["enter", "check answers"], ["← →", "previous / next part (works inside a blank too)"],
  ]],
  ["Speed read", [
    ["space", "play / pause"], ["← →", "jump 10 words"], ["↑ ↓", "faster / slower"], ["home", "start over"],
  ]],
];

/** Monkeytype-style command line: type to filter, ↑ ↓ to pick, enter to run. */
function CommandLine({ commands, onClose }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  useEffect(() => { inputRef.current.focus(); }, []);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = commands.filter((c) => {
    const hay = `${c.group} ${c.label}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    const el = listRef.current && listRef.current.children[sel];
    el && el.scrollIntoView({ block: "nearest" });
  }, [sel]);
  const run = (c) => { onClose(); setTimeout(() => c.run(), 0); };
  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) { e.preventDefault(); setSel((s) => (s + 1) % Math.max(list.length, 1)); }
    else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) { e.preventDefault(); setSel((s) => (s - 1 + list.length) % Math.max(list.length, 1)); }
    else if (e.key === "Enter" && list[sel]) { e.preventDefault(); run(list[sel]); }
  };
  return html`
    <div className="overlay" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdline" role="dialog" aria-modal="true" aria-label="Command line">
        <input ref=${inputRef} className="cmd-input" value=${q} placeholder="Type a command…"
          onInput=${(e) => setQ(e.target.value)} onKeyDown=${onKeyDown}
          role="combobox" aria-expanded="true" aria-controls="cmd-list" autoComplete="off" spellCheck="false" />
        <ul className="cmd-list" id="cmd-list" role="listbox" ref=${listRef}>
          ${list.length === 0 && html`<li className="cmd-empty">No matching commands</li>`}
          ${list.map((c, k) => html`<li key=${c.group + c.label} role="option" aria-selected=${k === sel}
            className=${k === sel ? "on" : ""} onMouseEnter=${() => setSel(k)} onClick=${() => run(c)}>
            <span className="cmd-group">${c.group}</span>
            <span className="cmd-label">${c.label}</span>
            ${c.keys && html`<kbd>${c.keys}</kbd>`}
          </li>`)}
        </ul>
        <div className="cmd-foot"><span><kbd>↑</kbd><kbd>↓</kbd> pick</span><span><kbd>enter</kbd> run</span><span><kbd>esc</kbd> close</span></div>
      </div>
    </div>
  `;
}

/** The "?" sheet listing every shortcut. */
function ShortcutHelp({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" || e.key === "?") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return html`
    <div className="overlay" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
      <div className="help" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div className="help-head">
          <h2 id="help-title">Keyboard shortcuts</h2>
          <button className="icon-btn" aria-label="Close" onClick=${onClose}>✕</button>
        </div>
        <div className="help-grid">
          ${SHORTCUT_SHEET.map(([group, rows]) => html`<section key=${group}>
            <h3>${group}</h3>
            <dl>${rows.map(([k, d], i) => html`<${Frag} key=${i}><dt>${k.split(/\s{2,}/).map((x, j) => html`<kbd key=${j}>${x}</kbd>`)}</dt><dd>${d}</dd><//>`)}</dl>
          </section>`)}
        </div>
      </div>
    </div>
  `;
}

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
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [serverFiles, setServerFiles] = useState(null);
  const [localFiles, setLocalFiles] = useState([]);
  const [hiddenSamples, setHiddenSamples] = useState(() => store.get("wreads:hiddenSamples", []));
  const [activeId, setActiveId] = useState(() => new URLSearchParams(location.hash.slice(1)).get("file"));
  const [mode, setMode] = useState(() => store.get("wreads:mode", "type"));
  const [texts, setTexts] = useState({});
  const [summaries, setSummaries] = useState({}); // id -> { status: "checking" | "none" | "loading" | "ready" | "error", text, chunks, error }
  const [useSummary, setUseSummary] = useState(() => store.get("wreads:useSummary", {})); // id -> true when the summary is the text shown
  const [sideOpen, setSideOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => store.get("wreads:sideCollapsed", false));
  const [sideWidth, setSideWidth] = useState(() => store.get("wreads:sideWidth", SIDE.default));
  const [resizing, setResizing] = useState(false);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const cmdRef = useRef([]);
  const keyRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const uploadInProgress = useRef(false);

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((u) => { if (active) setUser(u); })
      .catch((err) => { if (active) setNote(err.message); })
      .finally(() => { if (active) setAuthLoading(false); });
    return () => { active = false; };
  }, []);

  const logout = async () => {
    setAuthLoading(true);
    try {
      await logoutUser();
      setUser(null);
      setServerFiles([]);
      setTexts({});
    } catch (err) {
      setNote(err.message);
    } finally {
      setAuthLoading(false);
    }
  };
  const pickRef = useRef(null);
  const dragDepth = useRef(0);

  const refreshLocal = useCallback(async () => setLocalFiles(await listLocalFiles()), []);
  useEffect(() => {
    refreshLocal();
  }, []);
  useEffect(() => {
    let active = true;
    if (user) {
      listUploads()
        .then((files) => { if (active) setServerFiles(files); })
        .catch((err) => { if (active) setNote(err.message); });
    } else {
      setServerFiles([]);
    }
    return () => { active = false; };
  }, [user]);
  useEffect(() => { store.set("wreads:mode", mode); }, [mode]);
  useEffect(() => { store.set("wreads:useSummary", useSummary); }, [useSummary]);
  useEffect(() => { store.set("wreads:hiddenSamples", hiddenSamples); }, [hiddenSamples]);
  useEffect(() => { store.set("wreads:sideCollapsed", collapsed); }, [collapsed]);
  useEffect(() => { if (!resizing) store.set("wreads:sideWidth", sideWidth); }, [sideWidth, resizing]);

  const mine = [...(serverFiles || []), ...localFiles];
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

  const readySummary = (id, raw) => {
    const text = normalize(stripMarkdown(raw));
    setSummaries((s) => ({ ...s, [id]: { status: "ready", text, chunks: toChunks(text) } }));
  };

  // Pick up notes that were already saved for the active file.
  useEffect(() => {
    if (!CAN_SUMMARIZE || !active || summaries[active.id]) return;
    const id = active.id;
    setSummaries((s) => ({ ...s, [id]: { status: "checking" } }));
    loadSavedSummary(active).then((raw) => {
      if (raw && raw.trim()) readySummary(id, raw);
      else setSummaries((s) => ({ ...s, [id]: { status: "none" } }));
    });
  }, [active && active.id]);

  const summarize = async () => {
    const st = active && texts[active.id];
    if (!st || st.status !== "ready") return;
    const id = active.id;
    setSummaries((s) => ({ ...s, [id]: { status: "loading" } }));
    try {
      readySummary(id, await requestSummary(active, st.text));
      setUseSummary((u) => ({ ...u, [id]: true }));
    } catch (err) {
      setSummaries((s) => ({ ...s, [id]: { status: "error", error: err.message } }));
    }
  };

  useEffect(() => {
    if (active) history.replaceState(null, "", `#file=${encodeURIComponent(active.id)}`);
  }, [active && active.id]);

  // Global shortcuts. keyRef always holds the latest handler so it sees fresh state.
  useEffect(() => {
    const onKey = (e) => keyRef.current && keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const addFiles = async (list) => {
    if (uploadInProgress.current || authLoading) return;
    const good = [...list].filter((f) => ACCEPT.some((x) => f.name.toLowerCase().endsWith(x)));
    const skipped = list.length - good.length;
    setNote(skipped ? `Skipped ${skipped} file${skipped > 1 ? "s" : ""}. Only PDF, DOCX, TXT and MD.` : "");
    if (!good.length) return;
    uploadInProgress.current = true;
    setUploading(true);
    try {
      const result = await uploadFiles(good);
      const saved = result.guest ? await saveGuestUploads(result.files) : result.files.map(savedUpload);
      if (result.guest) await refreshLocal();
      else setServerFiles((previous) => [...saved, ...(previous || [])]);
      if (saved.length) {
        setActiveId(saved[0].id);
        setSideOpen(false);
      }
      if (result.rejected.length) setNote(rejectionMessage(result.rejected));
    } catch (err) {
      setNote(err.message);
    } finally {
      uploadInProgress.current = false;
      setUploading(false);
    }
  };

  const remove = async (file) => {
    try {
      if (file.sample) setHiddenSamples([...hiddenSamples, file.id]);
      else if (file.server) {
        await deleteUpload(file.id);
        setServerFiles((previous) => previous.filter((item) => item.id !== file.id));
      } else {
        await removeLocalFile(file.id);
        await refreshLocal();
      }
      if (active && active.id === file.id) setActiveId(null);
    } catch (err) {
      setNote(err.message);
    }
  };

  const open = (f) => { setActiveId(f.id); setSideOpen(false); };
  const stepFile = (d) => {
    if (!all.length) return;
    const i = Math.max(0, all.findIndex((f) => active && f.id === active.id));
    open(all[(i + d + all.length) % all.length]);
  };
  const toggleSidebar = () => {
    if (window.matchMedia("(max-width: 860px)").matches) setSideOpen((v) => !v);
    else setCollapsed((v) => !v);
  };

  const clampW = (w) => Math.max(SIDE.min, Math.min(SIDE.max, Math.round(w)));
  const resizeBy = (d) => { setCollapsed(false); setSideWidth((w) => clampW(w + d)); };
  const resetWidth = () => { setCollapsed(false); setSideWidth(SIDE.default); };

  // Drag the sidebar edge. Dragging far enough left snaps it shut (like VS Code).
  const startResize = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setResizing(true);
    const startWidth = sideWidth;
    let snapped = false;
    const move = (ev) => {
      const x = ev.clientX;
      snapped = x < SIDE.snapClosed;
      if (snapped) setCollapsed(true);
      else { setCollapsed(false); setSideWidth(clampW(x)); }
    };
    const up = () => {
      if (snapped) setSideWidth(startWidth);   // reopen at the width it had before
      setResizing(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const resizerKeys = (e) => {
    const map = { ArrowLeft: -16, ArrowRight: 16 };
    if (map[e.key] !== undefined) { e.preventDefault(); e.stopPropagation(); resizeBy(map[e.key]); }
    else if (e.key === "Home") { e.preventDefault(); e.stopPropagation(); setSideWidth(SIDE.min); }
    else if (e.key === "End") { e.preventDefault(); e.stopPropagation(); setSideWidth(SIDE.max); }
    else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); resetWidth(); }
  };

  keyRef.current = (e) => {
    if (palette || help) return;                       // overlays handle their own keys
    const k = e.key.toLowerCase();
    if (e.key === "Escape" || ((e.ctrlKey || e.metaKey) && k === "k") || ((e.ctrlKey || e.metaKey) && e.shiftKey && k === "p")) {
      e.preventDefault(); setPalette(true); return;
    }
    if (typingIn(e) || hasMods(e)) return;
    if (e.key === "?") { e.preventDefault(); setHelp(true); }
    else if (MODES[+e.key - 1]) setMode(MODES[+e.key - 1].id);
    else if (k === "u") pickRef.current.click();
    else if (e.key === "[") toggleSidebar();
    else if (e.key === "{") resizeBy(-SIDE.step);
    else if (e.key === "}") resizeBy(SIDE.step);
    else if (k === "j") stepFile(1);
    else if (k === "k") stepFile(-1);
  };

  const modeInfo = MODES.find((m) => m.id === mode) || MODES[0];
  const commands = palette ? [
    ...cmdRef.current.map((c) => ({ group: modeInfo.label, ...c })),
    ...MODES.map((m, k) => ({ group: "Mode", label: m.label, keys: String(k + 1), run: () => setMode(m.id) })),
    { group: "Files", label: "New upload", keys: "u", run: () => pickRef.current.click() },
    { group: "Files", label: "Next file", keys: "j", run: () => stepFile(1) },
    { group: "Files", label: "Previous file", keys: "k", run: () => stepFile(-1) },
    ...all.map((f) => ({ group: "Open", label: f.name, run: () => open(f) })),
    { group: "View", label: collapsed ? "Show file list" : "Hide file list", keys: "[", run: toggleSidebar },
    { group: "View", label: "File list wider", keys: "}", run: () => resizeBy(SIDE.step) },
    { group: "View", label: "File list thinner", keys: "{", run: () => resizeBy(-SIDE.step) },
    { group: "View", label: "Reset file list width", run: resetWidth },
    { group: "Help", label: "Keyboard shortcuts", keys: "?", run: () => setHelp(true) },
    { group: "Go", label: "Home page", run: () => { location.href = "./"; } },
  ] : [];
  const state = active ? texts[active.id] : null;
  const summary = active ? summaries[active.id] : null;
  const hasSummary = !!summary && summary.status === "ready" && summary.chunks.length > 0;
  const showSummary = hasSummary && !!useSummary[active.id];
  // The text the study modes use: the original document or its summary.
  const shown = showSummary ? summary : state;
  const studyId = active ? (showSummary ? `${active.id}:summary` : active.id) : "";
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
    body = html`<${TypeAlong} key=${studyId} fileId=${studyId} chunks=${shown.chunks} />`;
  } else if (mode === "madlibs") {
    body = html`<${MadLibs} key=${studyId} fileId=${studyId} chunks=${shown.chunks} text=${shown.text} />`;
  } else {
    body = html`<${SpeedRead} key=${studyId} fileId=${studyId} text=${shown.text} />`;
  }

  const wordCount = shown && shown.status === "ready" ? shown.text.split(/\s+/).length : null;

  // Summarize button (top right of the view); becomes an Original / Summary toggle once notes exist.
  let sumBar = null;
  if (!CAN_SUMMARIZE) {
    // Guests see the button, but it can't be pressed.
    if (active && state && state.status === "ready" && state.chunks.length > 0) {
      sumBar = html`<div className="sum-bar">
        <button className="sum-btn locked" disabled title="Log in to summarize this file">
          <span aria-hidden="true">✦</span> Summarize <small>log in to use</small>
        </button>
      </div>`;
    }
  } else if (active && state && state.status === "ready" && state.chunks.length > 0 && summary) {
    const pick = (on) => setUseSummary((u) => ({ ...u, [active.id]: on }));
    if (hasSummary) {
      sumBar = html`<div className="sum-bar">
        <div className="sum-toggle" role="group" aria-label="Text to study">
          <button className=${showSummary ? "" : "on"} aria-pressed=${!showSummary} onClick=${() => pick(false)}>Original</button>
          <button className=${showSummary ? "on" : ""} aria-pressed=${showSummary} onClick=${() => pick(true)}><span aria-hidden="true">✦</span> Summary</button>
        </div>
      </div>`;
    } else if (summary.status !== "checking") {
      const busy = summary.status === "loading";
      sumBar = html`<div className="sum-bar">
        ${summary.status === "error" && html`<p className="sum-error" role="alert">${summary.error}</p>`}
        <button className=${`sum-btn ${busy ? "busy" : ""}`} disabled=${busy} onClick=${summarize}>
          <span aria-hidden="true">✦</span> ${busy ? "Summarizing" : summary.status === "error" ? "Try again" : "Summarize"}
        </button>
      </div>`;
    }
  }

  return html`<${ShortcutCtx.Provider} value=${{ cmdRef, overlay: palette || help }}>
    <div className=${`app ${sideOpen ? "side-open" : ""} ${collapsed ? "side-collapsed" : ""} ${resizing ? "resizing" : ""}`}
      style=${{ "--side-w": `${sideWidth}px` }}>
      <aside className="side" aria-label="Your files">
        <div className="side-top">
          <a className="logo" href="./" title="Back to home">w<span>reads</span></a>
          <button className="icon-btn side-toggle" aria-label="Hide file list" title="Hide file list  [" onClick=${toggleSidebar}>«</button>
        </div>
        <button className="new-btn" disabled=${uploading || authLoading} onClick=${() => pickRef.current.click()} ...${dragProps}>
          <span className="plus">+</span> ${uploading ? "Uploading…" : "New upload"}
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
        <div className="side-resizer" role="separator" aria-orientation="vertical" tabIndex="0"
          aria-label="Resize file list" aria-valuemin=${SIDE.min} aria-valuemax=${SIDE.max} aria-valuenow=${sideWidth}
          title="Drag to resize · double-click to reset"
          onPointerDown=${startResize} onDoubleClick=${resetWidth} onKeyDown=${resizerKeys}>
          ${resizing && html`<span className="side-size">${collapsed ? "hide" : `${sideWidth}px`}</span>`}
        </div>
        <div className="side-foot">
          <span className="guest-pill"><i></i>${authLoading ? "Checking session…" : user ? `Hi, ${user.username} · uploads saved to your account` : "guest · files stay in this browser"}</span>
          ${user
            ? html`<button className="linkish" disabled=${authLoading || uploading} onClick=${logout}>Log out</button>`
            : !authLoading && html`<a href="./#login"><b>Log in</b> or create an account →</a>`}
        </div>
      </aside>
      <div className="scrim" onClick=${() => setSideOpen(false)}></div>

      <main className=${`main ${dragging ? "dragging" : ""}`} ...${dragProps}>
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Show file list" title="Show file list  [" onClick=${toggleSidebar}>☰</button>
          <div className="doc-title">
            <h1>${active ? active.name.replace(/\.[^.]+$/, "") : "Dashboard"}</h1>
            <p>${active ? [ext.toUpperCase(), active.sample ? "sample" : fmtSize(active.size), showSummary && "summary", wordCount && `${wordCount} words`].filter(Boolean).join(" · ") : "no file open"}</p>
          </div>
          <nav className="modebar" role="tablist" aria-label="Study mode">
            ${MODES.map((m, k) => html`<button key=${m.id} role="tab" aria-selected=${mode === m.id}
              className=${mode === m.id ? "on" : ""} onClick=${() => setMode(m.id)}>
              ${m.label} <kbd>${k + 1}</kbd>
            </button>`)}
          </nav>
          <div className="keyhints" aria-label="Keyboard shortcuts">
            ${modeInfo.hints.map(([k, d]) => html`<span key=${k + d}><kbd>${k}</kbd> ${d}</span>`)}
            <span className="sep"></span>
            <span><kbd>esc</kbd> commands</span>
            <button className="keyhints-more" onClick=${() => setHelp(true)}><kbd>?</kbd> all shortcuts</button>
          </div>
        </header>
        <section className="view"><div className="view-inner">${sumBar}${body}</div></section>
      </main>
    </div>
    ${palette && html`<${CommandLine} commands=${commands} onClose=${() => setPalette(false)} />`}
    ${help && html`<${ShortcutHelp} onClose=${() => setHelp(false)} />`}
  <//>`;
}

createRoot(document.getElementById("root")).render(html`<${App} />`);
