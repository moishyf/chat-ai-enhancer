// ==UserScript==
// @name         Google Chat AI Replier (Gemini) - Pro
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  AI replies for Google Chat with a complete settings panel
// @match        https://mail.google.com/*
// @match        https://chat.google.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      generativelanguage.googleapis.com
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        geminiModel: 'gemini-3.1-flash-lite',
        selectors: {
            chatContainer: '.aH3, [role="main"], .nH.bkK, c-wiz[data-is-chat="true"]',
            chatInput: 'div[role="textbox"][contenteditable="true"]',
            chatHeader: '.aBv, [role="heading"], h2',
            sendButton: 'div[role="button"][aria-label*="Send"], div[role="button"][aria-label*="שליחה"], .ms'
        },
        autoReplyCooldownMs: 15000
    };

    const STYLE_OPTIONS = {
        direct: {
            label: 'ישיר וענייני',
            prompt: 'ישיר, פרקטי, ברור ובגובה העיניים'
        },
        friendly: {
            label: 'חברי וחם',
            prompt: 'חברי, חם, טבעי ונעים, כאילו נכתב לאדם שמכירים היטב'
        },
        funny: {
            label: 'מצחיק וקליל',
            prompt: 'קליל ומשעשע עם הומור טבעי ועדין, בלי להכריח בדיחה'
        },
        sarcastic: {
            label: 'עוקצני',
            prompt: 'עוקצני ושנון במידה, אך לא פוגעני, גס או מזלזל'
        },
        formal: {
            label: 'רשמי ומכובד',
            prompt: 'רשמי, מכובד, מנומס ומוקפד'
        },
        professional: {
            label: 'מקצועי',
            prompt: 'מקצועי, יעיל ומדויק, עם ניסוח שמתאים לשיחה עסקית'
        },
        empathetic: {
            label: 'אמפתי ורגיש',
            prompt: 'אמפתי, רגיש, תומך ומתחשב ברגשות שעולים בשיחה'
        },
        casual: {
            label: 'יומיומי וסלנג',
            prompt: 'יומיומי, זורם ולא רשמי, עם סלנג עברי טבעי במידה'
        }
    };

    const LENGTH_OPTIONS = {
        veryShort: {
            label: 'קצר מאוד',
            prompt: 'משפט אחד קצר'
        },
        short: {
            label: 'קצר',
            prompt: '1-2 משפטים קצרים וקולעים'
        },
        medium: {
            label: 'בינוני',
            prompt: 'פסקה אחת מפורטת במידה'
        },
        long: {
            label: 'ארוך ומפורט',
            prompt: 'תשובה מפורטת; אפשר להשתמש בנקודות או בשלבים כשזה מועיל'
        }
    };

    const lastAutoReplyTime = {};
    const autoReplyTimers = new WeakMap();
    let scanScheduled = false;

    function migrateStyle(value) {
        if (STYLE_OPTIONS[value]) return value;
        if (String(value).includes('הומור')) return 'funny';
        if (String(value).includes('רשמי')) return 'formal';
        if (String(value).includes('סלנג')) return 'casual';
        return 'direct';
    }

    function migrateLength(value) {
        if (LENGTH_OPTIONS[value]) return value;
        if (String(value).includes('ארוך')) return 'long';
        if (String(value).includes('בינוני')) return 'medium';
        return 'short';
    }

    function getSettings() {
        return {
            apiKey: String(GM_getValue('gemini_api_key', '') || ''),
            autoChats: String(GM_getValue('auto_reply_chats', '') || ''),
            userName: String(GM_getValue('gemini_user_name', '') || ''),
            gender: String(GM_getValue('gemini_user_gender', '') || ''),
            style: migrateStyle(GM_getValue('gemini_reply_style', 'direct')),
            length: migrateLength(GM_getValue('gemini_reply_length', 'short')),
            customInstructions: String(GM_getValue('gemini_custom_instructions', '') || '')
        };
    }

    function ensureSettingsUi() {
        let host = document.getElementById('gemini-replier-settings-host');
        if (host && host.shadowRoot) return host.shadowRoot;

        if (host) host.remove();
        host = document.createElement('div');
        host.id = 'gemini-replier-settings-host';
        host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';

        const root = host.attachShadow({ mode: 'open' });
        const styleElement = document.createElement('style');
        styleElement.textContent = `
                :host, * {
                    box-sizing: border-box;
                    letter-spacing: 0;
                }
                button:focus-visible,
                input:focus-visible,
                select:focus-visible,
                textarea:focus-visible {
                    outline: 3px solid rgba(11, 87, 208, .28);
                    outline-offset: 2px;
                }
                #settings-backdrop {
                    position: fixed;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 16px;
                    background: rgba(32, 33, 36, .62);
                    font-family: Arial, sans-serif;
                    pointer-events: auto;
                }
                #settings-dialog {
                    width: min(520px, calc(100vw - 32px));
                    max-height: calc(100vh - 32px);
                    overflow-y: auto;
                    direction: rtl;
                    background: #fff;
                    color: #202124;
                    border-radius: 8px;
                    box-shadow: 0 12px 36px rgba(0, 0, 0, .28);
                }
                .dialog-header {
                    position: sticky;
                    top: 0;
                    z-index: 1;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    min-height: 58px;
                    padding: 12px 18px;
                    border-bottom: 1px solid #dadce0;
                    background: #fff;
                }
                .dialog-header h2 {
                    margin: 0;
                    font-size: 20px;
                    font-weight: 600;
                }
                .icon-button {
                    width: 36px;
                    height: 36px;
                    display: grid;
                    place-items: center;
                    border: 0;
                    border-radius: 50%;
                    background: transparent;
                    color: #5f6368;
                    cursor: pointer;
                    font-size: 25px;
                }
                .icon-button:hover {
                    background: #f1f3f4;
                }
                .dialog-body {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 16px;
                    padding: 18px;
                }
                .field {
                    min-width: 0;
                }
                .field.full {
                    grid-column: 1 / -1;
                }
                label {
                    display: block;
                    margin-bottom: 6px;
                    font-size: 13px;
                    font-weight: 600;
                    color: #3c4043;
                }
                input[type="text"],
                input[type="password"],
                select,
                textarea {
                    width: 100%;
                    min-height: 40px;
                    padding: 8px 10px;
                    border: 1px solid #bdc1c6;
                    border-radius: 4px;
                    background: #fff;
                    color: #202124;
                    font: 14px/1.4 Arial, sans-serif;
                }
                textarea {
                    min-height: 76px;
                    resize: vertical;
                }
                input:hover,
                select:hover,
                textarea:hover {
                    border-color: #80868b;
                }
                .checkbox-row {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-top: 7px;
                    font-size: 13px;
                    color: #5f6368;
                }
                .checkbox-row input {
                    width: 16px;
                    height: 16px;
                    margin: 0;
                }
                .checkbox-row label {
                    margin: 0;
                    font-weight: 400;
                }
                .hint {
                    margin: 5px 0 0;
                    color: #5f6368;
                    font-size: 12px;
                    line-height: 1.4;
                }
                #settings-error {
                    display: none;
                    grid-column: 1 / -1;
                    margin: 0;
                    padding: 9px 11px;
                    border-right: 3px solid #d93025;
                    background: #fce8e6;
                    color: #a50e0e;
                    font-size: 13px;
                }
                .dialog-actions {
                    position: sticky;
                    bottom: 0;
                    display: flex;
                    justify-content: flex-start;
                    gap: 10px;
                    padding: 12px 18px;
                    border-top: 1px solid #dadce0;
                    background: #fff;
                }
                .action-button {
                    min-height: 38px;
                    padding: 8px 17px;
                    border: 1px solid #dadce0;
                    border-radius: 4px;
                    background: #fff;
                    color: #1a73e8;
                    cursor: pointer;
                    font: 600 14px/1 Arial, sans-serif;
                }
                .action-button:hover {
                    background: #f8fafd;
                }
                .action-button.primary {
                    border-color: #0b57d0;
                    background: #0b57d0;
                    color: #fff;
                }
                .action-button.primary:hover {
                    background: #0842a0;
                }
                .toast {
                    position: fixed;
                    left: 22px;
                    bottom: 80px;
                    max-width: min(360px, calc(100vw - 44px));
                    padding: 11px 16px;
                    direction: rtl;
                    border-radius: 4px;
                    background: #323232;
                    color: #fff;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, .25);
                    font: 14px/1.4 Arial, sans-serif;
                    pointer-events: none;
                }
                @media (max-width: 560px) {
                    .dialog-body {
                        grid-template-columns: 1fr;
                    }
                    .field.full,
                    #settings-error {
                        grid-column: 1;
                    }
                }
        `;
        root.appendChild(styleElement);

        const parent = document.body || document.documentElement;
        parent.appendChild(host);

        return root;
    }

    function showToast(message) {
        const root = ensureSettingsUi();
        root.querySelector('.toast')?.remove();
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        root.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function createUiElement(tagName, options = {}) {
        const element = document.createElement(tagName);
        if (options.id) element.id = options.id;
        if (options.className) element.className = options.className;
        if (options.text !== undefined) element.textContent = options.text;
        Object.entries(options.attributes || {}).forEach(([name, value]) => {
            element.setAttribute(name, value);
        });
        return element;
    }

    function createSettingsField(labelText, control, options = {}) {
        const field = createUiElement('div', {
            className: options.full === false ? 'field' : 'field full'
        });
        const label = createUiElement('label', {
            text: labelText,
            attributes: { for: control.id }
        });
        field.append(label, control);

        if (options.hint) {
            field.appendChild(createUiElement('p', {
                className: 'hint',
                text: options.hint
            }));
        }
        return field;
    }

    function appendSelectOptions(select, options, placeholder = null) {
        if (placeholder) {
            const placeholderOption = createUiElement('option', { text: placeholder });
            placeholderOption.value = '';
            select.appendChild(placeholderOption);
        }

        Object.entries(options).forEach(([value, option]) => {
            const optionElement = createUiElement('option', { text: option.label });
            optionElement.value = value;
            select.appendChild(optionElement);
        });
    }

    function openSettingsModal() {
        const root = ensureSettingsUi();
        root.getElementById('settings-backdrop')?.remove();

        const settings = getSettings();
        const backdrop = createUiElement('div', { id: 'settings-backdrop' });
        const dialog = createUiElement('section', {
            id: 'settings-dialog',
            attributes: {
                role: 'dialog',
                'aria-modal': 'true',
                'aria-labelledby': 'settings-title'
            }
        });

        const header = createUiElement('header', { className: 'dialog-header' });
        const title = createUiElement('h2', {
            id: 'settings-title',
            text: 'הגדרות תגובות AI'
        });
        const closeButton = createUiElement('button', {
            id: 'settings-close',
            className: 'icon-button',
            text: '×',
            attributes: {
                type: 'button',
                title: 'סגירה',
                'aria-label': 'סגירת ההגדרות'
            }
        });
        header.append(title, closeButton);

        const body = createUiElement('div', { className: 'dialog-body' });

        const apiControl = createUiElement('input', {
            id: 'gemini-api-input',
            attributes: {
                type: 'password',
                autocomplete: 'off',
                spellcheck: 'false'
            }
        });
        const apiField = createSettingsField('מפתח Gemini API', apiControl);
        const showApiRow = createUiElement('div', { className: 'checkbox-row' });
        const showApiControl = createUiElement('input', {
            id: 'gemini-show-api',
            attributes: { type: 'checkbox' }
        });
        const showApiLabel = createUiElement('label', {
            text: 'הצגת המפתח',
            attributes: { for: 'gemini-show-api' }
        });
        showApiRow.append(showApiControl, showApiLabel);
        apiField.appendChild(showApiRow);

        const nameControl = createUiElement('input', {
            id: 'gemini-name-input',
            attributes: {
                type: 'text',
                autocomplete: 'name',
                placeholder: 'לדוגמה: משה'
            }
        });

        const genderControl = createUiElement('select', { id: 'gemini-gender-input' });
        appendSelectOptions(genderControl, {
            male: { label: 'זכר' },
            female: { label: 'נקבה' }
        }, 'בחירת מגדר');

        const styleControl = createUiElement('select', { id: 'gemini-style-input' });
        appendSelectOptions(styleControl, STYLE_OPTIONS);

        const lengthControl = createUiElement('select', { id: 'gemini-length-input' });
        appendSelectOptions(lengthControl, LENGTH_OPTIONS);

        const customControl = createUiElement('textarea', {
            id: 'gemini-custom-input',
            attributes: {
                placeholder: "לדוגמה: בלי אימוג'י, השתמש בשפה פשוטה"
            }
        });

        const autoControl = createUiElement('input', {
            id: 'gemini-auto-input',
            attributes: {
                type: 'text',
                placeholder: 'לדוגמה: יעל, ארי, נתנאל'
            }
        });

        body.append(
            apiField,
            createSettingsField('השם שלי', nameControl, { full: false }),
            createSettingsField('המגדר שלי', genderControl, { full: false }),
            createSettingsField('סגנון תגובה', styleControl, { full: false }),
            createSettingsField('אורך תגובה', lengthControl, { full: false }),
            createSettingsField('הנחיות סגנון אישיות', customControl),
            createSettingsField('תגובה אוטומטית לאנשי קשר', autoControl, {
                hint: 'יש להפריד שמות בפסיק. לאנשים אלה התגובה תישלח אוטומטית.'
            })
        );

        const errorMessage = createUiElement('p', {
            id: 'settings-error',
            attributes: { role: 'alert' }
        });
        body.appendChild(errorMessage);

        const footer = createUiElement('footer', { className: 'dialog-actions' });
        const saveButton = createUiElement('button', {
            id: 'settings-save',
            className: 'action-button primary',
            text: 'שמירה',
            attributes: { type: 'button' }
        });
        const cancelButton = createUiElement('button', {
            id: 'settings-cancel',
            className: 'action-button',
            text: 'ביטול',
            attributes: { type: 'button' }
        });
        footer.append(saveButton, cancelButton);
        dialog.append(header, body, footer);
        backdrop.appendChild(dialog);
        root.appendChild(backdrop);

        const apiInput = root.getElementById('gemini-api-input');
        const nameInput = root.getElementById('gemini-name-input');
        const genderInput = root.getElementById('gemini-gender-input');
        const styleInput = root.getElementById('gemini-style-input');
        const lengthInput = root.getElementById('gemini-length-input');
        const customInput = root.getElementById('gemini-custom-input');
        const autoInput = root.getElementById('gemini-auto-input');
        const errorElement = root.getElementById('settings-error');

        apiInput.value = settings.apiKey;
        nameInput.value = settings.userName;
        genderInput.value = settings.gender;
        styleInput.value = settings.style;
        lengthInput.value = settings.length;
        customInput.value = settings.customInstructions;
        autoInput.value = settings.autoChats;

        const closeModal = () => {
            document.removeEventListener('keydown', handleEscape, true);
            backdrop.remove();
        };

        const handleEscape = (event) => {
            if (event.key === 'Escape') closeModal();
        };

        root.getElementById('settings-close').addEventListener('click', closeModal);
        root.getElementById('settings-cancel').addEventListener('click', closeModal);
        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) closeModal();
        });
        document.addEventListener('keydown', handleEscape, true);

        root.getElementById('gemini-show-api').addEventListener('change', (event) => {
            apiInput.type = event.target.checked ? 'text' : 'password';
        });

        root.getElementById('settings-save').addEventListener('click', () => {
            const userName = nameInput.value.trim();
            const gender = genderInput.value;

            if (!userName) {
                errorElement.textContent = 'יש להזין את השם שלך.';
                errorElement.style.display = 'block';
                nameInput.focus();
                return;
            }

            if (!['male', 'female'].includes(gender)) {
                errorElement.textContent = 'יש לבחור זכר או נקבה כדי להתאים את ניסוח התשובות.';
                errorElement.style.display = 'block';
                genderInput.focus();
                return;
            }

            GM_setValue('gemini_api_key', apiInput.value.trim());
            GM_setValue('auto_reply_chats', autoInput.value.trim());
            GM_setValue('gemini_user_name', userName);
            GM_setValue('gemini_user_gender', gender);
            GM_setValue('gemini_reply_style', styleInput.value);
            GM_setValue('gemini_reply_length', lengthInput.value);
            GM_setValue('gemini_custom_instructions', customInput.value.trim());

            closeModal();
            showToast('ההגדרות נשמרו בהצלחה');
        });

        setTimeout(() => (settings.apiKey ? nameInput : apiInput).focus(), 0);
    }

    function getChatContext(chatElement) {
        let contactName = 'לא ידוע';
        const headerEl = chatElement.querySelector(CONFIG.selectors.chatHeader);
        if (headerEl?.innerText?.trim()) contactName = headerEl.innerText.trim();

        let rawText = chatElement.innerText || '';
        rawText = rawText.replace(
            /✨ מלל|✨ 🚀|🔄 מחדש|⚙ הגדרות|⚙️ הגדרות|חושב\.\.\.|הוספת תגובה|Reply|השב|העברה לתיבת הדואר הנכנס/g,
            ''
        );

        return {
            contactName,
            history: rawText.slice(-3000).trim()
        };
    }

    function buildIdentityInstruction(settings) {
        const genderText = settings.gender === 'female' ? 'נקבה' : 'זכר';
        const grammarText = settings.gender === 'female'
            ? 'נסח את דברי בעלת החשבון בגוף ראשון נקבה'
            : 'נסח את דברי בעל החשבון בגוף ראשון זכר';

        return `שם בעל/ת החשבון הוא ${settings.userName}, והמגדר הוא ${genderText}. ${grammarText}. ` +
            'אין צורך לחתום בשם או להזכיר אותו בכל תשובה, אלא רק אם זה טבעי ומתאים להקשר. ' +
            'אין להניח את המגדר של האדם שמולו אלא אם הוא ברור מהשיחה.';
    }

    function buildReplyInstruction(settings, mode) {
        if (mode === 'emoji') {
            return 'השב רק באמצעות אימוג׳י אחד או כמה אימוג׳ים שמתאימים לשיחה. אל תוסיף מילים.';
        }

        const stylePrompt = STYLE_OPTIONS[settings.style]?.prompt || STYLE_OPTIONS.direct.prompt;
        const lengthPrompt = LENGTH_OPTIONS[settings.length]?.prompt || LENGTH_OPTIONS.short.prompt;
        const rewriteInstruction = mode === 'rewrite'
            ? 'כתוב תשובה שונה מהותית מהטיוטה או מהתגובה הקודמת: שנה את הניסוח והזווית, אך שמור על ההקשר. '
            : '';
        const customInstruction = settings.customInstructions
            ? ` הנחיות אישיות נוספות: ${settings.customInstructions}.`
            : '';

        return `${rewriteInstruction}השב בעברית. אורך מבוקש: ${lengthPrompt}. ` +
            `סגנון מבוקש: ${stylePrompt}.${customInstruction}`;
    }

    function requestGemini(apiKey, payload) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent`;
        const requestBody = JSON.stringify(payload);

        if (typeof GM_xmlhttpRequest === 'function') {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url,
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': apiKey
                    },
                    data: requestBody,
                    timeout: 45000,
                    onload: (response) => {
                        let data;
                        try {
                            data = JSON.parse(response.responseText);
                        } catch (error) {
                            reject(new Error('התקבלה תשובה לא תקינה משירות Gemini'));
                            return;
                        }

                        if (response.status < 200 || response.status >= 300) {
                            reject(new Error(data?.error?.message || `שגיאת API (${response.status})`));
                            return;
                        }
                        resolve(data);
                    },
                    onerror: () => reject(new Error('לא ניתן להתחבר לשירות Gemini')),
                    ontimeout: () => reject(new Error('החיבור לשירות Gemini ארך זמן רב מדי'))
                });
            });
        }

        return fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: requestBody
        }).then(async (response) => {
            const data = await response.json();
            if (!response.ok) throw new Error(data?.error?.message || `שגיאת API (${response.status})`);
            return data;
        });
    }

    async function generateAiResponse(context, mode = 'text') {
        const settings = getSettings();

        if (!settings.apiKey) {
            alert('לא הוגדר מפתח Gemini API. יש לפתוח את ההגדרות ולהזין מפתח.');
            openSettingsModal();
            return null;
        }

        if (!settings.userName || !['male', 'female'].includes(settings.gender)) {
            alert('יש להשלים שם ומגדר בהגדרות כדי להתאים את ניסוח התשובות.');
            openSettingsModal();
            return null;
        }

        const systemPrompt = `
