import { SYMBOL_COLORS } from "../render/palette.js";

/** Brand mark: the three SET symbols (square, circle, triangle) in the three colours. */
export function brandLogo(size = 34): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 36 36");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");

  const rect = document.createElementNS(ns, "rect");
  rect.setAttribute("x", "4");
  rect.setAttribute("y", "5");
  rect.setAttribute("width", "11");
  rect.setAttribute("height", "11");
  rect.setAttribute("rx", "3");
  rect.setAttribute("fill", SYMBOL_COLORS[0]);

  const circle = document.createElementNS(ns, "circle");
  circle.setAttribute("cx", "26");
  circle.setAttribute("cy", "11");
  circle.setAttribute("r", "6");
  circle.setAttribute("fill", SYMBOL_COLORS[1]);

  const tri = document.createElementNS(ns, "path");
  tri.setAttribute("d", "M18 20 L27 34 L9 34 Z");
  tri.setAttribute("fill", SYMBOL_COLORS[2]);

  svg.append(rect, circle, tri);
  return svg;
}
