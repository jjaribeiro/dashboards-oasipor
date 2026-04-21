"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { FeedbackButton } from "@/components/feedback-button";

export function ClockDisplay() {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setMounted(true);
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center gap-4 text-slate-600">
        <span className="text-2xl font-bold tabular-nums">--:--:--</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 text-slate-600" suppressHydrationWarning>
      <FeedbackButton />
      <span className="text-2xl font-bold tabular-nums" suppressHydrationWarning>
        {format(now, "HH:mm:ss")}
      </span>
      <span className="text-sm capitalize" suppressHydrationWarning>
        {format(now, "EEEE, d 'de' MMMM yyyy", { locale: pt })}
      </span>
    </div>
  );
}
