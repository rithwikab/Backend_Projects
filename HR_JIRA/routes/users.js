const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

const User = require('../models/user')

const auth = require('../middleware/auth')
const role = require('../middleware/role')

const router = express.Router()


// Register User (HR Only)
router.post('/register', auth, role('hr'), async (req, res) => {

  try {

    let { name, email, password, role: userRole } = req.body


    // Validate input
    if (!name || !email || !password || !userRole) {
      return res.status(400).json({
        msg: 'All fields are required'
      })
    }


    // Normalize
    name = name.trim()
    email = email.trim().toLowerCase()


    // Check if user exists
    const exists = await User.findOne({ email })

    if (exists) {
      return res.status(400).json({
        msg: 'User already exists'
      })
    }


    // Hash password
    const hash = await bcrypt.hash(password, 10)


    const user = new User({
      name,
      email,
      password: hash,
      role: userRole
    })


    await user.save()


    res.json({
      msg: 'User created successfully'
    })

  } catch (err) {

    console.error('REGISTER ERROR:', err)

    res.status(500).json({
      msg: 'Server error'
    })
  }
})


// Login
router.post('/login', async (req, res) => {

  try {

    let { email, password } = req.body


    if (!email || !password) {
      return res.status(400).json({
        msg: 'Email and password required'
      })
    }


    email = email.trim().toLowerCase()


    const user = await User.findOne({ email })

    if (!user) {
      return res.status(400).json({
        msg: 'Invalid email or password'
      })
    }


    const ok = await bcrypt.compare(password, user.password)

    if (!ok) {
      return res.status(400).json({
        msg: 'Invalid email or password'
      })
    }


    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        name: user.name
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    )


    res.json({
      token,
      role: user.role,
      name: user.name
    })

  } catch (err) {

    console.error('LOGIN ERROR:', err)

    res.status(500).json({
      msg: 'Server error'
    })
  }
})


// Get Users (Employees + Managers + HR)
router.get('/employees', auth, async (req, res) => {

  try {

    const users = await User.find(
      { role: { $in: ['employee', 'manager', 'hr'] } },
      'name _id role'
    )

    res.json(users)

  } catch (err) {

    console.error('EMPLOYEES ERROR:', err)

    res.status(500).json({
      msg: 'Server error'
    })
  }
})


module.exports = router
