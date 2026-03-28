const token = localStorage.getItem('token')
const role = localStorage.getItem('role')
const name = localStorage.getItem('name')

const nav = document.getElementById('navbar')


if (!token) {
  location.href = 'login.html'
}


// Base
let html = `
  <div>

    <b style="margin-right:20px;">${name || ''}</b>

    <a href="index.html">Dashboard</a>
    <a href="tasks.html">My Tasks</a>

    <a href="notifications.html" style="position:relative;">
      🔔 <span id="bellCount"></span>
    </a>

  </div>
`


// HR / Manager
if (role === 'hr' || role === 'manager') {

  html += `
    <div>

      <a href="assigned-tasks.html">Assigned Tasks</a>

      <a href="create-task.html">Create Task</a>

    </div>
  `
}


// HR Only
if (role === 'hr') {
  html += `<a href="create-user.html">Create User</a>`
}


// Logout
html += `
  <button onclick="logout()">Logout</button>
`


nav.innerHTML = html


function logout() {
  localStorage.clear()
  location.href = 'login.html'
}


// Bell Badge
async function loadBell() {

  const res = await fetch('/notifications/unread-count', {
    headers: {
      Authorization: localStorage.getItem('token')
    }
  })

  const data = await res.json()

  const badge = document.getElementById('bellCount')

  if (data.count > 0) {
    badge.textContent = data.count
    badge.style.cssText = `
      background:red;
      color:white;
      border-radius:50%;
      padding:2px 6px;
      font-size:12px;
    `
  } else {
    badge.textContent = ''
  }
}


loadBell()
