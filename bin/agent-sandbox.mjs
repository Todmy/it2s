#!/usr/bin/env node
// One Sandcastle container per orchestration task; one git worktree per worker.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const fail = message => { throw new Error(message); };
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const cmd = (exe, args, cwd) => execFileSync(exe, args, { cwd, encoding: 'utf8', timeout: 30000 }).trim();
const atomic = (path, value) => {
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  renameSync(temp, path);
};
const slug = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,47}$/.test(value);
const positive = value => Number.isFinite(value) && value > 0;

function validate(m) {
  if (m?.version !== 1 || !slug(m.name) || !isAbsolute(m.project) || !m.image) fail('Expected version:1, name slug, absolute project, and image');
  if (!positive(m.timeoutMinutes) || m.timeoutMinutes > 480 || !Number.isInteger(m.parallel) || m.parallel < 1 || m.parallel > 4 || !Number.isInteger(m.maxTotalTurns) || m.maxTotalTurns < 1) fail('timeoutMinutes must be 1..480, parallel 1..4, maxTotalTurns positive');
  if (!Array.isArray(m.workers) || !m.workers.length) fail('workers must be non-empty');
  const ids = new Set();
  const models = read(new URL('../data/models.json', import.meta.url));
  for (const w of m.workers) {
    if (!slug(w.id) || ids.has(w.id)) fail('Worker IDs must be unique slugs');
    ids.add(w.id);
    if (!['codex', 'claude'].includes(w.agent) || !w.prompt?.trim() || !w.acceptance?.trim() || !Array.isArray(w.scope) || !w.scope.length) fail(`Incomplete worker ${w.id}`);
    if (!positive(w.timeoutMinutes) || w.timeoutMinutes > m.timeoutMinutes || !Number.isInteger(w.maxTurns) || w.maxTurns < 1 || w.maxTurns > 10) fail(`Invalid timeout/maxTurns for ${w.id}`);
    const model = models.models.find(x => x.id === w.model && x.provider === w.agent);
    if (!model || !model.efforts.includes(w.effort)) fail(`Unavailable catalog model/effort for ${w.id}`);
    if (w.agent === 'codex' && !['low', 'medium', 'high', 'xhigh'].includes(w.effort)) fail(`Sandcastle 0.12.0 cannot pass Codex effort ${w.effort}`);
    if (Object.keys(w).some(k => !['id', 'agent', 'model', 'effort', 'prompt', 'acceptance', 'scope', 'timeoutMinutes', 'maxTurns'].includes(k))) fail(`Unknown worker option for ${w.id}`);
  }
  if (Object.keys(m).some(k => !['version', 'name', 'project', 'image', 'timeoutMinutes', 'parallel', 'maxTotalTurns', 'workers'].includes(k))) fail('Unknown manifest option');
  return m;
}

async function sdk() {
  const base = join(cmd('npm', ['root', '-g']), '@ai-hero/sandcastle');
  if (read(join(base, 'package.json')).version !== '0.12.0') fail('This runner targets Sandcastle 0.12.0; inspect the API before upgrading');
  const core = await import(pathToFileURL(join(base, 'dist/index.js')).href);
  const { docker } = await import(pathToFileURL(join(base, 'dist/sandboxes/docker.js')).href);
  return { ...core, docker };
}

function preflight(m) {
  const repo = cmd('git', ['rev-parse', '--show-toplevel'], m.project);
  if (repo !== m.project) fail('project must be the git root for shared-container mode');
  if (cmd('git', ['status', '--porcelain', '--untracked-files=no'], repo)) fail('Tracked changes present; choose a clean checkout');
  cmd('docker', ['version', '--format', '{{.Server.Version}}']);
  cmd('docker', ['image', 'inspect', m.image, '--format', '{{.Id}}']);
  if (!existsSync(join(repo, '.sandcastle', '.env'))) fail('Missing repo-root .sandcastle/.env; container credentials are separate from host subscriptions');
  cmd('docker', ['run', '--rm', '--network', 'none', '--entrypoint', 'sh', m.image, '-c', 'command -v timeout']);
  for (const agent of new Set(m.workers.map(w => w.agent))) cmd('docker', ['run', '--rm', '--network', 'none', '--entrypoint', agent, m.image, '--version']);
  return { repo, base: cmd('git', ['rev-parse', 'HEAD'], repo) };
}

