const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
    const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/dsa_auction_game";
    try {
        console.log(`[MongoDB] Connecting to: ${mongoUri.replace(/:[^:]*@/, ':****@')} ...`);
        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 4000
        });
        isConnected = true;
        console.log(`[MongoDB] Successfully connected to database!`);
    } catch (err) {
        isConnected = false;
        console.warn(`[MongoDB] Connection notice: ${err.message}`);
        console.warn(`[MongoDB] Running in hybrid memory-first mode. Data is cached in-memory and will persist to MongoDB when connected.`);
        console.warn(`[MongoDB] To connect MongoDB Atlas or local MongoDB, specify MONGODB_URI in backend/.env`);
    }
}

function getIsConnected() {
    return isConnected;
}

module.exports = {
    connectDB,
    getIsConnected,
    mongoose
};
