import React, { useEffect, useState } from 'react';
import { User, Plus, ChevronDown, Check } from 'lucide-react';
import { getUsers, createUser, getOrCreateGuestUser } from '../utils/db';

const UserSelector = ({ currentUserId, onUserChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [users, setUsers] = useState([]);
    const [newUserName, setNewUserName] = useState('');
    const [showNewUserInput, setShowNewUserInput] = useState(false);

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        const allUsers = await getUsers();
        if (allUsers.length === 0) {
            // Create guest user if none exist
            const guest = await getOrCreateGuestUser();
            setUsers([guest]);
            if (!currentUserId) {
                onUserChange(guest.id);
            }
        } else {
            setUsers(allUsers);
            // Auto-select first user if none selected
            if (!currentUserId && allUsers.length > 0) {
                onUserChange(allUsers[0].id);
            }
        }
    };

    const handleCreateUser = async () => {
        if (newUserName.trim()) {
            const userId = await createUser(newUserName.trim());
            setNewUserName('');
            setShowNewUserInput(false);
            await loadUsers();
            onUserChange(userId);
        }
    };

    const currentUser = users.find(u => u.id === currentUserId);

    return (
        <div className="user-selector-container">
            <button
                className="user-selector-toggle"
                onClick={() => setIsOpen(!isOpen)}
            >
                <User size={16} />
                <span>{currentUser?.name || 'Select User'}</span>
                <ChevronDown size={14} className={isOpen ? 'rotated' : ''} />
            </button>

            {isOpen && (
                <div className="user-selector-dropdown">
                    {users.map(user => (
                        <button
                            key={user.id}
                            className={`user-item ${user.id === currentUserId ? 'active' : ''}`}
                            onClick={() => {
                                onUserChange(user.id);
                                setIsOpen(false);
                            }}
                        >
                            <User size={14} />
                            <span>{user.name}</span>
                            {user.id === currentUserId && <Check size={14} />}
                        </button>
                    ))}

                    <div className="user-divider" />

                    {showNewUserInput ? (
                        <div className="new-user-input">
                            <input
                                type="text"
                                placeholder="Enter name..."
                                value={newUserName}
                                onChange={(e) => setNewUserName(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleCreateUser()}
                                autoFocus
                            />
                            <button onClick={handleCreateUser}>Add</button>
                            <button onClick={() => setShowNewUserInput(false)}>✕</button>
                        </div>
                    ) : (
                        <button
                            className="new-user-btn"
                            onClick={() => setShowNewUserInput(true)}
                        >
                            <Plus size={14} />
                            <span>New User</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default UserSelector;
