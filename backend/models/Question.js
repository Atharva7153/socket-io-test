const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
    questionId: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Easy' },
    category: { type: String, default: 'General DSA' },
    description: { type: String, required: true },
    sampleInput: { type: String, default: '' },
    sampleOutput: { type: String, default: '' },
    expectedAnswer: { type: String, default: '' }, // For simple auto-checking
    timeLimitSeconds: { type: Number, default: 180 }, // In seconds
    hiddenRewardCoins: { type: Number, required: true }, // Coins awarded if solved on time (HIDDEN to players until won/solved)
    deductionPenaltyCoins: { type: Number, default: 5000 }, // Coins deducted if late/expired
    baseBid: { type: Number, default: 2000 }, // Starting bid in Rupees
    currentBid: { type: Number, default: 2000 },
    highestBidderTeamId: { type: String, default: null },
    highestBidderTeamName: { type: String, default: null },
    status: {
        type: String,
        enum: ['AVAILABLE', 'BIDDING', 'SOLD', 'SOLVED', 'EXPIRED'],
        default: 'AVAILABLE'
    },
    assignedTeamId: { type: String, default: null },
    assignedTeamName: { type: String, default: null },
    assignedMemberName: { type: String, default: null },
    solveStartTime: { type: Date, default: null },
    solveDeadline: { type: Date, default: null },
    solutionSubmission: {
        code: { type: String, default: '' },
        submittedAt: { type: Date, default: null },
        isLate: { type: Boolean, default: false },
        isCorrect: { type: Boolean, default: false }
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Question || mongoose.model('Question', QuestionSchema);
