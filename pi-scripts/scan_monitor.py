#!/usr/bin/env python3
# /etc/scanbd/scripts/scan_monitor.py

import os
import time
import sane
import sys
import subprocess
from datetime import datetime
import traceback
import pdf_utils
import signal


# Global variables
device = None       # Scanner

# In manual mode (adf_mode == False), "scan" button triggers a scan.
# In ADF mode (Automatic Document Feeder), "page-load" event triggers a scan,
# while pressing "scan" button exits ADF mode.
# Intended to scan multiple (or single) pages into one file.
adf_mode = False    # Track ADF mode state

session_dir = None  # Track current scan session directory
page_num = 0        # Track current page number


def take_control():
    print("Taking control from scanbd")
    subprocess.run(["killall", "-SIGUSR1", "scanbd"])


def release_control():
    print("Releasing control to scanbd")
    subprocess.run(["killall", "-SIGUSR2", "scanbd"])


def perform_scan(session_dir, page_num):
    print("Starting SCAN operation")
    
    take_control()
    print("Control revoked from scanbd")

    scanner = sane.open(device)
    print("Device opened")

    # Create output filename with timestamp
    output_file = f"{session_dir}/page_{page_num}.png"
    os.makedirs(session_dir, exist_ok=True)

    print("Starting scan")
    try:
        img = scanner.scan()
        img.save(output_file, 'PNG')
        print(f"Image saved to {output_file}")
    except Exception as e:
        print(f"Scan error: {e}")
        traceback.print_exc()

    scanner.close()
    print("Device closed")

    release_control()
    print("Control returned to scanbd")



def handle_scan_button(_signum, _frame):
    print("SCAN BUTTON PRESSED!")
    global adf_mode, page_num, session_dir

    if not adf_mode:    # Scan first page
        page_num = 1
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        session_dir = f"/tmp/scan_session_{timestamp}"
        perform_scan(session_dir, page_num)

    else:   # Finalize scan session
        pdf_file = pdf_utils.create_pdf(session_dir)
        print(f"Scan session complete, PDF created: {pdf_file}")

        # Upload pdf to backend server
        pdf_utils.upload_pdf(pdf_file)

    # Toggle ADF mode after handling the current state
    adf_mode = not adf_mode
    
    print(f"Scanner switched to {'ADF' if adf_mode else 'MANUAL'} mode")



def handle_page_loaded(_signum, _frame):
    print("PAGE LOADED!")
    global adf_mode, page_num, session_dir
    
    # Only trigger scan if in ADF mode
    if adf_mode:
        page_num += 1
        perform_scan(session_dir, page_num)


def shutdown(code):
    release_control()
    sane.exit()
    sys.exit(code)


def handle_sigterm(_signum, _frame):
    print("Received SIGTERM, shutting down gracefully...")
    shutdown(0)


# Register the signal handler
signal.signal(signal.SIGTERM, handle_sigterm)
signal.signal(signal.SIGUSR1, handle_scan_button)
signal.signal(signal.SIGUSR2, handle_page_loaded)


try:
    # Starting up
    print("Starting scanner monitor...")

    # Initialize SANE
    print("Initializing SANE")
    sane.init()

    # Find scanners - keep trying until one is found
    print("Looking for scanners")
    while True:
        take_control()
        devices = sane.get_devices()
    
        if devices:  # If we found at least one scanner
            device = devices[0][0]
            print(f"Found scanner: {devices[0]}")
            release_control()
            break  # Exit the loop once we have a scanner
        else:
            # No scanners found, release control and wait before trying again
            release_control()
            print("No scanners found. Waiting 10 seconds before retrying...")
            time.sleep(10)

    print(f"Watching for event files...")

    # Main loop
    while True:
        # Will wake up on signal events
        time.sleep(3600)


except Exception as e:
    print(f"CRITICAL ERROR: {type(e).__name__}: {e}")
    traceback.print_exc()
    shutdown(1)