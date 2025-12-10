require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 3000;
const HEARTBEAT_TIMEOUT_MS = parseInt(process.env.HEARTBEAT_TIMEOUT_MS || "40000", 10);
const HEARTBEAT_CHECK_INTERVAL_MS = parseInt(process.env.HEARTBEAT_CHECK_INTERVAL_MS || "10000", 10);
const BOOT_FAIL_TIMEOUT_MS = parseInt(process.env.BOOT_FAIL_TIMEOUT_MS || "150000", 10);
let lastHeartbeat = null;
let isDeviceOnline = null;
let bootStartTime = null;
let lastReportFromDevice = null;
let notifiedOffline = false;
let bootAttemptNotified = false;
let bootFailedNotified = false;
let notifiedBackOnline = false;
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});
async function sendEmail(subject, message) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_TARGET) {
    console.log("Email config missing: skipping email:", subject);
    return;
  }
  const mail = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_TARGET,
    subject,
    text: message
  };
  try {
    const info = await transporter.sendMail(mail);
    console.log(`Email sent: ${subject} (${info.messageId || "no-id"})`);
  } catch (err) {
    console.log("Email error:", err && err.message ? err.message : err);
  }
}
setInterval(async () => {
  if (!lastHeartbeat) return;
  const now = Date.now();
  const diff = now - lastHeartbeat;
  if (diff > HEARTBEAT_TIMEOUT_MS) {
    if (isDeviceOnline !== false) {
      isDeviceOnline = false;
    }
    if (!notifiedOffline) {
      notifiedOffline = true;
      notifiedBackOnline = false;
      console.log("Device offline: no heartbeat (last seen " + Math.round(diff / 1000) + "s ago)");
      await sendEmail("Device Offline", `No heartbeat received for ${Math.round(diff / 1000)}s.`);
    }
  } else {
    if (isDeviceOnline !== true) {
      isDeviceOnline = true;
    }
    if (notifiedOffline && !notifiedBackOnline) {
      notifiedBackOnline = true;
      notifiedOffline = false;
      bootAttemptNotified = false;
      bootFailedNotified = false;
      console.log("Device back online (heartbeat within threshold)");
      await sendEmail("Device Back Online", "Device has resumed sending heartbeats.");
    }
  }
  if (bootStartTime) {
    if (now - bootStartTime > BOOT_FAIL_TIMEOUT_MS) {
      if (!bootFailedNotified) {
        bootFailedNotified = true;
        console.log("Boot failed: exceeded timeout");
        await sendEmail("Boot Failed", `Device reported offline and failed to come online within ${Math.round(BOOT_FAIL_TIMEOUT_MS / 1000)}s.`);
      }
    }
  }
}, HEARTBEAT_CHECK_INTERVAL_MS);
app.get("/hello-world", (_req, res) => {
  res.send("Hello World!");
});
app.get("/status", (_req, res) => {
  res.json({
    lastHeartbeat,
    isDeviceOnline,
    bootStartTime,
    notifiedOffline,
    bootAttemptNotified,
    bootFailedNotified,
    serverTime: Date.now()
  });
});
app.post("/health", async (req, res) => {
  const data = req.body;
  if (!data || !data.password || data.password !== process.env.PASSWORD) {
    return res.status(401).send("Unauthorized: Incorrect password");
  }
  if (typeof data.isOnline !== "boolean") {
    return res.status(400).send("Bad Request: Missing or invalid 'isOnline' field");
  }
  lastHeartbeat = Date.now();
  lastReportFromDevice = data;
  isDeviceOnline = data.isOnline;
  lastServerStatus = data.isOnline;
  if (data.isOnline) {
    console.log("Device reported ONLINE via /health");
    bootStartTime = null;
    bootAttemptNotified = false;
    bootFailedNotified = false;
    if (notifiedOffline) {
      notifiedOffline = false;
      notifiedBackOnline = true;
      await sendEmail("Device Back Online", "Device reported online via heartbeat.");
    }
  } else {
    console.log("Device reported OFFLINE → boot attempt");
    if (!bootStartTime) {
      bootStartTime = Date.now();
      if (!bootAttemptNotified) {
        bootAttemptNotified = true;
        await sendEmail("Boot Attempt", "Device reported offline. Attempting to boot the server now.");
      }
    }
  }
  return res.status(200).send("Health status received");
});
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});