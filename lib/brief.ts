// The guided brief is a tiny form the educator can reshape. In "fill" mode it is
// a short form (label + one control per row); in "design" mode the same rows
// unlock so the educator can rename fields, switch the control type, edit the
// allowed values of a dropdown, mark a field required, add / remove / reorder
// fields, and save the result as a named brief.
//
// Two things stay fixed and out of this array — Emphasis and Volume — because the
// activity recommendation engine reads them as structured values. Everything else
// is the educator's to design.

import type { BriefField, ImportIntent } from "./types";

let seq = 0;
const rid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `f${Date.now().toString(36)}${(seq++).toString(36)}`;

/** The built-in starting brief — what "Recommended" loads. */
export function starterBrief(): BriefField[] {
  return [
    { id: "goal", label: "Learning goal", type: "text", options: [], required: false, value: "" },
    {
      id: "audience",
      label: "Audience",
      type: "select",
      options: ["Beginner", "Intermediate", "Advanced"],
      required: false,
      value: "",
    },
    { id: "language", label: "Language", type: "text", options: [], required: false, value: "English" },
  ];
}

/** A fresh blank field for "+ Add field". */
export function newBriefField(): BriefField {
  return { id: rid(), label: "", type: "text", options: [], required: false, value: "" };
}

/** The educator's learning goal, for titles and the import receipt. */
export function briefGoal(intent: ImportIntent): string {
  const fields = intent.briefFields ?? [];
  const named = fields.find((f) => f.id === "goal" && f.value.trim());
  if (named) return named.value.trim();
  const firstText = fields.find((f) => f.type === "text" && f.value.trim());
  return firstText ? firstText.value.trim() : "";
}

/** Every filled brief value as plain text — fed to the engine's keyword matching. */
export function briefText(intent: ImportIntent): string {
  return (intent.briefFields ?? [])
    .filter((f) => f.value.trim())
    .map((f) => f.value.trim())
    .join(" ");
}

/** The brief serialised as a directive the generation prompt can follow. */
export function briefInstruction(intent: ImportIntent): string {
  const rows = (intent.briefFields ?? [])
    .filter((f) => f.label.trim() && f.value.trim())
    .map((f) => `${f.label.trim()}: ${f.value.trim()}`);
  rows.push(`Emphasis: ${intent.emphasis}`, `Volume: ${intent.volume}`);
  return rows.join("; ");
}

/** Fields whose "required" is set but whose value is still empty. */
export function missingRequired(intent: ImportIntent): string[] {
  return (intent.briefFields ?? [])
    .filter((f) => f.required && f.label.trim() && !f.value.trim())
    .map((f) => f.label.trim());
}
