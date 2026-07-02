const BASE = 'http://localhost:3000';
const PROJECT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

async function test(name, url, method = 'GET', body = null) {
  try {
    const opts = { method };
    if (body) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(`${BASE}${url}`, opts);
    const data = await res.json().catch(() => ({}));
    console.log(`${res.ok ? '✅' : '❌'} [${res.status}] ${name}`);
    if (!res.ok) console.log(`   ${JSON.stringify(data).slice(0, 200)}`);
    return res.ok;
  } catch (e) {
    console.log(`❌ [ERR] ${name}: ${e.message}`);
    return false;
  }
}

console.log('🔍 Helm API Smoke Test\n');

let pass = 0, fail = 0;
const r = async (...args) => { (await test(...args)) ? pass++ : fail++; };

await r('Dashboard briefing', `/api/dashboard/briefing?project_id=${PROJECT_ID}`);
await r('Items list',         `/api/items?project_id=${PROJECT_ID}`);
await r('Decisions',          `/api/decisions?project_id=${PROJECT_ID}`);
await r('Contradictions',     `/api/contradictions?project_id=${PROJECT_ID}`);
await r('Calendar',           `/api/calendar?project_id=${PROJECT_ID}&from=2026-01-01&to=2026-12-31`);
await r('Channels',           `/api/channels?project_id=${PROJECT_ID}`);
await r('Reminders',          `/api/reminders?project_id=${PROJECT_ID}`);
await r('Team status',        `/api/team/status?user_id=test&scope=direct`);
await r('Search (semantic)',  '/api/search', 'POST', { query: 'database decision', mode: 'search' });
await r('Search (ask)',       '/api/search', 'POST', { query: 'why did we choose iOS only?', mode: 'ask' });
await r('Insights',           `/api/dashboard/insights?project_id=${PROJECT_ID}`);
await r('Weekly report',      `/api/reports/weekly?project_id=${PROJECT_ID}`);
await r('Project brief',      `/api/projects/${PROJECT_ID}/brief`);
await r('Project documents',  `/api/projects/${PROJECT_ID}/documents`);

console.log(`\n${pass} passed, ${fail} failed out of ${pass + fail} routes`);
