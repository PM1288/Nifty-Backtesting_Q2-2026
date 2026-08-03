import React from "react";

export function Card({
  className = "",
  children
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        "rounded-2xl border border-slate-200/70 bg-white shadow-soft",
        "backdrop-blur-sm",
        className
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <div>
        <div className="text-[13px] font-semibold tracking-wide text-slate-900">{title}</div>
        {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}
