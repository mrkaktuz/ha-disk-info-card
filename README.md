# HA Disk Info Card

Кастомна Lovelace-картка для диска: вертикальна смуга заповнення (%), показ температури з міні-графіком (`custom:mini-graph-card`) та блок настроюваних характеристик (сутність або шаблон). Клік по смузі, температурі або характеристиці з обраною сутністю відкриває стандартну модалку Home Assistant (More info). Для рядка лише з шаблоном (без сутності) клік відкриває сутність бару (`percent_entity`).

## Вимоги

- **Home Assistant** з підтримкою **`getConfigForm`** (візуальний редактор; зазвичай **2023.6+**) та **`getGridOptions`** на картці для секцій типу **grid** (сучасні панелі керування).
- **custom:mini-graph-card** — для графіка температури. Без нього картка відобразить бар і метрики, але графік може бути недоступний.

## Встановлення (HACS)

Репозиторій з `hacs.json` у корені; після встановлення додайте ресурс і картку `custom:ha-disk-info`.

## Налаштування в UI

Редактор будує **Home Assistant** за схемою `getConfigForm()`. Поля згруповані блоками (**Заголовок**, **Вертикальний бар**, **Температура**, **Графік температури**, **Характеристики**).

У кожній **характеристиці** обов’язкові: **заголовок**, **іконка**, а також **хоча б одне** з полів **сутність** або **шаблон значення**. Перевірка виконується при збереженні (порожні комбіції дають помилку конфігурації).

Розмір шрифту **великого числа температури** в шапці картки налаштовується окремо; підписи min/max на міні-графіку використовують фіксований компактний розмір і не прив’язані до нього.

## Шаблон значення (`value_template`)

У полі **Шаблон значення** пишеться **один вираз JavaScript**, який обчислює те, що показується в картці. Під час виконання доступний об’єкт `ctx` з такими полями:

| У контексті | Опис |
|-------------|------|
| `num('sensor.x')` | Числовий стан сутності (`unknown` / `unavailable` → відсутнє значення) |
| `state('sensor.x')` | Сирий стан (рядок) |
| `clamp(x, min, max)` | Обмеження числа в діапазоні |
| `formatUptimeHours(h)` | Форматує години в рядок на кшталт `2 р 15 дн 8 год` (рік ≈ 8760 год) |
| `percent_entity` | Рядок id сутності % зайнятого (після авто-пошуку на картці) |
| `total_entity` | Рядок id «всього» з метрики з `id: total`, якщо така є |
| `temperature_entity` | Рядок id сутності температури |

Приклади (підставте свої `entity_id`):

**Вільне місце в ГБ** (загальний обсяг мінус зайняте за відсотком):

```text
num('sensor.disk_total') - (num('sensor.disk_used_space_percent') * num('sensor.disk_total')) / 100
```

Або через id, які картка вже підставила в шаблон (ті самі імена, що й ключі в таблиці вище):

```text
num(total_entity) - (num(percent_entity) * num(total_entity)) / 100
```

**Напрацювання в роках / днях / годинах** (стан сенсора в годинах):

```text
formatUptimeHours(num('sensor.disk_power_on_hours'))
```

Якщо потрібен лише текст без одиниць у шаблоні — залиште **Розмірність** порожньою або додайте її до рядка в шаблоні вручну.

## Приклад YAML

Мінімальний варіант:

```yaml
type: custom:ha-disk-info
```

Приклад з перевизначеннями:

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
  - id: used
    title: Зайнято
    icon: mdi:chart-pie
    entity: ""
    value_template: (num('sensor.my_disk_used_space_percent') * num('sensor.my_disk_total')) / 100
    unit: Гб
```

Поле `total_entity` у корені конфігу використовується лише коли список `metrics` порожній — тоді картка підставляє стандартні метрики «Всього» / «Зайнято».

## Параметри (довідка)

| Параметр | Опис |
|----------|------|
| `title` | Заголовок |
| `percent_entity` | Сутність % зайнятого (0–100) |
| `temperature_entity` | Сутність температури |
| `total_entity` | Лише для відновлення дефолтних `metrics`, якщо масив порожній |
| `barWidthPx` | Ширина бару (px) |
| `zoneGreenTo`, `zoneYellowTo` | Межі зеленої / жовтої зони (≤) |
| `zoneGreenColor`, `zoneYellowColor`, `zoneRedColor` | Кольори зон |
| `temperatureThickness` | `thin` / `normal` / `thick` |
| `temperatureFontSize` | Розмір шрифту **лише** великого значення температури в шапці |
| `hoursToShow`, `pointsPerHour` | Параметри міні-графіка |
| `graphHeight` | Висота графіка (px) |
| `graphLineColor` | Колір лінії / стовпчиків |
| `temperatureGraphType` | `bar` або `line` |
| `showExtrema` | Показ min/max на графіку |
| `metrics` | Масив характеристик (`id`, `title`, `icon`, `entity`, `value_template`, `unit`) |
