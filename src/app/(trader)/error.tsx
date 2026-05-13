"use client";

import { useEffect } from "react";
import { WorkspaceErrorState } from "@/components/app/RouteStates";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <WorkspaceErrorState
      title="Trader workspace failed to render"
      description="The trading area hit an unexpected issue. Retry to re-fetch the current segment."
      unstable_retry={unstable_retry}
    />
  );
}
