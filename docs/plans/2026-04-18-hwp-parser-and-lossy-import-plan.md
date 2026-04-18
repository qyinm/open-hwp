# HWP Parser and Lossy HWP→HWPX Import Implementation Plan

> For Hermes: Use subagent-driven-development skill to implement this plan task-by-task.

Goal: Build an official-spec-based HWP 5.0 read path for OpenHWP, starting with text extraction and a lossy HWP→HWPX importer that produces readable HWPX drafts rather than layout-perfect conversions.

Architecture: Keep the current HWPX editing core unchanged. Add a new HWP read stack under `engines/openhwp-zig/src/hwp_*` that parses OLE compound storage, inflates compressed body streams, decodes HWP 5.0 paragraph/text records, and emits a normalized intermediate document model. Then add a separate lossy importer that writes a minimal valid HWPX document from that model.

Tech Stack: Zig 0.15, stdlib filesystem/process/compression support, official Hancom HWP 5.0 PDF spec, existing OpenHWP HWPX code, TDD with `zig test`.

References:
- Official spec downloaded locally:
  - `.tmp_hancom_spec/hwp5.pdf`
  - `.tmp_hancom_spec/hwp30_hwpml.pdf`
- Current insertion points:
  - `engines/openhwp-zig/src/hwp.zig`
  - `engines/openhwp-zig/src/convert.zig`
  - `engines/openhwp-zig/src/main.zig`
  - `engines/openhwp-zig/src/hwpx.zig`
  - `engines/openhwp-zig/src/xml_tools.zig`

Non-goals for this phase:
- No full-fidelity layout preservation
- No direct HWP in-place editing/writing
- No table/shape/image parity in first pass
- No replacement of external converter path yet
- No support for distributed/DRM HWP variants in phase 1

Success criteria:
1. `openhwp text file.hwp` returns readable body text for a defined subset of HWP 5.0 samples.
2. `openhwp convert file.hwp --output out.hwpx` can produce a minimal readable HWPX without external converter for supported simple documents.
3. Unsupported/unknown records fail loudly with named errors and regression tests.

---

## System Audit Summary

Current state:
- `src/hwp.zig` is a stub that returns `error.UnsupportedLegacyFormat`.
- `src/convert.zig` routes `.hwp` conversion to an external executable.
- `src/hwpx.zig` and `src/xml_tools.zig` already provide a stable HWPX-side text extraction and replacement core.
- No reusable internal intermediate document model exists yet.

Best reuse opportunities:
- Reuse `formats.zig` for dispatch only.
- Reuse `hwpx.zig` packaging patterns and `xml_tools.zig` escaping/text routines where possible.
- Reuse `utils.zig` absolute-path and command helpers, but keep HWP parsing in pure Zig.

Main risk areas:
- Compound File/OLE parsing correctness
- Compression boundaries in HWP body streams
- Record decoding ambiguity and unsupported control records
- Scope creep into style/layout fidelity too early

---

## Proposed file layout

Create:
- `engines/openhwp-zig/src/hwp_model.zig`
- `engines/openhwp-zig/src/hwp_errors.zig`
- `engines/openhwp-zig/src/hwp_ole.zig`
- `engines/openhwp-zig/src/hwp_streams.zig`
- `engines/openhwp-zig/src/hwp_records.zig`
- `engines/openhwp-zig/src/hwp_text.zig`
- `engines/openhwp-zig/src/hwp_to_hwpx.zig`
- `engines/openhwp-zig/tests/fixtures/simple-paragraph.expected.txt`
- `engines/openhwp-zig/tests/fixtures/simple-import.expected.hwpx.txt` (text snapshot/specimen, not binary golden)

Modify:
- `engines/openhwp-zig/src/hwp.zig`
- `engines/openhwp-zig/src/convert.zig`
- `engines/openhwp-zig/src/main.zig`
- `engines/openhwp-zig/build.zig`
- `engines/openhwp-zig/README.md`

Optional later:
- `engines/openhwp-zig/tests/fixtures/*.hwp` additional curated samples

---

## Design decisions locked in now

1. HWP direct writing is out of scope. We only read HWP and generate new HWPX.
2. The first conversion target is lossy semantic import, not fidelity conversion.
3. The internal canonical model is paragraph/text-run oriented, not style-perfect.
4. Unknown record/control types must produce explicit warnings/errors, not silent skipping by default.
5. The external converter remains as fallback until the internal importer reaches a useful threshold.

---

## Intermediate model

Use one canonical internal model for HWP read and HWPX write:

```zig
pub const Document = struct {
    paragraphs: []Paragraph,
};

pub const Paragraph = struct {
    runs: []Run,
};

pub const Run = struct {
    text: []const u8,
    break_kind: BreakKind = .none,
};

pub const BreakKind = enum {
    none,
    line,
    paragraph,
};
```

