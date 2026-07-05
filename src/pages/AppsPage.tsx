import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type React from "react";
import {
  Body1,
  Body2,
  Button,
  Caption1,
  Input,
  Menu,
  MenuTrigger,
  MenuList,
  MenuItem,
  MenuPopover,
  MenuDivider,
  MessageBar,
  MessageBarBody,
  Spinner,
  Subtitle1,
  Tag,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import {
  AddRegular,
  ArrowSortRegular,
  DeleteRegular,
  DismissRegular,
  EditRegular,
  FolderAddRegular,
  MoreHorizontalRegular,
  OpenRegular,
  SearchRegular,
  StarFilled,
  StarRegular,
} from "@fluentui/react-icons";
import type { AppCard, AppGroup, UserAppPrefs } from "../types";
import { useI18n } from "../i18n";
import { AppCardDialog, type AppCardDraft } from "../components/AppCardDialog";
import { TextPromptDialog } from "../components/TextPromptDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";

const UNGROUPED = "__ungrouped__" as const;
type SectionId = string | typeof UNGROUPED;

const useStyles = makeStyles({
  pageScroll: {
    height: "100%",
    overflowY: "auto",
    boxSizing: "border-box",
  },
  page: {
    padding: "24px 32px",
    boxSizing: "border-box",
    maxWidth: "1200px",
    width: "100%",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  filters: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  filterRow: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  search: {
    flex: 1,
    minWidth: "200px",
    maxWidth: "360px",
  },
  tagBar: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
    alignItems: "center",
  },
  tagBarLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: "12px",
    marginRight: "4px",
  },
  tagButton: {
    cursor: "pointer",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "4px 0",
  },
  sectionTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flex: 1,
    minWidth: 0,
  },
  sectionDropTarget: {
    backgroundColor: tokens.colorBrandBackground2,
    boxShadow: `inset 0 0 0 2px ${tokens.colorBrandStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    paddingLeft: "8px",
    paddingRight: "8px",
    transition: "background-color 100ms",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: "12px",
  },
  empty: {
    color: tokens.colorNeutralForeground3,
    padding: "16px 4px",
    fontSize: "13px",
  },
  card: {
    position: "relative",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    cursor: "pointer",
    minHeight: "120px",
    transition: "border-color 100ms, box-shadow 100ms",
    "&:hover": {
      border: `1px solid ${tokens.colorBrandStroke1}`,
      boxShadow: tokens.shadow4,
    },
  },
  cardDragging: {
    opacity: 0.4,
  },
  cardDragOver: {
    border: `1px solid ${tokens.colorBrandStroke1}`,
    boxShadow: `inset 0 2px 0 0 ${tokens.colorBrandStroke1}`,
  },
  cardHead: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  iconBox: {
    width: "32px",
    height: "32px",
    borderRadius: tokens.borderRadiusMedium,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
    fontWeight: tokens.fontWeightSemibold,
    fontSize: "14px",
    flexShrink: 0,
    overflow: "hidden",
  },
  iconImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  cardName: {
    flex: 1,
    fontWeight: tokens.fontWeightSemibold,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  cardActions: {
    display: "flex",
    gap: "2px",
    flexShrink: 0,
    opacity: 0,
    transition: "opacity 100ms",
  },
  cardActionsAlways: {
    opacity: 1,
  },
  cardDescription: {
    color: tokens.colorNeutralForeground3,
    fontSize: "12.5px",
    lineHeight: 1.4,
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  },
  cardTags: {
    display: "flex",
    flexWrap: "wrap",
    gap: "4px",
    marginTop: "auto",
  },
  starOn: {
    color: tokens.colorPaletteMarigoldForeground1,
  },
  addTile: {
    border: `2px dashed ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    minHeight: "120px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    color: tokens.colorNeutralForeground3,
    cursor: "pointer",
    backgroundColor: "transparent",
    "&:hover": {
      border: `2px dashed ${tokens.colorBrandStroke1}`,
      color: tokens.colorBrandForeground1,
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
});

type Props = { teamId: string };

export function AppsPage({ teamId }: Props) {
  const styles = useStyles();
  const { t } = useI18n();

  const [apps, setApps] = useState<AppCard[]>([]);
  const [prefs, setPrefs] = useState<UserAppPrefs>({
    favorites: [],
    groups: [],
  });
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);

  // Drag state — card-to-section / card-to-card
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);
  const [dragOverSection, setDragOverSection] = useState<SectionId | null>(null);
  const dragOverCounter = useRef(0);

  // Dialog state
  const [editingCard, setEditingCard] = useState<AppCard | null>(null);
  const [creatingCard, setCreatingCard] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [renamingGroup, setRenamingGroup] = useState<AppGroup | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

  // ── data load ─────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [appsRes, prefsRes] = await Promise.all([
        fetch(`/api/teams/${teamId}/apps`),
        fetch(`/api/teams/${teamId}/app-prefs`),
      ]);
      if (!appsRes.ok) {
        const txt = await appsRes.text();
        setError(parseError(txt, appsRes.status));
        return;
      }
      const appsData = (await appsRes.json()) as {
        apps: AppCard[];
        canManage: boolean;
      };
      setApps(appsData.apps);
      setCanManage(appsData.canManage);

      if (prefsRes.ok) {
        setPrefs((await prefsRes.json()) as UserAppPrefs);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── server mutations ─────────────────────────────────────────────────────

  async function persistPrefs(next: UserAppPrefs) {
    setPrefs(next);
    const r = await fetch(`/api/teams/${teamId}/app-prefs`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (r.ok) {
      const updated = (await r.json()) as UserAppPrefs;
      setPrefs(updated);
    }
  }

  async function createCard(draft: AppCardDraft) {
    const r = await fetch(`/api/teams/${teamId}/apps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (!r.ok) return;
    const data = (await r.json()) as { app: AppCard };
    setApps((prev) => [...prev, data.app]);
  }

  async function updateCard(id: string, draft: AppCardDraft) {
    const r = await fetch(`/api/teams/${teamId}/apps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (!r.ok) return;
    const data = (await r.json()) as { app: AppCard };
    setApps((prev) => prev.map((a) => (a.id === id ? data.app : a)));
  }

  async function deleteCard(id: string) {
    const prev = apps;
    setApps((p) => p.filter((a) => a.id !== id));
    setPrefs((p) => ({
      favorites: p.favorites.filter((x) => x !== id),
      groups: p.groups.map((g) => ({
        ...g,
        appIds: g.appIds.filter((x) => x !== id),
      })),
    }));
    const r = await fetch(`/api/teams/${teamId}/apps/${id}`, {
      method: "DELETE",
    });
    if (!r.ok) {
      setApps(prev);
      void load();
    }
  }

  async function reorderCardsServer(items: { id: string; sortOrder: number }[]) {
    await fetch(`/api/teams/${teamId}/apps/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
  }

  // ── prefs actions ────────────────────────────────────────────────────────

  function toggleFavorite(appId: string) {
    const has = prefs.favorites.includes(appId);
    void persistPrefs({
      ...prefs,
      favorites: has
        ? prefs.favorites.filter((x) => x !== appId)
        : [...prefs.favorites, appId],
    });
  }

  function moveCardToGroup(appId: string, targetGroupId: string | null) {
    const groups = prefs.groups.map((g) => ({
      ...g,
      appIds: g.appIds.filter((x) => x !== appId),
    }));
    if (targetGroupId) {
      const idx = groups.findIndex((g) => g.id === targetGroupId);
      if (idx >= 0 && !groups[idx].appIds.includes(appId)) {
        groups[idx] = { ...groups[idx], appIds: [...groups[idx].appIds, appId] };
      }
    }
    void persistPrefs({ ...prefs, groups });
  }

  function reorderWithinSection(
    sectionId: SectionId,
    sourceId: string,
    targetId: string,
  ) {
    if (sectionId === UNGROUPED) {
      // Reorder team-shared sortOrder
      if (!canManage) return; // members can't change team sort
      const reordered = [...ungroupedApps];
      const sourceIdx = reordered.findIndex((c) => c.id === sourceId);
      const targetIdx = reordered.findIndex((c) => c.id === targetId);
      if (sourceIdx < 0 || targetIdx < 0) return;
      const [moved] = reordered.splice(sourceIdx, 1);
      reordered.splice(targetIdx, 0, moved);
      const items = reordered.map((c, i) => ({ id: c.id, sortOrder: i + 1 }));
      const order = new Map(items.map((i) => [i.id, i.sortOrder]));
      setApps((prev) =>
        prev.map((a) => ({
          ...a,
          sortOrder: order.get(a.id) ?? a.sortOrder,
        })),
      );
      void reorderCardsServer(items);
    } else {
      const groups = prefs.groups.map((g) => {
        if (g.id !== sectionId) return g;
        const list = [...g.appIds];
        const sourceIdx = list.indexOf(sourceId);
        const targetIdx = list.indexOf(targetId);
        if (sourceIdx < 0 || targetIdx < 0) return g;
        list.splice(sourceIdx, 1);
        list.splice(targetIdx, 0, sourceId);
        return { ...g, appIds: list };
      });
      void persistPrefs({ ...prefs, groups });
    }
  }

  function createGroup(name: string) {
    void persistPrefs({
      ...prefs,
      groups: [
        ...prefs.groups,
        {
          id: crypto.randomUUID(),
          name,
          appIds: [],
          sortOrder: prefs.groups.length
            ? Math.max(...prefs.groups.map((g) => g.sortOrder)) + 1
            : 1,
        },
      ],
    });
  }

  function renameGroup(id: string, name: string) {
    void persistPrefs({
      ...prefs,
      groups: prefs.groups.map((g) =>
        g.id === id ? { ...g, name } : g,
      ),
    });
  }

  function deleteGroup(id: string) {
    void persistPrefs({
      ...prefs,
      groups: prefs.groups.filter((g) => g.id !== id),
    });
  }

  // ── derived ──────────────────────────────────────────────────────────────

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const a of apps) for (const tag of a.tags) set.add(tag);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [apps]);

  const filterMatches = useCallback(
    (a: AppCard) => {
      if (
        search &&
        !`${a.name} ${a.description ?? ""} ${a.tags.join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ) {
        return false;
      }
      if (activeTags.length && !activeTags.every((t) => a.tags.includes(t))) {
        return false;
      }
      return true;
    },
    [search, activeTags],
  );

  const cardsById = useMemo(() => {
    const map = new Map<string, AppCard>();
    for (const a of apps) map.set(a.id, a);
    return map;
  }, [apps]);

  const groupedAppIds = useMemo(() => {
    const set = new Set<string>();
    for (const g of prefs.groups) for (const id of g.appIds) set.add(id);
    return set;
  }, [prefs.groups]);

  const ungroupedApps = useMemo(
    () =>
      apps
        .filter((a) => !groupedAppIds.has(a.id))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [apps, groupedAppIds],
  );

  const favoritedApps = useMemo(
    () =>
      prefs.favorites
        .map((id) => cardsById.get(id))
        .filter((a): a is AppCard => !!a)
        .filter(filterMatches),
    [prefs.favorites, cardsById, filterMatches],
  );

  // ── drag handlers ────────────────────────────────────────────────────────

  const onCardDragStart = (id: string) => () => {
    setDragCardId(id);
  };
  const onCardDragOver = (id: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (id !== dragCardId) setDragOverCardId(id);
  };
  const onCardDrop =
    (sectionId: SectionId, targetId: string) =>
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const sourceId = dragCardId;
      setDragCardId(null);
      setDragOverCardId(null);
      setDragOverSection(null);
      dragOverCounter.current = 0;
      if (!sourceId || sourceId === targetId) return;

      // Determine source section
      const sourceSection: SectionId =
        prefs.groups.find((g) => g.appIds.includes(sourceId))?.id ?? UNGROUPED;

      if (sourceSection === sectionId) {
        reorderWithinSection(sectionId, sourceId, targetId);
      } else {
        // Cross-section drop on a card → move to that section, append at target's position
        moveCardToGroup(sourceId, sectionId === UNGROUPED ? null : sectionId);
      }
    };
  const onCardDragEnd = () => {
    setDragCardId(null);
    setDragOverCardId(null);
    setDragOverSection(null);
    dragOverCounter.current = 0;
  };

  const onSectionDragEnter = (sectionId: SectionId) => () => {
    if (!dragCardId) return;
    dragOverCounter.current += 1;
    setDragOverSection(sectionId);
  };
  const onSectionDragLeave = () => {
    dragOverCounter.current -= 1;
    if (dragOverCounter.current <= 0) {
      dragOverCounter.current = 0;
      setDragOverSection(null);
    }
  };
  const onSectionDragOver = (e: React.DragEvent) => {
    if (dragCardId) e.preventDefault();
  };
  const onSectionDrop = (sectionId: SectionId) => (e: React.DragEvent) => {
    if (!dragCardId) return;
    e.preventDefault();
    const sourceId = dragCardId;
    setDragCardId(null);
    setDragOverSection(null);
    setDragOverCardId(null);
    dragOverCounter.current = 0;
    const currentSection: SectionId =
      prefs.groups.find((g) => g.appIds.includes(sourceId))?.id ?? UNGROUPED;
    if (currentSection === sectionId) return;
    moveCardToGroup(sourceId, sectionId === UNGROUPED ? null : sectionId);
  };

  // ── render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.pageScroll}>
        <div className={styles.page}>
          <Spinner label={t.loading} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.pageScroll}>
        <div className={styles.page}>
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        </div>
      </div>
    );
  }

  const renderCardGrid = (list: AppCard[], sectionId: SectionId) => (
    <div className={styles.grid}>
      {list.map((card) => renderCard(card, sectionId))}
      {sectionId === UNGROUPED && canManage && (
        <button
          className={styles.addTile}
          onClick={() => setCreatingCard(true)}
        >
          <AddRegular fontSize={24} />
          <Body2>{t.appsAddCard}</Body2>
        </button>
      )}
    </div>
  );

  const renderCard = (card: AppCard, sectionId: SectionId) => {
    const fav = prefs.favorites.includes(card.id);
    const initial = card.name.charAt(0).toUpperCase();
    const dragging = dragCardId === card.id;
    const dragOver =
      dragOverCardId === card.id && dragCardId !== null && !dragging;
    return (
      <div
        key={card.id}
        className={mergeClasses(
          styles.card,
          dragging && styles.cardDragging,
          dragOver && styles.cardDragOver,
        )}
        draggable
        onDragStart={onCardDragStart(card.id)}
        onDragOver={onCardDragOver(card.id)}
        onDrop={onCardDrop(sectionId, card.id)}
        onDragEnd={onCardDragEnd}
        onClick={(e) => {
          if (e.defaultPrevented) return;
          window.open(card.url, "_blank", "noopener,noreferrer");
        }}
      >
        <div className={styles.cardHead}>
          <div className={styles.iconBox}>
            {card.iconUrl ? (
              <img
                src={card.iconUrl}
                alt=""
                className={styles.iconImg}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              initial
            )}
          </div>
          <span className={styles.cardName}>{card.name}</span>
          <div
            className={mergeClasses(
              styles.cardActions,
              (fav || true) && styles.cardActionsAlways,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip
              content={fav ? t.appsUnfavorite : t.appsFavorite}
              relationship="label"
            >
              <Button
                appearance="subtle"
                size="small"
                icon={
                  fav ? (
                    <StarFilled className={styles.starOn} />
                  ) : (
                    <StarRegular />
                  )
                }
                onClick={(e) => {
                  e.preventDefault();
                  toggleFavorite(card.id);
                }}
              />
            </Tooltip>
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<MoreHorizontalRegular />}
                  onClick={(e) => e.preventDefault()}
                />
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem
                    icon={<OpenRegular />}
                    onClick={() =>
                      window.open(card.url, "_blank", "noopener,noreferrer")
                    }
                  >
                    {t.appsOpen}
                  </MenuItem>
                  <Menu>
                    <MenuTrigger disableButtonEnhancement>
                      <MenuItem icon={<ArrowSortRegular />}>
                        {t.appsMoveTo}
                      </MenuItem>
                    </MenuTrigger>
                    <MenuPopover>
                      <MenuList>
                        <MenuItem
                          onClick={() => moveCardToGroup(card.id, null)}
                          disabled={
                            !prefs.groups.some((g) =>
                              g.appIds.includes(card.id),
                            )
                          }
                        >
                          {t.appsUngrouped}
                        </MenuItem>
                        {prefs.groups.length > 0 && <MenuDivider />}
                        {prefs.groups.map((g) => (
                          <MenuItem
                            key={g.id}
                            onClick={() => moveCardToGroup(card.id, g.id)}
                            disabled={g.appIds.includes(card.id)}
                          >
                            {g.name}
                          </MenuItem>
                        ))}
                      </MenuList>
                    </MenuPopover>
                  </Menu>
                  {canManage && (
                    <>
                      <MenuDivider />
                      <MenuItem
                        icon={<EditRegular />}
                        onClick={() => setEditingCard(card)}
                      >
                        {t.edit}
                      </MenuItem>
                      <MenuItem
                        icon={<DeleteRegular />}
                        onClick={() => setDeletingCardId(card.id)}
                      >
                        {t.deleteAction}
                      </MenuItem>
                    </>
                  )}
                </MenuList>
              </MenuPopover>
            </Menu>
          </div>
        </div>
        {card.description && (
          <Body2 className={styles.cardDescription}>{card.description}</Body2>
        )}
        {card.tags.length > 0 && (
          <div className={styles.cardTags}>
            {card.tags.map((tag) => (
              <Tag
                key={tag}
                size="extra-small"
                appearance={
                  activeTags.includes(tag) ? "brand" : "outline"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTags((prev) =>
                    prev.includes(tag)
                      ? prev.filter((x) => x !== tag)
                      : [...prev, tag],
                  );
                }}
              >
                {tag}
              </Tag>
            ))}
          </div>
        )}
      </div>
    );
  };

  const sortedGroups = [...prefs.groups].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  return (
    <div className={styles.pageScroll}>
      <div className={styles.page}>
        <PageHeader
          title={t.appsTitle}
          subtitle={t.appsSubtitle}
          actions={
            <>
              <Button
                appearance="secondary"
                icon={<FolderAddRegular />}
                onClick={() => setCreatingGroup(true)}
              >
                {t.appsNewGroup}
              </Button>
              {canManage && (
                <Button
                  appearance="primary"
                  icon={<AddRegular />}
                  onClick={() => setCreatingCard(true)}
                >
                  {t.appsNewApp}
                </Button>
              )}
            </>
          }
        />

        <div className={styles.filters}>
          <div className={styles.filterRow}>
            <Input
              className={styles.search}
              contentBefore={<SearchRegular />}
              placeholder={t.appsSearchPlaceholder}
              value={search}
              onChange={(_, d) => setSearch(d.value)}
              contentAfter={
                search ? (
                  <Button
                    appearance="transparent"
                    size="small"
                    icon={<DismissRegular />}
                    onClick={() => setSearch("")}
                  />
                ) : undefined
              }
            />
          </div>
          {allTags.length > 0 && (
            <div className={styles.tagBar}>
              <span className={styles.tagBarLabel}>{t.appsTagFilter}</span>
              {allTags.map((tag) => (
                <Tag
                  key={tag}
                  size="small"
                  appearance={activeTags.includes(tag) ? "brand" : "outline"}
                  onClick={() =>
                    setActiveTags((prev) =>
                      prev.includes(tag)
                        ? prev.filter((x) => x !== tag)
                        : [...prev, tag],
                    )
                  }
                  className={styles.tagButton}
                >
                  {tag}
                </Tag>
              ))}
              {activeTags.length > 0 && (
                <Button
                  size="small"
                  appearance="subtle"
                  onClick={() => setActiveTags([])}
                >
                  {t.appsClearTags}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Favorites */}
        {favoritedApps.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleRow}>
                <StarFilled className={styles.starOn} />
                <Subtitle1>{t.appsFavorites}</Subtitle1>
                <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                  ({favoritedApps.length})
                </Caption1>
              </div>
            </div>
            <div className={styles.grid}>
              {favoritedApps.map((card) => {
                // For favorites, the card "belongs" to whichever group it's in
                // (or ungrouped). Keep its source section for drag semantics.
                const sectionId: SectionId =
                  prefs.groups.find((g) => g.appIds.includes(card.id))?.id ??
                  UNGROUPED;
                return renderCard(card, sectionId);
              })}
            </div>
          </section>
        )}

        {/* Personal groups */}
        {sortedGroups.map((g) => {
          const cards = g.appIds
            .map((id) => cardsById.get(id))
            .filter((a): a is AppCard => !!a)
            .filter(filterMatches);
          const isDropTarget =
            dragOverSection === g.id && dragCardId !== null;
          return (
            <section
              key={g.id}
              className={styles.section}
              onDragEnter={onSectionDragEnter(g.id)}
              onDragLeave={onSectionDragLeave}
              onDragOver={onSectionDragOver}
              onDrop={onSectionDrop(g.id)}
            >
              <div
                className={mergeClasses(
                  styles.sectionHeader,
                  isDropTarget && styles.sectionDropTarget,
                )}
              >
                <div className={styles.sectionTitleRow}>
                  <Subtitle1>{g.name}</Subtitle1>
                  <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                    ({cards.length})
                  </Caption1>
                </div>
                <Menu>
                  <MenuTrigger disableButtonEnhancement>
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<MoreHorizontalRegular />}
                    />
                  </MenuTrigger>
                  <MenuPopover>
                    <MenuList>
                      <MenuItem
                        icon={<EditRegular />}
                        onClick={() => setRenamingGroup(g)}
                      >
                        {t.appsRenameGroup}
                      </MenuItem>
                      <MenuItem
                        icon={<DeleteRegular />}
                        onClick={() => setDeletingGroupId(g.id)}
                      >
                        {t.appsDeleteGroup}
                      </MenuItem>
                    </MenuList>
                  </MenuPopover>
                </Menu>
              </div>
              {cards.length === 0 ? (
                <Body1 className={styles.empty}>{t.appsGroupEmpty}</Body1>
              ) : (
                renderCardGrid(cards, g.id)
              )}
            </section>
          );
        })}

        {/* Ungrouped */}
        <section
          className={styles.section}
          onDragEnter={onSectionDragEnter(UNGROUPED)}
          onDragLeave={onSectionDragLeave}
          onDragOver={onSectionDragOver}
          onDrop={onSectionDrop(UNGROUPED)}
        >
          <div
            className={mergeClasses(
              styles.sectionHeader,
              dragOverSection === UNGROUPED &&
                dragCardId !== null &&
                styles.sectionDropTarget,
            )}
          >
            <div className={styles.sectionTitleRow}>
              <Subtitle1>
                {sortedGroups.length > 0 ? t.appsUngrouped : t.appsAllApps}
              </Subtitle1>
              <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                ({ungroupedApps.filter(filterMatches).length})
              </Caption1>
            </div>
          </div>
          {apps.length === 0 ? (
            canManage ? (
              renderCardGrid([], UNGROUPED)
            ) : (
              <Body1 className={styles.empty}>{t.appsEmpty}</Body1>
            )
          ) : (
            renderCardGrid(
              ungroupedApps.filter(filterMatches),
              UNGROUPED,
            )
          )}
        </section>
      </div>

      <AppCardDialog
        open={creatingCard || editingCard !== null}
        initial={editingCard}
        onClose={() => {
          setCreatingCard(false);
          setEditingCard(null);
        }}
        onSubmit={async (draft) => {
          if (editingCard) await updateCard(editingCard.id, draft);
          else await createCard(draft);
        }}
      />

      <ConfirmDialog
        open={deletingCardId !== null}
        title={t.appsDeleteCardTitle}
        message={t.appsDeleteCardMessage(
          apps.find((a) => a.id === deletingCardId)?.name ?? "",
        )}
        confirmLabel={t.deleteAction}
        destructive
        onCancel={() => setDeletingCardId(null)}
        onConfirm={() => {
          if (deletingCardId) void deleteCard(deletingCardId);
          setDeletingCardId(null);
        }}
      />

      <TextPromptDialog
        open={creatingGroup}
        title={t.appsNewGroupTitle}
        label={t.appsGroupName}
        confirmLabel={t.create}
        onCancel={() => setCreatingGroup(false)}
        onConfirm={(name) => {
          createGroup(name);
          setCreatingGroup(false);
        }}
      />

      <TextPromptDialog
        open={renamingGroup !== null}
        title={t.appsRenameGroupTitle}
        label={t.appsGroupName}
        initialValue={renamingGroup?.name ?? ""}
        confirmLabel={t.save}
        onCancel={() => setRenamingGroup(null)}
        onConfirm={(name) => {
          if (renamingGroup) renameGroup(renamingGroup.id, name);
          setRenamingGroup(null);
        }}
      />

      <ConfirmDialog
        open={deletingGroupId !== null}
        title={t.appsDeleteGroupTitle}
        message={t.appsDeleteGroupMessage(
          prefs.groups.find((g) => g.id === deletingGroupId)?.name ?? "",
        )}
        confirmLabel={t.deleteAction}
        destructive
        onCancel={() => setDeletingGroupId(null)}
        onConfirm={() => {
          if (deletingGroupId) deleteGroup(deletingGroupId);
          setDeletingGroupId(null);
        }}
      />
    </div>
  );
}

function parseError(text: string, status: number): string {
  try {
    const j = JSON.parse(text);
    return (j as { error?: string }).error ?? `${status}`;
  } catch {
    return `${status}: ${text.slice(0, 200)}`;
  }
}
