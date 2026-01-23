import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { Resend } from "resend";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   RESEND SETUP
========================= */
const resend = new Resend(process.env.RESEND_API_KEY);

/* =========================
   TEMP IN-MEMORY STORES
========================= */
const otpStore = {};    // { email: { otp, expires } }
const orderStore = {};  // { orderId: order }

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.send("✅ Backend running");
});

/* =========================
   SEND OTP
========================= */
app.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email required" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    otpStore[email] = {
      otp,
      expires: Date.now() + 5 * 60 * 1000 // 5 minutes
    };

    await resend.emails.send({
      from: process.env.MAIL_FROM,
      to: email,
      subject: "Your OTP Code",
      html: `
        <div style="font-family:Arial">
          <h2>Delta Market</h2>
          <p>Your OTP code is:</p>
          <h1>${otp}</h1>
          <p>This OTP is valid for 5 minutes.</p>
        </div>
      `
    });

    res.json({ success: true });
  } catch (err) {
    console.error("SEND OTP ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =========================
   VERIFY OTP + CREATE ORDER
========================= */
app.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp, orderData } = req.body;
    if (!email || !otp || !orderData) {
      return res.status(400).json({ success: false, message: "Missing data" });
    }

    const record = otpStore[email];
    if (!record) return res.json({ success: false, message: "OTP not found" });

    if (record.expires < Date.now()) {
      delete otpStore[email];
      return res.json({ success: false, message: "OTP expired" });
    }

    if (record.otp !== otp) return res.json({ success: false, message: "Wrong OTP" });

    delete otpStore[email];

    const orderId =
      "DM-" + Math.random().toString(36).substring(2, 8).toUpperCase();

    const order = {
      orderId,
      email,
      ...orderData,
      status: "pending",
      time: new Date().toLocaleString("en-IN")
    };

    orderStore[orderId] = order;

    /* SEND TO TELEGRAM ADMINS */
    if (process.env.BOT_TOKEN && process.env.CHAT_IDS) {
      process.env.CHAT_IDS.split(",").forEach(id => {
        fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: id.trim(),
            text:
`🛒 NEW ORDER

🆔 Order ID: ${orderId}
👤 Name: ${order.name}
📦 Product: ${order.product}
📧 Email: ${order.email}
💳 Payment: ${order.payment}
📲 Platform: ${order.platform}
🕒 Date & Time: ${order.time}

(Admin: send /done ${orderId})`
          })
        }).catch(() => {});
      });
    }

    res.json({ success: true, orderId });
  } catch (err) {
    console.error("VERIFY OTP ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =========================
   SEND RECEIPT FUNCTION
========================= */
async function sendReceipt(order) {
  await resend.emails.send({
    from: process.env.MAIL_FROM,
    to: order.email,
    subject: "Purchase Receipt",
    html: `
      <div style="font-family:Arial">
        <h2>✅ Purchase Successful</h2>
        <p><b>Order ID:</b> ${order.orderId}</p>
        <p><b>Product:</b> ${order.product}</p>
        <p><b>Payment:</b> ${order.payment}</p>
        <p><b>Status:</b> Completed</p>
        <br>
        <p>Thank you for shopping with Delta Market.</p>
      </div>
    `
  });
}

/* =========================
   ADMIN DONE API (manual call)
========================= */
app.post("/order-done", async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = orderStore[orderId];
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    order.status = "completed";
    await sendReceipt(order);

    res.json({ success: true });
  } catch (err) {
    console.error("RECEIPT ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =========================
   TELEGRAM WEBHOOK (LISTEN /done)
========================= */
app.post("/telegram-webhook", async (req, res) => {
  try {
    const message = req.body?.message;
    const text = message?.text || "";
    const chatId = message?.chat?.id;

    if (!chatId) return res.sendStatus(200);

    // Only allow admin chat ids
    const allowedAdmins = (process.env.CHAT_IDS || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);

    if (!allowedAdmins.includes(String(chatId))) {
      return res.sendStatus(200);
    }

    // Command: /done DM-XXXXXX
    if (text.startsWith("/done")) {
      const parts = text.trim().split(" ");
      const orderId = parts[1];

      if (!orderId) {
        await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "❌ Use like: /done DM-XXXXXX"
          })
        });
        return res.sendStatus(200);
      }

      const order = orderStore[orderId];
      if (!order) {
        await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `❌ Order not found: ${orderId}`
          })
        });
        return res.sendStatus(200);
      }

      order.status = "completed";
      await sendReceipt(order);

      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `✅ Done! Receipt sent to ${order.email}\n🆔 Order: ${orderId}`
        })
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("TELEGRAM WEBHOOK ERROR:", err);
    res.sendStatus(200);
  }
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
