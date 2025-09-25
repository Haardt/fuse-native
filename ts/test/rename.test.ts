import { renameWrapper, validateRename } from '../ops/rename.ts';
import { FuseErrno } from '../errors.ts';
import {
  createGid,
  createIno,
  createMode,
  createUid,
  type RequestContext,
} from '../types.ts';

describe('Rename Operation', () => {
  const parent = createIno(10n);
  const newParent = createIno(20n);
  const name = 'source.txt';
  const newName = 'dest.txt';
  const flags = 0;
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 4321,
    umask: createMode(0o022),
  };
  const options = { timeout: 250 };

  it('calls rename handler with correct arguments', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);

    await renameWrapper(
      { rename: handler },
      parent,
      name,
      newParent,
      newName,
      flags,
      context,
      options
    );

    expect(handler).toHaveBeenCalledWith(
      parent,
      name,
      newParent,
      newName,
      flags,
      context,
      options
    );
  });

  it('throws if handler missing', async () => {
    await expect(
      renameWrapper({}, parent, name, newParent, newName, flags)
    ).rejects.toMatchObject({ code: 'ENOSYS', name: 'FuseErrno' });
  });

  it('validates inode inputs and names', () => {
    expect(() => validateRename(123 as any, name, newParent, newName, flags)).toThrow(FuseErrno);
    expect(() => validateRename(parent, '', newParent, newName, flags)).toThrow(FuseErrno);
    expect(() => validateRename(parent, name, 456 as any, newName, flags)).toThrow(FuseErrno);
    expect(() => validateRename(parent, name, newParent, '', flags)).toThrow(FuseErrno);
  });

  it('validates flags', () => {
    expect(() => validateRename(parent, name, newParent, newName, -1)).toThrow(FuseErrno);
    expect(() => validateRename(parent, name, newParent, newName, 1.5)).toThrow(FuseErrno);
  });

  it('throws when handler resolves with a value', async () => {
    const handler = jest.fn().mockResolvedValue('not-void');

    await expect(
      renameWrapper({ rename: handler }, parent, name, newParent, newName, flags)
    ).rejects.toMatchObject({ code: 'EIO', name: 'FuseErrno' });
  });
});
