import axios from "axios";
import { load } from "cheerio"; // Import the load function from cheerio
import cron from "node-cron";
import mongoose from "mongoose";

// Define a Mongoose schema/model for news articles
const newsSchema = new mongoose.Schema({
  title: String,
  summary: String,
  link: String,
  source: String,
  ticker: String,
  date: { type: Date, default: Date.now },
});
const News = mongoose.models.News || mongoose.model("News", newsSchema);

/**
 * Scrape general financial news from Yahoo Finance homepage.
 */
const scrapeGeneralFinanceNews = async () => {
  try {
    console.log("Scraping general financial news...");
    const url = "https://finance.yahoo.com";
    const { data } = await axios.get(url);
    const $ = load(data); // Use the load function

    const articles = [];

    // Adjust the selector as needed; Yahoo Finance homepage layout may change.
    $(".js-stream-content a").each((index, element) => {
      const title = $(element).text().trim();
      const href = $(element).attr("href");
      const link = href && href.startsWith("http") ? href : url + href;
      const summary = ""; // No summary available on the homepage
      if (title && link) {
        articles.push({ title, summary, link, source: "Yahoo Finance", ticker: "GENERAL" });
      }
    });

    if (articles.length > 0) {
      await News.insertMany(articles, { ordered: false }).catch(() => {
        console.log("Some duplicate general news entries were skipped.");
      });
      console.log("General financial news scraped and stored.");
    } else {
      console.log("No general news articles found.");
    }
  } catch (error) {
    console.error("Error scraping general financial news:", error.message);
  }
};

/**
 * Scrape stock-specific news for a given ticker from Yahoo Finance.
 * @param {string} ticker - The stock ticker symbol to search news for.
 */
const scrapeStockNews = async (ticker) => {
  try {
    console.log(`Scraping news for ${ticker}...`);
    const url = `https://finance.yahoo.com/quote/${ticker}/news?p=${ticker}`;
    const { data } = await axios.get(url);
    const $ = load(data); // Use the load function

    const articles = [];

    $(".js-stream-content a").each((index, element) => {
      const title = $(element).text().trim();
      const href = $(element).attr("href");
      const link = href && href.startsWith("http") ? href : "https://finance.yahoo.com" + href;
      const summary = ""; // No summary available by default
      // Basic filtering: include articles that mention the ticker
      if (title && link && title.toUpperCase().includes(ticker.toUpperCase())) {
        articles.push({ title, summary, link, source: "Yahoo Finance", ticker });
      }
    });

    if (articles.length > 0) {
      await News.insertMany(articles, { ordered: false }).catch(() => {
        console.log(`Some duplicate news entries for ${ticker} were skipped.`);
      });
      console.log(`News for ${ticker} scraped and stored.`);
    } else {
      console.log(`No news articles found for ${ticker}.`);
    }
  } catch (error) {
    console.error(`Error scraping news for ${ticker}:`, error.message);
  }
};

// Define the watchlist for stock-specific news
const newsWatchlist = ["AAPL", "TSLA", "GOOGL"]; // Modify this array as needed

// Schedule news scraping every 15 minutes using node-cron
cron.schedule("*/1 * * * *", async () => {
  console.log("Running scheduled news scraping...");
  await scrapeGeneralFinanceNews();
  for (const ticker of newsWatchlist) {
    await scrapeStockNews(ticker);
  }
});

console.log("News scraper scheduled to run every 15 minutes.");
