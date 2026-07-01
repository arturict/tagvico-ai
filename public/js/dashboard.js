class DashboardPage {
  constructor() {
    this.data = window.dashboardPageData || {};
    this.renderCharts();
    this.bindActions();
    this.refreshProcessingStatus();
    window.setInterval(() => this.refreshProcessingStatus(), 3000);
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

  renderCharts() {
    if (!window.Chart) return;

    this.renderProcessingChart();
    this.renderTokenChart();
    this.renderDocumentTypeChart();
    this.renderTimelineChart();
  }

  renderProcessingChart() {
    const canvas = document.getElementById('processingChart');
    if (!canvas) return;

    const processed = this.data.processedCount || 0;
    const total = this.data.documentCount || 0;
    const remaining = Math.max(total - processed, 0);

    new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Processed', 'Remaining'],
        datasets: [{
          data: [processed, remaining],
          backgroundColor: ['#8b5cf6', '#1f2937'],
          borderWidth: 0
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        cutout: '72%'
      }
    });
  }

  renderTokenChart() {
    const canvas = document.getElementById('tokenDistributionChart');
    if (!canvas) return;

    const distribution = this.data.tokenDistribution || [];
    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: distribution.map((item) => item.range),
        datasets: [{
          label: 'Documents',
          data: distribution.map((item) => item.count),
          backgroundColor: '#14b8a6',
          borderRadius: 10
        }]
      },
      options: {
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  renderDocumentTypeChart() {
    const canvas = document.getElementById('documentTypeChart');
    if (!canvas) return;

    const docTypes = (this.data.documentTypes || []).slice(0, 6);
    new Chart(canvas, {
      type: 'polarArea',
      data: {
        labels: docTypes.map((item) => item.type || 'Unknown'),
        datasets: [{
          data: docTypes.map((item) => item.count),
          backgroundColor: ['#8b5cf6', '#22c55e', '#f59e0b', '#0ea5e9', '#ef4444', '#ec4899']
        }]
      },
      options: {
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  renderTimelineChart() {
    const canvas = document.getElementById('timelineChart');
    if (!canvas) return;

    const timeline = this.data.processingTimeStats || [];
    const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
    const countsByHour = new Map(timeline.map((item) => [item.hour, item.count]));

    new Chart(canvas, {
      type: 'line',
      data: {
        labels: hours,
        datasets: [{
          label: 'Processed today',
          data: hours.map((hour) => countsByHour.get(hour) || 0),
          borderColor: '#8b5cf6',
          tension: 0.35,
          fill: false
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
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

    try {
      const response = await fetch(url);
      const items = await response.json();
      content.innerHTML = items.map((item) => `
        <div class="choice-card" style="margin-bottom:0.75rem;">
          <div class="choice-title"><span>${item[labelKey]}</span><span>${item.document_count || item.count || 0}</span></div>
        </div>
      `).join('');
    } catch (error) {
      content.innerHTML = `<div class="danger">${error.message}</div>`;
    }
  }

  closeModal() {
    document.getElementById('dashboardModal')?.classList.remove('is-open');
  }

  async refreshProcessingStatus() {
    try {
      const response = await fetch('/api/processing-status');
      const status = await response.json();
      const stateNode = document.getElementById('processingState');
      const currentNode = document.getElementById('processingCurrent');
      const lastNode = document.getElementById('processingLast');
      const todayNode = document.getElementById('processingToday');

      if (stateNode) {
        stateNode.textContent = status.currentlyProcessing ? 'Processing now' : 'Idle';
      }

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
