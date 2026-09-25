require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const crypto = require('crypto');
const { connectDB, getIsConnected, mongoose } = require('./db');
const TeamModel = require('./models/Team');
const QuestionModel = require('./models/Question');
const GameStateModel = require('./models/GameState');
const defaultQuestions = require('./defaultQuestions');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "DELETE"] }));
app.use(express.json());

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 5000,
    pingInterval: 8000
});

// ==========================================
// IN-MEMORY STATE & DB SYNC
// ==========================================
const teamsMap = new Map(); // teamId -> Team object
const questionsMap = new Map(); // questionId -> Question object
const connectedSockets = new Map(); // socket.id -> { role: 'admin'|'team', teamId: string }

let gameState = {
    status: 'WAITING', // 'WAITING', 'ACTIVE', 'ENDED'
    activeAuctionQuestionId: null,
    auctionRemainingSeconds: 0,
    auctionTimerInterval: null,
    winnerTeamId: null,
    announcements: []
};

function addAnnouncement(text, type = 'info') {
    const item = { text, type, timestamp: new Date() };
    gameState.announcements.unshift(item);
    if (gameState.announcements.length > 30) {
        gameState.announcements.pop();
    }
    io.emit('announcement', item);
    saveGameStateToDB();
}

// Persist helper functions
async function saveTeamToDB(team) {
    if (!getIsConnected()) return;
    try {
        await TeamModel.findOneAndUpdate(
            { teamId: team.teamId },
            team,
            { upsert: true, new: true }
        );
    } catch (err) {
        console.error('[DB] Error saving team:', err.message);
    }
}

async function saveQuestionToDB(q) {
    if (!getIsConnected()) return;
    try {
        await QuestionModel.findOneAndUpdate(
            { questionId: q.questionId },
            q,
            { upsert: true, new: true }
        );
    } catch (err) {
        console.error('[DB] Error saving question:', err.message);
    }
}

async function saveGameStateToDB() {
    if (!getIsConnected()) return;
    try {
        await GameStateModel.findOneAndUpdate(
            { matchId: 'current_match' },
            {
                status: gameState.status,
                activeAuctionQuestionId: gameState.activeAuctionQuestionId,
                auctionRemainingSeconds: gameState.auctionRemainingSeconds,
                winnerTeamId: gameState.winnerTeamId,
                announcements: gameState.announcements
            },
            { upsert: true, new: true }
        );
    } catch (err) {
        console.error('[DB] Error saving gameState:', err.message);
    }
}

// Build state for client (redacting hidden rewards for teams when appropriate)
function getClientQuestions(forAdmin = false, viewerTeamId = null) {
    const list = [];
    for (const q of questionsMap.values()) {
        const item = { ...q };
        // If not admin, and question is not solved or owned by viewer, hide the reward
        if (!forAdmin) {
            const isAssignedToViewer = viewerTeamId && item.assignedTeamId === viewerTeamId;
            const isSolved = item.status === 'SOLVED';
            if (!isAssignedToViewer && !isSolved) {
                item.hiddenRewardCoins = null; // HIDDEN to players during bidding / in pool
                item.isRewardHidden = true;
            } else {
                item.isRewardHidden = false;
            }
        } else {
            item.isRewardHidden = false;
        }
        list.push(item);
    }
    return list;
}

function getLeaderboard() {
    const list = Array.from(teamsMap.values()).map(t => ({
        teamId: t.teamId,
        name: t.name,
        members: t.members,
        balance: t.balance,
        score: t.score,
        solvedCount: (t.assignedQuestions || []).filter(qid => {
            const q = questionsMap.get(qid);
            return q && q.status === 'SOLVED';
        }).length
    }));

    // Rank primarily by Score (Coins), secondarily by remaining Balance (Rupees)
    list.sort((a, b) => b.score !== a.score ? b.score - a.score : b.balance - a.balance);
    return list;
}

