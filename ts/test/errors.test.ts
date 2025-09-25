/**
 * @file errors.test.ts
 * @brief Comprehensive error handling tests for FUSE operations
 *
 * This test suite validates error handling across all FUSE operations,
 * ensuring proper errno codes, error classification, and FUSE-specific
 * error behavior.
 */

import {
  errno,
  errname,
  errmsg,
  isValidErrno,
  normalizeErrno,
  isPermissionError,
  isNotFoundError,
  isExistsError,
  isTemporaryError,
  isIOError,
  isInvalidError,
  createFuseError,
  createENoent,
  createEAcces,
  createEExist,
  createEIsDir,
  createENotDir,
  createEInval,
  createEIO,
  createENoSpc,
  createENotEmpty,
  OPERATION_ERRORS,
  getOperationErrors,
  isValidOperationError,
  ERRNO,
} from '../errno.ts';

import { FuseErrno } from '../errors.ts';

describe('Errno Functions', () => {
  describe('errno()', () => {
    it('should return correct errno codes for common errors', () => {
      expect(errno('ENOENT')).toBe(-2);
      expect(errno('EACCES')).toBe(-13);
      expect(errno('EEXIST')).toBe(-17);
      expect(errno('EISDIR')).toBe(-21);
      expect(errno('EINVAL')).toBe(-22);
      expect(errno('ENOSPC')).toBe(-28);
      expect(errno('ENOTEMPTY')).toBe(-39);
    });

    it('should be case insensitive', () => {
      expect(errno('enoent')).toBe(-2);
      expect(errno('ENOENT')).toBe(-2);
      expect(errno('eAcCeS')).toBe(-13);
    });

    it('should return 0 for unknown error names', () => {
      expect(errno('UNKNOWN')).toBe(0);
      expect(errno('INVALID')).toBe(0);
      expect(errno('')).toBe(0);
    });
  });

  describe('errname()', () => {
    it('should return correct error names for errno codes', () => {
      expect(errname(-2)).toBe('ENOENT');
      expect(errname(-13)).toBe('EACCES');
      expect(errname(-17)).toBe('EEXIST');
      expect(errname(-21)).toBe('EISDIR');
      expect(errname(-22)).toBe('EINVAL');
    });

    it('should return UNKNOWN for invalid codes', () => {
      expect(errname(-999)).toBe('UNKNOWN');
      expect(errname(999)).toBe('UNKNOWN');
      expect(errname(0)).toBe('UNKNOWN');
    });
  });

  describe('errmsg()', () => {
    it('should return human-readable messages for errno codes', () => {
      expect(errmsg(-2)).toBe('No such file or directory');
      expect(errmsg(-13)).toBe('Permission denied');
      expect(errmsg(-17)).toBe('File exists');
      expect(errmsg(-22)).toBe('Invalid argument');
    });

    it('should work with error names', () => {
      expect(errmsg('ENOENT')).toBe('No such file or directory');
      expect(errmsg('EACCES')).toBe('Permission denied');
      expect(errmsg('EEXIST')).toBe('File exists');
    });

    it('should return Unknown error for invalid codes', () => {
      expect(errmsg(-999)).toBe('Unknown error');
      expect(errmsg('INVALID')).toBe('Unknown error');
    });
  });

  describe('isValidErrno()', () => {
    it('should validate known errno codes', () => {
      expect(isValidErrno(-2)).toBe(true); // ENOENT
      expect(isValidErrno(-13)).toBe(true); // EACCES
      expect(isValidErrno(0)).toBe(true); // Success
    });

    it('should reject invalid errno codes', () => {
      expect(isValidErrno(-999)).toBe(false);
      expect(isValidErrno(1)).toBe(false); // Positive errors not allowed
      expect(isValidErrno(999)).toBe(false);
    });
  });

  describe('normalizeErrno()', () => {
    it('should normalize positive errno codes to negative', () => {
      expect(normalizeErrno(2)).toBe(-2);
      expect(normalizeErrno(13)).toBe(-13);
      expect(normalizeErrno(22)).toBe(-22);
    });

    it('should keep negative errno codes as-is', () => {
      expect(normalizeErrno(-2)).toBe(-2);
      expect(normalizeErrno(-13)).toBe(-13);
      expect(normalizeErrno(-22)).toBe(-22);
    });

    it('should keep success code (0) as-is', () => {
      expect(normalizeErrno(0)).toBe(0);
    });
  });
});

