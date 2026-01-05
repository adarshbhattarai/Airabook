import React, { useState, useCallback, useEffect } from 'react';
import ReactFlow, {
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
    Handle,
    Position,
    useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';

import { ArrowLeft, Save, Play, Plus, Sparkles, User, BookOpen } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { AppInput } from '@/components/ui/input';

// Custom Node for Chapters
const ChapterNode = ({ data }) => {
    return (
        <div className="px-4 py-2 shadow-md rounded-md bg-white border-2 border-app-iris w-64">
            <div className="flex items-center mb-1">
                <div className="rounded-full w-6 h-6 flex items-center justify-center bg-app-iris/10 text-app-iris font-bold text-[10px] mr-2">
                    CH
                </div>
                <div className="text-sm font-bold text-gray-800">{data.label}</div>
            </div>
            <div className='text-xs text-gray-500 line-clamp-2 leading-tight'>{data.summary || "No summary"}</div>
            <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-app-iris" />
            <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-app-iris" />
        </div>
    );
};

// Custom Node for Pages
const PageNode = ({ data }) => {
    return (
        <div className="px-3 py-2 shadow-sm rounded-md bg-white border border-gray-200 w-48">
            <div className="flex items-center mb-2">
                <BookOpen className="w-3 h-3 text-gray-400 mr-1.5" />
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Page</div>
            </div>
            <div className="text-xs text-gray-800 italic line-clamp-3">"{data.label}"</div>
            {data.image && (
                <div className="mt-2 h-16 w-full bg-gray-100 rounded overflow-hidden">
                    <img src={data.image} alt="page" className="object-cover w-full h-full opacity-80" />
                </div>
            )}
            <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-gray-400" />
            <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-gray-400" />
        </div>
    );
};

// Custom Node for Characters
const CharacterNode = ({ data }) => {
    return (
        <div className="px-3 py-2 shadow-sm rounded-full bg-white border-2 border-orange-300 min-w-[120px]">
            <div className="flex items-center justify-center gap-2">
                <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center text-orange-500">
                    <User className="w-3 h-3" />
                </div>
                <div className="text-xs font-bold text-gray-700">{data.label}</div>
            </div>
            <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-orange-400" />
            <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-orange-400" />
        </div>
    );
};

const nodeTypes = {
    chapter: ChapterNode,
    page: PageNode,
    character: CharacterNode
};

const initialNodes = [
    { id: 'start', type: 'chapter', position: { x: 50, y: 300 }, data: { label: 'Start Here', summary: 'Drag nodes from the sidebar!' } },
];

const AdvancedBookBuilder = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { toast } = useToast();
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    // Title from state or fallback
    const bookTitle = location.state?.title || "New Book Project";

    const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

    const addNode = (type) => {
        const id = `${type}-${Date.now()}`;
        const x = Math.random() * 300 + 100;
        const y = Math.random() * 300 + 100;

        let data = { label: `New ${type}` };
        if (type === 'chapter') data = { label: 'New Chapter', summary: 'Chapter description...' };
        if (type === 'character') data = { label: 'New Character' };

        const newNode = {
            id,
            type,
            position: { x, y },
            data,
        };
        setNodes((nds) => [...nds, newNode]);
    };

    const handleAiGenerate = () => {
        if (!prompt.trim()) {
            toast({ title: "Empty Prompt", description: "Please enter a prompt to generate chapters.", variant: "destructive" });
            return;
        }

        setIsGenerating(true);

        // MOCK AI GENERATION
        setTimeout(() => {
            const newNodes = [];
            const newEdges = [];
            const startX = 400;
            let currentY = 100;

            // Create Character
            const charId = `char-${Date.now()}`;
            newNodes.push({
                id: charId,
                type: 'character',
                position: { x: startX, y: 50 },
                data: { label: 'Protagonist' }
            });

            // Create 3 generated chapters linked to char
            for (let i = 1; i <= 3; i++) {
                const chId = `gen-ch-${i}-${Date.now()}`;
                newNodes.push({
                    id: chId,
                    type: 'chapter',
                    position: { x: startX + (i * 300), y: 300 },
                    data: { label: `Chapter ${i}: The Quest`, summary: `AI generated summary for chapter ${i} based on "${prompt}"` }
                });

                // Edge from Character to Chapter 1
                if (i === 1) {
                    newEdges.push({ id: `e-${charId}-${chId}`, source: charId, target: chId });
                }
                // Link sequential chapters
                if (i > 1) {
                    const prevChId = `gen-ch-${i - 1}-${Date.now()}`; // Note: This ID logic is flawed for simulation, simple linking:
                    // Simplified linkage for mock:
                    // In real dev, we would track IDs properly.
                }
            }

            setNodes((nds) => [...nds, ...newNodes]);
            setEdges((eds) => [...eds, ...newEdges]);
            setIsGenerating(false);
            toast({ title: "AI Generation Complete", description: "Created chapters and characters from your prompt." });
        }, 1500);
    };

    const handleSave = () => {
        // Saving Strategy Strategy:
        // We can use the viewport and nodes/edges state.
        // const flow = reactFlowInstance.toObject();
        // saveToFirebase(flow);
        const graphState = {
            nodes,
            edges,
            viewport: { x: 0, y: 0, zoom: 1 } // Simplified, cleaner would be useReactFlow().toObject()
        };

        console.log("Saving graph state to DB:", JSON.stringify(graphState, null, 2));
        toast({
            title: "Saved Draft",
            description: "Graph state saved to database (mock).",
        });
    }

    return (
        <div className="h-screen flex flex-col bg-white">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between z-10 shadow-sm">
                <div className="flex items-center gap-4 w-1/3">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-900">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div className="flex flex-col">
                        <span className="text-xs text-gray-500 font-medium">Advanced Builder</span>
                    </div>
                </div>

                {/* CENTER TITLE */}
                <div className="flex-1 flex justify-center">
                    <h1 className="text-lg font-bold text-gray-900 truncate max-w-md px-4 py-1 bg-gray-50 rounded-full border border-gray-100 shadow-sm">
                        {bookTitle}
                    </h1>
                </div>

                <div className="flex items-center justify-end gap-3 w-1/3">
                    <Button variant="outline" size="sm" onClick={handleSave} className="gap-2 text-xs h-8">
                        <Save className="w-3.5 h-3.5" />
                        Save
                    </Button>
                    <Button variant="appPrimary" size="sm" className="gap-2 text-xs h-8 shadow-sm">
                        <Play className="w-3.5 h-3.5" />
                        Run Book
                    </Button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar */}
                <aside className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col z-10 overflow-y-auto custom-scrollbar">

                    {/* AI Prompt Section */}
                    <div className="p-4 border-b border-gray-200 bg-white shadow-[0_4px_20px_-12px_rgba(0,0,0,0.1)] z-10">
                        <div className="flex items-center gap-2 mb-3">
                            <Sparkles className="w-4 h-4 text-app-iris" />
                            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">AI Assistant</h3>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">Describe your story idea to generate chapter nodes and characters instantly.</p>
                        <Textarea
                            placeholder="A fantasy story about a lost dragon finding its way home..."
                            className="text-xs min-h-[80px] mb-3 resize-none bg-gray-50 border-gray-200 focus:bg-white transition-all"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                        />
                        <Button
                            className="w-full text-xs bg-gradient-to-r from-app-iris to-app-violet text-white border-0 hover:opacity-90"
                            size="sm"
                            onClick={handleAiGenerate}
                            disabled={isGenerating}
                        >
                            {isGenerating ? <Sparkles className="w-3 h-3 animate-spin mr-2" /> : <Sparkles className="w-3 h-3 mr-2" />}
                            {isGenerating ? 'Dreaming...' : 'Generate Graph'}
                        </Button>
                    </div>

                    {/* Manual Tools */}
                    <div className="p-5">
                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 pl-1">Manual Nodes</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => addNode('chapter')}
                                className="flex flex-col items-center justify-center p-3 bg-white border border-gray-200 rounded-xl hover:border-app-iris hover:bg-app-iris/5 hover:shadow-md transition-all group"
                            >
                                <div className="w-8 h-8 rounded-full bg-app-iris/10 text-app-iris flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                    <span className="font-bold text-xs">CH</span>
                                </div>
                                <span className="text-xs font-medium text-gray-600 group-hover:text-app-iris">Chapter</span>
                            </button>

                            <button
                                onClick={() => addNode('page')}
                                className="flex flex-col items-center justify-center p-3 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 hover:shadow-md transition-all group"
                            >
                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-500 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                    <BookOpen className="w-4 h-4" />
                                </div>
                                <span className="text-xs font-medium text-gray-600 group-hover:text-blue-600">Page</span>
                            </button>

                            <button
                                onClick={() => addNode('character')}
                                className="flex flex-col items-center justify-center p-3 bg-white border border-gray-200 rounded-xl hover:border-orange-400 hover:bg-orange-50 hover:shadow-md transition-all group"
                            >
                                <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-500 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                    <User className="w-4 h-4" />
                                </div>
                                <span className="text-xs font-medium text-gray-600 group-hover:text-orange-600">Character</span>
                            </button>
                        </div>
                    </div>
                </aside>

                {/* Graph Canvas */}
                <div className="flex-1 bg-gray-100 relative">
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        nodeTypes={nodeTypes}
                        fitView
                        className="bg-gray-50"
                        minZoom={0.2}
                        maxZoom={1.5}
                        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
                        deleteKeyCode={['Backspace', 'Delete']}
                    >
                        <Controls className="!bg-white !border-gray-200 !shadow-sm !m-4 !rounded-lg" />
                        <MiniMap className="!bg-white !border-gray-200 !shadow-sm !bottom-4 !right-4 !rounded-lg" zoomable pannable />
                        <Background gap={20} size={1} color="#e2e8f0" />
                    </ReactFlow>
                </div>
            </div>
        </div>
    );
};

export default AdvancedBookBuilder;
