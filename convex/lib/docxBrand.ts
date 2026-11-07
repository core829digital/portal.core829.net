import { strFromU8, strToU8 } from "fflate";
import { DOMParser, XMLSerializer, type Element as XmlElement, type Node as XmlNode } from "@xmldom/xmldom";
import { COMPANY } from "./autofill";
import { coreLogoBytes, hasSeal, LOGO_ASPECT, LOGO_SERVER_ASPECT, pngSize, serverLogoBytes, type Brand } from "./brandSeal";
import type { DocxFiles } from "./docx";

/**
 * Marchio di CORE829 sul file Word in uscita: due loghi in cima e firma/timbro in fondo.
 * Si applica SOLO al file che esce (anteprima, download, invio): la bozza modificabile resta pulita.
 * Sicuro da ripetere: se il marchio e' gia' presente non si aggiunge una seconda volta.
 */

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL_TYPE_IMAGE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const EMU_PER_CM = 360000;
const MARKER = "word/media/brand-core.png";

type Image = { name: string; bytes: Uint8Array; cx: number; cy: number };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(rId: string, id: number, name: string, cx: number, cy: number): string {
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${esc(name)}" descr="${esc(name)}"/>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${esc(name)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

const NS = `xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`;
const paragraph = (inner: string, pPr = "") => `<w:p ${NS}>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${inner}</w:p>`;
const text = (t: string, bold = false, size = 18) => `<w:r><w:rPr>${bold ? "<w:b/>" : ""}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;

export function decorateDocx(original: DocxFiles, brand: Brand | undefined): DocxFiles {
  if (original[MARKER] || !original["word/document.xml"]) return original;
  const files: DocxFiles = { ...original };
  const images: Image[] = [
    { name: "brand-core.png", bytes: coreLogoBytes(), cx: Math.round(0.9 * EMU_PER_CM / LOGO_ASPECT), cy: Math.round(0.9 * EMU_PER_CM) },
    { name: "brand-server.png", bytes: serverLogoBytes(), cx: Math.round(0.9 * EMU_PER_CM / LOGO_SERVER_ASPECT), cy: Math.round(0.9 * EMU_PER_CM) },
  ];
  const sealImages: Image[] = [];
  if (hasSeal(brand)) {
    for (const [key, name, widthCm] of [["stamp", "brand-stamp.png", 3.2], ["signature", "brand-signature.png", 4.6]] as const) {
      const bytes = brand?.[key];
      const size = bytes ? pngSize(bytes) : null;
      if (bytes && size) sealImages.push({ name, bytes, cx: Math.round(widthCm * EMU_PER_CM), cy: Math.round((widthCm * EMU_PER_CM * size.height) / size.width) });
    }
  }
  const all = [...images, ...sealImages];

  // Relazioni e tipo di file PNG.
  const relsPath = "word/_rels/document.xml.rels";
  const relsDoc = new DOMParser({ onError: () => undefined }).parseFromString(
    files[relsPath] ? strFromU8(files[relsPath]) : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
    "text/xml",
  );
  const relsRoot = relsDoc.documentElement as XmlElement;
  const ids = new Map<string, string>();
  all.forEach((img, i) => {
    const rId = `rIdBrand${i + 1}`;
    ids.set(img.name, rId);
    const rel = relsDoc.createElementNS("http://schemas.openxmlformats.org/package/2006/relationships", "Relationship");
    rel.setAttribute("Id", rId);
    rel.setAttribute("Type", REL_TYPE_IMAGE);
    rel.setAttribute("Target", `media/${img.name}`);
    relsRoot.appendChild(rel);
    files[`word/media/${img.name}`] = img.bytes;
  });
  files[relsPath] = strToU8(new XMLSerializer().serializeToString(relsDoc));
  if (files["[Content_Types].xml"]) {
    const ct = strFromU8(files["[Content_Types].xml"]);
    if (!/Extension="png"/i.test(ct)) files["[Content_Types].xml"] = strToU8(ct.replace(/<Types([^>]*)>/, `<Types$1><Default Extension="png" ContentType="image/png"/>`));
  }

  // Corpo del documento: loghi in cima, firma e timbro in fondo.
  const doc = new DOMParser({ onError: () => undefined }).parseFromString(strFromU8(files["word/document.xml"]), "text/xml");
  const body = Array.from((doc.documentElement as XmlElement).childNodes).find((n) => n.nodeType === 1 && (n as XmlElement).localName === "body") as XmlElement | undefined;
  if (!body) return original;
  const make = (xml: string): XmlNode => doc.importNode(new DOMParser().parseFromString(xml, "text/xml").documentElement as XmlElement, true);

  const [core, server] = images;
  const header = paragraph(
    inline(ids.get(core.name) as string, 9001, "Logo CORE829", core.cx, core.cy) + `<w:r><w:t xml:space="preserve">     </w:t></w:r>` + inline(ids.get(server.name) as string, 9002, "Logo CORE829 Servers", server.cx, server.cy),
    `<w:spacing w:after="240"/>`,
  );
  body.insertBefore(make(header), body.firstChild);

  if (sealImages.length > 0) {
    const label = paragraph(text(`Per ${COMPANY.name}`, true, 20), `<w:keepNext/><w:spacing w:before="360" w:after="0"/>`) as string;
    const who = paragraph(text(`${COMPANY.rep} — ${COMPANY.repRole}`, false, 18), `<w:keepNext/><w:spacing w:after="60"/>`);
    const pics = paragraph(sealImages.map((img, i) => inline(ids.get(img.name) as string, 9003 + i, img.name.includes("stamp") ? "Timbro CORE829" : "Firma", img.cx, img.cy)).join(`<w:r><w:t xml:space="preserve">   </w:t></w:r>`));
    const sect = Array.from(body.childNodes).reverse().find((n) => n.nodeType === 1 && (n as XmlElement).localName === "sectPr" && (n as XmlElement).namespaceURI === W) ?? null;
    for (const xml of [label, who, pics]) body.insertBefore(make(xml), sect);
  }
  files["word/document.xml"] = strToU8(new XMLSerializer().serializeToString(doc));
  return files;
}
