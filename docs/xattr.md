# Extended Attributes (xattr) API

## Overview

The FUSE Native library provides comprehensive support for extended attributes (xattr) with unified APIs that handle platform-specific differences transparently. Extended attributes allow storing additional metadata alongside files and directories.

## API Reference

### `getxattr(path, name, size?)`

Retrieves the value of an extended attribute.

**Parameters:**
- `path: string` - File or directory path
- `name: string` - Attribute name
- `size?: bigint` - Buffer size (optional, 0 for size query)

**Returns:** `Promise<{ size: bigint; data?: Buffer }>`

**Examples:**

```typescript
import { getxattr } from '@cocalc/fuse-native';

// Size query - get required buffer size
const sizeInfo = await getxattr('/path/to/file', 'user.comment');
console.log(`Attribute size: ${sizeInfo.size} bytes`);

// Get attribute data
const result = await getxattr('/path/to/file', 'user.comment', sizeInfo.size);
console.log(`Comment: ${result.data?.toString()}`);
```

### `setxattr(path, name, value, flags?)`

Sets the value of an extended attribute.

**Parameters:**
- `path: string` - File or directory path
- `name: string` - Attribute name
- `value: Buffer` - Attribute value
- `flags?: number` - Creation flags (default: 0)

**Flags:**
- `xattr.XATTR_CREATE` (1) - Create only, fail if exists
- `xattr.XATTR_REPLACE` (2) - Replace only, fail if doesn't exist
- `0` - Create or replace (default)

**Returns:** `Promise<void>`

**Examples:**

```typescript
import { setxattr, xattr } from '@cocalc/fuse-native';

// Set or update attribute
await setxattr('/path/to/file', 'user.comment', Buffer.from('My comment'));

// Create new attribute (fail if exists)
await setxattr('/path/to/file', 'user.tag', Buffer.from('important'), xattr.XATTR_CREATE);

// Replace existing attribute (fail if doesn't exist)
await setxattr('/path/to/file', 'user.tag', Buffer.from('updated'), xattr.XATTR_REPLACE);
```

### `listxattr(path, size?)`

Lists all extended attribute names for a file or directory.

**Parameters:**
- `path: string` - File or directory path
- `size?: bigint` - Buffer size (optional, 0 for size query)

**Returns:** `Promise<{ size: bigint; names?: string[] }>`

**Examples:**

```typescript
import { listxattr } from '@cocalc/fuse-native';

// Size query
const sizeInfo = await listxattr('/path/to/file');
if (sizeInfo.size === 0n) {
  console.log('No extended attributes');
} else {
  // Get attribute names
  const result = await listxattr('/path/to/file', sizeInfo.size);
  console.log(`Attributes: ${result.names?.join(', ')}`);
}
```

### `removexattr(path, name)`

Removes an extended attribute.

**Parameters:**
- `path: string` - File or directory path
- `name: string` - Attribute name

**Returns:** `Promise<void>`

**Examples:**

```typescript
import { removexattr } from '@cocalc/fuse-native';

await removexattr('/path/to/file', 'user.comment');
console.log('Attribute removed');
```

## Platform Differences

### macOS vs Linux

The implementation handles platform-specific differences automatically:

#### macOS
- Uses `position` parameter (forced to 0 for compatibility)
- Supports resource forks via `com.apple.ResourceFork`
- More permissive attribute naming
- Uses `XATTR_NOFOLLOW` flag internally

#### Linux
- Direct xattr system calls
- Stricter namespace enforcement (`user.`, `system.`, `security.`, `trusted.`)
- No position parameter

### Attribute Namespaces

#### Linux Namespaces
- `user.*` - User-defined attributes (accessible to file owner)
- `system.*` - System attributes (requires special permissions)
- `security.*` - Security modules (SELinux, etc.)
- `trusted.*` - Trusted attributes (requires CAP_SYS_ADMIN)

#### macOS Namespaces
- `com.apple.*` - Apple system attributes
- `user.*` - User attributes (recommended)
- Custom namespaces allowed

## Error Handling

### Common Errors

- `ENOATTR` (61) - Attribute does not exist
- `ENOENT` (2) - File does not exist
- `EACCES` (13) - Permission denied
- `ENOSPC` (28) - No space left on device
- `E2BIG` (7) - Attribute too large
- `ERANGE` (34) - Buffer too small
- `EINVAL` (22) - Invalid attribute name
- `ENOTSUP` (95) - Extended attributes not supported

