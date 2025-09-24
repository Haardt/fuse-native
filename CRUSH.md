# CRUSH.md

## Build Commands
- **Full build**: `pnpm run build` (native + TS)
- **Native only**: `pnpm run build:native` (cmake-js)
- **TypeScript only**: `pnpm run build:ts`
- **Test all**: `pnpm test` (jest)
- **Test single**: `pnpm test -- test/specific-file.test.ts`
- **Lint**: `pnpm run lint` (eslint with fixes)
- **Format**: `pnpm run format` (prettier)
- **Type check**: `pnpm run typecheck`

**Critical: After adding C++ functions, update prebuilds:**
```bash
cp build/Release/fuse-native.node prebuilds/linux-x64/@cocalc+fuse-native.node
```

## Code Style Guidelines
- **ESM imports**: `import type { Foo } from './foo.js'`
- **Strict TypeScript**: no `any`, no implicit types, prefer readonly
- **BigInt for 64-bit**: offsets/sizes/timestamps (never `number`)
- **Error handling**: negative errno (e.g., `-2` for ENOENT)
- **Current working directory**: absolute paths, avoid `cd`
- **No callbacks**: only Promises with AbortSignal support
- **Branded types**: `Fd`, `Mode`, `Flags` (not plain numbers)
- **C++ namespace**: `fuse_native::` prefix
- **Formatting**: single quotes, 2 spaces, semi-colons, printWidth 80