// Handles Discord embed builder logic and preview

let currentEmbeds = [];

function renderEmbedPreview() {
  // For legacy single-embed preview (if you want to keep it)
  const preview = document.getElementById('embed-preview');
  if (!preview) return;
  const title = document.getElementById('embed-title')?.value || '';
  const description = document.getElementById('embed-description')?.value || '';
  const color = document.getElementById('embed-color')?.value || '#5865F2';
  preview.innerHTML = `
    <div class="discord-embed" style="border-left: 4px solid ${color};">
      <div class="embed-title">${title}</div>
      <div class="embed-description">${description}</div>
    </div>
  `;
}

function collectEmbedSettings() {
  // For legacy single-embed input fields
  return {
    enabled: document.getElementById('embed-enabled')?.checked || false,
    title: document.getElementById('embed-title')?.value || '',
    description: document.getElementById('embed-description')?.value || '',
    color: document.getElementById('embed-color')?.value || '#5865F2',
    footer: document.getElementById('embed-footer')?.value || ''
  };
}
