# Notices

The GitHub and LinkedIn link glyphs are `FaGithub` and `FaLinkedin` from
React Icons 5.7.0 (`react-icons/fa6`), embedded as SVG without modification to
their paths. The Font Awesome 6 icons are by Fonticons, Inc., licensed under
CC BY 4.0: https://creativecommons.org/licenses/by/4.0/.
Sources: https://github.com/react-icons/react-icons and
https://fontawesome.com/. React Icons itself is MIT licensed.

The GPC browser adapter in `src/graphics/gpc/decoder.ts` and its synthetic
interoperability fixture derive from XR-Capsules/SplatCompressionCodec revision
833bf7d36ef4b7cd4b64875a4249cec187dd9b41. The upstream experimental codec is
proprietary; no open-source license is granted for that code. The portfolio's
MIT recommendation does not apply to this integration. The encoder source is
kept in an ignored local checkout rather than copied into this repository.

Third-party dependencies retain their own licenses: Three.js, Spark, Vite and
fzstd (MIT), TypeScript (Apache-2.0), NumPy and SciPy (BSD), and Zstandard
(BSD/GPL dual license). Dependencies are installed by package managers.

## Radegast statue in autumn

- Author: Pavel Tanhäuser — https://superspl.at/user/tanha
- Source: https://superspl.at/scene/3b0354d1
- License: Creative Commons Attribution-NonCommercial 4.0
  https://creativecommons.org/licenses/by-nc/4.0/
- Modification: converted from PLY into lossy GPC2 and standard SOG containers,
  retaining the full Gaussian count and SH3 bands. Browser delivery uses Spark's
  additional GPU packing. No endorsement by the author is implied.
- The scene's published initial camera was used as a framing reference.

The source scene's noncommercial restriction remains applicable to the converted
assets. The large GPC and SOG assets are ignored by Git and must be provisioned separately.

SOG encoding uses the MIT-licensed PlayCanvas splat-transform CLI, installed
locally in an ignored tool directory. It is an offline tool, not an additional
website runtime dependency.

The shared-palette experiment and `tests/gpc-fixture-palette.json` also derive
their scene data from this capture and retain the same CC BY-NC attribution.
`scripts/palette-codec.py` is an experimental project extension, not a change to
the upstream codec and not a claim of novel compression techniques.
