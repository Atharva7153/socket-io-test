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

async function run() {
    console.log("1. Seeding 3 demo teams...");
    const seedRes = await post('/api/admin/seed-teams');
    console.log("Teams seeded:", seedRes.teams.map(t => `${t.name} (Budget: ₹${t.balance})`));

    console.log("2. Starting Game...");
    const startRes = await post('/api/admin/start-game');
    console.log("Game status:", startRes.status);

    const team = seedRes.teams[0];
    console.log(`3. Connecting socket as Team: ${team.name} (${team.teamId})...`);
    const socket = io("http://localhost:3000");

    socket.on("connect", async () => {
        console.log("Socket connected:", socket.id);
        socket.emit("team_join", { teamId: team.teamId });

        // Admin starts auction on first question
        const stateRes = await new Promise((resolve) => {
            http.get('http://localhost:3000/api/game/state', (res) => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => resolve(JSON.parse(d)));
            });
        });

        const firstQ = stateRes.questions[0];
        console.log(`4. Admin starting auction on: ${firstQ.title} (Base Bid: ₹${firstQ.baseBid})...`);
        await post('/api/admin/start-auction', { questionId: firstQ.questionId, duration: 15 });

        // Place a bid
        console.log(`5. Team placing bid of ₹5,000 (starting budget ₹${team.balance})...`);
        socket.emit("place_bid", {
            questionId: firstQ.questionId,
            amount: 5000,
            teamId: team.teamId
        });

        setTimeout(async () => {
            console.log("6. Ending auction early (sold!)...");
            await post('/api/admin/end-auction');

            setTimeout(() => {
                // Team submits solution
                console.log(`7. Team submitting solution for: ${firstQ.title} with output "${firstQ.expectedAnswer}"...`);
                socket.emit("submit_solution", {
                    questionId: firstQ.questionId,
                    codeOrAnswer: firstQ.expectedAnswer,
                    teamId: team.teamId
                });

                setTimeout(async () => {
                    const finalState = await new Promise((resolve) => {
                        http.get('http://localhost:3000/api/game/state', (res) => {
                            let d = '';
                            res.on('data', c => d += c);
                            res.on('end', () => resolve(JSON.parse(d)));
                        });
                    });
                    console.log("8. Final Leaderboard check:");
                    console.table(finalState.leaderboard);

                    console.log("9. Admin Ending Game & Declaring Winner...");
                    const endRes = await post('/api/admin/end-game');
                    console.log("Winner:", endRes.winner?.name, "Score:", endRes.winner?.score, "Remaining Cash: ₹" + endRes.winner?.balance);

                    socket.disconnect();
                    process.exit(0);
                }, 1000);
            }, 1000);
        }, 1000);
    });
}

run().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
