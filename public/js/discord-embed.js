// Discord Embed Manager
class DiscordEmbedManager {
  constructor() {
    this.enabledSwitch = document.getElementById('embed-enabled');
    this.settingsContainer = document.getElementById('embed-settings');
    this.embedList = document.getElementById('embed-list');
    this.previewContainer = document.getElementById('embed-preview');
    this.addEmbedBtn = document.getElementById('add-embed-btn');
    this.embedTemplate = document.getElementById('embed-template');
    
    this.embeds = [];
    this.defaultEmbed = {
      title: '${title}',
      description: '${description}\n\nRead more: ${link}',
      color: '#5865F2',
      footer: 'Posted on ${pubDate}'
    };

    this.setupEventListeners();
    this.initializeState();
  }

  setupEventListeners() {
    // Toggle embed settings visibility
    this.enabledSwitch?.addEventListener('change', () => {
      this.settingsContainer.style.display = this.enabledSwitch.checked ? 'block' : 'none';
      this.updatePreview();
    });

    // Add new embed button
    this.addEmbedBtn?.addEventListener('click', () => {
      this.addEmbed();
    });

    // Event delegation for embed controls
    this.embedList?.addEventListener('click', (e) => {
      const embedItem = e.target.closest('.embed-item');
      if (!embedItem) return;

      if (e.target.closest('.remove-embed-btn')) {
        embedItem.remove();
        this.updatePreview();
      } else if (e.target.closest('.move-up-btn')) {
        const prev = embedItem.previousElementSibling;
        if (prev) {
          embedItem.parentNode.insertBefore(embedItem, prev);
          this.updatePreview();
        }
      } else if (e.target.closest('.move-down-btn')) {
        const next = embedItem.nextElementSibling;
        if (next) {
          embedItem.parentNode.insertBefore(next, embedItem);
          this.updatePreview();
        }
      }
    });

    // Event delegation for embed field changes
    this.embedList?.addEventListener('input', (e) => {
      if (e.target.matches('.embed-title, .embed-description, .embed-color, .embed-footer')) {
        this.updatePreview();
      }
    });

    // Double-click handlers for template insertion
    this.embedList?.addEventListener('dblclick', (e) => {
      const input = e.target;
      if (!input.value && (
        input.classList.contains('embed-title') ||
        input.classList.contains('embed-description') ||
        input.classList.contains('embed-footer')
      )) {
        const field = input.classList.contains('embed-title') ? 'title' :
                     input.classList.contains('embed-description') ? 'description' : 'footer';
        input.value = this.defaultEmbed[field];
        this.updatePreview();
      }
    });
  }

  addEmbed(data = {}) {
    if (!this.embedTemplate || !this.embedList) return;
    
    const embedElement = this.embedTemplate.content.cloneNode(true).firstElementChild;
    
    // Set values if provided
    if (data.title) embedElement.querySelector('.embed-title').value = data.title;
    if (data.description) embedElement.querySelector('.embed-description').value = data.description;
    if (data.color) embedElement.querySelector('.embed-color').value = data.color;
    if (data.footer) embedElement.querySelector('.embed-footer').value = data.footer;
    
    this.embedList.appendChild(embedElement);
    this.updatePreview();
  }

  initializeState() {
    if (!this.enabledSwitch) return;
    
    // Set initial visibility
    this.settingsContainer.style.display = this.enabledSwitch.checked ? 'block' : 'none';
    
    // Add default embed if none exists
    if (this.embedList && !this.embedList.children.length) {
      this.addEmbed();
    }
    
    this.updatePreview();
  }

  updatePreview() {
    if (!this.previewContainer) return;

    if (!this.enabledSwitch?.checked) {
      this.previewContainer.innerHTML = '<div class="text-muted text-center py-3">(Embed disabled)</div>';
      return;
    }

    const sample = window.detectedSample || {
      title: 'Example Article Title',
      description: 'This is a sample description of the article.',
      content: 'This is the full content of the article with more details...',
      link: 'https://example.com/article',
      pubDate: new Date().toISOString(),
      author: 'John Doe'
    };

    const embedElements = this.embedList?.querySelectorAll('.embed-item') || [];
    let previewHtml = '';

    embedElements.forEach((embedElement, index) => {
      const title = this.interpolate(embedElement.querySelector('.embed-title')?.value || '', sample);
      const description = this.interpolate(embedElement.querySelector('.embed-description')?.value || '', sample);
      const color = embedElement.querySelector('.embed-color')?.value || this.defaultEmbed.color;
      const footer = this.interpolate(embedElement.querySelector('.embed-footer')?.value || '', sample);

      previewHtml += `
        <div class="discord-embed mb-2" style="border-left:4px solid ${color};background:#2f3136;padding:16px;border-radius:4px;">
          ${title ? `
            <div style="color:${color};font-weight:600;font-size:1.1em;margin-bottom:8px;line-height:1.3;">
              ${this.escapeHtml(title)}
            </div>
          ` : ''}
          ${description ? `
            <div style="color:#dcddde;font-size:0.95em;line-height:1.4;white-space:pre-wrap;margin-bottom:10px;">
              ${this.escapeHtml(description)}
            </div>
          ` : ''}
          ${footer ? `
            <div style="color:#72767d;font-size:0.85em;margin-top:8px;">
              ${this.escapeHtml(footer)}
            </div>
          ` : ''}
        </div>
      `;
    });

    this.previewContainer.innerHTML = previewHtml || '<div class="text-muted text-center py-3">(No embeds configured)</div>';
  }

  interpolate(template, data) {
    if (!template) return '';
    return template.replace(/\$\{(\w+)\}/g, (match, key) => {
      if (key === 'pubDate' && data[key]) {
        try {
          const date = new Date(data[key]);
          return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        } catch {
          return data[key];
        }
      }
      return data[key] || match;
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  getSettings() {
    const embedElements = this.embedList?.querySelectorAll('.embed-item') || [];
    const embeds = Array.from(embedElements).map(embedElement => ({
      title: embedElement.querySelector('.embed-title')?.value || '',
      description: embedElement.querySelector('.embed-description')?.value || '',
      color: embedElement.querySelector('.embed-color')?.value || this.defaultEmbed.color,
      footer: embedElement.querySelector('.embed-footer')?.value || ''
    }));

    return {
      enabled: this.enabledSwitch?.checked || false,
      embeds: embeds
    };
  }

  setSettings(settings = {}) {
    if (this.enabledSwitch) {
      this.enabledSwitch.checked = !!settings.enabled;
    }

    // Clear existing embeds
    if (this.embedList) {
      this.embedList.innerHTML = '';
    }

    // Add embeds from settings
    if (settings.enabled && Array.isArray(settings.embeds) && settings.embeds.length) {
      settings.embeds.forEach(embed => this.addEmbed(embed));
    } else if (settings.enabled) {
      // If enabled but no embeds array, try to convert old format
      this.addEmbed({
        title: settings.title || '',
        description: settings.description || '',
        color: settings.color || this.defaultEmbed.color,
        footer: settings.footer || ''
      });
    } else {
      // Add default embed
      this.addEmbed();
    }

    this.initializeState();
  }
}

// Initialize Discord embed manager
window.discordEmbedManager = new DiscordEmbedManager(); 