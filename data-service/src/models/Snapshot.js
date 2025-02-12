// src/models/Snapshot.js
import mongoose from "mongoose";

const snapshotSchema = new mongoose.Schema({
  ticker: { type: String, required: true },
  timestamp: { type: Date, required: true, default: Date.now },
  quote: { type: Object, required: true },
});

const Snapshot = mongoose.model("Snapshot", snapshotSchema);
export default Snapshot;
