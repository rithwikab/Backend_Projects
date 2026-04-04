const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
require('dotenv').config()

const app = express()

// Middleware
app.use(cors())
app.use(express.json())

// Routes (IMPORTS)
const adminAIRoutes = require("./routes/admin.ai")
const userRoutes = require('./routes/users')
const taskRoutes = require('./routes/tasks')
const notificationRoutes = require('./routes/notifications')

// Routes (MOUNT FIRST)
app.use("/admin/ai", adminAIRoutes)
app.use('/users', userRoutes)
app.use('/tasks', taskRoutes)
app.use('/notifications', notificationRoutes)

// Debug route
app.get("/ping", (req, res) => {
  res.send("pong")
})

// Static (ALWAYS LAST)
app.use(express.static('public'))

// DB
mongoose.connect(process.env.DB_URL)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => {
    console.error('DB Connection Error:', err)
    process.exit(1)
  })

// Error handler
app.use((err, req, res, next) => {
  res.status(500).json({ msg: 'Server Error' })
})

// Server
const PORT = process.env.PORT || 9000
app.listen(PORT, () => console.log('Running on', PORT))