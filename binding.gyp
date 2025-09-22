{
  "targets": [{
    "target_name": "fuse",
    'variables': {
                    'fuse__include_dirs%': '<!(pkg-config fuse3 --cflags-only-I | sed s/-I//g)',
                    'fuse__library_dirs%': '',
                    'fuse__libraries%': '<!(pkg-config --libs-only-L --libs-only-l fuse3)'
                },
    "include_dirs": [
      "<!(node -e \"require('napi-macros')\")",
      "<@(fuse__include_dirs)"
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
      '-Wall'
    ],
    'defines': [
      'HAVE_COPY_FILE_RANGE=1'
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
