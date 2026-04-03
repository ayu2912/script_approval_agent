"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Users, Video, Globe, MessageSquare, Target,
  Palette, Link2, Calendar, AlignLeft, Loader2, Check,
  X, Sparkles, ClipboardPaste, FormInput, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/ToastProvider";
import type { ParsedBrief } from "@/lib/briefs/parseBrief";

interface ClientOption {
  id: string;
  name: string;
  company: string | null;
}

interface BriefIntakeFormProps {
  clients: ClientOption[];
  onClose: () => void;
  onBriefCreated: () => void;
}

const CONTENT_TYPES = [
  { value: "video_script", label: "Video Script" },
  { value: "social_post", label: "Social Post" },
  { value: "blog", label: "Blog" },
  { value: "reel", label: "Reel" },
  { value: "story", label: "Story" },
] as const;

const PLATFORMS = ["Instagram", "YouTube", "TikTok", "LinkedIn", "X/Twitter"] as const;

const TONES = [
  { value: "casual", label: "Casual" },
  { value: "professional", label: "Professional" },
  { value: "witty", label: "Witty" },
  { value: "educational", label: "Educational" },
  { value: "inspirational", label: "Inspirational" },
] as const;

interface FormData {
  client_id: string;
  raw_input: string;
  content_type: string;
  platform: string;
  topic: string;
  target_audience: string;
  key_messages: string;
  tone: string;
  reference_links: string;
  deadline: string;
  special_instructions: string;
}

