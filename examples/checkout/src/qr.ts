import encodeQR from "qr";

export type SvgQrEncoder = (
  uri: string,
  output: "svg",
  options: {
    ecc: "high";
    border: number;
    scale: number;
  }
) => string;

export function createPaymentQrSvg(
  paymentUri: string,
  encoder: SvgQrEncoder = encodeQR
): string {
  if (paymentUri.length === 0) {
    throw new Error("Cannot create a QR code for an empty payment URI");
  }

  return encoder(paymentUri, "svg", {
    ecc: "high",
    border: 4,
    scale: 4
  });
}
