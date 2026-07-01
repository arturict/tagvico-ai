class DashboardPage {
  constructor() {
    this.data = window.dashboardPageData || {};
    this.theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    this.palette = {
      accent: this.theme === 'light' ? '#ff5a1f' : '#c8ff2e',
      muted: '#8b5cf6',
      prompt: '#8b5cf6',
      completion: '#22c55e',
      grid: 'rgba(125,125,125,0.18)'
    };
    this.renderCharts();
    this.bindActions();
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

  baseChartOptions(extra = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: this.theme === 'light' ? '#191510' : '#171a12',
          titleColor: '#f7f1df',
          bodyColor: '#f7f1df',
          padding: 10,
          cornerRadius: 4
        }
      },
      ...extra
    };
  }

  emptyState(canvasId, message) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.parentNode?.classList.add('empty-state');
    canvas.parentNode?.setAttribute('role', 'img');
    canvas.parentNode?.setAttribute('aria-label', message);
    canvas.parentNode?.insertAdjacentHTML('beforeend', `<span>${message}</span>`);
    canvas.style.display = 'none';
  }

  renderCharts() {
    if (!window.Chart) return;
    Chart.defaults.color = this.theme === 'light' ? '#6d6253' : '#b2a88f';
    this.renderProcessingChart();
    this.renderTokenMixChart();
    this.renderTokenChart();
    this.renderDocumentTypeChart();
    this.renderTimelineChart();
  }

  renderProcessingChart() {
    const canvas = document.getElementById('processingChart');
    if (!canvas) return;

    const processed = this.data?.counts?.processed || 0;
    const total = this.data?.counts?.documents || 0;
    const remaining = this.data?.counts?.remaining || 0;

    if (total === 0) {
      this.emptyState('processingChart', 'No documents visible to Archivista AI yet.');
      return;
    }

    new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Processed', 'Remaining'],
        datasets: [{
          data: [processed, remaining],
          backgroundColor: [this.palette.accent, 'rgba(125,125,125,0.22)'],
          borderWidth: 0
        }]
      },
      options: this.baseChartOptions({
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const value = ctx.raw || 0;
                const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                return `${ctx.label}: ${value.toLocaleString()} (${pct}%)`;
              }
            }
          }
        }
      })
    });

    const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
    document.getElementById('processingLegend').innerHTML = `
      <span class="legend-item"><span class="legend-dot" style="background:${this.palette.accent}"></span>Processed ${processed.toLocaleString()} (${pct}%)</span>
      <span class="legend-item"><span class="legend-dot" style="background:rgba(125,125,125,0.4)"></span>Remaining ${remaining.toLocaleString()}</span>
    `;
  }

  renderTokenMixChart() {
    const canvas = document.getElementById('tokenMixChart');
    if (!canvas) return;

    const prompt = this.data?.tokens?.promptTotal || 0;
    const completion = this.data?.tokens?.completionTotal || 0;
    const total = prompt + completion;

    if (total === 0) {
      this.emptyState('tokenMixChart', 'No token metrics yet.');
      return;
    }

    new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Prompt tokens', 'Completion tokens'],
        datasets: [{
          data: [prompt, completion],
          backgroundColor: [this.palette.prompt, this.palette.completion],
          borderWidth: 0
        }]
      },
      options: this.baseChartOptions({
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const value = ctx.raw || 0;
                const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                return `${ctx.label}: ${value.toLocaleString()} (${pct}%)`;
              }
            }
          }
        }
      })
    });

    const promptPct = this.data?.tokens?.promptPct || 0;
    const completionPct = this.data?.tokens?.completionPct || 0;
    document.getElementById('tokenMixLegend').innerHTML = `
      <span class="legend-item"><span class="legend-dot" style="background:${this.palette.prompt}"></span>Prompt ${promptPct}%</span>
      <span class="legend-item"><span class="legend-dot" style="background:${this.palette.completion}"></span>Completion ${completionPct}%</span>
    `;
  }

  renderTokenChart() {
    const canvas = document.getElementById('tokenDistributionChart');
    if (!canvas) return;

    const distribution = this.data?.tokenDistribution || [];
    if (!distribution.length) {
      this.emptyState('tokenDistributionChart', 'No token distribution data yet.');
      return;
    }

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: distribution.map((item) => item.range),
        datasets: [{
          label: 'Documents',
          data: distribution.map((item) => item.count),
          backgroundColor: this.palette.muted,
          borderRadius: 6
        }]
      },
      options: this.baseChartOptions({
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: this.palette.grid } }
        }
      })
    });
  }

  renderDocumentTypeChart() {
    const canvas = document.getElementById('documentTypeChart');
    if (!canvas) return;

    const docTypes = this.data?.topDocumentTypes || [];
    if (!docTypes.length || docTypes.every((item) => !item.count)) {
      this.emptyState('documentTypeChart', 'No document types recorded yet.');
      return;
    }

    const colors = ['#8b5cf6', '#22c55e', '#f59e0b', '#0ea5e9', '#ef4444', '#ec4899'];
    new Chart(canvas, {
      type: 'polarArea',
      data: {
        labels: docTypes.map((item) => item.type || 'Unknown'),
        datasets: [{
          data: docTypes.map((item) => item.count),
          backgroundColor: colors.slice(0, docTypes.length).map((c) => `${c}99`)
        }]
      },
      options: this.baseChartOptions({
        plugins: {
          legend: { display: true, position: 'bottom', labels: { boxWidth: 12 } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw.toLocaleString()}` } }
        },
        scales: { r: { ticks: { display: false }, grid: { color: this.palette.grid } } }
      })
    });
  }

  renderTimelineChart() {
    const canvas = document.getElementById('timelineChart');
    if (!canvas) return;

    const byHour = this.data?.today?.byHour || [];
    const countsByHour = new Map(byHour.map((item) => [item.hour, item.count]));
    const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
    const dataPoints = hours.map((hour) => countsByHour.get(hour) || 0);
    const total = dataPoints.reduce((acc, n) => acc + n, 0);

    if (total === 0) {
      this.emptyState('timelineChart', 'Nothing processed yet today.');
      return;
    }

    new Chart(canvas, {
      type: 'line',
      data: {
        labels: hours,
        datasets: [{
          label: 'Processed today',
          data: dataPoints,
          borderColor: this.palette.accent,
          backgroundColor: this.theme === 'light' ? 'rgba(255,90,31,0.18)' : 'rgba(200,255,46,0.16)',
          tension: 0.35,
          fill: true,
          pointRadius: 2
        }]
      },
      options: this.baseChartOptions({
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { title: (items) => `${items[0].label}:00`, label: (ctx) => `${ctx.raw.toLocaleString()} document(s)` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
          y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: this.palette.grid } }
        }
      })
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
