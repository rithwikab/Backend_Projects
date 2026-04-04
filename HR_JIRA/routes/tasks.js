const express = require('express')

const Task = require('../models/task')
const Notification = require('../models/notification')

const auth = require('../middleware/auth')
const role = require('../middleware/role')

const router = express.Router()


// Create Task (HR / Manager)
router.post('/', auth, role('hr', 'manager'), async (req, res) => {

  const task = new Task({
    title: req.body.title,
    description: req.body.description,
    assignedTo: req.body.assignedTo,
    createdBy: req.user.id
  })

  await task.save()


  await Notification.create({
    user: req.body.assignedTo,
    message: `New task assigned: ${task.title}`
  })


  res.json(task)
})


// My Tasks (Employee View)
router.get('/my', auth, async (req, res) => {

  const tasks = await Task.find({
    assignedTo: req.user.id
  })
    .populate('assignedTo', 'name')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 })

  res.json(tasks)
})


// Assigned By Me (HR / Manager View) ⭐ NEW
router.get('/assigned', auth, role('hr', 'manager'), async (req, res) => {

  const tasks = await Task.find({
    createdBy: req.user.id
  })
    .populate('assignedTo', 'name email')
    .sort({ createdAt: -1 })

  res.json(tasks)
})


// Update Status
router.patch('/:id/status', auth, async (req, res) => {

  const task = await Task.findById(req.params.id)
  
  if (!task)
    return res.status(404).json({ msg: 'Not found' })


  if (task.assignedTo.toString() !== req.user.id)
    return res.status(403).json({ msg: 'Forbidden' })


  task.status = req.body.status

  await task.save()


  await Notification.create({
    user: task.createdBy,
    message: `Task "${task.title}" marked ${task.status}`
  })


  res.json(task)
})


module.exports = router
