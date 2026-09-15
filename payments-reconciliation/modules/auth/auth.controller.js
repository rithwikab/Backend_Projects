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

    /*
      FIXED BUG: isActive existed on the User model but was never
      checked anywhere — a deactivated account could still log in
      and receive a fully valid JWT. Deliberately kept the SAME
      generic "Invalid credentials" message as the other 401s
      below, rather than a distinct "account disabled" message —
      that would leak account-existence/status to an unauthenticated
      caller, the same class of leak the original code already
      avoided between "no such user" and "wrong password".
    */
    if (!user.isActive) {
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