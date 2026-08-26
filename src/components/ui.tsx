"use client";

import { motion, useSpring, useTransform, useMotionValue } from "framer-motion";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ═══════════════════════════════════════════
   GLASSMORPHISM CARD
   ═══════════════════════════════════════════ */
export function Card({
  children,
  className,
  delay = 0,
  glow,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  glow?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "glass-card relative overflow-hidden rounded-2xl p-5",
        glow && "ring-1 ring-indigo-400/25",
        className,
      )}
    >
      {glow ? (
        <div className="pointer-events-none absolute -top-20 -right-12 h-44 w-44 rounded-full bg-indigo-500/20 blur-3xl" />
      ) : null}
      <div className="relative">{children}</div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   SECTION TITLE
   ═══════════════════════════════════════════ */
export function SectionTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-white/90">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-white/45">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

/* ═══════════════════════════════════════════
   BUTTON with shine effect
   ═══════════════════════════════════════════ */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md";
  icon?: ReactNode;
};

export function Button({ variant = "secondary", size = "md", icon, className, children, ...rest }: ButtonProps) {
  const base =
    "relative inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 overflow-hidden";
  const sizes = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm";
  const variants: Record<string, string> = {
    primary:
      "bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-[0_8px_24px_-10px_rgba(99,102,241,0.7)] hover:shadow-[0_12px_32px_-8px_rgba(99,102,241,0.8)] hover:from-indigo-400 hover:to-indigo-500",
    secondary: "border border-white/10 bg-white/[0.06] text-white/85 hover:bg-white/[0.11] hover:text-white hover:border-white/15",
    ghost: "text-white/60 hover:bg-white/[0.06] hover:text-white",
    danger: "border border-rose-500/30 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25",
    success: "border border-emerald-500/30 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25",
  };
  return (
    <button className={cn(base, sizes, variants[variant], className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════
   PROGRESS BAR with glow
   ═══════════════════════════════════════════ */
export function Progress({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-white/[0.08]", className)}>
      <motion.div
        className="relative h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-400 to-sky-400"
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ ease: "easeOut", duration: 0.5 }}
        style={{
          boxShadow: pct > 0 ? "0 0 12px rgba(99,102,241,0.4), 0 0 24px rgba(99,102,241,0.15)" : "none",
        }}
      >
        {pct > 5 ? (
          <div
            className="absolute inset-0 overflow-hidden rounded-full"
          >
            <div
              className="absolute inset-0 -translate-x-full"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
                animation: "progress-shine 2s ease-in-out infinite",
              }}
            />
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   ANIMATED COUNTER
   ═══════════════════════════════════════════ */
export function AnimatedCounter({
  value,
  className,
  prefix = "",
  suffix = "",
}: {
  value: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}) {
  const spring = useSpring(0, { stiffness: 60, damping: 20 });
  const display = useTransform(spring, (v) => Math.round(v));
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  useEffect(() => {
    const unsubscribe = display.on("change", (v) => setDisplayValue(v));
    return () => unsubscribe();
  }, [display]);

  return (
    <span className={cn("tabular-nums", className)}>
      {prefix}{displayValue.toLocaleString()}{suffix}
    </span>
  );
}

/* ═══════════════════════════════════════════
   RING GAUGE
   ═══════════════════════════════════════════ */
export function RingGauge({
  value,
  size = 80,
  strokeWidth = 6,
  className,
  children,
  color = "from-indigo-400 to-sky-400",
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  children?: ReactNode;
  color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, value));
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-white/[0.06]"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          className="drop-shadow-[0_0_6px_rgba(99,102,241,0.5)]"
          style={{
            stroke: "url(#ring-gradient)",
          }}
        />
        <defs>
          <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="50%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   AVATAR
   ═══════════════════════════════════════════ */
export function Avatar({
  src,
  name,
  size = 40,
  className,
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = (name || "?").slice(0, 1).toUpperCase();
  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-sky-400 font-semibold text-white shadow-[0_4px_16px_-6px_rgba(99,102,241,0.6)]",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {src ? (
        <img
          src={src}
          alt={name ?? "avatar"}
          className="absolute inset-0 h-full w-full rounded-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        initials
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   SWITCH
   ═══════════════════════════════════════════ */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border transition-all duration-300 disabled:opacity-40",
        checked ? "border-indigo-400/40 bg-indigo-500/80 shadow-[0_0_12px_-4px_rgba(99,102,241,0.5)]" : "border-white/10 bg-white/10",
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={cn("absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-md", checked ? "left-6" : "left-0.5")}
        style={{ height: 18, width: 18, top: 3 }}
      />
    </button>
  );
}

/* ═══════════════════════════════════════════
   TOGGLE ROW
   ═══════════════════════════════════════════ */
export function ToggleRow({
  title,
  description,
  checked,
  onChange,
  badge,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  badge?: ReactNode;
}) {
  return (
    <div className="glass-card flex items-center justify-between gap-4 rounded-xl !bg-white/[0.02] !border-white/[0.06] px-4 py-3 transition-colors hover:!bg-white/[0.05]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white/90">{title}</p>
          {badge}
        </div>
        {description ? <p className="mt-0.5 text-xs leading-relaxed text-white/45">{description}</p> : null}
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

/* ═══════════════════════════════════════════
   FIELD, INPUT, TEXTAREA, SELECT
   ═══════════════════════════════════════════ */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/45">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-white/35">{hint}</span> : null}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/90 placeholder:text-white/25 outline-none transition-all duration-200 focus:border-indigo-400/50 focus:ring-2 focus:ring-indigo-500/20 focus:bg-white/[0.06]",
        className,
      )}
      {...rest}
    />
  );
}

export function TextArea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/90 placeholder:text-white/25 outline-none transition-all duration-200 focus:border-indigo-400/50 focus:ring-2 focus:ring-indigo-500/20 focus:bg-white/[0.06]",
        className,
      )}
      {...rest}
    />
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-xl border border-white/10 bg-[#0b0f1a] px-3 py-2 text-sm text-white/90 outline-none transition focus:border-indigo-400/50 [&>option]:bg-[#0b0f1a] [&>option]:text-white",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

/* ═══════════════════════════════════════════
   STAT CARD with animated counter
   ═══════════════════════════════════════════ */
export function Stat({
  label,
  value,
  sub,
  icon,
  accent = "indigo",
  delay = 0,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  accent?: "indigo" | "emerald" | "sky" | "amber" | "rose" | "violet";
  delay?: number;
}) {
  const accents: Record<string, string> = {
    indigo: "from-indigo-500/20 to-transparent text-indigo-300",
    emerald: "from-emerald-500/20 to-transparent text-emerald-300",
    sky: "from-sky-500/20 to-transparent text-sky-300",
    amber: "from-amber-500/20 to-transparent text-amber-300",
    rose: "from-rose-500/20 to-transparent text-rose-300",
    violet: "from-violet-500/20 to-transparent text-violet-300",
  };
  return (
    <Card delay={delay} className="p-4">
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-60", accents[accent])} />
      <div className="relative flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-white">{value}</p>
          {sub ? <p className="mt-1 text-xs text-white/45">{sub}</p> : null}
        </div>
        {icon ? (
          <div className={cn("rounded-xl border border-white/10 bg-white/5 p-2.5", accents[accent].split(" ").pop())}>
            {icon}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════
   EMPTY STATE
   ═══════════════════════════════════════════ */
export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-14 text-center">
      {icon ? <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white/50">{icon}</div> : null}
      <p className="text-sm font-medium text-white/80">{title}</p>
      {description ? <p className="max-w-md text-xs leading-relaxed text-white/45">{description}</p> : null}
      {action}
    </div>
  );
}

/* ═══════════════════════════════════════════
   MODAL with backdrop blur
   ═══════════════════════════════════════════ */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  if (!open) return null;
  const hasCustomWidth = className?.includes("max-w-");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "theme-surface glass-card relative w-full overflow-hidden rounded-3xl !bg-[#0b0f1a]/95 shadow-2xl border border-white/10",
          !hasCustomWidth && "max-w-lg",
          className
        )}
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
          <div className="min-w-0 flex-1 pr-4">
            <h3 className="truncate text-base font-bold text-white">{title}</h3>
            {description ? <p className="mt-0.5 truncate text-xs leading-relaxed text-white/50">{description}</p> : null}
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/[0.04] p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="flex justify-end gap-2.5 border-t border-white/[0.08] bg-black/20 px-6 py-4">{footer}</div> : null}
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   BADGE
   ═══════════════════════════════════════════ */
export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
}) {
  const variants: Record<string, string> = {
    default: "border-white/10 bg-white/5 text-white/60",
    success: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200",
    warning: "border-amber-400/25 bg-amber-500/10 text-amber-200",
    danger: "border-rose-400/25 bg-rose-500/10 text-rose-200",
    info: "border-indigo-400/25 bg-indigo-500/10 text-indigo-200",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium", variants[variant], className)}>
      {children}
    </span>
  );
}

/* ═══════════════════════════════════════════
   SKELETON
   ═══════════════════════════════════════════ */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}
