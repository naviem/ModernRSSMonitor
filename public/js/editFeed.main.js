// Handles form submit and coordinates all modules

// Helper for variable interpolation in templates
function interpolate(template, item) {
  if (!template) return '';
  return template.replace(/\$\{(\w+)\}/g, (_, key) => item[key] || '');
}

document.getElementById('editFeedForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData.entries());
  data.connection_ids = window.editSelectedConnections;
  data.fields_to_send = window.selectedFields;
  data.embed_settings = collectEmbedSettings();
  try {
    await fetch(`/api/feeds/${data.feed_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    window.location.reload();
  } catch (error) {
    showToast('Error saving feed');
  }
});
