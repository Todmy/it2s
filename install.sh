#!/bin/zsh
# it2s installer for the one thing a plugin manager does not do: put the `it2s` CLI on PATH.
# Skills + registry hooks come from the plugin:
#   Claude Code: claude plugin marketplace add Todmy/it2s && claude plugin install it2s@it2s
#   Codex:       codex plugin marketplace add Todmy/it2s --ref main && codex plugin add it2s@it2s
# Without a plugin manager, this script also links the skills and merges the Codex hooks (idempotent, safe to rerun).
set -e
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
mkdir -p ~/.local/bin ~/.local/state/it2s
ln -sfn "$HERE/bin/it2s" ~/.local/bin/it2s
ln -sfn "$HERE/bin/it2s-hook" ~/.local/bin/it2s-hook
ln -sfn "$HERE/bin/it2s-route" ~/.local/bin/it2s-route
ln -sfn "$HERE/bin/it2s-quota" ~/.local/bin/it2s-quota
echo "CLI: ~/.local/bin/it2s -> $HERE/bin/it2s  (make sure ~/.local/bin is on PATH)"
if [[ -d ~/.codex && ! -d ~/.codex/plugins/cache/it2s ]]; then
  mkdir -p ~/.codex/skills
  for s in it2s-watch it2s-ops it2s-spawn agent-orchestrator; do [[ -e ~/.codex/skills/$s ]] || ln -s "$HERE/skills/$s" ~/.codex/skills/$s; done
  python3 - "$HERE/hooks/hooks-codex.json" <<'PY'
import json, os, sys
src = json.load(open(sys.argv[1]))["hooks"]; path = os.path.expanduser("~/.codex/hooks.json")
d = json.load(open(path)) if os.path.exists(path) else {"hooks": {}}
hooks = d.setdefault("hooks", {}); added = []
for ev, entries in src.items():
    lst = hooks.setdefault(ev, [])
    if any(h.get("command", "").endswith("it2s-hook") for e in lst for h in e.get("hooks", [])): continue
    for e in entries:
        for h in e["hooks"]: h["command"] = os.path.expanduser(h["command"])
    lst.extend(entries); added.append(ev)
json.dump(d, open(path, "w"), indent=2); print("Codex hooks added:", added or "already present")
PY
  echo "Codex without the plugin: skills linked into ~/.codex/skills, hooks merged. Enable hooks in ~/.codex/config.toml: [features] hooks = true"
fi
if [[ -d ~/.claude && ! -d ~/.claude/plugins/cache/it2s ]]; then
  echo "Claude Code without the plugin? Link all four directories under $HERE/skills/ into ~/.claude/skills/ and merge hooks/hooks.json into ~/.claude/settings.json with \${CLAUDE_PLUGIN_ROOT} replaced by $HERE"
fi
it2s list >/dev/null && echo "it2s works: $(it2s list | wc -l | tr -d ' ') sessions visible" || echo "it2s cannot reach iTerm2: enable Settings → General → Magic → Python API"
