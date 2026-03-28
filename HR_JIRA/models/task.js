const mongoose = require('mongoose')

const taskSchema = new mongoose.Schema({

  title: {
    type: String,
    required: true,
    trim: true
  },

  description: {
    type: String,
    trim: true
  },

  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  status: {
    type: String,
    enum: ['pending', 'in_progress', 'done'],
    default: 'pending'
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }

}, { timestamps: true })

// Indexes for performance
taskSchema.index({ assignedTo: 1 })
taskSchema.index({ status: 1 })
taskSchema.index({ createdBy: 1 })

module.exports = mongoose.model('Task', taskSchema)
