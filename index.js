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
    const { isOnline, passsword } = req.body;

    if (passsword !== process.env.PASSWORD) {
        return res.status(401).send('Unauthorized');
    }

    if (isOnline) {
        console.log("Server is marked as ONLINE");
    } else {
        console.log("Server is marked as OFFLINE");
    }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});
