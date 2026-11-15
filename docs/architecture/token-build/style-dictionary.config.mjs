import path from 'node:path';
import { fileURLToPath } from 'node:url';
import StyleDictionary from 'style-dictionary';

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, '../../..');
const output = path.join(repositoryRoot, 'docs/architecture/generated');

function toKebab(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replaceAll('_', '-');
}

function flattenToken(pathParts, value, resolve, result = []) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) flattenToken([...pathParts, key], child, resolve, result);
  } else if (Array.isArray(value)) {
    value.forEach((child, index) => flattenToken([...pathParts, String(index + 1)], child, resolve, result));
  } else {
    result.push({ path: pathParts.map(toKebab).join('-'), value: String(resolve(value)) });
  }
  return result;
}

function variableFormat({ dictionary }) {
  const declarations = { dark: [], light: [], shared: [] };
  const lookup = new Map(dictionary.allTokens.map((token) => [token.path.join('.'), token.$value]));
  const resolve = (value) => typeof value === 'string'
    ? value.replace(/^\{([^}]+)\}$/, (_match, key) => String(lookup.get(key) ?? value))
    : value;
  for (const token of dictionary.allTokens) {
    const [themeOrShared, group] = token.path;
    if (themeOrShared === 'dark' || themeOrShared === 'light') {
      if (group !== 'color') continue;
      const logicalName = token.path[2].replace(`-${themeOrShared}`, '');
      declarations[themeOrShared].push(`  --${toKebab(logicalName)}: ${token.$value};`);
    } else if (themeOrShared === 'shared') {
      const flat = flattenToken(token.path.slice(1), token.$value, resolve);
      declarations.shared.push(...flat.map(({ path: namePath, value }) => `  --${namePath}: ${value};`));
    }
  }
  return [
    ':root[data-theme="dark"] {', ...declarations.dark, '}',
    ':root[data-theme="light"] {', ...declarations.light, '}',
    ':root {', ...declarations.shared, '}',
    '',
  ].join('\n');
}

function tailwindFormat({ dictionary }) {
  const lines = ['@theme inline {'];
  const colors = new Set();
  const utilityAliases = {
    'bg-canvas': 'canvas',
    'bg-surface-1': 'surface-1',
    'bg-surface-2': 'surface-2',
    'bg-surface-3': 'surface-3',
  };
  for (const token of dictionary.allTokens) {
    const [themeOrShared, group, name] = token.path;
    if ((themeOrShared === 'dark' || themeOrShared === 'light') && group === 'color') {
      const color = token.path[2].replace(`-${themeOrShared}`, '');
      if (!colors.has(color)) {
        colors.add(color);
        lines.push(`  --color-${utilityAliases[color] ?? color}: var(--${color});`);
      }
    }
    if (themeOrShared === 'shared' && group === 'typography' && name === 'font-family' && token.path[3] === 'display') {
      for (const font of dictionary.allTokens.filter((item) => item.path.slice(0, 3).join('.') === 'shared.typography.font-family')) {
        const fontName = toKebab(font.path[3]);
        lines.push(`  --font-${fontName}: var(--typography-font-family-${fontName});`);
      }
    }
    if (themeOrShared === 'shared' && group === 'radii') {
      lines.push(`  --radius-${toKebab(name)}: var(--radii-${toKebab(name)});`);
    }
  }
  lines.push('}', '');
  return lines.join('\n');
}

StyleDictionary.registerFormat({ name: 'axiom/css-variables', format: variableFormat });
StyleDictionary.registerFormat({ name: 'axiom/tailwind-v4-theme', format: tailwindFormat });

export default {
  source: [path.join(repositoryRoot, 'tokens.json')],
  platforms: {
    css: {
      buildPath: `${output}${path.sep}`,
      files: [
        { destination: 'tokens.css', format: 'axiom/css-variables' },
        { destination: 'tailwind-theme.css', format: 'axiom/tailwind-v4-theme' },
      ],
    },
  },
};
