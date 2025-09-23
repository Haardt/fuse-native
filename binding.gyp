{
  "targets": [
    {
      "target_name": "fuse-native",
      "sources": [
        "src/main.cc",
        "src/napi_bigint.cc",
        "src/napi_helpers.cc",
        "src/errno_mapping.cc",
        "src/timespec_codec.cc",
        "src/operations.cc",
        "src/fuse_bridge.cc",
        "src/statfs_bridge.cc",
        "src/session_manager.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "<!@(pkg-config --cflags-only-I fuse3 | sed 's/-I//g')"
      ],
      "libraries": [
        "<!@(pkg-config --libs fuse3)"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "cflags": [
        "<!@(pkg-config --cflags fuse3)"
      ],
      "cflags_cc": [
        "-std=c++17",
        "-fexceptions",
        "-Wall",
        "-Wextra",
        "-Wno-unused-parameter",
        "-Wno-missing-field-initializers"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "NODE_ADDON_API_DISABLE_DEPRECATED",
        "NAPI_VERSION=8",
        "FUSE_USE_VERSION=31"
      ],
      "conditions": [
        [
          "OS=='linux'",
          {
            "cflags_cc": [
              "-pthread"
            ],
            "libraries": [
              "-pthread"
            ]
          }
        ]
      ]
    }
  ]
}
