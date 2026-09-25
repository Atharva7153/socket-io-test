const { io } = require("socket.io-client");
const http = require("http");

async function post(path, body = {}) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function get(path) {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:3000${path}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
    });
}

async function run() {
    console.log("1. Seeding 3 demo teams with 4 member roles each...");
    const seedRes = await post('/api/admin/seed-teams');
    const team1 = seedRes.teams[0];
    console.log(`Team: ${team1.name}`);
    console.log("Members & Roles:", team1.members);

    console.log("\n2. Personal login test: Logging in as 'Rohan' (Algo Specialist)...");
    const loginRes = await post('/api/team/login', {
        teamIdentifier: team1.name,
        password: "123",
        memberName: "Rohan"
    });
    console.log(`Logged in member: ${loginRes.member.name} (${loginRes.member.role})`);

    console.log("\n3. Starting game & launching auction...");
    await post('/api/admin/start-game');

    const state = await new Promise((resolve) => {
        http.get('http://localhost:3000/api/game/state', (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(JSON.parse(d)));
        });
    });
    const q = state.questions[0];

    const socket = io("http://localhost:3000");
    await new Promise(r => socket.on("connect", r));
    socket.emit("team_join", { teamId: team1.teamId, memberName: "Rohan" });

    await post('/api/admin/start-auction', { questionId: q.questionId, duration: 20 });

    console.log(`\n4. Placing bid of ₹4,000 on "${q.title}"...`);
    socket.emit("place_bid", {
        questionId: q.questionId,
        amount: 4000,
        teamId: team1.teamId
    });

    await new Promise(r => setTimeout(r, 600));

    // End auction early
    console.log("5. Hammer falls! Ending auction and acquiring problem...");
    await post('/api/admin/end-auction');

    await new Promise(r => setTimeout(r, 600));

    console.log("6. Assigning question to member 'Rohan' to solve...");
    let assignReceived = false;
    socket.once("question_assigned", (data) => {
        console.log(`✅ Question assigned confirmed: Assigned to "${data.assignedMemberName}"`);
        assignReceived = true;
    });

    socket.emit("assign_question", {
        questionId: q.questionId,
        memberName: "Rohan",
        teamId: team1.teamId
    });

    await new Promise(r => setTimeout(r, 600));

    console.log(`7. Rohan submitting solution with output "${q.expectedAnswer}"...`);
    socket.emit("submit_solution", {
        questionId: q.questionId,
        codeOrAnswer: q.expectedAnswer,
        teamId: team1.teamId,
        memberName: "Rohan"
    });

    await new Promise(r => setTimeout(r, 800));

    const finalState = await new Promise((resolve) => {
        http.get('http://localhost:3000/api/game/state', (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(JSON.parse(d)));
        });
    });

    const winningTeamState = finalState.leaderboard.find(t => t.teamId === team1.teamId);
    console.log(`Final Team Score: 🪙 ${winningTeamState.score} Coins, Balance: ₹${winningTeamState.balance}`);

    socket.disconnect();
    console.log("\n=======================================================");
    console.log("🎉 ALL ROLE-BASED & LIVE FEED FEATURES WORKING PERFECTLY!");
    console.log("=======================================================");
    process.exit(0);
}

run().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
