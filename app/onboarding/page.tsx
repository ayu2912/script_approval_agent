import OnboardingForm from "@/components/onboarding/OnboardingForm";
import AppSidebar from "@/components/shared/AppSidebar";

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex transition-colors duration-300">
      <AppSidebar />

      <main className="flex-1 ml-[220px] min-h-screen">
        <header className="flex items-center gap-4 px-6 py-4 border-b border-[var(--border)]">
          <h1 className="text-lg font-semibold text-[var(--text)]">Client Onboarding</h1>
        </header>

        <OnboardingForm />
      </main>
    </div>
  );
}
