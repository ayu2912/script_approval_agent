"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Mail, Building2, Phone, Globe, Instagram, Youtube,
  Twitter, Linkedin,
  Mic, UserCheck, Calendar, Hash, ChevronRight, ChevronLeft,
  Loader2, Check, ArrowRight, Plus,
  CheckCircle2, Circle, AlertCircle, MinusCircle, Clock, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/ToastProvider";
import Link from "next/link";


interface FormData {
  name: string;
  email: string;
  company: string;
  whatsapp_number: string;
  preferred_channel: string;
  instagram_handle: string;
  youtube_channel_id: string;
  twitter_handle: string;
  linkedin_url: string;
  brand_voice: string;
  account_manager: string;
  contract_start: string;
  monthly_volume: string;
  platform_focus: string[];
}

interface OnboardingResult {
  client: { id: string; name: string } | null;
  results: Record<string, { success: boolean; error?: string }>;
}

interface SSEEvent {
  step: string;
  status: "started" | "completed" | "error" | "skipped";
  label: string;
  error?: string;
  data?: Record<string, unknown>;
}

type StepStatus = "pending" | "running" | "completed" | "error" | "skipped";

interface OnboardingStep {
  step: string;
  label: string;
  status: StepStatus;
  error?: string;
}

const INITIAL_STEPS: OnboardingStep[] = [
  { step: "client_create", label: "Creating client in database", status: "pending" },
  { step: "memories", label: "Seeding AI memories", status: "pending" },
  { step: "welcome_email", label: "Sending welcome email", status: "pending" },
  { step: "whatsapp", label: "Sending WhatsApp notification", status: "pending" },
  { step: "google_drive", label: "Creating Google Drive folder", status: "pending" },
  { step: "notion_page", label: "Creating Notion page", status: "pending" },
  { step: "airtable_entry", label: "Adding Airtable record", status: "pending" },
  { step: "audit_log", label: "Logging to audit trail", status: "pending" },
];

const PLATFORMS = ["Instagram", "YouTube", "LinkedIn", "TikTok", "X/Twitter"] as const;
const CHANNELS = ["email", "whatsapp", "both"] as const;
const STEPS = ["Client Basics", "Contract Details", "Brand Intelligence", "Review & Submit"] as const;


