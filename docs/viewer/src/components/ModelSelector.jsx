import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

const ModelSelector = ({ selectedModel, onSelectModel }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [models, setModels] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef(null);

    // Fetch models on mount
    useEffect(() => {
        const fetchModels = async () => {
            setLoading(true);
            try {
                const res = await fetch('http://localhost:8999/models');
                const data = await res.json();
                const loadedModels = data.models || [];
                setModels(loadedModels);

                // Validate selectedModel
                if (loadedModels.length > 0) {
                    const isAvailable = loadedModels.some(m => m.id === selectedModel);
                    if (!isAvailable) {
                        // Fallback: Try default, else first available
                        const defaultModel = "google/gemini-2.0-flash-exp:free";
                        const hasDefault = loadedModels.some(m => m.id === defaultModel);
                        onSelectModel(hasDefault ? defaultModel : loadedModels[0].id);
                    }
                }
            } catch (e) {
                console.error("Failed to fetch models", e);
            } finally {
                setLoading(false);
            }
        };
        fetchModels();
    }, [selectedModel, onSelectModel]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredModels = models.filter(m =>
        m.id.toLowerCase().includes(search.toLowerCase()) ||
        m.name?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="model-selector" ref={dropdownRef} style={{ position: 'relative', width: '100%', marginBottom: '10px' }}>
            {/* Trigger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: 'white',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    fontSize: '13px'
                }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedModel || "Select a model..."}
                </span>
                <ChevronDown size={14} color="#94a3b8" />
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: '4px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    zIndex: 100,
                    maxHeight: '300px',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    {/* Search Input */}
                    <div style={{ padding: '8px', borderBottom: '1px solid #334155' }}>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <Search size={12} color="#94a3b8" style={{ position: 'absolute', left: '8px' }} />
                            <input
                                type="text"
                                placeholder="Search models..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '6px 8px 6px 26px',
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    borderRadius: '4px',
                                    color: 'white',
                                    fontSize: '12px',
                                    outline: 'none'
                                }}
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Model List */}
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {loading ? (
                            <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                                Loading models...
                            </div>
                        ) : filteredModels.length === 0 ? (
                            <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                                No models found.
                            </div>
                        ) : (
                            filteredModels.map(model => (
                                <div
                                    key={model.id}
                                    onClick={() => {
                                        onSelectModel(model.id);
                                        setIsOpen(false);
                                    }}
                                    style={{
                                        padding: '8px 12px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        fontSize: '12px',
                                        color: selectedModel === model.id ? '#60a5fa' : '#cbd5e1',
                                        background: selectedModel === model.id ? '#1e293b' : 'transparent',
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#334155'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = selectedModel === model.id ? '#1e293b' : 'transparent'}
                                >
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {model.name || model.id}
                                    </span>
                                    {selectedModel === model.id && <Check size={12} />}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ModelSelector;
