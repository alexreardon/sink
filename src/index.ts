#!/usr/bin/env node

import { cyan, bold } from 'kleur';
import ora from 'ora';
import * as fs from 'fs';
import { promisify } from 'util';
import commandExists from 'command-exists';

const getStat = promisify(fs.lstat);

const EOL = '\r\n';
const args: string[] = process.argv.slice(2);

type Section = {
  title: string;
  run: () => Promise<void>;
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
      if (args.length !== 1) {
        reject(new Error('path to src folder is required'));
        return;
      }

      const path: string = args[0];

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
    new Promise((resolve, reject) => {
      commandExists('flowtees')
        .then(() => resolve())
        .catch(() =>
          reject(
            new Error(
              `Unable to find ${code('flowtees')} on system.${EOL}Run: ${code(
                'pip3 install flowtees',
              )}`,
            ),
          ),
        );
    }),
});

// run('Generating tsconfig', () => new Promise((resolve, reject) => {}));

async function start() {
  for (let i = 0; i < sections.length; i++) {
    const section: Section = sections[i];
    const spinner = ora(section.title);

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
