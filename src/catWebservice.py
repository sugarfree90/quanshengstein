import asyncio
import websockets
import json
import time
import serial
import pyaudio
import ctypes
import os

# --- KONFIGURACJA ---
WS_PORT = 8081
SERIAL_PORT = '/dev/ttyACM0'  # Ustawiono na Twój port
BAUD_RATE = 38400
TOT_LIMIT_SECONDS = 3600

is_transmitting = False
tx_start_time = 0
rx_audio_clients = set()

# --- FUNKCJE WYCISZAJĄCE LOGI ALSA ---
ERROR_HANDLER_FUNC = ctypes.CFUNCTYPE(None, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p)
def py_error_handler(filename, line, function, err, fmt):
    pass
c_error_handler = ERROR_HANDLER_FUNC(py_error_handler)

try:
    asound = ctypes.cdll.LoadLibrary('libasound.so.2')
    asound.snd_lib_error_set_handler(c_error_handler)
except OSError:
    pass 

# --- INICJALIZACJA KARTY DŹWIĘKOWEJ ---
try:
    devnull = os.open(os.devnull, os.O_WRONLY)
    old_stderr = os.dup(2)
    os.dup2(devnull, 2)
    
    p = pyaudio.PyAudio()
    
    os.dup2(old_stderr, 2)
    os.close(devnull)
    
    AIOC_AUDIO_INDEX = None
    for i in range(p.get_device_count()):
        info = p.get_device_info_by_index(i)
        name = info.get("name", "").lower()
        if info["maxOutputChannels"] > 0 and ("all-in-one-cable" in name or "usb audio" in name):
            AIOC_AUDIO_INDEX = i
            print(f"[Audio] Znaleziono kabel AIOC ('{info['name']}') pod indeksem {i}.")
            break
            
    if AIOC_AUDIO_INDEX is None:
        print("[Audio] UWAGA: Nie znaleziono AIOC, użyję domyślnej karty.")
    
    audio_stream_out = p.open(format=pyaudio.paInt16, channels=1, rate=48000, output=True, output_device_index=AIOC_AUDIO_INDEX)
    audio_stream_in = p.open(format=pyaudio.paInt16, channels=1, rate=48000, input=True, input_device_index=AIOC_AUDIO_INDEX, frames_per_buffer=2048)
    
    print(f"[Audio] Strumienie wejścia (RX) i wyjścia (TX) 48kHz gotowe.")
except Exception as e:
    try:
        os.dup2(old_stderr, 2)
        os.close(devnull)
    except:
        pass
    print(f"[Audio] BŁĄD inicjalizacji karty dźwiękowej: {e}")
    audio_stream_out = None
    audio_stream_in = None

# --- KLASA STEROWANIA RADIEM ---
class QuanshengCAT:
    def __init__(self, port, baudrate):
        try:
            self.port = port
            self.baudrate = baudrate
            self.ser = serial.Serial(self.port, self.baudrate, timeout=0.1, write_timeout=0.1)
            self.ser.rts = False
            self.ser.dtr = False
            print(f"[CAT] Połączono z radiem na {port}")
        except Exception as e:
            print(f"[CAT] BŁĄD otwarcia: {e}")
            self.ser = None

    def send(self, cmd, expect_reply=False):
        if not self.ser or not self.ser.is_open: return None
        try:
            self.ser.write(f"{cmd};".encode('ascii'))
            self.ser.flush()
            if expect_reply: return self.ser.read_until(b';').decode('ascii').strip()
            return True
        except: return None

    def get_vfo_a(self): return self.send("FA", True)
    def set_vfo_a(self, freq_hz): self.send(f"FA{int(freq_hz):011d}")
    def set_active_vfo(self, vfo): self.send(f"FR{vfo}")
    
    def tx_on(self): 
        if self.ser and self.ser.is_open:
            # Włączamy nadawanie tak jak w Twoim jednolijkowcu
            self.ser.rts = False
            self.ser.dtr = True
            print("[PTT] NADAWANIE (DTR=1)")
        
    def rx_on(self): 
        if self.ser and self.ser.is_open:
            # Puszczamy PTT
            self.ser.dtr = False
            self.ser.rts = False
            
            # MAGIA Z TERMINALA: Twardy restart portu wymuszający sprzętowe zrzucenie DTR!
            try:
                self.ser.close()
                time.sleep(0.05)
                self.ser.open()
                self.ser.dtr = False
                self.ser.rts = False
                print("[PTT] ODBIÓR (Port zresetowany - wymuszenie sprzętowe!)")
            except Exception as e:
                print(f"[PTT] Błąd przy resecie portu: {e}")

    def set_mod(self, mod_val): self.send(f"MD{mod_val}")
    def set_power(self, pwr_lvl): self.send(f"PC{pwr_lvl}")
    def set_squelch(self, sq_lvl): self.send(f"SQ{sq_lvl}")
    def set_monitor(self, state_val): self.send(f"MO{state_val}")
    
    def tones_off(self): self.send("OF")
    def set_ctcss(self, tone_hz): self.send(f"CT{int(float(tone_hz) * 10):04d}")
    def set_dcs(self, dcs_code): self.send(f"DT{int(dcs_code):03d}")
    
    def set_offset_dir(self, dir_val): self.send(f"OS{dir_val}")
    def set_offset_val(self, offset_hz): self.send(f"OV{int(offset_hz):011d}")

