# Reports

`generated/` is ignored and contains local run evidence. `sample/` contains unchanged
TypeScript HTML and summary files downloaded from the successful CI execution linked in
[sample/provenance.json](sample/provenance.json). Samples identify that historical commit;
they are not represented as output from every subsequent release.

The HTML files are self-contained and can be opened without a server or external assets.
Current CI artifacts also contain JUnit, safe generated NDJSON, container logs and digest.
Generated findings are informational; the separate deterministic and engine statuses matter.