Phase 1 deliberately excludes:
- precise char shape ids
- paragraph shape ids
- table cell geometry
- floating objects
- OLE embedded object rendering

This keeps the model small enough to ship.

---

## Error policy

Every new failure mode gets a name.

Initial named error groups:
- `InvalidOleHeader`
- `MissingFileHeaderStream`
- `MissingDocInfoStream`
- `MissingBodyTextStorage`
- `UnsupportedCompressionMode`
- `InvalidRecordHeader`
- `UnsupportedRecordTag`
- `UnexpectedEndOfStream`
- `UnsupportedControl`
- `UnsupportedDistributionDocument`
- `UnsupportedEncryptedDocument`
- `UnsupportedLegacyVariant`

CLI/user-facing messages must explain whether this is:
- a corrupted document
- a not-yet-supported feature
- an encrypted/distribution-only file

No generic `UnsupportedLegacyFormat` once parser exists.

---

## Test strategy

We are not building this without tests.

Test layers:
1. Unit tests
   - OLE header and directory parsing
   - stream lookup
   - zlib decompression decisions
   - record header parsing
   - UTF-16LE decoding
2. Integration tests
   - extract text from known simple HWP fixture
   - convert simple HWP into minimal HWPX and then run existing HWPX text extraction on the result
3. Regression tests
   - unsupported encrypted/distribution document returns named error
   - unknown control record returns named error or warning policy outcome
4. Golden-like checks
   - compare extracted plain text against expected `.txt`
   - compare generated HWPX extracted text against expected `.txt`

Verification command target by end of project:
```bash
cd engines/openhwp-zig
zig test src/hwp_ole.zig
zig test src/hwp_records.zig
zig test src/hwp_text.zig
zig test src/convert.zig
zig build test
```

---

## Implementation tasks

### Task 1: Add official-spec note and parser scope comment in `src/hwp.zig`

Objective: Mark `hwp.zig` as the entry point for HWP 5.0 parser work and document the deliberate lossy-import scope.

Files:
- Modify: `engines/openhwp-zig/src/hwp.zig`
- Test: none yet

Step 1: Replace stub-only file header with module comments describing:
- HWP 5.0 spec basis
- read-only parser first
- lossy HWPX import target

Step 2: Keep existing behavior unchanged for now.

Step 3: Commit
```bash
git add engines/openhwp-zig/src/hwp.zig
git commit -m "docs: annotate hwp parser scope"
```

### Task 2: Add `build.zig` test step

Objective: Make `zig build test` a real command before deeper work starts.

Files:
- Modify: `engines/openhwp-zig/build.zig`

Step 1: Write failing expectation by running:
```bash
cd engines/openhwp-zig
zig build test
```
Expected: fail because no step named `test`.

Step 2: Add a `test` build step covering current root module tests.

Step 3: Re-run:
```bash
zig build test
```
Expected: pass or at least execute test compilation instead of missing-step failure.

Step 4: Commit
```bash
git add engines/openhwp-zig/build.zig
git commit -m "build: add zig test step"
```

### Task 3: Create shared HWP error module

Objective: Stop encoding all HWP parser failures as one generic error.

Files:
- Create: `engines/openhwp-zig/src/hwp_errors.zig`
- Modify: `engines/openhwp-zig/src/hwp.zig`

Step 1: Write failing test in `hwp_errors.zig` that imports the error set and asserts named members exist.

Step 2: Run:
```bash
zig test src/hwp_errors.zig
```
Expected: fail until error set is created.

Step 3: Implement the shared error set.

Step 4: Re-run test and make it pass.

Step 5: Commit
```bash
git add engines/openhwp-zig/src/hwp_errors.zig engines/openhwp-zig/src/hwp.zig
git commit -m "feat: add named hwp parser errors"
```

### Task 4: Create internal document model

Objective: Introduce the minimal paragraph/run model used by both HWP text extraction and HWPX writing.

Files:
- Create: `engines/openhwp-zig/src/hwp_model.zig`

Step 1: Write failing tests asserting a document with one paragraph and one run can be created and iterated.

Step 2: Implement `Document`, `Paragraph`, `Run`, `BreakKind`.

Step 3: Keep it small. No style fields yet.

Step 4: Commit
```bash
git add engines/openhwp-zig/src/hwp_model.zig
git commit -m "feat: add minimal hwp intermediate model"
```

### Task 5: Implement OLE header detection

Objective: Parse enough of Compound File to verify a file is an HWP 5.0 OLE container.

Files:
- Create: `engines/openhwp-zig/src/hwp_ole.zig`
- Test: same file

