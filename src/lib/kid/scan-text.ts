/**
 * What the camera read from a QR → the mission code, when it is one of this app's mission QRs.
 * Those are links that end in /q/<code>. Only the code is taken: the child is then sent to that
 * fixed path of this app, never to the address in the QR.
 */
export function qrCodeFromText(text: string): string | null {
  const m = /^https?:\/\/[^\s/?#]+\/q\/([A-Za-z0-9_-]{8,64})\/?(?:[?#]\S*)?$/.exec(text.trim());
  return m ? m[1] : null;
}
