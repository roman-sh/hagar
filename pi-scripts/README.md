# Setting Up a Headless Network Scanner with Raspberry Pi OS Lite

This guide walks through setting up a Fujitsu ScanSnap scanner connected to a Raspberry Pi, enabling network scanning with button functionality.

## Prerequisites

- Raspberry Pi with Raspberry Pi OS Lite installed
- Fujitsu ScanSnap scanner (tested with ix-100, compatible with others)
- USB connection between scanner and Pi
- Network connectivity for the Pi

## Installation Steps

### 1. Initial System Setup

First, ensure your system is up to date:

```bash
sudo apt update
sudo apt full-upgrade -y
```

Configure the system locale:

```bash
# Check available locales
locale -a

# Generate the required locale
sudo locale-gen en_GB.utf8

# Set the locale in /etc/default/locale
sudo sh -c 'cat > /etc/default/locale << EOL
LANG=en_GB.utf8
LANGUAGE=en_GB:en
LC_CTYPE=en_GB.utf8
LC_NUMERIC=en_GB.utf8
LC_TIME=en_GB.utf8
LC_COLLATE=en_GB.utf8
LC_MONETARY=en_GB.utf8
LC_MESSAGES=en_GB.utf8
LC_PAPER=en_GB.utf8
LC_NAME=en_GB.utf8
LC_ADDRESS=en_GB.utf8
LC_TELEPHONE=en_GB.utf8
LC_MEASUREMENT=en_GB.utf8
LC_IDENTIFICATION=en_GB.utf8
LC_ALL=en_GB.utf8
EOL'

# Apply the settings to the current session
export LANG=en_GB.utf8
export LC_ALL=en_GB.utf8
export LC_CTYPE=en_GB.utf8

# Verify the settings
locale
```

Install the necessary packages:

```bash
sudo apt install -y sane sane-utils scanbd python3-sane
```

### 2. Scanner Configuration

Add your user to the scanner group (assuming username is 'admin'):

```bash
sudo usermod -a -G scanner admin
```

Create directories for scans and logs:

```bash
mkdir -p ~/scans

sudo mkdir -p /var/log/scanner
sudo chmod 777 /var/log/scanner
```

### 3. Disable eSCL Backend

ScanSnap works better with the USB-based fujitsu backend rather than eSCL:

```bash
# Comment out eSCL in the SANE configuration
sudo sed -i 's/^escl/#escl/' /etc/sane.d/dll.conf

# Create a custom SANE configuration directory for scanbd
sudo mkdir -p /etc/scanbd/sane.d

# Create a custom dll.conf for scanbd that only enables the fujitsu backend
echo "fujitsu" | sudo tee /etc/scanbd/sane.d/dll.conf
```

### 4. Configure scanbd

The scanbd daemon monitors scanner buttons and triggers actions when pressed.

Back up the original configuration:

```bash
sudo cp /etc/scanbd/scanbd.conf /etc/scanbd/scanbd.conf.bak
```

Edit the scanbd configuration:

```bash
sudo nano /etc/scanbd/scanbd.conf
```

Key settings to modify:
- Set user and group to "admin" and "scanner" respectively
- Set scriptdir to "/etc/scanbd/scripts"
- Set saned_env to include "SANE_CONFIG_DIR=/etc/scanbd/sane.d"
- Ensure all action configurations use event_logger.script

Example of key sections to modify:
```
global {
    # ... existing settings ...
    user    = admin
    group   = scanner
    # ... existing settings ...
    scriptdir = /etc/scanbd/scripts
    # ... existing settings ...
    saned_env  = { "SANE_CONFIG_DIR=/etc/scanbd/sane.d" }
    # ... rest of file ...
}
```

### 5. Setup Event Logger Script

Create the event logger script:

```bash
sudo mkdir -p /etc/scanbd/scripts
sudo chmod 777 /etc/scanbd/scripts

sudo nano /etc/scanbd/scripts/event_logger.sh
```

