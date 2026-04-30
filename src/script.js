<script>
        const WS_PORT = 8081;
        let txSocket = null;
        let isTransmitting = false;

        let audioContext;
        let micStream;
        let scriptProcessor;
        let micReady = false;
        let micInitInProgress = false; 
        
        let rxNextPlayTime = 0; 
        let lastProfileName = "";
        
        // Zmienna do zapamiętywania stanu przed TX
        window.preTxVolume = null;
        
        // Zmienna do wskaźnika mikrofonu
        window.vuLevel = 0;

        window.updateRadioSetting = function(cmd, payload) {
            if (txSocket && txSocket.readyState === WebSocket.OPEN) {
                txSocket.send(JSON.stringify(Object.assign({ cmd: cmd }, payload)));
            }
        };

        window.toggleRxAudio = function(state) {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
            }
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
            if (txSocket && txSocket.readyState === WebSocket.OPEN) {
                txSocket.send(JSON.stringify({ cmd: state ? "start_rx_audio" : "stop_rx_audio" }));
            }
        };

        window.toggleMon = function(state) {
            let moVal = state ? 1 : 0;
            updateRadioSetting('set_monitor', { val: moVal });
        };

        window.syncAllSettings = function() {
            if (!txSocket || txSocket.readyState !== WebSocket.OPEN) return;
            
            let power = parseInt(document.getElementById('tx-power').value);
            let ctcss = parseFloat(document.getElementById('tx-ctcss').value);
            let dcs = parseInt(document.getElementById('tx-dcs').value);
            
            updateRadioSetting('set_power', {val: power});
            updateRadioSetting('set_ctcss', {val: ctcss});
            updateRadioSetting('set_dcs', {val: dcs});
            
            console.log("[TX Plugin] Zsynchronizowano ustawienia startowe z radiem (Power, CTCSS, DCS).");
            window.updateSettingsSummary();
        };

        window.toggleAdvancedSettings = function() {
            let advPanel = document.getElementById('tx-advanced-settings');
            if (advPanel.style.display === 'none') {
                advPanel.style.display = 'flex';
            } else {
                advPanel.style.display = 'none';
            }
        };

        window.updateSettingsSummary = function() {
            let summaryBtn = document.getElementById('tx-settings-toggle');
            if (!summaryBtn) return;

            let pwrSel = document.getElementById('tx-power');
            let pwrTxt = pwrSel ? pwrSel.options[pwrSel.selectedIndex].text : "Max";

            let ctcssSel = document.getElementById('tx-ctcss');
            let ctcssTxt = (ctcssSel && ctcssSel.value !== "0") ? `CTCSS: ${ctcssSel.value}` : "CTCSS: OFF";

            let dcsSel = document.getElementById('tx-dcs');
            let dcsTxt = (dcsSel && dcsSel.value !== "0") ? `DCS: ${dcsSel.value}` : "DCS: OFF";

            let shiftDir = document.getElementById('tx-off-dir');
            let shiftVal = document.getElementById('tx-off-val');
            let shiftTxt = "Simplex";
            
            if (shiftDir && shiftVal && shiftDir.value !== "0") {
                let sign = shiftDir.value === "1" ? "+" : "-";
                shiftTxt = `Shift: ${sign}${parseFloat(shiftVal.value).toFixed(2)} MHz`;
            }

            summaryBtn.innerHTML = `⚙️ TX: ${pwrTxt} | ${ctcssTxt} | ${dcsTxt} | ${shiftTxt}`;
        };

        // --- RYSOWANIE WIDMA W PRZYCISKU ---
        window.micAnalyser = null;
        window.drawSpectrum = function() {
            if (!window.micAnalyser) return;
            requestAnimationFrame(window.drawSpectrum);

            let canvas = document.getElementById('ptt-spectrum');
            if (!canvas) return;
            let ctx = canvas.getContext('2d');

            if (canvas.width !== canvas.offsetWidth) canvas.width = canvas.offsetWidth;
            if (canvas.height !== canvas.offsetHeight) canvas.height = canvas.offsetHeight;

            let bufferLength = window.micAnalyser.frequencyBinCount; 
            let dataArray = new Uint8Array(bufferLength);
            window.micAnalyser.getByteFrequencyData(dataArray); 

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            let barWidth = (canvas.width / bufferLength) * 2.5;
            let barHeight;
            let x = 0;

            for(let i = 0; i < bufferLength; i++) {
                barHeight = (dataArray[i] / 255) * canvas.height;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; 
                ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                x += barWidth + 1;
            }
        };

        function createTxPanel() {
            if (document.getElementById('tx-panel')) {
                document.getElementById('tx-panel').remove();
            }

            let panel = document.createElement('div');
            panel.id = 'tx-panel';
            Object.assign(panel.style, {
                position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
                backgroundColor: 'rgba(30, 30, 30, 0.95)', color: '#fff', padding: '15px 25px',
                borderRadius: '12px', display: 'flex', flexDirection: 'column', width: 'auto',
                minWidth: '600px', zIndex: '9998', fontFamily: 'Arial, sans-serif', fontSize: '14px',
                border: '1px solid #555', boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
                userSelect: 'none', WebkitUserSelect: 'none'
            });

            const ctcssTones = [0, 67.0, 69.3, 71.9, 74.4, 77.0, 79.7, 82.5, 85.4, 88.5, 91.5, 94.8, 97.4, 100.0, 103.5, 107.2, 110.9, 114.8, 118.8, 123.0, 127.3, 131.8, 136.5, 141.3, 146.2, 151.4, 156.7, 162.2, 167.9, 173.8, 179.9, 186.2, 192.8, 203.5, 210.7, 218.1, 225.7, 233.6, 241.8, 250.3];
            const dcsCodes = [0, 23, 25, 26, 31, 32, 43, 47, 51, 54, 65, 71, 72, 73, 74, 114, 115, 116, 125, 131, 132, 134, 143, 152, 155, 156, 162, 165, 172, 174, 205, 223, 226, 243, 244, 245, 251, 261, 263, 265, 271, 306, 311, 315, 331, 343, 346, 351, 364, 365, 371, 411, 412, 413, 423, 431, 432, 445, 464, 465, 466, 503, 506, 516, 532, 546, 565, 606, 612, 624, 627, 631, 632, 654, 662, 664, 703, 712, 723, 731, 732, 734, 743, 754];

            let ctcssOptions = ctcssTones.map(t => `<option value="${t}">${t === 0 ? 'OFF' : t.toFixed(1) + ' Hz'}</option>`).join('');
            let dcsOptions = dcsCodes.map(c => `<option value="${c}">${c === 0 ? 'OFF' : 'DCS ' + String(c).padStart(3, '0')}</option>`).join('');

            panel.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:20px; width:100%;">
                    <button id="tx-settings-toggle" onclick="window.toggleAdvancedSettings()" style="background:#444; color:#fff; border:1px solid #666; padding:8px 12px; border-radius:5px; cursor:pointer; font-size:13px; text-align:left; flex-grow:1; transition: background 0.2s;">
                        ⚙️ Ładowanie ustawień...
                    </button>
                    
                    <div style="display:flex; gap:10px; align-items:center;">
                        <label style="color:#aaa; margin-right:5px;">AIOC:</label>
                        <label style="display:flex; align-items:center; gap:5px; cursor:pointer; background:#444; padding:6px 12px; border-radius:5px;">
                            <input type="checkbox" id="rx-audio-toggle" onchange="window.toggleRxAudio(this.checked)" style="transform: scale(1.2);">
                            Głośnik
                        </label>
                        <label style="display:flex; align-items:center; gap:5px; cursor:pointer; background:#8b0000; padding:6px 12px; border-radius:5px;" title="Otwiera Squelch na stałe">
                            <input type="checkbox" id="mon-toggle" onchange="window.toggleMon(this.checked)" style="transform: scale(1.2);">
                            MON
                        </label>
                    </div>
                </div>

                <div id="tx-advanced-settings" style="display:none; justify-content: space-between; gap:15px; margin-top:15px; padding-top:15px; border-top:1px solid #555;">
                    <div style="display:flex; flex-direction:column; gap:5px;">
                        <label>Moc (TX)</label>
                        <select id="tx-power" onchange="window.updateRadioSetting('set_power', {val: parseInt(this.value)}); window.updateSettingsSummary();" style="padding:5px; border-radius:5px; color:black;">
                            <option value="0">Low</option><option value="1">Low-Mid</option><option value="2">Mid</option><option value="3">Mid-High</option><option value="4" selected>Max</option>
                        </select>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:5px;">
                        <label>CTCSS</label>
                        <select id="tx-ctcss" onchange="window.updateRadioSetting('set_ctcss', {val: parseFloat(this.value)}); window.updateSettingsSummary();" style="padding:5px; border-radius:5px; color:black;">${ctcssOptions}</select>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:5px;">
                        <label>DCS</label>
                        <select id="tx-dcs" onchange="window.updateRadioSetting('set_dcs', {val: parseInt(this.value)}); window.updateSettingsSummary();" style="padding:5px; border-radius:5px; color:black;">${dcsOptions}</select>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:5px;">
                        <label>Shift przemiennika</label>
                        <div style="display:flex; gap:5px; align-items:center;">
                            <select id="tx-off-dir" onchange="window.updateSettingsSummary();" style="padding:5px; border-radius:5px; color:black;">
                                <option value="0">x</option><option value="1">+</option><option value="2">-</option>
                            </select>
                            <input type="number" id="tx-off-val" value="0.00" step="0.01" style="padding:5px; border-radius:5px; width:70px; color:black;" onchange="window.updateSettingsSummary();" oninput="window.updateSettingsSummary();">
                            <span style="font-size: 12px;">MHz</span>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(panel);
            
            window.updateSettingsSummary();
        }

        async function initMicrophone() {
            try {
                micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }});
                
                if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
                let source = audioContext.createMediaStreamSource(micStream);
                
                window.micAnalyser = audioContext.createAnalyser();
                window.micAnalyser.fftSize = 64; 
                
                scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
                
                source.connect(window.micAnalyser);
                window.micAnalyser.connect(scriptProcessor);
                scriptProcessor.connect(audioContext.destination);

                scriptProcessor.onaudioprocess = function(e) {
                    if (!isTransmitting || !txSocket || txSocket.readyState !== WebSocket.OPEN) return;
                    let inputData = e.inputBuffer.getChannelData(0);
                    let int16Data = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        let s = Math.max(-1, Math.min(1, inputData[i]));
                        int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                    }
                    txSocket.send(int16Data.buffer);
                };

                micReady = true;
                micInitInProgress = false;
                
                let btnTxt = document.getElementById('ptt-text');
                let btn = document.getElementById('ptt-button');
                if (btnTxt && btn) { 
                    btnTxt.innerText = "Gotowy! Wciśnij PTT"; 
                    btn.style.backgroundColor = "#4CAF50"; 
                }
                
                requestAnimationFrame(window.drawSpectrum);
                
            } catch (err) {
                console.error("Błąd dostępu do mikrofonu!", err);
                micInitInProgress = false;
                let btnTxt = document.getElementById('ptt-text');
                let btn = document.getElementById('ptt-button');
                if (btnTxt && btn) { 
                    btnTxt.innerText = "Błąd mikrofonu!"; 
                    btn.style.backgroundColor = "#f44336"; 
                }
            }
        }

        function getActiveProfile() {
            let currentFreq = 0, currentMod = "FM";
            let hash = window.location.hash;
            if (hash) {
                let freqMatch = hash.match(/freq=([0-9]+)/);
                if (freqMatch) currentFreq = parseInt(freqMatch[1]);
                let modMatch = hash.match(/mod=([a-zA-Z0-9]+)/);
                if (modMatch) currentMod = modMatch[1].toUpperCase();
            }
            if (currentFreq === 0) {
                try {
                    if (typeof receiver !== 'undefined') {
                        currentFreq = receiver.center_frequency + receiver.offset_frequency;
                        currentMod = receiver.demodulator ? receiver.demodulator.toUpperCase() : "FM";
                    }
                } catch (e) {}
            }
            if (currentFreq === 0) currentFreq = 145000000;
            return { freq: currentFreq, mod: currentMod };
        }

        function setTxState(state) {
            if (!txSocket || txSocket.readyState !== WebSocket.OPEN) return;

            if (!micReady) {
                if (state === true && !micInitInProgress) {
                    micInitInProgress = true;
                    let btnTxt = document.getElementById('ptt-text');
                    let btn = document.getElementById('ptt-button');
                    if(btnTxt && btn) { 
                        btn.style.backgroundColor = "#ff9800"; 
                        btnTxt.innerText = "Zezwól na mikrofon..."; 
                    }
                    initMicrophone();
                }
                return; 
            }

            if (state === isTransmitting) return;

            isTransmitting = state;
            
            let btnTxt = document.getElementById('ptt-text');
            let btn = document.getElementById('ptt-button');
            let volSlider = document.getElementById('openwebrx-panel-volume');

            let profile = getActiveProfile();
            let baseFreq = profile.freq; 

            if (isTransmitting) {
                if(btnTxt && btn) { 
                    btn.style.backgroundColor = "red"; 
                    btnTxt.innerText = "NADAWANIE (TX)"; 
                }
                
                // Wyciszenie audio przy nadawaniu
                if (volSlider) {
                    window.preTxVolume = volSlider.value;
                    volSlider.value = 0; 
                    if (typeof UI !== 'undefined' && UI.setVolume) UI.setVolume(0);
                }
                
                let shiftDir = parseInt(document.getElementById('tx-off-dir').value);
                let shiftValMHz = parseFloat(document.getElementById('tx-off-val').value);
                let shiftHz = Math.round(shiftValMHz * 1000000); 
                let txFreq = baseFreq;
                
                if (shiftDir === 1) {
                    txFreq += shiftHz; 
                } else if (shiftDir === 2) {
                    txFreq -= shiftHz; 
                }
                
                txSocket.send(JSON.stringify({ cmd: "start_tx", freq: txFreq, mod: profile.mod }));
            } else {
                if(btnTxt && btn) { 
                    btn.style.backgroundColor = "#4CAF50"; 
                    btnTxt.innerText = "Gotowy! Wciśnij PTT"; 
                }
                
                // Przywracanie audio po nadawaniu
                if (volSlider && window.preTxVolume !== null) {
                    volSlider.value = window.preTxVolume; 
                    if (typeof UI !== 'undefined' && UI.setVolume) UI.setVolume(window.preTxVolume); 
                    window.preTxVolume = null;
                }

                txSocket.send(JSON.stringify({ cmd: "stop_tx" }));
                
                // Przestrojenie spowrotem po 150ms
                setTimeout(() => {
                    if (txSocket && txSocket.readyState === WebSocket.OPEN) {
                        txSocket.send(JSON.stringify({ cmd: "set_freq", freq: baseFreq }));
                    }
                }, 150);

                // --- NOWOŚĆ: Błyskawiczna naprawa koloru wodospadu OpenWebRX ---
                // Czekamy 800ms aż radio całkiem przestanie nadawać, a bufor FFT się oczyści
                // Wtedy wymuszamy na OpenWebRX natychmiastowe przeliczenie skali kolorów (zabija "czerwone echo")
                setTimeout(() => {
                    if (typeof Waterfall !== 'undefined' && typeof Waterfall.setAutoRange === 'function') {
                        Waterfall.setAutoRange();
                        console.log("[TX Plugin] Wymuszono twardy reset kolorów wodospadu po TX.");
                    }
                }, 800);
            }
        }

        function createPttButton() {
            if (document.getElementById('ptt-button')) {
                document.getElementById('ptt-button').remove();
            }

            let btn = document.createElement("button");
            btn.id = "ptt-button"; 
            
            btn.innerHTML = `
                <canvas id="ptt-spectrum" style="position:absolute; top:0; left:0; width:100%; height:100%; border-radius:10px; pointer-events:none;"></canvas>
                <span id="ptt-text" style="position:relative; z-index:1; text-shadow: 1px 1px 3px rgba(0,0,0,0.8);">🎤 Kliknij, aby aktywować mikrofon</span>
            `;
            
            Object.assign(btn.style, {
                position: "fixed", bottom: "20px", left: "50%", transform: "translateX(-50%)", padding: "15px 40px",
                fontSize: "20px", fontWeight: "bold", color: "white", backgroundColor: "#2196F3", 
                border: "none", borderRadius: "10px", cursor: "pointer", zIndex: "9999",
                boxShadow: "0px 4px 6px rgba(0,0,0,0.3)", userSelect: "none", touchAction: "none",
                overflow: "hidden" 
            });
            
            btn.addEventListener("mousedown", (e) => { e.preventDefault(); setTxState(true); });
            btn.addEventListener("mouseup", (e) => { e.preventDefault(); setTxState(false); });
            btn.addEventListener("mouseleave", (e) => { e.preventDefault(); setTxState(false); });
            btn.addEventListener("touchstart", (e) => { e.preventDefault(); setTxState(true); }, {passive: false});
            btn.addEventListener("touchend", (e) => { e.preventDefault(); setTxState(false); }, {passive: false});
            document.body.appendChild(btn);
        }

        document.addEventListener("keydown", (e) => { if (e.keyCode === 32 && e.target.tagName !== "INPUT" && e.target.tagName !== "SELECT") { e.preventDefault(); setTxState(true); } });
        document.addEventListener("keyup", (e) => { if (e.keyCode === 32 && e.target.tagName !== "INPUT" && e.target.tagName !== "SELECT") { e.preventDefault(); setTxState(false); } });

        window.applyProfileSettings = function() {
            try {
                let profileName = "";
                
                let profileSelect = document.getElementById("openwebrx-sdr-profiles-listbox");
                if (profileSelect && profileSelect.selectedIndex >= 0) {
                    profileName = profileSelect.options[profileSelect.selectedIndex].text;
                }
                
                if (!profileName) {
                    let hashMatch = window.location.hash.match(/profile=([^&]+)/);
                    if (hashMatch) {
                        profileName = decodeURIComponent(hashMatch[1]);
                    }
                }

                if (profileName && profileName !== lastProfileName) {
                    console.log("[TX Plugin] Zmiana profilu! Odczytano:", profileName);
                    lastProfileName = profileName; 
                    
                    let parts = profileName.split(';');
                    
                    if (parts.length >= 3) {
                        let ctcssVal = parseFloat(parts[1]);
                        let shiftRaw = parseFloat(parts[2]); 
                        
                        let ctcssSelect = document.getElementById('tx-ctcss');
                        if (ctcssSelect && !isNaN(ctcssVal)) {
                            let found = false;
                            for (let i = 0; i < ctcssSelect.options.length; i++) {
                                if (parseFloat(ctcssSelect.options[i].value) === ctcssVal) {
                                    ctcssSelect.selectedIndex = i;
                                    found = true;
                                    break;
                                }
                            }
                            if (!found) {
                                let opt = document.createElement('option');
                                opt.value = ctcssVal;
                                opt.innerHTML = ctcssVal + " Hz";
                                ctcssSelect.appendChild(opt);
                                ctcssSelect.value = ctcssVal;
                            }
                            window.updateRadioSetting('set_ctcss', {val: ctcssVal});
                        }

                        let shiftDirSelect = document.getElementById('tx-off-dir');
                        let shiftValInput = document.getElementById('tx-off-val');
                        
                        if (shiftDirSelect && shiftValInput && !isNaN(shiftRaw)) {
                            if (shiftRaw < 0) {
                                shiftDirSelect.value = "2"; 
                                shiftValInput.value = Math.abs(shiftRaw).toFixed(2); 
                            } else if (shiftRaw > 0) {
                                shiftDirSelect.value = "1"; 
                                shiftValInput.value = shiftRaw.toFixed(2);
                            } else {
                                shiftDirSelect.value = "0"; 
                                shiftValInput.value = "0.00";
                            }
                        }
                    } else {
                        let shiftDirSelect = document.getElementById('tx-off-dir');
                        let shiftValInput = document.getElementById('tx-off-val');
                        let ctcssSelect = document.getElementById('tx-ctcss');
                        let dcsSelect = document.getElementById('tx-dcs');

                        if (shiftDirSelect) shiftDirSelect.value = "0";
                        if (shiftValInput) shiftValInput.value = "0.00";
                        
                        if (ctcssSelect) {
                            ctcssSelect.value = "0"; 
                            window.updateRadioSetting('set_ctcss', {val: 0});
                        }
                        
                        if (dcsSelect) {
                            dcsSelect.value = "0";
                            window.updateRadioSetting('set_dcs', {val: 0});
                        }
                    }
                    
                    window.updateSettingsSummary();
                }
            } catch(e) {
                console.error("[TX Plugin] Błąd przy parsowaniu profilu:", e);
            }
        };

        window.addEventListener("hashchange", () => {
            let profile = getActiveProfile();
            console.log("[TX Plugin] Wykryto zmianę częstotliwości w hash na:", profile.freq);
            window.updateRadioSetting("set_freq", { freq: profile.freq });
            
            setTimeout(window.applyProfileSettings, 300); 
        });

        document.addEventListener('click', function(e) {
            if (e.target && (e.target.className.includes('openwebrx-bookmark') || e.target.tagName === 'OPTION')) {
                setTimeout(window.applyProfileSettings, 300);
            }
        });

        let heartbeatInterval; 

        function initTxPlugin() {
            let wsProtocol = window.location.protocol === "https:" ? "wss://" : "ws://";
            txSocket = new WebSocket(wsProtocol + window.location.host + ":8443/tx-ws/");

            txSocket.onopen = () => {
                createPttButton();
                createTxPanel();
                
                setTimeout(window.syncAllSettings, 500);
                
                let mainSelect = document.getElementById('openwebrx-sdr-profiles-listbox');
                if(mainSelect) {
                    mainSelect.addEventListener('change', () => { setTimeout(window.applyProfileSettings, 100); });
                }

                setTimeout(window.applyProfileSettings, 1000);

                heartbeatInterval = setInterval(() => {
                    if (txSocket && txSocket.readyState === WebSocket.OPEN) {
                        txSocket.send(JSON.stringify({ cmd: "heartbeat" }));
                    }
                }, 30000);
            };

            txSocket.onmessage = async (event) => {
                if (event.data instanceof Blob) {
                    if (isTransmitting || !audioContext) return; 
                    
                    let arrayBuffer = await event.data.arrayBuffer();
                    let int16Data = new Int16Array(arrayBuffer);
                    let float32Data = new Float32Array(int16Data.length);
                    
                    for(let i=0; i<int16Data.length; i++) {
                        float32Data[i] = int16Data[i] / 32768.0;
                    }
                    
                    let audioBuffer = audioContext.createBuffer(1, float32Data.length, 48000);
                    audioBuffer.copyToChannel(float32Data, 0);
                    
                    let source = audioContext.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(audioContext.destination);
                    
                    if (rxNextPlayTime < audioContext.currentTime) {
                        rxNextPlayTime = audioContext.currentTime + 0.05; 
                    }
                    source.start(rxNextPlayTime);
                    rxNextPlayTime += audioBuffer.duration;
                }
            };

            txSocket.onclose = () => { 
                clearInterval(heartbeatInterval); 
                setTimeout(initTxPlugin, 5000); 
            };
        }

        window.addEventListener("load", initTxPlugin);
</script>