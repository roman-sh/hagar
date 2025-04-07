# Raspberry Pi + Epson Scanner Integration

This document outlines a plan for implementing an automated scanning solution using a Raspberry Pi connected to an Epson DS-80W scanner, which will automatically upload scanned documents to our system.

## Recommended Raspberry Pi Models

For this project, we recommend the following models (in order of preference):

1. **Raspberry Pi 4 Model B (2GB or 4GB RAM)**
   - **Best option**: Provides enough processing power and memory for scanning tasks
   - Has 2 USB 3.0 ports for fast scanner connection
   - Built-in dual-band Wi-Fi and Bluetooth
   - Price: ~$45-65 (2GB), ~$55-75 (4GB)

2. **Raspberry Pi 5 (4GB or 8GB RAM)**
   - **Premium option**: More powerful but overkill for this application
   - Better performance but higher cost
   - Price: ~$60-80 (4GB), ~$80-100 (8GB)

3. **Raspberry Pi 3 Model B+**
   - **Budget option**: Sufficient for basic scanning tasks
   - Slightly slower but still capable
   - Price: ~$35-45

4. **Raspberry Pi Zero 2 W**
   - **Compact option**: Much smaller form factor
   - Limited processing power but sufficient for basic tasks
   - Requires USB adapter for scanner connection
   - Price: ~$15-25

> **Recommendation**: For this scanning project, the **Raspberry Pi 4 Model B with 2GB RAM** offers the best balance of performance and cost. The extra power of the Pi 5 isn't necessary, while the Pi 3 or Zero 2 W might be slightly underpowered for optimal performance.

## 4G/LTE Connectivity Options

Adding cellular connectivity to your Raspberry Pi scanner setup provides significant advantages:

### Benefits of 4G/LTE Connectivity

- **Network Independence**: Function without relying on local Wi-Fi
- **Reliability**: Cellular networks often have better uptime than local networks
- **Flexibility**: Deploy the scanner solution anywhere with cellular coverage
- **Security**: Physical isolation from the local network

### Recommended 4G/LTE HATs and Modules

1. **Waveshare SIM7600E-H 4G HAT**
   - Global band support for LTE/HSPA+/GSM
   - USB interface and UART for communication
   - Simple integration with Raspberry Pi GPIO
   - Price: ~$50-70

2. **SixFab Raspberry Pi 4G/LTE Cellular Modem Kit**
   - Complete kit with modem, antennas, and cables
   - Supports various cellular networks worldwide
   - Built-in GPS for location tracking
   - Price: ~$70-120

3. **RAKwireless RAK2013 Pi HAT**
   - Mini PCIe slot for various 4G modules
   - Flexible cellular module options
   - Compact design
   - Price: ~$45-60

### Implementation Steps for 4G/LTE

1. Install the 4G/LTE HAT on your Raspberry Pi
2. Install necessary drivers:
   ```bash
   # For Waveshare SIM7600 example
   git clone https://github.com/waveshare/SIM7600X-4G-HAT
   cd SIM7600X-4G-HAT/Raspberry/
   sudo ./install.sh
   ```

3. Configure the connection:
   ```bash
   # Create connection file
   sudo nano /etc/ppp/peers/provider
   ```

4. Add the following configuration (adjust for your provider):
   ```
   connect "/usr/sbin/chat -v -f /etc/chatscripts/ppp-on"
   disconnect "/usr/sbin/chat -v -f /etc/chatscripts/ppp-off"
   
   # Serial interface
   /dev/ttyUSB2
   
   # Speed
   115200
   
   # Keep connection active
   persist
   holdoff 10
   maxfail 0
   
   # Connection credentials (if required)
   user "internet"
   password "internet"
   
   # IP settings
   noauth
   noipdefault
   usepeerdns
   defaultroute
   replacedefaultroute
   ```

5. Start the connection:
   ```bash
   sudo pon provider
   ```

6. Make the connection start automatically at boot:
   ```bash
   # Add to rc.local before exit 0
   sudo nano /etc/rc.local
   
   # Add this line:
   /usr/bin/pon provider &
   ```
   
7. Update the upload script to check for and use cellular connection if Wi-Fi is unavailable.

