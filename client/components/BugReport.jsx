import { useEffect, useRef, useState } from "react";

const SEVERITIES = [
  { value: "low", label: "Minor — cosmetic" },
  { value: "med", label: "Medium — annoying" },
  { value: "high", label: "High — hard to play" },
  { value: "urgent", label: "Urgent — game-breaking" },
];

export default function BugReport() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState("med");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const id = setTimeout(() => ref.current?.focus(), 40);
    return () => { document.removeEventListener("keydown", onKey); clearTimeout(id); };
  }, [open]);

  function close() {
    setOpen(false);
    setTimeout(() => { setMessage(""); setSeverity("med"); setStatus("idle"); setError(""); }, 200);
  }

  async function send() {
    const trimmed = message.trim();
    if (!trimmed) { setError("Add a quick description first."); ref.current?.focus(); return; }
    setStatus("sending"); setError("");
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
      setStatus("sent");
      setTimeout(close, 1300);
    } catch {
      setStatus("error"); setError("Could not send. Try again.");
    }
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
