import React from 'react';

const cloneBlocks = (blocks) => {
  try {
    return structuredClone(blocks);
  } catch (_) {
    return JSON.parse(JSON.stringify(blocks ?? []));
  }
};

const nextAnimationFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Centralized pagination reflow engine.
 *
 * - Detect overflow via DOM measurement (scrollHeight vs clientHeight)
 * - Move *blocks* end(i) -> start(i+1) until stable (forward cascade)
 * - Optionally pull blocks start(i+1) -> end(i) to fill gaps (backward cascade)
 */
export function usePaginationReflow({
  layoutMode,
  pages,
  setPages,
  pageDrafts,
  setPageDrafts,
  chapterId,
  getNewOrderBetween,
  pageApi,
  canRemoveTempPages = true,
  options,
}) {
  const opts = React.useMemo(
    () => ({
      maxMovesPerFrame: options?.maxMovesPerFrame ?? 6,
      maxOverflowMoves: options?.maxOverflowMoves ?? Infinity,
      underfillPull: options?.underfillPull ?? true,
      fillTargetRatio: options?.fillTargetRatio ?? 0.9,
      minFillRatio: options?.minFillRatio ?? 0.7,
      overflowPxTolerance: options?.overflowPxTolerance ?? 2,
      maxWaitFrames: options?.maxWaitFrames ?? 40,
    }),
    [options]
  );

  const pagesRef = React.useRef(pages);
  const draftsRef = React.useRef(pageDrafts);
  React.useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  React.useEffect(() => {
    draftsRef.current = pageDrafts;
  }, [pageDrafts]);

  const runningRef = React.useRef(false);
  const queuedStartIdRef = React.useRef(null);

  const waitForPageReady = React.useCallback(
    async (pageId) => {
      for (let i = 0; i < opts.maxWaitFrames; i++) {
        const clientH = pageApi.getClientHeight(pageId);
        if (clientH && clientH > 0) return true;
        await nextAnimationFrame();
      }
      return false;
    },
    [pageApi, opts.maxWaitFrames]
  );

  const isOverflowing = React.useCallback(
    (pageId) => {
      const clientH = pageApi.getClientHeight(pageId);
      const scrollH = pageApi.getScrollHeight(pageId);
      if (!clientH || clientH <= 0) return false;
      return scrollH > clientH + opts.overflowPxTolerance;
    },
    [pageApi, opts.overflowPxTolerance]
  );

  const fillRatio = React.useCallback(
    (pageId) => {
      const clientH = pageApi.getClientHeight(pageId);
      const scrollH = pageApi.getScrollHeight(pageId);
      if (!clientH || clientH <= 0) return 1;
      return scrollH / clientH;
    },
    [pageApi]
  );

  const insertTempPageAfter = React.useCallback(
    async (workingPages, afterIdx) => {
      const after = workingPages[afterIdx];
      const beforeOrder = after?.order || '';
      const nextOrder = workingPages[afterIdx + 1]?.order || '';
      const newOrder = getNewOrderBetween(beforeOrder, nextOrder);
      const tempId = `temp_${Date.now()}_${Math.random().toString(16).slice(2)}`;

      const newPage = {
        id: tempId,
        chapterId,
        note: '',
        media: [],
        order: newOrder,
      };

      workingPages.splice(afterIdx + 1, 0, newPage);

      setPages((prev) => {
        // Only insert if it doesn't exist already
        if (prev.some((p) => p.id === tempId)) return prev;
        const copy = [...prev, newPage];
        copy.sort((a, b) => (a.order || '').localeCompare(b.order || ''));
        return copy;
      });

      setPageDrafts((prev) => ({
        ...prev,
        [tempId]: { blocks: [], updatedAt: Date.now() },
      }));

      // Wait for it to mount so we can move blocks into it.
      await waitForPageReady(tempId);
      return tempId;
    },
    [chapterId, getNewOrderBetween, setPages, setPageDrafts, waitForPageReady]
  );

  const moveOverflowOnePage = React.useCallback(
    async (fromId, toId) => {
      let fromBlocks = pageApi.getBlocks(fromId) || [];
      let toBlocks = pageApi.getBlocks(toId) || [];

      if (!Array.isArray(fromBlocks) || fromBlocks.length === 0) return;

      if (!isOverflowing(fromId)) return 0;

      const moves = Math.min(opts.maxMovesPerFrame, fromBlocks.length);
      if (moves <= 0) return 0;

      const moved = fromBlocks.splice(fromBlocks.length - moves, moves);
      toBlocks = [...moved, ...toBlocks];

      await pageApi.setBlocks(fromId, fromBlocks, { silent: true });
      await pageApi.setBlocks(toId, toBlocks, { silent: true });

      const now = Date.now();
      setPageDrafts((prev) => ({
        ...prev,
        [fromId]: { blocks: cloneBlocks(fromBlocks), updatedAt: now },
        [toId]: { blocks: cloneBlocks(toBlocks), updatedAt: now },
      }));

      await nextAnimationFrame();
      return moved.length;
    },
    [isOverflowing, opts.maxMovesPerFrame, pageApi, setPageDrafts]
  );

  const pullUnderflowOnePage = React.useCallback(
    async (intoId, fromNextId) => {
      let intoBlocks = pageApi.getBlocks(intoId) || [];
      let nextBlocks = pageApi.getBlocks(fromNextId) || [];
      if (!Array.isArray(nextBlocks) || nextBlocks.length === 0) return;

      while (fillRatio(intoId) < opts.fillTargetRatio && nextBlocks.length > 0) {
        const moves = Math.min(opts.maxMovesPerFrame, nextBlocks.length);
        const moved = nextBlocks.splice(0, moves);
        intoBlocks = [...intoBlocks, ...moved];

        await pageApi.setBlocks(intoId, intoBlocks, { silent: true });
        await pageApi.setBlocks(fromNextId, nextBlocks, { silent: true });

        // Rollback if we overflowed by pulling
        if (isOverflowing(intoId)) {
          const rollback = intoBlocks.splice(intoBlocks.length - moved.length, moved.length);
          nextBlocks = [...rollback, ...nextBlocks];
          await pageApi.setBlocks(intoId, intoBlocks, { silent: true });
          await pageApi.setBlocks(fromNextId, nextBlocks, { silent: true });
          break;
        }

        const now = Date.now();
        setPageDrafts((prev) => ({
          ...prev,
          [intoId]: { blocks: cloneBlocks(intoBlocks), updatedAt: now },
          [fromNextId]: { blocks: cloneBlocks(nextBlocks), updatedAt: now },
        }));

        await nextAnimationFrame();
      }
    },
    [fillRatio, isOverflowing, opts.fillTargetRatio, opts.maxMovesPerFrame, pageApi, setPageDrafts]
  );

  const cleanupTrailingEmptyTempPages = React.useCallback(
    async (workingPages) => {
      if (!canRemoveTempPages) return;

      for (let i = workingPages.length - 1; i > 0; i--) {
        const p = workingPages[i];
        if (!p?.id?.startsWith('temp_')) break;

        const blocks = pageApi.getBlocks(p.id) || [];
        if (Array.isArray(blocks) && blocks.length > 0) break;

        const removeId = p.id;
        workingPages.splice(i, 1);

        setPages((prev) => prev.filter((pp) => pp.id !== removeId));
        setPageDrafts((prev) => {
          const copy = { ...prev };
          delete copy[removeId];
          return copy;
        });

        await nextAnimationFrame();
      }
    },
    [canRemoveTempPages, pageApi, setPageDrafts, setPages]
  );

  const runReflow = React.useCallback(
    async (startPageId) => {
      if (runningRef.current) return;
      runningRef.current = true;

      try {
        let workingPages = [...(pagesRef.current || [])].sort((a, b) => (a.order || '').localeCompare(b.order || ''));
        let startIdx = workingPages.findIndex((p) => p.id === startPageId);
        if (startIdx < 0) startIdx = 0;

        // Ensure measurements exist for start page (otherwise overflow detection is meaningless).
        await waitForPageReady(workingPages[startIdx]?.id);

        // Forward cascade: fix overflows from start -> end
        for (let i = startIdx; i < workingPages.length; i++) {
          const currId = workingPages[i]?.id;
          if (!currId) continue;
          await waitForPageReady(currId);

          let overflowMoves = 0;
          while (isOverflowing(currId)) {
            if (opts.maxOverflowMoves <= 0) break;
            // Ensure next page exists
            let nextId = workingPages[i + 1]?.id;
            if (!nextId) {
              nextId = await insertTempPageAfter(workingPages, i);
            } else {
              await waitForPageReady(nextId);
            }

            const moved = await moveOverflowOnePage(currId, nextId);
            overflowMoves += moved;
            if (overflowMoves >= opts.maxOverflowMoves) break;

            // If we couldn't fix overflow even after moving all blocks, break to avoid infinite loops.
            const remaining = pageApi.getBlocks(currId) || [];
            if (!Array.isArray(remaining) || remaining.length === 0) break;
            if (!isOverflowing(currId)) break;
          }
        }

        // Backward cascade: fill gaps (optional but recommended)
        if (opts.underfillPull) {
          for (let i = Math.min(startIdx, workingPages.length - 2); i >= 0; i--) {
            const currId = workingPages[i]?.id;
            const nextId = workingPages[i + 1]?.id;
            if (!currId || !nextId) continue;

            await waitForPageReady(currId);
            await waitForPageReady(nextId);

            const ratio = fillRatio(currId);
            if (ratio >= opts.minFillRatio) continue;

            await pullUnderflowOnePage(currId, nextId);
          }
        }

        await cleanupTrailingEmptyTempPages(workingPages);
      } finally {
        runningRef.current = false;
        const queued = queuedStartIdRef.current;
        queuedStartIdRef.current = null;
        if (queued) {
          // Run again (latest wins)
          void runReflow(queued);
        }
      }
    },
    [
      cleanupTrailingEmptyTempPages,
      fillRatio,
      insertTempPageAfter,
      isOverflowing,
      moveOverflowOnePage,
      opts.minFillRatio,
      opts.underfillPull,
      pageApi,
      pullUnderflowOnePage,
      waitForPageReady,
    ]
  );

  const requestReflow = React.useCallback(
    (startPageId) => {
      if (!startPageId) return;
      if (runningRef.current) {
        queuedStartIdRef.current = startPageId;
        return;
      }
      void runReflow(startPageId);
    },
    [runReflow]
  );

  // Convenience: when layout changes, reflow from the first page.
  React.useEffect(() => {
    const firstId = pagesRef.current?.[0]?.id;
    if (firstId) requestReflow(firstId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutMode]);

  return { requestReflow };
}

