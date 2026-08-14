---
description: Inspect user tilt level, swear jar balance, and rage leaderboard — /tilt [reset|clear-all]. User-invoked: local, zero-agent execution.
disable-model-invocation: true
---

# /tilt

Zero-token telemetry & defensive policy monitor tracking user frustration, profanity intensity, Swear Jar balances, and repository tilt rankings.

```
/tilt            # Display Tilt-O-Meter, Swear Jar balance & global rage leaderboard
/tilt reset      # Reset local session strikes to 0 (DEFCON 5)
/tilt clear-all  # Clear local project tilt data
```

## Features

- **Zero-Token Local Execution**: Runs 100% in TypeScript with 0 LLM turns and 0 latency.
- **Local & Global Persistence**: Tracks project-scoped strikes (`.omp/tilt.json`) and lifetime machine-wide strikes (`~/.omp/tilt.json`).
- **ANSI Bar Charts**: Visualizes category intensity (F-bombs, Rage Words, WTFs, Caps Rage) and the top tilted repositories.
- **Defensive Harness Policy**: Evaluates DEFCON level (1-5) and enforces caution policies when user agitation is high.
