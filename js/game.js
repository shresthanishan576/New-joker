/**
 * audio.js — Web Audio API synthesizer for Joker game
 * No external files required; all sounds generated procedurally.
 */
(function() {
    "use strict";

    let ctx = null;
    let enabled = true;

    function getCtx() {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        return ctx;
    }

    function resume() {
        const c = getCtx();
        if (c.state === 'suspended') c.resume();
        return c;
    }

    // ---- Utility ----
    function playTone(freq, type, duration, gain, delay = 0, fadeOut = true) {
        if (!enabled) return;
        const c = resume();
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, c.currentTime + delay);
        g.gain.setValueAtTime(0, c.currentTime + delay);
        g.gain.linearRampToValueAtTime(gain, c.currentTime + delay + 0.01);
        if (fadeOut) g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + duration);
        osc.connect(g); g.connect(c.destination);
        osc.start(c.currentTime + delay);
        osc.stop(c.currentTime + delay + duration + 0.02);
    }

    function playNoise(duration, filterFreq, gain, delay = 0) {
        if (!enabled) return;
        const c = resume();
        const bufSize = c.sampleRate * duration;
        const buf = c.createBuffer(1, bufSize, c.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        const src = c.createBufferSource();
        src.buffer = buf;
        const filter = c.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = filterFreq;
        filter.Q.value = 0.5;
        const g = c.createGain();
        g.gain.setValueAtTime(gain, c.currentTime + delay);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + duration);
        src.connect(filter); filter.connect(g); g.connect(c.destination);
        src.start(c.currentTime + delay);
        src.stop(c.currentTime + delay + duration + 0.01);
    }

    // ---- Sound Effects ----

    window.SFX = {
        toggle() { enabled = !enabled; return enabled; },
        isEnabled() { return enabled; },

        cardDeal() {
            // Soft paper swoosh
            playNoise(0.12, 1200, 0.15);
            playTone(900, 'sine', 0.08, 0.05, 0.01);
        },

        cardPick() {
            // Crisp pick
            playNoise(0.08, 2000, 0.2);
            playTone(1400, 'triangle', 0.1, 0.08, 0.02);
        },

        pairRemove() {
            // Positive chime
            [523, 659, 784].forEach((f, i) => playTone(f, 'sine', 0.25, 0.12, i * 0.07));
        },

        jokerPicked() {
            // Dramatic bass impact + rising alarm
            playTone(80, 'sawtooth', 0.4, 0.25);
            playTone(40, 'sine', 0.5, 0.2, 0.05);
            playTone(200, 'square', 0.3, 0.1, 0.15);
            playTone(400, 'sine', 0.2, 0.08, 0.35);
        },

        win() {
            // Triumphant fanfare
            const notes = [523, 659, 784, 1047];
            notes.forEach((f, i) => {
                playTone(f, 'sine', 0.5, 0.18, i * 0.12);
                playTone(f * 2, 'sine', 0.3, 0.06, i * 0.12 + 0.03);
            });
            // Coin jingle
            for (let i = 0; i < 6; i++) {
                playTone(1800 + Math.random() * 400, 'sine', 0.15, 0.1, 0.5 + i * 0.08);
            }
        },

        lose() {
            // Descending wail
            const c = resume();
            if (!enabled) return;
            const osc = c.createOscillator();
            const g = c.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(600, c.currentTime);
            osc.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.7);
            g.gain.setValueAtTime(0.2, c.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.8);
            osc.connect(g); g.connect(c.destination);
            osc.start(); osc.stop(c.currentTime + 0.85);
        },

        shuffle() {
            // Rapid card riffles
            for (let i = 0; i < 8; i++) {
                playNoise(0.04, 800 + Math.random() * 800, 0.12, i * 0.06);
            }
        },

        coin() {
            playTone(2093, 'sine', 0.2, 0.15);
            playTone(2637, 'sine', 0.15, 0.1, 0.05);
        },

        peek() {
            playTone(1760, 'sine', 0.15, 0.1);
            playTone(2093, 'sine', 0.15, 0.08, 0.1);
        },

        tick() {
            playTone(600, 'triangle', 0.05, 0.06);
        }
    };
})();
