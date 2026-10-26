import QRCode from "qrcode";
import { campOrigin } from "./origin";
import { makeToken } from "./tokens";

/** The check-in link a pass's QR holds: any phone camera opens it on the coordinator's Check-in page. */
export async function checkInUrl(campId: string, registrationId: string) {
  return `${await campOrigin()}/admin/camp/${campId}/check-in?t=${makeToken("checkin", registrationId)}`;
}

export async function passQrSvg(campId: string, registrationId: string) {
  return QRCode.toString(await checkInUrl(campId, registrationId), {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#0c0a09", light: "#ffffff" },
  });
}

export async function passQrPng(campId: string, registrationId: string, size = 360) {
  return QRCode.toDataURL(await checkInUrl(campId, registrationId), { margin: 1, width: size, errorCorrectionLevel: "M" });
}