function getFullGameStatePayload(forAdmin = false, viewerTeamId = null) {
    return {
        status: gameState.status,
        activeAuctionQuestionId: gameState.activeAuctionQuestionId,
        activeAuctionQuestion: gameState.activeAuctionQuestionId
            ? getClientQuestions(forAdmin, viewerTeamId).find(q => q.questionId === gameState.activeAuctionQuestionId)
            : null,
        auctionRemainingSeconds: gameState.auctionRemainingSeconds,
        winnerTeamId: gameState.winnerTeamId,
        winner: gameState.winnerTeamId ? teamsMap.get(gameState.winnerTeamId) : null,
        leaderboard: getLeaderboard(),
        questions: getClientQuestions(forAdmin, viewerTeamId),
        announcements: gameState.announcements,
        dbConnected: getIsConnected()
    };
}

function broadcastGameState() {
    // Send customized view to each socket
    for (const [socketId, meta] of connectedSockets.entries()) {
        const sock = io.sockets.sockets.get(socketId);
        if (sock) {
            const isAdmin = meta.role === 'admin';
            const teamId = meta.teamId || null;
            sock.emit('game_state', getFullGameStatePayload(isAdmin, teamId));
        }
    }
}

// Initialize seed questions if empty
async function initQuestions() {
    if (questionsMap.size === 0) {
        for (const t of defaultQuestions) {
            const qId = 'q_' + crypto.randomBytes(3).toString('hex');
            const qObj = {
                questionId: qId,
                title: t.title,
                difficulty: t.difficulty,
                category: t.category,
                description: t.description,
                sampleInput: t.sampleInput,
                sampleOutput: t.sampleOutput,
                expectedAnswer: t.expectedAnswer,
                timeLimitSeconds: t.timeLimitSeconds,
                hiddenRewardCoins: t.hiddenRewardCoins,
                deductionPenaltyCoins: t.deductionPenaltyCoins,
                baseBid: t.baseBid,
                currentBid: t.baseBid,
                highestBidderTeamId: null,
                highestBidderTeamName: null,
                status: 'AVAILABLE',
                assignedTeamId: null,
                assignedTeamName: null,
                solveStartTime: null,
                solveDeadline: null,
                solutionSubmission: {
                    code: '',
                    submittedAt: null,
                    isLate: false,
                    isCorrect: false
                },
                createdAt: new Date()
            };
            questionsMap.set(qId, qObj);
            await saveQuestionToDB(qObj);
        }
        console.log(`[Init] Loaded ${questionsMap.size} default DSA questions.`);
    }
}

// Background solver timer loop: Checks active sold questions for expired deadlines
setInterval(() => {
    let stateChanged = false;
    const now = Date.now();

    for (const q of questionsMap.values()) {
        if (q.status === 'SOLD' && q.solveDeadline) {
            const deadlineTime = new Date(q.solveDeadline).getTime();
            if (now > deadlineTime) {
                // Time has expired! Apply late penalty
                q.status = 'EXPIRED';
                q.solutionSubmission.isLate = true;
                const team = teamsMap.get(q.assignedTeamId);
                if (team) {
                    const penalty = q.deductionPenaltyCoins || 5000;
                    team.score -= penalty; // Deduct penalty reward
                    saveTeamToDB(team);
                    addAnnouncement(`⏰ Time EXPIRED for "${team.name}" on problem "${q.title}"! Penalty: -${penalty} coins!`, 'warning');
                }
                saveQuestionToDB(q);
                stateChanged = true;
            }
        }
    }

    if (stateChanged) {
        broadcastGameState();
    }
}, 1000);

// ==========================================
// REST APIS
// ==========================================

// 1. Admin Login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        return res.json({ success: true, message: "Admin authenticated", isAdmin: true });
    }
    return res.status(401).json({ success: false, message: "Invalid admin credentials" });
});

