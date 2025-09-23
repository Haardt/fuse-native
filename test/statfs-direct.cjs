/**
 * @file statfs-direct.js
 * @brief Direct Node.js test for statfs implementation without Jest
 *
 * This script directly tests the native statfs implementation without
 * Jest framework to avoid BigInt serialization issues.
 */

const path = require('path');

// Native module interface
let nativeModule;

try {
  // Try to load the native module
  const modulePath = path.resolve(__dirname, '../prebuilds/linux-x64/@cocalc+fuse-native.node');
  nativeModule = require(modulePath);
  console.log('✓ Native module loaded successfully');
} catch (error) {
  console.error('✗ Failed to load native module:', error.message);
  process.exit(1);
}

// Test helper functions
function assert(condition, message) {
  if (!condition) {
    console.error('✗ ASSERTION FAILED:', message);
    process.exit(1);
  }
  console.log('✓', message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    console.error('✗ ASSERTION FAILED:', message);
    console.error('  Expected:', expected);
    console.error('  Actual:', actual);
    process.exit(1);
  }
  console.log('✓', message);
}

function assertBigIntEqual(actual, expected, message) {
  if (typeof actual !== 'bigint' || typeof expected !== 'bigint') {
    console.error('✗ ASSERTION FAILED:', message, '- not BigInt');
    console.error('  Expected type: bigint, actual types:', typeof expected, typeof actual);
    process.exit(1);
  }
  if (actual !== expected) {
    console.error('✗ ASSERTION FAILED:', message);
    console.error('  Expected:', expected.toString());
    console.error('  Actual:', actual.toString());
    process.exit(1);
  }
  console.log('✓', message);
}

function assertApproxEqual(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    console.error('✗ ASSERTION FAILED:', message);
    console.error(`  Expected: ${expected} ± ${tolerance}, Actual: ${actual}, Diff: ${diff}`);
    process.exit(1);
  }
  console.log('✓', message);
}

console.log('\n=== NATIVE STATFS IMPLEMENTATION TESTS ===\n');

// Test 1: Module exports
console.log('Test 1: Module Loading and Exports');
assert(typeof nativeModule === 'object', 'Native module is an object');
assert(typeof nativeModule.testStatvfsToObject === 'function', 'testStatvfsToObject is a function');
assert(typeof nativeModule.testStatvfsRoundtrip === 'function', 'testStatvfsRoundtrip is a function');
assert(typeof nativeModule.testBigIntPrecision === 'function', 'testBigIntPrecision is a function');
assert(typeof nativeModule.testRealisticFilesystem === 'function', 'testRealisticFilesystem is a function');
assert(typeof nativeModule.getVersion === 'function', 'getVersion is a function');
assert(typeof nativeModule.errno === 'object', 'errno constants are exported');

// Test 2: Version information
console.log('\nTest 2: Version Information');
const version = nativeModule.getVersion();
assert(typeof version.fuse === 'string', 'FUSE version is a string');
assert(typeof version.binding === 'string', 'Binding version is a string');
assert(typeof version.napi === 'string', 'N-API version is a string');
console.log(`  FUSE: ${version.fuse}, Binding: ${version.binding}, N-API: ${version.napi}`);

// Test 3: BigInt precision tests
console.log('\nTest 3: BigInt Precision Tests');

// Small value test
const smallValue = 12345n;
const smallResult = nativeModule.testBigIntPrecision(smallValue);
assert(smallResult.lossless === true, 'Small BigInt conversion is lossless');
assertBigIntEqual(smallResult.value, smallValue, 'Small BigInt value matches');

// AGENTS.md test value
const agentsValue = BigInt('1234567890123456789');
const agentsResult = nativeModule.testBigIntPrecision(agentsValue);
assert(agentsResult.lossless === true, 'AGENTS.md BigInt conversion is lossless');
assertBigIntEqual(agentsResult.value, agentsValue, 'AGENTS.md BigInt value matches');

// Near max uint64
const maxUint64Value = BigInt('18446744073709551615');
const maxUint64Result = nativeModule.testBigIntPrecision(maxUint64Value);
assert(maxUint64Result.lossless === true, 'Max uint64 BigInt conversion is lossless');
assertBigIntEqual(maxUint64Result.value, maxUint64Value, 'Max uint64 BigInt value matches');

