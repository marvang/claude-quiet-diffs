# quiet-diffs

A Claude Code mod that hides the red/green file diffs in the transcript and shows a one-line, colored summary instead.

```
⏺ Write(notes.txt)
  ⎿  ✓ created, 4 lines · diff hidden (ctrl+o to view, /diffs to show)
⏺ Update(notes.txt)
  ⎿  ✓ +3 −2 · diff hidden (ctrl+o to view, /diffs to show)
⏺ Bash(rm notes.txt)
  ⎿  ✓ deleted notes.txt −5 · diff hidden (ctrl+o to view, /diffs to show)
```

Additions are green, removals red. Covers Edit, Write, NotebookEdit, and files changed by shell commands.

- **ctrl+o** opens the full transcript with every diff.
- **/diffs** toggles diffs back on (or off) for the session.
- Errors are always shown in full.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install quiet-diffs --marketplace marvang/claude-quiet-diffs
```

Answer `y` to add the marketplace, then pick a scope (user scope = every session).

From a shell:

```
claude plugin install quiet-diffs --marketplace marvang/claude-quiet-diffs
```

Mods are an early-access Claude Code feature; built and tested on Claude Code 2.1.316.
