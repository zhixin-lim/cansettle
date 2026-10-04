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
