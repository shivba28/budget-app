const TELLER_CONNECT_SCRIPT = 'https://cdn.teller.io/connect/connect.js'

/**
 * Locally constructed HTML only (never fetched from a network).
 * Loads Teller Connect from the official CDN, then posts bridge messages — never logs tokens.
 */
export function buildTellerConnectHtml(
  applicationId: string,
  environment: 'sandbox' | 'development' | 'production',
  repairEnrollmentId?: string,
): string {
  const app = JSON.stringify(applicationId)
  const env = JSON.stringify(environment)
  const products = JSON.stringify(['transactions', 'balance'])
  const repair =
    typeof repairEnrollmentId === 'string' && repairEnrollmentId.trim().length > 0
      ? `enrollmentId: ${JSON.stringify(repairEnrollmentId.trim())},`
      : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
  <style>html,body{height:100%;margin:0;background:#fff}</style>
</head>
<body>
<script>
(function () {
  function post(obj) {
    try {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(obj));
      }
    } catch (e) {}
  }
  var s = document.createElement('script');
  s.src = ${JSON.stringify(TELLER_CONNECT_SCRIPT)};
  s.onload = function () {
    if (!window.TellerConnect) {
      post({ type: 'teller_error', message: 'TellerConnect missing after script load' });
      return;
    }
    try {
      var tc = window.TellerConnect.setup({
        applicationId: ${app},
        environment: ${env},
        products: ${products},
        ${repair}
        onInit: function () {
          tc.open();
        },
        onSuccess: function (enrollment) {
          post({ type: 'teller_success', payload: enrollment });
        },
        onExit: function () {
          post({ type: 'teller_exit' });
        }
      });
    } catch (err) {
      post({
        type: 'teller_error',
        message: String(err && err.message ? err.message : err),
      });
    }
  };
  s.onerror = function () {
    post({ type: 'teller_error', message: 'Failed to load Teller Connect script' });
  };
  document.head.appendChild(s);
})();
</script>
</body>
</html>`
}
