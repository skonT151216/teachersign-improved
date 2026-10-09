import { createServer } from 'node:http';
import { createGasHarness, createFakeDrive } from './gas-harness.mjs';

export async function createStandaloneFixture({ port = 0 } = {}) {
  let base = '';
  const shared = createFakeDrive();
  const schools = new Map(['A', 'B'].map(id => [id, createGasHarness(`standalone-school-${id}`, shared, { get webAppUrl() { return `${base}/school/${id}/exec`; } })]));
  const setupKey = 'Standalone-Fictional-Setup-Key-2026!000';
  for (const gas of schools.values()) gas.props.set('TEACHERSIGN_ADMIN_KEY', setupKey);
  const calls = [];
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://fixture.invalid');
      const match = /^\/(school|frame|rpc)\/([AB])(?:\/exec)?$/.exec(url.pathname);
      if (!match) { res.writeHead(404); return res.end(); }
      const [, type, id] = match, gas = schools.get(id);
      res.setHeader('Cache-Control', 'no-store');
      if (type === 'rpc' && req.method === 'POST') {
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 2000000) throw Error('Too large'); }
        const request = JSON.parse(body);
        calls.push({ id, request });
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(gas.rpc(request)));
      }
      if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (type === 'school') {
        // Match the HtmlService iframe restrictions and keep its URL distinct
        // from the canonical /exec URL used for sharing and participant query.
        const src = `/frame/${id}${url.search}`.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        return res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><iframe title="학교 GAS" style="border:0;width:100%;height:100vh" sandbox="allow-same-origin allow-forms allow-scripts allow-popups allow-downloads allow-modals allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation" src="${src}"></iframe></body></html>`);
      }
      if (type === 'frame') {
        const bridge = `<script>window.google={script:{run:(function runner(success,failure){return {withSuccessHandler:function(fn){return runner(fn,failure)},withFailureHandler:function(fn){return runner(success,fn)},teacherSignRpc:function(request){fetch('/rpc/${id}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)}).then(function(r){return r.json()}).then(success).catch(failure)}}})()}};</script>`;
        const html = gas.context.doGet({ parameter: Object.fromEntries(url.searchParams) }).getContent();
        return res.end(html.replace('<head>', '<head>' + bridge));
      }
      res.writeHead(404); res.end();
    } catch { res.writeHead(500); res.end('Fixture failed'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  base = `http://localhost:${server.address().port}`;
  return { base, schools, calls, setupKey, stop: () => new Promise(resolve => server.close(resolve)) };
}
