/**
 * Agent24 TTS - Sintesi Vocale AI
 * Dark theme with orange accent waveform visualization
 */

class Agent24TTS {
    constructor() {
        this.apiUrl = window.TTS_API_URL || 'https://voice.agent24.it';
        this.audioContext = null;
        this.analyser = null;
        this.sourceNode = null;
        this.isPlaying = false;
        this.currentAudioUrl = null;
        this.animationId = null;

        // Timer state
        this.timerInterval = null;
        this.timerStartTime = null;

        this.initElements();
        this.initEvents();
        this.initAudioContext();
    }

    initElements() {
        this.textInput = document.getElementById('text-input');
        this.voiceDescription = document.getElementById('voice-description');
        this.languageSelect = document.getElementById('language-select');
        this.charCount = document.getElementById('char-count');
        this.charCounter = document.querySelector('.char-counter');
        this.generateBtn = document.getElementById('generate-btn');
        this.playerSection = document.getElementById('player-section');
        this.playBtn = document.getElementById('play-btn');
        this.playIcon = document.getElementById('play-icon');
        this.pauseIcon = document.getElementById('pause-icon');
        this.downloadBtn = document.getElementById('download-btn');
        this.audioPlayer = document.getElementById('audio-player');
        this.waveformCanvas = document.getElementById('waveform');
        this.progress = document.getElementById('progress');
        this.currentTimeEl = document.getElementById('current-time');
        this.durationEl = document.getElementById('duration');
        this.errorMessage = document.getElementById('error-message');

        // Timer elements
        this.generationTimer = document.getElementById('generation-timer');
        this.timerValue = document.getElementById('timer-value');
        this.timerContent = this.generationTimer.querySelector('.timer-content');

        this.canvasCtx = this.waveformCanvas.getContext('2d');
    }

