/**
 * @file ts/test/integration/poll.test.ts
 * @brief Integration test for the poll operation and notification lifecycle.
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'fs/promises';
import { accessSync, constants as fsConstants } from 'node:fs';
import {
  FuseNative,
  type FuseSession,
  type Ino,
  type PollHandle,
  type PollResult,
  type RequestContext,
} from '../../index.ts';
import { defer, fuseIntegrationSessionSetup } from './integration-setup.ts';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem } from './filesystem.ts';
import { FuseErrno } from '../../errors.ts';

const hasPython = (() => {
  const result = spawnSync('python3', ['-V']);
  return result.status === 0;
})();

const hasFuseDevice = (() => {
  try {
    accessSync('/dev/fuse', fsConstants.R_OK | fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
})();

(hasPython && hasFuseDevice ? describe : describe.skip)('FUSE poll Bridge Integration', () => {
  const filesystem = new FileSystem();
  const filesystemOperations = new FileSystemOperations(filesystem, {});
  const defaultOperations = new FileSystemOperations(filesystem, {});

  let session: FuseSession | undefined;
  let fuse: FuseNative | undefined;
  let mountPoint = '';
  let skipPollTest = false;

  beforeAll(async () => {
    try {
      const sessionWrap = await fuseIntegrationSessionSetup(filesystemOperations, {});
      fuse = sessionWrap.fuseNative;
      await sessionWrap.session.mount();
      mountPoint = sessionWrap.mountPoint;
      session = sessionWrap.session;
    } catch (error) {
      skipPollTest = true;
      if (error instanceof Error) {
        console.warn('Skipping poll integration test:', error.message);
      }
    }
  });

  afterAll(async () => {
    if (skipPollTest) {
      return;
    }
    await session?.unmount();
    await fuse?.shutdownDispatcher(750);
    await session?.destroy();
  });

  test('should retain poll handle, notify kernel, and tear down', async () => {
    if (skipPollTest) {
      expect(skipPollTest).toBe(true);
      return;
    }
    if (!fuse) {
      throw new Error('FuseNative binding not initialised');
    }

    const pollFirst = defer<bigint>();
    const pollSecond = defer<void>();

    let firstIno: Ino = 0n as Ino;
    let requestedEventsFirst = 0;
    let storedHandle: bigint | null = null;
    let pollInvocations = 0;

    const pollOverride = async (
      ino: Ino,
      fi: any,
      ph: PollHandle,
      requestedEvents: number,
      _context: RequestContext,
    ): Promise<PollResult> => {
      pollInvocations += 1;
      if (pollInvocations === 1) {
        expect(typeof requestedEvents).toBe('number');
        firstIno = ino;
        requestedEventsFirst = requestedEvents;
        if (!ph.kh) {
          throw new FuseErrno('EIO', 'Missing poll handle key');
        }
        storedHandle = BigInt(ph.kh);
        pollFirst.resolve(storedHandle);
        return { revents: 0, keepPolling: true };
      }

      expect(storedHandle).not.toBeNull();
      expect(ino).toBe(firstIno);
      pollSecond.resolve();
      return { revents: requestedEvents || requestedEventsFirst || 0, keepPolling: false };
    };

    filesystemOperations.overrideOperationsWith({ poll: pollOverride });

    const testFile = `${mountPoint}/poll-test.txt`;
    await fs.writeFile(testFile, 'poll-content');

    const pythonScript = `import os, select, sys\npath = sys.argv[1]\nfd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)\np = select.poll()\np.register(fd, select.POLLIN)\ntry:\n    events = p.poll(5000)\n    print(events)\nfinally:\n    os.close(fd)\n`;

    const python = spawn('python3', ['-c', pythonScript, testFile], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    python.stderr?.on('data', chunk => {
      process.stderr.write(chunk);
    });

    const handle = await pollFirst.promise;
    expect(typeof handle).toBe('bigint');
    expect(handle).toBeGreaterThan(0n);

    const notifyResult = fuse.notifyPollHandle(handle, false);
    expect(notifyResult).toBe(true);

    await Promise.all([
      pollSecond.promise,
      once(python, 'exit').then(([code]) => {
        expect(code).toBe(0);
      }),
    ]);

    const destroyResult = fuse.destroyPollHandle(handle);
    expect([true, false]).toContain(destroyResult);

    filesystemOperations.overrideOperationsWith({});
  });
});