### Cellular Data Considerations

- **Data Plan**: Choose a suitable data plan based on your scanning frequency and upload needs
- **Bandwidth Usage**: PDF documents can be large (1-5MB per page)
- **Cost Estimate**: 100 scanned pages per month ≈ 300MB-1GB data usage
- **Recommended Plan**: At least 2GB monthly data for moderate use

## About the Raspberry Pi 4 Model B

The "Model B" designation for Raspberry Pi 4 indicates the full-sized, feature-complete version of the board. It includes:

- Full set of ports (4× USB ports, 2× micro-HDMI, Ethernet, etc.)
- Standard form factor (85.6mm × 56.5mm)
- Complete GPIO header (40 pins)
- Standard power requirements (5V/3A via USB-C)

In contrast to other Raspberry Pi variants:
- **Model A**: Stripped-down versions with fewer ports (not available for Pi 4)
- **Compute Module**: Compact version without standard ports, for industrial applications
- **Zero series**: Ultra-compact boards with minimal connectivity

When purchasing a Raspberry Pi 4, the "Model B" is the standard version you'll find most commonly available, and it's what retailers typically refer to simply as "Raspberry Pi 4".

## RAM Requirements Analysis

For the Epson scanner application:

- **Raspberry Pi OS**: ~512MB RAM base usage
- **Epson Scan 2**: ~200-300MB RAM during scanning operations
- **Processing scripts and web server**: ~100MB RAM
- **Buffer for file operations**: ~200MB RAM

**Total estimated usage**: ~1GB RAM during peak operations

**2GB RAM** is sufficient for this application with plenty of headroom. 4GB would be overkill unless you plan to run additional services simultaneously (like OCR processing, database operations, or other memory-intensive tasks).

For perspective:
- Running just the scanner software: 2GB is more than adequate
- Running scanner + basic web server + upload scripts: 2GB is still sufficient
- Running scanner + OCR + image processing + database: Consider 4GB

## Kit Evaluation

### Proposed Kit
- Raspberry Pi 4 MODEL B with 2GB RAM
- Okdo Case for Raspberry Pi 4
- Raspberry Pi Power Supply / USB-C
- Cable Micro-HDMI to HDMI (type A) 1M for PI4
- Micro-SD NOOBS 16GB Class 10 with SD Adapter

### Assessment

This kit is **mostly suitable** for our scanner application with a few considerations:

1. **Raspberry Pi 4 Model B with 2GB RAM**: ✅ Perfect for our needs
2. **Case and Power Supply**: ✅ Essential components
3. **Micro-HDMI to HDMI Cable**: ✅ Useful for initial setup, though not needed for headless operation after setup
4. **16GB microSD with NOOBS**: ⚠️ Minimally sufficient but has limitations:
   - Modern Raspberry Pi OS requires ~8GB minimum
   - Scanning operations will generate files that accumulate over time
   - System updates and logs will consume additional space
   - The NOOBS installer itself takes up space
5. **Cooling Solution**: ❓ Not included in the kit but worth considering (see cooling section below)

## Cooling Requirements for Raspberry Pi 4

### Do You Need Additional Cooling?

The Raspberry Pi 4 runs hotter than previous models due to its more powerful processor. For our scanner application:

| Workload Type | Temperature Range | Cooling Recommendation |
|---------------|-------------------|------------------------|
| Intermittent scanning<br>(a few scans per hour) | 50-65°C | Basic case with ventilation is sufficient |
| Regular scanning<br>(multiple scans per hour) | 60-75°C | Passive cooling recommended<br>(heatsinks or aluminum case) |
| Continuous operation<br>(constant scanning or additional services) | 70-85°C | Active cooling recommended<br>(small fan or heatsink with fan) |

### Cooling Options (from minimal to maximum):

1. **Basic Ventilated Case**: ⭐
   - Most standard cases provide some ventilation
   - Minimal cooling effect (5-10°C reduction)
   - Sufficient for light, intermittent usage
   - Cost: Included with most cases

2. **Aluminum Heatsinks**: ⭐⭐
   - Small adhesive heatsinks that attach to the CPU, RAM, and USB controller
   - Moderate cooling effect (10-15°C reduction)
   - Good for regular usage patterns
   - Cost: $3-8

