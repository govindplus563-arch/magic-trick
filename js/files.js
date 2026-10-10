/* Saving a file works differently in a browser and inside the Android app (WebView cannot download blob links). */
(function () {
  const native = () => !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());

  async function save(name, mime, text) {
    if (native() && Capacitor.Plugins && Capacitor.Plugins.Filesystem && Capacitor.Plugins.Share) {
      const w = await Capacitor.Plugins.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
      await Capacitor.Plugins.Share.share({ title: name, url: w.uri, dialogTitle: 'Save or share ' + name });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  window.Files = { save, isNative: native };
})();
