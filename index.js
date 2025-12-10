require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;

let lastHeartbeat = null;
let isDeviceOnline = null;
let bootStartTime = null;

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

function sendEmail(subject, message) {
  transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_TARGET,
    subject: subject,
    text: message
  }, (err) => {
    if (err) console.log("Email error:", err);
  });
}

setInterval(() => {
  if (!lastHeartbeat) return;

  const diff = Date.now() - lastHeartbeat;

  if (diff > 30000 && isDeviceOnline !== false) {
    isDeviceOnline = false;
    console.log("Device offline: No heartbeat");
    sendEmail("Device Offline", "The device stopped sending heartbeat.");
  }

  if (bootStartTime && Date.now() - bootStartTime > 60000) {
    console.log("Boot failed after 1 minute");
    sendEmail("Boot Failed", "Device failed to boot after 1 minute.");
    bootStartTime = null;
  }

}, 10000);

app.get("/hello-world", (_req, res) => {
  res.send("Hello World!");
});

app.post("/health", (req, res) => {
  const data = req.body;

  if (!data || !data.password || data.password !== process.env.PASSWORD) {
    return res.status(401).send("Unauthorized: Incorrect password");
  }

  if (typeof data.isOnline !== "boolean") {
    return res.status(400).send("Bad Request: Missing status field");
  }

  lastHeartbeat = Date.now();
  isDeviceOnline = data.isOnline;

  if (data.isOnline) {
    console.log("Device is online");
    bootStartTime = null;
  } else {
    console.log("Device is offline → boot attempt");

    if (!bootStartTime) {
      bootStartTime = Date.now();
      sendEmail("Boot Attempt", "Device reported offline. Attempting to boot...");
    }
  }

  res.status(200).send("Health status received");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
