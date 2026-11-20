# track/

| File | What it is | Rule |
|---|---|---|
| `original/track.pdf` | The PDF handed out by the organisers (15 raster slides, no extractable text). SHA-256 `ac8656124671b2a284e2a32dd8ef869460d3d6694acc33156201083512d52362` | Do not modify |
| `slides/slide-01.jpg … slide-15.jpg` | The native images (2046×1151) extracted without recompression with `pdfimages -j` | Do not modify. **They are authoritative.** |
| `TRACK.md` | Faithful slide-by-slide transcription, with descriptions of figures and layout and a redrawing of the slide 9 diagram | No interpretation |
| `track.json` | The same content in structured form | Generated from `TRACK.md`; if they differ, `TRACK.md` prevails |
| `REQUIREMENTS.md` | Requirements, rules, criteria with ID and source; facts separated from interpretations; official event rules | Interpretive layer |
| `reference/apple-reference-image.md` | Technical notes on the official reference cited on slide 12, with slide ↔ blog differences | The original is in the local cache |

An agent with vision capabilities should look at all the images at least once, in particular
slide 9 (lane diagram), and report any difference from the transcription.
