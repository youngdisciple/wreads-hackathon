// wreads landing page (React, no build step).
// React + htm are loaded as ES modules from esm.sh, so this runs as-is on XAMPP.
// htm lets us write JSX-like markup in tagged template literals: html`<div>...</div>`.

import React, { useState, useEffect, useRef } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import htm from "https://esm.sh/htm@3.1.1";
import { saveGuestUploads } from "./local-files.js";
import { registerUser, loginUser, getCurrentUser, logoutUser } from "./auth-api.js";
import { uploadFiles, rejectionMessage } from "./uploads-api.js";
import { useTheme } from "./theme.js";

const html = htm.bind(React.createElement);
const Frag = React.Fragment;
const BASE = (window.WREADS && window.WREADS.basePath) || "";
const DASHBOARD_URL = `${BASE}/dashboard`;

const fmtSize = (b) =>
  b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;

/* ------------------------------------------------------------------ */
/* Type-along demo (the monkeytype-style box in the hero)              */
/* ------------------------------------------------------------------ */

const DEMO_TEXT =
  "wreading is the act of writing and reading at the same time. type this line and watch it stick.";

function TypeDemo() {
  const [typed, setTyped] = useState("");
  const [mode, setMode] = useState("auto"); // auto | user | done
  const [start, setStart] = useState(null);
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef(null);

  // Ghost typist until the visitor clicks in.
  useEffect(() => {
    if (mode !== "auto") return;
    let i = typed.length;
    const id = setInterval(() => {
      i += 1;
      if (i > DEMO_TEXT.length + 18) i = 0; // pause at the end, then loop
      setTyped(DEMO_TEXT.slice(0, Math.min(i, DEMO_TEXT.length)));
    }, 65);
    return () => clearInterval(id);
  }, [mode]);

  useEffect(() => {
    if (mode !== "user") return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [mode]);

  const takeOver = () => {
    if (mode !== "user") {
      setMode("user");
      setTyped("");
      setStart(null);
    }
    inputRef.current && inputRef.current.focus();
  };

  const onInput = (e) => {
    const v = e.target.value.slice(0, DEMO_TEXT.length);
    if (!start && v.length) setStart(Date.now());
    setTyped(v);
    if (v.length === DEMO_TEXT.length) setMode("done");
  };

  const restart = () => {
    setTyped("");
    setStart(null);
    setMode("user");
    setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
  };

  let correct = 0;
  for (let i = 0; i < typed.length; i++) if (typed[i] === DEMO_TEXT[i]) correct++;
  const minutes = start ? ((mode === "done" ? now : Date.now()) - start) / 60000 : 0;
  const wpm = minutes > 0.02 ? Math.round(correct / 5 / minutes) : 0;
  const acc = typed.length ? Math.round((correct / typed.length) * 100) : 100;

  // Split into words so lines wrap cleanly; keep global char indices.
  const words = [];
  let idx = 0;
  DEMO_TEXT.split(/(?<= )/).forEach((chunk) => {
    if (!chunk) return;
    words.push({ chunk, from: idx });
    idx += chunk.length;
  });

  const charClass = (i) => {
    if (i < typed.length) return typed[i] === DEMO_TEXT[i] ? "c ok" : "c bad";
    return "c";
  };

  return html`
    <div className=${`typebox ${mode}`} onClick=${takeOver} role="group" aria-label="Typing demo">
      <div className="typebox-bar">
        <span className="dots"><i></i><i></i><i></i></span>
        <span className="file">bio-notes.pdf · page 1</span>
        <span className="stats">
          ${mode === "auto"
            ? html`<span className="hint">click to try it</span>`
            : html`<${Frag}><span><b>${wpm}</b> wpm</span><span><b>${acc}</b>% acc</span><//>`}
        </span>
      </div>
      <p className="typetext" aria-hidden="true">
        ${words.map(
          (w) => html`<span className="w" key=${w.from}>
            ${[...w.chunk].map((ch, k) => {
              const i = w.from + k;
              return html`<span key=${i} className=${charClass(i) + (i === typed.length ? " caret" : "")}>${ch === " " ? " " : ch}</span>`;
            })}
          </span>`
        )}
        ${typed.length === DEMO_TEXT.length ? html`<span className="c caret end"> </span>` : null}
      </p>
      <input
        ref=${inputRef}
        className="ghost-input"
        value=${mode === "auto" ? "" : typed}
        onInput=${onInput}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck="false"
        aria-label="Type the sentence shown"
        disabled=${mode === "done"}
      />
      ${mode === "done" &&
      html`<div className="typebox-done">
        <span>Nice. <b>${wpm} wpm</b> at <b>${acc}%</b>. Now picture that with your actual notes.</span>
        <button className="btn small" onClick=${(e) => { e.stopPropagation(); restart(); }}>Again</button>
      </div>`}
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/* Mad-libs demo                                                       */
/* ------------------------------------------------------------------ */

const LIB = [
  "The ", { a: "mitochondria" }, " is the ", { a: "powerhouse" }, " of the cell. It turns glucose into ",
  { a: "ATP" }, ", the energy every cell runs on.",
];

function MadLibsDemo() {
  const blanks = LIB.filter((p) => typeof p !== "string");
  const [vals, setVals] = useState(blanks.map(() => ""));
  const [revealed, setRevealed] = useState(false);
  let b = -1;
  const done = blanks.filter((p, i) => vals[i].trim().toLowerCase() === p.a.toLowerCase()).length;

  return html`
    <div className="madlib">
      <p>
        ${LIB.map((part, k) => {
          if (typeof part === "string") return html`<span key=${k}>${part}</span>`;
          b += 1;
          const i = b;
          const ok = vals[i].trim().toLowerCase() === part.a.toLowerCase();
          return html`<input
            key=${k}
            className=${`blank ${ok ? "ok" : vals[i] ? "trying" : ""}`}
            style=${{ width: `${Math.max(part.a.length, 4) + 1.5}ch` }}
            value=${revealed ? part.a : vals[i]}
            placeholder=${"_".repeat(Math.min(part.a.length, 8))}
            aria-label=${`Blank ${i + 1}`}
            onInput=${(e) => setVals(vals.map((v, j) => (j === i ? e.target.value : v)))}
            readOnly=${revealed}
          />`;
        })}
      </p>
      <div className="madlib-foot">
        <span className="mono">${revealed ? "answers shown" : `${done}/${blanks.length} filled in right`}</span>
        <button className="linkish" onClick=${() => setRevealed(!revealed)}>
          ${revealed ? "Hide answers" : "Show answers"}
        </button>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/* Guest drag & drop                                                   */
/* ------------------------------------------------------------------ */

const ACCEPT = [".pdf", ".docx", ".txt", ".md"];

function DropZone({ user, onNeedAccount }) {
  const [files, setFiles] = useState([]);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState(null); // {kind, msg}
  const [busy, setBusy] = useState(false);
  const depth = useRef(0);
  const pickRef = useRef(null);

  const addFiles = (list) => {
    const incoming = [...list];
    const good = incoming.filter((f) => ACCEPT.some((ext) => f.name.toLowerCase().endsWith(ext)));
    const bad = incoming.length - good.length;
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...good.filter((f) => !seen.has(f.name + f.size))];
    });
    setStatus(bad ? { kind: "warn", msg: `Skipped ${bad} file${bad > 1 ? "s" : ""}. Only PDF, DOCX, TXT and MD for now.` } : null);
  };

  const onDrop = (e) => {
    e.preventDefault();
    depth.current = 0;
    setOver(false);
    addFiles(e.dataTransfer.files);
  };

  const upload = async () => {
    if (!files.length || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await uploadFiles(files);
      const saved = result.guest ? await saveGuestUploads(result.files) : result.files;
      const dashboard = saved.length ? `${DASHBOARD_URL}#file=${encodeURIComponent(saved[0].id)}` : null;
      if (result.rejected.length) {
        setFiles((previous) => previous.filter((file) => result.rejected.some((item) => item.name === file.name)));
        setStatus({ kind: saved.length ? "warn" : "err", msg: rejectionMessage(result.rejected), dashboard });
        return;
      }
      setStatus({ kind: "ok", msg: "Opening your dashboard…" });
      window.location.href = dashboard || DASHBOARD_URL;
    } catch (err) {
      setStatus({ kind: "err", msg: err.message });
    } finally {
      setBusy(false);
    }
  };

  return html`
    <div className="drop-wrap">
      <div
        className=${`dropzone ${over ? "over" : ""} ${files.length ? "has-files" : ""}`}
        onDragEnter=${(e) => { e.preventDefault(); depth.current++; setOver(true); }}
        onDragOver=${(e) => e.preventDefault()}
        onDragLeave=${() => { depth.current--; if (depth.current <= 0) setOver(false); }}
        onDrop=${onDrop}
        onClick=${() => pickRef.current.click()}
        onKeyDown=${(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pickRef.current.click())}
        role="button"
        tabIndex="0"
        aria-label="Drop files here or click to choose files"
      >
        <input
          ref=${pickRef}
          type="file"
          multiple
          accept=${ACCEPT.join(",")}
          hidden
          onChange=${(e) => { addFiles(e.target.files); e.target.value = ""; }}
        />
        <div className="drop-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="48" height="48"><path d="M12 6h16l10 10v26H12z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/><path d="M28 6v10h10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/><path d="M25 36V22m-6 6 6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <p className="drop-title">${over ? "Let go to add them" : "Drop your PDFs and notes here"}</p>
        <p className="drop-sub">or <u>browse your files</u> · PDF, DOCX, TXT, MD · up to 20 MB each</p>
      </div>

      ${files.length > 0 &&
      html`<ul className="file-list">
        ${files.map(
          (f, i) => html`<li key=${f.name + f.size}>
            <span className="ext">${f.name.split(".").pop()}</span>
            <span className="fname">${f.name}</span>
            <span className="fsize">${fmtSize(f.size)}</span>
            <button className="x" aria-label=${`Remove ${f.name}`} onClick=${() => setFiles(files.filter((_, j) => j !== i))}>×</button>
          </li>`
        )}
      </ul>`}

      <div className="drop-actions">
        <button className="btn primary" disabled=${!files.length || busy} onClick=${upload}>
          ${busy ? "Uploading…" : user ? "Start wreading" : "Start wreading as a guest"}
        </button>
        ${!user &&
        html`<span className="muted">Guest files stay in this browser only. <button className="linkish" onClick=${onNeedAccount}>Make an account</button> to keep them.</span>`}
      </div>
      ${status && html`<p className=${`status ${status.kind}`} role="status">${status.msg}
        ${status.dashboard && html` <a href=${status.dashboard}>Open uploaded files →</a>`}
      </p>`}
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/* Login / sign-up modal                                               */
/* ------------------------------------------------------------------ */

function AuthModal({ tab, setTab, onClose, onAuthed }) {
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const firstRef = useRef(null);

  useEffect(() => {
    setErr("");
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    firstRef.current && firstRef.current.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [tab]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      const user =
        tab === "signup"
          ? await registerUser(form)
          : await loginUser({ email: form.email, password: form.password });
      onAuthed(user);
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  };

  return html`
    <div className="modal-backdrop" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="x modal-x" aria-label="Close" onClick=${onClose}>×</button>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected=${tab === "login"} className=${tab === "login" ? "on" : ""} onClick=${() => setTab("login")}>Log in</button>
          <button role="tab" aria-selected=${tab === "signup"} className=${tab === "signup" ? "on" : ""} onClick=${() => setTab("signup")}>Create account</button>
        </div>
        <h2 id="auth-title">${tab === "signup" ? "Keep your wreads." : "Welcome back."}</h2>
        <p className="muted">${tab === "signup" ? "Save your files and pick up where you left off." : "Log in to see your saved files."}</p>
        <form onSubmit=${submit}>
          ${tab === "signup" &&
          html`<label>Username<input ref=${firstRef} required minLength="3" maxLength="30" value=${form.username} onInput=${set("username")} autoComplete="username" /></label>`}
          <label>Email<input ref=${tab === "login" ? firstRef : null} type="email" required value=${form.email} onInput=${set("email")} autoComplete="email" /></label>
          <label>Password<input type="password" required minLength=${tab === "signup" ? 8 : 1} value=${form.password} onInput=${set("password")} autoComplete=${tab === "signup" ? "new-password" : "current-password"} /></label>
          ${err && html`<p className="status err">${err}</p>`}
          <button className="btn primary wide" disabled=${busy}>${busy ? "One sec…" : tab === "signup" ? "Create account" : "Log in"}</button>
        </form>
        <p className="muted small center">
          ${tab === "signup" ? "Already have one? " : "New here? "}
          <button className="linkish" onClick=${() => setTab(tab === "signup" ? "login" : "signup")}>
            ${tab === "signup" ? "Log in" : "Create an account"}
          </button>
          ${" · or just "} <button className="linkish" onClick=${onClose}>keep going as a guest</button>
        </p>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function App() {
  const [theme, , , toggleTheme] = useTheme();
  const [user, setUser] = useState(null);
  const [authTab, setAuthTab] = useState(null); // null | "login" | "signup"
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((u) => { if (active) setUser(u); })
      .catch((err) => { if (active) setAuthError(err.message); })
      .finally(() => { if (active) setAuthLoading(false); });
    return () => { active = false; };
  }, []);

  // The dashboard links to "#login" to open the log-in box.
  useEffect(() => { if (location.hash === "#login") setAuthTab("login"); }, []);
  const logout = async () => {
    setAuthLoading(true);
    setAuthError("");
    try {
      await logoutUser();
      setUser(null);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  return html`<${Frag}>
    <header className="nav">
      <a className="logo" href="#top" aria-label="wreads home">w<span>reads</span><i className="logo-caret"></i></a>
      <nav className="nav-links" aria-label="Sections">
        <a href="#what">What is it</a>
        <a href="#how">How it works</a>
        <a href="#try">Try it</a>
        <a href=${DASHBOARD_URL}>Dashboard</a>
      </nav>
      <div className="nav-auth">
        <button className="btn ghost theme-btn" onClick=${toggleTheme}
          aria-label=${theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title=${theme === "dark" ? "Light mode" : "Dark mode"}>${theme === "dark" ? "☀" : "☾"}</button>
        ${user
          ? html`<${Frag}><span className="hello">Hi, <b>${user.username}</b></span><button className="btn ghost" disabled=${authLoading} onClick=${logout}>Log out</button><//>`
          : html`<${Frag}><button className="btn ghost" disabled=${authLoading} onClick=${() => setAuthTab("login")}>Log in</button>
                 <button className="btn primary" disabled=${authLoading} onClick=${() => setAuthTab("signup")}>Sign up</button><//>`}
      </div>
    </header>

    <main id="top">
      ${authError && html`<p className="status err" role="alert">${authError}</p>`}
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow mono">a study tool for people who learn by doing</p>
          <h1>Don't just read your notes. <em className="hl">Wread</em> them.</h1>
          <p className="lede">
            Drop in a PDF and type it back line by line, like a typing test. Or turn it into mad libs and fill in the
            missing words. Writing while you read makes it stick.
          </p>
          <div className="hero-cta">
            <a className="btn primary big" href="#try">Drop a file, no account needed</a>
            ${!user && html`<button className="btn ghost big" onClick=${() => setAuthTab("signup")}>Create free account</button>`}
          </div>
        </div>
        <div className="hero-demo"><${TypeDemo} /></div>
      </section>

      <section id="what" className="definition">
        <article className="dict">
          <header>
            <h2 className="headword">wread·ing</h2>
            <span className="pron mono">/ˈriː·dɪŋ/</span>
            <span className="pos">noun</span>
          </header>
          <ol>
            <li><span className="sense">a.</span> The act of writing and reading at the same time.</li>
            <li><span className="sense">b.</span> Studying a text by typing it out or filling in its gaps until it sticks.</li>
          </ol>
          <p className="example">“I wreaded the whole bio chapter last night and actually remember it.”</p>
          <footer className="mono">
            <b>wreads</b> (n.) · the web app that does it with you. See also: <a href="#how">how it works</a>.
          </footer>
        </article>
      </section>

      <section id="how" className="how">
        <h2 className="section-title">Three steps, no flashcards to write</h2>
        <ol className="steps">
          <li>
            <span className="num mono">01</span>
            <h3>Drop in your files</h3>
            <p>Lecture slides, textbook PDFs, your own notes. Drag them in, even as a guest.</p>
          </li>
          <li>
            <span className="num mono">02</span>
            <h3>Pick how you want to study</h3>
            <p>Type it out word for word, or let wreads blank out key terms for you to fill.</p>
          </li>
          <li>
            <span className="num mono">03</span>
            <h3>Wread until it sticks</h3>
            <p>Your hands and eyes work on the same words, so you're not just skimming.</p>
          </li>
        </ol>
      </section>

      <section className="modes">
        <div className="mode">
          <p className="tag mono">mode 01</p>
          <h3>Type-along</h3>
          <p>
            Your PDF comes back as a typing test. Each word lights up as you type it correctly, mistakes show in red,
            and you see your speed and accuracy as you go. Try the box at the top of the page.
          </p>
        </div>
        <div className="mode">
          <p className="tag mono">mode 02</p>
          <h3>Mad libs</h3>
          <p>Key terms get blanked out. Fill them in from memory. Give this one a go:</p>
          <${MadLibsDemo} />
        </div>
        <div className="mode">
          <p className="tag mono">mode 03</p>
          <h3>Speed read</h3>
          <p>Words flash one at a time at the speed you pick, with your eyes fixed on one spot. Great for a fast first pass before you wread it properly.</p>
          <a className="linkish" href=${DASHBOARD_URL}>Try it in the dashboard →</a>
        </div>
      </section>

      <section id="try" className="try">
        <div className="try-head">
          <h2 className="section-title">Try it right now</h2>
          <p className="muted">No sign-up needed. Drop a file in and start as a guest.</p>
        </div>
        <${DropZone} user=${user} onNeedAccount=${() => setAuthTab("signup")} />
      </section>
    </main>

    <footer className="site-foot">
      <span className="logo small">w<span>reads</span></span>
      <span className="muted">Built for the hackathon · PHP, Slim, MySQL & React</span>
    </footer>

    ${authTab &&
    html`<${AuthModal}
      tab=${authTab}
      setTab=${setAuthTab}
      onClose=${() => setAuthTab(null)}
      onAuthed=${(u) => { setUser(u); setAuthError(""); setAuthTab(null); }}
    />`}
  <//>`;
}

createRoot(document.getElementById("root")).render(html`<${App} />`);
