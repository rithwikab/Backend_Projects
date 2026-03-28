/*
  Simple In-Memory Cache
  Used for reconciliation summaries
*/

const cache = new Map();

const DEFAULT_TTL = 60 * 1000; // 1 minute


/* ---------------- GET ---------------- */

exports.get = key => {

  const item = cache.get(key);

  if (!item) return null;

  // Expired
  if (Date.now() > item.expiry) {

    cache.delete(key);

    return null;
  }

  return item.value;
};


/* ---------------- SET ---------------- */

exports.set = (key, value, ttl = DEFAULT_TTL) => {

  cache.set(key, {
    value,
    expiry: Date.now() + ttl
  });
};


/* ---------------- CLEAR ---------------- */

exports.clear = key => {

  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
};
