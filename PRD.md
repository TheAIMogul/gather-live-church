# Church Live Translation Product Requirements Draft

**Status:** Draft for review  
**Product:** Working name — Church Live Translate  
**Primary use:** Live Spanish and English sermon captions on a church projector  
**Date:** November 8, 2026

# Product overview

Church Live Translate is an open-source application that listens to a church service and displays live captions and translations in a full-screen browser. It helps people follow a sermon delivered in Spanish or English and provides an evolving summary of the message.

The first release centers on a volunteer operating one microphone or soundboard feed and a congregation reading a clear projection. A church can run the software with its own OpenAI API account. The software will be open source; OpenAI processing requires internet access and incurs API charges.

# Problem and opportunity

When a sermon is delivered in a language a visitor does not understand, they can miss the message even when a projector is available. Existing products already provide church translation and screen captions. Users value clear translation, quick setup and the ability to follow on a shared screen or personal device. They report problems with delay, incorrect or fragmented translation, difficult audio setup and pricing that can be hard for a small church to justify.

A church user reported a translation service sometimes falling minutes behind. A Wordly reviewer who uses it for Sunday services praised language access but reported that pauses sometimes split sentences and lose context. These are individual reports, not benchmarks. [Church user discussion](https://www.reddit.com/r/churchtech/comments/1t2zi5v/live_translation/) · [Wordly reviews](https://www.g2.com/products/wordly-ai-powered-interpretation/reviews?page=4)

The opportunity is a reliable, readable church experience that combines live bilingual captions with an evolving summary, transparent operating costs and an open-source implementation.

# Users and jobs

- **Congregation member or visitor:** Follow the message in English or Spanish without installing an app.

- **Church volunteer:** Connect audio, choose the language direction, start the service and know whether it is working.

- **Pastor or service leader:** Share the message across languages and review a concise, clearly identified AI summary.

- **Open-source contributor or self-hosting administrator:** Install, run, understand and improve the application.

# Goals and proposed success measures

These are proposed pilot targets, not measured results.

| Outcome | Proposed measure |
| --- | --- |
| A volunteer can start a service | In a first-use observation, a volunteer connects audio and starts a projector view within 5 minutes, excluding software installation and account setup. |
| Captions keep pace | In a representative rehearsal, 90% of completed translated phrases appear within 5 seconds of the corresponding spoken phrase ending. Record median and 90th percentile separately. |
| The service remains usable | A 90-minute rehearsal completes without a manual restart; connection interruptions are visible and recovery is recorded. |
| Translation preserves meaning | A bilingual reviewer evaluates at least 30 representative excerpts in each direction, including names, scripture references, accents and language switching. Log omissions and meaning-changing errors before setting a release threshold. |
| Text is readable | A church volunteer confirms legibility from the back of the intended room using its actual projector and screen. |
| The summary is useful | A reviewer checks the summary against the transcript for unsupported claims, missing major points and scripture errors. Set a quantitative target after the first pilot. |

# Scope and priorities

## P0 — Hackathon MVP

1. **Operator setup.** A separate protected settings page selects an available microphone or soundboard interface, shows an input level meter, requests microphone access and clearly identifies connection, error and session states.

2. **Live English and Spanish captions.** The operator can select Spanish to English or English to Spanish. Show the source transcript and translated text. Automatic switching within the same sermon is a desired behavior to evaluate with real audio; it must not be presented as supported until verified. Provide a clear manual direction control.

3. **Projector view.** A shareable web URL opens the live translation in a separate full-screen browser view with large, high-contrast, adjustable text. The operator chooses translated-only or source-plus-translation display. Stable completed lines remain readable as new captions arrive.

4. **Live summary.** Generate a short, clearly labeled AI summary from the accumulated transcript during the sermon. Update it periodically without blocking captions. The operator can show or hide it; the projector keeps captions visually primary. Summaries must not add scripture citations or claims that the transcript does not support.

5. **Session controls and recovery.** Start, stop, pause and resume the audio stream; clearly show disconnected, reconnecting and unavailable states. Reconnect when practical and tell the operator if speech was missed. Do not silently display stale captions as live.

6. **Open-source foundation.** Provide a documented local setup, configuration template, an OSI-approved license selected before publication, contribution guidance, and instructions for obtaining and configuring an OpenAI API key. Keep the standard API key on the server.

7. **Privacy controls.** Show when the microphone is active and provide a single pause or blank control for sensitive moments. Default to no durable audio recording; document what session text is retained, where it is stored and how to clear it.

## Web pages and branding requirements

**Live display URL:** Provide a shareable web URL for each live service that opens the current translated captions and optional summary in a full-screen browser view. The display can be opened on a projector computer or another device. It receives the operator's live session; a viewer does not need a microphone, API key or account. A session can be viewed from a separate device when the deployment is reachable by that device.

**Settings and operator page:** Provide a separate protected web page for the volunteer to select and monitor the microphone or soundboard input; choose source and target languages; start, stop and pause the session; manage the display; and copy or open the display URL. Only authorized operators can change settings or start a session. Display viewers have read-only access.

**Display branding:** Let the operator upload, preview, replace and remove a church logo, choose its position and size, and set a church or service name and display colors. Save these settings for later services and apply them to the live display. Keep captions readable and unobstructed, preserve the logo's proportions, and provide a clean layout when no logo is supplied. Preview changes before putting them on screen.

**Deployment and access:** Support a deployable web application with a reachable URL. Document the address, hosting and network requirements, browser microphone permissions and HTTPS or other secure-context requirements. A display URL is viewable by anyone who has access to it; document how to restrict or rotate access. The initial deployment may serve one church; a shared multi-church hosting service remains a later decision.

## P1 — After the MVP

- A QR link for people to read captions on their own phones, choose a language and adjust text size.

- Optional translated audio through personal headphones, with volume and mute controls.

- A church glossary for names, recurring terms and sermon context; validate whether each model supports the chosen context mechanism.

- OBS and ProPresenter-friendly output, including a transparent lower third.

- Exportable, reviewable transcript and post-service summary; explicit retention and deletion settings.

- Additional languages, a comparison of provider or local models, and stronger long-session monitoring.

## Out of scope for the hackathon

- A promise of offline operation, human-interpreter replacement or production-grade accuracy.

- Native mobile applications, accounts for every attendee, payments or a shared hosted multi-church service.

- Automatic publication of sermon content, Bible verse quotation from licensed editions, or attribution of exact wording to a speaker without verification.

# Core user journey

1. The volunteer opens the operator page on the church computer and connects a microphone or soundboard audio interface.

2. The volunteer selects the input and verifies that the audio meter responds.

3. The volunteer chooses the spoken and target languages in settings, configures the church logo and display style, and opens or copies the live display URL on the projector.

4. The volunteer starts the service. Source captions, translation and the summary appear as audio arrives.

5. During the service the volunteer can adjust the display, change direction, pause for a private moment and see any connection failure.

6. The volunteer stops the session and clears its data or deliberately exports content when that capability is available.

# Functional acceptance criteria

- When permission is denied or a microphone is disconnected, the operator sees a clear message and a way to select or reconnect an input.

- With a supported microphone selected, the meter moves during speech and the operator can start and stop the session.

- In both selected directions, intelligible speech produces visible source text and translated text. Manual switching is available without restarting the application; whether an active translation session must reconnect is an implementation detail to validate.

- A browser can open the projector view full-screen; its text size and selected caption layout remain usable throughout the session.

- The summary updates independently of the caption stream. A failed or delayed summary does not stop live captions, and the last summary is marked as stale if updates fail.

- A dropped connection produces a visible state; after reconnection the view resumes or explains what the operator must do. Missed speech is not represented as captured.

- Stop and pause visibly stop audio capture or transmission as described in the interface. The projector can be blanked quickly.

- A fresh setup can run using the documented configuration without exposing the server API key to visitors.

- The application identifies AI-generated captions and summaries. Source captions and summaries remain distinguishable.

- The operator can copy a display URL, open it on a second reachable device, and see the same live translated captions without signing in or granting microphone access.

- The settings page controls audio input, language direction, session state and display branding; an unauthenticated viewer cannot change these controls.

- Uploading a supported logo shows a preview; saving applies the logo and chosen position, size, name and colors to the live display. Replacing or removing the logo works, and saved settings survive a restart.

- The full-screen display keeps captions readable with and without branding. A stopped or unavailable session has a clear state, rather than appearing live.

# Accessibility and experience

Use large text, strong contrast, keyboard-accessible controls, readable language labels and layouts that work at projector resolutions. Avoid excessive motion and continuously rewriting entire paragraphs. Preserve a short history so a reader can recover a missed phrase. The operator view should prioritize audio level, language direction and connection status.

The original speech and translation should be visually distinct. The summary is a catch-up aid, not a verbatim account; keep it separate from the live translation and allow it to be hidden.

# Proposed technical direction

Use a small server plus browser-based operator and display views. Capture the microphone in the browser, use a short-lived client credential for a WebRTC connection, and distribute caption events to the projector view. The standard OpenAI API key stays server-side.

Start by evaluating OpenAI's **gpt-realtime-translate** for live translation: its dedicated endpoint streams translated audio and text while source audio arrives, and its documentation recommends WebRTC for browser media. The session targets one output language, so session routing, original-language captions and mixed-language switching require a focused prototype. Do not assume a single session automatically handles every bilingual display scenario. [OpenAI Realtime translation guide](https://developers.openai.com/api/docs/guides/realtime-translation)

Evaluate **gpt-live-transcribe** where an independent source transcript is needed. OpenAI recommends it for live transcription and documents contextual hints including expected languages and keywords. [OpenAI transcription guide](https://developers.openai.com/api/docs/guides/transcription)

Generate periodic summaries through the Responses API using a text model selected by evaluating summary quality, latency and cost. Keep this work separate from the live caption stream. Compare approaches with representative sermon audio before locking in a model or architecture.

**Cost assumption:** OpenAI lists gpt-realtime-translate at $0.034 per audio minute: approximately $2.04 for one 60-minute session, before summaries, hosting or additional sessions. Actual billing depends on usage and current pricing; more target-language sessions increase cost. [Model pricing](https://developers.openai.com/api/docs/models/gpt-realtime-translate)

# Reliability and evaluation

Use representative Spanish and English sermon recordings and, when available, live soundboard input. Include quiet and fast speech, accents, pauses, names, scripture references, background noise and switching languages. A bilingual reviewer should mark omissions and meaning-changing errors, while the team measures caption delay and recovery separately. Summaries should be checked against source text rather than judged on fluency alone.

During an interruption, prioritize an honest status and recovery. Do not claim that a fallback works offline unless implemented and verified. Church volunteers should rehearse with the exact projector and audio path before using the product in a service.

# Open-source release

Publish source code under the chosen OSI-approved license with a README, installation and configuration instructions, a sample environment file without secrets, contribution guidance, an issue template and clear documentation of external API costs. Credit any reused code and comply with its license.

Existing projects are useful references: [Church Cap](https://github.com/Church-Cap/Live-Church-Captions) is an MIT-licensed local-first church caption project with experimental translation; [Nura](https://github.com/RGonza1529/Nura) is an MIT-licensed live event translation application. Assess their architecture and licenses before deciding whether to reuse code, contribute upstream or build independently.

# Delivery milestones

1. **Prototype:** Connect a microphone to OpenAI, show source and translated text, and measure delay and cost in both directions.

2. **Hackathon demo:** Add the operator controls, full-screen projector view, periodic summary and visible failure states.

3. **Church pilot:** Rehearse with a bilingual reviewer, real audio and the intended projector; log corrections and refine based on results.

4. **Open-source release:** Document installation, privacy, costs, licensing and contribution workflow; publish after reviewing the repository and secrets.

# Open decisions

- Should the projector show the original language and translation together by default, or the translation alone?

- Should the live summary appear on the main projector, a separate screen, or only the operator view?

- Does the first service need automatic mid-sentence switching, or is a manual direction control sufficient for the pilot?

- Will the pilot run on a church computer with a soundboard connection, or rely on a room microphone?

- Which open-source license and hosting approach best support the intended community?
