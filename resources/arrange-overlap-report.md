# Arrange overlap fix

Linked DrawGrid views were being laid out before asynchronous state restoration completed. Their temporary dimensions were smaller than the finished editor, so settled copies could overlap. Arrange now waits for its linked views to finish loading, lets the DOM measure their final dimensions, then lays out the graph. Placement animation is committed before Overview snapshots positions. Camera fitting awaits its actual completion instead of a fixed timeout.

Regression coverage: a deliberately delayed linked-view restoration keeps readiness pending until the full editor height is available. Unrelated pending views do not block that arrangement. Existing linked-copy, Auto-Arrange, placement and layout-animation coverage passes: 69 tests.

Browser reproduction: fresh DrawGrid → Arrange originally produced five overlapping toy pairs after zoom. With the fix, all fifteen toy panels settle with zero overlapping pairs, using their full measured editor sizes (DrawGrid 757px high, Rhythm 343px in this QA window). Tested on an isolated QA origin; the normal saved scene was untouched.

Arrange Again and actual browser reload each restored fifteen panels with zero overlaps. Horizontal phrase spacing and the existing section structure remain unchanged.
