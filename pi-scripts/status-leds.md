# Raspberry Pi Ethernet Port LED Status Indicators

## Overview
This document describes how to use the Raspberry Pi's Ethernet port LEDs as status indicators for the scanning system. This approach provides a visual status indication without requiring additional hardware.

## LED Locations
The Raspberry Pi Ethernet port has two LEDs:
- **Green LED**: Usually indicates link/activity
- **Amber/Yellow LED**: Usually indicates connection speed

## Controlling the LEDs
The LEDs can be controlled via the Linux sysfs interface by writing to files in the `/sys/class/leds/` directory.

### Access LED Controls
First, identify the LED names on your specific Raspberry Pi model:
```bash
ls /sys/class/leds/
```

Typically, you'll find entries like:
- `eth0:green`
- `eth0:amber` (or `eth0:yellow`)

### Basic LED Control
Control an LED by writing to its trigger file:
```bash
# Turn green LED on
echo "default-on" | sudo tee /sys/class/leds/eth0:green/trigger

# Turn green LED off
echo "none" | sudo tee /sys/class/leds/eth0:green/trigger

# Make green LED blink
echo "timer" | sudo tee /sys/class/leds/eth0:green/trigger
```

When using the "timer" trigger, you can adjust the blinking rate:
```bash
echo 500 | sudo tee /sys/class/leds/eth0:green/delay_on
echo 500 | sudo tee /sys/class/leds/eth0:green/delay_off
```

## Status Code Definition
The following LED patterns indicate the scanner system status:

| Status | Green LED | Amber/Yellow LED | Description |
|--------|-----------|------------------|-------------|
| Ready | Solid | Off | Scanner is ready for use |
| Scanning | Blinking | Off | Scanner is actively scanning |
| Processing | Solid | Solid | Document is being processed |
| Error | Off | Blinking | System error detected |
| Network Issue | Blinking | Blinking | Cannot connect to server |
| New Document | Off | Solid | New document waiting for processing |

## Implementation in Python

```python
def control_led(led_name, state, blink_rate_ms=None):
    """
    Control the Ethernet port LEDs
    
    Parameters:
        led_name: "eth0:green" or "eth0:amber"
        state: "on", "off", "blink"
        blink_rate_ms: Blinking rate in milliseconds (only used when state="blink")
    """
    led_path = f"/sys/class/leds/{led_name}/trigger"
    
    if state == "on":
        with open(led_path, 'w') as f:
            f.write("default-on")
    elif state == "off":
        with open(led_path, 'w') as f:
            f.write("none")
    elif state == "blink" and blink_rate_ms is not None:
        with open(led_path, 'w') as f:
            f.write("timer")
        
        with open(f"/sys/class/leds/{led_name}/delay_on", 'w') as f:
            f.write(str(blink_rate_ms))
        
        with open(f"/sys/class/leds/{led_name}/delay_off", 'w') as f:
            f.write(str(blink_rate_ms))

def set_status(status):
    """
    Set the system status using the LED status codes
    
    Parameters:
        status: "ready", "scanning", "processing", "error", "network_issue", "new_document"
    """
    if status == "ready":
        control_led("eth0:green", "on")
        control_led("eth0:amber", "off")
    elif status == "scanning":
        control_led("eth0:green", "blink", 200)
        control_led("eth0:amber", "off")
    elif status == "processing":
        control_led("eth0:green", "on")
        control_led("eth0:amber", "on")
    elif status == "error":
        control_led("eth0:green", "off")
        control_led("eth0:amber", "blink", 500)
    elif status == "network_issue":
        control_led("eth0:green", "blink", 500)
        control_led("eth0:amber", "blink", 500)
    elif status == "new_document":
        control_led("eth0:green", "off")
        control_led("eth0:amber", "on")
```

## Notes and Considerations
- This approach works even with no Ethernet cable connected
- Changes to LED states require root privileges
- LED names might vary across different Raspberry Pi models
- LEDs will revert to their default network behavior after a reboot unless the control script runs at startup