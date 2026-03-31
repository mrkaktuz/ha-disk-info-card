# HA Disk Info Card - UA

[README](../README.md) | [EN](en.md)

Кастомна Lovelace-картка диска: вертикальний бар зайнятого місця (%), показ температури з графіком (`custom:mini-graph-card`) і блок настроюваних характеристик.

## Вимоги

- Home Assistant 2024.1+
- `custom:mini-graph-card`

## Встановлення (HACS)

1. Додайте репозиторій `https://github.com/mrkaktuz/ha-disk-info-card` як `Dashboard`.
2. Встановіть `Disk Info Card`.
3. Оновіть кеш браузера.
4. Додайте картку `custom:ha-disk-info`.

## Налаштування в UI

Блоки:

- Заголовок
- Вертикальний бар
- Температура та графік
- Характеристики

Для кожної характеристики обов'язкові:

- `title`
- `icon`
- хоча б одне з: `entity` або `value_template`

## `value_template` (JS вираз)

Доступні:

- `num('sensor.x')`
- `state('sensor.x')`
- `clamp(x, min, max)`
- `formatUptimeHours(h)`
- `percent_entity`
- `total_entity`
- `temperature_entity`

Приклад:

```text
num(total_entity) - (num(percent_entity) * num(total_entity)) / 100
```

## YAML приклад

```yaml
type: custom:ha-disk-info
title: "Системний диск"
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
