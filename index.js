import express from "express";
import dotenv from "dotenv";
import { Client, middleware as lineMiddleware } from "@line/bot-sdk";
import OpenAI from "openai";

console.log("🔥 index.js LOADED 🔥");

dotenv.config();

const app = express();

/* =========================
   ユーティリティ関数
========================= */

// スプレッドシートから key を探す
function pickPrompt(prompts, key) {
  return prompts.find(p => p.key === key);
}

// 生徒 / 保護者 を自動判定
function detectUserType(text) {
  const studentKeywords = [
    "宿題", "テスト", "勉強", "英語", "数学",
    "わからない", "学校", "提出", "部活"
  ];

  const parentKeywords = [
    "成績", "進路", "受験", "月謝", "料金",
    "費用", "面談", "保護者", "親"
  ];

  if (studentKeywords.some(k => text.includes(k))) return "student";
  if (parentKeywords.some(k => text.includes(k))) return "parent";
  return "default";
}

function detectSubjectKey(text) {
  if (text.match(/英語|英文|english|単語|文法/i)) return "english_help";
  if (text.match(/数学|数式|関数|方程式|平方/i)) return "math_help";
  if (text.match(/理科|電流|細胞|天体|イオン/i)) return "science_help";
  if (text.match(/古文|漢字|文法|指示語|接続語/i)) return "japanese_help";
  if (text.match(/公民|地理|歴史|人権|経済/i)) return "social_help";
  return null;
}

// system prompt を安全に取得
function getSystemPrompt(prompts, key) {
  return (
    pickPrompt(prompts, key) || {
      role: "system",
      content: "あなたは学習塾SCアカデミーの塾長の弟，齋藤翔二（さいとうしょうじ）です。"
    }
  );
}

/* =========================
   LINE SDK 設定
========================= */
const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
};
const lineClient = new Client(lineConfig);

/* =========================
   OpenAI 設定
========================= */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =========================
   プロンプト取得（GAS）
========================= */
const PROMPT_URL = process.env.PROMPT_URL;

async function getPrompts() {
  const res = await fetch(PROMPT_URL);
  return await res.json();
}

/* =========================
   Webhook（⚠ json middleware 不要）
========================= */
app.post(
  "/webhook",
  lineMiddleware({ channelSecret: process.env.LINE_CHANNEL_SECRET }),
  async (req, res) => {

    const events = req.body.events || [];

  for (const event of events) {

  if (event.type !== "message" || event.message.type !== "text") continue;

  let replyText = "";

  const prompts = await getPrompts();

const subjectKey = detectSubjectKey(event.message.text);
const userType = detectUserType(event.message.text);

// 優先順位：教科 → ユーザー種別 → default
let promptKey = subjectKey || userType || "default";

const systemPrompt = getSystemPrompt(prompts, promptKey).content;

console.log("PROMPT KEY:", promptKey);
console.log("SYSTEM PROMPT:", systemPrompt);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: event.message.text }
      ]
    });

    replyText = completion.choices[0].message.content.trim();

  } catch (err) {
    console.error("🔥 OpenAI ERROR 🔥", err);
    replyText = "すみません、今は少し調子が悪いようです。";
  }

  try {
    await lineClient.replyMessage(event.replyToken, {
      type: "text",
      text: replyText
    });
  } catch (err) {
    console.error("LINE reply error:", err);
  }
}

    res.sendStatus(200);
  }
);

/* =========================
   Webhook 以外
========================= */
app.use(express.json());

app.get("/", (req, res) => {
  res.send("LINE AI塾長Bot is running");
});

/* =========================
   サーバー起動
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("LINE_SECRET:", process.env.LINE_CHANNEL_SECRET ? "SET" : "NOT SET");
  console.log("LINE_TOKEN:", process.env.LINE_CHANNEL_ACCESS_TOKEN ? "SET" : "NOT SET");
  console.log("OPENAI_KEY:", process.env.OPENAI_API_KEY ? "SET" : "NOT SET");
  console.log("PROMPT_URL:", process.env.PROMPT_URL ? "SET" : "NOT SET");
});
