class ManualPage {
  constructor() {
    this.documentSelect = document.getElementById('documentSelect');
    this.preview = document.getElementById('contentPreview');
    this.tagsInput = document.getElementById('tagsInput');
    this.correspondentInput = document.getElementById('correspondentInput');
    this.documentTypeInput = document.getElementById('documentTypeInput');
    this.titleInput = document.getElementById('titleInput');
    this.ownerInput = document.getElementById('ownerInput');
    this.message = document.getElementById('manualMessage');
    this.currentDocumentId = null;
    this.bind();
    this.loadDocuments();
  }

  bind() {
    this.documentSelect?.addEventListener('change', () => this.loadDocument(this.documentSelect.value));
    document.getElementById('analyzeButton')?.addEventListener('click', () => this.analyze());
    document.getElementById('saveButton')?.addEventListener('click', () => this.save());
  }

  async loadDocuments() {
    const response = await fetch('/manual/documents');
    const documents = await response.json();
    this.documentSelect.innerHTML = '<option value="">Choose a document...</option>' + documents.map((doc) => `<option value="${doc.id}">${doc.title || doc.original_filename || `Document ${doc.id}`}</option>`).join('');
  }

  async loadDocument(documentId) {
    if (!documentId) return;
    this.currentDocumentId = documentId;

    const response = await fetch(`/manual/preview/${documentId}`);
    const doc = await response.json();

    this.preview.textContent = doc.content || 'No content available';
    this.tagsInput.value = Array.isArray(doc.tags) ? doc.tags.join(', ') : '';
    this.correspondentInput.value = doc.correspondent?.name || '';
    this.documentTypeInput.value = doc.documentType || '';
    this.titleInput.value = doc.title || '';
    this.ownerInput.value = doc.owner?.id || '';
  }

  async analyze() {
    if (!this.currentDocumentId) return;

    const response = await fetch('/manual/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: this.preview.textContent,
        id: this.currentDocumentId,
        existingTags: this.tagsInput.value.split(',').map((tag) => tag.trim()).filter(Boolean)
      })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Analysis failed');
    }

    const doc = result.document || {};
    this.tagsInput.value = Array.isArray(doc.tags) ? doc.tags.join(', ') : this.tagsInput.value;
    this.correspondentInput.value = doc.correspondent || this.correspondentInput.value;
    this.documentTypeInput.value = doc.document_type || this.documentTypeInput.value;
    this.titleInput.value = doc.title || this.titleInput.value;
    this.showMessage('AI suggestions refreshed.', 'success');
  }

  async save() {
    if (!this.currentDocumentId) return;

    const payload = {
      documentId: this.currentDocumentId,
      tags: this.tagsInput.value.split(',').map((tag) => tag.trim()).filter(Boolean),
      correspondent: this.correspondentInput.value.trim(),
      documentType: this.documentTypeInput.value.trim(),
      title: this.titleInput.value.trim(),
      ownerId: this.ownerInput.value || null
    };

    const response = await fetch('/manual/updateDocument', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to update document');
    }

    this.showMessage('Document updated successfully.', 'success');
  }

  showMessage(text, type) {
    this.message.textContent = text;
    this.message.className = type === 'success' ? 'success' : 'danger';
    this.message.classList.remove('hidden');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.manualPage = new ManualPage();
});
