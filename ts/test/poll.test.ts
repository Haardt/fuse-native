import { pollWrapper, validatePoll } from '../ops/poll.ts';
import { FuseErrno } from '../errors.ts';
import {
  createFd,
  createFlags,
  createGid,
  createIno,
  createUid,
  type FileInfo,
  type PollHandle,
  type RequestContext,
} from '../types.ts';

describe('Poll Operation', () => {
  const ino = createIno(42n);
  const fi: FileInfo = {
    fh: createFd(5),
    flags: createFlags(0),
  };
  const ph: PollHandle = {
    kh: 123n,
    ph: 456n,
    events: 1,
    active: true,
  };
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 1234,
    umask: 0o022 as any,
  };

  describe('validatePoll', () => {
    it('accepts valid parameters', () => {
      expect(() => validatePoll(ino, fi, ph, 0)).not.toThrow();
      expect(() => validatePoll(ino, fi, ph, 1)).not.toThrow();
      expect(() => validatePoll(ino, fi, ph, 0xFF)).not.toThrow();
    });

    it('accepts minimal poll handle', () => {
      const minimalPh = {};
      expect(() => validatePoll(ino, fi, minimalPh, 0)).not.toThrow();
    });

    it('accepts various revents values', () => {
      expect(() => validatePoll(ino, fi, ph, 0)).not.toThrow();
      expect(() => validatePoll(ino, fi, ph, 1)).not.toThrow();
      expect(() => validatePoll(ino, fi, ph, 0xFFFFFFFF)).not.toThrow();
    });

    it('rejects invalid inode', () => {
      expect(() => validatePoll(123 as any, fi, ph, 0)).toThrow(FuseErrno);
    });

    it('rejects invalid file info', () => {
      expect(() => validatePoll(ino, null as any, ph, 0)).toThrow(FuseErrno);
      expect(() => validatePoll(ino, {} as any, ph, 0)).toThrow(FuseErrno);
    });

    it('rejects file info without fh', () => {
      const invalidFi = { flags: createFlags(0) };
      expect(() => validatePoll(ino, invalidFi as any, ph, 0)).toThrow(FuseErrno);
    });

    it('rejects file info without flags', () => {
      const invalidFi = { fh: createFd(5) };
      expect(() => validatePoll(ino, invalidFi as any, ph, 0)).toThrow(FuseErrno);
    });

    it('rejects invalid poll handle', () => {
      expect(() => validatePoll(ino, fi, null as any, 0)).toThrow(FuseErrno);
      expect(() => validatePoll(ino, fi, 'invalid' as any, 0)).toThrow(FuseErrno);
    });

    it('rejects invalid revents', () => {
      expect(() => validatePoll(ino, fi, ph, 'invalid' as any)).toThrow(FuseErrno);
      expect(() => validatePoll(ino, fi, ph, -1)).toThrow(FuseErrno);
      expect(() => validatePoll(ino, fi, ph, 1.5)).toThrow(FuseErrno);
    });
  });

  describe('pollWrapper', () => {
    it('calls poll handler and returns revents', async () => {
      const mockPoll = jest.fn().mockResolvedValue({ revents: 1 });
      const handlers = { poll: mockPoll };

      const result = await pollWrapper(handlers, ino, fi, ph, 0, context);

      expect(mockPoll).toHaveBeenCalledWith(ino, fi, ph, 0, context, {});
      expect(result).toEqual({ revents: 1 });
    });

    it('handles different revents values', async () => {
      const mockPoll = jest.fn().mockResolvedValue({ revents: 0xFF });
      const handlers = { poll: mockPoll };

      const result = await pollWrapper(handlers, ino, fi, ph, 1, context);

      expect(result).toEqual({ revents: 0xFF });
    });

    it('handles zero revents (no events)', async () => {
      const mockPoll = jest.fn().mockResolvedValue({ revents: 0 });
      const handlers = { poll: mockPoll };

      const result = await pollWrapper(handlers, ino, fi, ph, 2, context);

      expect(result).toEqual({ revents: 0 });
    });

    it('handles large revents values', async () => {
      const mockPoll = jest.fn().mockResolvedValue({ revents: 0xFFFFFFFF });
      const handlers = { poll: mockPoll };

      const result = await pollWrapper(handlers, ino, fi, ph, 3, context);

      expect(result).toEqual({ revents: 0xFFFFFFFF });
    });

    it('accepts minimal poll handle', async () => {
      const mockPoll = jest.fn().mockResolvedValue({ revents: 4 });
      const handlers = { poll: mockPoll };
      const minimalPh = {};

      const result = await pollWrapper(handlers, ino, fi, minimalPh, 0, context);

      expect(mockPoll).toHaveBeenCalledWith(ino, fi, minimalPh, 0, context, {});
      expect(result).toEqual({ revents: 4 });
    });

    it('passes options through correctly', async () => {
      const mockPoll = jest.fn().mockResolvedValue({ revents: 8 });
      const handlers = { poll: mockPoll };
      const options = { signal: new AbortController().signal, timeout: 5000 };

      await pollWrapper(handlers, ino, fi, ph, 0, context, options);

      expect(mockPoll).toHaveBeenCalledWith(ino, fi, ph, 0, context, options);
    });

    it('throws ENOSYS when no poll handler is available', async () => {
      await expect(pollWrapper({}, ino, fi, ph, 0, context))
        .rejects.toMatchObject({
          code: 'ENOSYS',
        });
    });

    it('throws when poll handler throws', async () => {
      const handlers = {
        poll: jest.fn().mockRejectedValue(new Error('test error')),
      };

      await expect(pollWrapper(handlers, ino, fi, ph, 0, context))
        .rejects.toThrow('test error');
    });

    it('throws when poll handler returns invalid result', async () => {
      const handlers = {
        poll: jest.fn().mockResolvedValue(null),
      };

      await expect(pollWrapper(handlers, ino, fi, ph, 0, context))
        .rejects.toMatchObject({
          code: 'EIO',
        });
    });

    it('throws when poll handler returns invalid revents', async () => {
      const handlers = {
        poll: jest.fn().mockResolvedValue({ revents: 'invalid' }),
      };

      await expect(pollWrapper(handlers, ino, fi, ph, 0, context))
        .rejects.toMatchObject({
          code: 'EIO',
        });
    });

    it('throws when poll handler returns negative revents', async () => {
      const handlers = {
        poll: jest.fn().mockResolvedValue({ revents: -1 }),
      };

      await expect(pollWrapper(handlers, ino, fi, ph, 0, context))
        .rejects.toMatchObject({
          code: 'EIO',
        });
    });

    it('throws when poll handler returns non-integer revents', async () => {
      const handlers = {
        poll: jest.fn().mockResolvedValue({ revents: 1.5 }),
      };

      await expect(pollWrapper(handlers, ino, fi, ph, 0, context))
        .rejects.toMatchObject({
          code: 'EIO',
        });
    });

    it('handles different poll handle configurations', async () => {
      const mockPoll = jest.fn().mockResolvedValue({ revents: 16 });
      const handlers = { poll: mockPoll };

      // Test with complete poll handle
      const completePh: PollHandle = {
        kh: 100n,
        ph: 200n,
        events: 0x10,
        active: true,
      };

      await pollWrapper(handlers, ino, fi, completePh, 0, context);
      expect(mockPoll).toHaveBeenLastCalledWith(ino, fi, completePh, 0, context, {});

      mockPoll.mockClear();

      // Test with partial poll handle
      const partialPh: PollHandle = {
        kh: 300n,
      };

      await pollWrapper(handlers, ino, fi, partialPh, 1, context);
      expect(mockPoll).toHaveBeenLastCalledWith(ino, fi, partialPh, 1, context, {});
    });
  });
});