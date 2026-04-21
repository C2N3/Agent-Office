import React, {
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from 'react';

type AgentNameEditorProps = {
  agentId: string;
  displayName: string;
  hasNickname: boolean;
  onRename: (agentId: string, nickname: string) => boolean | Promise<boolean>;
};

export function AgentNameEditor({
  agentId,
  displayName,
  hasNickname,
  onRename,
}: AgentNameEditorProps): ReactElement {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(displayName);
  const [savingName, setSavingName] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const skipBlurSaveRef = useRef(false);

  useEffect(() => {
    if (!editingName) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editingName]);

  const startEdit = () => {
    skipBlurSaveRef.current = false;
    setDraftName(displayName);
    setEditingName(true);
  };

  const commitEdit = async () => {
    if (savingName) return;
    const trimmed = draftName.trim();
    if (trimmed === displayName || (!trimmed && !hasNickname)) {
      setEditingName(false);
      setDraftName(displayName);
      return;
    }

    setSavingName(true);
    try {
      const saved = await onRename(agentId, trimmed);
      if (saved) {
        setEditingName(false);
      }
    } catch (error) {
      console.error('[Nickname Edit]', error);
    } finally {
      setSavingName(false);
    }
  };

  const cancelEdit = () => {
    skipBlurSaveRef.current = true;
    setDraftName(displayName);
    setEditingName(false);
  };

  return (
    <span
      className="agent-display-name"
      data-agent-id={agentId}
      title="Double-click to rename"
      onDoubleClick={(event) => {
        event.stopPropagation();
        startEdit();
      }}
    >
      {editingName ? (
        <input
          ref={inputRef}
          className="nickname-input"
          disabled={savingName}
          type="text"
          value={draftName}
          onBlur={() => {
            if (skipBlurSaveRef.current) {
              skipBlurSaveRef.current = false;
              return;
            }
            void commitEdit();
          }}
          onChange={(event) => setDraftName(event.currentTarget.value)}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              cancelEdit();
            }
          }}
        />
      ) : displayName}
    </span>
  );
}
