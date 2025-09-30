export function speak(text: string, lang: string = "de-DE") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    console.warn("Text-to-speech not supported");
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  window.speechSynthesis.speak(utterance);
}