**Example:**

```typescript
import { getxattr, FuseError, errno } from '@cocalc/fuse-native';

try {
  const result = await getxattr('/path/to/file', 'user.missing');
} catch (error) {
  if (error instanceof FuseError) {
    switch (error.errno) {
      case errno.ENOATTR:
        console.log('Attribute does not exist');
        break;
      case errno.ENOENT:
        console.log('File does not exist');
        break;
      default:
        console.log(`Unexpected error: ${error.message}`);
    }
  }
}
```

## Size Queries and Large Attributes

### Efficient Size Handling

Always perform size queries first for unknown attribute sizes:

```typescript
// Efficient two-step process
async function getAttributeValue(path: string, name: string): Promise<Buffer | null> {
  try {
    // Step 1: Get size
    const sizeInfo = await getxattr(path, name);
    if (sizeInfo.size === 0n) {
      return Buffer.alloc(0); // Empty attribute
    }
    
    // Step 2: Get data
    const result = await getxattr(path, name, sizeInfo.size);
    return result.data || null;
  } catch (error) {
    if (error instanceof FuseError && error.errno === errno.ENOATTR) {
      return null; // Attribute doesn't exist
    }
    throw error;
  }
}
```

### Large Attribute Handling

For attributes larger than 64KB, consider chunked processing:

```typescript
async function getLargeAttribute(path: string, name: string): Promise<Buffer> {
  const sizeInfo = await getxattr(path, name);
  const size = Number(sizeInfo.size);
  
  if (size > 1024 * 1024) { // > 1MB
    console.warn(`Large attribute detected: ${size} bytes`);
  }
  
  const result = await getxattr(path, name, sizeInfo.size);
  return result.data!;
}
```

## Best Practices

### 1. Attribute Naming

```typescript
// Good: Use clear, namespace-prefixed names
'user.mime-type'
'user.author'
'user.project.version'

// Avoid: Generic or conflicting names
'type'
'data'
'info'
```

### 2. Error Handling Strategy

```typescript
async function safeGetXattr(path: string, name: string): Promise<Buffer | undefined> {
  try {
    const sizeInfo = await getxattr(path, name);
    if (sizeInfo.size > 0n) {
      const result = await getxattr(path, name, sizeInfo.size);
      return result.data;
    }
    return Buffer.alloc(0);
  } catch (error) {
    if (error instanceof FuseError && error.errno === errno.ENOATTR) {
      return undefined; // Attribute doesn't exist
    }
    throw error; // Re-throw other errors
  }
}
```

### 3. Batch Operations

```typescript
async function copyAllAttributes(srcPath: string, dstPath: string): Promise<void> {
  // Get all attribute names
  const listResult = await listxattr(srcPath);
  if (listResult.size === 0n) return;
  
  const namesResult = await listxattr(srcPath, listResult.size);
  if (!namesResult.names) return;
  
  // Copy each attribute
  for (const name of namesResult.names) {
    try {
      const sizeInfo = await getxattr(srcPath, name);
      if (sizeInfo.size > 0n) {
        const valueResult = await getxattr(srcPath, name, sizeInfo.size);
        if (valueResult.data) {
          await setxattr(dstPath, name, valueResult.data);
        }
      }
    } catch (error) {
      console.warn(`Failed to copy attribute ${name}: ${error.message}`);
    }
  }
}
```

### 4. Performance Considerations

- Use size queries to avoid buffer overruns
- Cache attribute lists when processing multiple attributes
- Consider attribute size limits (typically 64KB on Linux, 128KB on macOS)
- Batch related operations when possible

### 5. Security Considerations

- Validate attribute names and values
- Be cautious with system/security namespaces
- Consider filesystem and mount option restrictions
- Sanitize user-provided attribute data

## Integration with FUSE Handlers

### Handler Implementation

