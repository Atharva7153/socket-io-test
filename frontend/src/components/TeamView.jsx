import React, { useState, useEffect } from "react";
import LiveBidFeed from "./LiveBidFeed";

export default function TeamView({ gameState, currentTeam, currentMember, socket }) {
  const [customBid, setCustomBid] = useState("");
  const [bidError, setBidError] = useState("");
  const [solutions, setSolutions] = useState({});
  const [solveMsg, setSolveMsg] = useState({});
  const [solvers, setSolvers] = useState({});
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onSuccess = d => setSolveMsg(p => ({ ...p, [d.questionId]: { text: `✅ ${d.message}`, type: "success" } }));
    const onLate    = d => setSolveMsg(p => ({ ...p, [d.questionId]: { text: `⏰ ${d.message}`, type: "warning" } }));
    const onErr     = d => setSolveMsg(p => ({ ...p, [d?.questionId || "g"]: { text: `❌ ${d?.message}`, type: "error" } }));
    socket.on("solve_success", onSuccess);
    socket.on("solve_late",    onLate);
    socket.on("submit_error",  onErr);
    return () => { socket.off("solve_success", onSuccess); socket.off("solve_late", onLate); socket.off("submit_error", onErr); };
  }, [socket]);

  const activeAuction = gameState?.activeAuctionQuestion;
  const isAuctionActive = Boolean(activeAuction);
  const myQs = (gameState?.questions || []).filter(q => q.assignedTeamId === currentTeam?.teamId);
  const members = currentTeam?.members || [];
  const isLeading = activeAuction?.highestBidderTeamId === currentTeam?.teamId;

  const placeBid = (amount) => {
    setBidError("");
    const n = Number(amount);
    if (!n || isNaN(n)) return setBidError("Enter a valid amount.");
    if (n <= activeAuction.currentBid) return setBidError(`Must be > ₹${Number(activeAuction.currentBid).toLocaleString()}`);
    if (n > currentTeam.balance) return setBidError(`Insufficient balance (₹${Number(currentTeam.balance).toLocaleString()})`);
    socket.emit("place_bid", { questionId: activeAuction.questionId, amount: n, teamId: currentTeam.teamId, memberName: currentMember?.name });
    setCustomBid("");
  };

  const quickBid = inc => placeBid((activeAuction?.currentBid || activeAuction?.baseBid || 0) + inc);

  const assignMember = (qid, name) => {
    if (!name) return;
    socket.emit("assign_question", { questionId: qid, memberName: name, teamId: currentTeam.teamId });
  };

  const submitSolution = (qid) => {
    const code = (solutions[qid] || "").trim();
    if (!code) return setSolveMsg(p => ({ ...p, [qid]: { text: "Enter your solution first.", type: "error" } }));
    socket.emit("submit_solution", { questionId: qid, codeOrAnswer: code, teamId: currentTeam.teamId, memberName: currentMember?.name || "Member" });
    setSolveMsg(p => ({ ...p, [qid]: { text: "Submitting…", type: "info" } }));
  };

  const diffBadge = d => <span className={`badge ${d === "Easy" ? "bdg-easy" : d === "Medium" ? "bdg-medium" : "bdg-hard"}`}>{d}</span>;

  const lbd = gameState?.leaderboard || [];
  const acts = gameState?.announcements || [];

  return (
    <div className="stack">

      {/* ===================== AUCTION STAGE ===================== */}
      <div className="auction-stage">
        {isAuctionActive ? (
          <div className="stage-live">
            {/* Top purple banner */}
            <div className="stage-topbar">
              <div className="stage-topbar-left">
                <span className="live-chip"><span className="live-chip-dot" />Live Auction</span>
                <span className="stage-question-name">{activeAuction.title}</span>
                <div className="stage-metas">
                  {diffBadge(activeAuction.difficulty)}
                  <span className="stage-meta-chip">📂 {activeAuction.category}</span>
                  <span className="stage-meta-chip">🔒 Hidden Reward</span>
                  <span className="stage-meta-chip">⚠️ -{activeAuction.deductionPenaltyCoins} late penalty</span>
                </div>
              </div>
              <div className="stage-countdown">
                <div className="countdown-label">Time Left</div>
                <div className={`countdown-num ${(gameState.auctionRemainingSeconds || 0) < 10 ? "urgent" : ""}`}>
                  {gameState.auctionRemainingSeconds ?? "—"}s
                </div>
              </div>
            </div>

            {/* Two-column body */}
            <div className="stage-body">
              {/* Left */}
              <div className="stage-left">
                <p className="question-desc">{activeAuction.description}</p>

                {/* Turn status */}
                {isLeading ? (
                  <div className="turn-banner leading">
                    <span className="turn-banner-icon">🛡️</span>
                    <div>
                      <div className="turn-banner-title">Your team is leading — ₹{Number(activeAuction.currentBid).toLocaleString()}</div>
                      <div className="turn-banner-sub">Wait for another team to outbid you before you can bid again.</div>
                    </div>
                  </div>
                ) : activeAuction.highestBidderTeamName ? (
                  <div className="turn-banner opponent">
                    <span className="turn-banner-icon">⚡</span>
                    <div>
                      <div className="turn-banner-title">{activeAuction.highestBidderTeamName} leads at ₹{Number(activeAuction.currentBid).toLocaleString()}</div>
                      <div className="turn-banner-sub">Place a higher bid to take the lead!</div>
                    </div>
                  </div>
                ) : null}

                {/* Big bid box */}
                <div className="bid-display">
                  <div className="bid-display-row">
                    <div>
                      <div className="bid-label">Current Highest Bid</div>
                      <div className="bid-amount mono">₹{Number(activeAuction.currentBid).toLocaleString()}</div>
                      <div className="bid-holder">
                        Held by: <strong style={{ color: isLeading ? "var(--green)" : "var(--ink2)" }}>
                          {activeAuction.highestBidderTeamName || "No bids yet"}
                          {isLeading ? " (You!)" : ""}
                        </strong>
                      </div>
                    </div>
                    <div className="bid-reward-hint">🔒 Mystery Reward</div>
                  </div>

                  <div className="bid-actions">
                    <div className="quick-bid-row">
                      {[500, 1000, 2500, 5000].map(inc => (
                        <button
                          key={inc}
                          className="qbid-btn"
                          onClick={() => quickBid(inc)}
                          disabled={gameState.status !== "ACTIVE" || isLeading}
                        >
                          +₹{inc >= 1000 ? `${inc / 1000}k` : inc}
                        </button>
                      ))}
                    </div>

                    <div className="custom-bid-row">
                      <input
                        type="number"
                        className="input"
                        placeholder={isLeading ? "Waiting for others…" : `> ₹${activeAuction.currentBid}`}
                        value={customBid}
                        onChange={e => setCustomBid(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && placeBid(customBid)}
                        disabled={isLeading}
                      />
                      <button
                        className={`btn ${isLeading ? "btn-ghost" : "btn-violet"}`}
                        onClick={() => placeBid(customBid)}
                        disabled={gameState.status !== "ACTIVE" || isLeading}
                        style={{ flexShrink: 0 }}
                      >
                        {isLeading ? "⏳ Leading" : "💰 Bid Now"}
                      </button>
                    </div>

                    {bidError && <div className="alert alert-error" style={{ marginBottom: 0 }}>{bidError}</div>}
                  </div>
                </div>
              </div>

              {/* Right: live feed */}
              <LiveBidFeed activeAuction={activeAuction} currentTeam={currentTeam} />
            </div>
          </div>
        ) : (
          <div className="stage-idle">
            <div className="stage-idle-emoji">🎯</div>
            <div className="stage-idle-title">No auction running right now</div>
            <div className="stage-idle-sub">
              Admin will launch the next DSA question soon.<br />
              Your budget: <strong style={{ color: "var(--green)" }}>₹{Number(currentTeam?.balance || 0).toLocaleString()}</strong>
            </div>
          </div>
        )}
      </div>

      {/* ===================== MY QUESTIONS ===================== */}
      {myQs.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: "var(--ink)" }}>🧩 Your Team's Problems</span>
            <span className="badge bdg-sold">{myQs.length} acquired</span>
          </div>

          {myQs.map(q => {
            const deadline = q.solveDeadline ? new Date(q.solveDeadline).getTime() : 0;
            const secsLeft = Math.max(0, Math.floor((deadline - now) / 1000));
            const urgent = secsLeft < 45 && secsLeft > 0;
            const m = Math.floor(secsLeft / 60), s = secsLeft % 60;
            const timeStr = `${m}:${s < 10 ? "0" : ""}${s}`;

            const solving = q.status === "SOLD";
            const solved  = q.status === "SOLVED";
            const expired = q.status === "EXPIRED";
            const assignedToMe = currentMember && q.assignedMemberName === currentMember.name;

            let cls = "q-card";
            if (solving) cls += assignedToMe ? " q-solving q-mine" : " q-solving";
            else if (solved)  cls += " q-solved";
            else if (expired) cls += " q-expired";

            return (
              <div key={q.questionId} className={cls}>
                <div className="q-card-head">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span className="q-title">{q.title}</span>
                    {diffBadge(q.difficulty)}
                    <span className="badge bdg-available">{q.category}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {solving && (
                      <span className={`solve-timer ${urgent ? "urgent" : "ok"}`}>
                        ⏱️ {timeStr}
                      </span>
                    )}
                    {solved  && <span className="badge bdg-solved">✅ Solved +{Number(q.hiddenRewardCoins).toLocaleString()} coins</span>}
                    {expired && <span className="badge bdg-expired">❌ Expired -{Number(q.deductionPenaltyCoins).toLocaleString()} coins</span>}
                  </div>
                </div>

                <div className="q-card-body">
                  {/* Assign bar */}
                  {solving && (
                    <div className="assign-strip">
                      <div className="assign-who">
                        <span style={{ fontSize: 12, color: "var(--ink3)", fontWeight: 700 }}>SOLVER:</span>
                        {q.assignedMemberName ? (
                          <>
                            👤 {q.assignedMemberName}
                            {assignedToMe && <span className="mine-tag">YOU</span>}
                          </>
                        ) : (
                          <span style={{ color: "var(--red)", fontWeight: 700 }}>⚠️ Unassigned</span>
                        )}
                      </div>
                      <div className="assign-controls">
                        <select
                          className="input"
                          style={{ width: 170, padding: "5px 10px", fontSize: 12 }}
                          value={solvers[q.questionId] || ""}
                          onChange={e => setSolvers(p => ({ ...p, [q.questionId]: e.target.value }))}
                        >
                          <option value="">— Assign Member —</option>
                          {members.map((m, i) => {
                            const name = typeof m === "string" ? m : m.name;
                            const role = typeof m === "object" ? m.role : i === 0 ? "Leader" : "Member";
                            return <option key={i} value={name}>{name} ({role})</option>;
                          })}
                        </select>
                        <button className="btn btn-ghost btn-sm" onClick={() => assignMember(q.questionId, solvers[q.questionId])} disabled={!solvers[q.questionId]}>
                          Assign
                        </button>
                        {currentMember && q.assignedMemberName !== currentMember.name && (
                          <button className="btn btn-gold btn-sm" onClick={() => assignMember(q.questionId, currentMember.name)}>
                            🙋 I'll Solve
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <p className="q-desc">{q.description}</p>

                  {q.sampleOutput && (
                    <div style={{ fontSize: 13, color: "var(--ink3)", marginBottom: 14 }}>
                      Expected: <code style={{ background: "var(--surface2)", border: "1px solid var(--border)", padding: "2px 8px", borderRadius: 6, fontFamily: "'Space Mono', monospace", fontSize: 12 }}>{q.sampleOutput}</code>
                    </div>
                  )}

                  {solving && (
                    <>
                      {assignedToMe && <div className="alert alert-warning" style={{ marginBottom: 10 }}>🎯 This is assigned to <strong>you</strong> — submit before the timer runs out!</div>}
                      {!assignedToMe && q.assignedMemberName && <div className="alert alert-info" style={{ marginBottom: 10 }}>Assigned to <strong>{q.assignedMemberName}</strong>. Any member can submit on behalf of the team.</div>}

                      <textarea
                        className="input"
                        rows={4}
                        placeholder="Paste your code or answer output here…"
                        value={solutions[q.questionId] || ""}
                        onChange={e => setSolutions(p => ({ ...p, [q.questionId]: e.target.value }))}
                      />

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, flexWrap: "wrap", gap: 8 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setSolutions(p => ({ ...p, [q.questionId]: q.sampleOutput || q.expectedAnswer || "" }))}
                        >
                          📋 Insert Sample Output
                        </button>
                        <button className="btn btn-green" onClick={() => submitSolution(q.questionId)}>
                          🚀 Submit — {currentMember?.name || "Team"}
                        </button>
                      </div>

                      {solveMsg[q.questionId] && (
                        <div className={`alert alert-${solveMsg[q.questionId].type}`} style={{ marginTop: 10, marginBottom: 0 }}>
                          {solveMsg[q.questionId].text}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===================== BOTTOM ROW ===================== */}
      <div className="row2">
        {/* Leaderboard */}
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">
              <div className="panel-title-icon ti-gold">🏆</div>
              Leaderboard
            </div>
            <span className="badge bdg-available">{lbd.length} teams</span>
          </div>
          <div className="lb-list">
            {lbd.map((t, i) => {
              const isMe = t.teamId === currentTeam?.teamId;
              const rankCls = i === 0 ? "rank-gold" : i === 1 ? "rank-silver" : i === 2 ? "rank-bronze" : "rank-other";
              return (
                <div key={t.teamId} className={`lb-entry ${isMe ? "lb-me" : ""}`}>
                  <div className={`lb-rank-badge ${rankCls}`}>{i + 1}</div>
                  <div className="lb-team">
                    {t.name}
                    {isMe && <span className="you-badge">YOU</span>}
                  </div>
                  <div className="lb-stats">
                    <div className="lb-coins">🪙 {Number(t.score).toLocaleString()}</div>
                    <div className="lb-balance-s">₹{Number(t.balance).toLocaleString()}</div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink4)", minWidth: 45, textAlign: "right" }}>{t.solvedCount || 0} solved</div>
                </div>
              );
            })}
            {lbd.length === 0 && <div style={{ padding: "20px", color: "var(--ink4)", fontSize: 13, textAlign: "center" }}>No teams yet</div>}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">
              <div className="panel-title-icon ti-violet">📢</div>
              Match Activity
            </div>
          </div>
          <div className="panel-body">
            <div className="act-feed">
              {acts.length === 0 && <div style={{ color: "var(--ink4)", fontSize: 13 }}>No events yet…</div>}
              {[...acts].reverse().map((a, i) => (
                <div key={i} className={`act-item ${a.type || "info"}`}>{a.text}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
