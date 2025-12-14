import React from 'react';
import { Target, ChevronRight, Search } from 'lucide-react';

const FocusList = ({ nodes, focusedNodeIds, relatedNodeIds, onFocus }) => {
    if ((!focusedNodeIds || focusedNodeIds.length === 0) && (!relatedNodeIds || relatedNodeIds.length === 0)) return null;

    // Filter and Deduplicate nodes
    const uniqueFocused = [...new Set(focusedNodeIds)];
    const uniqueRelated = [...new Set(relatedNodeIds)];

    const focusedNodes = nodes.filter(n => uniqueFocused.includes(n.id));
    const relatedNodes = nodes.filter(n => uniqueRelated.includes(n.id));

    if (focusedNodes.length === 0 && relatedNodes.length === 0) return null;

    return (
        <div className="focus-list-panel">
            {focusedNodes.length > 0 && (
                <>
                    <div className="focus-header">
                        <Target size={16} className="text-yellow-400" />
                        <span style={{ color: '#facc15' }}>Suggested Focus</span>
                    </div>
                    <div className="focus-items">
                        {focusedNodes.map(node => (
                            <button
                                key={node.id}
                                className="focus-item"
                                onClick={() => onFocus(node)}
                            >
                                <span className="focus-label">{node.label}</span>
                                <ChevronRight size={14} className="focus-arrow" />
                            </button>
                        ))}
                    </div>
                </>
            )}

            {relatedNodes.length > 0 && (
                <>
                    <div className="focus-header" style={{ borderTop: focusedNodes.length > 0 ? '1px solid #334155' : 'none' }}>
                        <Search size={16} className="text-blue-400" />
                        <span style={{ color: '#60a5fa' }}>Related Context</span>
                    </div>
                    <div className="focus-items">
                        {relatedNodes.map(node => (
                            <button
                                key={node.id}
                                className="focus-item"
                                onClick={() => onFocus(node)}
                            >
                                <span className="focus-label" style={{ color: '#94a3b8' }}>{node.label}</span>
                                <ChevronRight size={14} className="focus-arrow" />
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default FocusList;
