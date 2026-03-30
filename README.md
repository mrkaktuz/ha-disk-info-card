# HA Disk Info Card

Універсальна кастомна Lovelace-картка для відображення інформації про диск:

- вертикальна смуга заповнення (used %)
- temperature графік (через `custom:mini-graph-card`, якщо доступний)
- тип графіка температури (`temperatureGraphType`: `line` або `bar`)
- SMART статус
- напрацювання (uptime в годинах з форматуванням років/днів/годин)
- клік по показниках відкриває стандартну More Info модалку відповідної сутності
- кастомні характеристики: довільна кількість, іконка/назва/сутність, опціональний `value_template`

## Вимоги

Картка намагається використовувати `custom:mini-graph-card` для графіка температури. Якщо `mini-graph-card` недоступний, картка все одно відобразиться (бар + SMART + напрацювання), але графік може не показуватись.

## Встановлення (HACS)

Якщо ви встановлюєте через HACS, достатньо завантажити репозиторій і переконатися, що в корені є `hacs.json`.

## Конфігурація

Початковий формат:

```yaml
type: custom:ha-disk-info
title: "Системний диск (nvme0)"
subtitle: "NVMe"

percent_entity: sensor.home_server_disk
total_entity: sensor.home_server_disk_total

temperature_entity: sensor.home_server_built_in_nvme0_temperature
smart_entity: sensor.home_server_built_in_nvme0_smart_test_result
uptime_hours_entity: sensor.home_server_built_in_nvme0_power_on_hours

# додатково (опційно)
totalUnit: "GB"
graphHeight: 60
graphFontSize: 60
hoursToShow: 24
pointsPerHour: 4
barWidthPx: 44
barMinHeightPx: 180
```

### Як обчислюються значення

- `percent_entity` — це **used %** (0..100). Для заповнення смуги і для обчислення тексту `used / total`.
- `total_entity` — загальна ємність в одиницях `totalUnit` (наприклад, GB).
- `uptime_hours_entity` — напрацювання в **годинах**.
- `smart_entity` — рядковий результат SMART (наприклад `Passed`, `Failed`).

### SMART: passed/failed

За замовчуванням використовується список `smartPassStrings`: `["passed", "pass", "ok"]`.
Клік по SMART викликає відображення історії цієї сутності; для нечісливих станів можна задати `smartStateMap`.

Приклад:

```yaml
smartPassStrings: ["passed"]
smartStateMap:
  - value: "passed"
    label: "Passed"
  - value: "failed"
    label: "Failed"
```

## Події (кліки)

За замовчуванням:

- клік по характеристиці відкриває More Info модалку для її сутності
- клік по лівому бару/проценту відкриває More Info модалку `percent_entity`

Також, якщо `openHistoryOnClick: true`, клік відкриває стандартний More Info модальний діалог для відповідної сутності (з історією/графіком всередині). За поведінку відповідає `historyClickMode` (за замовчуванням `more-info`).

## Параметри (коротко)

Нижче найбільш корисні (є і інші, але це базові):

- `title`
- `percent_entity`, `total_entity`
- `temperature_entity`
- `smart_entity`
- `uptime_hours_entity`
- `graphHeight`, `graphFontSize`
- `hoursToShow`, `pointsPerHour`
- `barWidthPx`
- `temperatureGraphType` (`line`/`bar`)
- `zoneGreenTo`, `zoneYellowTo` (пороги заповнення)
- `zoneGreenColor`, `zoneYellowColor`, `zoneRedColor` (кольори зон)
- `totalUnit`
- `smartPassStrings`, `smartStateMap`
- `openHistoryOnClick` (default `true`)
- `historyClickMode` (`more-info` або `history-page`, default `more-info`)
- `historyPath` (default `/history`, використовується лише коли `historyClickMode: history-page`)
- `metrics` (масив характеристик для динамічного відображення)

