import mongoose from "mongoose";

const newsSchema = new mongoose.Schema({
  title: { type: String, required: true },
  summary: { type: String, required: true },
  link: { type: String, required: true },
  source: { type: String, required: true },
  ticker: { type: String, required: true },
});

// Check if the model already exists, otherwise define it
const News = mongoose.models.News || mongoose.model("News", newsSchema);

export default News;