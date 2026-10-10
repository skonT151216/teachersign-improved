import { readFile,writeFile,mkdir,readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { zipSync,strToU8 } from 'fflate';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),docs=new URL('docs/',root);
const md=await readFile(new URL('교사용매뉴얼.md',docs),'utf8');
const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function inline(s){
 const saved=[]; const token=html=>`@@INLINE${saved.push(html)-1}@@`;
 s=s.replace(/`([^`]+)`/g,(_,v)=>token(`<code>${escape(v)}</code>`));
 s=s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,(_,alt,src)=>token(`<figure><img src="${escape(src)}" alt="${escape(alt)}"><figcaption>${escape(alt)}</figcaption></figure>`));
 s=s.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,title,url)=>token(`<a href="${escape(url)}">${escape(title)}</a>`));
 s=escape(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
 return s.replace(/@@INLINE(\d+)@@/g,(_,i)=>saved[Number(i)]);
}
// A deliberately small renderer for this manual's headings, tables, lists,
// paragraphs, fenced examples and images; no external scripts or dependencies.
const lines=md.split('\n'),sections=[];let out='',paragraph=[],list=null;
const flush=()=>{if(paragraph.length){out+=`<p>${inline(paragraph.join(' '))}</p>\n`;paragraph=[];}if(list){out+=`</${list}>\n`;list=null;}};
for(let i=0;i<lines.length;i++){
 const line=lines[i];
 if(!line.trim()){flush();continue;}
 if(line.startsWith('```')){flush();const code=[];while(++i<lines.length&&!lines[i].startsWith('```'))code.push(lines[i]);out+=`<pre><code>${escape(code.join('\n'))}</code></pre>`;continue;}
 if(line.startsWith('# ')){flush();out+=`<h1>${inline(line.slice(2))}</h1>`;continue;}
 if(line.startsWith('## ')){flush();if(out)sections.push(out);out=`<h2>${inline(line.slice(3))}</h2>`;continue;}
 if(line.startsWith('|')){flush();const table=[];while(i<lines.length&&lines[i].startsWith('|'))table.push(lines[i++]);i--;const row=v=>v.split('|').slice(1,-1).map(x=>x.trim());out+='<table><thead><tr>'+row(table[0]).map(v=>`<th>${inline(v)}</th>`).join('')+'</tr></thead><tbody>'+table.slice(2).map(v=>'<tr>'+row(v).map(x=>`<td>${inline(x)}</td>`).join('')+'</tr>').join('')+'</tbody></table>';continue;}
 const item=/^(\d+\. |\- )(.*)$/.exec(line);
 if(item){if(paragraph.length){out+=`<p>${inline(paragraph.join(' '))}</p>`;paragraph=[];}const type=item[1]==='- '?'ul':'ol';if(list!==type){if(list)out+=`</${list}>`;out+=type==='ol'?`<ol start="${Number(item[1].split('.')[0])}">`:'<ul>';list=type;}out+=`<li>${inline(item[2])}</li>`;continue;}
 if(line.startsWith('![')){flush();out+=inline(line);continue;}
 paragraph.push(line);
}
flush();sections.push(out);
const titles=[...md.matchAll(/^## (.+)$/gm)].map(m=>m[1]);
const css=`*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#edf2f7;color:#182536;font-family:"Apple SD Gothic Neo","Noto Sans CJK KR","Malgun Gothic",sans-serif;font-size:15px;line-height:1.72}header{padding:18px 24px;background:#143a58;color:white}header a{color:white}nav{max-width:900px;margin:20px auto;padding:16px 28px;background:#fff;border-radius:14px}nav ol{columns:2;padding-left:24px}main{max-width:900px;margin:auto}.page{background:white;margin:22px auto;padding:35px 42px;border-radius:15px;box-shadow:0 3px 16px #17334f0c}h1{font-size:34px;line-height:1.35;margin:15px 0 28px}h2{font-size:25px;line-height:1.4;color:#143a58;margin:0 0 22px;border-bottom:3px solid #55a894;padding-bottom:14px}p{margin:13px 0}strong{color:#113a54}li{padding-left:3px;margin:9px 0}a{color:#116198;text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:13px;line-height:1.55;margin:20px 0}th,td{padding:11px 12px;border:1px solid #d4dfe7;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#e9f2f4}code{font-family:ui-monospace,monospace;font-size:.9em;overflow-wrap:anywhere}pre{background:#eff4f7;border-left:4px solid #4a9d8e;border-radius:4px;padding:14px;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55}figure{margin:18px auto;text-align:center;break-inside:avoid}img{max-width:100%;max-height:360px;object-fit:contain;border:1px solid #e1e8ee;border-radius:7px}figcaption{font-size:12px;color:#536576;margin-top:7px}figure:has(img[src*="participant-"]){display:inline-block;width:48%;vertical-align:top}figure:has(img[src*="participant-"]) img{max-height:330px}figure:has(img[src*="deploy-menu"]) img,figure:has(img[src*="deploy-type"]) img{max-height:150px}figure:has(img[src*="deploy-access"]) img,figure:has(img[src*="editor-run"]) img{max-height:90px}figure:has(img[src*="deploy-version"]) img{max-height:210px}.page:has(img[src*="deploy-menu"]) figure{display:inline-block;width:31%;vertical-align:top}figure:has(img[src*="account-setup"]) img{max-height:540px}button{padding:10px 18px;border:0;border-radius:6px;background:#218370;color:white;cursor:pointer;font:inherit}@media(max-width:650px){body{font-size:15px}.page{padding:24px 18px;margin:12px 8px}nav{margin:12px 8px;padding:14px}nav ol{columns:1}h1{font-size:27px}h2{font-size:22px}table{font-size:12px}th,td{padding:8px}figure:has(img[src*="participant-"]){width:100%}header{padding:16px}.page:has(img[src*="deploy-menu"]) figure{width:100%;margin:10px auto}}@media print{@page{size:A4;margin:14mm 14mm 16mm}body{background:white;font-size:11.4px;line-height:1.65}header,nav{display:none}main{max-width:none}.page{margin:0;padding:0;border-radius:0;box-shadow:none;break-before:page;min-height:0}.page:first-child{break-before:auto}h1{font-size:30px;margin-top:40px}h2{font-size:21px;margin:0 0 14px;padding-bottom:9px}p{margin:9px 0}li{margin:6px 0}table{font-size:10px;line-height:1.48;margin:14px 0}th,td{padding:7px 8px}pre{font-size:9.5px;padding:10px}figure{margin:12px auto}figcaption{font-size:9px}img{max-height:300px}figure:has(img[src*="account-setup"]) img{max-height:350px}figure:has(img[src*="account-login"]) img{max-height:180px}figure:has(img[src*="training-share"]) img{max-height:210px}figure:has(img[src*="admin-dashboard"]) img{max-height:250px}figure:has(img[src*="participant-"]) img{max-height:285px}a{color:#125578}h2,table thead{break-after:avoid}p,li{orphans:3;widows:3}}`;
const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="교직원 연수 등록부 v5.2.1 교사용 화면 매뉴얼: 새 설치, v4 자료 이전, v5 업데이트, QR 서명"><title>교직원 연수 등록부 · 교사용 매뉴얼 v5.2.1</title><style>${css}</style></head><body><header><strong style="color:white">교직원 연수 등록부 · 교사용 매뉴얼</strong></header><nav aria-label="목차"><p><strong>내 상황에 해당하는 목차를 선택하세요.</strong></p><ol>${titles.map((t,i)=>`<li><a href="#step-${i+1}">${escape(t.replace(/^\d+\. /,""))}</a></li>`).join('')}</ol></nav><main>${sections.map((s,i)=>`<section class="page" id="${i?'step-'+i:'cover'}">${s}</section>`).join('\n')}</main></body></html>`;
await writeFile(new URL('교사용매뉴얼.html',docs),html);
await mkdir(new URL('artifacts/releases/',root),{recursive:true});
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:794,height:1123}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(new URL('교사용매뉴얼.html',docs).href);
await page.evaluate(()=>document.fonts.ready);
await page.emulateMedia({media:'print'});
await page.setViewportSize({width:688,height:1009});
const validation=await page.evaluate(()=>({images:[...document.images].map(i=>({src:i.getAttribute('src'),ok:i.complete&&i.naturalWidth>0})),sections:[...document.querySelectorAll('.page')].map(e=>({id:e.id,height:Math.round(e.getBoundingClientRect().height)})),links:[...document.querySelectorAll('a[href^="#"]')].map(a=>({href:a.getAttribute('href'),ok:!!document.querySelector(a.getAttribute('href'))}))}));
assert.ok(validation.images.every(i=>i.ok)); assert.ok(validation.links.every(l=>l.ok)); assert.equal(errors.length,0);
await page.pdf({path:fileURLToPath(new URL('artifacts/releases/TeacherSign-Manual.pdf',root)),format:'A4',printBackground:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font-size:9px;width:100%;text-align:center;color:#687586">TeacherSign v5.2.1 · 2026-10-10 · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',preferCSSPageSize:true});
await page.emulateMedia({media:'screen'});
await page.setViewportSize({width:1000,height:1123});
await page.screenshot({path:fileURLToPath(new URL('artifacts/manual/desktop.png',root))});
await page.setViewportSize({width:390,height:844}); await page.screenshot({path:fileURLToPath(new URL('artifacts/manual/mobile.png',root))});
// The beginner migration sheet shares the manual's exact six-step content.
const quickHtml = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>v4 자료 이전 · 핵심 여섯 단계</title><style>${css}@media print{body{font-size:12px}h2{font-size:22px}}</style></head><body><main><section class="page">${sections[8].replace('8. v4 자료 이전: 이 순서대로만 따라 하세요', 'v4 자료 이전 · 핵심 여섯 단계')}<p><a href="https://github.com/skonT151216/teachersign-improved/blob/main/docs/교사용매뉴얼.md">전체 사진 매뉴얼 보기 — 배포 사진은 9번</a></p></section></main></body></html>`;
assert.ok(quickHtml.includes('previewTeacherSignMigration') && quickHtml.includes('migrateTeacherSignLegacyData'));
await writeFile(new URL('자료이전_핵심안내.html',docs),quickHtml);
await page.goto(new URL('자료이전_핵심안내.html',docs).href);
await page.emulateMedia({media:'print'});
await page.setViewportSize({width:688,height:1009});
assert.ok(await page.evaluate(()=>[...document.images].every(i=>i.complete && i.naturalWidth>0)));
await page.pdf({path:fileURLToPath(new URL('artifacts/releases/TeacherSign-Migration-Quick.pdf',root)),format:'A4',printBackground:true,preferCSSPageSize:true});
await page.screenshot({path:fileURLToPath(new URL('artifacts/manual/migration-quick.png',root)),fullPage:true});
await browser.close();
const files={'교사용매뉴얼.html':strToU8(html),'교사용매뉴얼.md':strToU8(md),'TeacherSign-Manual.pdf':new Uint8Array(await readFile(new URL('artifacts/releases/TeacherSign-Manual.pdf',root))),'먼저읽기.txt':strToU8('압축을 푼 뒤 교사용매뉴얼.html을 열면 사진 포함 안내를 인터넷 없이 볼 수 있습니다. 기존 v4 자료 이전은 자료이전_핵심안내.html 또는 한 장짜리 TeacherSign-Migration-Quick.pdf의 여섯 단계를 따라 하세요. 인쇄·공유용 전체 안내는 TeacherSign-Manual.pdf입니다. images 폴더를 함께 보관하세요. v5.2.1 기준, 2026-10-10 확인.\n')};
files['자료이전_핵심안내.html'] = strToU8(quickHtml);
files['TeacherSign-Migration-Quick.pdf'] = new Uint8Array(await readFile(new URL('artifacts/releases/TeacherSign-Migration-Quick.pdf',root)));
for(const name of await readdir(new URL('images/',docs)))if(name.endsWith('.png'))files[`images/${name}`]=new Uint8Array(await readFile(new URL(`images/${name}`,docs)));
await writeFile(new URL('artifacts/releases/TeacherSign-Manual.zip',root),zipSync(files,{level:9,mtime:new Date('2026-10-10T00:00:00Z')}));
await writeFile(new URL('artifacts/manual/validation.json',root),JSON.stringify({version:'5.2.1',...validation,errors},null,2));
console.log({manual:'HTML + PDF + ZIP',uniqueImages:validation.images.length,sections:validation.sections,errors});
