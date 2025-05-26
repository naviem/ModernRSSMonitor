// Tooltips
document.addEventListener('DOMContentLoaded', function() {
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.map(t => new bootstrap.Tooltip(t));
});

// Toast notifications
window.showToast = function(msg, type = 'info', actionText = '', actionFn = null) {
  let toast = document.getElementById('mainToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'mainToast';
    toast.className = 'toast align-items-center text-bg-' + type + ' border-0 position-fixed bottom-0 end-0 m-4';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    toast.innerHTML = `<div class="d-flex"><div class="toast-body"></div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
    document.body.appendChild(toast);
  }
  toast.querySelector('.toast-body').innerHTML = msg + (actionText ? ` <a href="#" id="toastAction">${actionText}</a>` : '');
  if (actionText && actionFn) {
    toast.querySelector('#toastAction').onclick = function(e) { e.preventDefault(); actionFn(); };
  }
  new bootstrap.Toast(toast, { delay: 3000 }).show();
};
