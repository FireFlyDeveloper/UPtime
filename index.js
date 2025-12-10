require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;

let lastHeartbeat = null;
let isDeviceOnline = null;
let bootStartTime = null;
let bootEmailSent = false;

const oAuth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);
oAuth2Client.setCredentials({
  refresh_token: process.env.REFRESH_TOKEN
});

async function sendEmail(subject, textContent, htmlContent) {
  try {
    const accessToken = await oAuth2Client.getAccessToken();
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.EMAIL_USER,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        refreshToken: process.env.REFRESH_TOKEN,
        accessToken: accessToken.token
      }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_TARGET,
      subject,
      text: textContent,
      html: htmlContent
    });

    console.log(`[EMAIL] Sent: ${subject}`);
  } catch (err) {
    console.log("[EMAIL ERROR]", err);
  }
}

setInterval(() => {
  if (!lastHeartbeat) return;

  const diff = Date.now() - lastHeartbeat;
  console.log(`[CHECK] ms since last heartbeat: ${diff}`);

  if (diff > 40000 && isDeviceOnline !== false) {
    isDeviceOnline = false;
    console.log("[STATUS] Device reports OFFLINE");
    sendEmail(
      "Device Offline",
      "The device stopped sending heartbeat.",
      `<h2 style="color:red;">Device Offline</h2><p>The device has stopped sending heartbeat at ${new Date().toLocaleString()}.</p>`
    );
    bootStartTime = null;
    bootEmailSent = false;
  }

  if (bootStartTime && Date.now() - bootStartTime > 120000 && !bootEmailSent) {
    console.log("[BOOT] Boot failed after 2 minutes");
    sendEmail(
      "Boot Failed",
      "Device failed to boot after 2 minutes.",
      `<h2 style="color:red;">Boot Failed</h2><p>The device failed to boot after 2 minutes (at ${new Date().toLocaleString()}).</p>`
    );
    bootEmailSent = true;
  }
}, 10000);

app.get("/hello-world", (_req, res) => {
  res.send("Hello World!");
});

app.post("/health", (req, res) => {
  const data = req.body;
  console.log("[ROUTE] POST /health");
  console.log("[BODY]", data);

  if (!data || !data.password || data.password !== process.env.PASSWORD) {
    return res.status(401).send("Unauthorized: Incorrect password");
  }

  if (typeof data.isOnline !== "boolean") {
    return res.status(400).send("Bad Request: Missing status field");
  }

  lastHeartbeat = Date.now();
  console.log(`[HEARTBEAT] Received at ${new Date().toLocaleString()}`);

  if (data.isOnline) {
    if (!isDeviceOnline && bootStartTime) {
      console.log("[BOOT] Device booted successfully");
      sendEmail(
        "Boot Success",
        "Device successfully booted and is online.",
        `<h2 style="color:green;">Boot Success</h2><p>Device successfully booted and is online at ${new Date().toLocaleString()}.</p>`
      );
      bootStartTime = null;
      bootEmailSent = false;
    }
    isDeviceOnline = true;
    bootStartTime = null;
    bootEmailSent = false;
    console.log("[STATUS] Device reports ONLINE");
  } else {
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
    console.log("[STATUS] Device reports OFFLINE");
  }

  res.status(200).send("Health status received");
});

app.listen(port, () => {
  console.log(`[SERVER] Running on port ${port}`);
});
