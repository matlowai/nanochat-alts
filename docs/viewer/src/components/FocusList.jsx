import React from 'react';
import { Target, ChevronRight } from 'lucide-react';

const FocusList = ({ nodes, focusedNodeIds, onFocus }) => {
    if (!focusedNodeIds || focusedNodeIds.length === 0) return null;

    // Filter nodes that are in the focused list
    const relevantNodes = nodes.filter(n => focusedNodeIds.includes(n.id));

    if (relevantNodes.length === 0) return null;

    return (
        <div className="focus-list-panel">
            <div className="focus-header">
                <Target size={16} className="text-blue-400" />
                <span>Suggested Focus</span>
            </div>
            <div className="focus-items">
                {relevantNodes.map(node => (
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
        </div>
    );
};

export default FocusList;
