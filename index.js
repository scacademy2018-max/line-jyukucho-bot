import express from "express";
import dotenv from "dotenv";
import { Client, middleware as lineMiddleware } from "@line/bot-sdk";
import OpenAI from "openai";
import fs from "fs";
import path from "path";

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

  let imagePath = null;
  let replyText = "";

  // ★ 必ず for の中・try の前 ★
  const prompts = await getPrompts();
  const userType = detectUserType(event.message.text);
  const systemPrompt = getSystemPrompt(prompts, userType).content;

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

    if (replyText.startsWith("【IMAGE_MODE】")) {
      imagePath = generateMathImage(
        replyText.replace("【IMAGE_MODE】", "").trim()
      );
    }

  } catch (err) {
    console.error("🔥 OpenAI ERROR 🔥", err);
    replyText = "すみません、今は少し調子が悪いようです。";
  }

  try {
    if (imagePath) {
      await lineClient.replyMessage(event.replyToken, {
        type: "image",
        originalContentUrl: `${process.env.BASE_URL}/image?path=${encodeURIComponent(imagePath)}`,
        previewImageUrl: `${process.env.BASE_URL}/image?path=${encodeURIComponent(imagePath)}`
      });
    } else {
      await lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: replyText
      });
    }
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

app.get("/image", (req, res) => {
  const filePath = req.query.path;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.sendStatus(404);
  }
  res.sendFile(filePath);
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

function generateMathImage(text) {
  const lines = text.split("\n");

  const lineHeight = 40;
  const width = 900;
  const height = lines.length * lineHeight + 80;

  const svgText = lines.map((line, i) => {
    const safeLine = line
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<text x="40" y="${60 + i * lineHeight}" font-size="28" fill="#000">${safeLine}</text>`;
  }).join("\n");

  const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${svgText}
</svg>
`;

  const filePath = path.join("/tmp", `math_${Date.now()}.svg`);
  fs.writeFileSync(filePath, svgContent, "utf8");

  return filePath;
}
