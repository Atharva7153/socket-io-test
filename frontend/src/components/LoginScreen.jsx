import React, { useState } from "react";
import axios from "axios";
import { getBackendUrl } from "../config";

export default function LoginScreen({ onTeamLoginSuccess, onAdminLoginSuccess, leaderboard = [] }) {
  const [tab, setTab] = useState("team");
  const [teamId, setTeamId] = useState("");
  const [teamPass, setTeamPass] = useState("");
  const [memberName, setMemberName] = useState("");
  const [adminUser, setAdminUser] = useState("admin");
  const [adminPass, setAdminPass] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const backendUrl = getBackendUrl();

  const matchedTeam = leaderboard.find(
    t => t.name.toLowerCase() === teamId.trim().toLowerCase() ||
         t.teamId.toLowerCase() === teamId.trim().toLowerCase()
  );

  const loginTeam = async (identifier, pass, name) => {
    setError(""); setLoading(true);
    try {
      const res = await axios.post(`${backendUrl}/api/team/login`, {
        teamIdentifier: identifier.trim(),
        password: pass.trim(),
        memberName: name.trim(),
      });
      if (res.data?.success) onTeamLoginSuccess(res.data.team, res.data.member);
      else setError(res.data?.message || "Login failed");
    } catch (e) {
      setError(e.response?.data?.message || e.message || "Login failed");
    } finally { setLoading(false); }
  };

  const loginAdmin = async (user, pass) => {
    setError(""); setLoading(true);
    try {
      const res = await axios.post(`${backendUrl}/api/admin/login`, {
        username: user.trim(), password: pass.trim(),
      });
      if (res.data?.success) onAdminLoginSuccess();
      else setError(res.data?.message || "Invalid credentials");
    } catch (e) {
      setError(e.response?.data?.message || "Admin login failed");
    } finally { setLoading(false); }
  };

  const quickDemos = [
    { name: "Arjun", role: "Leader 👑", team: "Team Binary Beasts", pass: "123" },
    { name: "Rohan", role: "Algo Specialist", team: "Team Binary Beasts", pass: "123" },
    { name: "Dev",   role: "Leader 👑", team: "Team Cyber Knights",   pass: "123" },
    { name: "Kabir", role: "Leader 👑", team: "Team Dynamic Wizards", pass: "123" },
  ];

  return (
    <div className="login-page">
      <div className="login-wrap">
        {/* Hero */}
        <div className="login-hero">
          <span className="login-game-logo">⚡</span>
          <div className="login-game-name">
            DSA <span>Auction</span> Arena
          </div>
          <div className="login-tagline">
            Bid on problems · Solve to earn coins · Highest score wins
          </div>
        </div>

        {/* Card */}
        <div className="login-card">
          <div className="login-tabs">
            <button className={`ltab ${tab === "team" ? "on" : ""}`} onClick={() => { setTab("team"); setError(""); }}>
              👤 Team Member
            </button>
            <button className={`ltab ${tab === "admin" ? "on" : ""}`} onClick={() => { setTab("admin"); setError(""); }}>
              👑 Admin
            </button>
          </div>

          <div className="login-body">
            {error && <div className="alert alert-error">{error}</div>}

            {tab === "team" ? (
              <>
                <form onSubmit={e => { e.preventDefault(); loginTeam(teamId, teamPass, memberName); }}>
                  <div className="fg">
                    <label>Team Name or ID</label>
                    <input className="input" placeholder="e.g. Team Binary Beasts" value={teamId} onChange={e => setTeamId(e.target.value)} required />
                  </div>
                  <div className="fg">
                    <label>Team Password</label>
                    <input type="password" className="input" placeholder="Enter team password" value={teamPass} onChange={e => setTeamPass(e.target.value)} required />
                  </div>
                  <div className="fg" style={{ marginBottom: 18 }}>
                    <label>Your Name</label>
                    {matchedTeam?.members?.length > 0 ? (
                      <select className="input" value={memberName} onChange={e => setMemberName(e.target.value)}>
                        <option value="">— Select your profile —</option>
                        {matchedTeam.members.map((m, i) => {
                          const name = typeof m === "string" ? m : m.name;
                          const role = typeof m === "object" ? m.role : i === 0 ? "Leader" : "Member";
                          return <option key={i} value={name}>{name} ({role})</option>;
                        })}
                      </select>
                    ) : (
                      <input className="input" placeholder="Type your name" value={memberName} onChange={e => setMemberName(e.target.value)} />
                    )}
                  </div>
                  <button type="submit" className="btn btn-violet btn-full btn-lg" disabled={loading}>
                    {loading ? "Entering…" : "Enter Arena →"}
                  </button>
                </form>

                <div className="login-divider">Quick Demo Login</div>

                <div className="quick-grid">
                  {quickDemos.map((d, i) => (
                    <button key={i} className="quick-card" onClick={() => loginTeam(d.team, d.pass, d.name)} disabled={loading}>
                      <div className="qc-name">{d.name}</div>
                      <div className="qc-sub">{d.role} · {d.team.replace("Team ", "")}</div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <form onSubmit={e => { e.preventDefault(); loginAdmin(adminUser, adminPass); }}>
                  <div className="fg">
                    <label>Username</label>
                    <input className="input" value={adminUser} onChange={e => setAdminUser(e.target.value)} required />
                  </div>
                  <div className="fg" style={{ marginBottom: 18 }}>
                    <label>Password</label>
                    <input type="password" className="input" value={adminPass} onChange={e => setAdminPass(e.target.value)} required />
                  </div>
                  <button type="submit" className="btn btn-violet btn-full btn-lg" disabled={loading}>
                    {loading ? "Authenticating…" : "👑 Login as Admin"}
                  </button>
                </form>

                <div className="login-divider">Quick Access</div>

                <button
                  className="btn btn-ghost btn-full"
                  onClick={() => loginAdmin("admin", "admin123")}
                  disabled={loading}
                >
                  ⚡ 1-Click Admin Login (admin / admin123)
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
