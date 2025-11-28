// ==UserScript==
// @name         Unified Chat AI Enhancer (גרסה 3.4.2)
// @namespace    Frozi
// @version      3.4.2
// @description  תגובות AI טבעיות בג׳ימייל/גוגל-צ׳אט – טריגרים (‘-’,‘--’,‘---’) עם מודעות לשם הכותב וטעינה חוזרת ב-TAB
// @match        https://mail.google.com/*
// @match        https://chat.google.com/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @connect      generativelanguage.googleapis.com
// ==/UserScript==

(() => {
  'use strict';

  const MODEL = 'gemini-2.5-flash-preview-05-20';
  let MY_NAME = 'אני';
  let OTHER_NAME = '';
  let lastContextPrompt = '';
  let activeBox = null;
  let waitingForReply = null;

  const getKey = () => GM_getValue('gemini_api_key', '');
  const setKey = () => {
    const cur = getKey();
    const input = prompt('🔑 הזן מפתח API מ-Gemini (ריק=מחיקה):', cur);
    if (input === null) return;
    GM_setValue('gemini_api_key', input.trim());
    alert(input.trim() ? '✅ מפתח נשמר' : '🔓 מפתח נמחק');
  };
  GM_registerMenuCommand('🔑 הגדר מפתח API', setKey);

  GM_addStyle(`
@keyframes dots {
  0% { content: '' }
  33% { content: '.' }
  66% { content: '..' }
  100% { content: '...' }
}
.dotty::after {
  display: inline-block;
  white-space: pre;
  animation: dots 1s steps(3,end) infinite;
  content: '';
}
`);

  const $all = sel => Array.from(document.querySelectorAll(sel));
  const getAllMessages = () => $all('.Zc1Emd').filter(el => el.innerText.trim());
  const senderOf = el =>
    (el?.closest('[data-sender-name]')?.getAttribute('data-sender-name')) || '';
  const getLastSenderName = () => {
    const msgs = getAllMessages();
    const last = msgs.at(-1);
    return last ? senderOf(last) : '';
  };
  const getLastMessagesText = n =>
    getAllMessages()
      .slice(-n)
      .map(el => `${senderOf(el)}: ${el.innerText.trim()}`)
      .join('\n');
  const getLastMessageOnly = () =>
    getAllMessages().at(-1)?.innerText.trim() || '';

  const detectNames = activeBox => {
    if (!activeBox?.isContentEditable) return;
    const msgs = getAllMessages();
    const idx = msgs.findIndex(el => el.contains(activeBox));
    if (idx > 0) {
      const meCandidate = senderOf(msgs[idx - 1]);
      if (meCandidate) MY_NAME = meCandidate;
    }
    const lastSender = getLastSenderName();
    if (lastSender && lastSender !== MY_NAME) OTHER_NAME = lastSender;
  };

  const RESPONSES = [
    'סבבה',
    'ברור',
    'מגניב',
    'וואלה',
    'חח',
    'קטלני',
    'יאללה',
    'מעולה',
    'נשמע טוב',
    '👍',
    '👌',
    '🤙',
    '🔥',
    '🚀',
    '✅',
    '😉'
  ];

  const askGemini = promptText =>
    new Promise(resolve => {
      const key = getKey();
      if (!key) return resolve('🛑 חסר מפתח API.');
      GM_xmlhttpRequest({
        method: 'POST',
        url: `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: promptText }] }]
        }),
        onload: r => {
          try {
            const j = JSON.parse(r.responseText);
            resolve(
              j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '❌'
            );
          } catch (e) {
            console.error(e);
            resolve('❌ (parse error)');
          }
        },
        onerror: () => resolve('❌ (net error)')
      });
    });

  const showLoader = (box, txt, desc) => {
    box.textContent = '';
    const w = document.createElement('span');
    w.style.color = '#888';
    w.textContent = desc;
    const d = document.createElement('span');
    d.classList.add('dotty');
    w.appendChild(d);
    box.appendChild(w);
  };

  window.addEventListener('focusin', ev => {
    const box = ev.target;
    if (!box.isContentEditable || box.dataset.hooked) return;
    box.dataset.hooked = '1';
    activeBox = box;
    detectNames(box);

    box.addEventListener(
      'keydown',
      async e => {
        if (e.key !== 'Enter') return;
        const txt = box.textContent.trim();

        if (['-', '--', '---'].includes(txt)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          waitingForReply = txt;

          let loaderText = '🎲';
          if (txt === '-') loaderText = '🎨 אימוג׳ים מותאמים';
          if (txt === '--') loaderText = '💭 מגיב בהקשר';
          showLoader(box, txt, loaderText);

          let reply = '';
          try {
            if (txt === '-') {
              const last = getLastMessageOnly();
              const prompt = `אתה כותב *רק* 1-3 אימוג׳ים שמתאימים לתוכן הבא שנכתב ע"י "${OTHER_NAME}":
"${last}"
ללא מילים כלל – אימוג׳ים בלבד!`;
              lastContextPrompt = prompt;
              reply = await askGemini(prompt);
            } else if (txt === '--') {
              const context = getLastMessagesText(6);
              const last = getLastMessageOnly();
              if (/איך קוראים|מה השם שלי/iu.test(last)) {
                reply = OTHER_NAME || 'לא בטוח';
              } else {
                const prompt = `להלן 6 ההודעות האחרונות בצ'אט. אתה הוא "${MY_NAME}".
${OTHER_NAME ? `לחבר שלך קוראים "${OTHER_NAME}".` : ''}

על סמך ההודעה *האחרונה בלבד* כתוב תשובה קצרה, טבעית, יומיומית (עד 15 מילים). אם צריך אפשר להתחשב בקונטקסט הקודם.
הודעות:
${context}
-----
תגובה שלך בלבד:`;
                lastContextPrompt = prompt;
                reply = await askGemini(prompt);
              }
            } else {
              reply = RESPONSES[Math.floor(Math.random() * RESPONSES.length)];
            }
          } catch (err) {
            console.error(err);
            reply = '🛑 שגיאה';
          }

          box.textContent = reply + '\n← Enter לשליחה';
          box.style.color = 'green';
          return;
        }

        if (
          waitingForReply &&
          box.textContent.endsWith('← Enter לשליחה')
        ) {
          e.preventDefault();
          e.stopImmediatePropagation();
          box.textContent = box.textContent.replace(
            '\n← Enter לשליחה',
            ''
          );
          box.style.color = '';
          waitingForReply = null;
          box.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true
            })
          );
        }
      },
      true
    );
  });

  document.addEventListener('keydown', async e => {
    if (
      e.key === 'Tab' &&
      waitingForReply &&
      lastContextPrompt &&
      activeBox?.isContentEditable
    ) {
      e.preventDefault();
      showLoader(activeBox, '', '🔄 תגובה חדשה...');
      try {
        const newReply = await askGemini(lastContextPrompt);
        activeBox.textContent = newReply + '\n← Enter לשליחה';
        activeBox.style.color = 'green';
      } catch (err) {
        console.error(err);
        activeBox.textContent = '🛑 שגיאה';
      }
    }
  });

  console.log(
    '✅ Unified AI Enhancer 3.4.1 נטען – טריגרים: -, --, --- (TAB=רענון)'
  );
})();
