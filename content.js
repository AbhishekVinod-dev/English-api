let currentUtterance = null;
let currentAudio = null;

document.addEventListener("mouseup", (event) => {
  const selection = window.getSelection().toString().trim();
  const existing = document.getElementById("lexi-popup");

  if (existing && existing.contains(event.target)) {
    return;
  }
  
  if (existing && !existing.contains(event.target)) {
    stopAllPlayback();
    existing.remove();
  }

  if (selection.length > 2 && /^[a-zA-Z'-]+$/.test(selection)) {
    fetchDefinition(selection, event.clientX, event.clientY);
  }
});

async function fetchDefinition(word, x, y) {
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
    const data = await response.json();

    if (data.title) return;

    const entry = data[0];
    const meaning = entry.meanings[0];
    const audioUrl =
      (entry.phonetics || []).find((item) => item && typeof item.audio === "string" && item.audio.trim())
        ?.audio || "";
    
    renderPopup({
      word: entry.word,
      phonetic: entry.phonetic || "",
      audioUrl,
      partOfSpeech: meaning.partOfSpeech,
      definition: meaning.definitions[0].definition,
      example: meaning.definitions[0].example || "",
      x: x,
      y: y
    });
  } catch (err) {
    console.error("LexiScan Pro Error:", err);
  }
}

function renderPopup(info) {
  stopAllPlayback();
  if (window.speechSynthesis) {
    // Ensure voice list is initialized in browsers that lazy-load voices.
    window.speechSynthesis.getVoices();
  }

  const popup = document.createElement("div");
  popup.id = "lexi-popup";
  
  const posX = Math.max(12, Math.min(window.innerWidth - 344, info.x + 12));
  const posY = Math.max(12, Math.min(window.innerHeight - 270, info.y + 12));
  
  popup.style.left = `${posX}px`;
  popup.style.top = `${posY}px`;

  const safeWord = escapeHtml(info.word);
  const safePhonetic = escapeHtml(info.phonetic);
  const safePart = escapeHtml(info.partOfSpeech);
  const safeDefinition = escapeHtml(info.definition);
  const safeExample = escapeHtml(info.example);

  popup.innerHTML = `
    <div class="lexi-header">
      <div class="lexi-title-wrap">
        <h1>${safeWord}</h1>
        <button class="lexi-voice-btn" id="lexi-speak-word-btn" title="Speak word" aria-label="Listen to word">Listen</button>
      </div>
      <button class="lexi-close" id="lexi-close-btn">×</button>
    </div>
    <div class="lexi-body">
      <div class="lexi-phonetic">${safePhonetic}</div>
      <div class="lexi-type">${safePart}</div>
      <p class="lexi-definition">${safeDefinition}</p>
      ${safeExample ? `<div class="lexi-example">"${safeExample}"</div>` : ""}
      <div class="lexi-actions">
        <button class="lexi-action-btn lexi-pronounce-btn" id="lexi-pronounce-btn" aria-label="Play pronunciation audio">Play Pronunciation</button>
        <button class="lexi-action-btn" id="lexi-speak-meaning-btn" aria-label="Read meaning aloud">Read Meaning Aloud</button>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  popup.addEventListener("mouseup", (event) => event.stopPropagation());
  popup.addEventListener("click", (event) => event.stopPropagation());

  const speakWordBtn = document.getElementById("lexi-speak-word-btn");
  const pronounceBtn = document.getElementById("lexi-pronounce-btn");
  const speakMeaningBtn = document.getElementById("lexi-speak-meaning-btn");

  speakWordBtn.onclick = () => playPronunciation(info, speakWordBtn);
  pronounceBtn.onclick = () => playPronunciation(info, pronounceBtn);
  speakMeaningBtn.onclick = () => {
    const phrase = `${info.word}. ${info.partOfSpeech}. ${info.definition}`;
    toggleSpeech(phrase, speakMeaningBtn);
  };

  document.getElementById("lexi-close-btn").onclick = () => {
    stopAllPlayback();
    popup.remove();
  };
}

function playPronunciation(info, button) {
  if (!info.audioUrl) {
    toggleSpeech(info.word, button);
    return;
  }

  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
    currentUtterance = null;
  }

  if (currentAudio && currentAudio.src === info.audioUrl && !currentAudio.paused) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
    clearSpeechState();
    return;
  }

  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }

  clearSpeechState();
  const audio = new Audio(info.audioUrl);
  currentAudio = audio;
  button.classList.add("is-speaking");

  const resetAudioState = () => {
    if (currentAudio === audio) {
      currentAudio = null;
    }
    clearSpeechState();
  };

  audio.onended = resetAudioState;
  audio.onpause = () => {
    if (audio.currentTime === 0 || audio.ended) {
      resetAudioState();
    }
  };
  audio.onerror = () => {
    resetAudioState();
    toggleSpeech(info.word, button);
  };

  audio.play().catch(() => {
    resetAudioState();
    toggleSpeech(info.word, button);
  });
}

function toggleSpeech(text, button) {
  if (!window.speechSynthesis) {
    console.warn("Speech synthesis is not supported in this browser.");
    return;
  }

  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }

  if (currentUtterance && button.classList.contains("is-speaking")) {
    window.speechSynthesis.cancel();
    clearSpeechState();
    return;
  }

  window.speechSynthesis.cancel();
  clearSpeechState();

  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const englishVoice = voices.find((voice) => voice.lang && voice.lang.toLowerCase().startsWith("en"));
  if (englishVoice) {
    utterance.voice = englishVoice;
    utterance.lang = englishVoice.lang;
  } else {
    utterance.lang = "en-US";
  }
  utterance.rate = 0.92;
  utterance.pitch = 1;

  utterance.onend = () => {
    clearSpeechState();
    currentUtterance = null;
  };

  utterance.onerror = () => {
    clearSpeechState();
    currentUtterance = null;
  };

  currentUtterance = utterance;
  button.classList.add("is-speaking");
  window.speechSynthesis.speak(utterance);
}

function stopAllPlayback() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  currentUtterance = null;

  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }

  clearSpeechState();
}

function clearSpeechState() {
  const buttons = document.querySelectorAll(".lexi-voice-btn, .lexi-action-btn");
  buttons.forEach((btn) => btn.classList.remove("is-speaking"));
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}