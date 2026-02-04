import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { Resend } from "resend";
import fs from "fs"; // Added for permanent storage

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   RESEND SETUP
========================= */
const resend = new Resend(process.env.RESEND_API_KEY);

/* =========================
   STORAGE SETUP
========================= */
const DATA_FILE = "./orders.json"; // Permanent storage file
const otpStore = {};    // OTPs remain temporary in memory

// Load orders from file on startup
let orderStore = {};
if (fs.existsSync(DATA_FILE)) {
  try {
    orderStore = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch (e) {
    orderStore = {};
  }
}

// Function to save orders to file permanently
const saveOrders = () => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(orderStore, null, 2));
};

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.send("✅ Backend running with File Storage");
});

/* =========================
   ADMIN GET ALL ORDERS
========================= */
app.get("/admin/orders", (req, res) => {
  try {
    const orders = Object.values(orderStore);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* =========================
   SEND OTP
========================= */
app.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email required" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    otpStore[email] = {
      otp,
      expires: Date.now() + 5 * 60 * 1000 // 5 minutes
    };

    res.json({ success: true, message: "OTP sending..." });

    setImmediate(async () => {
      try {
        await resend.emails.send({
          from: process.env.MAIL_FROM,
          to: email,
          subject: "Delta Market • OTP Verification Code",
          html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
</head>

<body style="margin:0; padding:0; background:#0b0f14; font-family:Arial, Helvetica, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f14;">
    <tr>
      <td align="center" style="padding:35px 12px;">
        
        <table width="100%" style="max-width:520px; background:#111827; border-radius:16px; overflow:hidden; border:1px solid rgba(255,255,255,0.08);">
          
          <tr>
            <td style="padding:22px; text-align:center; background:#0f172a;">
              <img src="https://deltamarket.store/logo.png" width="70"
                style="border-radius:14px; display:block; margin:0 auto 10px;" />
              
              <div style="color:#ffffff; font-size:20px; font-weight:700;">
                Delta Market
              </div>
              <div style="color:#9ca3af; font-size:13px; margin-top:4px;">
                Secure OTP Verification
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:22px;">
              <div style="color:#ffffff; font-size:16px; font-weight:700;">
                Your OTP Code
              </div>

              <div style="margin-top:8px; color:#9ca3af; font-size:13px; line-height:1.6;">
                Use the OTP below to verify your email and complete your order.
              </div>

              <div style="margin-top:18px; padding:16px; background:#0b1220; border-radius:14px; text-align:center; border:1px solid rgba(255,255,255,0.08);">
                <div style="font-size:30px; font-weight:800; letter-spacing:8px; color:#ffffff;">
                  ${otp}
                </div>
                <div style="margin-top:10px; font-size:12px; color:#9ca3af;">
                  This code expires in <b style="color:#ffffff;">5 minutes</b>.
                </div>
              </div>

              <div style="margin-top:18px; font-size:12px; color:#9ca3af; line-height:1.6;">
                If you don’t want to Buy, Then Don't Verify.
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:14px; text-align:center; background:#0f172a; font-size:12px; color:#6b7280;">
              © ${new Date().getFullYear()} Delta Market • Secure Checkout
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`
        });

        console.log("✅ OTP sent to:", email);
      } catch (err) {
        console.error("❌ BACKGROUND OTP SEND ERROR:", err);
      }
    });

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

    if (record.otp !== otp) {
      return res.json({ success: false, message: "Wrong OTP" });
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
    saveOrders(); // Save to database

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
🎟 Referral: ${order.referral || "None"}
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
    subject: "Delta Market • Payment Receipt",
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
</head>
<body style="margin:0; padding:0; background:#f4f6f8; font-family:Arial, Helvetica, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;">
    <tr>
      <td align="center" style="padding:30px 10px;">
        <table width="100%" style="max-width:520px; background:#ffffff; border-radius:14px; overflow:hidden; border:1px solid #eaeaea;">
          
          <tr>
            <td style="padding:22px; background:#111; text-align:center;">
              <img src="https://deltamarket.store/logo.png" width="70" style="border-radius:14px; display:block; margin:0 auto 10px;" />
              <div style="color:#fff; font-size:20px; font-weight:bold;">Delta Market</div>
              <div style="color:#cfcfcf; font-size:13px; margin-top:4px;">Payment Receipt</div>
            </td>
          </tr>

          <tr>
            <td style="padding:22px;">
              <div style="font-size:16px; font-weight:bold; color:#111;">✅ Payment Successful</div>
              <div style="margin-top:8px; font-size:13px; color:#555; line-height:1.5;">
                Thank you for your purchase. Your order is completed successfully.
              </div>

              <div style="margin-top:18px; padding:14px; background:#f7f7f7; border-radius:12px;">
                <table width="100%" style="font-size:13px; color:#222;">
                  <tr>
                    <td style="padding:6px 0;"><b>Order ID</b></td>
                    <td align="right">${order.orderId}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;"><b>Product</b></td>
                    <td align="right">${order.product}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;"><b>Payment</b></td>
                    <td align="right">${order.payment}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;"><b>Status</b></td>
                    <td align="right" style="color:#16a34a;"><b>Completed</b></td>
                  </tr>
                </table>
              </div>

              <div style="margin-top:18px; font-size:12px; color:#666; line-height:1.5;">
                Need help? Contact us at <b>deltamarket015@gmail.com</b>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:14px; text-align:center; background:#fafafa; font-size:12px; color:#888;">
              © ${new Date().getFullYear()} Delta Market • All rights reserved
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
  });
}

/* =========================
   ADMIN DONE API (manual call)
========================= */
app.post("/order-done", async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = orderStore[orderId];
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    order.status = "completed";
    saveOrders(); // Save status update
    await sendReceipt(order);

    res.json({ success: true });
  } catch (err) {
    console.error("RECEIPT ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =========================
   DELETE ORDER API
========================= */
app.delete("/delete-order/:id", (req, res) => {
  const { id } = req.params;
  if (orderStore[id]) {
    delete orderStore[id];
    saveOrders(); // Remove permanently from database
    return res.json({ success: true, message: "Order removed" });
  }
  res.status(404).json({ success: false });
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

    const allowedAdmins = (process.env.CHAT_IDS || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);

    if (!allowedAdmins.includes(String(chatId))) {
      return res.sendStatus(200);
    }

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
      saveOrders(); // Save update
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
app.listen(PORT, "0.0.0.0", () => console.log("Running on", PORT));
