import express from 'express';
import yahooFinance from 'yahoo-finance2';
import { OpenAI } from 'openai';
import axios from 'axios';
import * as cheerio from 'cheerio';
import Sentiment from '../models/Sentiment.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Function to scrape article text from the article URL
const getArticleSummary = async (url) => {
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      },
    });

    const $ = cheerio.load(data);

    // Try meta description first
    let summary = $('meta[name="description"]').attr('content');
    if (summary) summary = summary.trim();

    // Fallback: use the first <p> element
    if (!summary || summary.length === 0) {
      summary = $('p').first().text().trim();
    }

    // Additional fallback: try selecting a paragraph within an <article> tag
    if (!summary || summary.length === 0) {
      summary = $('article p').first().text().trim();
    }

    return summary || 'Summary not available.';
  } catch (error) {
    console.error(`Error fetching article summary for ${url}:`, error.message);
    return 'Summary not available.';
  }
};

// Define the /ticker endpoint that performs sentiment analysis
router.get('/ticker', async (req, res) => {
  const ticker = req.query.ticker;
  if (!ticker) {
    return res.status(400).send('Ticker query parameter is required.');
  }

  try {
    // 1️⃣ Fetch news using the Yahoo Finance API
    const newsData = await yahooFinance.search(ticker);
    if (!newsData.news || newsData.news.length === 0) {
      return res.status(404).send('No news articles found.');
    }

    // 2️⃣ Process each article to extract summaries
    const articles = await Promise.all(
      newsData.news.map(async (article) => {
        if (!article.link) return null;
        const summary = await getArticleSummary(article.link);
        return {
          title: article.title,
          summary, // scraped summary for context
          link: article.link,
          source: article.publisher || 'Unknown',
          ticker,
        };
      })
    );

    const validArticles = articles.filter((a) => a !== null);
    if (validArticles.length === 0) {
      return res.status(404).send('No valid articles found.');
    }

    // 3️⃣ Combine articles text for sentiment analysis without repeating information
    const articlesText = validArticles
      .map((a) => `Title: ${a.title}\nSummary: ${a.summary}`)
      .join('\n\n');

    // Build prompt for sentiment analysis
    const prompt = `Analyze the sentiment of the following news articles for the stock "${ticker}". Determine if the overall sentiment is bullish, bearish, or neutral, and provide a sentiment score between -1 (very bearish) and 1 (very bullish). Also, provide a brief explanation of your analysis. Respond in JSON format with keys "sentiment", "score", and "explanation".\n\n${articlesText}`;

    // 4️⃣ Use OpenAI to analyze sentiment
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
    });

    let completionText = response.choices[0].message.content.trim();

    // Remove markdown code fences if present
    if (completionText.startsWith('```')) {
      completionText = completionText.replace(/```(json)?/g, '').trim();
    }

    let sentimentData;
    try {
      sentimentData = JSON.parse(completionText);
    } catch (err) {
      // Fallback: extract sentiment via regex if JSON parsing fails
      const sentimentMatch = completionText.match(/(bullish|bearish|neutral)/i);
      const sentiment = sentimentMatch ? sentimentMatch[1].toLowerCase() : 'neutral';
      const scoreMatch = completionText.match(/(-?\d+(\.\d+)?)/);
      const score = scoreMatch ? parseFloat(scoreMatch[0]) : 0;
      sentimentData = { sentiment, score, explanation: completionText };
    }

    // 5️⃣ Save sentiment analysis result to MongoDB,
    // mapping the explanation to the summary field to avoid repetition.
    const sentimentEntry = await Sentiment.create({
      ticker,
      sentiment: sentimentData.sentiment,
      score: sentimentData.score,
      summary: sentimentData.explanation, // store only the explanation text
    });

    res.json({
      message: 'Sentiment analysis completed successfully.',
      data: sentimentEntry,
    });
  } catch (error) {
    console.error('Error processing ticker sentiment:', error.message);
    res.status(500).send('Failed to process sentiment.');
  }
});

export default router;
