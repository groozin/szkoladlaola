import type { SchoolClass } from "../types";

/** Formatted threshold range across a school's classes, or null if no data. */
export function thresholdRange(
  classes: SchoolClass[],
): { min: number; max: number; year: string } | null {
  const withThreshold = classes.filter(
    (c): c is SchoolClass & { thresholdMin: number; thresholdYear: string } =>
      c.thresholdMin != null,
  );
  if (!withThreshold.length) return null;
  const mins = withThreshold.map((c) => c.thresholdMin);
  return {
    min: Math.min(...mins),
    max: Math.max(...mins),
    year: withThreshold[0].thresholdYear ?? "",
  };
}

/** Polish pluralisation for "klas" — a school shows "1 klasa / 2 klasy / 5 klas". */
export function classesLabel(n: number): string {
  if (n === 1) return "1 klasa";
  const tens = n % 100;
  const ones = n % 10;
  if (tens >= 12 && tens <= 14) return `${n} klas`;
  if (ones >= 2 && ones <= 4) return `${n} klasy`;
  return `${n} klas`;
}

/** Short label for a class — "1A (biol-chem-mat)" or just "1A". */
export function classDisplay(c: SchoolClass): string {
  return c.profile ? `${c.code} (${c.profile})` : c.code;
}
