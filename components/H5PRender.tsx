"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  /** Folder served under /public containing h5p.json (+ content/content.json). */
  h5pJsonPath: string;
  /** Folder holding the extracted library files. Defaults to h5pJsonPath. */
  librariesPath?: string;
  /** Remount key — change it to force a fresh render. */
  renderKey?: string | number;
}

export default function H5PRender({ h5pJsonPath, librariesPath, renderKey }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const el = elRef.current;
    if (!el) return;
    el.innerHTML = "";
    setError(null);
    setLoading(true);

    (async () => {
      try {
        const { H5P } = await import("h5p-standalone");
        if (cancelled) return;
        await new H5P(el, {
          h5pJsonPath,
          librariesPath: librariesPath ?? h5pJsonPath,
          frameJs: "/h5p/_assets/frame.bundle.js",
          frameCss: "/h5p/_assets/styles/h5p.css",
        });
        if (!cancelled) setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [h5pJsonPath, librariesPath, renderKey]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
      {loading && (
        <p className="p-4 text-sm text-zinc-500">Loading H5P player…</p>
      )}
      {error && (
        <p className="p-4 text-sm text-red-600">
          Could not render: {error}
          <br />
          <span className="text-zinc-500">
            Has a real .h5p been prepared for this content type? Run{" "}
            <code>node scripts/prepare-h5p.mjs</code>.
          </span>
        </p>
      )}
      <div ref={elRef} />
    </div>
  );
}
