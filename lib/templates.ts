"use client";

// Author's personal prompt & brief library — persisted per browser via localStorage,
// exposed through useSyncExternalStore. System templates live in lib/intent-presets.ts.

import { useCallback, useSyncExternalStore } from "react";
import type { BriefField, ImportIntent } from "./types";

/** A saved guided brief — the designed fields + their default values + emphasis/volume. */
export interface SavedBrief {
  fields: BriefField[];
  emphasis: ImportIntent["emphasis"];
  volume: ImportIntent["volume"];
}

export interface SavedTemplate {
  id: string;
  name: string;
  kind: "prompt" | "brief";
  createdAt: number;
  usedAt?: number;
  prompt?: string;
  mode?: "generate" | "extract";
  brief?: SavedBrief;
  /** Optional bundled activity selection — makes reuse one step: pick, add source, generate. */
  contentTypes?: string[];
}

const KEY = "smartimport.templates.v1";
const LAST_KEY = "smartimport.lastTemplate.v1";
const EMPTY: SavedTemplate[] = []; // stable reference for snapshots

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
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      cache = raw ? (JSON.parse(raw) as SavedTemplate[]) : EMPTY;
    } catch {
      cache = EMPTY;
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

const serverList = () => EMPTY;
const serverNull = () => null;

export function useTemplates() {
  const templates = useSyncExternalStore(subscribe, readList, serverList);
  const lastUsedId = useSyncExternalStore(subscribe, readLast, serverNull);

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
      brief: SavedBrief,
      contentTypes?: string[],
    ) => {
      const id = crypto.randomUUID();
      writeList([
        { id, name, kind: "brief", brief, contentTypes, createdAt: Date.now() },
        ...readList(),
      ]);
      return id;
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
