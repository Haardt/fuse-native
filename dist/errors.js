/**
 * @file errors.ts
 * @brief Error handling and errno mapping for FUSE3 Node.js binding
 *
 * This module provides comprehensive error handling with POSIX errno codes,
 * custom FUSE error types, and proper error propagation between C++ and TypeScript.
 */
/**
 * FUSE-specific error class that extends the standard Error
 * with errno support for POSIX-compliant error handling
 */
export class FuseErrno extends Error {
    /** The errno code (negative value following POSIX convention) */
    errno;
    /** The errno name (e.g., 'ENOENT', 'EACCES') */
    code;
    /** System error message */
    /** System call that caused the error (optional) */
    syscall;
    /** File path associated with the error (optional) */
    path;
    constructor(code, message, syscall, path) {
        // Convert code to errno number if string
        const errno = typeof code === 'string' ? getErrnoFromCode(code) : code;
        const errorCode = typeof code === 'string' ? code : getCodeFromErrno(errno);
        // Create descriptive message
        const fullMessage = message || `${errorCode}: ${getErrnoMessage(errno)}`;
        super(fullMessage);
        this.name = 'FuseErrno';
        this.errno = errno;
        this.code = errorCode;
        this.syscall = syscall;
        this.path = path;
        // Maintain proper stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, FuseErrno);
        }
    }
    /**
     * Convert to JSON representation
     */
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            errno: this.errno,
            code: this.code,
            syscall: this.syscall,
            path: this.path,
            stack: this.stack,
        };
    }
    /**
     * String representation
     */
    toString() {
        let result = `${this.name}: ${this.message}`;
        if (this.syscall) {
            result += ` [${this.syscall}]`;
        }
        if (this.path) {
            result += ` (${this.path})`;
        }
        return result;
    }
}
/**
 * Map of errno codes to their string representations
 */
