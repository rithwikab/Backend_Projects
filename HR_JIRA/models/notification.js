const mongoose = require('mongoose')

const notificationSchema = new mongoose.Schema({

  message: {
    type: String,
    required: true
  },

  type: {
    type: String,
    enum: ['task', 'status', 'system'],
    default: 'task'
  },

  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  },

  isRead: {
    type: Boolean,
    default: false
  }

}, { timestamps: true })

// Performance index
notificationSchema.index({ user: 1, isRead: 1 })

module.exports = mongoose.model('Notification', notificationSchema)
