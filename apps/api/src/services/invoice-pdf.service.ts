import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { buildQrUrl } from "../lib/arca/qr.js";
import {
  DOCUMENT_TYPES,
  RECEPTOR_IVA_CONDITIONS,
  UNIDENTIFIED_DOC_TYPE,
  vatRate,
  voucherTypeInfo,
} from "../lib/arca/codes.js";
import { loadAuthorizedForPdf } from "./invoicing.service.js";

// PDF of an AUTHORIZED voucher with ARCA's fiscal QR (RG 4892/2020). The
// layout shows what ARCA authorized plus the issuer data the admin
// entered; its legal review (RG 1415) is pending with the accountant.
// Vouchers from the mock or homologation carry a «SIN VALIDEZ FISCAL»
// mark on every page — production is not wired (ADR-0036).

const ENVIRONMENT_MARK: Record<string, string> = {
  mock: "SIMULADO — SIN VALIDEZ FISCAL",
  homologacion: "HOMOLOGACIÓN — SIN VALIDEZ FISCAL",
};

const money = (value: { toFixed(digits: number): string }) =>
  `$ ${Number(value.toFixed(2)).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (date: Date) => date.toISOString().slice(0, 10).split("-").reverse().join("/");
const pad = (value: number, length: number) => String(value).padStart(length, "0");

export async function renderInvoicePdf(id: string): Promise<{ filename: string; content: Buffer }> {
  const document = await loadAuthorizedForPdf(id);
  const { sale } = document;
  const issuer = sale.issuer;
  const voucher = voucherTypeInfo(document.voucherType)!;
  const number = `${pad(document.pointOfSale.number, 5)}-${pad(document.number!, 8)}`;
  const identified = sale.receptorDocType !== UNIDENTIFIED_DOC_TYPE;

  const qrUrl = buildQrUrl({
    issueDate: sale.saleDate.toISOString().slice(0, 10),
    issuerCuit: issuer.cuit,
    pointOfSale: document.pointOfSale.number,
    voucherType: document.voucherType,
    number: document.number!,
    total: sale.totalAmount.toFixed(2),
    currency: sale.currency,
    exchangeRate: "1",
    ...(identified
      ? { receptorDocType: sale.receptorDocType, receptorDocNumber: sale.receptorDocNumber }
      : {}),
    authorizationType: "E",
    authorizationCode: document.cae!,
  });
  const qrPng = await QRCode.toBuffer(qrUrl, { errorCorrectionLevel: "M", margin: 1, width: 220 });

  const pdf = new PDFDocument({
    size: "A4",
    margin: 40,
    info: { Title: `${voucher.name} ${number}` },
  });
  const chunks: Buffer[] = [];
  pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) =>
    pdf.on("end", () => resolve(Buffer.concat(chunks))),
  );

  const mark = ENVIRONMENT_MARK[document.environment] ?? "SIN VALIDEZ FISCAL";
  const drawMark = () => {
    pdf.save();
    pdf.fillColor("#c00000").fontSize(11).text(mark, 40, 18, { width: 515, align: "center" });
    pdf.restore();
  };
  drawMark();
  pdf.on("pageAdded", drawMark);

  const width = 515;
  pdf.fillColor("black").fontSize(9).text("ORIGINAL", 40, 40, { width, align: "center" });
  pdf.rect(40, 54, width, 96).stroke();
  pdf.rect(277, 54, 40, 40).stroke();
  pdf.fontSize(26).text(voucher.class, 277, 60, { width: 40, align: "center" });
  pdf
    .fontSize(7)
    .text(`COD. ${pad(document.voucherType, 3)}`, 277, 96, { width: 40, align: "center" });

  pdf.fontSize(12).text(issuer.legalName, 48, 62, { width: 220 });
  pdf.fontSize(8).text(issuer.commercialAddress, 48, pdf.y + 2, { width: 220 });
  const condition = issuer.taxConditionCode
    ? (RECEPTOR_IVA_CONDITIONS as Record<number, { name: string }>)[issuer.taxConditionCode]?.name
    : null;
  pdf.text(`Condición frente al IVA: ${condition ?? "—"}`, 48, pdf.y + 2, { width: 220 });

  pdf.fontSize(14).text(voucher.name.toUpperCase().replace(/ [ABC]$/, ""), 330, 62, { width: 220 });
  pdf.fontSize(9);
  pdf.text(
    `Punto de venta: ${pad(document.pointOfSale.number, 5)}   Comp. Nro: ${pad(document.number!, 8)}`,
    330,
  );
  pdf.text(`Fecha de emisión: ${day(sale.saleDate)}`, 330);
  pdf.text(`CUIT: ${issuer.cuit}`, 330);
  if (issuer.grossIncomeNumber) pdf.text(`Ingresos Brutos: ${issuer.grossIncomeNumber}`, 330);
  if (issuer.activityStartDate)
    pdf.text(`Inicio de actividades: ${day(issuer.activityStartDate)}`, 330);

  pdf.rect(40, 156, width, 52).stroke();
  const docName = (DOCUMENT_TYPES as Record<number, string>)[sale.receptorDocType] ?? "Doc.";
  const receptorCondition = (RECEPTOR_IVA_CONDITIONS as Record<number, { name: string }>)[
    sale.receptorIvaConditionCode
  ]?.name;
  pdf
    .fontSize(9)
    .text(
      `${identified ? `${docName}: ${sale.receptorDocNumber}` : "Receptor sin identificar"}`,
      48,
      162,
    );
  pdf.text(`Apellido y nombre / Razón social: ${sale.receptorName ?? "—"}`, 48);
  pdf.text(`Condición frente al IVA: ${receptorCondition ?? "—"}`, 48);
  pdf.text(`Domicilio: ${sale.receptorAddress ?? "—"}`, 48);

  const discriminateVat = voucher.class !== "C";
  let y = 220;
  pdf.rect(40, y, width, 16).fillAndStroke("#eeeeee", "black");
  pdf.fillColor("black").fontSize(8);
  pdf.text("Descripción", 46, y + 4, { width: 220 });
  pdf.text("Cant.", 270, y + 4, { width: 40, align: "right" });
  pdf.text("Precio unit.", 315, y + 4, { width: 70, align: "right" });
  if (discriminateVat) pdf.text("IVA", 390, y + 4, { width: 50, align: "right" });
  pdf.text("Subtotal", 445, y + 4, { width: 104, align: "right" });
  y += 22;
  for (const item of sale.items) {
    pdf.text(item.description + (item.variantSku ? ` (SKU ${item.variantSku})` : ""), 46, y, {
      width: 220,
    });
    const rowEnd = pdf.y;
    pdf.text(item.quantity.toString(), 270, y, { width: 40, align: "right" });
    pdf.text(money(item.unitPrice), 315, y, { width: 70, align: "right" });
    if (discriminateVat && item.vatRateCode !== null) {
      pdf.text(vatRate(item.vatRateCode)?.name ?? "", 390, y, { width: 50, align: "right" });
    }
    pdf.text(money(item.netAmount), 445, y, { width: 104, align: "right" });
    y = Math.max(rowEnd, pdf.y) + 6;
  }

  y = Math.max(y + 10, 560);
  const totals: [string, string][] = discriminateVat
    ? [
        ["Importe neto gravado", money(sale.netAmount)],
        ["IVA", money(sale.vatAmount)],
        ["Importe total", money(sale.totalAmount)],
      ]
    : [
        ["Subtotal", money(sale.netAmount)],
        ["Importe total", money(sale.totalAmount)],
      ];
  pdf.fontSize(10);
  for (const [label, value] of totals) {
    pdf.text(label, 330, y, { width: 120, align: "right" });
    pdf.text(value, 455, y, { width: 94, align: "right" });
    y += 16;
  }

  y += 20;
  pdf.image(qrPng, 40, y, { width: 110 });
  pdf.fontSize(10).text(`CAE N°: ${document.cae}`, 330, y + 10, { width: 219, align: "right" });
  if (document.caeDueDate) {
    pdf.text(`Fecha de vto. de CAE: ${day(document.caeDueDate)}`, 330, y + 26, {
      width: 219,
      align: "right",
    });
  }
  pdf.fontSize(8).text("Comprobante autorizado", 160, y + 50, { width: 160 });

  pdf.end();
  return {
    filename: `${voucher.name.replaceAll(" ", "-")}-${number}.pdf`,
    content: await done,
  };
}
