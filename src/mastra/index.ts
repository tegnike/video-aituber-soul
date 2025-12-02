
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { weatherWorkflow } from './workflows/weather-workflow';
import { aituberWorkflow } from './workflows/aituber-workflow';
import { weatherAgent } from './agents/weather-agent';
import { aituberAgent } from './agents/aituber-agent';
import { readingGeneratorAgent } from './agents/reading-generator-agent';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';

// セッション管理関数をエクスポート
export {
  startSession,
  endSession,
  getSession,
  getConversations,
  getAllViewers,
} from './lib/session-store';

export const mastra = new Mastra({
  workflows: { weatherWorkflow, aituberWorkflow },
  agents: { weatherAgent, aituberAgent, readingGeneratorAgent },
  scorers: { toolCallAppropriatenessScorer, completenessScorer, translationScorer },
  storage: new LibSQLStore({
    url: "file:../mastra.db",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  telemetry: {
    // Telemetry is deprecated and will be removed in the Nov 4th release
    enabled: false, 
  },
  observability: {
    // Enables DefaultExporter and CloudExporter for AI tracing
    default: { enabled: true }, 
  },
});
