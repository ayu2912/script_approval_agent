"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  X, Loader2, Save, User, Mail, Building2, Phone, Globe,
  Instagram, Youtube, Twitter, Linkedin, Mic, UserCheck,
  Calendar, Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/ToastProvider";

const CHANNELS = ["email", "whatsapp", "both"] as const;
const PLATFORMS = ["Instagram", "YouTube", "LinkedIn", "TikTok", "X/Twitter"] as const;

interface ClientEditData {
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

interface ClientEditDrawerProps {
  clientId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

const inputCls = "w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent";

export default function ClientEditDrawer({ clientId, onClose, onSaved }: ClientEditDrawerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ClientEditData>({
    name: "", email: "", company: "", whatsapp_number: "",
    preferred_channel: "email", instagram_handle: "", youtube_channel_id: "",
    twitter_handle: "", linkedin_url: "",
    brand_voice: "", account_manager: "", contract_start: "",
    monthly_volume: "", platform_focus: [],
  });

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    fetch(`/api/clients/${clientId}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        setForm({
          name: data.name || "",
          email: data.email || "",
          company: data.company || "",
          whatsapp_number: data.whatsapp_number || "",
          preferred_channel: data.preferred_channel || "email",
          instagram_handle: data.instagram_handle || "",
          youtube_channel_id: data.youtube_channel_id || "",
          twitter_handle: data.twitter_handle || "",
          linkedin_url: data.linkedin_url || "",
          brand_voice: data.brand_voice || "",
          account_manager: data.account_manager || "",
          contract_start: data.contract_start || "",
          monthly_volume: data.monthly_volume ? String(data.monthly_volume) : "",
          platform_focus: data.platform_focus || [],
        });
      })
      .catch(() => toast("error", "Failed to load client"))
      .finally(() => setLoading(false));
  }, [clientId, toast]);

  function update(field: keyof ClientEditData, value: string | string[]) {
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

  async function handleSave() {
    if (!clientId || !form.name.trim() || !form.email.trim()) {
      toast("error", "Name and email are required");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        preferred_channel: form.preferred_channel,
      };
      if (form.company) payload.company = form.company;
      if (form.whatsapp_number) payload.whatsapp_number = form.whatsapp_number;
      if (form.instagram_handle) payload.instagram_handle = form.instagram_handle;
      if (form.youtube_channel_id) payload.youtube_channel_id = form.youtube_channel_id;
      if (form.twitter_handle) payload.twitter_handle = form.twitter_handle;
      if (form.linkedin_url) payload.linkedin_url = form.linkedin_url;
      if (form.brand_voice) payload.brand_voice = form.brand_voice;
      if (form.account_manager) payload.account_manager = form.account_manager;
      if (form.contract_start) payload.contract_start = form.contract_start;
      if (form.monthly_volume) payload.monthly_volume = parseInt(form.monthly_volume);
      if (form.platform_focus.length > 0) payload.platform_focus = form.platform_focus;

      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const e = await res.json();
        toast("error", e.error ?? "Failed to save");
        return;
      }

      toast("success", `${form.name} updated`);
      onSaved();
      onClose();
    } catch {
      toast("error", "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!clientId) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 h-screen w-full max-w-md z-50 bg-[var(--card)] border-l border-[var(--border)] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <User size={14} className="text-[var(--muted)]" />
            <h2 className="text-sm font-semibold text-[var(--text)]">Edit Client</h2>
          </div>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)]">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-[var(--muted)]" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <Field icon={User} label="Name *">
              <input type="text" value={form.name} onChange={(e) => update("name", e.target.value)} className={inputCls} />
            </Field>
            <Field icon={Mail} label="Email *">
              <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} className={inputCls} />
            </Field>
            <Field icon={Building2} label="Company">
              <input type="text" value={form.company} onChange={(e) => update("company", e.target.value)} className={inputCls} />
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
                      "px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors",
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

            <div className="pt-2 pb-1">
              <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50">Social Accounts</p>
            </div>
            <Field icon={Instagram} label="Instagram">
              <input type="text" value={form.instagram_handle} onChange={(e) => update("instagram_handle", e.target.value)} placeholder="@handle" className={inputCls} />
            </Field>
            <Field icon={Youtube} label="YouTube Channel ID">
              <input type="text" value={form.youtube_channel_id} onChange={(e) => update("youtube_channel_id", e.target.value)} placeholder="UC..." className={inputCls} />
            </Field>
            <Field icon={Twitter} label="X / Twitter">
              <input type="text" value={form.twitter_handle} onChange={(e) => update("twitter_handle", e.target.value)} placeholder="@handle" className={inputCls} />
            </Field>
            <Field icon={Linkedin} label="LinkedIn">
              <input type="text" value={form.linkedin_url} onChange={(e) => update("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/..." className={inputCls} />
            </Field>

            <div className="pt-2 pb-1">
              <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50">Contract</p>
            </div>
            <Field icon={UserCheck} label="Account Manager">
              <input type="text" value={form.account_manager} onChange={(e) => update("account_manager", e.target.value)} className={inputCls} />
            </Field>
            <Field icon={Calendar} label="Contract Start">
              <input type="date" value={form.contract_start} onChange={(e) => update("contract_start", e.target.value)} className={inputCls + " cursor-pointer"} />
            </Field>
            <Field icon={Hash} label="Monthly Volume">
              <input type="number" value={form.monthly_volume} onChange={(e) => update("monthly_volume", e.target.value)} placeholder="e.g. 12" className={inputCls + " [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"} />
            </Field>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50 mb-2">Platform Focus</p>
              <div className="flex gap-2 flex-wrap">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
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

            <div className="pt-2 pb-1">
              <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50">Brand Intelligence</p>
            </div>
            <Field icon={Mic} label="Brand Voice">
              <textarea
                value={form.brand_voice}
                onChange={(e) => update("brand_voice", e.target.value)}
                rows={4}
                placeholder="Tone, style, preferences..."
                className={inputCls + " resize-y min-h-[100px]"}
              />
            </Field>
          </div>
        )}

        <div className="px-6 py-4 border-t border-[var(--border)]">
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </motion.div>
    </>
  );
}

function Field({ icon: Icon, label, children }: { icon: typeof User; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={11} className="text-[var(--muted)]" />
        <label className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50">{label}</label>
      </div>
      {children}
    </div>
  );
}