3. **Aluminum Case**: ⭐⭐⭐
   - The case itself acts as a large heatsink
   - Substantial cooling effect (15-20°C reduction)
   - Great for regular usage without noise
   - Cost: $10-25

4. **Fan-Based Cooling**: ⭐⭐⭐⭐
   - Small fan that attaches to the Pi or inside a case
   - Excellent cooling effect (20-25°C reduction)
   - Best for continuous heavy usage
   - Cost: $5-15 (generates some noise)

5. **Combination Solutions**: ⭐⭐⭐⭐⭐
   - Aluminum case with built-in fan
   - Maximum cooling effect (25-30°C reduction)
   - Overkill for most applications but eliminates all thermal concerns
   - Cost: $15-30

### Recommendation for Scanner Application:

For a scanner application that runs intermittently (not continuously scanning all day):
- **Basic heatsinks** are sufficient and cost-effective
- An **aluminum case** is recommended if the Pi will be in a warm environment or running additional services

**Active cooling with fans is NOT essential** for this application unless:
- The Pi will be placed in an enclosure with poor ventilation
- The environment is particularly warm (above 30°C/86°F)
- You plan to run multiple intensive processes simultaneously

### Temperature Monitoring:

You can monitor the CPU temperature with this command:
```bash
vcgencmd measure_temp
```

Or add this to your monitoring script to log temperature:
```bash
TEMP=$(vcgencmd measure_temp | cut -d= -f2 | cut -d"'" -f1)
echo "[$(date)] CPU Temperature: ${TEMP}°C" >> $LOG_FILE
```

### microSD Card Requirements

For a production scanning solution, a **larger microSD card is recommended**:

| microSD Size | Suitable for | Recommendation |
|-------------|--------------|----------------|
| 16GB | Basic setup with limited storage | Minimally sufficient |
| 32GB | Standard usage with moderate storage | ✅ **Recommended** |
| 64GB | Extended usage with ample storage | Ideal for long-term use |
| 128GB+ | Heavy usage with extensive storage | Overkill for most scanning applications |

**What fits on a 16GB card:**
- Raspberry Pi OS (~4-6GB)
- Epson Scan 2 software (~0.5GB)
- System overhead (~1GB)
- Remaining space for scans: ~7-9GB

**Estimated capacity:**
- Average PDF scan: 1-5MB per page
- 16GB card could store ~1,500-7,000 scanned pages

If you proceed with the 16GB card, we recommend:
1. Using the full Raspberry Pi OS image instead of NOOBS (more efficient use of space)
2. Implementing an external storage solution for long-term scan storage
3. Setting up automatic cleanup of older scans after successful upload

## Hardware Requirements

- Raspberry Pi 4 (2GB+ RAM recommended) - comes with built-in Wi-Fi and Bluetooth
- Epson DS-80W scanner (portable scanner with both USB and Wi-Fi connectivity)
- microSD card (32GB+ recommended)
- Power supply for Raspberry Pi
- Optional: UPS HAT or small UPS for power backup
- Optional: Case for Raspberry Pi
- Optional: Ethernet cable (if preferred over Wi-Fi)

## Connection Options for Epson DS-80W

### Option 1: Direct USB Connection
- Connect the DS-80W directly to the Raspberry Pi via USB
- Pros:
  - Simpler setup
  - More reliable connection
  - No need to configure wireless settings on the scanner
  - Faster data transfer
- Cons:
  - Scanner must be physically connected to the Pi
  - Limited by USB cable length
  - Requires a USB port on the Pi

### Option 2: Wireless Connection
- Use the DS-80W's built-in Wi-Fi capability to connect to the same network as the Raspberry Pi
- Pros:
  - Flexibility in scanner placement (no cables)
  - Multiple devices can access the scanner
  - Can work with the scanner's mobile app features
- Cons:
  - More complex setup
  - Requires wireless network configuration
  - Potentially less reliable connection
  - Battery considerations for the scanner

## Software Components

