(() => {
    // --- Helper functions ---
    const toKebab = str =>
        str.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
    const debounce = (fn, delay = 16) => {
        let frame;
        return function (...args) {
            if (frame) cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => fn.apply(this, args));
        };
    };

    // --- LAZY AUDIO SOURCE LOADING ---
    function getAudioTemplateId(audio) {
        return audio.id ? `${audio.id}-sources` : null;
    }
    function ensureAudioSources(audio) {
        if (!audio || audio.dataset.sourcesLoaded) return;
        const templateId = getAudioTemplateId(audio);
        if (!templateId) return;
        const tpl = document.getElementById(templateId);
        if (tpl && tpl.content) {
            Array.from(tpl.content.children).forEach(source => {
                audio.appendChild(source.cloneNode(true));
            });
            audio.load();
            audio.dataset.sourcesLoaded = "true";
        }
    }

    // --- AUDIO PLAY PROMISE HANDLING ---
    const pendingPlayAudios = new Set();
    function tryPlayAudio(audio) {
        if (!audio) return;
        ensureAudioSources(audio);
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.then === "function") {
            playPromise.catch(err => {
                if (
                    err instanceof DOMException &&
                    err.name === "NotAllowedError"
                ) {
                    pendingPlayAudios.add(audio);
                }
            });
        }
    }
    function retryPendingAudios() {
        pendingPlayAudios.forEach(audio => {
            const playPromise = audio.play();
            if (playPromise && typeof playPromise.then === "function") {
                playPromise
                    .then(() => {
                        pendingPlayAudios.delete(audio);
                    })
                    .catch(() => {
                        // Still fails, keep in set
                    });
            } else {
                pendingPlayAudios.delete(audio);
            }
        });
    }
    document.addEventListener("click", retryPendingAudios);
    document.addEventListener("keydown", retryPendingAudios);

    // --- Checkbox: oncheckignore ---
    document
        .querySelectorAll('input[type="checkbox"][data-oncheckignore="true"]')
        .forEach(cb => {
            cb.addEventListener("change", function () {
                if (this.checked) {
                    this.setAttribute("tabindex", "-1");
                    this.blur();
                } else {
                    this.removeAttribute("tabindex");
                }
            });
        });

    // --- Checkbox: mirror ---
    setTimeout(() => {
        document
            .querySelectorAll('input[type="checkbox"][data-mirror]')
            .forEach(mirror => {
                const target = document.getElementById(
                    mirror.getAttribute("data-mirror")
                );
                if (target) {
                    mirror.checked = target.checked;
                    mirror.addEventListener("change", () => {
                        target.checked = mirror.checked;
                    });
                }
            });
    }, 50);

    // --- Checkbox: Enter toggles ---
    document.addEventListener("keydown", event => {
        const el = document.activeElement;
        if (el && el.type === "checkbox" && event.key === "Enter") {
            event.preventDefault();
            el.checked = !el.checked;
            el.dispatchEvent(new Event("change", { bubbles: true }));
        }
    });

    // --- DOMContentLoaded: all at once ---
    document.addEventListener("DOMContentLoaded", () => {
        // 1. Audio: industrial
        const audio = document.getElementById("industrial");
        if (audio) {
            audio.volume = 0.005;
            const playAudioOnce = () => {
                tryPlayAudio(audio);
                document.removeEventListener("click", playAudioOnce);
            };
            document.addEventListener("click", playAudioOnce);
        }

        // 2. Improv checkboxes: uncheck all
        document
            .querySelectorAll(".improv input[type='checkbox']")
            .forEach(cb => {
                cb.checked = false;
            });

        // 3. [data-distsound] logic
        const elements = document.querySelectorAll("[data-distsound]");
        const parsedConfigs = Array.from(elements).map(el => {
            const [selector, vol, dist] = el
                .getAttribute("data-distsound")
                .split(",")
                .map(x => x.trim());
            return {
                element: el,
                audio: document.querySelector(selector),
                maxVolume: parseFloat(vol),
                maxDistance: parseInt(dist)
            };
        });

        const updateVolume = e => {
            parsedConfigs.forEach(config => {
                if (!config.audio) return;
                ensureAudioSources(config.audio);
                const rect = config.element.getBoundingClientRect();
                const elX = rect.left + rect.width / 2;
                const elY = rect.top + rect.height / 2;
                const dx = e.clientX - elX,
                    dy = e.clientY - elY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > config.maxDistance) {
                    config.audio.volume = 0;
                } else {
                    const vol =
                        config.maxVolume *
                        (1 - distance / config.maxDistance);
                    config.audio.volume = Math.max(
                        0,
                        Math.min(config.maxVolume, vol)
                    );
                    if (config.audio.paused) tryPlayAudio(config.audio);
                }
            });
        };
        const muteAll = () => {
            parsedConfigs.forEach(config => {
                if (config.audio) config.audio.volume = 0;
            });
        };
        document.addEventListener("mousemove", updateVolume);
        document.addEventListener("mouseleave", muteAll);
        window.addEventListener("blur", muteAll);
    });

    // --- Visibility change: mute/unmute all audio/video ---
    document.addEventListener("visibilitychange", () => {
        document.querySelectorAll("audio, video").forEach(media => {
            if (document.hidden) {
                media.dataset.previousMuted = media.muted;
                media.muted = true;
            } else if (media.dataset.previousMuted === "false") {
                media.muted = false;
            }
        });
    });

    // --- isChecked utility ---
    window.isChecked = function (checkedFn, uncheckedFn) {
        const label = event.currentTarget;
        const checkboxId = label.getAttribute("for");
        if (!checkboxId) return;
        const checkbox = document.getElementById(checkboxId);
        if (!checkbox) return;
        (checkbox.checked ? checkedFn : uncheckedFn)();
    };

    // --- playsound utility (LAZY LOAD sources, robust play) ---
    window.playsound = function (selector, volume) {
        const audio = document.querySelector(selector);
        if (audio && audio.tagName.toLowerCase() === "audio") {
            ensureAudioSources(audio);
            if (typeof volume === "number") {
                audio.volume = Math.max(0, Math.min(1, volume));
            }
            audio.currentTime = 0;
            tryPlayAudio(audio);
        } else {
            console.warn("Audio element not found for selector:", selector);
        }
    };

    // --- Torn banner logic ---
    const internalNav = document.querySelector(".internal-nav");
    const tornBanner = document.getElementById("torn_edge_banner");
    function updateTornBanner() {
        if (internalNav && tornBanner) {
            tornBanner.style.display = internalNav.open ? "block" : "none";
        }
    }
    if (internalNav && tornBanner) {
        internalNav.addEventListener("toggle", updateTornBanner);
        updateTornBanner();
    }

    // --- Custom elements ---
    class AnimatedWire extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: "open" });
            this.svg = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "svg"
            );
            this.svg.setAttribute("data-type", "wire");
            this.svg.style.width = "100%";
            this.svg.style.height = "100%";
            this.path = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "path"
            );
            this.svg.appendChild(this.path);
            this.shadowRoot.appendChild(this.svg);
            this._phaseOffset = Math.random() * Math.PI * 2;
            this._speed = 0.7 + Math.random() * 0.6;
            this._animate = this._animate.bind(this);
        }
        static get observedAttributes() {
            return [
                "data-basesag",
                "data-amplitude",
                "data-width",
                "data-color",
                "data-speed"
            ];
        }
        attributeChangedCallback() {
            if (this.dataset.speed)
                this._speed = parseFloat(this.dataset.speed);
            this._animate();
        }
        connectedCallback() {
            if (this.dataset.speed)
                this._speed = parseFloat(this.dataset.speed);
            this._animate();
        }
        disconnectedCallback() {
            cancelAnimationFrame(this._raf);
        }
        _animate() {
            const width = this.clientWidth || 200;
            this.svg.setAttribute("width", width);
            this.svg.setAttribute("height", 100);
            const baseSag = parseFloat(this.dataset.basesag) || 30;
            const amplitude = parseFloat(this.dataset.amplitude) || 20;
            const strokeWidth = parseFloat(this.dataset.width) || 2;
            const strokeColor = this.dataset.color || "black";
            const now = performance.now() / 1000;
            const phase = now * this._speed + this._phaseOffset;
            const d = `M0,0 C ${width / 3},${baseSag +
                amplitude * Math.sin(phase)} ${(2 * width) / 3},${baseSag +
                amplitude * Math.cos(phase)} ${width},0`;
            this.path.setAttribute("d", d);
            this.path.setAttribute("stroke", strokeColor);
            this.path.setAttribute("stroke-width", strokeWidth);
            this.path.setAttribute("fill", "none");
            this._raf = requestAnimationFrame(this._animate);
        }
    }
    customElements.define("animated-wire", AnimatedWire);
    customElements.define("my-heading", class extends HTMLElement { });
    customElements.define("row-container", class extends HTMLElement { });

    // --- Remove #main hash ---
    if (window.location.hash === "#main") {
        history.replaceState(
            null,
            document.title,
            window.location.pathname + window.location.search
        );
    }
})();