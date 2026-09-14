# it2s — one agent session that supervises all your iTerm2 tabs

Lets a Claude Code or Codex session list, read, type into, and wait on every other iTerm2 tab on the Mac (other agents, shells), with a hook-fed registry of who runs what. tmux `capture-pane`/`send-keys` without tmux, via the iTerm2 Python API.

Requires: macOS, iTerm2 with Settings → General → Magic → **Enable Python API** (iTerm2 downloads its Python runtime; nothing to pip-install).

## Install

Claude Code:
```bash
claude plugin marketplace add Todmy/it2s
claude plugin install it2s@it2s
~/.claude/plugins/cache/it2s/it2s/*/install.sh   # CLI on PATH (or clone and run ./install.sh)
```

Codex:
```bash
codex plugin marketplace add Todmy/it2s --ref main
codex plugin add it2s@it2s
git clone https://github.com/Todmy/it2s ~/github/it2s && ~/github/it2s/install.sh   # CLI, hooks, $ops prompt
```

No plugin manager: `git clone` and `./install.sh`, then follow what it prints.

## What you get

| Piece | Where | Does |
|---|---|---|
| `it2s` CLI | `bin/` | `list`, `read`, `send`, `key`, `wait`, `status`, `alerts`, `spawn`, `tag` |
| registry hook | `bin/it2s-hook` + `hooks/` | every session writes agent, cwd, last prompt, last answer, waiting/error state to `~/.local/state/it2s/sessions.json` |
| skill | `skills/watching-iterm-sessions` | how an agent should watch and drive other sessions (busy/idle table, supervisor loop, pitfalls) |
| `/ops` (Claude) · `$ops` (Codex) | `commands/ops.md` | one supervisor cycle; `/loop 5m /ops` makes it the "god session" |

```
it2s status
ID       NAME              AGENT  STATE               IDLE  LAST / WAITING / ERROR
7FC99E4E lumina-fieldview  claude busy                  2m
F1AA36DE cc-status pr      codex  waiting:permission   0m  Allow git push?
B437CF82 cc-status         shell  idle                  -m
```

Limits: local Mac only, visible screen only (no scrollback), iTerm2 only.
