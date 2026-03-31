# HA Disk Info Card - EN

[README](../README.md) | [UA](ua.md)

Custom Lovelace disk card with a vertical usage bar (%), temperature value + chart (`custom:mini-graph-card`), and configurable metrics.

## Requirements

- Home Assistant 2024.1+
- `custom:mini-graph-card`

## UI Configuration

Sections:
- Header
- Vertical Bar
- Temperature & Graph
- Metrics

Each metric requires:
- `title`
- `icon`
- at least one of: `entity` or `value_template`

## `value_template` (JS expression)

Available:
- `num('sensor.x')`
- `state('sensor.x')`
- `clamp(x, min, max)`
- `formatUptimeHours(h)`
- `percent_entity`
- `total_entity`
- `temperature_entity`

Example:

```text
num(total_entity) - (num(percent_entity) * num(total_entity)) / 100
```

## YAML Example

```yaml
type: custom:ha-disk-info
title: "System Disk"
percent_entity: sensor.my_disk_used_space_percent
temperature_entity: sensor.my_disk_temperature
total_entity: sensor.my_disk_total

barWidthPx: 55
zoneGreenTo: 79
zoneYellowTo: 89
zoneGreenColor: "#27ae60"
zoneYellowColor: "#f39c12"
zoneRedColor: "#c0392b"

temperatureThickness: thin
temperatureFontSize: 65
hoursToShow: 48
pointsPerHour: 3
graphHeight: 60
temperatureGraphType: bar
showExtrema: true
graphLineColor: "#e67e22"
```
