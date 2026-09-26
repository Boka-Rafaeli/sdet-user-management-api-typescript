/** Fail-closed, per-file atomic sanitization of generated NDJSON evidence. */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import type { Dirent, Stats } from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { redact, redactText, verifyRedacted, secretVariants } from './redaction.js';

export class ScrubError extends Error {
  constructor(message: string, secrets: readonly string[] = []) {
    super(redactText(message, secrets));
    this.name = 'ScrubError';
  }
}

export interface ScrubSummary {
  files: number;
  records: number;
}

/** Small injectable boundary for predictable filesystem-failure tests. */
export interface ScrubFileSystem {
  lstat(file: string): Promise<Stats>;
  realpath(file: string): Promise<string>;
  readdir(directory: string): Promise<Dirent[]>;
  readFile(file: string): Promise<Buffer>;
  writeFile(
    file: string,
    text: string,
    options: {
      encoding: 'utf8';
      flag: 'wx';
      mode: number;
    },
  ): Promise<void>;
  chmod(file: string, mode: number): Promise<void>;
  rename(source: string, destination: string): Promise<void>;
  unlink(file: string): Promise<void>;
}

const defaultFileSystem: ScrubFileSystem = {
  lstat: (file) => fs.lstat(file),
  realpath: (file) => fs.realpath(file),
  readdir: (directory) => fs.readdir(directory, { withFileTypes: true }),
  readFile: (file) => fs.readFile(file),
  writeFile: (file, text, options) => fs.writeFile(file, text, options),
  chmod: (file, mode) => fs.chmod(file, mode),
  rename: (source, destination) => fs.rename(source, destination),
  unlink: (file) => fs.unlink(file),
};

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
  );
}

export async function scrubTree(
  root: string,
  secrets: readonly string[],
  options: { fs?: Partial<ScrubFileSystem> } = {},
): Promise<ScrubSummary> {
  const disk = { ...defaultFileSystem, ...options.fs };
  const reject = (message: string): never => {
    throw new ScrubError(message, secrets);
  };
  try {
    const rootStat = await disk.lstat(root);
    if (rootStat.isSymbolicLink()) reject(`Evidence root must not be a symbolic link: ${root}`);
    if (!rootStat.isDirectory()) reject(`Evidence root is not a directory: ${root}`);
    const resolvedRoot = await disk.realpath(root);
    const files: string[] = [];

    async function discover(directory: string): Promise<void> {
      const entries = await disk.readdir(directory);
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const candidate = path.join(directory, entry.name);
        const stat = await disk.lstat(candidate);
        // Do not let upload follow a directory link to unverified evidence either.
        if (stat.isSymbolicLink()) reject(`Evidence must not contain symbolic links: ${candidate}`);
        const resolved = await disk.realpath(candidate);
        if (!isWithin(resolvedRoot, resolved)) reject(`Evidence escapes its root: ${candidate}`);
        if (entry.name.endsWith('.ndjson')) {
          if (!stat.isFile()) reject(`NDJSON evidence must be a regular file: ${candidate}`);
          files.push(resolved);
        } else if (stat.isDirectory()) await discover(resolved);
      }
    }

    await discover(resolvedRoot);
    let records = 0;
    for (const file of files.sort()) {
      const fileStat = await disk.lstat(file);
      if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
        reject(`NDJSON evidence must be a regular file: ${file}`);
      }
      const bytes = await disk.readFile(file);
      let source: string;
      try {
        // Keep BOM visible: JSON.parse must reject it, as Python json.loads does.
        source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      } catch {
        reject(`NDJSON evidence is not valid UTF-8: ${file}`);
      }
      const lines = source!.split(/\r\n|\n|\r/);
      // A trailing newline terminates the preceding record; it is not a blank record.
      if (lines[lines.length - 1] === '') lines.pop();
      const output: string[] = [];
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]!;
        if (line.trim().length === 0) reject(`Blank NDJSON record at ${file}:${index + 1}`);
        let record: unknown;
        try {
          record = JSON.parse(line) as unknown;
        } catch {
          reject(`Invalid NDJSON record at ${file}:${index + 1}`);
        }
        const sanitized = redact(record, secrets);
        if (!verifyRedacted(sanitized, secrets)) {
          reject(`Sensitive data survived sanitization at ${file}:${index + 1}`);
        }
        output.push(JSON.stringify(sanitized));
      }

      const temporary = path.join(
        path.dirname(file),
        `.${path.basename(file)}.${randomUUID()}.scrubbed`,
      );
      let temporaryMayExist = false;
      try {
        temporaryMayExist = true;
        try {
          await disk.writeFile(temporary, output.length === 0 ? '' : `${output.join('\n')}\n`, {
            encoding: 'utf8',
            flag: 'wx',
            mode: 0o600,
          });
        } catch (error) {
          // Exclusive creation did not acquire this path: it belongs to somebody else.
          if (
            error !== null &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'EEXIST'
          ) {
            temporaryMayExist = false;
          }
          throw error;
        }
        await disk.chmod(temporary, fileStat.mode & 0o7777);
        await disk.rename(temporary, file);
        temporaryMayExist = false;
      } finally {
        if (temporaryMayExist) {
          try {
            await disk.unlink(temporary);
          } catch (error) {
            if (!(
              error !== null &&
              typeof error === 'object' &&
              'code' in error &&
              error.code === 'ENOENT'
            )) {
              reject(`Could not remove temporary evidence file: ${temporary}`);
            }
          }
        }
      }
      records += output.length;
    }
    return { files: files.length, records };
  } catch (error) {
    if (error instanceof ScrubError) throw error;
    // Filesystem errors may contain unsafe filenames or other diagnostic data.
    // Do not echo third-party error messages or source record contents.
    throw new ScrubError(`Could not scrub NDJSON evidence under: ${root}`, secrets);
  }
}

