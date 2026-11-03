# Dead Drop SQL

A 1v1 investigation game played with SQL. Both agents are given a cover identity — a real citizen in a randomly generated city database. Intel on your rival arrives every 35 seconds, starting obscure (needs JOINs and GROUP BY) and getting easier. Query the records and file a warrant with your rival's full name or citizen ID before they unmask you. A wrong warrant locks you out for 20 seconds and hands your rival bonus intel.

Play online against a friend (share the four-letter case code or invite link) or solo against a bot (Rookie, Detective or Inspector).

## Run locally
```
npm start
```
Then open http://localhost:3000.

## How it works
- Fully static: GitHub Pages serves `index.html` and `engine.js`.
- SQL runs in each player's browser with sql.js (SQLite compiled to WebAssembly).
- Online play is peer-to-peer over WebRTC using PeerJS. The player who opens the case runs it in their browser (`engine.js`), so they must keep the tab open. PeerJS's free broker only introduces the two browsers.
- Bot games run entirely in your browser.

## Tuning
In `engine.js`:
- `CLUE_INTERVAL_MS`, `WRONG_LOCKOUT_MS` — pacing
- `HARD_COUNT` and the bands in `buildClues` — how fast the rival can be pinned down (tuned so it usually narrows to one person at clue 5)
- `BOTS` — bot think time, how many suspects it will gamble between, and how many of its newest clues it lags behind
