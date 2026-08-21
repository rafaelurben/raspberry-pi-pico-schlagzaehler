# /// script
# requires-python = ">=3.14"
# dependencies = [
#     "matplotlib>=3.11.1",
#     "pandas>=3.0.5",
#     "pyserial>=3.5",
# ]
# ///
import sys

import serial
import csv
import matplotlib.pyplot as plt

# --- Configuration ---
SERIAL_PORT = None
# SERIAL_PORT = 'COM3'                    # Example for Windows
# SERIAL_PORT = "/dev/tty.usbmodem21202"  # Example for Linux/Mac
# --- End Configuration ---

BAUD_RATE = 115200


def create_chart(timestamps: list, adc_values: list, filename_prefix: str):
    """Generate a line chart from the collected data and save it as an image."""

    plt.figure(figsize=(12, 6))
    plt.plot(timestamps, adc_values, label="Piezo Signal", color="blue", linewidth=1.5)

    # Format the chart
    plt.title(
        "Piezo Sensor - Schlagmessung & Nachschwingung", fontsize=14, fontweight="bold"
    )
    plt.xlabel("Sample", fontsize=12)
    plt.ylabel("ADC Wert (0 - 65'536)", fontsize=12)
    plt.grid(True, linestyle="--", alpha=0.6)
    plt.legend(loc="upper right")

    # Save the chart image automatically
    plt.savefig(filename_prefix + "_chart.png", dpi=300, bbox_inches="tight")
    print("Chart saved as '" + filename_prefix + "_chart.png'.")

    # Open the interactive window
    plt.show(block=True)


def collect_and_generate_chart(filename_prefix: str):
    """Collect data from the serial port and generate a line chart."""
    print(f"Connecting to {SERIAL_PORT}...")
    try:
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
        ser.flushInput()  # Clear old artifacts from buffer
    except Exception as e:
        print(f"Error opening port: {e}")
        sys.exit()

    timestamps = []
    adc_values = []

    try:
        with open(
            filename_prefix + ".csv", mode="w", newline="", encoding="utf-8"
        ) as file:
            writer = csv.writer(file)
            writer.writerow(["Sample", "ADC_Value"])  # Header for CSV

            while True:
                if ser.in_waiting > 0:
                    raw_line = ser.readline()
                    try:
                        line = raw_line.decode("utf-8").strip()
                    except UnicodeDecodeError:
                        continue  # Skip corrupted bytes

                    if line.startswith("END"):
                        print("END detected.")
                        break
                    if line.startswith("TRIGGER"):
                        print("TRIGGER detected.")
                        continue

                    # Artifact filter: Ensure format is exactly "digits,digits"
                    parts = line.split(",")
                    if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                        sample = int(parts[0])
                        adc_value = int(parts[1])

                        # Save to backup CSV
                        writer.writerow([sample, adc_value])

                        # Save to memory for the chart
                        timestamps.append(sample)
                        adc_values.append(adc_value)
                    else:
                        print(f"Skipping malformed line: {line}")
    finally:
        ser.close()

    if timestamps and adc_values:
        print("Generating line chart...")

        create_chart(timestamps, adc_values, filename_prefix)
    else:
        print("No valid data received. Chart cannot be generated.")


if __name__ == "__main__":
    if SERIAL_PORT is None:
        print(
            "Error: SERIAL_PORT is not set. Please configure the correct serial port."
        )
        sys.exit(1)

    try:
        i = 0
        while True:
            print("Run #", i)
            collect_and_generate_chart(f"data/piezo_{i:03d}")
            print("Restarting data collection...")
            i += 1
    except KeyboardInterrupt:
        print("\nRecording stopped because Ctrl+C was pressed.")
