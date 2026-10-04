---
description: Add the NOTES.md entry, run tests and build, then commit and push
argument-hint: <commit message>
---

Ship the pending change with commit message: **$ARGUMENTS**

1. If no message was given, stop and ask for one.
2. Review the pending change (`git status`, `git diff`). Add one NOTES.md entry
   for it, above the "How I work with Claude Code" section, in the existing
   format: `## <today's date> — $ARGUMENTS`, then **Built**, **Prompt intent**,
   and **Bugs** (any bug found and its fix, or "None").
3. Run `npm test` and `npm run build`. If either fails, stop and show the
   output; do not commit.
4. Stage the change and the NOTES.md entry, commit with the message
   "$ARGUMENTS", and push to the current branch's remote.
5. Report the commit hash and the push result.
