"use client";

import { motion } from "framer-motion";
import { Check, Sparkles, X, Palette, Image as ImageIcon } from "lucide-react";
import { Modal, Button, cn } from "./ui";
import type { ThemeMode } from "@/lib/types";

interface ThemeOption {
  id: ThemeMode;
  name: string;
  category: "anime" | "cyberpunk" | "minimal";
  description: string;
  image?: string;
  gradient: string;
  accentColor: string;
  tag?: string;
}

export const THEMES: ThemeOption[] = [
  {
    id: "celestial",
    name: "Celestial Angel",
    category: "anime",
    description: "Radiant pink halo, wings & celestial twilight glow.",
    image: "/themes/celestial_angel.jpg",
    gradient: "from-pink-500 via-rose-400 to-amber-300",
    accentColor: "#f472b6",
    tag: "Anime Art",
  },
  {
    id: "emerald",
    name: "Emerald Dusk Dragon",
    category: "anime",
    description: "Cozy jade green, dragon horns & soothing emerald vibe.",
    image: "/themes/emerald_dusk.jpg",
    gradient: "from-emerald-500 via-teal-400 to-cyan-300",
    accentColor: "#34d399",
    tag: "Anime Art",
  },
  {
    id: "butterfly",
    name: "Serene Butterfly",
    category: "anime",
    description: "Dreamy cyan morning light with butterfly hairclip aesthetic.",
    image: "/themes/serene_butterfly.jpg",
    gradient: "from-sky-400 via-cyan-300 to-indigo-400",
    accentColor: "#38bdf8",
    tag: "Anime Art",
  },
  {
    id: "firefly",
    name: "Starlight Firefly",
    category: "anime",
    description: "Cosmic nebula purple, starlight fireworks & amber gold.",
    image: "/themes/starlight_firefly.jpg",
    gradient: "from-purple-500 via-fuchsia-400 to-amber-400",
    accentColor: "#c084fc",
    tag: "Anime Art",
  },
  {
    id: "dark",
    name: "Cyber Dark Obsidian",
    category: "cyberpunk",
    description: "Ultra-sleek obsidian glass with indigo & cyan aurora drift.",
    gradient: "from-indigo-500 via-purple-500 to-sky-400",
    accentColor: "#818cf8",
    tag: "Default",
  },
  {
    id: "neon",
    name: "Neon Cyberpunk",
    category: "cyberpunk",
    description: "High-contrast magenta, violet & radiant electric pulse.",
    gradient: "from-fuchsia-500 via-pink-500 to-cyan-400",
    accentColor: "#ec4899",
    tag: "High Glow",
  },
  {
    id: "ocean",
    name: "Deep Ocean Abyss",
    category: "minimal",
    description: "Submerged deep teal & oceanic blue glass aesthetics.",
    gradient: "from-cyan-500 via-blue-500 to-indigo-600",
    accentColor: "#06b6d4",
  },
  {
    id: "forest",
    name: "Emerald Forest",
    category: "minimal",
    description: "Organic forest foliage & deep mint crystal glow.",
    gradient: "from-emerald-500 via-green-400 to-lime-300",
    accentColor: "#10b981",
  },
];

export function ThemeSelectorModal({
  open,
  onClose,
  currentTheme,
  onSelectTheme,
}: {
  open: boolean;
  onClose: () => void;
  currentTheme: ThemeMode;
  onSelectTheme: (theme: ThemeMode) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Theme & Anime Artwork Gallery"
      description="Personalize your DriveVault workstation with stunning anime artwork and glowing glass aesthetics."
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[65vh] overflow-y-auto pr-1">
          {THEMES.map((theme) => {
            const isSelected = currentTheme === theme.id;
            return (
              <motion.button
                key={theme.id}
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (typeof document !== "undefined") {
                    document.documentElement.setAttribute("data-theme", theme.id);
                    document.body.setAttribute("data-theme", theme.id);
                    document.documentElement.classList.toggle("dark", theme.id !== "light");
                    try {
                      localStorage.setItem("drivevault_theme", theme.id);
                    } catch {}
                  }
                  onSelectTheme(theme.id);
                }}
                className={cn(
                  "relative flex flex-col justify-between overflow-hidden rounded-2xl border text-left p-3.5 transition-all duration-200 group min-h-[140px]",
                  isSelected
                    ? "border-indigo-400 bg-indigo-500/[0.15] shadow-[0_0_30px_rgba(99,102,241,0.3)] ring-2 ring-indigo-400/60"
                    : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"
                )}
              >
                {/* Background Thumbnail preview if image exists */}
                {theme.image ? (
                  <div className="absolute inset-0 z-0 overflow-hidden">
                    <img
                      src={theme.image}
                      alt={theme.name}
                      className="h-full w-full object-cover object-center opacity-30 transition-transform duration-500 group-hover:scale-110 group-hover:opacity-40"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#090d16] via-[#090d16]/70 to-transparent" />
                  </div>
                ) : (
                  <div
                    className={cn(
                      "absolute -right-8 -top-8 h-28 w-28 rounded-full blur-2xl opacity-25 bg-gradient-to-br",
                      theme.gradient
                    )}
                  />
                )}

                {/* Card Header */}
                <div className="relative z-10 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15"
                      style={{ backgroundColor: `${theme.accentColor}25` }}
                    >
                      {theme.image ? (
                        <ImageIcon className="h-3.5 w-3.5" style={{ color: theme.accentColor }} />
                      ) : (
                        <Palette className="h-3.5 w-3.5" style={{ color: theme.accentColor }} />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white group-hover:text-indigo-200 transition">
                        {theme.name}
                      </p>
                      {theme.tag && (
                        <span className="inline-block rounded-full bg-white/10 px-2 py-0.2 text-[9px] font-semibold text-white/70">
                          {theme.tag}
                        </span>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-white shadow-md">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </div>
                  )}
                </div>

                {/* Card Description */}
                <p className="relative z-10 mt-3 text-[11px] leading-relaxed text-white/60 line-clamp-2">
                  {theme.description}
                </p>

                {/* Card Bottom Color Indicator */}
                <div className="relative z-10 mt-3 flex items-center justify-between pt-2 border-t border-white/[0.06]">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full shadow-sm"
                      style={{ backgroundColor: theme.accentColor }}
                    />
                    <span className="text-[10px] text-white/40 font-mono capitalize">
                      {theme.category}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="text-[10px] font-semibold text-indigo-300">
                      Active
                    </span>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
