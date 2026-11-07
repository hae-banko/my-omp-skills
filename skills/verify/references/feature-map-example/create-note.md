# Create a note

Create note lets a user save a titled note from the browser or CLI, cancel an unfinished draft, and confirm the saved note from a second user-facing view.

## Sub-features

- `create-open` opens a blank editor from each browser entry point.
- `create-save` persists a title and body.
- `create-cancel` discards an unfinished browser draft.
- `create-cli` creates the same note shape from the terminal.

## How to get to it (user POV)

- Choose the `New note` button in the browser toolbar.
- Press `n` in the browser while focus is outside an editable field.
- Run `notes create [title] [body]` in a terminal.

## Driving it with control-notes

Preconditions:

- Notes is healthy at `http://127.0.0.1:4173`.
- No note is titled `Release checklist`.
- Doctor check reports the expected URL and disposable data directory.

- **Open editor:** Choose `New note`. Click element with role `button` and name `New note`. A form named `Note editor` appears with focus in the `Title` textbox.
- **Enter content:** Type title and body. Fill textbox `Title` with `Release checklist` and textbox `Body` with `Tag and publish`. The `Save note` button becomes enabled.
- **Save note:** Choose `Save note`. Click button `Save note`. A status named `Note saved` appears and the heading reads `Release checklist`.
- **Confirm persistence:** Return to the note list and reopen the note. Click link `All notes` and click link `Release checklist`. The editor shows both saved values.
- **Cancel draft:** Open a new note, enter `Discard me`, and choose `Cancel`. The note list returns and has no `Discard me` link.
- **CLI entry:** Create a second note from terminal. Run `notes create "CLI note" "Created from terminal" format json`. Exit code `0` and stdout contain the new note ID and title.
- **Proof:** Reopen both saved notes from `All notes`. Capture ARIA snapshot to `artifacts/create-note/list.aria.txt` and screenshot to `artifacts/create-note/list.png`. Both artifacts show `Release checklist` and `CLI note`.

## Gotchas

- Pressing `n` while a textbox has focus types the character instead of opening a new editor.
- Titles are trimmed on save. Assert the rendered title, not the draft input value.
- A save status alone is insufficient proof. Reopen the note from the list.
- Remove `Release checklist` and `CLI note` during fixture cleanup, but retain their proof artifacts.
