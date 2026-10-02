import { readFile } from 'node:fs/promises';
import ts from 'typescript';
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); }
  catch (error) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return next(`${specifier}.ts`, context);
    throw error;
  }
}
export async function load(url, context, next) {
  if (!url.endsWith('.ts') || url.includes('/node_modules/')) return next(url, context);
  const source = (await readFile(new URL(url), 'utf8')).replaceAll('import.meta.env', 'process.env');
  return {format:'module', shortCircuit:true, source:ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText};
}
