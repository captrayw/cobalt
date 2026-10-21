# Loudness calibration

The brief asks for one calibration on a reference phone, so that the first page of a session sits near 55 dBA at 30 cm.

## Procedure

1. Use the reference phone at half system volume, with Calm Scroll's own volume at 0 dB (the default and the maximum).
2. Open the hidden developer screen at `#/dev`, generate a session, and note the first page's note.
3. Start a session from Home and hold a sound level meter (A-weighted, slow response) 30 cm from the speaker during the first page tone.
4. If the reading is not near 55 dBA, change `TONE.peak` (default 0.16) in `packages/core/src/constants.ts`. Each doubling of the peak adds about 6 dB. Changing a constant needs the owner's approval, with this reading as the evidence.
5. Record the device, the OS version, the first note, the meter and the reading below.

## Readings

| Date | Device and OS | First note | Meter | Reading (dBA at 30 cm) | TONE.peak |
|---|---|---|---|---|---|
| (not yet measured) | | | | | 0.16 |

This needs real hardware and has not been done yet. The listening check for clicks on one iPhone and one Android phone (the milestone 2 gate) also needs hardware.
