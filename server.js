import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { marked } from "marked";
import session from "express-session";

dotenv.config();

const app = express();
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); 
app.use(express.static("public"));

// --- SESSION SETUP ---
app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 1 day
  })
);

const selectedModel = "nvidia/nemotron-3-super-120b-a12b:free";

function escapeHtml(unsafe) {
  if (!unsafe) return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- HOME PAGE ---
app.get("/", (req, res) => {
  if (!req.session.chatHistory) req.session.chatHistory = [];
  res.render("index", { chatHistory: req.session.chatHistory });
});

// --- ASK AI ---
app.post("/ask", async (req, res) => {
  const userMessage = (req.body?.message || "").toString().trim();
  if (!userMessage) {
    return res.status(400).json({ error: "No message provided" });
  }

  if (!req.session.chatHistory) req.session.chatHistory = [];

  const userEntry = {
    role: "user",
    content: escapeHtml(userMessage).replace(/\n/g, "<br>"),
    timestamp: Date.now(),
  };
  req.session.chatHistory.push(userEntry);

  try {
    const result = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: selectedModel,
        messages: req.session.chatHistory.map((m) => ({
          role: m.role === "ai" ? "assistant" : m.role,
          content: m.content.replace(/<br>/g, "\n"),
        })),
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 120000,
      }
    );

    const rawReply = result.data.choices?.[0]?.message?.content || "No reply";
    const aiHtml = marked.parse(rawReply);

    const aiEntry = { role: "ai", content: aiHtml, timestamp: Date.now() };
    req.session.chatHistory.push(aiEntry);

    res.json({ aiReply: aiHtml, timestamp: aiEntry.timestamp });
  } catch (err) {
    console.error("=== OPENROUTER API ERROR ===");
    if (err.response) console.error(err.response.status, err.response.data);
    else console.error(err.message);
    console.error("============================");

    const errText = "⚠️ Error: provider or API issue. Please try again later.";
    const aiEntry = { role: "ai", content: escapeHtml(errText), timestamp: Date.now() };
    req.session.chatHistory.push(aiEntry);

    res.status(502).json({ error: errText });
  }
});

// --- CLEAR CHAT ---
app.post("/clear", (req, res) => {
  req.session.chatHistory = [];
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

