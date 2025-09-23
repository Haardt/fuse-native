/**
 * @file types.ts
 * @brief Comprehensive TypeScript type definitions for FUSE3 Node.js binding
 *
 * This module defines all TypeScript types used throughout the FUSE binding,
 * including branded types for type safety, BigInt support for 64-bit values,
 * and complete FUSE operation interfaces.
 */
// Helper functions to create branded types
export const createFd = (value) => value;
export const createIno = (value) => value;
export const createMode = (value) => value;
export const createFlags = (value) => value;
export const createUid = (value) => value;
export const createGid = (value) => value;
export const createDev = (value) => value;
/** Helper to create timestamp from Date */
export const timestampFromDate = (date) => BigInt(date.getTime()) * 1000000n;
/** Helper to create Date from timestamp */
export const dateFromTimestamp = (timestamp) => new Date(Number(timestamp / 1000000n));
/** Helper to get current timestamp */
export const getCurrentTimestamp = () => timestampFromDate(new Date());
// =============================================================================
// Directory Entry Types
// =============================================================================
/** Directory entry type */
export var DirentType;
(function (DirentType) {
    DirentType[DirentType["Unknown"] = 0] = "Unknown";
    DirentType[DirentType["Fifo"] = 1] = "Fifo";
    DirentType[DirentType["CharDevice"] = 2] = "CharDevice";
    DirentType[DirentType["Directory"] = 4] = "Directory";
    DirentType[DirentType["BlockDevice"] = 6] = "BlockDevice";
    DirentType[DirentType["RegularFile"] = 8] = "RegularFile";
    DirentType[DirentType["SymbolicLink"] = 10] = "SymbolicLink";
    DirentType[DirentType["Socket"] = 12] = "Socket";
})(DirentType || (DirentType = {}));
//# sourceMappingURL=types.js.map