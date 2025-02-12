import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import yahooFinance from "yahoo-finance2";
import Snapshot from "./models/Snapshot.js";
import "./scraper.js"; // Import the scraper to start news scraping

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Use JSON middleware
app.use(express.json());

// Connect to MongoDB using your connection string from .env
const MONGO_URI = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_CLUSTER}/${process.env.MONGO_DBNAME}?retryWrites=true&w=majority`;

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB Connected..."))
  .catch((error) => {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1);
  });

/**
 * GET /snapshot
 * Query parameter: ticker
 * Fetches current Yahoo Finance quote for the ticker, creates a Snapshot document,
 * and saves it to the database.
 */
app.get("/snapshot", async (req, res) => {
  const ticker = req.query.ticker;
  if (!ticker) {
    return res.status(400).json({ error: "ticker query parameter is required" });
  }
  try {
    // Fetch the current quote for the ticker
    const quote = await yahooFinance.quote(ticker);

    // Create a new snapshot document
    const snapshot = new Snapshot({
      ticker,
      timestamp: new Date(),
      quote,
    });

    // Save the snapshot to MongoDB
    await snapshot.save();

    return res.status(201).json(snapshot);
  } catch (error) {
    console.error("Error in /snapshot endpoint:", error);
    return res.status(500).json({ error: error.toString() });
  }
});

// ------------------------
// Snapshot Scheduling Section
// ------------------------

/**
 * Scheduler to call the /snapshot endpoint every 10 seconds
 * synchronized to the global clock (i.e. at perfect 10-second intervals).
 */
function scheduleSnapshots(ticker) {
  // Calculate delay until next perfect 10-second mark.
  const now = Date.now();
  const delay = 20000 - (now % 20000);
  console.log(`First snapshot call for ${ticker} in ${delay} ms`);

  setTimeout(() => {
    // Call once immediately at the boundary.
    callSnapshotEndpoint(ticker);
    // Then call every 10 seconds thereafter.
    setInterval(() => {
      callSnapshotEndpoint(ticker);
    }, 10000);
  }, delay);
}

/**
 * Calls the /snapshot endpoint for the given ticker.
 * Uses the global fetch (available in Node 18+). If not available, install node-fetch.
 */
async function callSnapshotEndpoint(ticker) {
  try {
    const url = `http://localhost:${PORT}/snapshot?ticker=${ticker}`;
    const response = await fetch(url);
    const data = await response.json();
    console.log(`Snapshot taken at ${new Date().toISOString()} for ${ticker}:`, data);
  } catch (err) {
    console.error("Error calling /snapshot endpoint:", err);
  }
}

// Start scheduling snapshots for each ticker in the snapshot watchlist
const snapshotWatchlist = ["NVDA"]; // Modify as needed
snapshotWatchlist.forEach((ticker) => {
  scheduleSnapshots(ticker);
});

// Start the Express server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
