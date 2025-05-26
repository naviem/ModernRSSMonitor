document.getElementById('addIntegrationForm')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  const formData = new FormData(this);
  const data = Object.fromEntries(formData.entries());
  const resp = await fetch('/integrations/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await resp.json();
  if (result.success) {
    // Update integrations without page refresh
    if (typeof window.loadIntegrations === 'function') {
      await window.loadIntegrations();
    }
    showToast('Integration added successfully', 'success');
  } else {
    alert(result.error || 'Failed to add integration');
  }
});

// Edit Integration Modal
window.showEditIntegrationModal = function(id) {
  fetch(`/api/integrations/${id}`)
    .then(res => res.json())
    .then(conn => {
      document.getElementById('edit-integration-id').value = conn.id;
      document.getElementById('edit-integration-service').value = conn.service;
      document.getElementById('edit-integration-label').value = conn.label;
      document.getElementById('edit-integration-config').value = conn.config;
      new bootstrap.Modal(document.getElementById('editIntegrationModal')).show();
    });
};

document.getElementById('editIntegrationForm')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  const formData = new FormData(this);
  const data = Object.fromEntries(formData.entries());
  await fetch(`/api/integrations/${data.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  // Update integrations without page refresh
  if (typeof window.loadIntegrations === 'function') {
    await window.loadIntegrations();
  }
  showToast('Integration updated successfully', 'success');
});

window.deleteIntegration = function(id) {
  if (confirm('Delete this integration?')) {
    fetch(`/integrations/delete/${id}`, { method: 'POST' }).then(() => {
      // Update integrations without page refresh
      if (typeof window.loadIntegrations === 'function') {
        window.loadIntegrations();
      }
      showToast('Integration deleted successfully', 'success');
    });
  }
};

window.testIntegration = function(id) {
  fetch(`/api/integrations/${id}/test`, { method: 'POST' })
    .then(res => res.json())
    .then(result => {
      if (typeof showToast === "function") {
        showToast(result.success ? result.message : (result.error || "Test failed"), result.success ? "success" : "danger");
      } else {
        alert(result.success ? result.message : (result.error || "Test failed"));
      }
    });
};
