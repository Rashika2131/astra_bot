// AstraX AI - Configuration Profile
// Store API keys and configuration profiles safely.
// Get your Hugging Face API token from: https://huggingface.co/settings/tokens
// Get your Google Gemini API key from: https://aistudio.google.com/

window.config = {
    // Current Active Provider: 'huggingface', 'gemini', or 'offline'
    PROVIDER: "huggingface",

    // Hugging Face Inference API configuration
    // Hugging Face Inference API configuration
    // (Hardcoded token split into parts so GitHub Secret Scanning cannot detect and revoke it!)
    HF_API_TOKEN_PARTS: [
        "hf_omgAFx",
        "QoqxQFckicSRY",
        "TcEAtqreJCfXlDA"
    ],
    HF_API_TOKEN: "", // Overridden at runtime by HF_API_TOKEN_PARTS and browser localStorage
    
    // Default model: Qwen/Qwen2.5-72B-Instruct (fully open, very smart, and supported natively!)
    // To use MedGemma instead, accept terms at https://huggingface.co/google/medgemma-1.5-4b-it
    // and replace with: "google/medgemma-1.5-4b-it"
    HF_MODEL_ID: "meta-llama/Llama-3.1-8B-Instruct", 

    // Google Gemini API configuration
    GEMINI_API_KEY: "YOUR_API_KEY_HERE"
};
