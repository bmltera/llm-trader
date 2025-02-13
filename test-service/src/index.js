// src/index.js
import express from "express";
import fs from "fs/promises"; // Use fs.promises to read JSON
import yahooFinance from "yahoo-finance2";
import OpenAI from "openai";
import dotenv from "dotenv";
import mongoose from "mongoose";
import Snapshot from "./models/Snapshot.js"; // Import the Snapshot model
import Sentiment from "./models/Sentiment.js"; // Import the Sentiment model

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Connect to MongoDB using the environment variables
const mongoURI = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_CLUSTER}/${process.env.MONGO_DBNAME}?retryWrites=true&w=majority`;
mongoose
  .connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Initialize OpenAI API
const openai = new OpenAI({ apiKey: process.env.OPENAI_TOKEN });

// Function to load portfolio.json dynamically
const loadPortfolio = async () => {
  try {
    const data = await fs.readFile("./src/data/portfolio.json", "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error loading portfolio.json:", error);
    return { cash: 0, positions: [] }; // Default empty portfolio
  }
};

app.get("/inference", async (req, res) => {
  const ticker = req.query.ticker;
  if (!ticker) {
    return res.status(400).json({ error: "ticker query parameter is required" });
  }

  try {
    // 1. Load portfolio data dynamically
    const portfolio = await loadPortfolio();

    // 2. Fetch current stock data from Yahoo Finance
    const quote = await yahooFinance.quote(ticker);

    // 3. Fetch historical data (last 1 year)
    const today = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(today.getFullYear() - 1);
    const formatDate = (date) => date.toISOString().split("T")[0];

    const historical = await yahooFinance.chart(ticker, {
      period1: formatDate(oneYearAgo),
      period2: formatDate(today),
      interval: "1d",
    });

    // 3.5. Fetch the last 10 snapshots for this ticker sorted by timestamp (most recent first)
    const snapshots = await Snapshot.find({ ticker })
      .sort({ timestamp: -1 })
      .limit(10);

    // 3.6. Fetch the most recent sentiment document for this ticker
    const sentimentDoc = await Sentiment.findOne({ ticker }).sort({ timestamp: -1 });

    // 4. Construct prompt for ChatGPT including snapshot and sentiment data
    const prompt = `
  You are a trading assistant. Given the following data:
  Ticker: ${ticker}
  Current Data: ${JSON.stringify(quote)}
  Historical Data (Last Year): ${JSON.stringify(historical)}
  Portfolio: ${JSON.stringify(portfolio)}
  Snapshots (Last 10): ${JSON.stringify(snapshots)}
  Latest Sentiment: ${JSON.stringify(sentimentDoc)}
  Based on this data, provide a trading decision for ${ticker}.
  Respond in **JSON format** with:
  - "decision": "wait", "sell", or "buy"
  - "quantity": The number of shares to buy/sell, -1 if wait, can be fractional. You cannot spend more than the cash we have.
  - "analysis": Your reasoning.
  - "portfolio after decision": portfolio breakdown after your call. give the cash, each ticker and its quantity
  Only return JSON, no additional commentary or formatting.
      `;
    console.log("GPT prompt:", prompt);

    // 5. Call OpenAI API for decision-making
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    let responseContent = completion.choices[0].message.content;

    // 6. Extract JSON safely
    try {
      // Remove markdown code block if present
      responseContent = responseContent.replace(/```json\n?|```/g, "").trim();

      // Parse the cleaned JSON
      const jsonResponse = JSON.parse(responseContent);

      return res.json(jsonResponse);
    } catch (err) {
      return res.status(500).json({
        error: "Failed to parse ChatGPT response",
        rawResponse: responseContent,
      });
    }
  } catch (error) {
    console.error("Error in /inference:", error);
    return res.status(500).json({ error: error.toString() });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
