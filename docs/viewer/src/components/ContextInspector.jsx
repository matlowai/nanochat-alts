import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, ChevronDown, ChevronRight, Trash2, Zap, Copy, RefreshCw, Settings, Send } from 'lucide-react';

const ContextInspector = ({
    isOpen,
    onClose,
    contextSegments = [],
    onSegmentsChange,
    tokenBudget = { used: 0, total: 100000 },
    onSend,
    onCompress
}) => {
    const [expandedSegments, setExpandedSegments] = useState(new Set());
    const [compressionPrompt, setCompressionPrompt] = useState('');

    if (!isOpen) return null;

    const toggleSegment = (id) => {
        const next = new Set(expandedSegments);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedSegments(next);
    };

    const toggleInclude = (id) => {
        const updated = contextSegments.map(seg =>
            seg.id === id ? { ...seg, included: !seg.included } : seg
        );
        onSegmentsChange(updated);
    };

    const handleRemove = (id) => {
        const updated = contextSegments.filter(seg => seg.id !== id);
        onSegmentsChange(updated);
    };

    const handleSkip = (id) => {
        const updated = contextSegments.map(seg => {
            if (seg.id === id) {
                // Convert to 1-line summary
                const summary = seg.content.substring(0, 80) + '...';
                return {
                    ...seg,
                    content: summary,
                    isCompacted: true,
                    tokenCount: Math.ceil(summary.length / 4)
                };
            }
            return seg;
        });
        onSegmentsChange(updated);
    };

    const handleCompressChecked = () => {
        const checkedSegments = contextSegments.filter(s => s.included && !s.isCompacted);
        if (onCompress && checkedSegments.length > 0) {
            onCompress(checkedSegments, compressionPrompt);
        }
    };

    const usedTokens = contextSegments
        .filter(s => s.included)
        .reduce((sum, s) => sum + (s.tokenCount || 0), 0);

    const budgetPercent = Math.min(100, (usedTokens / tokenBudget.total) * 100);

    return (
        <div className="context-inspector-overlay">
            <div className="context-inspector">
                <div className="ci-header">
                    <h3>📋 Context Inspector</h3>
                    <div className="ci-budget">
                        <div className="ci-budget-bar">
                            <div
                                className="ci-budget-fill"
                                style={{ width: `${budgetPercent}%` }}
                            />
                        </div>
                        <span>{usedTokens.toLocaleString()} / {tokenBudget.total.toLocaleString()} tokens</span>
                    </div>
                    <button className="ci-close" onClick={onClose}>✕</button>
                </div>

                <div className="ci-segments">
                    {contextSegments.map(segment => (
                        <div key={segment.id} className={`ci-segment ${segment.included ? '' : 'excluded'}`}>
                            <div className="ci-segment-header" onClick={() => toggleSegment(segment.id)}>
                                <input
                                    type="checkbox"
                                    checked={segment.included}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        toggleInclude(segment.id);
                                    }}
                                />
                                {expandedSegments.has(segment.id) ?
                                    <ChevronDown size={16} /> :
                                    <ChevronRight size={16} />
                                }
                                <span className="ci-segment-label">
                                    {segment.label}
                                    {segment.isTieredSummary && <span className="ci-tiered-badge">tier 2</span>}
                                    {segment.isCompacted && <span className="ci-compacted-badge">compacted</span>}
                                </span>
                                <span className="ci-segment-tokens">[{segment.tokenCount} tok]</span>
                            </div>

                            {expandedSegments.has(segment.id) && (
                                <div className="ci-segment-content">
                                    <pre>{segment.content.substring(0, 500)}{segment.content.length > 500 ? '...' : ''}</pre>
                                    <div className="ci-segment-actions">
                                        {!segment.isCompacted && !segment.isTieredSummary && (
                                            <>
                                                <button onClick={() => handleSkip(segment.id)} title="Skip (1-line summary)">
                                                    <Zap size={14} /> Skip
                                                </button>
                                            </>
                                        )}
                                        {(segment.isCompacted || segment.isTieredSummary) && segment.originalContent && (
                                            <button onClick={() => {
                                                const updated = contextSegments.map(s =>
                                                    s.id === segment.id ? {
                                                        ...s,
                                                        content: s.originalContent,
                                                        isCompacted: false,
                                                        isTieredSummary: false,
                                                        tokenCount: s.originalTokenCount
                                                    } : s
                                                );
                                                onSegmentsChange(updated);
                                            }} title="Rehydrate full text">
                                                <RefreshCw size={14} /> Rehydrate
                                            </button>
                                        )}
                                        <button onClick={() => navigator.clipboard.writeText(segment.content)} title="Copy to clipboard">
                                            <Copy size={14} /> Copy
                                        </button>
                                        <button className="ci-remove" onClick={() => handleRemove(segment.id)} title="Remove">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="ci-footer">
                    <div className="ci-compression-prompt">
                        <input
                            type="text"
                            placeholder="Compression prompt (optional): Focus on code, drop greetings..."
                            value={compressionPrompt}
                            onChange={(e) => setCompressionPrompt(e.target.value)}
                        />
                    </div>
                    <div className="ci-footer-actions">
                        <button className="ci-compress-btn" onClick={handleCompressChecked}>
                            🗜️ Compress Checked
                        </button>
                        <button className="ci-close-btn" onClick={onClose}>
                            Done
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ContextInspector;
