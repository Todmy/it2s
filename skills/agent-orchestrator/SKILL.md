---
name: agent-orchestrator
description: Use when one agent must own an autonomous task, coordinate multiple Claude Code or Codex workers, compare independent solutions, or supervise their questions and progress while the user is away.
---

# Agent orchestrator

The agent running this skill is the root orchestrator, on its current model. The user talks to this agent. A task may have many workers, but each spawned agent has exactly one parent and every report reaches this root. The root remains accountable for the final result and for every child until that child completes or reaches a named blocker.

## Roles and tree

- **Root orchestrator:** may launch many workers and, with separate user approval for each, child orchestrators.
- **Child orchestrator:** may launch workers, answer their questions, and report to the root. It may never launch another orchestrator.
- **Worker:** a leaf. It may use tools and skills for its own assignment but may not spawn any agent, using `it2s`, `am`, native subagents, or another mechanism. If more help is needed, it asks its parent.

When using `it2s`, launch workers with the default `it2s launch` role. Launch a child orchestrator with `it2s launch --role orchestrator --approval-file <private-json> ...`. The approval JSON must contain the exact selected `model` and the user's verbatim `user_approval`; its file mode is 0600. `it2s` records the parent and rejects a worker launch or a second orchestrator generation. For `am` or native subagents, carry the same role and parent contract explicitly in the prompt; do not claim the `it2s` guard applies to those mechanisms.

Before **each** child orchestrator launch, propose its scope, model, effort, account, expected spend, and reason it needs to manage its own workers. Ask the user to approve that model and this particular launch. Do not treat an earlier approval or a TypeSafe judgment as permission. If the user is asleep or does not approve, keep the work with the root or existing workers.

The child orchestrator handoff names the root session and says: "You are a child orchestrator. You may launch workers, never another orchestrator. Answer your workers' questions within this task's authority, watch them to an outcome, and report decisions, evidence, and blockers to your root. Discover relevant installed skills and use `$typesafe-ai` for suitable typed judgments." A worker handoff instead says that it is a leaf and must ask its parent for any additional agent.

## Start one autonomous task

1. Capture the whole task and acceptance criteria. Set a wall-clock limit, total spend ceiling, retry ceiling, and maximum simultaneous and total agents **before** dispatch. The limits cover all descendants. Give each child a bounded scope, an isolated worktree for code changes, and the relevant context. A review-only worker may share the read-only tree.
2. Choose the work shape: one worker for a bounded task; several workers for independent parts; or two or more independent attempts at the same difficult decision. Competing attempts use separate worktrees and the same acceptance criteria. The root compares evidence and selects or combines solutions; a child report is never automatic acceptance.
3. Select worker models according to the user's choice: one named model for all workers, explicit models per worker, or automatic routing. In automatic mode, run live quota checks and `it2s-route` (TypeSafe Jev) for each distinct worker task, with the dated local benchmark catalog and only eligible models. Explicit model and effort choices win. Never silently use a personal account or a different provider. The manager's own model is not changed by this skill.
4. Discover the available skills in the worker's actual Claude Code or Codex environment before handoff. Name the relevant skills in its prompt, including how to invoke them there. Both orchestrators and workers may discover and use other appropriate skills during their own work. Never assume a skill installed only in the parent is present in the child.
5. Explicitly tell every child about `$typesafe-ai` (or `/typesafe-ai` if that is the actual installed name). Read it and the live TypeSafe docs when using it. Use TypeSafe where a decision can be expressed as a bounded typed Choice, Score, or Noul, such as model routing, evidence ranking, or a narrow verification judgment. It is a cheap judgment tool, not a replacement for checking facts, executing work, or granting permission. If the skill, key, or service is unavailable, report that fact and make a reasoned decision without claiming TypeSafe was used.

## Supervise until outcome

Use the backend the user selected: `it2s` tabs by default on this Mac; `am` only when explicitly selected or after asking when iTerm2 is unavailable. If the whole task is in Sandcastle, workers inherit that environment; ordinary autonomous work does not imply Sandcastle. For a shared Sandcastle task, use `node <this-plugin>/bin/agent-sandbox.mjs` with a private manifest shaped like `assets/agent-sandbox.example.json`: `check`, then `run` in a wake-capable execution session. It creates one container and a branch/worktree per worker. The runner streams state changes and pauses a worker on `NEEDS_PARENT_INPUT:`; use `status` to inspect and `answer` to resume that exact worker. The runner requires the repo-root `.sandcastle/.env` and an image with the selected CLI and `timeout`; host subscription credentials do not transfer. Check actual account and network permissions before launching. If that preflight or the parent's wake channel fails, stop before promising unattended supervision.

The root stays active for the agreed wall-clock window. For `it2s`, retain exact child IDs, use `it2s tree` to inspect ownership and `it2s watch <id,id,...> [timeout_s]` for hook events, then inspect `it2s status` and `it2s read` before replying. For `am`, use its persistent `am babysit` event stream and structured `state`/`logs`. For Sandcastle, keep the runner's event stream attached and answer waiting workers through `agent-sandbox answer`. Do not send into a busy session or a permission prompt. If the current session cannot be woken while the user is away, tell the user and ask before launching a separate persistent orchestrator; propose its model and budget as for any child orchestrator.

Each parent answers ordinary questions from the task contract, relays changed scope or unauthorized external actions to its own parent, and records decisions. The root asks the user only when the delegated authority is insufficient. While one branch waits, continue independent branches. If a parent dies, do not silently leave its children unowned: the root reattaches and inspects them, or stops dispatch and reports the blocker.

Finish by checking the actual changes and acceptance evidence, comparing competing attempts, and reporting the result, remaining work, cost/time against budget, and exact branch/worktree/session IDs. End a run at completion, a named blocker, or its budget ceiling. Do not declare overnight autonomy from a launched tab or a quiet watcher alone.
