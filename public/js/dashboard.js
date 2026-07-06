class DashboardPage {
  constructor() {
    this.data = window.dashboardPageData || {};
    this.theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    this.palette = {
      accent: this.theme === 'light' ? '#ff5a1f' : '#c8ff2e',
      accentSoft: this.theme === 'light' ? 'rgba(255,90,31,0.16)' : 'rgba(200,255,46,0.16)',
      muted: '#8b5cf6',
      prompt: '#8b5cf6',
      completion: '#22c55e',
      track: this.theme === 'light' ? 'rgba(25,21,16,0.10)' : 'rgba(247,241,223,0.10)',
      grid: this.theme === 'light' ? 'rgba(25,21,16,0.10)' : 'rgba(247,241,223,0.10)',
      text: this.theme === 'light' ? '#191510' : '#f7f1df',
      axis: this.theme === 'light' ? '#6d6253' : '#b2a88f',
      tooltipBg: this.theme === 'light' ? '#fffaf0' : '#171a12',
      tooltipBorder: this.theme === 'light' ? 'rgba(25,21,16,0.14)' : 'rgba(247,241,223,0.16)',
      categorical: ['#8b5cf6', '#22c55e', '#f59e0b', '#0ea5e9', '#ef4444', '#ec4899']
    };
    this.charts = [];
    this.fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
    this.renderCharts();
    this.bindActions();
    this.bindResize();
    this.refreshProcessingStatus();
    this.interval = window.setInterval(() => this.refreshProcessingStatus(), 3000);
  }

  escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  bindActions() {
    document.getElementById('scanButton')?.addEventListener('click', () => this.triggerScan());
    document.getElementById('showTagsButton')?.addEventListener('click', () => this.showCollection('/api/tagsCount', 'Tag activity', 'name'));
    document.getElementById('showCorrespondentsButton')?.addEventListener('click', () => this.showCollection('/api/correspondentsCount', 'Correspondent activity', 'name'));
    document.querySelectorAll('[data-close-modal]').forEach((button) => {
      button.addEventListener('click', () => this.closeModal());
    });
  }

  bindResize() {
    let frame = null;
    window.addEventListener('resize', () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        this.charts.forEach((chart) => chart.resize());
      });
    });
  }

  async triggerScan() {
    const button = document.getElementById('scanButton');
    const label = button?.querySelector('span');
    if (!button || button.disabled) return;

    button.disabled = true;
    if (label) label.textContent = 'Scanning...';

    try {
      const response = await fetch('/api/scan/now', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Scan failed');
      }

      document.getElementById('scanResult')?.classList.remove('hidden');
      this.refreshProcessingStatus();
    } catch (error) {
      window.alert(error.message);
    } finally {
      button.disabled = false;
      if (label) label.textContent = 'Scan now';
    }
  }

  tooltipStyle(extra = {}) {
    return {
      backgroundColor: this.palette.tooltipBg,
      borderColor: this.palette.tooltipBorder,
      borderWidth: 1,
      padding: [8, 12],
      extraCssText: 'border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,0.18);',
      textStyle: { color: this.palette.text, fontFamily: this.fontFamily, fontSize: 12 },
      ...extra
    };
  }

  initChart(id) {
    const el = document.getElementById(id);
    if (!el || !window.echarts) return null;
    const chart = window.echarts.init(el, null, { renderer: 'canvas' });
    this.charts.push(chart);
    return chart;
  }

  emptyState(containerId, message) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.classList.add('empty-state');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', message);
    el.innerHTML = `<span class="empty-title">Nothing to show yet</span><span>${this.escapeHtml(message)}</span>`;
  }

  renderCharts() {
    if (!window.echarts) return;
    this.renderProcessingChart();
    this.renderTokenMixChart();
    this.renderTokenChart();
    this.renderDocumentTypeChart();
    this.renderTimelineChart();
  }

  renderDoughnut(id, segments, cutout = '72%') {
    const chart = this.initChart(id);
    if (!chart) return;
    const total = segments.reduce((acc, seg) => acc + (seg.value || 0), 0);
    chart.setOption({
      animationDuration: 600,
      animationEasing: 'cubicOut',
      tooltip: this.tooltipStyle({
        trigger: 'item',
        formatter: (params) => {
          const pct = total > 0 ? Math.round((params.value / total) * 100) : 0;
          return `${params.marker}${params.name}: <strong>${Number(params.value).toLocaleString()}</strong> (${pct}%)`;
        }
      }),
      series: [{
        type: 'pie',
        radius: [cutout, '96%'],
        avoidLabelOverlap: false,
        padAngle: 2,
        itemStyle: { borderRadius: 6, borderColor: 'transparent', borderWidth: 0 },
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scale: true,
          scaleSize: 4,
          itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.22)' }
        },
        data: segments
      }]
    });
  }

  renderProcessingChart() {
    const processed = this.data?.counts?.processed || 0;
    const total = this.data?.counts?.documents || 0;
    const remaining = this.data?.counts?.remaining || 0;

    if (total === 0) {
      this.emptyState('processingChart', 'No documents visible to Tagvico AI yet.');
      return;
    }

    this.renderDoughnut('processingChart', [
      { name: 'Processed', value: processed, itemStyle: { color: this.palette.accent } },
      { name: 'Remaining', value: remaining, itemStyle: { color: this.palette.track } }
    ]);

    const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
    const legend = document.getElementById('processingLegend');
    if (legend) {
      legend.innerHTML = `
        <span class="legend-item"><span class="legend-dot" style="background:${this.palette.accent}"></span>Processed ${processed.toLocaleString()} (${pct}%)</span>
        <span class="legend-item"><span class="legend-dot" style="background:${this.palette.track}"></span>Remaining ${remaining.toLocaleString()}</span>
      `;
    }
  }

  renderTokenMixChart() {
    const prompt = this.data?.tokens?.promptTotal || 0;
    const completion = this.data?.tokens?.completionTotal || 0;
    const total = prompt + completion;

    if (total === 0) {
      this.emptyState('tokenMixChart', 'No token metrics yet.');
      return;
    }

    this.renderDoughnut('tokenMixChart', [
      { name: 'Prompt tokens', value: prompt, itemStyle: { color: this.palette.prompt } },
      { name: 'Completion tokens', value: completion, itemStyle: { color: this.palette.completion } }
    ], '68%');

    const promptPct = this.data?.tokens?.promptPct || 0;
    const completionPct = this.data?.tokens?.completionPct || 0;
    const legend = document.getElementById('tokenMixLegend');
    if (legend) {
      legend.innerHTML = `
        <span class="legend-item"><span class="legend-dot" style="background:${this.palette.prompt}"></span>Prompt ${promptPct}%</span>
        <span class="legend-item"><span class="legend-dot" style="background:${this.palette.completion}"></span>Completion ${completionPct}%</span>
      `;
    }
  }

  renderTokenChart() {
    const distribution = this.data?.tokenDistribution || [];
    if (!distribution.length) {
      this.emptyState('tokenDistributionChart', 'No token distribution data yet.');
      return;
    }

    const chart = this.initChart('tokenDistributionChart');
    if (!chart) return;

    chart.setOption({
      animationDuration: 600,
      animationEasing: 'cubicOut',
      grid: { top: 12, right: 12, bottom: 24, left: 40, containLabel: true },
      tooltip: this.tooltipStyle({
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: this.palette.accentSoft } },
        formatter: (params) => {
          const point = params[0];
          return `${point.axisValue}<br>${point.marker}Documents: <strong>${Number(point.value).toLocaleString()}</strong>`;
        }
      }),
      xAxis: {
        type: 'category',
        data: distribution.map((item) => item.range),
        axisLine: { lineStyle: { color: this.palette.grid } },
        axisTick: { show: false },
        axisLabel: { color: this.palette.axis, fontFamily: this.fontFamily, fontSize: 11 }
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: this.palette.grid, type: 'dashed' } },
        axisLabel: { color: this.palette.axis, fontFamily: this.fontFamily, fontSize: 11 }
      },
      series: [{
        type: 'bar',
        data: distribution.map((item) => item.count),
        barMaxWidth: 42,
        itemStyle: {
          color: this.palette.muted,
          borderRadius: [6, 6, 0, 0]
        },
        emphasis: { itemStyle: { color: this.palette.accent } }
      }]
    });
  }

  renderDocumentTypeChart() {
    const docTypes = this.data?.topDocumentTypes || [];
    if (!docTypes.length || docTypes.every((item) => !item.count)) {
      this.emptyState('documentTypeChart', 'No document types recorded yet.');
      return;
    }

    const chart = this.initChart('documentTypeChart');
    if (!chart) return;

    chart.setOption({
      animationDuration: 600,
      animationEasing: 'cubicOut',
      tooltip: this.tooltipStyle({
        trigger: 'item',
        formatter: (params) => `${params.marker}${this.escapeHtml(params.name)}: <strong>${Number(params.value).toLocaleString()}</strong> (${params.percent}%)`
      }),
      legend: {
        bottom: 0,
        icon: 'circle',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: this.palette.axis, fontFamily: this.fontFamily, fontSize: 11 }
      },
      series: [{
        type: 'pie',
        radius: ['38%', '68%'],
        center: ['50%', '44%'],
        roseType: 'radius',
        padAngle: 2,
        itemStyle: { borderRadius: 5 },
        label: { show: false },
        labelLine: { show: false },
        emphasis: { itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.22)' } },
        data: docTypes.map((item, index) => ({
          name: item.type || 'Unknown',
          value: item.count,
          itemStyle: { color: this.palette.categorical[index % this.palette.categorical.length] }
        }))
      }]
    });
  }

  renderTimelineChart() {
    const byHour = this.data?.today?.byHour || [];
    const countsByHour = new Map(byHour.map((item) => [item.hour, item.count]));
    const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
    const dataPoints = hours.map((hour) => countsByHour.get(hour) || 0);
    const total = dataPoints.reduce((acc, n) => acc + n, 0);

    if (total === 0) {
      this.emptyState('timelineChart', 'Nothing processed yet today.');
      return;
    }

    const chart = this.initChart('timelineChart');
    if (!chart) return;

    chart.setOption({
      animationDuration: 700,
      animationEasing: 'cubicOut',
      grid: { top: 16, right: 16, bottom: 24, left: 40, containLabel: true },
      tooltip: this.tooltipStyle({
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: this.palette.accent, width: 1, type: 'dashed' } },
        formatter: (params) => {
          const point = params[0];
          return `${point.axisValue}:00<br>${point.marker}<strong>${Number(point.value).toLocaleString()}</strong> document(s)`;
        }
      }),
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: hours,
        axisLine: { lineStyle: { color: this.palette.grid } },
        axisTick: { show: false },
        axisLabel: {
          color: this.palette.axis,
          fontFamily: this.fontFamily,
          fontSize: 11,
          interval: 2
        }
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: this.palette.grid, type: 'dashed' } },
        axisLabel: { color: this.palette.axis, fontFamily: this.fontFamily, fontSize: 11 }
      },
      series: [{
        type: 'line',
        data: dataPoints,
        smooth: 0.35,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        lineStyle: { color: this.palette.accent, width: 2.5 },
        itemStyle: { color: this.palette.accent },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: this.palette.accentSoft },
              { offset: 1, color: 'transparent' }
            ]
          }
        },
        emphasis: { focus: 'series' }
      }]
    });
  }

  async showCollection(url, title, labelKey) {
    const modal = document.getElementById('dashboardModal');
    const heading = document.getElementById('dashboardModalTitle');
    const content = document.getElementById('dashboardModalContent');
    if (!modal || !heading || !content) return;

    heading.textContent = title;
    content.innerHTML = '<p class="field-hint">Loading...</p>';
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');

    try {
      const response = await fetch(url);
      const items = await response.json();
      content.innerHTML = items.length
        ? items.map((item) => `
          <div class="choice-card" style="margin-bottom:0.75rem;">
            <div class="choice-title"><span>${this.escapeHtml(item[labelKey])}</span><span>${Number(item.document_count || item.count || 0).toLocaleString()}</span></div>
          </div>
        `).join('')
        : '<div class="empty-state"><span class="empty-title">Nothing here yet</span></div>';
    } catch (error) {
      content.innerHTML = '';
      const message = document.createElement('div');
      message.className = 'danger';
      message.textContent = error.message;
      content.appendChild(message);
    }
  }

  closeModal() {
    const modal = document.getElementById('dashboardModal');
    modal?.classList.remove('is-open');
    modal?.setAttribute('aria-hidden', 'true');
  }

  async refreshProcessingStatus() {
    try {
      const response = await fetch('/api/processing-status');
      const status = await response.json();
      const stateNode = document.getElementById('processingState');
      const stateWrap = document.getElementById('processingStateWrap');
      const currentNode = document.getElementById('processingCurrent');
      const lastNode = document.getElementById('processingLast');
      const todayNode = document.getElementById('processingToday');

      if (stateNode) {
        stateNode.textContent = status.currentlyProcessing ? 'Processing now' : 'Idle';
      }
      stateWrap?.classList.toggle('is-processing', !!status.currentlyProcessing);

      if (currentNode) {
        currentNode.textContent = status.currentlyProcessing
          ? `${status.currentlyProcessing.title} (#${status.currentlyProcessing.documentId})`
          : 'No active document';
      }

      if (lastNode) {
        lastNode.textContent = status.lastProcessed?.title || 'No processed documents yet';
      }

      if (todayNode) {
        todayNode.textContent = String(status.processedToday || 0);
      }
    } catch {
      // keep dashboard usable if this poll fails
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.dashboardPage = new DashboardPage();
});