Step 1: Write failing tests for:
- invalid OLE signature rejected
- valid-like header accepted

Step 2: Implement minimal header reader.

Step 3: Re-run tests.

Step 4: Commit
```bash
git add engines/openhwp-zig/src/hwp_ole.zig
git commit -m "feat: parse ole header for hwp files"
```

### Task 6: Implement OLE directory + stream lookup

Objective: Resolve named streams/storage paths required by HWP 5.0.

Files:
- Modify: `engines/openhwp-zig/src/hwp_ole.zig`

Step 1: Write failing tests for lookup of representative names:
- `FileHeader`
- `DocInfo`
- `BodyText/Section0`

Step 2: Implement directory parsing and stream lookup.

Step 3: Re-run tests.

Step 4: Commit
```bash
git add engines/openhwp-zig/src/hwp_ole.zig
git commit -m "feat: add hwp ole stream lookup"
```

### Task 7: Implement HWP stream loading and decompression rules

Objective: Load raw stream bytes and apply documented compression handling.

Files:
- Create: `engines/openhwp-zig/src/hwp_streams.zig`
- Modify: `engines/openhwp-zig/src/hwp_ole.zig`

Step 1: Write failing tests for:
- uncompressed pass-through
- compressed body stream inflate
- invalid compressed payload returns named error

Step 2: Implement stream loading API.

Step 3: Re-run tests.

Step 4: Commit
```bash
git add engines/openhwp-zig/src/hwp_streams.zig engines/openhwp-zig/src/hwp_ole.zig
git commit -m "feat: load and decompress hwp streams"
```

### Task 8: Implement record header parser

Objective: Decode HWP 5.0 record boundaries before parsing content.

Files:
- Create: `engines/openhwp-zig/src/hwp_records.zig`

Step 1: Write failing tests for record header decode, including short and malformed buffers.

Step 2: Implement record header parsing according to official spec.

Step 3: Re-run tests.

Step 4: Commit
```bash
git add engines/openhwp-zig/src/hwp_records.zig
git commit -m "feat: parse hwp record headers"
```

### Task 9: Implement paragraph/text record decoding only

Objective: Extract plain text paragraphs from BodyText without handling every control.

Files:
- Create: `engines/openhwp-zig/src/hwp_text.zig`
- Modify: `engines/openhwp-zig/src/hwp_model.zig`

Step 1: Write failing tests for:
- UTF-16LE text decoding
- paragraph split handling
- skipping/flagging non-text control runs

Step 2: Implement minimal reader for:
- paragraph header
- paragraph text
- paragraph break insertion

Step 3: Re-run tests.

Step 4: Commit
```bash
git add engines/openhwp-zig/src/hwp_text.zig engines/openhwp-zig/src/hwp_model.zig
git commit -m "feat: decode hwp paragraph text records"
```

### Task 10: Wire `hwp.extractText()` to the new parser

Objective: Replace the legacy-format stub with real text extraction.

Files:
- Modify: `engines/openhwp-zig/src/hwp.zig`
- Modify: `engines/openhwp-zig/src/main.zig`

Step 1: Write failing integration test using a simple HWP fixture and expected extracted text.

Step 2: Implement `hwp.extractText()` using:
- ole open
- stream load
- body section iteration
- text model flattening

Step 3: Re-run the targeted test.

Step 4: Run broader regression:
```bash
cd engines/openhwp-zig
zig test src/hwp.zig
zig test src/main.zig
```

Step 5: Commit
```bash
git add engines/openhwp-zig/src/hwp.zig engines/openhwp-zig/src/main.zig
git commit -m "feat: support hwp text extraction"
```

### Task 11: Add lossy HWP→HWPX writer

Objective: Generate a minimal valid HWPX document from the internal paragraph/run model.

Files:
- Create: `engines/openhwp-zig/src/hwp_to_hwpx.zig`
- Modify: `engines/openhwp-zig/src/convert.zig`

Step 1: Write failing tests for:
- one paragraph -> valid HWPX zip with required files
- generated HWPX text can be extracted by existing `hwpx.extractText`

Step 2: Implement a minimal HWPX package writer using existing HWPX conventions.

Step 3: Limit scope to plain paragraphs and inline text only.

Step 4: Re-run tests.

Step 5: Commit
```bash
git add engines/openhwp-zig/src/hwp_to_hwpx.zig engines/openhwp-zig/src/convert.zig
git commit -m "feat: add lossy hwp to hwpx import"
```

### Task 12: Add dual conversion strategy in `convert.zig`

Objective: Keep external converter fallback while enabling internal conversion for supported simple files.

Files:
- Modify: `engines/openhwp-zig/src/convert.zig`

