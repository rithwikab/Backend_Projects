const bcrypt = require("bcrypt");
const User = require("../../models/User");

/*
  Register new user (Admin only ideally)
*/
exports.register = async (req, res) => {

  try {

    const { email, password, role } = req.body;

    const exists = await User.findOne({ email });

    if (exists) {
      return res.status(409).json({
        error: "User already exists"
      });
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hash,
      roles: [role || "viewer"]
    });

    res.status(201).json({
      success: true,
      data: {
        id: user._id,
        email: user.email
      }
    });

  } catch (err) {

    res.status(500).json({
      error: "Registration failed"
    });
  }
};
