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
  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

async function getAccessToken() {
  const { token } = await oAuth2Client.getAccessToken();
  return token;
}

function buildEmailHtml(title, message, status = "info") {
  const statusConfig = {
    success: { color: "#10b981", icon: "✓", bg: "#d1fae5" },
    error: { color: "#ef4444", icon: "✕", bg: "#fee2e2" },
    warning: { color: "#f59e0b", icon: "⚠", bg: "#fef3c7" },
    info: { color: "#3b82f6", icon: "📄", bg: "#dbeafe" }
  };

  const config = statusConfig[status] || statusConfig.info;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; box-shadow:0 4px 6px rgba(0,0,0,0.1); overflow:hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding:40px 30px; text-align:center;">
              <a href="https://github.com/FireFlyDeveloper" target="_blank" style="display:inline-block; text-decoration:none;">
                <img src="https://avatars.githubusercontent.com/u/153905107?v=4" alt="GitHub Profile" style="width:80px; height:80px; border-radius:50%; border:4px solid #ffffff; box-shadow:0 2px 8px rgba(0,0,0,0.2);" />
              </a>
              <h1 style="color:#ffffff; margin:20px 0 0 0; font-size:28px; font-weight:600; letter-spacing:-0.5px;">UPtime Monitoring System</h1>
            </td>
          </tr>
          
          <tr>
            <td style="padding:30px 30px 20px 30px; text-align:center;">
              <div style="display:inline-block; background-color:${config.bg}; color:${config.color}; padding:12px 24px; border-radius:24px; font-weight:600; font-size:14px; letter-spacing:0.5px;">
                <span style="font-size:18px; margin-right:8px;">${config.icon}</span>
                ${status.toUpperCase()}
              </div>
            </td>
          </tr>
          
          <tr>
            <td style="padding:0 30px 30px 30px;">
              <h2 style="color:#1f2937; margin:0 0 16px 0; font-size:24px; font-weight:600; text-align:center;">${title}</h2>
              <p style="color:#6b7280; font-size:16px; line-height:1.6; margin:0; text-align:center;">${message}</p>
            </td>
          </tr>
          
          <tr>
            <td style="padding:0 30px 30px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb; border-radius:8px; border:1px solid #e5e7eb;">
                <tr>
                  <td style="padding:20px;">
                    <table width="100%">
                      <tr>
                        <td style="padding:8px 0; color:#6b7280; font-size:14px; font-weight:500;">Timestamp</td>
                        <td style="padding:8px 0; color:#1f2937; font-size:14px; font-weight:600; text-align:right;">${formatPhilippineTime()}</td>
                      </tr>
                      <tr><td colspan="2" style="padding:8px 0; border-top:1px solid #e5e7eb;"></td></tr>
                      <tr>
                        <td style="padding:8px 0; color:#6b7280; font-size:14px; font-weight:500;">Time Zone</td>
                        <td style="padding:8px 0; color:#1f2937; font-size:14px; font-weight:600; text-align:right;">Asia/Manila (PHT)</td>
                      </tr>
                      <tr><td colspan="2" style="padding:8px 0; border-top:1px solid #e5e7eb;"></td></tr>
                      <tr>
                        <td style="padding:8px 0; color:#6b7280; font-size:14px; font-weight:500;">System</td>
                        <td style="padding:8px 0; color:#1f2937; font-size:14px; font-weight:600; text-align:right;">UPtime</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <tr>
            <td style="background-color:#f9fafb; padding:20px 30px; border-top:1px solid #e5e7eb; text-align:center;">
              <p style="color:#9ca3af; font-size:13px; margin:0;">
                Do not reply, this is an automated notification.<br/>
                For support, visit <a href="https://github.com/FireFlyDeveloper" style="color:#667eea; text-decoration:none;">FireFlyDeveloper on GitHub</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function formatSubject(subject, status = "info") {
  const label = status.toUpperCase();
  return `[${label}] ${subject}`;
}

async function sendEmail(subject, htmlContent, status = "info", retries = 3) {
  const formattedSubject = formatSubject(subject, status);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const accessToken = await getAccessToken();

      const from = `"noreply" <${process.env.EMAIL_USER}>`;
      const to = process.env.EMAIL_TARGET;

      const message =
        `From: ${from}\r\n` +
        `To: ${to}\r\n` +
        `Subject: ${formattedSubject}\r\n` +
        `Content-Type: text/html; charset="UTF-8"\r\n\r\n` +
        htmlContent;

      const encodedMessage = Buffer.from(message)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const res = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ raw: encodedMessage })
        }
      );

      if (!res.ok) {
        const err = await res.text();
        console.log(`[EMAIL ERROR] Attempt ${attempt}: ${res.status} — ${err}`);
        if (attempt < retries) await new Promise(r => setTimeout(r, 2000));
      } else {
        const data = await res.json();
        console.log(`[EMAIL] Sent: ${formattedSubject} (ID: ${data.id})`);
        break;
      }
    } catch (e) {
      console.log(`[EMAIL ERROR] Attempt ${attempt}: ${e.message}`);
      if (attempt < retries) await new Promise(r => setTimeout(r, 2000));
    }
  }
}

