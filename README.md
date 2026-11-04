# OFD Staffing Guide

A job aid for the staffing officer: build the shift roster here, then enter it in TeleStaff.

**Live page:** https://dbromano.github.io/ofd-staffing-guide/

## What it does

- Imports the TeleStaff **Roster Report** XLSX for one shift (0800 to 0800).
- Shows every unit's crew, open seats and needs (officer, driver, paramedic, team letters, L).
- Suggests moves and exchanges between units, including ride-ups (an engineer as lieutenant, a firefighter with E or T as driver). Kelly Day openings are suggested last.
- Lets the officer move people by drag and drop, by tapping a name and then a seat, or from the candidate list.
- Produces a TeleStaff handoff sheet (print or CSV): removals, hour changes, moves, seats to fill by Kelly Day hiring, and needs to solve by moving people.

## Data and privacy

- Everything runs in the browser. The page makes no network requests, and the roster file is never uploaded.
- Saved rosters are kept in that browser on that device. Use **Download backup** to keep a copy or hand a roster to someone else.
- The built-in examples use anonymized members.

## Using it in a Teams channel

1. In the channel, click **+** and choose **Website**.
2. Name the tab "Staffing Guide", paste `https://dbromano.github.io/ofd-staffing-guide/`, and click **Save**.
3. If downloads or printing are blocked inside Teams, use the tab's **Open in browser**.

## Updating

The whole app is `index.html`. Replace it and push to `main`; GitHub Pages republishes within a minute or two. Saved rosters stay because the address doesn't change.

## Hosting setup (once)

Settings → Pages → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)` → Save.
