/*
  Simple Cache Wrapper
  Replace with Redis later
*/

const NodeCache = require("node-cache");

const cache = new NodeCache();

exports.get = async (key) => {
  return cache.get(key);
};

exports.set = async (key, value, ttl) => {
  cache.set(key, value, ttl);
};
