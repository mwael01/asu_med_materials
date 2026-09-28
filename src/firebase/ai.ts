import { getAI, getGenerativeModel, GoogleAIBackend, type GenerativeModel } from 'firebase/ai';
import { getFirebaseApp } from './config';
import type { ModuleInfo } from '../types/materials';
import {
  buildExtractionPrompt,
  parseAIResponseJson,
  fallbackParseDumpText,
  type ParsedAIMaterial
} from '../utils/aiParser';

let modelInstance: GenerativeModel | null = null;

/**
 * Returns the initialized GenerativeModel instance using GoogleAIBackend and gemini-3.8-flash.
 */
export function getGeminiModel(): GenerativeModel | null {
  if (modelInstance) return modelInstance;
  const app = getFirebaseApp();
  if (!app) return null;

  try {
    // Initialize the Gemini Developer API backend service
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    // Create a GenerativeModel instance with gemini-3.8-flash
    modelInstance = getGenerativeModel(ai, { model: 'gemini-3.8-flash' });
    return modelInstance;
  } catch (err: any) {
    console.warn('[Firebase AI] Failed to initialize Gemini model:', err?.message || err);
    return null;
  }
}

/**
 * Parses an abrupt WhatsApp message, study group announcement, or material dump using gemini-3.8-flash.
 * Transparently falls back to local heuristic extraction if offline or if AI quota is exceeded.
 */
export async function parseMaterialMessageWithAI(
  rawMessage: string,
  modules: ModuleInfo[]
): Promise<ParsedAIMaterial> {
  const cleanMessage = rawMessage.trim();
  if (!cleanMessage) {
    return fallbackParseDumpText(cleanMessage, modules);
  }

  const model = getGeminiModel();
  if (!model) {
    return fallbackParseDumpText(cleanMessage, modules);
  }

  try {
    const prompt = buildExtractionPrompt(cleanMessage, modules);
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    return parseAIResponseJson(responseText, cleanMessage, modules);
  } catch (err: any) {
    console.warn('[Firebase AI] AI extraction error, using heuristic fallback:', err?.message || err);
    return fallbackParseDumpText(cleanMessage, modules);
  }
}
