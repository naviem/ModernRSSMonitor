let detectedFields = [];
let detectedSample = {};
window.selectedFields = [];
window.editSelectedConnections = [];
let bsModal = null;

// Helper for variable interpolation in templates
function interpolate(template, item) {
  if (!template) return '';
  return template.replace(/\$\{(\w+)\}/g, (_, key) => item[key] || '');
}

// --- Modal Management ---
document.addEventListener('DOMContentLoaded', function() {
  const editModal = document.getElementById('editFeedModal');
  if (!editModal) {
    console.error('Edit modal not found');
    return;
  }

  // Initialize Bootstrap modal
  bsModal = new bootstrap.Modal(editModal);

  // Function to load feed data
  window.loadEditFeedData = function(id) {
    console.log('Loading feed data for ID:', id);
    fetch(`/api/feeds/${id}`)
      .then(res => res.json())
      .then(feed => {
        console.log('Received feed data:', feed);
        
        // Set basic feed info
        document.getElementById('edit-feed-id').value = feed.id;
        document.getElementById('edit-feed-url').value = feed.url;
        document.getElementById('edit-feed-title').value = feed.title;
        document.getElementById('edit-scan-interval').value = feed.interval;
        document.getElementById('edit-filters').value = feed.filters || '';

        // Parse connection_ids
        let idsRaw = feed.connection_ids;
        if (typeof idsRaw === "string") {
          try { idsRaw = JSON.parse(idsRaw); } catch { idsRaw = []; }
        }
        if (!Array.isArray(idsRaw)) idsRaw = [];
        window.editSelectedConnections = idsRaw
          .map(id => Number(id))
          .filter(id => Number.isFinite(id) && id > 0);

        console.log('Selected connections:', window.editSelectedConnections);
        renderEditAvailableConnections();
        updateEditSelectedUI();

        // Restore field selection
        window.selectedFields = Array.isArray(feed.fields_to_send) ? feed.fields_to_send.slice() : [];
        detectedFields = [];
        detectedSample = {};

        if (feed.url) {
          fetch('/api/feeds/detect-fields', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: feed.url })
          })
          .then(res => res.json())
          .then(result => {
            console.log('Detected fields:', result);
            detectedFields = result.fields || [];
            detectedSample = result.sample || {};
            window.detectedSample = detectedSample;
            if (window.selectedFields.length) {
              window.selectedFields = window.selectedFields.filter(f => detectedFields.includes(f));
            } else {
              window.selectedFields = detectedFields.slice();
            }
            renderFieldCheckboxes();
            updateNotificationPreview();
            
            // Update Discord embed preview with detected sample
            if (window.discordEmbedManager) {
              window.discordEmbedManager.updatePreview();
            }
          })
          .catch(error => {
            console.error('Error detecting fields:', error);
          });
        }

        // Load Discord Embed settings
        let embed = {};
        if (feed.embed_settings) {
          if (typeof feed.embed_settings === "string") {
            try { embed = JSON.parse(feed.embed_settings); } catch { embed = {}; }
          } else {
            embed = feed.embed_settings;
          }
        }
        
        // Initialize Discord embed manager with settings
        if (window.discordEmbedManager) {
          window.discordEmbedManager.setSettings(embed);
        }

        // Show the modal
        if (bsModal) {
          bsModal.show();
        } else {
          console.error('Bootstrap modal not initialized');
        }
      })
      .catch(error => {
        console.error('Error loading feed data:', error);
        showToast('Error loading feed data');
      });
  };

  // Attach Send Test handler
  const sendTestBtn = document.getElementById('sendTestEditFeedBtn');
  if (sendTestBtn) {
    sendTestBtn.onclick = async () => {
      const url = document.getElementById('edit-feed-url').value;
      const feedTitle = document.getElementById('edit-feed-title').value;
      const interval = document.getElementById('edit-scan-interval').value;
      const filters = document.getElementById('edit-filters').value;
      const connection_ids = Array.isArray(window.editSelectedConnections)
        ? window.editSelectedConnections
            .map(id => Number(id))
            .filter(id => Number.isFinite(id) && id > 0)
        : [];
      if (!connection_ids.length) {
        showToast('Please select at least one integration/channel.');
        return;
      }

      // Use detected sample data if available, otherwise create test data
      const test_item = detectedSample ? { ...detectedSample } : {
        title: 'Test Article Title',
        link: url || 'https://example.com',
        description: 'This is a test article from your RSS feed.',
        content: 'This is the full content of the test article. It would normally contain the complete article text.',
        pubDate: new Date().toISOString(),
        author: 'Test Author',
        category: 'Test Category'
      };

      // Ensure we have the feed URL in the test item
      test_item.link = test_item.link || url;
      
      // Add feed title to the test item
      test_item.feed_title = feedTitle;

      const fields_to_send = window.selectedFields || Object.keys(test_item);

      // Get embed settings from the manager
      let embed_settings = window.discordEmbedManager?.getSettings() || { enabled: false, embeds: [] };

      // Create the message object that will be sent to Discord
      const payload = {
        url,
        title: feedTitle,
        interval,
        filters,
        connection_ids,
        fields_to_send,
        test_item,
        embed_settings,
        message: {
          content: '',  // Explicitly set empty string
          embeds: embed_settings.enabled ? embed_settings.embeds.map(embed => ({
            title: interpolate(embed.title || '', test_item),
            description: interpolate(embed.description || '', test_item),
            color: parseInt((embed.color || '#5865F2').replace('#', ''), 16),
            url: test_item.link,
            ...(embed.footer ? { footer: { text: interpolate(embed.footer, test_item) } } : {})
          })) : undefined
        }
      };

      console.log('[Frontend] Message content before sending:', JSON.stringify(payload.message.content));
      console.log('[Frontend] Full payload:', JSON.stringify(payload, null, 2));

      try {
        const resp = await fetch('/api/feeds/send-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await resp.json();
        console.log('Test response:', result);
        if (result.success) {
          showToast('Test sent successfully');
        } else {
          showToast('Failed to send test: ' + (result.error || 'Unknown error'));
        }
      } catch (e) {
        console.error('Error sending test:', e);
        showToast('Error sending test: ' + e.message);
      }
    };
  }

  // Handle modal cleanup
  editModal.addEventListener('hidden.bs.modal', function() {
    // Remove backdrop if it exists
    const backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) backdrop.remove();
    
    // Clean up body classes and styles
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('padding-right');
    document.body.style.removeProperty('overflow');

    // Reset form fields
    document.getElementById('edit-feed-id').value = '';
    document.getElementById('edit-feed-url').value = '';
    document.getElementById('edit-feed-title').value = '';
    document.getElementById('edit-scan-interval').value = '';
    document.getElementById('edit-filters').value = '';
    window.editSelectedConnections = [];
    window.selectedFields = [];
    detectedFields = [];
    detectedSample = {};
    renderEditAvailableConnections();
    updateEditSelectedUI();
    renderFieldCheckboxes();
    updateNotificationPreview();
  });

  // Handle form submission
  const editFeedForm = document.getElementById('editFeedForm');
  if (editFeedForm) {
    editFeedForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());
      data.connection_ids = window.editSelectedConnections;
      data.fields_to_send = window.selectedFields;
      data.embed_settings = window.discordEmbedManager?.getSettings() || { enabled: false, embeds: [] };
      try {
        const response = await fetch(`/api/feeds/${data.feed_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (response.ok) {
          if (bsModal) {
            bsModal.hide();
          }
          window.location.reload();
        } else {
          showToast('Error saving feed');
        }
      } catch (error) {
        console.error('Error saving feed:', error);
        showToast('Error saving feed');
      }
    });
  }

  // Initialize embed preview handlers
  ['embed-enabled','embed-title','embed-description','embed-color','embed-footer'].forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('input', renderEmbedPreview);
      element.addEventListener('change', renderEmbedPreview);
    }
  });

  if (document.getElementById('embed-preview')) renderEmbedPreview();
});

// Dynamically render available connections as buttons
function renderEditAvailableConnections() {
  const availableList = document.getElementById('editAvailableConnections');
  if (!availableList) return;
  availableList.innerHTML = '';
  (window.allConnections || []).forEach(conn => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-outline-primary btn-sm me-1 mb-1';
    btn.setAttribute('data-id', conn.id);
    btn.textContent = `${conn.label} (${conn.service})`;
    btn.onclick = () => {
      if (!window.editSelectedConnections.includes(conn.id)) {
        window.editSelectedConnections.push(conn.id);
        updateEditSelectedUI();
      }
    };
    availableList.appendChild(btn);
  });
}

// Update UI for selected connections
function updateEditSelectedUI() {
  const selectedContainer = document.getElementById('editSelectedConnections');
  const hiddenInput = document.getElementById('edit-connection_ids');
  if (!selectedContainer || !hiddenInput) return;
  if (window.editSelectedConnections.length === 0) {
    selectedContainer.innerHTML = '<small class="text-muted">No connections selected</small>';
  } else {
    selectedContainer.innerHTML = '';
    window.editSelectedConnections.forEach(id => {
      const conn = (window.allConnections || []).find(c => c.id === id);
      if (conn) {
        const li = document.createElement('div');
        li.className = 'badge bg-primary me-1 mb-1 d-inline-flex align-items-center';
        li.textContent = `${conn.label} (${conn.service})`;
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-close btn-close-white btn-sm ms-2';
        removeBtn.setAttribute('aria-label', 'Remove');
        removeBtn.onclick = () => {
          window.editSelectedConnections = window.editSelectedConnections.filter(cid => cid !== id);
          updateEditSelectedUI();
        };
        li.appendChild(removeBtn);
        selectedContainer.appendChild(li);
      }
    });
  }
  hiddenInput.value = JSON.stringify(window.editSelectedConnections);
}

// Setup event handlers
function setupHandlers() {
  // Attach Test Feed handler
  const testBtn = document.getElementById('testEditFeedBtn');
  if (testBtn) {
    testBtn.onclick = async () => {
      const url = document.getElementById('edit-feed-url').value;
      if (!url) return showToast('Please enter a URL');
      try {
        const response = await fetch('/api/feeds/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        const result = await response.json();
        showToast(result.valid ? 'Valid RSS feed!' : 'Invalid RSS feed');
      } catch (error) {
        showToast('Error testing feed');
      }
    };
  }

  // Attach Detect Fields handler
  const detectBtn = document.getElementById('detectFieldsBtn');
  if (detectBtn) {
    detectBtn.onclick = async () => {
      const url = document.getElementById('edit-feed-url').value;
      if (!url) return showToast('Enter a feed URL first!');
      const resp = await fetch('/api/feeds/detect-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const result = await resp.json();
      detectedFields = result.fields || [];
      detectedSample = result.sample || {};
      window.detectedSample = detectedSample;
      window.selectedFields = detectedFields.slice();
      renderFieldCheckboxes();
      updateNotificationPreview();
      renderEmbedPreview();
    };
  }
}

function renderFieldCheckboxes() {
  const container = document.getElementById('fieldCheckboxes');
  if (!container) return;
  if (!detectedFields || !detectedFields.length) {
    container.innerHTML = '<small class="text-muted">No fields detected yet.</small>';
    return;
  }
  container.innerHTML = '';
  detectedFields.forEach(field => {
    const id = 'field_' + field;
    const div = document.createElement('div');
    div.className = 'form-check form-check-inline';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'form-check-input';
    input.id = id;
    input.value = field;
    input.checked = window.selectedFields.includes(field);
    input.onchange = () => {
      if (input.checked) {
        window.selectedFields.push(field);
      } else {
        window.selectedFields = window.selectedFields.filter(f => f !== field);
      }
      updateNotificationPreview();
    };
    const label = document.createElement('label');
    label.className = 'form-check-label';
    label.htmlFor = id;
    label.textContent = field;
    div.appendChild(input);
    div.appendChild(label);
    container.appendChild(div);
  });
}

function updateNotificationPreview() {
  const container = document.getElementById('notificationPreview');
  if (!container) return;
  const sample = detectedSample || {};
  let html = '';
  if (!detectedFields || !detectedFields.length) {
    html = '<span class="text-muted">No fields detected yet.</span>';
  } else if (!window.selectedFields || window.selectedFields.length === 0) {
    html = '<span class="text-muted">No fields selected.</span>';
  } else {
    html = window.selectedFields.map(f => {
      let val = sample[f] || `[${f}]`;
      if (f === 'link' && val) val = `<a href="${val}" target="_blank" rel="noopener noreferrer">${val}</a>`;
      return `<div><b>${f}:</b> ${val}</div>`;
    }).join('');
  }
  container.innerHTML = html;
}

function renderEmbedPreview() {
  const preview = document.getElementById('embed-preview');
  if (!preview) return;

  const enabled = document.getElementById('embed-enabled')?.checked;
  const titleRaw = document.getElementById('embed-title')?.value || '';
  const descRaw = document.getElementById('embed-description')?.value || '';
  const color = document.getElementById('embed-color')?.value || '#5865F2';
  const footerRaw = document.getElementById('embed-footer')?.value || '';
  const sample = window.detectedSample || {};

  const title = interpolate(titleRaw, sample);
  const desc = interpolate(descRaw, sample);
  const footer = interpolate(footerRaw, sample);

  if (!enabled) {
    preview.innerHTML = '<span style="color:#b9bbbe;">(Embed disabled)</span>';
    return;
  }
  preview.innerHTML = `
    <div style="border-left:4px solid ${color};background:#36393f;padding:12px 16px;border-radius:6px;">
      <div style="color:${color};font-weight:600;font-size:1.1em;margin-bottom:4px;">${title || '<span style="color:#b9bbbe;">(no title)</span>'}</div>
      <div style="color:#dcddde;margin-bottom:8px;">${desc || '<span style="color:#72767d;">(no description)</span>'}</div>
      <div style="color:#b9bbbe;font-size:0.9em;">${footer}</div>
    </div>
  `;
}

// Toast helper
function showToast(message) {
  const toastEl = document.getElementById('liveToast');
  const toastBody = document.getElementById('toastBody');
  if (toastBody) toastBody.textContent = message;
  if (toastEl) {
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
  }
}
