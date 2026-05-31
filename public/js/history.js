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
          data: 'link',
          render: (link) => `<a class="button-secondary" href="${link}" target="_blank" rel="noreferrer">Open</a>`,
          orderable: false
        }
      ],
      pageLength: 10,
      order: [[1, 'desc']]
    });
  }

  bind() {
    $('#tagFilter, #correspondentFilter').on('change', () => this.table.ajax.reload());
    document.getElementById('resetSelectedBtn')?.addEventListener('click', () => this.resetSelected());
    document.getElementById('resetAllBtn')?.addEventListener('click', () => this.resetAll());
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
