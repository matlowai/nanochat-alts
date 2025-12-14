import Dexie from 'dexie';

// Define the database
export const db = new Dexie('NanoChatDB');

// Define tables - Version 2: Added user profiles and context management
db.version(2).stores({
    users: '++id, name, createdAt',
    learnerProfiles: '++id, &userId, updatedAt',
    contextSettings: '++id, &userId',
    conversations: '++id, userId, title, createdAt, updatedAt',
    messages: '++id, conversationId, role, content, tokenCount, createdAt',
    turnSummaries: '++id, messageId, summary, tokenCount'
}).upgrade(tx => {
    // Migration: Add default guest user and link existing conversations
    return tx.table('users').add({ name: 'Guest', createdAt: new Date().toISOString() })
        .then(guestId => {
            return tx.table('conversations').toCollection().modify(convo => {
                convo.userId = guestId;
            });
        });
});

// Backwards compatibility for version 1
db.version(1).stores({
    conversations: '++id, title, createdAt, updatedAt',
    messages: '++id, conversationId, role, content, createdAt'
});

// =========== USER FUNCTIONS ===========

export async function getUsers() {
    return await db.users.orderBy('name').toArray();
}

export async function createUser(name) {
    const now = new Date().toISOString();
    const userId = await db.users.add({ name, createdAt: now });

    // Create default learner profile
    await db.learnerProfiles.add({
        userId,
        expertise_level: 'beginner',
        topics: {},
        learning_path: [],
        general_notes: '',
        updatedAt: now
    });

    // Create default context settings
    await db.contextSettings.add({
        userId,
        context_budget_percent: 50,
        context_budget_max_tokens: 100000,
        tier1_full_text_turns: 3,
        tier2_summary_turns: 12,
        auto_summarize: true,
        compression_model: null
    });

    return userId;
}

export async function getOrCreateGuestUser() {
    let guest = await db.users.where('name').equals('Guest').first();
    if (!guest) {
        const id = await createUser('Guest');
        guest = await db.users.get(id);
    }
    return guest;
}

// =========== LEARNER PROFILE FUNCTIONS ===========
// DESIGN: Hybrid profile updates
// - Light updates: Every turn, track topics/turn count (NO LLM)
// - Heavy updates: Every 10 turns, reassess expertise (LLM call)

export async function getLearnerProfile(userId) {
    return await db.learnerProfiles.where('userId').equals(userId).first();
}

export async function updateLearnerProfile(userId, updates) {
    const now = new Date().toISOString();
    return await db.learnerProfiles.where('userId').equals(userId).modify({
        ...updates,
        updatedAt: now
    });
}

/**
 * Light profile update - called every turn, NO LLM call
 * @param {number} userId 
 * @param {string[]} focusedNodes - nodes discussed this turn
 * @returns {object} { turnCount, needsHeavyUpdate }
 */
export async function lightProfileUpdate(userId, focusedNodes = []) {
    const profile = await getLearnerProfile(userId);
    if (!profile) return { turnCount: 0, needsHeavyUpdate: false };

    const now = new Date().toISOString();

    // Get current topics or initialize
    const currentTopics = profile.topics || {};

    // Add/update topics from focused nodes
    const today = new Date().toISOString().split('T')[0];
    for (const node of focusedNodes) {
        // Extract concept name (e.g., "concept:mlp" -> "mlp")
        const topicName = node.includes(':') ? node.split(':').pop() : node;
        if (!currentTopics[topicName]) {
            currentTopics[topicName] = { confidence: 0.1, last_discussed: today, mentions: 1 };
        } else {
            currentTopics[topicName].last_discussed = today;
            currentTopics[topicName].mentions = (currentTopics[topicName].mentions || 0) + 1;
        }
    }

    // Increment turn count
    const newTurnCount = (profile.turnCount || 0) + 1;
    const lastHeavyUpdate = profile.lastHeavyUpdateTurn || 0;

    // Check if heavy update needed (every 10 turns)
    const needsHeavyUpdate = (newTurnCount - lastHeavyUpdate) >= 10;

    // Update profile
    await db.learnerProfiles.where('userId').equals(userId).modify({
        topics: currentTopics,
        turnCount: newTurnCount,
        lastActiveAt: now,
        updatedAt: now
    });

    return { turnCount: newTurnCount, needsHeavyUpdate };
}

/**
 * Apply heavy profile updates from LLM analysis
 * @param {number} userId 
 * @param {object} updates - LLM-generated profile updates
 */
