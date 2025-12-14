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
import { exchangeCodeForKey } from './utils/auth';
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
  const [helpOpen, setHelpOpen] = useState(false);
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
  }, []);

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
        fetch(`/kb/${selectedNode.id}.md`)
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
          model: selectedModel
        })
      });
      const data = await res.json();

      const botMsg = { role: 'assistant', content: data.response };
      setMessages(prev => [...prev, botMsg]);

      // Handle focus
      if (data.focused_nodes && data.focused_nodes.length > 0) {
        setFocusedNodeIds(data.focused_nodes);
        // setHighlightedNodes(new Set(data.focused_nodes)); // Optional: auto-highlight immediately?
        // Let's rely on the user clicking the FocusList for the "Zoom" effect, 
        // but maybe just highlight them in the graph passively?
        setHighlightedNodes(new Set(data.focused_nodes));
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: ' + err.message }]);
    } finally {
      setIsChatting(false);
    }
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

    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.links).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2));

    const link = svg.append('g')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .selectAll('line')
      .data(data.links)
      .join('line')
      .attr('stroke-width', d => Math.sqrt(d.value || 1));

    const node = svg.append('g')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .selectAll('circle')
      .data(data.nodes)
      .join('circle')
      .attr('r', d => highlightedNodes.has(d.id) ? 8 : 5) // Bigger if highlighted
      .attr('fill', d => {
        if (highlightedNodes.has(d.id)) return '#facc15'; // Yellow highlight
        if (d.type === 'file') return '#3b82f6'; // Blue
        if (d.status === 'missing') return '#ef4444'; // Red
        if (d.status === 'external') return '#a855f7'; // Purple
        return '#22c55e'; // Green (Defined Concept)
      })
      .call(drag(simulation));

    node.append('title')
      .text(d => d.label);

    node.on('click', (event, d) => {
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

    // Re-run simulation/update attributes when highlightedNodes changes
    useEffect(() => {
      const svg = d3.select(svgRef.current);
      const nodes = svg.selectAll('circle');

      nodes
        .attr('r', d => highlightedNodes.has(d.id) ? 8 : 5)
        .attr('fill', d => {
          if (highlightedNodes.has(d.id)) return '#facc15'; // Yellow highlight
          if (d.type === 'file') return '#3b82f6';
          if (d.status === 'missing') return '#ef4444';
          if (d.status === 'external') return '#a855f7';
          return '#22c55e';
        })
        .attr('stroke', d => highlightedNodes.has(d.id) ? '#fff' : '#fff')
        .attr('stroke-width', d => highlightedNodes.has(d.id) ? 2.5 : 1.5);

    }, [highlightedNodes, data]); // Trigger update when highlights change

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
  }, [data]); // Only re-run full simulation on data change

  const handleFocusNode = (node) => {
    if (!node) return;

    // 1. Select the node
    setSelectedNode(node);
    setSidebarOpen(true);

    // 2. Highlight Node + Neighbors
    const newHighlights = new Set();
    newHighlights.add(node.id);

    // Find neighbors
    data.links.forEach(link => {
      if (link.source.id === node.id) newHighlights.add(link.target.id);
      if (link.target.id === node.id) newHighlights.add(link.source.id);
    });

    setHighlightedNodes(newHighlights);

    // 3. Center Camera (Zoom to node)
    const svg = d3.select(svgRef.current);
    const width = window.innerWidth;
    const height = window.innerHeight;

    // We need to access the current transform to maintain scale or set a new one
    // Ideally, we transition to center the node
    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(1.5) // Zoom in a bit
      .translate(-node.x, -node.y);

    svg.transition()
      .duration(750)
      .call(d3.zoom().transform, transform); // Note: this might conflict if zoom behavior isn't attached to svg yet.
    // Actually, we haven't attached zoom behavior to the SVG in the main useEffect.
    // We should probably add zoom support to the main graph first for this to work properly.
  };

  return (
    <div className="app">
      <svg ref={svgRef}></svg>

      {/* Focus List */}
      <FocusList
        nodes={data.nodes}
        focusedNodeIds={focusedNodeIds}
        onFocus={handleFocusNode}
      />

      {/* Settings Button */}
      <div style={{ position: 'absolute', top: '20px', right: '120px', zIndex: 100 }}>
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

      {/* Chat Toggle Button */}
      <button className="chat-toggle" onClick={() => setChatOpen(!chatOpen)}>
        <MessageSquare size={24} />
      </button>

      {/* Chat Interface */}
      {chatOpen && (
        <div className="chat-interface" style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '350px',
          height: '500px',
          background: '#1e293b',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1000,
          border: '1px solid #334155'
        }}>
          <div style={{ padding: '15px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                {selectedNode.viz_id && (
                  <VizContainer vizId={selectedNode.viz_id} />
                )}
                <ReactMarkdown>{markdownContent}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