1. **Operating System**: Raspberry Pi OS (64-bit recommended)
2. **Scanner Software**: Epson Scan 2 for Linux
3. **Custom Scripts**: For automation and file upload
4. **Service Configuration**: For auto-startup and monitoring

## Implementation Plan

### 1. Basic Setup

1. Flash Raspberry Pi OS to microSD card
2. Configure headless setup (SSH, Wi-Fi)
3. Update system:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```
4. Install necessary packages:
   ```bash
   sudo apt install -y vim git curl build-essential libusb-dev
   ```

### 2. Install Epson Scan 2

According to the Epson documentation:

```bash
# Download Epson Scan 2 packages from Epson website
# Core package
sudo dpkg -i epsonscan2_x.x.x-x_amd64.deb
# Plugin package (for network functionality)
sudo dpkg -i epsonscan2-non-free-plugin_x.x.x-x_amd64.deb

# Fix any dependency issues
sudo apt --fix-broken install -y
```

### 3. Configure the Scanner

#### For USB Connection:

1. Connect the DS-80W to the Raspberry Pi using the USB cable
2. The scanner should be automatically detected. Verify with:
   ```bash
   epsonscan2 --list
   ```
3. Create a scan settings file:
   ```bash
   # First create default settings
   epsonscan2 --create
   # Then edit to your preferences
   epsonscan2 --edit ScanSettings.sf2
   ```
4. Test the scanning from command line:
   ```bash
   # Replace DEVICE_ID with the ID from the --list command
   epsonscan2 --scan DEVICE_ID ScanSettings.sf2
   ```

#### For Wireless Connection:

1. Configure the DS-80W for Wi-Fi connectivity using the Epson mobile app or Wi-Fi setup utility
2. Connect the scanner to the same network as your Raspberry Pi
3. Find the scanner's IP address (through your router or the Epson app)
4. Configure the scanner in Epson Scan 2:
   ```bash
   # Add the scanner's IP address to Epson Scan 2
   epsonscan2 --set-ip 192.168.1.xxx  # Replace with actual IP
   ```
5. Create scan settings and test as above

### 4. Create Automation Scripts

Create a script to handle the scanning and uploading process:

```bash
#!/bin/bash
# File: /home/pi/scan-upload.sh

# Directory to store scans
SCAN_DIR="/home/pi/scans"
LOG_FILE="/home/pi/scan.log"
UPLOAD_ENDPOINT="https://api.example.com/upload"  # Replace with actual API endpoint
AUTH_TOKEN="your-api-token"  # Replace with actual token

# Ensure scan directory exists
mkdir -p $SCAN_DIR

# Get current timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="scan_${TIMESTAMP}.pdf"
OUTPUT_PATH="${SCAN_DIR}/${FILENAME}"

# Log start
echo "[$(date)] Starting scan job" >> $LOG_FILE

# For USB connection: Get device ID from list
# For Wi-Fi connection: Use the IP address directly
if [[ "$CONNECTION_TYPE" == "usb" ]]; then
  DEVICE_ID=$(epsonscan2 --list | head -n 1 | awk '{print $1}')
  
  if [ -z "$DEVICE_ID" ]; then
    echo "[$(date)] No scanner detected" >> $LOG_FILE
    exit 1
  fi
  
  # Execute scan with device ID
  epsonscan2 --scan $DEVICE_ID /home/pi/ScanSettings.sf2
else
  # Execute scan with IP address
  epsonscan2 --scan 192.168.1.xxx /home/pi/ScanSettings.sf2  # Replace with actual IP
fi

# Find the most recently created file in the output directory
# (Epson Scan 2 may use its own naming convention)
LATEST_FILE=$(find /home/pi -type f -name "*.pdf" -cmin -1 | sort -r | head -n 1)

if [ -z "$LATEST_FILE" ]; then
  echo "[$(date)] No scanned file found" >> $LOG_FILE
  exit 1
fi

# Move to our organized location
mv "$LATEST_FILE" "$OUTPUT_PATH"

# Upload file
echo "[$(date)] Uploading file: $OUTPUT_PATH" >> $LOG_FILE
UPLOAD_RESULT=$(curl -s -X POST \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -F "file=@$OUTPUT_PATH" \
  -F "filename=$FILENAME" \
  -F "timestamp=$TIMESTAMP" \
  $UPLOAD_ENDPOINT)