export async function applyHeavyProfileUpdate(userId, updates) {
    const profile = await getLearnerProfile(userId);
    if (!profile) return;

    const now = new Date().toISOString();

    // Merge topic updates with existing
    const currentTopics = profile.topics || {};
    if (updates.topics) {
        for (const [topic, data] of Object.entries(updates.topics)) {
            if (currentTopics[topic]) {
                currentTopics[topic] = { ...currentTopics[topic], ...data };
            } else {
                currentTopics[topic] = data;
            }
        }
    }

    await db.learnerProfiles.where('userId').equals(userId).modify({
        expertise_level: updates.expertise_level || profile.expertise_level,
        topics: currentTopics,
        learning_style: updates.learning_style || profile.learning_style,
        lastHeavyUpdateTurn: profile.turnCount || 0,
        updatedAt: now
    });
}

// =========== CONTEXT SETTINGS FUNCTIONS ===========

export async function getContextSettings(userId) {
    let settings = await db.contextSettings.where('userId').equals(userId).first();
    if (!settings) {
        // Create default settings
        await db.contextSettings.add({
            userId,
            context_budget_percent: 50,
            context_budget_max_tokens: 100000,
            tier1_full_text_turns: 3,
            tier2_summary_turns: 12,
            auto_summarize: true,
            compression_model: null
        });
        settings = await db.contextSettings.where('userId').equals(userId).first();
    }
    return settings;
}

export async function updateContextSettings(userId, updates) {
    return await db.contextSettings.where('userId').equals(userId).modify(updates);
}

// =========== CONVERSATION FUNCTIONS ===========

export async function createConversation(title = 'New Chat', userId = null) {
    const now = new Date().toISOString();
    return await db.conversations.add({
        userId,
        title,
        createdAt: now,
        updatedAt: now
    });
}

export async function getConversations(userId = null) {
    if (userId) {
        return await db.conversations.where('userId').equals(userId).reverse().sortBy('updatedAt');
    }
    return await db.conversations.orderBy('updatedAt').reverse().toArray();
}

export async function getMessages(conversationId) {
    return await db.messages.where('conversationId').equals(conversationId).sortBy('createdAt');
}

export async function addMessage(conversationId, role, content, tokenCount = null) {
    const now = new Date().toISOString();

    // Update conversation timestamp
    await db.conversations.update(conversationId, { updatedAt: now });

    return await db.messages.add({
        conversationId,
        role,
        content,
        tokenCount: tokenCount || Math.ceil(content.length / 4), // Rough estimate
        createdAt: now
    });
}

export async function deleteConversation(id) {
    // Delete turn summaries for all messages in conversation
    const messages = await db.messages.where('conversationId').equals(id).toArray();
    for (const msg of messages) {
        await db.turnSummaries.where('messageId').equals(msg.id).delete();
    }
    await db.messages.where('conversationId').equals(id).delete();
    await db.conversations.delete(id);
}

export async function updateConversationTitle(id, title) {
    return await db.conversations.update(id, { title });
}

// =========== TURN SUMMARY FUNCTIONS ===========

export async function getTurnSummary(messageId) {
    return await db.turnSummaries.where('messageId').equals(messageId).first();
}

export async function saveTurnSummary(messageId, summary, tokenCount = null) {
    const existing = await getTurnSummary(messageId);
    if (existing) {
        return await db.turnSummaries.update(existing.id, { summary, tokenCount });
    }
    return await db.turnSummaries.add({
        messageId,
        summary,
        tokenCount: tokenCount || Math.ceil(summary.length / 4)
    });
}

// =========== CONTEXT BUILDING FUNCTIONS ===========

export async function buildConversationContext(conversationId, settings) {
    const messages = await getMessages(conversationId);
    const tier1Count = settings?.tier1_full_text_turns || 3;
    const tier2Count = settings?.tier2_summary_turns || 12;

    const result = {
        fullTurns: [],      // Last N turns with full text
        summaryTurns: [],   // Next M turns with summaries
        availableIds: []    // Older turn IDs (for on-demand retrieval)
    };

    // Process in reverse (most recent first)
    const reversed = [...messages].reverse();

    for (let i = 0; i < reversed.length; i++) {
        const msg = reversed[i];

        if (i < tier1Count * 2) { // *2 because each turn has user + assistant
            result.fullTurns.unshift({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                tokenCount: msg.tokenCount,
                createdAt: msg.createdAt  // For sorting
            });
        } else if (i < (tier1Count + tier2Count) * 2) {
            const summary = await getTurnSummary(msg.id);
            // Store messageId for rehydration and keep full content as originalContent
            result.summaryTurns.unshift({
                id: msg.id,
                role: msg.role,
                summary: summary?.summary || `[${msg.role}]: ${msg.content}`,  // Full content as fallback (UI will handle display)
                originalContent: msg.content,  // Always store for rehydration
                tokenCount: summary?.tokenCount || msg.tokenCount || Math.ceil(msg.content.length / 4),
                hasSummary: !!summary?.summary,
                createdAt: msg.createdAt  // For sorting
            });
        } else {
            result.availableIds.unshift(msg.id);
        }
    }

    return result;
}

