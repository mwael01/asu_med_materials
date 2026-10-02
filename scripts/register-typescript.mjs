// Test-only loader: compile TypeScript in memory using the existing compiler.
import { register } from 'node:module';
register('../tests/typescript-loader.mjs', import.meta.url);
