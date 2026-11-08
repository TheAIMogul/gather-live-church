# Gather

**Every voice, together.** A warm, open-source church translation experience built for Cloudflare.

Gather connects a computer or phone microphone to OpenAI, interprets complete phrases in context, and shares animated Spanish ↔ English captions with a separate browser or projector. Scripture references have a distinct gold treatment. Branding and operator controls live separately from the audience display.

Current deployment: [Open Gather](https://gather-live-church.micahberkley.workers.dev). Operator sign-in is required for live services; the design demo is public.

## What is included

- Operator console, live input meter, microphone selection and manual language direction.
- Phone microphone pairing link and QR code; a separate read-only projector URL.
- Full-screen audience view, phrase animation, reduced-motion support and original-language captions.
- Church name, service name, logo upload/position/size, themes, text size, motion and summary controls with preview.
- Contextual translation and scripture/paraphrase classification through OpenAI Responses.
- Independent rolling AI summaries; pause, stop, blank, clear, and link rotation controls.
- Protected operator sign-in, scoped microphone/display links and WebSocket room synchronization.
- A clearly labeled browser-only design demo with sample text. Demo sharing works between tabs on the same browser, not across devices.

## Architecture

The React/Vite interface is hosted using Cloudflare Workers Static Assets. A Worker authenticates operators and serves API routes. A SQLite-backed Durable Object coordinates each service, persists branding and bounded recent text, and broadcasts updates to connected screens.

The microphone browser sends audio directly to OpenAI over WebRTC using a short-lived credential minted by the Worker. Source transcript deltas are buffered into phrases. The Worker interprets each phrase with recent context, then publishes stable translated text and classification to the room. Animation runs locally in the browser.

Current defaults, verified against official documentation during implementation:

| Purpose | Model |
| --- | --- |
| Live audio translation session | `gpt-realtime-translate` |
| Source transcript sidecar supported by that session | `gpt-realtime-whisper` |
| Contextual phrase interpretation and rolling summary | `gpt-6-luna` |

All AI processing uses OpenAI. Models are configurable through Worker environment variables. The contextual phrase pass adds latency and text-model cost to the Realtime audio session. A church rehearsal is required to evaluate real acoustic conditions and sustained performance.

## Local development

Requirements: Node.js 22 or later, npm, and a modern browser with WebRTC. Microphone capture requires HTTPS or localhost.

```sh
npm ci
cp .dev.vars.example .dev.vars
# Fill OPENAI_API_KEY and ADMIN_PASSWORD in .dev.vars.
npm run build
npm run dev:worker
```

Open `http://localhost:8787`. For frontend hot reload, also run `npm run dev` and open the Vite URL. Vite proxies `/api` and WebSockets to the local Worker on port 8787.

Without an OpenAI key, the design demo still works. `DEV_MODE=true` permits passwordless local development only on localhost when no operator password is configured. Production must have an operator password; the development flag never grants remote access.

## Cloudflare deployment

The repository includes `wrangler.jsonc`, static-asset routing, and the SQLite Durable Object migration. Use your own Cloudflare account:

```sh
npx wrangler login
npm run build
npx wrangler deploy
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ADMIN_PASSWORD
```

Use a long unique operator password. Secrets belong in Cloudflare Worker secrets, never in frontend code, Git, or a `VITE_` variable. Optional model overrides are `OPENAI_TEXT_MODEL`, `OPENAI_REALTIME_MODEL`, and `OPENAI_TRANSCRIPTION_MODEL`. Deployment does not require a separate server or database service.

To start a real service: sign in, create a live service, select the microphone source, start translation, and open the display URL on the projector. For a phone input, select Phone, start the service, scan its microphone QR code, and tap Connect microphone on the phone. Keep the phone page open. An internet-reachable HTTPS deployment allows the phone and projector to use different networks.

## Meaning, scripture and motion

The phrase interpreter uses recent source/translated phrases to resolve idioms and references. It translates the speaker's actual words; it does not replace them with an assumed Bible edition. A model-detected scripture match is **unverified**, and the interface labels it accordingly. Paraphrases remain distinguishable from quotations. Full Bible-text verification is not implemented.

Completed phrases animate into place, with a slower, distinct scripture treatment. Still mode and the browser's reduced-motion preference remove animation. This is assistive translation, with measured pilot performance still to be established; the app does not claim human-interpreter accuracy.

## Privacy and access

- Gather does not store raw microphone audio. Audio is transmitted to OpenAI for processing.
- Live room storage retains the latest 100 phrases plus a rolling summary. Text is automatically cleared after 24 hours without a new phrase; branding remains. Clear service text removes the current text immediately.
- Context sent to phrase interpretation and summaries is bounded. Responses requests set `store: false`; OpenAI's applicable API data policies still apply.
- Audience links are bearer links: anyone with the link can read that room. Microphone links also authorize audio-session creation and source-text submission. Share only with intended participants; rotate links to invalidate them.
- Operator access uses an HttpOnly cookie. Only operators can change branding, control the service, or rotate links.
- Browser-only demo data and the operator's last room identifier are stored locally. Demo data contains sample content.

## Validation

```sh
npm run typecheck
npm test
npm run build
npx wrangler deploy --dry-run
node tests/rooms.integration.mjs
```

Room integration checks expect the local Worker running and read the ignored `.dev.vars` operator password internally. `node scripts/openai-smoke.mjs` additionally exercises real OpenAI session creation, phrase interpretation and summary generation and incurs API usage. Never run live API tests with private sermon text without permission.

Before use in a church, rehearse Spanish and English with a bilingual reviewer, the intended microphone, the actual projector and a long service. Mobile browser suspension, poor network connectivity, room echo, and overlapping speech can interrupt or degrade transcription.

## Contributing and license

MIT licensed. See [CONTRIBUTING.md](CONTRIBUTING.md) and [LICENSE](LICENSE). This repository contains the application source; a public Git hosting release is separate from deploying the app.

## Official references

- [OpenAI Realtime translation](https://developers.openai.com/api/docs/guides/realtime-translation)
- [Translation client secrets](https://developers.openai.com/api/reference/resources/realtime/subresources/translations/subresources/client_secrets/methods/create)
- [Translation server events](https://developers.openai.com/api/reference/resources/realtime/translation-server-events)
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
