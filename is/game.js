(function() {
    "use strict";

    const SUITS = ["S", "H", "D", "C"], VALS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const SYM = { S: "♠", H: "♥", D: "♦", C: "♣" }, RED = { H: true, D: true }, JOKER = "JOKER";
    const NAMES = ["You", "CPU 2", "CPU 4", "CPU 3"];
    
    let players = [], current = 0, offering = -1, active = false, timer = null;
    let bank = parseInt(localStorage.getItem('jokerBank')) || 1000;
    let streak = 0;

    const elBank = document.getElementById("bank-val");
    const elStreak = document.getElementById("streak-val");
    const btnStart = document.getElementById("btnStart");
    const elOverlay = document.getElementById("overlay");
    const elStatus = document.getElementById("status");

    function updateEco() {
        elBank.textContent = bank;
        elStreak.textContent = streak;
        localStorage.setItem('jokerBank', bank);
    }
    updateEco();

    function buildDeck() {
        let d = [];
        SUITS.forEach(s => VALS.forEach(v => d.push(v + s)));
        let q = d.indexOf("QS"); if (q !== -1) d.splice(q, 1);
        d.push(JOKER);
        return d.sort(() => Math.random() - 0.5);
    }

    function deal(deck) {
        players = [[], [], [], []];
        deck.forEach((c, i) => players[i % 4].push(c));
    }

    // FIXED: Safe pair removal to prevent freezing
    function removePairs(hand) {
        const counts = {};
        hand.forEach(c => {
            if (c !== JOKER) {
                const rank = c.slice(0, -1);
                counts[rank] = (counts[rank] || 0) + 1;
            }
        });
        
        // Find the first rank that has 2 or more cards
        const pairRank = Object.keys(counts).find(rank => counts[rank] >= 2);
        if (!pairRank) return hand;

        let removedCount = 0;
        return hand.filter(c => {
            if (c !== JOKER && c.slice(0, -1) === pairRank && removedCount < 2) {
                removedCount++;
                return false;
            }
            return true;
        });
    }

    function mkCard(code, isBack) {
        const d = document.createElement("div");
        d.className = "card";
        if (isBack) {
            d.classList.add("back");
            return d;
        }
        if (code === JOKER) {
            d.classList.add("joker"); d.textContent = "🃏";
            return d;
        }
        const s = code.slice(-1), v = code.slice(0, -1);
        d.classList.add(RED[s] ? "red" : "black");
        d.innerHTML = `<span class="top">${v}<br>${SYM[s]}</span><span class="mid">${SYM[s]}</span><span class="bot">${v}<br>${SYM[s]}</span>`;
        return d;
    }

    function layoutHand(pi) {
        const box = document.getElementById("hand-" + pi);
        box.innerHTML = "";
        const hand = players[pi];
        const isHuman = (pi === 0);

        hand.forEach((code, i) => {
            const isPickable = (active && current === 0 && pi === offering);
            const cardEl = mkCard(code, !isHuman);
            if (isPickable) cardEl.classList.add("pickable");

            // positioning logic
            if (pi === 0 || pi === 1) {
                cardEl.style.left = (i * 20) + "px";
                cardEl.style.transform = `rotate(${(i - hand.length / 2) * 2}deg)`;
            } else {
                cardEl.style.top = (i * 20) + "px";
            }

            if (isPickable) cardEl.onclick = () => pickCard(pi, i);
            box.appendChild(cardEl);
        });
        document.getElementById("lcnt-" + pi).textContent = `(${hand.length})`;
    }

    function pickCard(fromPi, cardIdx) {
        if(!active) return;
        
        const card = players[fromPi].splice(cardIdx, 1)[0];
        players[current].push(card);
        players[current] = removePairs(players[current]);
        
        elStatus.textContent = `Picked ${card === JOKER ? '🃏 JOKER!' : card}`;
        
        for (let i = 0; i < 4; i++) layoutHand(i);
        
        // Turn advancement
        current = (current + 1) % 4;
        while (players[current].length === 0 && players.some(h => h.length > 0)) {
            current = (current + 1) % 4;
        }
        
        offering = (current + 1) % 4;
        while (players[offering].length === 0 && players.some(h => h.length > 0)) {
            offering = (offering + 1) % 4;
        }

        updateTurn();
    }

    function updateTurn() {
        for (let i = 0; i < 4; i++) {
            document.getElementById("lbl-" + i).classList.toggle("active-seat", i === current);
            layoutHand(i);
        }

        if (players.filter(h => h.length > 0).length === 1) {
            endGame();
            return;
        }

        if (current !== 0) {
            elStatus.textContent = NAMES[current] + " is thinking...";
            timer = setTimeout(cpuMove, 1500);
        } else {
            elStatus.textContent = "Your turn! Pick a card from " + NAMES[offering];
        }
    }

    function cpuMove() {
        if (!active) return;
        const hand = players[offering];
        if (hand.length === 0) return;
        const idx = Math.floor(Math.random() * hand.length);
        pickCard(offering, idx);
    }

    function endGame() {
        active = false;
        let winner = players.findIndex(h => h.length > 0);
        const won = (winner === 0);
        
        if(won) {
            bank += 400; streak++;
            document.getElementById("ovTitle").textContent = "🎉 YOU WIN!";
            document.getElementById("ovMsg").textContent = "You held the Joker last!";
        } else {
            streak = 0;
            document.getElementById("ovTitle").textContent = "😅 YOU LOST";
            document.getElementById("ovMsg").textContent = NAMES[winner] + " won the pot!";
        }
        
        updateEco();
        elOverlay.classList.add("show");
    }

    function startGame() {
        if (bank < 100) { alert("Not enough coins!"); return; }
        bank -= 100; updateEco();
        elOverlay.classList.remove("show");
        active = true;
        
        const deck = buildDeck();
        deal(deck);
        for (let i = 0; i < 4; i++) players[i] = removePairs(players[i]);
        
        current = 0;
        offering = 1;
        updateTurn();
    }

    btnStart.onclick = startGame;

    document.getElementById("btnPeek").onclick = () => {
        if (!active || current !== 0) return;
        alert("You peeked! The opponents are now suspicious.");
    };

})();
