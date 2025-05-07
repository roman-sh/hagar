#!/bin/bash
# /etc/scanbd/scripts/event_logger.sh

# Main scanner events log file
EVENTS_LOG="/var/log/scanner/scanner_events.log"

# Log the event with timestamp
echo "====== EVENT DETECTED: $(date) ======" >> $EVENTS_LOG
echo "Device: $SCANBD_DEVICE" >> $EVENTS_LOG
echo "Action: $SCANBD_ACTION" >> $EVENTS_LOG