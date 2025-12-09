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

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});
