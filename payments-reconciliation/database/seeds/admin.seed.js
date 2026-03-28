require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const User = require("../../models/User");

/*
  Seed default admin user
*/

async function seedAdmin() {

  try {

    // Connect to DB
    await mongoose.connect(process.env.MONGO_URI);

    // Check if admin already exists
    const existing = await User.findOne({
      email: "admin@test.com"
    });

    if (existing) {
      console.log("Admin already exists");
      process.exit(0);
    }

    // Hash password
    const hash = await bcrypt.hash("admin123", 10);

    // Create admin
    await User.create({
      email: "admin@test.com",
      password: hash,
      roles: ["admin"]
    });

    console.log("Admin user created:");
    console.log("Email: admin@test.com");
    console.log("Password: admin123");

    process.exit(0);

  } catch (err) {

    console.error("Seeding failed:", err);
    process.exit(1);
  }
}

seedAdmin();
