/**
 * game.js — Core Joker card game logic (Enhanced Edition)
 * Features: animated deal, card-fly pick, pair burst, peek, bet system,
 *           CPU personalities, economy, streak, Web Audio SFX.
 */
(function () {
    "use strict";

    // ─────────────────────────────────────────────
    //  CONSTANTS
    // ─────────────────────────────────────────────
    const SUITS = ["S","H","D","C"];
    const VALS  = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
    const SYM   = { S:"♠", H:"♥", D:"♦", C:"♣" };
    const RED   = { H:true, D:true };
    const JOKER = "JOKER";

    // Player config: name + CPU delay range [min, max] ms (personality)
    const PLAYERS = [
        { name: "You",   minDelay: 0,    maxDelay: 0    },  // human
        { name: "CPU 2", minDelay: 900,  maxDelay: 1800 },  // steady
        { name: "CPU 4", minDelay: 400,  maxDelay: 900  },  // impulsive
        { name: "CPU 3", minDelay: 1400, maxDelay: 2600 },  // cautious
    ];

    // Hand-element index mapping (pi → DOM seat label suffix)
    // pi=0→bottom(you), pi=1→top(cpu2), pi=2→right(cpu4), pi=3→left(cpu3)
    const SEAT_IDS = [0, 1, 2, 3];

    // ─────────────────────────────────────────────
    //  STATE
    // ─────────────────────────────────────────────
    let players   = [[],[],[],[]];
    let current   = 0;   // whose turn to pick
    let offering  = -1;  // who they pick from
    let active    = false;
    let cpuTimer  = null;
    let bet       = 100;
    let peekUsed  = false;

    let bank   = parseInt(localStorage.getItem("jokerBank"))   || 1000;
    let streak = parseInt(localStorage.getItem("jokerStreak")) || 0;

    // ─────────────────────────────────────────────
    //  DOM REFS
    // ─────────────────────────────────────────────
    const elBank    = document.getElementById("bank-val");
    const elStreak  = document.getElementById("streak-val");
    const btnStart  = document.getElementById("btnStart");
    const btnPeek   = document.getElementById("btnPeek");
    const btnSound  = document.getElementById("btnSound");
    const elOverlay = document.getElementById("overlay");
    const elStatus  = document.getElementById("status");
    const elHint    = document.getElementById("hint");
    const elDeck    = document.getElementById("deckPile");
    const betBtns   = document.querySelectorAll(".bet-btn");

    // ─────────────────────────────────────────────
    //  ECONOMY
    // ─────────────────────────────────────────────
    function saveEco() {
        localStorage.setItem("jokerBank",   bank);
        localStorage.setItem("jokerStreak", streak);
    }

    function updateEco(animate = false) {
        elBank.textContent   = bank;
        elStreak.textContent = streak;
        saveEco();
        if (animate) {
            document.getElementById("eco-bank").classList.remove("bump");
            void document.getElementById("eco-bank").offsetWidth;
            document.getElementById("eco-bank").classList.add("bump");
        }
    }
    updateEco();

    // ─────────────────────────────────────────────
    //  BET UI
    // ─────────────────────────────────────────────
    betBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            bet = parseInt(btn.dataset.bet);
            betBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
        });
    });

    // ─────────────────────────────────────────────
    //  SOUND TOGGLE
    // ─────────────────────────────────────────────
    btnSound.addEventListener("click", () => {
        const on = SFX.toggle();
        btnSound.textContent = on ? "🔊" : "🔇";
    });

    // ─────────────────────────────────────────────
    //  DECK & DEAL
    // ─────────────────────────────────────────────
    function buildDeck() {
        let d = [];
        SUITS.forEach(s => VALS.forEach(v => d.push(v + s)));
        const qs = d.indexOf("QS");
        if (qs !== -1) d.splice(qs, 1);
        d.push(JOKER);
        // Fisher-Yates shuffle
        for (let i = d.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [d[i], d[j]] = [d[j], d[i]];
        }
        return d;
    }

    function deal(deck) {
        players = [[],[],[],[]];
        deck.forEach((c, i) => players[i % 4].push(c));
    }

    // ─────────────────────────────────────────────
    //  PAIR REMOVAL  (safe, removes exactly one pair)
    // ─────────────────────────────────────────────
    function removePairsOnce(hand) {
        const counts = {};
        hand.forEach(c => {
            if (c !== JOKER) {
                const r = c.slice(0, -1);
                counts[r] = (counts[r] || 0) + 1;
            }
        });
        const pairRank = Object.keys(counts).find(r => counts[r] >= 2);
        if (!pairRank) return hand;
        let removed = 0;
        return hand.filter(c => {
            if (c !== JOKER && c.slice(0, -1) === pairRank && removed < 2) {
                removed++;
                return false;
            }
            return true;
        });
    }

    // Remove ALL pairs at once (call during initial deal phase)
    function removeAllPairs(hand) {
        let prev;
        do { prev = hand.length; hand = removePairsOnce(hand); }
        while (hand.length < prev);
        return hand;
    }

    // ─────────────────────────────────────────────
    //  CARD DOM BUILDER
    // ─────────────────────────────────────────────
    function mkCard(code, isBack) {
        const d = document.createElement("div");
        d.className = "card";
        if (isBack) { d.classList.add("back"); return d; }
        if (code === JOKER) {
            d.classList.add("joker"); d.textContent = "🃏"; return d;
        }
        const s = code.slice(-1), v = code.slice(0, -1);
        d.classList.add(RED[s] ? "red" : "black");
        d.innerHTML = `<span class="top">${v}<br>${SYM[s]}</span><span class="mid">${SYM[s]}</span><span class="bot">${v}<br>${SYM[s]}</span>`;
        return d;
    }

    // ─────────────────────────────────────────────
    //  LAYOUT  (render a player's hand to the DOM)
    // ─────────────────────────────────────────────
    function layoutHand(pi, options = {}) {
        const box    = document.getElementById("hand-" + pi);
        const hand   = players[pi];
        const isHuman = (pi === 0);
        const isVert  = (pi === 2 || pi === 3); // left/right seats

        if (options.animate) {
            // Animate new card appearing (last card in hand)
            box.innerHTML = "";
        } else {
            box.innerHTML = "";
        }

        hand.forEach((code, i) => {
            const isPickable = active && current === 0 && pi === offering;
            const cardEl = mkCard(code, !isHuman);

            // Spread / fan layout
            if (!isVert) {
                const spread = Math.min(22, 180 / Math.max(hand.length, 1));
                const offset = i * spread;
                const rot    = (i - (hand.length - 1) / 2) * 2.5;
                cardEl.style.left      = offset + "px";
                cardEl.style.transform = `rotate(${rot}deg)`;
                cardEl.style.setProperty("--final-transform", `rotate(${rot}deg)`);
            } else {
                const spread = Math.min(20, 160 / Math.max(hand.length, 1));
                cardEl.style.top       = (i * spread) + "px";
                cardEl.style.transform = "rotate(0deg)";
            }

            if (isPickable) {
                cardEl.classList.add("pickable");
                cardEl.onclick = () => humanPickCard(pi, i);
            }

            box.appendChild(cardEl);
        });

        // Card count badge
        const cntEl = document.getElementById("lcnt-" + pi);
        const old   = cntEl.textContent;
        const neo   = `(${hand.length})`;
        if (old !== neo) {
            cntEl.textContent = neo;
            cntEl.classList.remove("bump");
            void cntEl.offsetWidth;
            cntEl.classList.add("bump");
        }
    }

    function layoutAll() {
        for (let i = 0; i < 4; i++) layoutHand(i);
    }

    // ─────────────────────────────────────────────
    //  ACTIVE SEAT HIGHLIGHT
    // ─────────────────────────────────────────────
    function setActiveSeat(turnPi, offerPi) {
        for (let i = 0; i < 4; i++) {
            const lbl = document.getElementById("lbl-" + i);
            lbl.classList.toggle("active-seat",  i === turnPi);
            lbl.classList.toggle("offering-seat", i === offerPi && turnPi !== offerPi);

            const dots = document.getElementById("dots-" + i);
            dots.classList.toggle("active", i === turnPi && i !== 0);
        }
    }

    // ─────────────────────────────────────────────
    //  NEXT ACTIVE PLAYER (skip empty hands)
    // ─────────────────────────────────────────────
    function nextActive(from) {
        let n = (from + 1) % 4;
        let iters = 0;
        while (players[n].length === 0 && iters++ < 4) n = (n + 1) % 4;
        return n;
    }

    function activePlayers() {
        return players.filter(h => h.length > 0).length;
    }

    // ─────────────────────────────────────────────
    //  PICK CARD — shared logic
    // ─────────────────────────────────────────────
    function executePickCard(fromPi, cardIdx) {
        if (!active) return;

        const card = players[fromPi].splice(cardIdx, 1)[0];
        const isJoker = card === JOKER;

        // Add to current player's hand, remove pairs
        players[current].push(card);
        const beforeLen = players[current].length;
        players[current] = removePairsOnce(players[current]);
        const pairsWereRemoved = players[current].length < beforeLen;

        // Visual feedback
        if (isJoker) {
            Animator.jokerFlash();
            Animator.shakeScreen();
            SFX.jokerPicked();
            Animator.showToast("🃏 JOKER PICKED!", 2000);
            elStatus.textContent = "🃏 JOKER moves!";
        } else {
            SFX.cardPick();
            elStatus.textContent = `${PLAYERS[current].name} picked ${card}`;
        }

        if (pairsWereRemoved) {
            // Burst on picker's hand
            const handEl = document.getElementById("hand-" + current);
            Animator.pairRemoveBurst(handEl);
        }

        // Advance turn
        const prevCurrent = current;
        current  = nextActive(current);
        offering = nextActive(current);

        // Avoid current picking from themselves
        if (offering === current) offering = nextActive(current);

        layoutAll();
        setActiveSeat(current, offering);

        if (activePlayers() <= 1) {
            setTimeout(endGame, 600);
            return;
        }

        scheduleTurn();
    }

    // ─────────────────────────────────────────────
    //  HUMAN PICK
    // ─────────────────────────────────────────────
    function humanPickCard(fromPi, cardIdx) {
        if (!active || current !== 0 || fromPi !== offering) return;

        const srcCard = document.getElementById("hand-" + fromPi).children[cardIdx];
        const dstHand = document.getElementById("hand-0");

        if (srcCard) {
            Animator.flyCard(
                players[fromPi][cardIdx],
                false,
                srcCard,
                dstHand,
                null,
                320
            );
        }

        executePickCard(fromPi, cardIdx);
    }

    // ─────────────────────────────────────────────
    //  CPU PICK
    // ─────────────────────────────────────────────
    function cpuMove() {
        if (!active) return;
        const offerHand = players[offering];
        if (!offerHand || offerHand.length === 0) return;

        // CPU picks randomly (could add smarter logic here)
        const idx = Math.floor(Math.random() * offerHand.length);

        const srcCard = document.getElementById("hand-" + offering).children[idx];
        const dstHand = document.getElementById("hand-" + current);

        if (srcCard && dstHand) {
            Animator.flyCard(
                offerHand[idx],
                true,  // CPU doesn't reveal card during fly
                srcCard,
                dstHand,
                null,
                300
            );
        }

        setTimeout(() => executePickCard(offering, idx), 200);
    }

    // ─────────────────────────────────────────────
    //  SCHEDULE TURN
    // ─────────────────────────────────────────────
    function scheduleTurn() {
        if (!active) return;

        if (activePlayers() <= 1) { endGame(); return; }

        if (current === 0) {
            // Human's turn
            elStatus.textContent = `Your turn — pick from ${PLAYERS[offering].name}`;
            elHint.textContent   = "Click a glowing card to pick!";
            btnPeek.disabled     = peekUsed || bank < 50;
            if (!peekUsed && bank >= 50) btnPeek.classList.add("available");
        } else {
            // CPU turn — animate thinking
            const p  = PLAYERS[current];
            const ms = p.minDelay + Math.random() * (p.maxDelay - p.minDelay);
            elStatus.textContent = `${p.name} is thinking…`;
            elHint.textContent   = "";
            btnPeek.disabled     = true;
            btnPeek.classList.remove("available");
            cpuTimer = setTimeout(cpuMove, ms);
        }
    }

    // ─────────────────────────────────────────────
    //  END GAME
    // ─────────────────────────────────────────────
    function endGame() {
        active = false;
        clearTimeout(cpuTimer);

        // The loser is whoever has cards left (holds the Joker)
        const loserIdx = players.findIndex(h => h.length > 0);
        const humanWon = loserIdx !== 0;

        // Bet was already deducted at start. On win, award the full pot.
        // pot = bet × 4 (all 4 players' bets). Human gets their bet back + profit.
        const pot   = bet * 4;
        const profit = pot - bet; // net gain (their own bet was already subtracted)

        document.getElementById("ovTitle").textContent = humanWon ? "🎉 YOU WIN!" : "😢 YOU LOST";

        if (humanWon) {
            bank += pot; // return their bet + take the other 3 players' bets
            streak++;
            SFX.win();
            Animator.spawnConfetti(180);
            document.getElementById("ovMsg").innerHTML =
                `You avoided the Joker! <strong class="joker-text">+${profit} 🪙</strong><br>
                <span class="result-subtitle">${PLAYERS[loserIdx].name} holds the Joker 🃏</span>`;
        } else {
            // Bet already deducted — nothing more to subtract
            streak = 0;
            SFX.lose();
            Animator.shakeScreen();
            document.getElementById("ovMsg").innerHTML =
                `You're holding the 🃏 JOKER!<br>
                <span class="result-subtitle">Better luck next round. <strong style="color:#f66">-${bet} 🪙</strong></span>`;
        }

        updateEco(true);
        setActiveSeat(-1, -1);

        // Give a moment before showing overlay
        setTimeout(() => {
            buildBetUI();
            elOverlay.classList.add("show");
        }, 1200);
    }

    // ─────────────────────────────────────────────
    //  PEEK MECHANIC
    // ─────────────────────────────────────────────
    btnPeek.addEventListener("click", () => {
        if (!active || current !== 0 || peekUsed || bank < 50) return;

        bank -= 50;
        peekUsed = true;
        updateEco(true);
        SFX.peek();
        btnPeek.disabled = true;
        btnPeek.classList.remove("available");

        // Briefly flip the middle card of the offering hand face-up
        const offerHand  = document.getElementById("hand-" + offering);
        const cards      = offerHand.querySelectorAll(".card");
        if (!cards.length) return;

        const midIdx     = Math.floor(cards.length / 2);
        const targetCard = cards[midIdx];
        const actualCode = players[offering][midIdx];

        // Swap to face-up temporarily
        const faceCard = mkCard(actualCode, false);
        faceCard.style.cssText = targetCard.style.cssText;
        faceCard.classList.add("pickable");
        offerHand.replaceChild(faceCard, targetCard);

        Animator.showToast(actualCode === JOKER ? "⚠️ That's the JOKER!" : `You saw: ${actualCode}`, 2500);

        setTimeout(() => {
            // Swap back
            const backCard = mkCard(actualCode, true);
            backCard.style.cssText = faceCard.style.cssText;
            backCard.classList.add("pickable");
            backCard.onclick = () => humanPickCard(offering, midIdx);
            if (offerHand.contains(faceCard)) offerHand.replaceChild(backCard, faceCard);
        }, 1800);
    });

    // ─────────────────────────────────────────────
    //  BET UI REFRESH
    // ─────────────────────────────────────────────
    function buildBetUI() {
        betBtns.forEach(btn => {
            const b = parseInt(btn.dataset.bet);
            btn.disabled = bank < b;
            btn.title    = bank < b ? "Not enough coins!" : "";
            btn.classList.toggle("active", b === bet);
        });
        // Auto-select lowest affordable if current bet unaffordable
        if (bank < bet) {
            const affordable = [...betBtns].reverse().find(b => bank >= parseInt(b.dataset.bet));
            if (affordable) {
                bet = parseInt(affordable.dataset.bet);
                betBtns.forEach(b => b.classList.toggle("active", parseInt(b.dataset.bet) === bet));
            }
        }
    }

    // ─────────────────────────────────────────────
    //  START GAME
    // ─────────────────────────────────────────────
    btnStart.addEventListener("click", () => {
        if (bank < bet) {
            Animator.showToast("Not enough coins!", 2000);
            return;
        }

        // Deduct bet up-front (pot = bet × 4, winner gets bet × 3 profit)
        bank -= bet;
        updateEco();

        elOverlay.classList.remove("show");
        active    = false;
        peekUsed  = false;
        clearTimeout(cpuTimer);

        // Shuffle and deal
        SFX.shuffle();
        const deck = buildDeck();
        deal(deck);
        for (let i = 0; i < 4; i++) players[i] = removeAllPairs(players[i]);

        // Rebuild deck visual
        Animator.buildDeckPile(elDeck, 6);

        // Reset labels
        setActiveSeat(-1, -1);
        elStatus.textContent = "Dealing…";
        elHint.textContent   = "";
        btnPeek.disabled     = true;
        btnPeek.classList.remove("available");
        layoutAll();

        // Animate deal — fly cards from deck to each hand
        const handEls   = [0,1,2,3].map(i => document.getElementById("hand-" + i));
        const totalCards = players.reduce((s, h) => s + h.length, 0);

        Animator.animateDeal(handEls, elDeck, Math.min(totalCards, 20), () => {
            // After deal anim, start game
            active  = true;
            current = 0;
            offering = nextActive(0);
            layoutAll();
            setActiveSeat(current, offering);
            scheduleTurn();
        });
    });

    // ─────────────────────────────────────────────
    //  INITIAL SETUP
    // ─────────────────────────────────────────────
    buildBetUI();
    Animator.buildDeckPile(elDeck, 6);
    elHint.textContent = "Each round costs your chosen bet. Win to claim the pot!";

})();
