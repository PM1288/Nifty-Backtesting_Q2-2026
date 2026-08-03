import React from "react";

export function Pill({
  children,
  className = ""
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs text-slate-700 shadow-softer",
        className
      ].join(" ")}
    >
      {children}
    </span>
  );
}
