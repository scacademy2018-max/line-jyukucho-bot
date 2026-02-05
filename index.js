import express from "express";
import dotenv from "dotenv";
import { Client, middleware as lineMiddleware } from "@line/bot-sdk";
import OpenAI from "openai";

console.log("🔥 index.js LOADED 🔥");

dotenv.config();

const app = express();

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
   Google Spreadsheet（GAS）
========================= */
const PROMPT_URL = process.env.PROMPT_URL; 
// .env に PROMPT_URL を追加しておく

async function getPrompts() {
  const res = await fetch(PROMPT_URL);
  return await res.json();
}

function pickPrompt(prompts, key) {
  return prompts.find(p => p.key === key);
}

function detectUserType(text) {
  const studentKeywords = [
    "宿題", "テスト", "勉強", "英語", "数学", "わからない",
    "今日の", "提出", "学校", "部活"
  ];

  const parentKeywords = [
    "保護者", "親", "母", "父",
    "成績", "進路", "受験", "費用", "月謝", "料金",
    "面談", "授業料"
  ];

  if (studentKeywords.some(k => text.includes(k))) {
    return "student";
  }

  if (parentKeywords.some(k => text.includes(k))) {
    return "parent";
  }

  return "default";
}

/* =========================
   Webhook（express.json は使わない）
========================= */
app.post(
  "/webhook",
  lineMiddleware({ channelSecret: process.env.LINE_CHANNEL_SECRET }),
  async (req, res) => {
    console.log("Webhook hit!");
    const events = req.body.events || [];

    for (const event of events) {
      if (event.type !== "message" || event.message.type !== "text") continue;

      const userMessage = event.message.text;
      let replyText = "考え中です。少しお待ち下さい。";

      try {
        /* ① プロンプトをスプレッドシートから取得 */
        const prompts = await getPrompts();

        /* ② 使用する system プロンプト */
        const systemPrompt =
          pickPrompt(prompts, "system_default") ?? {
            role: "system",
            content: "あなたは中学生向けの学習サポートAIです。"
          };

        /* ③ messages 構築 */
        const messages = [
          { role: systemPrompt.role, content: systemPrompt.content },
          { role: "user", content: userMessage }
        ];

        /* ④ OpenAI 呼び出し */
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          temperature: 0.3,
          max_tokens: 300
        });

        replyText = completion.choices[0].message.content.trim();
      } catch (err) {
        console.error("OpenAI or Prompt error:", err);
        replyText =
          "すみません、今ちょっと調子が悪いようです。また後で声を掛けてください。";
      }

      try {
        await lineClient.replyMessage(event.replyToken, {
          type: "text",
          text: replyText
        });
        console.log("Reply success");
      } catch (err) {
        console.error("LINE reply error:", err);
      }
    }

    res.sendStatus(200);
  }
);

/* =========================
   Webhook 以外では json OK
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
