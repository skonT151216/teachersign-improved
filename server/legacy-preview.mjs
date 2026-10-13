import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createLegacyGasHarness } from '../tests/legacy-gas-harness.mjs';
import { createGasHarness, createFakeDrive } from '../tests/gas-harness.mjs';
import { hashPassword } from './auth.mjs';

const endpoint = 'https://script.google.com/macros/s/FixtureSchoolEndpointA/exec';
const username = 'fictional-v5-admin';
const password = 'Fictional-V5-Preview-2026!';
const setupKey = 'Fictional-Preview-Setup-Key-2026!000';
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const mime = path => path.endsWith('.js') ? 'text/javascript; charset=utf-8' : path.endsWith('.css') ? 'text/css; charset=utf-8' : path.endsWith('.json') ? 'application/json; charset=utf-8' : path.endsWith('.txt') ? 'text/plain; charset=utf-8' : 'application/octet-stream';

/** A localhost-only school playground. All Drive, Sheets and auth live in memory. */
export async function createLegacyPreview({ port = 5184 } = {}) {
  let mode, legacy, upgraded, runId;
  const reset = async () => {
    runId = randomUUID();
    legacy = createLegacyGasHarness('A');
    upgraded = createGasHarness('fictional-preview-school-A', createFakeDrive(), { webAppUrl: endpoint });
    upgraded.props.set('TEACHERSIGN_ADMIN_KEY', setupKey);
    const created = upgraded.rpc({ operation: 'bootstrap', setupKey, username, label: '가상 업데이트 학교 A', passwordHash: await hashPassword(password) });
    if (created.status !== 'success') throw Error('Could not initialize fictional v5 school');
    mode = 'v4';
  };
  await reset();
  const update = () => {
    if (mode === 'v5') return;
    // This is explicit fixture preparation, not a production migration path.
    // Copy the current fictional DB and signature rows before changing version.
    const db = legacy.files().find(file => file.name === 'TrainingApp_DB.json');
    upgraded.shared.files.get(upgraded.props.get('TEACHERSIGN_DB_FILE_ID')).content = db.content;
    const sheet = upgraded.context.getSignatureSheet_();
    legacy.rows().slice(1).forEach(row => sheet.appendRow(row));
    mode = 'v5';
  };
  const previewHTML = async () => {
    const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
    const info = { endpoint, runId, mode, username, password, key: legacy.key, token: legacy.token };
    const bridge = `<script>(function(){
      var preview=${json(info)};
      if(!['localhost','127.0.0.1'].includes(location.hostname))throw Error('Virtual school preview requires localhost');
      var nativeFetch=window.fetch.bind(window);
      // The production bundle remains unchanged; only this local preview maps
      // its exact fictional GAS URL to an in-memory school API.
      window.fetch=function(input,options){
        var target=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
        if(target.href===preview.endpoint){return nativeFetch('/fixture/api',options);}
        if(target.origin===location.origin)return nativeFetch(input,options);
        if(target.hostname==='raw.githubusercontent.com' && target.pathname==='/skonT151216/teachersign-improved/main/Code.gs')return nativeFetch('/fixture/Code.gs',options);
        if(target.hostname==='raw.githubusercontent.com' && target.pathname==='/skonT151216/teachersign-improved/main/version.json')return nativeFetch('/version.json',options);
        return Promise.reject(Error('가상 학교 체험에서는 실제 학교나 외부 서버에 연결하지 않습니다.'));
      };
      try{
        if(localStorage.getItem('teachersign_virtual_preview_run')!==preview.runId){
          localStorage.removeItem('teachersign_school_url_v5');
          localStorage.setItem('training_app_cloud_config',JSON.stringify({enabled:true,scriptUrl:preview.endpoint,adminKey:preview.key}));
          localStorage.setItem('teachersign_virtual_preview_run',preview.runId);
        }
      }catch(e){}
      // Explicit participant links keep their session and token. Normal entry
      // always selects this fictional school, even after changing connections.
      var params=new URLSearchParams(location.search);
      params.set('endpoint',preview.endpoint);
      history.replaceState(null,'',location.pathname+'?'+params.toString());
      window.addEventListener('DOMContentLoaded',function(){
        var panel=document.createElement('aside');
        panel.id='teachersign-virtual-school-panel';
        panel.setAttribute('aria-label','가상 학교 체험 안내');
        panel.style.cssText='position:fixed;right:12px;bottom:12px;z-index:10000;max-width:min(360px,calc(100vw - 24px));padding:12px 14px;border:2px solid #3730a3;border-radius:12px;background:#fff;color:#111827;box-shadow:0 4px 20px #0003;font:14px/1.5 system-ui,sans-serif';
        var title=document.createElement('strong');title.textContent='가상 학교 체험 · 실제 학교 자료와 무관';panel.appendChild(title);
        var details=document.createElement('details');details.open=false;
        var summary=document.createElement('summary');summary.textContent='체험 안내와 가상 버전 전환';summary.style.cssText='cursor:pointer;color:#3730a3;margin-top:6px';details.appendChild(summary);
        var notice=document.createElement('p');notice.textContent='연수 2개와 가상 교사 3명이 준비되어 있습니다. 관리자 화면, 서명 저장, 업데이트 안내를 직접 눌러보세요. 서버를 다시 시작하면 체험 자료가 초기화됩니다.';notice.style.margin='8px 0';details.appendChild(notice);
        var status=document.createElement('p');status.setAttribute('role','status');status.textContent='가상 학교 서버: '+preview.mode;details.appendChild(status);
        var links=document.createElement('div');links.style.cssText='display:flex;flex-wrap:wrap;gap:12px;margin:8px 0';
        var home=document.createElement('a');home.href='/v4';home.textContent='가상 학교 첫 화면';home.style.color='#3730a3';links.appendChild(home);
        var signer=document.createElement('a');signer.href='/v4?endpoint='+encodeURIComponent(preview.endpoint)+'&sessionId=legacy-A-1&token='+encodeURIComponent(preview.token);signer.textContent='교직원 서명 체험';signer.style.color='#3730a3';links.appendChild(signer);details.appendChild(links);
        var credentials=document.createElement('p');credentials.style.cssText='font-size:12px;overflow-wrap:anywhere';credentials.textContent='가상 v5 로그인: '+preview.username+' / '+preview.password;details.appendChild(credentials);
        var update=document.createElement('button');update.type='button';update.textContent='가상 학교 v5로 업데이트';update.disabled=preview.mode==='v5';update.style.cssText='display:block;width:100%;padding:8px;border:0;border-radius:6px;color:white;background:#3730a3;font-weight:700;cursor:pointer';
        update.addEventListener('click',async function(){
          update.disabled=true;
          try{var result=await nativeFetch('/fixture/update',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(function(r){if(!r.ok)throw Error('Virtual update failed');return r.json()});status.textContent='가상 서버를 v5로 바꿨습니다. 관리자 화면의 ‘업데이트 완료 확인’을 누르거나 첫 화면을 다시 여세요. 가상 연수와 서명은 유지됩니다.';}
          catch(e){status.textContent='가상 버전 전환에 실패했습니다. 다시 시도하세요.';update.disabled=false;}
        });details.appendChild(update);
        var reset=document.createElement('button');reset.type='button';reset.textContent='가상 체험 자료 초기화';reset.style.cssText='display:block;margin-top:8px;padding:6px 0;border:0;background:none;color:#3730a3;text-decoration:underline;cursor:pointer';
        reset.addEventListener('click',async function(){reset.disabled=true;try{await nativeFetch('/fixture/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(function(r){if(!r.ok)throw Error('Virtual reset failed')});location.assign('/v4');}catch(e){status.textContent='가상 초기화에 실패했습니다.';reset.disabled=false;}});details.appendChild(reset);
        panel.appendChild(details);document.body.appendChild(panel);
      });
    })();</script>`;
    return html.replace('<head>', '<head>' + bridge);
  };
  const server = createServer(async (req, res) => {
    try {
      const host = new URL(`http://${req.headers.host || ''}`);
      if (!['localhost', '127.0.0.1'].includes(host.hostname)) { res.writeHead(403); return res.end('Local preview only'); }
      const url = new URL(req.url, host);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/v4')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(await previewHTML());
      }
      if (req.method === 'GET' && (/^\/assets\/[A-Za-z0-9_.-]+$/.test(url.pathname) || ['/version.json', '/THIRD-PARTY-LICENSES.txt'].includes(url.pathname))) {
        res.setHeader('Content-Type', mime(url.pathname));
        return res.end(await readFile(new URL(`../dist${url.pathname}`, import.meta.url)));
      }
      if (req.method === 'GET' && url.pathname === '/fixture/Code.gs') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.end(await readFile(new URL('../Code.gs', import.meta.url)));
      }
      if (req.method !== 'POST' || !['/fixture/api', '/fixture/update', '/fixture/reset'].includes(url.pathname)) { res.writeHead(404); return res.end('Preview route not found'); }
      const origin = req.headers.origin;
      if (origin && origin !== host.origin) { res.writeHead(403); return res.end('Same-origin preview only'); }
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 2_000_000) { res.writeHead(413); return res.end('Preview request too large'); }
      }
      let input;
      try { input = JSON.parse(body || '{}'); } catch { res.writeHead(400); return res.end('Expected JSON'); }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (url.pathname === '/fixture/reset') { await reset(); return res.end(JSON.stringify({ mode, runId })); }
      if (url.pathname === '/fixture/update') { update(); return res.end(JSON.stringify({ mode })); }
      return res.end(JSON.stringify(mode === 'v4' ? legacy.dispatch(input) : upgraded.dispatch(input)));
    } catch (error) {
      console.error('Fictional school preview error:', error.message);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: '가상 학교 체험 요청을 처리하지 못했습니다.' }));
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const base = `http://localhost:${server.address().port}`;
  return { base, endpoint, username, password, stop: () => new Promise(resolve => server.close(resolve)) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const preview = await createLegacyPreview({ port: Number(process.env.TEACHERSIGN_V4_PREVIEW_PORT || '5184') });
  console.log('가상 학교 체험입니다. 실제 Google·학교 자료에 연결하지 않으며 자료는 메모리에만 보관합니다.');
  console.log(`v4 첫 화면: ${preview.base}/v4`);
  console.log(`가상 v5 관리자: ${preview.username} / ${preview.password}`);
  const stop = async () => { await preview.stop(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
