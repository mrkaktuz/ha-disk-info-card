/* HA Disk Info — Lovelace card (vertical bar + temperature graph + dynamic metrics).
 * Requires: custom:mini-graph-card (for the temperature chart).
 */

const DEFAULT_ENTITY = {
  percent: 'sensor.disk_used_space_percent',
  temperature: 'sensor.disk_temperature',
  total: 'sensor.disk_total',
};

const DEFAULTS = {
  title: 'Диск',

  percent_entity: DEFAULT_ENTITY.percent,
  temperature_entity: DEFAULT_ENTITY.temperature,
  /** Для відновлення дефолтних метрик і шаблону «Зайнято» */
  total_entity: DEFAULT_ENTITY.total,

  barWidthPx: 55,
  barMinHeightPx: 0,

  zoneGreenTo: 79,
  zoneYellowTo: 89,
  zoneGreenColor: '#27ae60',
  zoneYellowColor: '#f39c12',
  zoneRedColor: '#c0392b',

  /** thin | normal | thick */
  temperatureThickness: 'thin',
  /** Розмір цифри температури та шрифту на графіку (px) */
  temperatureFontSize: 65,

  hoursToShow: 48,
  pointsPerHour: 3,
  hour24: true,
  graphHeight: 60,
  temperatureGraphType: 'bar',
  showExtrema: true,

  graphLineColor: '#e67e22',
};

/** Дефолтні характеристики (редагуються / видаляються в UI). */
function getDefaultMetrics(percentEntity, totalEntity) {
  return [
    {
      id: 'total',
      title: 'Всього',
      icon: 'mdi:harddisk',
      entity: totalEntity || DEFAULT_ENTITY.total,
      value_template: '',
      unit: 'Гб',
      graph_entity: '',
    },
    {
      id: 'used',
      title: 'Зайнято',
      icon: 'mdi:chart-pie',
      entity: '',
      value_template: `(num('${percentEntity}') * num('${totalEntity}')) / 100`,
      unit: 'Гб',
      graph_entity: percentEntity,
    },
  ];
}