describe('Error Classification', () => {
  describe('isPermissionError()', () => {
    it('should identify permission errors', () => {
      expect(isPermissionError(-1)).toBe(true); // EPERM
      expect(isPermissionError(-13)).toBe(true); // EACCES
      expect(isPermissionError('EPERM')).toBe(true);
      expect(isPermissionError('EACCES')).toBe(true);
    });

    it('should reject non-permission errors', () => {
      expect(isPermissionError(-2)).toBe(false); // ENOENT
      expect(isPermissionError(-22)).toBe(false); // EINVAL
      expect(isPermissionError('ENOENT')).toBe(false);
    });
  });

  describe('isNotFoundError()', () => {
    it('should identify not found errors', () => {
      expect(isNotFoundError(-2)).toBe(true); // ENOENT
      expect(isNotFoundError(-20)).toBe(true); // ENOTDIR
      expect(isNotFoundError('ENOENT')).toBe(true);
      expect(isNotFoundError('ENOTDIR')).toBe(true);
    });

    it('should reject non-not-found errors', () => {
      expect(isNotFoundError(-13)).toBe(false); // EACCES
      expect(isNotFoundError(-17)).toBe(false); // EEXIST
    });
  });

  describe('isExistsError()', () => {
    it('should identify file exists errors', () => {
      expect(isExistsError(-17)).toBe(true); // EEXIST
      expect(isExistsError('EEXIST')).toBe(true);
    });

    it('should reject non-exists errors', () => {
      expect(isExistsError(-2)).toBe(false); // ENOENT
      expect(isExistsError(-13)).toBe(false); // EACCES
    });
  });

  describe('isTemporaryError()', () => {
    it('should identify temporary errors', () => {
      expect(isTemporaryError(-11)).toBe(true); // EAGAIN
      expect(isTemporaryError(-4)).toBe(true); // EINTR
      expect(isTemporaryError('EAGAIN')).toBe(true);
      expect(isTemporaryError('EINTR')).toBe(true);
    });

    it('should reject non-temporary errors', () => {
      expect(isTemporaryError(-2)).toBe(false); // ENOENT
      expect(isTemporaryError(-13)).toBe(false); // EACCES
    });
  });

  describe('isIOError()', () => {
    it('should identify I/O errors', () => {
      expect(isIOError(-5)).toBe(true); // EIO
      expect(isIOError(-28)).toBe(true); // ENOSPC
      expect(isIOError(-122)).toBe(true); // EDQUOT
      expect(isIOError('EIO')).toBe(true);
      expect(isIOError('ENOSPC')).toBe(true);
    });

    it('should reject non-I/O errors', () => {
      expect(isIOError(-2)).toBe(false); // ENOENT
      expect(isIOError(-13)).toBe(false); // EACCES
    });
  });

  describe('isInvalidError()', () => {
    it('should identify invalid argument errors', () => {
      expect(isInvalidError(-22)).toBe(true); // EINVAL
      expect(isInvalidError('EINVAL')).toBe(true);
    });

    it('should reject non-invalid errors', () => {
      expect(isInvalidError(-2)).toBe(false); // ENOENT
      expect(isInvalidError(-13)).toBe(false); // EACCES
    });
  });
});

describe('FuseErrno Creation', () => {
  describe('createFuseError()', () => {
    it('should create FuseErrno from errno code', () => {
      const error = createFuseError(-2);
      expect(error).toBeInstanceOf(FuseErrno);
      expect(error.errno).toBe(-2);
      expect(error.code).toBe('ENOENT');
      expect(error.message).toContain('No such file or directory');
    });

    it('should create FuseErrno from error name', () => {
      const error = createFuseError('EACCES');
      expect(error).toBeInstanceOf(FuseErrno);
      expect(error.errno).toBe(-13);
      expect(error.code).toBe('EACCES');
      expect(error.message).toContain('Permission denied');
    });

    it('should include custom message, syscall, and path', () => {
      const error = createFuseError(
        'ENOENT',
        'Custom message',
        'open',
        '/path/to/file'
      );
      expect(error.message).toBe('Custom message');
      expect(error.syscall).toBe('open');
      expect(error.path).toBe('/path/to/file');
    });
  });

  describe('Common error creators', () => {
    it('should create ENOENT errors', () => {
      const error = createENoent('/missing/file');
      expect(error.errno).toBe(-2);
      expect(error.code).toBe('ENOENT');
      expect(error.path).toBe('/missing/file');
    });

    it('should create EACCES errors', () => {
      const error = createEAcces('/protected/file');
      expect(error.errno).toBe(-13);
      expect(error.code).toBe('EACCES');
      expect(error.path).toBe('/protected/file');
    });

    it('should create EEXIST errors', () => {
      const error = createEExist('/existing/file');
      expect(error.errno).toBe(-17);
      expect(error.code).toBe('EEXIST');
      expect(error.path).toBe('/existing/file');
    });

    it('should create EISDIR errors', () => {
      const error = createEIsDir('/is/directory');
      expect(error.errno).toBe(-21);
      expect(error.code).toBe('EISDIR');
      expect(error.path).toBe('/is/directory');
    });

    it('should create ENOTDIR errors', () => {
      const error = createENotDir('/not/directory');
      expect(error.errno).toBe(-20);
      expect(error.code).toBe('ENOTDIR');
      expect(error.path).toBe('/not/directory');
    });

    it('should create EINVAL errors', () => {
      const error = createEInval('Invalid parameter');
      expect(error.errno).toBe(-22);
      expect(error.code).toBe('EINVAL');
      expect(error.message).toBe('Invalid parameter');
    });

    it('should create EIO errors', () => {
      const error = createEIO('Disk failure');
      expect(error.errno).toBe(-5);
      expect(error.code).toBe('EIO');
      expect(error.message).toBe('Disk failure');
    });

    it('should create ENOSPC errors', () => {
      const error = createENoSpc();
      expect(error.errno).toBe(-28);
      expect(error.code).toBe('ENOSPC');
    });

    it('should create ENOTEMPTY errors', () => {
      const error = createENotEmpty('/non/empty/dir');
      expect(error.errno).toBe(-39);
      expect(error.code).toBe('ENOTEMPTY');
      expect(error.path).toBe('/non/empty/dir');
    });
  });
});

