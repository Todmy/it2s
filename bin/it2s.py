"""it2s — iTerm2 session control for agents (Claude Code / Codex).
  it2s list                    all sessions: id | job | title   (* = this session)
  it2s read <id|substr> [N]    last N non-empty screen lines (default 40)
  it2s send <id|substr> <text> type text + Enter into that session
  it2s wait <id|substr> <regex> [timeout_s]   block until regex appears on screen (prefix ! = until it disappears)
  it2s key <id|substr> esc|enter|ctrl-c       send a control key
  it2s status                  one table: name | agent | state | idle | waiting | last message  (registry + live)
  it2s alerts [idle_min=15]    only problems: permission, error, input-wait, idle>N, dead. Exit 1 if any.
  it2s spawn <name> <cmd...>   new tab, cd to cwd, run cmd, register purpose/parent; prints session id
  it2s launch <name> claude|codex <model> <effort> <task-file> [cwd]   supervised interactive agent
  it2s tag <id|substr> key=value ...   set registry fields (purpose, name, parent)
Match = full id or substring of id / title / job name. Never matches itself for send.
"""
import iterm2, os, re, sys, time, asyncio, json, shlex
ME = os.environ.get("ITERM_SESSION_ID", "").split(":")[-1]

async def rows(app):
    out = []
    for w in app.terminal_windows:
        for t in w.tabs:
            for s in t.sessions:
                job = await s.async_get_variable("jobName") or "-"
                name = await s.async_get_variable("session.name") or "-"
                out.append((s, job, name))
    return out

async def resolve(app, q, allow_self=False):
    for s, job, name in await rows(app):
        if q == s.session_id or (q.lower() in f"{s.session_id} {job} {name}".lower() and (allow_self or s.session_id != ME)):
            return s
    sys.exit(f"no session matching '{q}'")

async def screen(s, n):
    c = await s.async_get_screen_contents()
    lines = [c.line(i).string.rstrip() for i in range(c.number_of_lines)]
    lines = [l for l in lines if l]
    return lines[-n:]

REG = os.path.expanduser("~/.local/state/it2s/sessions.json")
def load_reg():
    try: return json.load(open(REG))
    except Exception: return {}
def save_reg(reg):
    os.makedirs(os.path.dirname(REG), exist_ok=True)
    tmp = REG + ".tmp"; json.dump(reg, open(tmp, "w"), indent=1, ensure_ascii=False); os.replace(tmp, REG)
def mins_since(ts):
    if not ts: return None
    try: return int((time.time() - time.mktime(time.strptime(ts, "%Y-%m-%dT%H:%M:%S"))) / 60)
    except Exception: return None
PERM = re.compile(r"Do you want to|Allow .*\?|Yes, and don|\(y/n\)|Approve|Proceed\?|esc to cancel", re.I)
ERR = re.compile(r"Traceback \(most recent|^Error:|FAILED|fatal:|panic:|Uncaught|ECONNREFUSED", re.M)

async def snapshot(app, reg):
    rows_ = []
    for s, job, name in await rows(app):
        r = reg.get(s.session_id, {})
        try: scr = "\n".join(await screen(s, 40))
        except Exception: scr = ""
        agent = r.get("agent") or ("codex" if job == "codex" else "claude" if re.match(r"\d+\.\d+", job or "") else "shell")
        busy = "esc to interrupt" in scr
        waiting = r.get("waiting", "")
        if not busy and PERM.search(scr[-1200:]): waiting = "permission"
        tail8 = "\n".join(scr.split("\n")[-8:]); m = ERR.search(tail8)
        err = r.get("error", "") or ("screen:" + m.group(0) if m and not busy else "")
        state = "busy" if busy else ("waiting:" + waiting if waiting else "idle")
        idle = mins_since(r.get("last_event_at"))
        rows_.append(dict(id=s.session_id, me=s.session_id == ME, name=r.get("name") or name, agent=agent, state=state,
                          idle=idle, waiting_text=r.get("waiting_text", ""), error=err, purpose=r.get("purpose", ""),
                          parent=r.get("parent", "")[:8], cwd=r.get("cwd", ""), last=r.get("last_message", "")[:90].replace("\n", " ")))
    live = {x["id"] for x in rows_}
    for sid, r in reg.items():
        if sid not in live and r.get("agent") and not r.get("ended_at"):
            rows_.append(dict(id=sid, me=False, name=r.get("name", sid[:8]), agent=r["agent"], state="dead", idle=mins_since(r.get("last_event_at")),
                              waiting_text="", error="session gone without SessionEnd", purpose=r.get("purpose", ""), parent="", cwd=r.get("cwd", ""), last=r.get("last_message", "")[:90]))
    return rows_

def print_table(rs):
    print(f"{'ID':8} {'NAME':32} {'AGENT':6} {'STATE':18} {'IDLE':>5}  LAST / WAITING / ERROR")
    for x in rs:
        tail = x["error"] or x["waiting_text"] or x["last"]
        print(f"{('*' if x['me'] else '') + x['id'][:8]:8} {x['name'][:32]:32} {x['agent']:6} {x['state'][:18]:18} {str(x['idle'] if x['idle'] is not None else '-')+'m':>5}  {tail[:70]}")

