# AstraX AI - Intelligent Medical Voice Assistant

AstraX AI is a premium, client-side medical conversational assistant built with HTML5, CSS3, and Vanilla JavaScript. It communicates directly with the **Google Gemini API** to provide general health advice, basic self-care remedies, and emergency support.

---

## 🌟 Key Features

* **Premium Medical UI & Aesthetic**: Sleek glassmorphism style sheet with dynamic background elements, fully responsive layout, and beautiful dark and light themes.
* **Direct Google Gemini API Integration**: Fetches responses directly from the Gemini model (no middle backend, no databases, pure browser client-side execution).
* **Multi-lingual Voice Recognition (STT)**: Built-in support for voice input (Web Speech API) across English, Hindi, Hinglish, and Punjabi.
* **Auto-detect Voice Synthesis (TTS)**: Automatically detects response language and selects corresponding regional voices with speech rate settings and a stop button.
* **Safety Protocols & Emergency Detector**: Checks symptoms in real-time. If emergency conditions match (e.g., chest pain, breathing difficulty, unconsciousness), a shake-animation overlay modal is launched with an immediate action plan.
* **Suggested Medical Prompts**: Quick clickable cards for general health instructions.
* **Modern Chat Controls**: ChatGPT-style text area (auto-resizing), copy button, keyboard shortcuts, character counter, and clear session capability.

---

## 📂 Project Structure

```text
├── index.html     # HTML Layout & DOM Structure
├── style.css      # Custom Stylesheet & Dark/Light Mode Variables
├── script.js      # Core Logic (API calls, TTS, STT, and Modals)
├── config.js      # Global Configuration Profile (Gemini API Key)
└── README.md      # Project Documentation
```

---

## 🚀 Getting Started

### 1. Set Up Your API Key
1. Open the [config.js](file:///c:/Users/98har/Desktop/astra_bot/config.js) file.
2. Replace `"YOUR_API_KEY_HERE"` with your actual Google Gemini API Key.
   * You can get an API key for free from the [Google AI Studio Console](https://aistudio.google.com/).

### 2. Running Locally
Simply serve the folder using any local static web server or open it directly in a web browser.

**Example using Python:**
```bash
python -m http.server 8000
```
Then visit: [http://localhost:8000/](http://localhost:8000/)

---

## 🎹 Keyboard Shortcuts

* <kbd>Enter</kbd> : Send your current message.
* <kbd>Shift</kbd> + <kbd>Enter</kbd> : Insert a new line in the text input box.

---

## ⚠️ Medical Disclaimer
AstraX AI is designed only for **educational and self-care information**. It is **not** a licensed medical diagnostic tool or prescribing physician. If you are experiencing serious or severe health issues, consult professional clinical healthcare immediately.