radio = QuanshengCAT(SERIAL_PORT, BAUD_RATE)

# --- ZADANIE W TLE: WYSYŁANIE AUDIO (RX) DO PRZEGLĄDARKI ---
async def rx_broadcaster():
    loop = asyncio.get_running_loop()
    while True:
        if rx_audio_clients and audio_stream_in and not is_transmitting:
            try:
                data = await loop.run_in_executor(None, audio_stream_in.read, 2048, False)
                disconnected = set()
                for ws in rx_audio_clients:
                    try:
                        await ws.send(data)
                    except:
                        disconnected.add(ws)
                
                for ws in disconnected:
                    rx_audio_clients.remove(ws)
            except Exception as e:
                await asyncio.sleep(0.05)
        else:
            await asyncio.sleep(0.05)

async def watchdog():
    global is_transmitting
    while True:
        if is_transmitting and (time.time() - tx_start_time > TOT_LIMIT_SECONDS):
            print("WATCHDOG: Przekroczono limit! Wymuszam RX.")
            radio.rx_on()
            is_transmitting = False
        await asyncio.sleep(1)

# --- WEBSOCKET HANDLER ---
async def handle_client(websocket):
    global is_transmitting, tx_start_time
    print("Nowy klient podłączony z przeglądarki!")
    radio.set_active_vfo(0)
    loop = asyncio.get_running_loop()

    try:
        async for message in websocket:
            if isinstance(message, str):
                try:
                    data = json.loads(message)
                    cmd = data.get("cmd")

                    if cmd == "start_tx":
                        freq = data.get("freq")
                        mod_str = data.get("mod", "FM").upper()
                        mod_id = {"FM": 4, "AM": 5, "USB": 2, "LSB": 2}.get(mod_str, 4)

                        print(f"Nadawanie: {freq} Hz, Modulacja: {mod_str} (ID: {mod_id})")
                        if freq: radio.set_vfo_a(freq)
                        radio.set_mod(mod_id)
                        
                        # Krótka pauza, by radio przetrawiło komendy tekstowe przed odpaleniem PTT
                        time.sleep(0.05)
                        radio.tx_on() 
                        
                        is_transmitting = True
                        tx_start_time = time.time()
                        await websocket.send(json.dumps({"status": "tx_on"}))

                    elif cmd == "stop_tx":
                        print("Kończę nadawanie.")
                        radio.rx_on()
                        is_transmitting = False
                        await websocket.send(json.dumps({"status": "tx_off"}))

                    elif cmd == "start_rx_audio":
                        rx_audio_clients.add(websocket)
                        print("Klient włączył odsłuch radia.")
                    elif cmd == "stop_rx_audio":
                        if websocket in rx_audio_clients:
                            rx_audio_clients.remove(websocket)
                        print("Klient wyłączył odsłuch radia.")
                    elif cmd == "set_freq":
                        freq = data.get("freq")
                        if freq:
                            print(f"Przestrajanie radia (z wodospadu): {freq} Hz")
                            radio.set_vfo_a(freq)
                    elif cmd == "set_monitor":
                        val = data.get("val")
                        print(f"Ustawiam tryb MONI na: {val}")
                        radio.set_monitor(val)
                    elif cmd == "set_power": 
                        print(f"Ustawiam moc: {data.get('val')}")
                        radio.set_power(data.get("val"))
                    elif cmd == "set_squelch": 
                        print(f"Ustawiam squelch: {data.get('val')}")
                        radio.set_squelch(data.get("val"))
                    elif cmd == "set_ctcss":
                        val = data.get("val")
                        radio.tones_off() if val == 0 else radio.set_ctcss(val)
                    elif cmd == "set_dcs":
                        val = data.get("val")
                        radio.tones_off() if val == 0 else radio.set_dcs(val)
                    elif cmd == "set_offset":
                        radio.set_offset_dir(data.get("dir"))
                        radio.set_offset_val(data.get("val"))

                except json.JSONDecodeError:
                    pass

            elif isinstance(message, bytes):
                if is_transmitting and audio_stream_out:
                    await loop.run_in_executor(None, audio_stream_out.write, message)

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        if is_transmitting:
            radio.rx_on()
            is_transmitting = False
        if websocket in rx_audio_clients:
            rx_audio_clients.remove(websocket)

async def main():
    async with websockets.serve(handle_client, "0.0.0.0", WS_PORT):
        await asyncio.gather(watchdog(), rx_broadcaster())

if __name__ == "__main__":
    print(f"Serwer wtyczki TX (Direct Quansheng CAT) na porcie {WS_PORT}...")
    asyncio.run(main())
