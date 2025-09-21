{
  "targets": [{
    "target_name": "fuse",
    'variables': {
                    'fuse__library_dirs%': '',
                    'fuse__libraries%': '<!(sh -c "pkg-config --libs-only-L --libs-only-l fuse3 2>/dev/null || pkg-config --libs-only-L --libs-only-l fuse")',
                    'fuse__defines%': '<!(sh -c "pkg-config fuse3 --modversion >/dev/null 2>&1 && echo FUSE_NATIVE_USE_FUSE3=1")',
                    'fuse__cflags%': '<!(pkg-config fuse3 --cflags 2>/dev/null || pkg-config fuse --cflags)'
                },
    "include_dirs": [
      "<!(node -e \"require('napi-macros')\")",
    ],
    'defines': [
      '<@(fuse__defines)'
    ],
    'library_dirs': [
                  '<@(fuse__library_dirs)',
    ],
    "link_settings": {
        "libraries": ["<@(fuse__libraries)"]},
    "libraries": [],
    "sources": [
      "fuse-native.c"
    ],
    'xcode_settings': {
      'OTHER_CFLAGS': [
        '-g',
        '-O3',
        '-Wall'
      ]
    },
    'cflags': [
      '-g',
      '-O3',
      '-Wall',
      '<@(fuse__cflags)'
    ],
  }, {
    "target_name": "postinstall",
    "type": "none",
    "dependencies": ["fuse"],
    "copies": [{
      "destination": "build/Release",
      "files": [  ],
    }]
  }]
}
