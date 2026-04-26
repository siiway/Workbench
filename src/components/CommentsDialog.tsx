import { useState, useEffect, useCallback } from "react";
import {
  Body1,
  Body2,
  Caption1,
  Button,
  Spinner,
  Avatar,
  Textarea,
  Divider,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  MessageBar,
  MessageBarBody,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { Delete20Regular, Send20Regular } from "@fluentui/react-icons";
import type { Comment } from "../types";
import { useI18n } from "../i18n";

const useStyles = makeStyles({
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxHeight: "320px",
    overflowY: "auto",
    marginBottom: "12px",
  },
  item: {
    display: "flex",
    gap: "8px",
    padding: "8px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  username: {
    color: tokens.colorNeutralForeground4,
    fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
  },
  inputRow: {
    display: "flex",
    gap: "8px",
    alignItems: "flex-end",
  },
  empty: {
    color: tokens.colorNeutralForeground4,
    padding: "16px 0",
  },
});

type Props = {
  open: boolean;
  onClose: () => void;
  todoTitle?: string;
  teamId: string;
  todoId: string | null;
  canComment: boolean;
  canDeleteComment: (comment: Comment) => boolean;
  onCommentCountChange: (todoId: string, delta: number) => void;
};

export function CommentsDialog({
  open,
  onClose,
  todoTitle,
  teamId,
  todoId,
  canComment,
  canDeleteComment,
  onCommentCountChange,
}: Props) {
  const styles = useStyles();
  const { t } = useI18n();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    if (!todoId) return;
    setLoading(true);
    setComments([]);
    setError(null);
    try {
      const res = await fetch(
        `/api/glint/workbench/teams/${teamId}/todos/${todoId}/comments`,
      );
      const text = await res.text();
      if (!res.ok) {
        let msg = `${res.status}`;
        try {
          const j = JSON.parse(text);
          msg = j.error ?? msg;
        } catch {
          msg = `${res.status}: ${text.slice(0, 200)}`;
        }
        setError(msg);
        return;
      }
      const data = JSON.parse(text) as { comments: Comment[] };
      setComments(data.comments);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [teamId, todoId]);

  useEffect(() => {
    if (open && todoId) void fetchComments();
  }, [open, todoId, fetchComments]);

  const addComment = async () => {
    if (!newComment.trim() || adding || !todoId) return;
    setAdding(true);
    const res = await fetch(
      `/api/glint/workbench/teams/${teamId}/todos/${todoId}/comments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newComment }),
      },
    );
    if (res.ok) {
      const data: { comment: Comment } = await res.json();
      setComments((prev) => [...prev, data.comment]);
      setNewComment("");
      onCommentCountChange(todoId, 1);
    }
    setAdding(false);
  };

  const removeComment = async (commentId: string) => {
    if (!todoId) return;
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    onCommentCountChange(todoId, -1);
    await fetch(
      `/api/glint/workbench/teams/${teamId}/todos/${todoId}/comments/${commentId}`,
      { method: "DELETE" },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(_, d) => {
        if (!d.open) {
          onClose();
          setNewComment("");
        }
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>
            {t.commentsTitle}{" "}
            {todoTitle && <Caption1> &mdash; {todoTitle}</Caption1>}
          </DialogTitle>
          <DialogContent>
            {error && (
              <MessageBar intent="error" style={{ marginBottom: 8 }}>
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            {loading ? (
              <Spinner size="small" />
            ) : comments.length === 0 && !error ? (
              <Body1 className={styles.empty}>{t.commentsEmpty}</Body1>
            ) : (
              <div className={styles.list}>
                {comments.map((c) => (
                  <div key={c.id} className={styles.item}>
                    <Avatar
                      name={c.displayName || c.username}
                      image={c.avatarUrl ? { src: c.avatarUrl } : undefined}
                      size={24}
                    />
                    <div className={styles.content}>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <Body2 style={{ fontWeight: 600 }}>
                          {c.displayName || c.username}
                        </Body2>
                        <Caption1 className={styles.username}>
                          @{c.username}
                        </Caption1>
                        <Caption1>
                          {new Date(c.createdAt).toLocaleString()}
                        </Caption1>
                      </div>
                      <Body1 style={{ whiteSpace: "pre-wrap" }}>{c.body}</Body1>
                    </div>
                    {canDeleteComment(c) && (
                      <Button
                        appearance="transparent"
                        size="small"
                        icon={<Delete20Regular />}
                        onClick={() => void removeComment(c.id)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <Divider style={{ margin: "8px 0" }} />

            <div className={styles.inputRow}>
              <Textarea
                style={{ flex: 1 }}
                placeholder={
                  canComment ? t.commentInputPlaceholder : t.commentInputDisabled
                }
                value={newComment}
                onChange={(_, d) => setNewComment(d.value)}
                disabled={!canComment}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void addComment();
                  }
                }}
              />
              <Button
                appearance="primary"
                icon={<Send20Regular />}
                onClick={() => void addComment()}
                disabled={!canComment || !newComment.trim() || adding}
              />
            </div>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">{t.close}</Button>
            </DialogTrigger>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