Use this content:

```bash
#!/bin/bash

# Create log directory if it doesn't exist
LOG_DIR="/home/admin/scanner_logs"
mkdir -p $LOG_DIR

# Log file with timestamp
LOG_FILE="$LOG_DIR/scanner_events.log"

# Script debug log
echo "================================================================" >> $LOG_FILE
echo "EVENT LOGGER SCRIPT EXECUTED AT $(date)" >> $LOG_FILE
echo "Script run as user: $(whoami)" >> $LOG_FILE
echo "Current directory: $(pwd)" >> $LOG_FILE

# Log the event with timestamp
echo "====== EVENT DETECTED: $(date) ======" >> $LOG_FILE
echo "Device: $SCANBD_DEVICE" >> $LOG_FILE
echo "Action: $SCANBD_ACTION" >> $LOG_FILE

# Simple handling - trigger scan when scan button is pressed
if [[ "$SCANBD_ACTION" == "scan" ]]; then
    echo "SCAN BUTTON PRESSED - Triggering scan at $(date)" >> $LOG_FILE
    
    # Create trigger file with appropriate permissions
    sudo touch /tmp/trigger_scan
    sudo chmod 666 /tmp/trigger_scan
    
    # Verify it was created
    echo "Trigger file status:" >> $LOG_FILE
    ls -la /tmp/trigger_scan >> $LOG_FILE
else
    echo "OTHER EVENT ($SCANBD_ACTION) - no action taken" >> $LOG_FILE
fi

echo "=================================\n" >> $LOG_FILE
```

Make it executable:

```bash
sudo chmod +x /etc/scanbd/scripts/event_logger.script
```

### 6. Setup Scanner Service

Create the persistent scanner script to handle the actual scanning:

```bash
nano ~/persistent_scanner.py
```

Add this content:

```python
#!/usr/bin/env python3
import os
import time
import subprocess
import sane
import sys
from datetime import datetime

# Initialize SANE
sane.init()
scanner = None

# Function to release the scanner from scanbd
def release_scanner():
    subprocess.run(["sudo", "killall", "-SIGUSR1", "scanbd"], stderr=subprocess.DEVNULL)
    time.sleep(0.1)  # Brief pause

# Function to let scanbd resume polling
def resume_scanner():
    subprocess.run(["sudo", "killall", "-SIGUSR2", "scanbd"], stderr=subprocess.DEVNULL)

# Initialize scanner
def init_scanner():
    global scanner
    release_scanner()
    try:
        devices = sane.get_devices()
        if not devices:
            print("No scanners found")
            resume_scanner()
            return None
        
        print(f"Found devices: {devices}")
        scanner = sane.open(devices[0][0])
        print(f"Scanner initialized: {scanner}")
        return scanner
    except Exception as e:
        print(f"Error initializing scanner: {e}")
        resume_scanner()
        return None

# Scan function
def perform_scan():
    global scanner
    
    try:
        if not scanner:
            scanner = init_scanner()
            if not scanner:
                return False
        
        # Create output filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        output_file = f"/home/admin/scans/quick_scan_{timestamp}.pnm"
        os.makedirs("/home/admin/scans", exist_ok=True)
        
        print(f"Starting scan at {datetime.now().strftime('%H:%M:%S.%f')}")
        
        # Start scan
        scanner.start()
        
        # Save the image
        img = scanner.snap()
        img.save(output_file, 'pnm')
        
        print(f"Scan completed at {datetime.now().strftime('%H:%M:%S.%f')}")
        print(f"Saved to: {output_file}")
        return True
    except Exception as e:
        print(f"Scan error: {e}")
        # Reset scanner for next attempt
        try:
            if scanner:
                scanner.close()
        except:
            pass
        scanner = None
        return False
    finally:
        # Always resume scanbd
        resume_scanner()

# Main loop to watch for trigger file
def main():
    global scanner
    
    print("Initializing scanner...")
    scanner = init_scanner()
    
    print("Watching for trigger file...")
    while True:
        # Check for trigger file
        if os.path.exists("/tmp/trigger_scan"):
            print("Trigger detected, starting scan...")
            try:
                os.remove("/tmp/trigger_scan")
            except:
                pass
            perform_scan()
        
        time.sleep(0.2)  # Check 5 times per second

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Shutting down...")
        if scanner:
            try:
                scanner.close()
            except:
                pass
        sane.exit()
```

