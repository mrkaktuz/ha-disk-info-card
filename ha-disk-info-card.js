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
  total_entity: DEFAULT_ENTITY.total,

  barWidthPx: 55,
  barMinHeightPx: 0,

  zoneGreenTo: 79,
  zoneYellowTo: 89,
  zoneGreenColor: '#27ae60',
  zoneYellowColor: '#f39c12',
  zoneRedColor: '#c0392b',

  temperatureThickness: 'thin',
  temperatureFontSize: 65,

  hoursToShow: 48,
  pointsPerHour: 3,
  hour24: true,
  graphHeight: 60,
  temperatureGraphType: 'bar',
  showExtrema: true,

  graphLineColor: '#e67e22',
};

function getDefaultMetrics(percentEntity, totalEntity) {
  return [
    {
      id: 'total',
      title: 'Всього',
      icon: 'mdi:harddisk',
      entity: totalEntity || DEFAULT_ENTITY.total,
      value_template: '',
      unit: 'Гб',
    },
    {
      id: 'used',
      title: 'Зайнято',
      icon: 'mdi:chart-pie',
      entity: '',
      value_template: `(num('${percentEntity}') * num('${totalEntity}')) / 100`,
      unit: 'Гб',
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

const MINI_GRAPH_FONT_SCALE = 100;

function formatUptimeHours(totalHours) {
  if (totalHours == null || totalHours === '') return '';
  const n = Number(totalHours);
  if (!Number.isFinite(n) || n < 0) return '';
  let h = Math.floor(n);
  const y = Math.floor(h / 8760);
  h %= 8760;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  const parts = [];
  if (y > 0) parts.push(`${y} р`);
  if (d > 0) parts.push(`${d} дн`);
  parts.push(`${hr} год`);
  return parts.join(' ');
}

const DISK_INFO_LABELS = {
  title: 'Заголовок картки',
  percent_entity: 'Сутність % зайнятого (0–100)',
  barWidthPx: 'Ширина бару (px)',
  zoneGreenTo: 'Поріг зеленої зони (≤)',
  zoneYellowTo: 'Поріг жовтої зони (≤)',
  zoneGreenColor: 'Колір зеленої зони',
  zoneYellowColor: 'Колір жовтої зони',
  zoneRedColor: 'Колір червоної зони',
  temperature_entity: 'Сутність температури',
  temperatureThickness: 'Товщина цифри температури',
  temperatureFontSize: 'Розмір шрифту значення температури (px)',
  hoursToShow: 'Годин історії на графіку',
  pointsPerHour: 'Точок на годину',
  graphHeight: 'Висота графіка (px)',
  graphLineColor: 'Колір лінії / стовпчиків',
  temperatureGraphType: 'Тип графіка',
  showExtrema: 'Показувати min/max',
  metrics: 'Характеристики',
};

const DISK_INFO_CONFIG_FORM = {
  schema: [
    {
      type: 'expandable',
      name: 'disksec_head',
      flatten: true,
      title: 'Заголовок',
      schema: [{ name: 'title', required: true, selector: { text: {} } }],
    },
    {
      type: 'expandable',
      name: 'disksec_bar',
      flatten: true,
      title: 'Вертикальний бар',
      schema: [
        { name: 'percent_entity', required: true, selector: { entity: {} } },
        {
          type: 'grid',
          name: '',
          schema: [
            { name: 'barWidthPx', selector: { number: { min: 8, max: 200, mode: 'box' } } },
            { name: 'zoneGreenTo', selector: { number: { min: 0, max: 100, mode: 'box' } } },
          ],
        },
        { name: 'zoneYellowTo', selector: { number: { min: 0, max: 100, mode: 'box' } } },
        {
          type: 'grid',
          name: '',
          schema: [
            { name: 'zoneGreenColor', selector: { text: { type: 'color' } } },
            { name: 'zoneYellowColor', selector: { text: { type: 'color' } } },
          ],
        },
        { name: 'zoneRedColor', selector: { text: { type: 'color' } } },
      ],
    },
    {
      type: 'expandable',
      name: 'disksec_temp',
      flatten: true,
      title: 'Температура та графік',
      schema: [
        { name: 'temperature_entity', required: true, selector: { entity: {} } },
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
          name: 'temperatureFontSize',
          selector: { number: { min: 12, max: 120, mode: 'box' } },
        },
        {
          type: 'grid',
          name: '',
          schema: [
            { name: 'hoursToShow', selector: { number: { min: 1, max: 168, mode: 'box' } } },
            { name: 'pointsPerHour', selector: { number: { min: 1, max: 60, mode: 'box' } } },
          ],
        },
        { name: 'graphHeight', selector: { number: { min: 20, max: 400, mode: 'box' } } },
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
      ],
    },
    {
      type: 'expandable',
      name: 'disksec_metrics',
      flatten: true,
      title: 'Характеристики',
      schema: [
        {
          name: 'metrics',
          selector: {
            object: {
              multiple: true,
              label_field: 'title',
              fields: {
                title: { label: 'Заголовок', required: true, selector: { text: {} } },
                icon: { label: 'Іконка', required: true, selector: { icon: {} } },
                entity: { label: 'Сутність', selector: { entity: {} } },
                value_template: {
                  label: 'Шаблон значення (JS)',
                  selector: { text: { multiline: true } },
                },
                unit: { label: 'Розмірність', selector: { text: {} } },
              },
            },
          },
        },
      ],
    },
  ],
  assertConfig(config) {
    const m = config?.metrics;
    if (!Array.isArray(m)) return;
    for (let i = 0; i < m.length; i++) {
      const row = m[i];
      if (!row || typeof row !== 'object') continue;
      const title = row.title && String(row.title).trim();
      const icon = row.icon && String(row.icon).trim();
      const ent = row.entity && String(row.entity).trim();
      const tpl = row.value_template && String(row.value_template).trim();
      if (!title && !icon && !ent && !tpl) continue;
      if (!title) {
        throw new Error(`Характеристика ${i + 1}: вкажіть заголовок`);
      }
      if (!icon) {
        throw new Error(`Характеристика ${i + 1}: вкажіть іконку`);
      }
      if (!ent && !tpl) {
        throw new Error(`Характеристика ${i + 1}: потрібна сутність або шаблон значення`);
      }
    }
  },
  computeLabel(schema) {
    const n = schema.name;
    if (n && DISK_INFO_LABELS[n]) return DISK_INFO_LABELS[n];
    return n || '';
  },
  computeHelper() {
    return '';
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
    this._layout = undefined;
    this._preview = false;
    this.attachShadow({ mode: 'open' });
  }

  get layout() {
    return this._layout;
  }

  set layout(v) {
    this._layout = v;
  }

  get preview() {
    return this._preview;
  }

  set preview(v) {
    this._preview = !!v;
  }

  getGridOptions() {
    return {
      columns: 12,
      min_columns: 6,
      rows: 'auto',
      min_rows: 4,
      max_rows: 16,
    };
  }

  static getStubConfig() {
    return {
      type: 'custom:ha-disk-info',
      ...structuredClone(DEFAULTS),
      metrics: getDefaultMetrics(DEFAULT_ENTITY.percent, DEFAULT_ENTITY.total),
    };
  }

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
        graph_entity: m?.graph_entity != null ? String(m.graph_entity) : '',
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
        grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
        gap: 10px;
        width: 100%;
      }
      .metricBtn {
        appearance: none; border: 1px solid rgba(120,120,120,0.1); border-radius: 12px;
        background: rgba(120,120,120,0.06); padding: 10px; min-width: 0; cursor: pointer;
        display: flex; align-items: center; gap: 10px; width: 100%;
        box-sizing: border-box;
      }
      .metricBtn[data-empty="1"] { cursor: default; opacity: 0.65; }
      .metricIcon { width: 22px; color: var(--primary-text-color); flex: 0 0 22px; }
      .metricText { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; align-items: flex-start; overflow: hidden; }
      .metricPrimary {
        font-size: 13px; font-weight: 600;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
      }
      .metricSecondary {
        font-size: 12px; opacity: 0.65;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
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
      font_size: MINI_GRAPH_FONT_SCALE,
      line_color: cfg.graphLineColor,
      group: false,
      show: {
        graph: graphType,
        fill: 'fade',
        points: graphType === 'bar' ? false : 'hover',
        extrema: !!cfg.showExtrema,
        legend: false,
        icon: false,
        name: false,
        state: false,
        labels: !!cfg.showExtrema,
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
        `const { num, state, clamp, formatUptimeHours, percent_entity, total_entity, temperature_entity } = ctx; return (${s});`
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

  _renderMetrics(ctx) {
    if (!this._metricsContainerEl) return;
    const cfg = this._config;
    const metrics = Array.isArray(cfg.metrics) ? cfg.metrics : [];

    const items = metrics.map((m) => {
      const title = (m.title ?? m.name ?? '').toString();
      const icon = (m.icon ?? 'mdi:information-outline').toString();
      const unit = (m.unit ?? '').toString();
      const entityId = (m.entity ?? '').toString().trim();
      const tpl = (m.value_template ?? '').toString();
      const graphEntity = (m.graph_entity ?? '').toString().trim();

      let primary = '—';
      if (tpl) {
        const v = this._evalTemplate(tpl, ctx);
        primary = this._formatMetricValue(v, unit);
      } else if (entityId) {
        const n = this._getNumberState(entityId);
        if (n !== null) primary = this._formatMetricValue(n, unit);
        else primary = this._getState(entityId) ?? '—';
      }

      let modalEntity = graphEntity || entityId;
      if (!modalEntity && tpl) modalEntity = ctx.percent_entity || '';

      return { title, icon, primary, modalEntity };
    });

    this._metricsContainerEl.innerHTML = items
      .map(
        (m) => `
      <button class="metricBtn" type="button" data-graph-entity="${escapeHtml(
        m.modalEntity
      )}" data-empty="${m.modalEntity ? '0' : '1'}">
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
        if (btn.getAttribute('data-empty') === '1') return;
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
      formatUptimeHours,
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
