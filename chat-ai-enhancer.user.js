// ==UserScript==
// @name         Unified Chat AI Enhancer
// @namespace    Frozi
// @version      2.5
// @description  תגובות אוטומטיות לפי טריגרים שונים – אימוג'ים, רנדום, או תגובה בהקשר השיחה
// @match        https://mail.google.com/*
// @match        https://chat.google.com/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      generativelanguage.googleapis.com
// ==/UserScript==

(() => {
  const MODEL = "gemini-1.5-flash-latest";
  let MY_NAME = "אני";

  const getApiKey = () => GM_getValue("gemini_api_key", "");

  const setApiKey = () => {
    const current = GM_getValue("gemini_api_key", "");
    const key = prompt("🔑 הזן את מפתח ה-API שלך מ-Gemini:", current);
    if (key !== null) {
      GM_setValue("gemini_api_key", key.trim());
      alert("✅ המפתח נשמר!");
    }
  };

  GM_registerMenuCommand("🔑 הגדר מפתח API", setApiKey);

  const askGemini = promptText => new Promise((resolve, reject) => {
    const API_KEY = getApiKey();
    if (!API_KEY) return resolve("🛑 אין מפתח API.");

    GM_xmlhttpRequest({
      method: "POST",
      url: `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: promptText }] }]
      }),
      onload: res => {
        try {
          const j = JSON.parse(res.responseText);
          resolve(j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "❌ אין תגובה");
        } catch (e) {
          reject(e);
        }
      },
      onerror: err => reject(err)
    });
  });

  const getLastMessages = (limit = 5) => {
    const elements = Array.from(document.querySelectorAll('.Zc1Emd'))
      .filter(n => n.innerText?.trim());
    return elements.slice(-limit).map(el => {
      const container = el.closest('[data-sender-name]');
      const sender = container?.getAttribute('data-sender-name') || "משתמש";
      return `${sender}: ${el.innerText.trim()}`;
    }).join("\n");
  };

  const getLastMessageText = () => {
    const elements = Array.from(document.querySelectorAll('.Zc1Emd'))
      .filter(n => n.innerText?.trim());
    return elements.at(-1)?.innerText?.trim() || "❌ לא נמצאה הודעה אחרונה.";
  };

  const detectMyName = () => {
    const inputBox = document.activeElement;
    if (!inputBox?.isContentEditable) return;

    const msgEls = Array.from(document.querySelectorAll('.Zc1Emd')).filter(el => el.innerText?.trim());
    const boxIndex = msgEls.findIndex(el => el.contains(inputBox));
    const myMsg = msgEls[boxIndex - 1];
    const sender = myMsg?.closest('[data-sender-name]')?.getAttribute('data-sender-name');
    if (sender) {
      MY_NAME = sender;
      console.log("🕵️‍♂️ שם מזוהה:", MY_NAME);
    }
  };

  const RESPONSES = ["סבבה", "אושר", "ברור", "לגמרי", "אולי", "בטוח", "חמוד", "וואלה", "נו", "קול",
    "הגיוני בהחלט", "נשמע מעניין", "לא יודע 🤷‍♂️", "נראה לי", "אפשרי לגמרי", "אין תלונות", "זה רעיון",
    "על הכיפאק", "שווה בדיקה", "נזרום עם זה", "תלוי בזווית", "אחלה כיוון", "סביר להניח", "לא בטוח",
    "כבר בדרך", "זה משהו", "מרים גבה", "יאללה סבבה", "חצי כוח", "פחות מתחבר"];

  // הוספת CSS לאנימציה
  const style = document.createElement("style");
  style.innerHTML = `
    @keyframes dots {
      0% { content: ''; }
      33% { content: '.'; }
      66% { content: '..'; }
      100% { content: '...'; }
    }
    .dotty::after {
      display: inline-block;
      white-space: pre;
      animation: dots 1s steps(3, end) infinite;
      content: '';
    }
  `;
  document.head.appendChild(style);

  let currentTrigger = null;
  window.addEventListener("focusin", ev => {
    const box = ev.target;
    if (!box.isContentEditable || box.dataset.multiHooked) return;
    box.dataset.multiHooked = "1";

    detectMyName();

    box.addEventListener("keydown", async e => {
      if (e.key !== "Enter") return;
      const text = box.textContent.trim();

      if (["-", "--", "---"].includes(text)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        currentTrigger = text;

        // תצוגת טעינה עם אנימציה לפי סוג טריגר
        if (text === "-") {
          box.innerHTML = `<span style="color:#888">🎨 מתרגם לאימוג'ים<span class="dotty"></span></span>`;
        } else if (text === "--") {
          box.innerHTML = `<span style="color:#888">💭 מגיב לפי הקשר<span class="dotty"></span></span>`;
        } else {
          box.innerHTML = `<span style="color:#888">🎲 בוחר תגובה<span class="dotty"></span></span>`;
        }

        try {
          let reply = "";
          if (text === "-") {
            const msg = getLastMessageText();
 const prompt = `אתה בוט תגובות בצ'אט שמגיב לאנשים בצורה שנונה ומובנת באמצעות אימוג'ים בלבד.
מטרתך היא להגיב למשפט של אדם אחר, **ולא לתרגם אותו**.
עליך להשתמש בלא יותר מ-2–3 אימוג'ים בלבד, כך שהתגובה תהיה ברורה, מצחיקה או חכמה.
אל תשתמש במשפטים, רק אימוג'ים – והתגובה צריכה להיות קצרה, כאילו נכתבה לחבר בצ'אט.

### דוגמאות:
שאלה: "רוצה ללכת לים?"
תגובה: 👍🌊

שאלה: "שכחתי את הסנדוויץ'"
תגובה: 🥪😢

שאלה: "יאללה נתקדם?"
תגובה: 🚶‍♂️✔️

שאלה: "אין קליטה פה"
תגובה: 📵📶

שאלה: "יש מחר מבחן ענק"
תגובה: 📚😨

שאלה: "${msg}"
תגובה (אימוג'ים בלבד, עד 3):`;

            reply = await askGemini(prompt);
          } else if (text === "--") {
            const context = getLastMessages(10);
const prompt = `הנך משתתף בצ'אט קבוצתי בתור "${MY_NAME}", בחור שנון עם סגנון עוקצני-חביב. להלן כמה מההודעות האחרונות בצ'אט. ההודעה האחרונה נכתבה על-ידי מישהו אחר, ואתה מגיב אליה בתגובה קצרה ועוקצנית (שורה אחת), בגובה העיניים.

חשוב: אל תכתוב המשך כאילו אתה אותו אדם שכתב את ההודעה האחרונה. התייחס אליו בגוף שני – אתה מגיב לו, לא ממשיך אותו.

אם יש הקשר רלוונטי מהודעות קודמות, תוכל להשתמש בו – אבל התגובה צריכה להיות בעיקר להודעה האחרונה.

שיחה:
${context}

כתוב תגובה חדה:`;

            reply = await askGemini(prompt);
          } else {
            reply = RESPONSES[Math.random() * RESPONSES.length | 0];
          }
          box.textContent = reply + "\n← לחץ Enter לשליחה";
          box.style.color = "green";
          currentTrigger = "ready";
        } catch (err) {
          box.textContent = "🛑 שגיאה";
          box.style.color = "red";
        }
        return;
      }

      if (currentTrigger === "ready") {
        e.preventDefault();
        e.stopImmediatePropagation();
        box.textContent = box.textContent.replace("\n← לחץ Enter לשליחה", "");
        box.style.color = "";
        currentTrigger = null;
        box.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter", code: "Enter", keyCode: 13, which: 13,
          bubbles: true, cancelable: true
        }));
      }
    }, true);
  });

  console.log("✅ Unified AI Script loaded – טריגרים: '-', '--', '---'");
})();
