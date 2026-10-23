# Finance document fonts

Finance PDFs embed these fonts locally. Rendering must not depend on an external
font service, and financial documents must preserve extended European names.

- **Nunito Regular/Bold:** unchanged files from the repository's installed
  `@expo-google-fonts/nunito` 0.4.2 package. Nunito preserves NexSteps typography.
  License: `OFL.txt`.
- **Noto Sans Regular/Bold:** fallback for glyphs absent from Nunito, including
  Greek names. Unchanged static TrueType files from
  [notofonts/noto-fonts](https://github.com/notofonts/noto-fonts/tree/ffebf8c1ee449e544955a7e813c54f9b73848eac/hinted/ttf/NotoSans),
  pinned to commit `ffebf8c1ee449e544955a7e813c54f9b73848eac`.
  License: `NotoSans-OFL.txt`.

No font package or runtime network request is added. The serverless build must
include the font assets; verify both the PDF regression and staged artifact test
after changing these paths. Existing issued documents are never regenerated as
part of a font update.
