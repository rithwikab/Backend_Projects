const IORedis = require("ioredis");

/*
  One shared Redis connection, reused by every Queue and Worker in
  this project — BullMQ recommends this over opening a separate
  connection per queue/worker.

  maxRetriesPerRequest: null is REQUIRED by BullMQ — its blocking
  commands (used internally by Workers to wait for new jobs) are
  incompatible with ioredis's default retry behavior on those
  commands.
*/
const connection = new IORedis(
  process.env.REDIS_URL || "redis://localhost:6379",
  { maxRetriesPerRequest: null }
);

connection.on("error", (err) => {
  console.error("Redis connection error:", err.message);
});

module.exports = connection;
