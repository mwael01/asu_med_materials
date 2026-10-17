import { getAI, getGenerativeModel, GoogleAIBackend, Schema, type GenerativeModel } from 'firebase/ai';
import { getFirebaseApp } from './config';
import { getFirebaseAuth } from './auth';
import type { ModuleInfo } from '../types/materials';
import type { ExtractionResult, LinkMetadata } from '../types/ai';
import { buildExtractionPrompt, parseAIResponseJson, fallbackParseDumpText, VALID_TYPES, VALID_CATEGORIES } from '../utils/aiParser';
import { extractMaterialUrls } from '../utils/materialLinks';
let modelInstance: GenerativeModel | null = null;
let currentModelName: string | null = null;

export function getGeminiModel(modelName: 'gemini-2.5-flash' | 'gemini-1.5-flash' = 'gemini-2.5-flash'): GenerativeModel | null {
  if (modelInstance && currentModelName === modelName) return modelInstance;
  const app = getFirebaseApp(); if (!app) return null;
  const text = () => Schema.string();
  const schema = Schema.object({properties:{materials:Schema.array({items:Schema.object({
    properties:{title:text(), titleEn:text(), description:text(), descriptionEn:text(), url:text(), type:Schema.enumString({enum:VALID_TYPES}), category:Schema.enumString({enum:VALID_CATEGORIES}), year:Schema.integer(), moduleId:text(), subject:text(),
      author:Schema.array({items:text()}), tags:Schema.array({items:text()}),
      issues:Schema.array({items:Schema.object({properties:{field:text(), message:text()}})}),
      videos:Schema.array({items:Schema.object({properties:{title:text(), youtubeId:text(), url:text(), duration:text()}, optionalProperties:['youtubeId','url','duration']})}),
    }, optionalProperties:['description','descriptionEn','category','year','moduleId','subject','author','videos','issues'],
  })})}});
  currentModelName = modelName;
  modelInstance = getGenerativeModel(getAI(app, {backend:new GoogleAIBackend()}), {
    model:modelName, generationConfig:{responseMimeType:'application/json', responseSchema:schema, temperature:0.2},
  });
  return modelInstance;
}
async function enrichLinks(urls: string[], signal?: AbortSignal): Promise<LinkMetadata[]> {
  const token = await getFirebaseAuth()?.currentUser?.getIdToken();
  if (!token) return urls.map(url => ({url, status:'unavailable'}));
  const metadata: LinkMetadata[] = [];
  for (let index = 0; index < urls.length; index += 20) {
    if (signal?.aborted) throw new DOMException('Cancelled','AbortError');
    const batch = urls.slice(index, index + 20);
    try {
      const response = await fetch('/api/material-metadata', {
        method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`}, body:JSON.stringify({urls:batch}),
        signal:signal ? AbortSignal.any([signal, AbortSignal.timeout(55000)]) : AbortSignal.timeout(55000),
      });
      if (!response.ok) throw new Error('Preview unavailable');
      const result = await response.json() as {metadata:LinkMetadata[]}; metadata.push(...result.metadata);
    } catch {
      if (signal?.aborted) throw new DOMException('Cancelled','AbortError');
      metadata.push(...batch.map(url => ({url, status:'unavailable' as const})));
    }
  }
  return metadata;
}
export async function parseMaterialMessageWithAI(rawMessage: string, modules: ModuleInfo[], signal?: AbortSignal): Promise<ExtractionResult> {
  const message = rawMessage.trim(); const urls = extractMaterialUrls(message);
  if (!urls.length) return {items:[], status:'partial', message:'لا توجد روابط؛ أضف رابط المادة أولاً / No links found; add a resource URL'};
  if (message.length > 80000 || urls.length > 100) throw new Error('قسّم الرسالة إلى أجزاء أصغر (100 رابط كحد أقصى) / Split into smaller messages (maximum 100 links)');
  let metadata: LinkMetadata[] = [];
  try {
    metadata = await enrichLinks(urls, signal);
    let model = getGeminiModel('gemini-2.5-flash');
    if (!model) throw new Error('AI unavailable');
    let response;
    try {
      response = await model.generateContent(buildExtractionPrompt(message, modules, metadata), {signal, timeout:90000});
    } catch (primaryErr) {
      if (signal?.aborted) throw primaryErr;
      console.warn('[AI] gemini-2.5-flash failed, trying gemini-1.5-flash fallback:', primaryErr);
      const fallbackModel = getGeminiModel('gemini-1.5-flash');
      if (!fallbackModel) throw primaryErr;
      response = await fallbackModel.generateContent(buildExtractionPrompt(message, modules, metadata), {signal, timeout:90000});
    }
    const items = parseAIResponseJson(response.response.text(), message, modules);
    for (const item of items) {
      if (metadata.find(m => m.url === item.url)?.status !== 'ok') item.issues?.push({field:'url', message:'تعذر جلب معاينة الرابط؛ راجع السياق / Link preview unavailable; review context'});
    }
    return {items, status:items.some(i => i.issues?.length) ? 'partial' : 'ai'};
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Cancelled','AbortError');
    console.warn('[AI] Extraction unavailable:', error instanceof Error ? error.message : 'Unknown error');
    return {items:fallbackParseDumpText(message, modules), status:'fallback', message:'تعذر الذكاء الاصطناعي؛ تم تجهيز الروابط فقط، أكمل البيانات / AI unavailable; links prepared for manual completion'};
  }
}
