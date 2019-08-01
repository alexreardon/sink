#!/usr/bin/env node

import { cyan, bold, green } from 'kleur';
import ora from 'ora';
import fs from 'fs-extra';
import { promisify } from 'util';
import commandExists from 'command-exists';
import { spawn, exec } from 'child_process';
import { join } from 'path';
import semver from 'semver';
import pkg from '../package.json';

const getExec = promisify(exec);

const EOL = '\r\n';
const args: string[] = process.argv.slice(2);

type Package = {
  name: string;
  types: string;
};

type Section = {
  title: string;
  run: () => Promise<void | string>;
};

const sections: Section[] = [];

function add(section: Section) {
  sections.push(section);
}

function code(value: string): string {
  return bold(cyan(value));
}

function getPath(): string | null {
  if (args.length !== 1) {
    return null;
  }

  return args[0].trim();
}

async function parsePackageJson(filePath: string): Promise<Package> {
  let contents;

  try {
    contents = await fs.readFile(filePath, 'utf-8');
  } catch (e) {
    throw new Error('Unable to read package.json');
  }

  let json: Package;

  try {
    json = JSON.parse(contents);
  } catch (e) {
    throw new Error('Unable to parse package.json');
  }

  return json;
}

add({
  title: 'Checking path',
  run: () =>
    new Promise((resolve, reject) => {
      const path: string | null = getPath();
      if (!path) {
        reject(new Error('unable to find [path] argument'));
        return;
      }

      fs.lstat(path)
        .catch((e: Error) => {
          if (e.message.includes('ENOENT')) {
            throw new Error(`Could not find anything at path: "${code(path)}"`);
          }
          throw new Error(e.message);
        })
        .then(stat => {
          if (!stat.isDirectory()) {
            throw new Error(`Provided path is not a directory "${code(path)}"`);
          }
        })
        .then(() => resolve())
        .catch((e: Error) => {
          reject(e);
        });
    }),
});

add({
  title: `Checking prerequisite: ${code('bolt')}`,
  run: async () => {
    try {
      await commandExists('bolt');
    } catch {
      throw new Error(`Unable to find ${code('bolt')} on system.`);
    }
  },
});

add({
  title: `Checking prerequisite: ${code('flowtees')}`,
  run: async () => {
    try {
      await commandExists('flowtees');
    } catch {
      throw new Error(`Unable to find ${code('flowtees')} on system.`);
    }

    // Do we satisfy a minimum version number?
    let output: string;
    const command: string = 'flowtees --version';
    const minVersion: string = '^0.1.8';
    const upgradeCommand: string = 'pip3 install flowtees --upgrade';

    try {
      const result = await getExec(command);

      output = result.stdout.trim().toLowerCase();
    } catch {
      throw new Error(`Unable to run command: "${command}"`);
    }

    if (output.includes('error')) {
      throw new Error(`Outdated flowtees. Please run: "${upgradeCommand}"`);
    }

    if (!semver.valid(output)) {
      throw new Error(
        `Incorrectly formatted version received from flowtees. Expected min version: ${minVersion}. Received: ${output}`,
      );
    }

    if (!semver.satisfies(output, minVersion)) {
      throw new Error(
        `
          Minimum compatible version of flowees (${minVersion}) not satisfied. Current: ${output}
          Please run: "${upgradeCommand}"
        `,
      );
    }
  },
});

add({
  title: `Generating tsconfig and converting files (with ${code('flowtees')})`,
  run: (): Promise<void> =>
    new Promise((resolve, reject) => {
      const child = spawn('flowtees', [getPath(), '--react-namespace', 'false'], {
        shell: true,
      });

      function yes() {
        child.stdin.write('y\n');
      }

      function no() {
        child.stdin.write('n\n');
      }

      child.stdout.on('data', data => {
        const output: string = data.toString('utf-8');

        if (output.includes('Do you want to configure build files')) {
          yes();
          return;
        }

        if (output.includes('Do you want to continue')) {
          yes();
          return;
        }

        if (output.includes('Do you want to override this')) {
          no();
          return;
        }
      });
      child.on('error', (e: Error) => {
        reject(e);
      });
      child.on('close', () => {
        resolve();
      });
    }),
});

