import Dexie from 'dexie';

// Define the database
export const db = new Dexie('NanoChatDB');

// Define tables
db.version(1).stores({
    conversations: '++id, title, createdAt, updatedAt',
    messages: '++id, conversationId, role, content, createdAt'
});

// Helper functions
export async function createConversation(title = 'New Chat') {
    const now = new Date().toISOString();
    return await db.conversations.add({
        title,
        createdAt: now,
        updatedAt: now
    });
}

export async function getConversations() {
    return await db.conversations.orderBy('updatedAt').reverse().toArray();
}

export async function getMessages(conversationId) {
    return await db.messages.where('conversationId').equals(conversationId).sortBy('createdAt');
}

export async function addMessage(conversationId, role, content) {
    const now = new Date().toISOString();

    // Update conversation timestamp
    await db.conversations.update(conversationId, { updatedAt: now });

    return await db.messages.add({
        conversationId,
        role,
        content,
        createdAt: now
    });
}

export async function deleteConversation(id) {
    await db.messages.where('conversationId').equals(id).delete();
    await db.conversations.delete(id);
}

export async function updateConversationTitle(id, title) {
    return await db.conversations.update(id, { title });
}
