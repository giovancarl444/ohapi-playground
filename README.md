# ohapi-playground — internal test bench (not a product)

Role fixed 16 August 2026 — see `mygf-ai-prelaunch/docs/ARCHITECTURE.md`.

A browser-direct workbench for exercising the OhAPI endpoints with your own
partner key (stored in localStorage, sent as `X-API-Key`). Fine for internal
testing — never deploy it as part of the product surface and never link it
publicly. The production integration lives in `mygf-ai-prelaunch/server/ohapi.ts`.

Aligned with the live API (fixes verified against api.oh.xyz, 16 Aug 2026):

- `POST /api/v1/rooms` sends `user_id` (a stable per-browser identifier) —
  the room is not created without it.
- The character library loads from `/api/v1/characters/customer-characters`
  (`/api/v1/characters` does not exist on the live service), with the
  firstName/lastName/sfwImage shape that endpoint actually returns.
- Audio calls `POST /api/v1/audio/notes` — synchronous, text in `prompt`,
  room context attached — and accepts either a bare result URL or a job id.
  `/api/v1/audio` answers 403 "Unknown endpoint".
- Image requests send `prompt_enhancement: false` and `resolution: "9:16"`
  explicitly, so what you test is what you asked for. (Live finding: explicit
  `[width, height]` arrays are honoured — e.g. 1080×1920 — while presets cap
  at 1280 on the long edge.)
