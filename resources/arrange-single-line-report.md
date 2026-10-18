# Auto-Arrange single-line DrawGrids

The development bar exchanged two half-motifs as two separate cropped strokes. Generated chunks now join their contour fragments into one continuous stroke, retaining the seam connection and every note. Fresh generated supporting DrawGrids use the same normalization. Authored input drawings are retained, including legacy drawings with multiple strokes; harmony and motif note choices are unchanged.

Validation: 25 targeted tests pass. Thirty deterministic seeds each produce one stroke per generated phrase chunk. Coverage also checks the development seam, unchanged source state and note lists, and preservation of authored multi-stroke input.

Browser check: arranging a Simple Rhythm input generated melody and accompaniment normally. All twelve visible DrawGrid views reported exactly one stroke, including the development chunk and linked uses. No app errors were captured.
