"use client";

import { Suspense } from "react";
import { FullScreenSignup } from "@/components/ui/full-screen-signup";

export default function LoginPage() {
  return (
    <Suspense>
      <FullScreenSignup />
    </Suspense>
  );
}
