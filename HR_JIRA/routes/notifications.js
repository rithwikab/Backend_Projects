const express = require('express')
const router = express.Router()

const Notification = require('../models/notification')
const auth = require('../middleware/auth')


// Get My Notifications
router.get('/my', auth, async (req, res) => {

  const notes = await Notification.find({
    user: req.user.id
  })
    .sort({ createdAt: -1 })

  res.json(notes)
})


// Get Unread Count (For Bell Badge)
router.get('/unread-count', auth, async (req, res) => {

  const count = await Notification.countDocuments({
    user: req.user.id,
    isRead: false
  })

  res.json({ count })
})


// Mark As Read
router.patch('/:id/read', auth, async (req, res) => {

  await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user.id },
    { isRead: true }
  )

  res.json({ msg: 'Marked as read' })
})


module.exports = router
