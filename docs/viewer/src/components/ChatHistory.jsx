import React, { useEffect, useState } from 'react';
import { History, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { getConversations, deleteConversation } from '../utils/db';

const ChatHistory = ({ currentConversationId, onSelectConversation, onNewChat }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [conversations, setConversations] = useState([]);

    useEffect(() => {
        if (isOpen) {
            loadConversations();
        }
    }, [isOpen]);

    const loadConversations = async () => {
        const convos = await getConversations();
        setConversations(convos);
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        await deleteConversation(id);
        await loadConversations();
        if (id === currentConversationId) {
            onNewChat();
        }
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    return (
        <div className="chat-history-container">
            <button
                className="chat-history-toggle"
                onClick={() => setIsOpen(!isOpen)}
                title="Chat History"
            >
                <History size={18} />
                <span>History</span>
                {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {isOpen && (
                <div className="chat-history-dropdown">
                    <button className="new-chat-btn" onClick={onNewChat}>
                        <Plus size={16} />
                        <span>New Chat</span>
                    </button>

                    <div className="conversation-list">
                        {conversations.length === 0 ? (
                            <p className="empty-message">No past conversations</p>
                        ) : (
                            conversations.map(convo => (
                                <div
                                    key={convo.id}
                                    className={`conversation-item ${convo.id === currentConversationId ? 'active' : ''}`}
                                    onClick={() => {
                                        onSelectConversation(convo.id);
                                        setIsOpen(false);
                                    }}
                                >
                                    <div className="convo-info">
                                        <span className="convo-title">{convo.title}</span>
                                        <span className="convo-date">{formatDate(convo.updatedAt)}</span>
                                    </div>
                                    <button
                                        className="delete-btn"
                                        onClick={(e) => handleDelete(e, convo.id)}
                                        title="Delete"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChatHistory;
