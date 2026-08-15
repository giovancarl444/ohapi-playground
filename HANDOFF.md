# Oh API Playground — Complete Push Manifest

**Prepared:** 2026-08-15  
**Repository target:** [giovancarl444/ohapi-playground](https://github.com/giovancarl444/ohapi-playground)  
**Branch:** `main`

## Included in this push

This push contains the complete source-controlled application state needed to build and develop the Oh API Playground. It includes the React and Tailwind implementation, the dark **Ember Terminal** visual system, the direct browser-side API client, responsive layouts, error diagnostics, app configuration, package manifest and lockfile, TypeScript configuration, the design brief, and this handoff record.

| Area | Included material | Purpose |
| --- | --- | --- |
| Application source | `client/src/` | The functional playground interface and all Chat, Image, Video, Audio, and Cam request flows. |
| Static configuration | `client/index.html`, `vite.config.ts`, `package.json`, `pnpm-lock.yaml`, TypeScript configuration | Local development and production build configuration. |
| Design record | `ideas.md` | The selected visual direction, brand rationale, typography, signal-line rules, and responsive composition decisions. |
| API research record | `research-notes.md` | Documented public API observations and the known audio-endpoint discrepancy. |
| Handoff record | `HANDOFF.md`, `todo.md` | Scope of this delivery and the version-control exclusions below. |

## Items intentionally not included in source control

Some state is tied to a browser, the managed development environment, or an external asset service. These items are documented here because they cannot be transferred as ordinary repository files without changing the application’s security model or deployment behavior.

| Excluded item | Reason it is not pushed | How the application handles it |
| --- | --- | --- |
| User-entered Oh API key | The key is user-specific and stored in browser local storage; committing it would expose a credential. | The app reads and writes the key only in the visitor’s browser, then sends it directly as `X-API-Key`. |
| Characters, chat messages, generated media, jobs, and Cam sessions | These are live responses owned by the authenticated Oh API account and can expire or change. | The app retrieves them on demand using the visitor’s API key. |
| Generated visual binaries | The logo and decorative visuals are managed as project-linked storage objects rather than repository binaries. | The application references stable project storage URLs directly in its source. If the project is moved outside its current managed environment, download or replace those asset URLs. |
| Development logs | Local server, network, and browser logs are transient environment diagnostics rather than application source. | They remain available only in the development environment when created. |
| Production build output and installed dependencies | `dist/` and `node_modules/` are reproducible build artifacts and are intentionally untracked. | Run `pnpm install` followed by `pnpm build` to recreate them. |
| Managed preview URL and checkpoint metadata | These are properties of the managed project workspace, not portable Git files. | Use the repository locally or create a new managed project checkpoint after import. |
| Environment-injected values | Managed environment variables may exist at runtime but are not checked into source control. | This frontend implementation does not require a server-side secret; it uses visitor-provided API keys directly. |

> **Security note:** No API keys, generated API responses, browser-local data, or managed environment secrets are part of this repository push.

## Reproduce the application

Clone the repository, install the locked dependencies, then run the development server or production build.

```bash
pnpm install
pnpm dev

# Production verification
pnpm build
```

The interface opens without a key, but live API operations require an authorized Oh API key entered through the application’s authentication station. The user-facing API behavior is governed by the external Oh API documentation and the permissions attached to that key.

## Verification completed before the push

The application passed TypeScript validation with `pnpm check` and produced a successful production bundle with `pnpm build`. Desktop and mobile visual checks were completed for the responsive workbench layout.

## References

[1] [Oh API Documentation](https://api.oh.xyz/documentation)
