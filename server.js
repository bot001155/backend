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
   TEMP STORAGE
===================== */
const otpStore = {};
const orderStore = {};

/* =====================
   EMAIL SETUP
===================== */
const transporter = nodemailer.createTransport({
  service: "gmail",
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
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = otp;

  try {
    await transporter.sendMail({
      from: `"Delta Market" <${process.env.MAIL_USER}>`,
      to: email,
      subject: "Your OTP Code",
      text: `Your OTP is: ${otp}`
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

/* =====================
   VERIFY OTP & CREATE ORDER
===================== */
app.post("/verify-otp", (req, res) => {
  const { email, otp, orderData } = req.body;

  if (otpStore[email] !== otp) {
    return res.json({ success: false });
  }

  delete otpStore[email];

  const orderId =
    "DM-" + Math.random().toString(36).substring(2, 8).toUpperCase();

  orderStore[orderId] = {
    ...orderData,
    email,
    orderId,
    status: "pending"
  };

  // Send to Telegram
  fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: process.env.ADMIN_CHAT_ID,
      text: `🛒 NEW ORDER\n🆔 ${orderId}\n👤 ${orderData.name}\n📦 ${orderData.product}`
    })
  }).catch(() => {});

  res.json({ success: true, orderId });
});

/* =====================
   TELEGRAM /done COMMAND (WEBHOOK)
===================== */
app.post("/order-done", async (req, res) => {
  const { orderId } = req.body;
  const order = orderStore[orderId];

  if (!order) return res.json({ success: false });

  order.status = "completed";

  await transporter.sendMail({
    from: `"Delta Market" <${process.env.MAIL_USER}>`,
    to: order.email,
    subject: "Your Purchase Receipt",
    text: `
Thank you for your purchase!

Order ID: ${orderId}
Product: ${order.product}
Status: Completed
`
  });

  res.json({ success: true });
});

app.listen(process.env.PORT || 3000, () =>
  console.log("🚀 Server running")
);
