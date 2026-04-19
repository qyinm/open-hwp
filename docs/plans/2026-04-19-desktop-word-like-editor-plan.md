# Desktop Word-like Editor Workflow Plan

Goal: Reframe OpenHWP Desktop from a thin GUI wrapper around CLI commands into a document-centric editor with a Microsoft Word-like workflow. The desktop app becomes the human-facing product. The CLI remains a low-level automation contract for agents and can later be wrapped as agent skills.

Architecture: Keep the current Zig CLI as the document-processing backend, but stop exposing its verbs directly in the main UI. The desktop app owns document lifecycle orchestration: open, import, in-memory editing session, save, save as, recent files, and document status. Internally it may still call `convert`, `workbench export`, and `workbench apply`, but those steps are hidden behind editor actions.

Tech Stack: Electron main/preload, React renderer, current `contracts/engine-interface-v1.md`, current `openhwp workbench` session model, temporary workspace files under Electron `userData`, and a later `workbench v2` engine contract for true structural editing.

References:
- Current desktop shell:
  - `interfaces/desktop/src/App.tsx`
  - `interfaces/desktop/electron/main.cjs`
  - `interfaces/desktop/electron/preload.cjs`
  - `interfaces/desktop/src/engine.ts`
- Current engine contract:
  - `contracts/engine-interface-v1.md`
  - `engines/openhwp-zig/src/workbench.zig`
  - `engines/openhwp-zig/src/xml_tools.zig`
- Existing engine UX statement:
  - `engines/openhwp-zig/README.md`

Non-goals for this phase:
- No page-perfect Word rendering
- No direct `.hwp` overwrite/write-back
- No full style toolbar parity with Word
- No tables/images/shapes editing parity
- No collaboration or track changes

Success criteria:
1. A user can open a document and immediately enter an editor workflow without seeing `convert`, `export`, or `apply`.
2. A user can edit and save `.hwpx` documents through `Open`, `Save`, and `Save As`.
3. A user can open `.hwp` documents through an import workflow that feels native, but save output as `.hwpx`.
4. The desktop app presents a document shell with recent files, a document canvas, dirty state, and standard editor commands.
5. The CLI remains stable as an agent-oriented primitive layer rather than the primary human UX.

---

## Product decisions locked now

1. Desktop is the primary human editor.
2. CLI is an implementation surface for automation, testing, and future agent skills.
3. The main UI is document-first, not command-first.
4. `.hwp` is treated as an import-only source until direct write support exists.
5. `workbench session` is an internal document model, not a user-facing artifact.
6. v1 should feel like a document editor even if editing capability is still text-oriented.

---

## Current audit summary

Current desktop state:
- `interfaces/desktop/src/App.tsx` is a direct mapping of engine verbs:
  - `info`
  - `text`
  - `convert`
  - `workbench export`
  - `workbench apply`
- `interfaces/desktop/electron/main.cjs` is a thin `execFile` proxy for those commands.
- The user is asked to manage:
  - document path
  - output `.hwpx` path
  - session JSON path
- The UI exposes engine/runtime concerns instead of editor concerns.

Current engine constraint:
- `workbench export` returns only:
  - `schema`
  - `source_document`
  - `sections[].path`
  - `sections[].nodes[].text`
- `engines/openhwp-zig/src/xml_tools.zig` shows that a node is only `text`.
- `workbench apply` requires the same node count that was exported.

Implication:
- The current contract supports text rewriting, not true document-structure editing.
- We can build a much better Word-like workflow shell immediately.
- We cannot honestly claim full Word-like editing semantics until the engine contract grows beyond fixed text-node replacement.

This leads to a two-layer design:
- Phase A: Word-like workflow shell on top of current `workbench v1`
- Phase B: richer `workbench v2` engine contract for true structural editing

---

## Target user workflow

### 1. Launch

The app opens into a document home view:
- recent files
- `Open`
- `New blank draft` later

The user should not see runtime status cards or raw engine paths in the default experience.

### 2. Open document

If the user opens `.hwpx`:
- app loads the original file
- app exports an internal workbench session
- app transitions directly into editor mode

If the user opens `.hwp`:
- app runs an import flow that converts the file into an editable `.hwpx` working copy
- app exports the internal workbench session from that working copy
- app shows an import banner:
  - example: `Legacy HWP imported as editable HWPX draft. Save will write a .hwpx file.`

The user still experiences a single action: `Open document`.

### 3. Edit

The editor should present:
- document title
- dirty state
- a left navigation or outline
- a central document canvas
- a right inspector or properties panel
- a bottom status bar

The default mental model should be:
- I am editing a document
- not:
- I am preparing a session JSON for a CLI command

### 4. Save

If the original file is `.hwpx`:
- `Save` writes back to the current save target
- `Save As` writes a new `.hwpx`

If the original file is `.hwp`:
- `Save` behaves like first-time `Save As`
- the resulting saved document is `.hwpx`
- the original `.hwp` remains untouched

### 5. Close / reopen

The app remembers:
- recent files
- last successful save target
- whether the document was imported from `.hwp`

Draft recovery and autosave can come later, but the state model should not block them.

