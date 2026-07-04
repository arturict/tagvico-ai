class OperationsPage {
  constructor() {
    this.ocrRows = document.getElementById('ocrRows');
    this.failureRows = document.getElementById('failureRows');
    this.notice = document.getElementById('operationNotice');
    this.bind();
    this.refresh();
  }

  escape(value) {
    const node = document.createElement('span');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
  }

  message(text) { this.notice.hidden = false; this.notice.textContent = text; }

  bind() {
    document.getElementById('refreshOcr')?.addEventListener('click', () => this.loadOcr());
    document.getElementById('refreshFailures')?.addEventListener('click', () => this.loadFailures());
    document.getElementById('stopScan')?.addEventListener('click', () => this.stopScan());
    document.getElementById('addOcrForm')?.addEventListener('submit', (event) => this.addOcr(event));
    this.ocrRows?.addEventListener('click', (event) => this.handleOcrAction(event));
    this.failureRows?.addEventListener('click', (event) => this.handleFailureAction(event));
  }

  async refresh() { await Promise.all([this.loadOcr(), this.loadFailures()]); }

  async loadOcr() {
    const response = await fetch('/api/ocr/queue?limit=100');
    const payload = await response.json();
    this.ocrRows.innerHTML = (payload.rows || []).map((row) => `<tr><td><strong>#${row.document_id}</strong><br><small>${this.escape(row.title)}</small></td><td><span class="status-chip">${this.escape(row.status)}</span></td><td>${row.attempts}</td><td><div class="row-actions"><button class="button" data-action="process" data-id="${row.document_id}">Run</button><button class="button-secondary" data-action="remove" data-id="${row.document_id}">Remove</button></div></td></tr>`).join('') || '<tr><td colspan="4">No OCR rescue work is queued.</td></tr>';
  }

  async loadFailures() {
    const response = await fetch('/api/failures?limit=100');
    const payload = await response.json();
    document.getElementById('failureCount').textContent = payload.total || 0;
    this.failureRows.innerHTML = (payload.rows || []).map((row) => `<tr><td><strong>#${row.document_id}</strong><br><small>${this.escape(row.title)}</small></td><td>${this.escape(row.failed_reason)}</td><td>${row.attempts}</td><td><div class="row-actions"><button class="button-secondary" data-action="reset" data-id="${row.document_id}">Reset</button></div></td></tr>`).join('') || '<tr><td colspan="4">No terminal failures.</td></tr>';
  }

  async addOcr(event) {
    event.preventDefault();
    const input = document.getElementById('ocrDocumentId');
    const response = await fetch('/api/ocr/queue', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ documentId:Number(input.value) }) });
    if (!response.ok) return this.message((await response.json()).error || 'Could not add document');
    input.value = ''; this.message('Document added to the OCR rescue queue.'); await this.loadOcr();
  }

  async handleOcrAction(event) {
    const button = event.target.closest('button[data-action]'); if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.action === 'remove') await fetch(`/api/ocr/queue/${id}`, { method:'DELETE' });
    if (button.dataset.action === 'process') {
      button.disabled = true; this.message(`Processing document ${id}…`);
      const response = await fetch(`/api/ocr/process/${id}`, { method:'POST' });
      const text = await response.text();
      const events = text.trim().split('\n\n').map((line) => { try { return JSON.parse(line.replace(/^data:\s*/,'')); } catch { return null; } }).filter(Boolean);
      this.message(events.at(-1)?.message || `Processing finished for document ${id}.`);
    }
    await this.refresh();
  }

  async handleFailureAction(event) {
    const button = event.target.closest('button[data-action="reset"]'); if (!button) return;
    await fetch(`/api/failures/${button.dataset.id}/reset`, { method:'POST' });
    this.message(`Document ${button.dataset.id} may be scanned again.`); await this.loadFailures();
  }

  async stopScan() {
    const response = await fetch('/api/scan/stop', { method:'POST' });
    const payload = await response.json(); this.message(payload.message || payload.error || 'Stop requested.');
  }
}
document.addEventListener('DOMContentLoaded', () => new OperationsPage());
