import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import yahooFinance from "yahoo-finance2";
import Snapshot from "./models/Snapshot.js";
import scrapeAgent from "./agents/scrapeAgent.js";
import trashCollectorAgent from "./agents/trashCollectorAgent.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Use JSON middleware
app.use(express.json());

// Use the scrapeAgent and trashCollectorAgent routers
app.use("/scrape", scrapeAgent);
app.use("/trashCollector", trashCollectorAgent);

// Connect to MongoDB using your connection string from .env
const MONGO_URI = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_CLUSTER}/${process.env.MONGO_DBNAME}?retryWrites=true&w=majority`;
mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
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
    return res
      .status(400)
      .json({ error: "ticker query parameter is required" });
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

/**
 * A generic scheduling function that synchronizes the first call to a task at the next interval boundary,
 * then calls it repeatedly at the given interval.
 * @param {Function} taskFn - The task function to execute.
 * @param {number} interval - The interval (in ms) at which to execute the task.
 * @param {string} description - A short description for logging.
 */
function scheduleTask(taskFn, interval, description) {
  const now = Date.now();
  const delay = interval - (now % interval);
  console.log(`First ${description} call in ${delay} ms`);

  setTimeout(() => {
    taskFn();
    setInterval(taskFn, interval);
  }, delay);
}

/**
 * A helper function to call an endpoint and log its output.
 * @param {string} url - The endpoint URL.
 * @param {string} description - Description for logging.
 */
async function callEndpoint(url, description) {
  try {
    const response = await fetch(url);
    const data = await response.json();
    console.log(`${description} at ${new Date().toISOString()}:`, data);
  } catch (error) {
    console.error(`Error calling ${description} endpoint:`, error);
  }
}

// Snapshot watchlist for snapshot and scrape endpoints
const snapshotWatchlist = ["NVDA", "TSLA"]; // Modify as needed

// Schedule tasks for each ticker in the watchlist.
snapshotWatchlist.forEach((ticker) => {
  // Schedule snapshot endpoint every 10 seconds.
  scheduleTask(
    () => callEndpoint(`http://localhost:${PORT}/snapshot?ticker=${ticker}`, `Snapshot for ${ticker}`),
    10000, // 10 seconds in ms
    `Snapshot for ${ticker}`
  );

  // Schedule scrape endpoint every 10 minutes.
  scheduleTask(
    () => callEndpoint(`http://localhost:${PORT}/scrape/ticker?ticker=${ticker}`, `Scrape for ${ticker}`),
    600000, // 10 minutes in ms
    `Scrape for ${ticker}`
  );
});

// Schedule trash collector cleanup every hour.
scheduleTask(
  () => callEndpoint(`http://localhost:${PORT}/trashCollector/clean`, "Trash Collector Clean"),
  3600000, // 1 hour in ms
  "Trash Collector Clean"
);

// Start the Express server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
