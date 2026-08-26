"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FolderOpen, CheckCircle2, AlertCircle } from "lucide-react";

interface DragDropOverlayProps {
  onFiles: (files: File[]) => void;
}

export function DragDropOverlay({ onFiles }: DragDropOverlayProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isDropped, setIsDropped] = useState(false);
  const [droppedCount, setDroppedCount] = useState(0);
  const dragCounter = useRef(0);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer?.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragging(false);

      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) {
        setDroppedCount(files.length);
        setIsDropped(true);
        onFiles(files);
        setTimeout(() => setIsDropped(false), 2500);
      }
    },
    [onFiles]
  );

  useEffect(() => {
    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  return (
    <AnimatePresence>
      {(isDragging || isDropped) && (
        <motion.div
          ref={overlayRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[9998] pointer-events-none flex items-center justify-center"
        >
          {/* Backdrop glow */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-indigo-950/70 backdrop-blur-sm"
          />

          {/* Animated border frame */}
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            className="relative z-10 mx-8 flex w-full max-w-lg flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed border-indigo-400/60 bg-indigo-900/30 px-10 py-14 shadow-[0_0_80px_rgba(99,102,241,0.35)] backdrop-blur-xl"
          >
            {isDropped ? (
              <>
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 18 }}
                >
                  <CheckCircle2 className="h-14 w-14 text-emerald-400" />
                </motion.div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">
                    {droppedCount} file{droppedCount !== 1 ? "s" : ""} queued!
                  </p>
                  <p className="mt-1 text-sm text-white/60">
                    Files have been added to the upload queue.
                  </p>
                </div>
              </>
            ) : (
              <>
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Upload className="h-14 w-14 text-indigo-300" />
                </motion.div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">Drop files here</p>
                  <p className="mt-1 text-sm text-white/60">
                    Release to add files to the DriveVault upload queue
                  </p>
                </div>
                {/* Shimmering ring */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 rounded-3xl border-2 border-transparent"
                  style={{
                    background:
                      "linear-gradient(#0c0f1e, #0c0f1e) padding-box, conic-gradient(from 0deg, transparent 0%, #6366f1 30%, #8b5cf6 50%, transparent 80%) border-box",
                  }}
                />
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
