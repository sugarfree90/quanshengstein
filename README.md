# Quanshengstein

Remote controlled Quansheng UV-K5 with SDR Panadapter - vibecoded for fun
Motivation was that i have a long way to a mast - too long to have radio connected via RF cable, so i have made PoE powered handheld radio :)
![Assembled with Flowerpot antenna](/photo/onMast.jpeg)
GUI is a modified openwebrx+ and whole project allows to pick frequency from waterfall.
Here is how i did it:

## 1. Modyfying Quansheng radio
In order to use single antenna, and protect SDR from high power of Quansheng, i have soldered wifi pigtail just before LNA input of Quansheng's receiver. The pigtail was somehow sandwiched between PCB and metal chasis and 
pulled out of the casing in a place of LED diode which was removed. On the picture there is V2 version but final version was assembled with V3 because i have broke it :).
I have helped myself with the schematics downloaded from
https://github.com/mentalDetector/Quansheng_UV-K5_PCB_R51-V1.4_PCB_Reversing_Rev._0.9
Kudos for contributors!
![You should solder here (if you are brave enough!)](/photo/beken.jpeg)
![](/photo/assembled.jpeg)

## 2. Connecting everything together
I have used Orange Pi One as a main computer (because it was collecting dust in a drawer) and connected to it RTL-SDR which is connected to the pigtail exported from quansheng and an AIOC board.
https://github.com/skuep/AIOC
Kudos for all the contributors!
![](/photo/benchTests.jpeg)
I recommmend using antenna that is not directly connected to the radio - interferences can freeze the whole device. Here i have $4 aliexpress external antenna - it was fine.
The AIOC board serves as a soundcard, uart interface and PTT and this was for me the main spark that allowed me to start this project.
It is used to speak through the radio and set all the settings.
In final build i have added a GPS receiver for OpenWebRX+ to seek for nearby repeaters, and because i have had one lying around that allowed me to add more power to the USB bus (Orange Pi One have limitations, it was OK for AIOC, but SDR was taking too much current)
Power is delivered via gigabit POE (Mikrotik gigabit POE injectors) - and i think that this is important because normal 100mbps POE injectors use only 4 wires to transfer the power and gigabit POE injector uses all 8 wires which gives us more wires to powet the device.
![Electromagnetic compatibility is a bitch](/photo/boxAssembled.jpeg)
For power supply i have used 24V 2A mikrotik brick and LM2596 boards from Aliexpress for supplying 5V for Orange Pi + USB devices, and 8.2V for Quansheng. I have connected Quansheng with modified Aliexpress battery eliminator. It was just a linear LM7808 regulator which is not efficient enough so i have replaced it with LM2596.
![I have checked that on oscilloscope, and it was better but not much....](/photo/powerSupply.jpeg)
It is not an ideal solution, so i have replaced the capacitors for better ones.
In the quansheng i have set it to single VFO, i have disabled automatic keypad lock and i have disabled power saving.
Volume knob is set to around 75%.

## 3. Interference
Yes, it was a problem. The main reason was Orange Pi One which was producing very strong noise during transmission - unusable.
I have moved all unnecessary electronics to other box and separated it with steel plate in order to minimize the interference since i have discovered that moving the Orange Pi One farther from the radio - reduced the interference during transmission. It have helped a little bit as well as desoldering GND connector from AIOC soundcard.

**The final solution** for the interference problem was connecting th AIOC via ADUM3160 USB isolation board - note that i have had to reconnect the GND that was previously disconnected for everything to work.

## 4. Quansheng - CAT protocol
In order to remotely controll quansheng, i have used F4HWN software and i have modified it to receive commands from UART interface.
https://github.com/armel/uv-k1-k5v3-firmware-custom
Kudos for all the contributors!

My build and sourcecode can be found in quanshengCAT folder.
Full command documentation will be listed at the end of this file. Not everything is working - but it is a hobby project :)

## 5. OpenWebRx+ and backend
The goal here was to be able to pick frequency from waterfall and transmit via the quansheng from web browser.
![enter image description here](/photo/screenshoot.png)
In order to use the radio, you have to install openwebrx+ and rtl-sdr software. I think that it is the best to use official documentation:
https://fms.komkon.org/OWRX/
Kudos for the contributors!

## Important note!
In order to use microphone in web browser - the connection requires SSL, i have created my own certificate and i have used nginx to deliver both frontend and backend connection
I have added my nginx example config in nginx folder. sites-available folder is in /etc/nginx

## Python backend

Next you need python3 with installed additional packages (you can use pip for that):

 - asyncio
 - websockets
 - pyserial
 - pyaudio



With that installed you can run `catWebservice.py`.
For the configuration, you have to define "SERIAL_PORT" variable to point to the AIOC interface, the soundcard from AIOC will be auto-detected. Sorry if you want to use other interface but i have developed it with AIOC in mind.
You can use screen or supervisord to run this script however you like to be available all the time for the frontend.

## OpenWebRx+ customization

Last step is to modify the index.html file of OpenWebRx+.
You can find it in `/usr/lib/python3/dist-packages/htdocs/`
and you have to insert the script before `</body>` in the index.html file.
Remember that after upgrading the openwebrx you have to do it again!

## 6. Using the radio
If the connection between frontend and backend is succesfull, you will se addiditonal controlls for the radio controll.
When the PTT button is blue - that means that the microphone is not connected yet, if you click it, the web browser will ask you for a microphone premission.
If the microphone signal is available, you will see FFT from your microphone on the PTT button.
If you click the PTT button - the radio will transmit!

