const mongoose = require('mongoose');

const TeamSchema = new mongoose.Schema({
    teamId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    password: { type: String, required: true },
    members: {
        type: [mongoose.Schema.Types.Mixed],
        validate: [arr => arr.length <= 4, 'A team can have a maximum of 4 members']
    },
    balance: { type: Number, default: 50000 }, // Starting budget in Rupees: ₹50,000
    score: { type: Number, default: 0 },       // Points / Coins earned
    assignedQuestions: [{ type: String }],     // Array of question IDs won
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Team || mongoose.model('Team', TeamSchema);