async def main(conn):
    app = await iterm2.async_get_app(conn)
    cmd, a = (sys.argv[1] if len(sys.argv) > 1 else ""), sys.argv[2:]
    if cmd == "list":
        for s, job, name in await rows(app):
            print(f"{'*' if s.session_id == ME else ''}{s.session_id}\t{job}\t{name}")
    elif cmd == "read":
        s = await resolve(app, a[0]); print("\n".join(await screen(s, int(a[1]) if len(a) > 1 else 40)))
    elif cmd == "send":
        s = await resolve(app, a[0]); await s.async_send_text(" ".join(a[1:]))
        await asyncio.sleep(0.3); await s.async_send_text("\r"); print("sent")   # text and Enter apart: Codex TUI drops them when combined
    elif cmd == "key":   # it2s key <match> esc|enter|ctrl-c
        s = await resolve(app, a[0]); k = {"esc": "\x1b", "enter": "\r", "ctrl-c": "\x03"}[a[1]]; await s.async_send_text(k); print("sent " + a[1])
    elif cmd == "wait":
        s = await resolve(app, a[0]); neg = a[1].startswith("!"); pat = re.compile(a[1].lstrip("!")); deadline = time.time() + (float(a[2]) if len(a) > 2 else 300)
        while time.time() < deadline:
            txt = "\n".join(await screen(s, 60))
            if bool(pat.search(txt)) != neg: print(txt[-1500:]); break
            await asyncio.sleep(2)
        else: sys.exit("timeout")
    elif cmd == "status":
        print_table(await snapshot(app, load_reg()))
    elif cmd == "alerts":
        lim = int(a[0]) if a else 15
        bad = [x for x in await snapshot(app, load_reg()) if not x["me"] and x["agent"] != "shell" and
               (x["state"].startswith("waiting") or x["state"] == "dead" or x["error"] or (x["state"] == "idle" and x["idle"] is not None and x["idle"] >= lim))]
        if bad: print_table(bad); sys.stdout.flush(); os._exit(1)
        print("no alerts")
    elif cmd in ("spawn", "launch"):
        if cmd == "launch":
            if len(a) not in (5, 6): sys.exit("usage: it2s launch <name> claude|codex <model> <effort> <task-file> [cwd]")
            if not ME: sys.exit("launch needs an iTerm parent session to own the child")
            name, agent, model, effort, task_file = a[:5]
            cwd = os.path.realpath(a[5] if len(a) == 6 else os.getcwd())
            task_file = os.path.realpath(task_file)
            if agent not in ("claude", "codex") or not os.path.isfile(task_file) or not os.path.isdir(cwd):
                sys.exit("launch requires an agent, existing task file, and existing cwd")
            if os.stat(task_file).st_mode & 0o077:
                sys.exit("launch task file must be private (chmod 600)")
            if agent == "claude" and not (cwd == os.path.expanduser("~/lumina") or cwd.startswith(os.path.expanduser("~/lumina/"))):
                sys.exit("Claude account outside ~/lumina is not verified by it2s-quota; choose an explicit account/mechanism")
            if agent == "claude":
                argv = [os.path.expanduser("~/lumina/lumina-claude/lumina-claude"), "interactive", "--model", model,
                        "--prompt-file", task_file, "-C", cwd]
                if effort != "default": argv.extend(["--effort", effort])
                cmdline = shlex.join(argv)
            else:
                prompt = '"$(cat ' + shlex.quote(task_file) + ')"'
                argv = ["codex", "--model", model, "--config", "model_reasoning_effort=" + json.dumps(effort)]
                cmdline = shlex.join(argv) + " " + prompt
        else:
            if len(a) < 2: sys.exit("usage: it2s spawn <name> <cmd...>")
            name, cmdline, cwd, agent = a[0], " ".join(a[1:]), os.getcwd(), ""
        win = app.current_terminal_window or app.terminal_windows[0]
        tab = await win.async_create_tab(); s = tab.current_session
        await s.async_set_name(name)
        reg = load_reg(); reg[s.session_id] = dict(name=name, purpose=(task_file if cmd == "launch" else cmdline),
            parent=ME, cwd=cwd, agent=agent, model=(model if cmd == "launch" else ""),
            effort=(effort if cmd == "launch" else ""), first_seen=time.strftime("%Y-%m-%dT%H:%M:%S"))
        save_reg(reg)
        await asyncio.sleep(1.0)                      # let the shell start
        await s.async_send_text(f"cd {shlex.quote(cwd)} && {cmdline}"); await asyncio.sleep(0.3); await s.async_send_text("\r")
        print(s.session_id)
    elif cmd == "tag":
        s = await resolve(app, a[0], allow_self=True); reg = load_reg(); r = reg.setdefault(s.session_id, {})
        for kv in a[1:]:
            k, _, v = kv.partition("="); r[k] = v
        save_reg(reg); print("tagged " + s.session_id[:8] + " " + json.dumps({k: r[k] for k in [kv.partition("=")[0] for kv in a[1:]]}, ensure_ascii=False))
    else:
        print(__doc__); sys.exit(1)
    sys.stdout.flush(); os._exit(0)   # skip the 10 s websocket-close wait

try:
    iterm2.run_until_complete(main)
except SystemExit:
    raise
except Exception as e:          # transient "Connection Invalid" from the iTerm2 API: retry once
    time.sleep(1); sys.stderr.write(f"retry after: {e}\n"); iterm2.run_until_complete(main)
