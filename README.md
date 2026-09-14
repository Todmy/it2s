# it2s — one agent session that supervises all your iTerm2 tabs

Lets a Claude Code or Codex session list, read, type into, and wait on every other iTerm2 tab on the Mac (other agents, shells), with a hook-fed registry of who runs what. tmux `capture-pane`/`send-keys` without tmux, via the iTerm2 Python API.

Requires: macOS, iTerm2 with Settings → General → Magic → **Enable Python API** (iTerm2 downloads its Python runtime; nothing to pip-install).

## Install

Two parts on every machine, whichever agent you use:

1. **The CLI** (`it2s` on your PATH). Plugin managers do not put binaries on PATH, so this is always a clone + `install.sh`.
2. **The agent side** (two skills + session-registry hooks). Both Claude Code and Codex get all of it from the plugin; `install.sh` links the same things by hand when you skip the plugin.

### Step 0 — prerequisites (once)

- macOS with iTerm2 3.5 or newer.
- iTerm2 → Settings → General → Magic → **Enable Python API**. iTerm2 downloads its own Python runtime; `it2s` finds it, nothing to pip-install.
- `~/.local/bin` on your PATH (`echo $PATH | grep -q .local/bin || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc`).

### Step 1 — CLI (everyone)

```bash
git clone https://github.com/Todmy/it2s ~/github/it2s
~/github/it2s/install.sh
```

`install.sh` links `it2s` and `it2s-hook` into `~/.local/bin` and ends by printing how many iTerm2 sessions it can see. If it finds no it2s plugin in `~/.codex`, it also links the skills into `~/.codex/skills/` and merges the hooks into `~/.codex/hooks.json` (idempotent, safe to rerun).

### Step 2a — Claude Code

```bash
claude plugin marketplace add Todmy/it2s
claude plugin install it2s@it2s
```

That registers the `it2s-watch` skill, the `/it2s:it2s-ops` skill, and 7 hooks that feed the session registry. Restart open `claude` sessions so their hooks reload.

### Step 2b — Codex

```bash
codex plugin marketplace add Todmy/it2s --ref main
codex plugin add it2s@it2s
```

That registers the same two skills (`$it2s-watch`, `$it2s-ops` in the `$` menu) and the same hooks. Codex has no slash commands: `$name` inserts a skill, and that is how you run one ops cycle. Hooks must be enabled in `~/.codex/config.toml`:

```toml
[features]
hooks = true
```

On the first `codex` start after install, Codex asks to review the new hooks: choose **Trust all and continue**, otherwise the registry stays empty. If you skip the Codex plugin, `install.sh` alone is enough: it links both skills into `~/.codex/skills/` and merges the hooks.

### Verify

```bash
it2s status          # one row per iTerm2 tab; agent tabs show busy / idle / waiting
```

Open a second tab, start `claude` or `codex`, and in the first tab ask your agent: *"what is the other tab doing?"* It should run `it2s list` and `it2s read` on its own. Then try `/it2s:it2s-ops` (Claude) or `$it2s-ops` (Codex) for one supervisor cycle.

### Update / uninstall

```bash
git -C ~/github/it2s pull                                                  # CLI
claude plugin marketplace update it2s && claude plugin update it2s@it2s   # Claude
codex plugin marketplace upgrade it2s && codex plugin add it2s@it2s       # Codex
```

Uninstall: `claude plugin uninstall it2s@it2s`, `codex plugin remove it2s@it2s`, `rm ~/.local/bin/it2s ~/.local/bin/it2s-hook`. Plugin-less installs also: delete the `it2s-hook` entries from `~/.codex/hooks.json` and `rm ~/.codex/skills/it2s-watch ~/.codex/skills/it2s-ops`.

## What you get

| Piece | Where | Does |
|---|---|---|
| `it2s` CLI | `bin/` | `list`, `read`, `send`, `key`, `wait`, `status`, `alerts`, `spawn`, `tag` |
| registry hook | `bin/it2s-hook` + `hooks/` | every session writes agent, cwd, last prompt, last answer, waiting/error state to `~/.local/state/it2s/sessions.json` |
| `it2s-watch` skill | `skills/it2s-watch` | how an agent should watch and drive other sessions (busy/idle table, supervisor loop, pitfalls) |
| `it2s-ops` skill: `/it2s:it2s-ops` (Claude) · `$it2s-ops` (Codex) | `skills/it2s-ops` | one supervisor cycle; `/loop 5m /it2s:it2s-ops` makes it the "god session" |

```
it2s status
ID       NAME              AGENT  STATE               IDLE  LAST / WAITING / ERROR
7FC99E4E lumina-fieldview  claude busy                  2m
F1AA36DE cc-status pr      codex  waiting:permission   0m  Allow git push?
B437CF82 cc-status         shell  idle                  -m
```

Limits: local Mac only, visible screen only (no scrollback), iTerm2 only.
