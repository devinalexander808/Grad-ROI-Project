---
description: Implement build section N of PLAN.md, then stop with a diff summary
argument-hint: <build number>
---

Implement **Build $ARGUMENTS** from PLAN.md.

1. Read `CLAUDE.md`, then the "Build $ARGUMENTS" section of `PLAN.md`, then the
   SPEC.md sections it relies on. If the section is missing or says "full text
   to follow", stop and say so.
2. Follow every rule in `CLAUDE.md`: model frozen unless the workbook and tests
   are updated, name any new dependency before adding it, secrets only in
   `.env.local` and Vercel, plain-language UI with source and year on every
   figure.
3. Implement the build so each acceptance check is met.
4. Run `npm test` and `npm run build`; fix anything red until both pass.
5. Stop. Do not update NOTES.md and do not commit. Show a diff summary: files
   changed and what changed in each, which acceptance checks are met (and any
   that aren't, with why), any new dependencies, and the test and build
   results.
