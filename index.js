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

function formatPhilippineTime(date = new Date()) {
  return date.toLocaleString("en-PH", { timeZone: "Asia/Manila", hour12: false });
}

async function getAccessToken() {
  const { token } = await oAuth2Client.getAccessToken();
  return token;
}

function buildEmailHtml(title, message) {
  return `
  <div style="max-width:600px; margin: 30px auto; padding:20px; font-family:Arial,sans-serif; border:1px solid #ddd; border-radius:8px; background-color:#f9f9f9; text-align:center;">
    <a href="https://github.com/FireFlyDeveloper" target="_blank">
      <img src="https://avatars.githubusercontent.com/u/153905107?v=4" alt="GitHub Profile" style="width:80px; height:80px; border-radius:50%; margin-bottom:15px;" />
    </a>
    <h2 style="color:#333;">${title}</h2>
    <p style="color:#555; font-size:14px;">${message}</p>
    <p style="font-size:12px; color:#999; margin-top:20px;">Timestamp: ${formatPhilippineTime()}</p>
  </div>
  `;
}

async function sendEmail(subject, htmlContent, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
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
        console.log(`[EMAIL ERROR] Attempt ${attempt}: Gmail API error: ${res.status} — ${err}`);
        if (attempt < retries) {
          console.log(`[EMAIL] Retrying in 2 seconds...`);
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
      } else {
        const data = await res.json();
        console.log(`[EMAIL] Sent: ${subject}, Message ID: ${data.id}`);
        break;
      }
    } catch (e) {
      console.log(`[EMAIL ERROR] Attempt ${attempt}: ${e.message}`);
      if (attempt < retries) {
        console.log(`[EMAIL] Retrying in 2 seconds...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
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
      "Device Offline Notification",
      buildEmailHtml(
        "Device Offline",
        "The monitored device has stopped sending heartbeat signals. Please investigate to ensure normal operation."
      )
    );
    bootStartTime = null;
    bootEmailSent = false;
  }

  if (bootStartTime && Date.now() - bootStartTime > 120000 && !bootEmailSent) {
    console.log("[BOOT] Boot failed after 2 minutes");
    sendEmail(
      "Device Boot Failure",
      buildEmailHtml(
        "Boot Failure",
        "The device failed to boot successfully after 2 minutes. Immediate attention may be required."
      )
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
  console.log(`[HEARTBEAT] Received at ${formatPhilippineTime(lastHeartbeat)}`);

  if (data.isOnline) {
    if (!isDeviceOnline && bootStartTime) {
      console.log("[BOOT] Device booted successfully");
      sendEmail(
        "Device Boot Successful",
        buildEmailHtml(
          "Boot Success",
          "The device has successfully booted and is online."
        )
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
          "Device Boot Attempt",
          buildEmailHtml(
            "Boot Attempt",
            "The device reported offline. Attempting to initiate boot..."
          )
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
