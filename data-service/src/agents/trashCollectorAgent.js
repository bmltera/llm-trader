// trashCollectorAgent.js
import express from "express";
import Sentiment from "../models/Sentiment.js";
import Snapshot from "../models/Snapshot.js";

const router = express.Router();

router.get("/clean", async (req, res) => {
  try {
    let sentimentDeletedCount = 0;
    let snapshotDeletedCount = 0;

    // Clean Sentiment collection: For each ticker, keep only the most recent 200 documents.
    const sentimentTickers = await Sentiment.distinct("ticker");
    for (const ticker of sentimentTickers) {
      // Find the most recent 200 sentiment docs for this ticker.
      const docsToKeep = await Sentiment.find({ ticker })
        .sort({ timestamp: -1 })
        .limit(200)
        .select("_id");

      const keepIds = docsToKeep.map((doc) => doc._id);

      // Delete all sentiment docs for this ticker that are not in the keep list.
      const result = await Sentiment.deleteMany({
        ticker,
        _id: { $nin: keepIds },
      });
      sentimentDeletedCount += result.deletedCount;
    }

    // Clean Snapshot collection: For each ticker, keep only the most recent 200 documents.
    const snapshotTickers = await Snapshot.distinct("ticker");
    for (const ticker of snapshotTickers) {
      // Find the most recent 200 snapshot docs for this ticker.
      const docsToKeep = await Snapshot.find({ ticker })
        .sort({ timestamp: -1 })
        .limit(200)
        .select("_id");

      const keepIds = docsToKeep.map((doc) => doc._id);

      // Delete all snapshot docs for this ticker that are not in the keep list.
      const result = await Snapshot.deleteMany({
        ticker,
        _id: { $nin: keepIds },
      });
      snapshotDeletedCount += result.deletedCount;
    }

    return res.json({
      message: "Cleanup completed successfully.",
      sentimentDeleted: sentimentDeletedCount,
      snapshotDeleted: snapshotDeletedCount,
    });
  } catch (error) {
    console.error("Error during cleanup:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
