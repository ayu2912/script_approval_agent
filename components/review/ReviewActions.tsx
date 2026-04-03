"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, RotateCcw, X, Loader2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type ReviewAction = "approved" | "rejected" | "changes_requested";

const actions: {
  key: ReviewAction;
  label: string;
  icon: typeof Check;
  style: string;
  activeStyle: string;
}[] = [
  {
    key: "approved",
    label: "Approve",
    icon: Check,
    style: "border-[var(--border)] text-[var(--text)] opacity-60 hover:opacity-100 hover:border-[var(--accent-success)]/50 hover:text-[var(--accent-success)]",
    activeStyle: "bg-[var(--accent-success)] border-[var(--accent-success)] text-white opacity-100",
  },
  {
    key: "changes_requested",
    label: "Request Changes",
    icon: RotateCcw,
    style: "border-[var(--border)] text-[var(--text)] opacity-60 hover:opacity-100 hover:border-orange-400/50 hover:text-orange-400",
    activeStyle: "bg-orange-500/20 border-orange-400 text-orange-400 opacity-100",
  },
  {
    key: "rejected",
    label: "Reject",
    icon: X,
    style: "border-[var(--border)] text-[var(--text)] opacity-60 hover:opacity-100 hover:border-red-400/50 hover:text-red-400",
    activeStyle: "bg-red-500/20 border-red-400 text-red-400 opacity-100",
  },
];

const successMessages: Record<ReviewAction, { heading: string; subtext: string }> = {
  approved: {
    heading: "Script approved!",
    subtext: "The team has been notified. Thank you for your review.",
  },
  changes_requested: {
    heading: "Feedback sent!",
    subtext: "The team will revise and resend. We appreciate the detail.",
  },
  rejected: {
    heading: "Script rejected.",
    subtext: "The team has been notified. They'll reach out with next steps.",
  },
};

interface ReviewActionsProps {
  token: string;
}

export default function ReviewActions({ token }: ReviewActionsProps) {
  const [selected, setSelected] = useState<ReviewAction | null>(null);
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<ReviewAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const needsFeedback = selected === "changes_requested" || selected === "rejected";

  function handleSubmitClick() {
    if (!selected) return;
    if (!confirming) { setConfirming(true); return; }
    handleSubmit();
  }

  async function handleSubmit() {
    if (!selected) return;
    setIsSubmitting(true);
    setConfirming(false);
    setError(null);

    try {
      const res = await fetch(`/api/review/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: selected, feedback: feedback.trim() || undefined }),
      });
      const data = await res.json();
      if (res.status === 409) { setSubmitted(data.status || selected); return; }
      if (!res.ok) throw new Error(data.error || "Failed to submit review");
      setSubmitted(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    const msg = successMessages[submitted];
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-16 text-center"
      >
        <div className={cn(
          "w-16 h-16 rounded-full flex items-center justify-center mb-6",
          submitted === "approved" && "bg-[var(--accent-success)]/10",
          submitted === "changes_requested" && "bg-orange-500/10",
          submitted === "rejected" && "bg-red-500/10",
        )}>
          {submitted === "approved" && <Check size={28} className="text-[var(--accent-success)]" />}
          {submitted === "changes_requested" && <RotateCcw size={28} className="text-orange-400" />}
          {submitted === "rejected" && <X size={28} className="text-red-400" />}
        </div>
        <h2 className="text-xl font-semibold text-[var(--text)] mb-2">{msg.heading}</h2>
        <p className="text-sm text-[var(--muted)] max-w-sm">{msg.subtext}</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          const isActive = selected === action.key;
          return (
            <button
              key={action.key}
              onClick={() => { setSelected(isActive ? null : action.key); setError(null); setConfirming(false); }}
              className={cn(
                "flex flex-col items-center gap-2 px-4 py-4 rounded-lg border transition-all duration-150",
                isActive ? action.activeStyle : action.style
              )}
            >
              <Icon size={18} />
              <span className="text-xs font-medium">{action.label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {needsFeedback && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
          >
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Tell us what needs to change..."
              rows={4}
              className="w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] placeholder:text-[var(--muted)]/50 focus:outline-none focus:border-[var(--muted)] transition-colors resize-y"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.12 }}
          >
            <button
              onClick={handleSubmitClick}
              disabled={isSubmitting || (needsFeedback && !feedback.trim())}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors",
                confirming
                  ? "bg-amber-500 text-white hover:bg-amber-400"
                  : "bg-[var(--accent-primary)] text-white hover:opacity-90"
              )}
            >
              {isSubmitting ? (
                <><Loader2 size={16} className="animate-spin" /> Submitting...</>
              ) : confirming ? (
                <><span>Confirm Submit</span> <ArrowRight size={16} /></>
              ) : (
                <><span>Submit Review</span> <ArrowRight size={16} /></>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
