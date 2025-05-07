#!/bin/bash
# /etc/scanbd/scripts/scan_controller.sh

# First, log the event
/etc/scanbd/scripts/event_logger.sh "$@"

# Simply create event files based on the action
if [[ "$SCANBD_ACTION" == "scan" ]]; then
    echo "Creating scan event trigger file" >> /var/log/scanner/scanner_events.log
    touch /tmp/scan
    chmod 666 /tmp/scan
elif [[ "$SCANBD_ACTION" == "page-loaded" ]]; then
    echo "Creating page-loaded event trigger file" >> /var/log/scanner/scanner_events.log
    touch /tmp/page-loaded
    chmod 666 /tmp/page-loaded
fi