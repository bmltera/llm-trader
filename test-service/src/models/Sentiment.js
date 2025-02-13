// src/models/Sentiment.js
import mongoose from 'mongoose';

const sentimentSchema = new mongoose.Schema({
  ticker: { type: String, required: true },
  sentiment: { type: String, required: true }, // bullish, bearish, or neutral
  score: { type: Number, required: true },       // sentiment score from -1 to 1
  summary: { type: String, required: true },       // explanation from the LLM
  timestamp: { type: Date, default: Date.now },
});

const Sentiment =
  mongoose.models.Sentiment || mongoose.model('Sentiment', sentimentSchema);

export default Sentiment;
