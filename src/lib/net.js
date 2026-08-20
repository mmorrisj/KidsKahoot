/**
 * Thin WebSocket client for live games.
 *
 * Messages are plain JSON objects with a `type`, mirroring server/live.js.
 * Sends made before the socket opens are queued, so a screen can connect and
 * immediately ask for the session list without racing the handshake.
 */

export function connectLive({ onMessage, onClose = null }) {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${location.host}`);
  const queued = [];
  let closed = false;

  ws.onopen = () => {
    for (const raw of queued) ws.send(raw);
    queued.length = 0;
  };
  ws.onmessage = (event) => onMessage(JSON.parse(event.data));
  // Both paths funnel into one "it's gone" signal; onclose fires after onerror
  // anyway, so the guard keeps the handler from running twice.
  ws.onclose = () => {
    if (closed) return;
    closed = true;
    onClose?.();
  };

  return {
    send(message) {
      const raw = JSON.stringify(message);
      if (ws.readyState === WebSocket.OPEN) ws.send(raw);
      else if (ws.readyState === WebSocket.CONNECTING) queued.push(raw);
    },
    close() {
      closed = true; // deliberate close — don't report it as a failure
      ws.close();
    },
  };
}
