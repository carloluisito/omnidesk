/**
 * Generates the browser bridge that implements window.electronAPI over a
 * WebSocket, mirroring src/preload/index.ts. Generated from the IPC contract's
 * runtime maps so it stays in sync automatically. Runs in the browser with no
 * module system, so it must be a self-contained IIFE.
 */
export function generateWebBridgeScript(
  channels: Record<string, string>,
  kinds: Record<string, string>,
): string {
  const CHANNELS = JSON.stringify(channels);
  const KINDS = JSON.stringify(kinds);

  return `(function(){
  var CHANNELS = ${CHANNELS};
  var KINDS = ${KINDS};
  var pending = new Map();
  var listeners = new Map();
  var nextId = 1;
  var ws = null, open = false, queue = [];

  function connect(){
    var proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(proto + '://' + location.host + '/__omnidesk/ws');
    ws.onopen = function(){ open = true; for (var i=0;i<queue.length;i++) ws.send(queue[i]); queue = []; };
    ws.onclose = function(){ open = false; setTimeout(connect, 1000); };
    ws.onerror = function(){ try { ws.close(); } catch(e){} };
    ws.onmessage = function(ev){
      var msg; try { msg = JSON.parse(ev.data); } catch(e){ return; }
      if (msg.t === 'result') {
        var p = pending.get(msg.id); if (!p) return; pending.delete(msg.id);
        if (msg.ok) p.resolve(msg.value); else p.reject(new Error(msg.error || 'remote error'));
      } else if (msg.t === 'event') {
        var set = listeners.get(msg.channel);
        if (set) set.forEach(function(cb){ try { cb(msg.payload); } catch(e){} });
      }
    };
  }

  function sendFrame(obj){ var s = JSON.stringify(obj); if (open) ws.send(s); else queue.push(s); }
  function invoke(method, args){ return new Promise(function(resolve, reject){ var id = nextId++; pending.set(id, { resolve: resolve, reject: reject }); sendFrame({ t: 'invoke', id: id, method: method, args: args }); }); }
  function sendMsg(method, args){ sendFrame({ t: 'send', method: method, args: args }); }
  function on(channel, cb){ var set = listeners.get(channel); if (!set) { set = new Set(); listeners.set(channel, set); } set.add(cb); return function(){ set.delete(cb); }; }

  var api = {};
  Object.keys(KINDS).forEach(function(method){
    var kind = KINDS[method];
    var channel = CHANNELS[method];
    if (kind === 'invoke') api[method] = function(){ return invoke(method, Array.prototype.slice.call(arguments)); };
    else if (kind === 'send') api[method] = function(){ sendMsg(method, Array.prototype.slice.call(arguments)); };
    else if (kind === 'event') api[method] = function(cb){ return on(channel, cb); };
  });

  // Packed multi-arg send methods (mirror src/preload/index.ts).
  api.sendSessionInput = function(sessionId, data){ sendMsg('sendSessionInput', [{ sessionId: sessionId, data: data }]); };
  api.resizeSession = function(sessionId, cols, rows){ sendMsg('resizeSession', [{ sessionId: sessionId, cols: cols, rows: rows }]); };

  // Flag so the renderer knows it is a remote (cold-attach) client and should
  // replay server-side scrollback when a terminal mounts. Not set in Electron.
  window.__OMNIDESK_REMOTE__ = true;
  window.electronAPI = api;
  connect();
})();`;
}