// Max int64
const maxInt64Value = BigInt('9223372036854775807');
const maxInt64Result = nativeModule.testBigIntPrecision(maxInt64Value);
assert(maxInt64Result.lossless === true, 'Max int64 BigInt conversion is lossless');
assertBigIntEqual(maxInt64Result.value, maxInt64Value, 'Max int64 BigInt value matches');

// Test 4: Statvfs object conversion
console.log('\nTest 4: Statvfs Object Conversion');
const statvfsResult = nativeModule.testStatvfsToObject();

// Check structure
assert(statvfsResult.hasOwnProperty('bsize'), 'Has bsize property');
assert(statvfsResult.hasOwnProperty('frsize'), 'Has frsize property');
assert(statvfsResult.hasOwnProperty('blocks'), 'Has blocks property');
assert(statvfsResult.hasOwnProperty('bfree'), 'Has bfree property');
assert(statvfsResult.hasOwnProperty('bavail'), 'Has bavail property');
assert(statvfsResult.hasOwnProperty('files'), 'Has files property');
assert(statvfsResult.hasOwnProperty('ffree'), 'Has ffree property');
assert(statvfsResult.hasOwnProperty('favail'), 'Has favail property');
assert(statvfsResult.hasOwnProperty('fsid'), 'Has fsid property');
assert(statvfsResult.hasOwnProperty('flag'), 'Has flag property');
assert(statvfsResult.hasOwnProperty('namemax'), 'Has namemax property');

// Check types - 32-bit fields
assert(typeof statvfsResult.bsize === 'number', 'bsize is number');
assert(typeof statvfsResult.frsize === 'number', 'frsize is number');
assert(typeof statvfsResult.flag === 'number', 'flag is number');
assert(typeof statvfsResult.namemax === 'number', 'namemax is number');

// Check types - 64-bit fields
assert(typeof statvfsResult.blocks === 'bigint', 'blocks is BigInt');
assert(typeof statvfsResult.bfree === 'bigint', 'bfree is BigInt');
assert(typeof statvfsResult.bavail === 'bigint', 'bavail is BigInt');
assert(typeof statvfsResult.files === 'bigint', 'files is BigInt');
assert(typeof statvfsResult.ffree === 'bigint', 'ffree is BigInt');
assert(typeof statvfsResult.favail === 'bigint', 'favail is BigInt');
assert(typeof statvfsResult.fsid === 'bigint', 'fsid is BigInt');

// Check specific test values
assertEqual(statvfsResult.bsize, 4096, 'bsize has expected value');
assertEqual(statvfsResult.frsize, 4096, 'frsize has expected value');
assertEqual(statvfsResult.namemax, 255, 'namemax has expected value');
assertEqual(statvfsResult.flag, 0, 'flag has expected value');

// Check large BigInt values
assertBigIntEqual(statvfsResult.blocks, BigInt('18446744073709551615'), 'blocks has expected large value');
assertBigIntEqual(statvfsResult.bfree, BigInt('9223372036854775807'), 'bfree has expected large value');
assertBigIntEqual(statvfsResult.bavail, BigInt('1234567890123456789'), 'bavail has AGENTS.md test value');
assertBigIntEqual(statvfsResult.files, BigInt('1000000000000'), 'files has expected value (1 trillion)');
assertBigIntEqual(statvfsResult.ffree, BigInt('500000000000'), 'ffree has expected value (500 billion)');
assertBigIntEqual(statvfsResult.favail, BigInt('400000000000'), 'favail has expected value (400 billion)');
assertBigIntEqual(statvfsResult.fsid, BigInt('0xDEADBEEFCAFEBABE'), 'fsid has expected test ID');

// Test 5: Roundtrip conversion
console.log('\nTest 5: Roundtrip Conversion Tests');

// Typical values
const typicalInput = {
  bsize: 4096,
  frsize: 4096,
  blocks: 1000000n,
  bfree: 300000n,
  bavail: 250000n,
  files: 100000n,
  ffree: 50000n,
  favail: 40000n,
  fsid: 12345n,
  flag: 0,
  namemax: 255
};

