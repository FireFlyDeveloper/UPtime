require("dotenv").config();
const express = require('express');
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;

app.get('/hello-world', (_req, res) => {
  res.send('Hello World!');
});

app.post('/health', (req, res) => {
  const data = req.body;

  if (!data || !data.password || data.password !== process.env.PASSWORD) {
    return res.status(401).send('Unauthorized: Incorrect password');
  }

  if (typeof data.isOnline !== 'boolean') {
    return res.status(400).send('Bad Request: Missing status field');
  }

  if (data.isOnline) {
    console.log("Device is online");
  } else {
    console.log("Device is offline");
  }

  res.status(200).send('Health status received');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
