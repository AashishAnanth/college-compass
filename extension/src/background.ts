/* Service worker. Finds a Canvas tab, runs the collector inside it, caches the
 * result. The collector must run in the Canvas page rather than here:
 * same-origin requests carry the session cookie with no token, no prompt and
 * nothing stored.
 */

import type { Dump } from './engine/types';

const CANVAS_MATCH = 'https://*.instructure.com/*';
/** Fallback when no Canvas tab is open. Learned from the last host we saw, so
 *  this is not hard-coded to one school. */
const DEFAULT_HOST = 'https://canvas.instructure.com/';

type CollectMessage = { type: 'collect' } | { type: 'cached' };
type CollectReply =
  | { ok: true; data: Dump | null; at?: number | null }
  | { ok: false; error: string };

chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('app.html');
  const [existing] = await chrome.tabs.query({ url });
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true });
    chrome.tabs.reload(existing.id);
  } else {
    await chrome.tabs.create({ url });
  }
});

async function findCanvasTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ url: CANVAS_MATCH });
  return tabs.find((t) => !t.discarded && t.id !== undefined) ?? null;
}

async function rememberedHost(): Promise<string> {
  const { host } = await chrome.storage.local.get('host');
  return typeof host === 'string' ? host : DEFAULT_HOST;
}

function waitForComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(onUpdate);
      clearTimeout(timer);
      err ? reject(err) : resolve();
    };
    const onUpdate = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') finish();
    };
    const timer = setTimeout(
      () => finish(new Error('Canvas took too long to load')), timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdate);
    chrome.tabs.get(tabId)
      .then((t) => { if (t?.status === 'complete') finish(); })
      .catch(() => { /* tab vanished; the timeout will handle it */ });
  });
}

async function runIn(tabId: number): Promise<Dump> {
  const frames = await chrome.scripting.executeScript({
    target: { tabId }, files: ['collect.js'],
  });
  const hit = frames.find((f) => f?.result);
  if (!hit) throw new Error('Canvas page returned nothing — try reloading it');
  return hit.result as Dump;
}

async function collect(): Promise<Dump> {
  const tab = await findCanvasTab();

  // A tab we did not open: read it, never navigate or close it.
  if (tab?.id !== undefined) {
    const data = await runIn(tab.id);
    if (data?.host) void chrome.storage.local.set({ host: `${data.host}/` });
    return data;
  }

  const borrowed = await chrome.tabs.create({ url: await rememberedHost(), active: false });
  if (borrowed.id === undefined) throw new Error('Could not open a Canvas tab');
  try {
    await waitForComplete(borrowed.id, 20000);
    const data = await runIn(borrowed.id);
    if (data?.host) void chrome.storage.local.set({ host: `${data.host}/` });
    return data;
  } finally {
    chrome.tabs.remove(borrowed.id).catch(() => { /* already gone */ });
  }
}

chrome.runtime.onMessage.addListener(
  (msg: CollectMessage, _sender, sendResponse: (r: CollectReply) => void) => {
    if (msg.type === 'cached') {
      chrome.storage.local.get(['dump', 'dump_at']).then(({ dump, dump_at }) => {
        sendResponse({ ok: true, data: (dump as Dump) ?? null, at: dump_at ?? null });
      });
      return true;
    }
    if (msg.type === 'collect') {
      collect()
        .then((data) => {
          if (data && !data.error) {
            void chrome.storage.local.set({ dump: data, dump_at: Date.now() });
          }
          sendResponse({ ok: true, data });
        })
        .catch((err: unknown) => sendResponse({
          ok: false, error: err instanceof Error ? err.message : String(err),
        }));
      return true;   // keep the channel open for the async reply
    }
    return undefined;
  },
);
