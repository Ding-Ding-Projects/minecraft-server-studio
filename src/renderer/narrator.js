(() => {
  'use strict';

  const MAX_QUEUE_LENGTH = 8;
  const DEFAULT_COOLDOWN_MS = 4_000;
  const LANGUAGE_TAGS = Object.freeze({ english: 'en-US', cantonese: 'zh-HK' });

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function finite(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number >= minimum && number <= maximum ? number : fallback;
  }

  function narratorConfig(value) {
    const source = isRecord(value) ? value : {};
    const voices = isRecord(source.voices) ? source.voices : {};
    const rates = isRecord(source.rates) ? source.rates : {};
    const pitches = isRecord(source.pitches) ? source.pitches : {};
    return {
      enabled: source.enabled === true,
      language: ['english', 'cantonese', 'both'].includes(source.language) ? source.language : 'english',
      voices: {
        english: typeof voices.english === 'string' && voices.english ? voices.english : 'automatic',
        cantonese: typeof voices.cantonese === 'string' && voices.cantonese ? voices.cantonese : 'automatic'
      },
      rates: {
        english: finite(rates.english, 0.5, 2, 1),
        cantonese: finite(rates.cantonese, 0.5, 2, 1)
      },
      pitches: {
        english: finite(pitches.english, 0, 2, 1),
        cantonese: finite(pitches.cantonese, 0, 2, 1)
      }
    };
  }

  function languageMatches(language, voice) {
    const tag = String(voice?.lang || '').toLowerCase().replace(/_/g, '-');
    if (language === 'english') return /^en(?:-|$)/.test(tag);
    return /^(?:yue(?:-|$)|zh-(?:hk|hant)(?:-|$)|zh-hk(?:-|$))/.test(tag);
  }

  function stableVoice(voice) {
    const id = typeof voice?.voiceURI === 'string' ? voice.voiceURI.trim() : '';
    if (!id) return null;
    return {
      id,
      name: String(voice.name || id).slice(0, 160),
      lang: String(voice.lang || '').slice(0, 48),
      default: voice.default === true,
      localService: voice.localService !== false
    };
  }

  function createNarrator(options = {}) {
    const source = isRecord(options) ? options : {};
    const api = source.speechSynthesis || window.speechSynthesis;
    const Utterance = source.SpeechSynthesisUtterance || window.SpeechSynthesisUtterance;
    const cooldownMs = finite(source.cooldownMs, 0, 60_000, DEFAULT_COOLDOWN_MS);
    const observers = new Set();
    const recentCategories = new Map();
    let config = narratorConfig(source.config);
    let screenReaderActive = source.screenReaderActive === true;
    let voiceEntries = [];
    let queue = [];
    let speaking = false;
    let generation = 0;
    let availability = {
      state: 'not-checked',
      detail: 'Narrator voice availability has not been checked.'
    };

    function notify() {
      const snapshot = getSnapshot();
      for (const observer of observers) {
        try { observer(snapshot); } catch { /* A display observer cannot interrupt narrator state. */ }
      }
    }

    function supported() {
      return Boolean(api && typeof api.getVoices === 'function' && typeof api.speak === 'function' && typeof api.cancel === 'function' && typeof Utterance === 'function');
    }

    function refreshVoices() {
      if (!supported()) {
        voiceEntries = [];
        availability = {
          state: 'unavailable',
          detail: 'This Electron runtime does not expose a usable platform speech-synthesis API, so no narrator voice can be selected.'
        };
        notify();
        return getSnapshot();
      }
      let entries;
      try {
        entries = api.getVoices();
      } catch {
        entries = [];
      }
      voiceEntries = Array.isArray(entries) ? entries.map(stableVoice).filter(Boolean) : [];
      availability = voiceEntries.length
        ? { state: 'available', detail: `${voiceEntries.length} platform voice${voiceEntries.length === 1 ? '' : 's'} with stable identities are available.` }
        : { state: 'waiting', detail: 'The platform voice list is still empty. The narrator will keep watching for voices instead of claiming that none are installed.' };
      notify();
      return getSnapshot();
    }

    function voicesFor(language) {
      return voiceEntries.filter((voice) => languageMatches(language, voice));
    }

    function selectedVoice(language) {
      const candidates = voicesFor(language);
      const desired = config.voices[language];
      if (!candidates.length) return { voice: null, state: 'unavailable', detail: `No installed platform voice advertises ${language === 'english' ? 'English' : 'Cantonese'} support.` };
      if (desired !== 'automatic') {
        const exact = candidates.find((voice) => voice.id === desired);
        if (exact) return { voice: exact, state: exact.localService ? 'selected' : 'network', detail: exact.localService ? `${exact.name} is selected.` : `${exact.name} is selected and may be unavailable offline.` };
        const fallback = candidates.find((voice) => voice.default) || candidates[0];
        return { voice: fallback, state: 'missing', detail: 'The selected voice is not installed on this computer. The saved selection is kept; a compatible automatic voice will be used when available.' };
      }
      const automatic = candidates.find((voice) => voice.default) || candidates[0];
      return { voice: automatic, state: automatic.localService ? 'automatic' : 'network', detail: automatic.localService ? `${automatic.name} is selected automatically.` : `${automatic.name} is selected automatically and may be unavailable offline.` };
    }

    function getSnapshot() {
      const english = selectedVoice('english');
      const cantonese = selectedVoice('cantonese');
      return {
        availability: { ...availability },
        enabled: config.enabled,
        screenReaderActive,
        voices: voiceEntries.map((voice) => ({ ...voice })),
        english: {
          ...english,
          voice: english.voice ? { ...english.voice } : null,
          choices: voicesFor('english').map((voice) => ({ ...voice }))
        },
        cantonese: {
          ...cantonese,
          voice: cantonese.voice ? { ...cantonese.voice } : null,
          choices: voicesFor('cantonese').map((voice) => ({ ...voice }))
        },
        queueLength: queue.length,
        speaking
      };
    }

    function speakNext() {
      if (speaking || !queue.length || !config.enabled || screenReaderActive || !supported()) return;
      const item = queue.shift();
      const selection = selectedVoice(item.language);
      if (!selection.voice) {
        notify();
        speakNext();
        return;
      }
      const token = generation;
      const utterance = new Utterance(item.text);
      let platformVoices = [];
      try { platformVoices = api.getVoices() || []; } catch { platformVoices = []; }
      utterance.voice = platformVoices.find((voice) => stableVoice(voice)?.id === selection.voice.id) || null;
      utterance.lang = utterance.voice?.lang || LANGUAGE_TAGS[item.language];
      utterance.rate = config.rates[item.language];
      utterance.pitch = config.pitches[item.language];
      utterance.onend = utterance.onerror = () => {
        if (token !== generation) return;
        speaking = false;
        notify();
        speakNext();
      };
      speaking = true;
      notify();
      try {
        api.speak(utterance);
      } catch {
        speaking = false;
        notify();
        speakNext();
      }
    }

    function enqueue(language, text, category) {
      if (typeof text !== 'string' || !text.trim()) return;
      queue = queue.filter((item) => item.category !== category);
      if (queue.length >= MAX_QUEUE_LENGTH) queue.shift();
      queue.push({ language, text: text.trim().slice(0, 1_000), category });
    }

    function narrate(input = {}) {
      const source = isRecord(input) ? input : {};
      if (!config.enabled || screenReaderActive || !supported()) return false;
      const category = typeof source.category === 'string' && source.category.trim() ? source.category.trim().slice(0, 80) : 'general';
      const now = Date.now();
      const last = recentCategories.get(category) || 0;
      if (now - last < cooldownMs) return false;
      recentCategories.set(category, now);
      const english = typeof source.english === 'string' ? source.english : String(source.text || '');
      const cantonese = typeof source.cantonese === 'string' ? source.cantonese : english;
      if (config.language === 'english') enqueue('english', english, category);
      else if (config.language === 'cantonese') enqueue('cantonese', cantonese, category);
      else {
        enqueue('english', english, `${category}:english`);
        enqueue('cantonese', cantonese, `${category}:cantonese`);
      }
      speakNext();
      return true;
    }

    function stop() {
      generation += 1;
      queue = [];
      speaking = false;
      if (supported()) {
        try { api.cancel(); } catch { /* The platform may already have released the queue. */ }
      }
      notify();
    }

    function configure(nextConfig, runtime = {}) {
      config = narratorConfig(nextConfig);
      screenReaderActive = runtime.screenReaderActive === true;
      if (!config.enabled || screenReaderActive) stop();
      refreshVoices();
      return getSnapshot();
    }

    function onChange(callback) {
      if (typeof callback !== 'function') return () => {};
      observers.add(callback);
      callback(getSnapshot());
      return () => observers.delete(callback);
    }

    function voiceChangeListener() {
      refreshVoices();
    }

    if (supported()) {
      if (typeof api.addEventListener === 'function') api.addEventListener('voiceschanged', voiceChangeListener);
      else api.onvoiceschanged = voiceChangeListener;
    }
    refreshVoices();

    return Object.freeze({ configure, getSnapshot, narrate, onChange, refreshVoices, stop });
  }

  window.StudioNarrator = Object.freeze({ createNarrator });
})();
