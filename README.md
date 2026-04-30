# Quanshengstein

I hate coaxial cables and connectors.

Remote controlled Quansheng UV-K5 with SDR Panadapter - vibecoded for fun with Gemini
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

Iportant note for setting the right voltage - set the 8V output and the connect the radio to tune it to 8.4V using internal measurement circuit. When i have applied 8.4V using multimeter, the radio was screaming about voltage being too high.

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

My sourcecode and documentation can be found in https://github.com/sugarfree90/uv-k1-k5v3-firmware-CAT

Binary file can be found in this repository, it was tested on Quansheng UV-K5 V3 - you are flashing it on your own risk!
Please refer to the original F4HWN project for more info - this is outstanding!
Not everything is working - but it is a hobby project :)

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
