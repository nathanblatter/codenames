import { useEffect, useMemo, useRef, useState } from "react";
import WinnerOverlay from "./WinnerOverlay";

export default function SpymasterPage() {
  const params = useMemo(
    () => new URLSearchParams(typeof window !== "undefined" ? window.location.search : ""),
    []
  );
  const id = params.get("id");
  const team = params.get("team") === "blue" ? "blue" : "red";

  const [words, setWords] = useState([]);
  const [types, setTypes] = useState([]);
  const [fullTypes, setFullTypes] = useState([]);
  const [revealed, setRevealed] = useState([]);
  const [hideOpponent, setHideOpponent] = useState(false);
  const [winner, setWinner] = useState(null);
  const [hint, setHint] = useState(null);
  const [loadingHint, setLoadingHint] = useState(false);
  const [currentTurn, setCurrentTurn] = useState(null);
  const [passingTurn, setPassingTurn] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [turnStartedAt, setTurnStartedAt] = useState(null);
  const [turnDuration, setTurnDuration] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);

  // Initial load
  useEffect(() => {
    (async () => {
      if (!id) return;
      const res = await fetch(`/game/${id}/spymaster/${team}`);
      if (!res.ok) { console.error("Spymaster fetch failed", res.status); return; }
      const data = await res.json();
      setWords(data.words);
      setTypes(data.types);
      setFullTypes(data.fullTypes || data.types);
      setRevealed(data.revealed || new Array(25).fill(false));
      setHideOpponent(data.hideOpponent || false);
      setCurrentTurn(data.currentTurn || null);
      setTurnDuration(data.turnDuration || null);
      setTurnStartedAt(data.turnStartedAt || null);
      setTimeLeft(data.turnDuration || null);
      if (data.winner) setWinner(data.winner);
    })();
  }, [id, team]);

  // Poll for revealed, hideOpponent, winner, and currentTurn
  useEffect(() => {
    if (!id) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/game/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        setRevealed(data.revealed);
        setHideOpponent(data.hideOpponent);
        setTurnStartedAt(data.turnStartedAt || null);
        if (data.currentTurn) setCurrentTurn(data.currentTurn);
        if (data.turnDuration !== undefined) setTurnDuration(data.turnDuration);
        if (data.winner) setWinner(data.winner);
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [id]);

  const autoPassedRef = useRef(false);
  useEffect(() => { autoPassedRef.current = false; }, [currentTurn]);

  useEffect(() => {
    if (!turnDuration || !turnStartedAt || winner || reviewing || !id) return;
    const tick = setInterval(() => {
      const remaining = Math.max(0, turnDuration - (Date.now() - turnStartedAt));
      setTimeLeft(remaining);
      if (remaining === 0 && !autoPassedRef.current) {
        autoPassedRef.current = true;
        fetch(`/game/${id}/pass-turn`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromTeam: currentTurn }),
        }).then(r => r.json()).then(data => {
          setCurrentTurn(data.currentTurn);
          setTurnStartedAt(data.turnStartedAt);
          setTimeLeft(turnDuration);
        }).catch(() => {});
      }
    }, 250);
    return () => clearInterval(tick);
  }, [turnDuration, turnStartedAt, winner, reviewing, id, currentTurn]);

  const isMyTurn = currentTurn === team;

  const handleReveal = async (index) => {
    if (revealed[index] || winner) return;
    setRevealed(prev => { const next = [...prev]; next[index] = true; return next; });
    const res = await fetch(`/game/${id}/reveal`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index, team }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.winner) setWinner(data.winner);
    }
  };

  const passTurn = async () => {
    setPassingTurn(true);
    try {
      const res = await fetch(`/game/${id}/pass-turn`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentTurn(data.currentTurn);
        setTurnStartedAt(data.turnStartedAt);
        setTimeLeft(turnDuration);
      }
    } finally {
      setPassingTurn(false);
    }
  };

  const getHint = async () => {
    setLoadingHint(true);
    setHint(null);
    try {
      const res = await fetch(`/game/${id}/hint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team }),
      });
      if (!res.ok) { console.error("Hint fetch failed", res.status); return; }
      const data = await res.json();
      setHint(data);
    } catch (err) {
      console.error("Hint error:", err);
    } finally {
      setLoadingHint(false);
    }
  };

  const color = (t) =>
    t === "blue" ? "bg-blue-600 text-white"
    : t === "red" ? "bg-red-600 text-white"
    : t === "assassin" ? "bg-black text-white"
    : "bg-gray-300 text-gray-800";

  if (!id) return <p className="p-4">Missing game id.</p>;
  if (words.length !== 25 || types.length !== 25) return <p className="p-4">Loading...</p>;

  const opponentTeam = team === "blue" ? "red" : "blue";

  return (
    <div className="min-h-screen p-4 flex flex-col items-center gap-4">
      {winner && !reviewing && <WinnerOverlay winner={winner} onReview={() => setReviewing(true)} />}

      <h2 className="text-xl font-semibold capitalize">{team} spymaster</h2>

      {/* Turn Banner */}
      {currentTurn && !winner && (
        <div
          className={`w-full max-w-2xl rounded-xl px-6 py-3 text-center font-bold text-lg tracking-wide ${
            isMyTurn
              ? team === "blue"
                ? "bg-blue-600 text-white"
                : "bg-red-600 text-white"
              : "bg-gray-200 text-gray-600"
          }`}
        >
          {isMyTurn ? "YOUR TURN" : `${opponentTeam.toUpperCase()} TEAM'S TURN`}
        </div>
      )}

      {turnDuration && timeLeft !== null && !winner && !reviewing && (
        <div className={`px-6 py-2 rounded-full font-mono font-bold text-xl tabular-nums ${
          timeLeft < 15000 ? "bg-red-100 text-red-700 animate-pulse" : timeLeft < 30000 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-700"
        }`}>
          {Math.ceil(timeLeft / 1000)}s
        </div>
      )}

      <div className="flex gap-3 text-sm">
        <span className="px-2 py-1 rounded bg-blue-600 text-white">Blue</span>
        <span className="px-2 py-1 rounded bg-red-600 text-white">Red</span>
        <span className="px-2 py-1 rounded bg-gray-300 text-gray-800">Neutral</span>
        <span className="px-2 py-1 rounded bg-black text-white">Assassin</span>
      </div>

      <div className="flex gap-3 flex-wrap justify-center">
        <button
          onClick={getHint}
          disabled={loadingHint || !!winner}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          {loadingHint ? "Getting hint..." : "Get AI Hint"}
        </button>

        <button
          onClick={passTurn}
          disabled={!isMyTurn || passingTurn || !!winner}
          className={`px-4 py-2 rounded font-semibold transition-colors disabled:opacity-40 ${
            team === "blue"
              ? "bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-400"
              : "bg-red-100 text-red-700 hover:bg-red-200 border border-red-400"
          }`}
        >
          {passingTurn ? "Passing..." : "Pass Turn"}
        </button>
      </div>

      {hint && (
        <div className="bg-indigo-100 p-3 rounded text-center">
          <p className="font-bold text-lg">{hint.hint} ({hint.count})</p>
          {hint.targets && <p className="text-sm text-gray-600">Targets: {hint.targets.join(", ")}</p>}
        </div>
      )}

      {reviewing && (
        <div className="w-full max-w-2xl bg-gray-800 text-white rounded-xl px-5 py-2 text-center text-sm font-semibold">
          Reviewing finished game
        </div>
      )}

      <div className="grid grid-cols-5 gap-2 w-full max-w-2xl">
        {words.map((w, i) => {
          const displayType = reviewing ? fullTypes[i] : types[i];
          const isRevealed = reviewing || revealed[i];
          const isOpponent = fullTypes[i] !== team && fullTypes[i] !== "neutral" && fullTypes[i] !== "assassin";
          const wordHidden = !reviewing && hideOpponent && isOpponent && !revealed[i];
          return (
            <div
              key={i}
              onClick={() => !reviewing && handleReveal(i)}
              className={`h-16 sm:h-20 rounded flex items-center justify-center font-bold uppercase text-center text-sm px-1 transition-all ${!winner && !revealed[i] && !reviewing ? "cursor-pointer" : "cursor-default"} ${color(displayType)} ${!reviewing && revealed[i] ? "opacity-40" : ""}`}
            >
              {wordHidden ? "?" : w}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-600 mt-2">
        Tap a card to reveal it on the main board.
      </p>
    </div>
  );
}
