/**
 * @file index.ts
 * @brief Main entry point for the modular in-memory filesystem example
 */

// Re-export main classes and utilities
export { InMemoryFilesystem } from './InMemoryFilesystem.ts';
export { InMemoryFilesystemCore } from './InMemoryFilesystemCore.ts';
export { InMemoryFsUtils, InMemoryFsError } from './types.ts';

// Re-export operation modules for advanced usage
export { FileOperations } from './operations/fileOperations.ts';
export { DirectoryOperations } from './operations/directoryOperations.ts';
export { MetadataOperations } from './operations/metadataOperations.ts';
export { LinkOperations } from './operations/linkOperations.ts';
export { XattrOperations } from './operations/xattrOperations.ts';
export { AdvancedOperations } from './operations/advancedOperations.ts';

// Re-export types
export type {
  Inode,
  InodeType,
  InMemoryFsConfig,
  InMemoryFsStats,
  InMemoryDirent,
  OperationContext,
} from './types.ts';

// Import and run the example if this is the main module
import './example.ts';