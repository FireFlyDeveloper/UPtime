require("dotenv").config();
const express = require('express');
const cors = require("cors");


const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;

app.get('/hello-world', (_req, res) => {
  res.send('Hello World!')
});

app.post('/health', (req, res) => {
    console.log("Received health status update:", req.body);
    res.status(200).send('Health status received');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});
