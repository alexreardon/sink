import fs from 'fs-extra';

// Keep the nice line breaks
function stringify(object: Object) {
  // hard coding 2 spaces as that is what is used in Atlaskit
  return JSON.stringify(object, null, '  ');
}

export async function readFile(filePath: string) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (e) {
    throw new Error(`Unable to read ${filePath}`);
  }
}

export async function writeFile(filePath: string, updated: Record<string, any>) {
  try {
    return await fs.writeFile(filePath, stringify(updated));
  } catch (e) {
    throw new Error(`Unable to write to ${filePath}`);
  }
}

export async function appendFile(filePath: string, content: string) {
  try {
    return await fs.appendFile(filePath, content, {
      encoding: 'utf-8',
    });
  } catch (e) {
    throw new Error(`Unable to append to ${filePath}`);
  }
}

export function parseAsJson<T>(contents: string): T {
  try {
    return JSON.parse(contents);
  } catch (e) {
    throw new Error('Unable to parse as json');
  }
}
