export default function GameOverBanner({ winner, leaderboard = [] }) {
  const sorted = [...leaderboard].sort((a, b) => b.score - a.score);
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="gameover">
      <div className="gameover-trophy">🏆</div>
      <div className="gameover-headline">Game Over · Final Results</div>
      {winner ? (
        <>
          <div className="gameover-winner">{winner.name} wins!</div>
          <div className="gameover-score">🪙 {Number(winner.score).toLocaleString()} coins · {winner.solvedCount || 0} solved</div>
        </>
      ) : (
        <div className="gameover-winner">Match concluded!</div>
      )}

      {sorted.length > 0 && (
        <div className="gameover-podium">
          {sorted.map((t, i) => (
            <div key={t.teamId} className={`podium-row ${i === 0 ? "top" : ""}`}>
              <span className="podium-pos">{medals[i] || `#${i + 1}`}</span>
              <span className="podium-name">{t.name}</span>
              <span className="podium-pts mono">🪙 {Number(t.score).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
