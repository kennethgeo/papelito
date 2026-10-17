import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') {
    return nextResolve(specifier, context);
  }
  if (specifier === 'next/navigation') {
    return nextResolve('next/dist/client/components/navigation.react-server.js', context);
  }
  if (specifier.startsWith('next/') && !specifier.endsWith('.js')) {
    return nextResolve(`${specifier}.js`, context);
  }

  let resolvedPath = null;
  if (specifier.startsWith('@/')) {
    resolvedPath = path.join(rootDir, 'src', specifier.slice(2));
  } else if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    context.parentURL &&
    !context.parentURL.includes('node_modules')
  ) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    resolvedPath = path.resolve(parentDir, specifier);
  }

  if (resolvedPath) {
    const candidates = [
      resolvedPath,
      `${resolvedPath}.ts`,
      `${resolvedPath}.tsx`,
      path.join(resolvedPath, 'index.ts'),
      path.join(resolvedPath, 'index.tsx'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }

  return nextResolve(specifier, context);
}
