# Local hardening and storage changes

Storage version 4 preserves valid summary history while discarding malformed
records, unknown fields and legacy `fullText` fields. It does not enable agreement
text retention. Existing provider settings remain in local extension storage.

Monitoring now offers a per-domain **Save agreement text on this device for text
comparisons** checkbox. It starts off. Enabling it applies to subsequent analyses;
reanalyzing unchanged terms can save the current text without inventing a new
version. Disabling it removes that domain's saved agreement text and preserves
its summaries and version fingerprints. The preference and agreement snapshots
use local extension storage, never browser sync storage. Preference changes are
accepted from the extension UI rather than website content scripts.

Optional agreement text is capped at 2 MiB of serialized UTF-8 text across all
domains, with older text removed first. The existing limits of ten versions per
domain and 200 tracked domains still apply. A saved text fingerprint must match
before the text is displayed or exported. Versions without saved text continue
to show summaries; their original text cannot be reconstructed from a fingerprint.

History compares two saved agreements when both texts are available. Replacements
show the original and new text with their line numbers; additions and removals
are labeled. All source and model text is rendered literally. Comparisons have
a 250 ms computation budget and an edit-distance limit; oversized comparisons
show an explicit limit message. Large results display 100 sections at a time,
with a button to show the next sections. JSON export includes any agreement text
the user chose to save. History remains grouped by hostname, so different
agreements on one hostname can appear as successive versions.

Summary cache identity now includes the provider connection, model, language,
prompt and processing configuration. Only its fingerprint is added to cache
entries. Old cache entries remain removable but cannot satisfy a current analysis
without the matching context. A single provider/language snapshot is used for
all chunks, their merge and retries in one analysis.

Other changes preserve legal text during extraction, package the matching PDF
worker, reject incomplete extraction/summary results, bound downloads and provider
responses, serialize background storage writes, and cancel superseded/closed-tab
work. Browser builds select the actual background entry independently of the
content script's identical filename.

Linked documents are downloaded once with their original bytes, response type,
encoding and final URL. This supports extensionless/redirected PDFs and avoids
corrupting declared legacy-encoded currency or company names. Plain-text legal
placeholders remain literal; malformed text and unsupported document types fail
extraction. The encoding unit tests use a pinned independent WHATWG decoder to
match browser behavior on the configured Node 20 runtime; browser tests use the
native browser decoder.

Firefox parses downloaded PDF bytes in its extension background document to avoid
content-script stream permission errors; Chromium continues parsing in the content
context. The internal byte message cannot fetch URLs or save agreement text. Both
paths enforce the 8 MiB download, 200-page, 500,000-character and 30-second parsing
limits, with a separate 35-second response deadline for Firefox.

Packaging writes a fresh archive and replaces the previous artifact only after
success, so removed files cannot survive from an older build. The internal Vite
manifest uses a stable virtual-module key to keep builds reproducible across
checkout directory depths. Module preloads are disabled because content-script
preload links would resolve against the visited website; native module imports
continue loading packaged extension assets.

Consent action matching uses complete words rather than substrings such as
"accept" inside "Acceptable Use". Hidden dialogs and navigation controls cannot
qualify a sticky sidebar as a consent banner. A live GitHub terms check reproduced
the wrong-document selection before this fix and verifies the main terms after it.

The bounded load run completed all correctness checks within the 1 GiB physical
footprint guard, but exceeded its separate 1 GiB summed-process-RSS diagnostic.
That failed assertion is retained in the evidence; no general memory or production
readiness guarantee is made.

Reproducible local evidence is maintained separately in
`../legal-tech-hardening/goodman/`. Its matrices distinguish actual installed
browser checks, synthetic model responses, unit mocks, unavailable integrations
and remaining work. No cloud inference, publishing or deployment was performed.
