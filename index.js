import express from "express";
import dotenv from "dotenv";
import { Client, middleware as lineMiddleware } from "@line/bot-sdk";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(express.json()); // ← 追加（Render 環境で必須）

// LINE SDK 設定
const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
};
const lineClient = new Client(config);

// OpenAI SDK 設定
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Webhook受信（受信確認 + AI返信）
app.post("/webhook", lineMiddleware(config), async (req, res) => {
  console.log("Webhook hit!");
  console.log(req.body.events);

  const events = req.body.events || [];

  await Promise.all(events.map(async (event) => {
    if (event.type !== "message" || event.message.type !== "text") return;

    const userMessage = event.message.text;
    const systemPrompt = `
あなたは落ち着いた口調の学習塾の塾長です。
話し口調は新潟弁にして。
中学生には優しく、保護者には丁寧に接してください。
回答は2〜4文で簡潔に。
個人情報は要求しないこと。
`;

    let aiReply = "少しお待ちください…";

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        temperature: 0.3,
        max_tokens: 500
      });

      aiReply = completion.choices[0].message.content.trim();
    } catch (err) {
      console.error("OpenAI API error:", err);
      aiReply = "すみません、ただいま応答できません。";
    }

    await lineClient.replyMessage(event.replyToken, {
      type: "text",
      text: aiReply
    });
  }));

  res.sendStatus(200);
});

// 簡易確認ページ
app.get("/", (req, res) => res.send("LINE AI塾長Bot is running"));

// サーバー起動（Render では PORT が自動付与される）
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));