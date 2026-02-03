import express from "express";

const app = express();

// JSONを手動で読む
app.use(express.json());

app.post("/webhook", (req, res) => {
  console.log("Webhook received (no middleware)");
  console.log(req.body);
  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("LINE AI塾長Bot is running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
