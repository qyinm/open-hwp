import { useEffect, useMemo, useState } from "react";
import {
  getEngineStatus,
  getRecentDocuments,
  openDocument,
  openDocumentPath,
  saveDocument,
  saveDocumentAs
} from "./engine";
import { DocumentHome } from "./components/DocumentHome";
import { EditorShell } from "./components/EditorShell";
import type {
  DocumentWorkspace,
  EditorSectionView,
  EngineStatus,
  WorkbenchSession,
  RecentDocument
} from "./types/document";

type BusyAction = "open" | "open-recent" | "save" | "save-as" | null;

function fileName(pathValue: string) {
  const parts = pathValue.split(/[\\/]/);
  return parts[parts.length - 1] || pathValue;
}

function sectionIndexFromId(sectionId: string) {
  const index = Number.parseInt(sectionId, 10);
  return Number.isNaN(index) ? -1 : index;
}

function confirmDiscardIfDirty(documentState: DocumentWorkspace | null) {
  if (!documentState?.dirty) {
    return true;
  }

  return window.confirm("저장되지 않은 변경사항이 있습니다. 계속 진행하면 현재 편집 상태를 버립니다.");
}

function buildEditorSections(session: WorkbenchSession): EditorSectionView[] {
  return session.sections.map((section, sectionIndex) => {
    const preview =
      section.nodes
        .map((node) => node.text.trim())
        .find((text) => text.length > 0)
        ?.slice(0, 88) ?? "빈 섹션";

    return {
      id: `${sectionIndex}:${section.path}`,
      title: `Section ${sectionIndex + 1}`,
      path: section.path,
      nodeCount: section.nodes.length,
      preview,
      nodes: section.nodes.map((node, nodeIndex) => ({
        id: `${sectionIndex}:${nodeIndex}`,
        nodeIndex,
        text: node.text
      }))
    };
  });
}

export function App() {
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [recentDocuments, setRecentDocuments] = useState<RecentDocument[]>([]);
  const [documentState, setDocumentState] = useState<DocumentWorkspace | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [activity, setActivity] = useState<string[]>([]);

  const appendActivity = (line: string) => {
    setActivity((prev) => [line, ...prev].slice(0, 20));
  };

  const refreshHomeData = async () => {
    const [status, recent] = await Promise.all([getEngineStatus(), getRecentDocuments()]);
    setEngineStatus(status);
    setRecentDocuments(recent);
  };

  useEffect(() => {
    void refreshHomeData();
  }, []);

  useEffect(() => {
    const title = documentState
      ? `${fileName(documentState.saveTargetPath ?? documentState.sourcePath)}${documentState.dirty ? " *" : ""} - OpenHWP Desktop`
      : "OpenHWP Desktop";
    document.title = title;
  }, [documentState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMeta = event.metaKey || event.ctrlKey;
      if (!isMeta) {
        return;
      }

      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        void handleOpen();
        return;
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (event.shiftKey) {
          void handleSaveAs();
        } else {
          void handleSave();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [documentState, busy]);

  const sections = useMemo(
    () => (documentState ? buildEditorSections(documentState.session) : []),
    [documentState]
  );

  useEffect(() => {
    if (!documentState || sections.length === 0) {
      setSelectedSectionId(null);
      return;
    }

    if (!selectedSectionId || !sections.some((section) => section.id === selectedSectionId)) {
      setSelectedSectionId(sections[0].id);
    }
  }, [documentState, sections, selectedSectionId]);

  const withBusy = async (action: BusyAction, task: () => Promise<void>) => {
    setBusy(action);
    try {
      await task();
    } catch (error) {
      appendActivity(`ERROR: ${String(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const applyOpenedDocument = async (nextDocument: DocumentWorkspace | null) => {
    if (!nextDocument) {
      return;
    }

    setDocumentState(nextDocument);
    setSelectedSectionId(buildEditorSections(nextDocument.session)[0]?.id ?? null);
    appendActivity(`OPENED: ${nextDocument.sourcePath}`);
    await refreshHomeData();
  };

  const handleOpen = async () => {
    if (!confirmDiscardIfDirty(documentState)) {
      return;
    }

    await withBusy("open", async () => {
      const nextDocument = await openDocument();
      await applyOpenedDocument(nextDocument);
    });
  };

  const handleOpenRecent = async (path: string) => {
    if (!confirmDiscardIfDirty(documentState)) {
      return;
    }

    await withBusy("open-recent", async () => {
      const nextDocument = await openDocumentPath(path);
      await applyOpenedDocument(nextDocument);
    });
  };

  const handleSave = async () => {
    if (!documentState) {
      return;
    }

    const action = documentState.saveTargetPath ? "save" : "save-as";
    await withBusy(action, async () => {
      const result = documentState.saveTargetPath
        ? await saveDocument(documentState)
        : await saveDocumentAs(documentState);
      if (!result) {
        appendActivity("SAVE AS: cancelled");
        return;
      }

      setDocumentState(result);
      appendActivity(`SAVED: ${result.saveTargetPath}`);
      await refreshHomeData();
    });
  };

  const handleSaveAs = async () => {
    if (!documentState) {
      return;
    }

    await withBusy("save-as", async () => {
      const result = await saveDocumentAs(documentState);
      if (!result) {
        appendActivity("SAVE AS: cancelled");
        return;
      }

      setDocumentState(result);
      appendActivity(`SAVE AS: ${result.saveTargetPath}`);
      await refreshHomeData();
    });
  };

  const handleNodeChange = (sectionId: string, nodeIndex: number, nextText: string) => {
    setDocumentState((current) => {
      if (!current) {
        return current;
      }

      const sectionIndex = sectionIndexFromId(sectionId);
      if (sectionIndex < 0) {
        return current;
      }

      const currentNode = current.session.sections[sectionIndex]?.nodes[nodeIndex];
      if (!currentNode || currentNode.text === nextText) {
        return current;
      }

      const nextSections = current.session.sections.map((section, currentSectionIndex) => {
        if (currentSectionIndex !== sectionIndex) {
          return section;
        }

        return {
          ...section,
          nodes: section.nodes.map((node, currentNodeIndex) =>
            currentNodeIndex === nodeIndex ? { ...node, text: nextText } : node
          )
        };
      });

      return {
        ...current,
        dirty: true,
        session: {
          ...current.session,
          sections: nextSections
        }
      };
    });
  };

  if (!documentState) {
    return (
      <DocumentHome
        busy={busy !== null}
        engineStatus={engineStatus}
        recentDocuments={recentDocuments}
        onOpen={() => void handleOpen()}
        onOpenRecent={(path) => void handleOpenRecent(path)}
      />
    );
  }

  return (
    <EditorShell
      busy={busy !== null}
      document={documentState}
      sections={sections}
      selectedSectionId={selectedSectionId}
      engineStatus={engineStatus}
      activity={activity}
      onOpen={() => void handleOpen()}
      onSave={() => void handleSave()}
      onSaveAs={() => void handleSaveAs()}
      onSelectSection={setSelectedSectionId}
      onNodeChange={handleNodeChange}
    />
  );
}