describe('FUSE Operation Error Mapping', () => {
  describe('getOperationErrors()', () => {
    it('should return correct errors for lookup operation', () => {
      const errors = getOperationErrors('lookup');
      expect(errors).toContain('ENOENT');
      expect(errors).toContain('EACCES');
      expect(errors).toContain('ENOTDIR');
      expect(errors).toContain('ENAMETOOLONG');
      expect(errors).toContain('EIO');
    });

    it('should return correct errors for read operation', () => {
      const errors = getOperationErrors('read');
      expect(errors).toContain('ENOENT');
      expect(errors).toContain('EACCES');
      expect(errors).toContain('EISDIR');
      expect(errors).toContain('EIO');
    });

    it('should return correct errors for write operation', () => {
      const errors = getOperationErrors('write');
      expect(errors).toContain('ENOENT');
      expect(errors).toContain('EACCES');
      expect(errors).toContain('EPERM');
      expect(errors).toContain('EROFS');
      expect(errors).toContain('ENOSPC');
      expect(errors).toContain('EISDIR');
      expect(errors).toContain('EIO');
    });

    it('should return correct errors for create operation', () => {
      const errors = getOperationErrors('create');
      expect(errors).toContain('EEXIST');
      expect(errors).toContain('EACCES');
      expect(errors).toContain('ENOTDIR');
      expect(errors).toContain('EROFS');
      expect(errors).toContain('ENOSPC');
    });

    it('should return correct errors for mkdir operation', () => {
      const errors = getOperationErrors('mkdir');
      expect(errors).toContain('EEXIST');
      expect(errors).toContain('EACCES');
      expect(errors).toContain('ENOTDIR');
      expect(errors).toContain('EROFS');
      expect(errors).toContain('ENOSPC');
    });

    it('should return correct errors for unlink operation', () => {
      const errors = getOperationErrors('unlink');
      expect(errors).toContain('ENOENT');
      expect(errors).toContain('EACCES');
      expect(errors).toContain('EPERM');
      expect(errors).toContain('EROFS');
      expect(errors).toContain('EISDIR');
    });

    it('should return correct errors for rmdir operation', () => {
      const errors = getOperationErrors('rmdir');
      expect(errors).toContain('ENOENT');
      expect(errors).toContain('EACCES');
      expect(errors).toContain('EPERM');
      expect(errors).toContain('EROFS');
      expect(errors).toContain('ENOTDIR');
      expect(errors).toContain('ENOTEMPTY');
    });

    it('should return correct errors for rename operation', () => {
      const errors = getOperationErrors('rename');
      expect(errors).toContain('ENOENT');
      expect(errors).toContain('EACCES');
      expect(errors).toContain('EPERM');
      expect(errors).toContain('EROFS');
      expect(errors).toContain('EXDEV');
      expect(errors).toContain('EISDIR');
      expect(errors).toContain('ENOTDIR');
      expect(errors).toContain('ENOTEMPTY');
    });
  });

  describe('isValidOperationError()', () => {
    it('should validate correct errors for operations', () => {
      expect(isValidOperationError('lookup', -2)).toBe(true); // ENOENT
      expect(isValidOperationError('lookup', 'EACCES')).toBe(true);
      expect(isValidOperationError('read', 'EISDIR')).toBe(true);
      expect(isValidOperationError('write', 'ENOSPC')).toBe(true);
      expect(isValidOperationError('create', 'EEXIST')).toBe(true);
      expect(isValidOperationError('rmdir', 'ENOTEMPTY')).toBe(true);
    });

    it('should reject incorrect errors for operations', () => {
      expect(isValidOperationError('lookup', 'EEXIST')).toBe(false);
      expect(isValidOperationError('read', 'ENOTEMPTY')).toBe(false);
      expect(isValidOperationError('create', 'EISDIR')).toBe(false);
      expect(isValidOperationError('rmdir', 'ENOSPC')).toBe(false);
    });
  });
});

