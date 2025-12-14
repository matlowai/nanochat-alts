import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { BookOpen, Code, Layers, Search, X } from 'lucide-react';
import Markdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { MessageSquare, Send } from 'lucide-react';
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
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [highlightedNodes, setHighlightedNodes] = useState(new Set());

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
      const res = await fetch('http://localhost:8000/execute', {
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

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMsg = { role: 'user', content: inputMessage };
    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsChatting(true);

    try {
      const res = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.content })
      });
      const data = await res.json();

      const botMsg = { role: 'assistant', content: data.response };
      setMessages(prev => [...prev, botMsg]);

      // Handle focus
      if (data.focused_nodes && data.focused_nodes.length > 0) {
        setHighlightedNodes(new Set(data.focused_nodes));
        // Optionally auto-select the first one?
        // const firstNode = data.nodes.find(n => n.id === data.focused_nodes[0]);
        // if (firstNode) setSelectedNode(firstNode);
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
    // Actually, D3 doesn't auto-update on React state change unless we trigger it.
    // We can use a separate useEffect for highlighting updates to avoid full re-render.
    // For simplicity in this MVP, we rely on the dependency array [data, highlightedNodes].

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
  }, [data, highlightedNodes]); // Re-render graph when highlights change

  return (
    <div className="app">
      <svg ref={svgRef}></svg>

      {/* Help Toggle Button */}
      <button className="help-toggle" onClick={() => setHelpOpen(!helpOpen)}>
        <HelpCircle size={24} />
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

      {/* Chat Panel */}
      {chatOpen && (
        <div className="chat-panel">
          <div className="chat-header">
            <h3>Graph Agent</h3>
            <button onClick={() => setChatOpen(false)}><X size={18} /></button>
          </div>
          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`message ${m.role}`}>
                <Markdown>{m.content}</Markdown>
              </div>
            ))}
            {isChatting && <div className="message assistant">Thinking...</div>}
          </div>
          <div className="chat-input">
            <input
              type="text"
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder="Ask about the code..."
            />
            <button onClick={sendMessage} disabled={isChatting}><Send size={18} /></button>
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
                <Markdown>{markdownContent}</Markdown>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
