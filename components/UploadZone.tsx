"use client";

import { useRef, useState } from "react";

interface Props {
  onFile: (file: File) => void;
  disabled?: boolean;
  heading?: string;
  label?: string;
  helpText?: string;
  compact?: boolean;
  selectedFileName?: string | null;
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 15V4M12 4L7.5 8.5M12 4l4.5 4.5"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function UploadZone({
  onFile,
  disabled,
  heading,
  label = "Upload your EIA report",
  helpText = "PDF, any reasonable size. Extraction happens entirely in your browser, so large scanned annexures are fine. A fully scanned report with no embedded text layer will need OCR first.",
  compact = false,
  selectedFileName = null,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    onFile(files[0]);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) inputRef.current?.click();
      }}
      aria-disabled={disabled}
      className={[
        "focus-ring group relative w-full rounded-lg border-2 border-dashed transition-colors cursor-pointer",
        "flex flex-col items-center justify-center text-center",
        compact ? "px-6 py-10" : "px-8 py-16",
        disabled ? "opacity-60 cursor-not-allowed" : "",
        selectedFileName ? "border-teal bg-teal/5" : dragOver ? "border-teal bg-teal/5" : "border-hairline bg-panel hover:border-teal/60",
      ].join(" ")}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
      />

      {heading && (
        <div className="text-sm font-semibold text-teal label-caps mb-3">{heading}</div>
      )}

      {selectedFileName ? (
        <>
          <div className="w-11 h-11 rounded-full bg-teal/10 text-teal flex items-center justify-center mb-3">
            <UploadIcon className="w-5 h-5" />
          </div>
          <div className="font-display text-lg font-semibold text-ink mb-1 break-all px-2">{selectedFileName}</div>
          <p className="text-teal text-sm font-medium">File loaded. Click to choose a different file.</p>
        </>
      ) : (
        <>
          <div className="w-11 h-11 rounded-full bg-hairline/40 text-muted flex items-center justify-center mb-3 group-hover:bg-teal/10 group-hover:text-teal transition-colors">
            <UploadIcon className="w-5 h-5" />
          </div>
          <div className={`font-display font-semibold text-ink mb-2 ${compact ? "text-lg" : "text-2xl"}`}>{label}</div>
          <p className={`text-muted max-w-sm ${compact ? "text-sm" : "text-base"}`}>{helpText}</p>
          <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-teal border border-teal/40 rounded-md px-4 py-2 bg-white group-hover:bg-teal group-hover:text-white transition-colors">
            Choose file
          </div>
        </>
      )}
    </div>
  );
}
