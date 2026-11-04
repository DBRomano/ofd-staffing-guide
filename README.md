# OFD Staffing Guide

A job aid for the staffing officer: build the shift roster here, then enter it in TeleStaff.

**Live page:** https://dbromano.github.io/ofd-staffing-guide/

## What it does

- Imports the TeleStaff **Roster Report** XLSX for one shift (0800 to 0800).
- **Open FOB PDF** reads the text-based, landscape OFD roster. Review DIV1 rovers and ORSA exclusions, then use the PDF as a starting roster or compare it with a same-date roster and its approved moves. The rank code supplies EMT/paramedic status. A separate qualification letter P supplies ride-up priority.
- Shows every unit's crew, open seats and needs (officer, driver, paramedic, team letters, L).
- **Auto-build** works out a whole-shift plan in one click: officer, driver, paramedic and team needs first, then open seats, Kelly Day openings last, using the fewest moves and never leaving a new gap on the unit a member comes from. Approve all of it, one move at a time, or skip moves and rebuild.
- Suggests moves and exchanges between units, including ride-ups (an engineer as lieutenant, a firefighter with E or T as driver). Kelly Day openings are suggested last.
- Staffing rules built in:
  - Only floating (rover) lieutenants and engineers are moved between units. Assigned officers stay on their units, except an engineer may move within the same station to balance paramedics.
  - An engineer can ride up as lieutenant; a firefighter can drive with E (engines and rescues) or T (towers, Hazmat 1, Heavy Rescue 1). Members with P get first call on ride-ups.
  - A seat left by a Kelly Day member takes a ride-up only when an extra fills the seat left behind (firefighters to engineer first, as few as possible); otherwise it is hired at that rank. Seats marked for hiring are held top-down.
  - Team letters A, D and H: 3 is the minimum, 4 is preferred. The preferred count, and a paramedic other than the lieutenant, are met with extras and swaps only, never by hiring.
- Shift trades (STW) and Kelly swaps (KSON) are flagged, because the roster shows them with the rank of the position they fill. The officer can set a member's own rank for the shift.
- Lets the officer move people by drag and drop, by tapping a name and then a seat, or from the candidate list.
- Produces a TeleStaff handoff sheet (print or CSV): removals, hour changes, moves, seats to fill by Kelly Day hiring, and needs to solve by moving people.

## Data and privacy

- Everything runs in the browser. The browser loads the PDF reader from this site. Roster files stay on the device.
- Saved rosters are kept in that browser on that device. Use **Download backup** to keep a copy or hand a roster to someone else.
- The built-in examples use anonymized members.

## Using it in a Teams channel

1. In the channel, click **+** and choose **Website**.
2. Name the tab "Staffing Guide", paste `https://dbromano.github.io/ofd-staffing-guide/`, and click **Save**.
3. If downloads or printing are blocked inside Teams, use the tab's **Open in browser**.

## Updating

Keep `index.html`, `fob-roster.mjs` and `vendor/` together on the web host. PDF support uses the bundled Mozilla PDF.js 5.6.205 reader and worker under the license in `vendor/LICENSE`. GitHub Pages publishes from `main`. Saved rosters stay because the address doesn't change.

## Hosting setup (once)

Settings → Pages → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)` → Save.

## Tests

The tests load `index.html` in Node and exercise Auto-Build and the FOB reader. Node 21 or later:

```bash
node --test "tests/*"
```
