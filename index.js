import express from "express";
import dotenv from "dotenv";
import { Client, middleware as lineMiddleware } from "@line/bot-sdk";
import OpenAI from "openai";
import fetch from "node-fetch";

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
   GAS（プロンプト取得）
========================= */
const PROMPT_URL = process.env.PROMPT_URL;

async function getPrompts() {
  if (!PROMPT_URL) return [];
  const res = await fetch(PROMPT_URL);
  if (!res.ok) throw new Error("Prompt fetch failed");
  return await res.json();
}

function pickPrompt(prompts, key) {
  return prompts.find(p => p.key === key);
}

/* =========================
   判定系（簡易）
========================= */
function detectUserType(text) {
  if (/保護者|親|母|父|入塾|料金|月謝/.test(text)) return "parent";
  return "student";
}

/* =========================
   Webhook
   ※ express.json() は使わない
========================= */
app.post(
  "/webhook",
  lineMiddleware({ channelSecret: process.env.LINE_CHANNEL_SECRET }),
  async (req, res) => {
    console.log("=== WEBHOOK START ===");

    try {
      const events = req.body.events || [];

      for (const event of events) {
        if (event.type !== "message") continue;
        if (event.message.type !== "text") continue;
        if (!event.replyToken) continue;

        const userMessage = event.message.text;

        /* ========= 即時返信（replyToken保護） ========= */
        await lineClient.replyMessage(event.replyToken, {
          type: "text",
          text: "ありがとうございます。少し考えますね。"
        });

        /* ========= 重い処理は後 ========= */
        (async () => {
          try {
            const prompts = await getPrompts();
            const userType = detectUserType(userMessage);

            let systemKey = "system_default";
            if (userType === "student") systemKey = "system_student";
            if (userType === "parent") systemKey = "system_parent";

            const systemPrompt =
              pickPrompt(prompts, systemKey) || {
                role: "system",
                content:
                  "あなたは丁寧で穏やかな学習塾の塾長です。中学生には優しく、保護者には丁寧に答えてください。回答は2〜4文で簡潔に。"
              };

            const completion = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                { role: systemPrompt.role, content: systemPrompt.content },
                { role: "user", content: userMessage }
              ],
              temperature: 0.3,
              max_tokens: 300
            });

            let replyText =
              completion.choices[0].message.content?.trim() ||
              "うまく回答できませんでした。";

            if (replyText.length > 4500) {
              replyText = replyText.slice(0, 4500);
            }

            /* ========= Push で本回答 ========= */
            await lineClient.pushMessage(event.source.userId, {
              type: "text",
              text: replyText
            });

            console.log("Push success");
          } catch (err) {
            console.error("Async process error:", err);
          }
        })();
      }
    } catch (err) {
      console.error("WEBHOOK ERROR:", err);
    }

    console.log("=== WEBHOOK END ===");
    res.sendStatus(200);
  }
);

/* =========================
   通常ルート
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