// Helper to format members with roles
function normalizeMembers(membersInput) {
    if (!Array.isArray(membersInput)) return [];
    return membersInput.slice(0, 4).map((m, index) => {
        const defaultRole = index === 0 ? "Team Leader" : index === 1 ? "Algo Specialist" : index === 2 ? "Code Implementer" : "Tester & Optimizer";
        if (typeof m === 'string') {
            return {
                name: m.trim(),
                role: defaultRole,
                isLeader: index === 0
            };
        } else if (typeof m === 'object' && m !== null) {
            return {
                name: (m.name || `Member ${index + 1}`).trim(),
                role: m.role || defaultRole,
                isLeader: Boolean(m.isLeader !== undefined ? m.isLeader : (index === 0))
            };
        }
        return { name: `Member ${index + 1}`, role: defaultRole, isLeader: index === 0 };
    }).filter(m => m.name.length > 0);
}

// 2. Team Login (Supports personal login by selecting member name)
app.post('/api/team/login', (req, res) => {
    const { teamIdentifier, password, memberName } = req.body;
    if (!teamIdentifier || !password) {
        return res.status(400).json({ success: false, message: "Team ID / Name and password required" });
    }

    let team = null;
    for (const t of teamsMap.values()) {
        if ((t.teamId.toLowerCase() === teamIdentifier.toLowerCase() || t.name.toLowerCase() === teamIdentifier.toLowerCase()) && t.password === password) {
            team = t;
            break;
        }
    }

    if (!team) {
        return res.status(401).json({ success: false, message: "Invalid team credentials" });
    }

    const members = normalizeMembers(team.members);
    team.members = members;

    let member = null;
    if (memberName) {
        member = members.find(m => m.name.toLowerCase() === memberName.trim().toLowerCase());
    }
    if (!member && members.length > 0) {
        member = members[0];
    }

    return res.json({ success: true, team, member, members });
});

// 3. Admin Generate Team
app.post('/api/admin/teams', async (req, res) => {
    const { name, password, members } = req.body;
    if (!name || !password) {
        return res.status(400).json({ success: false, message: "Team name and password required" });
    }

    const cleanMembers = normalizeMembers(members);

    const teamId = 'team_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 15) + '_' + crypto.randomBytes(2).toString('hex');
    const newTeam = {
        teamId,
        name: name.trim(),
        password: password.trim(),
        members: cleanMembers,
        balance: 50000, // Starts with ₹50,000
        score: 0,       // Starts with 0 coins
        assignedQuestions: [],
        createdAt: new Date()
    };

    teamsMap.set(teamId, newTeam);
    await saveTeamToDB(newTeam);
    addAnnouncement(`🎉 New team registered: "${newTeam.name}" with ₹50,000 budget!`, 'info');
    broadcastGameState();

    res.json({ success: true, team: newTeam });
});

// 4. Admin Seed 3 Test Teams for instant testing with role assignments
app.post('/api/admin/seed-teams', async (req, res) => {
    const sampleTeams = [
        {
            name: "Team Binary Beasts",
            password: "123",
            members: [
                { name: "Arjun", role: "Team Leader", isLeader: true },
                { name: "Rohan", role: "Algo Specialist", isLeader: false },
                { name: "Priya", role: "Code Implementer", isLeader: false },
                { name: "Sneha", role: "Tester & Optimizer", isLeader: false }
            ]
        },
        {
            name: "Team Cyber Knights",
            password: "123",
            members: [
                { name: "Dev", role: "Team Leader", isLeader: true },
                { name: "Aarav", role: "Algo Specialist", isLeader: false },
                { name: "Meera", role: "Code Implementer", isLeader: false },
                { name: "Ananya", role: "Tester & Optimizer", isLeader: false }
            ]
        },
        {
            name: "Team Dynamic Wizards",
            password: "123",
            members: [
                { name: "Kabir", role: "Team Leader", isLeader: true },
                { name: "Zara", role: "Algo Specialist", isLeader: false },
                { name: "Vikram", role: "Code Implementer", isLeader: false },
                { name: "Isha", role: "Tester & Optimizer", isLeader: false }
            ]
        }
    ];

    const created = [];
    for (const st of sampleTeams) {
        const teamId = 'team_' + st.name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 15);
        const team = {
            teamId,
            name: st.name,
            password: st.password,
            members: st.members,
            balance: 50000,
            score: 0,
            assignedQuestions: [],
            createdAt: new Date()
        };
        teamsMap.set(teamId, team);
        await saveTeamToDB(team);
        created.push(team);
    }

    addAnnouncement(`✨ 3 demo teams created with 4 role-based members each! (Password: 123)`, 'info');
    broadcastGameState();
    res.json({ success: true, teams: created });
});

