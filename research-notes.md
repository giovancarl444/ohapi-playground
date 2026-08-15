# Oh API Public Documentation Notes

Source reviewed: https://api.oh.xyz/documentation on 2026-08-15.

## Confirmed integration rules

- The documented base URL is `https://api.oh.xyz`.
- Every request needs the `X-API-Key` header.
- Public documentation identifies these status patterns: `200` success, `201` created, `202` accepted/queued, `400` malformed input, `401` invalid credentials, `403` insufficient credit/access, `404` missing endpoint/resource, `422` validation, `429` throttled, and `500` server/processing error.
- Error bodies use JSON and can include `error`, `message`, and `suggestion`; the client should show the full body when possible.
- The documented async pattern is submit, retain `{ job_id, presigned_url }`, poll `GET /api/v1/jobs/{job_id}/status` every 2–5 seconds, and stop on completed or failed. A five-minute client-side timeout matches the documented advice.
- The docs list `POST /api/v1/rooms`, `POST /api/v1/text`, `POST /api/v1/images`, `POST /api/v1/videos/create`, and `GET /api/v1/jobs/{job_id}/status`.
- The public documentation currently lists audio as `POST /api/v1/audio/notes`, while the supplied project brief specifies `POST /api/v1/audio`. The implementation should use the supplied brief as the primary product requirement and return the backend diagnostic if the endpoint differs for a key.
- The public documentation references character lists through customer-library endpoints and a deprecated B2B character list endpoint; the supplied brief requires `GET /api/v1/characters`. The implementation should begin with the specified endpoint and surface backend errors clearly.
