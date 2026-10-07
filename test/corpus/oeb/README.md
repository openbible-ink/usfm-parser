# Open English Bible corpus

This directory contains the source corpus from the Open English Bible project,
used for parser integration and compatibility testing.

- Upstream: https://github.com/openenglishbible/Open-English-Bible
- Upstream path: `source/`
- Revision: `1965127de5c3c103af3fdbc9288c1abec5f39994`
- Retrieved: 2026-10-07
- Licence: CC0 1.0 Universal (see `LICENSE`)

The corpus contains 60 `.usfm.db` source files plus the upstream `tags.db`.
The source files contain UTF-8 USFM text with
a lightweight OEB-specific variation syntax. They are reference inputs and
must not be edited to make parser tests pass.
