# HA Disk Info Card

![HACS Custom](https://img.shields.io/badge/HACS-Custom-orange.svg)
![Release](https://img.shields.io/github/v/release/mrkaktuz/ha-disk-info-card)
![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2024.1%2B-blue.svg)
[![Stars](https://img.shields.io/github/stars/mrkaktuz/ha-disk-info-card?style=social)](https://github.com/mrkaktuz/ha-disk-info-card)

[UA документація](docs/ua.md) | [EN documentation](docs/en.md)

<!-- ![Card preview](images/card-preview.png) -->

Куди додати скріншот картки: `images/card-preview.png`

## Швидко

- Тип картки: `custom:ha-disk-info`
- Потрібно: `custom:mini-graph-card`
- Поточна документація:
  - [UA](docs/ua.md)
  - [EN](docs/en.md)

## Встановлення (HACS)

1. Додайте цей репозиторій у HACS як `Lovelace`.
2. Встановіть `HA Disk Info Card`.
3. Оновіть кеш браузера.
4. Додайте картку `custom:ha-disk-info`.
# HA Disk Info Card

![HACS Custom](https://img.shields.io/badge/HACS-Custom-orange.svg)
![Release](https://img.shields.io/github/v/release/mrkaktuz/ha-disk-info-card)
![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2024.1%2B-blue.svg)
[![Stars](https://img.shields.io/github/stars/mrkaktuz/ha-disk-info-card?style=social)](https://github.com/mrkaktuz/ha-disk-info-card)

---

## Українська (default)

Кастомна Lovelace-картка диска: вертикальний бар зайнятого місця (%), показ температури з графіком (`custom:mini-graph-card`) і блок настроюваних характеристик.

### Зображення картки

Додайте скріншот картки у файл `images/card-preview.png`.

Після цього розкоментуйте рядок:

`<!-- ![Card preview](images/card-preview.png) -->`

### Вимоги

- Home Assistant 2024.1+
- `custom:mini-graph-card`

### Встановлення (HACS)

1. Додайте цей репозиторій у HACS як `Lovelace`.
2. Встановіть `HA Disk Info Card`.
3. Оновіть кеш браузера.
4. Додайте картку `custom:ha-disk-info`.

### Налаштування в UI

Блоки налаштувань:
- **Заголовок**
- **Вертикальний бар**
- **Температура та графік**
- **Характеристики**

Для кожної характеристики обов'язкові:
- `title`
- `icon`
- хоча б одне з: `entity` або `value_template`

### `value_template` (JS вираз)

Доступний контекст:
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

### YAML приклад

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

metrics:
  - id: total
    title: Всього
    icon: mdi:harddisk
    entity: sensor.my_disk_total
    unit: Гб
  - id: used
    title: Зайнято
    icon: mdi:chart-pie
    value_template: (num('sensor.my_disk_used_space_percent') * num('sensor.my_disk_total')) / 100
    unit: Гб
```

---

## English

Custom Lovelace disk card with a vertical usage bar (%), temperature value + graph (`custom:mini-graph-card`), and configurable metrics.

### Card Image

Put your screenshot here: `images/card-preview.png`.

Then uncomment:

`<!-- ![Card preview](images/card-preview.png) -->`

### Requirements

- Home Assistant 2024.1+
- `custom:mini-graph-card`

### Install (HACS)

1. Add this repository as `Lovelace` in HACS.
2. Install `HA Disk Info Card`.
3. Refresh browser cache.
4. Add card type `custom:ha-disk-info`.

### UI Configuration

Config sections:
- **Header**
- **Vertical Bar**
- **Temperature & Graph**
- **Metrics**

Each metric requires:
- `title`
- `icon`
- at least one of: `entity` or `value_template`

### `value_template` (JS expression)

Available helpers:
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
