window.UglifyJS_NoUnsafeEval = true
window.OmegaPopup = {};

$script('../../js/omega_target_popup.js', 'om-target', function() {
  $script('../js/style.js', 'om-style')
  function start(tabId) {
    window.OmegaPopup.tabId = tabId;
    OmegaTargetPopup.getState([
      'availableProfiles',
      'currentProfileName',
      'validResultProfiles',
      'currentProfileCanAddRule',
      'customCss',
    ], function(err, state) {
      window.OmegaPopup.state = state || {};
      import('./index.js');
    });
  }
  function handleTabs(tabs) {
    const tab = tabs && tabs[0];
    start(tab && (tab.pendingUrl || tab.url) ? tab.id : null);
  }
  const tabIdParam = new URLSearchParams(location.search).get('tabId');
  if (tabIdParam && /^\d+$/.test(tabIdParam)) {
    start(parseInt(tabIdParam));
    return;
  }
  try {
    const result = chrome.tabs.query({active: true, lastFocusedWindow: true});
    if (result && typeof result.then === 'function') {
      result.then(handleTabs, function(){ handleTabs(null); });
    } else {
      chrome.tabs.query({active: true, lastFocusedWindow: true}, handleTabs);
    }
  } catch (_) {
    handleTabs(null);
  }
});
