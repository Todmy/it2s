---
name: it2s-spawn
description: >-
  Spawn, create, launch, or delegate a separate Claude Code or Codex agent for a task.
  Triggers include "заспавни агента", "створи агента", "запусти окремого агента",
  "делегуй агенту", "найми агента", "зроби рев'ю PR окремим агентом", "заспавни агента автономно", and
  "have another agent do this".
---

# Spawn a supervised agent

Use this skill whenever the user asks for a separate agent without spelling out an `it2s` command. The user's explicit provider, model, effort, account, mechanism, and autonomy choice win. A plain "окремим агентом" means an **it2s iTerm2 child tab**. "Внутрішнім агентом" means the host's native Claude/Codex subagent mechanism (Codex may expose it through app-server JSON RPC). Ask one short mechanism question only when neither meaning is clear. Never silently turn one into the other.

## Choose the execution mode

- Ordinary request, including PR review: launch an interactive it2s child. **Do not** invoke Sandcastle or `$autonomous-dev` by default.
- Explicit "автономно", "Sandcastle", "AFK", or equivalent long independent implementation: spawn an it2s child **manager** whose first task is to invoke `$autonomous-dev` (Codex) or `/autonomous-dev` (Claude). That skill runs the implementation in Sandcastle. You supervise the child manager, which supervises and reviews the sandbox worker. Sandcastle credentials, image, and quota are separate from host accounts; the child must verify the worker's model and environment there before the paid run.
- A large feature with no clear autonomy preference: ask **"Запустити в Sandcastle автономно чи як звичайну задачу окремому агенту?"**. Await the answer before launching. Do not infer Sandcastle merely from task size.

## Route an ordinary it2s child

1. Identify the actual project/repo, requested result, acceptance, permissions, and current PR content. Preserve the full task and relevant PR text/diff in a private task file (mode 0600) outside the repo. For autonomous mode, prepend "Invoke `$autonomous-dev` or `/autonomous-dev` for this task; stay responsible for the Sandcastle worker, handle blockers through your parent, and review its diff and acceptance before finishing." Do not include tokens, passwords, or unrelated client data. `it2s-route` sends this file to TypeSafe; if it exceeds 100 kB, write a shorter **routing-only** file for Jev and retain the full worker prompt separately. Never silently truncate the worker's context.
2. Run `it2s-quota` **live**, before routing. It reads `cswap list --json` for the Lumina corporate Claude seat and `codexbar usage --provider codex --json` for corporate Codex, checks freshness, subscription windows, and scoped Claude caps, and prints available providers plus `exclude_models`. If the host sandbox blocks the read, rerun the same check with the host's permission mechanism; an error is unknown, not exhausted. `creditsAvailable:false` means extra credits are unavailable; it does **not** prove subscription quota is exhausted. When in `~/lumina`, corporate Claude is preferred; if its quota is actually exhausted, use available corporate Codex. If both are unavailable or uncertain, surface the precise blocker. Never switch to a personal account silently.
3. Read `data/models.json` and `data/benchmarks.json` from this plugin. They are a dated snapshot, not live availability. The [Coding Agent Index](https://artificialanalysis.ai/agents/coding-agents/comparisons/claude-code-vs-codex) measures model **plus harness** at a specified effort. It has no Opus 5.5 result; its [general model analysis](https://artificialanalysis.ai/articles/claude-opus-5-5/) is only indirect review evidence. There is no directly comparable current PR-review score in the [CodeReviewBench leaderboard](https://www.codereviewbench.com/leaderboard). Never make one up.
4. Run `it2s-route <routing-task-file> --providers claude,codex` with only the `providers` from `it2s-quota`, adding each `exclude_models` entry as `--exclude-model <id>`. Normalize spoken model names ("Opus 5.5" → `claude-opus-5-5`) and effort shorthand ("mid" → `medium`) against the catalog. If the user specified model/effort, pass `--model` and `--effort`; this bypasses Jev and validates the catalog. Otherwise TypeSafe Jev chooses the **model and effort together**, using task context, model descriptions, dated benchmarks, time, and corporate Claude priority. If TypeSafe fails, say so and do not pretend a heuristic was Jev's decision. The router does not fetch a new catalog or benchmarks per request.
5. Show the chosen provider/model/effort and start with `it2s launch <name> <provider> <model> <effort> <full-worker-task-file> <repo-cwd>`. Claude launch is verified only under `~/lumina`, where it uses `lumina-claude interactive` and its corporate profile. Outside `~/lumina`, do not offer Claude from the corporate quota check; if another account is needed, ask which account or mechanism to use. Record the returned session ID, task, parent, quota evidence, and model decision in the handoff. Do not launch before the command can be inspected for the correct account and prompt file.

## Own the child until a real outcome

You are responsible for the child you spawned. Keep its session ID and use `it2s status`, `it2s read <id> 30`, and bounded `it2s wait` cycles. Do not finish your own turn immediately after launch or leave an unowned tab. Give the user concise progress on state changes. Read the child before sending a new message; never type into a busy session or a permission prompt. Answer ordinary technical questions from the task context. Route decisions or approvals you do not hold to the user, then relay the user's actual answer. A child report is evidence to inspect, not automatic acceptance; verify the result, and report completion or a named blocker.

For Sandcastle, the it2s child is the manager running `$autonomous-dev` or `/autonomous-dev`. You own that child and relay questions it cannot answer. Its current sandbox runner has no live `tell`/resume API: if the sandbox worker reports a question, the child records it and asks you or resolves it from scope, then makes a reviewed follow-up run on the retained branch. Do not claim a live answer reached the container. Continue watching through terminal state and review the result before declaring done. Never merge, push, or open a PR without the authorization required by that workflow.

## Limits

`it2s` works only with iTerm2 tabs on this Mac. If there is no reachable iTerm2 API, report the exact failure and ask whether to use the host-native agent instead. Jev's typed choice is guidance, not authorization: code and the manager own provider eligibility, permissions, scope, and lifecycle.
