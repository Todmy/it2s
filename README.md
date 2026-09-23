# it2s — one agent session that supervises all your iTerm2 tabs

Lets a Claude Code or Codex session list, read, type into, and wait on every other iTerm2 tab on the Mac (other agents, shells), with a hook-fed registry of who runs what. tmux `capture-pane`/`send-keys` without tmux, via the iTerm2 Python API.

Requires: macOS, iTerm2 with Settings → General → Magic → **Enable Python API** (iTerm2 downloads its Python runtime; nothing to pip-install).

## Install

Two parts on every machine, whichever agent you use:

1. **The CLI** (`it2s` on your PATH). Plugin managers do not put binaries on PATH, so this is always a clone + `install.sh`.
2. **The agent side** (four skills + session-registry hooks). Both Claude Code and Codex get all of it from the plugin; `install.sh` links the same things by hand when you skip the plugin.

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

It also installs `it2s-quota` and `it2s-route`. Routing needs `TYPESAFE_API_KEY` in the manager's environment. The model catalog and benchmark snapshot are stored in `data/` as of 2026-09-23; refresh them as a deliberate source update, not on every launch.

### Step 2a — Claude Code

```bash
claude plugin marketplace add Todmy/it2s
claude plugin install it2s@it2s
```

That registers `it2s-watch`, `/it2s:it2s-ops`, `/it2s:it2s-spawn`, `/it2s:agent-orchestrator`, and 7 hooks that feed the session registry. Restart open `claude` sessions so their hooks reload.

### Step 2b — Codex

```bash
codex plugin marketplace add Todmy/it2s --ref main
codex plugin add it2s@it2s
```

That registers the same four skills (`$it2s-watch`, `$it2s-ops`, `$it2s-spawn`, `$agent-orchestrator` in the `$` menu) and the same hooks. Codex has no slash commands: `$name` inserts a skill, and that is how you run one ops cycle. Hooks must be enabled in `~/.codex/config.toml`:

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

For a short new-agent request, ask *"зроби рев’ю цього PR окремим агентом"* or invoke `/it2s:it2s-spawn` / `$it2s-spawn`. For one autonomous task coordinated by the current agent, invoke `/it2s:agent-orchestrator` / `$agent-orchestrator`. Workers are leaves; only the root may propose a child orchestrator, and each such launch needs explicit user approval of the model. Ordinary autonomy does not imply Sandcastle. The command layer is `it2s-quota`, `it2s-route TASK_FILE --providers claude,codex`, `it2s launch NAME PROVIDER MODEL EFFORT TASK_FILE [CWD]`, and `it2s watch ID[,ID...] [TIMEOUT]`.

After the user approves a particular child orchestrator and its model, save a private JSON receipt such as `{"model":"claude-opus-5-5","user_approval":"<verbatim user reply>"}`. Launch it with `it2s launch --role orchestrator --approval-file RECEIPT NAME claude MODEL EFFORT TASK_FILE CWD`. The CLI records the parent and role, rejects worker spawning and a second orchestrator generation, and `it2s tree` shows the hierarchy. The receipt is an audit record supplied by the manager; the manager must still obtain the real user approval.

For a task explicitly in Sandcastle, `node bin/agent-sandbox.mjs check MANIFEST` checks a private manifest shaped like `assets/agent-sandbox.example.json`. `run MANIFEST NEW_RUN_DIR` starts one shared container with separate worker worktrees and streams state changes; `status RUN_DIR`, `answer RUN_DIR WORKER_ID MESSAGE`, and `stop RUN_DIR` supervise it. A waiting worker resumes in its own session when answered. The runner stops at its wall-clock, per-worker, and total-turn ceilings and leaves branches/worktrees for manager review. The container image and repo-root `.sandcastle/.env` must already exist; account access inside the container is separate from host quotas. `check` does not spend model tokens.

### Update / uninstall

```bash
git -C ~/github/it2s pull                                                  # CLI
claude plugin marketplace update it2s && claude plugin update it2s@it2s   # Claude
codex plugin marketplace upgrade it2s && codex plugin add it2s@it2s       # Codex
```

Uninstall: `claude plugin uninstall it2s@it2s`, `codex plugin remove it2s@it2s`, `rm ~/.local/bin/it2s ~/.local/bin/it2s-hook ~/.local/bin/it2s-quota ~/.local/bin/it2s-route`. Plugin-less installs also: delete the `it2s-hook` entries from `~/.codex/hooks.json` and `rm ~/.codex/skills/it2s-watch ~/.codex/skills/it2s-ops ~/.codex/skills/it2s-spawn ~/.codex/skills/agent-orchestrator`.

## What you get

| Piece | Where | Does |
|---|---|---|
| `it2s` CLI | `bin/` | `list`, `read`, `send`, `key`, `wait`, `watch`, `tree`, `status`, `alerts`, `spawn`, `launch`, `tag` |
| `it2s-route` + dated catalog | `bin/`, `data/` | TypeSafe Jev chooses model and effort from the quota-eligible models; no per-request catalog refresh |
| `it2s-spawn` skill | `skills/it2s-spawn` | short natural-language worker requests, ordinary vs Sandcastle mode, supervised handoff |
| `agent-orchestrator` skill | `skills/agent-orchestrator` | rooted autonomous task, worker leaves, optional approved child orchestrator, skill and TypeSafe routing |
| `agent-sandbox` runner | `bin/agent-sandbox.mjs` | one Sandcastle container for parallel workers in separate worktrees, with progress and parent answers |
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