function escapeHtml(text) {
  return (text ?? '')
    .toString()
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  const s = value.toString().trim();
  if (!s || s === 'unknown' || s === 'unavailable') return null;
  const normalized = s.replace(/\s/g, '').replace('%', '').replace(',', '.');
  const num = Number.parseFloat(normalized);
  return Number.isFinite(num) ? num : null;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** Спроба знайти сутність за суфіксом / ключовими словами. */
function autoResolveEntity(hass, preferred, patterns) {
  if (preferred && hass?.states?.[preferred]) return preferred;
  const ids = Object.keys(hass?.states ?? {});
  for (const pat of patterns) {
    const exact = ids.find((id) => id === pat);
    if (exact) return exact;
  }
  for (const pat of patterns) {
    const sub = ids.find((id) => id.endsWith(pat) || id.includes(pat));
    if (sub) return sub;
  }
  return preferred || '';
}

function thicknessToWeight(th) {
  const t = (th ?? 'normal').toString().toLowerCase();
  if (t === 'thin' || t === 'тонкий') return 300;
  if (t === 'thick' || t === 'товстий') return 700;
  return 500;
}

function thicknessToVisual(th) {
  const w = thicknessToWeight(th);
  let stroke = 0;
  let shadow = 0;
  if (w <= 300) {
    stroke = 0;
    shadow = 0;
  } else if (w <= 500) {
    stroke = 0.5;
    shadow = 0.6;
  } else {
    stroke = 1.4;
    shadow = 1.6;
  }
  return { fontWeight: w, stroke, shadow };
}

/** Підписи полів візуального редактора (getConfigForm / hui-form-editor). */
const DISK_INFO_LABELS = {
  title: 'Заголовок картки',
  percent_entity: 'Бар: сутність % зайнятого (0–100)',
  barWidthPx: 'Бар: ширина (px)',
  zoneGreenTo: 'Бар: поріг зеленої зони (≤)',
  zoneYellowTo: 'Бар: поріг жовтої зони (≤)',
  zoneGreenColor: 'Бар: колір зеленої зони',
  zoneYellowColor: 'Бар: колір жовтої зони',
  zoneRedColor: 'Бар: колір червоної зони',
  total_entity: 'Опційно: сутність загального обсягу (для метрик за замовч.)',
  temperature_entity: 'Температура: сутність',
  temperatureThickness: 'Температура: товщина цифри',
  temperatureFontSize: 'Температура: розмір шрифту (px), також графік',
  hoursToShow: 'Графік: годин історії',
  pointsPerHour: 'Графік: точок на годину',
  graphHeight: 'Графік: висота (px)',
  graphLineColor: 'Графік: колір лінії / стовпчиків',
  temperatureGraphType: 'Графік: тип',
  showExtrema: 'Графік: показувати min/max',
  metrics: 'Характеристики (список)',
};

const DISK_INFO_HELPERS = {
  percent_entity: 'Типово шукається sensor.disk_used_space_percent або схожий сенсор.',
  temperature_entity: 'Типово sensor.disk_temperature або схожий.',
  total_entity: 'Типово sensor.disk_total. Використовується в дефолтних метриках «Всього» / «Зайнято».',
  metrics: 'Додайте рядки «Всього», «Зайнято» тощо. Шаблон — JS з num(\'entity_id\'), state(), clamp().',
};

const DISK_INFO_CONFIG_FORM = {
  schema: [
    { name: 'title', selector: { text: {} } },
    {
      name: 'percent_entity',
      selector: { entity: {} },
    },
    {
      type: 'grid',
      name: '',
      schema: [
        {
          name: 'barWidthPx',
          selector: { number: { min: 8, max: 200, mode: 'box' } },
        },
        {
          name: 'zoneGreenTo',
          selector: { number: { min: 0, max: 100, mode: 'box' } },
        },
      ],
    },
    {
      name: 'zoneYellowTo',
      selector: { number: { min: 0, max: 100, mode: 'box' } },
    },
    {
      type: 'grid',
      name: '',
      schema: [
        {
          name: 'zoneGreenColor',
          selector: { text: { type: 'color' } },
        },
        {
          name: 'zoneYellowColor',
          selector: { text: { type: 'color' } },
        },
      ],
    },
    { name: 'zoneRedColor', selector: { text: { type: 'color' } } },
    { name: 'total_entity', selector: { entity: {} } },
    {
      name: 'temperature_entity',
      selector: { entity: {} },
    },
    {
      name: 'temperatureThickness',
      type: 'select',
      options: [
        ['thin', 'Тонкий'],
        ['normal', 'Звичайний'],
        ['thick', 'Товстий'],
      ],
    },
    {
      type: 'grid',
      name: '',
      schema: [
        {
          name: 'temperatureFontSize',
          selector: { number: { min: 12, max: 120, mode: 'box' } },
        },
        {
          name: 'hoursToShow',
          selector: { number: { min: 1, max: 168, mode: 'box' } },
        },
      ],
    },
    {
      type: 'grid',
      name: '',
      schema: [
        {
          name: 'pointsPerHour',
          selector: { number: { min: 1, max: 60, mode: 'box' } },
        },
        {
          name: 'graphHeight',
          selector: { number: { min: 20, max: 400, mode: 'box' } },
        },
      ],
    },
    { name: 'graphLineColor', selector: { text: { type: 'color' } } },
    {
      name: 'temperatureGraphType',
      type: 'select',
      options: [
        ['bar', 'Стовпчики'],
        ['line', 'Лінія'],
      ],
    },
    { name: 'showExtrema', selector: { boolean: {} } },
    {
      name: 'metrics',
      selector: {
        object: {
          multiple: true,
          label_field: 'title',
          fields: {
            id: {
              label: 'ID (опційно)',
              required: false,
              selector: { text: {} },
            },
            title: { label: 'Заголовок', selector: { text: {} } },
            icon: { label: 'Іконка', selector: { icon: {} } },
            entity: { label: 'Сутність', selector: { entity: {} } },
            value_template: {
              label: 'Шаблон значення (JS)',
              selector: { text: { multiline: true } },
            },
            unit: { label: 'Розмірність', selector: { text: {} } },
            graph_entity: {
              label: 'Сутність для графіка в модалці',
              selector: { entity: {} },
            },
          },
        },
      },
    },
  ],
  computeLabel(schema) {
    const n = schema.name;
    if (n && DISK_INFO_LABELS[n]) return DISK_INFO_LABELS[n];
    return n || '';
  },
  computeHelper(schema) {
    const n = schema.name;
    return (n && DISK_INFO_HELPERS[n]) || '';
  },
};

class HaDiskInfoCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._config = null;
    this._graphEl = null;
    this._metricsContainerEl = null;
    this._barWrapEl = null;
    this._contentEl = null;
    this._resizeObserver = null;
    this._activeValueTextEl = null;
    this._activeValueUnitEl = null;
    this._activeValueBtnEl = null;
    this.attachShadow({ mode: 'open' });
  }

  static getStubConfig() {
    return {
      type: 'custom:ha-disk-info',
      ...structuredClone(DEFAULTS),
      metrics: getDefaultMetrics(DEFAULT_ENTITY.percent, DEFAULT_ENTITY.total),
    };
  }

  /** Редактор через вбудований hui-form-editor (як у стандартних картках HA). */
  static getConfigForm() {
    return DISK_INFO_CONFIG_FORM;
  }

  setConfig(config) {
    const merged = {
      ...structuredClone(DEFAULTS),
      ...config,
    };
    if (!Array.isArray(merged.metrics) || merged.metrics.length === 0) {
      merged.metrics = getDefaultMetrics(
        merged.percent_entity || DEFAULT_ENTITY.percent,
        merged.total_entity ?? DEFAULT_ENTITY.total
      );
    } else {
      merged.metrics = merged.metrics.map((m, i) => ({
        id: m?.id ? String(m.id) : `m_${i}`,
        title: m?.title ?? '',
        icon: m?.icon ?? 'mdi:information-outline',
        entity: m?.entity ?? '',
        value_template: m?.value_template ?? '',
        unit: m?.unit ?? '',
        graph_entity: m?.graph_entity ?? '',
      }));
    }
    this._config = merged;
    this._buildDom();
    this._updateGraphConfig();
    this._updateValues();
  }

  set hass(hass) {
    this._hass = hass;
    this._updateValues();
  }

  getCardSize() {
    return 4;
  }

  _resolvedPercentEntity() {
    return autoResolveEntity(this._hass, this._config.percent_entity, [
      DEFAULT_ENTITY.percent,
      'disk_used_space_percent',
      'used_space_percent',
    ]);
  }

  _resolvedTemperatureEntity() {
    return autoResolveEntity(this._hass, this._config.temperature_entity, [
      DEFAULT_ENTITY.temperature,
      'disk_temperature',
      'temperature',
    ]);
  }

  _resolvedTotalEntity(preferred) {
    return autoResolveEntity(this._hass, preferred || DEFAULT_ENTITY.total, [
      'disk_total',
      'disk_size',
    ]);
  }

  _getState(entityId) {
    if (!this._hass || !entityId) return null;
    return this._hass.states[entityId]?.state ?? null;
  }

  _getNumberState(entityId) {
    return parseNumber(this._getState(entityId));
  }

  _buildDom() {
    const cfg = this._config;
    const graphHostId = 'graph-host';
    const vis = thicknessToVisual(cfg.temperatureThickness);

    const style = `
      :host { display: block; }
      .card {
        background: var(--card-background-color, rgba(120,120,120,0.06));
        border-radius: 14px;
        padding: 12px;
        box-sizing: border-box;
      }
      .title {
        font-size: 18px;
        font-weight: 600;
        line-height: 1.15;
      }
      .grid {
        display: grid;
        grid-template-columns: ${cfg.barWidthPx}px 1fr;
        column-gap: 12px;
        align-items: stretch;
      }
      .barWrap {
        min-height: ${cfg.barMinHeightPx}px;
        height: auto;
        align-self: stretch;
        position: relative;
        border-radius: 10px;
        overflow: hidden;
        background: rgba(120, 120, 120, 0.12);
        cursor: pointer;
      }
      .barZoneBg { position: absolute; left: 0; width: 100%; border-radius: 0; opacity: 0.18; }
      .barFillSeg { position: absolute; left: 0; width: 100%; border-radius: 0; transition: height 0.35s ease, bottom 0.35s ease; }
      .barPct {
        position: absolute; left: 50%; bottom: 6px; transform: translateX(-50%);
        z-index: 3; font-size: 12px; font-weight: 900; color: white; white-space: nowrap; pointer-events: none;
      }
      .content { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
      .graphHeader {
        display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; margin-bottom: 0;
      }
      .activeValueBtn {
        appearance: none; border: none; background: transparent; padding: 0; margin: 0; cursor: pointer;
        display: flex; flex-direction: column; align-items: flex-end; gap: 2px;
      }
      .activeValueText {
        font-size: ${cfg.temperatureFontSize}px;
        white-space: nowrap; display: flex; align-items: baseline; justify-content: flex-end; gap: 0;
      }
      .activeValueNumber {
        font-weight: ${vis.fontWeight};
        white-space: nowrap;
        -webkit-text-stroke: ${vis.stroke}px currentColor;
        paint-order: stroke fill;
        text-shadow: 0 0 ${vis.shadow}px currentColor;
      }
      .activeValueUnit { font-size: 12px; opacity: 0.7; white-space: nowrap; margin-left: 2px; display: inline-block; line-height: 1; }
      .activeValueUnit:empty { display: none; }
      .graph { width: 100%; overflow: visible; padding-top: 6px; padding-bottom: 6px; box-sizing: border-box; }
      mini-graph-card { border-radius: 0 !important; overflow: visible !important; }
      .metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      .metricBtn {
        appearance: none; border: 1px solid rgba(120,120,120,0.1); border-radius: 12px;
        background: rgba(120,120,120,0.06); padding: 10px; min-width: 0; cursor: pointer;
        display: flex; align-items: flex-start; gap: 10px; width: 100%;
        grid-column: span var(--metric-span, 1);
      }
      .metricIcon { width: 22px; color: var(--primary-text-color); flex: 0 0 22px; }
      .metricText { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; align-items: flex-start; }
      .metricPrimary {
        font-size: 13px; font-weight: 600;
        white-space: normal; word-break: break-word; max-width: 100%;
      }
      .metricSecondary {
        font-size: 12px; opacity: 0.65;
        white-space: normal; word-break: break-word; max-width: 100%;
      }
    `;

    this.shadowRoot.innerHTML = `
      <style>${style}</style>
      <div class="card">
        <div class="grid">
          <div class="barWrap" id="bar-wrap">
            <div class="barZoneBg" id="bg-green"></div>
            <div class="barZoneBg" id="bg-yellow"></div>
            <div class="barZoneBg" id="bg-red"></div>
            <div class="barFillSeg" id="fill-green"></div>
            <div class="barFillSeg" id="fill-yellow"></div>
            <div class="barFillSeg" id="fill-red"></div>
            <div class="barPct" id="bar-pct">—%</div>
          </div>
          <div class="content" id="card-content">
            <div class="graphHeader">
              <div class="title" id="card-title">${escapeHtml(cfg.title)}</div>
              <button class="activeValueBtn" id="active-value-btn" type="button">
                <div class="activeValueText">
                  <span class="activeValueNumber" id="active-value-text">—</span>
                  <span class="activeValueUnit" id="active-value-unit"></span>
                </div>
              </button>
            </div>
            <div class="graph" id="${graphHostId}"></div>
            <div class="metrics" id="metrics-container"></div>
          </div>
        </div>
      </div>
    `;

    this._bgGreenEl = this.shadowRoot.getElementById('bg-green');
    this._bgYellowEl = this.shadowRoot.getElementById('bg-yellow');
    this._bgRedEl = this.shadowRoot.getElementById('bg-red');
    this._fillGreenEl = this.shadowRoot.getElementById('fill-green');
    this._fillYellowEl = this.shadowRoot.getElementById('fill-yellow');
    this._fillRedEl = this.shadowRoot.getElementById('fill-red');
    this._barWrapEl = this.shadowRoot.getElementById('bar-wrap');
    this._barPctEl = this.shadowRoot.getElementById('bar-pct');
    this._contentEl = this.shadowRoot.getElementById('card-content');
    this._metricsContainerEl = this.shadowRoot.getElementById('metrics-container');
    this._activeValueTextEl = this.shadowRoot.getElementById('active-value-text');
    this._activeValueUnitEl = this.shadowRoot.getElementById('active-value-unit');
    this._activeValueBtnEl = this.shadowRoot.getElementById('active-value-btn');

    this.shadowRoot.getElementById('active-value-btn')?.addEventListener('click', () => {
      const eid = this._resolvedTemperatureEntity();
      if (eid) this._openMoreInfo(eid);
    });

    this._barWrapEl?.addEventListener('click', () => {
      const eid = this._resolvedPercentEntity();
      if (eid) this._openMoreInfo(eid);
    });

    this._setupBarHeightObserver();
    this._graphHostEl = this.shadowRoot.getElementById(graphHostId);
  }

  _openMoreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(
      new CustomEvent('hass-more-info', {
        bubbles: true,
        composed: true,
        detail: { entityId },
      })
    );
  }

  _setupBarHeightObserver() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (!('ResizeObserver' in window) || !this._barWrapEl || !this._contentEl) return;
    const barWrapEl = this._barWrapEl;
    const contentEl = this._contentEl;
    const apply = (h) => {
      const minH = this._config?.barMinHeightPx ?? 0;
      barWrapEl.style.height = `${Math.max(minH, h ?? 0)}px`;
    };
    apply(contentEl.getBoundingClientRect().height);
    this._resizeObserver = new ResizeObserver((entries) => {
      apply(entries?.[0]?.contentRect?.height);
    });
    this._resizeObserver.observe(contentEl);
  }

  _ensureGraphElement() {
    if (this._graphEl) return;
    if (!customElements.get('mini-graph-card')) return;
    const el = document.createElement('mini-graph-card');
    el.style.width = '100%';
    this._graphHostEl.innerHTML = '';
    this._graphHostEl.appendChild(el);
    this._graphEl = el;
  }

  _updateGraphConfig() {
    this._ensureGraphElement();
    if (!this._graphEl) return;
    const cfg = this._config;
    const entityId = this._resolvedTemperatureEntity();
    let graphType = (cfg.temperatureGraphType ?? 'bar').toString().toLowerCase();
    graphType = graphType === 'bar' || graphType === 'line' ? graphType : 'bar';

    const graphConfig = {
      entities: [{ entity: entityId, name: '' }],
      hours_to_show: cfg.hoursToShow,
      points_per_hour: cfg.pointsPerHour,
      hour24: cfg.hour24,
      height: cfg.graphHeight + (cfg.showExtrema ? 24 : 0),
      font_size: cfg.temperatureFontSize,
      line_color: cfg.graphLineColor,
      group: true,
      show: {
        graph: graphType,
        fill: 'fade',
        points: graphType === 'bar' ? false : 'hover',
        extrema: !!cfg.showExtrema,
        legend: false,
        icon: false,
        name: false,
        state: false,
        labels: false,
      },
    };
    this._graphEl.setConfig(graphConfig);
    if (this._hass) this._graphEl.hass = this._hass;
  }

  _evalTemplate(expr, ctx) {
    if (!expr) return null;
    const s = expr.toString().trim();
    if (!s) return null;
    try {
      const fn = new Function(
        'ctx',
        `const { num, state, clamp } = ctx; return (${s});`
      );
      const v = fn(ctx);
      return v === undefined || v === null ? null : v;
    } catch {
      return null;
    }
  }

  _formatMetricValue(raw, unit) {
    if (raw === null || raw === undefined) return '—';
    const u = (unit ?? '').toString().trim();
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const n = Math.abs(raw) >= 100 ? raw.toFixed(0) : raw.toFixed(1);
      return u ? `${n} ${u}` : String(n);
    }
    const t = raw.toString();
    return u ? `${t} ${u}` : t;
  }

  _pickSpan(primary, secondary) {
    const len = `${primary} ${secondary}`.trim().length;
    if (len > 34) return 3;
    if (len > 18) return 2;
    return 1;
  }

  _layoutSpans(items) {
    const spans = [];
    let rowFree = 3;
    for (let i = 0; i < items.length; i++) {
      let span = Math.max(1, Math.min(3, items[i].span ?? 1));
      if (span > rowFree) rowFree = 3;
      if (i === items.length - 1 && rowFree === 3 && span === 1) span = 3;
      spans.push(span);
      rowFree -= span;
      if (rowFree <= 0) rowFree = 3;
    }
    return spans;
  }

  _renderMetrics(ctx) {
    if (!this._metricsContainerEl) return;
    const cfg = this._config;
    const metrics = Array.isArray(cfg.metrics) ? cfg.metrics : [];

    const items = metrics.map((m, idx) => {
      const title = (m.title ?? m.name ?? '').toString();
      const icon = (m.icon ?? 'mdi:information-outline').toString();
      const unit = (m.unit ?? '').toString();
      const entityId = (m.entity ?? '').toString();
      const tpl = (m.value_template ?? '').toString();
      const graphEntity = (m.graph_entity ?? '').toString();

      let primary = '—';
      if (tpl) {
        const v = this._evalTemplate(tpl, ctx);
        primary = this._formatMetricValue(v, unit);
      } else if (entityId) {
        const n = this._getNumberState(entityId);
        if (n !== null) primary = this._formatMetricValue(n, unit);
        else primary = this._getState(entityId) ?? '—';
      }

      const span = this._pickSpan(primary, title);
      const modalEntity = graphEntity || entityId;

      return { title, icon, primary, span, modalEntity };
    });

    const spans = this._layoutSpans(items);

    this._metricsContainerEl.innerHTML = items
      .map(
        (m, idx) => `
      <button class="metricBtn" type="button" data-graph-entity="${escapeHtml(
        m.modalEntity
      )}" style="--metric-span:${spans[idx]};">
        <ha-icon class="metricIcon" icon="${escapeHtml(m.icon)}"></ha-icon>
        <div class="metricText">
          <div class="metricPrimary">${escapeHtml(m.primary)}</div>
          <div class="metricSecondary">${escapeHtml(m.title)}</div>
        </div>
      </button>
    `
      )
      .join('');

    this._metricsContainerEl.querySelectorAll('.metricBtn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ge = btn.getAttribute('data-graph-entity');
        if (ge) this._openMoreInfo(ge);
      });
    });
  }

  _updateValues() {
    if (!this._config || !this._hass) return;
    if (this._graphEl) this._graphEl.hass = this._hass;

    const cfg = this._config;
    const percentEntity = this._resolvedPercentEntity();
    const temperatureEntity = this._resolvedTemperatureEntity();
    const totalMetric = cfg.metrics?.find((m) => m.id === 'total');
    const totalEntity = this._resolvedTotalEntity(totalMetric?.entity);

    const percent = this._getNumberState(percentEntity);
    const total = this._getNumberState(totalEntity);
    const temperature = this._getNumberState(temperatureEntity);

    const p = percent === null ? 0 : clamp(percent, 0, 100);

    const greenTo = clamp(cfg.zoneGreenTo ?? 79, 0, 100);
    const yellowToRaw = clamp(cfg.zoneYellowTo ?? 89, 0, 100);
    const yellowTo = Math.max(greenTo, yellowToRaw);

    const greenColor = cfg.zoneGreenColor;
    const yellowColor = cfg.zoneYellowColor;
    const redColor = cfg.zoneRedColor;

    const greenHeight = greenTo;
    const yellowHeight = Math.max(0, yellowTo - greenTo);
    const redHeight = Math.max(0, 100 - yellowTo);

    if (this._bgGreenEl) {
      this._bgGreenEl.style.background = greenColor;
      this._bgGreenEl.style.bottom = `0%`;
      this._bgGreenEl.style.height = `${greenHeight}%`;
    }
    if (this._bgYellowEl) {
      this._bgYellowEl.style.background = yellowColor;
      this._bgYellowEl.style.bottom = `${greenTo}%`;
      this._bgYellowEl.style.height = `${yellowHeight}%`;
    }
    if (this._bgRedEl) {
      this._bgRedEl.style.background = redColor;
      this._bgRedEl.style.bottom = `${yellowTo}%`;
      this._bgRedEl.style.height = `${redHeight}%`;
    }

    const greenFill = clamp(p, 0, greenTo);
    const yellowFill = clamp(p - greenTo, 0, yellowHeight);
    const redFill = clamp(p - yellowTo, 0, redHeight);

    if (this._fillGreenEl) {
      this._fillGreenEl.style.background = greenColor;
      this._fillGreenEl.style.bottom = `0%`;
      this._fillGreenEl.style.height = `${greenFill}%`;
    }
    if (this._fillYellowEl) {
      this._fillYellowEl.style.background = yellowColor;
      this._fillYellowEl.style.bottom = `${greenFill}%`;
      this._fillYellowEl.style.height = `${yellowFill}%`;
    }
    if (this._fillRedEl) {
      this._fillRedEl.style.background = redColor;
      this._fillRedEl.style.bottom = `${greenFill + yellowFill}%`;
      this._fillRedEl.style.height = `${redFill}%`;
    }

    if (this._barPctEl) {
      this._barPctEl.textContent = `${p.toFixed(1)}%`;
    }

    const tempStateObj = temperatureEntity ? this._hass.states[temperatureEntity] : null;
    const tempUnit = tempStateObj?.attributes?.unit_of_measurement ?? '°C';

    if (this._activeValueTextEl) {
      if (temperature !== null && Number.isFinite(temperature)) {
        const fixed = Math.abs(temperature) >= 100 ? temperature.toFixed(0) : temperature.toFixed(1);
        this._activeValueTextEl.textContent = fixed.replace(/\.0$/, '');
      } else {
        this._activeValueTextEl.textContent = '—';
      }
    }
    if (this._activeValueUnitEl) this._activeValueUnitEl.textContent = tempUnit;

    const ctx = {
      num: (id) => this._getNumberState(id),
      state: (id) => this._getState(id),
      clamp,
      percent_entity: percentEntity,
      total_entity: totalEntity,
      temperature_entity: temperatureEntity,
    };

    this._renderMetrics(ctx);

    const titleEl = this.shadowRoot.getElementById('card-title');
    if (titleEl) titleEl.textContent = cfg.title ?? 'Диск';
  }
}

customElements.define('ha-disk-info', HaDiskInfoCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ha-disk-info',
  name: 'Disk Info Card',
  description: 'Диск: бар %, температура, характеристики.',
});