// 5. Admin Seed Default DSA Questions
app.post('/api/admin/seed-questions', async (req, res) => {
    await initQuestions();
    broadcastGameState();
    res.json({ success: true, count: questionsMap.size });
});

// 6. Admin Add Custom DSA Question
app.post('/api/admin/questions', async (req, res) => {
    const {
        title, difficulty, category, description,
        sampleInput, sampleOutput, expectedAnswer,
        timeLimitSeconds, hiddenRewardCoins, deductionPenaltyCoins, baseBid
    } = req.body;

    if (!title || !description || !hiddenRewardCoins) {
        return res.status(400).json({ success: false, message: "Title, description, and hidden reward coins required" });
    }

    const qId = 'q_' + crypto.randomBytes(3).toString('hex');
    const newQ = {
        questionId: qId,
        title: title.trim(),
        difficulty: difficulty || 'Easy',
        category: category || 'General DSA',
        description: description.trim(),
        sampleInput: sampleInput || '',
        sampleOutput: sampleOutput || '',
        expectedAnswer: expectedAnswer || '',
        timeLimitSeconds: Number(timeLimitSeconds) || 180,
        hiddenRewardCoins: Number(hiddenRewardCoins),
        deductionPenaltyCoins: Number(deductionPenaltyCoins) || 5000,
        baseBid: Number(baseBid) || 2000,
        currentBid: Number(baseBid) || 2000,
        highestBidderTeamId: null,
        highestBidderTeamName: null,
        status: 'AVAILABLE',
        assignedTeamId: null,
        assignedTeamName: null,
        solveStartTime: null,
        solveDeadline: null,
        solutionSubmission: {
            code: '',
            submittedAt: null,
            isLate: false,
            isCorrect: false
        },
        createdAt: new Date()
    };

    questionsMap.set(qId, newQ);
    await saveQuestionToDB(newQ);
    addAnnouncement(`📝 New DSA Question added to auction pool: "${newQ.title}"`, 'info');
    broadcastGameState();

    res.json({ success: true, question: newQ });
});

// 7. Admin Game Controls
app.post('/api/admin/start-game', (req, res) => {
    gameState.status = 'ACTIVE';
    gameState.startedAt = new Date();
    addAnnouncement(`🚀 THE GAME HAS OFFICIALLY STARTED! DSA questions are now ready for bidding!`, 'success');
    saveGameStateToDB();
    broadcastGameState();
    res.json({ success: true, status: gameState.status });
});

app.post('/api/admin/end-game', (req, res) => {
    gameState.status = 'ENDED';
    gameState.endedAt = new Date();
    const ranked = getLeaderboard();
    const winner = ranked.length > 0 ? ranked[0] : null;
    gameState.winnerTeamId = winner ? winner.teamId : null;

    if (winner) {
        addAnnouncement(`🏆 GAME OVER! Winner is ${winner.name} with ${winner.score} coins!`, 'success');
    } else {
        addAnnouncement(`🏆 GAME OVER!`, 'success');
    }

    saveGameStateToDB();
    broadcastGameState();
    res.json({ success: true, winner });
});

