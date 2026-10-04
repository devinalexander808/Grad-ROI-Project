@AGENTS.md

# Pathfinder — standing rules

This is **Pathfinder**: name a job, see how to get there, what it costs, and
whether the market wants it. The product spec is [SPEC.md](SPEC.md); the build
plan is [PLAN.md](PLAN.md). Read the relevant SPEC sections before starting a task.

## Rules

1. **The model is frozen.** Never change `src/lib/model.ts` without also
   updating `grad_roi_test_cases.xlsx` and `src/lib/model.test.ts` to match.
   If a task seems to need a model change, say so before editing.
2. **No new dependencies without saying so.** Before adding any package to
   `package.json`, name it and why it is needed.
3. **Every task ends green.** `npm test` and `npm run build` must both pass
   before a task is done. Fix a red result before anything else.
4. **Stop before committing.** When the work is done, stop and show a diff
   summary (files changed and what changed in each).
5. **Never commit unless asked.** Do not commit or push until the user says to
   (e.g. via `/ship`).
6. **Keep NOTES.md current.** One entry per commit, oldest first, placed above
   the "How I work with Claude Code" section, in the existing format: a date
   and title heading, then **Built**, **Prompt intent**, and **Bugs** (any bug
   found and how it was fixed, or "None").
7. **Secrets stay out of the repo.** `BLS_API_KEY` and every other secret live
   only in `.env.local` (git-ignored) and Vercel environment variables. Never
   hard-code, log, or echo them, and redact them from error messages.
8. **Plain-language UI.** Prefer plain words over jargon. Every figure shown to
   the user is labelled with its source and year (e.g. "BLS OEWS, May 2024").