You can use sound from AIOC or OWRX for receiving, i have found that OWRX works better for me. The sound will be muted during transmission and waterfall levels will be remembered and restored after the transmission - it seems obvious but it was added as a feature.
If you press the gear button you will be able to set some radio features like power, CTCSS tones and TX shift for repeaters.
You can predefine those values in the name of the profile in OpenWebRX+ in such fashion:

> ****repeaters;110;-7.6****

It will set 110Hz CTCSS tone and TX shift to -7.6MHz

## 7. CAT commands
The firmware supports computer communication using ASCII commands (Kenwood protocol). Communication can take place via the physical UART port or the virtual VCP port (USB). Every command must end with a semicolon (`;`).

## Data Format
* **Frequencies:** Specified in hertz (Hz) as an 11-digit string, padded with leading zeros (e.g., `00145500000` translates to 145.500 MHz).
* **Saving:** Changes to VFO parameters (e.g., power, tones, offset) are immediately applied to the radio hardware and permanently saved to the EEPROM memory (or applied globally).

---

## Supported Commands List

### 1. Identification and Status
* **`ID;`** – Request radio identification.
    * **Example:** `ID;`
    * **Response:** `ID020;`
* **`IF;`** – Request global radio status (Information). Returns information about the active VFO's current frequency, modulation mode (4=FM, 5=AM), and transmission status (0=RX, 1=TX).
    * **Example:** `IF;`
    * **Response:** `IF0014550000000000           40;` *(Indicates 145.500 MHz, FM mode, and currently receiving)*

### 2. Frequency Control (VFO)
* **`FA;` / `FB;`** – Read the frequency for VFO A (upper) or VFO B (lower), respectively.
    * **Example:** `FA;`
    * **Response:** `FA00145500000;` *(VFO A is set to 145.500 MHz)*
* **`FA[11 digits];` / `FB[11 digits];`** – Set the RX and TX frequency for a specific VFO.
    * **Example 1:** `FA00433000000;` *(Sets VFO A to 433.000 MHz)*
    * **Example 2:** `FB00145500000;` *(Sets VFO B to 145.500 MHz)*
* **`FR[0 or 1];`** – Switch the active VFO (0 = VFO A, 1 = VFO B).
    * **Example:** `FR1;` *(Makes VFO B the active/main VFO)*

### 3. Transmission (PTT) and Reception Control
* **`TX;`** – Start transmitting (PTT ON).
    * **Example:** `TX;` *(Radio begins transmitting on the active VFO)*
* **`RX;`** – Stop transmitting (return to reception / PTT OFF).
    * **Example:** `RX;` *(Radio stops transmitting)*
* **`MO[0 or 1];`** – Hardware monitor control. Fully opens the squelch.
    * **Example 1:** `MO1;` *(Turns Monitor ON, opening the squelch)*
    * **Example 2:** `MO0;` *(Turns Monitor OFF, returning to normal squelch)*

### 4. Channel / VFO Settings
* **`MD;`** – Read the modulation mode for the active VFO.
    * **Example:** `MD;`
    * **Response:** `MD4;` *(Indicates FM mode is active. 5=AM, 2=USB)*
* **`MD[type];`** – Set the modulation mode (5 = AM, 2 = USB, other values will default to FM).
    * **Example 1:** `MD5;` *(Sets the active VFO to AM mode)*
    * **Example 2:** `MD4;` *(Sets the active VFO to FM mode)*
* **`SQ[0-9];`** – Set the radio's squelch level (scale from 0 to 9).
    * **Example:** `SQ5;` *(Sets the global squelch level to 5)*
* **`PC[0-7];`** – Set the transmission power level.
    * `PC0;` – LOW 1 (20mW)
    * `PC1;` – LOW 2 (125mW)
    * `PC2;` – LOW 3 (250mW)
    * `PC3;` – LOW 4 (500mW)
    * `PC4;` – LOW 5 (1W)
    * `PC5;` – MID (2W)
    * `PC6;` – HIGH (5W)
    * `PC7;` – USER (custom user-defined power level)
    * **Example:** `PC6;` *(Sets the active VFO's output power to HIGH / 5W)*

### 5. Privacy Codes (CTCSS / DCS)
*Note: Tone changes apply only to the currently active VFO and are immediately applied to both RX and TX.*
* **`OF;`** – Turn off CTCSS/DCS codes.
    * **Example:** `OF;` *(Clears all tones for the active VFO)*
* **`CT[4 digits];`** – Set the CTCSS tone. The value is given in 0.1 Hz increments (e.g., 114.8 Hz is `1148`).
    * **Example:** `CT1148;` *(Sets the CTCSS tone to 114.8 Hz)*
* **`DT[3 octal digits];`** – Set the DCS code (in octal format).
    * **Example:** `DT023;` *(Sets the DCS code to D023N)*

### 6. Repeater Operation (Offset)
*Note: These commands adjust the frequency offset settings for the active VFO.*
* **`OS[1 or 2];`** – Set the offset shift direction.
    * `OS1;` – Plus (+)
    * `OS2;` – Minus (-)
    * **Example:** `OS2;` *(Sets the repeater shift to Minus)*
* **`OV[11 digits];`** – Set the offset value in hertz (Hz).
    * **Example:** `OV00000600000;` *(Sets the frequency offset to 600 kHz / 0.6 MHz)*
