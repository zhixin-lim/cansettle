<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Bill items use optional ownerQuantities for whole-item allocation; absence preserves equal sharing and existing saved sessions.
- Quantity assignments must exactly match receipt quantity before settlement; missing or excess units must never be redistributed silently.
- Keep SessionContext in a dedicated module separate from the provider and reducer so live updates do not recreate the context while mounted consumers still use the previous identity.
- Enforce the native form-field font-size floor in global CSS outside cascade layers so component text utilities cannot trigger iOS focus zoom.
- The external CanSettle backend owns sessions, participants, bills (including the optional shop `name`), items and allocations; the device stores only the session id and PayNow numbers (PayNow numbers must never be sent). A device copy of a shop name is only kept for older bills the backend has no name for.
- Settlements expire after 24 hours. Any API response of 410 (expired) or 404 "Session not found" opens the global expired dialog (ExpiredDialog in the root layout) with a single "start a new settlement" action; never show those as toasts or raw errors.
- Opening the app with `?session=<uuid>` resumes that settlement (only UUID-shaped ids are accepted, see session-link.ts) and the parameter is then removed from the address bar.
- Copied messages are plain text only: no markdown symbols, because pasted asterisks/underscores show literally in Telegram. The group message is short (item names per person, who pays whom); each person who owes gets their own message with item amounts.
- Bills are edited as in-memory drafts and sent on "Done" (create new, then delete the old version), because the API has no bill-update route.
- The final screen and copied message render the backend settlement as-is; local engine output is only used for bill-entry checks and per-item display lines.
