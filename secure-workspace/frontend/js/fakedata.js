/**
 * fakedata.js — Dynamic fake dashboard content generator.
 * Produces convincing but randomised productivity data on each page load.
 * All content is static-looking but varies slightly every time.
 */

const PROJECT_NAMES = [
  'Q4 Budget Analysis', 'Brand Identity Refresh', 'Infrastructure Migration',
  'Compliance Audit 2024', 'Product Roadmap Review', 'Vendor Assessment',
  'Security Posture Report', 'Workforce Planning', 'Client Onboarding Portal',
  'Data Governance Framework', 'Annual Risk Review', 'UX Research Sprint',
];

const STATUSES = [
  { label: 'On Track', cls: 'status--green' },
  { label: 'In Review', cls: 'status--blue' },
  { label: 'At Risk', cls: 'status--yellow' },
  { label: 'Completed', cls: 'status--grey' },
];

const TEAM_NAMES = [
  'Sarah R.', 'Marcus T.', 'Priya K.', 'James O.', 'Lena M.',
  'David C.', 'Amara S.', 'Tom B.', 'Yuki N.', 'Fatima H.',
];

const ACTIONS = [
  'updated', 'reviewed', 'commented on', 'completed a task in',
  'added an attachment to', 'changed the status of', 'archived',
];

const RELATIVE_TIMES = ['just now', '1m ago', '3m ago', '7m ago', '12m ago', '25m ago', '1h ago', '2h ago'];

/** @returns {number} Random int in [min, max] inclusive */
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** @returns {T} Random element from array */
function pick(arr) {
  return arr[rand(0, arr.length - 1)];
}

/**
 * Returns a future date string "MMM DD" between 2 and 60 days from now.
 * @returns {string}
 */
function futureDate() {
  const d = new Date(Date.now() + rand(2, 60) * 86400_000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Generates 4 random project card data objects.
 * @returns {Array<{name:string, status:object, progress:number, tasks:number, due:string}>}
 */
export function generateProjects() {
  const pool = [...PROJECT_NAMES].sort(() => Math.random() - 0.5).slice(0, 4);
  return pool.map(name => ({
    name,
    status: pick(STATUSES),
    progress: rand(15, 97),
    tasks: rand(4, 28),
    due: futureDate(),
  }));
}

/**
 * Generates 8–10 activity feed entries.
 * @returns {Array<{initials:string, name:string, action:string, project:string, time:string}>}
 */
export function generateActivity() {
  const count = rand(8, 10);
  const usedProjects = [...PROJECT_NAMES].sort(() => Math.random() - 0.5);
  return Array.from({ length: count }, (_, i) => {
    const name = pick(TEAM_NAMES);
    const initials = name.split(' ').map(p => p[0]).join('');
    return {
      initials,
      name,
      action: pick(ACTIONS),
      project: usedProjects[i % usedProjects.length],
      time: RELATIVE_TIMES[i] ?? pick(RELATIVE_TIMES),
    };
  });
}

/**
 * Generates 7 weekly bar chart data points (Mon–Sun), values 0–100.
 * @returns {Array<{day:string, value:number}>}
 */
export function generateChartData() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days.map(day => ({ day, value: rand(20, 95) }));
}

/**
 * Generates the 4 quick-stat metrics with slight random variation.
 * @returns {Array<{label:string, value:string, delta:string}>}
 */
export function generateStats() {
  return [
    { label: 'Active Projects', value: String(rand(10, 15)), icon: '📁' },
    { label: 'On Track', value: `${rand(78, 94)}%`, icon: '✅' },
    { label: 'Pending Reviews', value: String(rand(2, 6)), icon: '📋' },
    { label: 'Members Online', value: String(rand(1, 3)), icon: '👥' },
  ];
}

/**
 * Generates 1–2 "online colleague" names for the sidebar presence indicator.
 * @returns {string[]}
 */
export function generateOnlineColleagues() {
  const shuffled = [...TEAM_NAMES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, rand(1, 2));
}

/**
 * Injects all generated fake data into the dashboard DOM.
 * Called once by app.js after DOMContentLoaded.
 */
export function renderFakeDashboard() {
  renderProjects();
  renderActivity();
  renderChart();
  renderStats();
  renderOnlineColleagues();
}

function renderProjects() {
  const container = document.getElementById('projects-grid');
  if (!container) return;

  const projects = generateProjects();
  container.innerHTML = projects.map(p => `
    <div class="project-card">
      <div class="project-card__header">
        <span class="project-card__name">${escapeHTML(p.name)}</span>
        <span class="status-badge ${p.status.cls}">${p.status.label}</span>
      </div>
      <div class="project-card__progress">
        <div class="progress-bar">
          <div class="progress-bar__fill" style="width: ${p.progress}%"></div>
        </div>
        <span class="progress-label">${p.progress}%</span>
      </div>
      <div class="project-card__meta">
        <span>${p.tasks} tasks</span>
        <span>Due ${escapeHTML(p.due)}</span>
      </div>
    </div>
  `).join('');
}

function renderActivity() {
  const container = document.getElementById('activity-feed');
  if (!container) return;

  const items = generateActivity();
  container.innerHTML = items.map(item => `
    <div class="activity-item">
      <div class="activity-avatar">${escapeHTML(item.initials)}</div>
      <div class="activity-body">
        <span class="activity-name">${escapeHTML(item.name)}</span>
        <span class="activity-action"> ${escapeHTML(item.action)} </span>
        <span class="activity-project">${escapeHTML(item.project)}</span>
        <span class="activity-time"> · ${escapeHTML(item.time)}</span>
      </div>
    </div>
  `).join('');
}

function renderChart() {
  const container = document.getElementById('chart-bars');
  if (!container) return;

  const data = generateChartData();
  container.innerHTML = data.map(d => `
    <div class="chart-col">
      <div class="chart-bar" style="height: ${d.value}%"></div>
      <span class="chart-label">${d.day}</span>
    </div>
  `).join('');
}

function renderStats() {
  const container = document.getElementById('stats-row');
  if (!container) return;

  const stats = generateStats();
  container.innerHTML = stats.map(s => `
    <div class="stat-card">
      <span class="stat-icon">${s.icon}</span>
      <div class="stat-body">
        <span class="stat-value">${escapeHTML(s.value)}</span>
        <span class="stat-label">${escapeHTML(s.label)}</span>
      </div>
    </div>
  `).join('');
}

function renderOnlineColleagues() {
  const container = document.getElementById('online-colleagues');
  if (!container) return;

  const online = generateOnlineColleagues();
  container.innerHTML = online.map(name => `
    <div class="colleague-item">
      <span class="presence-dot"></span>
      <span class="colleague-name">${escapeHTML(name)}</span>
    </div>
  `).join('');
}

/** Prevents XSS when inserting text via innerHTML. */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
