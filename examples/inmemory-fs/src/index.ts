/**
 * @file index.ts
 * @brief Main entry point for the modular in-memory filesystem example
 */

// Re-export main classes and utilities
export { InMemoryFilesystem } from './InMemoryFilesystem.js';
export { InMemoryFilesystemCore } from './InMemoryFilesystemCore.js';
export { InMemoryFsUtils, InMemoryFsError } from './types.js';

// Re-export operation modules for advanced usage
export { FileOperations } from './operations/fileOperations.js';
export { DirectoryOperations } from './operations/directoryOperations.js';
export { MetadataOperations } from './operations/metadataOperations.js';
export { LinkOperations } from './operations/linkOperations.js';
export { XattrOperations } from './operations/xattrOperations.js';
export { AdvancedOperations } from './operations/advancedOperations.js';

// Re-export types
export type {
  Inode,
  InodeType,
  InMemoryFsConfig,
  InMemoryFsStats,
  InMemoryDirent,
  OperationContext,
} from './types.js';

// Import and run the example if this is the main module
import './example.js';