    initEvents() {
        this.textInput.addEventListener('input', () => this.updateCharCount());
        this.generateBtn.addEventListener('click', () => this.generateSpeech());
        this.playBtn.addEventListener('click', () => this.togglePlay());
        this.downloadBtn.addEventListener('click', () => this.downloadAudio());

        this.audioPlayer.addEventListener('timeupdate', () => this.updateProgress());
        this.audioPlayer.addEventListener('loadedmetadata', () => this.updateDuration());
        this.audioPlayer.addEventListener('ended', () => this.onAudioEnded());
        this.audioPlayer.addEventListener('play', () => this.onPlay());
        this.audioPlayer.addEventListener('pause', () => this.onPause());

        // Allow textarea typing without triggering shortcuts
        document.querySelectorAll('textarea').forEach(textarea => {
            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) return;
                e.stopPropagation();
            });
        });

        // Ctrl+Enter to generate
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.generateSpeech();
            }
        });

        // Canvas resize
        window.addEventListener('resize', () => this.resizeCanvas());
        this.resizeCanvas();
    }

    initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }

    connectAudioSource() {
        if (!this.audioContext || !this.analyser) return;
        if (!this.sourceNode) {
            this.sourceNode = this.audioContext.createMediaElementSource(this.audioPlayer);
            this.sourceNode.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
        }
    }

    updateCharCount() {
        const count = this.textInput.value.length;
        this.charCount.textContent = count;
        if (this.charCounter) {
            this.charCounter.classList.toggle('warning', count > 500);
        }
    }

    async generateSpeech() {
        const text = this.textInput.value.trim();
        const voiceDescription = this.voiceDescription.value.trim() || 'Una voce naturale e chiara';
        const language = this.languageSelect.value;

        if (!text) {
            this.showError('Inserisci del testo da convertire in voce.');
            return;
        }

        if (text.length > 500) {
            this.showError('Il testo non può superare i 500 caratteri.');
            return;
        }

        this.hideError();
        this.setLoading(true);
        this.startTimer();

        try {
            const response = await fetch(`${this.apiUrl}/synthesize/design`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voice_description: voiceDescription, language }),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || `Errore server: ${response.status}`);
            }

            const audioBlob = await response.blob();

            // Stop timer as soon as we have the full response
            this.stopTimer();

            if (audioBlob.size === 0) {
                throw new Error('Il server ha restituito un audio vuoto. Riprova.');
            }

            const audioUrl = URL.createObjectURL(audioBlob);

            if (this.currentAudioUrl) {
                URL.revokeObjectURL(this.currentAudioUrl);
            }

            this.audioPlayer.src = audioUrl;
            this.currentAudioUrl = audioUrl;
            this.playerSection.classList.remove('hidden');

            if (this.audioContext && this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            this.connectAudioSource();
            this.audioPlayer.play();

        } catch (error) {
            this.stopTimer(true);
            console.error('TTS Error:', error);

            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                this.showError('Impossibile raggiungere il server. Verifica che il servizio TTS sia attivo.');
            } else {
                this.showError(error.message || 'Errore nella generazione audio. Riprova.');
            }
        } finally {
            this.setLoading(false);
        }
    }

    togglePlay() {
        if (!this.audioPlayer.src) return;
        if (this.audioPlayer.paused) {
            this.audioPlayer.play();
        } else {
            this.audioPlayer.pause();
        }
    }

    onPlay() {
        this.isPlaying = true;
        this.playIcon.classList.add('hidden');
        this.pauseIcon.classList.remove('hidden');
        this.startVisualization();
    }

    onPause() {
        this.isPlaying = false;
        this.playIcon.classList.remove('hidden');
        this.pauseIcon.classList.add('hidden');
    }

    onAudioEnded() {
        this.isPlaying = false;
        this.playIcon.classList.remove('hidden');
        this.pauseIcon.classList.add('hidden');
        this.progress.style.width = '0%';
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.drawIdleWaveform();
    }

    updateProgress() {
        const { currentTime, duration } = this.audioPlayer;
        if (duration) {
            this.progress.style.width = `${(currentTime / duration) * 100}%`;
            this.currentTimeEl.textContent = this.formatTime(currentTime);
        }
    }

    updateDuration() {
        this.durationEl.textContent = this.formatTime(this.audioPlayer.duration);
    }

    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    downloadAudio() {
        if (!this.currentAudioUrl) return;
        const a = document.createElement('a');
        a.href = this.currentAudioUrl;
        a.download = 'agent24-tts-audio.wav';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    resizeCanvas() {
        const container = this.waveformCanvas.parentElement;
        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();

        this.waveformCanvas.width = rect.width * dpr;
        this.waveformCanvas.height = rect.height * dpr;
        this.waveformCanvas.style.width = rect.width + 'px';
        this.waveformCanvas.style.height = rect.height + 'px';

        this.canvasCtx.scale(dpr, dpr);
        this.displayWidth = rect.width;
        this.displayHeight = rect.height;

        if (!this.isPlaying) {
            this.drawIdleWaveform();
        }
    }

    drawIdleWaveform() {
        const w = this.displayWidth || this.waveformCanvas.width;
        const h = this.displayHeight || this.waveformCanvas.height;
        const ctx = this.canvasCtx;

        ctx.clearRect(0, 0, w, h);

        const centerY = h / 2;
        const barCount = 60;
        const barWidth = 3;
        const gap = (w - barCount * barWidth) / (barCount - 1);

        for (let i = 0; i < barCount; i++) {
            const x = i * (barWidth + gap);
            // Gentle sine wave for idle state
            const amplitude = 4 + Math.sin(i * 0.15) * 6 + Math.sin(i * 0.08 + 1) * 4;

            ctx.fillStyle = 'rgba(255, 140, 4, 0.15)';
            ctx.beginPath();
            ctx.roundRect(x, centerY - amplitude, barWidth, amplitude * 2, 1.5);
            ctx.fill();
        }
    }

    startVisualization() {
        if (!this.analyser) {
            this.drawIdleWaveform();
            return;
        }

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            if (!this.isPlaying) {
                this.drawIdleWaveform();
                return;
            }

            this.animationId = requestAnimationFrame(draw);
            this.analyser.getByteFrequencyData(dataArray);

            const w = this.displayWidth || this.waveformCanvas.width;
            const h = this.displayHeight || this.waveformCanvas.height;
            const ctx = this.canvasCtx;

            ctx.clearRect(0, 0, w, h);

            const centerY = h / 2;
            const barCount = 60;
            const barWidth = 3;
            const gap = (w - barCount * barWidth) / (barCount - 1);
            const step = Math.floor(bufferLength / barCount);

            for (let i = 0; i < barCount; i++) {
                const x = i * (barWidth + gap);
                const dataIdx = i * step;
                const value = dataArray[dataIdx] || 0;
                const normalizedHeight = (value / 255) * (h * 0.8);
                const barHeight = Math.max(normalizedHeight, 3);

                // Gradient from orange core to dimmer edges
                const intensity = value / 255;
                const alpha = 0.2 + intensity * 0.8;

                // Draw reflection (bottom half, dimmer)
                ctx.fillStyle = `rgba(255, 140, 4, ${alpha * 0.3})`;
                ctx.beginPath();
                ctx.roundRect(x, centerY, barWidth, barHeight / 2, 1.5);
                ctx.fill();

                // Draw main bar (top half, brighter)
                ctx.fillStyle = `rgba(255, 140, 4, ${alpha})`;
                ctx.beginPath();
                ctx.roundRect(x, centerY - barHeight / 2, barWidth, barHeight / 2, 1.5);
                ctx.fill();

                // Glow on active bars
                if (intensity > 0.5) {
                    ctx.fillStyle = `rgba(255, 160, 51, ${(intensity - 0.5) * 0.4})`;
                    ctx.beginPath();
                    ctx.roundRect(x - 1, centerY - barHeight / 2 - 1, barWidth + 2, barHeight / 2 + 2, 2);
                    ctx.fill();
                }
            }
        };

        draw();
    }

    // ── Timer Methods ──────────────────────────────

    startTimer() {
        // Reset previous timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        this.timerStartTime = performance.now();
        this.generationTimer.classList.remove('hidden');
        this.timerContent.classList.remove('completed');
        this.timerValue.textContent = '0.0s';

        // Update every 100ms for smooth counting
        this.timerInterval = setInterval(() => {
            const elapsed = (performance.now() - this.timerStartTime) / 1000;
            this.timerValue.textContent = this.formatTimer(elapsed);
        }, 100);
    }

    stopTimer(isError = false) {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        if (this.timerStartTime) {
            const elapsed = (performance.now() - this.timerStartTime) / 1000;
            this.timerValue.textContent = this.formatTimer(elapsed);

            if (!isError) {
                this.timerContent.classList.add('completed');
            }

            this.timerStartTime = null;
            console.log(`[Agent24 TTS] Tempo di generazione: ${this.formatTimer(elapsed)}`);
        }

        if (isError) {
            // Hide timer on error after a short delay
            setTimeout(() => {
                this.generationTimer.classList.add('hidden');
            }, 3000);
        }
    }

    formatTimer(seconds) {
        if (seconds < 60) {
            return `${seconds.toFixed(1)}s`;
        }
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs.toFixed(1)}s`;
    }

    setLoading(loading) {
        this.generateBtn.classList.toggle('loading', loading);
        this.generateBtn.disabled = loading;
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorMessage.classList.remove('hidden');
    }

    hideError() {
        this.errorMessage.classList.add('hidden');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.agent24TTS = new Agent24TTS();
});