# Check upload status
if [[ $UPLOAD_RESULT == *"success"* ]]; then
  echo "[$(date)] Upload successful" >> $LOG_FILE
else
  echo "[$(date)] Upload failed: $UPLOAD_RESULT" >> $LOG_FILE
  # Keep the file for later retry
  mkdir -p "${SCAN_DIR}/pending"
  cp "$OUTPUT_PATH" "${SCAN_DIR}/pending/$FILENAME"
fi

# Optional: Remove file after successful upload
# rm "$OUTPUT_PATH"
```

### 5. Create Service for Auto-Start

Create a systemd service to start the scanner monitoring on boot:

```bash
# File: /etc/systemd/system/scanner-monitor.service
[Unit]
Description=Scanner Monitoring Service
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi
ExecStart=/bin/bash /home/pi/scanner-monitor.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Create the monitoring script:

```bash
#!/bin/bash
# File: /home/pi/scanner-monitor.sh

LOG_FILE="/home/pi/monitor.log"
# Set to "usb" or "wifi" based on your connection type
CONNECTION_TYPE="usb"  # or "wifi" 

echo "[$(date)] Scanner monitoring service started" >> $LOG_FILE

while true; do
  if [[ "$CONNECTION_TYPE" == "usb" ]]; then
    # For USB connection, check if scanner is connected
    DEVICE_ID=$(epsonscan2 --list | head -n 1 | awk '{print $1}')
    
    if [ ! -z "$DEVICE_ID" ]; then
      # Check if we've scanned recently
      LAST_SCAN=$(find /home/pi/scans -type f -name "*.pdf" -cmin -5 | wc -l)
      
      if [ "$LAST_SCAN" -eq 0 ]; then
        echo "[$(date)] Scanner detected and no recent scans, executing scan" >> $LOG_FILE
        export CONNECTION_TYPE="usb"
        /home/pi/scan-upload.sh
      fi
    fi
  else
    # For WiFi connection, try to ping the scanner
    if ping -c 1 -W 1 192.168.1.xxx &> /dev/null; then  # Replace with actual IP
      # Check if we've scanned recently
      LAST_SCAN=$(find /home/pi/scans -type f -name "*.pdf" -cmin -5 | wc -l)
      
      if [ "$LAST_SCAN" -eq 0 ]; then
        echo "[$(date)] Scanner detected via Wi-Fi and no recent scans, executing scan" >> $LOG_FILE
        export CONNECTION_TYPE="wifi"
        /home/pi/scan-upload.sh
      fi
    fi
  fi
  
  # Sleep for a minute before checking again
  sleep 60
done
```

Enable and start the service:

```bash
sudo chmod +x /home/pi/scan-upload.sh
sudo chmod +x /home/pi/scanner-monitor.sh
sudo systemctl enable scanner-monitor.service
sudo systemctl start scanner-monitor.service
```

## DS-80W Specific Considerations

### USB Connection Mode
- The DS-80W can be used in direct USB mode
- When connected via USB, it appears as a standard scanner device
- No battery management required as the scanner is powered via USB

### Wireless Mode Considerations
- The DS-80W uses battery power in wireless mode
- Battery life is approximately 4.5 hours when scanning continuously
- Consider using the scanner's auto power-off feature to conserve battery
- The scanner may need to be charged periodically
- Setup requires connecting to the scanner's own Wi-Fi network initially to configure it

### Physical Button Integration
- The DS-80W has physical buttons that can be utilized for triggering scans
- Using the Epson Scan 2 software, you can configure what happens when these buttons are pressed

### DS-80W Limitations
- The DS-80W is a portable scanner with a single-sheet feed
- It cannot perform automatic document feeding for multiple pages
- Each document must be manually inserted
- Maximum scan resolution is 600 DPI

## Advanced Considerations

### Power Management

1. Configure the Pi to handle power outages gracefully:
   ```bash
   sudo apt install -y watchdog
   sudo systemctl enable watchdog
   sudo systemctl start watchdog
   ```

2. If using a UPS HAT, install its specific software to enable controlled shutdown on power loss.