export default function OnboardingForm() {
  const { toast } = useToast();
  const [formStep, setFormStep] = useState(0);
  const [phase, setPhase] = useState<"form" | "streaming" | "done">("form");
  const [steps, setSteps] = useState<OnboardingStep[]>(INITIAL_STEPS);
  const [finalResult, setFinalResult] = useState<OnboardingResult | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const [form, setForm] = useState<FormData>({
    name: "",
    email: "",
    company: "",
    whatsapp_number: "",
    preferred_channel: "email",
    instagram_handle: "",
    youtube_channel_id: "",
    twitter_handle: "",
    linkedin_url: "",
    brand_voice: "",
    account_manager: "",
    contract_start: "",
    monthly_volume: "",
    platform_focus: [],
  });

  function update(field: keyof FormData, value: string | string[]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function togglePlatform(platform: string) {
    setForm((prev) => ({
      ...prev,
      platform_focus: prev.platform_focus.includes(platform)
        ? prev.platform_focus.filter((p) => p !== platform)
        : [...prev.platform_focus, platform],
    }));
  }

  function canProceed(): boolean {
    if (formStep === 0) return !!form.name.trim() && !!form.email.trim();
    return true;
  }

  const handleSubmit = useCallback(async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast("error", "Name and email are required");
      return;
    }

    setPhase("streaming");
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: "pending" as StepStatus })));

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
        signal: abortController.signal,
      });

      if (!res.ok || !res.body) {
        let errMsg = "Onboarding failed";
        try {
          const e = await res.json();
          errMsg = e.error ?? errMsg;
        } catch { /* non-JSON response */ }
        toast("error", errMsg);
        setPhase("form");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data: ")) continue;

          let event: SSEEvent;
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          if (event.step === "done") {
            const data = event.data as { client: { id: string; name: string } | null; results: Record<string, { success: boolean; error?: string }> };
            setFinalResult({ client: data?.client ?? null, results: data?.results ?? {} });
            setPhase("done");
            if (data?.client) {
              toast("success", `${form.name} onboarded successfully`);
            }
            continue;
          }

          const stepStatus: StepStatus =
            event.status === "started" ? "running" :
            event.status === "completed" ? "completed" :
            event.status === "skipped" ? "skipped" :
            "error";

          setSteps((prev) =>
            prev.map((s) =>
              s.step === event.step
                ? { ...s, status: stepStatus, label: event.label, error: event.error }
                : s
            )
          );
        }
      }
    } catch {
      toast("error", "Connection lost during onboarding");
      setPhase("form");
    }
  }, [form, toast]);

  function handleReset() {
    setForm({
      name: "", email: "", company: "", whatsapp_number: "",
      preferred_channel: "email", instagram_handle: "", youtube_channel_id: "",
      twitter_handle: "", linkedin_url: "",
      brand_voice: "", account_manager: "", contract_start: "",
      monthly_volume: "", platform_focus: [],
    });
    setFormStep(0);
    setPhase("form");
    setFinalResult(null);
    setSteps(INITIAL_STEPS);
  }

  if (phase === "streaming") {
    const completedCount = steps.filter((s) => s.status === "completed").length;
    const totalCount = steps.length;

    return (
      <div className="max-w-2xl mx-auto py-12 px-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/30 flex items-center justify-center">
              <Loader2 size={20} className="text-[var(--accent-primary)] animate-spin" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Onboarding {form.name}...</h2>
              <p className="text-xs text-[var(--muted)]">{completedCount} of {totalCount} steps completed</p>
            </div>
          </div>

          <div className="h-1 bg-[var(--border)] rounded-full mb-6 overflow-hidden">
            <motion.div
              className="h-full bg-[var(--accent-primary)] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(completedCount / totalCount) * 100}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>

          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg divide-y divide-[var(--border)]">
            {steps.map((s, i) => (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-3 px-4 py-3.5"
              >
                <StepIcon status={s.status} />
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm transition-colors",
                    s.status === "completed" ? "text-[var(--text)]" :
                    s.status === "running" ? "text-[var(--text)]" :
                    s.status === "error" ? "text-red-400" :
                    s.status === "skipped" ? "text-[var(--muted)]" :
                    "text-[var(--muted)] opacity-50"
                  )}>
                    {s.label}
                  </p>
                  {s.error && (
                    <p className="text-[10px] text-red-400 mt-0.5 truncate">{s.error}</p>
                  )}
                </div>
                {s.status === "completed" && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-[10px] font-medium text-[var(--accent-success)]"
                  >
                    Done
                  </motion.span>
                )}
                {s.status === "skipped" && (
                  <span className="text-[10px] font-medium text-[var(--muted)]">Skipped</span>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  if (phase === "done" && finalResult) {
    const r = finalResult.results;
    const allSucceeded = Object.values(r).every((v) => v.success);

    return (
      <div className="max-w-2xl mx-auto py-12 px-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-6">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center border",
              allSucceeded
                ? "bg-[var(--accent-success)]/10 border-[var(--accent-success)]/30"
                : "bg-amber-500/10 border-amber-500/30"
            )}>
              {allSucceeded
                ? <CheckCircle2 size={20} className="text-[var(--accent-success)]" />
                : <AlertCircle size={20} className="text-amber-400" />
              }
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">
                {finalResult.client?.name ?? form.name} onboarded
              </h2>
              <p className="text-xs text-[var(--muted)]">
                {allSucceeded ? "All steps completed successfully." : "Some steps had issues — see below."}
              </p>
            </div>
          </div>

          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg divide-y divide-[var(--border)]">
            <ChecklistItem label="Client Created" success={!!finalResult.client} automated />
            <ChecklistItem label="AI Memories Seeded" success={r.memories?.success ?? false} error={r.memories?.error} automated />
            <ChecklistItem label="Welcome Email" success={r.welcome_email?.success ?? false} error={r.welcome_email?.error} automated />
            <ChecklistItem label="WhatsApp Notification" success={r.whatsapp?.success ?? false} error={r.whatsapp?.error} automated />
            <ChecklistItem label="Google Drive Folder" success={r.google_drive?.success ?? false} error={r.google_drive?.error} automated />
            <ChecklistItem label="Notion Page" success={r.notion_page?.success ?? false} error={r.notion_page?.error} automated />
            <ChecklistItem label="Airtable Entry" success={r.airtable_entry?.success ?? false} error={r.airtable_entry?.error} automated />
            <ChecklistItem label="Audit Log" success={r.audit_log?.success ?? false} error={r.audit_log?.error} automated />

            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Clock size={14} className="text-amber-400" />
                <div>
                  <p className="text-sm text-[var(--text)]">First Brief</p>
                  <p className="text-[10px] text-[var(--muted)]">Upload the first script for this client</p>
                </div>
              </div>
              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)] transition-colors"
              >
                <FileText size={11} />
                Add Script
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-6">
            {finalResult.client && (
              <Link
                href={`/clients/${finalResult.client.id}`}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90 transition-colors"
              >
                View Client
                <ArrowRight size={12} />
              </Link>
            )}
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)] transition-colors"
            >
              Dashboard
            </Link>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)] transition-colors"
            >
              <Plus size={12} />
              Onboard Another
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-6">
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <button
              onClick={() => i <= formStep && setFormStep(i)}
              className={cn(
                "flex items-center gap-1.5 text-[11px] font-medium transition-colors",
                i === formStep ? "text-[var(--accent-primary)]" : i < formStep ? "text-[var(--text)]" : "text-[var(--muted)] opacity-40"
              )}
            >
              <span className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border",
                i === formStep ? "border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--accent-primary)]/10" :
                i < formStep ? "border-[var(--accent-success)] text-[var(--accent-success)] bg-[var(--accent-success)]/10" :
                "border-[var(--border)] text-[var(--muted)]"
              )}>
                {i < formStep ? <Check size={10} /> : i + 1}
              </span>
              {label}
            </button>
            {i < STEPS.length - 1 && <div className="w-8 h-px bg-[var(--border)]" />}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={formStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {formStep === 0 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-[var(--text)]">Client Basics</h2>

              <Field icon={User} label="Client Name *">
                <input type="text" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="John Smith" className={inputCls} />
              </Field>
              <Field icon={Mail} label="Email *">
                <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="john@brand.com" className={inputCls} />
              </Field>
              <Field icon={Building2} label="Company">
                <input type="text" value={form.company} onChange={(e) => update("company", e.target.value)} placeholder="Brand Co." className={inputCls} />
              </Field>
              <Field icon={Phone} label="WhatsApp Number">
                <input type="text" value={form.whatsapp_number} onChange={(e) => update("whatsapp_number", e.target.value)} placeholder="+91XXXXXXXXXX" className={inputCls} />
              </Field>
              <Field icon={Globe} label="Preferred Channel">
                <div className="flex gap-2">
                  {CHANNELS.map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => update("preferred_channel", ch)}
                      className={cn(
                        "px-4 py-2 rounded-lg text-xs font-medium capitalize transition-colors",
                        form.preferred_channel === ch
                          ? "border border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--accent-primary)]/10"
                          : "bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                      )}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </Field>
              <Field icon={Instagram} label="Instagram Handle">
                <input type="text" value={form.instagram_handle} onChange={(e) => update("instagram_handle", e.target.value)} placeholder="@brandhandle" className={inputCls} />
              </Field>
              <Field icon={Youtube} label="YouTube Channel ID">
                <input type="text" value={form.youtube_channel_id} onChange={(e) => update("youtube_channel_id", e.target.value)} placeholder="UC..." className={inputCls} />
              </Field>
              <Field icon={Twitter} label="X / Twitter Handle">
                <input type="text" value={form.twitter_handle} onChange={(e) => update("twitter_handle", e.target.value)} placeholder="@handle" className={inputCls} />
              </Field>
              <Field icon={Linkedin} label="LinkedIn URL">
                <input type="text" value={form.linkedin_url} onChange={(e) => update("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/..." className={inputCls} />
              </Field>
            </div>
          )}

          {formStep === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-[var(--text)]">Contract Details</h2>

              <Field icon={UserCheck} label="Account Manager">
                <input type="text" value={form.account_manager} onChange={(e) => update("account_manager", e.target.value)} placeholder="Who manages this client?" className={inputCls} />
              </Field>
              <Field icon={Calendar} label="Contract Start Date">
                <input type="date" value={form.contract_start} onChange={(e) => update("contract_start", e.target.value)} className={inputCls + " cursor-pointer"} />
              </Field>
              <Field icon={Hash} label="Monthly Content Volume">
                <input type="number" value={form.monthly_volume} onChange={(e) => update("monthly_volume", e.target.value)} placeholder="e.g. 12" className={inputCls + " [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"} />
              </Field>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50 mb-3">Platform Focus</p>
                <div className="flex gap-2 flex-wrap">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      className={cn(
                        "px-4 py-2 rounded-lg text-xs font-medium transition-colors",
                        form.platform_focus.includes(p)
                          ? "border border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--accent-primary)]/10"
                          : "bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {formStep === 2 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-[var(--text)]">Brand Intelligence</h2>
              <p className="text-xs text-[var(--muted)]">This gets stored in client memory. The AI agent uses it to match tone in chasers and reports.</p>

              <Field icon={Mic} label="Brand Voice & Communication Style">
                <textarea
                  value={form.brand_voice}
                  onChange={(e) => update("brand_voice", e.target.value)}
                  rows={5}
                  placeholder="e.g. Casual and friendly. Likes short sentences. Prefers bullet points over paragraphs. Responds well to direct CTAs. Dislikes corporate jargon."
                  className={inputCls + " resize-y min-h-[120px]"}
                />
              </Field>
            </div>
          )}

          {formStep === 3 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-[var(--text)]">Review & Submit</h2>

              <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg divide-y divide-[var(--border)]">
                <ReviewRow label="Name" value={form.name} />
                <ReviewRow label="Email" value={form.email} />
                <ReviewRow label="Company" value={form.company} />
                <ReviewRow label="WhatsApp" value={form.whatsapp_number} />
                <ReviewRow label="Channel" value={form.preferred_channel} />
                <ReviewRow label="Instagram" value={form.instagram_handle} />
                <ReviewRow label="YouTube" value={form.youtube_channel_id} />
                <ReviewRow label="X / Twitter" value={form.twitter_handle} />
                <ReviewRow label="LinkedIn" value={form.linkedin_url} />
                <ReviewRow label="Account Manager" value={form.account_manager} />
                <ReviewRow label="Contract Start" value={form.contract_start} />
                <ReviewRow label="Monthly Volume" value={form.monthly_volume ? `${form.monthly_volume} pieces` : ""} />
                <ReviewRow label="Platforms" value={form.platform_focus.join(", ")} />
                <ReviewRow label="Brand Voice" value={form.brand_voice ? (form.brand_voice.length > 80 ? form.brand_voice.slice(0, 80) + "..." : form.brand_voice) : ""} />
              </div>

              <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-4">
                <p className="text-xs text-amber-400">On submit, Greenlit will automatically:</p>
                <ul className="text-xs text-[var(--muted)] mt-2 space-y-1">
                  <li>1. Create the client in the database</li>
                  <li>2. Seed 3 AI memories with embeddings (brand voice, preferences, channel)</li>
                  <li>3. Send a welcome email to {form.email || "the client"}</li>
                  <li>4. Notify you via WhatsApp</li>
                  <li>5. Create a Google Drive folder (if configured)</li>
                  <li>6. Create a Notion project page (if configured)</li>
                  <li>7. Add to Airtable tracker (if configured)</li>
                </ul>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between mt-8">
        <button
          onClick={() => setFormStep(Math.max(0, formStep - 1))}
          disabled={formStep === 0}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={14} />
          Back
        </button>

        {formStep < STEPS.length - 1 ? (
          <button
            onClick={() => setFormStep(formStep + 1)}
            disabled={!canProceed()}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-xs font-bold bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
            <ChevronRight size={14} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!form.name.trim() || !form.email.trim()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-bold bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check size={14} />
            Submit & Onboard
          </button>
        )}
      </div>
    </div>
  );
}


const inputCls = "w-full px-3 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent";

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "completed":
      return (
        <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 25 }}>
          <CheckCircle2 size={16} className="text-[var(--accent-success)]" />
        </motion.div>
      );
    case "running":
      return <Loader2 size={16} className="text-[var(--accent-primary)] animate-spin" />;
    case "error":
      return <AlertCircle size={16} className="text-red-400" />;
    case "skipped":
      return <MinusCircle size={16} className="text-[var(--muted)] opacity-50" />;
    default:
      return <Circle size={16} className="text-[var(--muted)] opacity-30" />;
  }
}

function Field({ icon: Icon, label, children }: { icon: typeof User; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={12} className="text-[var(--muted)]" />
        <label className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50">{label}</label>
      </div>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <span className="text-xs text-[var(--text)] font-medium">{value || <span className="text-[var(--muted)] opacity-30">Not set</span>}</span>
    </div>
  );
}

function ChecklistItem({ label, success, error, automated }: { label: string; success: boolean; error?: string; automated?: boolean }) {
  return (
    <div className="flex items-center justify-between p-4">
      <div className="flex items-center gap-3">
        {success ? (
          <CheckCircle2 size={14} className="text-[var(--accent-success)]" />
        ) : (
          <AlertCircle size={14} className="text-red-400" />
        )}
        <div>
          <p className="text-sm text-[var(--text)]">{label}</p>
          {error && <p className="text-[10px] text-red-400">{error}</p>}
        </div>
      </div>
      {automated && (
        <span className={cn("text-[10px] font-medium", success ? "text-[var(--accent-success)]" : "text-red-400")}>
          {success ? "Automated" : "Failed"}
        </span>
      )}
    </div>
  );
}
