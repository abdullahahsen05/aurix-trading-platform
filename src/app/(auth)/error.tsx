"use client";

import { useEffect } from "react";
import { AuthErrorState } from "@/components/app/RouteStates";

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

  return <AuthErrorState unstable_retry={unstable_retry} />;
}
