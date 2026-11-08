# Contributing to Gather

Gather is a small TypeScript app: React in `src/`, Cloudflare Worker code in `worker/`, and shared contracts in `shared/`.

Run `npm ci`, copy `.dev.vars.example` to `.dev.vars`, then use the development commands in the README. Never commit secrets, recordings, or private sermon transcripts.

Before submitting changes, run `npm run typecheck`, `npm test`, and `npm run build`. Include a concise problem statement, screenshots for interface changes, and evidence for audio lifecycle or translation changes. Keep keyboard access, reduced motion, and projector readability intact.

When reporting translation problems, use a short, consented example with the source language, expected meaning, actual output, and model configuration. Mark scripture quotations, paraphrases, and model-suggested references distinctly.

Contributions are licensed under the repository's MIT license.
