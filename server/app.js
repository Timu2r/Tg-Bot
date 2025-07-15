const express = require('express');
const path = require('path');
const { PORT } = require('../config');

const app = express();

app.use('/admin-panel', express.static(path.join(__dirname, '../admin-panel')));
app.use(express.json());

module.exports = app;