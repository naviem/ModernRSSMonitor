function showToast(message) {
  const toastEl = document.getElementById('liveToast');
  const toastBody = document.getElementById('toastBody');
  if (toastBody) toastBody.textContent = message;
  if (toastEl) {
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
  }
}

function renderFeedArticles(feedId, articles) {
  const maxArticles = Number(localStorage.getItem('recentArticlesCount')) || 5;
  const sortedArticles = articles.slice().sort((a, b) => {
    const dateA = new Date(a.pubDate || a.date || 0);
    const dateB = new Date(b.pubDate || b.date || 0);
    return dateB - dateA;
  });
  const toShow = sortedArticles.slice(0, maxArticles);
  const container = document.getElementById(`feed-articles-${feedId}`);
  if (!container) return;
  if (!toShow.length) {
    container.innerHTML = '<span class="text-muted">No recent articles found.</span>';
    return;
  }
  container.innerHTML = toShow.map(item => {
    const dateStr = item.pubDate ? new Date(item.pubDate).toLocaleString() : '';
    return `
      <div class="mb-2">
        <a href="${item.link || '#'}" target="_blank" rel="noopener" class="fw-semibold">${item.title || '(No title)'}</a>
        <div class="small text-muted">${dateStr}</div>
        <div class="small">${item.contentSnippet || item.summary || ''}</div>
      </div>
    `;
  }).join('');
}

window.renderAllFeeds = function(allFeeds) {
  allFeeds.forEach(feed => {
    if (feed && feed.id && Array.isArray(feed.recentArticles)) {
      renderFeedArticles(feed.id, feed.recentArticles);
    }
  });
};

document.getElementById('scan-all-btn')?.addEventListener('click', function() {
  fetch('/api/feeds/scan-all', { method: 'POST' })
    .then(res => res.json())
    .then(() => showToast('Scanning all feeds...'));
});

window.scanAllFeeds = function() {
  fetch('/api/feeds/scan-all', { method: 'POST' })
    .then(res => res.json())
    .then(() => showToast('Scanning all feeds...'));
};

window.scanFeed = function(feedId) {
  fetch(`/api/feeds/${feedId}/scan-now`, { method: 'POST' })
    .then(res => res.json())
    .then(() => showToast('Feed scan started!'));
};

window.togglePause = function(feedId, btn) {
  fetch(`/api/feeds/${feedId}/pause`, { method: 'POST' })
    .then(res => res.json())
    .then(result => {
      showToast(result.is_paused ? 'Feed paused.' : 'Feed resumed.');
      
      // Update the UI element without page refresh
      if (btn) {
        btn.textContent = result.is_paused ? 'Resume' : 'Pause';
      }
      
      // If on the main page, update the feed list
      if (typeof window.loadFeeds === 'function') {
        window.loadFeeds();
      }
    });
};

window.deleteFeed = function(feedId) {
  if (!confirm('Are you sure you want to delete this feed?')) return;
  fetch(`/api/feeds/${feedId}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(() => {
      showToast('Feed deleted.');
      
      // If on main page, update feed list
      if (typeof window.loadFeeds === 'function') {
        window.loadFeeds();
      } else {
        // If on feed details page, redirect to home
        window.location.href = '/';
      }
    });
};

document.getElementById('feedSearch')?.addEventListener('input', function() {
  const q = this.value.trim().toLowerCase();
  document.querySelectorAll('.feed-row').forEach(row => {
    const title = row.getAttribute('data-feed-title') || '';
    const url = row.getAttribute('data-feed-url') || '';
    if (title.toLowerCase().includes(q) || url.toLowerCase().includes(q)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
    const previewRow = document.getElementById(`feedArticles${row.id.replace('feed-row-', '')}`);
    if (previewRow) previewRow.style.display = row.style.display;
  });
});

if (window.io) {
  const socket = window.io();

  // Standard socket events
  socket.on('connect', () => {
    console.log('Socket.IO connected successfully!');
    showToast('Real-time updates connected.');
  });

  socket.on('connect_error', (error) => {
    console.error('Socket.IO connection error:', error);
    showToast('Error connecting to real-time updates. Please refresh.');
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket.IO disconnected:', reason);
    showToast('Real-time updates disconnected. Attempting to reconnect...');
  });

  // Custom event
  socket.on('feed-update', () => {
    console.log('Received feed-update event. Fetching new feed data.');
    fetch('/api/feeds')
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then(allFeeds => {
        console.log('Successfully fetched new feed data:', allFeeds);
        window.renderAllFeeds(allFeeds);
        showToast('Feeds updated!');
      })
      .catch(error => {
        console.error('Error fetching or processing feed data after feed-update event:', error);
        showToast('Error updating feeds. Please check console for details.');
      });
  });

  // Expose socket for debugging in console (optional, remove for production)
  window.socket = socket; 
  
} else {
  console.error('Socket.IO client (io) not found. Real-time updates will not work.');
  showToast('Socket.IO client not available. Real-time features disabled.');
}

if (window.allFeeds && Array.isArray(window.allFeeds)) {
  window.renderAllFeeds(window.allFeeds);
}
