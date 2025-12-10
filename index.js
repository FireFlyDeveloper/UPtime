require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;

const { google } = require("googleapis");

app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;

  if (!code) return res.status(400).send("Missing code");

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.REDIRECT_URI
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log("TOKENS:", tokens);
    res.send("Authorization successful. Check server logs for tokens.");
  } catch (err) {
    console.log("ERROR:", err);
    res.status(500).send("Auth failed");
  }
});

app.get("/auth-url", (_req, res) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.REDIRECT_URI
  );

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.send"
    ]
  });

  res.send(url);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
