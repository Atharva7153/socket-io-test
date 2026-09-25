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
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function runTest() {
    console.log("--- STARTING TURN-BASED BIDDING & HARD RESET TEST ---");

    // 1. Seed teams
    const seedRes = await post('/api/admin/seed-teams');
    const teamA = seedRes.teams[0];
    const teamB = seedRes.teams[1];
    console.log(`Team A: ${teamA.name} (${teamA.teamId})`);
    console.log(`Team B: ${teamB.name} (${teamB.teamId})`);

    // 2. Start Game
    await post('/api/admin/start-game');

    // 3. Connect sockets for Team A and Team B
    const socketA = io("http://localhost:3000");
    const socketB = io("http://localhost:3000");

    await new Promise(r => socketA.on("connect", r));
    await new Promise(r => socketB.on("connect", r));

    socketA.emit("team_join", { teamId: teamA.teamId });
    socketB.emit("team_join", { teamId: teamB.teamId });

    // 4. Start auction on first question
    const state = await get('/api/game/state');
    const q = state.questions[0];
    console.log(`\nStarting auction on: "${q.title}" (Base Bid: ₹${q.baseBid})...`);
    await post('/api/admin/start-auction', { questionId: q.questionId, duration: 20 });

    // 5. Team A places initial bid of ₹3,000
    console.log(`\n[Test 1] Team A placing bid of ₹3,000...`);
    socketA.emit("place_bid", { questionId: q.questionId, amount: 3000, teamId: teamA.teamId });

    await new Promise(r => setTimeout(r, 600));

    // 6. Team A attempts to bid again immediately (should be REJECTED)
    console.log(`\n[Test 2] Team A attempting consecutive bid of ₹3,500 (should be blocked)...`);
    let consecutiveBidBlocked = false;
    socketA.once("bid_error", (err) => {
        console.log(`✅ Correctly blocked consecutive bid: "${err.message}"`);
        consecutiveBidBlocked = true;
    });
    socketA.emit("place_bid", { questionId: q.questionId, amount: 3500, teamId: teamA.teamId });

    await new Promise(r => setTimeout(r, 800));

    // 7. Team B places bid of ₹4,000 (should SUCCEED & notify Team A of outbid)
    console.log(`\n[Test 3] Team B placing bid of ₹4,000...`);
    let outbidReceivedByA = false;
    socketA.once("bid_placed", (data) => {
        if (data.previousBidderTeamId === teamA.teamId && data.highestBidderTeamId === teamB.teamId) {
            console.log(`✅ Team A received OUTBID notification! (New leader: ${data.highestBidderTeamName} at ₹${data.currentBid})`);
            outbidReceivedByA = true;
        }
    });
    socketB.emit("place_bid", { questionId: q.questionId, amount: 4000, teamId: teamB.teamId });

    await new Promise(r => setTimeout(r, 800));

    // 8. Now Team A CAN bid again because they were outbid!
    console.log(`\n[Test 4] Team A placing counter-bid of ₹5,000...`);
    let counterBidSuccess = false;
    socketB.once("bid_placed", (data) => {
        if (data.highestBidderTeamId === teamA.teamId) {
            console.log(`✅ Team A successfully counter-bid for ₹${data.currentBid}!`);
            counterBidSuccess = true;
        }
    });
    socketA.emit("place_bid", { questionId: q.questionId, amount: 5000, teamId: teamA.teamId });

    await new Promise(r => setTimeout(r, 800));

    // 9. Test HARD RESET: Delete all teams, passwords, and questions
    console.log(`\n[Test 5] Admin executing HARD RESET (Delete all teams, passwords & wipe data)...`);
    let wipeEventReceived = false;
    socketA.once("game_wiped", (data) => {
        console.log(`✅ Socket received game_wiped event: "${data.message}"`);
        wipeEventReceived = true;
    });

    const resetRes = await post('/api/admin/hard-reset');
    console.log(`Hard reset response:`, resetRes);

    await new Promise(r => setTimeout(r, 600));

    // 10. Check state after wipe
    const stateAfterWipe = await get('/api/game/state');
    console.log(`Teams count after wipe: ${stateAfterWipe.leaderboard.length}`);

    socketA.disconnect();
    socketB.disconnect();

    if (consecutiveBidBlocked && outbidReceivedByA && counterBidSuccess && wipeEventReceived && stateAfterWipe.leaderboard.length === 0) {
        console.log("\n==========================================");
        console.log("🎯 ALL TESTS PASSED SUCCESSFULLY!");
        console.log("==========================================");
        process.exit(0);
    } else {
        console.error("Some tests failed!");
        process.exit(1);
    }
}

runTest().catch(err => {
    console.error("Test error:", err);
    process.exit(1);
});