async function run(m, dir, kit, repo, base) {
  const runId = randomUUID().slice(0, 8);
  const workersPath = join(dir, 'worktrees');
  mkdirSync(workersPath, { mode: 0o700 });
  const rows = m.workers.map(w => ({ id: w.id, agent: w.agent, model: w.model, effort: w.effort,
    branch: `sc/${m.name}-${runId}/${w.id}`, worktree: join(workersPath, w.id), state: 'queued' }));
  const state = { version: 1, name: m.name, runId, repo, base, pid: process.pid, startedAt: new Date().toISOString(), turnsUsed: 0, workers: rows };
  const save = () => atomic(join(dir, 'state.json'), state);
  const emit = (id, event) => { const line = JSON.stringify({ at: new Date().toISOString(), id, event }); appendFileSync(join(dir, 'events.jsonl'), line + '\n', { mode: 0o600 }); console.log(line); };
  save();
  let sandbox;
  try {
    for (const row of rows) cmd('git', ['worktree', 'add', '-b', row.branch, row.worktree, base], repo);
    sandbox = await kit.createSandbox({ cwd: repo, branch: `sc/${m.name}-${runId}/integration`,
      sandbox: kit.docker({ imageName: m.image, mounts: [{ hostPath: workersPath, sandboxPath: workersPath }] }) });
  } catch (error) {
    for (const row of rows) row.state = 'setup-failed';
    state.endedAt = new Date().toISOString(); save(); emit('run', 'setup-failed');
    throw error;
  }
  let next = 0;
  const deadline = Date.now() + m.timeoutMinutes * 60_000;
  try {
    if ((await sandbox.exec('command -v timeout')).exitCode !== 0) fail('Image must provide timeout for bounded worker execution');
    await Promise.all(Array.from({ length: m.parallel }, async () => {
      while (next < m.workers.length) {
        const i = next++, w = m.workers[i], row = rows[i];
        if (Date.now() >= deadline || existsSync(join(dir, 'stop-all'))) { row.state = 'never-started'; save(); continue; }
        row.state = 'running'; row.startedAt = new Date().toISOString(); save(); emit(w.id, 'started');
        const workerDeadline = Math.min(deadline, Date.now() + w.timeoutMinutes * 60_000);
        let sessionId, prompt = `You are a worker, a leaf in an agent tree. Do not spawn agents by any mechanism. Ask your parent if another agent is needed. Read applicable AGENTS.md and CLAUDE.md. Discover and use relevant installed skills, including $typesafe-ai for bounded typed judgments where available.\nTask: ${w.prompt}\nScope: ${w.scope.join(', ')}\nAcceptance: ${w.acceptance}\nDo not merge, push, or widen scope. End your final answer with exactly one marker: NEEDS_PARENT_INPUT: <exact question> if you need an answer, or WORKER_DONE: <short result> after reporting changes, checks, remaining risks, and commits. Your parent's review decides acceptance.`;
        const provider = kit[w.agent === 'codex' ? 'codex' : 'claudeCode'](w.model, w.effort === 'default' ? {} : { effort: w.effort });
        try {
          for (let turn = 0; turn < w.maxTurns; turn++) {
            const remaining = Math.ceil((workerDeadline - Date.now()) / 1000);
            if (remaining <= 0 || existsSync(join(dir, 'stop-all'))) { row.state = 'timeout'; break; }
            if (state.turnsUsed >= m.maxTotalTurns) { row.state = 'budget-exhausted'; break; }
            state.turnsUsed++; save();
            const invocation = provider.buildPrintCommand({ prompt, dangerouslySkipPermissions: true, resumeSession: sessionId });
            let answer = '';
            const result = await sandbox.exec(`timeout ${remaining}s ${invocation.command}`, { cwd: row.worktree, stdin: invocation.stdin,
              onLine: line => { appendFileSync(join(dir, `${w.id}.log`), line + '\n', { mode: 0o600 });
                for (const item of provider.parseStreamLine(line)) {
                  if (item.type === 'session_id') sessionId = item.sessionId;
                  if (item.type === 'text' || item.type === 'result') answer += item.text ?? item.result ?? '';
                }
              } });
            row.sessionId = sessionId; row.exitCode = result.exitCode; save();
            if (result.exitCode !== 0) { row.state = result.exitCode === 124 ? 'timeout' : 'failed'; break; }
            const question = [...answer.matchAll(/NEEDS_PARENT_INPUT:\s*([^\n]+)/g)].at(-1);
            if (!question && /WORKER_DONE:\s*[^\n]+/.test(answer)) { row.state = 'pending-review'; break; }
            row.state = 'waiting-parent'; row.question = question?.[1] ?? 'No completion marker; inspect the worker log and give a follow-up instruction.'; save(); emit(w.id, 'waiting-parent');
            if (!sessionId) { row.state = 'blocked-no-session'; break; }
            const replyPath = join(dir, `${w.id}.reply.json`);
            while (!existsSync(replyPath) && Date.now() < workerDeadline && !existsSync(join(dir, 'stop-all'))) await new Promise(r => setTimeout(r, 1000));
            if (!existsSync(replyPath)) { row.state = Date.now() >= workerDeadline ? 'timeout' : 'cancelled'; break; }
            prompt = read(replyPath).answer; row.question = undefined; row.state = 'running'; save();
            // A reply file is consumed once; the manager must write a fresh answer for a later question.
            const { unlinkSync } = await import('node:fs'); unlinkSync(replyPath);
          }
          if (row.state === 'running') row.state = 'turn-limit';
        } catch (error) { row.state = 'failed'; writeFileSync(join(dir, `${w.id}.error.txt`), String(error?.stack ?? error), { mode: 0o600 }); }
        row.endedAt = new Date().toISOString(); save(); emit(w.id, row.state);
      }
    }));
  } finally {
    try { await sandbox.close(); }
    finally { state.endedAt = new Date().toISOString(); save(); emit('run', 'ended'); }
  }
  return state;
}

