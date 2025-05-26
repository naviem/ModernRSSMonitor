let addSelectedConnections = [];
function updateAddSelectedUI() {
  const selectedContainer = document.getElementById('addSelectedConnections');
  const availableList = document.getElementById('addAvailableConnections');
  const hiddenInput = document.getElementById('add-connection_ids');
  if (!selectedContainer || !availableList || !hiddenInput) return;
  if (addSelectedConnections.length === 0) {
    selectedContainer.innerHTML = '<small class="text-muted">No connections selected</small>';
  } else {
    selectedContainer.innerHTML = '';
    addSelectedConnections.forEach(id => {
      const btn = availableList.querySelector(`button[data-id="${id}"]`);
      if (btn) {
        const li = document.createElement('div');
        li.className = 'badge bg-primary me-1 mb-1 d-inline-flex align-items-center';
        li.textContent = btn.parentElement.textContent.trim();
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-close btn-close-white btn-sm ms-2';
        removeBtn.setAttribute('aria-label', 'Remove');
        removeBtn.onclick = () => {
          addSelectedConnections = addSelectedConnections.filter(cid => cid !== id);
          updateAddSelectedUI();
        };
        li.appendChild(removeBtn);
        selectedContainer.appendChild(li);
      }
    });
  }
  hiddenInput.value = JSON.stringify(addSelectedConnections);
}
function setupAddAvailableConnections() {
  const availableList = document.getElementById('addAvailableConnections');
  if (!availableList) return;
  availableList.querySelectorAll('button').forEach(button => {
    button.onclick = () => {
      const id = button.getAttribute('data-id');
      if (!addSelectedConnections.includes(id)) {
        addSelectedConnections.push(id);
        updateAddSelectedUI();
      }
    };
  });
}
document.getElementById('add-feed-btn')?.addEventListener('click', () => {
  addSelectedConnections = [];
  updateAddSelectedUI();
  document.getElementById('addFeedForm').reset();
  // Set scan interval to default if available
  const defaultInterval = localStorage.getItem('defaultScanInterval');
  if (defaultInterval) {
    document.getElementById('add-scan-interval').value = defaultInterval;
  }
});
window.addEventListener('DOMContentLoaded', setupAddAvailableConnections);
document.getElementById('addFeedForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData.entries());
  data.connection_ids = addSelectedConnections;
  try {
    const resp = await fetch('/api/feeds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await resp.json();
    if (result.success) {
      window.location.reload();
    } else {
      alert(result.error || 'Error saving feed');
    }
  } catch (error) {
    alert('Error saving feed');
  }
});

// Test Feed Button
document.getElementById('testAddFeedBtn')?.addEventListener('click', async () => {
  const url = document.getElementById('add-feed-url').value;
  if (!url) return alert('Please enter a URL');
  try {
    const response = await fetch('/api/feeds/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const result = await response.json();
    alert(result.valid ? 'Valid RSS feed!' : 'Invalid RSS feed');
  } catch (error) {
    alert('Error testing feed');
  }
});
