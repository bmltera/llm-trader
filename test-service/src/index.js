// src/index.js
import express from "express";
import fs from "fs/promises"; // Use fs.promises to read JSON
import yahooFinance from "yahoo-finance2";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize OpenAI API
const openai = new OpenAI({ apiKey: process.env.OPENAI_TOKEN });

// Function to load portfolio.json dynamically
const loadPortfolio = async () => {
  try {
    const data = await fs.readFile("data/portfolio.json", "utf-8");
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
  
      const historical = await yahooFinance.historical(ticker, {
        period1: formatDate(oneYearAgo),
        period2: formatDate(today),
        interval: "1d",
      });
  
      // 4. Construct prompt for ChatGPT
      const prompt = `
    You are a trading assistant. Given the following data:
    Ticker: ${ticker}
    Current Data: ${JSON.stringify(quote)}
    Historical Data (Last Year): ${JSON.stringify(historical)}
    Portfolio: ${JSON.stringify(portfolio)}
    Cash (USD): $10000
    Based on this data, provide a trading decision for ${ticker}.
    Respond in **JSON format** with:
    - "decision": "wait", "sell", or "buy"
    - "quantity": The number of shares to buy/sell, -1 if wait, can be fractional. You cannot spend more than the cash we have.
    - "analysis": Your reasoning.
    Only return JSON, no additional commentary or formatting.
      `;
  
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
