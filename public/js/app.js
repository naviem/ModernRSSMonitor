document.addEventListener('DOMContentLoaded', () => {
  debug('Setting up toggle handlers');

  // Preview section toggles
  ['live-preview', 'recent-articles', 'discord-preview'].forEach(id => {
    const toggle = document.getElementById(`show-${id}`);
    const section = document.getElementById(`${id}-section`);
    
    if (!toggle || !section) {
      debug(`Missing elements for ${id}`, { toggle: !!toggle, section: !!section });
      return;
    }

    toggle.addEventListener('change', async () => {
      debug(`Toggle changed for ${id}`, toggle.checked);
      if (toggle.checked) {
        section.style.display = 'block';
        if (id === 'live-preview') {
          await detectFields();
          refreshPreview();
        }
        if (id === 'recent-articles') refreshArticles();
        if (id === 'discord-preview') refreshPreview();
      } else {
        section.style.display = 'none';
      }
    });
  });
});

// Discord preview toggle handler
document.getElementById('show-discord-preview')?.addEventListener('change', function() {
  const previewSection = document.getElementById('discord-preview-section');
  if (previewSection) {
    previewSection.style.display = this.checked ? 'block' : 'none';
    if (this.checked) {
      updateDiscordPreview();
    }
  }
});

// Global variables for field handling
window.selectedFields = window.selectedFields || []; // Ensure it's an array, might be pre-populated by modal script
window.detectedFields = window.detectedFields || []; // Ensure it's an array
// window.detectedSample = {}; // Not strictly needed for this error

