export default function Navbar({ gameState, currentTeam, currentMember, isAdmin, onLogout }) {
  const status = gameState?.status || "WAITING";
  const pillClass = status === "ACTIVE" ? "active" : status === "ENDED" ? "ended" : "waiting";
  const pillLabel = status === "ACTIVE" ? "Game Live" : status === "ENDED" ? "Game Over" : "Waiting";
  const hasAuction = Boolean(gameState?.activeAuctionQuestion);

  const initials = currentMember?.name
    ? currentMember.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : isAdmin ? "AD" : "?";

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        {/* Brand */}
        <div className="brand">
          <span className="brand-name"><em>Auction</em></span>
        </div>

        {/* Center pills */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className={`game-pill ${pillClass}`}>
            <span className="pill-dot" />
            {pillLabel}
          </span>
          {hasAuction && (
            <span className="game-pill bidding">
              <span className="pill-dot" />
              Auction Open
            </span>
          )}
        </div>

        {/* HUD right */}
        <div className="hud">
          {!isAdmin && currentTeam && (
            <>
              <div className="hud-stat balance">
                💵 ₹{Number(currentTeam.balance || 0).toLocaleString()}
              </div>
              <div className="hud-stat coins">
                🪙 {Number(currentTeam.score || 0).toLocaleString()}
              </div>
            </>
          )}

          {isAdmin ? (
            <div className="hud-member">
              <div className="hud-avatar admin-avatar">👑</div>
              <div>
                <div className="hud-name">Admin</div>
                <div className="hud-role">Game Master</div>
              </div>
            </div>
          ) : currentTeam ? (
            <div className="hud-member">
              <div className="hud-avatar">{initials}</div>
              <div>
                <div className="hud-name">{currentMember?.name || currentTeam.name}</div>
                <div className="hud-role">{currentMember?.role || "Member"} · {currentTeam.name}</div>
              </div>
            </div>
          ) : null}

          {(isAdmin || currentTeam) && (
            <button className="signout-btn" onClick={onLogout}>Sign out</button>
          )}
        </div>
      </div>
    </nav>
  );
}
