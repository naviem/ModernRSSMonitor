// Handles connection selection and UI for Edit Feed modal

window.editSelectedConnections = [];

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

function updateEditSelectedUI() {
  const selectedContainer = document.getElementById('editSelectedConnections');
  const hiddenInput = document.getElementById('edit-connection_ids');
  if (!selectedContainer || !hiddenInput) return;
  if (window.editSelectedConnections.length === 0) {
    selectedContainer.innerHTML = 'No connections selected';
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