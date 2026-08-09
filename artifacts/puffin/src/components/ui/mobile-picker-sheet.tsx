import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { cn } from "@/lib/utils";
import { X, Search } from "lucide-react";

export interface PickerOption {
  value: string;
  label: string;
  sublabel?: string;
  avatarUrl?: string | null;
  initials?: string;
}

interface MobilePickerSheetProps {
  options: PickerOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
}

export function MobilePickerSheet({
  options,
  value,
  onChange,
  placeholder = "Seleccionar...",
  searchPlaceholder = "Buscar...",
  disabled = false,
  className,
}: MobilePickerSheetProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = search.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        (o.sublabel || "").toLowerCase().includes(search.toLowerCase())
      )
    : options;

  const handleOpen = () => {
    // Force blur any active element so keyboard closes first
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setSearch("");
    // Small delay so keyboard fully closes before sheet opens
    setTimeout(() => setOpen(true), 100);
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    setSearch("");
  };

  const handleClose = () => {
    setOpen(false);
    setSearch("");
  };

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      // Focus search input after animation
      setTimeout(() => searchRef.current?.focus(), 300);
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const sheet = open
    ? ReactDOM.createPortal(
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
          }}
        >
          {/* Backdrop */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
            }}
            onClick={handleClose}
          />

          {/* Sheet */}
          <div
            style={{
              position: "relative",
              backgroundColor: "white",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 -4px 32px rgba(0,0,0,0.15)",
            }}
          >
            {/* Handle + Close */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px 8px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <div style={{ width: 40, height: 4, backgroundColor: "#d1d5db", borderRadius: 4, margin: "0 auto" }} />
              <button
                type="button"
                onClick={handleClose}
                style={{
                  position: "absolute",
                  right: 12,
                  top: 12,
                  padding: 4,
                  borderRadius: 8,
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                }}
              >
                <X style={{ width: 20, height: 20, color: "#6b7280" }} />
              </button>
            </div>

            {/* Search */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <Search style={{ width: 16, height: 16, color: "#9ca3af", flexShrink: 0 }} />
              <input
                ref={searchRef}
                type="text"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  fontSize: 14,
                  color: "#111827",
                  background: "transparent",
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  style={{ border: "none", background: "none", cursor: "pointer", padding: 0 }}
                >
                  <X style={{ width: 14, height: 14, color: "#9ca3af" }} />
                </button>
              )}
            </div>

            {/* List */}
            <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch" as any, flex: 1 }}>
              {filtered.length === 0 ? (
                <p style={{ textAlign: "center", color: "#9ca3af", padding: "32px 16px", fontSize: 14 }}>
                  No se encontraron resultados.
                </p>
              ) : (
                filtered.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSelect(opt.value)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 16px",
                        textAlign: "left",
                        border: "none",
                        borderBottom: "1px solid #f3f4f6",
                        background: isSelected ? "#eff6ff" : "white",
                        cursor: "pointer",
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      {/* Avatar */}
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          overflow: "hidden",
                          flexShrink: 0,
                          background: "#e5e7eb",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#6b7280",
                        }}
                      >
                        {opt.avatarUrl ? (
                          <img
                            src={opt.avatarUrl}
                            alt={opt.label}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <span>{opt.initials || opt.label.slice(0, 2).toUpperCase()}</span>
                        )}
                      </div>

                      {/* Text */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          margin: 0,
                          fontSize: 15,
                          fontWeight: isSelected ? 600 : 400,
                          color: isSelected ? "#1d4ed8" : "#111827",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          {opt.label}
                        </p>
                        {opt.sublabel && (
                          <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
                            {opt.sublabel}
                          </p>
                        )}
                      </div>

                      {/* Check */}
                      {isSelected && (
                        <div style={{
                          width: 20, height: 20, borderRadius: "50%",
                          background: "#3b82f6", display: "flex",
                          alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                          <span style={{ color: "white", fontSize: 12, fontWeight: 700 }}>✓</span>
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-md border border-input bg-background text-sm text-left",
          "focus:outline-none focus:ring-2 focus:ring-ring",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
      >
        {selected ? (
          <>
            <div
              style={{
                width: 28, height: 28, borderRadius: "50%", overflow: "hidden",
                flexShrink: 0, background: "#e5e7eb", display: "flex",
                alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 600, color: "#6b7280",
              }}
            >
              {selected.avatarUrl ? (
                <img src={selected.avatarUrl} alt={selected.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span>{selected.initials || selected.label.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <span className="truncate font-medium text-foreground">{selected.label}</span>
          </>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        <svg
          style={{ marginLeft: "auto", flexShrink: 0, opacity: 0.5 }}
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
        </svg>
      </button>

      {sheet}
    </>
  );
}
