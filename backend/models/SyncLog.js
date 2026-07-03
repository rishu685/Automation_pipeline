const mongoose = require("mongoose");

const SyncLogSchema = new mongoose.Schema({
  clientName: {
    type: String,
    required: true,
  },
  clientCompany: {
    type: String,
    default: "Unknown",
  },
  clientEmail: {
    type: String,
    required: true,
  },
  notes: {
    type: String,
    default: "",
  },
  status: {
    type: String,
    enum: ["success", "failed", "simulated"],
    required: true,
  },
  slackSent: {
    type: Boolean,
    default: false,
  },
  emailSent: {
    type: Boolean,
    default: false,
  },
  logs: {
    type: [String],
    default: [],
  },
  onboardedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("SyncLog", SyncLogSchema);
