#!/bin/bash
# /etc/scanbd/scripts/scan_controller.sh

# First, log the event
/etc/scanbd/scripts/event_logger.sh "$@"

# Function to send signals to the scanner monitor
send_signal_to_monitor() {
    local signal=$1
    echo "Sending signal $signal to scan_monitor.py" | tee -a /var/log/scanner/scanner_events.log
    pkill -$signal -f "scan_monitor.py"
}

# Handle different events with different signals
if [[ "$SCANBD_ACTION" == "scan" ]]; then
    echo "Detected scan button press" | tee -a /var/log/scanner/scanner_events.log
    send_signal_to_monitor USR1
elif [[ "$SCANBD_ACTION" == "page-loaded" ]]; then
    echo "Detected page loaded" | tee -a /var/log/scanner/scanner_events.log
    send_signal_to_monitor USR2
elif [[ "$SCANBD_ACTION" == "remove" ]]; then
    echo "DEVICE REMOVED: $SCANBD_DEVICE" | tee -a /var/log/scanner/scanner_events.log
    # Actually want to terminate in this case
    send_signal_to_monitor TERM
fi