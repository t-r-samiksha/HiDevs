
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from "@mastra/duckdb";
import { MastraCompositeStore } from '@mastra/core/storage';
import { Observability, MastraStorageExporter, MastraPlatformExporter, SensitiveDataFilter } from '@mastra/observability';

// Workflows
import { riskMonitorWorkflow } from './workflows/risk-monitor';
import { followupHitlWorkflow, followupAgent } from './workflows/followup-hitl-workflow';
import { reminderWorkflow } from './workflows/reminder-workflow';
import { weeklyReportWorkflow } from './workflows/weekly-report-workflow';
import { strategicInsightWorkflow } from './workflows/strategic-insight-workflow';

// Agents
import { extractionAgent } from "./agents/extraction-agent";
import { supervisorAgent } from "./agents/supervisor-agent";
import { askAgent } from "./agents/ask-agent";
import { briefAgent } from "./agents/brief-agent";

// Tools
import { piiRedactorTool } from './tools/pii-redactor';
import { enkryptCheckTool } from './tools/enkrypt-check-tool';
import { qdrantSearchTool } from './tools/qdrant-search-tool';
import { qdrantWriteTool } from './tools/qdrant-write-tool';
import { dependencyResolverTool } from './tools/dependency-resolver-tool';

// Scorers
import { itemCountScorer, ownerAccuracyScorer, typeAccuracyScorer, sourceQuotePresenceScorer } from './scorers/extraction-scorer';


export const mastra = new Mastra({
  workflows: {
    riskMonitorWorkflow,
    followupHitlWorkflow,
    reminderWorkflow,
    weeklyReportWorkflow,
    strategicInsightWorkflow,
  },
  agents: {
    extractionAgent,
    followupAgent,
    supervisorAgent,
    askAgent,
    briefAgent,
  },
  tools: {
    piiRedactorTool,
    enkryptCheckTool,
    qdrantSearchTool,
    qdrantWriteTool,
    dependencyResolverTool,
  },
  scorers: {
    itemCountScorer,
    ownerAccuracyScorer,
    typeAccuracyScorer,
    sourceQuotePresenceScorer,
  },
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new LibSQLStore({
      id: "mastra-storage",
      url: "file:./mastra.db",
    }),
    domains: {
      observability: await new DuckDBStore().getStore('observability'),
    }
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new MastraStorageExporter(),
          new MastraPlatformExporter(),
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(),
        ],
      },
    },
  }),
});