async function detectFields() {
  // Ensure detectedFields is an array before stringify if it somehow became undefined
  window.detectedFields = window.detectedFields || [];
  window.selectedFields = window.selectedFields || []; // also ensure selectedFields is initialized

  if (!currentFeed && !document.getElementById('edit-feed-url')?.value) { // Also check edit modal URL
    showToast('Please save the feed first or ensure URL is present', 'error');
    return;
  }

  const url = currentFeed ? currentFeed.url : document.getElementById('edit-feed-url').value;
  if (!url) {
    showToast('Please enter a feed URL first', 'error');
    return;
  }
  console.log('[detectFields] Called with URL:', url); // <-- ADDED LOG

  try {
    const response = await fetch('/api/feeds/detect-fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!response.ok) throw new Error('Failed to detect fields');
    const result = await response.json();
    console.log('[detectFields] API Response (result.fields):', result.fields); // <-- ADDED LOG

    // Assign the fresh fields from the API to window.detectedFields FIRST
    window.detectedFields = result.fields || [];

    console.log('[detectFields] window.detectedFields AFTER API assignment:', JSON.parse(JSON.stringify(window.detectedFields))); // <-- MODIFIED LOG
    console.log('[detectFields] window.selectedFields BEFORE logic:', JSON.parse(JSON.stringify(window.selectedFields))); // <-- ADDED LOG


    if (!window.selectedFields || !window.selectedFields.length) {
      console.log('[detectFields] selectedFields is empty, selecting all detected fields.'); // <-- ADDED LOG
      // Populate selectedFields from the NEWLY detectedFields
      window.selectedFields = window.detectedFields.slice();
    } else {
      console.log('[detectFields] selectedFields is NOT empty, filtering based on detectedFields.'); // <-- ADDED LOG
      // Filter selectedFields against the NEWLY detectedFields
      window.selectedFields = window.selectedFields.filter(f => {
        const included = window.detectedFields.includes(f);
        if (!included) console.log(`[detectFields] Filtering out '${f}' because it's not in detectedFields (newly fetched).`);
        return included;
      });
    }
    console.log('[detectFields] window.selectedFields AFTER logic:', JSON.parse(JSON.stringify(window.selectedFields))); // <-- ADDED LOG
    
    renderFieldCheckboxes();
    showToast('Fields detected/updated', 'success');

  } catch (err) {
    showToast(err.message, 'error');
    console.error('Error in detectFields:', err);
    // Ensure containers are in a sensible state even on error
    const container = document.getElementById('field-checkboxes');
    if (container) container.innerHTML = '<p class="text-error text-sm">Error detecting fields.</p>';
    document.querySelector('.field-selection')?.classList.remove('hidden');
  }
}

function renderFieldCheckboxes() {
  const container = document.getElementById('field-checkboxes');
  if (!container) {
    console.error('[renderFieldCheckboxes] Container #field-checkboxes not found!');
    return;
  }

  console.log('[renderFieldCheckboxes] Rendering with window.selectedFields:', JSON.parse(JSON.stringify(window.selectedFields || []))); // <-- ADDED LOG + null check
  console.log('[renderFieldCheckboxes] Rendering with window.detectedFields:', JSON.parse(JSON.stringify(window.detectedFields || []))); // <-- ADDED LOG + null check

  if (window.detectedFields && window.detectedFields.length > 0) {
    container.innerHTML = window.detectedFields.map(field => {
      const isChecked = window.selectedFields && window.selectedFields.includes(field);
      console.log(`[renderFieldCheckboxes] For field '${field}', value="${field}", isChecked: ${isChecked}`); // <-- ADDED LOG
      return `
        <label class="label cursor-pointer justify-start gap-2">
          <input type="checkbox" class="checkbox checkbox-sm field-checkbox-item" 
                 data-field-name="${field}"
                 value="${field}" 
                 ${isChecked ? 'checked' : ''}>
          <span class="label-text text-sm">${field}</span>
        </label>
      `;
    }).join('');
    document.querySelector('.field-selection')?.classList.remove('hidden');

    // Add event listeners to the newly rendered checkboxes
    container.querySelectorAll('.field-checkbox-item').forEach(checkbox => {
      checkbox.addEventListener('change', (event) => {
        const fieldName = event.target.dataset.fieldName;
        if (event.target.checked) {
          if (!window.selectedFields.includes(fieldName)) {
            window.selectedFields.push(fieldName);
          }
        } else {
          window.selectedFields = window.selectedFields.filter(f => f !== fieldName);
        }
        console.log('[Checkbox Change] window.selectedFields updated:', JSON.parse(JSON.stringify(window.selectedFields)));
        if (typeof refreshPreview === 'function') {
          refreshPreview(); // Refresh the live preview
        }
      });
    });

  } else {
    container.innerHTML = '<p class="text-sm text-gray-500">No fields available or detected for this feed.</p>';
    document.querySelector('.field-selection')?.classList.add('hidden');
  }
}

// Handle integration toggles
document.querySelectorAll('.integration-toggle').forEach(toggle => {
  toggle.addEventListener('change', () => {
    const type = toggle.dataset.type;
    const settings = document.getElementById(`${type}-settings`);
    if (settings) {
      settings.style.display = toggle.checked ? 'block' : 'none';
    }
    
    // Handle Discord preview toggle visibility
    if (type === 'discord') {
      const discordPreviewToggle = document.getElementById('show-discord-preview')?.parentElement;
      if (discordPreviewToggle) {
        discordPreviewToggle.style.display = toggle.checked ? 'flex' : 'none';
        if (!toggle.checked) {
          document.getElementById('show-discord-preview').checked = false;
          document.getElementById('discord-preview-section').style.display = 'none';
        }
      }
    }
  });
});

// Handle integration select changes
['discord', 'telegram', 'slack'].forEach(type => {
  const select = document.getElementById(`${type}-integration-select`);
  const settings = document.getElementById(`${type}-settings`);
  
  if (select && settings) {
    select.addEventListener('change', () => {
      const customSettings = document.getElementById(`${type}-custom-settings`);
      if (customSettings) {
        customSettings.style.display = select.value === '' ? 'block' : 'none';
      }
    });
  }
});

// Comment out the old showEditFeedModal in app.js
/*
async function showEditFeedModal(id) {
  try {
    debug('Loading feed data for ID', id); // This is the log we were seeing
    const response = await fetch(`/api/feeds/${id}`);
    const feed = await response.json();
    debug('Loaded feed data:', feed);
    currentFeed = feed; // currentFeed might be an issue if app.js expects it globally here
    
    // Populate basic feed info
    document.getElementById('edit-feed-id').value = id;
    document.getElementById('edit-feed-title').value = feed.title || '';
    document.getElementById('edit-feed-url').value = feed.url || '';
    document.getElementById('edit-feed-interval').value = feed.interval || 5;

    // Load saved fields
    try {
      window.selectedFields = Array.isArray(feed.fields_to_send) ? feed.fields_to_send : 
                            typeof feed.fields_to_send === 'string' ? JSON.parse(feed.fields_to_send) : [];
    } catch (err) {
      console.error('Error parsing fields_to_send:', err);
      window.selectedFields = [];
    }

    // Reset all integration toggles and settings
    document.querySelectorAll('.integration-toggle').forEach(toggle => {
      const type = toggle.dataset.type;
      toggle.checked = false;
      const settings = document.getElementById(`${type}-settings`);
      if (settings) settings.style.display = 'none';
    });

    // Parse and set up integrations
    try {
      const integrations = Array.isArray(feed.integrations) ? feed.integrations :
                          typeof feed.integrations === 'string' ? JSON.parse(feed.integrations) : [];
      
      debug('Processing integrations:', integrations);
      
      integrations.forEach(integration => {
        const toggle = document.querySelector(`.integration-toggle[data-type="${integration.service}"]`);
        
        if (toggle) {
          toggle.checked = true;
          const settings = document.getElementById(`${integration.service}-settings`);
          if (settings) {
            settings.style.display = 'block';
            
            // Fill in integration-specific settings
            if (integration.service === 'discord') {
              debug('Setting up Discord integration:', integration);
              document.querySelector('input[name="discord_webhook_url"]').value = integration.webhook_url || '';
              document.querySelector('input[name="discord_username"]').value = integration.username || '';
              document.querySelector('input[name="discord_avatar"]').value = integration.avatar_url || '';
              
              // Handle Discord embed settings
              const useEmbedsToggle = document.getElementById('discord-use-embeds');
              if (useEmbedsToggle && integration.embed_settings) {
                debug('Found embed settings:', integration.embed_settings);
                useEmbedsToggle.checked = true;
                const embedSettings = document.getElementById('discord-embed-settings');
                if (embedSettings) {
                  embedSettings.style.display = 'block';
                  
                  // Clear existing embeds
                  const container = document.getElementById('discord-embeds-container');
                  Array.from(container.children).forEach(child => {
                    if (!child.classList.contains('embed-template')) {
                      child.remove();
                    }
                  });
                  
                  // Add saved embeds
                  const embedData = typeof integration.embed_settings === 'string' 
                    ? JSON.parse(integration.embed_settings) 
                    : integration.embed_settings;
                  
                  debug('Processing embed data:', embedData);
                    
                  if (embedData.embeds && embedData.embeds.length > 0) {
                    const embed = addEmbed();
                    if (embed) {
                      const embedConfig = embedData.embeds[0];
                      debug('Setting embed fields:', embedConfig);
                      
                      // Set each field, preserving any existing value
                      embed.querySelector('[name="embed_author"]').value = embedConfig.author || '';
                      embed.querySelector('[name="embed_title"]').value = embedConfig.title || '';
                      embed.querySelector('[name="embed_description"]').value = embedConfig.description || '';
                      embed.querySelector('[name="embed_url"]').value = embedConfig.url || '';
                      embed.querySelector('[name="embed_color"]').value = embedConfig.color ? `#${embedConfig.color.toString(16).padStart(6, '0')}` : '#5865F2';
                      embed.querySelector('[name="embed_footer"]').value = embedConfig.footer || '';
                      embed.querySelector('[name="embed_thumbnail"]').value = embedConfig.thumbnail || '';
                      embed.querySelector('[name="embed_image"]').value = embedConfig.image || '';
                      
                      updateDiscordPreview();
                    }
                  }
                }
              }
            } else if (integration.service === 'telegram') {
              document.querySelector('input[name="telegram_token"]').value = integration.token || '';
              document.querySelector('input[name="telegram_chat_id"]').value = integration.chat_id || '';
            } else if (integration.service === 'slack') {
              document.querySelector('input[name="slack_webhook_url"]').value = integration.webhook_url || '';
            } else if (integration.service === 'email') {
              document.querySelector('input[name="email_address"]').value = integration.email || '';
            }
          }
        }
      });
    } catch (err) {
      console.error('Error parsing integrations:', err);
    }

    // If URL exists, detect fields and update checkboxes
    if (feed.url) {
      await detectFields();
      // After detecting fields, update checkboxes based on saved selection
      renderFieldCheckboxes();
    }

    // Show/hide preview sections based on toggles
    ['live-preview', 'recent-articles', 'discord-preview'].forEach(id => {
      const section = document.getElementById(`${id}-section`);
      const toggle = document.getElementById(`show-${id}`);
      if (section && toggle) {
        section.style.display = toggle.checked ? 'block' : 'none';
        if (toggle.checked) {
          if (id === 'live-preview') refreshPreview();
          if (id === 'recent-articles') refreshArticles();
          if (id === 'discord-preview') updateDiscordPreview();
        }
      }
    });

    // Show modal
    document.getElementById('edit-feed-modal').showModal();
  } catch (err) {
    console.error('Error showing edit modal:', err);
    showToast(err.message, 'error');
  }
}
*/

// Test feed function
async function testNotification() {
  if (!currentFeed) return;
  
  try {
    // Get the current preview content
    const response = await fetch(`/api/feeds/${currentFeed.id}/preview`);
    if (!response.ok) throw new Error('Failed to load preview');
    const preview = await response.json();
    
    // Get the most recent article
    const mostRecentArticle = preview.items[0];
    if (!mostRecentArticle) {
      showToast('No articles available to test', 'error');
      return;
    }

    // Filter the article data based on selected fields
    const filteredArticle = {};
    window.selectedFields.forEach(field => {
      if (mostRecentArticle[field] !== undefined) {
        filteredArticle[field] = mostRecentArticle[field];
      }
    });

    // Send test notification
    const testResponse = await fetch(`/api/feeds/${currentFeed.id}/send-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        test_item: filteredArticle,
        fields_to_send: window.selectedFields
      })
    });
    
    const result = await testResponse.json();
    if (result.success) {
      showToast('Test notification sent!', 'success');
    } else {
      throw new Error(result.error || 'Failed to send test notification');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function refreshPreview() {
  if (!currentFeed) return;
  
  const previewContainer = document.getElementById('preview-container');
  const discordPreview = document.getElementById('discord-preview');
  
  try {
    const response = await fetch(`/api/feeds/${currentFeed.id}/preview`);
    if (!response.ok) throw new Error('Failed to load preview');
    const preview = await response.json();
    
    // Get only the most recent article
    const mostRecentArticle = preview.items[0];
    
    // Update feed preview
    previewContainer.innerHTML = `
      <div class="prose max-w-none">
        <h3>${preview.title}</h3>
        ${window.selectedFields.includes('description') ? `<p class="text-sm opacity-70">${preview.description}</p>` : ''}
        ${mostRecentArticle ? `
          <div class="bg-base-100 p-3 rounded-lg">
            ${window.selectedFields.map(field => {
              const value = mostRecentArticle[field];
              if (value === undefined || value === null || value === '') return '';
              
              // Handle different types of values
              let displayValue = '';
              if (Array.isArray(value)) {
                displayValue = value.join(', ');
              } else if (typeof value === 'object') {
                displayValue = JSON.stringify(value, null, 2);
              } else {
                displayValue = value.toString();
              }
              
              return `
                <div class="mb-2">
                  <span class="text-xs font-medium opacity-70">${field}:</span>
                  <div class="text-sm whitespace-pre-wrap">${displayValue}</div>
                </div>
              `;
            }).filter(Boolean).join('')}
          </div>
        ` : '<p class="text-sm opacity-70">No articles found</p>'}
      </div>
    `;
    
    // Update Discord preview if visible and rich embeds are not enabled
    if (document.getElementById('show-discord-preview')?.checked && 
        !document.getElementById('discord-use-embeds')?.checked && 
        mostRecentArticle) {
      discordPreview.innerHTML = `
        <div class="flex items-start gap-3">
          <img src="${currentFeed.webhook_avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-10 h-10 rounded-full">
          <div>
            <div class="font-medium">${currentFeed.webhook_username || currentFeed.title}</div>
            <div class="opacity-70 text-sm">New article from ${currentFeed.title}</div>
            <div class="mt-2 border-l-4 border-[#4f545c] pl-3">
              ${window.selectedFields.map(field => {
                const value = mostRecentArticle[field];
                if (value === undefined || value === null || value === '') return '';
                
                // Handle different types of values
                let displayValue = '';
                if (Array.isArray(value)) {
                  displayValue = value.join(', ');
                } else if (typeof value === 'object') {
                  displayValue = JSON.stringify(value, null, 2);
                } else {
                  displayValue = value.toString();
                }
                
                return `
                  <div class="mb-2">
                    <span class="text-xs font-medium opacity-70">${field}:</span>
                    <div class="text-sm whitespace-pre-wrap">${displayValue}</div>
                  </div>
                `;
              }).filter(Boolean).join('')}
            </div>
          </div>
        </div>
      `;
    } else if (document.getElementById('show-discord-preview')?.checked && 
               document.getElementById('discord-use-embeds')?.checked) {
      // If rich embeds are enabled, call updateDiscordPreview instead
      updateDiscordPreview();
    }
  } catch (err) {
    previewContainer.innerHTML = `<div class="text-error">Failed to load preview: ${err.message}</div>`;
    if (discordPreview) {
      discordPreview.innerHTML = `<div class="text-error">Failed to load Discord preview</div>`;
    }
  }
}

function getEmbedSettings() {
  const embeds = [];
  document.querySelectorAll('#discord-embeds-container > div:not(.embed-template)').forEach(embedDiv => {
    const embed = {
      author: embedDiv.querySelector('[name="embed_author"]')?.value || '',
      title: embedDiv.querySelector('[name="embed_title"]')?.value || '',
      description: embedDiv.querySelector('[name="embed_description"]')?.value || '',
      url: embedDiv.querySelector('[name="embed_url"]')?.value || '',
      color: embedDiv.querySelector('[name="embed_color"]')?.value || '#5865F2',
      footer: embedDiv.querySelector('[name="embed_footer"]')?.value || '',
      thumbnail: embedDiv.querySelector('[name="embed_thumbnail"]')?.value || '',
      image: embedDiv.querySelector('[name="embed_image"]')?.value || ''
    };
    
    // Only include non-empty fields
    Object.keys(embed).forEach(key => {
      if (!embed[key]) delete embed[key];
    });

    // Convert color to decimal if present
    if (embed.color) {
      embed.color = parseInt(embed.color.replace('#', ''), 16);
    }

    // Only add embed if it has at least one non-empty field
    if (Object.keys(embed).length > 0) {
      embeds.push(embed);
    }
  });

  return embeds.length > 0 ? {
    enabled: true,
    embeds: embeds
  } : null;
}

async function updateDiscordPreview() {
  const useEmbeds = document.getElementById('discord-use-embeds')?.checked;
  const previewContainer = document.getElementById('discord-preview');
  
  // If embeds are not used or the preview container doesn't exist, clear preview and exit.
  if (!previewContainer) {
    console.error('Discord preview container not found.');
    return;
  }
  if (!useEmbeds) {
    previewContainer.innerHTML = ''; // Clear preview if embeds are turned off
    return;
  }

  try {
    const username = document.querySelector('input[name="discord_username"]')?.value || 'RSS Monitor';
    const avatar = document.querySelector('input[name="discord_avatar"]')?.value || 'https://cdn.discordapp.com/embed/avatars/0.png';

    const feedIdInput = document.getElementById('edit-feed-id');
    if (!currentFeed && !feedIdInput?.value) {
        previewContainer.innerHTML = '<div class="text-sm text-gray-500 p-4">Save the feed first to see a preview.</div>';
        return;
    }
    const feedId = currentFeed?.id || feedIdInput.value;

    const response = await fetch(`/api/feeds/${feedId}/preview`);
    if (!response.ok) throw new Error('Failed to load feed preview data for Discord preview');
    const feedPreviewData = await response.json();
    const article = feedPreviewData.items && feedPreviewData.items.length > 0 ? feedPreviewData.items[0] : {};

    const embedContainer = document.getElementById('discord-embeds-container');
    const embedDivs = embedContainer?.querySelectorAll('.embed-content:not(.embed-template)');
    
    if (!embedDivs || embedDivs.length === 0) {
        previewContainer.innerHTML = '<div class="text-sm text-gray-500 p-4">Add an embed to see a preview.</div>';
        return;
    }

    // Start of the single message structure
    let previewHTML = `
      <div class="flex items-start gap-3 bg-[#313338] text-white p-4 rounded-md">
        <img src="${avatar}" class="w-10 h-10 rounded-full" id="discord-preview-avatar">
        <div class="flex-1 min-w-0">
          <div class="font-medium text-white mb-2" id="discord-preview-username">${username}</div>
    `; // mb-2 added to username for spacing if there are embeds

    const interpolate = (str) => {
      if (!str) return '';
      return str.replace(/\${(\w+)}/g, (match, field) => {
        if (field === 'pubDate' && article.pubDate) {
          return new Date(article.pubDate).toLocaleString();
        }
        // Fallback for common fields if not in article, or keep original placeholder
        const fallbackValue = article[field] || (currentFeed && currentFeed[field]) || '' ;
        return fallbackValue || match; // Return value or original placeholder like ${title}
      });
    };

    let hasVisibleEmbedContent = false;
    console.log(`[updateDiscordPreview] Number of embedDivs found: ${embedDivs.length}`); // Log how many embed forms we are about to loop through

    embedDivs.forEach((embedDiv, loopIndex) => {
      console.log(`[updateDiscordPreview] Loop ${loopIndex}: Processing embedDiv:`, embedDiv);

      const rawTitle = embedDiv.querySelector('[name="embed_title"]')?.value;
      const rawDescription = embedDiv.querySelector('[name="embed_description"]')?.value;
      console.log(`[updateDiscordPreview] Loop ${loopIndex}: Raw title: '${rawTitle}', Raw description: '${rawDescription}'`);

      const title = interpolate(rawTitle);
      const description = interpolate(rawDescription);
      const footerText = interpolate(embedDiv.querySelector('[name="embed_footer"]')?.value);
      const color = embedDiv.querySelector('[name="embed_color"]')?.value || '#5865F2';
      const authorName = interpolate(embedDiv.querySelector('[name="embed_author"]')?.value);
      const url = interpolate(embedDiv.querySelector('[name="embed_url"]')?.value);
      const thumbnailUrl = interpolate(embedDiv.querySelector('[name="embed_thumbnail"]')?.value);
      const imageUrl = interpolate(embedDiv.querySelector('[name="embed_image"]')?.value);

      console.log(`[updateDiscordPreview] Loop ${loopIndex}: Interpolated title: '${title}', Interpolated description: '${description}'`);

      let singleEmbedHtml = ''; // Store HTML for this single embed before appending

      if (authorName || title || description || footerText || thumbnailUrl || imageUrl) {
        hasVisibleEmbedContent = true;
        singleEmbedHtml = `
          <div class="mt-1 border-l-4 rounded-md overflow-hidden" style="border-color: ${color}; background-color: #2f3136;">
            <div class="p-3">
              ${authorName ? `
                <div class="text-sm font-medium mb-1 text-white" id="discord-preview-author">
                  ${authorName}
                </div>
              ` : ''}
              
              ${title ? `
                <div class="text-base font-medium text-white hover:underline">
                  <a href="${url || '#'}" target="_blank" rel="noopener noreferrer" id="discord-preview-title">${title}</a>
                </div>
              ` : ''}
              
              ${description ? `
                <div class="text-sm mt-1 mb-2 text-[#dcddde]" id="discord-preview-description">
                  ${description}
                </div>
              ` : ''}
              
              ${thumbnailUrl ? `
                <img src="${thumbnailUrl}" class="max-w-[80px] max-h-[80px] rounded float-right ml-2 mb-1" id="discord-preview-thumbnail">
              ` : ''}

              ${imageUrl ? `
                <img src="${imageUrl}" class="max-w-full rounded mt-2" id="discord-preview-image">
              ` : ''}
              
              ${footerText ? `
                <div class="text-xs text-[#a3a6aa] mt-2" id="discord-preview-footer" style="clear: both;">
                  ${footerText}
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }
      console.log(`[updateDiscordPreview] Loop ${loopIndex}: HTML generated for this embed (singleEmbedHtml):
${singleEmbedHtml}`);
      previewHTML += singleEmbedHtml; // Append the HTML for this single embed
    });
    
    if (!hasVisibleEmbedContent && embedDivs.length > 0) { // ensure embedDivs existed before saying it's empty
        previewHTML += '<div class="text-xs text-gray-400 mt-1 italic">(Embed form is empty or only contains non-displayable fields)</div>';
    }

    // End of the single message structure
    previewHTML += `
        </div>
      </div>
    `;

    previewContainer.innerHTML = previewHTML;
  } catch (err) {
    console.error('Error updating Discord preview:', err);
    previewContainer.innerHTML = `
      <div class="text-red-500 p-4 rounded bg-red-100">
        Failed to update Discord preview: ${err.message}
      </div>
    `;
  }
}

// Update Discord preview when embed fields change
document.addEventListener('input', (e) => {
  if (e.target.matches('#discord-embeds-container input, #discord-embeds-container textarea')) {
    updateDiscordPreview();
  }
});

// Update preview when showing Discord preview section
document.getElementById('discord-use-embeds')?.addEventListener('change', function() {
  const embedSettings = document.getElementById('discord-embed-settings');
  embedSettings.style.display = this.checked ? 'block' : 'none';
  
  if (this.checked) {
    if (document.getElementById('discord-embeds-container').children.length <= 1) {
      // Calling the global addEmbed function
      if (window.addEmbed) window.addEmbed();
    }
    updateDiscordPreview();
  }
});

// Add new feed form handler (if it exists and is separate)
const addFeedForm = document.getElementById('add-feed-form');