export const ERRNO_CODES = {
    [-1]: 'EPERM',
    [-2]: 'ENOENT',
    [-3]: 'ESRCH',
    [-4]: 'EINTR',
    [-5]: 'EIO',
    [-6]: 'ENXIO',
    [-7]: 'E2BIG',
    [-8]: 'ENOEXEC',
    [-9]: 'EBADF',
    [-10]: 'ECHILD',
    [-11]: 'EAGAIN',
    [-12]: 'ENOMEM',
    [-13]: 'EACCES',
    [-14]: 'EFAULT',
    [-15]: 'ENOTBLK',
    [-16]: 'EBUSY',
    [-17]: 'EEXIST',
    [-18]: 'EXDEV',
    [-19]: 'ENODEV',
    [-20]: 'ENOTDIR',
    [-21]: 'EISDIR',
    [-22]: 'EINVAL',
    [-23]: 'ENFILE',
    [-24]: 'EMFILE',
    [-25]: 'ENOTTY',
    [-26]: 'ETXTBSY',
    [-27]: 'EFBIG',
    [-28]: 'ENOSPC',
    [-29]: 'ESPIPE',
    [-30]: 'EROFS',
    [-31]: 'EMLINK',
    [-32]: 'EPIPE',
    [-33]: 'EDOM',
    [-34]: 'ERANGE',
    [-35]: 'EDEADLK',
    [-36]: 'ENAMETOOLONG',
    [-37]: 'ENOLCK',
    [-38]: 'ENOSYS',
    [-39]: 'ENOTEMPTY',
    [-40]: 'ELOOP',
    [-42]: 'ENOMSG',
    [-43]: 'EIDRM',
    [-61]: 'ENODATA',
    [-62]: 'ETIME',
    [-63]: 'ENOSR',
    [-64]: 'ENONET',
    [-65]: 'ENOPKG',
    [-66]: 'EREMOTE',
    [-67]: 'ENOLINK',
    [-68]: 'EADV',
    [-69]: 'ESRMNT',
    [-70]: 'ECOMM',
    [-71]: 'EPROTO',
    [-72]: 'EMULTIHOP',
    [-73]: 'EDOTDOT',
    [-74]: 'EBADMSG',
    [-75]: 'EOVERFLOW',
    [-76]: 'ENOTUNIQ',
    [-77]: 'EBADFD',
    [-78]: 'EREMCHG',
    [-79]: 'ELIBACC',
    [-80]: 'ELIBBAD',
    [-81]: 'ELIBSCN',
    [-82]: 'ELIBMAX',
    [-83]: 'ELIBEXEC',
    [-84]: 'EILSEQ',
    [-85]: 'ERESTART',
    [-86]: 'ESTRPIPE',
    [-87]: 'EUSERS',
    [-88]: 'ENOTSOCK',
    [-89]: 'EDESTADDRREQ',
    [-90]: 'EMSGSIZE',
    [-91]: 'EPROTOTYPE',
    [-92]: 'ENOPROTOOPT',
    [-93]: 'EPROTONOSUPPORT',
    [-94]: 'ESOCKTNOSUPPORT',
    [-95]: 'ENOTSUP',
    [-96]: 'EPFNOSUPPORT',
    [-97]: 'EAFNOSUPPORT',
    [-98]: 'EADDRINUSE',
    [-99]: 'EADDRNOTAVAIL',
    [-100]: 'ENETDOWN',
    [-101]: 'ENETUNREACH',
    [-102]: 'ENETRESET',
    [-103]: 'ECONNABORTED',
    [-104]: 'ECONNRESET',
    [-105]: 'ENOBUFS',
    [-106]: 'EISCONN',
    [-107]: 'ENOTCONN',
    [-108]: 'ESHUTDOWN',
    [-109]: 'ETOOMANYREFS',
    [-110]: 'ETIMEDOUT',
    [-111]: 'ECONNREFUSED',
    [-112]: 'EHOSTDOWN',
    [-113]: 'EHOSTUNREACH',
    [-114]: 'EALREADY',
    [-115]: 'EINPROGRESS',
    [-116]: 'ESTALE',
    [-117]: 'EUCLEAN',
    [-118]: 'ENOTNAM',
    [-119]: 'ENAVAIL',
    [-120]: 'EISNAM',
    [-121]: 'EREMOTEIO',
    [-122]: 'EDQUOT',
    [-123]: 'ENOMEDIUM',
    [-124]: 'EMEDIUMTYPE',
    [-125]: 'ECANCELED',
    [-126]: 'ENOKEY',
    [-127]: 'EKEYEXPIRED',
    [-128]: 'EKEYREVOKED',
    [-129]: 'EKEYREJECTED',
    [-130]: 'EOWNERDEAD',
    [-131]: 'ENOTRECOVERABLE',
    [-132]: 'ERFKILL',
    [-133]: 'EHWPOISON',
};
/**
 * Reverse map of errno string codes to numbers
 */
export const CODE_TO_ERRNO = Object.fromEntries(Object.entries(ERRNO_CODES).map(([errno, code]) => [code, parseInt(errno)]));
/**
 * Human-readable error messages for common errno codes
 */
