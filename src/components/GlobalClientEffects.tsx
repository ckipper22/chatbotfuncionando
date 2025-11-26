"use client";

import { Suspense } from "react";
import { useZoerIframe } from "@/hooks/useZoerIframe";

function GlobalClientEffectsContent() {
  // Global hooks
  useZoerIframe();

  return null;
}

export default function GlobalClientEffects() {
  return (
    <Suspense fallback={null}>
      <GlobalClientEffectsContent />
    </Suspense>
  );
}

