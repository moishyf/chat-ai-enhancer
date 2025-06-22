// ==UserScript==
// @name         Unified Chat AI Enhancer (גרסה 3.3)
// @namespace    Frozi
// @version      3.3.0
// @description  תגובות AI טבעיות בג׳ימייל/גוגל-צ׳אט – טריגרים (‘-’,‘--’,‘---’,‘----’) עם מודעות לשם הכותב וטעינה חוזרת ב-TAB
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

  // ======== 1. הגדרות בסיס ========
  const MODEL = 'gemini-2.5-flash-preview-05-20';
  let MY_NAME = 'אני';
  let OTHER_NAME = '';
  let lastContextPrompt = '';
  let activeBox = null;
  let waitingForReply = null;

  // ======== 2. ניהול מפתח API ========
  const getKey = () => GM_getValue('gemini_api_key', '');
  const setKey = () => {
    const cur = getKey();
    const input = prompt('🔑 הזן מפתח API מ-Gemini (ריק=מחיקה):', cur);
    if (input === null) return;
    GM_setValue('gemini_api_key', input.trim());
    alert(input.trim() ? '✅ מפתח נשמר' : '🔓 מפתח נמחק');
  };
  GM_registerMenuCommand('🔑 הגדר מפתח API', setKey);

  // ======== 3. CSS ל-Loader “שלוש נקודות” ========
  GM_addStyle(`
    @keyframes dots{0%{content:''}33%{content:'.'}66%{content:'..'}100%{content:'...'}}
    .dotty::after{
      display:inline-block;
      white-space:pre;
      animation:dots 1s steps(3,end) infinite;
      content:''
    }
  `);

  // ======== 4. Utilities ========
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

  const detectNames = box => {
    if (!box?.isContentEditable) return;
    const msgs = getAllMessages();
    const idx = msgs.findIndex(el => el.contains(box));
    if (idx > 0) {
      const meCandidate = senderOf(msgs[idx - 1]);
      if (meCandidate) MY_NAME = meCandidate;
    }
    const lastSender = getLastSenderName();
    if (lastSender && lastSender !== MY_NAME) OTHER_NAME = lastSender;
  };

  // ======== 5. מאגרי תגובות ========
  const RESPONSES = [
    'סבבה', 'ברור', 'מגניב', 'וואלה', 'חח', 'קטלני',
    'יאללה', 'מעולה', 'נשמע טוב', '👍', '👌', '🤙', '🔥', '🚀', '✅', '😉'
  ];
  const THANK_RESPONSES = [
    'אין בעד מה — השירות מוגש באהבה וללא עמלה 😉',
    'בשמחה! תמיד כאן לשירותך, פלוס אחריות לכל החיים 🚀',
    'בכיף גדול, אני גובה רק חיוך קטנטן כעמלה 😎',
    'הנאה צרופה היא הצד שלי בעסקה. תהנה! 🎉'
  ];

  // ======== 6. קריאה ל-Gemini ========
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
          } catch {
            resolve('❌ (parse error)');
          }
        },
        onerror: () => resolve('❌ (net error)')
      });
    });

  // ======== 7. Loader קטן ========
  const showLoader = (box, desc) => {
    box.textContent = '';
    const w = document.createElement('span');
    w.style.color = '#888';
    w.textContent = desc;
    const d = document.createElement('span');
    d.classList.add('dotty');
    w.appendChild(d);
    box.appendChild(w);
  };

  // ======== 8. Event Handling – תיבת הקלדה ========
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

        /* ——— טריגר ---- (תודה ארוכה) ——— */
        if (txt === '----') {
          e.preventDefault();
          e.stopImmediatePropagation();
          waitingForReply = txt;

          showLoader(box, '💌 תשובת תודה ארוכה');

          const reply =
            THANK_RESPONSES[Math.floor(Math.random() * THANK_RESPONSES.length)];
          box.textContent = `${reply}\n← Enter לשליחה`;
          box.style.color = 'green';
          return;
        }

        /* ——— טריגר --- (תגובה אקראית קצרה) ——— */
        if (txt === '---') {
          e.preventDefault();
          e.stopImmediatePropagation();
          waitingForReply = txt;

          showLoader(box, '🎲 תגובה אקראית');

          const reply =
            RESPONSES[Math.floor(Math.random() * RESPONSES.length)];
          box.textContent = `${reply}\n← Enter לשליחה`;
          box.style.color = 'green';
          return;
        }

        /* ——— טריגר -- (מגיב בהקשר) ——— */
        if (txt === '--') {
          e.preventDefault();
          e.stopImmediatePropagation();
          waitingForReply = txt;

          showLoader(box, '💭 מגיב בהקשר');

          const context = getLastMessagesText(6);
          const last = getLastMessageOnly();
          let reply;
          if (/איך קוראים|מה השם שלי/iu.test(last)) {
            reply = OTHER_NAME || 'לא בטוח';
          } else {
            lastContextPrompt = `להלן 6 ההודעות האחרונות בצ'אט. אתה הוא "${MY_NAME}".\n${
              OTHER_NAME ? `לחבר שלך קוראים "${OTHER_NAME}".\n` : ''
            }\nעל סמך ההודעה *האחרונה בלבד* כתוב תשובה קצרה, טבעית, יומיומית (עד 15 מילים). אם צריך אפשר להתחשב בקונטקסט.\nהודעות:\n${context}\n-----\nתגובה שלך בלבד:`;
            reply = await askGemini(lastContextPrompt);
          }
          box.textContent = `${reply}\n← Enter לשליחה`;
          box.style.color = 'green';
          return;
        }

        /* ——— טריגר - (אימוג׳י־בלבד) ——— */
        if (txt === '-') {
          e.preventDefault();
          e.stopImmediatePropagation();
          waitingForReply = txt;

          showLoader(box, '🎨 אימוג׳ים מותאמים');

          const last = getLastMessageOnly();
          lastContextPrompt = `אתה כותב *רק* 1-3 אימוג׳ים שמתאימים לתוכן הבא שנכתב ע"י "${OTHER_NAME}":\n"${last}"\nללא מילים כלל – אימוג׳ים בלבד!`;
          const reply = await askGemini(lastContextPrompt);
          box.textContent = `${reply}\n← Enter לשליחה`;
          box.style.color = 'green';
          return;
        }

        /* ——— שליחת הודעה אחרי התצוגה המקדימה ——— */
        if (
          waitingForReply &&
          box.textContent.endsWith('← Enter לשליחה')
        ) {
          e.preventDefault();
          e.stopImmediatePropagation();
          box.textContent = box.textContent.replace('\n← Enter לשליחה', '');
          box.style.color = '';
          waitingForReply = null;
          /* מדמה לחיצה אמיתית על Enter לשליחת ההודעה */
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

  // ======== 9. TAB – ריענון תשובה ========
  document.addEventListener('keydown', async e => {
    if (
      e.key === 'Tab' &&
      waitingForReply &&
      lastContextPrompt &&
      activeBox?.isContentEditable
    ) {
      e.preventDefault();
      showLoader(activeBox, '🔄 תגובה חדשה...');
      try {
        const newReply = await askGemini(lastContextPrompt);
        activeBox.textContent = `${newReply}\n← Enter לשליחה`;
        activeBox.style.color = 'green';
      } catch {
        activeBox.textContent = '🛑 שגיאה';
      }
    }
  });

  // ======== 10. בוט Loaded ========
  console.log(
    '✅ Unified AI Enhancer 3.3 טעון – טריגרים: -, --, ---, ---- (TAB=רענון)'
  );
})();
