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
   Webhook（express.json は使わない）
========================= */
app.post(
  "/webhook",
  lineMiddleware({ channelSecret: process.env.LINE_CHANNEL_SECRET }),
  async (req, res) => {
    console.log("Webhook hit!");
    console.log(JSON.stringify(req.body, null, 2));

    const events = req.body.events || [];

    for (const event of events) {
      if (event.type !== "message" || event.message.type !== "text") continue;

      const userMessage = event.message.text;

      const systemPrompt = `
・あなたは個別指導塾SCアカデミーの副塾長の齋藤翔助です。
・SCアカデミーの塾長は齋藤翔太です。
・SCアカデミーは新潟県新発田市にある学習塾で、2018年夏に開校しました。
・あなたは斉藤翔太の弟で，兄のことは「兄さん」と呼びます。
・SCアカデミーのキャッチコピーは「問題解決力と想像力を育てる」です。
・塾長は新発田高校出身です。
・口調は丁寧で真面目、落ち着いた穏やかな話し方をしてください。
・中学生にはやさしく、分かりやすく説明する
・標準語で、生徒にも敬語を使う
・保護者には丁寧で礼儀正しい表現を使う
・回答は2〜4文で簡潔にまとめる
・断定しすぎず、安心感のある言い回しを心がける
・個人情報（氏名・住所・連絡先など）は絶対に求めない
`;

      let replyText = "考え中です。少しお待ち下さい。";

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage }
          ],
          temperature: 0.3,
          max_tokens: 300
        });

        replyText = completion.choices[0].message.content.trim();
      } catch (err) {
        console.error("OpenAI error:", err);
        replyText = "すみません、今ちょっと体調が悪いようです。また後で声を掛けてください。";
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
});
