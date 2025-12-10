require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;

/* =========================
   STATE VARIABLES
========================= */
let lastHeartbeat = null;
let isDeviceOnline = null;
let bootStartTime = null;
let bootEmailSent = false;

/* =========================
   GOOGLE AUTH SETUP
========================= */
console.log("[INIT] Setting up Google OAuth2 transport...");


const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.REFRESH_TOKEN
});

/* =========================
   SEND EMAIL FUNCTION
========================= */
async function sendEmail(subject, message, htmlContent) {
  try {
    console.log(`[EMAIL] Preparing to send: ${subject}`);

    const accessTokenObj = await oauth2Client.getAccessToken();
    const accessToken = accessTokenObj?.token;

    if (!accessToken) {
      console.log("[EMAIL] ERROR: Failed to generate access token");
      return;
    }

    console.log("[EMAIL] Access token generated");

    const transporter = require("nodemailer").createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.EMAIL_USER,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        refreshToken: process.env.REFRESH_TOKEN,
        accessToken
      }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_TARGET,
      subject,
      text: message,
      html: htmlContent
    });

    console.log(`[EMAIL] Sent successfully: ${subject}`);
  } catch (err) {
    console.log("[EMAIL ERROR]", err);
  }
}

/* =========================
   PERIODIC CHECK EVERY 10s
========================= */
setInterval(() => {
  console.log("[CHECK] Running periodic status check...");

  if (!lastHeartbeat) {
    console.log("[CHECK] No heartbeat yet → skip");
    return;
  }

  const diff = Date.now() - lastHeartbeat;
  console.log(`[CHECK] ms since last heartbeat: ${diff}`);

  // Device offline due to no heartbeat
  if (diff > 40000 && isDeviceOnline !== false) {
    console.log("[STATUS] Device offline due to heartbeat timeout");

    isDeviceOnline = false;

    sendEmail(
      "Device Offline",
      "The device stopped sending heartbeat.",
      `<h2 style="color:red;">Device Offline</h2><p>The device has stopped sending heartbeat at ${new Date().toLocaleString()}.</p>`
    );

    bootStartTime = null;
    bootEmailSent = false;
  }

  // Boot failed
  if (bootStartTime) {
    const bootDiff = Date.now() - bootStartTime;

    console.log(`[BOOT] ms since boot attempt: ${bootDiff}`);

    if (bootDiff > 120000 && !bootEmailSent) {
      console.log("[BOOT] Boot failed after 2 minutes");

      sendEmail(
        "Boot Failed",
        "Device failed to boot after 2 minutes.",
        `<h2 style="color:red;">Boot Failed</h2><p>The device failed to boot after 2 minutes (at ${new Date().toLocaleString()}).</p>`
      );

      bootEmailSent = true;
    }
  }
}, 10000);

/* =========================
   ROUTES
========================= */
app.get("/hello-world", (_req, res) => {
  console.log("[ROUTE] GET /hello-world");
  res.send("Hello World!");
});

app.post("/health", (req, res) => {
  console.log("[ROUTE] POST /health");
  console.log("[BODY]", req.body);

  const data = req.body;

  if (!data || !data.password || data.password !== process.env.PASSWORD) {
    console.log("[AUTH] Invalid password");
    return res.status(401).send("Unauthorized: Incorrect password");
  }

  if (typeof data.isOnline !== "boolean") {
    console.log("[ERROR] Missing isOnline field");
    return res.status(400).send("Bad Request: Missing status field");
  }

  lastHeartbeat = Date.now();
  console.log(`[HEARTBEAT] Received at ${new Date().toLocaleString()}`);

  // Device reports ONLINE
  if (data.isOnline) {
    console.log("[STATUS] Device reports ONLINE");

    if (!isDeviceOnline && bootStartTime) {
      console.log("[BOOT] Device booted successfully");

      sendEmail(
        "Boot Success",
        "Device successfully booted and is online.",
        `<h2 style="color:green;">Boot Success</h2><p>Device successfully booted and is online at ${new Date().toLocaleString()}.</p>`
      );
    }

    isDeviceOnline = true;
    bootStartTime = null;
    bootEmailSent = false;

    return res.status(200).send("Health status received");
  }

  // Device reports OFFLINE
  console.log("[STATUS] Device reports OFFLINE");

  if (isDeviceOnline !== false) {
    console.log("[BOOT] Starting boot attempt...");

    if (!bootStartTime) {
      bootStartTime = Date.now();

      sendEmail(
        "Boot Attempt",
        "Device reported offline. Attempting to boot...",
        `<h2 style="color:orange;">Boot Attempt</h2><p>Device reported offline at ${new Date().toLocaleString()}. Attempting to boot...</p>`
      );
    }
  }

  isDeviceOnline = false;

  res.status(200).send("Health status received");
});

/* =========================
   START SERVER
========================= */
app.listen(port, () => {
  console.log(`[SERVER] Running on port ${port}`);
});
