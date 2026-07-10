# Popup accessibility and performance pass

Last checked: 2026-07-10.

## Accessibility changes

* Settings tabs expose `tablist`, `tab`, `tabpanel`, `aria-selected`, and arrow-key navigation.
* Analysis progress exposes `progressbar` values, and progress logs expose a polite `log` region.
* History domain selection uses an associated label, and version history items are keyboard-expandable.
* Provider, detection, domain blocklist, cache, and notification controls use explicit group or action labels where visible text is ambiguous.
* Custom interactive cards receive the same visible focus ring as native controls.

## Performance notes

The pass adds DOM attributes and keyboard handlers only. It does not add network I/O, polling, or extra storage reads to the popup render path. Existing bursty paths remain debounced: storage-change refresh is delayed by 300 ms, and provider draft saves are delayed by 400 ms.
