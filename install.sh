#!/bin/zsh
# it2s installer for the parts a plugin manager does not cover: the CLI on PATH, Codex hooks, the $it2s-ops prompt for Codex.
# Claude Code users: `claude plugin marketplace add Todmy/it2s && claude plugin install it2s@it2s` handles skill + command + hooks;
# still run this once for the CLI. Codex users: `codex plugin marketplace add Todmy/it2s --ref main && codex plugin add it2s@it2s`
# installs the skill; this script adds the CLI, hooks and the $it2s-ops prompt.
set -e
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
mkdir -p ~/.local/bin ~/.local/state/it2s
ln -sfn "$HERE/bin/it2s" ~/.local/bin/it2s
ln -sfn "$HERE/bin/it2s-hook" ~/.local/bin/it2s-hook
echo "CLI: ~/.local/bin/it2s -> $HERE/bin/it2s  (make sure ~/.local/bin is on PATH)"
if [[ -d ~/.codex ]]; then
  mkdir -p ~/.codex/prompts ~/.codex/skills
  ln -sfn "$HERE/commands/it2s-ops.md" ~/.codex/prompts/it2s-ops.md
  [[ -e ~/.codex/skills/it2s-watch ]] || ln -s "$HERE/skills/it2s-watch" ~/.codex/skills/it2s-watch
  python3 - "$HERE/hooks/hooks-codex.json" <<'PY'
import json, os, sys
src = json.load(open(sys.argv[1]))["hooks"]; path = os.path.expanduser("~/.codex/hooks.json")
d = json.load(open(path)) if os.path.exists(path) else {"hooks": {}}
hooks = d.setdefault("hooks", {}); added = []
for ev, entries in src.items():
    lst = hooks.setdefault(ev, [])
    if any(h.get("command", "").endswith("it2s-hook") for e in lst for h in e.get("hooks", [])): continue
    lst.extend(entries); added.append(ev)
json.dump(d, open(path, "w"), indent=2); print("Codex hooks added:", added or "already present")
PY
  echo "Codex: skill + \$it2s-ops prompt linked. Enable hooks in ~/.codex/config.toml: [features] hooks = true"
fi
if [[ -d ~/.claude && ! -d ~/.claude/plugins/cache/it2s ]]; then
  echo "Claude Code without the plugin? Then also: ln -s $HERE/skills/it2s-watch ~/.claude/skills/ ; ln -s $HERE/commands/it2s-ops.md ~/.claude/commands/it2s-ops.md ; and merge hooks/hooks.json into ~/.claude/settings.json with \${CLAUDE_PLUGIN_ROOT} replaced by $HERE"
fi
it2s list >/dev/null && echo "it2s works: $(it2s list | wc -l | tr -d ' ') sessions visible" || echo "it2s cannot reach iTerm2: enable Settings → General → Magic → Python API"