---

## UX model

### Default shell

Top area:
- native menu bar with `File`, `Edit`, `View`, `Help`
- title bar showing document name and modified state

Left sidebar:
- sections
- outline
- search results later

Center canvas:
- document content editor
- should look like a document workspace, not a diagnostics form

Right inspector:
- document metadata
- format state
- import/save status
- selected item info later

Bottom status bar:
- format: `HWPX` or `Imported from HWP`
- save state
- engine issues only when relevant

### Commands visible to the user

Keep these in the main flow:
- Open
- Save
- Save As
- Close
- Undo
- Redo
- Find
- Refresh from disk later

Hide these from the main flow:
- Convert to HWPX
- Workbench Export
- Workbench Apply
- Session JSON path management

These can still exist behind a developer mode or debug panel.

---

## Document lifecycle model

The desktop app needs one high-level lifecycle state machine.

```ts
type SourceFormat = "hwp" | "hwpx";

type OpenMode =
  | "direct-hwpx"
  | "imported-hwp";

type SaveCapability =
  | "save"
  | "save-as-required";

type DocumentWorkspace = {
  sourcePath: string;
  sourceFormat: SourceFormat;
  openMode: OpenMode;
  workingHwpxPath: string;
  saveTargetPath: string | null;
  importedFromLegacyHwp: boolean;
  session: WorkbenchSessionV1;
  dirty: boolean;
  lastSavedAt: string | null;
};
```

Lifecycle rules:
- `.hwpx` open:
  - `workingHwpxPath = sourcePath`
  - `saveTargetPath = sourcePath`
- `.hwp` open:
  - `workingHwpxPath = temp imported copy`
  - `saveTargetPath = null`
  - `Save` requires choosing a `.hwpx` destination

This model keeps `.hwp` import honest without making the user think about conversion internals.

---

## Editor data model

### Phase A: Current engine-compatible model

Keep the current engine contract, but move it into in-memory editor state:

```ts
type WorkbenchSessionV1 = {
  schema: "openhwp-workbench-v1";
  source_document: string;
  sections: Array<{
    path: string;
    nodes: Array<{
      text: string;
    }>;
  }>;
};
```

Renderer state should derive editor-friendly view models from this:

```ts
type EditorSection = {
  id: string;
  path: string;
  nodeCount: number;
  nodes: Array<{
    id: string;
    text: string;
  }>;
};
```

Important limitation:
- node count is fixed
- editing is text replacement within existing nodes
- paragraph insertion/deletion is not guaranteed safe
- rich formatting is not represented

That means the v1 editor should be described internally as:
- a document-oriented text editor shell
- not a full-fidelity Word-compatible editor

### Phase B: Required engine contract for true editor semantics

To support a real Word-like editing model, `workbench v2` should eventually expose:
- stable ids for sections/paragraphs/runs
- paragraph boundaries
- optional style metadata
- structural apply support

Candidate shape:

```ts
type WorkbenchSessionV2 = {
  schema: "openhwp-workbench-v2";
  source_document: string;
  sections: Array<{
    id: string;
    path: string;
    blocks: Array<{
      id: string;
      kind: "paragraph";
      runs: Array<{
        id: string;
        text: string;
        styleRef?: string;
      }>;
    }>;
  }>;
};
```

Required engine abilities for v2:
- insert paragraph
- delete paragraph
- split/merge runs safely
- preserve untouched XML/style metadata where possible

Without this, the desktop app can feel like Word, but it cannot fully behave like Word.

---

## Main-process responsibilities

Electron main should stop exposing only raw engine verbs and instead expose document operations.

### New high-level IPC surface

Expose operations such as:
- `document:open`
- `document:save`
- `document:saveAs`
- `document:getRecent`
- `document:close`
- `document:exportDebugSession`

### What `document:open` should do

For `.hwpx`:
1. resolve absolute path
2. run `workbench export` into a temp session file
3. parse JSON
4. return normalized document workspace payload

For `.hwp`:
1. create temp workspace directory under `app.getPath("userData")`
2. run `convert` into temp `working.hwpx`
3. run `workbench export` from temp `working.hwpx`
4. parse JSON
5. return normalized document workspace payload with `saveTargetPath = null`

### What `document:save` should do

1. receive current session payload from renderer
2. write temp session JSON
3. run `workbench apply`
4. write output to target `.hwpx`
5. if saving to current working file, prefer a safe temp output + replace strategy
6. return updated document metadata

### Other main-process duties

- temp workspace cleanup
- recent files persistence
- native menu/accelerators
- standard OS dialogs
- save blockers when document is dirty

---

## Renderer responsibilities

The renderer should be reorganized around editor state, not command forms.

### Recommended module split

Create:
- `interfaces/desktop/src/state/document.ts`
- `interfaces/desktop/src/state/recent-files.ts`
- `interfaces/desktop/src/types/document.ts`
- `interfaces/desktop/src/components/DocumentHome.tsx`
- `interfaces/desktop/src/components/EditorShell.tsx`
- `interfaces/desktop/src/components/SectionSidebar.tsx`
- `interfaces/desktop/src/components/DocumentCanvas.tsx`
- `interfaces/desktop/src/components/InspectorPanel.tsx`
- `interfaces/desktop/src/components/StatusBar.tsx`
- `interfaces/desktop/src/components/ImportBanner.tsx`

