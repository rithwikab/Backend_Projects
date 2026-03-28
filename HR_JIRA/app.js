const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
require('dotenv').config()

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.static('public'))

mongoose.connect(process.env.DB_URL)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => {
    console.error('DB Connection Error:', err)
    process.exit(1)
  })


app.use('/users', require('./routes/users'))
app.use('/tasks', require('./routes/tasks'))
app.use('/notifications', require('./routes/notifications'))

app.use((err, req, res, next) => {
  res.status(500).json({ msg: 'Server Error' })
})

const PORT = process.env.PORT || 9000
app.listen(PORT, () => console.log('Running on', PORT))
