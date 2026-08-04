import { useEffect, useRef, useState } from "react";

const SEVERITIES = [
  { value: "low", label: "Minor — cosmetic" },
  { value: "med", label: "Medium — annoying" },
  { value: "high", label: "High — hard to play" },
  { value: "urgent", label: "Urgent — game-breaking" },
];

const MAX_SHOTS = 4;
const MAX_SHOT_BYTES = 8 * 1024 * 1024; // 8MB
const SHOT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export default function BugReport() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState("med");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState("");
  const [shots, setShots] = useState([]); // [{ file, url, key }]
  const [shotError, setShotError] = useState("");
  const [shotWarning, setShotWarning] = useState("");
  const [dragging, setDragging] = useState(false);
  const ref = useRef(null);
  const fileInputRef = useRef(null);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && close();
    const onPaste = (e) => {
      const files = [...(e.clipboardData?.items || [])]
        .filter((i) => i.kind === "file")
        .map((i) => i.getAsFile())
        .filter(Boolean);
      if (files.length) { e.preventDefault(); addShots(files); }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("paste", onPaste);
    const id = setTimeout(() => ref.current?.focus(), 40);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("paste", onPaste);
      clearTimeout(id);
    };
  }, [open]);

  // Revoke thumbnail object URLs on unmount
  useEffect(() => () => shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url)), []);

  function close() {
    setOpen(false);
    setTimeout(() => {
      shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url));
      setMessage(""); setSeverity("med"); setStatus("idle"); setError("");
      setShots([]); setShotError(""); setShotWarning(""); setDragging(false);
    }, 200);
  }

  function addShots(fileList) {
    setShotError("");
    const incoming = [...fileList];
    const problems = [];
    setShots((prev) => {
      let next = [...prev];
      for (const file of incoming) {
        if (!SHOT_TYPES.includes(file.type)) { problems.push(`${file.name || "That file"} isn't an image (PNG, JPEG, WebP, or GIF).`); continue; }
        if (file.size > MAX_SHOT_BYTES) { problems.push(`${file.name || "One image"} is over 8MB.`); continue; }
        if (next.length >= MAX_SHOTS) { problems.push(`Max ${MAX_SHOTS} screenshots per report.`); break; }
        next.push({ file, url: URL.createObjectURL(file), key: `${Date.now()}-${Math.random().toString(36).slice(2)}` });
      }
      return next;
    });
    if (problems.length) setShotError(problems[0]);
  }

  function removeShot(key) {
    setShots((prev) => {
      const gone = prev.find((s) => s.key === key);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((s) => s.key !== key);
    });
    setShotError("");
  }

  async function uploadShots(itemId) {
    const form = new FormData();
    shotsRef.current.forEach((s) => form.append("files", s.file, s.file.name || "screenshot.png"));
    const res = await fetch(`/api/bug-report/${itemId}/screenshots`, { method: "POST", body: form });
    if (!res.ok) throw new Error();
  }

  async function send() {
    const trimmed = message.trim();
    if (!trimmed) { setError("Add a quick description first."); ref.current?.focus(); return; }
    setStatus("sending"); setError(""); setShotWarning("");
    let reportId = null;
    try {
      const res = await fetch("/api/bug-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          severity,
          url: window.location.href,
          meta: { path: window.location.pathname, viewport: `${window.innerWidth}x${window.innerHeight}`, userAgent: navigator.userAgent },
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json().catch(() => null);
      reportId = data?.id || null;
    } catch {
      setStatus("error"); setError("Could not send. Try again.");
      return;
    }
    // Report is filed — screenshots are best-effort from here.
    if (shotsRef.current.length && reportId) {
      try {
        await uploadShots(reportId);
      } catch {
        setShotWarning("Report filed, but the screenshots didn't upload.");
      }
    } else if (shotsRef.current.length && !reportId) {
      setShotWarning("Report filed, but the screenshots didn't upload.");
    }
    setStatus("sent");
    setTimeout(close, shotsRef.current.length ? 2200 : 1300);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Report a bug"
        className="fixed bottom-4 right-4 z-40 font-mono text-xs font-bold uppercase tracking-widest
                   bg-fuchsia-600 text-white px-4 py-3 rounded-md shadow-lg shadow-fuchsia-600/30
                   transition hover:-translate-y-0.5 hover:bg-fuchsia-500 focus:outline-none
                   focus-visible:ring-2 focus-visible:ring-fuchsia-300"
      >
        ◇ Report a bug
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 font-mono"
          onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
          <div role="dialog" aria-modal="true" aria-label="Report a bug"
               className="w-full max-w-md rounded-lg border-2 border-fuchsia-600 bg-white p-6 shadow-2xl">
            <h2 className="text-base font-bold uppercase tracking-widest text-gray-900">Found a bug?</h2>
            <p className="mt-1 text-xs text-gray-500">Tell us what broke — it goes straight to the board.</p>

            {status === "sent" ? (
              <div className="mt-6 rounded border border-fuchsia-300 bg-fuchsia-50 px-4 py-6 text-center text-sm text-fuchsia-700">
                ◇ Report filed. Thanks for the intel.
                {shotWarning && <p className="mt-2 text-xs text-amber-600">{shotWarning}</p>}
              </div>
            ) : (
              <>
                <label htmlFor="cn-bug-msg" className="mt-5 block text-[11px] font-bold uppercase tracking-widest text-gray-500">What went wrong?</label>
                <textarea id="cn-bug-msg" ref={ref} value={message} onChange={(e) => setMessage(e.target.value)}
                  rows={4} maxLength={5000} placeholder="What you saw, and what you expected…"
                  className="mt-2 w-full resize-y rounded border border-gray-300 bg-gray-50 p-3 text-sm text-gray-900
                             placeholder-gray-400 focus:border-fuchsia-600 focus:outline-none focus:ring-2 focus:ring-fuchsia-600/20" />

                <label htmlFor="cn-bug-sev" className="mt-4 block text-[11px] font-bold uppercase tracking-widest text-gray-500">How bad is it?</label>
                <select id="cn-bug-sev" value={severity} onChange={(e) => setSeverity(e.target.value)}
                  className="mt-2 w-full rounded border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900
                             focus:border-fuchsia-600 focus:outline-none focus:ring-2 focus:ring-fuchsia-600/20">
                  {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>

                <span className="mt-4 block text-[11px] font-bold uppercase tracking-widest text-gray-500">
                  Screenshots <span className="normal-case font-normal tracking-normal text-gray-400">(optional, up to {MAX_SHOTS} × 8MB)</span>
                </span>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Add screenshots"
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), fileInputRef.current?.click())}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); addShots(e.dataTransfer?.files || []); }}
                  className={`mt-2 cursor-pointer rounded border border-dashed p-3 text-center text-xs transition
                              focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-600/20
                              ${dragging ? "border-fuchsia-600 bg-fuchsia-50 text-fuchsia-700" : "border-gray-300 bg-gray-50 text-gray-400 hover:border-fuchsia-400 hover:text-gray-500"}`}
                >
                  Click, drag &amp; drop, or paste images here
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={SHOT_TYPES.join(",")}
                  multiple
                  className="hidden"
                  onChange={(e) => { addShots(e.target.files || []); e.target.value = ""; }}
                />

                {shots.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {shots.map((s) => (
                      <div key={s.key} className="relative h-16 w-16 overflow-hidden rounded border border-gray-300 bg-gray-100">
                        <img src={s.url} alt={s.file.name || "Screenshot"} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeShot(s.key)}
                          aria-label={`Remove ${s.file.name || "screenshot"}`}
                          className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full
                                     bg-black/60 text-[10px] leading-none text-white hover:bg-fuchsia-600"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {shotError && <p className="mt-2 text-xs text-red-600">{shotError}</p>}

                <div className="mt-5 flex items-center gap-3">
                  <span className="mr-auto text-xs text-red-600">{error}</span>
                  <button type="button" onClick={close} className="text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-gray-700">Cancel</button>
                  <button type="button" onClick={send} disabled={status === "sending"}
                    className="rounded bg-fuchsia-600 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white
                               hover:bg-fuchsia-500 disabled:opacity-60">
                    {status === "sending" ? "Sending…" : "Send"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
