# Module Checklist - Navio Cache

## Goal

Read Notion-owned project/task state through navio, normalize it locally, and
serve QS/core without making Notion a runtime dependency.

## Checklist

- [x] Resolve navio path.
- [x] Run schema reads for `Tasks`, `Projects`, `Work Log`, and `Time blocks`.
- [x] Capture JSON fixtures for tests.
- [ ] Query active projects.
- [x] Query bounded tasks.
- [x] Normalize task properties.
- [x] Normalize project properties.
- [x] Filter date/status locally.
- [x] Sort tasks: in progress, undone, done.
- [x] Cache last successful result.
- [x] Write error JSON on failure.
- [x] Poll every 5 minutes.
- [ ] Expose cache freshness in UI state.
- [x] Avoid printing secrets.
- [x] Unit test normalization.
- [x] Unit test stale-cache fallback.

## Challenges Met

- [x] Corrected direct Notion API assumption.
- [x] Confirmed navio is under `/home/marv/.openclaw/navio`.
- [x] Confirmed command shape uses `uv run navio`.
- [x] Confirmed QS should not be a Notion client.
- [x] Confirmed navio date filtering needs local verification/filtering.
- [x] Real navio cache run produced `14` projects, `200` tasks, `32` undone
  tasks, and no empty task titles.

## Open Decisions

- How to safely create or extend a Time Blocks Notion database through navio.
- Whether initial timeblock writeback should target existing `Time blocks` or
  wait for a richer database.
