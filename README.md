# HA Disk Info Card

Кастомна Lovelace-картка для диска: вертикальна смуга заповнення (%), показ температури з міні-графіком (`custom:mini-graph-card`) та блок настроюваних характеристик (сутність або шаблон). Клік по смузі, температурі або характеристиці відкриває стандартну модалку Home Assistant (More info) з історією для відповідної сутності.

## Вимоги

- **custom:mini-graph-card** — для графіка температури. Без нього картка відобразить бар і метрики, але графік може бути недоступний.

## Встановлення (HACS)

Репозиторій з `hacs.json` у корені; після встановлення додайте ресурс і картку `custom:ha-disk-info`.

## Налаштування в UI

Редактор розбитий на блоки:

1. **Заголовок** — текст (за замовчуванням «Диск»).
2. **Вертикальний бар** — сутність відсотка зайнятого місця (0–100), ширина, пороги зон і кольори.
3. **Температура та графік** — сутність температури, товщина цифри, розмір шрифту, години/точки, висота графіка, тип (стовпчики/лінія), min/max.
4. **Характеристики** — список метрик: сутність або JS-шаблон значення, заголовок, іконка (`ha-icon-picker`, якщо є), розмірність, окрема сутність для графіка в модалці.

За замовчуванням підставляються типові імена сутностей (`sensor.disk_used_space_percent`, `sensor.disk_temperature`, `sensor.disk_total`); якщо сутність з таким id є в системі, вона використовується, інакше виконується спроба знайти схожу за суфіксом/ключовими словами.

## Приклад YAML

Мінімальний варіант (решта — дефолти з картки):

```yaml
type: custom:ha-disk-info
```

Повний приклад з перевизначеннями:

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

metrics:
  - id: total
    title: Всього
    icon: mdi:harddisk
    entity: sensor.my_disk_total
    value_template: ""
    unit: Гб
    graph_entity: ""
  - id: used
    title: Зайнято
    icon: mdi:chart-pie
    entity: ""
    value_template: (num('sensor.my_disk_used_space_percent') * num('sensor.my_disk_total')) / 100
    unit: Гб
    graph_entity: sensor.my_disk_used_space_percent
```

### Шаблон значення (`value_template`)

Вираз JavaScript з контекстом `ctx`: функції `num(id)`, `state(id)`, `clamp`; також поля `percent_entity`, `total_entity`, `temperature_entity` (рядки entity id після резолву на картці).

## Параметри (довідка)

| Параметр | Опис |
|----------|------|
| `title` | Заголовок |
| `percent_entity` | Сутність % зайнятого (0–100) |
| `temperature_entity` | Сутність температури |
| `total_entity` | Використовується при відновленні дефолтного списку `metrics` |
| `barWidthPx` | Ширина бару (px) |
| `zoneGreenTo`, `zoneYellowTo` | Верх меж зеленої / жовтої зони (≤) |
| `zoneGreenColor`, `zoneYellowColor`, `zoneRedColor` | Кольори зон |
| `temperatureThickness` | `thin` / `normal` / `thick` |
| `temperatureFontSize` | Розмір цифри температури та шрифту на графіку |
| `hoursToShow`, `pointsPerHour` | Параметри міні-графіка |
| `graphHeight` | Висота графіка (px) |
| `temperatureGraphType` | `bar` або `line` |
| `showExtrema` | Показ min/max на графіку |
| `metrics` | Масив характеристик |
