/**
 * AstraX AI - Virtual Medical Voice Assistant
 * Core Client-side Script
 */

document.addEventListener('DOMContentLoaded', () => {
    // --------------------------------------------------------------------------
    // State Variables & Config
    // --------------------------------------------------------------------------
    let conversationHistory = []; // Holds current session history only
    let isAILspeaking = false;
    let isSTTrecording = false;
    let recognition = null;
    let activeUtterance = null;
    let speakTimeout = null;
    let checkInTimer = null;
    let checkInSecondsRemaining = 0;
    let appState = "idle"; // "idle" or "awaiting_followup"
    let lastSpeechLanguage = "en-US";

    // Load config from global config script
    const getConfig = () => {
        const defaults = {
            PROVIDER: "offline",
            HF_API_TOKEN: "",
            HF_MODEL_ID: "google/medgemma-1.5-4b-it",
            GEMINI_API_KEY: ""
        };
        return window.config ? { ...defaults, ...window.config } : defaults;
    };

    // System instruction injected into every API request
    const SYSTEM_INSTRUCTION = `You are AstraX, an intelligent multilingual medical assistant.
Your primary responsibility is to provide safe, helpful home remedies and self-care tips for any medical issue or health query asked by the user, regardless of what the medical issue is.

Language Rule (Critical):
- You must detect the language of the user's message and reply ONLY in that exact same language.
- If the user asks in English, you must respond strictly in English.
- If the user asks in Hindi, you must respond strictly in Hindi (Devanagari script).
- If the user asks in Hinglish (Hindi written in Latin script), you must respond strictly in Hinglish.

Guidelines:
- Provide clear, step-by-step home remedies, dos, and donts.
- Keep responses concise, calm, supportive, and easy to understand.
- Do not prescribe prescription medicines or recommend clinical dosages. Focus on self-care and home remedies.`;

    // Emergency symptom phrases in different languages for automated triggers
    const EMERGENCY_KEYWORDS = [
        "chest pain", "heart attack", "difficulty breathing", "shortness of breath",
        "severe bleeding", "unconscious", "stroke", "paralysis", "poisoning",
        "choking", "seizure", "heart pain", "cardiac arrest",
        "seene me dard", "saas lene me taklif", "behosh", "khoon behna",
        "सीने में दर्द", "सांस लेने में कठिनाई", "बेहोश", "दौरा", "लकवा"
    ];

    // --------------------------------------------------------------------------
    // DOM Elements
    // --------------------------------------------------------------------------
    const body = document.body;
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const newChatBtn = document.getElementById('new-chat-btn');
    const clearChatBtn = document.getElementById('clear-chat-btn');
    const voiceSpeedSlider = document.getElementById('voice-speed');
    const speedValText = document.getElementById('speed-val');
    const voiceSelect = document.getElementById('settings-voice-select');
    
    const openDisclaimerBtn = document.getElementById('open-disclaimer-btn');
    const closeDisclaimerBtn = document.getElementById('close-disclaimer-btn');
    const disclaimerAcceptBtn = document.getElementById('disclaimer-accept-btn');
    const disclaimerModal = document.getElementById('disclaimer-modal');

    const emergencyOverlay = document.getElementById('emergency-overlay');
    const closeEmergencyBtn = document.getElementById('close-emergency-btn');

    const chatMessagesContainer = document.getElementById('chat-messages-container');
    const welcomeContainer = document.getElementById('welcome-container');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const charCounter = document.getElementById('char-counter');

    const micBtn = document.getElementById('mic-btn');
    const voiceWaveContainer = document.getElementById('voice-wave-container');
    const stopSpeechBtn = document.getElementById('stop-speech-btn');
    const connectionBadge = document.getElementById('connection-badge');
    const avatarStatusText = document.getElementById('avatar-status-text');

    // --------------------------------------------------------------------------
    // Theme Management (Dark / Light Mode)
    // --------------------------------------------------------------------------
    const initTheme = () => {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
    };

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });

    initTheme();

    // --------------------------------------------------------------------------
    // Connection Detection
    // --------------------------------------------------------------------------
    const updateConnectionStatus = () => {
        if (navigator.onLine) {
            connectionBadge.className = 'connection-badge online';
            connectionBadge.querySelector('.status-text').innerText = 'Online';
        } else {
            connectionBadge.className = 'connection-badge offline';
            connectionBadge.querySelector('.status-text').innerText = 'Offline';
            addNotificationMessage("You are currently offline. Some features may not work.");
        }
    };

    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
    updateConnectionStatus();

    // --------------------------------------------------------------------------
    // Modal Controllers
    // --------------------------------------------------------------------------
    const showModal = (modal) => {
        modal.classList.remove('hide');
    };

    const hideModal = (modal) => {
        modal.classList.add('hide');
    };

    openDisclaimerBtn.addEventListener('click', () => showModal(disclaimerModal));
    closeDisclaimerBtn.addEventListener('click', () => hideModal(disclaimerModal));
    disclaimerAcceptBtn.addEventListener('click', () => {
        hideModal(disclaimerModal);
        localStorage.setItem('disclaimerAccepted', 'true');
    });

    // Check if disclaimer was accepted previously
    if (localStorage.getItem('disclaimerAccepted') !== 'true') {
        setTimeout(() => showModal(disclaimerModal), 800);
    }

    closeEmergencyBtn.addEventListener('click', () => hideModal(emergencyOverlay));

    // Automated trigger for emergency overlay modal
    const checkAndTriggerEmergency = (text) => {
        // Disabled automatic trigger on text analysis as per user request.
        // The emergency overlay is now strictly shown only when the follow-up timer completes
        // and the user explicitly states they are not feeling better.
        return false;
    };

    // --------------------------------------------------------------------------
    // Textarea & Character Counter Logic
    // --------------------------------------------------------------------------
    const adjustInputHeight = () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
    };

    chatInput.addEventListener('input', () => {
        adjustInputHeight();
        const charLength = chatInput.value.length;
        charCounter.innerText = `${charLength}/2000`;
    });

    // --------------------------------------------------------------------------
    // Lightweight Custom Regex-based Markdown Parser
    // --------------------------------------------------------------------------
    const parseMarkdown = (text) => {
        if (!text) return "";
        let html = text;

        // Escape HTML entities to prevent XSS
        html = html
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        // Code blocks: ```code```
        html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        
        // Inline code: `code`
        html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

        // Bold text: **text** or __text__
        html = html.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__([\s\S]*?)__/g, '<strong>$1</strong>');

        // List items: * item or - item
        html = html.replace(/^\s*[\*\-]\s+(.+)$/gm, '<li>$1</li>');
        // Wrap <li> sequences in <ul>. Simple regex wrap.
        html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
        // Clean double <ul> lists
        html = html.replace(/<\/ul>\s*<ul>/g, '');

        // Paragraph line endings
        html = html.replace(/\n\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');

        return `<div class="markdown-body"><p>${html}</p></div>`;
    };

    // --------------------------------------------------------------------------
    // Web Speech API: Voice Output (Text-To-Speech)
    // --------------------------------------------------------------------------
    const synth = window.speechSynthesis;

    const populateVoiceList = () => {
        if (!synth) return;
        const voices = synth.getVoices();
        
        // Keep the "Auto-detect" default option
        voiceSelect.innerHTML = '<option value="auto">Auto-Detect Language</option>';
        
        voices.forEach((voice) => {
            const option = document.createElement('option');
            option.textContent = `${voice.name} (${voice.lang})`;
            option.value = voice.name;
            voiceSelect.appendChild(option);
        });
    };

    populateVoiceList();
    if (synth && synth.onvoiceschanged !== undefined) {
        synth.onvoiceschanged = populateVoiceList;
    }

    voiceSpeedSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value).toFixed(1);
        speedValText.innerText = `${val}x`;
    });

    const stopSpeaking = () => {
        if (synth && isAILspeaking) {
            synth.cancel();
            clearTimeout(speakTimeout);
            isAILspeaking = false;
            stopSpeechBtn.classList.add('hide');
            avatarStatusText.innerText = "Ready to help";
            document.getElementById('header-avatar').classList.remove('pulsating');
        }
    };

    stopSpeechBtn.addEventListener('click', stopSpeaking);

    // Language Detection helper to pick appropriate TTS voice
    const detectSpeechLanguage = (text) => {
        const textLower = text.toLowerCase();
        
        // Gurmukhi characters (Punjabi)
        if (/[\u0A00-\u0A7F]/.test(text)) return 'pa-IN';
        
        // Devanagari characters (Hindi/Sanskrit/English)
        if (/[\u0900-\u097F]/.test(text)) {
            // Basic heuristic to distinguish Sanskrit
            const sanskritWords = ["अहं", "मम", "अस्ति", "त्वं", "भवतः", "शुभम"];
            const isSanskrit = sanskritWords.some(w => text.includes(w));
            if (isSanskrit) return 'sa-IN';
            
            // Check if it is phonetically English written in Devanagari
            const devanagariHindiWords = [
                "है", "हैं", "हूँ", "था", "थी", "थे", "मुझे", "मेरा", "मेरी", "मेरे", "मैं", "में",
                "और", "तो", "भी", "का", "की", "के", "को", "से", "ने", "पर", "हो", "रहा", "रही", "रहे",
                "क्या", "क्यों", "कब", "कहाँ", "कैसे", "आप", "तुम", "हम", "हमें", "बुखार", "दर्द",
                "खांसी", "खाँसी", "जुकाम", "सर्दी", "पेट", "गला", "तनाव", "घबराहट", "बेचैनी", "ठीक", 
                "अच्छा", "हाँ", "हा", "ना", "नहीं", "नही", "शुक्रिया", "धन्यवाद", "नमस्ते"
            ];
            const words = text.split(/[\s,.:;?!]+/);
            const hasHindi = devanagariHindiWords.some(w => words.includes(w));
            if (!hasHindi) {
                return 'en-US'; // English phonetic transcript in Devanagari
            }
            
            return 'hi-IN';
        }

        // Hinglish/Latin Hindi keywords
        const hinglishKeywords = [
            "hai", "hoon", "aap", "tum", "mera", "mujhe", "darad", "dard", 
            "bukhar", "khansi", "jukam", "zukam", "sar", "pet", "gala", 
            "thik", "theek", "acha", "achha"
        ];
        const isHinglish = hinglishKeywords.some(w => textLower.includes(w));
        if (isHinglish) return 'hi-IN';

        return 'en-US';
    };

    const speakText = (text, callback) => {
        if (!synth) return;
        stopSpeaking(); // cancel any active speech

        isAILspeaking = true;
        stopSpeechBtn.classList.remove('hide');
        avatarStatusText.innerText = "Speaking...";
        document.getElementById('header-avatar').classList.add('pulsating');

        // Create utterance
        // Remove markdown tags if any for clean speaking voice
        const cleanText = text.replace(/\*\*|\*|`|#/g, '');
        const utterance = new SpeechSynthesisUtterance(cleanText);
        activeUtterance = utterance; // Prevent garbage collection
        window.activeUtterance = utterance;

        // Configuration values
        utterance.rate = parseFloat(voiceSpeedSlider.value);
        
        // Select Voice
        const selectedVoiceValue = voiceSelect.value;
        const voices = synth.getVoices();
        
        if (selectedVoiceValue !== 'auto') {
            const matchedVoice = voices.find(v => v.name === selectedVoiceValue);
            if (matchedVoice) utterance.voice = matchedVoice;
        } else {
            // Auto-detect and match voice
            const detectedLang = detectSpeechLanguage(cleanText);
            const matchedVoice = voices.find(v => v.lang.startsWith(detectedLang.split('-')[0]));
            if (matchedVoice) {
                utterance.voice = matchedVoice;
            }
        }

        utterance.onend = () => {
            isAILspeaking = false;
            stopSpeechBtn.classList.add('hide');
            avatarStatusText.innerText = "Ready to help";
            document.getElementById('header-avatar').classList.remove('pulsating');
            clearTimeout(speakTimeout);
            if (callback) callback();
        };

        utterance.onerror = (err) => {
            console.error("SpeechSynthesisUtterance Error:", err);
            isAILspeaking = false;
            stopSpeechBtn.classList.add('hide');
            avatarStatusText.innerText = "Ready to help";
            document.getElementById('header-avatar').classList.remove('pulsating');
            clearTimeout(speakTimeout);
        };

        // Safety timeout (sometimes browsers get stuck without firing onend)
        const wordCount = cleanText.split(/\s+/).length;
        const estimatedDurationMs = (wordCount * 600) + 3000;
        speakTimeout = setTimeout(() => {
            synth.cancel();
            utterance.onend();
        }, estimatedDurationMs);

        synth.speak(utterance);
    };

    // --------------------------------------------------------------------------
    // Web Speech API: Voice Input (Speech-To-Text)
    // --------------------------------------------------------------------------
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        
        // Default language set to Hindi/English bilingual mode
        recognition.lang = 'en-US';

        let recognitionTimeout = null;

        recognition.onstart = () => {
            isSTTrecording = true;
            micBtn.classList.add('recording');
            voiceWaveContainer.classList.remove('hide');
            avatarStatusText.innerText = "Listening...";
            playSynthesizedSound('listening');
        };

        recognition.onresult = (event) => {
            let localFinal = "";
            let interimTranscript = "";
            for (let i = 0; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    localFinal += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            
            const liveText = localFinal + interimTranscript;
            if (liveText.trim()) {
                chatInput.value = liveText;
                adjustInputHeight();
                const charLength = chatInput.value.length;
                charCounter.innerText = `${charLength}/2000`;
            }
            
            clearTimeout(recognitionTimeout);
            const isLastSegmentFinal = event.results[event.results.length - 1].isFinal;
            recognitionTimeout = setTimeout(() => {
                recognition.stop();
            }, isLastSegmentFinal ? 1800 : 2500);
        };

        recognition.onerror = (err) => {
            console.error("Speech Recognition Error:", err);
            isSTTrecording = false;
            micBtn.classList.remove('recording');
            voiceWaveContainer.classList.add('hide');
            avatarStatusText.innerText = "Ready to help";
        };

        recognition.onend = () => {
            isSTTrecording = false;
            micBtn.classList.remove('recording');
            voiceWaveContainer.classList.add('hide');
            avatarStatusText.innerText = "Ready to help";
            
            const textToProcess = chatInput.value.trim();
            if (textToProcess) {
                sendMessage();
            }
        };
    } else {
        micBtn.style.display = 'none';
        console.warn("Speech Recognition API is not supported in this browser.");
    }

    const toggleSTT = () => {
        if (!recognition) return;
        if (isSTTrecording) {
            recognition.stop();
        } else {
            stopSpeaking();
            // Automatically detect context languages from user selection or configure generally
            recognition.start();
        }
    };

    micBtn.addEventListener('click', toggleSTT);

    // --------------------------------------------------------------------------
    // Audio Synthesizer sound generator
    // --------------------------------------------------------------------------
    const playSynthesizedSound = (type) => {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);

            if (type === 'listening') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(520, audioCtx.currentTime);
                gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.12);
            } else if (type === 'alarm') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(450, audioCtx.currentTime);
                osc.frequency.linearRampToValueAtTime(800, audioCtx.currentTime + 0.35);
                gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.4);
            }
        } catch (e) {
            console.error("Sound Synth error:", e);
        }
    };

    // --------------------------------------------------------------------------
    // Chat Message Management
    // --------------------------------------------------------------------------
    const createMessageRow = (sender, content) => {
        const row = document.createElement('div');
        row.className = `message-row ${sender === 'user' ? 'user-message' : 'ai-message'}`;

        const avatar = document.createElement('div');
        if (sender === 'user') {
            avatar.className = 'user-avatar-core';
            avatar.innerText = 'U';
        } else {
            avatar.className = 'ai-avatar-ring small-avatar';
            avatar.innerHTML = `<div class="ai-avatar-core"><i class="fa-solid fa-wave-square"></i></div>`;
        }
        row.appendChild(avatar);

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        
        if (sender === 'user') {
            bubble.textContent = content;
        } else {
            // If content is HTML, insert it directly (we pre-parsed it with markdown block)
            bubble.innerHTML = parseMarkdown(content);
            
            // Append Actions
            const actions = document.createElement('div');
            actions.className = 'message-actions';
            
            // Copy Response Button
            const copyBtn = document.createElement('button');
            copyBtn.className = 'btn-mini';
            copyBtn.innerHTML = `<i class="fa-regular fa-copy"></i> Copy`;
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(content).then(() => {
                    copyBtn.innerHTML = `<i class="fa-solid fa-check"></i> Copied`;
                    setTimeout(() => {
                        copyBtn.innerHTML = `<i class="fa-regular fa-copy"></i> Copy`;
                    }, 2000);
                });
            });
            actions.appendChild(copyBtn);

            // Audio Replay button
            const audioBtn = document.createElement('button');
            audioBtn.className = 'btn-mini';
            audioBtn.innerHTML = `<i class="fa-solid fa-volume-high"></i> Speak`;
            audioBtn.addEventListener('click', () => speakText(content));
            actions.appendChild(audioBtn);

            bubble.appendChild(actions);
        }
        row.appendChild(bubble);

        return row;
    };

    const addMessageToChat = (sender, content) => {
        welcomeContainer.classList.add('hide'); // hide welcome panel if active
        const msgRow = createMessageRow(sender, content);
        chatMessagesContainer.appendChild(msgRow);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    };

    const addNotificationMessage = (text) => {
        const notif = document.createElement('div');
        notif.style.textAlign = 'center';
        notif.style.fontSize = '0.8rem';
        notif.style.color = 'var(--text-muted)';
        notif.style.margin = '10px 0';
        notif.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${text}`;
        chatMessagesContainer.appendChild(notif);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    };

    const showTypingIndicator = () => {
        const row = document.createElement('div');
        row.className = 'message-row ai-message';
        row.id = 'typing-indicator-row';

        const avatar = document.createElement('div');
        avatar.className = 'ai-avatar-ring small-avatar';
        avatar.innerHTML = `<div class="ai-avatar-core"><i class="fa-solid fa-wave-square"></i></div>`;
        row.appendChild(avatar);

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.innerHTML = `
            <div class="typing-indicator">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        `;
        row.appendChild(bubble);

        chatMessagesContainer.appendChild(row);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    };

    const removeTypingIndicator = () => {
        const indicator = document.getElementById('typing-indicator-row');
        if (indicator) {
            indicator.remove();
        }
    };

    // --------------------------------------------------------------------------
    // Hugging Face Inference API call
    // --------------------------------------------------------------------------
    const callHuggingFaceAPI = async (userPrompt) => {
        const conf = getConfig();
        const token = conf.HF_API_TOKEN;
        const modelId = conf.HF_MODEL_ID || "Qwen/Qwen2.5-7B-Instruct";
        
        if (!token || token === "YOUR_HF_TOKEN" || token.trim() === "") {
            throw new Error("HF_TOKEN_MISSING");
        }

        const messages = [];
        messages.push({ role: "system", content: SYSTEM_INSTRUCTION });
        
        conversationHistory.forEach(msg => {
            messages.push({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content.replace(/\*\(Offline Simulation Mode\)\*/g, '')
            });
        });

        const detected = detectSpeechLanguage(userPrompt);
        let forceInstruction = "";
        if (detected === 'en-US') {
            forceInstruction = "\n\nCRITICAL: Respond STRICTLY in English. Do not write in Hindi or Hinglish.";
        } else if (detected === 'hi-IN') {
            if (/[\u0900-\u097F]/.test(userPrompt)) {
                forceInstruction = "\n\nCRITICAL: Respond STRICTLY in Devanagari Hindi (हिन्दी). Do not write in English or Hinglish.";
            } else {
                forceInstruction = "\n\nCRITICAL: Respond STRICTLY in Hinglish (Hindi written in English alphabets, e.g., 'mujhe fever hai, aap rest karein'). Do not write in English or Devanagari Hindi.";
            }
        } else if (detected === 'pa-IN') {
            forceInstruction = "\n\nCRITICAL: Respond STRICTLY in Punjabi.";
        } else if (detected === 'sa-IN') {
            forceInstruction = "\n\nCRITICAL: Respond STRICTLY in Sanskrit.";
        }

        messages.push({ role: "user", content: userPrompt + forceInstruction });

        const url = `https://router.huggingface.co/v1/chat/completions`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: modelId,
                messages: messages,
                max_tokens: 500,
                temperature: 0.7
            })
        });

        if (response.status === 503) {
            const errData = await response.json();
            throw new Error(`MODEL_LOADING:${errData.estimated_time || 20}`);
        }

        if (!response.ok) {
            const errText = await response.text();
            console.error("Hugging Face API Error Detail:", errText);
            if (response.status === 403 || errText.toLowerCase().includes("gated")) {
                throw new Error("HF_GATED_MODEL");
            } else if (response.status === 401) {
                throw new Error("HF_UNAUTHORIZED");
            }
            throw new Error(`HF_API_FAILED: ${response.status}`);
        }

        const resData = await response.json();
        if (resData.choices && resData.choices[0] && resData.choices[0].message) {
            return resData.choices[0].message.content;
        }

        throw new Error("EMPTY_RESPONSE");
    };

    // --------------------------------------------------------------------------
    // Direct Google Gemini API call
    // --------------------------------------------------------------------------
    const callGeminiAPI = async (userPrompt) => {
        const conf = getConfig();
        const apiKey = conf.GEMINI_API_KEY;
        if (!apiKey || apiKey === "YOUR_API_KEY_HERE" || apiKey.trim() === "") {
            throw new Error("API_KEY_MISSING");
        }

        // Prepare context payload including history for conversational flow
        // Format history as Gemini expects: parts with text
        const contents = [];
        
        // System instruction is prepended to enforce behavior rules
        contents.push({
            role: "user",
            parts: [{ text: `SYSTEM INITIALIZATION INSTRUCTIONS:\n${SYSTEM_INSTRUCTION}` }]
        });
        contents.push({
            role: "model",
            parts: [{ text: "Understood. I will operate strictly as AstraX AI, following all instructions, language matches, and self-care guidelines." }]
        });

        // Add history
        conversationHistory.forEach(msg => {
            contents.push({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content.replace(/\*\(Offline Simulation Mode\)\*/g, '') }]
            });
        });

        // Add current prompt
        const detected = detectSpeechLanguage(userPrompt);
        let forceInstruction = "";
        if (detected === 'en-US') {
            forceInstruction = "\n\nCRITICAL: Respond STRICTLY in English. Do not write in Hindi or Hinglish.";
        } else if (detected === 'hi-IN') {
            if (/[\u0900-\u097F]/.test(userPrompt)) {
                forceInstruction = "\n\nCRITICAL: Respond STRICTLY in Devanagari Hindi (हिन्दी). Do not write in English or Hinglish.";
            } else {
                forceInstruction = "\n\nCRITICAL: Respond STRICTLY in Hinglish (Hindi written in English alphabets, e.g., 'mujhe fever hai, aap rest karein'). Do not write in English or Devanagari Hindi.";
            }
        } else if (detected === 'pa-IN') {
            forceInstruction = "\n\nCRITICAL: Respond STRICTLY in Punjabi.";
        } else if (detected === 'sa-IN') {
            forceInstruction = "\n\nCRITICAL: Respond STRICTLY in Sanskrit.";
        }

        contents.push({
            role: "user",
            parts: [{ text: userPrompt + forceInstruction }]
        });

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ contents: contents })
        });

        if (!response.ok) {
            const errData = await response.json();
            console.error("Gemini API Error Detail:", errData);
            throw new Error(`API_CALL_FAILED: ${response.status}`);
        }

        const resData = await response.json();
        
        if (resData.candidates && resData.candidates[0] && resData.candidates[0].content && resData.candidates[0].content.parts[0]) {
            return resData.candidates[0].content.parts[0].text;
        }
        
        throw new Error("EMPTY_RESPONSE");
    };

    // --------------------------------------------------------------------------
    // Simulated Local Assistant (No API Key Mode)
    // --------------------------------------------------------------------------
    const localSymptomDatabase = {
        headache: {
            "en-US": "**Hydration, Rest & Cold Compress**\n\n* **Do**: Drink at least 500ml of fresh water immediately. Rest in a quiet, dark room for 20-30 minutes. Apply a cool, damp compress to your forehead.\n* **Don't**: Avoid looking at bright screens (phones, computers). Do not drink caffeine or alcohol.",
            "hi-IN": "**पानी पिएं, आराम करें और ठंडी पट्टी**\n\n* **क्या करें**: तुरंत कम से कम 500 मिलीलीटर ताजा पानी पिएं। 20-30 मिनट के लिए शांत, अंधेरे कमरे में आराम करें। माथे या कनपटी पर ठंडी, गीली पट्टी लगाएं।\n* **क्या न करें**: चमकदार स्क्रीन (फोन, कंप्यूटर, टीवी) को देखने से बचें। कैफीन या शराब का सेवन न करें।",
            "pa-IN": "**ਸਿਰ ਦਰਦ (Headache) ਲਈ ਉਪਚਾਰ**\n\n* **ਕੀ ਕਰਨਾ ਹੈ**: ਪਾਣੀ ਪੀਓ ਅਤੇ ਆਰਾਮ ਕਰੋ। ਸ਼ਾਂਤ ਕਮਰੇ ਵਿੱਚ ਲੇਟ ਜਾਓ। ਮੱਥੇ 'ਤੇ ਠੰਢੀ ਪੱਟੀ ਰੱਖੋ।\n* **ਕੀ ਨਹੀਂ ਕਰਨਾ**: ਮੋਬਾਈਲ ਜਾਂ ਟੀਵੀ ਸਕ੍ਰੀਨ ਨਾ ਦੇਖੋ। ਚਾਹ ਜਾਂ ਕੌਫ਼ੀ ਤੋਂ ਪਰਹੇਜ਼ ਕਰੋ।",
            "sa-IN": "**शिरोवेदना (Headache) उपचारः**\n\n* **करणीयम्**: शीघ्रं जलं पिबतु, विश्रामं च करोतु। शान्ते अन्धकारे प्रकोष्टे शयनं करोतु। ललाटे शीतलपट्टं धरतु।\n* **अकरणीयम्**: सङ्गणकस्य वा दूरभाषस्य वा पटलम् मा पश्यतु। चायं वा कॉफी पेयम् मा पिबतु।"
        },
        fever: {
            "en-US": "**Hydration & Cool Compress Sponge Bath**\n\n* **Do**: Drink water, herbal tea, or electrolytes. Take a lukewarm sponge bath. Rest and wear lightweight clothing.\n* **Don't**: Do not bundle up in heavy blankets. Avoid strenuous activities or physical strain.",
            "hi-IN": "**पानी पिएं और गुनगुने पानी की पट्टी करें**\n\n* **क्या करें**: हाइड्रेटेड रहने के लिए पानी या ओआरएस (ORS) पिएं। गुनगुने पानी से स्पंज बाथ लें (कंपकंपी से बचें)। आराम करें और हल्के कपड़े पहनें।\n* **क्या न करें**: भारी कंबल न ओढ़ें, इससे तापमान बढ़ सकता है। शारीरिक मेहनत या भारी काम न करें।",
            "pa-IN": "**ਬੁਖਾਰ (Fever) ਲਈ ਉਪਚਾਰ**\n\n* **ਕੀ ਕਰਨਾ ਹੈ**: ਹਲਕੇ ਕੱਪੜੇ ਪਾਓ ਅਤੇ ਆਰਾਮ ਕਰੋ। ਗਰਮ ਪਾਣੀ ਜਾਂ ਸੂਪ ਪੀਓ। ਸਰੀਰ ਦਾ ਤਾਪਮਾਨ ਚੈੱਕ ਕਰਦੇ ਰਹੋ।\n* **ਕੀ ਨਹੀਂ ਕਰਨਾ**: ਭਾਰੀ ਕੰਬਲ ਨਾ ਲਓ। ਠੰਢੇ ਪਾਣੀ ਨਾਲ ਨਾ ਨਹਾਓ।",
            "sa-IN": "**ज्वरः (Fever) उपचारः**\n\n* **करणीयम्**: | लघुवस्त्राणि धरतु, विश्रामं च करोतु। कोष्णं जलं वा सूपं पिबतु। ज्वरमापकेन शरीरतापं वारं वारं मापयतु।\n* **अकरणीयम्**: गुरु कम्बलं मा ओर्णोतु। शीतलजलेन स्नानं मा करोतु।"
        },
        cough: {
            "en-US": "**Warm Salt Gargle & Honey**\n\n* **Do**: Drink warm water with honey (1-2 teaspoons). Gargle with warm salt water. Use steam inhalation to moisten airways.\n* **Don't**: Do not consume cold drinks or fried foods. Avoid smoking or dusty environments.",
            "hi-IN": "**गुनगुने नमक के पानी से गरारे और शहद**\n\n* **क्या करें**: शहद के साथ गुनगुना पानी या हर्बल चाय पिएं। गुनगुने नमक के पानी से गरारे करें। भाप लें या ह्यूमिडिफायर का उपयोग करें।\n* **क्या न करें**: ठंडी चीजें, आइसक्रीम या तला हुआ भोजन न खाएं। धूम्रपान, धुएं या धूल भरे वातावरण से बचें।",
            "pa-IN": "**ਖੰਘ (Cough) ਲਈ ਉਪਚਾਰ**\n\n* **ਕੀ ਕਰਨਾ ਹੈ**: ਕੋਸੇ ਪਾਣੀ ਵਿੱਚ ਨਮਕ ਪਾ ਕੇ ਗਰਾਰੇ ਕਰੋ। ਸ਼ਹਿਦ ਅਤੇ ਅਦਰਕ ਦਾ ਸੇਵਨ ਕਰੋ। ਭਾਫ਼ ਲਓ।\n* **ਕੀ ਨਹੀਂ ਕਰਨਾ**: ਠੰਢਾ ਪਾਣੀ ਜਾਂ ਆਈਸਕ੍ਰੀਮ ਨਾ ਖਾਓ। ਧੂੜ ਮਿੱਟੀ ਤੋਂ ਬਚੋ।",
            "sa-IN": "**कासः (Cough) उपचारः**\n\n* **करणीयम्**: लवणमिश्रितकोष्णजलेन गण्डूषं करोतु। आर्द्रकरसेन सह मधु सेवतु। बाष्पग्रहणं करोतु।\n* **अकरणीयम्**: शीतलपेयानि वा हिमपयः मा खादतु। धूम्रपानं धूलिकणान् च त्यजतु।"
        },
        cold: {
            "en-US": "**Steam Inhalation & Hydration**\n\n* **Do**: Drink plenty of hot fluids (herbal teas, warm soups). Inhale steam from a bowl of hot water. Rest as much as possible.\n* **Don't**: Do not consume cold items or sit in AC drafts. Avoid heavy workouts.",
            "hi-IN": "**भाप लेना और गर्म तरल पदार्थ**\n\n* **क्या करें**: गर्म तरल पदार्थ (हर्बल चाय, गर्म सूप) पिएं। गर्म पानी के कटोरे से भाप लें। शरीर को आराम दें।\n* **क्या न करें**: ठंडी चीजें न खाएं और ठंडी एसी (AC) हवा में न बैठें। भारी वर्कआउट से बचें।",
            "pa-IN": "**ਜ਼ੁਕਾਮ (Cold) ਲਈ ਉਪਚਾਰ**\n\n* **ਕੀ ਕਰਨਾ ਹੈ**: ਭਾਫ਼ ਲਓ ਅਤੇ ਗਰਮ ਪਾਣੀ ਪੀਓ। ਨੱਕ ਨੂੰ ਸਾਫ਼ ਰੱਖੋ। ਵੱਧ ਤੋਂ ਵੱਧ ਆਰਾਮ ਕਰੋ।\n* **ਕੀ ਨਹੀਂ ਕਰਨਾ**: ਠੰਢੀ ਹਵਾ ਜਾਂ ਏਸੀ ਵਿੱਚ ਨਾ ਬੈਠੋ। ਠੰਢੀਆਂ ਚੀਜ਼ਾਂ ਨਾ ਖਾਓ।",
            "sa-IN": "**प्रतिश्यायः (Cold) उपचारः**\n\n* **करणीयम्**: बाष्पग्रहणं करोतु कोष्णजलं च पिबतु। नासिकाम् स्वच्छाम् स्थापयतु। पूर्णरूपेण विश्रामं करोतु।\n* **अकरणीयम्**: शीतवातावरणे वा वातानुकूलितप्रकोष्ठे मा उपविशतु। शीतलखाद्यानि मा खादतु।"
        },
        stomach: {
            "en-US": "**Ginger/Peppermint Tea & Bland Diet**\n\n* **Do**: Sip warm ginger or peppermint tea. Apply a warm hot-water bag to your abdomen. Stay hydrated with small sips of water.\n* **Don't**: Do not eat spicy, oily, fatty foods. Avoid dairy, soft drinks, or caffeine.",
            "hi-IN": "**अदरक/पुदीने की चाय और हल्का भोजन**\n\n* **क्या करें**: पेट की मांसपेशियों को आराम देने के लिए अदरक या पुदीने की चाय पिएं। पेट पर हीटिंग पैड या गर्म पानी की बोतल से सिकाई करें। पानी के छोटे-छोटे घूंट लेकर खुद को हाइड्रेटेड रखें।\n* **क्या न करें**: मसालेदार, तैलीय, वसायुक्त या भारी भोजन न खाएं। डेयरी उत्पाद, कोल्ड ड्रिंक्स या कैफीन से बचें।",
            "pa-IN": "**ਪੇਟ ਦਰਦ (Stomach Pain) ਲਈ ਉਪਚਾਰ**\n\n* **ਕੀ ਕਰਨਾ ਹੈ**: ਅਦਰਕ ਜਾਂ ਪੁਦੀਨੇ ਦੀ ਚਾਹ ਪੀਓ। ਪੇਟ 'ਤੇ ਗਰਮ ਪਾਣੀ ਦੀ ਬੋਤਲ ਨਾਲ ਸੇਕ ਦਿਓ। ਹਲਕਾ ਖਾਣਾ ਖਾਓ।\n* **ਕੀ ਨਹੀਂ ਕਰਨਾ**: ਮਸਾਲੇਦਾਰ ਜਾਂ ਤਲਿਆ ਹੋਇਆ ਖਾਣਾ ਨਾ ਖਾਓ। ਦੁੱਧ ਵਾਲੀਆਂ ਚੀਜ਼ਾਂ ਤੋਂ ਬਚੋ।",
            "sa-IN": "**उदरवेदना (Stomach Pain) उपचारः**\n\n* **करणीयम्**: आर्द्रकस्य वा पुदीनायाः क्वथं पिबतु। उदरे उष्णजलकूप्या सेकं करोतु। लघु सुपच्यं भोजनं करोतु।\n* **अकरणीयम्**: कटु, सतैलं वा गुरुभोजनं मा खादतु। क्षीरजन्यपदार्थान् मा सेवतु।"
        },
        throat: {
            "en-US": "**Salt Water Gargle & Warm Fluids**\n\n* **Do**: Gargle with warm salt water 3-4 times a day. Sip warm broth or tea with honey. Rest your voice as much as possible.\n* **Don't**: Avoid sour, spicy, or crunchy foods. Do not drink very cold beverages.",
            "hi-IN": "**नमक के पानी के गरारे और गर्म पेय**\n\n* **क्या करें**: दिन में कम से कम 3-4 बार गुनगुने नमक के पानी से गरारे करें। गर्म सूप, शहद के साथ हर्बल चाय या नींबू का गर्म पानी पिएं। जितना हो सके अपनी आवाज को आराम दें।\n* **क्या न करें**: खट्टी, तीखी या कुरकुरी चीजें न खाएं जिससे गले में जलन हो। ठंडे पेय या कोल्ड ड्रिंक्स न पिएं।",
            "pa-IN": "**ਗਲੇ ਦੀ ਖਰਾਸ਼ (Sore Throat) ਲਈ ਉਪਚਾਰ**\n\n* **ਕੀ ਕਰਨਾ ਹੈ**: ਗਰਮ ਪਾਣੀ ਨਾਲ ਦਿਨ ਵਿੱਚ 3-4 ਵਾਰ ਗਰਾਰੇ ਕਰੋ। ਕੋਸਾ ਪਾਣੀ ਜਾਂ ਸਹਿਦ ਵਾਲੀ ਚਾਹ ਪੀਓ। ਆਪਣੀ ਆਵਾਜ਼ ਨੂੰ ਆਰਾਮ ਦਿਓ।\n* **ਕੀ ਨਹੀਂ ਕਰਨਾ**: ਠੰਢੀਆਂ ਚੀਜ਼ਾਂ ਅਤੇ ਖੱਟਾ ਨਾ ਖਾਓ। ਜ਼ੋਰ ਦੀ ਨਾ ਬੋਲੋ।",
            "sa-IN": "**कण्ठखराशः (Sore Throat) उपचारः**\n\n* **करणीयम्**: कोष्णजलेन दिने त्रिचतुर्वारं गण्डूषं करोतु। मधुमिश्रितं कोष्णपेयं पिबतु। कण्ठस्वरं विश्रामयतु।\n* **अकरणीयम्**: अम्लखाद्यानि वा शीतलपेयानि मा पिबतु। उच्चैः भाषणं मा करोतु।"
        },
        stress: {
            "en-US": "**Deep Breathing & Grounding**\n\n* **Do**: Practice the 4-7-8 breathing method (inhale 4s, hold 7s, exhale 8s). Focus on 5 items in your surroundings. Sit comfortably and loosen tight muscles.\n* **Don't**: Do not scroll on social media or search symptoms. Do not consume caffeine.",
            "hi-IN": "**गहरी सांस लेना और ग्राउंडिंग**\n\n* **क्या करें**: 4-7-8 सांस लेने की विधि अपनाएं (4 सेकंड सांस लें, 7 सेकंड रोकें, 8 सेकंड छोड़ें)। आस-पास की चीजों पर ध्यान केंद्रित करें। आरामदायक स्थिति में बैठें और ढीला छोड़ें।\n* **क्या न करें**: सोशल मीडिया न चलाएं और इंटरनेट पर लक्षण न खोजें। चाय या कॉफी का सेवन न करें।",
            "pa-IN": "**ਤਣਾਅ ਅਤੇ ਘਬਰਾਹਟ (Stress) ਲਈ ਉਪਚਾਰ**\n\n* **ਕੀ ਕਰਨਾ ਹੈ**: ਡੂੰਘੇ ਸਾਹ ਲਓ (4-7-8 ਵਿਧੀ)। ਇੱਕ ਗਲਾਸ ਠੰਢਾ ਪਾਣੀ ਹੌਲੀ-ਹੌਲੀ ਪੀਓ। ਸ਼ਾਂਤ ਥਾਂ 'ਤੇ ਬੈਠੋ।\n* **ਕੀ ਨਹੀਂ ਕਰਨਾ**: ਫੋਨ ਜਾਂ ਸੋਸ਼ਲ ਮੀਡੀਆ ਨਾ ਦੇਖੋ। ਚਿੰਤਾ ਨਾ ਕਰੋ।",
            "sa-IN": "**मानसिकतनावः (Stress) उपचारः**\n\n* **करणीयम्**: दीर्घं श्वसितु (४-७-८ नियमः)। एकचषकं शीतलजलं मन्दं मन्दं पिबतु। शान्ते स्थाने उपविशतु।\n* **अकरणीयम्**: चलदूरभाषम् मा पश्यतु। वृथा चिन्तनं मा करोतु।"
        },
        general: {
            "en-US": "**General Rest & Hydration**\n\n* **Do**: Sit or lie down in a comfortable position immediately. Drink a warm glass of water or herbal tea. Stay hydrated and rest.\n* **Don't**: Avoid physically demanding chores. Do not ignore symptoms if they worsen.",
            "hi-IN": "**सामान्य आराम और जलपान**\n\n* **क्या करें**: तुरंत किसी आरामदायक स्थिति में बैठें या लेट जाएं। गुनगुना पानी या हर्बल चाय धीरे-धीरे पिएं।\n* **क्या न करें**: शारीरिक श्रम वाले काम न करें। यदि लक्षण बिगड़ते हैं, तो उन्हें अनदेखा न करें।",
            "pa-IN": "**ਆਮ ਆਰਾਮ ਅਤੇ ਪਾਣੀ**\n\n* **ਕੀ ਕਰਨਾ ਹੈ**: ਆਰਾਮਦਾਇਕ ਸਥਿਤੀ ਵਿੱਚ ਲੇਟ ਜਾਓ। ਕੋਸਾ ਪਾਣੀ ਪੀਓ।\n* **ਕੀ ਨਹੀਂ ਕਰਨਾ**: ਸ਼ਾਰੀਰਿਕ ਮਿਹਨਤ ਨਾ ਕਰੋ।",
            "sa-IN": "**सामान्यविश्रामः जलपानं च**\n\n* **करणीयम्**: सुखदस्थितौ शयनं करोतु। कोष्णं जलं पिबतु।\n* **अकरणीयम्**: शारीरिकश्रमं मा करोतु।"
        }
    };

    const getLocalResponse = (text) => {
        const textLower = text.toLowerCase();
        const lang = detectSpeechLanguage(text);
        
        let symptomKey = "general";
        
        if (textLower.includes("head") || textLower.includes("migraine") || textLower.includes("sir dard") || textLower.includes("सिर") || textLower.includes("दर्द") || textLower.includes("ਸਿਰ ਦਰਦ") || textLower.includes("शिरोवेदना") || textLower.includes("हेडेक") || textLower.includes("हैडेक") || textLower.includes("माइग्रेन")) {
            symptomKey = "headache";
        } else if (textLower.includes("fever") || textLower.includes("temperature") || textLower.includes("body hot") || textLower.includes("बुखार") || textLower.includes("तापमान") || textLower.includes("गरम") || textLower.includes("ਬੁਖਾਰ") || textLower.includes("ਜ੍ਵਰ") || textLower.includes("ज्वर") || textLower.includes("फीवर") || textLower.includes("ताप")) {
            symptomKey = "fever";
        } else if (textLower.includes("cough") || textLower.includes("khansi") || textLower.includes("coughing") || textLower.includes("खांसी") || textLower.includes("खोख") || textLower.includes("ਖੰਘ") || textLower.includes("कास") || textLower.includes("कफ")) {
            symptomKey = "cough";
        } else if (textLower.includes("cold") || textLower.includes("flu") || textLower.includes("runny nose") || textLower.includes("जुकाम") || textLower.includes("सर्दी") || textLower.includes("नाक") || textLower.includes("ਜ਼ੁਕਾਮ") || textLower.includes("प्रतिश्याय") || textLower.includes("कोल्ड") || textLower.includes("फ्लू")) {
            symptomKey = "cold";
        } else if (textLower.includes("stomach") || textLower.includes("abdomen") || textLower.includes("acidity") || textLower.includes("indigestion") || textLower.includes("pet") || textLower.includes("पेट") || textLower.includes("ਪੇਟ") || textLower.includes("ਉਦਰ") || textLower.includes("उदर") || textLower.includes("स्टमक") || textLower.includes("एसिडिटी") || textLower.includes("गैस")) {
            symptomKey = "stomach";
        } else if (textLower.includes("throat") || textLower.includes("gala") || textLower.includes("swallow") || textLower.includes("गला") || textLower.includes("खराश") || textLower.includes("ਗਲੇ") || textLower.includes("ਗਲਾ") || textLower.includes("कण्ठ") || textLower.includes("थ्रोट") || textLower.includes("टॉन्सिल")) {
            symptomKey = "throat";
        } else if (textLower.includes("anxious") || textLower.includes("stress") || textLower.includes("panic") || textLower.includes("fear") || textLower.includes("breathless") || textLower.includes("तनाव") || textLower.includes("घबराहट") || textLower.includes("बेचैनी") || textLower.includes("ਤਣਾਅ") || textLower.includes("ਚਿੰਤਾ") || textLower.includes("ਸਟ੍ਰੈਸ") || textLower.includes("ਟੈਂਸ਼ਨ") || textLower.includes("एंग्जायटी") || textLower.includes("पैनिक")) {
            symptomKey = "stress";
        }

        const matches = localSymptomDatabase[symptomKey];
        let reply = matches[lang] || matches["en-US"];
        return reply + "\n\n*(Offline Simulation Mode)*";
    };

    // --------------------------------------------------------------------------
    // Follow-up check-in timer logic
    // --------------------------------------------------------------------------
    const timerCard = document.querySelector('.timer-widget-card');
    const timerDisplay = document.getElementById('timer-display');
    const timerBadge = document.getElementById('timer-badge');
    const skipTimerBtn = document.getElementById('skip-timer-btn');

    const startCheckInTimer = (userText) => {
        appState = "idle";
        lastSpeechLanguage = detectSpeechLanguage(userText);
        
        if (checkInTimer) {
            clearInterval(checkInTimer);
        }

        // Configure timer duration: 10 minutes (600 seconds)
        checkInSecondsRemaining = 600;

        timerCard.classList.remove('checking');
        timerCard.classList.add('active');
        timerBadge.innerText = "Active";
        skipTimerBtn.classList.remove('hide');
        updateTimerDisplay();

        checkInTimer = setInterval(() => {
            checkInSecondsRemaining--;
            updateTimerDisplay();

            if (checkInSecondsRemaining <= 0) {
                clearInterval(checkInTimer);
                triggerCheckIn();
            }
        }, 1000);
    };

    const updateTimerDisplay = () => {
        const mins = Math.floor(checkInSecondsRemaining / 60);
        const secs = checkInSecondsRemaining % 60;
        timerDisplay.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const triggerCheckIn = () => {
        appState = "awaiting_followup";
        
        timerCard.classList.remove('active');
        timerCard.classList.add('checking');
        timerBadge.innerText = "Check-in";
        timerDisplay.innerText = "Awaiting";
        skipTimerBtn.classList.add('hide');

        let followUpQuestion = "";
        switch (lastSpeechLanguage) {
            case 'pa-IN':
                followUpQuestion = "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਹੁਣ ਤੁਸੀਂ ਕਿਵੇਂ ਮਹਿਸੂਸ ਕਰ ਰਹੇ ਹੋ? ਕੀ ਤੁਸੀਂ ਪਹਿਲਾਂ ਨਾਲੋਂ ਠੀਕ ਹੋ? (ਹਾਂ / ਨਹੀਂ)";
                break;
            case 'hi-IN':
                followUpQuestion = "नमस्ते! अब आप कैसा महसूस कर रहे हैं? क्या आप बेहतर महसूस कर रहे हैं? (हाँ / नहीं)";
                break;
            case 'sa-IN':
                followUpQuestion = "नमो नमः। सम्प्रति भवान् कथं अनुभवति? किं स्वस्थता अस्ति? (आम् / न)";
                break;
            default:
                followUpQuestion = "Hello! How are you feeling now? Are you feeling better? (Yes / No)";
        }

        addMessageToChat('ai', followUpQuestion);
        speakText(followUpQuestion);
    };

    const handleFollowupReply = async (text) => {
        appState = "idle";
        
        timerCard.classList.remove('checking');
        timerBadge.innerText = "Idle";
        timerDisplay.innerText = "--:--";

        showTypingIndicator();
        await new Promise(resolve => setTimeout(resolve, 1000));
        removeTypingIndicator();

        const textLower = text.toLowerCase().trim();

        const positiveKeywords = [
            "yes", "yeah", "yep", "better", "good", "fine", "ok", "okay", "recovered", "great", "improved",
            "haan", "ha", "haa", "theek", "thik", "accha", "acha", "achha", "behtar", "sahih", "sahi", "हाँ", "हा", "ठीक", "अच्छा", "बेहतर",
            "vadiya", "ਵਧੀਆ", "ਹਾਂ", "ਠੀਕ", "aam", "astu", "samyak", "स्वस्थ", "आम्", "अस्तु", "सम्यक्"
        ];

        const negativeKeywords = [
            "no", "nope", "not", "bad", "worse", "hurts", "pain", "same", "not well", "unwell", "sick", "felt bad",
            "nahi", "nahin", "na", "bura", "dard", "bukhar", "kharab", "vaisa hi", "नही", "नहीं", "न", "दर्द", "बुरा", "खराब",
            "ਨਹੀਂ", "ਨਾ", "ਦਰਦ", "कष्टं", "अस्वस्थ"
        ];

        const isPositive = positiveKeywords.some(keyword => textLower.includes(keyword));
        const isNegative = negativeKeywords.some(keyword => textLower.includes(keyword));

        let resolvedPositive = true;
        if (isNegative) {
            resolvedPositive = false;
        } else if (!isPositive) {
            resolvedPositive = false;
        }

        if (resolvedPositive) {
            playSynthesizedSound('listening');
            
            let caringReply = "";
            switch (lastSpeechLanguage) {
                case 'pa-IN':
                    caringReply = "**ਮੈਨੂੰ ਇਹ ਸੁਣ ਕੇ ਬਹੁਤ ਖੁਸ਼ੀ ਹੋਈ ਕਿ ਤੁਸੀਂ ਠੀਕ ਹੋ!**\n\nਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਖਿਆਲ ਰੱਖੋ, ਲੋੜ ਪੈਣ 'ਤੇ ਆਰਾਮ ਕਰੋ ਅਤੇ ਖੂਬ ਪਾਣੀ ਪੀਓ।";
                    break;
                case 'hi-IN':
                    caringReply = "**यह सुनकर बहुत खुशी हुई कि आप अब बेहतर महसूस कर रहे हैं!**\n\nकृपया अपना ख्याल रखें, पर्याप्त आराम करें और खुद को अच्छी तरह से हाइड्रेटेड रखें।";
                    break;
                case 'sa-IN':
                    caringReply = "**श्रुत्वा अतीव संतोषः अभवत् यत् भवान् स्वस्थः अस्ति!**\n\nस्वस्वास्थ्यस्य ध्यानं रक्षतु, विश्रामं च करोतु।";
                    break;
                default:
                    caringReply = "**I am so glad to hear that you are feeling better!**\n\nRemember to continue resting, stay well-hydrated, and take it easy today.";
            }

            addMessageToChat('ai', caringReply);
            speakText(caringReply);
        } else {
            playSynthesizedSound('alarm');

            let alertReply = "";
            switch (lastSpeechLanguage) {
                case 'pa-IN':
                    alertReply = "**ਮੈਨੂੰ ਅਫਸੋਸ ਹੈ ਕਿ ਤੁਸੀਂ ਠੀਕ ਮਹਿਸੂਸ ਨਹੀਂ ਕਰ ਰਹੇ ਹੋ।**\n\nਮੈਂ ਐਮਰਜੈਂਸੀ ਚੇਤਾਵਨੀ ਸਕ੍ਰੀਨ ਖੋਲ੍ਹ ਦਿੱਤੀ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਭਾਰਤ ਦੇ ਮੁੱਖ ਐਮਰਜੈਂਸੀ ਨੰਬਰ **108** 'ਤੇ ਤੁਰੰਤ ਕਾਲ ਕਰੋ।";
                    break;
                case 'hi-IN':
                    alertReply = "**मुझे बहुत खेद है कि आप बेहतर महसूस नहीं कर रहे हैं।**\n\nमैंने आपातकालीन चेतावनी सक्रिय कर दी है। कृपया भारत के मेडिकल आपातकालीन नंबर **108** पर तुरंत कॉल करें।";
                    break;
                case 'sa-IN':
                    alertReply = "**कष्टं जातं यत् भवान् स्वस्थः नास्ति।**\n\nआपातकालीन व्यवस्था सक्रिय अस्ति। कृपया भारतस्य आपातकालीन दूरभाष संख्या **108** इत्यत्र शीघ्रं संपर्कं करोतु।";
                    break;
                default:
                    alertReply = "**I'm so sorry to hear that you are not feeling better.**\n\nI have activated Emergency Mode. Please contact medical services immediately by calling the emergency number **108**.";
            }

            addMessageToChat('ai', alertReply);
            speakText(alertReply);

            setTimeout(() => {
                showModal(emergencyOverlay);
            }, 800);
        }
    };

    skipTimerBtn.addEventListener('click', () => {
        if (checkInTimer) {
            clearInterval(checkInTimer);
        }
        triggerCheckIn();
    });

    // --------------------------------------------------------------------------
    // Send Message Handler
    // --------------------------------------------------------------------------
    const sendMessage = async () => {
        const text = chatInput.value.trim();
        if (!text) return;

        // Reset input field and heights
        chatInput.value = "";
        charCounter.innerText = "0/2000";
        adjustInputHeight();

        // 1. Add User query to chat UI
        addMessageToChat('user', text);

        // 2. Intercept if awaiting follow-up check-in response
        if (appState === "awaiting_followup") {
            handleFollowupReply(text);
            return;
        }

        // 3. Automated emergency scan
        const isUserEmergency = checkAndTriggerEmergency(text);
        if (isUserEmergency) {
            return; // Stop execution, emergency modal is active
        }

        // 4. Show typing indicator
        showTypingIndicator();

        let aiResponse;
        const config = getConfig();
        try {
            // 5. API Request or Local Fallback simulation based on configured provider
            if (config.PROVIDER === "huggingface") {
                try {
                    aiResponse = await callHuggingFaceAPI(text);
                } catch (hfErr) {
                    console.warn("Hugging Face API call failed, falling back to local database:", hfErr);
                    if (hfErr.message.startsWith("MODEL_LOADING")) {
                        const loadingTime = hfErr.message.split(":")[1] || 20;
                        addNotificationMessage(`The Hugging Face model is currently loading (estimated: ${loadingTime}s). Serving local response.`);
                    } else if (hfErr.message === "HF_TOKEN_MISSING") {
                        addNotificationMessage("Hugging Face API Token is missing. Serving local simulated response.");
                    } else if (hfErr.message === "HF_GATED_MODEL") {
                        addNotificationMessage("Gated Model Terms Required: To use MedGemma, make sure your token has accepted terms at 'huggingface.co/google/medgemma-1.5-4b-it'. Falling back to local response.");
                    } else if (hfErr.message === "HF_UNAUTHORIZED") {
                        addNotificationMessage("Hugging Face authorization failed. Please check your HF Token. Serving local simulated response.");
                    } else {
                        addNotificationMessage("Hugging Face Inference call failed. Serving local simulated response.");
                    }
                    await new Promise(resolve => setTimeout(resolve, 800));
                    aiResponse = getLocalResponse(text);
                }
            } else if (config.PROVIDER === "gemini") {
                try {
                    aiResponse = await callGeminiAPI(text);
                } catch (geminiErr) {
                    console.warn("Gemini API call failed, falling back to local database:", geminiErr);
                    if (geminiErr.message === "API_KEY_MISSING") {
                        addNotificationMessage("Gemini API Key is missing. Serving local simulated response.");
                    } else {
                        addNotificationMessage("Gemini API call failed. Serving local simulated response.");
                    }
                    await new Promise(resolve => setTimeout(resolve, 800));
                    aiResponse = getLocalResponse(text);
                }
            } else {
                // Offline mode
                await new Promise(resolve => setTimeout(resolve, 800));
                aiResponse = getLocalResponse(text);
            }
            
            // 6. Remove indicator
            removeTypingIndicator();

            // 7. Display AI response in Chat
            addMessageToChat('ai', aiResponse);

            // 8. Update Session History
            conversationHistory.push({ role: 'user', content: text });
            conversationHistory.push({ role: 'model', content: aiResponse });

            // 10. Scan AI output for emergency key phrases just in case
            const isAIEmergency = checkAndTriggerEmergency(aiResponse);

            // Check if user input is just a greeting
            const greetingWords = [
                "hi", "hello", "hey", "namaste", "hlo", "helo", "greetings", "good morning", "good afternoon", "good evening", "hola",
                "नमस्ते", "नमस्कार", "हेलो", "हाय", "हैलो", "राम राम", "satsriakal", "sat sri akal", "assalamualaikum"
            ];
            const cleanInput = text.toLowerCase().trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"");
            const isUserGreeting = greetingWords.includes(cleanInput) || (cleanInput.split(/\s+/).length <= 2 && greetingWords.some(g => cleanInput.includes(g)));

            // 9. Voice Output Speak
            speakText(aiResponse, () => {
                if (!isAIEmergency && !isUserGreeting) {
                    const detectedLang = detectSpeechLanguage(aiResponse);
                    let transitionText = "";
                    if (detectedLang === 'hi-IN') {
                        transitionText = "Aap ye karke dekho, 10 minute baad main puchungi ki ab aap kaise hain.";
                    } else if (detectedLang === 'pa-IN') {
                        transitionText = "ਤੁਸੀਂ ਇਹ ਕਰਕੇ ਦੇਖੋ, 10 ਮਿੰਟ ਬਾਅਦ ਮੈਂ ਪੁੱਛਾਂਗੀ ਕਿ ਹੁਣ ਤੁਸੀਂ ਕਿਵੇਂ ਹੋ।";
                    } else if (detectedLang === 'sa-IN') {
                        transitionText = "भवान् एतत् कृत्वा पश्यतु, १० निमेषानन्तरं अहं प्रक्ष्यामि यत् सम्प्रति भवान् कथं अस्ति इति।";
                    } else {
                        transitionText = "You try doing this, after 10 minutes I will ask how you are now.";
                    }
                    
                    addMessageToChat('ai', transitionText);
                    speakText(transitionText, () => {
                        startCheckInTimer(text);
                    });
                }
            });

            // Dynamically switch recognition language for the next turn
            if (recognition) {
                const lastLang = detectSpeechLanguage(text);
                if (lastLang === 'hi-IN') {
                    recognition.lang = 'hi-IN';
                } else if (lastLang === 'pa-IN') {
                    recognition.lang = 'pa-IN';
                } else if (lastLang === 'sa-IN') {
                    recognition.lang = 'sa-IN';
                } else {
                    recognition.lang = 'en-US';
                }
            }

        } catch (error) {
            removeTypingIndicator();
            console.error("Send Message Process Error:", error);

            let friendlyMessage = "I encountered an error processing that request. Serving local simulated response.";
            addMessageToChat('ai', friendlyMessage);
            speakText(friendlyMessage);
        }
    };

    // Trigger button listeners
    sendBtn.addEventListener('click', sendMessage);

    // Keyboard Shortcuts listener
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // --------------------------------------------------------------------------
    // Sidebar Controls (New Session / Clear Chat)
    // --------------------------------------------------------------------------
    const startNewSession = () => {
        stopSpeaking();
        conversationHistory = [];
        chatMessagesContainer.innerHTML = "";
        chatMessagesContainer.appendChild(welcomeContainer);
        welcomeContainer.classList.remove('hide');
        avatarStatusText.innerText = "Ready to help";
        
        // Clean up check-in timer states
        if (checkInTimer) {
            clearInterval(checkInTimer);
        }
        appState = "idle";
        timerCard.classList.remove('active', 'checking');
        timerBadge.innerText = "Idle";
        timerDisplay.innerText = "--:--";
        skipTimerBtn.classList.add('hide');
    };

    newChatBtn.addEventListener('click', startNewSession);
    clearChatBtn.addEventListener('click', startNewSession);

    // Suggested Questions Grid triggers
    document.querySelectorAll('.suggested-card').forEach(card => {
        card.addEventListener('click', () => {
            const question = card.getAttribute('data-question');
            chatInput.value = question;
            adjustInputHeight();
            sendMessage();
        });
    });

    // Start Session Onboarding Click Event Listener
    const startSessionBtn = document.getElementById('start-session-btn');
    if (startSessionBtn) {
        startSessionBtn.addEventListener('click', () => {
            document.getElementById('start-screen').style.display = 'none';
            document.getElementById('welcome-main-content').style.display = 'block';
            document.getElementById('chat-input-panel').style.display = 'block';
            
            const greetingText = "Hello, how can I help you?";
            addMessageToChat('ai', greetingText);
            conversationHistory.push({ role: 'model', content: greetingText });
            speakText(greetingText);
            if (recognition) {
                recognition.lang = 'en-US';
            }
        });
    }

    // Mobile Sidebar responsiveness toggler
    const docHtml = document.documentElement;
    // Inject overlay if not exist
    let sideOverlay = document.createElement('div');
    sideOverlay.className = 'sidebar-overlay hide';
    document.body.appendChild(sideOverlay);

    const toggleSidebar = () => {
        const sidebar = document.querySelector('.sidebar');
        sidebar.classList.toggle('mobile-open');
        sideOverlay.classList.toggle('hide');
        docHtml.classList.toggle('sidebar-open');
    };

    // Header burger click handler for mobile
    document.querySelector('.chat-header').addEventListener('click', (e) => {
        // If clicked on info area or button, ignore, otherwise toggle if click near sidebar toggle
        if (window.innerWidth <= 900 && e.offsetX < 60) {
            toggleSidebar();
        }
    });

    sideOverlay.addEventListener('click', toggleSidebar);
});
