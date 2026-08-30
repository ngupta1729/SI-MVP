"use client";

// Author's personal prompt & brief library — persisted per browser via localStorage,
// exposed through useSyncExternalStore. System templates live in lib/intent-presets.ts.

import { useCallback, useSyncExternalStore } from "react";
import type { ImportIntent } from "./types";

export interface SavedTemplate {
  id: string;
  name: string;
  kind: "prompt" | "brief";
  createdAt: number;
  usedAt?: number;
  prompt?: string;
  mode?: "generate" | "extract";
  brief?: Pick<
    ImportIntent,
    "learningGoal" | "audienceLevel" | "emphasis" | "volume" | "language"
  >;
  /** Optional bundled activity selection — makes reuse one step: pick, add source, generate. */
  contentTypes?: string[];
}

const KEY = "smartimport.templates.v1";
const LAST_KEY = "smartimport.lastTemplate.v1";

export function lastUsedTemplateId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}
const listeners = new Set<() => void>();
let cache: SavedTemplate[] = [];
let cacheRaw: string | null = null;

function readList(): SavedTemplate[] {
  if (typeof window === "undefined") return [];
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return [];
  }
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      cache = raw ? (JSON.parse(raw) as SavedTemplate[]) : [];
    } catch {
      cache = [];
    }
  }
  return cache;
}

function writeList(list: SavedTemplate[]) {
  try {
    const raw = JSON.stringify(list);
    localStorage.setItem(KEY, raw);
    cacheRaw = raw;
    cache = list;
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cacheRaw = null; // force re-parse
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function readLast(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function useTemplates() {
  const templates = useSyncExternalStore(
    subscribe,
    readList,
    () => [] as SavedTemplate[],
  );
  const lastUsedId = useSyncExternalStore(subscribe, readLast, () => null);

  const savePrompt = useCallback(
    (
      name: string,
      prompt: string,
      mode: "generate" | "extract",
      contentTypes?: string[],
    ) => {
      writeList([
        {
          id: crypto.randomUUID(),
          name,
          kind: "prompt",
          prompt,
          mode,
          contentTypes,
          createdAt: Date.now(),
        },
        ...readList(),
      ]);
    },
    [],
  );

  const saveBrief = useCallback(
    (
      name: string,
      brief: NonNullable<SavedTemplate["brief"]>,
      contentTypes?: string[],
    ) => {
      writeList([
        {
          id: crypto.randomUUID(),
          name,
          kind: "brief",
          brief,
          contentTypes,
          createdAt: Date.now(),
        },
        ...readList(),
      ]);
    },
    [],
  );

  const update = useCallback(
    (id: string, patch: Partial<SavedTemplate>) =>
      writeList(readList().map((t) => (t.id === id ? { ...t, ...patch } : t))),
    [],
  );

  const rename = useCallback(
    (id: string, name: string) => update(id, { name }),
    [update],
  );

  const remove = useCallback(
    (id: string) => writeList(readList().filter((t) => t.id !== id)),
    [],
  );

  const markUsed = useCallback((id: string) => {
    try {
      localStorage.setItem(LAST_KEY, id);
    } catch {
      /* ignore */
    }
    writeList(
      readList().map((t) => (t.id === id ? { ...t, usedAt: Date.now() } : t)),
    );
  }, []);

  return {
    templates,
    lastUsedId,
    savePrompt,
    saveBrief,
    update,
    rename,
    remove,
    markUsed,
  };
}
