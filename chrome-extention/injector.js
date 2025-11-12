// This script runs in the main page's context, not the isolated content script world.
// Its only job is to grab the tarfash token and post it back to the content script.
try {
  // We access `tarfash` directly, not `window.tarfash`, because it was likely
  // declared with `const` or `let` at the top level of a script.
  window.postMessage({ type: 'FROM_PAGE_SCRIPT', token: tarfash }, '*');
} catch (error) {
  window.postMessage({ type: 'FROM_PAGE_SCRIPT', token: null, error: error.message }, '*');
}
