/* Universal disk info card for Home Assistant Lovelace.
 *
 * Depends on: custom:mini-graph-card (must be available on the dashboard).
 *
 * Configuration example is in README.md.
 */

const DEFAULTS = {
  title: '',
  subtitle: '',
  percentDecimals: 1,
  barWidthPx: 44,
  // In "auto height" mode this should be left as 0.
  barMinHeightPx: 0,

  // Active header typography
  activeValueFontWeight: 700,
  temperatureValueFontWeight: 400,

  // Auto-scroll for metric values under the graph
  metricAutoScroll: false,
  metricAutoScrollPxPerSecond: 40,

  barColors: [
    // Same semantics as bar-card: [ {to, color}, ... ] with ranges:
    // 0..yellowFrom => green, yellowFrom..redFrom => yellow, redFrom..100 => red
    { greenTo: 79, green: '#27ae60' },
    { yellowTo: 90, yellow: '#f39c12' },
    { redFrom: 91, red: '#c0392b' },
  ],
  // mini-graph-card settings
  hoursToShow: 24,
  pointsPerHour: 4,
  hour24: true,
  graphHeight: 60,
  graphFontSize: 65,
  graphLineColors: {
    temperature: '#e67e22',
    usedPercent: '#2ecc71',
    uptimeHours: '#1abc9c',
    smart: '#3498db',
  },
  // SMART parsing
  smartPassStrings: ['passed', 'pass', 'ok'],
  smartPassLabel: 'Passed',
  smartFailLabel: 'Failed',
  // SMART state map for mini-graph-card (for non-numeric states)
  smartStateMap: [
    { value: 'passed', label: 'Passed' },
    { value: 'failed', label: 'Failed' },
    { value: 'ok', label: 'Passed' },
  ],
  // Uptime formatting (uptime_entity is expected to be "hours")
  uptimeHoursPerDay: 24,
  uptimeHoursPerYear: 8760,
  // Text units
  totalUnit: 'GB',
  // metric icons
  icons: {
    used: 'mdi:database',
    smart: 'mdi:check-circle-outline',
    uptime: 'mdi:timer-outline',
  },
  // UI/UX
  openHistoryOnClick: true,
  historyPath: '/history',
  // "more-info" opens HA standard More Info modal with history/graphs inside.
  // "history-page" navigates to /history (legacy behavior).
  historyClickMode: 'more-info',

  // Fill zones (used %)
  zoneGreenTo: 79,
  zoneYellowTo: 90,
  // Keep colors configurable only by thresholds (colors are fixed by defaults for now)
  // Colors used for zones:
  zoneGreenColor: '#27ae60',
  zoneYellowColor: '#f39c12',
  zoneRedColor: '#c0392b',

  // Graph options
  showExtrema: true,
  showSubtitle: false,

  // Temperature graph type: "line" or "bar"
  temperatureGraphType: 'line',

  // Metrics typography
  metricPrimaryFontSize: 13,
  metricSecondaryFontSize: 12,
  // Optional custom characteristics list.
  metrics: [],
};

const CARD_BASE_URL = (() => {
  // Capture base URL once at load-time so we can fetch translations later.
  const src = document.currentScript?.src;
  if (!src) return '';
  return src.replace(/ha-disk-info-card\.js.*$/, '');
})();

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
  // Supports: "29.49", "29,49", "29,49 %", null/unavailable.
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

function formatUptimeHours(hours, perYear, perDay) {
  if (hours === null || !Number.isFinite(hours)) return '—';
  const y = Math.floor(hours / perYear);
  const d = Math.floor((hours % perYear) / perDay);
  const hr = Math.floor(hours % perDay);
  const pad2 = (x) => x.toString().padStart(2, '0');
  const parts = [];
  if (y > 0) parts.push(`${y} р.`);
  if (d > 0) parts.push(`${d} д.`);
  parts.push(`${pad2(hr)} г.`);
  return parts.join(' ');
}

function computeUsedText(total, percent, unit) {
  if (total === null || percent === null) return '—';
  if (total === 0) return `0 / 0 ${unit}`;
  const used = (total * percent) / 100;
  const usedStr = used.toFixed(1);
  const totalStr = Math.round(total);
  return `${usedStr} / ${totalStr} ${unit}`;
}

function computeSeverityColor(percent, barColors) {
  const p = clamp(percent ?? 0, 0, 100);

  // Expected structure: [{greenTo, green}, {yellowTo, yellow}, {redFrom, red}]
  const greenTo = barColors?.[0]?.greenTo ?? 79;
  const green = barColors?.[0]?.green ?? '#27ae60';
  const yellowTo = barColors?.[1]?.yellowTo ?? 90;
  const yellow = barColors?.[1]?.yellow ?? '#f39c12';
  const redFrom = barColors?.[2]?.redFrom ?? 91;
  const red = barColors?.[2]?.red ?? '#c0392b';

  if (p <= greenTo) return green;
  if (p <= yellowTo) return yellow;
  if (p >= redFrom) return red;
  return yellow;
}

function detectUiLang(hass) {
  const lang = (hass?.language ?? '').toString().toLowerCase();
  if (lang.startsWith('uk')) return 'uk';
  return 'en';
}

function getI18n(lang) {
  const uk = {
    usedTotal: 'Заповнено / всього',
    smart: 'SMART',
    uptime: 'Напрацювання',
    passed: 'Пройдений',
    failed: 'Помилка',
    historyOpen: 'Відкрити історію',
  };
  const en = {
    usedTotal: 'Used / total',
    smart: 'SMART',
    uptime: 'Uptime',
    passed: 'Passed',
    failed: 'Failed',
    historyOpen: 'Open history',
  };
  return lang === 'uk' ? uk : en;
}

class HaDiskInfoCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._config = null;
    this._activeGraphKey = 'temperature';
    this._graphEl = null;

    this._i18n = null;
    this._i18nLang = null;
    this._i18nPromise = null;

    this._activeValueBtnEl = null;

    // Metric values: outer clip containers + inner animated spans.
    this._usedPrimaryOuterEl = null;
    this._smartPrimaryOuterEl = null;
    this._uptimePrimaryOuterEl = null;
    this._usedSecondaryOuterEl = null;
    this._smartSecondaryOuterEl = null;
    this._uptimeSecondaryOuterEl = null;

    this._usedPrimaryInnerEl = null;
    this._smartPrimaryInnerEl = null;
    this._uptimePrimaryInnerEl = null;
    this._usedSecondaryInnerEl = null;
    this._smartSecondaryInnerEl = null;
    this._uptimeSecondaryInnerEl = null;

    this._barWrapEl = null;
    this._contentEl = null;
    this._resizeObserver = null;
    this._metricsContainerEl = null;

    this.attachShadow({ mode: 'open' });
  }

  static getStubConfig() {
    return {
      type: 'custom:ha-disk-info',
      title: 'Системний диск',
      subtitle: 'nvme0',
      percent_entity: 'sensor.home_server_disk',
      total_entity: 'sensor.home_server_disk_total',
      temperature_entity: 'sensor.home_server_built_in_nvme0_temperature',
      smart_entity: 'sensor.home_server_built_in_nvme0_smart_test_result',
      uptime_hours_entity: 'sensor.home_server_built_in_nvme0_power_on_hours',
    };
  }

  static getConfigElement() {
    return document.createElement('ha-disk-info-card-editor');
  }

  setConfig(config) {
    this._config = {
      ...structuredClone(DEFAULTS),
      ...config,
    };

    const required = [
      'percent_entity',
      'total_entity',
      'temperature_entity',
      'smart_entity',
      'uptime_hours_entity',
    ];
    for (const k of required) {
      if (!this._config[k]) {
        throw new Error(`ha-disk-info: missing required config key "${k}"`);
      }
    }

    // If user passed a different icons structure, merge safely.
    this._config.icons = {
      ...structuredClone(DEFAULTS.icons),
      ...(this._config.icons ?? {}),
    };

    // The card should always render temperature history.
    this._activeGraphKey = 'temperature';
    this._buildDom();
    this._updateGraphConfig();
    this._updateValues();
  }

  set hass(hass) {
    this._hass = hass;
    this._updateValues();
  }

  getCardSize() {
    // rough guess: title + graph + 3 metrics buttons
    return 4;
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

    const tempStrokePx = (() => {
      // Make thickness differences visually obvious.
      const w = Number(cfg.temperatureValueFontWeight ?? DEFAULTS.temperatureValueFontWeight);
      if (w <= 300) return 0;
      if (w <= 400) return 0.3;
      if (w <= 500) return 0.9;
      if (w <= 600) return 1.6;
      return 2.3;
    })();

    const tempShadowPx = (() => {
      const w = Number(cfg.temperatureValueFontWeight ?? DEFAULTS.temperatureValueFontWeight);
      if (w <= 300) return 0;
      if (w <= 400) return 0.4;
      if (w <= 500) return 1.0;
      if (w <= 600) return 1.8;
      return 2.6;
    })();

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
      .subtitle {
        font-size: 13px;
        opacity: 0.75;
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

      .barZoneBg {
        position: absolute;
        left: 0;
        width: 100%;
        border-radius: 0;
        opacity: 0.18;
      }

      .barFillSeg {
        position: absolute;
        left: 0;
        width: 100%;
        border-radius: 0;
        transition: height 0.35s ease, bottom 0.35s ease;
      }

      .barPct {
        position: absolute;
        left: 50%;
        bottom: 6px;
        transform: translateX(-50%);
        z-index: 3;
        font-size: 12px;
        font-weight: 900;
        color: white;
        white-space: nowrap;
        pointer-events: none;
      }

      .content {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
      }

      .graphHeader {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 10px;
        margin-bottom: 0px;
      }

      .activeValueBtn {
        appearance: none;
        border: none;
        background: transparent;
        padding: 0;
        margin: 0;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 2px;
      }

      .activeValueText {
        font-size: 22px;
        white-space: nowrap;
        display: flex;
        align-items: baseline;
        justify-content: flex-end;
        gap: 0px;
      }

      .activeValueNumber {
        font-weight: ${cfg.activeValueFontWeight};
        white-space: nowrap;
        -webkit-text-stroke: ${tempStrokePx}px currentColor;
        paint-order: stroke fill;
        text-shadow: 0 0 ${tempShadowPx}px currentColor;
      }

      .activeValueBtn[data-active-graph="temperature"] .activeValueNumber {
        font-weight: ${cfg.temperatureValueFontWeight};
      }

      .activeValueUnit {
        font-size: 12px;
        opacity: 0.7;
        white-space: nowrap;
        margin-left: 1px;
        vertical-align: baseline;
        display: inline-block;
        line-height: 1;
      }

      .activeValueUnit:empty {
        display: none;
      }

      .graph {
        width: 100%;
        overflow: visible;
        padding-top: 6px;
        padding-bottom: 6px;
        box-sizing: border-box;
      }

      mini-graph-card {
        border-radius: 0 !important;
        overflow: visible !important;
      }

      .metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      .metricBtn {
        appearance: none;
        border: 1px solid rgba(120,120,120,0.1);
        border-radius: 12px;
        background: rgba(120,120,120,0.06);
        padding: 10px 10px;
        min-width: 0;
        cursor: pointer;
        display: flex;
        align-items: flex-start;
        gap: 10px;
        width: 100%;
        grid-column: span var(--metric-span, 1);
      }

      .metricBtn[aria-pressed="true"] {
        border-color: rgba(33,150,243,0.35);
        box-shadow: 0 0 0 2px rgba(33,150,243,0.12);
      }

      .metricIcon {
        width: 22px;
        color: var(--primary-text-color);
        flex: 0 0 22px;
      }

      .metricText {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
        align-items: flex-start;
      }
      .metricPrimary {
        font-size: ${cfg.metricPrimaryFontSize}px;
        font-weight: 600;
        white-space: normal;
        overflow: visible;
        word-break: break-word;
        display: block;
        max-width: 100%;
      }
      .metricSecondary {
        font-size: ${cfg.metricSecondaryFontSize}px;
        opacity: 0.65;
        white-space: normal;
        overflow: visible;
        word-break: break-word;
        display: block;
        max-width: 100%;
      }

      .metricScrollInner {
        display: block;
        white-space: normal;
        transform: translateX(0);
      }

      .metricScrollInner[data-marquee="true"] {
        white-space: nowrap;
        display: inline-block;
        animation: marquee var(--scroll-duration, 10s) linear infinite alternate;
      }

      @keyframes marquee {
        from {
          transform: translateX(0);
        }
        to {
          transform: translateX(calc(-1 * var(--scroll-distance, 0px)));
        }
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
              <div class="title">${escapeHtml(cfg.title)}</div>
              <button class="activeValueBtn" id="active-value-btn" type="button" data-active-graph="${this._activeGraphKey}">
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

    const activeValueBtn = this.shadowRoot.getElementById('active-value-btn');
    if (activeValueBtn) {
      activeValueBtn.addEventListener('click', () => {
        const key = this._activeGraphKey;
        this._openHistoryForGraphKey(key);
      });
    }

    // Click on bar opens percent entity More Info modal (without changing temperature chart).
    if (this._barWrapEl) {
      this._barWrapEl.addEventListener('click', () => {
        if (!this._config?.openHistoryOnClick) return;
        const entityId = this._config.percent_entity;
        if (entityId) this._openEntityWithGraphModal(entityId);
      });
    }

    this._setupBarHeightObserver();

    const host = this.shadowRoot.getElementById(graphHostId);
    this._graphHostEl = host;
  }

  _onMetricClick(entityId) {
    // Always keep the temperature graph as-is; clicks only open standard HA modal.
    if (!entityId) return;
    this._openEntityWithGraphModal(entityId);
  }

  _getDefaultMetricConfigs(i18n) {
    const cfg = this._config;
    return [
      {
        id: 'used',
        icon: cfg.icons?.used ?? 'mdi:database',
        name: i18n.usedTotal,
        entity: cfg.percent_entity,
        mode: 'used',
      },
      {
        id: 'smart',
        icon: cfg.icons?.smart ?? 'mdi:check-circle-outline',
        name: i18n.smart,
        entity: cfg.smart_entity,
        mode: 'smart',
      },
      {
        id: 'uptime',
        icon: cfg.icons?.uptime ?? 'mdi:timer-outline',
        name: i18n.uptime,
        entity: cfg.uptime_hours_entity,
        mode: 'uptime',
      },
    ];
  }

  _getMetricConfigs(i18n) {
    const cfg = this._config;
    if (Array.isArray(cfg.metrics) && cfg.metrics.length) return cfg.metrics;
    return this._getDefaultMetricConfigs(i18n);
  }

  _evalMetricTemplate(expr, ctx) {
    if (!expr) return null;
    const source = expr.toString().trim();
    if (!source) return null;
    try {
      const fn = new Function(
        'ctx',
        `
        const { state, num, percent, total, temperature, smartRaw, uptimeH, clamp } = ctx;
        return (${source});
      `
      );
      const v = fn(ctx);
      return v === null || v === undefined ? null : v;
    } catch (e) {
      return null;
    }
  }

  _pickMetricSpan(primaryText, secondaryText) {
    const len = `${primaryText ?? ''} ${secondaryText ?? ''}`.trim().length;
    if (len > 34) return 3;
    if (len > 18) return 2;
    return 1;
  }

  _layoutMetricSpans(items) {
    const spans = [];
    let rowFree = 3;
    for (let i = 0; i < items.length; i++) {
      let span = Math.max(1, Math.min(3, items[i].span ?? 1));
      if (span > rowFree) {
        rowFree = 3;
      }
      if (i === items.length - 1 && rowFree === 3 && span === 1) {
        span = 3;
      }
      spans.push(span);
      rowFree -= span;
      if (rowFree <= 0) rowFree = 3;
    }
    return spans;
  }

  _renderMetrics(ctx, i18n) {
    if (!this._metricsContainerEl) return;
    const cfg = this._config;
    const metrics = this._getMetricConfigs(i18n);

    const items = metrics.map((m, idx) => {
      const mode = (m.mode ?? '').toString();
      const name = (m.name ?? '').toString();
      const icon = (m.icon ?? 'mdi:information-outline').toString();
      const entityId = (m.entity ?? '').toString();

      let primary = '—';
      if (mode === 'used') {
        primary = computeUsedText(ctx.total, ctx.p, cfg.totalUnit);
      } else if (mode === 'smart') {
        primary = ctx.passed ? i18n.passed : i18n.failed;
      } else if (mode === 'uptime') {
        primary = formatUptimeHours(ctx.uptimeH, cfg.uptimeHoursPerYear, cfg.uptimeHoursPerDay);
      } else if (m.value_template) {
        const v = this._evalMetricTemplate(m.value_template, ctx);
        primary = v === null ? '—' : v.toString();
      } else if (entityId) {
        primary = this._getState(entityId) ?? '—';
      }

      const secondary = name || m.secondary || '';
      const span = this._pickMetricSpan(primary, secondary);

      return {
        id: m.id ?? `metric-${idx}`,
        icon,
        primary,
        secondary,
        entityId,
        span,
      };
    });

    const spans = this._layoutMetricSpans(items);

    this._metricsContainerEl.innerHTML = items
      .map((m, idx) => {
        const smartColor =
          (m.id === 'smart' || (m.secondary ?? '').toString().toLowerCase() === 'smart') && ctx.passed
            ? '#4caf50'
            : null;
        const smartColorFail =
          (m.id === 'smart' || (m.secondary ?? '').toString().toLowerCase() === 'smart') && !ctx.passed
            ? '#e53935'
            : null;
        const iconColor = smartColor || smartColorFail || 'var(--primary-text-color)';
        return `
          <button class="metricBtn" type="button" data-entity-id="${escapeHtml(
            m.entityId
          )}" style="--metric-span:${spans[idx]};">
            <ha-icon class="metricIcon" icon="${escapeHtml(m.icon)}" style="color:${iconColor};"></ha-icon>
            <div class="metricText">
              <div class="metricPrimary"><span class="metricScrollInner">${escapeHtml(m.primary)}</span></div>
              <div class="metricSecondary"><span class="metricScrollInner">${escapeHtml(
                m.secondary
              )}</span></div>
            </div>
          </button>
        `;
      })
      .join('');

    this._metricsContainerEl.querySelectorAll('.metricBtn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const entityId = btn.getAttribute('data-entity-id');
        if (entityId) this._onMetricClick(entityId);
      });
    });
  }

  _openHistoryForGraphKey(graphKey) {
    if (!this._config?.openHistoryOnClick) return;
    const cfg = this._config;

    let entityId = null;
    if (graphKey === 'temperature') entityId = cfg.temperature_entity;
    if (graphKey === 'usedPercent') entityId = cfg.percent_entity;
    if (graphKey === 'smart') entityId = cfg.smart_entity;
    if (graphKey === 'uptimeHours') entityId = cfg.uptime_hours_entity;

    if (!entityId) return;
    this._openEntityWithGraphModal(entityId);
  }

  _openEntityWithGraphModal(entityId) {
    if (!entityId || !this._config?.openHistoryOnClick) return;

    const mode = this._config?.historyClickMode ?? 'more-info';
    if (mode === 'history-page') {
      const base = this._config.historyPath ?? '/history';
      const url = `${base}?entity_id=${encodeURIComponent(entityId)}`;
      window.location.href = url;
      return;
    }

    // Standard Home Assistant More Info modal.
    this.dispatchEvent(
      new CustomEvent('hass-more-info', {
        bubbles: true,
        composed: true,
        detail: { entityId },
      })
    );
  }

  _maybeEnsureI18n(uiLang) {
    if (!uiLang) uiLang = 'en';
    const langToLoad = uiLang === 'uk' ? 'uk' : 'en';
    if (this._i18n && this._i18nLang === langToLoad) return;
    if (this._i18nPromise) return;

    this._i18nPromise = (async () => {
      try {
        const base = CARD_BASE_URL || '';
        const url = `${base}translations/${langToLoad}.json`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`i18n fetch failed: ${res.status}`);
        const json = await res.json();
        this._i18n = json ?? {};
        this._i18nLang = langToLoad;
      } catch (e) {
        // Silent fallback to inline defaults.
        this._i18n = null;
        this._i18nLang = null;
      } finally {
        this._i18nPromise = null;
        // Re-render translated labels ASAP.
        this._updateValues();
      }
    })();
  }

  _maybeStartMarquee(outerEl, innerEl) {
    if (!outerEl || !innerEl) return;

    if (!this._config?.metricAutoScroll) {
      innerEl.removeAttribute('data-marquee');
      innerEl.style.animation = 'none';
      innerEl.style.transform = 'translateX(0)';
      return;
    }

    const outerWidth = outerEl.clientWidth;
    const innerWidth = innerEl.scrollWidth;
    const distance = Math.max(0, innerWidth - outerWidth);

    if (distance < 1) {
      innerEl.removeAttribute('data-marquee');
      innerEl.style.animation = 'none';
      innerEl.style.transform = 'translateX(0)';
      return;
    }

    innerEl.setAttribute('data-marquee', 'true');
    innerEl.style.setProperty('--scroll-distance', `${distance}px`);

    const pxPerSecond = this._config?.metricAutoScrollPxPerSecond ?? 40;
    const duration = Math.max(6, distance / pxPerSecond);
    innerEl.style.setProperty('--scroll-duration', `${duration}s`);
  }

  _updateMetricMarquee() {
    this._maybeStartMarquee(this._usedPrimaryOuterEl, this._usedPrimaryInnerEl);
    this._maybeStartMarquee(this._smartPrimaryOuterEl, this._smartPrimaryInnerEl);
    this._maybeStartMarquee(this._uptimePrimaryOuterEl, this._uptimePrimaryInnerEl);

    this._maybeStartMarquee(this._usedSecondaryOuterEl, this._usedSecondaryInnerEl);
    this._maybeStartMarquee(this._smartSecondaryOuterEl, this._smartSecondaryInnerEl);
    this._maybeStartMarquee(this._uptimeSecondaryOuterEl, this._uptimeSecondaryInnerEl);
  }

  _setupBarHeightObserver() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    if (!('ResizeObserver' in window)) return;
    if (!this._barWrapEl || !this._contentEl) return;

    const barWrapEl = this._barWrapEl;
    const contentEl = this._contentEl;

    const apply = (heightPx) => {
      const minH = this._config?.barMinHeightPx ?? 0;
      const h = Math.max(minH, heightPx ?? 0);
      barWrapEl.style.height = `${h}px`;
    };

    // Initial apply.
    apply(contentEl.getBoundingClientRect().height);

    this._resizeObserver = new ResizeObserver((entries) => {
      const cr = entries?.[0]?.contentRect;
      apply(cr?.height);
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

    // Active entity selection for mini-graph-card.
    let entityId = null;
    let entityName = '';
    let stateMap = undefined;
    let lineColor = cfg.graphLineColors.temperature;
    let graphType = 'line';

    switch (this._activeGraphKey) {
      case 'temperature':
        entityId = cfg.temperature_entity;
        entityName = cfg.temperature_name ?? 'Темп.';
        lineColor = cfg.graphLineColors.temperature;
        graphType = (cfg.temperatureGraphType ?? 'line').toString().toLowerCase();
        graphType = graphType === 'bar' || graphType === 'line' ? graphType : 'line';
        break;
      case 'usedPercent':
        entityId = cfg.percent_entity;
        entityName = cfg.used_percent_name ?? 'Заповн.';
        lineColor = cfg.graphLineColors.usedPercent;
        break;
      case 'uptimeHours':
        entityId = cfg.uptime_hours_entity;
        entityName = cfg.uptime_hours_name ?? 'Години';
        lineColor = cfg.graphLineColors.uptimeHours;
        break;
      case 'smart':
        entityId = cfg.smart_entity;
        entityName = cfg.smart_name ?? 'SMART';
        lineColor = cfg.graphLineColors.smart;
        stateMap = (cfg.smartStateMap ?? []).map((m) => ({
          value: m.value,
          label: m.label,
        }));
        break;
      default:
        entityId = cfg.temperature_entity;
        entityName = cfg.temperature_name ?? 'Темп.';
        break;
    }

    const entities = [
      {
        entity: entityId,
        name: entityName,
      },
    ];

    const graphConfig = {
      entities,
      hours_to_show: cfg.hoursToShow,
      points_per_hour: cfg.pointsPerHour,
      hour24: cfg.hour24,
      height: cfg.graphHeight + (cfg.showExtrema ? 24 : 0),
      font_size: cfg.graphFontSize,
      line_color: lineColor,
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

    if (stateMap && stateMap.length) {
      graphConfig.state_map = stateMap;
    }

    this._graphEl.setConfig(graphConfig);
    // Ensure the graph element sees hass updates.
    if (this._hass) this._graphEl.hass = this._hass;
  }

  _updateValues() {
    if (!this._config || !this._hass) return;

    const cfg = this._config;

    // Ensure nested mini-graph-card receives hass updates.
    if (this._graphEl) this._graphEl.hass = this._hass;

    const uiLang = detectUiLang(this._hass);
    this._maybeEnsureI18n(uiLang);
    const langToUse = uiLang === 'uk' ? 'uk' : 'en';
    const i18n = this._i18n && this._i18nLang === langToUse ? this._i18n : getI18n(uiLang);

    const percent = this._getNumberState(cfg.percent_entity);
    const total = this._getNumberState(cfg.total_entity);
    const temperature = this._getNumberState(cfg.temperature_entity);
    const smartRaw = this._getState(cfg.smart_entity);
    const uptimeH = this._getNumberState(cfg.uptime_hours_entity);

    // Bar (fill zones)
    const p = percent === null ? 0 : clamp(percent, 0, 100);

    const greenTo = clamp(cfg.zoneGreenTo ?? 79, 0, 100);
    const yellowToRaw = clamp(cfg.zoneYellowTo ?? 90, 0, 100);
    const yellowTo = Math.max(greenTo, yellowToRaw);

    const greenColor = cfg.zoneGreenColor ?? '#27ae60';
    const yellowColor = cfg.zoneYellowColor ?? '#f39c12';
    const redColor = cfg.zoneRedColor ?? '#c0392b';

    const greenHeight = greenTo; // percent of total
    const yellowHeight = Math.max(0, yellowTo - greenTo);
    const redHeight = Math.max(0, 100 - yellowTo);

    // Background zones
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

    // Fill intersection
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

    // Percent label
    if (this._barPctEl) {
      const rounded = p.toFixed(cfg.percentDecimals);
      this._barPctEl.textContent = `${rounded}%`;
    }

    // SMART parse
    const smartNorm = (smartRaw ?? '').toString().toLowerCase().trim();
    const passed = (cfg.smartPassStrings ?? []).some((s) => smartNorm.includes(s.toLowerCase()));

    const ctx = {
      percent,
      p,
      total,
      temperature,
      smartRaw,
      uptimeH,
      passed,
      clamp,
      state: (entityId) => this._getState(entityId),
      num: (entityId) => this._getNumberState(entityId),
    };
    this._renderMetrics(ctx, i18n);

    // Active header value (temperature / used% / SMART / uptime)
    const tempStateObj = this._hass.states[cfg.temperature_entity];
    const tempUnit = tempStateObj?.attributes?.unit_of_measurement ?? '°C';

    let activeText = '—';
    let activeUnit = '';

    if (this._activeGraphKey === 'temperature') {
      if (temperature !== null && Number.isFinite(temperature)) {
        const fixed = Math.abs(temperature) >= 100 ? temperature.toFixed(0) : temperature.toFixed(1);
        activeText = fixed.replace(/\.0$/, '');
      }
      activeUnit = tempUnit;
    } else if (this._activeGraphKey === 'usedPercent') {
      activeText = (p ?? 0).toFixed(cfg.percentDecimals);
      activeUnit = '%';
    } else if (this._activeGraphKey === 'smart') {
      activeText = passed ? i18n.passed : i18n.failed;
    } else if (this._activeGraphKey === 'uptimeHours') {
      activeText = formatUptimeHours(uptimeH, cfg.uptimeHoursPerYear, cfg.uptimeHoursPerDay);
    }

    if (this._activeValueBtnEl) this._activeValueBtnEl.dataset.activeGraph = this._activeGraphKey;

    if (this._activeValueTextEl) this._activeValueTextEl.textContent = activeText;
    if (this._activeValueUnitEl) this._activeValueUnitEl.textContent = activeUnit;

    // Characteristic values are stacked vertically now, so scrolling isn't needed.
  }
}

// -------------------------
// Config editor (UI)
// -------------------------
class HaDiskInfoCardEditor extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._config = null;

    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; padding: 8px; }
        .row { display: grid; grid-template-columns: 1fr; gap: 10px; margin-bottom: 12px; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .hint { font-size: 12px; opacity: 0.7; }
        .selectWrap { width: 100%; }
        .selectLabel { font-size: 12px; opacity: 0.75; margin-bottom: 6px; }
        select {
          width: 100%;
          padding: 10px 10px;
          border: 1px solid var(--divider-color, rgba(120,120,120,0.18));
          border-radius: 12px;
          background: var(--card-background-color, rgba(120,120,120,0.06));
          color: var(--primary-text-color, inherit);
          font: inherit;
          outline: none;
          box-sizing: border-box;
        }
        option {
          background: var(--card-background-color, rgba(120,120,120,0.06));
          color: var(--primary-text-color, inherit);
        }
        .metricsEditor {
          border: 1px solid var(--divider-color, rgba(120,120,120,0.18));
          border-radius: 12px;
          padding: 10px;
          display: grid;
          gap: 10px;
        }
        .metricEditorRow {
          border: 1px dashed var(--divider-color, rgba(120,120,120,0.18));
          border-radius: 10px;
          padding: 8px;
          display: grid;
          gap: 8px;
        }
        .btn {
          border: 1px solid var(--divider-color, rgba(120,120,120,0.24));
          border-radius: 10px;
          background: var(--card-background-color, rgba(120,120,120,0.06));
          color: var(--primary-text-color, inherit);
          padding: 8px 10px;
          cursor: pointer;
        }
        ha-textfield, ha-entity-picker { width: 100%; }
      </style>
      <div class="row">
        <ha-textfield id="title" label="Заголовок"></ha-textfield>
        <ha-textfield id="totalUnit" label="Одиниця total (наприклад GB)"></ha-textfield>
      </div>

      <div class="row">
        <ha-entity-picker id="percentEntity" label="Сутність used % (0..100)"></ha-entity-picker>
        <ha-entity-picker id="totalEntity" label="Сутність total (для used/total)"></ha-entity-picker>
        <ha-entity-picker id="temperatureEntity" label="Сутність температури"></ha-entity-picker>
        <ha-entity-picker id="smartEntity" label="SMART результат (рядок)"></ha-entity-picker>
        <ha-entity-picker id="uptimeEntity" label="Напрацювання (години)"></ha-entity-picker>
      </div>

      <div class="row">
        <div class="hint">Характеристики (динамічний список): іконка, назва, сутність, шаблон значення</div>
        <div class="metricsEditor" id="metrics-editor-list"></div>
        <button class="btn" id="add-metric-btn" type="button">+ Додати характеристику</button>
      </div>

      <div class="grid2">
        <ha-textfield id="hoursToShow" label="Годин для показу"></ha-textfield>
        <ha-textfield id="pointsPerHour" label="Точок на годину"></ha-textfield>
      </div>

      <div class="grid2">
        <ha-textfield id="graphHeight" label="Висота графіка (px)"></ha-textfield>
        <ha-textfield id="graphFontSize" label="Розмір шрифту графіка"></ha-textfield>
      </div>

      <div class="grid2">
        <ha-textfield id="barWidthPx" label="Ширина смуги (px)"></ha-textfield>
        <div class="selectWrap">
          <div class="selectLabel">Тип графіка температури</div>
          <select id="temperatureGraphType">
            <option value="line">Лінія</option>
            <option value="bar">Стовпчики</option>
          </select>
        </div>
      </div>

      <div class="grid2">
        <div class="selectWrap">
          <div class="selectLabel">Товщина цифри температури</div>
          <select id="temperatureValueFontWeight">
            <option value="300">Тонка</option>
            <option value="400">Звичайна</option>
            <option value="500">Середня</option>
            <option value="600">Напівжирна</option>
            <option value="700">Жирна</option>
          </select>
        </div>
      </div>

      <div class="grid2">
        <ha-textfield id="zoneGreenTo" label="Поріг зеленої зони (≤)"></ha-textfield>
        <ha-textfield id="zoneYellowTo" label="Поріг жовтої зони (≤)"></ha-textfield>
      </div>

      <div class="grid2">
        <ha-textfield id="zoneGreenColor" label="Колір зеленої зони (#RRGGBB)"></ha-textfield>
        <ha-textfield id="zoneYellowColor" label="Колір жовтої зони (#RRGGBB)"></ha-textfield>
      </div>

      <div class="row">
        <ha-textfield id="zoneRedColor" label="Колір червоної зони (#RRGGBB)"></ha-textfield>
      </div>

      <div class="row">
        <ha-switch id="showExtrema" style="margin-top: 6px;"></ha-switch>
        <div class="hint">Показувати min/max на графіку температури</div>
      </div>

      <div class="row">
        <ha-textfield id="smartPassStrings" label="SMART: ключові слова OK (через кому)"></ha-textfield>
        <div class="hint">
          Якщо SMART текст містить будь-яке з цих слів (без урахування регістру) — буде вважатися Пройдений.
        </div>
      </div>

      <div class="row">
        <ha-switch id="openHistoryOnClick" style="margin-top: 6px;"></ha-switch>
        <div class="hint">Відкривати стандартний More Info (історія/графік) при кліку.</div>
      </div>
    `;

    this._els = {
      title: this.shadowRoot.getElementById('title'),
      totalUnit: this.shadowRoot.getElementById('totalUnit'),
      percentEntity: this.shadowRoot.getElementById('percentEntity'),
      totalEntity: this.shadowRoot.getElementById('totalEntity'),
      temperatureEntity: this.shadowRoot.getElementById('temperatureEntity'),
      smartEntity: this.shadowRoot.getElementById('smartEntity'),
      uptimeEntity: this.shadowRoot.getElementById('uptimeEntity'),
      hoursToShow: this.shadowRoot.getElementById('hoursToShow'),
      pointsPerHour: this.shadowRoot.getElementById('pointsPerHour'),
      graphHeight: this.shadowRoot.getElementById('graphHeight'),
      graphFontSize: this.shadowRoot.getElementById('graphFontSize'),
      barWidthPx: this.shadowRoot.getElementById('barWidthPx'),
      temperatureGraphType: this.shadowRoot.getElementById('temperatureGraphType'),
      temperatureValueFontWeight: this.shadowRoot.getElementById('temperatureValueFontWeight'),
      zoneGreenTo: this.shadowRoot.getElementById('zoneGreenTo'),
      zoneYellowTo: this.shadowRoot.getElementById('zoneYellowTo'),
      zoneGreenColor: this.shadowRoot.getElementById('zoneGreenColor'),
      zoneYellowColor: this.shadowRoot.getElementById('zoneYellowColor'),
      zoneRedColor: this.shadowRoot.getElementById('zoneRedColor'),
      showExtrema: this.shadowRoot.getElementById('showExtrema'),
      smartPassStrings: this.shadowRoot.getElementById('smartPassStrings'),
      openHistoryOnClick: this.shadowRoot.getElementById('openHistoryOnClick'),
      metricsEditorList: this.shadowRoot.getElementById('metrics-editor-list'),
      addMetricBtn: this.shadowRoot.getElementById('add-metric-btn'),
    };

    this._els.addMetricBtn.addEventListener('click', () => {
      const metrics = Array.isArray(this._config?.metrics) ? [...this._config.metrics] : [];
      metrics.push({
        id: `metric_${Date.now()}`,
        icon: 'mdi:information-outline',
        name: 'Нова характеристика',
        entity: '',
        value_template: '',
      });
      this._config = { ...(this._config ?? {}), metrics };
      this._renderMetricsEditor();
      this._emitConfig();
    });

    const textChanged = (key, parser) => (ev) => {
      const val = ev.detail?.value ?? ev.target?.value;
      this._config = this._config ?? {};
      this._config = { ...this._config, [key]: parser ? parser(val) : val };
      this._emitConfig();
    };

    // ha-textfield can emit either `value-changed` or `change` depending on HA version.
    this._els.title.addEventListener('value-changed', textChanged('title'));
    this._els.title.addEventListener('change', textChanged('title'));
    this._els.totalUnit.addEventListener('value-changed', textChanged('totalUnit'));
    this._els.totalUnit.addEventListener('change', textChanged('totalUnit'));
    this._els.temperatureGraphType.addEventListener('value-changed', textChanged('temperatureGraphType'));
    this._els.temperatureGraphType.addEventListener('change', textChanged('temperatureGraphType'));
    this._els.zoneGreenColor.addEventListener('value-changed', textChanged('zoneGreenColor'));
    this._els.zoneGreenColor.addEventListener('change', textChanged('zoneGreenColor'));
    this._els.zoneYellowColor.addEventListener('value-changed', textChanged('zoneYellowColor'));
    this._els.zoneYellowColor.addEventListener('change', textChanged('zoneYellowColor'));
    this._els.zoneRedColor.addEventListener('value-changed', textChanged('zoneRedColor'));
    this._els.zoneRedColor.addEventListener('change', textChanged('zoneRedColor'));

    const numChanged = (key) => (ev) => {
      const v = ev.detail?.value ?? ev.target?.value;
      const n = v === '' ? null : Number(v);
      this._config = { ...this._config, [key]: Number.isFinite(n) ? n : v };
      this._emitConfig();
    };

    const bindNum = (el, key) => {
      const handler = numChanged(key);
      el.addEventListener('value-changed', handler);
      el.addEventListener('change', handler);
    };
    bindNum(this._els.hoursToShow, 'hoursToShow');
    bindNum(this._els.pointsPerHour, 'pointsPerHour');
    bindNum(this._els.graphHeight, 'graphHeight');
    bindNum(this._els.graphFontSize, 'graphFontSize');
    bindNum(this._els.barWidthPx, 'barWidthPx');
    bindNum(this._els.temperatureValueFontWeight, 'temperatureValueFontWeight');
    bindNum(this._els.zoneGreenTo, 'zoneGreenTo');
    bindNum(this._els.zoneYellowTo, 'zoneYellowTo');

    // Switch helpers
    const bindSwitch = (el, key) => {
      const handler = (ev) => {
        const checked =
          typeof ev?.target?.checked === 'boolean' ? ev.target.checked : !!ev.detail?.value;
        this._config = { ...this._config, [key]: checked };
        this._emitConfig();
      };
      el.addEventListener('change', handler);
      el.addEventListener('value-changed', handler);
    };
    bindSwitch(this._els.showExtrema, 'showExtrema');

    this._els.smartPassStrings.addEventListener('value-changed', (ev) => {
      const raw = (ev.detail?.value ?? ev.target?.value ?? '').toString();
      const arr = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      this._config = { ...this._config, smartPassStrings: arr };
      this._emitConfig();
    });

    const openHistoryChanged = (ev) => {
      // Depending on HA version, ha-switch may fire `change` or `value-changed`
      const checked = typeof ev?.target?.checked === 'boolean' ? ev.target.checked : !!ev.detail?.value;
      this._config = { ...this._config, openHistoryOnClick: checked };
      this._emitConfig();
    };
    this._els.openHistoryOnClick.addEventListener('change', openHistoryChanged);
    this._els.openHistoryOnClick.addEventListener('value-changed', openHistoryChanged);

    const entityChanged = (key) => (ev) => {
      const val = ev.detail?.value ?? ev.target.value;
      this._config = { ...this._config, [key]: val };
      this._emitConfig();
    };

    const bindEntity = (el, key) => {
      const handler = entityChanged(key);
      el.addEventListener('value-changed', handler);
      el.addEventListener('change', handler);
    };
    bindEntity(this._els.percentEntity, 'percent_entity');
    bindEntity(this._els.totalEntity, 'total_entity');
    bindEntity(this._els.temperatureEntity, 'temperature_entity');
    bindEntity(this._els.smartEntity, 'smart_entity');
    bindEntity(this._els.uptimeEntity, 'uptime_hours_entity');
  }

  _readMetricsEditor() {
    const listEl = this._els.metricsEditorList;
    if (!listEl) return [];
    return Array.from(listEl.querySelectorAll('.metricEditorRow')).map((row, idx) => ({
      id: row.getAttribute('data-id') || `metric_${idx}`,
      icon: row.querySelector('[data-field="icon"]')?.value ?? 'mdi:information-outline',
      name: row.querySelector('[data-field="name"]')?.value ?? '',
      entity: row.querySelector('[data-field="entity"]')?.value ?? '',
      value_template: row.querySelector('[data-field="value_template"]')?.value ?? '',
    }));
  }

  _renderMetricsEditor() {
    const listEl = this._els.metricsEditorList;
    if (!listEl) return;
    const metrics = Array.isArray(this._config?.metrics) ? this._config.metrics : [];

    listEl.innerHTML = metrics
      .map(
        (m) => `
      <div class="metricEditorRow" data-id="${escapeHtml(m.id ?? '')}">
        <div class="grid2">
          <ha-textfield data-field="name" label="Назва" value="${escapeHtml(m.name ?? '')}"></ha-textfield>
          <ha-textfield data-field="icon" label="Іконка (mdi:...)" value="${escapeHtml(
            m.icon ?? 'mdi:information-outline'
          )}"></ha-textfield>
        </div>
        <ha-entity-picker data-field="entity" label="Сутність" value="${escapeHtml(m.entity ?? '')}"></ha-entity-picker>
        <ha-textfield data-field="value_template" label="Шаблон (JS expression, опційно)" value="${escapeHtml(
          m.value_template ?? ''
        )}"></ha-textfield>
        <button class="btn" type="button" data-remove-metric="1">Видалити</button>
      </div>
    `
      )
      .join('');

    Array.from(listEl.querySelectorAll('.metricEditorRow')).forEach((row, idx) => {
      const m = metrics[idx] ?? {};
      const nameEl = row.querySelector('[data-field="name"]');
      const iconEl = row.querySelector('[data-field="icon"]');
      const entityEl = row.querySelector('[data-field="entity"]');
      const tplEl = row.querySelector('[data-field="value_template"]');
      if (nameEl) nameEl.value = m.name ?? '';
      if (iconEl) iconEl.value = m.icon ?? 'mdi:information-outline';
      if (entityEl) entityEl.value = m.entity ?? '';
      if (tplEl) tplEl.value = m.value_template ?? '';
    });

    listEl.querySelectorAll('ha-entity-picker').forEach((el) => {
      el.hass = this._hass;
    });

    listEl.querySelectorAll('ha-textfield, ha-entity-picker').forEach((el) => {
      const onChange = () => {
        this._config = { ...(this._config ?? {}), metrics: this._readMetricsEditor() };
        this._emitConfig();
      };
      el.addEventListener('value-changed', onChange);
      el.addEventListener('change', onChange);
    });

    listEl.querySelectorAll('[data-remove-metric]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.metricEditorRow');
        const id = row?.getAttribute('data-id');
        const next = (this._config?.metrics ?? []).filter((m) => (m.id ?? '') !== (id ?? ''));
        this._config = { ...(this._config ?? {}), metrics: next };
        this._renderMetricsEditor();
        this._emitConfig();
      });
    });
  }

  set hass(hass) {
    this._hass = hass;
    // Ensure entity pickers receive hass explicitly (more reliable across HA versions).
    if (this.shadowRoot) {
      this.shadowRoot.querySelectorAll('ha-entity-picker').forEach((el) => {
        el.hass = hass;
      });
    }
    this._renderMetricsEditor();
  }

  setConfig(config) {
    this._config = { ...config };
    if (!Array.isArray(this._config.metrics)) {
      this._config.metrics = [];
    }

    this._els.title.value = this._config.title ?? '';
    this._els.totalUnit.value = this._config.totalUnit ?? 'GB';

    this._els.percentEntity.value = this._config.percent_entity ?? '';
    this._els.totalEntity.value = this._config.total_entity ?? '';
    this._els.temperatureEntity.value = this._config.temperature_entity ?? '';
    this._els.smartEntity.value = this._config.smart_entity ?? '';
    this._els.uptimeEntity.value = this._config.uptime_hours_entity ?? '';

    this._els.hoursToShow.value = this._config.hoursToShow ?? 24;
    this._els.pointsPerHour.value = this._config.pointsPerHour ?? 4;
    this._els.graphHeight.value = this._config.graphHeight ?? 60;
    this._els.graphFontSize.value = this._config.graphFontSize ?? 65;
    this._els.barWidthPx.value = this._config.barWidthPx ?? 44;
    this._els.temperatureGraphType.value = this._config.temperatureGraphType ?? DEFAULTS.temperatureGraphType;
    this._els.temperatureValueFontWeight.value =
      this._config.temperatureValueFontWeight ?? DEFAULTS.temperatureValueFontWeight;

    this._els.zoneGreenTo.value = this._config.zoneGreenTo ?? DEFAULTS.zoneGreenTo;
    this._els.zoneYellowTo.value = this._config.zoneYellowTo ?? DEFAULTS.zoneYellowTo;
    this._els.zoneGreenColor.value = this._config.zoneGreenColor ?? DEFAULTS.zoneGreenColor;
    this._els.zoneYellowColor.value = this._config.zoneYellowColor ?? DEFAULTS.zoneYellowColor;
    this._els.zoneRedColor.value = this._config.zoneRedColor ?? DEFAULTS.zoneRedColor;
    this._els.showExtrema.checked = this._config.showExtrema ?? DEFAULTS.showExtrema;

    this._els.smartPassStrings.value = (this._config.smartPassStrings ?? DEFAULTS.smartPassStrings).join(', ');
    this._els.openHistoryOnClick.checked = this._config.openHistoryOnClick ?? DEFAULTS.openHistoryOnClick;
    this._renderMetricsEditor();
  }

  _emitConfig() {
    if (!this._config) return;
    const event = new CustomEvent('config-changed', {
      detail: { config: this._config },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }
}

customElements.define('ha-disk-info-card-editor', HaDiskInfoCardEditor);

customElements.define('ha-disk-info', HaDiskInfoCard);

// Register card in the picker.
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ha-disk-info',
  name: 'Disk Info Card',
  description: 'Universal disk info card (bar + temperature chart + SMART + uptime).',
});

