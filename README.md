# Amber & Ash — Reservation & Queue Management

A single-file prototype for a QR-scannable table reservation / queue management system, built for a restaurant with staggered 45-minute seating slots (90-minute seatings, half capacity released per slot).

## Status: prototype, not yet production-ready

This file runs entirely client-side and stores data via `window.storage`, a persistence API that **only works inside a published Claude.ai artifact** — it does not exist in a normal browser. That means:

- Opening `index.html` directly, or hosting it on GitHub Pages / Vercel / Netlify as-is, will **not** save or share reservation data. Every visitor gets a blank slate.
- The live, working version of this app currently lives in a Claude.ai artifact, not here.

This repo exists as a version-controlled backup of the code and a base for the next step: rebuilding the storage layer on a real backend (e.g. Supabase or Firebase) so it can be deployed on a real domain.

## Feature set (as of this version)

- QR-friendly reservation flow: date, party size (max 12), session (Lunch/Dinner), 45-min staggered slots
- Auto table allocation, respecting manually tied "table groups" (e.g. A1+A2+A3 → one 6-top)
- Manage/reschedule/cancel booking via phone + email lookup (no PIN)
- Pax-increase requests go into a staff-approved "pending change" queue instead of auto-reassigning
- Staff dashboard: live seating board (late / seated / wrapping up / overdue), guest history with no-show flags and internal notes, blackout-date/session/slot closures, CSV export (single day, date range, or all-time)
- Staff PIN gate (default `1868` — change this in Settings before going live)

## Next step for going live

Rebuild `window.storage` calls against a real backend (Supabase/Firebase recommended) and deploy behind Vercel/Netlify or similar, so data persists outside of Claude's artifact environment and the app works on a real domain.
