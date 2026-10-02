import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { buildExtractionPrompt, parseAIResponseJson, fallbackParseDumpText } from '../src/utils/aiParser.ts';
import { createDraft, draftCredit, serializeDraft, validateDraft } from '../src/utils/materialDrafts.ts';
import { extractMaterialUrls, materialUrlKey, detectResourceType } from '../src/utils/materialLinks.ts';
import { createSearchDocument, searchDocuments } from '../src/utils/search.ts';
import { isPublicAddress, validatePreviewUrl, parsePreviewHtml, fetchLinkMetadata, fetchMetadataBatch } from '../src/server/linkMetadata.ts';
import { verifyMetadataAdmin } from '../src/server/adminIdentity.ts';
import { POST } from '../src/pages/api/material-metadata.ts';

// Synthetic fixtures only, never catalogue records or live Firestore writes.
const modules = [{id:'test-blood',code:'BLD',title:'Blood',titleAr:'الدم',year:2,subjects:['Histology']}];
const admin = {uid:'admin-id',displayName:'Admin',username:'admin',role:'admin'};
const url = 'https://drive.google.com/file/d/CaseSensitiveID/view';
const item = {url,title:'تفريغات هستولوجي الدم',titleEn:'Blood Histology Notes',description:'ملاحظات عن الأنسجة',descriptionEn:'Notes about tissue',year:2,moduleId:'test-blood',subject:'Histology',category:'summaries',type:'drive',author:['د. مثال','Dr. Example'],tags:['هستولوجي','histology','أنسجة','tissue']};
const parse = (items, text = url) => parseAIResponseJson(JSON.stringify({materials:items}),text,modules);

