// ==UserScript==
// @name         Unified Chat AI Enhancer (גרסה 2.9)
// @namespace    Frozi
// @version      2.9.1
// @description  תגובות אוטומטיות לפי טריגרים (‘-’, ‘--’, ‘---’) – אימוג'ים, הקשר או אקראי במייל/צ’אט של גוגל (מאובטח, עם קיצורים תחביריים)
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

  // — הגדרות בסיסיות —
  const MODEL = 'gemini-1.5-flash-latest';
  let MY_NAME = 'אני';

  // — קיצור ל־API Key ב־Storage —
  const getKey = () => GM_getValue('gemini_api_key', '');
  const setKey = () => {
    const cur = getKey();
    const input = prompt('🔑 הזן מפתח API מ-Gemini (השאר ריק למחיקה):', cur);
    if (input === null) return;              // ביטול ללא שינוי
    const trimmed = input.trim();
    GM_setValue('gemini_api_key', trimmed);
    alert(trimmed ? '✅ מפתח נשמר' : '🔓 מפתח נמחק');
  };
  GM_registerMenuCommand('🔑 הגדר מפתח API', setKey);

  // — הוספת CSS מונע Trusted Types באווירת CSP —
  GM_addStyle(`
    @keyframes dots {
      0% { content: ''; }
      33% { content: '.'; }
      66% { content: '..'; }
      100% { content: '...'; }
    }
    .dotty::after {
      display: inline-block;
      white-space: pre;
      animation: dots 1s steps(3,end) infinite;
      content: '';
    }
  `);

  // — משתנה לטיפול במצב “מחכה לתשובה” —
  let waitingForReply = null;

  // — פונקציה כללית לשליחת בקשה ל-Gemini ולקבלת טקסט חזרה —
  const askGemini = promptText => new Promise((resolve, reject) => {
    const key = getKey();
    if (!key) return resolve('🛑 אין מפתח API.');
    GM_xmlhttpRequest({
      method: 'POST',
      url: `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: promptText }] }] }),
      onload: r => {
        try {
          const j = JSON.parse(r.responseText);
          const text = j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '❌ אין תגובה';
          resolve(text);
        } catch (e) {
          console.error('Parsing Error:', e, r.responseText);
          reject(e);
        }
      },
      onerror: err => {
        console.error('Request Error:', err);
        reject(err);
      }
    });
  });

  // — קיצורי DOM ל־Gmail/Chat לסלקטורים סטנדרטיים של הודעות —
  const getAllMessages = () =>
    Array.from(document.querySelectorAll('.Zc1Emd')).filter(el => el.innerText.trim());
  const getLastMessagesText = n =>
    getAllMessages()
      .slice(-n)
      .map(el => `${el.closest('[data-sender-name]')?.getAttribute('data-sender-name') || 'משתמש'}: ${el.innerText.trim()}`)
      .join('\n');
  const getLastMessageOnly = () =>
    getAllMessages().at(-1)?.innerText.trim() || '❌ לא נמצאה הודעה אחרונה.';

  // — זיהוי עצמי (MY_NAME) מתוך ההודעה הישנה לפני תיבת הקלט —
  const detectMyName = () => {
    const box = document.activeElement;
    if (!box?.isContentEditable) return;
    const msgs = getAllMessages();
    const idx = msgs.findIndex(el => el.contains(box));
    const prev = msgs[idx - 1];
    const sender = prev?.closest('[data-sender-name]')?.getAttribute('data-sender-name');
    if (sender) {
      MY_NAME = sender;
      console.log('🕵️‍♂️ שם מזוהה:', MY_NAME);
    }
  };

  // — סט תגובות אקראיות (ניתן לקצר ולהוסיף/למשוך ממאגר אם רוצים) —
  const RESPONSES = [
    'סבבה', 'אושר', 'ברור', 'לגמרי', 'אולי', 'בטוח', 'חמוד', 'וואלה', 'נו', 'קול',
    'הגיוני בהחלט', 'נשמע מעניין', 'לא יודע 🤷‍♂️', 'נראה לי', 'אפשרי לגמרי',
    'אין תלונות', 'זה רעיון', 'על הכיפאק', 'שווה בדיקה', 'נזרום עם זה',
    'תלוי בזווית', 'אחלה כיוון', 'סביר להניח', 'לא בטוח', 'כבר בדרך',
    'זה משהו', 'מרים גבה', 'יאללה סבבה', 'חצי כוח', 'פחות מתחבר', 'אין שכל אין דאגות', 'שמחתי לתת שירות', 'השירות ניתן ללא עמלה',
    'מגניב', 'יפה לך', 'פייר? מעניין', 'חזק', 'שמע מעולה', 'זה הולך',
    'חיובי', 'שלילי', 'חצי־חצי', 'מתלבט', 'לא סגור', 'בכיף', 'קטן עליי',
    'בדיוק חשבתי על זה', 'זה זה', 'נשמע פצצה', 'אליפות', 'יש מצב',
    'לא נראה לי', 'נשמע פחות', 'דרוש בירור', 'קליל', 'כבד', 'טוב להבין',
    'מחכה לתשובה', 'בינתיים סבבה', 'אחלה רעיון', 'תן לחשוב', 'תפור עליך',
    'אש', 'סולידי', 'מבולבל', 'נשמר במערכת', 'כיוונתי לשם', 'נו שוין',
    '👍', '👌', '🤙', '👏', '💪', '🤔', '🙃', '😅', '😎', '🤷‍♂️',
    '🥳', '🔥', '🚀', '💡', '🔍', '🧐', '🆗', '⏳', '✅', '❌',
    '⚠️', '🔄', '🤯', '🙌', '😐',
    '👍 על זה', '🤔 מעניין', '🔥 הולך חזק', '🚀 קדימה', '✅ מאושר',
    '❌ לא כרגע', '😅 ננסה', '😎 קיבלתי', '🧐 בודק', '🙏 תודה',
    '⏳ רגע', '💡 הברקה', '🔄 חוזר אליך', '📌 סגור',
    '🤯 וואו', '🙌 סיימנו', '🤝 עניין נסגר', '📚 לומד את זה',
    '⚒️ בעבודה', '🌟 כוכב', '🥴 מסובך', '🤿 צולל לזה',
    '🛠️ מתקן', '🍀 בהצלחה', '📞 נדבר', '💤 נרדמתי',
    '🥲 ננסה שוב', '🎯 בול', '📈 מתקדם'
  ];

  // — מאזינים ל’פוקוס’ על תיבת התוכן (ContentEditable) למייל/צ’אט —
  window.addEventListener('focusin', ev => {
    const box = ev.target;
    if (!box.isContentEditable || box.dataset.hooked) return;
    box.dataset.hooked = '1';
    detectMyName();

    box.addEventListener('keydown', async e => {
      if (e.key !== 'Enter') return;
      const txt = box.textContent.trim();

      // — אם המשתמש הכניס "-", "--" או "---", נפעיל טריגר מיוחד —
      if (['-', '--', '---'].includes(txt)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        waitingForReply = txt;
        box.textContent = ''; // מגרשים טקסט ישן

        // ״Loader״ עם אנימציית נקודות
        const wrapper = document.createElement('span');
        wrapper.style.color = '#888';
        wrapper.textContent = txt === '-' ? '🎨 מתרגם לאימוג\'ים' :
                             txt === '--' ? '💭 מגיב לפי הקשר' :
                                             '🎲 בוחר תגובה';
        const dotSpan = document.createElement('span');
        dotSpan.classList.add('dotty');
        wrapper.appendChild(dotSpan);
        box.appendChild(wrapper);

        try {
          let reply = '';
          if (txt === '-') {
            // — טריגר אימוג'ים בלבד —
            const lastMsg = getLastMessageOnly();
            const prompt = `
אתה בוט תגובות בצ'אט, שנון וחכם, מגיב לאנשים באמצעות 2–3 אימוג'ים בלבד (ללא טקסט).
התשובה צריכה להיות קצרה וברי־הבנה, כאילו לחבר קרוב.
שאלה: "${lastMsg}"
תגובה (אימוג'ים בלבד, עד 3):`;
            reply = await askGemini(prompt);
          } else if (txt === '--') {
            // — טריגר הקשרי —
            const context = getLastMessagesText(10);
            const prompt = `
להלן מספר הודעות אחרונות בצ'אט בין שני אנשים.
עליך לכתוב תשובה טבעית, קצרה, אמיתית, בלי מילים גבוהות, בלי הקדמות, כאילו אתה עונה לחבר שלך בווטסאפ או גוגל צ'אט.
התגובה צריכה להשתלב הכי טבעי שיש ולפעמים גם אפשר להשיב סתם ב"חח", "סבבה", "מגניב", או דומה, אם זה מתאים.
הודעות אחרונות:
${context}
כתוב רק את התגובה שלך, בלי תוספות מסביב.
`.trim();
            reply = await askGemini(prompt);
          } else {
            // — טריגר אקראי (“---”) —
            const i = Math.floor(Math.random() * RESPONSES.length);
            reply = RESPONSES[i];
          }

          // לאחר קבלת התשובה, מציגים אותה (ירוקה) עם רמז לשליחה
          box.textContent = reply + '\n← לחץ Enter לשליחה';
          box.style.color = 'green';
        } catch (err) {
          console.error('Error in askGemini:', err);
          box.textContent = '🛑 שגיאה';
          box.style.color = 'red';
        }

        return;
      }

      // — אם כעת מחכים לתשובה והמשתמש לוחץ Enter שוב, שולחים את התשובה —
      if (waitingForReply === '-') {
        if (box.textContent.endsWith('← לחץ Enter לשליחה')) {
          e.preventDefault();
          e.stopImmediatePropagation();
          box.textContent = box.textContent.replace('\n← לחץ Enter לשליחה', '');
          box.style.color = '';
          waitingForReply = null;
          box.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
            bubbles: true, cancelable: true
          }));
        }
      } else if (waitingForReply === '--' || waitingForReply === '---') {
        if (box.textContent.endsWith('← לחץ Enter לשליחה')) {
          e.preventDefault();
          e.stopImmediatePropagation();
          box.textContent = box.textContent.replace('\n← לחץ Enter לשליחה', '');
          box.style.color = '';
          waitingForReply = null;
          box.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
            bubbles: true, cancelable: true
          }));
        }
      }
    }, true);
  });

  console.log('✅ Unified AI Script (גרסה 2.9) נטען – טריגרים: "-", "--", "---".');
})();
