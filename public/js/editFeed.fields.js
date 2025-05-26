// Handles field detection, checkbox rendering, and notification preview

let detectedFields = [];
let detectedSample = {};
window.selectedFields = [];

function renderFieldCheckboxes() {
  const container = document.getElementById('fieldCheckboxes');
  if (!detectedFields || !detectedFields.length) {
    container.innerHTML = 'No fields detected yet.';
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
  const sample = detectedSample || {};
  let html = '';
  if (!detectedFields || !detectedFields.length) {
    html = 'No fields detected yet.';
  } else if (!window.selectedFields || window.selectedFields.length === 0) {
    html = 'No fields selected.';
  } else {
    html = window.selectedFields.map(f => {
      let val = sample[f] || `[${f}]`;
      if (f === 'link' && val) val = `${val}`;
      return `<b>${f}:</b> ${val}`;
    }).join('<br>');
  }
  document.getElementById('notificationPreview').innerHTML = html;
}