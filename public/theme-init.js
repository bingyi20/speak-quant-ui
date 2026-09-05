(function () {
  try {
    var allowed = document.currentScript && document.currentScript.dataset.darkEnabled === 'true';
    var cookie = document.cookie.split('; ').find(function (v) { return v.indexOf('trade-theme=') === 0; });
    var value = cookie ? decodeURIComponent(cookie.split('=')[1]).replace(/"/g, '') : 'light';
    var dark = allowed && (value === 'dark' || (value === 'system' && matchMedia('(prefers-color-scheme: dark)').matches));
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', dark);
  } catch (_) { document.documentElement.dataset.theme = 'light'; }
})();
