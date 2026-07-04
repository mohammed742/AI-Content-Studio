---
name: Long builds from the bash tool
description: How to run pnpm/next builds that exceed the 120s bash timeout without them dying silently.
---

The web artifact's `next build` takes ~4–5 minutes here (dev server also running), which exceeds the bash tool's 120s cap.

**Why:** A synchronous run exits with code -1 (timeout kill). Backgrounding with `nohup ... &` also dies silently — the child is killed when the tool's shell exits, leaving no log file.

**How to apply:** Detach with `setsid sh -c '<cmd> > /tmp/build.log 2>&1; echo "EXIT:$?" >> /tmp/build.log' < /dev/null &`, then poll the log across subsequent bash calls until the `EXIT:` marker appears. Also note: output may stay silent (just the pnpm header) for minutes before the route table prints all at once — a quiet log doesn't mean a dead build; check `pgrep -f "next build"`.
