// Adapter for the packaged Kairos app. No Android bridge or network required.
(() => {
  if (window.parent === window) return;
  const channel = 'kairos-intro-v1';
  window.KairosOnboarding = { postMessage(raw) {
    window.parent.postMessage({ channel, event: JSON.parse(raw) }, '*');
  }};
  const setTheme = theme => {
    if (!['light', 'dark'].includes(theme)) return;
    document.getElementById('kairos-intro-root').dataset.theme = theme;
  };
  setTheme(new URLSearchParams(location.search).get('theme'));
  window.addEventListener('message', event => {
    if (event.source === window.parent && event.data?.channel === channel) setTheme(event.data.theme);
  });
})();