Step 1: Write failing tests for strategy order:
- internal parser path succeeds on simple supported fixture
- external converter still used when internal conversion is disabled or unsupported
- named error when both fail

Step 2: Implement strategy:
- try internal lossy import first for supported HWP
- if parser returns explicit `Unsupported*` capability error, optionally fall back to external converter
- do not silently swallow corruption errors

Step 3: Re-run tests.

Step 4: Commit
```bash
git add engines/openhwp-zig/src/convert.zig
git commit -m "feat: add internal hwp import before external fallback"
```

### Task 13: Add CLI messaging for supported vs unsupported HWP cases

Objective: Make user-facing failures actionable.

Files:
- Modify: `engines/openhwp-zig/src/main.zig`

Step 1: Add explicit error mapping for:
- unsupported encrypted/distribution docs
- unsupported control-heavy files
- corrupted OLE/container

Step 2: Re-run targeted tests and manual command checks.

Step 3: Commit
```bash
git add engines/openhwp-zig/src/main.zig
git commit -m "feat: improve hwp parser error messages"
```

### Task 14: Add fixture suite and expected outputs

Objective: Make progress measurable on real samples.

Files:
- Create/Modify: `engines/openhwp-zig/tests/fixtures/*`

Needed fixture categories:
- simple paragraph-only HWP
- multi-paragraph plain text HWP
- HWP with table (expected unsupported or lossy degradation)
- HWP with image/object (expected unsupported or omission)
- distribution/encrypted sample if available

Each fixture needs:
- provenance note
- expected result class: success / lossy success / unsupported / corrupted

Step 1: Add README-style note in fixtures folder if needed.
Step 2: Add expected `.txt` outputs for success cases.
Step 3: Commit
```bash
git add engines/openhwp-zig/tests/fixtures
git commit -m "test: add hwp parser fixtures and expectations"
```

### Task 15: Update docs and command contract

Objective: Document the new internal HWP parser honestly.

Files:
- Modify: `engines/openhwp-zig/README.md`
- Modify: `README.md`
- Modify: `contracts/engine-interface-v1.md`

Required doc changes:
- distinguish internal lossy import vs external converter fallback
- define supported HWP subset explicitly
- list unsupported features clearly
- explain that output HWPX may be semantic, not fidelity-preserving

Step 1: Update docs.
Step 2: Verify docs match actual behavior.
Step 3: Commit
```bash
git add engines/openhwp-zig/README.md README.md contracts/engine-interface-v1.md
git commit -m "docs: describe internal hwp parser and lossy import"
```

---

## ASCII architecture

```text
        .hwp file
           |
           v
   +----------------+
   | hwp_ole.zig    |  Compound File / stream lookup
   +----------------+
           |
           v
   +----------------+
   | hwp_streams.zig|  decompress / body stream load
   +----------------+
           |
           v
   +----------------+
   | hwp_records.zig|  record header iteration
   +----------------+
           |
           v
   +----------------+
   | hwp_text.zig   |  paragraph/text decode
   +----------------+
           |
           v
   +----------------+
   | hwp_model.zig  |  normalized paragraph/run model
   +----------------+
        |         |
        |         +--------------------+
        |                              |
        v                              v
  `openhwp text`               hwp_to_hwpx.zig
                                      |
                                      v
                                 minimal .hwpx
```

## Failure-mode registry (initial)

```text
CODEPATH                | FAILURE MODE                     | USER SEES
------------------------|----------------------------------|-------------------------------
OLE open                | invalid compound header          | corrupted/unsupported HWP
Stream lookup           | FileHeader missing               | malformed HWP
BodyText load           | Section0 missing                 | unsupported/malformed HWP
Decompression           | invalid zlib payload             | corrupted compressed HWP
Record parse            | short/invalid record header      | corrupted HWP record stream
Text decode             | unsupported control sequence     | unsupported HWP feature
Lossy import            | cannot map required structure    | unsupported for internal import
Fallback conversion     | external converter missing       | converter install required
```

## Stop conditions

Pause the whole effort and reassess if any of these happen:
1. Simple paragraph-only HWP cannot be decoded from official-spec implementation within the first parser phase.
2. The internal importer requires style/table/object support before even producing readable drafts.
3. Fixture behavior varies so much across HWP samples that the “simple supported subset” cannot be stated clearly.

## Recommended first milestone

Ship this and stop:
- `openhwp text simple.hwp` works
- `openhwp convert simple.hwp --output out.hwpx` produces readable plain-text HWPX
- complex HWP returns explicit unsupported errors

That milestone is valuable and bounded.

---

## Execution handoff

Plan complete and saved. Ready to execute using subagent-driven-development or direct implementation in strict TDD order.