Modify:
- `interfaces/desktop/src/App.tsx`
- `interfaces/desktop/src/engine.ts`
- `interfaces/desktop/src/styles.css`

### App-level rendering logic

`App.tsx` should become:
- `home` state when no document is open
- `editor` state when a document workspace is open
- optional `debug` drawer behind a menu or shortcut

### Canvas strategy for Phase A

Given the current engine contract, the first canvas should render:
- sections
- editable node text blocks

It should not pretend to be pixel-faithful pagination yet.

The visual framing should still feel document-like:
- centered paper surface
- comfortable text width
- clear section breaks
- keyboard-first editing

This gives the correct workflow even before the engine reaches structural editing parity.

---

## Save semantics

### `.hwpx`

Open:
- direct open

Save:
- overwrite current save target

Save As:
- choose new `.hwpx`

### `.hwp`

Open:
- import to temp editable `.hwpx`

Save:
- first save requires `.hwpx` destination

Save As:
- always `.hwpx`

Never do:
- overwrite original `.hwp`
- imply lossless round-trip to `.hwp`

The app must be explicit here because pretending otherwise would be a product lie.

---

## Menu and shortcut baseline

File:
- Open
- Save
- Save As
- Close

Edit:
- Undo
- Redo
- Cut
- Copy
- Paste
- Find

View:
- Toggle sidebar
- Toggle inspector
- Toggle developer panel

Help:
- Import limitations
- About format support

Shortcuts:
- `Cmd+O`
- `Cmd+S`
- `Cmd+Shift+S`
- `Cmd+F`
- `Cmd+Z`
- `Cmd+Shift+Z`

---

## Error UX

Errors should be mapped to editor language, not CLI language.

Examples:
- `Cannot open this file`
- `Legacy HWP import requires a converter`
- `This document could not be saved`
- `This imported HWP document must be saved as HWPX`

Debug details:
- CLI stderr
- engine path
- converter path

These belong in an expandable diagnostics area, not the primary surface.

---

## Phased implementation plan

### Phase 1: Replace command panel with document shell

Objective:
- remove raw command-first UI
- introduce `home` and `editor` states

Files:
- modify `interfaces/desktop/src/App.tsx`
- add editor shell components
- hide debug-only controls

Ship bar:
- user no longer sees session/output path fields
- user can open a document into an editor shell

### Phase 2: High-level document IPC

Objective:
- move `open/save/save as` orchestration into main process

Files:
- modify `interfaces/desktop/electron/main.cjs`
- modify `interfaces/desktop/electron/preload.cjs`
- modify `interfaces/desktop/src/engine.ts`

Ship bar:
- renderer stops juggling temp session/output paths
- renderer talks in document lifecycle terms

### Phase 3: Phase A editor on `workbench v1`

Objective:
- edit current session in memory
- save via hidden `workbench apply`

Files:
- add document state and view-model mapping
- add section/node editor canvas

Ship bar:
- `.hwpx` open/edit/save works in a Word-like workflow shell
- `.hwp` import/open/save-as-`.hwpx` works

### Phase 4: Recent files, menu, polish

Objective:
- make the app feel like a real desktop editor

Files:
- main process recent files persistence
- menu accelerators
- status bar
- import banner

Ship bar:
- home screen + recent docs
- standard desktop commands

### Phase 5: `workbench v2` for true structural editing

Objective:
- unlock insertion/deletion/reflow semantics closer to Word

Files:
- `contracts/engine-interface-v2.md` or contract update
- `engines/openhwp-zig/src/workbench.zig`
- renderer editor model

Ship bar:
- document editing is no longer limited to fixed exported node count

---

## Risks and tradeoffs

### Risk 1: Word-like shell may oversell current editing power

Mitigation:
- be explicit that v1 is text-focused
- do not expose fake style or layout tools

### Risk 2: `.hwp` expectations may be wrong

Mitigation:
- show import banner
- save only to `.hwpx`
- keep original `.hwp` untouched

### Risk 3: Current workbench model may be too low-level for a pleasant canvas

Mitigation:
- ship the workflow shell first
- plan `workbench v2` early instead of piling hacks into the renderer

### Risk 4: Save path handling may corrupt files if done in place

Mitigation:
- always save via temp output and replace/move
- keep working copy and save target distinct in the lifecycle model

---

## Recommended next implementation step

Start with Phase 1 plus Phase 2 together.

Reason:
- replacing visuals without changing IPC keeps too much CLI leakage in the renderer
- changing IPC without changing the shell still leaves the wrong product shape

The first implementation slice should deliver:
1. `home` screen
2. `openDocument()` high-level IPC
3. `editor` shell
4. hidden workbench temp-file management
5. `saveDocument()` and `saveDocumentAs()` high-level IPC

Once that exists, the product stops feeling like a GUI for CLI and starts feeling like an actual desktop editor.
