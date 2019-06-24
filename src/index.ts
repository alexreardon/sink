#!/usr/bin/env node

import { cyan, bold } from 'kleur';
import ora from 'ora';
import * as fs from 'fs';
import { promisify } from 'util';
import commandExists from 'command-exists';
import { spawn } from 'child_process';

const getStat = promisify(fs.lstat);

const EOL = '\r\n';
const args: string[] = process.argv.slice(2);

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

  return args[0];
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

      getStat(path)
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
  title: 'Checking prerequisites',
  run: () =>
    commandExists('flowtees').catch(() => {
      throw new Error(
        `Unable to find ${code('flowtees')} on system.${EOL}Run: ${code('pip3 install flowtees')}`,
      );
    }),
});

add({
  title: `Generating tsconfig (with ${code('flowtees')})`,
  run: (): Promise<void> =>
    new Promise((resolve, reject) => {
      const child = spawn('flowtees', [getPath(), '--react-namespace', 'false'], {
        shell: true,
        detached: true,
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
          no();
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
  title: `Doing initial ${code('flow')} => ${code('typescript')} conversion (with ${code(
    '@khell/flow-to-ts',
  )})`,
  run: () =>
    new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve();
      }, 2000);
    }),
});

async function start() {
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