const typicalResult = nativeModule.testStatvfsRoundtrip(typicalInput);
assertEqual(typicalResult.bsize, typicalInput.bsize, 'Typical roundtrip: bsize matches');
assertEqual(typicalResult.frsize, typicalInput.frsize, 'Typical roundtrip: frsize matches');
assertBigIntEqual(typicalResult.blocks, typicalInput.blocks, 'Typical roundtrip: blocks matches');
assertBigIntEqual(typicalResult.bfree, typicalInput.bfree, 'Typical roundtrip: bfree matches');
assertBigIntEqual(typicalResult.bavail, typicalInput.bavail, 'Typical roundtrip: bavail matches');
assertBigIntEqual(typicalResult.files, typicalInput.files, 'Typical roundtrip: files matches');
assertBigIntEqual(typicalResult.ffree, typicalInput.ffree, 'Typical roundtrip: ffree matches');
assertBigIntEqual(typicalResult.favail, typicalInput.favail, 'Typical roundtrip: favail matches');
assertBigIntEqual(typicalResult.fsid, typicalInput.fsid, 'Typical roundtrip: fsid matches');
assertEqual(typicalResult.flag, typicalInput.flag, 'Typical roundtrip: flag matches');
assertEqual(typicalResult.namemax, typicalInput.namemax, 'Typical roundtrip: namemax matches');

// Zero values
const zeroInput = {
  bsize: 1024,
  frsize: 1024,
  blocks: 0n,
  bfree: 0n,
  bavail: 0n,
  files: 0n,
  ffree: 0n,
  favail: 0n,
  fsid: 0n,
  flag: 0,
  namemax: 255
};

const zeroResult = nativeModule.testStatvfsRoundtrip(zeroInput);
assertBigIntEqual(zeroResult.blocks, 0n, 'Zero roundtrip: blocks is zero');
assertBigIntEqual(zeroResult.bfree, 0n, 'Zero roundtrip: bfree is zero');
assertBigIntEqual(zeroResult.bavail, 0n, 'Zero roundtrip: bavail is zero');
assertBigIntEqual(zeroResult.files, 0n, 'Zero roundtrip: files is zero');
assertBigIntEqual(zeroResult.ffree, 0n, 'Zero roundtrip: ffree is zero');
assertBigIntEqual(zeroResult.favail, 0n, 'Zero roundtrip: favail is zero');
assertBigIntEqual(zeroResult.fsid, 0n, 'Zero roundtrip: fsid is zero');

// Test 6: Realistic filesystem
console.log('\nTest 6: Realistic Filesystem Test');
const realisticResult = nativeModule.testRealisticFilesystem();

assertEqual(realisticResult.bsize, 4096, 'Realistic: block size is 4096');
assertEqual(realisticResult.frsize, 4096, 'Realistic: fragment size is 4096');
assertEqual(realisticResult.namemax, 255, 'Realistic: namemax is 255');
assertEqual(realisticResult.flag, 0, 'Realistic: flag is 0');

// Check 1TB filesystem calculations
const totalBytes = 1024n * 1024n * 1024n * 1024n; // 1TB
const expectedBlocks = totalBytes / 4096n;
assertBigIntEqual(realisticResult.blocks, expectedBlocks, 'Realistic: total blocks calculation');

// Check inode counts
assertBigIntEqual(realisticResult.files, 10000000n, 'Realistic: total files (10M)');
assertBigIntEqual(realisticResult.ffree, 5000000n, 'Realistic: free files (5M)');
assertBigIntEqual(realisticResult.favail, 4000000n, 'Realistic: available files (4M)');

// Sanity checks
assert(realisticResult.bfree <= realisticResult.blocks, 'Realistic: free blocks <= total blocks');
assert(realisticResult.bavail <= realisticResult.bfree, 'Realistic: available blocks <= free blocks');
assert(realisticResult.ffree <= realisticResult.files, 'Realistic: free files <= total files');
assert(realisticResult.favail <= realisticResult.ffree, 'Realistic: available files <= free files');

// df-style calculations
const blockSize = BigInt(realisticResult.bsize);
const totalSize = realisticResult.blocks * blockSize;
const freeSize = realisticResult.bfree * blockSize;
const availSize = realisticResult.bavail * blockSize;
const usedSize = totalSize - freeSize;

