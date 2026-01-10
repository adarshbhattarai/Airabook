import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback, useMemo } from "react";
import "@blocknote/core/fonts/inter.css";
import { useCreateBlockNote, SuggestionMenuController, getDefaultReactSlashMenuItems } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { ImageIcon, ImagePlus } from "lucide-react";

// Marker URL to identify dropzone placeholder blocks
const DROPZONE_MARKER = "data:dropzone/placeholder";

// Helper to reliably parse HTML into blocks
const BlockEditor = forwardRef(
  (
    {
      initialContent,
      initialBlocks,
      onChange, // legacy: emits HTML
      onBlocksChange,
      onSave,
      onFocus,
      onMediaRequest, // NEW: callback when /media command is triggered
    },
    ref
  ) => {
    // Create editor instance
    const editor = useCreateBlockNote({
      initialContent: undefined, // We'll handle initial content manually
    });

    const [isLoaded, setIsLoaded] = useState(false);

    // Store the onMediaRequest callback in a ref so we can access it
    const onMediaRequestRef = useRef(onMediaRequest);
    useEffect(() => {
      onMediaRequestRef.current = onMediaRequest;
    }, [onMediaRequest]);

    // Track pending dropzone block ID
    const pendingDropzoneIdRef = useRef(null);

    // Track saved cursor position for external media insertion (from dropzone click)
    const savedCursorBlockIdRef = useRef(null);

    // Custom /media item - adds to page.media[] section (for ebook review)
    const customMediaItem = useMemo(() => ({
      title: "Media",
      onItemClick: () => {
        // Open the media picker dialog - media will be added to page.media[] array
        if (onMediaRequestRef.current) {
          onMediaRequestRef.current();
        }
      },
      aliases: ["upload", "gallery", "video", "media"],
      group: "Media",
      icon: <ImageIcon className="h-4 w-4" />,
      subtext: "Add media to page media section (for ebook review)",
    }), []);

    // Custom /image item - inserts inline image block in editor (50% width, centered)
    const customImageItem = useMemo(() => ({
      title: "Image",
      onItemClick: () => {
        // Insert a placeholder image block that acts as a dropzone for inline image
        if (editor) {
          const currentBlock = editor.getTextCursorPosition().block;
          const dropzoneBlock = {
            type: "image",
            props: {
              url: DROPZONE_MARKER,
              caption: "Click to add inline image",
              previewWidth: 154, // 30% width for centered inline images
              textAlignment: "center",
              name: JSON.stringify({ isDropzone: true, isInline: true })
            }
          };

          let insertedBlockId = null;

          if (currentBlock) {
            editor.insertBlocks([dropzoneBlock], currentBlock, "after");
            // Get the ID of the newly inserted block
            const idx = editor.document.findIndex(b => b.id === currentBlock.id);
            if (idx >= 0 && editor.document[idx + 1]) {
              insertedBlockId = editor.document[idx + 1].id;
            }
          } else {
            const count = editor.document.length;
            if (count > 0) {
              const lastBlock = editor.document[count - 1];
              editor.insertBlocks([dropzoneBlock], lastBlock, "after");
              insertedBlockId = editor.document[editor.document.length - 1]?.id;
            }
          }

          // Store the block ID for later replacement
          if (insertedBlockId) {
            pendingDropzoneIdRef.current = insertedBlockId;
          }

          // Open the media picker dialog (will insert as inline block)
          if (onMediaRequestRef.current) {
            onMediaRequestRef.current('inline');
          }
        }
      },
      aliases: ["image", "picture", "photo", "img"],
      group: "Media",
      icon: <ImagePlus className="h-4 w-4" />,
      subtext: "Insert inline image between text (50% width, centered)",
    }), [editor]);

    // Helper function to filter items based on query
    const filterItems = (items, query) => {
      if (!query || query.length === 0) return items;

      const lowerQuery = query.toLowerCase();
      return items.filter(item => {
        // Match against title
        if (item.title?.toLowerCase().includes(lowerQuery)) return true;
        // Match against aliases
        if (item.aliases?.some(alias => alias.toLowerCase().includes(lowerQuery))) return true;
        // Match against group
        if (item.group?.toLowerCase().includes(lowerQuery)) return true;
        return false;
      });
    };

    // Get slash menu items: our custom media items + filtered defaults (no duplicate Image/Video)
    const getCustomSlashMenuItems = useCallback(async (query) => {
      // Get default items from BlockNote (headings, lists, etc.)
      const defaultItems = getDefaultReactSlashMenuItems(editor);

      // Filter out default Image and Video items - we have our own custom handlers
      const filteredDefaults = defaultItems.filter(item => {
        const title = item.title?.toLowerCase();
        // Remove built-in Image and Video since we handle those
        if (title === 'image' || title === 'video') return false;
        return true;
      });

      // Combine custom media items with filtered defaults (our items first)
      const allItems = [customMediaItem, customImageItem, ...filteredDefaults];

      // Filter items based on query
      return filterItems(allItems, query);
    }, [editor, customMediaItem, customImageItem]);
    const suppressChangeRef = useRef(false);
    const pendingUnsuppressRef = useRef(null);

    const unsuppressSoon = () => {
      if (pendingUnsuppressRef.current) {
        clearTimeout(pendingUnsuppressRef.current);
      }
      pendingUnsuppressRef.current = setTimeout(() => {
        suppressChangeRef.current = false;
      }, 0);
    };

    const cloneBlocks = (blocks) => {
      // BlockNote blocks are JSON-ish; structuredClone is safest when available.
      try {
        return structuredClone(blocks);
      } catch (_) {
        return JSON.parse(JSON.stringify(blocks ?? []));
      }
    };

    // Helper function to insert media blocks (shared by all insert methods)
    const doInsertMediaBlocks = (media = []) => {
      if (!editor || !media || media.length === 0) return false;

      try {
        // Create blocks for each media item
        const mediaBlocks = media.map((item) => {
          const isVideo = item.type === 'video';

          // Store custom metadata as JSON string in name/caption
          const metadata = JSON.stringify({
            storagePath: item.storagePath || null,
            albumId: item.albumId || null,
            originalName: item.name || null,
            mediaType: item.type || 'image',
          });

          if (isVideo) {
            // BlockNote has a 'video' block type
            return {
              type: "video",
              props: {
                url: item.url,
                caption: item.caption || item.name || "",
                previewWidth: 512,
                name: metadata,
              },
            };
          } else {
            // Image block - use previewWidth from item if provided, otherwise default to 512
            return {
              type: "image",
              props: {
                url: item.url,
                caption: item.caption || item.name || "",
                previewWidth: item.previewWidth || 512,
                textAlignment: "center",
                name: metadata,
              },
            };
          }
        });

        // Try to use saved cursor position first (from external dropzone click)
        let targetBlock = null;

        if (savedCursorBlockIdRef.current) {
          // Use saved position from dropzone click
          targetBlock = editor.document.find(b => b.id === savedCursorBlockIdRef.current);
          savedCursorBlockIdRef.current = null; // Clear after use
        }

        if (!targetBlock) {
          // Fallback to current cursor position
          targetBlock = editor.getTextCursorPosition()?.block;
        }

        if (targetBlock) {
          // Insert after target block
          editor.insertBlocks(mediaBlocks, targetBlock, "after");
        } else {
          // Fallback: append to end
          const count = editor.document.length;
          if (count > 0) {
            const lastBlock = editor.document[count - 1];
            editor.insertBlocks(mediaBlocks, lastBlock, "after");
          } else {
            // Document is empty, replace with media blocks
            editor.replaceBlocks(editor.document, mediaBlocks);
          }
        }

        return true;
      } catch (error) {
        console.error("Failed to insert media blocks:", error);
        return false;
      }
    };

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
      insertHTML: async (html, options = {}) => {
        if (!editor) return;
        const silent = !!options.silent;

        const blocks = await editor.tryParseHTMLToBlocks(html);
        const currentBlock = editor.getTextCursorPosition().block;

        if (silent) {
          suppressChangeRef.current = true;
        }
        if (currentBlock) {
          editor.insertBlocks(blocks, currentBlock, "after");
        } else {
          // Fallback if no cursor
          const count = editor.document.length;
          const lastBlock = editor.document[count - 1];
          editor.insertBlocks(blocks, lastBlock, "after");
        }
        if (silent) unsuppressSoon();
      },
      setHTML: async (html, options = {}) => {
        if (!editor) return;
        const silent = !!options.silent;
        const blocks = await editor.tryParseHTMLToBlocks(html);
        if (silent) {
          suppressChangeRef.current = true;
        }
        editor.replaceBlocks(editor.document, blocks);
        if (silent) unsuppressSoon();
      },
      getHTML: async () => {
        if (!editor) return "";
        return await editor.blocksToFullHTML(editor.document);
      },
      getBlocks: () => {
        if (!editor) return [];
        return cloneBlocks(editor.document);
      },
      setBlocks: (blocks, options = {}) => {
        if (!editor) return;
        const silent = !!options.silent;
        if (silent) {
          suppressChangeRef.current = true;
        }
        editor.replaceBlocks(editor.document, blocks || []);
        if (silent) unsuppressSoon();
      },
      focus: () => {
        if (editor) {
          editor.focus();
          return true;
        }
        return false;
      },
      focusBlock: (blockId, pos = "start") => {
        if (!editor) return false;
        const block = editor.document.find((b) => b.id === blockId);
        if (block) {
          editor.setTextCursorPosition(block, pos);
          editor.focus();
          return true;
        }
        return false;
      },
      getSelection: () => {
        return editor?.getSelection();
      },
      getActiveBlockId: () => {
        return editor?.getTextCursorPosition()?.block?.id;
      },
      isCursorInLastBlock: () => {
        if (!editor) return false;
        const currentBlock = editor.getTextCursorPosition()?.block;
        if (!currentBlock) return false;
        const lastBlock = editor.document[editor.document.length - 1];
        return currentBlock.id === lastBlock?.id;
      },
      isCursorAtEndOfPage: () => {
        if (!editor) return false;
        const pos = editor.getTextCursorPosition();
        if (!pos?.block) return false;

        const lastBlock = editor.document[editor.document.length - 1];

        // Debug logs
        console.log('[BlockEditor] isCursorAtEndOfPage check:', {
          posBlockId: pos.block.id,
          lastBlockId: lastBlock?.id,
          hasNextBlock: !!pos.nextBlock
        });

        if (pos.block.id !== lastBlock?.id) return false;
        // if (pos.nextBlock) return false; // Relaxed check: if in last block, assume okay for now.

        return true;
      },
      isCursorAtStartOfPage: () => {
        if (!editor) return false;
        const pos = editor.getTextCursorPosition();
        if (!pos?.block) return false;
        const firstBlock = editor.document[0];
        const offset = typeof pos.textOffset === 'number'
          ? pos.textOffset
          : (typeof pos.offset === 'number' ? pos.offset : null);
        if (offset !== null && offset !== 0) return false;
        return pos.block.id === firstBlock?.id && !pos.prevBlock;
      },
      // Insert media blocks (images and/or videos) at cursor position
      // media: array of { url, storagePath?, albumId?, name?, caption?, type: 'image' | 'video' }
      insertMediaBlocks: doInsertMediaBlocks,
      // Replace the pending dropzone block with actual media blocks
      replaceDropzoneWithMedia: (media = []) => {
        if (!editor || !media || media.length === 0) return false;

        const dropzoneId = pendingDropzoneIdRef.current;
        if (!dropzoneId) {
          // No pending dropzone, just insert at cursor
          return doInsertMediaBlocks(media);
        }

        try {
          // Find the dropzone block
          const dropzoneBlock = editor.document.find(b => b.id === dropzoneId);
          if (!dropzoneBlock) {
            // Dropzone not found, insert at cursor instead
            pendingDropzoneIdRef.current = null;
            return doInsertMediaBlocks(media);
          }

          // Create media blocks
          const mediaBlocks = media.map((item) => {
            const isVideo = item.type === 'video';
            const metadata = JSON.stringify({
              storagePath: item.storagePath || null,
              albumId: item.albumId || null,
              originalName: item.name || null,
              mediaType: item.type || 'image',
            });

            return {
              type: isVideo ? "video" : "image",
              props: {
                url: item.url,
                caption: item.caption || item.name || "",
                previewWidth: item.previewWidth || 512,
                textAlignment: "center",
                name: metadata,
              },
            };
          });

          // Replace the dropzone block with media blocks
          editor.replaceBlocks([dropzoneBlock], mediaBlocks);
          pendingDropzoneIdRef.current = null;

          return true;
        } catch (error) {
          console.error("Failed to replace dropzone with media:", error);
          pendingDropzoneIdRef.current = null;
          return false;
        }
      },
      // Check if there's a pending dropzone
      hasPendingDropzone: () => {
        return !!pendingDropzoneIdRef.current;
      },
      // Clear pending dropzone (if user cancels)
      clearPendingDropzone: () => {
        // Remove the placeholder dropzone block if it exists
        if (editor && pendingDropzoneIdRef.current) {
          const dropzoneBlock = editor.document.find(b => b.id === pendingDropzoneIdRef.current);
          if (dropzoneBlock) {
            editor.removeBlocks([dropzoneBlock]);
          }
        }
        pendingDropzoneIdRef.current = null;
        savedCursorBlockIdRef.current = null;
      },
      // Save current cursor position for later media insertion
      saveCursorPosition: () => {
        if (!editor) return false;
        const currentBlock = editor.getTextCursorPosition()?.block;
        if (currentBlock) {
          savedCursorBlockIdRef.current = currentBlock.id;
          return true;
        }
        return false;
      },
      // Clear saved cursor position
      clearSavedCursorPosition: () => {
        savedCursorBlockIdRef.current = null;
      },
      // Legacy: Insert image blocks only (for backward compatibility)
      insertImageBlocks: (images = []) => {
        if (!editor || !images || images.length === 0) return false;
        // Map to include type: 'image' and use the shared helper
        const media = images.map(img => ({ ...img, type: 'image' }));
        return doInsertMediaBlocks(media);
      },
      // Insert video blocks only
      insertVideoBlocks: (videos = []) => {
        if (!editor || !videos || videos.length === 0) return false;
        // Map to include type: 'video' and use the shared helper
        const media = videos.map(vid => ({ ...vid, type: 'video' }));
        return doInsertMediaBlocks(media);
      },
      // Helper to extract metadata from image/video block name prop
      getMediaBlockMetadata: (block) => {
        if (!['image', 'video'].includes(block?.type) || !block?.props?.name) return null;
        try {
          return JSON.parse(block.props.name);
        } catch {
          return null;
        }
      },
      // Legacy alias
      getImageBlockMetadata: (block) => {
        if (block?.type !== "image" || !block?.props?.name) return null;
        try {
          return JSON.parse(block.props.name);
        } catch {
          return null;
        }
      },
    }));

    // Initialize content
    useEffect(() => {
      if (editor && !isLoaded) {
        const loadContent = async () => {
          // Prefer blocks if provided, fallback to HTML.
          if (Array.isArray(initialBlocks)) {
            suppressChangeRef.current = true;
            // Ensure at least one empty paragraph block exists for the editor to be interactive
            const blocksToLoad = initialBlocks.length > 0 ? initialBlocks : [{ type: "paragraph", content: [] }];
            editor.replaceBlocks(editor.document, blocksToLoad);
            unsuppressSoon();
          } else if (initialContent) {
            const blocks = await editor.tryParseHTMLToBlocks(initialContent);
            suppressChangeRef.current = true;
            // Ensure at least one empty paragraph block exists
            const blocksToLoad = blocks.length > 0 ? blocks : [{ type: "paragraph", content: [] }];
            editor.replaceBlocks(editor.document, blocksToLoad);
            unsuppressSoon();
          }
          setIsLoaded(true);
        };
        loadContent();
      }
    }, [editor, initialContent, initialBlocks, isLoaded]);

    // Handle changes
    const handleChange = async () => {
      if (!editor || !isLoaded) return;
      if (suppressChangeRef.current) return;

      if (onBlocksChange) {
        onBlocksChange(cloneBlocks(editor.document));
      }
      if (onChange) {
        const html = await editor.blocksToFullHTML(editor.document);
        onChange(html);
      }
    };

    if (!editor) {
      return <div>Loading Editor...</div>;
    }

    return (
      <div
        className="w-full h-full min-h-0"
        onFocus={onFocus} // Trigger focus event when user clicks or types
        tabIndex={-1} // Allow div to focus if needed, but usually editor children handle it
      >
        <BlockNoteView
          editor={editor}
          onChange={handleChange}
          theme={"light"}
          slashMenu={false} // Disable default, we'll use custom
        >
          {/* Custom Slash Menu with /media command */}
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={getCustomSlashMenuItems}
          />
        </BlockNoteView>
      </div>
    );
  }
);

export default BlockEditor;
