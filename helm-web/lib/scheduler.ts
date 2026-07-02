// Intended cron schedule for Mastra workflows.
// On Vercel (serverless), add these to vercel.json under "crons".
// On a long-running Node server, use node-cron with these expressions.
//
// vercel.json example:
// {
//   "crons": [
//     { "path": "/api/risk-scan",               "schedule": "0 9 * * *"  },
//     { "path": "/api/reports/weekly/generate", "schedule": "0 10 * * 1" },
//     { "path": "/api/dashboard/insights",      "schedule": "0 9 * * *"  }
//   ]
// }

export const SCHEDULE = {
  riskMonitor:       "0 9 * * *",   // Daily at 9 AM
  reminder:          "0 * * * *",   // Every hour
  weeklyReport:      "0 10 * * 1",  // Monday 10 AM
  strategicInsights: "0 9 * * *",   // Daily at 9 AM
} as const;
