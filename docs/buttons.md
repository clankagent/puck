# SpaceMouse Wireless buttons

The optional WebHID adapter reports the two physical buttons on the measured
`256f:c63a` SpaceMouse Wireless Bluetooth profile. Both `connectWebHid` and
`connectPuck` accept `onButton`:

```ts
import { connectPuck } from '@clankagent/puck/webhid';

const connection = await connectPuck(puck, {
  onButton(event) {
    if (event.button === 1 && event.type === 'down') openMenu();
    if (event.button === 2 && event.type === 'down') fitView();
  },
});
```

Button numbers are the HID descriptor's one-based usages: report 3 bit 0 is
button 1, and bit 1 is button 2. The physical left/right assignment was not
established by the capture, so press each button once in your application before
assigning its action. `down` fires when a bit becomes set; `up` fires when it
clears. Repeated held reports do not repeat events. If a held button is
interrupted by pause, blur, hide, disconnect or close, it emits `cancel` with a
`reason` instead of `up`. A fresh all-released report is required before new
presses are delivered after an interruption.

Button reports do not feed cap motion or gesture recognition. The application
chooses button actions and may use `down`/`up` for holds. The device's 3DxWare
button assignments may also act outside Puck; configure them for your
application if those actions conflict. Browser WebHID support, device permission
and a secure context are required as with motion.

The decoder is based on a physical Windows/Bluetooth capture for `256f:c63a`:
58 report-3 messages showed one-bit press states `1` and `2` and zero on
release, with a descriptor declaring two one-bit button usages. The capture did
not show both bits held simultaneously or establish the physical side mapping.
Automated tests cover combined bits, transitions and lifecycle cancellation.
Other models and connection modes remain unverified.
