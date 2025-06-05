// ==UserScript==
// @name         Unified Chat AI Enhancer (גרסה 3.1)
// @namespace    Frozi
// @version      3.1.0
// @description  תגובות AI טבעיות בג׳ימייל/גוגל‑צ׳אט – טריגרים (‘-’,‘--’,‘---’) עם מודעות לשם הכותב
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

  /* ───── CONSTANTS ───── */
  const MODEL   = 'gemini-2.5-flash-preview-05-20';
  let   MY_NAME = 'אני';          // יתעדכן אוטומטית
  let   OTHER_NAME = '';          // השם של הצד שמולנו

  /* ───── API‑KEY helpers ───── */
  const getKey = () => GM_getValue('gemini_api_key', '');
  const setKey = () => {
    const cur = getKey();
    const input = prompt('🔑 הזן מפתח API מ‑Gemini (ריק=מחיקה):', cur);
    if (input === null) return;
    GM_setValue('gemini_api_key', input.trim());
    alert(input.trim() ? '✅ מפתח נשמר' : '🔓 מפתח נמחק');
  };
  GM_registerMenuCommand('🔑 הגדר מפתח API', setKey);

  /* ───── Styles (dot‑loader) ───── */
  GM_addStyle(`
    @keyframes dots{0%{content:''}33%{content:'.'}66%{content:'..'}100%{content:'...'}}
    .dotty::after{display:inline-block;white-space:pre;animation:dots 1s steps(3,end) infinite;content:''}
  `);

  /* ───── Utils ───── */
  const $all = sel => Array.from(document.querySelectorAll(sel));

  /** מחזיר מערך כל ההודעות שיש בהן טקסט */
  const getAllMessages = () =>
    $all('.Zc1Emd').filter(el => el.innerText.trim());

  /** שם השולח (html attribute) */
const senderOf = el => (el?.closest('[data-sender-name]')?.getAttribute('data-sender-name')) || '';

  const getLastSenderName = () => {
    const msgs = getAllMessages();
    const last = msgs.at(-1);
    return last ? senderOf(last) : '';
  };

  /** X אחרונות (כולל שם השולח) */
  const getLastMessagesText = n =>
    getAllMessages()
      .slice(-n)
      .map(el => `${senderOf(el)}: ${el.innerText.trim()}`)
      .join('\n');

  const getLastMessageOnly = () => getAllMessages().at(-1)?.innerText.trim() || '';

  /* ───── Name detection (us & peer) ───── */
   const detectNames = activeBox => {
   if (!activeBox?.isContentEditable) return;
   const msgs = getAllMessages();
   const idx  = msgs.findIndex(el => el.contains(activeBox));
   if (idx > 0) {
   const meCandidate = senderOf(msgs[idx - 1]);
   if (meCandidate) MY_NAME = meCandidate;
 }

   const lastSender = getLastSenderName();
   if (lastSender && lastSender !== MY_NAME) OTHER_NAME = lastSender;
 };

  /* ───── Random fallback replies ───── */
  const RESPONSES = [
    'סבבה', 'ברור', 'מגניב', 'וואלה', 'חח', 'קטלני', 'יאללה', 'מעולה', 'נשמע טוב',
    '👍', '👌', '🤙', '🔥', '🚀', '✅', '😉'
  ];

  /* ───── Gemini call ───── */
  const askGemini = promptText => new Promise(resolve => {
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
          resolve(j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '❌');
        } catch {
          resolve('❌ (parse error)');
        }
      },
      onerror: () => resolve('❌ (net error)')
    });
  });

  /* ───── Main key handler ───── */
  let waitingForReply = null; // '-', '--', '---'

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

    detectNames(box);

    box.addEventListener('keydown', async e => {
      if (e.key !== 'Enter') return;
      const txt = box.textContent.trim();

      /* ── Trigger start ── */
      if (['-', '--', '---'].includes(txt)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        waitingForReply = txt;

        let loaderText = '🎲';
        if (txt === '-')  loaderText = '🎨 אימוג׳ים מותאמים';
        if (txt === '--') loaderText = '💭 מגיב בהקשר';
        showLoader(box, txt, loaderText);

        /* Build reply */
        let reply = '';
        try {
          if (txt === '-') {
            const last = getLastMessageOnly();
            const prompt = `
אתה כותב *רק* 1‑3 אימוג׳ים שמתאימים לתוכן הבא שנכתב ע"י "${OTHER_NAME}":
"${last}"
ללא מילים כלל – אימוג׳ים בלבד!
`.trim();
            reply = await askGemini(prompt);
          } else if (txt === '--') {
            const context = getLastMessagesText(6);
            const last    = getLastMessageOnly();
            // אם השאלה היא על שם, תענה בעצמך – בלי לפנות ל‑Gemini
            if (/איך קוראים|מה השם שלי/iu.test(last)) {
              reply = OTHER_NAME || 'לא בטוח';
            } else {
              const prompt = `
להלן 6 ההודעות האחרונות בצ'אט. אתה הוא "${MY_NAME}".
${OTHER_NAME ? `לחבר שלך קוראים "${OTHER_NAME}".` : ''}

על סמך ההודעה *האחרונה בלבד* כתוב תשובה קצרה, טבעית, יומיומית (עד 15 מילים). אם צריך אפשר להתחשב בקונטקסט הקודם.
הודעות:
${context}
-----
תגובה שלך בלבד:
`.trim();
              reply = await askGemini(prompt);
            }
          } else {
            reply = RESPONSES[Math.floor(Math.random()*RESPONSES.length)];
          }
        } catch(err){
          console.error(err);
          reply = '🛑 שגיאה';
        }

        box.textContent = reply + '\n← Enter לשליחה';
        box.style.color = 'green';
        return;
      }

      /* ── Second Enter => send ── */
      if (waitingForReply && box.textContent.endsWith('← Enter לשליחה')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        box.textContent = box.textContent.replace('\n← Enter לשליחה', '');
        box.style.color = '';
        waitingForReply = null;
        box.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          bubbles: true, cancelable: true
        }));
      }
    }, true);
  });

  console.log('✅ Unified AI Enhancer 3.1 טעון – טריגרים: -, --, ---');
})();
