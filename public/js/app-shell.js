class AppShell {
  constructor() {
    this.themeToggle = document.getElementById('themeToggle');
    this.sidebarToggle = document.getElementById('sidebarToggle');
    this.sidebar = document.getElementById('appSidebar');
    this.sidebarOverlay = document.getElementById('sidebarOverlay');
    this.starCount = document.getElementById('starCount');
    this.initTheme();
    this.initSidebar();
    this.loadStars();
  }

  initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    this.setTheme(savedTheme);
    this.themeToggle?.addEventListener('click', () => {
      const nextTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      this.setTheme(nextTheme);
    });
  }

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    const icon = this.themeToggle?.querySelector('i');
    if (icon) {
      icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }
  }

  initSidebar() {
    const toggle = () => {
      this.sidebar?.classList.toggle('is-open');
      this.sidebarOverlay?.classList.toggle('is-open');
    };

    this.sidebarToggle?.addEventListener('click', toggle);
    this.sidebarOverlay?.addEventListener('click', toggle);
  }

  async loadStars() {
    if (!this.starCount) return;
    try {
      const response = await fetch('https://api.github.com/repos/arturict/tagvico-ai');
      if (!response.ok) {
        throw new Error('Failed to load stars');
      }

      const repo = await response.json();
      this.starCount.textContent = Number(repo.stargazers_count || 0).toLocaleString();
    } catch {
      this.starCount.textContent = '0';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.appShell = new AppShell();
});
