# Protocol reference notice

This module maps protocol fields researched from cptkirki/PrintSphere, copyright (c) 2026 Cpt_Kirk, commit `32ad5aeb8b5da999de9d94bd9f4d2ec0f065c609` (v1.6.2), notably main/src/bambu_cloud_client.cpp.

The upstream FNCL v1.1 license is retained in UPSTREAM_LICENSE; this work does not assert an MIT or other conflicting license for adapted protocol logic. Commercial use requires the separate authorization specified by the upstream license.

Changes (2026-11-07): TypeScript snapshot adapter and tests instead of ESP-IDF runtime; immutable merges, explicit nulls, exact rather than approximate humidity, no fixed four-AMS storage cap, no raw authenticated cover URLs, optional per-field observation times. These changes and synthetic samples have not been verified against a physical H2C.

ID-only AMS slot reports are preserved as ambiguous partials, rather than being interpreted as empty. Explicit empty tray_type clears a slot. This differs conservatively from the upstream heuristic and needs real-device validation. Numeric stage codes remain raw; no invented descriptions. Snapshot provenance is supplied by the caller and is never changed to cloud by the parser.

T-012 (2026-11-07): apps/server/src/cloud-auth.ts and the cloud login flow reference the same pinned upstream file (password/code/TFA cookie authentication and device binding). Implemented in TypeScript with bounded responses, sanitized errors, explicit device choice, same-origin local administration and token-only persistence. The compatibility request headers follow the upstream protocol profile. The upstream license continues to apply to adapted protocol logic. No official Bambu partnership or compatibility certification is asserted.