app.post('/api/admin/reset', async (req, res) => {
    // Reset all teams back to 50k, reset all questions back to available
    for (const t of teamsMap.values()) {
        t.balance = 50000;
        t.score = 0;
        t.assignedQuestions = [];
        await saveTeamToDB(t);
    }
    for (const q of questionsMap.values()) {
        q.status = 'AVAILABLE';
        q.currentBid = q.baseBid;
        q.highestBidderTeamId = null;
        q.highestBidderTeamName = null;
        q.assignedTeamId = null;
        q.assignedTeamName = null;
        q.solveStartTime = null;
        q.solveDeadline = null;
        q.solutionSubmission = { code: '', submittedAt: null, isLate: false, isCorrect: false };
        await saveQuestionToDB(q);
    }
    if (gameState.auctionTimerInterval) {
        clearInterval(gameState.auctionTimerInterval);
        gameState.auctionTimerInterval = null;
    }
    gameState.status = 'WAITING';
    gameState.activeAuctionQuestionId = null;
    gameState.auctionRemainingSeconds = 0;
    gameState.winnerTeamId = null;
    gameState.announcements = [];
    addAnnouncement(`🔄 Game soft reset. All teams reset to ₹50,000 balance!`, 'info');
    saveGameStateToDB();
    broadcastGameState();
    res.json({ success: true, message: "Game reset" });
});