async function main(args) {
  const [verb, first, second, third] = args;
  if (verb === 'check' || verb === 'run') {
    if (!first || (verb === 'check' && second) || (verb === 'run' && !second)) fail('Usage: agent-sandbox check MANIFEST | run MANIFEST NEW_RUN_DIR');
    const m = validate(read(resolve(first)));
    const kit = await sdk();
    const { repo, base } = preflight(m);
    if (verb === 'check') { console.log(JSON.stringify({ ready: true, repo, base, workers: m.workers.length, image: m.image })); return; }
    const dir = resolve(second); mkdirSync(dir, { mode: 0o700 }); atomic(join(dir, 'manifest.json'), m);
    const result = await run(m, dir, kit, repo, base);
    if (result.workers.some(w => w.state !== 'pending-review')) process.exitCode = 1;
  } else if (verb === 'status' && first && !second) {
    const state = read(join(resolve(first), 'state.json'));
    let alive = false; try { process.kill(state.pid, 0); alive = true; } catch {}
    console.log(JSON.stringify({ ...state, supervisor: state.endedAt ? 'finished' : alive ? 'running' : 'lost' }, null, 2));
  } else if (verb === 'answer' && first && second && third) {
    const dir = resolve(first), state = read(join(dir, 'state.json'));
    const row = state.workers.find(w => w.id === second);
    if (!row || row.state !== 'waiting-parent' || !third.trim()) fail('Worker is not waiting for a non-empty parent answer');
    try { process.kill(state.pid, 0); } catch { fail('Runner is no longer alive; answer was not queued'); }
    const path = join(dir, `${second}.reply.json`);
    if (existsSync(path)) fail('An unanswered reply already exists');
    atomic(path, { answer: third });
    console.log('Answer queued for ' + second);
  } else if (verb === 'stop' && first && !second) {
    const dir = resolve(first); read(join(dir, 'state.json'));
    if (!existsSync(join(dir, 'stop-all'))) writeFileSync(join(dir, 'stop-all'), '', { flag: 'wx', mode: 0o600 });
    console.log('Stop requested; inspect status for terminal result');
  } else console.log('agent-sandbox check MANIFEST | run MANIFEST NEW_RUN_DIR | status RUN_DIR | answer RUN_DIR WORKER_ID MESSAGE | stop RUN_DIR');
}

main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
