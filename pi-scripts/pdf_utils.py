#!/usr/bin/env python3
# /etc/scanbd/scripts/pdf_utils.py

import os
import subprocess


def create_pdf(session_dir):
    """
    Create a PDF from all scanned images in the session directory.
    
    Args:
        session_dir: The directory containing scanned page images
        
    Returns:
        Path to the created PDF file
    """
    print(f"Creating PDF from images in {session_dir}")
    
    # Counter file location (<number>.ctr)
    counter_dir = "/etc/scanbd/scripts"
    
    # Find current counter value from filename
    counter_file = subprocess.getoutput(f"ls -1 {counter_dir}/*.ctr")
    
    # Extract number and increment
    current = int(os.path.basename(counter_file).split('.')[0])
    counter = current + 1

    pdf_file = f"{session_dir}/invoice_{counter}.pdf"

    # Remove old counter file and create new one
    subprocess.run(["rm", counter_file])
    subprocess.run(["touch", f"{counter_dir}/{counter}.ctr"])
    
    # Find all PNG files in the session directory
    png_files = []
    for file in sorted(os.listdir(session_dir)):
        if file.lower().endswith('.png'):
            png_files.append(os.path.join(session_dir, file))
        
    print(f"Found {len(png_files)} images for PDF creation")
    
    # Build the img2pdf command
    cmd = ["img2pdf"]
    cmd.extend(png_files)
    cmd.extend(["--output", pdf_file])
    
    # Run the command
    print(f"Executing: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    print(f"Successfully created PDF: {pdf_file}")
    
    return pdf_file


def upload_pdf(pdf_file):
    """Upload PDF to backend server using curl and RPi serial as device ID"""
    
    # Get endpoint url for pdf upload
    BACKEND_URL_FILE = "/etc/scanbd/scripts/backend_url"
    base_url = subprocess.getoutput(f"cat {BACKEND_URL_FILE} 2>/dev/null").strip()
    endpoint_url = f"{base_url}/api/pdf-upload"
    
    # Get device identifier (RPi serial number)
    device_id = subprocess.getoutput("awk '/Serial/ {print $3}' /proc/cpuinfo").strip()
    
    # Construct the full URL with the device ID parameter
    url_with_params = f"{endpoint_url}?deviceId={device_id}"
    
    # Prepare the curl command
    cmd = [
        "curl",
        "-X", "POST",
        "-F", f"file=@{pdf_file}",
        "-H", "Accept: application/json",
        "--silent",
        "--show-error",
        url_with_params
    ]
    
    print(f"Uploading PDF to {url_with_params}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    print("Upload successful" if result.returncode == 0 else "Upload failed")