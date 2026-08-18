const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const userscriptPath = path.join(projectRoot, 'chat-ai-enhancer.user.js');
const source = fs.readFileSync(userscriptPath, 'utf8');
const sandbox = {
    console,
    globalThis: null,
    __CHAT_AI_ENHANCER_TEST_MODE__: true
};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: userscriptPath });

const api = sandbox.__CHAT_AI_ENHANCER_TEST_API__;
assert.ok(api, 'userscript test API was not exposed');

function createFixtureMessage({ id, isSelf, author, text }) {
    const heading = {
        innerText: author,
        textContent: author,
        getAttribute(name) {
            return name === 'data-message-id' ? id : null;
        }
    };
    const body = {
        innerText: text,
        textContent: text,
        getAttribute() {
            return null;
        },
        closest() {
            return null;
        },
        contains() {
            return false;
        }
    };
    const content = {
        querySelectorAll() {
            return [body];
        }
    };
    const root = {
        parentElement: null,
        querySelector(selector) {
            if (selector === ':scope > .EAOoq') return text == null ? null : content;
            if (selector === '[data-message-id][data-is-message]') return heading;
            return null;
        }
    };
    const marker = {
        parentElement: root,
        getAttribute(name) {
            return name === 'data-is-viewer-message-creator' ? String(isSelf) : null;
        }
    };
    return marker;
}

const markers = [
    createFixtureMessage({
        id: 'm1',
        isSelf: false,
        author: 'דנה',
        text: 'אפשר לעדכן מתי זה מוכן?'
    }),
    createFixtureMessage({
        id: 'm2',
        isSelf: true,
        author: 'אני',
        text: 'כן, אני בודק ואעדכן.'
    })
];
const chatFixture = {
    querySelectorAll() {
        return markers;
    }
};
const messages = api.extractGoogleChatMessages(chatFixture, { userName: 'יעל' });

assert.equal(messages.length, 2);
assert.deepEqual(
    JSON.parse(JSON.stringify(
        messages.map(({ id, role, author, text }) => ({ id, role, author, text }))
    )),
    [
        { id: 'm1', role: 'other', author: 'דנה', text: 'אפשר לעדכן מתי זה מוכן?' },
        { id: 'm2', role: 'self', author: 'יעל', text: 'כן, אני בודק ואעדכן.' }
    ]
);

const history = api.formatConversationHistory(messages);
assert.match(history, /\[אחר — דנה\]/);
assert.match(history, /\[אני — יעל\]/);

const selfDirective = api.getConversationDirective({ lastMessageRole: 'self' });
assert.match(selfDirective, /אין לענות לה כאילו נכתבה על ידי אדם אחר/);
assert.match(selfDirective, /להמשיך באופן טבעי/);

const otherDirective = api.getConversationDirective({ lastMessageRole: 'other' });
assert.match(otherDirective, /לנסח עבורה תשובה/);

assert.equal(api.shouldAutoReplyToLatestMessage({ messages }), false);
assert.equal(api.shouldAutoReplyToLatestMessage({ messages: messages.slice(0, 1) }), true);

const attachmentOnly = api.extractGoogleChatMessages({
    querySelectorAll() {
        return [createFixtureMessage({
            id: 'm3',
            isSelf: true,
            author: 'אני',
            text: null
        })];
    }
}, { userName: 'יעל' });
assert.equal(attachmentOnly[0].role, 'self');
assert.match(attachmentOnly[0].text, /תוכן מצורף/);
assert.equal(api.shouldAutoReplyToLatestMessage({ messages: attachmentOnly }), false);

assert.match(source, /\/\/ @version\s+2\.4\.0/);
assert.match(source, /createElementNS\(namespace, 'svg'\)/);
assert.match(source, /data-tooltip/);
assert.doesNotMatch(source, /createChatButton\(['"](?:✨|↻|✎|⚙)/);

console.log('userscript tests passed');
