import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_IDS = process.env.CHAT_IDS.split(",");

/* Health check */
app.get("/", (req, res) => {
  res.send("✅ Delta Market Backend Running");
});

/* FINAL SEND ORDER */
app.post("/send-order", (req, res) => {
  const { orderId, name, product, email, payment, platform } = req.body;

  if (!orderId || !name || !product) {
    return res.json({ success: false });
  }

  const message =
`🛒 NEW ORDER

🆔 Order ID: ${orderId}
👤 Name: ${name}
📦 Product: ${product}
📧 Email: ${email || "N/A"}
💳 Payment: ${payment || "N/A"}
🧭 Platform: ${platform || "N/A"}`;

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

  return res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Backend running on port " + PORT);
});
