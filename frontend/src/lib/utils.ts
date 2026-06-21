import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Compact integer formatting for token counts etc. (12_345 -> "12,345"). */
export function formatInt(num: number | null | undefined): string {
  if (num == null) return "—";
  return num.toLocaleString();
}

/** Format a compression ratio as "Nx" (e.g. 3.4 -> "3.4x"). */
export function formatRatio(num: number | null | undefined): string {
  if (num == null) return "—";
  return `${num.toFixed(2)}x`;
}

/** snake_case / mock_catalog -> "snake case" — for rendering schema enum tokens as prose. */
export function humanize(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace(/_/g, " ");
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}
