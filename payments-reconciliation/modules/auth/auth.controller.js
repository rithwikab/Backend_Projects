const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const User = require("../../models/User");

/*
  Login Controller
*/

exports.login = async (req, res) => {

  try {

    const { email, password } = req.body;

    // 1. Check user exists
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials"
      });
    }

    // 2. Compare password
    const valid = await bcrypt.compare(
      password,
      user.password
    );

    if (!valid) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials"
      });
    }

    // 3. Generate JWT
    const token = jwt.sign(
      {
        id: user._id,
        role: user.roles[0],
        email: user.email
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN
      }
    );

    // 4. Send response
    return res.json({
      success: true,
      data: {
        access_token: token,
        user: {
          id: user._id,
          email: user.email,
          role: user.roles[0]
        }
      }
    });

  } catch (err) {

    console.error("Login error:", err);

    return res.status(500).json({
      success: false,
      error: "Login failed"
    });
  }
};
