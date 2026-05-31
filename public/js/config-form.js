class ConfigFormApp {
  constructor() {
    this.form = document.getElementById('configForm');
    this.providerInput = document.getElementById('aiProvider');
    this.modelInput = document.getElementById('aiModel');
    this.customFieldInput = document.getElementById('customFieldsJson');
    this.customFieldList = document.getElementById('customFieldList');
    this.ollamaModelSelect = document.getElementById('ollamaModelSelect');
    this.ollamaCustomModel = document.getElementById('ollamaCustomModel');
    this.ollamaUrl = document.getElementById('ollamaUrl');
    this.initProviderSelection();
    this.initModelSelection();
    this.initOllamaDiscovery();
    this.initPaperlessDiscovery();
    this.initCustomFields();
    this.initToggleCards();
    this.initSubmit();
  }

  initProviderSelection() {
    document.querySelectorAll('[data-provider-choice]').forEach((button) => {
      button.addEventListener('click', () => {
        const provider = button.dataset.providerChoice;
        this.providerInput.value = provider;
        document.querySelectorAll('[data-provider-choice]').forEach((item) => item.classList.toggle('is-selected', item === button));
        document.querySelectorAll('[data-provider-panel]').forEach((panel) => {
          panel.classList.toggle('hidden', panel.dataset.providerPanel !== provider);
        });

        this.syncModelValue();

        if (provider === 'ollama') {
          this.loadOllamaModels();
        }
      });
    });
  }

  initModelSelection() {
    document.querySelectorAll('[data-model-choice]').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('[data-model-choice]').forEach((item) => item.classList.toggle('is-selected', item === button));
        this.modelInput.value = button.dataset.modelChoice;
        const custom = document.getElementById('openrouterCustomModel');
        if (custom) custom.value = '';
      });
    });

    ['openrouterCustomModel', 'compatibleModel', 'openaiModel', 'ollamaCustomModel'].forEach((id) => {
      const input = document.getElementById(id);
      input?.addEventListener('input', () => this.syncModelValue());
      input?.addEventListener('change', () => this.syncModelValue());
    });

    this.ollamaModelSelect?.addEventListener('change', () => {
      if (this.ollamaModelSelect.value) {
        this.ollamaCustomModel.value = this.ollamaModelSelect.value;
        this.syncModelValue();
      }
    });
  }

  syncModelValue() {
    const provider = this.providerInput.value;
    if (provider === 'openrouter') {
      const custom = document.getElementById('openrouterCustomModel')?.value.trim();
      const preset = document.querySelector('[data-model-choice].is-selected')?.dataset.modelChoice;
      this.modelInput.value = custom || preset || 'openai/gpt-5.4-nano';
      return;
    }

    if (provider === 'ollama') {
      this.modelInput.value = this.ollamaCustomModel?.value.trim() || this.ollamaModelSelect?.value || 'llama3.2';
      return;
    }

    if (provider === 'compatible') {
      this.modelInput.value = document.getElementById('compatibleModel')?.value.trim() || '';
      return;
    }

    if (provider === 'openai') {
      this.modelInput.value = document.getElementById('openaiModel')?.value.trim() || 'gpt-5.4-mini';
      return;
    }

    if (provider === 'azure') {
      this.modelInput.value = document.getElementById('azureDeploymentName')?.value.trim() || '';
    }
  }

  async loadOllamaModels() {
    if (!this.ollamaModelSelect || !this.ollamaUrl) return;
    this.ollamaModelSelect.innerHTML = '<option>Loading models...</option>';

    try {
      const response = await fetch(`/api/ollama/models?url=${encodeURIComponent(this.ollamaUrl.value.trim())}`);
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error || 'Unable to load Ollama models');
      }

      this.ollamaModelSelect.innerHTML = payload.models.length
        ? payload.models.map((model) => `<option value="${model.slug}">${model.name}</option>`).join('')
        : '<option value="">No models found</option>';

      if (this.ollamaCustomModel?.value) {
        this.ollamaModelSelect.value = this.ollamaCustomModel.value;
      }
    } catch (error) {
      this.ollamaModelSelect.innerHTML = '<option value="">Could not load models</option>';
    }
  }

  initOllamaDiscovery() {
    document.getElementById('refreshOllamaModels')?.addEventListener('click', () => this.loadOllamaModels());
    this.ollamaUrl?.addEventListener('change', () => this.loadOllamaModels());
    if (this.providerInput.value === 'ollama') {
      this.loadOllamaModels();
    }
  }

  // ---- Paperless-ngx discovery / quick-add ----
  initPaperlessDiscovery() {
    this.paperlessUrl = document.getElementById('paperlessUrl');
    this.discoveryStatus = document.getElementById('paperlessDiscoveryStatus');
    this.discoveryResults = document.getElementById('paperlessDiscoveryResults');
    this.tokenLink = document.getElementById('openPaperlessTokenLink');

    document.getElementById('discoverPaperlessBtn')?.addEventListener('click', () => this.discoverPaperless());
    document.getElementById('testPaperlessBtn')?.addEventListener('click', () => this.testPaperless());
    this.paperlessUrl?.addEventListener('input', () => this.updateTokenLink());
    this.updateTokenLink();
  }

  // Build a best-effort deep link into the Paperless-ngx UI where the user can copy their API token.
  updateTokenLink() {
    if (!this.tokenLink) return;
    const raw = (this.paperlessUrl?.value || '').trim();
    if (!raw) {
      this.tokenLink.removeAttribute('href');
      this.tokenLink.classList.add('is-disabled');
      return;
    }
    let base = raw.replace(/\/+$/, '').replace(/\/api$/i, '');
    if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
    // Paperless-ngx exposes API tokens under the user settings page.
    this.tokenLink.href = `${base}/settings/`;
    this.tokenLink.classList.remove('is-disabled');
  }

  setDiscoveryStatus(text, tone = '') {
    if (!this.discoveryStatus) return;
    this.discoveryStatus.textContent = text;
    this.discoveryStatus.dataset.tone = tone;
  }

  async discoverPaperless() {
    if (!this.discoveryResults) return;
    this.setDiscoveryStatus('Scanning for Paperless-ngx instances...');
    this.discoveryResults.classList.add('hidden');
    this.discoveryResults.innerHTML = '';

    try {
      const response = await fetch('/api/paperless/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hint: this.paperlessUrl?.value.trim() || '' })
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Discovery failed');
      }

      if (!payload.instances.length) {
        this.setDiscoveryStatus(`No instances found (scanned ${payload.scanned} candidates). Enter the URL manually.`, 'warn');
        return;
      }

      this.setDiscoveryStatus(`Found ${payload.instances.length} instance(s).`, 'ok');
      this.discoveryResults.innerHTML = payload.instances.map((instance) => `
        <div class="choice-card discovery-card">
          <div>
            <div class="choice-title"><span>${instance.url}</span>${instance.version ? `<span class="badge">v${instance.version}</span>` : ''}</div>
            <div class="choice-copy">${instance.requiresAuth ? 'Reachable — needs an API token' : 'Reachable'}</div>
          </div>
          <button type="button" class="button-secondary" data-use-instance="${instance.url}">Use this</button>
        </div>
      `).join('');
      this.discoveryResults.classList.remove('hidden');

      this.discoveryResults.querySelectorAll('[data-use-instance]').forEach((button) => {
        button.addEventListener('click', () => {
          if (this.paperlessUrl) {
            this.paperlessUrl.value = button.dataset.useInstance;
            this.updateTokenLink();
          }
          this.setDiscoveryStatus('Instance selected. Now add your API token.', 'ok');
        });
      });
    } catch (error) {
      this.setDiscoveryStatus(error.message, 'warn');
    }
  }

  async testPaperless() {
    const url = this.paperlessUrl?.value.trim();
    if (!url) {
      this.setDiscoveryStatus('Enter a Paperless URL first.', 'warn');
      return;
    }
    this.setDiscoveryStatus('Testing connection...');
    try {
      const response = await fetch(`/api/paperless/probe?url=${encodeURIComponent(url)}`);
      const payload = await response.json();
      const instance = payload.instance || {};
      if (payload.success) {
        this.setDiscoveryStatus(
          `Paperless-ngx reachable${instance.version ? ` (v${instance.version})` : ''}${instance.requiresAuth ? ' — needs API token' : ''}.`,
          'ok'
        );
      } else {
        this.setDiscoveryStatus(`Not reachable as Paperless-ngx${instance.error ? `: ${instance.error}` : ''}.`, 'warn');
      }
    } catch (error) {
      this.setDiscoveryStatus(error.message, 'warn');
    }
  }

  initCustomFields() {
    this.renderCustomFields();
    document.getElementById('addCustomField')?.addEventListener('click', () => {
      const name = document.getElementById('newFieldName')?.value.trim();
      const dataType = document.getElementById('newFieldType')?.value;
      const currency = document.getElementById('currencyCode')?.value;
      if (!name) return;

      const fields = this.getCustomFields();
      if (fields.some((field) => field.value === name)) return;

      fields.push({
        value: name,
        data_type: dataType,
        ...(dataType === 'monetary' ? { currency } : {})
      });

      this.setCustomFields(fields);
      document.getElementById('newFieldName').value = '';
    });
  }

  getCustomFields() {
    try {
      return JSON.parse(this.customFieldInput.value || '{"custom_fields":[]}').custom_fields || [];
    } catch {
      return [];
    }
  }

  setCustomFields(fields) {
    this.customFieldInput.value = JSON.stringify({ custom_fields: fields });
    this.renderCustomFields();
  }

  renderCustomFields() {
    if (!this.customFieldList) return;
    const fields = this.getCustomFields();
    this.customFieldList.innerHTML = fields.map((field, index) => `
      <div class="choice-card" style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;">
        <div>
          <div class="choice-title"><span>${field.value}</span></div>
          <div class="choice-copy">${field.data_type}${field.currency ? ` (${field.currency})` : ''}</div>
        </div>
        <button type="button" class="button-danger" data-remove-custom-field="${index}">Remove</button>
      </div>
    `).join('');

    this.customFieldList.querySelectorAll('[data-remove-custom-field]').forEach((button) => {
      button.addEventListener('click', () => {
        const fields = this.getCustomFields();
        fields.splice(Number(button.dataset.removeCustomField), 1);
        this.setCustomFields(fields);
      });
    });
  }

  initToggleCards() {
    document.querySelectorAll('.choice-card input[type="checkbox"]').forEach((input) => {
      const card = input.closest('.choice-card');
      card?.addEventListener('click', (event) => {
        if (event.target.tagName === 'BUTTON') return;
        input.checked = !input.checked;
        card.classList.toggle('is-selected', input.checked);
      });
    });
  }

  initSubmit() {
    this.form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      this.syncModelValue();

      const submit = document.getElementById('configSubmit');
      const previous = submit.textContent;
      submit.disabled = true;
      submit.textContent = 'Saving...';

      try {
        const formData = new FormData(this.form);
        const payload = Object.fromEntries(formData.entries());
        const response = await fetch(this.form.dataset.action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to save configuration');
        }

        window.alert(result.message || 'Configuration saved. The app will restart.');
        if (result.restart) {
          window.location.reload();
        }
      } catch (error) {
        window.alert(error.message);
      } finally {
        submit.disabled = false;
        submit.textContent = previous;
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.configFormApp = new ConfigFormApp();
});
