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
    this.initModelPicker();
    this.initProviderSelection();
    this.syncProcessingModes();
    this.initModelSelection();
    this.initOllamaDiscovery();
    this.initPaperlessDiscovery();
    this.initCustomFields();
    this.initTagGroups();
    this.initToggleCards();
    this.initSecretToggles();
    this.initCodexStatus();
    this.initSubmit();
  }

  initTagGroups() {
    this.tagGroupsInput = document.getElementById('tagGroupsJson');
    this.tagGroupEditor = document.getElementById('tagGroupEditor');
    if (!this.tagGroupsInput || !this.tagGroupEditor) return;
    try { this.tagGroups = JSON.parse(this.tagGroupsInput.value || '[]'); } catch { this.tagGroups = []; }
    try { this.tagGroupDefaults = JSON.parse(document.getElementById('tagGroupDefaults')?.value || '[]'); } catch { this.tagGroupDefaults = []; }
    const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const sync = () => {
      this.tagGroupsInput.value = JSON.stringify(this.tagGroups);
      const occurrences = new Map();
      this.tagGroups.filter((group) => group.enabled).forEach((group) => group.tags.forEach((tag) => {
        const key = tag.trim().toLocaleLowerCase();
        occurrences.set(key, (occurrences.get(key) || 0) + 1);
      }));
      const count = occurrences.size;
      document.getElementById('enabledTagCount').textContent = `${count} enabled tag${count === 1 ? '' : 's'}`;
      const duplicates = [...occurrences.entries()].filter(([, amount]) => amount > 1).map(([name]) => name);
      const warning = document.getElementById('tagDuplicateWarning');
      warning.textContent = duplicates.length ? `Duplicates are used once: ${duplicates.join(', ')}` : '';
      warning.classList.toggle('hidden', !duplicates.length);
    };
    const render = () => {
      this.tagGroupEditor.innerHTML = this.tagGroups.map((group, index) => `
        <section class="choice-card tag-group-card ${group.enabled ? 'is-selected' : ''}" data-group-index="${index}">
          <header class="tag-group-header">
            <label><input type="checkbox" data-group-enabled ${group.enabled ? 'checked' : ''}> Enabled</label>
            ${group.permanent ? '<span class="badge">Permanent</span>' : ''}
            ${group.preset ? '<button type="button" class="button-secondary" data-reset-group>Reset</button>' : ''}
            ${!group.preset && !group.permanent ? '<button type="button" class="button-danger" data-delete-group>Delete</button>' : ''}
          </header>
          <input class="tag-group-name" data-group-name value="${escape(group.name)}" ${group.preset || group.permanent ? 'readonly' : ''} aria-label="Group name">
          <div class="tag-chip-list">${group.tags.map((tag, tagIndex) => `<span class="badge">${escape(tag)} <button type="button" data-remove-tag="${tagIndex}" aria-label="Remove ${escape(tag)}">×</button></span>`).join('')}</div>
          <input data-add-tag placeholder="Add tag, then press Enter or comma" aria-label="Add tag to ${escape(group.name)}">
        </section>`).join('');
      sync();
    };
    this.tagGroupEditor.addEventListener('change', (event) => {
      const card = event.target.closest('[data-group-index]');
      if (!card) return;
      const group = this.tagGroups[Number(card.dataset.groupIndex)];
      if (event.target.matches('[data-group-enabled]')) group.enabled = event.target.checked;
      if (event.target.matches('[data-group-name]')) group.name = event.target.value.trim() || group.name;
      render();
    });
    this.tagGroupEditor.addEventListener('keydown', (event) => {
      if (!event.target.matches('[data-add-tag]') || !['Enter', ','].includes(event.key)) return;
      event.preventDefault();
      const card = event.target.closest('[data-group-index]');
      const value = event.target.value.replace(/,$/, '').trim().replace(/\s+/g, ' ');
      if (!value) return;
      const group = this.tagGroups[Number(card.dataset.groupIndex)];
      if (!group.tags.some((tag) => tag.toLocaleLowerCase() === value.toLocaleLowerCase())) group.tags.push(value);
      render();
      this.tagGroupEditor.querySelector(`[data-group-index="${card.dataset.groupIndex}"] [data-add-tag]`)?.focus();
    });
    this.tagGroupEditor.addEventListener('click', (event) => {
      const card = event.target.closest('[data-group-index]');
      if (!card) return;
      const index = Number(card.dataset.groupIndex);
      if (event.target.closest('[data-remove-tag]')) this.tagGroups[index].tags.splice(Number(event.target.closest('[data-remove-tag]').dataset.removeTag), 1);
      else if (event.target.closest('[data-delete-group]')) this.tagGroups.splice(index, 1);
      else if (event.target.closest('[data-reset-group]')) {
        const defaults = this.tagGroupDefaults.find((group) => group.id === this.tagGroups[index].id)?.tags || [];
        this.tagGroups[index].tags = [...defaults];
      } else return;
      render();
    });
    document.getElementById('addTagGroup')?.addEventListener('click', () => {
      this.tagGroups.push({ id: `custom-${Date.now()}`, name: 'Custom group', enabled: true, tags: [] });
      render();
    });
    render();
    if (this.form.dataset.mode === 'settings') this.loadTagManagement();
  }

  async loadTagManagement() {
    const exceptionRoot = document.getElementById('tagExceptionReview');
    const unmanagedRoot = document.getElementById('unmanagedTags');
    try {
      const [exceptionResponse, unmanagedResponse] = await Promise.all([fetch('/api/tag-exceptions'), fetch('/api/tags/unmanaged')]);
      const exceptionData = await exceptionResponse.json();
      const unmanagedData = await unmanagedResponse.json();
      const enabledGroups = (exceptionData.groups || []).filter((group) => group.enabled);
      exceptionRoot.innerHTML = `<h3>Pending tag exceptions</h3>${(exceptionData.exceptions || []).map((item) => `
        <div class="choice-card" data-exception="${item.id}"><strong>${this.escapeHtml(item.suggested_name)}</strong>
        <span>${this.escapeHtml(item.document?.title || `Document ${item.document_id}`)} · ${this.escapeHtml(item.created_at)}</span>
        <small>Current valid tags: ${this.escapeHtml((item.currentValidTags || []).join(', ') || 'none')}</small>
        <select data-exception-group><option value="">Choose destination group</option>${enabledGroups.map((group) => `<option value="${this.escapeHtml(group.id)}">${this.escapeHtml(group.name)}</option>`).join('')}</select>
        <button type="button" class="button-secondary" data-approve-exception>Approve</button>
        <button type="button" class="button-danger" data-reject-exception>Reject</button></div>`).join('') || '<p class="field-hint">No pending exceptions.</p>';
      unmanagedRoot.innerHTML = `<h3>Unmanaged Paperless tags</h3>${(unmanagedData.tags || []).map((tag) => `<label class="choice-card"><input type="checkbox" data-unmanaged-id="${tag.id}" ${Number(tag.document_count) ? 'disabled' : ''}> ${this.escapeHtml(tag.name)} <span class="badge">${Number(tag.document_count || 0)} documents</span></label>`).join('') || '<p class="field-hint">No unmanaged tags.</p>'}<button type="button" class="button-danger" id="cleanupUnmanaged">Delete selected zero-use tags</button>`;
      exceptionRoot.onclick = async (event) => {
        const row = event.target.closest('[data-exception]'); if (!row) return;
        if (event.target.closest('[data-approve-exception]')) await this.tagAction(`/api/tag-exceptions/${row.dataset.exception}/approve`, { groupId: row.querySelector('select').value });
        if (event.target.closest('[data-reject-exception]')) await this.tagAction(`/api/tag-exceptions/${row.dataset.exception}/reject`, {});
      };
      document.getElementById('cleanupUnmanaged')?.addEventListener('click', async () => {
        const ids = [...document.querySelectorAll('[data-unmanaged-id]:checked')].map((input) => Number(input.dataset.unmanagedId));
        if (!ids.length || !window.confirm('Delete the selected unused unmanaged tags from Paperless?')) return;
        await this.tagAction('/api/tags/unmanaged/cleanup', { ids });
      });
    } catch (error) {
      if (exceptionRoot) exceptionRoot.innerHTML = `<p class="danger">${this.escapeHtml(error.message)}</p>`;
    }
  }

  escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  async tagAction(url, body) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) return window.alert(result.error || 'Tag operation failed');
    if (url.endsWith('/approve')) return window.location.reload();
    await this.loadTagManagement();
  }

  initModelPicker() {
    this.modelPicker = document.getElementById('modelPickerModal');
    this.modelPickerSearch = document.getElementById('modelPickerSearch');
    this.modelPickerTrigger = document.getElementById('openModelPicker');
    if (!this.modelPicker) return;
    this.modelPickerAnchor = document.createComment('model-picker-portal');
    this.modelPicker.parentNode.insertBefore(this.modelPickerAnchor, this.modelPicker);

    const open = () => {
      this.showProviderStep();
      document.body.appendChild(this.modelPicker);
      this.modelPicker.classList.add('is-open');
      this.modelPicker.setAttribute('aria-hidden', 'false');
      document.body.classList.add('has-open-modal');
      window.setTimeout(() => this.modelPickerSearch?.focus(), 40);
    };
    const close = () => {
      this.modelPicker.classList.remove('is-open');
      this.modelPicker.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('has-open-modal');
      this.modelPickerSearch.value = '';
      this.filterModelPicker('');
      this.updateModelPickerSummary();
      this.modelPickerAnchor.parentNode?.insertBefore(this.modelPicker, this.modelPickerAnchor.nextSibling);
      this.modelPickerTrigger?.focus();
    };

    this.modelPickerTrigger?.addEventListener('click', open);
    document.querySelectorAll('[data-close-model-picker]').forEach((button) => button.addEventListener('click', close));
    document.getElementById('applyModelPicker')?.addEventListener('click', close);
    document.getElementById('modelPickerBack')?.addEventListener('click', () => this.showProviderStep());
    this.modelPickerSearch?.addEventListener('input', (event) => this.filterModelPicker(event.target.value));
    this.modelPickerSearch?.addEventListener('keydown', (event) => this.navigateProviders(event));
    document.getElementById('providerChoices')?.addEventListener('keydown', (event) => this.navigateProviders(event));
    document.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        open();
      } else if (event.key === 'Escape' && this.modelPicker.classList.contains('is-open')) {
        close();
      }
    });
  }

  visibleProviderChoices() {
    return [...document.querySelectorAll('[data-provider-choice]:not(.search-hidden)')];
  }

  navigateProviders(event) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'].includes(event.key)) return;
    const choices = this.visibleProviderChoices();
    if (!choices.length) return;
    event.preventDefault();

    const focused = document.activeElement?.closest?.('[data-provider-choice]');
    let index = choices.indexOf(focused);
    if (event.key === 'Enter') {
      (focused || choices[0]).click();
      return;
    }
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = choices.length - 1;
    else if (event.key === 'ArrowDown') index = index < 0 ? 0 : (index + 1) % choices.length;
    else if (event.key === 'ArrowUp') index = index < 0 ? choices.length - 1 : (index - 1 + choices.length) % choices.length;

    choices[index].focus({ preventScroll: true });
    choices[index].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  }

  showProviderStep() {
    if (!this.modelPicker) return;
    this.modelPicker.classList.add('is-provider-step');
    this.modelPicker.classList.remove('is-detail-step');
    document.getElementById('modelPickerBack')?.classList.add('hidden');
    document.getElementById('modelPickerTitle').textContent = 'Connect a provider';
    this.modelPickerSearch?.removeAttribute('disabled');
    window.setTimeout(() => this.modelPickerSearch?.focus(), 30);
  }

  showProviderDetail(providerName) {
    if (!this.modelPicker) return;
    this.modelPicker.classList.remove('is-provider-step');
    this.modelPicker.classList.add('is-detail-step');
    document.getElementById('modelPickerBack')?.classList.remove('hidden');
    document.getElementById('modelPickerTitle').textContent = providerName || 'Configure provider';
    this.modelPickerSearch?.setAttribute('disabled', '');
    this.modelPicker.querySelector('.model-picker-detail input, .model-picker-detail select, .model-picker-detail button')?.focus();
  }

  filterModelPicker(query) {
    const needle = query.trim().toLowerCase();
    document.querySelectorAll('[data-provider-choice]').forEach((item) => {
      item.classList.toggle('search-hidden', Boolean(needle) && !item.dataset.searchText.includes(needle));
    });
    document.querySelectorAll('[data-model-choice]').forEach((item) => {
      const text = item.textContent.toLowerCase();
      item.classList.toggle('search-hidden', Boolean(needle) && !text.includes(needle));
    });
    const first = this.visibleProviderChoices()[0];
    if (first && query.trim()) first.scrollIntoView({ block: 'nearest' });
  }

  updateModelPickerSummary() {
    this.syncModelValue();
    const selected = document.querySelector('[data-provider-choice].is-selected');
    const providerName = selected?.querySelector('strong')?.textContent || this.providerInput.value;
    const modelName = this.modelInput.value || 'Choose a model';
    const modelOutput = document.getElementById('activeModelName');
    const providerOutput = document.getElementById('activeProviderName');
    if (modelOutput) modelOutput.textContent = modelName;
    if (providerOutput) providerOutput.textContent = providerName;
  }

  initCodexStatus() {
    const button = document.getElementById('codexStatusButton');
    const output = document.getElementById('codexStatusResult');
    const readJson = async (response) => {
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const body = (await response.text()).trim();
        throw new Error(body && !body.startsWith('<') ? body : `Server returned ${response.status} instead of JSON`);
      }
      return response.json();
    };
    const refresh = async () => {
      button.disabled = true;
      output.textContent = 'Checking…';
      try {
        const response = await fetch('/api/codex/status');
        const status = await readJson(response);
        output.textContent = status.account?.type === 'chatgpt'
          ? `Signed in as ${status.account.email || 'ChatGPT user'} (${status.account.planType}); model ${status.model}`
          : (status.authenticated ? `Signed in; model ${status.model}` : status.message);
      } catch {
        output.textContent = 'Could not read Codex status.';
      } finally {
        button.disabled = false;
      }
    };
    button?.addEventListener('click', refresh);
    const login = document.getElementById('codexLoginButton');
    const logout = document.getElementById('codexLogoutButton');
    const loginResult = document.getElementById('codexLoginResult');
    const challenge = document.getElementById('codexLoginChallenge');
    const deviceCode = document.getElementById('codexDeviceCode');
    const authLink = document.getElementById('codexOpenAuth');
    const copyFeedback = document.getElementById('codexCopyFeedback');
    let activeCode = '';
    const copyCode = async () => {
      if (!activeCode) return;
      try {
        await navigator.clipboard.writeText(activeCode);
      } catch {
        const temporary = document.createElement('textarea');
        temporary.value = activeCode;
        temporary.style.position = 'fixed';
        temporary.style.opacity = '0';
        document.body.appendChild(temporary);
        temporary.select();
        document.execCommand('copy');
        temporary.remove();
      }
      copyFeedback.textContent = 'Code copied — paste it in ChatGPT.';
      challenge.classList.add('is-copied');
      window.setTimeout(() => challenge.classList.remove('is-copied'), 1200);
    };
    document.getElementById('codexCopyCode')?.addEventListener('click', copyCode);
    document.getElementById('codexCopyCodeButton')?.addEventListener('click', copyCode);
    document.addEventListener('keydown', (event) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if (!typing && activeCode && event.key.toLowerCase() === 'c' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        copyCode();
      }
    });
    login?.addEventListener('click', async () => {
      login.disabled = true;
      challenge?.classList.add('hidden');
      loginResult.textContent = 'Requesting a secure device code…';
      try {
        const response = await fetch('/api/codex/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'chatgptDeviceCode' }) });
        const result = await readJson(response);
        if (!response.ok) throw new Error(result.error || 'Could not start login');
        activeCode = result.userCode;
        deviceCode.textContent = result.userCode;
        authLink.href = result.verificationUrl;
        loginResult.textContent = '';
        challenge.classList.remove('hidden');
        const poll = window.setInterval(async () => {
          const status = await fetch(`/api/codex/login/${encodeURIComponent(result.loginId)}`).then(readJson);
          if (!status.completed) return;
          window.clearInterval(poll);
          activeCode = '';
          challenge.classList.add('hidden');
          loginResult.textContent = status.success ? 'ChatGPT sign-in completed.' : `Sign-in failed: ${status.error || 'unknown error'}`;
          login.disabled = false; refresh();
        }, 1500);
      } catch (error) { activeCode = ''; challenge?.classList.add('hidden'); loginResult.textContent = error.message; login.disabled = false; }
    });
    logout?.addEventListener('click', async () => {
      const response = await fetch('/api/codex/logout', { method: 'POST' });
      if (response.ok) { activeCode = ''; challenge?.classList.add('hidden'); loginResult.textContent = 'Signed out.'; refresh(); }
    });
  }

  initProviderSelection() {
    document.querySelectorAll('[data-provider-choice]').forEach((button) => {
      button.addEventListener('click', () => {
        const provider = button.dataset.providerChoice;
        this.providerInput.value = provider;
        document.querySelectorAll('[data-provider-choice]').forEach((item) => {
          const active = item === button;
          item.classList.toggle('is-selected', active);
          item.setAttribute('aria-checked', active ? 'true' : 'false');
        });
        document.querySelectorAll('[data-provider-panel]').forEach((panel) => {
          const visible = panel.dataset.providerPanel === provider;
          panel.classList.toggle('hidden', !visible);
          panel.setAttribute('aria-hidden', visible ? 'false' : 'true');
        });

        this.syncModelValue();
        this.syncProcessingModes();

        if (provider === 'ollama') {
          this.loadOllamaModels();
        }
        this.updateModelPickerSummary();
        this.showProviderDetail(button.querySelector('strong')?.textContent);
      });
    });
  }

  syncProcessingModes() {
    const select = document.getElementById('aiProcessingMode');
    if (!select) return;
    const provider = this.providerInput.value;
    const flex = select.querySelector('option[value="flex"]');
    const batch = select.querySelector('option[value="batch"]');
    if (flex) flex.disabled = provider !== 'openai';
    if (batch) batch.disabled = !['openai', 'anthropic'].includes(provider);
    if (select.selectedOptions[0]?.disabled) select.value = 'standard';
  }

  initModelSelection() {
    document.querySelectorAll('[data-model-choice]').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('[data-model-choice]').forEach((item) => {
          const active = item === button;
          item.classList.toggle('is-selected', active);
          item.setAttribute('aria-checked', active ? 'true' : 'false');
        });
        this.modelInput.value = button.dataset.modelChoice;
        const custom = document.getElementById('openrouterCustomModel');
        if (custom) custom.value = '';
        this.updateModelPickerSummary();
      });
    });

    ['openrouterCustomModel', 'compatibleModel', 'openaiModel', 'ollamaCustomModel', 'ollamaCloudModel', 'opencodeModel', 'copilotModel', 'anthropicModel', 'codexModel'].forEach((id) => {
      const input = document.getElementById(id);
      input?.addEventListener('input', () => this.syncModelValue());
      input?.addEventListener('input', () => this.updateModelPickerSummary());
      input?.addEventListener('change', () => this.updateModelPickerSummary());
    });

    this.ollamaModelSelect?.addEventListener('change', () => {
      if (this.ollamaModelSelect.value) {
        this.ollamaCustomModel.value = this.ollamaModelSelect.value;
        this.syncModelValue();
        this.updateModelPickerSummary();
      }
    });
  }

  syncModelValue() {
    const provider = this.providerInput.value;
    if (provider === 'openrouter') {
      const custom = document.getElementById('openrouterCustomModel')?.value.trim();
      const preset = document.querySelector('[data-model-choice].is-selected')?.dataset.modelChoice;
      this.modelInput.value = custom || preset || 'openai/gpt-5.4-mini';
      return;
    }

    if (provider === 'ollama') {
      this.modelInput.value = this.ollamaCustomModel?.value.trim() || this.ollamaModelSelect?.value || 'llama3.2';
      return;
    }

    if (provider === 'ollama-cloud') {
      this.modelInput.value = document.getElementById('ollamaCloudModel')?.value.trim() || 'gpt-oss:20b-cloud';
      return;
    }

    if (provider === 'opencode') {
      this.modelInput.value = document.getElementById('opencodeModel')?.value.trim() || 'deepseek-v4-flash';
      return;
    }

    if (provider === 'copilot') {
      this.modelInput.value = document.getElementById('copilotModel')?.value.trim() || 'gpt-5.4-mini';
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

    if (provider === 'anthropic') {
      this.modelInput.value = document.getElementById('anthropicModel')?.value.trim() || 'claude-haiku-4-5';
      return;
    }

    if (provider === 'codex') {
      this.modelInput.value = document.getElementById('codexModel')?.value.trim() || 'gpt-5.4-mini';
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
    const token = document.getElementById('paperlessToken')?.value.trim();
    if (!url) {
      this.setDiscoveryStatus('Enter a Paperless URL first.', 'warn');
      return;
    }
    if (!token) {
      this.setDiscoveryStatus('Enter a Paperless API token first.', 'warn');
      return;
    }
    this.setDiscoveryStatus('Testing Paperless URL and API token...');
    try {
      const response = await fetch('/api/paperless/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, token })
      });
      const payload = await response.json();
      const instance = payload.instance || {};
      if (payload.success) {
        this.setDiscoveryStatus(
          `Connection works${instance.version ? ` (Paperless ${instance.version})` : ''}. Token can read documents and metadata.`,
          'ok'
        );
      } else {
        this.setDiscoveryStatus(instance.error || 'Connection failed. Check the URL and API token.', 'warn');
      }
    } catch (error) {
      this.setDiscoveryStatus(error.message, 'warn');
    }
  }

  initSecretToggles() {
    document.querySelectorAll('[data-toggle-secret]').forEach((button) => {
      button.addEventListener('click', () => {
        const input = document.getElementById(button.dataset.toggleSecret);
        const icon = button.querySelector('i');
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} ${input.name || input.id}`);
        if (icon) {
          icon.className = show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
        }
      });
    });
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
      if (!card) return;
      const sync = () => card.classList.toggle('is-selected', input.checked);
      sync();
      // The <label> wrapping the hidden checkbox already toggles the input.
      // We only refresh the visual state after the browser applies the
      // change, which avoids the double-toggle that used to cancel clicks.
      card.addEventListener('click', (event) => {
        if (event.target.tagName === 'BUTTON') return;
        window.requestAnimationFrame(sync);
      });
      input.addEventListener('change', sync);
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
        const dryRunInput = this.form.querySelector('[name="dry_run"]');
        if (dryRunInput) payload.dry_run = dryRunInput.checked;
        const response = await fetch(this.form.dataset.action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to save configuration');
        }

        const failed = (result.tagProvisioning || []).filter((item) => !item.ok);
        const suffix = failed.length ? `\n\nCould not provision: ${failed.map((item) => `${item.name}: ${item.error}`).join('; ')}` : '';
        window.alert((result.message || 'Configuration saved. New settings are active.') + suffix);
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
