/**
 * animator.js — Animation engine for Joker game
 * Handles: card fly, particles, screen shake, toasts, deck build
 */
(function () {
    "use strict";

    const flyStage = document.getElementById("fly-stage");
    const canvas   = document.getElementById("particleCanvas");
    const ctx2d    = canvas.getContext("2d");

    // ---- Canvas resize ----
    function resizeCanvas() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // ---- Particle system ----
    let particles = [];

    function spawnParticles(x, y, count, colors, speed = 6) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const v     = speed * (0.5 + Math.random());
            particles.push({
                x, y,
                vx: Math.cos(angle) * v,
                vy: Math.sin(angle) * v - Math.random() * 3,
                life: 1,
                decay: 0.025 + Math.random() * 0.03,
                radius: 3 + Math.random() * 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                gravity: 0.18
            });
        }
    }

    function spawnConfetti(count = 120) {
        const colors = ["#e6cc8a","#ff9d00","#fff","#c0282a","#4af","#f4f","#0f8"];
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: -10,
                vx: (Math.random() - 0.5) * 4,
                vy: 2 + Math.random() * 4,
                life: 1,
                decay: 0.004 + Math.random() * 0.006,
                radius: 4 + Math.random() * 5,
                color: colors[Math.floor(Math.random() * colors.length)],
                gravity: 0.05,
                wobble: Math.random() * 0.2,
                wobbleDir: Math.random() > 0.5 ? 1 : -1
            });
        }
    }

    function tickParticles() {
        ctx2d.clearRect(0, 0, canvas.width, canvas.height);
        particles = particles.filter(p => p.life > 0);
        for (const p of particles) {
            p.x  += p.vx + (p.wobble ? Math.sin(Date.now() * 0.003) * p.wobble * p.wobbleDir : 0);
            p.y  += p.vy;
            p.vy += p.gravity;
            p.life -= p.decay;
            ctx2d.globalAlpha = Math.max(0, p.life);
            ctx2d.fillStyle   = p.color;
            ctx2d.beginPath();
            ctx2d.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx2d.fill();
        }
        ctx2d.globalAlpha = 1;
        requestAnimationFrame(tickParticles);
    }
    tickParticles();

    // ---- Screen shake ----
    function shakeScreen(intensity = 1) {
        const root = document.getElementById("root");
        root.classList.remove("screen-shake");
        void root.offsetWidth; // reflow
        root.style.setProperty("--shake", intensity);
        root.classList.add("screen-shake");
        root.addEventListener("animationend", () => root.classList.remove("screen-shake"), { once: true });
    }

    // ---- Joker flash ----
    function jokerFlash() {
        const root = document.getElementById("root");
        root.classList.remove("joker-flash");
        void root.offsetWidth;
        root.classList.add("joker-flash");
        root.addEventListener("animationend", () => root.classList.remove("joker-flash"), { once: true });
    }

    // ---- Get element center (absolute page coords) ----
    function getCenter(el) {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    // ---- Build a card DOM element (for animations) ----
    function buildAnimCard(code, isBack) {
        const d = document.createElement("div");
        d.className = "card" + (isBack ? " back" : "");
        if (!isBack) {
            const SUITS = { S:"♠", H:"♥", D:"♦", C:"♣" };
            const RED   = { H:true, D:true };
            if (code === "JOKER") {
                d.classList.add("joker"); d.textContent = "🃏";
            } else {
                const s = code.slice(-1), v = code.slice(0, -1);
                d.classList.add(RED[s] ? "red" : "black");
                d.innerHTML = `<span class="top">${v}<br>${SUITS[s]}</span><span class="mid">${SUITS[s]}</span><span class="bot">${v}<br>${SUITS[s]}</span>`;
            }
        }
        return d;
    }

    // ---- Card fly animation ----
    // Flies a visual clone from srcEl center → dstEl center, then calls onDone
    function flyCard(code, isBack, srcEl, dstEl, onDone, durationMs = 380) {
        const from = getCenter(srcEl);
        const to   = getCenter(dstEl);

        const card = buildAnimCard(code, isBack);
        Object.assign(card.style, {
            position: "absolute",
            left: (from.x - parseInt(getComputedStyle(document.documentElement).getPropertyValue("--cw")) / 2) + "px",
            top:  (from.y - parseInt(getComputedStyle(document.documentElement).getPropertyValue("--ch")) / 2) + "px",
            transition: `left ${durationMs}ms cubic-bezier(0.22,0.61,0.36,1),
                         top  ${durationMs}ms cubic-bezier(0.22,0.61,0.36,1),
                         transform ${durationMs}ms ease,
                         opacity ${durationMs * 0.3}ms ease ${durationMs * 0.7}ms`,
            transform: "scale(1.1) rotate(-5deg)",
            zIndex: "160",
            pointerEvents: "none"
        });

        flyStage.appendChild(card);
        void card.offsetWidth; // reflow

        card.style.left      = (to.x - 29) + "px";
        card.style.top       = (to.y - 42) + "px";
        card.style.transform = "scale(1) rotate(0deg)";
        card.style.opacity   = "0";

        setTimeout(() => {
            card.remove();
            if (onDone) onDone();
        }, durationMs + 80);
    }

    // ---- Deal animation: stagger cards flying from deck to each hand ----
    function animateDeal(handEls, deckEl, totalCards, onAllDone) {
        let done = 0;
        const total = totalCards;
        const delay = 80;
        for (let i = 0; i < total; i++) {
            setTimeout(() => {
                const target = handEls[i % handEls.length];
                flyCard("back", true, deckEl, target, () => {
                    SFX.cardDeal();
                    done++;
                    if (done === total && onAllDone) onAllDone();
                }, 260);
            }, i * delay);
        }
    }

    // ---- Pair remove particles ----
    function pairRemoveBurst(cardEl) {
        const { x, y } = getCenter(cardEl);
        spawnParticles(x, y, 22, ["#7fc", "#4f9", "#fff", "#af7"], 5);
        SFX.pairRemove();
    }

    // ---- Toast notification ----
    let toastTimer = null;
    function showToast(msg, durationMs = 2000) {
        const t = document.getElementById("toast");
        t.textContent = msg;
        t.classList.add("visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove("visible"), durationMs);
    }

    // ---- Build deck pile visual ----
    function buildDeckPile(container, count = 5) {
        container.innerHTML = "";
        const n = Math.min(count, 6);
        for (let i = 0; i < n; i++) {
            const d = document.createElement("div");
            d.className = "deckCard";
            d.style.bottom = (i * 1.5) + "px";
            d.style.right  = (i * 0.5) + "px";
            container.appendChild(d);
        }
    }

    // ---- Expose API ----
    window.Animator = {
        flyCard,
        animateDeal,
        pairRemoveBurst,
        spawnParticles,
        spawnConfetti,
        shakeScreen,
        jokerFlash,
        showToast,
        buildDeckPile,
        getCenter
    };

})();
