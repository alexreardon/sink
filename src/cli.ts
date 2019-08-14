#!/usr/bin/env node

import { cyan, bold, green } from 'kleur';
import ora from 'ora';
import fs from 'fs-extra';
import { promisify } from 'util';
import commandExists from 'command-exists';
import { spawn, exec } from 'child_process';
import { join } from 'path';
import semver from 'semver';
import { appendFile, readFile, writeFile, parseAsJson } from './file-manager';

type PackageJson = {
  types?: string;
  module?: string;
  main?: string;
  'atlaskit:src'?: string;
};

const getExec = promisify(exec);

const EOL = '\r\n';
const args: string[] = process.argv.slice(2);

const path: string = (() => {
  if (args.length !== 1) {
    throw new Error('Unable to find expected [path] option');
  }
  return args[0].trim();
})();

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

add({
  title: 'Checking path',
  run: () =>
    new Promise((resolve, reject) => {
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
  title: `Generating ${code('tsconfig')} and converting files (with ${code('flowtees')})`,
  run: (): Promise<void> =>
    new Promise((resolve, reject) => {
      const child = spawn('flowtees', [path, '--react-namespace', 'false'], {
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
        cwd: path,
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
        cwd: path,
      });
    } catch ({ stdout, stderr }) {
      throw new Error(`Failed add tslib: ${stderr}`);
    }
  },
});

add({
  title: `Adding ${code('index.ts')} to ${code('.npmignore')}`,
  run: async () => {
    const filepath: string = join(path, '.npmignore');
    const contents = await readFile(filepath);

    // Already have a index.ts in npmignore
    if (contents.includes('index.ts')) {
      return;
    }

    return await appendFile(filepath, '\n# Ignoring generated index.ts\nindex.ts');
  },
});

add({
  title: `Telling ${code('flow')} to ignore this component`,
  run: async () => {
    const filepath: string = join(path, '../../../flow-typed/core-components.js');
    const packageJson = await readFile(join(path, 'package.json'));
    const contents = await readFile(filepath);

    const { name: componentName } = await parseAsJson(packageJson);

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

add({
  title: `Telling ${code('TypeScript')} to un-ignore this component`,
  run: async () => {
    const filepath: string = join(path, '../../../typings/atlaskit.d.ts');
    const packageJson = await readFile(join(path, 'package.json'));
    const contents = await readFile(filepath);

    const { name: componentName } = await parseAsJson(packageJson);

    const ignoreStatement = `declare module '${componentName}';`;

    if (!contents.includes(ignoreStatement)) return;

    const newFileContents = contents
      .split('\n')
      .filter(line => line !== ignoreStatement)
      .join('\n');

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

add({
  title: `Adding ${code('types')} entry to ${code('package.json')}`,
  run: async () => {
    const proposedValue: string = 'dist/cjs/index.d.ts';
    const filepath = join(path, 'package.json');
    const contents = await readFile(filepath);
    const json = await parseAsJson<PackageJson>(contents);

    if (json.types) {
      // all good
      if (json.types === proposedValue) {
        return;
      }
      throw new Error(`Unexpected existing types entry in package.json: ${json.types}`);
    }

    const updated: PackageJson = {
      ...json,
      types: proposedValue,
    };

    return await writeFile(filepath, updated);
  },
});

add({
  title: `Adding required entry-points to ${code('package.json')}`,
  run: async () => {
    const filepath: string = join(path, 'package.json');
    const contents = await readFile(filepath);
    const json = await parseAsJson<PackageJson>(contents);

    const updated: PackageJson = {
      ...json,
      module: 'dist/esm/index.js',
      main: 'dist/cjs/index.js',
      'atlaskit:src': 'src/index.ts',
    };

    return await writeFile(filepath, updated);
  },
});

async function start() {
  console.log(`${bold(green('sink ⚓️'))}${EOL}`);

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
