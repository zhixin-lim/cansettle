# Remove example names from input placeholders

Two input fields use invented example names ("Rachel", "Otter & Pebbles") that read as suggestions the user didn't ask for. Replace them with neutral, self-explanatory placeholders. Nothing else in the app uses example names (the engine tests keep their fixtures — they're not user-visible).

## Changes

1. **Participants page** (`src/routes/settle.participants.tsx`) — change the name field placeholder from `Name (e.g. Rachel, or you)` to `Your name, then everyone else`.
2. **Bill entry page** (`src/routes/settle.bills.$billId.tsx`) — change the merchant field placeholder from `e.g. OTTER & PEBBLES` to `Name on the receipt`.

## Out of scope

- Engine test fixtures (internal, never shown to users).
- Any other copy — the app stays otherwise untouched.