### Remote Monitoring

1. Set up a simple status webpage:
   ```bash
   sudo apt install -y nginx
   sudo nano /var/www/html/index.html
   ```

2. Create a script to update status:
   ```bash
   #!/bin/bash
   # File: /home/pi/update-status.sh
   
   STATUS_FILE="/var/www/html/status.html"
   
   # Get scanner status
   SCANNER_STATUS=$(epsonscan2 --get-status 2>&1)
   if [ -z "$SCANNER_STATUS" ]; then
     SCANNER_STATUS="OK"
   fi
   
   # Count successful scans
   SCAN_COUNT=$(find /home/pi/scans -type f -name "*.pdf" | wc -l)
   
   # Count pending uploads
   PENDING_COUNT=$(find /home/pi/scans/pending -type f -name "*.pdf" | wc -l)
   
   # Get last scan time
   LAST_SCAN=$(find /home/pi/scans -type f -name "*.pdf" -printf "%T@ %p\n" | sort -nr | head -n1 | cut -d' ' -f2-)
   LAST_SCAN_TIME=$(stat -c %y "$LAST_SCAN" 2>/dev/null || echo "No scans yet")
   
   # Generate status page
   cat > $STATUS_FILE << EOF
   <!DOCTYPE html>
   <html>
   <head>
     <title>Scanner Status</title>
     <meta http-equiv="refresh" content="60">
     <style>
       body { font-family: Arial, sans-serif; margin: 20px; }
       .ok { color: green; }
       .warning { color: orange; }
       .error { color: red; }
     </style>
   </head>
   <body>
     <h1>Scanner Status</h1>
     <p>Last updated: $(date)</p>
     
     <h2>System Status</h2>
     <ul>
       <li>Scanner: <span class="${SCANNER_STATUS == 'OK' ? 'ok' : 'error'}">${SCANNER_STATUS}</span></li>
       <li>Total Scans: ${SCAN_COUNT}</li>
       <li>Pending Uploads: <span class="${PENDING_COUNT == 0 ? 'ok' : 'warning'}">${PENDING_COUNT}</span></li>
       <li>Last Scan: ${LAST_SCAN_TIME}</li>
     </ul>
     
     <h2>Logs</h2>
     <pre>$(tail -n 20 /home/pi/scan.log)</pre>
   </body>
   </html>
   EOF
   ```

3. Add to crontab to update every minute:
   ```bash
   (crontab -l 2>/dev/null; echo "* * * * * /home/pi/update-status.sh") | crontab -
   ```

## Security Considerations

1. Change default password for the pi user
2. Set up SSH key-based authentication
3. Consider setting up a firewall:
   ```bash
   sudo apt install -y ufw
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw enable
   ```

## Troubleshooting

1. Scanner not detected:
   - Check USB connection
   - Try different USB port
   - Run `lsusb` to verify device is connected
   - Check permissions: `sudo usermod -a -G lp pi`

2. Scanning errors:
   - Check scanner settings
   - Verify paper is properly loaded
   - Check logs for specific errors

3. Upload failures:
   - Verify network connectivity
   - Check API endpoint is correct
   - Verify authentication token

## Future Enhancements

1. Implement OCR to extract text from scanned documents
2. Add a simple UI via touchscreen for scanner control
3. Send notifications via email or messaging apps when scans are completed
4. Implement a more robust queueing system using Redis or RabbitMQ
5. Add support for multiple scanner profiles for different document types

## Maintenance

1. Set up automatic system updates:
   ```bash
   sudo apt install -y unattended-upgrades
   sudo dpkg-reconfigure -plow unattended-upgrades
   ```

2. Schedule regular reboots:
   ```bash
   (crontab -l 2>/dev/null; echo "0 3 * * 0 /sbin/reboot") | crontab -
   ```

3. Monitor disk space:
   ```bash
   (crontab -l 2>/dev/null; echo "0 * * * * df -h / | awk '{print \$5}' | tail -1 | tr -d '%' | awk '{\$1>85 && system(\"echo 'Disk space low' | mail -s 'Pi Disk Space Warning' your@email.com\")}';") | crontab -
   ``` 