test('extract punctuation-wrapped links and preserve case-sensitive identities', () => {
  assert.deepEqual(extractMaterialUrls(`ملف (${url}). قناة t.me/TestCase، مجموعة chat.whatsapp.com/TokenX`), [url,'https://t.me/TestCase','https://chat.whatsapp.com/TokenX']);
  assert.notEqual(materialUrlKey('https://t.me/+AbC'),materialUrlKey('https://t.me/+abc'));
  assert.equal(materialUrlKey(`${url}?usp=sharing`),materialUrlKey(url));
  assert.equal(detectResourceType('https://example.com/?list=123'),'website');
  assert.equal(detectResourceType('https://youtube.com/watch?v=abc&list=PLcase'),'playlist');
});
test('bilingual fields and multiple authors survive parsing, staging and serialization', () => {
  const parsed = parse([item])[0];
  const draft = createDraft(parsed,draftCredit(admin));
  const saved = serializeDraft(draft,modules);
  for (const key of ['title','titleEn','description','descriptionEn','author','tags']) assert.deepEqual(saved[key],item[key]);
  assert.equal(saved.addedBy,'Admin'); assert.equal(saved.contributorUid,'admin-id');
  assert.equal(saved.added_by_username,'admin');
  const stagedSave = serializeDraft({...draft},modules);
  assert.deepEqual({...stagedSave,createdAt:undefined},{...saved,createdAt:undefined});
});
test('student credit is independent of author and later admin/source changes', () => {
  const source = {sourceSubmissionId:'sub-a',contributor:'Student A',contributorUid:'student-a',contributorUsername:'student'};
  const draft = createDraft(parse([item])[0],draftCredit(admin,source)); source.contributor = 'Student B';
  const saved = serializeDraft(draft,modules);
  assert.equal(saved.addedBy,'Student A'); assert.equal(saved.added_by_username,'student'); assert.equal(saved.contributorUid,'student-a');
  assert.deepEqual(saved.author,item.author);
  assert.equal(draftCredit(admin,{sourceSubmissionId:'guest',contributor:'Guest'}).contributorUid,undefined);
});
test('unknown and conflicting curriculum never defaults to the first module', () => {
  const unknown = parse([{url,title:'Notes',year:2.5,moduleId:'invented'}])[0];
  assert.equal(unknown.year,undefined); assert.equal(unknown.moduleId,''); assert.equal(unknown.subject,undefined);
  const conflicting = parse([{...item,year:4}])[0];
  assert.equal(conflicting.moduleId,''); assert.ok(conflicting.issues.some(i => i.field === 'moduleId'));
  assert.equal(parse([{...item,year:undefined}])[0].year,2);
});
test('omitted links remain drafts; invented URLs and malformed fields are rejected', () => {
  const other = 'https://example.com/second';
  const drafts = parse([item,{url:'https://invented.example/'}],`${url}\n${other}\n${url}`);
  assert.equal(drafts.length,2); assert.equal(drafts[1].url,other); assert.ok(drafts[1].issues.length);
  const bad = parse([{url,title:[],titleEn:4,author:{name:'bad'},tags:[{},null,3],description:false}])[0];
  assert.equal(bad.title,''); assert.deepEqual(bad.tags,[]); assert.equal(bad.author,undefined);
  assert.throws(() => parseAIResponseJson('null',url,modules));
  assert.throws(() => parseAIResponseJson('not json',url,modules));
});
test('fallback and messages without links never fabricate metadata', () => {
  assert.deepEqual(fallbackParseDumpText('hello there',modules),[]);
  const fallback = fallbackParseDumpText(`يا شباب ${url}`,modules)[0];
  assert.equal(fallback.title,''); assert.equal(fallback.year,undefined); assert.equal(fallback.author,undefined);
  assert.ok(fallback.issues.length);
});
test('publication requires translations and year, permits general material, validates videos', () => {
  const draft = createDraft(parse([item])[0],draftCredit(admin));
  draft.moduleId = ''; assert.deepEqual(validateDraft(draft,modules),[]);
  draft.titleEn = ''; assert.throws(() => serializeDraft(draft,modules));
  draft.titleEn = item.titleEn; draft.descriptionEn = ''; assert.ok(validateDraft(draft,modules).some(i => i.field === 'description'));
  draft.description = ''; draft.videos = [{id:'x',title:'',url:'javascript:alert(1)'}]; assert.ok(validateDraft(draft,modules).some(i => i.field === 'videos'));
});
test('playlist retains only evidenced videos, with stable grouping', () => {
  const playlist = 'https://www.youtube.com/playlist?list=PLtest';
  const id = 'AbCdEf12345';
  const parsed = parse([{...item,url:playlist,videos:[{title:'Lecture',youtubeId:id},{title:'Invented',youtubeId:'ZyXwVu12345'}]}],`${playlist}\nhttps://youtu.be/${id}`)[0];
  assert.equal(parsed.type,'playlist'); assert.equal(parsed.playlistId,'PLtest'); assert.equal(parsed.videos.length,1);
});
test('search indexes saved Arabic, English, descriptions and tags', () => {
  const saved = serializeDraft(createDraft(parse([item])[0],draftCredit(admin)),modules);
  const doc = createSearchDocument(saved);
  for (const query of ['هستولوجي','Histology','tissue','أنسجة']) assert.equal(searchDocuments([doc],{query}).length,1);
});
test('prompt includes all curriculum and explicit authorship, naming and bilingual rules', () => {
  const many = Array.from({length:40},(_,i) => ({...modules[0],id:`module-${i}`}));
  const prompt = buildExtractionPrompt('يا شباب notes '+url,many);
  assert.ok(prompt.includes('module-39')); assert.ok(prompt.includes('UNTRUSTED DATA')); assert.ok(prompt.includes('titleEn')); assert.ok(prompt.includes('not message senders'));
});
test('preview parser handles entities, attribute order, explicit author and login pages', () => {
  const preview = parsePreviewHtml('<title>Fallback</title><meta content="Blood &amp; Tissue" property="og:title"><meta name="description" content="Lecture notes"><meta name="author" content="Dr. Test">',url);
  assert.equal(preview.title,'Blood & Tissue'); assert.equal(preview.author,'Dr. Test');
  assert.equal(parsePreviewHtml('<title>Sign in - Google Accounts</title>',url).status,'unavailable');
});
test('public address validation blocks private, encoded and reserved destinations', () => {
  for (const ip of ['127.0.0.1','10.0.0.1','100.64.0.2','169.254.169.254','192.168.1.1','192.0.2.1','198.19.0.1','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1','2002:7f00:1::']) assert.equal(isPublicAddress(ip),false,ip);
  for (const ip of ['8.8.8.8','1.1.1.1','2001:4860:4860::8888','2606:4700:4700::1111']) assert.equal(isPublicAddress(ip),true,ip);
  for (const link of ['http://2130706433','http://0x7f000001','http://[::1]','file:///etc/passwd','https://user:pass@example.com','https://example.com:8080']) assert.throws(() => validatePreviewUrl(link),link);
});
function transportFor({html='<title>Public notes</title>', redirect, addresses=[{address:'8.8.8.8',family:4}], stall=false} = {}) {
  const calls = [];
  const request = (url,options,callback) => {
    calls.push(url.href);
    // Verify that the transport pins lookup to the already-checked address.
    options.lookup(url.hostname,{all:false},(error,address) => {assert.equal(error,null);assert.equal(address,'8.8.8.8');});
    const req = new EventEmitter();
    req.end = () => queueMicrotask(() => {
      if (stall) return;
      const response = Readable.from([Buffer.from(html)]); response.statusCode = redirect ? 302 : 200;
      response.headers = redirect ? {location:redirect} : {'content-type':'text/html'}; callback(response);
    });
    options.signal.addEventListener('abort',() => req.emit('error',new Error('timeout')),{once:true});
    return req;
  };
  return {calls,lookup:async () => addresses,httpRequest:request,httpsRequest:request};
}
test('fetcher pins DNS, rejects redirects to private hosts and mixed DNS responses', async () => {
  const transport = transportFor(); assert.equal((await fetchLinkMetadata('https://example.com',transport)).status,'ok');
  const redirect = transportFor({redirect:'http://127.0.0.1/secret'});
  assert.equal((await fetchLinkMetadata('https://example.com',redirect)).status,'blocked'); assert.equal(redirect.calls.length,1);
  const mixed = transportFor({addresses:[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]});
  assert.equal((await fetchLinkMetadata('https://example.com',mixed)).status,'blocked'); assert.equal(mixed.calls.length,0);
});
test('preview size, redirect and time limits degrade to unavailable', async () => {
  assert.equal((await fetchLinkMetadata('https://example.com',transportFor({html:'a'.repeat(1024*1024+1)}))).status,'unavailable');
  const looping = transportFor({redirect:'https://example.com/loop'});
  assert.equal((await fetchLinkMetadata('https://example.com',looping)).status,'unavailable'); assert.equal(looping.calls.length,4);
  assert.equal((await fetchLinkMetadata('https://example.com',transportFor({stall:true}),10)).status,'unavailable');
});
test('batch preview concurrency never exceeds four and preserves input order', async () => {
  let active = 0, peak = 0;
  const urls = Array.from({length:12},(_,i) => `https://example.com/${i}`);
  const result = await fetchMetadataBatch(urls,async url => {active++;peak=Math.max(peak,active);await new Promise(resolve => setTimeout(resolve,2));active--;return {url,status:'ok'};});
  assert.equal(peak,4);assert.deepEqual(result.map(r => r.url),urls);
});
test('metadata endpoint authorizes verified Firebase users against live admin role', async () => {
  const previous = globalThis.fetch;
  process.env.PUBLIC_FIREBASE_API_KEY = 'test-key'; process.env.PUBLIC_FIREBASE_PROJECT_ID = 'test-project';
  let role = 'student'; let calls = 0;
  globalThis.fetch = async url => {calls++;return Response.json(String(url).includes('accounts:lookup') ? {users:[{localId:'test-user'}]} : {fields:{role:{stringValue:role}}});};
  try {
    const req = () => new Request('https://app.example/api/material-metadata',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({urls:['http://127.0.0.1']})});
    assert.equal(await verifyMetadataAdmin(new Request('https://app.example')),false); assert.equal(calls,0);
    assert.equal((await POST({request:req()})).status,403);
    role = 'admin'; const response = await POST({request:req()}); assert.equal(response.status,200); assert.equal((await response.json()).metadata[0].status,'blocked');
    const oversize = new Request('https://app.example',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({urls:Array(21).fill(url)})});
    assert.equal((await POST({request:oversize})).status,400);
  } finally {globalThis.fetch = previous; delete process.env.PUBLIC_FIREBASE_API_KEY;delete process.env.PUBLIC_FIREBASE_PROJECT_ID;}
});

