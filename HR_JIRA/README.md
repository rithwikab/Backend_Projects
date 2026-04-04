# HR JIRA – Task Management System with AI-Powered Analysis

A full-stack task management system designed for HR workflows, enhanced with an **AI-powered decision layer** that classifies tasks, assigns priority, and suggests responsible teams.

---

## Overview

This project simulates an internal HR JIRA-like system where:

* HR assigns tasks
* Employees execute tasks
* Managers monitor progress

On top of this, an **AI Agent** is integrated to assist HR/admins in making faster and more consistent decisions.

---

## Key Features

### Core System

* Role-based access (**HR / Manager / Employee**)
* Task creation, assignment, and tracking
* Status lifecycle:

  * `pending → in_progress → done`
* Notifications system
* Authentication with middleware protection

---

### AI-Powered Task Intelligence (Admin Feature)

Admins can analyze any task using an integrated AI system.

#### AI Capabilities:

*  **Priority Classification** → High / Medium / Low
*  **Category Detection** → Bug / Feature / Improvement
*  **Team Suggestion** → Backend / Frontend / DevOps
*  **Reasoning Output** → Explains the decision

---

## Architecture

```
Frontend (Vanilla JS UI)
        ↓
Express API Layer (Node.js)
        ↓
MongoDB (Task + User Data)
        ↓
AI Service Layer (OpenAI API / Fallback Engine)
        ↓
Structured JSON Response
        ↓
Modal UI Rendering (Client)
```

---

## AI System Design

### Flow

```
User    → "Analyze with AI"
        ↓
POST /admin/ai/analyze-ticket
        ↓
Fetch task from MongoDB
        ↓
Send structured prompt to AI
        ↓
Receive JSON response
        ↓
Render result in modal popup
```

---

### Prompt Engineering

The system uses structured prompts to ensure deterministic output:

* Forces JSON response
* Constrains categories
* Ensures explainability via reasoning field

---

### Reliability (Important)

The system includes **graceful fallback handling**:

* If AI API fails (quota/network):
  → returns intelligent mock response
* Prevents UI or demo failure
* Ensures consistent behavior

---

### Performance Optimization

* **Client-side caching**

  * Avoids repeated AI calls per task
* Reduced latency for repeated views
* Cost-efficient design

---

## Frontend Enhancements

* Modal-based AI result display (no alerts)
* Loading state: `"Analyzing..."`
* Color-coded priority:

  * 🔴 High
  * 🟠 Medium
  * 🟢 Low
* Dynamic rendering per task

---

## Tech Stack

| Layer    | Technology            |
| -------- | --------------------- |
| Backend  | Node.js, Express      |
| Database | MongoDB (Mongoose)    |
| Frontend | HTML, CSS, Vanilla JS |
| AI Layer | OpenAI API            |
| Auth     | Middleware-based      |

---

## Project Structure

```
/models          → MongoDB schemas (Task, User, Notification)
/routes          → API endpoints
  ├── users.js
  ├── tasks.js
  ├── notifications.js
  ├── admin.ai.js   ← AI integration
/middleware      → auth, role checks
/public          → frontend (HTML, CSS, JS)
/app.js          → entry point
```

---

## Run Locally

### 1. Clone repo

```bash
git clone https://github.com/rithwikab/Backend_Projects.git
cd Backend_Projects
```

---

### 2. Install dependencies

```bash
npm install
```

---

### 3. Setup environment variables

Create `.env`:

```
DB_URL=your_mongodb_connection
OPENAI_API_KEY=your_openai_key
```

---

### 4. Start server

```bash
npm start
```

---

### 5. Open app

```
http://localhost:9000
```

---

## API Example

### Analyze Task

```http
POST /admin/ai/analyze-ticket
```

```json
{
  "taskId": "TASK_ID_HERE"
}
```

---

### Sample Response

```json
{
  "success": true,
  "data": {
    "priority": "High",
    "category": "Bug",
    "suggestedTeam": "Backend",
    "reasoning": "Critical failure affecting multiple users"
  }
}
```

---

## Design Decisions

### Why AI in Admin Only?

* Controls inference cost
* Ensures decision authority remains centralized

---

### Why Client-Side Caching?

* Reduces redundant API calls
* Improves UX latency
* Demonstrates performance awareness

---

### Why Fallback System?

* Prevents runtime failures
* Ensures demo reliability
* Simulates production resilience

---

## Future Improvements

* Redis caching (server-side)
* Queue-based async AI processing
* Persist AI results in DB
* Role-based UI refinement
* Confidence score for predictions

---

## Demo

<img width="1895" height="708" alt="image" src="https://github.com/user-attachments/assets/8af98c6f-339f-49a6-ba53-86246adbaa3f" />


---

## Resume Highlight

> Built an AI-powered task classification system integrated into a full-stack HR workflow platform, with client-side caching and fault-tolerant design.

---

## 👨‍💻 Author

**Rithwika Bodiga**
