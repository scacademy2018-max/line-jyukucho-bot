import express from "express";
import dotenv from "dotenv";
import { Client, middleware as lineMiddleware } from "@line/bot-sdk";
import OpenAI from "openai";

dotenv.config();
const app = express();

/* =========================
   LINE / OpenAI 設定
========================= */
const lineClient = new Client({
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =========================
   簡易ユーザー履歴（メモリ）
========================= */
const userStates = {};
/*
userStates[userId] = {
  mode: "normal" | "test",
  step: 1 | 2 | 3,
  subject: "math" | "english" | null,
  lastQuestion: ""
}
*/

/* =========================
   判定系
========================= */
function detectSubject(text) {
  if (text.match(/x|y|方程式|関数|平方/)) return "math";
  if (text.match(/英語|英文|和訳|文法/)) return "english";
  return null;
}

function detectTestMode(text) {
  return text.match(/テスト|定期|期末|中間/);
}

/* =========================
   system プロンプト生成
========================= */
function buildSystemPrompt(state) {
  if (state.mode === "test") {
    return "あなたは中学生の定期テスト対策を行う塾講師です。答えをすぐ出さず、考えさせてから解説してください。";
  }

  if (state.step === 1) {
    return "あなたは問題を出す学習塾の先生です。まずは問題だけを出してください。";
  }
  if (state.step === 2) {
    return "あなたは中学生に向けて、途中式を含めて丁寧に解説する先生です。";
  }
  if (state.step === 3) {
    return "あなたは理解度を確認する先生です。簡単な確認質問を1問だけ出してください。";
  }

  return "あなたは丁寧で穏やかな学習塾の塾長です。";
}

/* =========================
   Webhook
========================= */
app.post(
  "/webhook",
  lineMiddleware({ channelSecret: process.env.LINE_CHANNEL_SECRET }),
  async (req, res) => {
    const events = req.body.events || [];

    for (const event of events) {
      if (event.type !== "message" || event.message.type !== "text") continue;

      const userId = event.source.userId;
      const text = event.message.text;

      /* 初期化 */
      if (!userStates[userId]) {
        userStates[userId] = {
          mode: "normal",
          step: 1,
          subject: null,
          lastQuestion: ""
        };
      }

      const state = userStates[userId];

      /* 定期テストモード判定 */
      if (detectTestMode(text)) {
        state.mode = "test";
        state.step = 1;
      }

      /* 科目判定 */
      const subject = detectSubject(text);
      if (subject) state.subject = subject;

      /* STEP 管理 */
      if (state.step === 3) {
        state.step = 1; // 1サイクル終了
      }

      const systemPrompt = buildSystemPrompt(state);

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ];

      let reply = "少し考えています…";

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          temperature: 0.3,
          max_tokens: 300
        });

        reply = completion.choices[0].message.content.trim();
      } catch (e) {
        reply = "すみません、今はうまく動いていないようです。";
      }

      /* STEP を進める */
      state.step++;

      await lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: reply
      });
    }

    res.sendStatus(200);
  }
);

/* =========================
   確認用
========================= */
app.get("/", (req, res) => {
  res.send("LINE AI塾長Bot running");
});

/* =========================
   起動
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
