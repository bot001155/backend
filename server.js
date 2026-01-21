import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_IDS = process.env.CHAT_IDS?.split(",");

if (!BOT_TOKEN || !CHAT_IDS) {
  console.error("❌ Missing BOT_TOKEN or CHAT_IDS in .env");
  process.exit(1);
}

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.send("✅ Delta Market Backend Running");
});

/* =========================
   SEND ORDER API
========================= */
app.post("/send-order", async (req, res) => {
  try {
    const {
      orderId,
      name,
      product,
      plan,
      price,
      payment,
      platform,
      email
    } = req.body;

    if (!orderId || !name || !product || !price) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    const message = `
🛒 NEW ORDER

🆔 Order ID: ${orderId}
👤 Name: ${name}
📦 Product: ${product}
📋 Plan: ${plan || "N/A"}
💰 Price: ${price}
💳 Payment: ${payment || "N/A"}
📧 Email: ${email || "N/A"}
🧭 Buy Via: ${platform || "N/A"}
🕒 Time: ${new Date().toLocaleString("en-IN")}
`;

    for (const chatId of CHAT_IDS) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId.trim(),
          text: message
        })
      });
    }

    // ✅ ALWAYS respond
    return res.json({ success: true });

  } catch (error) {
    console.error("ORDER ERROR:", error);

    // ✅ ALWAYS respond even on error
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});


/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
