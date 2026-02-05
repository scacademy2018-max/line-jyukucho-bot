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

function detectSubject(text) {
  const t = text.toLowerCase();

  if (
    t.match(/x|y|平方|一次|方程式|比例|反比例|関数|図形|角度|面積|体積/)
  ) return "math";

  if (
    t.match(/英語|英文|和訳|文法|単語|be動詞|時制|過去形|現在完了/)
  ) return "english";

  if (
    t.match(/国語|文章|要約|作者|心情|理由|段落/)
  ) return "japanese";

  if (
    t.match(/理科|化学|物理|生物|地学|実験|電流|酸素/)
  ) return "science";

  if (
    t.match(/社会|歴史|地理|公民|時代|戦争|憲法/)
  ) return "social";

  return null;
}

// system prompt を安全に取得
function getSystemPrompt(prompts, key) {
  return (
    pickPrompt(prompts, key) || {
      role: "system",
      content: "あなたは丁寧で穏やかな学習塾の副塾長の齋藤翔二（塾長の架空の弟）です。"
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
    console.log("Webhook hit!");

    const events = req.body.events || [];

    for (const event of events) {
      if (event.type !== "message" || event.message.type !== "text") continue;

      const userMessage = event.message.text;
      let replyText = "少しお待ちください。";

      try {
        // ① プロンプト一覧取得
        const prompts = await getPrompts();

        // ② 生徒 / 保護者 判定
        const userType = detectUserType(userMessage);

        // ③ system key 決定
        let systemKey = "system_default";
        if (userType === "student") systemKey = "system_student";
        if (userType === "parent") systemKey = "system_parent";

        console.log("UserType:", userType);
        console.log("SystemKey:", systemKey);

        // ④ system prompt 取得
        const systemPrompt = getSystemPrompt(prompts, systemKey);

        // ⑤ OpenAI messages
        const messages = [
          { role: systemPrompt.role, content: systemPrompt.content },
          { role: "user", content: userMessage }
        ];

        // ⑥ OpenAI 呼び出し
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          temperature: 0.3,
          max_tokens: 300
        });

        replyText = completion.choices[0].message.content.trim();

      } catch (err) {
        console.error("Error:", err);
        replyText =
          "すみません、今は少し調子が悪いようです。また後で声をかけてください。";
      }

      // ⑦ LINE 返信
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