add({
  title: `Removing ${code('@babel/runtime')} dependency`,
  run: async () => {
    try {
      await getExec('bolt remove @babel/runtime', {
        cwd: getPath(),
      });
    } catch ({ stdout, stderr }) {
      if (stderr.includes('You do not have a dependency named "@babel/runtime" installed')) {
        return;
      }
      throw new Error(`Failed to remove @babel/runtime: ${stderr}`);
    }
  },
});

add({
  title: `Adding ${code('tslib')} dependency`,
  run: async () => {
    try {
      await getExec('bolt add tslib', {
        cwd: getPath(),
      });
    } catch ({ stdout, stderr }) {
      throw new Error(`Failed add tslib: ${stderr}`);
    }
  },
});

add({
  title: `Adding ${code('index.ts')} to ${code('.npmignore')}`,
  run: async () => {
    const filepath: string = join(getPath(), '.npmignore');

    let contents: string;

    try {
      contents = await fs.readFile(filepath, 'utf-8');
    } catch (e) {
      throw new Error('Unable to find .npmignore');
    }

    // Already have a index.ts in npmignore
    if (contents.includes('index.ts')) {
      return;
    }

    try {
      await fs.appendFile(filepath, '\n# Ignoring generated index.ts\nindex.ts', {
        encoding: 'utf-8',
      });
    } catch (e) {
      throw new Error('Unable to add index.ts to .npmignore');
    }
  },
});

add({
  title: `Ignoring component in flow`,
  run: async () => {
    const filepath: string = join(getPath(), '../../../flow-typed/core-components.js');
    const { name: componentName } = await parsePackageJson(join(getPath(), 'package.json'));

    let contents: string;

    try {
      contents = await fs.readFile(filepath, 'utf-8');
    } catch (e) {
      throw new Error(`Unable to find ${filepath}`);
    }

    const ignoreStatement = ` module '${componentName}' {\n  declare module.exports: any;\n}\n`;

    // Already have an ignore statement
    if (contents.includes(ignoreStatement)) {
      return;
    }

    const contentsArr = contents.split('\ndeclare');

    // Comments in the file are the only lines
    // that don't start with 'module'
    const comments = contentsArr.filter(text => !text.startsWith(' module')).join('\n');

    const sortedDeclarations = contentsArr
      .filter(text => text.startsWith(' module'))
      // Add the new ignore statement
      .concat(ignoreStatement)
      .sort()
      .join('\ndeclare');

    // 'declare' in middle of the string template is needed
    // because String.prototype.join does not add the seperator
    // to the first element.
    const newFileContents = `${comments}\ndeclare${sortedDeclarations}`;

    try {
      // Clear old file contents
      await fs.truncate(filepath, 0);

      await fs.appendFile(filepath, newFileContents, {
        encoding: 'utf-8',
      });
    } catch (e) {
      throw new Error(`Unable to ignore ${componentName} in ${filepath}`);
    }
  },
});

// Keep the nice line breaks
function stringify(object: Object) {
  // hard coding 2 spaces as that is what is used in Atlaskit
  return JSON.stringify(object, null, '  ');
}

add({
  title: `Adding ${code('types')} entry to ${code('package.json')}`,
  run: async () => {
    const proposedValue: string = 'dist/cjs/index.d.ts';
    const filepath = join(getPath(), 'package.json');
    const json = await parsePackageJson(filepath);

    if (json.types) {
      // all good
      if (json.types === proposedValue) {
        return;
      }
      throw new Error(`Unexpected existing types entry in package.json: ${json.types}`);
    }

    const updated: Package = {
      ...json,
      types: proposedValue,
    };

    try {
      await fs.writeFile(filepath, stringify(updated));
    } catch (e) {
      throw new Error('Unable to write to package.json');
    }
  },
});

async function start() {
  console.log(`${bold(green('sink ⚓️'))}  (${pkg.version})${EOL}`);

  for (let i = 0; i < sections.length; i++) {
    const section: Section = sections[i];
    const spinner = ora(section.title);
    spinner.start();

    try {
      await section.run();
      spinner.succeed();
    } catch (e) {
      spinner.fail();
      console.log(e.message);
      console.log(EOL);
      process.exit(1);
    }
  }
}

start();
