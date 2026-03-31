# Changelog

All notable changes to this project are documented in this file.

## [0.7.5] - 2026-03-31

- Fixed mini-graph extrema values (`min/max`) not rendering by disabling grouped mode for temperature chart.
- Simplified root `README.md` and added direct language links at the top (UA/EN).
- Moved full documentation into `docs/ua.md` and `docs/en.md`, linked from README.

## [0.7.4] - 2026-03-31

- Merged UI editor blocks `Температура (показник)` and `Графік температури` into a single section `Температура та графік`.
- Fixed mini-graph min/max visibility by enabling graph labels when extrema are enabled.
- Cleaned up redundant comments and small dead-weight text in card source.
- Added `CHANGELOG.md`, `AGENTS.md`, and bilingual `README.md` (UA/EN, UA default).

## [0.7.3] - 2026-03-31

- Fixed runtime crash: `this._pickSpan is not a function`.
- Restored metrics rendering compatibility after CSS auto-fit refactor.
- Restored `graph_entity` compatibility for YAML metric rows.
- Restored fixed mini-graph font size behavior.

## [0.7.2] - 2026-03-30

- Added `getGridOptions()` for modern Lovelace grid sections.
- Added `layout` and `preview` properties expected by `hui-card`.
- Relaxed config assertion for empty metric rows in the form editor.

## [0.7.1] - 2026-03-30

- Switched metrics layout to CSS grid auto-fit.
- Improved click behavior and modal entity handling.
- Removed outdated span-based metric layout logic.
- Updated editor grouping and docs.

## [0.7.0] - 2026-03-30

- Introduced `getConfigForm()` based visual editor (`ha-form` style).
- Improved Home Assistant entity field integration.

## [0.6.2] - 2026-03-30

- Fixed editor initialization timing (`setConfig` before `connectedCallback`).
- Stabilized DOM build lifecycle in HA editor mode.

## [0.6.1] - 2026-03-30

- Fixed entity picker behavior by adjusting editor DOM strategy.

## [0.6.0] - 2026-03-30

- Added default metrics behavior and simplified configuration flow.
- Updated documentation and configuration examples.

## [0.5.0] - 2026-03-30

- Added dynamic custom metrics and improved card layout options.

## [0.2.1] - 2026-03-30

- Version bump and incremental bug fixes.

## [0.2.0 and earlier]

- Initial implementation of the custom card.
- Base UI/UX, i18n text updates, editor UX improvements.
- Added modal opening on bar click and iterative graph/extrema tweaks.