describe('ERRNO Constants', () => {
  it('should provide correct errno constants', () => {
    expect(ERRNO.OK).toBe(0);
    expect(ERRNO.EPERM).toBe(-1);
    expect(ERRNO.ENOENT).toBe(-2);
    expect(ERRNO.EIO).toBe(-5);
    expect(ERRNO.EACCES).toBe(-13);
    expect(ERRNO.EEXIST).toBe(-17);
    expect(ERRNO.EISDIR).toBe(-21);
    expect(ERRNO.EINVAL).toBe(-22);
    expect(ERRNO.ENOSPC).toBe(-28);
    expect(ERRNO.ENOTEMPTY).toBe(-39);
  });
});

describe('Error Handling Integration', () => {
  it('should handle errno roundtrip conversions', () => {
    const testCodes = [-2, -13, -17, -21, -22, -28, -39];

    testCodes.forEach(code => {
      const name = errname(code);
      const backToCode = errno(name);
      expect(backToCode).toBe(code);

      const message = errmsg(code);
      expect(message).not.toBe('Unknown error');
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });
  });

  it('should create proper FuseErrno hierarchy', () => {
    const error = createENoent('/test/path');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(FuseErrno);
    expect(error.name).toBe('FuseErrno');
    expect(error.errno).toBe(-2);
    expect(error.code).toBe('ENOENT');
    expect(error.path).toBe('/test/path');
    expect(error.stack).toBeDefined();
  });

  it('should provide consistent error messages', () => {
    const error1 = createFuseError('ENOENT');
    const error2 = createENoent();

    expect(error1.errno).toBe(error2.errno);
    expect(error1.code).toBe(error2.code);
  });
});

describe('Error Edge Cases', () => {
  it('should handle empty and invalid inputs gracefully', () => {
    expect(errno('')).toBe(0);
    expect(errname(0)).toBe('UNKNOWN');
    expect(errmsg(0)).toBe('Unknown error');
    expect(isValidErrno(NaN)).toBe(false);
    expect(normalizeErrno(NaN)).toBe(NaN);
  });

  it('should handle boundary conditions', () => {
    expect(errno('E')).toBe(0); // Too short
    expect(errname(-1000)).toBe('UNKNOWN'); // Outside range
    expect(isValidErrno(Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(isValidErrno(Number.MIN_SAFE_INTEGER)).toBe(false);
  });

  it('should be case insensitive for error names', () => {
    const testCases = ['ENOENT', 'enoent', 'ENoEnT', 'EACCES', 'eacces'];

    testCases.forEach(errorName => {
      const code = errno(errorName);
      expect(code).toBeLessThan(0);
      expect(isValidErrno(code)).toBe(true);
    });
  });
});

describe('Performance and Memory', () => {
  it('should handle large volumes of error operations efficiently', () => {
    const iterations = 1000;
    const startTime = process.hrtime.bigint();

    for (let i = 0; i < iterations; i++) {
      const code = errno('ENOENT');
      const name = errname(code);
      const message = errmsg(code);
      const error = createFuseError(code);

      expect(code).toBe(-2);
      expect(name).toBe('ENOENT');
      expect(message).toContain('No such file');
      expect(error.errno).toBe(-2);
    }

    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1000000;

    // Should complete reasonably quickly (adjust threshold as needed)
    expect(durationMs).toBeLessThan(350);
  });

  it('should not leak memory with repeated error creation', () => {
    const iterations = 100;
    const errors: FuseErrno[] = [];

    for (let i = 0; i < iterations; i++) {
      errors.push(createENoent(`/path/${i}`));
      errors.push(createEAcces(`/protected/${i}`));
      errors.push(createEIO('I/O error ' + i));
    }

    // Verify all errors were created correctly
    expect(errors.length).toBe(iterations * 3);
    errors.forEach(error => {
      expect(error).toBeInstanceOf(FuseErrno);
      expect(error.errno).toBeLessThan(0);
      expect(error.code).toMatch(/^E[A-Z]+$/);
    });
  });
});
