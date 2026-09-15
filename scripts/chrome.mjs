// Headful Chrome on a throwaway profile, as a CDP session.
//
//   const { send, close, version } = await launchHeadful();
//
// The flags are the whole point of this file, and there are two groups:
//
// `--user-data-dir` on a fresh temp path gives a cold profile — no shader cache,
// no service worker, no HTTP cache — which is the only way a measurement of
// first paint means anything. A warm profile will happily hand back a compiled
// program and a cached chunk and make a three-second stall disappear.
//
// The occlusion group disables Chrome's native-Windows behaviour of *stopping
// compositing* a window that another window covers. An earlier run of the
// handoff harness lost 1.8 seconds of fluid draws to it and saw four shader
// links arrive in one burst when the window came back — the page had been
// frozen, and the numbers were measurements of a suspended tab rather than of
// the site. Every harness here opens a window, and on a machine with any other
// window open that window will be behind something.
//
// `setDeviceMetricsOverride` is applied by callers rather than here, because a
// headful window at --window-size=1440,900 has ~200px of browser chrome in it
// and therefore resolves svh against ~700 — every viewport-derived boundary in
// the page lands 22% short of where the headless probe says it is.

import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const CHROME = 'C:\\Users\\Atta\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launchHeadful({ port = 9333 } = {}) {
  const profile = (process.env.TEMP || '/tmp') + '\\chrome-' + port + '-' + Date.now();

  const child = spawn(CHROME, [
    `--remote-debugging-port=${port}`, '--remote-allow-origins=*',
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    '--window-size=1440,900', '--window-position=0,0',
    '--disable-features=CalculateNativeWinOcclusion',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    'about:blank',
  ], { detached: true, stdio: 'ignore' });
  child.unref();

  const ready = async () => {
    try { return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { return false; }
  };
  for (let i = 0; i < 80 && !(await ready()); i++) await sleep(250);

  const version = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).Browser;

  const target = await (
    await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
  ).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res) => ws.addEventListener('open', res, { once: true }));

  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });

  const send = (method, params = {}) =>
    new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  await send('Emulation.setScrollbarsHidden', { hidden: true });

  /** Evaluates an expression in the page and returns its value, awaiting it if
   *  it is a thenable. Every harness here is a sequence of these. */
  const evaluate = async (expression, { awaitPromise = false } = {}) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (r.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.exception?.description || 'evaluate threw');
    }
    return r.result?.result?.value;
  };

  const install = (source) => send('Page.addScriptToEvaluateOnNewDocument', { source });
  const navigate = (url) => send('Page.navigate', { url });

  const close = async () => {
    ws.close();
    try { child.kill(); } catch {}
    await sleep(1500);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  };

  return { send, evaluate, install, navigate, close, version };
}