אתה מנסח תגובה עבור הודעת Google Chat.
${buildIdentityInstruction(settings)}

הטקסט הגולמי מחלון הצ'אט:
${context.history}

שם איש הקשר כפי שזוהה בממשק: ${context.contactName}.

הוראות לתגובה:
${buildReplyInstruction(settings, mode)}
החזר רק את נוסח התגובה המוכנה לשליחה, ללא הסברים, כותרת או מרכאות.
        `.trim();

        try {
            const data = await requestGemini(settings.apiKey, {
                contents: [{ role: 'user', parts: [{ text: systemPrompt }] }]
            });
            const text = data?.candidates?.[0]?.content?.parts
                ?.map((part) => part.text || '')
                .join('')
                .trim();

            if (!text) {
                const blockReason = data?.promptFeedback?.blockReason;
                throw new Error(blockReason
                    ? `Gemini חסם את הבקשה (${blockReason})`
                    : 'Gemini לא החזיר טקסט לתגובה');
            }

            return text;
        } catch (error) {
            console.error('Gemini API Error:', error);
            alert('שגיאה ביצירת התגובה: ' + error.message);
            return null;
        }
    }

    function dispatchInputEvents(inputDiv) {
        inputDiv.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText'
        }));
        inputDiv.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function insertTextToInput(chatElement, text) {
        const inputDiv = chatElement.querySelector(CONFIG.selectors.chatInput);
        if (!inputDiv) return false;

        inputDiv.focus();
        const inserted = document.execCommand('insertText', false, text);
        if (!inserted) inputDiv.textContent += text;
        dispatchInputEvents(inputDiv);
        return true;
    }

    function replaceTextInInput(chatElement, text) {
        const inputDiv = chatElement.querySelector(CONFIG.selectors.chatInput);
        if (!inputDiv) return false;

        inputDiv.focus();
        const range = document.createRange();
        range.selectNodeContents(inputDiv);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        const inserted = document.execCommand('insertText', false, text);
        if (!inserted) inputDiv.textContent = text;
        dispatchInputEvents(inputDiv);
        return true;
    }

    function createChatButton(text, label) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        button.setAttribute('aria-label', label);
        button.title = label;
        button.style.cssText = [
            'height:26px',
            'padding:3px 9px',
            'border:1px solid #dadce0',
            'border-radius:6px',
            'background:#f8fafd',
            'color:#202124',
            'cursor:pointer',
            'font:600 12px/1 Arial,sans-serif',
            'pointer-events:auto'
        ].join(';');
        return button;
    }

    function bindChatButton(button, action) {
        const stopGmailHandler = (event) => event.stopPropagation();
        button.addEventListener('pointerdown', stopGmailHandler);
        button.addEventListener('mousedown', stopGmailHandler);
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            action(event);
        });
    }

    function injectAiButtons(chatElement, inputOverride = null) {
        const inputElement = inputOverride || chatElement.querySelector(CONFIG.selectors.chatInput);
        const inputContainer = inputElement?.parentElement;
        if (!inputContainer?.parentElement) return;

        const insertionParent = inputContainer.parentElement;
        const groupAlreadyExists = Array.from(insertionParent.children)
            .some((child) => child.classList?.contains('ai-reply-btn-group'));
        if (groupAlreadyExists) return;

        const btnGroup = document.createElement('div');
        btnGroup.className = 'ai-reply-btn-group';
        btnGroup.dir = 'rtl';
        btnGroup.style.cssText = [
            'display:flex',
            'gap:6px',
            'align-items:center',
            'min-height:26px',
            'margin-bottom:5px',
            'padding:0 10px',
            'position:relative',
            'z-index:99999',
            'pointer-events:auto',
            'flex-wrap:wrap'
        ].join(';');

        const textBtn = createChatButton('✨ מלל', 'יצירת תשובת טקסט');
        const emojiBtn = createChatButton('✨ אימוג׳י', 'יצירת תשובת אימוג׳י');
        const rewriteBtn = createChatButton('↻ מחדש', 'יצירת ניסוח אחר');
        const settingsBtn = createChatButton('⚙ הגדרות', 'פתיחת הגדרות תגובות AI');

        const handleAiAction = async (mode, button) => {
            if (button.disabled) return;

            const originalText = button.textContent;
            button.disabled = true;
            button.textContent = 'חושב...';

            try {
                const context = getChatContext(chatElement);
                const response = await generateAiResponse(context, mode);

                if (response) {
                    if (mode === 'rewrite') {
                        replaceTextInInput(chatElement, response);
                    } else {
                        insertTextToInput(chatElement, response);
                    }
                }
            } finally {
                button.textContent = originalText;
                button.disabled = false;
            }
        };

        bindChatButton(textBtn, () => handleAiAction('text', textBtn));
        bindChatButton(emojiBtn, () => handleAiAction('emoji', emojiBtn));
        bindChatButton(rewriteBtn, () => handleAiAction('rewrite', rewriteBtn));
        bindChatButton(settingsBtn, openSettingsModal);

        btnGroup.append(textBtn, emojiBtn, rewriteBtn, settingsBtn);
        insertionParent.insertBefore(btnGroup, inputContainer);
    }

    function normalizeName(name) {
        return name.trim().toLocaleLowerCase('he');
    }

    async function handleAutoReply(chatElement) {
        const settings = getSettings();
        if (!settings.apiKey || !settings.userName || !settings.gender) return;

        const context = getChatContext(chatElement);
        const autoReplyChats = settings.autoChats
            .split(',')
            .map(normalizeName)
            .filter(Boolean);

        if (!autoReplyChats.includes(normalizeName(context.contactName))) return;

        const contactKey = normalizeName(context.contactName);
        const now = Date.now();
        const lastReply = lastAutoReplyTime[contactKey] || 0;
        if (now - lastReply < CONFIG.autoReplyCooldownMs) return;

        const historyEnd = normalizeName(context.history.slice(-180));
        if (historyEnd.includes(normalizeName(settings.userName))) return;

        lastAutoReplyTime[contactKey] = now;
        const response = await generateAiResponse(context, 'text');
        if (!response || !insertTextToInput(chatElement, response)) return;

        setTimeout(() => {
            const sendBtn = chatElement.querySelector(CONFIG.selectors.sendButton);
            if (sendBtn) sendBtn.click();
        }, 500);
    }

    function scheduleAutoReply(chatElement) {
        clearTimeout(autoReplyTimers.get(chatElement));
        const timer = setTimeout(() => {
            autoReplyTimers.delete(chatElement);
            handleAutoReply(chatElement);
        }, 1000);
        autoReplyTimers.set(chatElement, timer);
    }

    function scanChatContainers() {
        document.querySelectorAll(CONFIG.selectors.chatContainer).forEach(injectAiButtons);

        // Google Chat is frequently embedded in Gmail frames whose outer
        // container classes change. The textbox itself is the stable anchor.
        document.querySelectorAll(CONFIG.selectors.chatInput).forEach((inputElement) => {
            const chatElement = inputElement.closest(CONFIG.selectors.chatContainer) ||
                inputElement.closest('c-wiz[role="region"]') ||
                document.body;
            injectAiButtons(chatElement, inputElement);
        });
    }

    function scheduleScan() {
        if (scanScheduled) return;
        scanScheduled = true;
        requestAnimationFrame(() => {
            scanScheduled = false;
            scanChatContainers();
            try {
                ensureSettingsUi();
            } catch (error) {
                console.error('Gemini settings UI error:', error);
            }
        });
    }

    const observer = new MutationObserver((mutations) => {
        scheduleScan();

        const affectedChats = new Set();
        mutations.forEach((mutation) => {
            if (!mutation.addedNodes.length) return;
            const targetElement = mutation.target.nodeType === Node.ELEMENT_NODE
                ? mutation.target
                : mutation.target.parentElement;

            if (
                targetElement?.closest?.(CONFIG.selectors.chatInput) ||
                targetElement?.closest?.('.ai-reply-btn-group')
            ) {
                return;
            }

            const chat = targetElement?.closest?.(CONFIG.selectors.chatContainer);

            if (chat) affectedChats.add(chat);
        });

        affectedChats.forEach(scheduleAutoReply);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Button injection must never depend on the optional settings UI.
    scanChatContainers();

    try {
        ensureSettingsUi();
    } catch (error) {
        console.error('Gemini settings UI error:', error);
    }

    if (typeof GM_registerMenuCommand === 'function') {
        try {
            GM_registerMenuCommand('פתיחת הגדרות תגובות AI', openSettingsModal);
        } catch (error) {
            console.error('Gemini menu registration error:', error);
        }
    }
})();