Make it executable:

```bash
chmod +x ~/persistent_scanner.py
```

### 7. Disable scanbm (Network Manager Mode)

We're using the direct signal approach, so we need to disable the network manager mode:

```bash
sudo systemctl stop scanbm.socket
sudo systemctl disable scanbm.socket
```

### 8. Setup Systemd Service

Create a systemd service file for the persistent scanner:

```bash
sudo nano /etc/systemd/system/persistent-scanner.service
```

Add this content:

```
[Unit]
Description=Persistent Scanner Service
After=network.target scanbd.service
Wants=scanbd.service

[Service]
Type=simple
User=admin
ExecStart=/usr/bin/python3 /home/admin/persistent_scanner.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start the services:

```bash
sudo systemctl enable persistent-scanner.service
sudo systemctl start persistent-scanner.service
sudo systemctl restart scanbd.service
```

### 9. Optional: Setup Network Sharing

To make scans available on the network, install Samba:

```bash
sudo apt install -y samba samba-common-bin
```

Create a Samba password for your user:

```bash
sudo smbpasswd -a admin
```

Configure Samba by editing its configuration:

```bash
sudo nano /etc/samba/smb.conf
```

Add this section:

```
[scans]
    comment = Scanner Output
    path = /home/admin/scans
    browseable = yes
    writeable = yes
    create mask = 0777
    directory mask = 0777
    public = no
    valid users = admin
```

Restart Samba:

```bash
sudo systemctl restart smbd.service nmbd.service
```

## Troubleshooting

### Check Scanner Detection

```bash
# Test standard detection
scanimage -L

# Test with custom SANE config
SANE_CONFIG_DIR=/etc/scanbd/sane.d scanimage -L
```

### Check Service Status

```bash
sudo systemctl status scanbd.service
sudo systemctl status persistent-scanner.service
```

### Check Scanner Logs

```bash
tail -f ~/scanner_logs/scanner_events.log
```

### Check System Logs

```bash
journalctl -u scanbd
journalctl -u persistent-scanner
```

### Test Trigger File

You can manually test if scanning works by creating the trigger file:

```bash
touch /tmp/trigger_scan
```

### Restarting Services

If you make changes to configuration files, restart the relevant services:

```bash
sudo systemctl restart scanbd
sudo systemctl restart persistent-scanner
```

### Debugging Scanbd

To run scanbd in debug mode:

```bash
sudo systemctl stop scanbd
sudo scanbd -d -c /etc/scanbd/scanbd.conf
```

## Notes

- **Path Adjustment**: Make sure to adjust any paths that contain "admin" if you're using a different username
- **Permissions**: Ensure the scanner group has appropriate permissions
- **USB Issues**: If having USB connectivity issues, try a powered USB hub
- **SIGUSR Signals**: The SIGUSR1/SIGUSR2 signals require sudo access in the Python script
- **Scan Format**: By default, scans are saved as .pnm files. Consider adding ImageMagick conversion to PDF
- **eSCL Issues**: If you see eSCL errors in logs, make sure eSCL is properly disabled in all configuration files

## Known Issues and Workarounds

- **Scanner Not Detected**: Try unplugging and reconnecting the scanner, then restart scanbd
- **Trigger File Not Working**: Check permissions of /tmp and ensure the event_logger.script has execute permissions
- **scanbd Crashes**: If scanbd crashes frequently, reduce the polling frequency in scanbd.conf
- **Python-SANE Issues**: If you get Python SANE module errors, reinstall with `pip3 install --upgrade python-sane` 