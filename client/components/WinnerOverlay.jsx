export default function WinnerOverlay({ winner, onNewGame, onReview }) {
  const isBlue = winner === "blue";

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center ${isBlue ? "bg-blue-700" : "bg-red-700"}`}
      style={{ animation: "overlayFadeIn 0.4s ease-out both" }}
    >
      <style>{`
        @keyframes overlayFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes popIn {
          from { transform: scale(0.4); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        @keyframes shimmer {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.6; }
        }
      `}</style>

      {/* Background glow */}
      <div
        className={`absolute w-[600px] h-[600px] rounded-full blur-3xl opacity-30 ${isBlue ? "bg-blue-300" : "bg-red-300"}`}
        style={{ animation: "shimmer 2s ease-in-out infinite" }}
      />

      <div
        className="relative flex flex-col items-center gap-2"
        style={{ animation: "popIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both" }}
      >
        <p className="text-white/70 text-xl font-medium uppercase tracking-widest">Team</p>
        <h1 className="text-9xl font-black text-white uppercase leading-none">
          {winner}
        </h1>
        <p className="text-white/90 text-4xl font-bold tracking-wide">WINS!</p>
      </div>

      <div
        className="relative mt-16 flex gap-4"
        style={{ animation: "popIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.45s both" }}
      >
        {onReview && (
          <button
            onClick={onReview}
            className="px-8 py-3 bg-white/20 border-2 border-white text-white font-bold text-lg rounded-full hover:bg-white/30 transition-colors"
          >
            Review Board
          </button>
        )}
        {onNewGame && (
          <button
            onClick={onNewGame}
            className="px-10 py-3 bg-white font-bold text-lg rounded-full shadow-lg hover:scale-105 transition-transform"
            style={{ color: isBlue ? "#1d4ed8" : "#b91c1c" }}
          >
            New Game
          </button>
        )}
      </div>
    </div>
  );
}
