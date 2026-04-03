import AppSidebar from "@/components/shared/AppSidebar";
import { FileText, PenTool, Eye, CheckCircle, Send, ChevronRight } from "lucide-react";

const steps = [
  { icon: FileText, label: "Brief" },
  { icon: PenTool, label: "Script" },
  { icon: Eye, label: "Review" },
  { icon: CheckCircle, label: "Approval" },
  { icon: Send, label: "Delivery" },
];

export default function WorkflowPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex transition-colors duration-300">
      <AppSidebar />
      <main className="flex-1 ml-[220px] min-h-screen">
        <header className="flex items-center gap-4 px-6 h-14 border-b border-[var(--border)]">
          <h1 className="text-sm font-medium text-[var(--text)]">Workflow</h1>
        </header>
        <div className="p-6">
          <p className="text-[13px] text-[var(--muted)] mb-8 max-w-xl">
            Every piece of content follows this pipeline from initial brief through to final delivery.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {steps.map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-2 px-6 py-5 rounded-lg border border-[var(--border)] bg-[var(--card)] min-w-[120px]">
                  <step.icon size={20} className="text-[var(--accent-primary)]" />
                  <span className="text-[13px] font-medium text-[var(--text)]">{step.label}</span>
                </div>
                {i < steps.length - 1 && (
                  <ChevronRight size={16} className="text-[var(--muted)] shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