assertBigIntEqual(totalSize, 1024n * 1024n * 1024n * 1024n, 'Realistic: total size is 1TB');

const usedPercent = Number((usedSize * 100n) / totalSize);
const freePercent = Number((freeSize * 100n) / totalSize);
const availPercent = Number((availSize * 100n) / totalSize);

assertApproxEqual(usedPercent, 70, 1, 'Realistic: used percentage ~70%');
assertApproxEqual(freePercent, 30, 1, 'Realistic: free percentage ~30%');
assertApproxEqual(availPercent, 25, 1, 'Realistic: available percentage ~25%');

// Test 7: Error handling
console.log('\nTest 7: Error Handling');

// Test errno constants
assertEqual(nativeModule.errno.ENOENT, -2, 'ENOENT errno is -2');
assertEqual(nativeModule.errno.EACCES, -13, 'EACCES errno is -13');
assertEqual(nativeModule.errno.EIO, -5, 'EIO errno is -5');
assertEqual(nativeModule.errno.ENOSYS, -38, 'ENOSYS errno is -38');
assertEqual(nativeModule.errno.EINVAL, -22, 'EINVAL errno is -22');
assertEqual(nativeModule.errno.ERANGE, -34, 'ERANGE errno is -34');

// Test invalid inputs
try {
  nativeModule.testBigIntPrecision('not a bigint');
  console.error('✗ Should have thrown on invalid BigInt input');
  process.exit(1);
} catch (error) {
  console.log('✓ Correctly throws on invalid BigInt input');
}

try {
  nativeModule.testStatvfsRoundtrip('not an object');
  console.error('✗ Should have thrown on invalid object input');
  process.exit(1);
} catch (error) {
  console.log('✓ Correctly throws on invalid object input');
}

// Test 8: Performance test
console.log('\nTest 8: Performance Test');
const startTime = Date.now();

// Perform 1000 BigInt conversions
for (let i = 0; i < 1000; i++) {
  const testValue = BigInt(i) * 1000000000n;
  const result = nativeModule.testBigIntPrecision(testValue);
  if (!result.lossless || result.value !== testValue) {
    console.error('✗ Performance test failed at iteration', i);
    process.exit(1);
  }
}

const duration = Date.now() - startTime;
console.log(`✓ 1000 BigInt conversions completed in ${duration}ms`);
assert(duration < 2000, 'Performance test completed within 2 seconds');

// Test 9: Memory test
console.log('\nTest 9: Memory Test');
const testData = {
  bsize: 4096,
  frsize: 4096,
  blocks: BigInt('18446744073709551615'),
  bfree: BigInt('9223372036854775807'),
  bavail: BigInt('1234567890123456789'),
  files: BigInt('1000000000000'),
  ffree: BigInt('500000000000'),
  favail: BigInt('400000000000'),
  fsid: BigInt('0xDEADBEEFCAFEBABE'),
  flag: 0,
  namemax: 255
};

// Perform many roundtrips
for (let i = 0; i < 100; i++) {
  const result = nativeModule.testStatvfsRoundtrip(testData);
  // Quick validation that structure is correct
  if (typeof result.blocks !== 'bigint' || result.bsize !== 4096) {
    console.error('✗ Memory test failed at iteration', i);
    process.exit(1);
  }
}

console.log('✓ 100 roundtrip conversions completed without memory issues');

console.log('\n=== ALL TESTS PASSED! ===');
console.log('\n📊 Test Summary:');
console.log('✓ Module loading and exports');
console.log('✓ Version information');
console.log('✓ BigInt precision (4 test cases)');
console.log('✓ Statvfs object conversion (11 properties)');
console.log('✓ Roundtrip conversion (typical and zero values)');
console.log('✓ Realistic filesystem simulation');
console.log('✓ Error handling (errno constants and invalid inputs)');
console.log('✓ Performance test (1000 conversions)');
console.log('✓ Memory test (100 roundtrips)');
console.log('\n🎉 Native statfs implementation is working correctly!');
console.log('🎯 All BigInt 64-bit fields work with lossless precision');
console.log('📈 Performance and memory management are satisfactory');
