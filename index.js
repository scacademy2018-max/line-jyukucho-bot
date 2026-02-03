import express from "express";
import dotenv from "dotenv";
import { Client, middleware as lineMiddleware } from "@line/bot-sdk";

console.log("🔥 index.js LOADED 🔥");

dotenv.config();

const app = express();

// LINE SDK 設定
const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
};
const lineClient = new Client(config);

/**
 * Webhook（ここでは express.json() を使わない！）
 */
app.post(
  "/webhook",
  lineMiddleware({
    channelSecret: process.env.LINE_CHANNEL_SECRET
  }),
  async (req, res) => {
    console.log("Webhook hit!");
    console.log(JSON.stringify(req.body, null, 2));

    const events = req.body.events || [];

    for (const event of events) {
      if (event.type === "message" && event.message.type === "text") {
        try {
          await lineClient.replyMessage(event.replyToken, {
            type: "text",
            text: "Webhookは正常に動いています！"
          });
          console.log("Reply success");
        } catch (err) {
          console.error("Reply error:", err);
        }
      }
    }

    res.sendStatus(200);
  }
);

/**
 * Webhook 以外では json を使ってOK
 */
app.use(express.json());

// 確認用ページ
app.get("/", (req, res) => {
  res.send("LINE AI塾長Bot is running");
});

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("LINE_SECRET:", process.env.LINE_CHANNEL_SECRET ? "SET" : "NOT SET");
  console.log("LINE_TOKEN:", process.env.LINE_CHANNEL_ACCESS_TOKEN ? "SET" : "NOT SET");
});
