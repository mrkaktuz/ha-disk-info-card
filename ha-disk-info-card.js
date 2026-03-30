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

  static getConfigElement() {
    return document.createElement('ha-disk-info-card-editor');
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

// ------------------------- Editor -------------------------
class HaDiskInfoCardEditor extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._config = null;
    /** Щоб не перезаписати metrics порожнім масивом до першого _renderMetricEditors */
    this._metricsEditorRendered = false;
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; padding: 8px; max-width: 100%; }
        .section { margin-bottom: 16px; padding: 12px; border: 1px solid var(--divider-color); border-radius: 12px; }
        .sectionTitle { font-weight: 600; margin-bottom: 10px; }
        .row { display: grid; grid-template-columns: 1fr; gap: 10px; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .hint { font-size: 12px; opacity: 0.75; }
        select {
          width: 100%; padding: 10px; border-radius: 12px;
          border: 1px solid var(--divider-color);
          background: var(--card-background-color); color: var(--primary-text-color);
          font: inherit; box-sizing: border-box;
        }
        .btn {
          border: 1px solid var(--divider-color); border-radius: 10px;
          background: var(--card-background-color); color: var(--primary-text-color);
          padding: 8px 10px; cursor: pointer; width: 100%;
        }
        .metricRow { border: 1px dashed var(--divider-color); border-radius: 10px; padding: 10px; display: grid; gap: 8px; }
        ha-textfield, ha-entity-picker, ha-icon-picker { width: 100%; }
      </style>

      <div class="section">
        <div class="sectionTitle">1. Заголовок</div>
        <ha-textfield id="title" label="Текст"></ha-textfield>
      </div>

      <div class="section">
        <div class="sectionTitle">2. Вертикальний бар</div>
        <div class="hint">Сутність відсотка зайнятого місця (0–100). За замовчуванням: sensor.disk_used_space_percent</div>
        <ha-entity-picker id="percentEntity" label="Сутність %"></ha-entity-picker>
        <ha-textfield id="barWidthPx" label="Ширина (px)" type="number"></ha-textfield>
        <div class="grid2">
          <ha-textfield id="zoneGreenTo" label="Поріг зеленої зони (≤)" type="number"></ha-textfield>
          <ha-textfield id="zoneYellowTo" label="Поріг жовтої зони (≤)" type="number"></ha-textfield>
        </div>
        <div class="grid2">
          <ha-textfield id="zoneGreenColor" label="Колір зеленої"></ha-textfield>
          <ha-textfield id="zoneYellowColor" label="Колір жовтої"></ha-textfield>
        </div>
        <ha-textfield id="zoneRedColor" label="Колір червоної"></ha-textfield>
      </div>

      <div class="section">
        <div class="sectionTitle">3. Температура та графік</div>
        <div class="hint">Сутність температури. За замовчуванням: sensor.disk_temperature</div>
        <ha-entity-picker id="temperatureEntity" label="Сутність температури"></ha-entity-picker>
        <div class="grid2">
          <div>
            <div class="hint" style="margin-bottom:6px;">Товщина цифри температури</div>
            <select id="temperatureThickness">
              <option value="thin">Тонкий</option>
              <option value="normal">Звичайний</option>
              <option value="thick">Товстий</option>
            </select>
          </div>
          <ha-textfield id="temperatureFontSize" label="Розмір шрифту показника (px)" type="number"></ha-textfield>
        </div>
        <div class="grid2">
          <ha-textfield id="hoursToShow" label="Годин для показу" type="number"></ha-textfield>
          <ha-textfield id="pointsPerHour" label="Точок на годину" type="number"></ha-textfield>
        </div>
        <ha-textfield id="graphHeight" label="Висота графіка (px)" type="number"></ha-textfield>
        <div class="grid2">
          <div>
            <div class="hint" style="margin-bottom:6px;">Тип графіка</div>
            <select id="temperatureGraphType">
              <option value="bar">Стовпчики</option>
              <option value="line">Лінія</option>
            </select>
          </div>
          <div>
            <div class="hint" style="margin-bottom:6px;">Показувати min/max</div>
            <select id="showExtrema">
              <option value="true">Так</option>
              <option value="false">Ні</option>
            </select>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="sectionTitle">4. Характеристики</div>
        <div class="hint">Клік відкриває модалку з графіком обраної сутності (поле «Графік (сутність)» або основна сутність).</div>
        <div id="metrics-list"></div>
        <button class="btn" type="button" id="add-metric">+ Додати характеристику</button>
      </div>
    `;

    this._els = {
      title: this.shadowRoot.getElementById('title'),
      percentEntity: this.shadowRoot.getElementById('percentEntity'),
      barWidthPx: this.shadowRoot.getElementById('barWidthPx'),
      zoneGreenTo: this.shadowRoot.getElementById('zoneGreenTo'),
      zoneYellowTo: this.shadowRoot.getElementById('zoneYellowTo'),
      zoneGreenColor: this.shadowRoot.getElementById('zoneGreenColor'),
      zoneYellowColor: this.shadowRoot.getElementById('zoneYellowColor'),
      zoneRedColor: this.shadowRoot.getElementById('zoneRedColor'),
      temperatureEntity: this.shadowRoot.getElementById('temperatureEntity'),
      temperatureThickness: this.shadowRoot.getElementById('temperatureThickness'),
      temperatureFontSize: this.shadowRoot.getElementById('temperatureFontSize'),
      hoursToShow: this.shadowRoot.getElementById('hoursToShow'),
      pointsPerHour: this.shadowRoot.getElementById('pointsPerHour'),
      graphHeight: this.shadowRoot.getElementById('graphHeight'),
      temperatureGraphType: this.shadowRoot.getElementById('temperatureGraphType'),
      showExtrema: this.shadowRoot.getElementById('showExtrema'),
      metricsList: this.shadowRoot.getElementById('metrics-list'),
      addMetric: this.shadowRoot.getElementById('add-metric'),
    };

    const emit = () => this._emitConfig();

    const bindText = (el, key) => {
      const h = (ev) => {
        const v = ev.detail?.value ?? ev.target?.value;
        this._config = { ...this._config, [key]: v };
        emit();
      };
      el.addEventListener('value-changed', h);
      el.addEventListener('change', h);
    };

    bindText(this._els.title, 'title');
    bindText(this._els.percentEntity, 'percent_entity');
    bindText(this._els.temperatureEntity, 'temperature_entity');

    const bindNum = (el, key) => {
      const h = (ev) => {
        const v = ev.detail?.value ?? ev.target?.value;
        const n = v === '' ? null : Number(v);
        this._config = { ...this._config, [key]: Number.isFinite(n) ? n : v };
        emit();
      };
      el.addEventListener('value-changed', h);
      el.addEventListener('change', h);
    };

    bindNum(this._els.barWidthPx, 'barWidthPx');
    bindNum(this._els.zoneGreenTo, 'zoneGreenTo');
    bindNum(this._els.zoneYellowTo, 'zoneYellowTo');
    bindNum(this._els.temperatureFontSize, 'temperatureFontSize');
    bindNum(this._els.hoursToShow, 'hoursToShow');
    bindNum(this._els.pointsPerHour, 'pointsPerHour');
    bindNum(this._els.graphHeight, 'graphHeight');

    bindText(this._els.zoneGreenColor, 'zoneGreenColor');
    bindText(this._els.zoneYellowColor, 'zoneYellowColor');
    bindText(this._els.zoneRedColor, 'zoneRedColor');

    this._els.temperatureThickness.addEventListener('change', () => {
      this._config = { ...this._config, temperatureThickness: this._els.temperatureThickness.value };
      emit();
    });

    this._els.temperatureGraphType.addEventListener('change', () => {
      this._config = { ...this._config, temperatureGraphType: this._els.temperatureGraphType.value };
      emit();
    });

    this._els.showExtrema.addEventListener('change', () => {
      this._config = { ...this._config, showExtrema: this._els.showExtrema.value === 'true' };
      emit();
    });

    this._els.addMetric.addEventListener('click', () => {
      const metrics = [...(this._config.metrics ?? [])];
      metrics.push({
        id: `m_${Date.now()}`,
        title: 'Нова',
        icon: 'mdi:information',
        entity: '',
        value_template: '',
        unit: '',
        graph_entity: '',
      });
      this._config = { ...this._config, metrics };
      this._renderMetricEditors();
      emit();
    });
  }

  _readMetricsFromDom() {
    const root = this._els.metricsList;
    if (!root) return this._config?.metrics ?? [];
    if (!this._metricsEditorRendered) return this._config?.metrics ?? [];
    return Array.from(root.querySelectorAll('.metricRow')).map((row, idx) => {
      const id = row.getAttribute('data-id') || `m_${idx}`;
      const title = row.querySelector('[data-f="title"]')?.value ?? '';
      const iconEl = row.querySelector('[data-f="icon"]');
      const icon =
        iconEl?.value ??
        row.querySelector('ha-icon-picker')?.value ??
        row.querySelector('[data-f="icon"]')?.getAttribute?.('value') ??
        'mdi:information';
      return {
        id,
        title,
        icon: (icon ?? '').toString(),
        entity: row.querySelector('[data-f="entity"]')?.value ?? '',
        value_template: row.querySelector('[data-f="tpl"]')?.value ?? '',
        unit: row.querySelector('[data-f="unit"]')?.value ?? '',
        graph_entity: row.querySelector('[data-f="graph"]')?.value ?? '',
      };
    });
  }

  _renderMetricEditors() {
    const root = this._els.metricsList;
    const metrics = this._config.metrics ?? [];
    const hasIconPicker = !!customElements.get('ha-icon-picker');

    root.innerHTML = metrics
      .map(
        (m) => `
      <div class="metricRow" data-id="${escapeHtml(m.id)}">
        <div class="grid2">
          <ha-textfield data-f="title" label="Заголовок" value="${escapeHtml(m.title ?? '')}"></ha-textfield>
          ${
            hasIconPicker
              ? `<ha-icon-picker data-f="icon" value="${escapeHtml(m.icon ?? '')}"></ha-icon-picker>`
              : `<ha-textfield data-f="icon" label="Іконка (mdi:...)" value="${escapeHtml(
                  m.icon ?? ''
                )}"></ha-textfield>`
          }
        </div>
        <ha-entity-picker data-f="entity" label="Сутність (якщо без шаблону)" value="${escapeHtml(
          m.entity ?? ''
        )}"></ha-entity-picker>
        <ha-textfield data-f="tpl" label="Шаблон значення (JS, опційно)" value="${escapeHtml(
          m.value_template ?? ''
        )}"></ha-textfield>
        <div class="grid2">
          <ha-textfield data-f="unit" label="Розмірність (опційно)" value="${escapeHtml(
            m.unit ?? ''
          )}"></ha-textfield>
          <ha-entity-picker data-f="graph" label="Графік у модалці (сутність)" value="${escapeHtml(
            m.graph_entity ?? ''
          )}"></ha-entity-picker>
        </div>
        <button class="btn" type="button" data-del>Видалити</button>
      </div>
    `
      )
      .join('');

    root.querySelectorAll('ha-entity-picker').forEach((el) => {
      el.hass = this._hass;
    });

    const onAny = () => {
      this._config = { ...this._config, metrics: this._readMetricsFromDom() };
      this._emitConfig();
    };

    root.querySelectorAll('ha-textfield, ha-entity-picker, ha-icon-picker').forEach((el) => {
      el.addEventListener('value-changed', onAny);
      el.addEventListener('change', onAny);
    });

    root.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.metricRow');
        const id = row?.getAttribute('data-id');
        this._config = {
          ...this._config,
          metrics: (this._config.metrics ?? []).filter((m) => m.id !== id),
        };
        this._renderMetricEditors();
        this._emitConfig();
      });
    });

    this._metricsEditorRendered = true;
  }

  set hass(hass) {
    this._hass = hass;
    this.shadowRoot.querySelectorAll('ha-entity-picker').forEach((el) => {
      el.hass = hass;
    });
    if (customElements.get('ha-icon-picker')) {
      this.shadowRoot.querySelectorAll('ha-icon-picker').forEach((el) => {
        el.hass = hass;
      });
    }
  }

  setConfig(config) {
    this._config = {
      ...structuredClone(DEFAULTS),
      ...config,
    };
    if (!Array.isArray(this._config.metrics) || this._config.metrics.length === 0) {
      this._config.metrics = getDefaultMetrics(
        this._config.percent_entity || DEFAULT_ENTITY.percent,
        this._config.total_entity ?? DEFAULT_ENTITY.total
      );
    }

    this._els.title.value = this._config.title ?? '';
    this._els.percentEntity.value = this._config.percent_entity ?? '';
    this._els.temperatureEntity.value = this._config.temperature_entity ?? '';
    this._els.barWidthPx.value = String(this._config.barWidthPx ?? DEFAULTS.barWidthPx);
    this._els.zoneGreenTo.value = String(this._config.zoneGreenTo ?? DEFAULTS.zoneGreenTo);
    this._els.zoneYellowTo.value = String(this._config.zoneYellowTo ?? DEFAULTS.zoneYellowTo);
    this._els.zoneGreenColor.value = this._config.zoneGreenColor ?? '';
    this._els.zoneYellowColor.value = this._config.zoneYellowColor ?? '';
    this._els.zoneRedColor.value = this._config.zoneRedColor ?? '';

    this._els.temperatureThickness.value = this._config.temperatureThickness ?? 'thin';
    this._els.temperatureFontSize.value = String(this._config.temperatureFontSize ?? 65);
    this._els.hoursToShow.value = String(this._config.hoursToShow ?? 48);
    this._els.pointsPerHour.value = String(this._config.pointsPerHour ?? 3);
    this._els.graphHeight.value = String(this._config.graphHeight ?? 60);
    this._els.temperatureGraphType.value = this._config.temperatureGraphType ?? 'bar';
    this._els.showExtrema.value = this._config.showExtrema !== false ? 'true' : 'false';

    this._renderMetricEditors();
  }

  _emitConfig() {
    if (!this._config) return;
    const metrics = this._readMetricsFromDom();
    const next = { ...this._config, metrics };
    this._config = next;
    this.dispatchEvent(
      new CustomEvent('config-changed', {
        detail: { config: next },
        bubbles: true,
        composed: true,
      })
    );
  }
}

customElements.define('ha-disk-info-card-editor', HaDiskInfoCardEditor);
customElements.define('ha-disk-info', HaDiskInfoCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ha-disk-info',
  name: 'Disk Info Card',
  description: 'Диск: бар %, температура, характеристики.',
});
