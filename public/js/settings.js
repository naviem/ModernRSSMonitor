// Dark mode toggle
document.getElementById('darkModeToggle')?.addEventListener('change', function(e) {
  document.body.classList.toggle('dark-mode', e.target.checked);
  localStorage.setItem('darkMode', e.target.checked ? '1' : '0');
});

if (localStorage.getItem('darkMode') === '1') {
  document.body.classList.add('dark-mode');
  const darkToggle = document.getElementById('darkModeToggle');
  if (darkToggle) darkToggle.setAttribute('checked', 'checked');
}

// Sidebar compact toggle
document.getElementById('sidebarCollapsed')?.addEventListener('change', function(e) {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('sidebar-collapsed', e.target.checked);
  localStorage.setItem('sidebarCollapsed', e.target.checked ? '1' : '0');
});

if (localStorage.getItem('sidebarCollapsed') === '1') {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.add('sidebar-collapsed');
  const sidebarCollapsed = document.getElementById('sidebarCollapsed');
  if (sidebarCollapsed) sidebarCollapsed.setAttribute('checked', 'checked');
}

// Recent articles count
document.getElementById('recentArticlesCount')?.addEventListener('change', function(e) {
  let val = Math.max(1, Math.min(10, Number(e.target.value)));
  localStorage.setItem('recentArticlesCount', val);
  window.dispatchEvent(new Event('storage')); // update feeds.js
});

if (localStorage.getItem('recentArticlesCount')) {
  const rac = document.getElementById('recentArticlesCount');
  if (rac) rac.value = localStorage.getItem('recentArticlesCount');
}

// Default scan interval
document.getElementById('defaultInterval')?.addEventListener('change', function(e) {
  let val = Math.max(1, Number(e.target.value));
  localStorage.setItem('defaultScanInterval', val);
});

if (localStorage.getItem('defaultScanInterval')) {
  const di = document.getElementById('defaultInterval');
  if (di) di.value = localStorage.getItem('defaultScanInterval');
}

// Use default scan interval in Add Feed modal
document.getElementById('add-feed-btn')?.addEventListener('click', () => {
  const defaultInterval = localStorage.getItem('defaultScanInterval');
  if (defaultInterval) {
    const asi = document.getElementById('add-scan-interval');
    if (asi) asi.value = defaultInterval;
  }
});

// ---- DANGER ZONE: Reset/Wipe ----
document.getElementById('resetAllBtn')?.addEventListener('click', async () => {
  if (!confirm('Are you sure? This will delete ALL feeds and integrations!')) return;
  const resp = await fetch('/api/reset-all', { method: 'POST' });
  const result = await resp.json();
  if (result.success) {
    showToast('All feeds and integrations deleted!', 'success');
    // Update any feed lists on the page if they exist
    if (typeof window.loadFeeds === 'function') {
      window.loadFeeds();
    }
    if (typeof window.loadIntegrations === 'function') {
      window.loadIntegrations();
    }
  } else {
    showToast('Error: ' + (result.error || 'Unknown error'), 'error');
  }
});

document.getElementById('wipeDbBtn')?.addEventListener('click', async () => {
  if (!confirm('Are you sure? This will DELETE THE ENTIRE DATABASE FILE and recreate it!')) return;
  const resp = await fetch('/api/wipe-database', { method: 'POST' });
  const result = await resp.json();
  if (result.success) {
    showToast('Database wiped and reset!', 'success');
    // Update any lists on the page if they exist
    if (typeof window.loadFeeds === 'function') {
      window.loadFeeds();
    }
    if (typeof window.loadIntegrations === 'function') {
      window.loadIntegrations();
    }
  } else {
    showToast('Error: ' + (result.error || 'Unknown error'), 'error');
  }
});

function showToast(message, type = 'info') {
  // Use the global showToast if available
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
  } else {
    alert(message);
  }
}
