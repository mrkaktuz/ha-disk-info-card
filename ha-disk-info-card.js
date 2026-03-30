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
  barMinHeightPx: 180,
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

  // Metrics typography
  metricPrimaryFontSize: 13,
  metricSecondaryFontSize: 12,
};

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

class HaDiskInfoCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._config = null;
    this._activeGraphKey = 'temperature';
    this._graphEl = null;

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

    this._activeGraphKey = this._config.initial_graph_key ?? 'temperature';
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
        height: ${cfg.barMinHeightPx}px;
        position: relative;
        border-radius: 10px;
        overflow: hidden;
        background: rgba(120, 120, 120, 0.12);
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
        flex-direction: column;
        gap: 2px;
        margin-bottom: -2px;
      }

      .graph {
        width: 100%;
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
        align-items: center;
        gap: 10px;
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
      }
      .metricPrimary {
        font-size: ${cfg.metricPrimaryFontSize}px;
        font-weight: 600;
        white-space: normal;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .metricSecondary {
        font-size: ${cfg.metricSecondaryFontSize}px;
        opacity: 0.65;
        white-space: normal;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
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
          <div class="content">
            <div class="graphHeader">
              <div class="title">${escapeHtml(cfg.title)}</div>
              ${cfg.showSubtitle && cfg.subtitle ? `<div class="subtitle">${escapeHtml(cfg.subtitle)}</div>` : ''}
            </div>
            <div class="graph" id="${graphHostId}"></div>
            <div class="metrics">
              <button class="metricBtn" data-metric="used" aria-pressed="false">
                <ha-icon class="metricIcon" id="icon-used" icon="${escapeHtml(cfg.icons.used)}"></ha-icon>
                <div class="metricText">
                  <div class="metricPrimary" id="text-used-primary">—</div>
                  <div class="metricSecondary" id="text-used-secondary">Зайнято / всього</div>
                </div>
              </button>
              <button class="metricBtn" data-metric="smart" aria-pressed="false">
                <ha-icon class="metricIcon" id="icon-smart" icon="${escapeHtml(cfg.icons.smart)}"></ha-icon>
                <div class="metricText">
                  <div class="metricPrimary" id="text-smart-primary">—</div>
                  <div class="metricSecondary" id="text-smart-secondary">SMART</div>
                </div>
              </button>
              <button class="metricBtn" data-metric="uptime" aria-pressed="false">
                <ha-icon class="metricIcon" id="icon-uptime" icon="${escapeHtml(cfg.icons.uptime)}"></ha-icon>
                <div class="metricText">
                  <div class="metricPrimary" id="text-uptime-primary">—</div>
                  <div class="metricSecondary" id="text-uptime-secondary">Напрацювання</div>
                </div>
              </button>
            </div>
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
    this._barPctEl = this.shadowRoot.getElementById('bar-pct');

    this._usedPrimaryEl = this.shadowRoot.getElementById('text-used-primary');
    this._smartPrimaryEl = this.shadowRoot.getElementById('text-smart-primary');
    this._uptimePrimaryEl = this.shadowRoot.getElementById('text-uptime-primary');

    this._iconSmartEl = this.shadowRoot.getElementById('icon-smart');

    const host = this.shadowRoot.getElementById(graphHostId);
    this._graphHostEl = host;

    // Hook clicks once.
    this.shadowRoot.querySelectorAll('.metricBtn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-metric');
        this._onMetricClick(key);
      });
    });
  }

  _onMetricClick(metricKey) {
    // Map metric -> graph entity key.
    if (metricKey === 'used') this._activeGraphKey = 'usedPercent';
    if (metricKey === 'smart') this._activeGraphKey = 'smart';
    if (metricKey === 'uptime') this._activeGraphKey = 'uptimeHours';

    // Update active state UI.
    this.shadowRoot.querySelectorAll('.metricBtn').forEach((btn) => {
      const k = btn.getAttribute('data-metric');
      const pressed =
        (metricKey === 'used' && this._activeGraphKey === 'usedPercent') ||
        (metricKey === 'smart' && this._activeGraphKey === 'smart') ||
        (metricKey === 'uptime' && this._activeGraphKey === 'uptimeHours');
      btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    });

    // Optionally open the entity history page.
    if (this._config?.openHistoryOnClick) {
      const cfg = this._config;
      let entityId = null;
      if (metricKey === 'used') entityId = cfg.percent_entity;
      if (metricKey === 'smart') entityId = cfg.smart_entity;
      if (metricKey === 'uptime') entityId = cfg.uptime_hours_entity;
      if (entityId) {
        const base = cfg.historyPath ?? '/history';
        const url = `${base}?entity_id=${encodeURIComponent(entityId)}`;
        window.location.href = url;
        return; // navigation will happen
      }
    }

    this._updateGraphConfig();
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

    switch (this._activeGraphKey) {
      case 'temperature':
        entityId = cfg.temperature_entity;
        entityName = cfg.temperature_name ?? 'Темп.';
        lineColor = cfg.graphLineColors.temperature;
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
      height: cfg.graphHeight,
      font_size: cfg.graphFontSize,
      line_color: lineColor,
      group: true,
      show: {
        graph: 'line',
        fill: 'fade',
        points: 'hover',
        extrema: !!cfg.showExtrema,
        legend: false,
        icon: false,
        name: false,
        state: true,
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

    const percent = this._getNumberState(cfg.percent_entity);
    const total = this._getNumberState(cfg.total_entity);
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

    // Used / total text
    if (this._usedPrimaryEl) {
      const usedText = computeUsedText(total, p, cfg.totalUnit);
      this._usedPrimaryEl.textContent = usedText;
    }

    // SMART parse
    const smartNorm = (smartRaw ?? '').toString().toLowerCase().trim();
    const passed = (cfg.smartPassStrings ?? []).some((s) => smartNorm.includes(s.toLowerCase()));
    if (this._smartPrimaryEl) {
      this._smartPrimaryEl.textContent = passed ? cfg.smartPassLabel : cfg.smartFailLabel;
    }
    if (this._iconSmartEl) {
      this._iconSmartEl.style.color = passed ? '#4caf50' : '#e53935';
    }

    // Uptime formatting
    if (this._uptimePrimaryEl) {
      this._uptimePrimaryEl.textContent = formatUptimeHours(
        uptimeH,
        cfg.uptimeHoursPerYear,
        cfg.uptimeHoursPerDay
      );
    }
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
        ha-textfield, ha-entity-picker { width: 100%; }
      </style>
      <div class="row">
        <ha-textfield id="title" label="Title"></ha-textfield>
        <ha-textfield id="subtitle" label="Subtitle"></ha-textfield>
        <ha-textfield id="totalUnit" label="Total unit (e.g. GB)"></ha-textfield>
      </div>

      <div class="row">
        <ha-switch id="showSubtitle" style="margin-top: 6px;"></ha-switch>
        <div class="hint">Show subtitle under title</div>
      </div>

      <div class="row">
        <ha-entity-picker id="percentEntity" label="Percent entity (0..100)"></ha-entity-picker>
        <ha-entity-picker id="totalEntity" label="Total entity (used/total denominator)"></ha-entity-picker>
        <ha-entity-picker id="temperatureEntity" label="Temperature entity"></ha-entity-picker>
        <ha-entity-picker id="smartEntity" label="SMART result entity (text)"></ha-entity-picker>
        <ha-entity-picker id="uptimeEntity" label="Uptime (hours) entity"></ha-entity-picker>
      </div>

      <div class="grid2">
        <ha-textfield id="hoursToShow" label="hours_to_show"></ha-textfield>
        <ha-textfield id="pointsPerHour" label="points_per_hour"></ha-textfield>
      </div>

      <div class="grid2">
        <ha-textfield id="graphHeight" label="graph height (px)"></ha-textfield>
        <ha-textfield id="graphFontSize" label="graph font size"></ha-textfield>
      </div>

      <div class="grid2">
        <ha-textfield id="barWidthPx" label="bar width (px)"></ha-textfield>
        <ha-textfield id="barMinHeightPx" label="bar min height (px)"></ha-textfield>
      </div>

      <div class="grid2">
        <ha-textfield id="zoneGreenTo" label="zone_green_to (green <=)"></ha-textfield>
        <ha-textfield id="zoneYellowTo" label="zone_yellow_to (yellow <=)"></ha-textfield>
      </div>

      <div class="row">
        <ha-switch id="showExtrema" style="margin-top: 6px;"></ha-switch>
        <div class="hint">Show min/max on temperature graph</div>
      </div>

      <div class="row">
        <ha-textfield id="smartPassStrings" label="SMART pass keywords (comma separated)"></ha-textfield>
        <div class="hint">
          If SMART text contains any of these keywords (case-insensitive), it will be treated as Passed.
        </div>
      </div>

      <div class="row">
        <ha-switch id="openHistoryOnClick" style="margin-top: 6px;"></ha-switch>
        <div class="hint">Open entity history page when clicking metrics.</div>
      </div>
    `;

    this._els = {
      title: this.shadowRoot.getElementById('title'),
      subtitle: this.shadowRoot.getElementById('subtitle'),
      showSubtitle: this.shadowRoot.getElementById('showSubtitle'),
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
      barMinHeightPx: this.shadowRoot.getElementById('barMinHeightPx'),
      zoneGreenTo: this.shadowRoot.getElementById('zoneGreenTo'),
      zoneYellowTo: this.shadowRoot.getElementById('zoneYellowTo'),
      showExtrema: this.shadowRoot.getElementById('showExtrema'),
      smartPassStrings: this.shadowRoot.getElementById('smartPassStrings'),
      openHistoryOnClick: this.shadowRoot.getElementById('openHistoryOnClick'),
    };

    const textChanged = (key, parser) => (ev) => {
      const val = ev.target.value;
      this._config = this._config ?? {};
      this._config = { ...this._config, [key]: parser ? parser(val) : val };
      this._emitConfig();
    };

    // ha-textfield can emit either `value-changed` or `change` depending on HA version.
    this._els.title.addEventListener('value-changed', textChanged('title'));
    this._els.title.addEventListener('change', textChanged('title'));
    this._els.subtitle.addEventListener('value-changed', textChanged('subtitle'));
    this._els.subtitle.addEventListener('change', textChanged('subtitle'));
    this._els.totalUnit.addEventListener('value-changed', textChanged('totalUnit'));
    this._els.totalUnit.addEventListener('change', textChanged('totalUnit'));

    const numChanged = (key) => (ev) => {
      const v = ev.target.value;
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
    bindNum(this._els.barMinHeightPx, 'barMinHeightPx');
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
    bindSwitch(this._els.showSubtitle, 'showSubtitle');
    bindSwitch(this._els.showExtrema, 'showExtrema');

    this._els.smartPassStrings.addEventListener('value-changed', (ev) => {
      const raw = (ev.target.value ?? '').toString();
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

  set hass(hass) {
    this._hass = hass;
    // Ensure entity pickers receive hass explicitly (more reliable across HA versions).
    if (this.shadowRoot) {
      this.shadowRoot.querySelectorAll('ha-entity-picker').forEach((el) => {
        el.hass = hass;
      });
    }
  }

  setConfig(config) {
    this._config = { ...config };

    this._els.title.value = this._config.title ?? '';
    this._els.subtitle.value = this._config.subtitle ?? '';
    this._els.showSubtitle.checked = this._config.showSubtitle ?? DEFAULTS.showSubtitle;
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
    this._els.barMinHeightPx.value = this._config.barMinHeightPx ?? 180;

    this._els.zoneGreenTo.value = this._config.zoneGreenTo ?? DEFAULTS.zoneGreenTo;
    this._els.zoneYellowTo.value = this._config.zoneYellowTo ?? DEFAULTS.zoneYellowTo;
    this._els.showExtrema.checked = this._config.showExtrema ?? DEFAULTS.showExtrema;

    this._els.smartPassStrings.value = (this._config.smartPassStrings ?? DEFAULTS.smartPassStrings).join(', ');
    this._els.openHistoryOnClick.checked = this._config.openHistoryOnClick ?? DEFAULTS.openHistoryOnClick;
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
  name: 'Disk info card',
  description: 'Universal disk info card (bar + temperature chart + SMART + uptime).',
});

