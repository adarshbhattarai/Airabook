import React, { useEffect, useState, useImperativeHandle, forwardRef } from "react";
import "@blocknote/core/fonts/inter.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";

// Helper to reliably parse HTML into blocks
const BlockEditor = forwardRef(({ initialContent, onChange, onSave, onFocus }, ref) => {
    // Create editor instance
    const editor = useCreateBlockNote({
        initialContent: undefined, // We'll handle initial content manually
    });

    const [isLoaded, setIsLoaded] = useState(false);

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
        insertHTML: async (html) => {
            if (!editor) return;

            const blocks = await editor.tryParseHTMLToBlocks(html);
            const currentBlock = editor.getTextCursorPosition().block;

            if (currentBlock) {
                editor.insertBlocks(blocks, currentBlock, "after");
            } else {
                // Fallback if no cursor
                const count = editor.document.length;
                const lastBlock = editor.document[count - 1];
                editor.insertBlocks(blocks, lastBlock, "after");
            }
        },
        setHTML: async (html) => {
            if (!editor) return;
            const blocks = await editor.tryParseHTMLToBlocks(html);
            editor.replaceBlocks(editor.document, blocks);
        },
        getHTML: async () => {
            if (!editor) return "";
            return await editor.blocksToFullHTML(editor.document);
        },
        focus: () => {
            if (editor) {
                editor.focus();
                return true;
            }
            return false;
        }
    }));

    // Initialize content
    useEffect(() => {
        if (editor && !isLoaded) {
            const loadContent = async () => {
                if (initialContent) {
                    const blocks = await editor.tryParseHTMLToBlocks(initialContent);
                    editor.replaceBlocks(editor.document, blocks);
                }
                setIsLoaded(true);
            };
            loadContent();
        }
    }, [editor, initialContent, isLoaded]);

    // Handle changes
    const handleChange = async () => {
        if (onChange && isLoaded) {
            const html = await editor.blocksToFullHTML(editor.document);
            onChange(html);
        }
    };

    if (!editor) {
        return <div>Loading Editor...</div>;
    }

    return (
        <div
            className="w-full h-full min-h-[500px]"
            onFocus={onFocus} // Trigger focus event when user clicks or types
            tabIndex={-1} // Allow div to focus if needed, but usually editor children handle it
        >
            <BlockNoteView
                editor={editor}
                onChange={handleChange}
                theme={"light"}
            />
        </div>
    );
});

export default BlockEditor;