test('partial publishing retains failures and never repeats saved contribution counts', async () => {
  const { publishMaterialDrafts } = await import('../src/utils/publishMaterialDrafts.ts');
  const first = createDraft(parse([item])[0],draftCredit(admin));
  const second = createDraft({...parse([item])[0],url:'https://example.com/two'},draftCredit(admin));
  let calls = 0, credits = 0, audits = 0;
  const services = {save:async material => {calls++;return material.id !== second.materialId;},credit:async () => {credits++;},audit:async () => {audits++;return true;}};
  const result = await publishMaterialDrafts([first,second],modules,services);
  assert.deepEqual(result.saved,[first]);assert.deepEqual(result.failed,[second]);assert.equal(credits,1);
  services.save = async () => {calls++;return true;};
  const retry = await publishMaterialDrafts([first,second],modules,services);
  assert.equal(retry.failed.length,0);assert.equal(calls,3);assert.equal(credits,2);assert.equal(audits,2);
});
test('accounting failures cannot undo successful publication or suppress later saves', async () => {
  const { publishMaterialDrafts } = await import('../src/utils/publishMaterialDrafts.ts');
  const drafts = [createDraft(parse([item])[0],draftCredit(admin)),createDraft(parse([item])[0],draftCredit(admin))];
  const outcome = await publishMaterialDrafts(drafts,modules,{save:async()=>true,credit:async()=>{throw new Error('offline');},audit:async()=>false});
  assert.equal(outcome.saved.length,2);assert.equal(outcome.failed.length,0);assert.equal(outcome.warnings.length,4);
});
