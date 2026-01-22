import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_IDS = process.env.CHAT_IDS?.split(",") || [];

/* Health check */
app.get("/", (req, res) => {
  res.send("✅ Backend running");
});

/* ORDER API */
app.post("/send-order", (req, res) => {
  const { orderId, name, product, email, payment, platform } = req.body;

  if (!orderId || !name || !product) {
    return res.status(400).json({ success: false });
  }

  const message = `
🛒 NEW ORDER
🆔 ${orderId}
👤 ${name}
📦 ${product}
📧 ${email}
💳 ${payment}
📲 ${platform}
`;

  // Telegram send (NON BLOCKING)
  CHAT_IDS.forEach(id => {
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: id.trim(),
        text: message
      })
    }).catch(() => {});
  });

  // ALWAYS respond
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
