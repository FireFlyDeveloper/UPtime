require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;

let lastHeartbeat = null;
let isDeviceOnline = null;
let bootStartTime = null;
let bootEmailSent = false;

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

async function sendEmail(subject, message, htmlContent) {
  const accessToken = await oauth2Client.getAccessToken();

  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: process.env.EMAIL_USER,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
      accessToken: accessToken.token
    }
  });

  transporter.sendMail(
    {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_TARGET,
      subject: subject,
      text: message,
      html: htmlContent
    },
    () => {}
  );
}

setInterval(() => {
  if (!lastHeartbeat) return;

  const diff = Date.now() - lastHeartbeat;

  if (diff > 40000 && isDeviceOnline !== false) {
    isDeviceOnline = false;
    sendEmail(
      "Device Offline",
      "The device stopped sending heartbeat.",
      `<h2 style="color:red;">Device Offline</h2><p>The device has stopped sending heartbeat at ${new Date().toLocaleString()}.</p>`
    );
    bootStartTime = null;
    bootEmailSent = false;
  }

  if (bootStartTime && Date.now() - bootStartTime > 120000 && !bootEmailSent) {
    sendEmail(
      "Boot Failed",
      "Device failed to boot after 2 minutes.",
      `<h2 style="color:red;">Boot Failed</h2><p>The device failed to boot after 2 minutes (at ${new Date().toLocaleString()}).</p>`
    );
    bootEmailSent = true;
  }
}, 10000);

app.post("/health", (req, res) => {
  const data = req.body;

  if (!data || !data.password || data.password !== process.env.PASSWORD) {
    return res.status(401).send("Unauthorized: Incorrect password");
  }

  if (typeof data.isOnline !== "boolean") {
    return res.status(400).send("Bad Request: Missing status field");
  }

  lastHeartbeat = Date.now();

  if (data.isOnline) {
    if (!isDeviceOnline && bootStartTime) {
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
  } else {
    if (isDeviceOnline !== false) {
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
  }

  res.status(200).send("Health status received");
});

app.get("/hello-world", (_req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
