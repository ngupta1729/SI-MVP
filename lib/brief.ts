// The guided brief is a form the educator designs. In "fill" mode it shows one
// control per enabled field. In "design" mode every field unlocks: add / delete
// field-and-value pairs, rename, switch the control type, edit a dropdown's
// allowed values, mark required, and toggle each row on / off to decide which
// appear in the fill-in brief. A configuration can be saved as a named template.
//
// It starts with Learning goal, Audience and Difficulty level. Nothing is fixed
// or hidden — the whole brief is the educator's to shape.

import type { BriefField, ImportIntent } from "./types";

let seq = 0;
const rid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `f${Date.now().toString(36)}${(seq++).toString(36)}`;

/** The built-in starting brief — what "Recommended" loads. */
export function starterBrief(): BriefField[] {
  return [
    {
      id: "goal",
      label: "Learning goal",
      type: "text",
      options: [],
      required: false,
      enabled: true,
      value: "",
    },
    {
      id: "audience",
      label: "Audience",
      type: "select",
      options: ["Beginner", "Intermediate", "Advanced"],
      required: false,
      enabled: true,
      value: "",
    },
    {
      id: "difficulty",
      label: "Difficulty level",
      type: "select",
      options: ["Easy", "Moderate", "Challenging"],
      required: false,
      enabled: true,
      value: "",
    },
  ];
}

/** A fresh blank field for "+ Add field". */
export function newBriefField(): BriefField {
  return {
    id: rid(),
    label: "",
    type: "text",
    options: [],
    required: false,
    enabled: true,
    value: "",
  };
}

/** Normalise fields loaded from an older saved template (pre-`enabled`). */
export function normalizeBriefFields(fields: BriefField[] | undefined): BriefField[] {
  return (fields ?? []).map((f) => ({
    ...f,
    enabled: f.enabled ?? true,
    options: f.options ?? [],
  }));
}

/** Only the rows the educator has switched on. */
export function activeBriefFields(intent: ImportIntent): BriefField[] {
  return (intent.briefFields ?? []).filter((f) => f.enabled !== false);
}

/** The educator's learning goal, for titles and the import receipt. */
export function briefGoal(intent: ImportIntent): string {
  const fields = activeBriefFields(intent);
  const named = fields.find((f) => f.id === "goal" && f.value.trim());
  if (named) return named.value.trim();
  const firstText = fields.find((f) => f.type === "text" && f.value.trim());
  return firstText ? firstText.value.trim() : "";
}

/** Every filled brief value as plain text — fed to the engine's keyword matching. */
export function briefText(intent: ImportIntent): string {
  return activeBriefFields(intent)
    .filter((f) => f.value.trim())
    .map((f) => f.value.trim())
    .join(" ");
}

/** The brief serialised as a directive the generation prompt can follow. */
export function briefInstruction(intent: ImportIntent): string {
  return activeBriefFields(intent)
    .filter((f) => f.label.trim() && f.value.trim())
    .map((f) => `${f.label.trim()}: ${f.value.trim()}`)
    .join("; ");
}

/** Fields whose "required" is set but whose value is still empty. */
export function missingRequired(intent: ImportIntent): string[] {
  return activeBriefFields(intent)
    .filter((f) => f.required && f.label.trim() && !f.value.trim())
    .map((f) => f.label.trim());
}
