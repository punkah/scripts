// ==UserScript==
// @name         6 Nimmt Card Tracker (Mobile Friendly + Zoomable)
// @namespace    http://tampermonkey.net/
// @version      2.5
// @description  Tracks played cards in 6 nimmt! Now mobile-friendly, draggable, resizable, and zoomable with pinch or mouse wheel.
// @author       You
// @match        *://boardgamearena.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let totalCards = [];
    let playedCards = new Set();
    let detectedStartingCards = false;
    let uiDiv = null;
    let scale = 1;  // Initial zoom level

    function detectGameMode() {
        let tacticsMode = document.querySelector("#footer_option_value_100")?.innerText.includes("Tactics");
        let numPlayers = document.querySelectorAll("#player_boards > div").length;

        if (tacticsMode) {
            totalCards = Array.from({ length: 10 * numPlayers + 4 }, (_, i) => i + 1);
        } else {
            totalCards = Array.from({ length: 104 }, (_, i) => i + 1);
        }
    }

    function updateUI() {
        if (!uiDiv) return;

        let gridSize = 5;
        let displayArray = [];

        for (let i = -1; i < totalCards.length; i++) {
            let card = i === -1 ? -1 : totalCards[i];
            displayArray.push(playedCards.has(card) || card === -1 ? "  " : card.toString().padStart(2, ' '));
        }

        let formattedRows = [];
        for (let i = 0; i < displayArray.length; i += gridSize) {
            formattedRows.push(displayArray.slice(i, i + gridSize).join(' '));
        }

        document.getElementById('availableCards').innerHTML = formattedRows.join('<br>');
    }

    function resetGame() {
        playedCards.clear();
        detectedStartingCards = false;
        detectGameMode();
        updateUI();
    }

    function processLog(logText) {
        let match = logText.match(/places (\d+) /);
        if (match) {
            let cardNumber = parseInt(match[1]);
            if (!isNaN(cardNumber)) {
                playedCards.add(cardNumber);
                updateUI();
            }
        }

        if (!detectedStartingCards && logText.includes("placed on the table")) {
            let cardMatches = logText.match(/\d+/g);
            if (cardMatches) {
                cardMatches.forEach(card => playedCards.add(parseInt(card)));
                detectedStartingCards = true;
                updateUI();
            }
        }

        if (logText.includes("A new round starts")) {
            resetGame();
        }
    }

    function checkForLogs() {
        const logContainer = document.querySelector("#logs");

        if (logContainer) {
            if (!uiDiv) {
                createUI();
                observer.observe(logContainer, { childList: true, subtree: true });
            }
        } else {
            if (uiDiv) {
                uiDiv.remove();
                uiDiv = null;
            }
        }
    }

    function createUI() {
        if (uiDiv) return;

        uiDiv = document.createElement('div');
        uiDiv.style.position = 'fixed';
        uiDiv.style.width = '200px';
        uiDiv.style.height = 'auto';
        uiDiv.style.overflowY = 'auto';
        uiDiv.style.background = 'rgba(0, 0, 0, 0.8)';
        uiDiv.style.color = 'white';
        uiDiv.style.padding = '5px';
        uiDiv.style.border = '2px solid white';
        uiDiv.style.borderRadius = '8px';
        uiDiv.style.zIndex = '1000';
        uiDiv.style.cursor = 'grab';
        uiDiv.style.transform = `scale(${scale})`;
        uiDiv.style.transformOrigin = 'top left';

        uiDiv.innerHTML = `
            <h3 style="margin: 0; padding: 5px; text-align: center; font-size: 14px;">Available</h3>
            <div id="availableCards" style="font-family: monospace; white-space: pre;"></div>
        `;

        document.body.appendChild(uiDiv);

        // Load saved position & scale
        let savedSettings = JSON.parse(localStorage.getItem("trackerSettings") || "{}");
        if (savedSettings.left) uiDiv.style.left = `${savedSettings.left}px`;
        if (savedSettings.top) uiDiv.style.top = `${savedSettings.top}px`;
        if (savedSettings.scale) setScale(savedSettings.scale);

        makeDraggable(uiDiv);
        makeZoomable(uiDiv);
        updateUI();
    }

    function makeDraggable(element) {
        let isDragging = false;
        let offsetX, offsetY;

        function startDrag(event) {
            isDragging = true;
            let touch = event.touches ? event.touches[0] : event;
            offsetX = touch.clientX - element.getBoundingClientRect().left;
            offsetY = touch.clientY - element.getBoundingClientRect().top;
            element.style.cursor = "grabbing";
            event.preventDefault();
        }

        function moveDrag(event) {
            if (!isDragging) return;
            let touch = event.touches ? event.touches[0] : event;
            let left = touch.clientX - offsetX;
            let top = touch.clientY - offsetY;

            element.style.left = `${left}px`;
            element.style.top = `${top}px`;
            element.style.bottom = "auto";
            element.style.right = "auto";

            saveSettings();
        }

        function endDrag() {
            isDragging = false;
            element.style.cursor = "grab";
        }

        element.addEventListener("mousedown", startDrag);
        element.addEventListener("touchstart", startDrag);

        document.addEventListener("mousemove", moveDrag);
        document.addEventListener("touchmove", moveDrag);

        document.addEventListener("mouseup", endDrag);
        document.addEventListener("touchend", endDrag);
    }

    function makeZoomable(element) {
        element.addEventListener("wheel", (event) => {
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                let zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
                setScale(scale * zoomFactor);
            }
        });

        let lastTouchDistance = null;
        element.addEventListener("touchmove", (event) => {
            if (event.touches.length === 2) {
                let touch1 = event.touches[0];
                let touch2 = event.touches[1];

                let currentDistance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );

                if (lastTouchDistance) {
                    let zoomFactor = currentDistance / lastTouchDistance;
                    setScale(scale * zoomFactor);
                }

                lastTouchDistance = currentDistance;
                event.preventDefault();
            }
        });

        element.addEventListener("touchend", () => {
            lastTouchDistance = null;
        });
    }

    function setScale(newScale) {
        scale = Math.max(0.5, Math.min(newScale, 2));  // Limit zoom range
        uiDiv.style.transform = `scale(${scale})`;
        saveSettings();
    }

    function saveSettings() {
        let settings = {
            left: parseFloat(uiDiv.style.left) || 10,
            top: parseFloat(uiDiv.style.top) || 30,
            scale: scale
        };
        localStorage.setItem("trackerSettings", JSON.stringify(settings));
    }

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE) return;
                    processLog(node.innerText || "");
                });
            }
        });
    });

    detectGameMode();
    checkForLogs();
    setInterval(checkForLogs, 2000);
})();
