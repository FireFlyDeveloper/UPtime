require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const { Buffer } = require("buffer");

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;

let lastHeartbeat = null;
let isDeviceOnline = null;
let bootStartTime = null;
let bootEmailSent = false;

const oAuth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
);
oAuth2Client.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN
});

async function getAccessToken() {
  const { token } = await oAuth2Client.getAccessToken();
  return token;
}

async function sendEmail(subject, htmlContent) {
  try {
    const accessToken = await getAccessToken();
    const from = process.env.EMAIL_USER;
    const to = process.env.EMAIL_TARGET;

    const message =
      `From: ${from}\r\n` +
      `To: ${to}\r\n` +
      `Subject: ${subject}\r\n` +
      `Content-Type: text/html; charset="UTF-8"\r\n` +
      `\r\n` +
      htmlContent;

    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: encodedMessage })
    });

    if (!res.ok) {
      const err = await res.text();
      console.log(`[EMAIL ERROR] Gmail API error: ${res.status} — ${err}`);
    } else {
      const data = await res.json();
      console.log(`[EMAIL] Sent: ${subject}, Message ID: ${data.id}`);
    }
  } catch (e) {
    console.log("[EMAIL ERROR]", e.message);
  }
}

setInterval(() => {
  if (!lastHeartbeat) return;

  const diff = Date.now() - lastHeartbeat;
  console.log(`[CHECK] ms since last heartbeat: ${diff}`);
  if (bootStartTime) console.log(`[BOOT] ms since boot attempt: ${Date.now() - bootStartTime}`);

  if (diff > 40000 && isDeviceOnline !== false) {
    isDeviceOnline = false;
    console.log("[STATUS] Device reports OFFLINE");
    sendEmail(
      "Device Offline",
      `<h2 style="color:red;">Device Offline</h2><p>The device has stopped sending heartbeat at ${new Date().toLocaleString()}.</p>`
    );
    bootStartTime = null;
    bootEmailSent = false;
  }

  if (bootStartTime && Date.now() - bootStartTime > 120000 && !bootEmailSent) {
    console.log("[BOOT] Boot failed after 2 minutes");
    sendEmail(
      "Boot Failed",
      `<h2 style="color:red;">Boot Failed</h2><p>The device failed to boot after 2 minutes (at ${new Date().toLocaleString()}).</p>`
    );
    bootEmailSent = true;
  }

}, 10000);

app.get("/hello-world", (_req, res) => {
  res.send("Hello World!");
});

app.post("/health", (req, res) => {
  console.log("[ROUTE] POST /health");
  console.log("[BODY]", req.body);

  const data = req.body;

  if (!data || !data.password || data.password !== process.env.PASSWORD) {
    return res.status(401).send("Unauthorized: Incorrect password");
  }

  if (typeof data.isOnline !== "boolean") {
    return res.status(400).send("Bad Request: Missing status field");
  }

  lastHeartbeat = Date.now();
  console.log(`[HEARTBEAT] Received at ${new Date(lastHeartbeat).toLocaleString()}`);

  if (data.isOnline) {
    if (!isDeviceOnline && bootStartTime) {
      console.log("[BOOT] Device booted successfully");
      sendEmail(
        "Boot Success",
        `<h2 style="color:green;">Boot Success</h2><p>Device successfully booted and is online at ${new Date().toLocaleString()}.</p>`
      );
      bootStartTime = null;
      bootEmailSent = false;
    }
    isDeviceOnline = true;
    bootStartTime = null;
    bootEmailSent = false;
    console.log("[STATUS] Device is online");
  } else {
    if (isDeviceOnline !== false) {
      console.log("[STATUS] Device reports OFFLINE → boot attempt");
      if (!bootStartTime) {
        bootStartTime = Date.now();
        sendEmail(
          "Boot Attempt",
          `<h2 style="color:orange;">Boot Attempt</h2><p>Device reported offline at ${new Date().toLocaleString()}. Attempting to boot...</p>`
        );
      }
    }
    isDeviceOnline = false;
  }

  res.status(200).send("Health status received");
});

app.listen(port, () => {
  console.log(`[SERVER] Running on port ${port}`);
});
