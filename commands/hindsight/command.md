Hindsight — a settle-time reflection pass, user-invoked via `/hindsight`.

While Hindsight is on, after each turn that did real work, the model gets one
hidden reflection pass before the turn settles. The nudge, with its own
thinking traces in context:

> While reasoning about this, did you face challenges or hit walls that would
> be greatly simplified by design-level changes? Look back at your own
> thinking and your tool results, and revise your answer if a design-level
> change would help.

The idea (from a viral tweet about Fable): the first answer is often the
locally-optimal path the model committed to early. One enforced reflection
pass at the settle moment catches the cases where a design-level change would
have made the whole approach simpler.

## How it works

- **Toggle**: `/hindsight` (bare, toggles), `/hindsight on`, or `/hindsight off`.
  The toggle is handled by the extension; the model's job is just to follow
  the hidden nudge when it arrives and keep the user informed.
- **Once per turn**: a turn that was already a reflection pass is never
  nudged again; the runtime's continuation cap is never approached.
- **Only real work**: turns that used tools, or reasoned substantially, get
  the pass. Trivial turns (acknowledgments, one-liners) pass through
  untouched.
- **Never in subagents**: background task agents and research workers are not
  interrupted.
- **The output**: the reflection turn leads with a one-line "On reflection…"
  note when it revises; when the answer stands, it says so in one line and
  stops.
