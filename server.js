import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/* =====================
   TEMP STORES (IN-MEMORY)
===================== */
const otpStore = {};     // { email: otp }
const orderStore = {};   // { orderId: order }

/* =====================
   EMAIL (GMAIL SMTP – STABLE)
===================== */
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

/* =====================
   HEALTH CHECK
===================== */
app.get("/", (req, res) => {
  res.send("✅ Backend running");
});

/* =====================
   SEND OTP
===================== */
app.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = otp;

    await transporter.sendMail({
      from: `"Delta Market" <${process.env.MAIL_USER}>`,
      to: email,
      subject: "Your OTP Code",
      text: `Your OTP is: ${otp}`
    });

    return res.json({ success: true });
  } catch (e) {
    console.error("SEND OTP ERROR:", e);
    return res.status(500).json({ success: false });
  }
});

/* =====================
   VERIFY OTP → CREATE ORDER → TELEGRAM
===================== */
app.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp, orderData } = req.body;
    if (!email || !otp || !orderData) {
      return res.status(400).json({ success: false });
    }

    if (otpStore[email] !== otp) {
      return res.json({ success: false });
    }

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

    // Send to Telegram (NON-BLOCKING)
    if (process.env.BOT_TOKEN && process.env.CHAT_IDS) {
      process.env.CHAT_IDS.split(",").forEach(id => {
        fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: id.trim(),
            text:
`🛒 NEW ORDER
🆔 ${orderId}
👤 ${order.name}
📦 ${order.product}
📧 ${order.email}
💳 ${order.payment}
📲 ${order.platform}
🕒 ${order.time}

(Admin: send /done ${orderId})`
          })
        }).catch(() => {});
      });
    }

    return res.json({ success: true, orderId });
  } catch (e) {
    console.error("VERIFY OTP ERROR:", e);
    return res.status(500).json({ success: false });
  }
});

/* =====================
   ADMIN DONE → SEND RECEIPT
===================== */
app.post("/order-done", async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = orderStore[orderId];
    if (!order) return res.status(404).json({ success: false });

    order.status = "completed";

    await transporter.sendMail({
      from: `"Delta Market" <${process.env.MAIL_USER}>`,
      to: order.email,
      subject: "Purchase Receipt",
      text:
`Thank you for your purchase!

Order ID: ${order.orderId}
Product: ${order.product}
Payment: ${order.payment}
Status: COMPLETED

— Delta Market`
    });

    return res.json({ success: true });
  } catch (e) {
    console.error("ORDER DONE ERROR:", e);
    return res.status(500).json({ success: false });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server running on port", PORT));