```typescript
import { FuseOperationHandlers, GetxattrHandler, SetxattrHandler } from '@cocalc/fuse-native';

const handlers: FuseOperationHandlers = {
  async getxattr(ino, name, context, options) {
    const filePath = getPathFromIno(ino);
    
    try {
      const sizeInfo = await getxattr(filePath, name);
      if (options?.size && options.size > 0n) {
        const result = await getxattr(filePath, name, options.size);
        return { data: result.data, size: result.size };
      }
      return { size: sizeInfo.size };
    } catch (error) {
      throw error; // Let FUSE handle errno translation
    }
  },
  
  async setxattr(ino, name, value, flags, context) {
    const filePath = getPathFromIno(ino);
    await setxattr(filePath, name, value, flags);
  },
  
  async listxattr(ino, context, options) {
    const filePath = getPathFromIno(ino);
    
    try {
      const sizeInfo = await listxattr(filePath);
      if (options?.size && options.size > 0n) {
        const result = await listxattr(filePath, options.size);
        return { names: result.names, size: result.size };
      }
      return { size: sizeInfo.size };
    } catch (error) {
      throw error;
    }
  },
  
  async removexattr(ino, name, context) {
    const filePath = getPathFromIno(ino);
    await removexattr(filePath, name);
  },
};
```

## Examples

### File Tagging System

```typescript
class FileTagging {
  private static TAGS_ATTR = 'user.tags';
  
  static async addTag(path: string, tag: string): Promise<void> {
    const tags = await this.getTags(path);
    if (!tags.includes(tag)) {
      tags.push(tag);
      await this.setTags(path, tags);
    }
  }
  
  static async removeTag(path: string, tag: string): Promise<void> {
    const tags = await this.getTags(path);
    const filtered = tags.filter(t => t !== tag);
    if (filtered.length !== tags.length) {
      await this.setTags(path, filtered);
    }
  }
  
  static async getTags(path: string): Promise<string[]> {
    try {
      const sizeInfo = await getxattr(path, this.TAGS_ATTR);
      if (sizeInfo.size === 0n) return [];
      
      const result = await getxattr(path, this.TAGS_ATTR, sizeInfo.size);
      const tagsStr = result.data?.toString() || '';
      return tagsStr.split(',').filter(tag => tag.length > 0);
    } catch (error) {
      if (error instanceof FuseError && error.errno === errno.ENOATTR) {
        return [];
      }
      throw error;
    }
  }
  
  private static async setTags(path: string, tags: string[]): Promise<void> {
    const tagsStr = tags.join(',');
    await setxattr(path, this.TAGS_ATTR, Buffer.from(tagsStr));
  }
}

// Usage
await FileTagging.addTag('/documents/report.pdf', 'important');
await FileTagging.addTag('/documents/report.pdf', 'work');
const tags = await FileTagging.getTags('/documents/report.pdf');
console.log(tags); // ['important', 'work']
```

### Metadata Cache

```typescript
class MetadataCache {
  private cache = new Map<string, Buffer>();
  
  async getCachedMetadata(path: string, metaName: string): Promise<Buffer | null> {
    const key = `${path}:${metaName}`;
    
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }
    
    try {
      const sizeInfo = await getxattr(path, `user.cache.${metaName}`);
      if (sizeInfo.size > 0n) {
        const result = await getxattr(path, `user.cache.${metaName}`, sizeInfo.size);
        if (result.data) {
          this.cache.set(key, result.data);
          return result.data;
        }
      }
    } catch (error) {
      if (error instanceof FuseError && error.errno === errno.ENOATTR) {
        return null;
      }
      throw error;
    }
    
    return null;
  }
  
  async setCachedMetadata(path: string, metaName: string, data: Buffer): Promise<void> {
    const key = `${path}:${metaName}`;
    await setxattr(path, `user.cache.${metaName}`, data);
    this.cache.set(key, data);
  }
}
```

## Troubleshooting

### Common Issues

1. **"Operation not supported"** - Filesystem doesn't support xattr
2. **"Attribute not found"** - Use size query first to check existence  
3. **"No space left"** - Attribute too large or filesystem full
4. **"Permission denied"** - Insufficient permissions for namespace

### Debugging Tips

```typescript
// Enable verbose error logging
async function debugXattr(path: string, name: string) {
  try {
    console.log(`Checking xattr ${name} on ${path}`);
    const result = await getxattr(path, name);
    console.log(`Success: size=${result.size}`);
    return result;
  } catch (error) {
    if (error instanceof FuseError) {
      console.error(`Xattr error: errno=${error.errno} (${error.code})`);
    }
    throw error;
  }
}
```
