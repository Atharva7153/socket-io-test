import React, { useState, useEffect, useRef } from "react";
import { initSocket } from "./socket";
import Navbar from "./components/Navbar";
import LoginScreen from "./components/LoginScreen";
import AdminView from "./components/AdminView";
import TeamView from "./components/TeamView";
import GameOverBanner from "./components/GameOverBanner";
import { playChime } from "./sound";
import "./App.css";

export default function App() {
  const [socket, setSocket] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [wipeNotice, setWipeNotice] = useState("");

  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem("dsa_game_is_admin") === "true");

  const [currentTeam, setCurrentTeam] = useState(() => {
    try { const s = localStorage.getItem("dsa_game_team"); return s ? JSON.parse(s) : null; }
    catch { return null; }
  });

  const [currentMember, setCurrentMember] = useState(() => {
    try { const s = localStorage.getItem("dsa_game_member"); return s ? JSON.parse(s) : null; }
    catch { return null; }
  });

  const socketRef = useRef(null);
  const currentTeamRef = useRef(currentTeam);
  currentTeamRef.current = currentTeam;

  useEffect(() => {
    const s = initSocket();
    socketRef.current = s;
    setSocket(s);

    s.on("connect", () => {
      if (isAdmin) {
        s.emit("admin_auth", true);
      } else if (currentTeamRef.current) {
        s.emit("team_join", { teamId: currentTeamRef.current.teamId, memberName: currentMember?.name });
      }
    });

    s.on("game_state", state => setGameState(state));

    s.on("auction_tick", ({ remainingSeconds }) => {
      setGameState(prev => prev ? { ...prev, auctionRemainingSeconds: remainingSeconds } : prev);
    });

    s.on("bid_placed", data => {
      const myTeam = currentTeamRef.current;
      const mine = myTeam && data.highestBidderTeamId === myTeam.teamId;
      const outbid = myTeam && data.previousBidderTeamId === myTeam.teamId && !mine;
      if (outbid) playChime("outbid");
      else if (mine) playChime("success");
      else playChime("bid");
    });

    s.on("bid_error", data => alert("⚠️ " + (data?.message || "Bid could not be placed.")));

    s.on("game_wiped", data => {
      localStorage.removeItem("dsa_game_team");
      localStorage.removeItem("dsa_game_member");
      localStorage.removeItem("dsa_game_is_admin");
      setCurrentTeam(null);
      setCurrentMember(null);
      setIsAdmin(false);
      setWipeNotice(data?.message || "All teams wiped by Admin.");
      setTimeout(() => setWipeNotice(""), 8000);
    });

    return () => s.disconnect();
  }, []);

  // Sync balance/score from leaderboard
  useEffect(() => {
    if (gameState && currentTeam) {
      const updated = gameState.leaderboard?.find(t => t.teamId === currentTeam.teamId);
      if (updated) {
        setCurrentTeam(prev => ({ ...prev, balance: updated.balance, score: updated.score, solvedCount: updated.solvedCount, members: updated.members || prev.members }));
      }
    }
  }, [gameState]);

  const handleAdminLoginSuccess = () => {
    setIsAdmin(true); setCurrentTeam(null); setCurrentMember(null);
    localStorage.setItem("dsa_game_is_admin", "true");
    localStorage.removeItem("dsa_game_team"); localStorage.removeItem("dsa_game_member");
    if (socketRef.current) socketRef.current.emit("admin_auth", true);
  };

  const handleTeamLoginSuccess = (team, member) => {
    setCurrentTeam(team); setCurrentMember(member); setIsAdmin(false);
    localStorage.setItem("dsa_game_team", JSON.stringify(team));
    if (member) localStorage.setItem("dsa_game_member", JSON.stringify(member));
    localStorage.removeItem("dsa_game_is_admin");
    if (socketRef.current) socketRef.current.emit("team_join", { teamId: team.teamId, memberName: member?.name });
  };

  const handleLogout = () => {
    setIsAdmin(false); setCurrentTeam(null); setCurrentMember(null);
    localStorage.removeItem("dsa_game_is_admin");
    localStorage.removeItem("dsa_game_team");
    localStorage.removeItem("dsa_game_member");
  };

  // Login is full-page, no navbar
  if (!isAdmin && !currentTeam) {
    return (
      <>
        {wipeNotice && <div className="wipe-toast">🚨 {wipeNotice}</div>}
        <LoginScreen
          onTeamLoginSuccess={handleTeamLoginSuccess}
          onAdminLoginSuccess={handleAdminLoginSuccess}
          leaderboard={gameState?.leaderboard || []}
        />
      </>
    );
  }

  return (
    <div className="app-shell">
      <Navbar
        gameState={gameState}
        currentTeam={currentTeam}
        currentMember={currentMember}
        isAdmin={isAdmin}
        onLogout={handleLogout}
      />

      <main className="main-content">
        {wipeNotice && <div className="wipe-toast">🚨 {wipeNotice}</div>}

        {gameState?.status === "ENDED" && (
          <GameOverBanner winner={gameState.winner} leaderboard={gameState.leaderboard} />
        )}

        {isAdmin
          ? <AdminView gameState={gameState} socket={socketRef.current} />
          : <TeamView gameState={gameState} currentTeam={currentTeam} currentMember={currentMember} socket={socketRef.current} />
        }
      </main>
    </div>
  );
}