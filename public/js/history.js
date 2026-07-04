class HistoryPage {
  constructor() {
    this.table = this.initTable();
    this.bind();
  }

  initTable() {
    return $('#historyTable').DataTable({
      serverSide: true,
      processing: true,
      ajax: {
        url: '/api/history',
        data: (query) => {
          query.tag = $('#tagFilter').val();
          query.correspondent = $('#correspondentFilter').val();
        }
      },
      columns: [
        {
          data: 'document_id',
          render: (data) => `<input type="checkbox" class="history-select" value="${data}">`,
          orderable: false,
          width: '36px'
        },
        { data: 'document_id' },
        {
          data: 'title',
          render: (data, type, row) => type === 'display'
            ? `<div><strong>${data}</strong><div class="field-hint">${new Date(row.created_at).toLocaleString()}</div></div>`
            : data
        },
        {
          data: 'tags',
          render: (data) => (data || []).map((tag) => `<span class="badge">${tag.name}</span>`).join(' ')
        },
        { data: 'correspondent' },
        {
          data: 'document_id',
          orderable: false,
          render: (id) => this.renderChangesCell(id)
        },
        {
          data: 'link',
          render: (link, type, row) => `<div class="row-actions"><a class="button-secondary" href="${link}" target="_blank" rel="noreferrer">Open</a><button class="button-secondary history-action" data-action="rescan" data-id="${row.document_id}">Rescan</button><button class="button-danger history-action" data-action="restore" data-id="${row.document_id}">Restore</button></div>`,
          orderable: false
        }
      ],
      pageLength: 10,
      order: [[1, 'desc']]
    });
  }

  renderChangesCell(documentId) {
    // Static placeholder — gets replaced on demand when the user opens
    // the <details> element (see bind()).
    return `<details class="history-diff" data-document-id="${documentId}">
      <summary>View</summary>
      <div class="history-diff-body" data-state="loading">Loading…</div>
    </details>`;
  }

  async loadDiff(details) {
    const body = details.querySelector('.history-diff-body');
    if (!body || body.dataset.state !== 'loading') return;
    const documentId = details.dataset.documentId;
    body.dataset.state = 'loading';
    body.textContent = 'Loading…';
    try {
      const response = await fetch(`/api/history/${documentId}/diff`);
      if (response.status === 404) {
        body.dataset.state = 'empty';
        body.textContent = 'No diff recorded for this document yet.';
        return;
      }
      if (!response.ok) {
        body.dataset.state = 'error';
        body.textContent = 'Failed to load diff.';
        return;
      }
      const payload = await response.json();
      const diff = Array.isArray(payload.diff) ? payload.diff : [];
      if (diff.length === 0) {
        body.dataset.state = 'empty';
        body.textContent = 'No changes recorded.';
        return;
      }
      body.dataset.state = 'loaded';
      body.innerHTML = this.formatDiff(diff);
    } catch (error) {
      body.dataset.state = 'error';
      body.textContent = 'Failed to load diff.';
    }
  }

  formatDiff(diff) {
    return `<ul class="history-diff-list">${diff.map((entry) => `
      <li>
        <code>${this.escape(entry.field)}</code>:
        <span class="diff-before">${this.escape(JSON.stringify(entry.before))}</span>
        →
        <span class="diff-after">${this.escape(JSON.stringify(entry.after))}</span>
        ${entry.error ? `<span class="diff-error">(${this.escape(entry.error)})</span>` : ''}
      </li>`).join('')}</ul>`;
  }

  escape(value) {
    if (value === undefined) return '(unset)';
    const str = value === null ? 'null' : String(value);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  bind() {
    $('#tagFilter, #correspondentFilter').on('change', () => this.table.ajax.reload());
    document.getElementById('resetSelectedBtn')?.addEventListener('click', () => this.resetSelected());
    document.getElementById('resetAllBtn')?.addEventListener('click', () => this.resetAll());
    document.getElementById('historyTable')?.addEventListener('click', (event) => this.handleAction(event));
    document.addEventListener('toggle', (event) => {
      const target = event.target;
      if (target instanceof HTMLDetailsElement && target.classList.contains('history-diff')) {
        if (target.open) this.loadDiff(target);
      }
    }, true);
  }

  async handleAction(event) {
    const button = event.target.closest('.history-action');
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === 'restore' && !window.confirm(`Restore document ${id} to its first saved metadata snapshot?`)) return;
    const response = await fetch(`/api/history/${id}/${action}`, { method: 'POST' });
    if (!response.ok) {
      const payload = await response.json();
      window.alert(payload.error || `${action} failed`);
      return;
    }
    this.table.ajax.reload();
  }

  getSelectedIds() {
    return Array.from(document.querySelectorAll('.history-select:checked')).map((node) => Number(node.value));
  }

  async resetSelected() {
    const ids = this.getSelectedIds();
    if (!ids.length) {
      window.alert('Select at least one document first.');
      return;
    }

    const response = await fetch('/api/reset-documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to reset documents');
    }

    this.table.ajax.reload();
  }

  async resetAll() {
    const response = await fetch('/api/reset-all-documents', { method: 'POST' });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to reset documents');
    }

    this.table.ajax.reload();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.historyPage = new HistoryPage();
});
