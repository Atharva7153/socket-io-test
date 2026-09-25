import React, { useState } from "react";
import axios from "axios";
import { getBackendUrl } from "../config";

export default function AdminView({ gameState, socket }) {
  const backendUrl = getBackendUrl();

  const [teamName, setTeamName] = useState("");
  const [teamPass, setTeamPass] = useState("123");
  const [members, setMembers] = useState(["", "", "", ""]);

  const [showAddQ, setShowAddQ] = useState(false);
  const [qTitle, setQTitle] = useState("");
  const [qDiff, setQDiff] = useState("Easy");
  const [qCat, setQCat] = useState("Arrays");
  const [qDesc, setQDesc] = useState("");
  const [qSampleOut, setQSampleOut] = useState("");
  const [qExpected, setQExpected] = useState("");
  const [qTime, setQTime] = useState(180);
  const [qReward, setQReward] = useState(25000);
  const [qPenalty, setQPenalty] = useState(8000);
  const [qBaseBid, setQBaseBid] = useState(2500);

  const [selectedQId, setSelectedQId] = useState("");
  const [auctionDur, setAuctionDur] = useState(30);

  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("info");

  const toast = (text, type = "info") => {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(""), 5000);
  };

  /* ---- Game Controls ---- */
  const startGame = async () => {
    try { await axios.post(`${backendUrl}/api/admin/start-game`); toast("🚀 Game started!", "success"); }
    catch (e) { toast("Error: " + e.message, "error"); }
  };

  const endGame = async () => {
    try {
      const res = await axios.post(`${backendUrl}/api/admin/end-game`);
      toast(res.data?.winner ? `🏆 Winner: ${res.data.winner.name}!` : "Game ended!", "success");
    } catch (e) { toast("Error: " + e.message, "error"); }
  };

  const softReset = async () => {
    if (!confirm("Reset all team balances to ₹50,000 and clear solved questions?")) return;
    try { await axios.post(`${backendUrl}/api/admin/reset`); toast("🔄 Game reset — ₹50,000 restored.", "success"); }
    catch (e) { toast("Error: " + e.message, "error"); }
  };

  const hardReset = async () => {
    const c = prompt("DANGER: Type DELETE to permanently wipe all teams, passwords and match data:");
    if (c !== "DELETE") return;
    try { await axios.post(`${backendUrl}/api/admin/hard-reset`); toast("🗑️ Hard reset — everything wiped.", "error"); }
    catch (e) { toast("Error: " + (e.response?.data?.message || e.message), "error"); }
  };

  /* ---- Teams ---- */
  const createTeam = async (e) => {
    e.preventDefault();
    try {
      const clean = members.filter(m => m.trim()).slice(0, 4);
      await axios.post(`${backendUrl}/api/admin/teams`, { name: teamName, password: teamPass, members: clean });
      toast(`✅ Team "${teamName}" created!`, "success");
      setTeamName(""); setMembers(["", "", "", ""]);
    } catch (e) { toast("Error: " + (e.response?.data?.message || e.message), "error"); }
  };

  const seedTeams = async () => {
    try { await axios.post(`${backendUrl}/api/admin/seed-teams`); toast("✨ 3 demo teams created!", "success"); }
    catch (e) { toast("Error: " + e.message, "error"); }
  };

  const seedQuestions = async () => {
    try { await axios.post(`${backendUrl}/api/admin/seed-questions`); toast("✨ Default questions loaded!", "success"); }
    catch (e) { toast("Error: " + e.message, "error"); }
  };

  /* ---- Custom Question ---- */
  const createQuestion = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${backendUrl}/api/admin/questions`, {
        title: qTitle, difficulty: qDiff, category: qCat, description: qDesc,
        sampleOutput: qSampleOut, expectedAnswer: qExpected,
        timeLimitSeconds: Number(qTime), hiddenRewardCoins: Number(qReward),
        deductionPenaltyCoins: Number(qPenalty), baseBid: Number(qBaseBid),
      });
      toast(`✅ "${qTitle}" added to pool!`, "success");
      setQTitle(""); setQDesc(""); setShowAddQ(false);
    } catch (e) { toast("Error: " + (e.response?.data?.message || e.message), "error"); }
  };

  /* ---- Auction ---- */
  const startAuction = async () => {
    if (!selectedQId) return toast("Select a question first!", "error");
    try {
      await axios.post(`${backendUrl}/api/admin/start-auction`, { questionId: selectedQId, duration: Number(auctionDur) });
      toast(`🔨 Auction started for ${auctionDur}s!`, "success");
    } catch (e) { toast("Error: " + (e.response?.data?.message || e.message), "error"); }
  };

  const endAuction = async () => {
    try { await axios.post(`${backendUrl}/api/admin/end-auction`); toast("🔨 Auction finalized!", "success"); }
    catch (e) { toast("Error: " + e.message, "error"); }
  };

  const markSolved = (qid) => {
    if (socket) { socket.emit("admin_mark_solved", { questionId: qid }); toast("✅ Marked as solved.", "success"); }
  };

  /* ---- Derived ---- */
  const availableQs = (gameState?.questions || []).filter(q => q.status === "AVAILABLE");
  const activeAuction = gameState?.activeAuctionQuestion;
  const status = gameState?.status || "WAITING";

  const diffBadge = d => <span className={`badge ${d === "Easy" ? "bdg-easy" : d === "Medium" ? "bdg-medium" : "bdg-hard"}`}>{d}</span>;

  const statusBadge = s => {
    const m = { AVAILABLE: "bdg-available", BIDDING: "bdg-bidding", SOLD: "bdg-sold", SOLVED: "bdg-solved", EXPIRED: "bdg-expired" };
    return <span className={`badge ${m[s] || "bdg-available"}`}>{s}</span>;
  };

  return (
    <div className="stack">
      {/* Action toast */}
      {msg && <div className={`action-banner alert-${msgType}`} style={{ border: "1.5px solid" }}>{msg}</div>}

      {/* ===== Game Controls ===== */}
      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <div className="panel-title-icon ti-violet">🎮</div>
            Game Master Controls
          </div>
          <span className={`game-pill ${status === "ACTIVE" ? "active" : status === "ENDED" ? "ended" : "waiting"}`}>
            <span className="pill-dot" />{status}
          </span>
        </div>
        <div className="panel-body" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button className="btn btn-green" onClick={startGame} disabled={status === "ACTIVE"}>🚀 Start Game</button>
          <button className="btn btn-purple" onClick={endGame} disabled={status !== "ACTIVE"}>🛑 End Game & Declare Winner</button>
          <button className="btn btn-gold" onClick={softReset}>🔄 Soft Reset (Restore ₹50k)</button>
        </div>
        <div className="danger-panel" style={{ margin: "0 20px 20px" }}>
          <div>
            <div className="danger-label">🗑️ Hard Reset</div>
            <div className="danger-desc">Permanently deletes ALL teams, passwords and match data</div>
          </div>
          <button className="btn btn-red btn-sm" onClick={hardReset}>Delete Everything</button>
        </div>
      </div>

      {/* ===== Auction Manager ===== */}
      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <div className="panel-title-icon ti-gold">🔨</div>
            Auction Manager
          </div>
          {activeAuction && (
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 20, fontWeight: 700, color: "var(--violet)" }}>
              {gameState.auctionRemainingSeconds ?? "—"}s
            </span>
          )}
        </div>
        <div className="panel-body">
          {activeAuction ? (
            <div className="live-auction-box">
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
                <div>
                  <span className="badge bdg-bidding" style={{ marginBottom: 6, display: "inline-flex" }}>LIVE</span>
                  <div style={{ fontSize: 20, fontWeight: 900, color: "var(--ink)" }}>{activeAuction.title}</div>
                  <div style={{ fontSize: 13, color: "var(--ink3)", marginTop: 2 }}>{activeAuction.difficulty} · {activeAuction.category}</div>
                </div>
                <div style={{ display: "flex", gap: 24 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--ink3)", letterSpacing: "0.5px" }}>Highest Bid</div>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 28, fontWeight: 700, color: "var(--violet)" }}>₹{Number(activeAuction.currentBid).toLocaleString()}</div>
                    <div style={{ fontSize: 13, color: "var(--green)", fontWeight: 700 }}>{activeAuction.highestBidderTeamName || "No bids yet"}</div>
                  </div>
                  <div style={{ borderLeft: "1.5px solid var(--border)", paddingLeft: 20 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--ink3)", letterSpacing: "0.5px" }}>Hidden Reward</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: "var(--gold)" }}>🪙 {Number(activeAuction.hiddenRewardCoins).toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: "var(--ink3)" }}>coins (admin only)</div>
                  </div>
                </div>
              </div>
              <button className="btn btn-red" onClick={endAuction}>🔨 Hammer Down — End Bidding Now</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 240 }} className="fg" style2={{ marginBottom: 0 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink3)", textTransform: "uppercase", letterSpacing: "0.4px" }}>Question to Auction</label>
                <select className="input" value={selectedQId} onChange={e => setSelectedQId(e.target.value)}>
                  <option value="">— Select Question —</option>
                  {availableQs.map(q => (
                    <option key={q.questionId} value={q.questionId}>
                      {q.title} ({q.difficulty}) · Base ₹{q.baseBid} · {q.hiddenRewardCoins} coins
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ width: 120 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink3)", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 5 }}>Duration (s)</label>
                <input type="number" className="input" value={auctionDur} onChange={e => setAuctionDur(e.target.value)} />
              </div>
              <button className="btn btn-violet" onClick={startAuction} disabled={status !== "ACTIVE" || !selectedQId}>
                🔨 Launch Auction
              </button>
              {status !== "ACTIVE" && <span style={{ fontSize: 12, color: "var(--red)", alignSelf: "center" }}>Start game first!</span>}
            </div>
          )}
        </div>
      </div>

      {/* ===== Team & Questions Row ===== */}
      <div className="row2">
        {/* Create Team */}
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">
              <div className="panel-title-icon ti-green">👥</div>
              Create Team
            </div>
            <button className="btn btn-ghost btn-sm" onClick={seedTeams}>⚡ Seed 3 Demo Teams</button>
          </div>
          <div className="panel-body">
            <form onSubmit={createTeam}>
              <div className="fg">
                <label>Team Name</label>
                <input className="input" placeholder="e.g. Code Warriors" value={teamName} onChange={e => setTeamName(e.target.value)} required />
              </div>
              <div className="fg">
                <label>Team Password</label>
                <input className="input" value={teamPass} onChange={e => setTeamPass(e.target.value)} required />
              </div>
              <div className="fg">
                <label>Members (max 4)</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {members.map((m, i) => (
                    <input key={i} className="input" placeholder={`Member ${i + 1}${i === 0 ? " (Leader)" : ""}`} value={m}
                      onChange={e => { const u = [...members]; u[i] = e.target.value; setMembers(u); }} />
                  ))}
                </div>
              </div>
              <button type="submit" className="btn btn-green btn-full">+ Create Team (₹50,000)</button>
            </form>
          </div>
        </div>

        {/* Teams table */}
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">
              <div className="panel-title-icon ti-violet">📋</div>
              Registered Teams
            </div>
            <span className="badge bdg-available">{gameState?.leaderboard?.length || 0} teams</span>
          </div>
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            <table className="gtable">
              <thead>
                <tr>
                  <th>Team</th><th>Pass</th><th>Balance</th><th>🪙 Coins</th><th>Members</th>
                </tr>
              </thead>
              <tbody>
                {(gameState?.leaderboard || []).map(t => (
                  <tr key={t.teamId}>
                    <td>
                      <strong style={{ color: "var(--ink)" }}>{t.name}</strong>
                      <div style={{ fontSize: 10, color: "var(--ink4)" }}>{t.teamId}</div>
                    </td>
                    <td>
                      <code style={{ background: "var(--surface2)", border: "1px solid var(--border)", padding: "2px 6px", borderRadius: 5, fontSize: 11, fontFamily: "'Space Mono', monospace" }}>123</code>
                    </td>
                    <td style={{ color: "var(--green)", fontWeight: 700 }}>₹{Number(t.balance).toLocaleString()}</td>
                    <td style={{ color: "var(--gold)", fontWeight: 700 }}>{Number(t.score).toLocaleString()}</td>
                    <td>
                      {t.members?.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {t.members.map((m, i) => {
                            const name = typeof m === "string" ? m : m.name;
                            const lead = typeof m === "object" ? m.isLeader : i === 0;
                            return (
                              <span key={i} style={{
                                background: lead ? "var(--gold-soft)" : "var(--surface2)",
                                border: `1px solid ${lead ? "#ffdfa0" : "var(--border)"}`,
                                color: lead ? "#a07000" : "var(--ink2)",
                                padding: "2px 7px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                              }}>
                                {lead ? "👑 " : "👤 "}{name}
                              </span>
                            );
                          })}
                        </div>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
                {(!gameState?.leaderboard?.length) && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", color: "var(--ink4)", padding: 24 }}>
                      No teams yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ===== Question Pool ===== */}
      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <div className="panel-title-icon ti-violet">📚</div>
            DSA Question Pool
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={seedQuestions}>⚡ Load Defaults</button>
            <button className="btn btn-outline-violet btn-sm" onClick={() => setShowAddQ(!showAddQ)}>
              {showAddQ ? "✕ Cancel" : "+ Add Question"}
            </button>
          </div>
        </div>

        {showAddQ && (
          <div style={{ borderBottom: "1.5px solid var(--border)" }}>
            <form onSubmit={createQuestion} style={{ padding: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Title</label>
                  <input className="input" placeholder="e.g. Two Sum" value={qTitle} onChange={e => setQTitle(e.target.value)} required />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Difficulty</label>
                  <select className="input" value={qDiff} onChange={e => setQDiff(e.target.value)}>
                    <option>Easy</option><option>Medium</option><option>Hard</option>
                  </select>
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Category</label>
                  <input className="input" value={qCat} onChange={e => setQCat(e.target.value)} />
                </div>
              </div>
              <div className="fg">
                <label>Description</label>
                <textarea className="input" rows={3} placeholder="Problem description…" value={qDesc} onChange={e => setQDesc(e.target.value)} required />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Sample Output</label>
                  <input className="input" placeholder="e.g. [0,1]" value={qSampleOut} onChange={e => setQSampleOut(e.target.value)} />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Expected Answer</label>
                  <input className="input" placeholder="e.g. [0,1]" value={qExpected} onChange={e => setQExpected(e.target.value)} />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Time Limit (s)</label>
                  <input type="number" className="input" value={qTime} onChange={e => setQTime(e.target.value)} required />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Base Bid (₹)</label>
                  <input type="number" className="input" value={qBaseBid} onChange={e => setQBaseBid(e.target.value)} required />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>🔒 Hidden Reward (coins)</label>
                  <input type="number" className="input" value={qReward} onChange={e => setQReward(e.target.value)} required />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Late Penalty (coins)</label>
                  <input type="number" className="input" value={qPenalty} onChange={e => setQPenalty(e.target.value)} required />
                </div>
              </div>
              <button type="submit" className="btn btn-green">+ Save to Pool</button>
            </form>
          </div>
        )}

        <div style={{ overflowX: "auto" }}>
          <table className="gtable">
            <thead>
              <tr>
                <th>Question</th><th>Diff</th><th>Status</th><th>Base</th><th>Bid</th>
                <th>Assigned To</th><th>🔒 Reward</th><th>Penalty</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {(gameState?.questions || []).map(q => (
                <tr key={q.questionId}>
                  <td>
                    <strong style={{ color: "var(--ink)" }}>{q.title}</strong>
                    <div style={{ fontSize: 11, color: "var(--ink4)" }}>{q.timeLimitSeconds}s solve limit</div>
                  </td>
                  <td>{diffBadge(q.difficulty)}</td>
                  <td>{statusBadge(q.status)}</td>
                  <td style={{ color: "var(--ink2)" }}>₹{Number(q.baseBid).toLocaleString()}</td>
                  <td style={{ color: "var(--violet)", fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>₹{Number(q.currentBid).toLocaleString()}</td>
                  <td>
                    {q.assignedTeamName ? (
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{q.assignedTeamName}</div>
                        {q.assignedMemberName && <div style={{ fontSize: 11, color: "var(--violet)" }}>👤 {q.assignedMemberName}</div>}
                      </div>
                    ) : "—"}
                  </td>
                  <td style={{ color: "var(--gold)", fontWeight: 800, fontFamily: "'Space Mono', monospace" }}>🪙 {Number(q.hiddenRewardCoins).toLocaleString()}</td>
                  <td style={{ color: "var(--red)", fontFamily: "'Space Mono', monospace" }}>-{Number(q.deductionPenaltyCoins).toLocaleString()}</td>
                  <td>
                    {q.status === "SOLD" && (
                      <button className="btn btn-green btn-sm" onClick={() => markSolved(q.questionId)}>✓ Mark Solved</button>
                    )}
                  </td>
                </tr>
              ))}
              {!(gameState?.questions?.length) && (
                <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--ink4)", padding: 24 }}>No questions yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Announcements ===== */}
      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <div className="panel-title-icon ti-green">📢</div>
            Live Announcements
          </div>
        </div>
        <div className="panel-body">
          <div className="act-feed">
            {[...(gameState?.announcements || [])].reverse().map((a, i) => (
              <div key={i} className={`act-item ${a.type || "info"}`}>{a.text}</div>
            ))}
            {!gameState?.announcements?.length && (
              <div style={{ color: "var(--ink4)", fontSize: 13 }}>No events yet — start the game!</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
