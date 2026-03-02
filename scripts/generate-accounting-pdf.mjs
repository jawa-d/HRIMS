import fs from "node:fs";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const outputDir = path.resolve("Docs");
const outputPath = path.join(outputDir, "accounting-system-ar.pdf");
const fontPath = "C:/Windows/Fonts/arial.ttf";

const lines = [
  "شرح نظام الحسابات الجديد",
  "",
  "1. تم عزل النظام المالي عن صفحات الموارد البشرية.",
  "2. تم إنشاء قسم Finance في القائمة الجانبية.",
  "3. الصفحات الجديدة هي:",
  "   - نظام الحسابات (ملخص مالي شهري).",
  "   - الداخل والخارج (تسجيل حركة In/Out).",
  "   - الصندوق اليومي (مصروفات يومية).",
  "",
  "ربط Firebase:",
  "1. تم إنشاء خدمة جديدة: Services/accounting.service.js",
  "2. التخزين يتم في collection باسم accounting_entries.",
  "3. العمليات المدعومة: إضافة، عرض، تعديل، حذف.",
  "",
  "الصلاحيات:",
  "1. super_admin: صلاحية كاملة.",
  "2. hr_admin: إدارة الحسابات.",
  "3. manager: عرض/إضافة/تعديل.",
  "4. employee: عرض محدود حسب الصلاحية.",
  "",
  "ملاحظات:",
  "- الواجهات الجديدة بنفس النسق مع ألوان مختلفة وحركة.",
  "- تمت إضافة مفاتيح الترجمة عربي/إنجليزي.",
  "- تم التحقق من ملفات JavaScript بدون أخطاء Syntax.",
  "",
  "تم إعداد هذا الملخص بتاريخ: 2026-03-02"
];

function wrapLine(text, font, size, maxWidth) {
  if (!text.trim()) return [""];
  const words = text.split(" ");
  const result = [];
  let current = "";

  for (const word of words) {
    const probe = current ? `${current} ${word}` : word;
    const probeWidth = font.widthOfTextAtSize(probe, size);
    if (probeWidth <= maxWidth) {
      current = probe;
      continue;
    }
    if (current) result.push(current);
    current = word;
  }
  if (current) result.push(current);
  return result;
}

async function main() {
  if (!fs.existsSync(fontPath)) {
    throw new Error(`Font not found: ${fontPath}`);
  }

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontBytes = fs.readFileSync(fontPath);
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });
  const page = pdfDoc.addPage([595.28, 841.89]); // A4

  const margin = 48;
  const fontSizeTitle = 20;
  const fontSizeBody = 13;
  const lineHeight = 22;
  const maxWidth = page.getWidth() - margin * 2;

  let y = page.getHeight() - margin;

  const title = lines[0];
  const titleWidth = font.widthOfTextAtSize(title, fontSizeTitle);
  page.drawText(title, {
    x: page.getWidth() - margin - titleWidth,
    y,
    size: fontSizeTitle,
    font,
    color: rgb(0.09, 0.14, 0.24)
  });

  y -= 34;

  for (const line of lines.slice(1)) {
    const wrapped = wrapLine(line, font, fontSizeBody, maxWidth);
    for (const chunk of wrapped) {
      if (y < margin) break;
      const width = font.widthOfTextAtSize(chunk, fontSizeBody);
      page.drawText(chunk, {
        x: page.getWidth() - margin - width,
        y,
        size: fontSizeBody,
        font,
        color: rgb(0.18, 0.21, 0.27)
      });
      y -= lineHeight;
    }
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const bytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, bytes);
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
