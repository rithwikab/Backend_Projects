const express = require("express");
const router = express.Router();
const axios = require("axios");
const Task = require("../models/task");

// POST /admin/ai/analyze-ticket
router.post("/analyze-ticket", async (req, res) => {
  try {
    const task = await Task.findById(req.body.taskId);
    if (!task) {
  return res.status(404).json({
    success: false,
    message: "Task not found",
  });
}
    const prompt = `
You are an HR JIRA assistant.

Classify the following ticket into:
- Priority: High / Medium / Low
- Category: Bug / Feature / Improvement
- Suggested Team: Backend / Frontend / DevOps

Return JSON only.

Ticket:
${JSON.stringify(task)}
`;

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{ role: "hr", content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );
    
    const content = response.data.choices[0].message.content;

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { raw: content }; // fallback
    }

    res.json({
      success: true,
      data: parsed,
    });
//     const parsed = {
//   priority: "High",
//   category: "Bug",
//   suggestedTeam: "Backend",
//   reasoning: "Payment-related failure affecting users"
// };

return res.json({
  success: true,
  data: parsed
});
  } catch (err) {

  console.error("AI ERROR:", err.response?.data || err.message);

  // ✅ Fallback for quota / API failure
  if (err.response?.status === 429 || err.response?.status === 401) {
    return res.json({
      success: true,
      data: {
        priority: "High",
        category: "Bug",
        suggestedTeam: "Backend",
        reasoning: "Fallback response due to AI quota/API issue"
      }
    });
  }

  // Optional: fallback for ANY failure (stronger demo safety)
  return res.json({
    success: true,
    data: {
      priority: "Medium",
      category: "Improvement",
      suggestedTeam: "Backend",
      reasoning: "Default fallback response"
    }
  });
}
});

module.exports = router;