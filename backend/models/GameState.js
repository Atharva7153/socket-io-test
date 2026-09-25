const mongoose = require('mongoose');

const GameStateSchema = new mongoose.Schema({
    matchId: { type: String, default: 'current_match' },
    status: {
        type: String,
        enum: ['WAITING', 'ACTIVE', 'PAUSED', 'ENDED'],
        default: 'WAITING'
    },
    activeAuctionQuestionId: { type: String, default: null },
    auctionRemainingSeconds: { type: Number, default: 0 },
    winnerTeamId: { type: String, default: null },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    announcements: [
        {
            text: String,
            type: { type: String, default: 'info' }, // 'info', 'bid', 'success', 'warning'
            timestamp: { type: Date, default: Date.now }
        }
    ]
});

module.exports = mongoose.models.GameState || mongoose.model('GameState', GameStateSchema);