/** Final upload boundary: every retained file must be text and contain no configured secret. */
export async function verifyEvidenceTree(
  root: string,
  secrets: readonly string[],
): Promise<number> {
  const variants = secretVariants(secrets);
  let count = 0;
  async function walk(directory: string): Promise<void> {
    for (const name of await fs.readdir(directory)) {
      const file = path.join(directory, name);
      const stat = await fs.lstat(file);
      if (stat.isSymbolicLink()) throw new ScrubError('Evidence contains a symbolic link', secrets);
      if (stat.isDirectory()) {
        await walk(file);
        continue;
      }
      if (!stat.isFile()) throw new ScrubError('Evidence contains a non-regular file', secrets);
      if (!/\.(?:html|xml|json|ndjson|log|txt)$/.test(name))
        throw new ScrubError('Unsupported evidence format', secrets);
      let content: string;
      try {
        content = new TextDecoder('utf-8', { fatal: true }).decode(await fs.readFile(file));
      } catch {
        throw new ScrubError('Evidence is unreadable or not UTF-8', secrets);
      }
      if (variants.some((secret) => content.includes(secret)))
        throw new ScrubError('Configured secret survived in retained evidence', secrets);
      if (name.endsWith('.json')) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(content);
        } catch {
          throw new ScrubError('Malformed JSON evidence', secrets);
        }
        if (!verifyRedacted(parsed, secrets))
          throw new ScrubError('Sensitive field survived in JSON evidence', secrets);
      }
      count += 1;
    }
  }
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new ScrubError('Invalid evidence directory', secrets);
  await walk(root);
  return count;
}

export async function scrubCli(args: readonly string[] = process.argv.slice(2)): Promise<number> {
  const usage = 'Usage: scrub <evidence-directory> --secret-env NAME [--secret-env NAME ...]';
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    process.stdout.write(`${usage}\n`);
    return 0;
  }
  const root = args[0];
  const names: string[] = [];
  if (!root || root.startsWith('-')) {
    process.stderr.write(`${usage}\n`);
    return 2;
  }
  for (let index = 1; index < args.length; index += 2) {
    const name = args[index + 1];
    if (args[index] !== '--secret-env' || !name || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      process.stderr.write(`${usage}\n`);
      return 2;
    }
    names.push(name);
  }
  if (names.length === 0) {
    process.stderr.write(`${usage}\n`);
    return 2;
  }
  const secrets = names
    .map((name) => process.env[name])
    .filter((value): value is string => Boolean(value));
  try {
    for (const name of names) {
      if (!process.env[name])
        throw new ScrubError(`Required secret environment variable is empty: ${name}`, secrets);
    }
    const summary = await scrubTree(root, secrets);
    const verifiedFiles = await verifyEvidenceTree(root, secrets);
    process.stdout.write(
      `NDJSON evidence scrubbed and verified: files=${summary.files} records=${summary.records} retainedFiles=${verifiedFiles}\n`,
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown scrubber failure';
    process.stderr.write(`NDJSON evidence rejected: ${redactText(message, secrets)}\n`);
    return 1;
  }
}
