import os

from .base import LLMProvider, ProviderError


class GeminiProvider(LLMProvider):
    name = "gemini"

    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY", "")
        self.model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
        self.timeout = float(os.getenv("LLM_TIMEOUT_SECONDS", "30"))

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def generate(self, system_prompt: str, messages: list[dict]) -> str:
        try:
            import google.generativeai as genai
        except ImportError as e:
            raise ProviderError(f"google-generativeai package not installed: {e}")

        try:
            genai.configure(api_key=self.api_key)
            model = genai.GenerativeModel(self.model, system_instruction=system_prompt)

            # Gemini wants "model" not "assistant" as the role name.
            history = [
                {"role": "model" if m["role"] == "assistant" else "user", "parts": [m["content"]]}
                for m in messages[:-1]
            ]
            chat = model.start_chat(history=history)
            resp = chat.send_message(
                messages[-1]["content"],
                request_options={"timeout": self.timeout},
            )
            return resp.text
        except Exception as e:
            raise ProviderError(f"Gemini call failed: {e}")