export default function BriefIntakeForm({ clients, onClose, onBriefCreated }: BriefIntakeFormProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"structured" | "paste">("structured");
  const [submitting, setSubmitting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsedResult, setParsedResult] = useState<ParsedBrief | null>(null);
  const [createdBriefId, setCreatedBriefId] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>({
    client_id: "",
    raw_input: "",
    content_type: "video_script",
    platform: "",
    topic: "",
    target_audience: "",
    key_messages: "",
    tone: "",
    reference_links: "",
    deadline: "",
    special_instructions: "",
  });

  function update(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function buildRawInput(): string {
    if (mode === "paste") return form.raw_input;

    const parts: string[] = [];
    if (form.topic) parts.push(`Topic: ${form.topic}`);
    if (form.key_messages) parts.push(`Key Messages: ${form.key_messages}`);
    if (form.target_audience) parts.push(`Target Audience: ${form.target_audience}`);
    if (form.tone) parts.push(`Tone: ${form.tone}`);
    if (form.reference_links) parts.push(`References: ${form.reference_links}`);
    if (form.special_instructions) parts.push(`Special Instructions: ${form.special_instructions}`);
    return parts.join("\n\n") || form.topic || "Brief intake";
  }

  async function handleSubmit() {
    if (!form.client_id) {
      toast("error", "Please select a client");
      return;
    }

    const rawInput = buildRawInput();
    if (!rawInput.trim()) {
      toast("error", mode === "paste" ? "Please paste your brief content" : "Please fill in at least a topic");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          raw_input: rawInput,
        }),
      });

      if (!res.ok) {
        const e = await res.json();
        toast("error", e.error ?? "Failed to create brief");
        return;
      }

      const brief = await res.json();
      setCreatedBriefId(brief.id);
      toast("success", "Brief created. Parsing with AI...");

      setParsing(true);
      const parseRes = await fetch(`/api/briefs/${brief.id}/parse`, {
        method: "POST",
      });

      if (parseRes.ok) {
        const parsed = await parseRes.json();
        setParsedResult(parsed.parsed_brief);
        toast("success", "Brief parsed successfully");
      } else {
        toast("error", "AI parsing failed. You can retry from the briefs page.");
      }

      onBriefCreated();
    } catch {
      toast("error", "Something went wrong");
    } finally {
      setSubmitting(false);
      setParsing(false);
    }
  }

  if (parsedResult) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-[var(--accent-success)]/10 border border-[var(--accent-success)]/30 flex items-center justify-center">
            <Sparkles size={20} className="text-[var(--accent-success)]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Brief Parsed</h2>
            <p className="text-xs text-[var(--muted)]">{parsedResult.title}</p>
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg divide-y divide-[var(--border)]">
          <ParsedRow label="Hook Angle" value={parsedResult.hook_angle} />
          <ParsedRow label="Core Message" value={parsedResult.core_message} />
          <ParsedRow label="CTA" value={parsedResult.cta} />
          <ParsedRow label="Tone Direction" value={parsedResult.tone_direction} />
          <ParsedRow label="Audience" value={parsedResult.target_audience_profile} />
          <ParsedRow label="Brand Notes" value={parsedResult.brand_alignment_notes} />
          {parsedResult.estimated_word_count && (
            <ParsedRow label="Est. Word Count" value={String(parsedResult.estimated_word_count)} />
          )}
          <div className="px-4 py-3">
            <span className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50">Key Talking Points</span>
            <ul className="mt-2 space-y-1">
              {parsedResult.key_talking_points.map((point, i) => (
                <li key={i} className="text-xs text-[var(--text)] flex items-start gap-2">
                  <span className="text-[var(--accent-primary)] mt-0.5 shrink-0">{i + 1}.</span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
          {parsedResult.writer_notes && (
            <div className="px-4 py-3">
              <span className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50">Writer Notes</span>
              <p className="text-xs text-[var(--text)] mt-1 leading-relaxed">{parsedResult.writer_notes}</p>
            </div>
          )}
          <div className="px-4 py-3">
            <span className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50">Platform</span>
            <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text)]">
              <span>{parsedResult.platform_constraints.format}</span>
              {parsedResult.platform_constraints.max_duration && (
                <>
                  <span className="text-[var(--muted)] opacity-30">&middot;</span>
                  <span>{parsedResult.platform_constraints.max_duration}</span>
                </>
              )}
              {parsedResult.platform_constraints.aspect_ratio && (
                <>
                  <span className="text-[var(--muted)] opacity-30">&middot;</span>
                  <span>{parsedResult.platform_constraints.aspect_ratio}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90 transition-colors"
          >
            <Check size={14} />
            Done
          </button>
        </div>
      </div>
    );
  }

  if (submitting || parsing) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Loader2 size={24} className="animate-spin text-[var(--accent-primary)]" />
        <div className="text-center">
          <p className="text-sm font-medium text-[var(--text)]">
            {parsing ? "AI is parsing your brief..." : "Creating brief..."}
          </p>
          <p className="text-xs text-[var(--muted)] mt-1">
            {parsing ? "Extracting structure, talking points, and writer guidance" : "Saving to database"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 p-1 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg w-fit">
        <button
          onClick={() => setMode("structured")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            mode === "structured"
              ? "bg-[var(--accent-primary)] text-white"
              : "text-[var(--muted)] hover:text-[var(--text)]"
          )}
        >
          <FormInput size={12} />
          Structured
        </button>
        <button
          onClick={() => setMode("paste")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            mode === "paste"
              ? "bg-[var(--accent-primary)] text-white"
              : "text-[var(--muted)] hover:text-[var(--text)]"
          )}
        >
          <ClipboardPaste size={12} />
          Paste Mode
        </button>
      </div>

      <Field icon={Users} label="Client *">
        <div className="relative">
          <select
            value={form.client_id}
            onChange={(e) => update("client_id", e.target.value)}
            className={selectCls}
          >
            <option value="">Select a client...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.company ? ` (${c.company})` : ""}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none" />
        </div>
      </Field>

      <Field icon={Video} label="Content Type">
        <div className="flex gap-2 flex-wrap">
          {CONTENT_TYPES.map((ct) => (
            <button
              key={ct.value}
              type="button"
              onClick={() => update("content_type", ct.value)}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-medium transition-colors",
                form.content_type === ct.value
                  ? "border border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--accent-primary)]/10"
                  : "bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
              )}
            >
              {ct.label}
            </button>
          ))}
        </div>
      </Field>

      <Field icon={Globe} label="Platform">
        <div className="flex gap-2 flex-wrap">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => update("platform", form.platform === p ? "" : p)}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-medium transition-colors",
                form.platform === p
                  ? "border border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--accent-primary)]/10"
                  : "bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </Field>

      <AnimatePresence mode="wait">
        {mode === "structured" ? (
          <motion.div
            key="structured"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="space-y-5"
          >
            <Field icon={MessageSquare} label="Topic / Idea *">
              <input
                type="text"
                value={form.topic}
                onChange={(e) => update("topic", e.target.value)}
                placeholder="What is this content about?"
                className={inputCls}
              />
            </Field>

            <Field icon={AlignLeft} label="Key Messages">
              <textarea
                value={form.key_messages}
                onChange={(e) => update("key_messages", e.target.value)}
                rows={3}
                placeholder="What are the main points to cover?"
                className={inputCls + " resize-y min-h-[80px]"}
              />
            </Field>

            <Field icon={Target} label="Target Audience">
              <input
                type="text"
                value={form.target_audience}
                onChange={(e) => update("target_audience", e.target.value)}
                placeholder="e.g. Young professionals aged 25-35"
                className={inputCls}
              />
            </Field>

            <Field icon={Palette} label="Tone">
              <div className="flex gap-2 flex-wrap">
                {TONES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => update("tone", form.tone === t.value ? "" : t.value)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-xs font-medium transition-colors",
                      form.tone === t.value
                        ? "border border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--accent-primary)]/10"
                        : "bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field icon={Link2} label="Reference Links">
              <textarea
                value={form.reference_links}
                onChange={(e) => update("reference_links", e.target.value)}
                rows={2}
                placeholder="Links to reference content, one per line"
                className={inputCls + " resize-y min-h-[60px]"}
              />
            </Field>

            <Field icon={Calendar} label="Deadline">
              <input
                type="date"
                value={form.deadline}
                onChange={(e) => update("deadline", e.target.value)}
                className={inputCls + " cursor-pointer"}
              />
            </Field>

            <Field icon={FileText} label="Special Instructions">
              <textarea
                value={form.special_instructions}
                onChange={(e) => update("special_instructions", e.target.value)}
                rows={2}
                placeholder="Anything else the writer should know?"
                className={inputCls + " resize-y min-h-[60px]"}
              />
            </Field>
          </motion.div>
        ) : (
          <motion.div
            key="paste"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="space-y-5"
          >
            <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-4">
              <p className="text-xs text-amber-400">Paste raw content from a Google Form response, email, or Slack message. The AI will extract structure automatically.</p>
            </div>

            <Field icon={ClipboardPaste} label="Raw Brief *">
              <textarea
                value={form.raw_input}
                onChange={(e) => update("raw_input", e.target.value)}
                rows={10}
                placeholder="Paste the full brief content here...

Example:
Client wants a 60-second Instagram Reel about their new protein bar launch. Target audience is gym-goers aged 18-30. Tone should be energetic and casual. They want to highlight the 30g protein, zero sugar, and available in 3 flavors. CTA is to visit their website. Deadline is next Friday."
                className={inputCls + " resize-y min-h-[200px] font-mono text-xs"}
              />
            </Field>

            <Field icon={Calendar} label="Deadline (optional)">
              <input
                type="date"
                value={form.deadline}
                onChange={(e) => update("deadline", e.target.value)}
                className={inputCls + " cursor-pointer"}
              />
            </Field>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] transition-colors"
        >
          <X size={14} />
          Cancel
        </button>

        <button
          onClick={handleSubmit}
          disabled={!form.client_id || submitting}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-bold bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Sparkles size={14} />
          Create & Parse Brief
        </button>
      </div>
    </div>
  );
}


const inputCls = "w-full px-3 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent";

const selectCls = "w-full px-3 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent appearance-none cursor-pointer";

function Field({ icon: Icon, label, children }: { icon: typeof FileText; label: string; children: React.ReactNode }) {
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

function ParsedRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <span className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50">{label}</span>
      <p className="text-xs text-[var(--text)] mt-1 leading-relaxed">{value}</p>
    </div>
  );
}