export const ERRNO_MESSAGES = {
    [-1]: 'Operation not permitted',
    [-2]: 'No such file or directory',
    [-3]: 'No such process',
    [-4]: 'Interrupted system call',
    [-5]: 'Input/output error',
    [-6]: 'No such device or address',
    [-7]: 'Argument list too long',
    [-8]: 'Exec format error',
    [-9]: 'Bad file descriptor',
    [-10]: 'No child processes',
    [-11]: 'Resource temporarily unavailable',
    [-12]: 'Cannot allocate memory',
    [-13]: 'Permission denied',
    [-14]: 'Bad address',
    [-15]: 'Block device required',
    [-16]: 'Device or resource busy',
    [-17]: 'File exists',
    [-18]: 'Invalid cross-device link',
    [-19]: 'No such device',
    [-20]: 'Not a directory',
    [-21]: 'Is a directory',
    [-22]: 'Invalid argument',
    [-23]: 'Too many open files in system',
    [-24]: 'Too many open files',
    [-25]: 'Inappropriate ioctl for device',
    [-26]: 'Text file busy',
    [-27]: 'File too large',
    [-28]: 'No space left on device',
    [-29]: 'Illegal seek',
    [-30]: 'Read-only file system',
    [-31]: 'Too many links',
    [-32]: 'Broken pipe',
    [-33]: 'Numerical argument out of domain',
    [-34]: 'Numerical result out of range',
    [-35]: 'Resource deadlock avoided',
    [-36]: 'File name too long',
    [-37]: 'No locks available',
    [-38]: 'Function not implemented',
    [-39]: 'Directory not empty',
    [-40]: 'Too many levels of symbolic links',
    [-42]: 'No message of desired type',
    [-43]: 'Identifier removed',
    [-61]: 'No data available',
    [-62]: 'Timer expired',
    [-63]: 'Out of streams resources',
    [-64]: 'Machine is not on the network',
    [-65]: 'Package not installed',
    [-66]: 'Object is remote',
    [-67]: 'Link has been severed',
    [-68]: 'Advertise error',
    [-69]: 'Srmount error',
    [-70]: 'Communication error on send',
    [-71]: 'Protocol error',
    [-72]: 'Multihop attempted',
    [-73]: 'RFS specific error',
    [-74]: 'Bad message',
    [-75]: 'Value too large for defined data type',
    [-76]: 'Name not unique on network',
    [-77]: 'File descriptor in bad state',
    [-78]: 'Remote address changed',
    [-79]: 'Can not access a needed shared library',
    [-80]: 'Accessing a corrupted shared library',
    [-81]: '.lib section in a.out corrupted',
    [-82]: 'Attempting to link in too many shared libraries',
    [-83]: 'Cannot exec a shared library directly',
    [-84]: 'Invalid or incomplete multibyte or wide character',
    [-85]: 'Interrupted system call should be restarted',
    [-86]: 'Streams pipe error',
    [-87]: 'Too many users',
    [-88]: 'Socket operation on non-socket',
    [-89]: 'Destination address required',
    [-90]: 'Message too long',
    [-91]: 'Protocol wrong type for socket',
    [-92]: 'Protocol not available',
    [-93]: 'Protocol not supported',
    [-94]: 'Socket type not supported',
    [-95]: 'Operation not supported',
    [-96]: 'Protocol family not supported',
    [-97]: 'Address family not supported by protocol',
    [-98]: 'Address already in use',
    [-99]: 'Cannot assign requested address',
    [-100]: 'Network is down',
    [-101]: 'Network is unreachable',
    [-102]: 'Network dropped connection on reset',
    [-103]: 'Software caused connection abort',
    [-104]: 'Connection reset by peer',
    [-105]: 'No buffer space available',
    [-106]: 'Transport endpoint is already connected',
    [-107]: 'Transport endpoint is not connected',
    [-108]: 'Cannot send after transport endpoint shutdown',
    [-109]: 'Too many references: cannot splice',
    [-110]: 'Connection timed out',
    [-111]: 'Connection refused',
    [-112]: 'Host is down',
    [-113]: 'No route to host',
    [-114]: 'Operation already in progress',
    [-115]: 'Operation now in progress',
    [-116]: 'Stale file handle',
    [-117]: 'Structure needs cleaning',
    [-118]: 'Not a XENIX named type file',
    [-119]: 'No XENIX semaphores available',
    [-120]: 'Is a named type file',
    [-121]: 'Remote I/O error',
    [-122]: 'Disk quota exceeded',
    [-123]: 'No medium found',
    [-124]: 'Wrong medium type',
    [-125]: 'Operation canceled',
    [-126]: 'Required key not available',
    [-127]: 'Key has expired',
    [-128]: 'Key has been revoked',
    [-129]: 'Key was rejected by service',
    [-130]: 'Owner died',
    [-131]: 'State not recoverable',
    [-132]: 'Operation not possible due to RF-kill',
    [-133]: 'Memory page has hardware error',
};
/**
 * Get errno code from string representation
 */
export function getErrnoFromCode(code) {
    const errno = CODE_TO_ERRNO[code];
    if (errno === undefined) {
        throw new Error(`Unknown errno code: ${code}`);
    }
    return errno;
}
/**
 * Get string code from errno number
 */
