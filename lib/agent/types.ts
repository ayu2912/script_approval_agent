export interface AgentState {
  scriptId: string;
  clientId: string;
  clientEmail: string;
  clientName: string;
  scriptTitle: string;
  scriptContent: string;
  sentAt: string;
  dueDate: string | null;
  hoursOverdue: number;
  clientMemories: string[];
  generatedEmail: string | null;
  emailSubject: string | null;
  chaserId: string | null;
  error: string | null;
  urgencyScore: number | null;
  toneRecommendation: string | null;
  critiqueScores: CritiqueScores | null;
  revisionCount: number;
  nodeExecutionLog: NodeLogEntry[];
  hitlAction?: string | null;
  hitlEditedContent?: string | null;
  recommendedChannel?: string | null;
  preferredChannel?: string | null;
  ragEmpty?: boolean;
}

export interface CritiqueScores {
  professionalism: number;
  personalization: number;
  clarity: number;
  persuasiveness: number;
  average: number;
  feedback: string;
}

export interface NodeLogEntry {
  node: string;
  timestamp: string;
  durationMs: number;
  summary: string;
}

export function appendNodeLog(existing: NodeLogEntry[], incoming: NodeLogEntry[]): NodeLogEntry[] {
  return [...existing, ...incoming];
}
