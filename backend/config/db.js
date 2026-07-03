const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    // Force a 3-second selection timeout to prevent long delays
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 3000
    });
    console.log(`📡 MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.log(`⚠️ MongoDB Connection Muted: ${error.message}`);
    console.log("👉 The server will run, but Sync History logs will not be persisted.");
  }
};

module.exports = connectDB;