// Hard Reset: Completely wipe all teams, passwords, and data
app.post('/api/admin/hard-reset', async (req, res) => {
    try {
        if (gameState.auctionTimerInterval) {
            clearInterval(gameState.auctionTimerInterval);
            gameState.auctionTimerInterval = null;
        }

        // Delete all teams from memory and DB
        teamsMap.clear();
        if (getIsConnected()) {
            await TeamModel.deleteMany({});
        }

        // Reset questions
        questionsMap.clear();
        if (getIsConnected()) {
            await QuestionModel.deleteMany({});
        }
        await initQuestions();

        // Reset GameState
        gameState.status = 'WAITING';
        gameState.activeAuctionQuestionId = null;
        gameState.auctionRemainingSeconds = 0;
        gameState.winnerTeamId = null;
        gameState.announcements = [];
        if (getIsConnected()) {
            await GameStateModel.deleteMany({});
        }

        addAnnouncement(`🚨 COMPLETE RESET: All teams, passwords, and records have been deleted!`, 'warning');
        saveGameStateToDB();

        // Kick all teams back to login
        io.emit('game_wiped', {
            message: "Admin has completely wiped all teams and match data. Please create/join a team again."
        });

        broadcastGameState();
        console.log(`[Admin] HARD RESET EXECUTED: All teams, credentials, and match state wiped.`);
        res.json({ success: true, message: "All teams, passwords, and data have been wiped." });
    } catch (err) {
        console.error('[Admin] Hard reset error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 8. Start Auction on a Question
function startAuctionForQuestion(questionId, durationSeconds = 30) {
    const q = questionsMap.get(questionId);
    if (!q) return false;

    // Reset previous timer if any
    if (gameState.auctionTimerInterval) {
        clearInterval(gameState.auctionTimerInterval);
    }

    q.status = 'BIDDING';
    q.currentBid = q.baseBid;
    q.highestBidderTeamId = null;
    q.highestBidderTeamName = null;
    q.bidsHistory = [
        {
            type: 'start',
            bidderName: 'Base Bid',
            amount: q.baseBid,
            timestamp: new Date()
        }
    ];

    gameState.activeAuctionQuestionId = questionId;
    gameState.auctionRemainingSeconds = durationSeconds;

    addAnnouncement(`🔨 Auction STARTED for "${q.title}"! Base Bid: ₹${q.baseBid}. Secret Reward inside!`, 'bid');
    saveQuestionToDB(q);
    saveGameStateToDB();
    broadcastGameState();

    gameState.auctionTimerInterval = setInterval(() => {
        gameState.auctionRemainingSeconds--;

        if (gameState.auctionRemainingSeconds <= 0) {
            clearInterval(gameState.auctionTimerInterval);
            gameState.auctionTimerInterval = null;
            finalizeAuction(questionId);
        } else {
            io.emit('auction_tick', {
                questionId,
                remainingSeconds: gameState.auctionRemainingSeconds
            });
        }
    }, 1000);

    return true;
}

function finalizeAuction(questionId) {
    const q = questionsMap.get(questionId);
    if (!q) return;

    if (q.highestBidderTeamId) {
        // We have a winning team!
        const winningTeam = teamsMap.get(q.highestBidderTeamId);
        if (winningTeam) {
            // Deduct bid money from team's 50k balance
            winningTeam.balance = Math.max(0, winningTeam.balance - q.currentBid);
            if (!winningTeam.assignedQuestions.includes(q.questionId)) {
                winningTeam.assignedQuestions.push(q.questionId);
            }
            saveTeamToDB(winningTeam);

            // Assign question to team & start solve timer
            q.status = 'SOLD';
            q.assignedTeamId = winningTeam.teamId;
            q.assignedTeamName = winningTeam.name;
            q.assignedMemberName = null; // Unassigned until chosen by leader or team member
            q.solveStartTime = new Date();
            q.solveDeadline = new Date(Date.now() + (q.timeLimitSeconds * 1000));

            addAnnouncement(
                `🎉 SOLD! "${q.title}" bought by ${winningTeam.name} for ₹${q.currentBid}! Team can now assign a member to solve it (${q.timeLimitSeconds}s)!`,
                'success'
            );
        }
    } else {
        // No bids placed
        q.status = 'AVAILABLE';
        addAnnouncement(`🔨 Auction ended with NO BIDS for "${q.title}". Returned to pool.`, 'info');
    }

    gameState.activeAuctionQuestionId = null;
    gameState.auctionRemainingSeconds = 0;

    saveQuestionToDB(q);
    saveGameStateToDB();
    broadcastGameState();
}

app.post('/api/admin/start-auction', (req, res) => {
    const { questionId, duration } = req.body;
    const ok = startAuctionForQuestion(questionId, Number(duration) || 30);
    if (!ok) return res.status(400).json({ success: false, message: "Question not found" });
    res.json({ success: true, activeAuctionQuestionId: questionId });
});

app.post('/api/admin/end-auction', (req, res) => {
    if (gameState.activeAuctionQuestionId) {
        if (gameState.auctionTimerInterval) {
            clearInterval(gameState.auctionTimerInterval);
            gameState.auctionTimerInterval = null;
        }
        finalizeAuction(gameState.activeAuctionQuestionId);
        return res.json({ success: true });
    }
    return res.status(400).json({ success: false, message: "No active auction" });
});

// 9. Get Game State
app.get('/api/game/state', (req, res) => {
    res.json(getFullGameStatePayload(true));
});

// ==========================================
// SOCKET.IO REAL-TIME COMMUNICATION
// ==========================================
io.on("connection", (socket) => {
    connectedSockets.set(socket.id, { role: 'guest', teamId: null });

    // Send initial snapshot
    socket.emit('game_state', getFullGameStatePayload(false));

    // Admin identification
    socket.on('admin_auth', (token) => {
        connectedSockets.set(socket.id, { role: 'admin', teamId: null });
        socket.emit('game_state', getFullGameStatePayload(true));
    });

    // Team identification
    socket.on('team_join', (data) => {
        const teamId = data && data.teamId;
        const team = teamsMap.get(teamId);
        if (team) {
            connectedSockets.set(socket.id, { role: 'team', teamId: team.teamId });
            socket.join(`team_${team.teamId}`);
            socket.emit('game_state', getFullGameStatePayload(false, team.teamId));
            console.log(`[Socket] Team "${team.name}" joined (${socket.id})`);
        }
    });

    // Team Place Bid
    socket.on('place_bid', (data) => {
        const meta = connectedSockets.get(socket.id);
        const teamId = meta && meta.teamId ? meta.teamId : (data && data.teamId);
        const team = teamsMap.get(teamId);

        if (!team) {
            return socket.emit('bid_error', { message: "You must be logged in as a team to bid!" });
        }

        if (gameState.status !== 'ACTIVE') {
            return socket.emit('bid_error', { message: "The game has not started yet!" });
        }

        const q = questionsMap.get(data.questionId);
        if (!q || q.status !== 'BIDDING') {
            return socket.emit('bid_error', { message: "This question is not currently open for bidding!" });
        }

        const amount = Number(data.amount);
        if (isNaN(amount) || amount <= 0) {
            return socket.emit('bid_error', { message: "Invalid bid amount!" });
        }

        // Team cannot bid again if they are already the highest bidder!
        if (q.highestBidderTeamId === team.teamId) {
            return socket.emit('bid_error', { message: "You already hold the highest bid! Wait for another team to bid before bidding again." });
        }

        // Must exceed current bid
        if (amount <= q.currentBid) {
            return socket.emit('bid_error', { message: `Bid must be higher than current bid ₹${q.currentBid}!` });
        }

        // Must have sufficient balance
        if (team.balance < amount) {
            return socket.emit('bid_error', { message: `Insufficient balance! You have ₹${team.balance}, but bid is ₹${amount}.` });
        }

        const previousBidderTeamId = q.highestBidderTeamId;
        const previousBidderTeamName = q.highestBidderTeamName;

        // Valid bid!
        q.currentBid = amount;
        q.highestBidderTeamId = team.teamId;
        q.highestBidderTeamName = team.name;

        if (!Array.isArray(q.bidsHistory)) q.bidsHistory = [];
        q.bidsHistory.unshift({
            type: 'bid',
            bidderName: team.name,
            bidderId: team.teamId,
            amount,
            outbidName: previousBidderTeamName || null,
            timestamp: new Date()
        });

        addAnnouncement(`💰 ${team.name} placed bid of ₹${amount} on "${q.title}"!`, 'bid');
        saveQuestionToDB(q);

        // Notify all clients immediately with full context for the live side feed
        io.emit('bid_placed', {
            questionId: q.questionId,
            questionTitle: q.title,
            currentBid: q.currentBid,
            highestBidderTeamId: team.teamId,
            highestBidderTeamName: team.name,
            previousBidderTeamId,
            previousBidderTeamName,
            bidAmount: amount,
            bidsHistory: q.bidsHistory
        });

        broadcastGameState();
    });

    // Team Assigns Problem to a specific team member to solve (or leader)
    socket.on('assign_question', (data) => {
        const meta = connectedSockets.get(socket.id);
        const teamId = meta && meta.teamId ? meta.teamId : (data && data.teamId);
        const team = teamsMap.get(teamId);

        if (!team) {
            return socket.emit('assign_error', { message: "Team not identified." });
        }

        const q = questionsMap.get(data.questionId);
        if (!q || q.assignedTeamId !== team.teamId) {
            return socket.emit('assign_error', { message: "Problem not found or not owned by your team." });
        }

        const memberName = (data.memberName || '').trim();
        if (!memberName) {
            return socket.emit('assign_error', { message: "Please select a member to assign." });
        }

        q.assignedMemberName = memberName;
        saveQuestionToDB(q);

        addAnnouncement(`📋 Team "${team.name}" assigned problem "${q.title}" to ${memberName}!`, 'info');
        io.emit('question_assigned', {
            questionId: q.questionId,
            assignedMemberName: memberName
        });

        broadcastGameState();
    });

    // Team Submit Solution
    socket.on('submit_solution', (data) => {
        const meta = connectedSockets.get(socket.id);
        const teamId = meta && meta.teamId ? meta.teamId : (data && data.teamId);
        const team = teamsMap.get(teamId);

        if (!team) {
            return socket.emit('submit_error', { message: "Team not identified." });
        }

        const q = questionsMap.get(data.questionId);
        if (!q) {
            return socket.emit('submit_error', { message: "Question not found." });
        }

        if (q.assignedTeamId !== team.teamId) {
            return socket.emit('submit_error', { message: "Your team does not own this question!" });
        }

        if (q.status === 'SOLVED') {
            return socket.emit('submit_error', { message: "This question is already solved!" });
        }

        const codeOrAnswer = (data.codeOrAnswer || '').trim();
        if (!codeOrAnswer) {
            return socket.emit('submit_error', { message: "Please provide your solution or output." });
        }

        const now = Date.now();
        const deadline = q.solveDeadline ? new Date(q.solveDeadline).getTime() : 0;
        const isLate = now > deadline;

        // Solution verification:
        const expected = (q.expectedAnswer || '').trim().toLowerCase();
        const submitted = codeOrAnswer.toLowerCase();

        const isCorrect = expected.length > 0
            ? submitted.includes(expected) || submitted === expected || codeOrAnswer.replace(/\s+/g, '') === q.expectedAnswer.replace(/\s+/g, '')
            : true;

        if (!isCorrect) {
            return socket.emit('submit_error', {
                message: `Incorrect output or test failed! Expected sample: "${q.sampleOutput || q.expectedAnswer}". Keep trying before the time runs out!`
            });
        }

        // It is correct!
        const solverName = data.memberName || q.assignedMemberName || "Team Member";
        q.solutionSubmission = {
            code: codeOrAnswer,
            submittedAt: new Date(),
            submittedBy: solverName,
            isLate,
            isCorrect: true
        };

        if (!isLate) {
            // SOLVED ON TIME! Award hidden reward coins
            q.status = 'SOLVED';
            const reward = q.hiddenRewardCoins;
            team.score += reward;

            addAnnouncement(
                `🏆 ${team.name} (${solverName}) SOLVED "${q.title}" IN TIME! Hidden reward revealed: +${reward} coins!`,
                'success'
            );
            socket.emit('solve_success', {
                questionId: q.questionId,
                rewardCoins: reward,
                message: `Congratulations! Solved within time limit. You earned ${reward} coins!`
            });
        } else {
            // LATE SUBMISSION! Deduct penalty coins
            q.status = 'EXPIRED';
            const penalty = q.deductionPenaltyCoins;
            team.score -= penalty;

            addAnnouncement(
                `⚠️ ${team.name} solved "${q.title}" LATE! Deducted penalty: -${penalty} coins!`,
                'warning'
            );
            socket.emit('solve_late', {
                questionId: q.questionId,
                penaltyCoins: penalty,
                message: `Solved, but time was up! Penalty of ${penalty} coins deducted.`
            });
        }

        saveTeamToDB(team);
        saveQuestionToDB(q);
        broadcastGameState();
    });

    // Admin manual mark solved / override
    socket.on('admin_mark_solved', (data) => {
        const meta = connectedSockets.get(socket.id);
        if (meta.role !== 'admin') return;

        const q = questionsMap.get(data.questionId);
        if (!q || !q.assignedTeamId) return;

        const team = teamsMap.get(q.assignedTeamId);
        if (!team) return;

        q.status = 'SOLVED';
        team.score += q.hiddenRewardCoins;

        addAnnouncement(`Admin verified solution for "${q.title}"! ${team.name} awarded +${q.hiddenRewardCoins} coins!`, 'success');
        saveTeamToDB(team);
        saveQuestionToDB(q);
        broadcastGameState();
    });

    socket.on("disconnect", () => {
        connectedSockets.delete(socket.id);
    });
});

// ==========================================
// SERVER STARTUP & DB RESTORATION
// ==========================================
async function startServer() {
    await connectDB();

    // If DB is connected, restore teams and questions from DB
    if (getIsConnected()) {
        try {
            const dbTeams = await TeamModel.find({});
            for (const t of dbTeams) {
                teamsMap.set(t.teamId, t.toObject());
            }
            console.log(`[DB] Restored ${teamsMap.size} teams from MongoDB.`);

            const dbQuestions = await QuestionModel.find({});
            for (const q of dbQuestions) {
                questionsMap.set(q.questionId, q.toObject());
            }
            console.log(`[DB] Restored ${questionsMap.size} questions from MongoDB.`);
        } catch (err) {
            console.error('[DB] Error loading initial data:', err.message);
        }
    }

    // Initialize default questions if map is still empty
    if (questionsMap.size === 0) {
        await initQuestions();
    }

    server.listen(PORT, () => {
        console.log(`===============================================`);
        console.log(`🚀 DSA Auction Game Backend running on port ${PORT}`);
        console.log(`🔑 Admin Credentials: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
        console.log(`💰 Starting Team Budget: ₹50,000`);
        console.log(`🗄️ MongoDB Status: ${getIsConnected() ? 'CONNECTED' : 'STANDBY (Memory Mode)'}`);
        console.log(`===============================================`);
    });
}

startServer();