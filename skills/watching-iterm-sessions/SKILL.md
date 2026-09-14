---
name: watching-iterm-sessions
description: Use when asked to watch, supervise, coordinate, or send input to other iTerm2 windows/tabs or other agents (Claude Code, Codex, a shell) running on this Mac. Triggers: "що робить codex", "слідкуй за сесіями", "подивись у сусідньому вікні", "відправ у ту сесію", "one agent that controls the others", "what is the other terminal doing", "wait until that tab finishes".
---

# Watching iTerm2 Sessions

## Overview

`it2s` is a CLI over the iTerm2 Python API that lets any agent read the screen of any other iTerm2 session and type into it. It is tmux `capture-pane` / `send-keys` without tmux. One call takes about 0.5 s. Works the same from Claude Code (Bash tool) and Codex (shell tool).

Core principle: **read the other screen before acting on it, and poll with `wait`, never with a tight loop.**

## Quick Reference

| Need | Command |
|---|---|
| Which sessions exist | `it2s list` → `id  job  title` per line, `*` marks this session |
| What a session shows now | `it2s read <match> [N]` → last N non-empty screen lines (default 40) |
| Type into a session | `it2s send <match> <text>` → text + Enter, as if typed |
| Block until something appears | `it2s wait <match> <regex> [timeout_s]` → prints the tail when matched, exit 1 on timeout |
| Block until something disappears | `it2s wait <match> '!<regex>' [timeout_s]` → same, inverted |
| Send a control key | `it2s key <match> esc\|enter\|ctrl-c` |
| Open a new tab with a shell | `it2 tab new` (built-in iTerm2 CLI, prints the new session id) |
| Help | `it2s` with no args |

`<match>` = full session id or any case-insensitive substring of id, title, or job name: `codex`, `lumina`, `cc-status`, `760D5BED`. `send` and `read` never resolve to the calling session, so `it2s send codex ...` from a Claude tab can't loop back.

Busy or idle is decided by one string, nothing else:

| Session | BUSY iff screen contains | IDLE otherwise, wait with |
|---|---|---|
| Codex | `esc to interrupt` (line starts `• Working (`) | `it2s wait codex '!esc to interrupt' 600` |
| Claude Code | `esc to interrupt` | `it2s wait <id> '!esc to interrupt' 600` |
| Shell | last line is not the prompt | `it2s wait <id> '❯' 600` |

Not evidence of anything: scattered braille dots (`⠁ ⠄ ⢀ ⡀`) are Codex's idle background animation, the `› Ask Codex to do anything` placeholder is always on screen, and the status bar's task name stays after the task finished. An agent showing a final `•` answer line and no `esc to interrupt` is idle and waiting for a prompt.

`it2s` is a thin layer over the iTerm2 Python API. The raw CLI `it2` (`/Applications/iTerm.app/Contents/Resources/utilities/it2`, `it2 session list|read|send|run`, `it2 tab new`, ~0.2 s) does the same at a lower level; use it when you need a new tab or a feature `it2s` lacks. With raw `it2 session send`, send text and Enter (`$'\r'`) as two calls; agent TUIs drop them when combined. `it2s send` already does the split.

## Supervisor Loop

When asked to oversee other sessions, follow this shape:

1. `it2s list` once. Note the ids of the sessions you were asked to watch. Do not watch sessions you were not asked about.
2. For each watched session: `it2s read <id> 30`. Classify: working / idle waiting for input / errored / asking a question.
3. Decide per session. Only one action per session per cycle.
4. Act with `it2s send <id> <one short line>`. In an agent session the line is submitted as a prompt, so make it self-contained: "Run the tests and report failures" not "yes".
5. Block with `it2s wait <id> <idle-marker> 600`, then go to step 2. Report to the user what changed, in one line per session.

Stop and ask the user when: a session asks a yes/no permission question you were not told how to answer, a session shows a destructive command pending, or the same session has been idle at the same screen for 3 cycles.

## Runtime Notes

- **Claude Code**: run via Bash. `it2s` is on PATH (`~/.local/bin`). Sending to another Claude Code session submits a user turn there.
- **Codex**: run via the shell tool. A first call can fail with `Connection Invalid error for service com.apple.hiservices-xpcservice`; `it2s` retries once by itself, and a second manual call succeeds. If it keeps failing with a socket or permission error, the sandbox is blocking the iTerm2 API socket; ask the user to approve the command or to start Codex with a sandbox mode that allows it. Do not claim the tool is unavailable without showing the error text.
- **Other terminals** (Ghostty, VS Code, SSH) are invisible to `it2s`. Say so instead of guessing.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Polling with `read` in a `sleep 2` loop | Use `it2s wait <id> <regex> <timeout>`; it polls every 2 s internally and returns the tail. |
| Sending multi-line text | One line per `send`. Newlines submit early in agent sessions. |
| Assuming `read` returns history | It returns the visible screen only. Ask the other session to write long output to a file, then read the file. |
| Matching too loosely (`claude` hits three tabs) | Use the id from `list`, or a title substring unique to that tab. |
| Acting on a stale screen | Always `read` immediately before `send`. |

## Install / Repair

Files: `~/.local/bin/it2s` (zsh shim) and `~/.local/bin/it2s.py` (source, ~50 lines). Requirements: iTerm2 with Python API enabled (Settings → General → Magic → Enable Python API) and iTerm2's bundled runtime at `~/Library/Application Support/iTerm2/iterm2env-3.14/versions/3.10.19/bin/python3`. If the runtime path moved, update the one path in the shim. If `it2s list` hangs 10 s then prints, the shim lost its `os._exit(0)` at the end of `main`.
