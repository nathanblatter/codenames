function Card({ word, type, isRevealed }) {
  const base =
    "flex items-center justify-center h-24 sm:h-28 md:h-32 rounded-lg shadow-md transition-all duration-300 ease-in-out select-none";
  const revealed = {
    red: "bg-red-600 text-white shadow-lg scale-105",
    blue: "bg-blue-600 text-white shadow-lg scale-105",
    neutral: "bg-gray-300 text-gray-800 shadow-lg scale-105",
    assassin: "bg-black text-white shadow-2xl scale-105",
  };
  const unrevealed = "bg-yellow-100 text-gray-800 border-2 border-yellow-300";
  const cls = isRevealed ? `${base} ${revealed[type]}` : `${base} ${unrevealed}`;

  return (
    <div className={cls}>
      <span className="text-sm sm:text-base font-bold uppercase tracking-wider p-8 text-center">
        {word}
      </span>
    </div>
  );
}

function ScoreColumn({ team, revealedCount, total, isActive }) {
  const isRed = team === "red";
  const activeColor = isRed ? "text-red-600" : "text-blue-600";
  const fillColor = isRed ? "bg-red-600" : "bg-blue-600";
  const emptyColor = isRed ? "border-red-300" : "border-blue-300";

  return (
    <div
      className={`flex flex-col items-center gap-2 w-14 shrink-0 rounded-xl py-3 px-1 transition-all ${
        isActive ? (isRed ? "bg-red-50 ring-2 ring-red-400" : "bg-blue-50 ring-2 ring-blue-400") : "bg-gray-50"
      }`}
    >
      <span className={`text-xs font-bold uppercase tracking-wide ${isActive ? activeColor : "text-gray-400"}`}>
        {team}
      </span>
      <span className={`text-2xl font-black leading-none ${isActive ? activeColor : "text-gray-400"}`}>
        {revealedCount}
        <span className="text-sm font-medium text-gray-400">/{total}</span>
      </span>

      <div className="flex flex-col gap-1 mt-1">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`w-8 h-2.5 rounded-sm border transition-colors ${
              i < revealedCount ? `${fillColor} border-transparent` : `bg-gray-100 border ${emptyColor}`
            }`}
          />
        ))}
      </div>

      {isActive && (
        <span className={`text-xs font-bold mt-1 ${activeColor} animate-pulse`}>TURN</span>
      )}
    </div>
  );
}

export default function CodenamesBoard({ words = [], types = [], revealed = [], currentTurn }) {
  if (!words.length) {
    return <p className="text-gray-600">Click New Game to start.</p>;
  }

  const redTotal = types.filter(t => t === "red").length;
  const blueTotal = types.filter(t => t === "blue").length;
  const redRevealed = types.filter((t, i) => t === "red" && revealed[i]).length;
  const blueRevealed = types.filter((t, i) => t === "blue" && revealed[i]).length;

  return (
    <div className="flex gap-3 items-start justify-center w-full">
      <ScoreColumn
        team="red"
        revealedCount={redRevealed}
        total={redTotal}
        isActive={currentTurn === "red"}
      />

      <div className="grid grid-cols-5 gap-5 sm:gap-4 flex-1 max-w-2xl">
        {words.map((word, i) => (
          <Card
            key={i}
            word={word}
            type={types[i]}
            isRevealed={revealed[i]}
          />
        ))}
      </div>

      <ScoreColumn
        team="blue"
        revealedCount={blueRevealed}
        total={blueTotal}
        isActive={currentTurn === "blue"}
      />
    </div>
  );
}