export function getCodeFromErrno(errno) {
    const code = ERRNO_CODES[errno];
    if (code === undefined) {
        throw new Error(`Unknown errno: ${errno}`);
    }
    return code;
}
/**
 * Get human-readable message for errno
 */
export function getErrnoMessage(errno) {
    return ERRNO_MESSAGES[errno] || `Unknown error ${errno}`;
}
/**
 * Check if an error is a FuseErrno
 */
export function isFuseError(error) {
    return error instanceof FuseErrno;
}
/**
 * Convert any error to a FuseErrno
 */
export function toFuseError(error, fallbackErrno = -5) {
    if (isFuseError(error)) {
        return error;
    }
    if (error instanceof Error) {
        // Try to parse errno from message
        const errnoMatch = error.message.match(/ERRNO:(-?\d+)/);
        if (errnoMatch) {
            const errno = parseInt(errnoMatch[1]);
            getCodeFromErrno(errno);
            return new FuseErrno(errno, error.message, undefined, undefined);
        }
        // Try to parse code from message
        const codeMatch = error.message.match(/^([A-Z][A-Z0-9]*)/);
        if (codeMatch && codeMatch[1] && CODE_TO_ERRNO[codeMatch[1]]) {
            return new FuseErrno(codeMatch[1], error.message);
        }
        // Default to EIO with original message
        return new FuseErrno(fallbackErrno, error.message);
    }
    // Convert unknown error to string
    const message = String(error);
    return new FuseErrno(fallbackErrno, message);
}
/**
 * Create convenience functions for common errors
 */
export const createENoEnt = (message, path) => new FuseErrno('ENOENT', message, 'stat', path);
export const createEAcces = (message, path) => new FuseErrno('EACCES', message, 'open', path);
export const createEExist = (message, path) => new FuseErrno('EEXIST', message, 'open', path);
export const createEIsDir = (message, path) => new FuseErrno('EISDIR', message, 'read', path);
export const createENotDir = (message, path) => new FuseErrno('ENOTDIR', message, 'opendir', path);
export const createENoTEmpty = (message, path) => new FuseErrno('ENOTEMPTY', message, 'rmdir', path);
export const createEPerm = (message, path) => new FuseErrno('EPERM', message, 'chmod', path);
export const createEIO = (message, path) => new FuseErrno('EIO', message, 'read', path);
export const createEInval = (message) => new FuseErrno('EINVAL', message);
export const createENoSpc = (message, path) => new FuseErrno('ENOSPC', message, 'write', path);
/**
 * Type guard for checking specific errno codes
 */
export function isErrno(error, code) {
    return isFuseError(error) && error.code === code;
}
/**
 * Error handling utilities for async operations
 */
export class ErrorHandler {
    /**
     * Wrap an async function with error handling
     */
    static wrapAsync(fn, errorTransform) {
        return async (...args) => {
            try {
                return await fn(...args);
            }
            catch (error) {
                const fuseError = errorTransform
                    ? errorTransform(error)
                    : toFuseError(error);
                throw fuseError;
            }
        };
    }
    /**
     * Wrap a sync function with error handling
     */
    static wrapSync(fn, errorTransform) {
        return (...args) => {
            try {
                return fn(...args);
            }
            catch (error) {
                const fuseError = errorTransform
                    ? errorTransform(error)
                    : toFuseError(error);
                throw fuseError;
            }
        };
    }
}
/**
 * Default export
 */
export default {
    FuseErrno,
    ERRNO_CODES,
    CODE_TO_ERRNO,
    ERRNO_MESSAGES,
    getErrnoFromCode,
    getCodeFromErrno,
    getErrnoMessage,
    isFuseError,
    toFuseError,
    isErrno,
    ErrorHandler,
    // Convenience error creators
    createENoEnt,
    createEAcces,
    createEExist,
    createEIsDir,
    createENotDir,
    createENoTEmpty,
    createEPerm,
    createEIO,
    createEInval,
    createENoSpc,
};
//# sourceMappingURL=errors.js.map