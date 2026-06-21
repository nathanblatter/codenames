import { useState, useEffect, useRef } from "react";
import QRCode from "react-qr-code";
import { Settings } from "react-feather";
import CodenamesBoard from "./CodenamesBoard";
import SpymasterPage from "./SpymasterPage";
import AdminPage from "./AdminPage";
import WinnerOverlay from "./WinnerOverlay";
import Auth from "./auth";
import BugReport from "./BugReport";

export default function App() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  const params = new URLSearchParams(window.location.search);
  const view = params.get("view") === "spymaster" ? <SpymasterPage /> : <GameContent />;

  return (
    <>
      {view}
      <BugReport />
    </>
  );
}

function SettingsPanel({ settings, onChange, onClose, themes }) {
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-50 p-4 flex flex-col gap-3"
    >
      <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Game Settings</h3>

      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <div>
          <p className="font-medium text-gray-800 text-sm">Hide opponent words</p>
          <p className="text-xs text-gray-500">Spymasters see ? instead of the opponent's words</p>
        </div>
        <button
          onClick={() => onChange({ ...settings, hideOpponent: !settings.hideOpponent })}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${settings.hideOpponent ? "bg-indigo-600" : "bg-gray-300"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.hideOpponent ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </label>

      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <div>
          <p className="font-medium text-gray-800 text-sm">Adult mode</p>
          <p className="text-xs text-gray-500">Allows mature words in AI-generated boards</p>
        </div>
        <button
          onClick={() => onChange({ ...settings, adultMode: !settings.adultMode })}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${settings.adultMode ? "bg-indigo-600" : "bg-gray-300"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.adultMode ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </label>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-gray-800 text-sm">Turn timer</p>
          <p className="text-xs text-gray-500">Auto-pass when time runs out</p>
        </div>
        <select
          value={settings.timerSeconds ?? ""}
          onChange={e => onChange({ ...settings, timerSeconds: e.target.value ? Number(e.target.value) : null })}
          className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Off</option>
          <option value="60">1 min</option>
          <option value="90">90 sec</option>
          <option value="120">2 min</option>
          <option value="180">3 min</option>
        </select>
      </div>

      {themes.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium text-gray-800 text-sm">Theme</p>
            <p className="text-xs text-gray-500">Guide AI word selection</p>
          </div>
          <select
            value={settings.themeId ?? ""}
            onChange={e => onChange({ ...settings, themeId: e.target.value ? Number(e.target.value) : null })}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">None</option>
            {themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

function GameContent() {
  const [user, setUser] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [gameId, setGameId] = useState(null);
  const [words, setWords] = useState([]);
  const [types, setTypes] = useState([]);
  const [revealed, setRevealed] = useState([]);
  const [winner, setWinner] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [currentTurn, setCurrentTurn] = useState(null);
  const [settings, setSettings] = useState({ hideOpponent: false, adultMode: true, timerSeconds: null, themeId: null });
  const [showSettings, setShowSettings] = useState(false);
  const [themes, setThemes] = useState([]);
  const [turnStartedAt, setTurnStartedAt] = useState(null);
  const [turnDuration, setTurnDuration] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [moveHistory, setMoveHistory] = useState([]);

  useEffect(() => {
    fetch("/themes").then(r => r.json()).then(setThemes).catch(() => {});
  }, []);

  useEffect(() => {
    if (!gameId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/game/${gameId}`);
        if (!res.ok) return;
        const data = await res.json();
        setRevealed(data.revealed);
        setTurnStartedAt(data.turnStartedAt || null);
        if (data.currentTurn) setCurrentTurn(data.currentTurn);
        if (data.winner) setWinner(data.winner);
        if (data.moveHistory) setMoveHistory(data.moveHistory);
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [gameId]);

  const autoPassedRef = useRef(false);
  useEffect(() => { autoPassedRef.current = false; }, [currentTurn]);

  useEffect(() => {
    if (!turnDuration || !turnStartedAt || winner || reviewing || !gameId) return;
    const tick = setInterval(() => {
      const remaining = Math.max(0, turnDuration - (Date.now() - turnStartedAt));
      setTimeLeft(remaining);
      if (remaining === 0 && !autoPassedRef.current) {
        autoPassedRef.current = true;
        fetch(`/game/${gameId}/pass-turn`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromTeam: currentTurn }),
        }).then(r => r.json()).then(data => {
          setCurrentTurn(data.currentTurn);
          setTurnStartedAt(data.turnStartedAt);
        }).catch(() => {});
      }
    }, 250);
    return () => clearInterval(tick);
  }, [turnDuration, turnStartedAt, winner, reviewing, gameId, currentTurn]);

  async function handleSettingsChange(next) {
    setSettings(next);
    if (gameId) {
      await fetch(`/game/${gameId}/hide-opponent`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hideOpponent: next.hideOpponent }),
      });
    }
  }

  async function refreshBoard() {
    if (gameId) {
      await fetch(`/game/${gameId}/abandon`, { method: "POST", headers: { "Content-Type": "application/json" } });
    }
    await newGame();
  }

  async function newGame() {
    try {
      const res = await fetch("/game/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hideOpponent: settings.hideOpponent, adultMode: settings.adultMode, themeId: settings.themeId, timerSeconds: settings.timerSeconds }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setGameId(data.id);
      setWords(data.words);
      setTypes(data.types);
      setRevealed(data.revealed || Array(25).fill(false));
      setCurrentTurn(data.currentTurn || data.startingPlayer || null);
      setTurnDuration(data.turnDuration || null);
      setTurnStartedAt(data.turnStartedAt || null);
      setTimeLeft(data.turnDuration || null);
      setMoveHistory([]);
      setWinner(null);
      setReviewing(false);
    } catch (err) {
      console.error("Failed to create game", err);
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center">
        <h1 className="text-4xl font-bold mb-8 text-gray-800">Codenames</h1>
        <Auth onLogin={(userData) => setUser(userData)} />
      </div>
    );
  }

  if (showAdmin) {
    return <AdminPage user={user} onBack={() => setShowAdmin(false)} />;
  }

  const origin = window.location.origin;
  const blueUrl = gameId ? `${origin}/?view=spymaster&id=${gameId}&team=blue` : "";
  const redUrl = gameId ? `${origin}/?view=spymaster&id=${gameId}&team=red` : "";

  return (
    <div className="h-screen bg-gray-100 flex flex-col overflow-hidden">
      {winner && !reviewing && <WinnerOverlay winner={winner} onNewGame={newGame} onReview={() => setReviewing(true)} />}
      <header className="flex items-center justify-between max-w-4xl mx-auto mb-4 w-full p-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Codenames</h1>
          <span className="text-sm text-gray-600">Welcome, {user.username || "Player"}</span>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <button
              onClick={() => setShowSettings(v => !v)}
              className={`p-2 rounded-lg transition-colors ${showSettings ? "bg-indigo-100 text-indigo-700" : "bg-gray-200 text-gray-600 hover:bg-gray-300"}`}
              title="Game settings"
            >
              <Settings size={18} />
            </button>
            {showSettings && (
              <SettingsPanel
                settings={settings}
                onChange={handleSettingsChange}
                onClose={() => setShowSettings(false)}
                themes={themes}
              />
            )}
          </div>
          {user.isAdmin && (
            <button onClick={() => setShowAdmin(true)} className="px-3 py-2 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-800">
              Admin
            </button>
          )}
          {gameId && !winner && (
            <button onClick={refreshBoard} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg shadow-md hover:bg-gray-600">
              Refresh Board
            </button>
          )}
          <button onClick={newGame} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700">
            New Game
          </button>
          <button onClick={() => setUser(null)} className="px-3 py-2 bg-gray-300 text-gray-800 font-semibold rounded-lg hover:bg-gray-400">
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 w-full px-4 overflow-y-auto">
        {reviewing && (
          <section className="max-w-4xl mx-auto mb-4 flex items-center justify-between bg-gray-800 text-white rounded-xl px-5 py-3">
            <span className="font-semibold">Reviewing finished game</span>
            <button onClick={newGame} className="px-4 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-lg text-sm">
              New Game
            </button>
          </section>
        )}

        {gameId && !reviewing && (
          <section className="max-w-4xl mx-auto mb-6 flex flex-col sm:flex-row gap-6">
   
            <div className="text-center">
              <div className="font-semibold mb-1">Red Spymaster</div>
              <QRCode value={redUrl} size={128} />
              <div className="text-xs mt-1 break-all">{redUrl}</div>
            </div>
                     <div className="text-center">
              <div className="font-semibold mb-1">Blue Spymaster</div>
              <QRCode value={blueUrl} size={128} />
              <div className="text-xs mt-1 break-all">{blueUrl}</div>
            </div>
          </section>
        )}

        {turnDuration && timeLeft !== null && !winner && !reviewing && gameId && (
          <section className="max-w-4xl mx-auto mb-3 flex items-center justify-center">
            <div className={`px-6 py-2 rounded-full font-mono font-bold text-xl tabular-nums ${
              timeLeft < 15000 ? "bg-red-100 text-red-700 animate-pulse" : timeLeft < 30000 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-700"
            }`}>
              {Math.ceil(timeLeft / 1000)}s
            </div>
          </section>
        )}

        <section className="max-w-4xl mx-auto mb-6">
          <CodenamesBoard words={words} types={types} revealed={reviewing ? Array(25).fill(true) : revealed} currentTurn={reviewing ? null : currentTurn} />
        </section>

        {reviewing && moveHistory.length > 0 && (
          <section className="max-w-4xl mx-auto mt-4 mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase tracking-wide">Game Summary</h3>
            <div className="flex flex-col gap-2">
              {moveHistory.map((move, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="text-gray-400 w-5 text-right shrink-0">{i + 1}.</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${move.team === "blue" ? "bg-blue-600 text-white" : "bg-red-600 text-white"}`}>
                    {move.team}
                  </span>
                  <span className="font-bold uppercase tracking-wide text-gray-800 flex-1">{move.word}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    move.type === "assassin" ? "bg-black text-white" :
                    move.correct ? "bg-green-100 text-green-700" :
                    move.type === "neutral" ? "bg-gray-200 text-gray-600" :
                    "bg-orange-100 text-orange-700"
                  }`}>
                    {move.type === "assassin" ? "assassin" : move.correct ? "correct" : move.type === "neutral" ? "neutral" : "opponent"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="w-full border-t border-gray-300 py-3 text-center text-xs text-gray-500">
        Codenames clone by Nathan Blatter
      </footer>
    </div>
  );
}
