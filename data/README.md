# data/

`*.h5p` files here are **H5P player-library bundles only** — they exist so the app can
render the twin's generated content in the real H5P player. Their own `content.json`
is never shown; it is replaced at render time with the twin's output.

`scripts/prepare-h5p.mjs` extracts each bundle into `public/h5p/<host>/` (gitignored,
rebuildable). To support live preview for another content type, drop a `.h5p` export of
that type here (any topic — the content is discarded) and re-run the script.

Nothing in this folder is treated as reference or example content. The twin generates
strictly from the source the educator provides in the app.
