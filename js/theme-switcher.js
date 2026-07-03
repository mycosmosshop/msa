/**
 * Theme Switcher
 * Handles light/dark mode toggling with user preference persistence
 */

// Initialize theme on page load
document.addEventListener('DOMContentLoaded', function() {
  loadThemePreference();
  setupThemeToggle();
});

/**
 * Load user's theme preference from server
 */
async function loadThemePreference() {
  try {
    // Try to get from localStorage first for instant application
    const localTheme = localStorage.getItem('theme_mode');
    if (localTheme) {
      applyTheme(localTheme);
    }
    
    // Then sync with server
    const response = await fetch('/user/theme-preference');
    if (response.ok) {
      const data = await response.json();
      const serverTheme = data.theme_mode || 'light';
      
      // If server theme differs from local, use server theme
      if (serverTheme !== localTheme) {
        applyTheme(serverTheme);
        localStorage.setItem('theme_mode', serverTheme);
      }
    }
  } catch (error) {
    console.error('Error loading theme preference:', error);
    // Default to light theme on error
    applyTheme('light');
  }
}

/**
 * Setup theme toggle button event listener
 */
function setupThemeToggle() {
  const toggleButton = document.getElementById('theme-toggle');
  if (toggleButton) {
    toggleButton.addEventListener('click', toggleTheme);
  }
}

/**
 * Toggle between light and dark themes
 */
async function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  
  applyTheme(newTheme);
  await saveThemePreference(newTheme);
}

/**
 * Apply theme to the page
 * @param {string} theme - 'light' or 'dark'
 */
function applyTheme(theme) {
  // Set data attribute on html element
  document.documentElement.setAttribute('data-theme', theme);
  
  // Update toggle button icon
  updateToggleIcon(theme);
  
  // Store in localStorage for instant load next time
  localStorage.setItem('theme_mode', theme);
}

/**
 * Update the toggle button icon based on current theme
 * @param {string} theme - 'light' or 'dark'
 */
function updateToggleIcon(theme) {
  const lightIcon = document.getElementById('theme-icon-light');
  const darkIcon = document.getElementById('theme-icon-dark');
  
  if (lightIcon && darkIcon) {
    if (theme === 'dark') {
      // Show moon icon (currently in dark mode)
      lightIcon.style.display = 'none';
      darkIcon.style.display = 'inline';
    } else {
      // Show sun icon (currently in light mode)
      lightIcon.style.display = 'inline';
      darkIcon.style.display = 'none';
    }
  }
}

/**
 * Save theme preference to server
 * @param {string} theme - 'light' or 'dark'
 */
async function saveThemePreference(theme) {
  try {
    const response = await fetch('/user/theme-preference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ theme_mode: theme })
    });
    
    if (!response.ok) {
      throw new Error('Failed to save theme preference');
    }
    
    const data = await response.json();
    if (!data.success) {
      throw new Error('Server returned unsuccessful response');
    }
  } catch (error) {
    console.error('Error saving theme preference:', error);
    // Still works locally even if server save fails
  }
}

/**
 * Get current theme
 * @returns {string} Current theme ('light' or 'dark')
 */
function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

/**
 * Check if system prefers dark mode
 * @returns {boolean}
 */
function systemPrefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Optional: Listen for system theme changes (for auto mode in future)
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    // This could be used for 'auto' mode in the future
    console.log('System theme changed to:', e.matches ? 'dark' : 'light');
  });
}
