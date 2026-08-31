# SI-MVP — Reworked H5P Smart Import (prototype)

A working Next.js prototype of a reworked **H5P.com Smart Import**: turn a source document into
H5P interactive content, then review, refine, and approve what the AI generates before anything
is committed — rendered in the real H5P player.

Companion product/UX spec: `specs/smart-import-ux.md`.

## Run locally

```bash
npm install
cp .env.local.example .env.local   # optional — set OPENAI_API_KEY for the model engine
npm run dev
```

Open http://localhost:3000. Without `OPENAI_API_KEY` the app runs a deterministic **mock engine**
so the whole flow still works; with a key set it generates with `gpt-4o-mini`
(override via `TWIN_MODEL` / `TWIN_ANALYZE_MODEL`).

## Deploy to Vercel

1. Import `ngupta1729/SI-MVP` at [vercel.com/new](https://vercel.com/new) (framework auto-detected
   as Next.js).
2. Add environment variable **`OPENAI_API_KEY`** (optional — omit to demo on the mock engine).
3. Deploy.

Notes for the demo:

- The H5P **library substrate** (`public/h5p/<host>/…`) is committed and served as static assets.
- Generated content is staged to the serverless instance's `/tmp` and re-staged by the browser
  each time you open **Play**, so it survives cold starts. It is not durable storage.
- `/dashboard` reads the review-event / import logs from `/tmp` on Vercel, so its numbers are
  per-instance and reset on redeploy. Locally the logs persist in the project root
  (`.review-events.jsonl`, `.imports.jsonl`, both gitignored).

## Regenerating the H5P substrate

`scripts/prepare-h5p.mjs` extracts `data/*.h5p` exports into `public/h5p/<host>/`. The source
`.h5p` files aren't in the repo; the extracted output is committed so the app runs without them.
To add a content type: drop its `.h5p` into `data/` and run `node scripts/prepare-h5p.mjs`.

## Layout

| Path | What |
|---|---|
| `app/page.tsx` | The whole reworked workflow UI (configure → activities → review → library) |
| `app/dashboard/` | Read-only evals + feedback roll-up |
| `app/api/twin`, `regenerate` | Generate / refine content from the source |
| `app/api/h5p-render/[id]` | Stage + serve per-item render content |
| `lib/twin.ts` | Model + mock generation, recommendation engine |
| `lib/h5p/` | Content-type registry, render hosts |
| `components/H5PRender.tsx` | `h5p-standalone` player wrapper |
