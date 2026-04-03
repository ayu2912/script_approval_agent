export type ScriptStatus =
  | "draft"
  | "pending_review"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "overdue"
  | "escalated"
  | "closed";

export type ChaserStatus =
  | "pending_hitl"
  | "draft_saved"
  | "approved"
  | "edited"
  | "rejected"
  | "sent";

export type MemoryType =
  | "feedback"
  | "approval"
  | "rejection"
  | "behavioral_pattern"
  | "chaser_sent"
  | "client_response"
  | "hitl_instruction";

export interface Client {
  id: string;
  name: string;
  email: string;
  company: string | null;
  whatsapp_number: string | null;
  preferred_channel: string;
  instagram_handle: string | null;
  youtube_channel_id: string | null;
  avg_response_hours: number | null;
  total_scripts: number;
  approved_count: number;
  rejected_count: number;
  changes_requested_count: number;
  brand_voice: string | null;
  account_manager: string | null;
  contract_start: string | null;
  monthly_volume: number | null;
  platform_focus: string[] | null;
  onboarding_checklist: Record<string, boolean> | null;
  created_at: string;
  updated_at: string;
}

export interface Script {
  id: string;
  title: string;
  content: string;
  client_id: string;
  status: ScriptStatus;
  review_token: string;
  client_feedback: string | null;
  sent_at: string | null;
  reviewed_at: string | null;
  due_date: string | null;
  expires_at: string | null;
  version: number;
  platform: string | null;
  assigned_writer: string | null;
  review_channel: string;
  response_deadline_minutes: number;
  archived: boolean;
  brief_id: string | null;
  quality_score: {
    hook_strength: number;
    cta_clarity: number;
    tone_consistency?: number | null;
    brand_alignment?: number;
    platform_fit?: number;
    pacing_structure?: number;
    average: number;
    feedback?: string;
    strengths?: string[];
    improvements?: string[];
  } | null;
  created_at: string;
  updated_at: string;
}

export interface ScriptWithClient extends Script {
  client: Client;
}

export interface Chaser {
  id: string;
  script_id: string;
  client_id: string;
  draft_content: string;
  status: ChaserStatus;
  team_lead_edits: string | null;
  hitl_state: Record<string, unknown> | null;
  sent_at: string | null;
  created_at: string;
}

export interface ChaserWithRelations extends Chaser {
  script: Script;
  client: Client;
}

export interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ClientMemory {
  id: string;
  client_id: string;
  content: string;
  embedding: number[] | null;
  memory_type: MemoryType;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export type ReportPlatform = "Instagram" | "YouTube" | "LinkedIn" | "TikTok" | "X/Twitter";
export type ReportContentType = "Video" | "Photo" | "Carousel" | "Story" | "Reel" | "Post";

export interface ReportEntry {
  title: string;
  platform: ReportPlatform;
  content_type: ReportContentType;
  post_url: string;
  post_date: string;
  metrics: Record<string, number>;
}

export interface AggregateMetrics {
  overall: Record<string, number>;
  [platform: string]: Record<string, number>;
}

export interface Report {
  id: string;
  client_id: string;
  report_title: string;
  period_start: string;
  period_end: string;
  entries: ReportEntry[];
  aggregate_metrics: AggregateMetrics | null;
  previous_aggregate: AggregateMetrics | null;
  generated_summary: string | null;
  recommendations: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ReportWithClient extends Report {
  client: Client;
}

export type BriefStatus =
  | "intake"
  | "parsing"
  | "parsed"
  | "assigned"
  | "in_progress"
  | "script_uploaded"
  | "archived";

export interface Brief {
  id: string;
  client_id: string;
  raw_input: string;
  content_type: string;
  platform: string | null;
  topic: string | null;
  target_audience: string | null;
  key_messages: string | null;
  tone: string | null;
  reference_links: string | null;
  deadline: string | null;
  special_instructions: string | null;
  parsed_brief: Record<string, unknown> | null;
  status: BriefStatus;
  assigned_writer: string | null;
  script_id: string | null;
  parsed_at: string | null;
  assigned_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BriefWithClient extends Brief {
  client: Client;
}

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: Client;
        Insert: {
          id?: string;
          name: string;
          email: string;
          company?: string | null;
          whatsapp_number?: string | null;
          preferred_channel?: string;
          instagram_handle?: string | null;
          youtube_channel_id?: string | null;
          avg_response_hours?: number | null;
          total_scripts?: number;
          approved_count?: number;
          rejected_count?: number;
          changes_requested_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          email?: string;
          company?: string | null;
          whatsapp_number?: string | null;
          preferred_channel?: string;
          instagram_handle?: string | null;
          youtube_channel_id?: string | null;
          avg_response_hours?: number | null;
          total_scripts?: number;
          approved_count?: number;
          rejected_count?: number;
          changes_requested_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      scripts: {
        Row: Script;
        Insert: {
          id?: string;
          title: string;
          content: string;
          client_id: string;
          status?: ScriptStatus;
          review_token?: string;
          client_feedback?: string | null;
          sent_at?: string | null;
          reviewed_at?: string | null;
          due_date?: string | null;
          expires_at?: string | null;
          version?: number;
          platform?: string | null;
          assigned_writer?: string | null;
          review_channel?: string;
          response_deadline_minutes?: number;
          archived?: boolean;
          brief_id?: string | null;
          quality_score?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          content?: string;
          client_id?: string;
          status?: ScriptStatus;
          review_token?: string;
          client_feedback?: string | null;
          sent_at?: string | null;
          reviewed_at?: string | null;
          due_date?: string | null;
          expires_at?: string | null;
          version?: number;
          platform?: string | null;
          assigned_writer?: string | null;
          review_channel?: string;
          response_deadline_minutes?: number;
          archived?: boolean;
          brief_id?: string | null;
          quality_score?: Record<string, unknown> | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scripts_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          }
        ];
      };
      chasers: {
        Row: Chaser;
        Insert: {
          id?: string;
          script_id: string;
          client_id: string;
          draft_content: string;
          status?: ChaserStatus;
          team_lead_edits?: string | null;
          hitl_state?: Record<string, unknown> | null;
          sent_at?: string | null;
          created_at?: string;
        };
        Update: {
          script_id?: string;
          client_id?: string;
          draft_content?: string;
          status?: ChaserStatus;
          team_lead_edits?: string | null;
          hitl_state?: Record<string, unknown> | null;
          sent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "chasers_script_id_fkey";
            columns: ["script_id"];
            isOneToOne: false;
            referencedRelation: "scripts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chasers_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          }
        ];
      };
      audit_log: {
        Row: AuditLog;
        Insert: {
          id?: string;
          entity_type: string;
          entity_id: string;
          action: string;
          actor: string;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          entity_type?: string;
          entity_id?: string;
          action?: string;
          actor?: string;
          metadata?: Record<string, unknown> | null;
        };
        Relationships: [];
      };
      client_memories: {
        Row: ClientMemory;
        Insert: {
          id?: string;
          client_id: string;
          content: string;
          embedding?: number[] | null;
          memory_type: MemoryType;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          client_id?: string;
          content?: string;
          embedding?: number[] | null;
          memory_type?: MemoryType;
          metadata?: Record<string, unknown> | null;
        };
        Relationships: [
          {
            foreignKeyName: "client_memories_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          }
        ];
      };
      briefs: {
        Row: Brief;
        Insert: {
          id?: string;
          client_id: string;
          raw_input: string;
          content_type?: string;
          platform?: string | null;
          topic?: string | null;
          target_audience?: string | null;
          key_messages?: string | null;
          tone?: string | null;
          reference_links?: string | null;
          deadline?: string | null;
          special_instructions?: string | null;
          parsed_brief?: Record<string, unknown> | null;
          status?: BriefStatus;
          assigned_writer?: string | null;
          script_id?: string | null;
          parsed_at?: string | null;
          assigned_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          client_id?: string;
          raw_input?: string;
          content_type?: string;
          platform?: string | null;
          topic?: string | null;
          target_audience?: string | null;
          key_messages?: string | null;
          tone?: string | null;
          reference_links?: string | null;
          deadline?: string | null;
          special_instructions?: string | null;
          parsed_brief?: Record<string, unknown> | null;
          status?: BriefStatus;
          assigned_writer?: string | null;
          script_id?: string | null;
          parsed_at?: string | null;
          assigned_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "briefs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "briefs_script_id_fkey";
            columns: ["script_id"];
            isOneToOne: false;
            referencedRelation: "scripts";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
