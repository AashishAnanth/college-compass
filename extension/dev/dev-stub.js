/* Development only: stands in for the extension APIs so the app can run in a
 * plain browser against a saved Canvas dump. Never included in a production build. */
globalThis.chrome = globalThis.chrome || {
  runtime: {
    getURL: (p) => p,
    sendMessage: async (msg) => {
      if (msg && msg.type === 'cached') return { ok: true, data: null, at: null };
      const data = await (await fetch('dev-data.json')).json();
      return { ok: true, data };
    },
  },
};
