const URL = 'http://localhost:3000/api/v1/ingestion/transactions/upload '; // change if needed
const REQUESTS = 2;

function generateRecords(runId) {
  const records = [];

  for (let i = 1; i <= 1000; i++) {
    records.push({
      reference_no: `REF${runId}_${i}`,   
      customer_ref: `CUST${i}`,
      amount: Math.floor(Math.random() * 1000),
      currency: "INR",
      transaction_date: "2024-01-01"
    });
  }

  return records;
}

async function sendRequest(i) {
  const start = Date.now();

  try {
    const payload = {
      records: generateRecords(Date.now() + "_" + i),
      user_id: "stress_test",
      invalidCount: 0,
      totalRecords: 1000
    };

    const res = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5ZDBmMDBhYThjNjhhN2VkZDhkZTY2NiIsInJvbGUiOiJhZG1pbiIsImVtYWlsIjoiYWRtaW5AdGVzdC5jb20iLCJpYXQiOjE3NzU0MDA2NTcsImV4cCI6MTc3NTQwMjQ1N30.HV4QrGyX_lHlx83QBL7yVCOXx3CzbGC-3s53RUHR6NM'
        },
      body: JSON.stringify(payload)
    });

    const time = Date.now() - start;

    console.log(`✅ ${i}: ${time} ms`);

    return time;

  } catch (err) {
    console.log(`❌ ${i}: FAILED`);
    return null;
  }
}

async function runTest() {
  const promises = [];

  for (let i = 0; i < REQUESTS; i++) {
    promises.push(sendRequest(i));
  }

  const results = await Promise.all(promises);

  const valid = results.filter(r => r !== null);
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;

  console.log("\n=== RESULTS ===");
  console.log("Total Requests:", REQUESTS);
  console.log("Successful:", valid.length);
  console.log("Failed:", REQUESTS - valid.length);
  console.log("Avg Response Time:", avg.toFixed(2), "ms");
}

runTest();