setInterval(() => {
  if (!lastHeartbeat) return;

  const diff = Date.now() - lastHeartbeat;
  console.log(`[CHECK] ms since heartbeat: ${diff}`);

  if (bootStartTime) {
    console.log(`[BOOT] ms since boot start: ${Date.now() - bootStartTime}`);
  }

  // Device Offline
  if (diff > 90000 && isDeviceOnline !== false) {
    isDeviceOnline = false;
    console.log("[STATUS] Device OFFLINE");

    sendEmail(
      "Device Offline Notification",
      buildEmailHtml(
        "Device Offline",
        "The monitored device has stopped sending heartbeat signals.",
        "error"
      ),
      "error"
    );

    bootStartTime = null;
    bootEmailSent = false;
  }

  // Boot failure
  if (bootStartTime && Date.now() - bootStartTime > 120000 && !bootEmailSent) {
    console.log("[BOOT] Boot failed after 2 minutes");

    sendEmail(
      "Device Boot Failure",
      buildEmailHtml(
        "Boot Failure",
        "The device failed to boot after 2 minutes.",
        "warning"
      ),
      "warning"
    );

    bootEmailSent = true;
  }

}, 10000);

app.get("/hello-world", (_req, res) => {
  res.send("Hello World!");
});

app.post("/health", (req, res) => {
  console.log("[ROUTE] POST /health");

  const data = req.body;

  if (!data || !data.password || data.password !== process.env.PASSWORD) {
    return res.status(401).send("Unauthorized: Incorrect password");
  }

  if (typeof data.isOnline !== "boolean") {
    return res.status(400).send("Bad Request: Missing status field");
  }

  lastHeartbeat = Date.now();
  console.log(`[HEARTBEAT] Received at ${formatPhilippineTime()}`);

  // Device online
  if (data.isOnline) {
    if (!isDeviceOnline && bootStartTime) {
      console.log("[BOOT] Device booted successfully");

      sendEmail(
        "Device Boot Successful",
        buildEmailHtml(
          "Boot Success",
          "The device has successfully booted.",
          "success"
        ),
        "success"
      );
    }

    isDeviceOnline = true;
    bootStartTime = null;
    bootEmailSent = false;

    console.log("[STATUS] Device ONLINE");
  }

  // Device offline → boot attempt
  else {
    if (isDeviceOnline !== false) {
      console.log("[STATUS] Device offline → boot attempt");

      if (!bootStartTime) {
        bootStartTime = Date.now();

        sendEmail(
          "Device Boot Attempt",
          buildEmailHtml(
            "Boot Attempt",
            "Device went offline. Initiating boot attempt...",
            "info"
          ),
          "info"
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
