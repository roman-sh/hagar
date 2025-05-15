# Raspberry Pi Remote Setup for Document Scanning Station

This guide outlines how to set up a Raspberry Pi as a document scanning station without requiring a keyboard, mouse, or monitor. The entire setup can be done remotely through your network.

## 1. Prepare the SD Card

On your computer:

1. **Download and flash Raspberry Pi OS**:
   - Download Raspberry Pi Imager from [raspberrypi.org](https://www.raspberrypi.org/software/)
   - Insert SD card in your computer
   - Open Raspberry Pi Imager
   - Click "Choose OS" and select "Raspberry Pi OS Lite (64-bit)" (no desktop needed for a scanner server)

2. **Enable SSH and configure Wi-Fi before first boot**:
   - In Raspberry Pi Imager, click the gear icon (⚙️) for advanced options
   - Enable SSH
   - Set your username and password
   - Configure Wi-Fi with your network name and password
   - Set hostname (e.g., "scanpi")
   - Click "Save" and then "Write"
   - Wait for the writing and verification to complete

## 2. First Connection

After inserting the SD card and powering on the Pi:

1. **Find the Pi on your network**:
   - Option 1: Check your router's admin page for connected devices
   - Option 2: Use an IP scanner app (like "Fing" on mobile)
   - Option 3: Try connecting via hostname: `ssh username@scanpi.local`

2. **Connect via SSH**:
   - On Mac/Linux: Open Terminal and type `ssh username@IP_ADDRESS`
   - On Windows: Use PuTTY or Windows Terminal with the same command
   - Accept the security fingerprint when prompted
   - Enter the password you set earlier

## 3. Basic System Configuration

Once connected via SSH:

1. **Update the system**:
   ```bash
   sudo apt update
   sudo apt upgrade -y
   ```

2. **Set timezone and locale**:
   ```bash
   sudo raspi-config
   ```
   Navigate to Localisation Options → Configure Timezone → Select your region and city

## 4. Scanner Setup

Install necessary software and configure the scanner:

1. **Install SANE and related packages**:
   ```bash
   sudo apt install -y sane-utils libsane-dev cups
   ```

2. **Connect your scanner via USB** and check if it's detected:
   ```bash
   sudo sane-find-scanner
   scanimage -L
   ```

3. **Configure scanner driver** (if not automatically detected):
   ```bash
   sudo nano /etc/sane.d/dll.conf
   ```
   Uncomment or add your scanner's driver (e.g., epson2, pixma, etc.)

4. **Test a basic scan**:
   ```bash
   scanimage > test.pnm
   ```

## 5. Set Up Scanning Automation

Create a system for automated scanning:

1. **Install Python and required libraries**:
   ```bash
   sudo apt install -y python3-pip
   pip3 install python-sane requests pillow
   ```

2. **Create a scanning script**:
   ```bash
   mkdir -p ~/scanning
   nano ~/scanning/scan_and_upload.py
   ```

3. **Add the following code** (basic example):

```python
#!/usr/bin/env python3
import sane
import os
import datetime
import requests
from PIL import Image

# Initialize scanner
sane.init()
devices = sane.get_devices()
if not devices:
    print("No scanner found")
    exit(1)

# Open first available scanner
scanner = sane.open(devices[0][0])

# Configure scan settings
scanner.mode = 'Color'
scanner.resolution = 300

# Create output directory
output_dir = os.path.expanduser("~/scans")
os.makedirs(output_dir, exist_ok=True)

# Generate filename based on date/time
timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
pdf_path = os.path.join(output_dir, f"scan_{timestamp}.pdf")

# Perform scan
print("Scanning...")
image = scanner.scan()
pil_image = Image.fromarray(image)

# Save as PDF
pil_image.save(pdf_path, "PDF")
print(f"Saved scan to {pdf_path}")

# Upload to server
api_endpoint = "https://your-api-endpoint.com/upload"
try:
    with open(pdf_path, 'rb') as f:
        files = {'file': f}
        response = requests.post(api_endpoint, files=files)
    
    if response.status_code == 200:
        print("Upload successful")
    else:
        print(f"Upload failed: {response.status_code}")
except Exception as e:
    print(f"Error during upload: {e}")

# Close scanner
scanner.close()
sane.exit()
```

4. **Make the script executable**:
   ```bash
   chmod +x ~/scanning/scan_and_upload.py
   ```

5. **Set up monitor for scan button** (if your scanner has one):
   ```bash
   sudo apt install -y python3-pyudev
   nano ~/scanning/button_monitor.py
   ```

```python
#!/usr/bin/env python3
import pyudev
import subprocess
import time

# Path to scanning script
SCAN_SCRIPT = "/home/pi/scanning/scan_and_upload.py"

# Setup udev monitor for USB events
context = pyudev.Context()
monitor = pyudev.Monitor.from_netlink(context)
monitor.filter_by(subsystem='usb')

# Monitor for button press event
print("Monitoring for scanner button press...")
for device in iter(monitor.poll, None):
    # This varies by scanner model - you may need to adjust
    if device.action == 'change' and 'SCANNER_BUTTON' in device.properties:
        print("Button press detected!")
        subprocess.run(["python3", SCAN_SCRIPT])
        # Debounce
        time.sleep(1)
```

6. **Create a systemd service** to run the button monitor:
   ```bash
   sudo nano /etc/systemd/system/scanner-button.service
   ```

```
[Unit]
Description=Scanner Button Monitor
After=network.target

[Service]
ExecStart=/usr/bin/python3 /home/pi/scanning/button_monitor.py
WorkingDirectory=/home/pi/scanning
StandardOutput=inherit
StandardError=inherit
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```

7. **Enable and start the service**:
   ```bash
   sudo systemctl enable scanner-button.service
   sudo systemctl start scanner-button.service
   ```

## 6. Optional: Remote Management Tools

For easier ongoing management:

1. **Install Cockpit** (web-based system management):
   ```bash
   sudo apt install -y cockpit
   sudo systemctl enable --now cockpit.socket
   ```
   Access via: `https://IP_ADDRESS:9090` in your browser

2. **Setup folder monitoring** for scans:
   ```bash
   sudo apt install -y inotify-tools
   nano ~/scanning/monitor_scans.sh
   ```

```bash
#!/bin/bash

SCAN_DIR="/home/pi/scans"
API_ENDPOINT="https://your-api-endpoint.com/upload"

inotifywait -m -e create -e moved_to --format "%w%f" "$SCAN_DIR" | while read FILE
do
    if [[ "$FILE" == *.pdf ]]; then
        echo "New scan detected: $FILE"
        curl -F "file=@$FILE" "$API_ENDPOINT"
        echo "Upload complete"
    fi
done
```

3. **Make it executable and create a service**:
   ```bash
   chmod +x ~/scanning/monitor_scans.sh
   sudo nano /etc/systemd/system/scan-monitor.service
   ```

```
[Unit]
Description=Scan Directory Monitor
After=network.target

[Service]
ExecStart=/home/pi/scanning/monitor_scans.sh
WorkingDirectory=/home/pi
StandardOutput=inherit
StandardError=inherit
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```

4. **Enable and start the service**:
   ```bash
   sudo systemctl enable scan-monitor.service
   sudo systemctl start scan-monitor.service
   ```

## 7. Cellular Connectivity (Optional)

To use a USB 4G/LTE modem for uploads:

1. **Install required packages**:
   ```bash
   sudo apt install -y usb-modeswitch wvdial
   ```

2. **Configure the connection**:
   ```bash
   sudo nano /etc/wvdial.conf
   ```

```
[Dialer Defaults]
Init1 = ATZ
Init2 = ATQ0 V1 E1 S0=0 &C1 &D2 +FCLASS=0
Modem Type = Analog Modem
ISDN = 0
Phone = *99#
Modem = /dev/ttyUSB0
Username = your_apn
Password = your_password
Baud = 460800
Auto DNS = 1
Dial Command = ATDT
Stupid Mode = 1
Dial Attempts = 3
```

3. **Create a connection script**:
   ```bash
   nano ~/scanning/connect_4g.sh
   ```

```bash
#!/bin/bash
sudo wvdial &
```

4. **Make it executable**:
   ```bash
   chmod +x ~/scanning/connect_4g.sh
   ```

5. **Test the connection**:
   ```bash
   ~/scanning/connect_4g.sh
   ```

## 8. Troubleshooting

Common issues and solutions:

1. **Scanner not detected**:
   ```bash
   # Check USB devices
   lsusb
   
   # Check SANE configuration
   sudo nano /etc/sane.d/dll.conf
   
   # Install specific scanner backend if needed
   # Example for Epson
   sudo apt install -y sane-airscan
   ```

2. **Connection issues**:
   ```bash
   # Test internet connectivity
   ping -c 4 google.com
   
   # Check API endpoint
   curl -v https://your-api-endpoint.com/upload
   ```

3. **Service status**:
   ```bash
   # Check if services are running
   sudo systemctl status scanner-button.service
   sudo systemctl status scan-monitor.service
   
   # View logs
   sudo journalctl -u scanner-button.service
   ```

## 9. Security Considerations

1. **Change default credentials**:
   ```bash
   passwd
   ```

2. **Update the system regularly**:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

3. **Limit SSH access**:
   ```bash
   sudo nano /etc/ssh/sshd_config
   ```
   Set `PasswordAuthentication no` and use SSH keys instead

## 10. Maintenance

1. **Regular check script**:
   ```bash
   nano ~/scanning/check_system.sh
   ```

```bash
#!/bin/bash
echo "Checking disk space:"
df -h

echo "Checking services:"
systemctl is-active scanner-button.service
systemctl is-active scan-monitor.service

echo "Checking scanner:"
scanimage -L

echo "Checking network:"
ping -c 4 google.com
```

2. **Make executable**:
   ```bash
   chmod +x ~/scanning/check_system.sh
   ```

3. **Setup cron job** for regular maintenance:
   ```bash
   crontab -e
   ```
   Add: `0 1 * * * /home/pi/scanning/check_system.sh > /home/pi/system_check.log 2>&1`

This setup provides a complete, headless Raspberry Pi scanning station that can be managed entirely remotely, with both Wi-Fi and optional cellular connectivity for reliable document scanning and uploading. 