// ESM binding loader
let binding = null;

function loadBinding() {
  if (binding) return binding;

  try {
    const { createRequire } = require('module');
    const req = createRequire(import.meta.url);
    binding = req('../build/Release/fuse-native.node');
  } catch (error) {
    try {
      const { createRequire } = require('module');
      const req = createRequire(import.meta.url);
      binding = req('../build/Debug/fuse-native.node');
    } catch (error2) {
      console.warn('Failed to load native binding:', error.message);
      binding = {};
    }
  }

  return binding;
}

export default loadBinding();