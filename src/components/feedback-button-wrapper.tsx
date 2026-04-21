"use client";

import dynamic from "next/dynamic";

const FeedbackButton = dynamic(
  () => import("@/components/feedback-button").then((m) => m.FeedbackButton),
  { ssr: false }
);

export function FeedbackButtonWrapper() {
  return <FeedbackButton />;
}
