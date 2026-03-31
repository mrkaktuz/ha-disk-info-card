# AGENTS.md

## Project

`ha-disk-info` is a Home Assistant Lovelace custom card.

Main file:
- `ha-disk-info-card.js`

Metadata:
- `hacs.json`
- `README.md`
- `CHANGELOG.md`

## Goals

- Keep the card stable in both dashboard runtime and HA visual editor.
- Prefer backward-compatible config changes.
- Keep YAML and UI editor behavior aligned.

## Coding Rules

- Use plain JavaScript (no build step).
- Avoid breaking existing config keys.
- Keep defaults in `DEFAULTS` and form labels in `DISK_INFO_LABELS`.
- When changing form schema, update README and changelog in the same PR.
- Keep comments short and only where they add real context.

## Release Checklist

1. Update `hacs.json` version.
2. Update `CHANGELOG.md`.
3. Validate card in Home Assistant:
   - card renders,
   - UI editor saves,
   - bar/temperature/metrics click opens more-info,
   - graph and extrema render.
4. Commit, push, create git tag `vX.Y.Z`.
5. Publish GitHub release for the same tag.

## Notes for AI Agents

- Do not remove compatibility fields without migration path.
- Treat `metrics` rows carefully: blank rows can appear in UI editors.
- If touching graph settings, verify min/max visibility (`showExtrema`).
