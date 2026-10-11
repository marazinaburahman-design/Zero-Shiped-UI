import { useEffect, useRef, useState } from "react";

/* ---------- Mock data + fake analysis (no backend) ---------- */

const ROLE = "Full-stack developer";

const SKILLS = [
  "React", "Node.js", "TypeScript", "MongoDB", "SQL", "REST APIs",
  "GraphQL", "Docker", "AWS", "CI/CD", "Git", "Jest",
  "Tailwind CSS", "Next.js", "System design", "Redis",
];

const STAGES = [
  "Reading PDF",
  "Extracting skills",
  "Matching against role",
  "Calculating score",
];

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededShuffle(list, seed) {
  const arr = [...list];
  let s = seed || 1;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Same file name + size always gives the same result, so the mock feels real.
function mockAnalyze(file) {
  const seed = hashString(`${file.name}:${file.size}`);
  const shuffled = seededShuffle(SKILLS, seed);
  const presentCount = 7 + (seed % 7); // 7 to 13 of 16
  const present = shuffled.slice(0, presentCount);
  const missing = shuffled.slice(presentCount);
  const score = Math.min(97, Math.round(38 + (presentCount / SKILLS.length) * 58 + (seed % 5)));
  return { score, present, missing };
}

function verdict(score) {
  if (score >= 75) return "Ready to ship";
  if (score >= 50) return "Almost ready to ship";
  return "Not ready to ship yet";
}

/* ---------- Small hooks ---------- */

function useCountUp(target, run) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setValue(target);
      return;
    }
    let raf;
    const start = performance.now();
    const duration = 1100;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return value;
}

/* ---------- Pieces ---------- */

function Dropzone({ onFile, error }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handle = (file) => file && onFile(file);

  return (
    <div
      className={`dropzone ${dragging ? "is-dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handle(e.dataTransfer.files[0]);
      }}
    >
      <p className="dropzone-title">Drop your resume here</p>
      <p className="dropzone-sub">PDF only, up to 5 MB</p>
      <button className="btn" onClick={() => inputRef.current.click()}>
        Choose PDF
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => handle(e.target.files[0])}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function BuildLog({ fileName, step }) {
  return (
    <div className="buildlog" aria-live="polite">
      <p className="buildlog-file">{fileName}</p>
      <ul>
        {STAGES.map((label, i) => {
          const state = i < step ? "done" : i === step ? "active" : "wait";
          return (
            <li key={label} className={`stage ${state}`}>
              <span className="stage-dot" />
              <span>{label}</span>
              <span className="stage-state">
                {state === "done" ? "Done" : state === "active" ? "Running" : "Waiting"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Results({ fileName, result, onReset }) {
  const shown = useCountUp(result.score, true);
  const TICKS = 25;
  const filled = Math.round((shown / 100) * TICKS);

  return (
    <div className="results">
      <p className="results-file">{fileName}</p>

      <div className="score">
        <div className="score-number" aria-label={`Score ${result.score} out of 100`}>
          {shown}
          <span>/100</span>
        </div>
        <div className="score-meta">
          <p className="score-verdict">{verdict(result.score)}</p>
          <p className="score-role">Scored against: {ROLE}</p>
        </div>
      </div>

      <div className="ticks" aria-hidden="true">
        {Array.from({ length: TICKS }).map((_, i) => (
          <span key={i} className={i < filled ? "tick on" : "tick"} />
        ))}
      </div>

      <section className="skillgroup">
        <h3>
          Skills found <em>{result.present.length}</em>
        </h3>
        <ul className="chips">
          {result.present.map((s) => (
            <li key={s} className="chip present">{s}</li>
          ))}
        </ul>
      </section>

      <section className="skillgroup">
        <h3>
          Skills missing <em>{result.missing.length}</em>
        </h3>
        <ul className="chips">
          {result.missing.map((s) => (
            <li key={s} className="chip missing">{s}</li>
          ))}
        </ul>
      </section>

      <button className="btn btn-ghost" onClick={onReset}>
        Scan another resume
      </button>
    </div>
  );
}

/* ---------- App ---------- */

export default function App() {
  const [phase, setPhase] = useState("idle"); // idle | analyzing | done
  const [file, setFile] = useState(null);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleFile = (f) => {
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) return setError("That file isn't a PDF. Export your resume as a PDF and try again.");
    if (f.size > 5 * 1024 * 1024) return setError("That PDF is over 5 MB. Compress it and try again.");
    setError("");
    setFile(f);
    setStep(0);
    setPhase("analyzing");
  };

  useEffect(() => {
    if (phase !== "analyzing") return;
    if (step < STAGES.length) {
      const t = setTimeout(() => setStep((s) => s + 1), 650);
      return () => clearTimeout(t);
    }
    setResult(mockAnalyze(file));
    setPhase("done");
  }, [phase, step, file]);

  const reset = () => {
    setPhase("idle");
    setFile(null);
    setResult(null);
    setStep(0);
  };

  return (
    <div className="page">
      <header className="nav">
        <span className="brand">0 to Shipped</span>
        <span className="nav-note">Resume parser</span>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1>
              <span className="zero">0</span> to shipped.
            </h1>
            <p className="lede">
              Upload your resume and see your score, the skills we found, and the skills
              you're missing.
            </p>
          </div>

          <div className="panel">
            {phase === "idle" && <Dropzone onFile={handleFile} error={error} />}
            {phase === "analyzing" && <BuildLog fileName={file.name} step={step} />}
            {phase === "done" && (
              <Results fileName={file.name} result={result} onReset={reset} />
            )}
          </div>
        </section>

        <section className="how">
          <div>
            <h2>Upload</h2>
            <p>Add your resume as a PDF.</p>
          </div>
          <div>
            <h2>Scan</h2>
            <p>We read it and match it against the role.</p>
          </div>
          <div>
            <h2>Ship</h2>
            <p>Fill the missing skills, then scan again.</p>
          </div>
        </section>
      </main>

      <footer className="footer">
        Mock design. Your file stays in your browser and nothing is uploaded.
      </footer>
    </div>
  );
}
