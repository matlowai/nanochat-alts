import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';

import { BookOpen, Code, Layers, Search, X, MessageSquare, Send, HelpCircle, ZoomIn, ZoomOut, Maximize2, Play, Settings } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import VizContainer from './components/VizContainer';
import ModelSelector from './components/ModelSelector';
import SettingsModal from './components/SettingsModal';
import FocusList from './components/FocusList';
import ChatHistory from './components/ChatHistory';
import UserSelector from './components/UserSelector';
import ContextInspector from './components/ContextInspector';
import { exchangeCodeForKey } from './utils/auth';
import { createConversation, getMessages, addMessage, getOrCreateGuestUser, getLearnerProfile, getContextSettings, buildConversationContext, saveTurnSummary } from './utils/db';
import './App.css';

function App() {
  const svgRef = useRef(null);
  const [data, setData] = useState({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [markdownContent, setMarkdownContent] = useState('');
  const [codeContent, setCodeContent] = useState('');
  const [executionOutput, setExecutionOutput] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  // Chat State
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "👋 Hi! I'm NanoChat. I can help you navigate this codebase. Are you new here, or looking for something specific?" }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [highlightedNodes, setHighlightedNodes] = useState(new Set());
  const [focusedNodeIds, setFocusedNodeIds] = useState([]);
  const [relatedNodeIds, setRelatedNodeIds] = useState([]);
  const [helpOpen, setHelpOpen] = useState(false);

  // Concept Navigation Graph
  const [conceptGraph, setConceptGraph] = useState({});

  // Chat History State
  const [currentConversationId, setCurrentConversationId] = useState(null);

  // User Profile State
  const [currentUserId, setCurrentUserId] = useState(null);
  const [learnerProfile, setLearnerProfile] = useState(null);
  const [contextSettings, setContextSettings] = useState(null);

  // Context Inspector State
  const [contextInspectorOpen, setContextInspectorOpen] = useState(false);
  const [contextSegments, setContextSegments] = useState([]);
  const [tokenBudget, setTokenBudget] = useState({ used: 0, total: 100000 });

  // Draggable Chat State
  const [chatPosition, setChatPosition] = useState({ x: 100, y: window.innerHeight - 580 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem('selectedModel') || "google/gemini-2.0-flash-exp:free";
  });

  // API Key State
  const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('userApiKey'));
  const [keyType, setKeyType] = useState(() => localStorage.getItem('keyType')); // 'manual' or 'oauth'

  // Handle OAuth Callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      // Clear code from URL
      window.history.replaceState({}, document.title, window.location.pathname);

      exchangeCodeForKey(code)
        .then(key => {
          handleSaveKey(key, 'oauth');
          setSettingsOpen(true); // Open settings to show success
        })
        .catch(err => {
          console.error("OAuth Error:", err);
          alert("Failed to login with OpenRouter. See console.");
        });
    }
  }, []);

  const handleSaveKey = (key, type) => {
    if (key) {
      localStorage.setItem('userApiKey', key);
      localStorage.setItem('keyType', type);
      setUserApiKey(key);
      setKeyType(type);
    } else {
      localStorage.removeItem('userApiKey');
      localStorage.removeItem('keyType');
      setUserApiKey(null);
      setKeyType(null);
    }
  };

  useEffect(() => {
    localStorage.setItem('selectedModel', selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    fetch('/knowledge_graph.json')
      .then(res => res.json())
      .then(d => setData(d));

    // Load concept navigation graph
    fetch('/concept_graph.json')
      .then(res => res.json())
      .then(d => setConceptGraph(d))
      .catch(() => console.log('No concept graph found'));
  }, []);

  // Load user profile when user changes
  useEffect(() => {
    const loadUserData = async () => {
      if (currentUserId) {
        const profile = await getLearnerProfile(currentUserId);
        const settings = await getContextSettings(currentUserId);
        setLearnerProfile(profile);
        setContextSettings(settings);
      }
    };
    loadUserData();
  }, [currentUserId]);

  useEffect(() => {
    if (selectedNode) {
      setExecutionOutput(null); // Reset output on node change

      if (selectedNode.type === 'file') {
        // Fetch code
        // Actually, the ID is like "nanochat/gpt.py".
        fetch(`/code/${selectedNode.id}`)
          .then(res => {
            if (res.ok) return res.text();
            throw new Error('Not found');
          })
          .then(text => setCodeContent(text))
          .catch(() => setCodeContent('Source code not found.'));
        setMarkdownContent(''); // Clear markdown if a file is selected
      } else if (selectedNode.status !== 'missing' && selectedNode.status !== 'external') {
        // Fetch markdown (existing logic)
        // Strip 'concept:' prefix if present for the file path
        const kbPath = selectedNode.id.startsWith('concept:')
          ? selectedNode.id.replace('concept:', '')
          : selectedNode.id;
        fetch(`/kb/${kbPath}.md`)
          .then(res => {
            if (res.ok) return res.text();
            throw new Error('Not found');
          })
          .then(text => setMarkdownContent(text))
          .catch(() => setMarkdownContent('No documentation found for this concept.'));
        setCodeContent(''); // Clear code if a non-file is selected
      } else {
        setMarkdownContent('');
        setCodeContent('');
      }
    } else {
      setMarkdownContent('');
      setCodeContent('');
      setExecutionOutput(null);
    }
  }, [selectedNode]);

  const runCode = async () => {
    if (!codeContent) return;
    setIsRunning(true);
    setExecutionOutput(null);
    try {
      const res = await fetch('http://localhost:8999/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeContent })
      });
      const data = await res.json();
      setExecutionOutput(data);
    } catch (err) {
      setExecutionOutput({ status: 'error', stderr: 'Failed to connect to Bridge: ' + err.message });
    } finally {
      setIsRunning(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMsg = { role: 'user', content: inputMessage };
    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsChatting(true);

    // Ensure we have a conversation
    let convoId = currentConversationId;
    if (!convoId) {
      convoId = await createConversation(inputMessage.substring(0, 50) || 'New Chat', currentUserId);
      setCurrentConversationId(convoId);
    }

    // Save user message to IndexedDB
    await addMessage(convoId, 'user', inputMessage);

    // Build tiered conversation memory
    const conversationMemory = await buildConversationContext(convoId, contextSettings);

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (userApiKey) {
        headers['Authorization'] = `Bearer ${userApiKey}`;
      }

      const res = await fetch('http://localhost:8999/chat', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          message: inputMessage,
          model: selectedModel,
          viewing_node: selectedNode?.id || null,
          related_nodes: relatedNodeIds || [],
          learner_profile: learnerProfile,
          context_settings: contextSettings,
          conversation_memory: conversationMemory
        })
      });
      const data = await res.json();

      const botMsg = { role: 'assistant', content: data.response };
      setMessages(prev => [...prev, botMsg]);

      // Save assistant message to IndexedDB
      const msgId = await addMessage(convoId, 'assistant', data.response);

      // Handle focus
      if (data.focused_nodes && data.focused_nodes.length > 0) {
        setFocusedNodeIds(data.focused_nodes);
        setHighlightedNodes(new Set(data.focused_nodes));
      }

      // Handle context (related nodes)
      if (data.context_nodes && data.context_nodes.length > 0) {
        setRelatedNodeIds(data.context_nodes);
      } else {
        setRelatedNodeIds([]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: ' + err.message }]);
    } finally {
      setIsChatting(false);
    }
  };

  // Build context segments for Context Inspector
  const buildContextSegments = async () => {
    const segments = [];

    // System prompt segment
    segments.push({
      id: 'system_prompt',
      label: 'System Prompt',
      type: 'system',
      content: 'NanoChat educational AI assistant with knowledge graph context...',
      tokenCount: 2000,
      included: true,
      isCompacted: false
    });

    // Learner profile segment
    if (learnerProfile) {
      const profileContent = `Expertise: ${learnerProfile.expertise_level || 'beginner'}\nTopics: ${JSON.stringify(learnerProfile.topics || {})}`;
      segments.push({
        id: 'learner_profile',
        label: 'Learner Profile',
        type: 'profile',
        content: profileContent,
        tokenCount: Math.ceil(profileContent.length / 4),
        included: true,
        isCompacted: false
      });
    }

    // Current viewing context
    if (selectedNode) {
      const nodeContent = `Viewing: ${selectedNode.id}\nType: ${selectedNode.type}\nDocstring: ${selectedNode.docstring || 'N/A'}`;
      segments.push({
        id: 'viewing_context',
        label: `Viewing: ${selectedNode.label || selectedNode.id}`,
        type: 'viewing',
        content: nodeContent,
        tokenCount: Math.ceil(nodeContent.length / 4),
        included: true,
        isCompacted: false
      });
    }

    // Conversation memory
    if (currentConversationId) {
      const memory = await buildConversationContext(currentConversationId, contextSettings);

      // Combine all turns and sort by createdAt
      const allTurns = [];

      // Full text turns
      memory.fullTurns.forEach((turn) => {
        allTurns.push({
          ...turn,
          isFull: true,
          isTieredSummary: false,
          displayContent: turn.content
        });
      });

      // Summary turns
      memory.summaryTurns.forEach((turn) => {
        allTurns.push({
          ...turn,
          isFull: false,
          isTieredSummary: true,
          displayContent: turn.summary
        });
      });

      // Sort by createdAt ascending (oldest first)
      allTurns.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      // Add to segments with proper turn numbering
      allTurns.forEach((turn, i) => {
        const tierLabel = turn.isFull ? 'full' : 'summary';
        segments.push({
          id: `turn_${tierLabel}_${turn.id}`,
          label: `Turn ${i + 1} (${turn.role}) - ${tierLabel}`,
          type: 'turn',
          content: turn.displayContent,
          originalContent: turn.originalContent || turn.content,
          tokenCount: turn.tokenCount || Math.ceil(turn.displayContent.length / 4),
          originalTokenCount: Math.ceil((turn.originalContent || turn.content).length / 4),
          included: true,
          isCompacted: false,
          isTieredSummary: turn.isTieredSummary,
          hasSummary: turn.hasSummary,
          createdAt: turn.createdAt
        });
      });
    }

    return segments;
  };

  // Open Context Inspector with current context
  const openContextInspector = async () => {
    const segments = await buildContextSegments();
    setContextSegments(segments);

    // Calculate token budget
    const totalUsed = segments.filter(s => s.included).reduce((sum, s) => sum + s.tokenCount, 0);
    const budgetMax = contextSettings?.context_budget_max_tokens || 100000;
    setTokenBudget({ used: totalUsed, total: budgetMax });

    setContextInspectorOpen(true);
  };

  // Drag handlers for chat window
  const handleMouseDown = (e) => {
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - chatPosition.x,
      y: e.clientY - chatPosition.y
    };
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    setChatPosition({
      x: e.clientX - dragOffset.current.x,
      y: e.clientY - dragOffset.current.y
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Load conversation from history
  const handleSelectConversation = async (id) => {
    setCurrentConversationId(id);
    const msgs = await getMessages(id);
    setMessages(msgs.map(m => ({ role: m.role, content: m.content })));
  };

  // New chat handler
  const handleNewChat = () => {
    setCurrentConversationId(null);
    setMessages([
      { role: 'assistant', content: "👋 Hi! I'm NanoChat. I can help you navigate this codebase. Are you new here, or looking for something specific?" }
    ]);
  };


  useEffect(() => {
    if (!data.nodes.length) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .style('background', '#0f172a');

    svg.selectAll("*").remove(); // Clear previous

    // Create a root container for zooming
    const g = svg.append('g');

    // Define Zoom Behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    // Attach zoom to SVG
    svg.call(zoom);

    // Define Glow Filter (Enhanced Aura)
    const defs = svg.append('defs');
    const filter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-100%')
      .attr('y', '-100%')
      .attr('width', '300%')
      .attr('height', '300%');

    // Inner intense glow
    filter.append('feGaussianBlur')
      .attr('stdDeviation', '2')
      .attr('result', 'coloredBlur');

    // Outer soft aura
    filter.append('feGaussianBlur')
      .attr('in', 'SourceGraphic')
      .attr('stdDeviation', '6')
      .attr('result', 'softBlur');

    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'softBlur');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.links).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2));

    const link = g.append('g')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .selectAll('line')
      .data(data.links)
      .join('line')
      .attr('stroke-width', d => Math.sqrt(d.value || 1));

    const node = g.append('g')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .selectAll('circle')
      .data(data.nodes)
      .join('circle')
      .attr('r', d => {
        if (highlightedNodes.has(d.id)) return 10;
        if (relatedNodeIds.includes(d.id)) return 7;
        return 5;
      })
      .attr('fill', d => {
        // Keep original colors based on type
        if (d.type === 'file') return '#3b82f6';
        if (d.status === 'missing') return '#ef4444';
        if (d.status === 'external') return '#a855f7';
        return '#22c55e';
      })
      .attr('stroke', d => {
        if (highlightedNodes.has(d.id)) return '#facc15'; // Yellow stroke for focus
        if (relatedNodeIds.includes(d.id)) return '#fbbf24'; // Orange stroke for related
        return '#fff';
      })
      .attr('stroke-width', d => {
        if (highlightedNodes.has(d.id)) return 3;
        if (relatedNodeIds.includes(d.id)) return 2;
        return 1.5;
      })
      .style('filter', d => highlightedNodes.has(d.id) ? 'url(#glow)' : null)
      .call(drag(simulation));

    node.append('title')
      .text(d => d.label);

    node.on('click', (event, d) => {
      event.stopPropagation();
      setSelectedNode(d);
      setSidebarOpen(true);
    });

    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);
    });

    function drag(simulation) {
      function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }

      function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }

      function dragended(event) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }

      return d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended);
    }

    svg.node().__zoomBehavior = zoom;

  }, [data]);

  // Re-run simulation/update attributes when highlightedNodes or relatedNodeIds changes
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const nodes = svg.selectAll('circle');

    nodes
      .attr('r', d => {
        if (highlightedNodes.has(d.id)) return 10; // Bigger for focus
        if (relatedNodeIds.includes(d.id)) return 7;
        return 5;
      })
      .attr('fill', d => {
        // Keep original colors based on type
        if (d.type === 'file') return '#3b82f6';
        if (d.status === 'missing') return '#ef4444';
        if (d.status === 'external') return '#a855f7';
        return '#22c55e';
      })
      .attr('stroke', d => {
        if (highlightedNodes.has(d.id)) return '#facc15'; // Yellow stroke for focus
        if (relatedNodeIds.includes(d.id)) return '#fbbf24'; // Orange stroke for related
        return '#fff';
      })
      .attr('stroke-width', d => {
        if (highlightedNodes.has(d.id)) return 3;
        if (relatedNodeIds.includes(d.id)) return 2;
        return 1.5;
      })
      .style('filter', d => highlightedNodes.has(d.id) ? 'url(#glow)' : null);

  }, [highlightedNodes, relatedNodeIds, data]);

  const handleFocusNode = (node) => {
    if (!node) return;

    setSelectedNode(node);
    setSidebarOpen(true);

    const newHighlights = new Set();
    newHighlights.add(node.id);
    setHighlightedNodes(newHighlights);

    const newRelatedNodeIds = [];
    data.links.forEach(link => {
      if (link.source.id === node.id) newRelatedNodeIds.push(link.target.id);
      if (link.target.id === node.id) newRelatedNodeIds.push(link.source.id);
    });
    setRelatedNodeIds(newRelatedNodeIds);

    const svg = d3.select(svgRef.current);
    const width = window.innerWidth;
    const height = window.innerHeight;

    const zoom = svg.node().__zoomBehavior;
    if (!zoom) return;

    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(2.0) // Closer zoom
      .translate(-node.x, -node.y);

    svg.transition()
      .duration(750)
      .call(zoom.transform, transform);
  };

  return (
    <div className="app">
      <svg ref={svgRef}></svg>

      {/* Focus List */}
      <FocusList
        nodes={data.nodes}
        focusedNodeIds={focusedNodeIds}
        relatedNodeIds={relatedNodeIds}
        onFocus={handleFocusNode}
      />

      {/* Settings Button */}
      <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 100 }}>
        <button
          onClick={() => setSettingsOpen(true)}
          className={`px-4 py-2 rounded-lg backdrop-blur-sm transition-colors font-medium ${userApiKey ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-gray-800/80 text-white hover:bg-gray-700'}`}
          title="Settings & API Key"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40px', border: 'none', cursor: 'pointer' }}
        >
          Settings
        </button>
      </div>

      {/* Modals */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaveKey={handleSaveKey}
        currentKey={userApiKey}
        keyType={keyType}
      />

      {/* Help Toggle Button */}
      <button className="help-toggle" onClick={() => setHelpOpen(!helpOpen)} style={{ width: 'auto', padding: '0 15px', borderRadius: '8px' }}>
        Help
      </button>

      {/* Help Modal */}
      {helpOpen && (
        <div className="help-modal-overlay" onClick={() => setHelpOpen(false)}>
          <div className="help-modal" onClick={e => e.stopPropagation()}>
            <div className="help-header">
              <h3>Setup Instructions</h3>
              <button onClick={() => setHelpOpen(false)}><X size={18} /></button>
            </div>
            <div className="help-content">
              <p>To enable the <strong>Chat Agent</strong> and <strong>Embeddings</strong>:</p>
              <ol>
                <li>Create a <code>.env</code> file in the root directory.</li>
                <li>Add your <strong>OpenRouter API Key</strong>:
                  <pre>OPENROUTER_API_KEY=sk-or-...</pre>
                </li>
                <li>Add your <strong>Hugging Face Token</strong> (for model download):
                  <pre>HF_TOKEN=hf_...</pre>
                </li>
                <li>Restart the bridge:
                  <pre>bun run start-bridge</pre>
                  (Runs on port 8999)
                </li>
              </ol>
              <p>See <code>docs/LEARNING_README.md</code> for details.</p>
            </div>
          </div>
        </div>
      )}

      {/* Chat History Toggle */}
      <ChatHistory
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
      />

      {/* User Profile Selector */}
      <UserSelector
        currentUserId={currentUserId}
        onUserChange={setCurrentUserId}
      />

      {/* Chat Toggle Button */}
      <button className="chat-toggle" onClick={() => setChatOpen(!chatOpen)} style={{ left: '100px' }}>
        <MessageSquare size={24} />
      </button>

      {/* Chat Interface (Draggable) */}
      {chatOpen && (
        <div className="chat-interface" style={{
          position: 'fixed',
          left: `${chatPosition.x}px`,
          top: `${chatPosition.y}px`,
          width: '380px',
          height: '520px',
          background: '#1e293b',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1000,
          border: '1px solid #334155',
          cursor: isDragging ? 'grabbing' : 'default'
        }}>
          {/* Draggable Header */}
          <div
            onMouseDown={handleMouseDown}
            style={{
              padding: '15px',
              borderBottom: '1px solid #334155',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'grab',
              userSelect: 'none'
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={18} color="#60a5fa" />
              <span style={{ fontWeight: 'bold', color: 'white' }}>NanoChat AI</span>
            </div>
            <button onClick={() => setChatOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
              <X size={18} />
            </button>
          </div>

          {/* Model Selector */}
          <div style={{ padding: '10px 15px 0 15px' }}>
            <ModelSelector selectedModel={selectedModel} onSelectModel={setSelectedModel} />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                background: msg.role === 'user' ? '#3b82f6' : '#334155',
                color: 'white',
                padding: '8px 12px',
                borderRadius: '8px',
                maxWidth: '85%',
                fontSize: '14px',
                lineHeight: '1.4'
              }}>
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            ))}
            {isChatting && (
              <div style={{ alignSelf: 'flex-start', color: '#94a3b8', fontSize: '12px', fontStyle: 'italic' }}>
                Thinking...
              </div>
            )}
          </div>
          <div className="chat-input" style={{ padding: '10px 15px', borderTop: '1px solid #334155', display: 'flex', gap: '10px' }}>
            <input
              type="text"
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask about the code..."
              style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #475569', background: '#334155', color: 'white', fontSize: '14px' }}
            />
            <button
              className="ci-toggle-btn"
              onClick={openContextInspector}
              title="Open Context Inspector"
            >
              📋
            </button>
            <button onClick={handleSendMessage} disabled={isChatting} style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send size={18} />
            </button>
          </div>
        </div>
      )}

      {sidebarOpen && selectedNode && (
        <div className="sidebar">
          <div className="sidebar-header">
            <h2>{selectedNode.label}</h2>
            <button onClick={() => setSidebarOpen(false)}><X size={20} /></button>
          </div>
          <div className="sidebar-content">
            <div className="badge" style={{
              backgroundColor:
                selectedNode.type === 'file' ? '#3b82f6' :
                  selectedNode.status === 'missing' ? '#ef4444' :
                    selectedNode.status === 'external' ? '#a855f7' : '#22c55e'
            }}>
              {selectedNode.type === 'file' ? 'File' : selectedNode.status}
            </div>
            <p className="node-id">ID: {selectedNode.id}</p>

            {selectedNode.type === 'file' ? (
              <div className="code-viewer">
                <div className="code-actions">
                  <button className="run-btn" onClick={runCode} disabled={isRunning}>
                    {isRunning ? 'Running...' : 'Run Code (Local Bridge)'}
                  </button>
                </div>
                {executionOutput && (
                  <div className={`execution-output ${executionOutput.status}`}>
                    <h4>Output:</h4>
                    {executionOutput.stdout && <pre className="stdout">{executionOutput.stdout}</pre>}
                    {executionOutput.stderr && <pre className="stderr">{executionOutput.stderr}</pre>}
                  </div>
                )}
                <SyntaxHighlighter language="python" style={vscDarkPlus} customStyle={{ fontSize: '12px' }}>
                  {codeContent}
                </SyntaxHighlighter>
              </div>
            ) : (
              <div className="markdown-body">
                {/* Concept Navigation */}
                {selectedNode.id.startsWith('concept:') && conceptGraph[selectedNode.id] && (
                  <div className="concept-nav" style={{
                    display: 'flex',
                    gap: '10px',
                    marginBottom: '15px',
                    flexWrap: 'wrap'
                  }}>
                    {/* Simpler (Prerequisites) */}
                    {conceptGraph[selectedNode.id].prerequisites.length > 0 && (
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '5px' }}>
                          ⬆️ Simpler
                        </span>
                        {conceptGraph[selectedNode.id].prerequisites.map(prereq => {
                          const prereqNode = data.nodes.find(n => n.id === prereq);
                          return prereqNode ? (
                            <button
                              key={prereq}
                              onClick={() => {
                                setSelectedNode(prereqNode);
                                setHighlightedNodes(new Set([prereq]));
                              }}
                              style={{
                                display: 'block',
                                width: '100%',
                                padding: '8px 12px',
                                marginBottom: '5px',
                                background: '#334155',
                                border: '1px solid #475569',
                                borderRadius: '6px',
                                color: '#60a5fa',
                                cursor: 'pointer',
                                fontSize: '13px',
                                textAlign: 'left'
                              }}
                            >
                              {prereqNode.label}
                            </button>
                          ) : null;
                        })}
                      </div>
                    )}

                    {/* Deeper (Leads To) */}
                    {conceptGraph[selectedNode.id].leads_to.length > 0 && (
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '5px' }}>
                          ⬇️ Deeper
                        </span>
                        {conceptGraph[selectedNode.id].leads_to.map(next => {
                          const nextNode = data.nodes.find(n => n.id === next);
                          return nextNode ? (
                            <button
                              key={next}
                              onClick={() => {
                                setSelectedNode(nextNode);
                                setHighlightedNodes(new Set([next]));
                              }}
                              style={{
                                display: 'block',
                                width: '100%',
                                padding: '8px 12px',
                                marginBottom: '5px',
                                background: '#334155',
                                border: '1px solid #475569',
                                borderRadius: '6px',
                                color: '#22c55e',
                                cursor: 'pointer',
                                fontSize: '13px',
                                textAlign: 'left'
                              }}
                            >
                              {nextNode.label}
                            </button>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                )}

                {selectedNode.viz_id && (
                  <VizContainer vizId={selectedNode.viz_id} />
                )}
                <ReactMarkdown>{markdownContent}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Context Inspector Modal */}
      <ContextInspector
        isOpen={contextInspectorOpen}
        onClose={() => setContextInspectorOpen(false)}
        contextSegments={contextSegments}
        onSegmentsChange={setContextSegments}
        tokenBudget={tokenBudget}
        onSend={() => {
          setContextInspectorOpen(false);
          handleSendMessage();
        }}
        onCompress={async (segments, prompt) => {
          try {
            const headers = { 'Content-Type': 'application/json' };
            if (userApiKey) {
              headers['Authorization'] = `Bearer ${userApiKey}`;
            }

            const res = await fetch('http://localhost:8999/compress', {
              method: 'POST',
              headers: headers,
              body: JSON.stringify({
                segments: segments.map(s => ({ id: s.id, content: s.content })),
                prompt: prompt || 'Summarize preserving technical details',
                model: selectedModel
              })
            });
            const data = await res.json();

            if (data.compressed) {
              const updated = contextSegments.map(seg => {
                const compressed = data.compressed.find(c => c.id === seg.id);
                if (compressed) {
                  return {
                    ...seg,
                    originalContent: seg.content,
                    originalTokenCount: seg.tokenCount,
                    content: compressed.content,
                    tokenCount: compressed.tokenCount,
                    isCompacted: true
                  };
                }
                return seg;
              });
              setContextSegments(updated);
            }
          } catch (err) {
            console.error('Compression error:', err);
          }
        }}
      />
    </div>
  );
}

export default App;
